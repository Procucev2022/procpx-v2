// src/app/api/budgets/route.ts - Project & Cost Centre Budget Listing API
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { logEvent } from '@/lib/observability/server-logger';
import { getUserProjectAccessFilter } from '@/lib/project-auth';
import {
  ACTUAL_COST_SUMMARY_STATUSES,
  BUDGET_APPROVED_STATUS,
  BUDGET_PENDING_STATUSES,
} from './route.constants';
import type { BudgetProjectAggregate } from '@app-types/app/api/budgets/route.types';

async function loadProjectBudgetAggregate(input: {
  tenantId: string;
  projectId: string;
  costCentreId: string | null;
  costCentreIds: string[];
}): Promise<BudgetProjectAggregate> {
  const pendingStatuses = Prisma.join(BUDGET_PENDING_STATUSES);
  const actualStatuses = Prisma.join(ACTUAL_COST_SUMMARY_STATUSES);
  const pageCostCentreFilter = input.costCentreIds.length > 0
    ? Prisma.sql`AND "costCentreId" IN (${Prisma.join(input.costCentreIds)})`
    : Prisma.sql`AND 1 = 0`;
  const costCentreFilter = input.costCentreId
    ? Prisma.sql`AND cc."id" = ${input.costCentreId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<BudgetProjectAggregate[]>(Prisma.sql`
    WITH contribution_totals AS (
      SELECT "costCentreId",
        SUM(CASE WHEN "status" = ${BUDGET_APPROVED_STATUS} THEN COALESCE("acceptedEstimatedValue", 0) ELSE 0 END) AS "approvedContribution",
        SUM(CASE WHEN "status" IN (${pendingStatuses}) THEN COALESCE("totalEstimatedValue", 0) ELSE 0 END) AS "pendingContribution"
      FROM "budget_contributions"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId} AND "isSuperSeded" = 0
      GROUP BY "costCentreId"
    ), transaction_totals AS (
      SELECT "costCentreId",
        SUM(CASE WHEN "status" = ${BUDGET_APPROVED_STATUS} THEN COALESCE("amount", 0) ELSE 0 END) AS "approvedTransaction",
        SUM(CASE WHEN "status" IN (${pendingStatuses}) THEN COALESCE("amount", 0) ELSE 0 END) AS "pendingTransaction"
      FROM "budget_transactions"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId}
      GROUP BY "costCentreId"
    ), actual_totals AS (
      SELECT "costCentreId", SUM(COALESCE("totalActualAmount", 0)) AS "actualAmount"
      FROM "actual_cost_transactions"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId}
        AND "status" IN (${actualStatuses})
      GROUP BY "costCentreId"
    ), actual_category_totals AS (
      SELECT "costCentreId", COALESCE(NULLIF("category", ''), 'General') AS "category",
        COALESCE(NULLIF(SUM("totalActualAmount"), 0), SUM("actualAmount"), 0) AS "actualAmount"
      FROM "actual_cost_transactions"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId}
        AND "status" IN (${actualStatuses}) ${pageCostCentreFilter}
      GROUP BY "costCentreId", COALESCE(NULLIF("category", ''), 'General')
    ), page_actual_totals AS (
      SELECT "costCentreId", SUM("actualAmount") AS "actualAmount"
      FROM actual_category_totals GROUP BY "costCentreId"
    )
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(contribution_totals."approvedContribution", 0) > 0
        THEN contribution_totals."approvedContribution" ELSE COALESCE(transaction_totals."approvedTransaction", 0) END), 0) AS "approvedBudget",
      COALESCE(SUM(CASE WHEN COALESCE(contribution_totals."pendingContribution", 0) > 0
        THEN contribution_totals."pendingContribution" ELSE COALESCE(transaction_totals."pendingTransaction", 0) END), 0) AS "pendingBudget",
      COALESCE(SUM(COALESCE(actual_totals."actualAmount", 0)), 0) AS "actualAmount",
      COALESCE((SELECT json_group_object("costCentreId", "actualAmount") FROM page_actual_totals), '{}') AS "costCentreActualsJson"
    FROM "cost_centres" AS cc
    LEFT JOIN contribution_totals ON contribution_totals."costCentreId" = cc."id"
    LEFT JOIN transaction_totals ON transaction_totals."costCentreId" = cc."id"
    LEFT JOIN actual_totals ON actual_totals."costCentreId" = cc."id"
    WHERE cc."tenantId" = ${input.tenantId} AND cc."projectId" = ${input.projectId}
      ${costCentreFilter}
  `);
  return rows[0] || { approvedBudget: 0, pendingBudget: 0, actualAmount: 0 };
}

function parseCostCentreActuals(value: unknown): Map<string, number> {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred);
  }

  return new Map(Object.entries(parsed).map(([costCentreId, amount]) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
      throw new Error(UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred);
    }
    return [costCentreId, numericAmount];
  }));
}


export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  try {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const costCentreId = searchParams.get('costCentreId') || '';
  if (!projectId) return apiError(UI_STRINGS.common.projectIDIsRequired, 400);
  const pageWindow = getListPageWindow(searchParams);

  const projectAccessFilter = await getUserProjectAccessFilter(ctx.userId, ctx.role, ctx.tenantId);
  const whereProject = {
    tenantId: ctx.tenantId,
    id: projectId,
    ...(projectAccessFilter || {}),
  };
  const costCentreWhere: Record<string, unknown> = { tenantId: ctx.tenantId, projectId };
  if (costCentreId) costCentreWhere.id = costCentreId;

  const projectData = await prisma.project.findFirst({
    where: whereProject,
    select: {
      id: true,
      projectCode: true,
      name: true,
      areaSqFt: true,
      costCentres: {
        where: costCentreId ? { id: costCentreId } : undefined,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        skip: costCentreId ? 0 : pageWindow.skip,
        take: costCentreId ? 1 : pageWindow.pageSize,
        select: {
          id: true,
          code: true,
          name: true,
          areaSqFt: true,
          location: true,
          floorZone: true,
          budgetContributions: {
            where: { isSuperSeded: false, status: { in: [...BUDGET_PENDING_STATUSES] } },
            select: { id: true, status: true, acceptedEstimatedValue: true, totalEstimatedValue: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      },
    },
  });

  if (!projectData) return apiError(UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, 404);

  const costCentreTotal = await prisma.costCentre.count({ where: costCentreWhere });
  const projects: any[] = [projectData];
  const costCentreIds = projectData.costCentres.map((costCentre) => costCentre.id);
  const aggregateWhere: Record<string, unknown> = { tenantId: ctx.tenantId };
  if (projectId) aggregateWhere.projectId = projectId;
  if (costCentreId) aggregateWhere.costCentreId = costCentreId;
  const pageAggregateWhere = { ...aggregateWhere, costCentreId: { in: costCentreIds } };
  const [projectAggregate, contributionGroups, transactionGroups] = await Promise.all([
    loadProjectBudgetAggregate({ tenantId: ctx.tenantId, projectId, costCentreId: costCentreId || null, costCentreIds }),
    costCentreIds.length > 0 ? prisma.budgetContribution.groupBy({
      by: ['costCentreId', 'status'], where: { ...pageAggregateWhere, isSuperSeded: false },
      _sum: { acceptedEstimatedValue: true, totalEstimatedValue: true }, _count: { _all: true },
    }) : Promise.resolve([]),
    costCentreIds.length > 0 ? prisma.budgetTransaction.groupBy({
      by: ['costCentreId', 'status'], where: pageAggregateWhere,
      _sum: { amount: true }, _count: { _all: true },
    }) : Promise.resolve([]),
  ]);

  const contributionsByCostCentre = new Map<string, any[]>();
  for (const group of contributionGroups) {
    if (!group.costCentreId) continue;
    const rows = contributionsByCostCentre.get(group.costCentreId) || [];
    rows.push({
      status: group.status,
      acceptedEstimatedValue: group._sum.acceptedEstimatedValue || 0,
      totalEstimatedValue: group._sum.totalEstimatedValue || 0,
    });
    contributionsByCostCentre.set(group.costCentreId, rows);
  }
  const transactionsByCostCentre = new Map<string, any[]>();
  for (const group of transactionGroups) {
    if (!group.costCentreId) continue;
    const rows = transactionsByCostCentre.get(group.costCentreId) || [];
    rows.push({ status: group.status, amount: group._sum.amount || 0, count: group._count._all });
    transactionsByCostCentre.set(group.costCentreId, rows);
  }
  const actualsByCostCentre = parseCostCentreActuals(projectAggregate.costCentreActualsJson ?? '{}');

  // Calculate project-wide and cost-centre level aggregates
  let totalProjectBudget = 0;
  let approvedProjectBudget = 0;
  let pendingProjectBudget = 0;
  let totalProjectActual = 0;
  let totalProjectArea = 0;

  for (const proj of projects) totalProjectArea += proj.areaSqFt || 0;

  // Compute project KPIs from all compact aggregate groups, independently of
  // the cost-centre detail page currently returned to the client.
  approvedProjectBudget = Number(projectAggregate.approvedBudget || 0);
  pendingProjectBudget = Number(projectAggregate.pendingBudget || 0);
  totalProjectBudget = approvedProjectBudget + pendingProjectBudget;
  totalProjectActual = Number(projectAggregate.actualAmount || 0);

  const costCentreSummaries: any[] = [];
  for (const proj of projects) {
    for (const cc of (proj.costCentres || [])) {
      const ccContributions = contributionsByCostCentre.get(cc.id) || [];
      const ccTransactions = transactionsByCostCentre.get(cc.id) || [];
      // 1. Contributions totals
      const ccApprovedContrib = ccContributions
        .filter((c: any) => c.status === 'APPROVED')
        .reduce((sum: number, c: any) => sum + (c.acceptedEstimatedValue || 0), 0);
      const ccPendingContrib = ccContributions
        .filter((c: any) => c.status === 'UNDER_APPROVAL' || c.status === 'PENDING_PROJECT_APPROVAL' || c.status === 'PENDING_FINANCE_APPROVAL')
        .reduce((sum: number, c: any) => sum + (c.totalEstimatedValue || 0), 0);

      // If transactions exist without contributions, fallback to transactions
      const txApproved = ccTransactions.filter((t: any) => t.status === 'APPROVED').reduce((sum: number, t: any) => sum + t.amount, 0);
      const txPending = ccTransactions
        .filter((t: any) => t.status === 'UNDER_APPROVAL' || t.status === 'PENDING_PROJECT_APPROVAL' || t.status === 'PENDING_FINANCE_APPROVAL')
        .reduce((sum: number, t: any) => sum + t.amount, 0);

      const ccApproved = ccApprovedContrib > 0 ? ccApprovedContrib : txApproved;
      const ccPending = ccPendingContrib > 0 ? ccPendingContrib : txPending;
      const ccTotal = ccApproved + ccPending;

      // Actual costs for this cost centre
      const ccActual = actualsByCostCentre.get(cc.id) || 0;
      // Available Balance must be against approved budget, NEVER unapproved pending!
      const ccBalance = Math.max(0, ccApproved - ccActual);

      const ratePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccApproved / cc.areaSqFt) * 100) / 100 : null;
      const totalRatePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccTotal / cc.areaSqFt) * 100) / 100 : null;
      const actualRatePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccActual / cc.areaSqFt) * 100) / 100 : null;
      const balanceRatePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? Math.round((ccBalance / cc.areaSqFt) * 100) / 100 : null;

      // Cost Centre Budget Status
      let budgetStatus = 'DRAFT';
      if (ccContributions.length > 0) {
        const statuses = ccContributions.map((c: any) => c.status);
        if (statuses.every((s: string) => s === 'APPROVED')) {
          budgetStatus = 'APPROVED';
        } else if (statuses.some((s: string) => s === 'UNDER_APPROVAL' || s === 'PENDING_PROJECT_APPROVAL')) {
          budgetStatus = 'UNDER_APPROVAL';
        } else if (statuses.some((s: string) => s === 'PENDING_FINANCE_APPROVAL')) {
          budgetStatus = 'PENDING FINANCE APPROVAL';
        } else if (statuses.every((s: string) => s === 'REJECTED')) {
          budgetStatus = 'REJECTED';
        } else if (statuses.some((s: string) => s === 'APPROVED')) {
          budgetStatus = 'PARTIALLY APPROVED';
        } else {
          budgetStatus = 'DRAFT';
        }
      } else if (ccTransactions.length > 0) {
        const txStatuses = ccTransactions.map((t: any) => t.status);
        if (txStatuses.every((s: string) => s === 'APPROVED')) budgetStatus = 'APPROVED';
        else if (txStatuses.some((s: string) => s === 'UNDER_APPROVAL' || s === 'PENDING_PROJECT_APPROVAL')) budgetStatus = 'UNDER_APPROVAL';
        else if (txStatuses.every((s: string) => s === 'REJECTED')) budgetStatus = 'REJECTED';
        else if (txStatuses.some((s: string) => s === 'APPROVED')) budgetStatus = 'PARTIALLY APPROVED';
      }

      costCentreSummaries.push({
        id: cc.id,
        projectId: proj.id,
        projectCode: proj.projectCode,
        projectName: proj.name,
        code: cc.code,
        name: cc.name,
        areaSqFt: cc.areaSqFt,
        location: cc.location,
        floorZone: cc.floorZone,
        totalBudget: ccTotal,
        approvedBudget: ccApproved,
        pendingBudget: ccPending,
        actual: ccActual,
        balance: ccBalance,
        budgetStatus,
        ratePerSqFt,
        totalRatePerSqFt,
        actualRatePerSqFt,
        balanceRatePerSqFt,
        categories: [],
        contributions: (cc.budgetContributions || []).filter((c: any) => c.status === 'UNDER_APPROVAL' || c.status === 'PENDING_PROJECT_APPROVAL' || c.status === 'PENDING_FINANCE_APPROVAL'),
        transactionsCount: ccTransactions.reduce((count: number, tx: any) => count + tx.count, 0),
      });
    }
  }

  const overallBalance = Math.max(0, approvedProjectBudget - totalProjectActual);
  const overallRatePerSqFt = totalProjectArea > 0 ? Math.round((approvedProjectBudget / totalProjectArea) * 100) / 100 : null;
  const overallActualRatePerSqFt = totalProjectArea > 0 ? Math.round((totalProjectActual / totalProjectArea) * 100) / 100 : null;
  const overallBalanceRatePerSqFt = totalProjectArea > 0 ? Math.round((overallBalance / totalProjectArea) * 100) / 100 : null;

  return apiSuccess({
    kpis: {
      totalBudget: totalProjectBudget,
      approvedBudget: approvedProjectBudget,
      pendingApproval: pendingProjectBudget,
      actual: totalProjectActual,
      balance: overallBalance,
      totalAreaSqFt: totalProjectArea,
      ratePerSqFt: overallRatePerSqFt,
      actualRatePerSqFt: overallActualRatePerSqFt,
      balanceRatePerSqFt: overallBalanceRatePerSqFt,
    },
    costCentres: costCentreSummaries,
    costCentrePagination: {
      page: costCentreId ? 1 : pageWindow.page,
      pageSize: costCentreId ? 1 : pageWindow.pageSize,
      total: costCentreTotal,
      hasMore: !costCentreId && pageWindow.skip + costCentreSummaries.length < costCentreTotal,
    },
    transactionLedgerUrl: '/api/budgets/transactions',
  });
  } catch (error) {
    logEvent('error', 'budget.summary_read_failed', {
      operation: 'read_budget_summary', route: '/api/budgets', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, projectId: new URL(req.url).searchParams.get('projectId'),
      costCentreId: new URL(req.url).searchParams.get('costCentreId'), durationMs: Date.now() - startedAt, error,
    }, 'next');
    return apiError(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData, 500);
  }
}
