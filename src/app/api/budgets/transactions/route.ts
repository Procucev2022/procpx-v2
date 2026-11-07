import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getListPageWindow, requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { readByD1FilterChunks } from '@/lib/d1-query';
import { COST_CENTRE_FILTER_PAGE_SIZE } from './route.constants';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const costCentreId = searchParams.get('costCentreId') || '';
  const category = searchParams.get('category') || '';
  const type = searchParams.get('type') || '';
  const status = searchParams.get('status') || '';
  const search = (searchParams.get('search') || '').trim().slice(0, 120);
  const onlyCostCentres = searchParams.get('onlyCostCentres') === 'true';
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  const costCentrePageParams = new URLSearchParams({
    page: searchParams.get('costCentrePage') || '1',
    pageSize: String(COST_CENTRE_FILTER_PAGE_SIZE),
  });
  const costCentrePage = getListPageWindow(costCentrePageParams);

  try {
    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (projectId) where.projectId = projectId;
    if (costCentreId) where.costCentreId = costCentreId;
    if (category) where.category = category;
    if (type === 'REVERSAL') where.isReversal = true;
    if (type === 'ALLOCATION') where.isReversal = false;
    if (status === 'UNDER_APPROVAL') where.status = { in: ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL'] };
    else if (status === 'PENDING_FINANCE_APPROVAL') where.status = { in: ['PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'] };
    else if (status) where.status = status;
    if (search) {
      where.OR = [
        { transactionCode: { contains: search } },
        { reference: { contains: search } },
        { category: { contains: search } },
        { subcategory: { contains: search } },
        { boqRevision: { boq: { boqCode: { contains: search } } } },
        { boqLine: { originalDescription: { contains: search } } },
      ];
    }

    const costCentreWhere: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (projectId) costCentreWhere.projectId = projectId;
    const fetchCostCentres = async () => {
      const [total, costCentres] = await Promise.all([
        prisma.costCentre.count({ where: costCentreWhere }),
        prisma.costCentre.findMany({
          where: costCentreWhere,
          select: { id: true, projectId: true, code: true, name: true },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          skip: costCentrePage.skip,
          take: costCentrePage.pageSize,
        }),
      ]);
      return {
        costCentres,
        costCentrePagination: {
          total,
          page: costCentrePage.page,
          pageSize: costCentrePage.pageSize,
          hasMore: costCentrePage.skip + costCentres.length < total,
        },
      };
    };

    if (onlyCostCentres) {
      const result = await fetchCostCentres();
      return apiSuccess(result);
    }

    const [total, records, costCentreResult, categoryGroups] = await Promise.all([
      prisma.budgetTransaction.count({ where }),
      prisma.budgetTransaction.findMany({
        where,
        orderBy: [{ budgetDate: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true, transactionCode: true, budgetDate: true, category: true, subcategory: true,
          boqId: true, boqLineId: true, reference: true, amount: true, quantity: true, rate: true,
          status: true, isReversal: true, reversalReason: true, createdBy: true, createdAt: true,
          project: { select: { id: true, name: true } },
          costCentre: { select: { id: true, code: true, name: true } },
          boqLine: { select: { id: true, lineNumber: true, originalDescription: true } },
          boqRevision: { select: { revisionCode: true, boq: { select: { boqCode: true } } } },
          contribution: {
            select: {
              submittedBy: true, submittedAt: true, projectApprovedBy: true, projectApprovedAt: true,
              rejectionReason: true,
              approvals: {
                where: { status: { in: ['APPROVED', 'REJECTED'] } },
                select: { approverId: true, status: true, reason: true, timestamp: true },
                orderBy: { timestamp: 'desc' }, take: 2,
              },
            },
          },
        },
      }),
      fetchCostCentres(),
      prisma.budgetTransaction.groupBy({ by: ['category'], where: { tenantId: ctx.tenantId, ...(projectId ? { projectId } : {}) } }),
    ]);

    const userIds = Array.from(new Set(records.flatMap((tx) => [
      tx.createdBy,
      tx.contribution?.submittedBy,
      tx.contribution?.projectApprovedBy,
      ...(tx.contribution?.approvals || []).map((approval) => approval.approverId),
    ]).filter((id): id is string => Boolean(id))));
    const users = userIds.length > 0
      ? await readByD1FilterChunks(userIds, (chunk) => prisma.user.findMany({ where: { tenantId: ctx.tenantId, id: { in: chunk } }, select: { id: true, name: true, email: true } }))
      : [];
    const userMap = new Map(users.map((user) => [user.id, user.name || user.email]));

    const transactions = records.map((tx) => {
      const approved = tx.contribution?.approvals?.find((approval) => approval.status === 'APPROVED');
      const rejected = tx.contribution?.approvals?.find((approval) => approval.status === 'REJECTED');
      const submitterId = tx.contribution?.submittedBy || tx.createdBy;
      const approverId = tx.contribution?.projectApprovedBy || approved?.approverId || null;
      return {
        id: tx.id,
        transactionCode: tx.transactionCode,
        budgetDate: tx.budgetDate,
        projectId: tx.project.id,
        projectName: tx.project.name,
        costCentreId: tx.costCentre.id,
        costCentreCode: tx.costCentre.code,
        costCentreName: tx.costCentre.name,
        category: tx.category,
        subcategory: tx.subcategory,
        boqId: tx.boqId,
        boqNumber: tx.boqRevision?.boq?.boqCode || (tx.reference?.match(/BOQ-[0-9]+/)?.[0] || '—'),
        boqRevision: tx.boqRevision?.revisionCode || (tx.reference?.match(/R[0-9]+/)?.[0] || 'R0'),
        boqLineReference: tx.boqLine?.lineNumber || (tx.boqLineId ? `Line ${tx.boqLineId.slice(0, 8)}` : '—'),
        description: tx.reference || `${tx.category} Budget Allocation`,
        reference: tx.reference,
        amount: tx.amount,
        quantity: tx.quantity,
        rate: tx.rate,
        transactionType: tx.isReversal ? 'REVERSAL' : 'ALLOCATION',
        status: tx.status,
        isReversal: tx.isReversal,
        reversalReason: tx.reversalReason,
        createdBy: tx.createdBy,
        createdByName: userMap.get(tx.createdBy) || tx.createdBy,
        submitter: submitterId,
        submitterName: userMap.get(submitterId) || submitterId,
        submittedAt: tx.contribution?.submittedAt || tx.createdAt,
        approver: approverId,
        approverName: approverId ? (userMap.get(approverId) || approverId) : null,
        approvedAt: tx.contribution?.projectApprovedAt || approved?.timestamp || null,
        rejectionReason: tx.contribution?.rejectionReason || rejected?.reason || null,
      };
    });

    return apiSuccess({
      transactions,
      ...costCentreResult,
      categories: categoryGroups.map((group) => group.category).filter(Boolean),
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    void writeStructuredLog('error', onlyCostCentres ? 'budget.cost_centre_filter_options_failed' : 'budget.transaction_ledger_failed', {
      operation: onlyCostCentres ? 'list_cost_centre_options' : 'list', route: '/api/budgets/transactions', tenantId: ctx.tenantId, projectId,
      costCentreId, page, pageSize, costCentrePage: costCentrePage.page,
      durationMs: Date.now() - startedAt, error,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchBudgetTransactions, 500);
  }
}
