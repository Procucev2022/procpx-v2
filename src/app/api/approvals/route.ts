// src/app/api/approvals/route.ts - Dual Approvals Queues API (Budget Approval & PR / BOQ Approval)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, getListPageWindow } from '@/lib/api-utils';

async function getContributionCategories(tenantId: string, contributionIds: string[]) {
  const categoriesByContribution = new Map<string, string[]>();
  if (contributionIds.length === 0) return categoriesByContribution;
  const groups = await prisma.budgetTransaction.groupBy({
    by: ['contributionId', 'category'],
    where: { tenantId, contributionId: { in: contributionIds } },
  });
  for (const { contributionId, category } of groups) {
    if (!contributionId || !category) continue;
    const categories = categoriesByContribution.get(contributionId) || [];
    if (!categories.includes(category)) categories.push(category);
    categoriesByContribution.set(contributionId, categories);
  }
  return categoriesByContribution;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'ALL'; // BUDGET, PR, FINANCE, ALL
  const { page, pageSize, skip } = getListPageWindow(searchParams);

  const isFinanceRole = ctx.role === 'FINANCE_USER' || ctx.role === 'FINANCE_APPROVER';
  const isProjectApproverRole = ctx.role === 'PROJECT_APPROVER';

  const results: any = {
    budgetQueue: [],
    prQueue: [],
    financeQueue: [],
    counts: {
      budgetPending: 0,
      prPending: 0,
      financePending: 0,
      approvedBudgets: 0,
      rejectedTotal: 0,
    },
  };

  const userMap = new Map<string, { name: string; role: string; email: string }>();
  const budgetMap = new Map<string, { approvedAmount: number; pendingAmount: number; totalAmount: number }>();
  const addQueueUsers = async (userIds: Array<string | null | undefined>) => {
    const ids = Array.from(new Set(userIds.filter((value): value is string => Boolean(value))));
    if (ids.length === 0) return;
    const users = await prisma.user.findMany({
      where: { tenantId: ctx.tenantId, id: { in: ids } },
      select: { id: true, name: true, role: true, email: true },
    });
    for (const user of users) {
      userMap.set(user.id, { name: user.name, role: user.role, email: user.email });
      userMap.set(user.email, { name: user.name, role: user.role, email: user.email });
    }
  };
  const addQueueBudgets = async (costCentreIds: Array<string | null | undefined>) => {
    const ids = Array.from(new Set(costCentreIds.filter((value): value is string => Boolean(value))));
    if (ids.length === 0) return;
    const budgets = await prisma.budget.findMany({
      where: { tenantId: ctx.tenantId, costCentreId: { in: ids } },
      select: { costCentreId: true, approvedAmount: true, pendingAmount: true, totalAmount: true },
    });
    for (const budget of budgets) {
      if (budget.costCentreId) budgetMap.set(budget.costCentreId, budget);
    }
  };

  // 1. Budget Approval Queue (Project Approver only - not visible to Finance Approver)
  if (!isFinanceRole && (type === 'ALL' || type === 'BUDGET')) {
    const rawBudgetQueue = await prisma.budgetContribution.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL'] },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
        boq: { select: { id: true, boqCode: true, title: true, description: true } },
        boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
        approvals: { orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 1 },
      },
    });
    const [categoriesByContribution] = await Promise.all([
      getContributionCategories(ctx.tenantId, rawBudgetQueue.map(({ id }) => id)),
      addQueueUsers(rawBudgetQueue.flatMap((item) => [item.submittedBy, item.createdBy])),
      addQueueBudgets(rawBudgetQueue.map((item) => item.costCentreId)),
    ]);

    results.budgetQueue = rawBudgetQueue.map(item => {
      const ccBudget = budgetMap.get(item.costCentreId) || { approvedAmount: 0, pendingAmount: 0, totalAmount: 0 };
      const currentApproved = ccBudget.approvedAmount || 0;
      const proposed = item.totalEstimatedValue || 0;
      const projected = currentApproved + proposed;

      const categories = categoriesByContribution.get(item.id) || [];
      const submitterInfo = userMap.get(item.submittedBy || '') || userMap.get(item.createdBy);

      return {
        ...item,
        submitterName: submitterInfo?.name || item.submittedBy || 'Project User',
        submitterEmail: submitterInfo?.email || '',
        categories: categories.length > 0 ? categories : ['General'],
        financialImpact: {
          currentApprovedAmount: currentApproved,
          proposedContribution: proposed,
          projectedApprovedTotal: projected,
          pendingBudget: ccBudget.pendingAmount || proposed,
        },
        hasEnquiry: (item.approvals || []).some(a => a.status === 'ENQUIRY'),
        latestMessage: item.approvals?.[0] || null,
      };
    });
  }

  // 2. PR / BOQ Approval Queue (Project Approver only - strictly NOT visible to Finance Approver)
  if (!isFinanceRole && (type === 'ALL' || type === 'PR')) {
    const rawPrQueue = await prisma.procurementRequest.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'PR_PENDING_PROJECT_APPROVAL',
      },
      orderBy: [{ requestedDate: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
        boq: { select: { id: true, boqCode: true, title: true, description: true, category: true } },
        boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
        approvals: { orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 1 },
        _count: { select: { lines: true, rfqs: true } },
      },
    });
    const [prLineCategoryGroups] = await Promise.all([
      rawPrQueue.length > 0 ? prisma.pRLine.groupBy({
        by: ['prId', 'category'],
        where: { tenantId: ctx.tenantId, prId: { in: rawPrQueue.map(({ id }) => id) } },
      }) : Promise.resolve([]),
      addQueueUsers(rawPrQueue.map((item) => item.requestedBy)),
    ]);
    const categoriesByPr = new Map<string, string[]>();
    for (const group of prLineCategoryGroups) {
      if (!group.category) continue;
      const categories = categoriesByPr.get(group.prId) || [];
      if (!categories.includes(group.category)) categories.push(group.category);
      categoriesByPr.set(group.prId, categories);
    }

    results.prQueue = rawPrQueue.map(item => {
      const requesterInfo = userMap.get(item.requestedBy);
      const categories = categoriesByPr.get(item.id) || [];

      return {
        ...item,
        totalLines: item._count.lines,
        totalRfqs: item._count.rfqs,
        requesterName: requesterInfo?.name || item.requestedBy,
        requesterEmail: requesterInfo?.email || '',
        categories: categories.length > 0 ? categories : (item.boq?.category ? [item.boq.category] : ['Standard']),
        hasEnquiry: (item.approvals || []).some(a => a.status === 'ENQUIRY'),
        latestMessage: item.approvals?.[0] || null,
      };
    });
  }

  // 3. Finance Approval Queue (Finance Approver & Admins only - not visible to Project Approver)
  if (!isProjectApproverRole && (type === 'ALL' || type === 'FINANCE')) {
    const rawFinanceQueue = await prisma.budgetContribution.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'] },
      },
      orderBy: [{ projectApprovedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
        boq: { select: { id: true, boqCode: true, title: true, description: true } },
        boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
        approvals: {
          where: { approvalLevel: 'PROJECT_APPROVER' },
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    const [categoriesByContribution] = await Promise.all([
      getContributionCategories(ctx.tenantId, rawFinanceQueue.map(({ id }) => id)),
      addQueueUsers(rawFinanceQueue.flatMap((item) => [item.submittedBy, item.createdBy, item.projectApprovedBy])),
      addQueueBudgets(rawFinanceQueue.map((item) => item.costCentreId)),
    ]);

    results.financeQueue = rawFinanceQueue.map(item => {
      const ccBudget = budgetMap.get(item.costCentreId) || { approvedAmount: 0, pendingAmount: 0, totalAmount: 0 };
      const currentApproved = ccBudget.approvedAmount || 0;
      const proposed = item.acceptedEstimatedValue || item.totalEstimatedValue || 0;
      const projected = currentApproved + proposed;

      const categories = categoriesByContribution.get(item.id) || [];
      const submitterInfo = userMap.get(item.submittedBy || '') || userMap.get(item.createdBy);
      const projectApproverInfo = userMap.get(item.projectApprovedBy || '');
      const projectApprovalRecord = item.approvals?.find(a => a.status === 'APPROVED');

      return {
        ...item,
        amount: item.acceptedEstimatedValue || item.totalEstimatedValue || 0,
        submitterName: submitterInfo?.name || item.submittedBy || 'Project User',
        submitterEmail: submitterInfo?.email || '',
        projectApproverName: projectApproverInfo?.name || item.projectApprovedBy || 'Project Approver',
        projectApproverDecision: {
          approverName: projectApproverInfo?.name || item.projectApprovedBy || 'Project Approver',
          approvedAt: item.projectApprovedAt || projectApprovalRecord?.timestamp,
          remarks: projectApprovalRecord?.reason || 'Project level scope and commercial estimate approved.',
        },
        categories: categories.length > 0 ? categories : ['General'],
        financialImpact: {
          currentApprovedAmount: currentApproved,
          proposedContribution: proposed,
          projectedApprovedTotal: projected,
          pendingBudget: ccBudget.pendingAmount || proposed,
        },
        hasEnquiry: (item.approvals || []).some(a => a.status === 'ENQUIRY'),
        latestMessage: item.approvals?.[0] || null,
      };
    });
  }

  // Counts for KPI cards
  const [bPending, prPending, fPending, bApproved, bRejected, prRejected, budgetPendingAggregate, prPendingAggregate, financeAcceptedAggregate, financeFallbackAggregate] = await Promise.all([
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: { in: ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL'] } } }),
    prisma.procurementRequest.count({ where: { tenantId: ctx.tenantId, status: 'PR_PENDING_PROJECT_APPROVAL' } }),
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: { in: ['PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'] } } }),
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: 'APPROVED' } }),
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: 'REJECTED' } }),
    prisma.procurementRequest.count({ where: { tenantId: ctx.tenantId, status: 'PR_REJECTED' } }),
    prisma.budgetContribution.aggregate({
      where: { tenantId: ctx.tenantId, status: { in: ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL'] } },
      _sum: { totalEstimatedValue: true },
    }),
    prisma.procurementRequest.aggregate({
      where: { tenantId: ctx.tenantId, status: 'PR_PENDING_PROJECT_APPROVAL' },
      _sum: { totalEstimatedValue: true },
    }),
    prisma.budgetContribution.aggregate({
      where: { tenantId: ctx.tenantId, status: { in: ['PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'] }, acceptedEstimatedValue: { gt: 0 } },
      _sum: { acceptedEstimatedValue: true },
    }),
    prisma.budgetContribution.aggregate({
      where: { tenantId: ctx.tenantId, status: { in: ['PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'] }, acceptedEstimatedValue: 0 },
      _sum: { totalEstimatedValue: true },
    }),
  ]);

  results.counts = {
    budgetPending: bPending,
    prPending: prPending,
    financePending: fPending,
    approvedBudgets: bApproved,
    rejectedTotal: bRejected + prRejected,
  };

  results.pagination = {
    page,
    pageSize,
    queues: {
      budget: { total: bPending, totalPages: Math.ceil(bPending / pageSize) },
      pr: { total: prPending, totalPages: Math.ceil(prPending / pageSize) },
      finance: { total: fPending, totalPages: Math.ceil(fPending / pageSize) },
    },
  };
  results.totals = {
    budgetPendingAmount: Number(budgetPendingAggregate._sum.totalEstimatedValue || 0),
    prPendingAmount: Number(prPendingAggregate._sum.totalEstimatedValue || 0),
    financePendingAmount: Number(financeAcceptedAggregate._sum?.acceptedEstimatedValue || 0)
      + Number(financeFallbackAggregate._sum?.totalEstimatedValue || 0),
  };

  return apiSuccess(results);
}
