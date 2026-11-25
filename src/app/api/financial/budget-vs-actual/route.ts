// src/app/api/financial/budget-vs-actual/route.ts
// Comprehensive Budget vs Commitment vs Actual Cost Analysis Engine

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { readByD1FilterChunks } from '@/lib/d1-query';
import type {
  BudgetVsActualCategorySummary,
  BudgetVsActualCostCentreSummary,
  BudgetVsActualLineSource,
  BudgetVsActualSummaryGroup,
} from '@app-types/app/api/financial/budget-vs-actual/route.types';

function loadBudgetVsActualSummaryGroups(input: {
  tenantId: string;
  projectId: string;
  costCentreId: string | null;
  categoryFilter: string | null;
}) {
  const lineCostCentreFilter = input.costCentreId
    ? Prisma.sql`AND revision."costCentreId" = ${input.costCentreId}`
    : Prisma.empty;
  const transactionCostCentreFilter = input.costCentreId
    ? Prisma.sql`AND "costCentreId" = ${input.costCentreId}`
    : Prisma.empty;
  const lineCategoryFilter = input.categoryFilter === UI_STRINGS.common.general
    ? Prisma.sql`AND (line."categoryId" IS NULL OR category."name" = ${input.categoryFilter})`
    : input.categoryFilter
      ? Prisma.sql`AND category."name" = ${input.categoryFilter}`
      : Prisma.empty;
  const transactionCategoryFilter = input.categoryFilter
    ? Prisma.sql`AND "category" = ${input.categoryFilter}`
    : Prisma.empty;

  return prisma.$queryRaw<BudgetVsActualSummaryGroup[]>(Prisma.sql`
    WITH line_summary AS (
      SELECT line."id" AS "boqLineId", line."aiTotalCost" AS "aiTotalCost",
        revision."costCentreId" AS "costCentreId",
        COALESCE(category."name", 'General') AS "category"
      FROM "boq_lines" AS line
      INNER JOIN "boq_revisions" AS revision
        ON revision."id" = line."boqRevisionId" AND revision."tenantId" = line."tenantId"
      INNER JOIN "boqs" AS boq
        ON boq."id" = revision."boqId" AND boq."tenantId" = revision."tenantId"
      LEFT JOIN "categories" AS category
        ON category."id" = line."categoryId" AND category."tenantId" = line."tenantId"
      WHERE line."tenantId" = ${input.tenantId}
        AND line."isDeleted" = 0
        AND boq."projectId" = ${input.projectId}
        ${lineCostCentreFilter}
        ${lineCategoryFilter}
    ),
    budget_by_line AS (
      SELECT "boqLineId", SUM("amount") AS "amount"
      FROM "budget_transactions"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId}
        AND "status" IN ('APPROVED', 'PROJECT_APPROVED', 'BUDGET_APPROVED', 'UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL')
        AND "boqLineId" IS NOT NULL
        ${transactionCostCentreFilter}
        ${transactionCategoryFilter}
      GROUP BY "boqLineId"
    ),
    commitment_by_line AS (
      SELECT "boqLineId", SUM("orderedAmount") AS "amount"
      FROM "ppo_lines"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId}
        AND "status" != 'CANCELLED' AND "boqLineId" IS NOT NULL
        ${transactionCostCentreFilter}
        ${transactionCategoryFilter}
      GROUP BY "boqLineId"
    ),
    actual_by_line AS (
      SELECT "boqLineId", SUM("actualAmount") AS "amount"
      FROM "actual_cost_transactions"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId}
        AND "status" IN ('APPROVED', 'VERIFIED') AND "boqLineId" IS NOT NULL
        ${transactionCostCentreFilter}
        ${transactionCategoryFilter}
      GROUP BY "boqLineId"
    ),
    category_transactions AS (
      SELECT "costCentreId", "category", SUM("amount") AS "amount"
      FROM "budget_transactions"
      WHERE "tenantId" = ${input.tenantId} AND "projectId" = ${input.projectId}
        AND "status" IN ('APPROVED', 'PROJECT_APPROVED', 'BUDGET_APPROVED', 'UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL')
        AND "boqLineId" IS NULL
        ${transactionCostCentreFilter}
        ${transactionCategoryFilter}
      GROUP BY "costCentreId", "category"
    )
    SELECT line_summary."costCentreId" AS "costCentreId",
      line_summary."category" AS "category",
      SUM(COALESCE(NULLIF(budget_by_line."amount", 0), line_summary."aiTotalCost", 0)) + COALESCE(MAX(category_transactions."amount"), 0) AS "budgetAmount",
      SUM(COALESCE(commitment_by_line."amount", 0)) AS "committedAmount",
      SUM(COALESCE(actual_by_line."amount", 0)) AS "actualAmount"
    FROM line_summary
    LEFT JOIN budget_by_line ON budget_by_line."boqLineId" = line_summary."boqLineId"
    LEFT JOIN commitment_by_line ON commitment_by_line."boqLineId" = line_summary."boqLineId"
    LEFT JOIN actual_by_line ON actual_by_line."boqLineId" = line_summary."boqLineId"
    LEFT JOIN category_transactions ON category_transactions."costCentreId" = line_summary."costCentreId" AND category_transactions."category" = line_summary."category"
    GROUP BY line_summary."costCentreId", line_summary."category"
    ORDER BY line_summary."category" ASC, line_summary."costCentreId" ASC
  `);
}


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const costCentreId = searchParams.get('costCentreId');
  const categoryFilter = searchParams.get('category')?.trim() || null;
  const pageWindow = getListPageWindow(searchParams);
  const startedAt = Date.now();

  if (!projectId) {
    return apiError(UI_STRINGS.appApiFinancialBudgetVsActualRoute.projectIdIsRequired, 400, { route: '/api/financial/budget-vs-actual', method: 'GET' });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
      select: {
        id: true,
        projectCode: true,
        name: true,
        costCentres: {
          select: { id: true, code: true, name: true, areaSqFt: true },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!project) {
      return apiError(UI_STRINGS.common.projectNotFound, 404, { route: '/api/financial/budget-vs-actual', method: 'GET' });
    }

    // Detail aggregates only need to cover the requested line page. Project-wide
    // totals are calculated in SQL below so D1 does not return one aggregate row
    // per BOQ line to the Worker for every report page.
    const budgetTxWhere: Prisma.BudgetTransactionWhereInput = {
      tenantId: ctx.tenantId,
      projectId,
      status: { in: ['APPROVED', 'PROJECT_APPROVED', 'BUDGET_APPROVED', 'UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL'] },
    };
    if (costCentreId) budgetTxWhere.costCentreId = costCentreId;
    if (categoryFilter) budgetTxWhere.category = categoryFilter;

    // 2. Committed PPO-line filters
    const ppoLineWhere: Prisma.PpoLineWhereInput = {
      tenantId: ctx.tenantId,
      projectId,
      status: { not: 'CANCELLED' },
    };
    if (costCentreId) ppoLineWhere.costCentreId = costCentreId;
    if (categoryFilter) ppoLineWhere.category = categoryFilter;

    // 3. Actual-cost filters
    const actualTxWhere: Prisma.ActualCostTransactionWhereInput = {
      tenantId: ctx.tenantId,
      projectId,
      status: { in: ['APPROVED', 'VERIFIED'] },
    };
    if (costCentreId) actualTxWhere.costCentreId = costCentreId;
    if (categoryFilter) actualTxWhere.category = categoryFilter;

    // 4. BOQ line filters and the bounded line-detail page
    const boqLineWhere: Prisma.BoqLineWhereInput = {
      tenantId: ctx.tenantId,
      isDeleted: false,
      revision: {
        boq: { projectId },
        ...(costCentreId ? { costCentreId } : {}),
      },
      ...(categoryFilter === UI_STRINGS.common.general
        ? {
          OR: [
            { categoryId: null },
            { category: { is: { name: categoryFilter } } },
          ],
        }
        : categoryFilter ? { category: { is: { name: categoryFilter } } } : {}),
    };

    const pageLines = await prisma.boqLine.findMany({
      where: boqLineWhere,
      orderBy: [{ aiTotalCost: 'desc' }, { lineNumber: 'asc' }, { id: 'asc' }],
      skip: pageWindow.skip,
      take: pageWindow.pageSize,
      include: {
        revision: {
          include: {
            boq: { select: { id: true, boqCode: true } },
            costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
          },
        },
        category: true,
      },
    });

    const pageLineIds = pageLines.map((line) => line.id);
    const lineCountPromise = prisma.boqLine.count({ where: boqLineWhere });
    const summaryRowsPromise = loadBudgetVsActualSummaryGroups({
      tenantId: ctx.tenantId,
      projectId,
      costCentreId,
      categoryFilter,
    });
    const [totalLineCount, summaryRows, budgetGroups, commitmentGroups, actualGroups] = pageLineIds.length > 0
      ? await Promise.all([
        lineCountPromise,
        summaryRowsPromise,
        readByD1FilterChunks(pageLineIds, (chunk) => prisma.budgetTransaction.groupBy({
          by: ['boqLineId'],
          where: { ...budgetTxWhere, boqLineId: { in: chunk } },
          _sum: { amount: true, quantity: true },
          _count: { _all: true },
        })),
        readByD1FilterChunks(pageLineIds, (chunk) => prisma.ppoLine.groupBy({
          by: ['boqLineId'],
          where: { ...ppoLineWhere, boqLineId: { in: chunk } },
          _sum: { orderedQuantity: true, orderedAmount: true },
          _count: { _all: true },
        })),
        readByD1FilterChunks(pageLineIds, (chunk) => prisma.actualCostTransaction.groupBy({
          by: ['boqLineId'],
          where: { ...actualTxWhere, boqLineId: { in: chunk } },
          _sum: { actualQuantity: true, actualAmount: true },
          _count: { _all: true },
        })),
      ])
      : [await lineCountPromise, await summaryRowsPromise, [], [], []];

    // 5. Aggregate-backed line matrix
    const budgetByBoqLine = new Map<string, { amount: number; quantity: number; count: number }>();
    for (const group of budgetGroups) {
      if (group.boqLineId) budgetByBoqLine.set(group.boqLineId, {
        amount: group._sum.amount || 0,
        quantity: group._sum.quantity || 0,
        count: group._count._all,
      });
    }

    const committedByBoqLine = new Map<string, { amount: number; quantity: number; count: number }>();
    for (const group of commitmentGroups) {
      if (group.boqLineId) committedByBoqLine.set(group.boqLineId, {
        amount: group._sum.orderedAmount || 0,
        quantity: group._sum.orderedQuantity || 0,
        count: group._count._all,
      });
    }

    const actualsByBoqLine = new Map<string, { amount: number; quantity: number; count: number }>();
    for (const group of actualGroups) {
      if (group.boqLineId) actualsByBoqLine.set(group.boqLineId, {
        amount: group._sum.actualAmount || 0,
        quantity: group._sum.actualQuantity || 0,
        count: group._count._all,
      });
    }

    const buildLineReport = (line: BudgetVsActualLineSource) => {
      const budgetGroup = budgetByBoqLine.get(line.id);
      const commitmentGroup = committedByBoqLine.get(line.id);
      const actualGroup = actualsByBoqLine.get(line.id);

      // Budget
      const budgetQuantity = budgetGroup?.quantity || (line.quantity || 0);
      const budgetAmount = budgetGroup?.amount || (line.aiTotalCost || 0);
      const budgetRate = budgetQuantity > 0 ? budgetAmount / budgetQuantity : (line.aiUnitCost || 0);

      // Committed
      const committedQuantity = commitmentGroup?.quantity || 0;
      const committedAmount = commitmentGroup?.amount || 0;
      const committedRate = committedQuantity > 0 ? committedAmount / committedQuantity : 0;

      // Actual
      const actualQuantity = actualGroup?.quantity || 0;
      const actualAmount = actualGroup?.amount || 0;
      const actualRate = actualQuantity > 0 ? actualAmount / actualQuantity : 0;

      // Variances
      const budgetVariance = budgetAmount - actualAmount; // Positive = UNDER/SAVING, Negative = OVER
      const budgetVariancePercent = budgetAmount > 0 ? ((budgetAmount - actualAmount) / budgetAmount) * 100 : 0;
      const commitmentVariance = budgetAmount - committedAmount;
      const actualVsCommitment = committedAmount - actualAmount;
      const quantityVariance = budgetQuantity - actualQuantity;
      const rateVariance = budgetRate - actualRate;

      let status = 'ON_TRACK';
      if (actualAmount > budgetAmount && budgetAmount > 0) status = 'OVER_BUDGET';
      else if (budgetAmount > 0 && actualAmount <= budgetAmount) status = 'WITHIN_BUDGET';

      return {
        boqLineId: line.id,
        lineNumber: line.lineNumber,
        itemCode: line.itemCode || line.lineNumber,
        description: line.originalDescription,
        specification: line.specification || line.aiSuggestedSpec,
        category: line.category?.name || 'General',
        subcategory: line.subcategoryId || '',
        uom: line.uomRaw || 'NOS',
        costCentre: line.revision?.costCentre || null,
        boqCode: line.revision?.boq?.boqCode || 'BOQ',
        revisionCode: line.revision?.revisionCode || 'R0',

        // 3 Pillars
        budgetQuantity,
        budgetRate,
        budgetAmount,

        committedQuantity,
        committedRate,
        committedAmount,

        actualQuantity,
        actualRate,
        actualAmount,

        // Variances
        budgetVariance,
        budgetVariancePercent,
        commitmentVariance,
        actualVsCommitment,
        quantityVariance,
        rateVariance,
        status,

        // Lineage Counts
        posCount: commitmentGroup?.count || 0,
        actualTransactionsCount: actualGroup?.count || 0,
      };
    };

    const lineReports = pageLines.map(buildLineReport);

    // The SQL query returns only category/cost-centre groups while still
    // accounting for every matching BOQ line in the selected project.
    const totalBudget = summaryRows.reduce((sum, row) => sum + Number(row.budgetAmount || 0), 0);
    const totalCommitted = summaryRows.reduce((sum, row) => sum + Number(row.committedAmount || 0), 0);
    const totalActual = summaryRows.reduce((sum, row) => sum + Number(row.actualAmount || 0), 0);
    const totalRemaining = totalBudget - totalActual;
    const totalBudgetVariance = totalBudget - totalActual;
    const totalVariancePercent = totalBudget > 0 ? ((totalBudget - totalActual) / totalBudget) * 100 : 0;

    // Cost Centre Level Aggregations
    const costCentreMap = new Map<string, BudgetVsActualCostCentreSummary>();
    for (const cc of project.costCentres) {
      costCentreMap.set(cc.id, {
        id: cc.id,
        code: cc.code,
        name: cc.name,
        areaSqFt: cc.areaSqFt || 0,
        budgetAmount: 0,
        committedAmount: 0,
        actualAmount: 0,
        budgetVariance: 0,
        costPerSqFtBudget: 0,
        costPerSqFtActual: 0,
      });
    }

    for (const row of summaryRows) {
      const ccId = row.costCentreId;
      const item = ccId ? costCentreMap.get(ccId) : undefined;
      if (item) {
        item.budgetAmount += Number(row.budgetAmount || 0);
        item.committedAmount += Number(row.committedAmount || 0);
        item.actualAmount += Number(row.actualAmount || 0);
        item.budgetVariance = item.budgetAmount - item.actualAmount;
        if (item.areaSqFt > 0) {
          item.costPerSqFtBudget = item.budgetAmount / item.areaSqFt;
          item.costPerSqFtActual = item.actualAmount / item.areaSqFt;
        }
      }
    }

    const costCentresSummary = Array.from(costCentreMap.values());

    // Category Level Aggregations
    const categoryMap = new Map<string, BudgetVsActualCategorySummary>();
    for (const row of summaryRows) {
      const cat = row.category || UI_STRINGS.common.general;
      const existing = categoryMap.get(cat) || {
        category: cat,
        budgetAmount: 0,
        committedAmount: 0,
        actualAmount: 0,
        budgetVariance: 0,
        variancePercent: 0,
      };
      existing.budgetAmount += Number(row.budgetAmount || 0);
      existing.committedAmount += Number(row.committedAmount || 0);
      existing.actualAmount += Number(row.actualAmount || 0);
      existing.budgetVariance = existing.budgetAmount - existing.actualAmount;
      existing.variancePercent = existing.budgetAmount > 0
        ? ((existing.budgetAmount - existing.actualAmount) / existing.budgetAmount) * 100
        : 0;
      categoryMap.set(cat, existing);
    }

    const categoriesSummary = Array.from(categoryMap.values());

    return apiSuccess({
      project: {
        id: project.id,
        projectCode: project.projectCode,
        name: project.name,
      },
      kpis: {
        totalBudget,
        totalCommitted,
        totalActual,
        totalRemaining,
        totalBudgetVariance,
        totalVariancePercent,
      },
      costCentresSummary,
      categoriesSummary,
      lineReports,
      lineReportsPagination: {
        page: pageWindow.page,
        pageSize: pageWindow.pageSize,
        total: totalLineCount,
        totalPages: Math.ceil(totalLineCount / pageWindow.pageSize),
        hasMore: pageWindow.skip + lineReports.length < totalLineCount,
      },
    });
  } catch (err: unknown) {
    await writeStructuredLog('error', 'financial.budget_vs_actual.failed', {
      operation: 'read_budget_vs_actual',
      route: '/api/financial/budget-vs-actual',
      tenantId: ctx.tenantId,
      projectId,
      durationMs: Date.now() - startedAt,
      error: err,
    });
    return apiError(UI_STRINGS.common.userMessages.failedToGenerateBudgetVsActualAnalysis, 500);
  }
}
