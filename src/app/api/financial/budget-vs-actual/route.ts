// src/app/api/financial/budget-vs-actual/route.ts
// Comprehensive Budget vs Commitment vs Actual Cost Analysis Engine

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const costCentreId = searchParams.get('costCentreId');
  const categoryFilter = searchParams.get('category');

  if (!projectId) {
    return apiError(UI_STRINGS.appApiFinancialBudgetVsActualRoute.projectIdIsRequired, 400);
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: ctx.tenantId },
      include: {
        costCentres: true,
      },
    });

    if (!project) {
      return apiError(UI_STRINGS.common.projectNotFound, 404);
    }

    // 1. Fetch all Budget Transactions for this project
    const budgetTxWhere: any = {
      tenantId: ctx.tenantId,
      projectId,
      status: { in: ['APPROVED', 'PROJECT_APPROVED', 'BUDGET_APPROVED'] },
    };
    if (costCentreId) budgetTxWhere.costCentreId = costCentreId;
    if (categoryFilter) budgetTxWhere.category = categoryFilter;

    const budgetTransactions = await prisma.budgetTransaction.findMany({
      where: budgetTxWhere,
      include: {
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
      },
    });

    // 2. Fetch all PPO Lines (Committed) for this project
    const ppoLineWhere: any = {
      tenantId: ctx.tenantId,
      projectId,
      status: { not: 'CANCELLED' },
    };
    if (costCentreId) ppoLineWhere.costCentreId = costCentreId;
    if (categoryFilter) ppoLineWhere.category = categoryFilter;

    const ppoLines = await prisma.ppoLine.findMany({
      where: ppoLineWhere,
      include: {
        ppo: { select: { id: true, ppoNumber: true, title: true, vendor: { select: { id: true, name: true } } } },
      },
    });

    // 3. Fetch all Actual Cost Transactions for this project
    const actualTxWhere: any = {
      tenantId: ctx.tenantId,
      projectId,
      status: { in: ['APPROVED', 'VERIFIED'] },
    };
    if (costCentreId) actualTxWhere.costCentreId = costCentreId;
    if (categoryFilter) actualTxWhere.category = categoryFilter;

    const actualTransactions = await prisma.actualCostTransaction.findMany({
      where: actualTxWhere,
      include: {
        vendor: { select: { id: true, name: true } },
        ppo: { select: { id: true, ppoNumber: true } },
      },
    });

    // 4. Fetch all BOQ Lines for this project
    const boqLineWhere: any = {
      tenantId: ctx.tenantId,
      isDeleted: false,
      revision: {
        boq: { projectId },
      },
    };
    if (costCentreId) {
      boqLineWhere.revision = {
        ...boqLineWhere.revision,
        costCentreId,
      };
    }

    const boqLines = await prisma.boqLine.findMany({
      where: boqLineWhere,
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

    // 5. Line-Level Matrix
    // Group all commitments and actuals by boqLineId
    const committedByBoqLine = new Map<string, typeof ppoLines>();
    for (const pl of ppoLines) {
      if (pl.boqLineId) {
        const arr = committedByBoqLine.get(pl.boqLineId) || [];
        arr.push(pl);
        committedByBoqLine.set(pl.boqLineId, arr);
      }
    }

    const actualsByBoqLine = new Map<string, typeof actualTransactions>();
    for (const at of actualTransactions) {
      if (at.boqLineId) {
        const arr = actualsByBoqLine.get(at.boqLineId) || [];
        arr.push(at);
        actualsByBoqLine.set(at.boqLineId, arr);
      }
    }

    const budgetByBoqLine = new Map<string, typeof budgetTransactions>();
    for (const bt of budgetTransactions) {
      if (bt.boqLineId) {
        const arr = budgetByBoqLine.get(bt.boqLineId) || [];
        arr.push(bt);
        budgetByBoqLine.set(bt.boqLineId, arr);
      }
    }

    // Build consolidated line-item reports
    const lineReports = boqLines.map((line) => {
      const lineBudgetTxs = budgetByBoqLine.get(line.id) || [];
      const linePpoLines = committedByBoqLine.get(line.id) || [];
      const lineActuals = actualsByBoqLine.get(line.id) || [];

      // Budget
      const budgetQuantity = lineBudgetTxs.reduce((sum, b) => sum + (b.quantity || 0), 0) || (line.quantity || 0);
      const budgetAmount = lineBudgetTxs.reduce((sum, b) => sum + (b.amount || 0), 0) || (line.aiTotalCost || 0);
      const budgetRate = budgetQuantity > 0 ? budgetAmount / budgetQuantity : (line.aiUnitCost || 0);

      // Committed
      const committedQuantity = linePpoLines.reduce((sum, p) => sum + p.orderedQuantity, 0);
      const committedAmount = linePpoLines.reduce((sum, p) => sum + p.orderedAmount, 0);
      const committedRate = committedQuantity > 0 ? committedAmount / committedQuantity : 0;

      // Actual
      const actualQuantity = lineActuals.reduce((sum, a) => sum + a.actualQuantity, 0);
      const actualAmount = lineActuals.reduce((sum, a) => sum + a.actualAmount, 0);
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
        posCount: linePpoLines.length,
        actualTransactionsCount: lineActuals.length,
        linePpoLines,
        lineActuals,
        lineBudgetTxs,
      };
    });

    // 6. Aggregations
    // Total Project KPIs
    const totalBudget = lineReports.reduce((acc, l) => acc + l.budgetAmount, 0);
    const totalCommitted = lineReports.reduce((acc, l) => acc + l.committedAmount, 0);
    const totalActual = lineReports.reduce((acc, l) => acc + l.actualAmount, 0);
    const totalRemaining = totalBudget - totalActual;
    const totalBudgetVariance = totalBudget - totalActual;
    const totalVariancePercent = totalBudget > 0 ? ((totalBudget - totalActual) / totalBudget) * 100 : 0;

    // Cost Centre Level Aggregations
    const costCentreMap = new Map<string, any>();
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

    for (const l of lineReports) {
      const ccId = l.costCentre?.id;
      if (ccId && costCentreMap.has(ccId)) {
        const item = costCentreMap.get(ccId);
        item.budgetAmount += l.budgetAmount;
        item.committedAmount += l.committedAmount;
        item.actualAmount += l.actualAmount;
        item.budgetVariance = item.budgetAmount - item.actualAmount;
        if (item.areaSqFt > 0) {
          item.costPerSqFtBudget = item.budgetAmount / item.areaSqFt;
          item.costPerSqFtActual = item.actualAmount / item.areaSqFt;
        }
      }
    }

    const costCentresSummary = Array.from(costCentreMap.values());

    // Category Level Aggregations
    const categoryMap = new Map<string, any>();
    for (const l of lineReports) {
      const cat = l.category || 'General';
      const existing = categoryMap.get(cat) || {
        category: cat,
        budgetAmount: 0,
        committedAmount: 0,
        actualAmount: 0,
        budgetVariance: 0,
        variancePercent: 0,
      };
      existing.budgetAmount += l.budgetAmount;
      existing.committedAmount += l.committedAmount;
      existing.actualAmount += l.actualAmount;
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
    });
  } catch (err: any) {
    console.error('Error fetching budget vs actual report:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToGenerateBudgetVsActualAnalysis }), 500);
  }
}
