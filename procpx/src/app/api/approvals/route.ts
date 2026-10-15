// src/app/api/approvals/route.ts - Dual Approvals Queues API (Budget Approval & PR / BOQ Approval)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'ALL'; // BUDGET, PR, FINANCE, ALL

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

  // Fetch users for resolving sender/submitter identities
  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true, role: true, email: true },
  });
  const userMap = new Map<string, { name: string; role: string; email: string }>();
  for (const u of users) {
    userMap.set(u.id, { name: u.name, role: u.role, email: u.email });
    userMap.set(u.email, { name: u.name, role: u.role, email: u.email });
  }

  // Fetch Cost Centre budgets for financial impact calculations
  const ccBudgets = await prisma.budget.findMany({
    where: { tenantId: ctx.tenantId },
    select: { costCentreId: true, approvedAmount: true, pendingAmount: true, totalAmount: true },
  });
  const budgetMap = new Map<string, { approvedAmount: number; pendingAmount: number; totalAmount: number }>();
  for (const b of ccBudgets) {
    if (b.costCentreId) budgetMap.set(b.costCentreId, b);
  }

  // 1. Budget Approval Queue (Project Approver only - not visible to Finance Approver)
  if (!isFinanceRole && (type === 'ALL' || type === 'BUDGET')) {
    const rawBudgetQueue = await prisma.budgetContribution.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL'] },
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
        boq: { select: { id: true, boqCode: true, title: true, description: true } },
        boqRevision: {
          select: {
            id: true,
            revisionNumber: true,
            revisionCode: true,
            lines: {
              select: {
                id: true,
                lineNumber: true,
                itemCode: true,
                standardDescription: true,
                originalDescription: true,
                quantity: true,
                uomRaw: true,
                aiUnitCost: true,
                aiTotalCost: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
        transactions: true,
        approvals: { orderBy: { timestamp: 'desc' } },
      },
    });

    results.budgetQueue = rawBudgetQueue.map(item => {
      const ccBudget = budgetMap.get(item.costCentreId) || { approvedAmount: 0, pendingAmount: 0, totalAmount: 0 };
      const currentApproved = ccBudget.approvedAmount || 0;
      const proposed = item.totalEstimatedValue || 0;
      const projected = currentApproved + proposed;

      // Extract unique categories from transactions or lines
      const categories = Array.from(new Set(item.transactions.map(t => t.category).filter(Boolean)));
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
      orderBy: { requestedDate: 'desc' },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
        boq: { select: { id: true, boqCode: true, title: true, description: true, category: true } },
        boqRevision: { select: { id: true, revisionNumber: true, revisionCode: true } },
        lines: {
          include: {
            boqLine: true,
          },
        },
        approvals: { orderBy: { timestamp: 'desc' } },
      },
    });

    results.prQueue = rawPrQueue.map(item => {
      const requesterInfo = userMap.get(item.requestedBy);
      const categories = Array.from(new Set(item.lines.map(l => l.category).filter(Boolean)));

      return {
        ...item,
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
      orderBy: { projectApprovedAt: 'desc' },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
        boq: { select: { id: true, boqCode: true, title: true, description: true } },
        boqRevision: {
          select: {
            id: true,
            revisionNumber: true,
            revisionCode: true,
            lines: {
              select: {
                id: true,
                lineNumber: true,
                itemCode: true,
                standardDescription: true,
                originalDescription: true,
                quantity: true,
                uomRaw: true,
                aiUnitCost: true,
                aiTotalCost: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
        transactions: true,
        approvals: { orderBy: { timestamp: 'desc' } },
      },
    });

    results.financeQueue = rawFinanceQueue.map(item => {
      const ccBudget = budgetMap.get(item.costCentreId) || { approvedAmount: 0, pendingAmount: 0, totalAmount: 0 };
      const currentApproved = ccBudget.approvedAmount || 0;
      const proposed = item.acceptedEstimatedValue || item.totalEstimatedValue || 0;
      const projected = currentApproved + proposed;

      const categories = Array.from(new Set(item.transactions.map(t => t.category).filter(Boolean)));
      const submitterInfo = userMap.get(item.submittedBy || '') || userMap.get(item.createdBy);
      const projectApproverInfo = userMap.get(item.projectApprovedBy || '');
      const projectApprovalRecord = item.approvals?.find(a => a.approvalLevel === 'PROJECT_APPROVER' && a.status === 'APPROVED');

      return {
        ...item,
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
  const [bPending, prPending, fPending, bApproved, bRejected, prRejected] = await Promise.all([
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: { in: ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL'] } } }),
    prisma.procurementRequest.count({ where: { tenantId: ctx.tenantId, status: 'PR_PENDING_PROJECT_APPROVAL' } }),
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: { in: ['PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'] } } }),
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: 'APPROVED' } }),
    prisma.budgetContribution.count({ where: { tenantId: ctx.tenantId, status: 'REJECTED' } }),
    prisma.procurementRequest.count({ where: { tenantId: ctx.tenantId, status: 'PR_REJECTED' } }),
  ]);

  results.counts = {
    budgetPending: bPending,
    prPending: prPending,
    financePending: fPending,
    approvedBudgets: bApproved,
    rejectedTotal: bRejected + prRejected,
  };

  return apiSuccess(results);
}
