import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess, getListPageWindow, isApiContext, requireAuth } from '@/lib/api-utils';
import { getUserProjectAccessFilter } from '@/lib/project-auth';
import { logEvent } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import {
  ACTUAL_COST_SUMMARY_STATUSES,
  BUDGET_APPROVED_STATUS,
  BUDGET_PENDING_STATUSES,
} from '../route.constants';
import type { BudgetCategoryAggregateRow } from '@app-types/app/api/budgets/categories.types';
import { BUDGET_TRANSACTION_SUPERSEDED_STATUS } from '@/lib/budget-transaction-status.constants';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const costCentreId = searchParams.get('costCentreId') || '';
  if (!projectId) return apiError(UI_STRINGS.common.projectIDIsRequired, 400);
  if (!costCentreId) return apiError(UI_STRINGS.appApiBoqRoute.costCentreIsRequired, 400);

  const pageWindow = getListPageWindow(searchParams);
  try {
    const projectAccessFilter = await getUserProjectAccessFilter(ctx.userId, ctx.role, ctx.tenantId);
    const project = await prisma.project.findFirst({
      where: { tenantId: ctx.tenantId, id: projectId, ...(projectAccessFilter || {}) },
      select: {
        id: true,
        costCentres: { where: { id: costCentreId }, take: 1, select: { id: true, areaSqFt: true } },
      },
    });
    const costCentre = project?.costCentres[0];
    if (!project || !costCentre) {
      return apiError(UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, 404);
    }

    const pendingStatuses = Prisma.join(BUDGET_PENDING_STATUSES);
    const actualStatuses = Prisma.join(ACTUAL_COST_SUMMARY_STATUSES);
    const rows = await prisma.$queryRaw<BudgetCategoryAggregateRow[]>(Prisma.sql`
      WITH contribution_statuses AS (
        SELECT COUNT(*) AS "rowCount",
          SUM(CASE WHEN "status" = ${BUDGET_APPROVED_STATUS} THEN 1 ELSE 0 END) AS "approvedCount",
          SUM(CASE WHEN "status" IN (${pendingStatuses}) THEN 1 ELSE 0 END) AS "pendingCount",
          SUM(CASE WHEN "status" IN ('UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL') THEN 1 ELSE 0 END) AS "projectPendingCount",
          SUM(CASE WHEN "status" = 'PENDING_FINANCE_APPROVAL' THEN 1 ELSE 0 END) AS "financePendingCount",
          SUM(CASE WHEN "status" = 'REJECTED' THEN 1 ELSE 0 END) AS "rejectedCount"
        FROM "budget_contributions"
        WHERE "tenantId" = ${ctx.tenantId} AND "projectId" = ${projectId}
          AND "costCentreId" = ${costCentreId} AND "isSuperSeded" = 0
      ), transaction_statuses AS (
        SELECT COUNT(*) AS "rowCount",
          SUM(CASE WHEN "status" = ${BUDGET_APPROVED_STATUS} THEN 1 ELSE 0 END) AS "approvedCount",
          SUM(CASE WHEN "status" IN ('UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL') THEN 1 ELSE 0 END) AS "projectPendingCount",
          SUM(CASE WHEN "status" = 'REJECTED' THEN 1 ELSE 0 END) AS "rejectedCount"
        FROM "budget_transactions"
        WHERE "tenantId" = ${ctx.tenantId} AND "projectId" = ${projectId} AND "costCentreId" = ${costCentreId}
          AND "status" <> ${BUDGET_TRANSACTION_SUPERSEDED_STATUS}
      ), cost_centre_status AS (
        SELECT CASE WHEN contribution_statuses."rowCount" > 0 THEN
          CASE WHEN contribution_statuses."approvedCount" = contribution_statuses."rowCount" THEN 'APPROVED'
            WHEN contribution_statuses."projectPendingCount" > 0 THEN 'UNDER_APPROVAL'
            WHEN contribution_statuses."financePendingCount" > 0 THEN 'PENDING FINANCE APPROVAL'
            WHEN contribution_statuses."rejectedCount" = contribution_statuses."rowCount" THEN 'REJECTED'
            WHEN contribution_statuses."approvedCount" > 0 THEN 'PARTIALLY APPROVED'
            ELSE 'DRAFT' END
        WHEN transaction_statuses."rowCount" > 0 THEN
          CASE WHEN transaction_statuses."approvedCount" = transaction_statuses."rowCount" THEN 'APPROVED'
            WHEN transaction_statuses."projectPendingCount" > 0 THEN 'UNDER_APPROVAL'
            WHEN transaction_statuses."rejectedCount" = transaction_statuses."rowCount" THEN 'REJECTED'
            WHEN transaction_statuses."approvedCount" > 0 THEN 'PARTIALLY APPROVED'
            ELSE 'DRAFT' END
        ELSE 'DRAFT' END AS "budgetStatus"
        FROM contribution_statuses CROSS JOIN transaction_statuses
      ), budget_categories AS (
        SELECT COALESCE(NULLIF("category", ''), 'General') AS "category",
          SUM(CASE WHEN "status" = ${BUDGET_APPROVED_STATUS} THEN "amount" ELSE 0 END) AS "approvedBudget",
          SUM(CASE WHEN "status" IN (${pendingStatuses}) THEN "amount" ELSE 0 END) AS "pendingBudget",
          COUNT(*) AS "txCount",
          MAX(CASE WHEN "status" = 'APPROVED' THEN 1 ELSE 0 END) AS "hasApproved",
          MAX(CASE WHEN "status" = 'UNDER_APPROVAL' THEN 1 ELSE 0 END) AS "hasUnderApproval",
          MAX(CASE WHEN "status" = 'PENDING_PROJECT_APPROVAL' THEN 1 ELSE 0 END) AS "hasProjectPending",
          MAX(CASE WHEN "status" = 'REJECTED' THEN 1 ELSE 0 END) AS "hasRejected",
          MAX(CASE WHEN "status" = 'DRAFT' THEN 1 ELSE 0 END) AS "hasDraft"
        FROM "budget_transactions"
        WHERE "tenantId" = ${ctx.tenantId} AND "projectId" = ${projectId} AND "costCentreId" = ${costCentreId}
          AND "status" <> ${BUDGET_TRANSACTION_SUPERSEDED_STATUS}
        GROUP BY COALESCE(NULLIF("category", ''), 'General')
      ), actual_categories AS (
        SELECT COALESCE(NULLIF("category", ''), 'General') AS "category",
          SUM("totalActualAmount") AS "totalActualAmount", SUM("actualAmount") AS "actualAmount"
        FROM "actual_cost_transactions"
        WHERE "tenantId" = ${ctx.tenantId} AND "projectId" = ${projectId} AND "costCentreId" = ${costCentreId}
          AND "status" IN (${actualStatuses})
        GROUP BY COALESCE(NULLIF("category", ''), 'General')
      ), category_keys AS (
        SELECT "category" FROM budget_categories
        UNION
        SELECT "category" FROM actual_categories
      ), category_aggregates AS (
        SELECT category_keys."category",
          COALESCE(budget_categories."approvedBudget", 0) AS "approvedBudget",
          COALESCE(budget_categories."pendingBudget", 0) AS "pendingBudget",
          COALESCE(NULLIF(actual_categories."totalActualAmount", 0), actual_categories."actualAmount", 0) AS "actual",
          COALESCE(budget_categories."txCount", 0) AS "txCount",
          COALESCE(budget_categories."hasApproved", 0) AS "hasApproved",
          COALESCE(budget_categories."hasUnderApproval", 0) AS "hasUnderApproval",
          COALESCE(budget_categories."hasProjectPending", 0) AS "hasProjectPending",
          COALESCE(budget_categories."hasRejected", 0) AS "hasRejected",
          COALESCE(budget_categories."hasDraft", 0) AS "hasDraft"
        FROM category_keys
        LEFT JOIN budget_categories ON budget_categories."category" = category_keys."category"
        LEFT JOIN actual_categories ON actual_categories."category" = category_keys."category"
      ), category_total AS (
        SELECT COUNT(*) AS "total" FROM category_aggregates
      ), category_page AS (
        SELECT * FROM category_aggregates
        ORDER BY "category" COLLATE NOCASE ASC, "category" ASC
        LIMIT ${pageWindow.pageSize} OFFSET ${pageWindow.skip}
      )
      SELECT category_page."category", category_page."approvedBudget", category_page."pendingBudget",
        category_page."actual", category_page."txCount", category_page."hasApproved",
        category_page."hasUnderApproval", category_page."hasProjectPending", category_page."hasRejected",
        category_page."hasDraft", cost_centre_status."budgetStatus", category_total."total"
      FROM category_total CROSS JOIN cost_centre_status
      LEFT JOIN category_page ON 1 = 1
      ORDER BY category_page."category" COLLATE NOCASE ASC, category_page."category" ASC
    `);

    const total = Number(rows[0]?.total || 0);
    const areaSqFt = Number(costCentre.areaSqFt || 0);
    const categories = rows.filter((row) => row.category !== null).map((row) => {
      const approvedBudget = Number(row.approvedBudget || 0);
      const pendingBudget = Number(row.pendingBudget || 0);
      const actual = Number(row.actual || 0);
      const budget = approvedBudget + pendingBudget;
      const balance = Math.max(0, approvedBudget - actual);
      const hasApproved = Number(row.hasApproved || 0) > 0;
      const hasUnderApproval = Number(row.hasUnderApproval || 0) > 0;
      const hasProjectPending = Number(row.hasProjectPending || 0) > 0;
      const hasRejected = Number(row.hasRejected || 0) > 0;
      const hasDraft = Number(row.hasDraft || 0) > 0;
      let status = 'DRAFT';
      if (hasApproved && !hasUnderApproval && !hasProjectPending) status = 'APPROVED';
      else if (hasUnderApproval || hasProjectPending) status = 'UNDER_APPROVAL';
      else if (hasRejected && !hasApproved) status = 'REJECTED';
      else if (hasDraft) status = 'DRAFT';
      else if (budget > 0) status = row.budgetStatus || 'DRAFT';

      return {
        category: row.category,
        budget,
        approvedBudget,
        pendingBudget,
        actual,
        balance,
        ratePerSqFt: areaSqFt > 0 ? Math.round((approvedBudget / areaSqFt) * 100) / 100 : null,
        actualRatePerSqFt: areaSqFt > 0 ? Math.round((actual / areaSqFt) * 100) / 100 : null,
        balanceRatePerSqFt: areaSqFt > 0 ? Math.round((balance / areaSqFt) * 100) / 100 : null,
        status,
        txCount: Number(row.txCount || 0),
      };
    });

    return apiSuccess({
      categories,
      categoryPagination: {
        page: pageWindow.page,
        pageSize: pageWindow.pageSize,
        total,
        hasMore: pageWindow.skip + categories.length < total,
      },
    });
  } catch (error) {
    logEvent('error', 'budget.categories_read_failed', {
      operation: 'read_budget_categories', route: '/api/budgets/categories',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, projectId, costCentreId, page: pageWindow.page, pageSize: pageWindow.pageSize,
      durationMs: Date.now() - startedAt, error,
    }, 'next');
    return apiError(UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData, 500);
  }
}
