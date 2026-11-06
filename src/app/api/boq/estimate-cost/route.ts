import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { computeLineCostBreakdown } from '@/lib/boq-cost-breakdown';
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { interpolateUiString } from '@/lib/i18n';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { MAX_BOQ_BATCH_LINES } from '@/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import type { BoqCostEstimateCategoryTotals, BoqCostEstimateUpdate } from '@app-types/app/api/boq/estimate-cost/route.types';
import {
  BOQ_COST_ESTIMATE_AUDIT_INSERT_AFTER_UPDATE_SQL,
  BOQ_COST_ESTIMATE_BENCHMARK_RATES,
  BOQ_COST_ESTIMATE_LINES_UPDATE_JSON_SQL,
  BOQ_COST_ESTIMATE_REVISION_UPDATE_SQL,
} from './route.constants';

const EMPTY_CATEGORY_TOTALS = (): BoqCostEstimateCategoryTotals => ({
  Material: 0,
  Electrical: 0,
  Civil: 0,
  Interior: 0,
  Other: 0,
});

function getQuantity(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : null;
}

function getLineBenchmark(description: string, categoryName: string): {
  unitCost: number;
  costSource: string;
  confidence: number;
  category: string;
} {
  const descriptionLower = description.toLowerCase();
  const match = Object.entries(BOQ_COST_ESTIMATE_BENCHMARK_RATES).find(([key]) => descriptionLower.includes(key));
  if (match) {
    return {
      unitCost: match[1].rate,
      costSource: match[1].source,
      confidence: match[1].conf,
      category: match[1].category,
    };
  }

  const categoryLower = categoryName.toLowerCase();
  if (categoryLower.includes('electrical')) {
    return { unitCost: 180, costSource: 'AI Estimate (Regional Market Average)', confidence: 0.80, category: 'Electrical' };
  }
  if (categoryLower.includes('civil') || categoryLower.includes('interior')) {
    return { unitCost: 145, costSource: 'AI Estimate (Regional Market Average)', confidence: 0.80, category: 'Civil' };
  }
  if (categoryLower.includes('material')) {
    return { unitCost: 110, costSource: 'AI Estimate (Regional Market Average)', confidence: 0.80, category: 'Material' };
  }
  return { unitCost: 150, costSource: 'AI Estimate (Regional Market Average)', confidence: 0.80, category: 'Other' };
}

function addCategoryTotal(totals: BoqCostEstimateCategoryTotals, category: string, value: number): void {
  if (category.includes('Electrical')) totals.Electrical += value;
  else if (category.includes('Civil')) totals.Civil += value;
  else if (category.includes('Interior')) totals.Interior += value;
  else if (category.includes('Material')) totals.Material += value;
  else totals.Other += value;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let targetId: string | null = null;
  let targetRevisionId: string | null = null;

  try {
    const body = await req.json();
    const { boqRevisionId, boqId, lineIds } = body;
    targetId = typeof boqRevisionId === 'string' ? boqRevisionId : typeof boqId === 'string' ? boqId : null;
    if (!targetId) return apiError(UI_STRINGS.common.bOQRevisionIDOrBOQIDIsRequired, 400);
    if (lineIds !== undefined && (!Array.isArray(lineIds) || lineIds.some((lineId: unknown) => typeof lineId !== 'string'))) {
      return apiError(UI_STRINGS.appApiBoqRefineAiRoute.lineIdsMustBeAListOfStrings, 400);
    }
    if (Array.isArray(lineIds) && lineIds.length > MAX_BOQ_BATCH_LINES) {
      return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    }

    const selectedLineIds = Array.isArray(lineIds) && lineIds.length > 0 ? [...new Set(lineIds as string[])] : null;
    const lineFilter = {
      where: {
        isDeleted: false,
        ...(selectedLineIds ? { id: { in: selectedLineIds } } : {}),
      },
      include: { category: true, subcategory: true, uom: true },
      take: MAX_BOQ_BATCH_LINES + 1,
      orderBy: [{ lineNumber: 'asc' as const }, { id: 'asc' as const }],
    };

    let revision = await prisma.boqRevision.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      include: {
        lines: lineFilter,
        boq: { include: { project: true, costCentre: true } },
      },
    });

    if (!revision) {
      const boqRecord = await prisma.boq.findFirst({
        where: { id: targetId, tenantId: ctx.tenantId },
        include: {
          project: true,
          costCentre: true,
          revisions: {
            orderBy: [{ revisionNumber: 'desc' }, { id: 'desc' }],
            take: 1,
            include: { lines: lineFilter },
          },
        },
      });
      if (boqRecord?.revisions[0]) revision = { ...boqRecord.revisions[0], boq: boqRecord };
    }

    if (!revision) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
    targetRevisionId = revision.id;
    if (revision.lines.length > MAX_BOQ_BATCH_LINES) {
      return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    }

    const estimatedAt = new Date(Math.max(Date.now(), revision.updatedAt.getTime() + 1));
    const estimatedAtIso = estimatedAt.toISOString();
    const categoryTotals = EMPTY_CATEGORY_TOTALS();
    const unestimatedItems: Array<Record<string, unknown>> = [];
    const costResults: Array<Record<string, unknown>> = [];
    const lineUpdates: BoqCostEstimateUpdate[] = [];
    let totalEstimatedRevValue = 0;

    for (const line of revision.lines) {
      const description = line.standardDescription || line.originalDescription || '';
      const benchmark = getLineBenchmark(description, line.category?.name || '');
      const quantity = getQuantity(line.quantity);
      const confidenceLabel = benchmark.confidence >= 0.90 ? 'High' : benchmark.confidence >= 0.75 ? 'Medium' : 'Low';
      const requiresQuantity = quantity === null || quantity <= 0;
      const totalCost = requiresQuantity ? null : Math.round(benchmark.unitCost * quantity * 100) / 100;
      const categoryName = line.category?.name || benchmark.category;
      const costSource = requiresQuantity ? `${benchmark.costSource} (Indicative Rate)` : benchmark.costSource;
      const costMethod = 'WEIGHTED_MEDIAN_BENCHMARK';
      const breakdown = computeLineCostBreakdown(
        benchmark.unitCost,
        requiresQuantity ? null : quantity,
        categoryName,
        description,
      );

      if (totalCost !== null) {
        totalEstimatedRevValue += totalCost;
        addCategoryTotal(categoryTotals, benchmark.category, totalCost);
      } else {
        unestimatedItems.push({
          id: line.id,
          lineNumber: line.lineNumber,
          description: interpolateUiString(UI_STRINGS.common.value1, { value1: description }),
          reason: quantity === null ? 'Quantity is pending input.' : 'Quantity must be greater than zero.',
          suggestedAction: 'Edit the line item in BOQ Workspace to enter quantity.',
        });
      }

      lineUpdates.push({
        id: line.id,
        aiUnitCost: benchmark.unitCost,
        aiTotalCost: totalCost,
        aiReason: JSON.stringify({ costBreakdown: breakdown }),
        costConfidence: benchmark.confidence,
        costSource,
        costMethod,
        costDate: estimatedAtIso,
        geography: 'India / Bengaluru Region',
        validationStatus: requiresQuantity ? 'QUANTITY_REQUIRED' : 'COST GENERATED',
        updatedAt: estimatedAtIso,
      });

      costResults.push({
        id: line.id,
        lineNumber: line.lineNumber,
        description: interpolateUiString(UI_STRINGS.common.value1, { value1: description }),
        uom: line.uom?.code || line.uomRaw || 'NOS',
        quantity: requiresQuantity ? null : quantity,
        aiUnitCost: benchmark.unitCost,
        aiTotalCost: totalCost,
        costBreakdown: breakdown,
        confidence: confidenceLabel,
        costConfidence: benchmark.confidence,
        costSource,
        costMethod,
        geography: 'India / Bengaluru Region',
        status: requiresQuantity ? 'QUANTITY REQUIRED' : 'COST GENERATED',
        disclaimer: requiresQuantity
          ? 'AI Indicative Unit Cost shown. Total Cost pending quantity entry.'
          : 'AI ESTIMATED COST — For budgeting and sourcing benchmark only.',
      });
    }

    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiBoqEstimateCostRoute.aICostEstimationGeneratedForLengthLinesTotalEstimatedBenchmarkToLocaleString,
      {
        length: costResults.length,
        toLocaleString: totalEstimatedRevValue.toLocaleString(I18N_CONFIG.defaultLocale),
      },
    );
    const batchResults = await writeD1BatchAtomically([
      {
        sql: BOQ_COST_ESTIMATE_LINES_UPDATE_JSON_SQL,
        values: [JSON.stringify(lineUpdates), ctx.tenantId, revision.id],
      },
      {
        sql: BOQ_COST_ESTIMATE_REVISION_UPDATE_SQL,
        values: [estimatedAt, revision.id, ctx.tenantId, revision.updatedAt, lineUpdates.length],
      },
      {
        sql: BOQ_COST_ESTIMATE_AUDIT_INSERT_AFTER_UPDATE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, ctx.userId, revision.boq.projectId, revision.id, auditDescription, estimatedAt],
      },
    ]);

    if (Number(batchResults[0]?.meta?.changes ?? -1) !== lineUpdates.length
      || Number(batchResults[1]?.meta?.changes || 0) !== 1
      || Number(batchResults[2]?.meta?.changes || 0) !== 1) {
      throw new Error(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh);
    }

    const areaSqFt = revision.boq.costCentre?.areaSqFt
      || revision.boq.project?.areaSqFt
      || (revision.boq as unknown as { areaSqFt?: number | null }).areaSqFt
      || null;
    const costPerSqFt = areaSqFt && areaSqFt > 0
      ? Math.round((totalEstimatedRevValue / areaSqFt) * 100) / 100
      : null;

    return apiSuccess({
      success: true,
      boqRevisionId: revision.id,
      totalEstimatedBenchmarkValue: Math.round(totalEstimatedRevValue * 100) / 100,
      costPerSqFt,
      areaSqFt,
      lineCount: costResults.length,
      categoryBreakdown: categoryTotals,
      lines: costResults,
      unestimatedItems,
    });
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'boq.cost_estimation_failed', {
        operation: 'estimate_boq_costs',
        route: '/api/boq/estimate-cost',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        boqId: targetId,
        boqRevisionId: targetRevisionId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error
          ? { name: error.name, message: error.message.slice(0, 400) }
          : { type: typeof error },
      });
    } catch {
      // Preserve the stable API response if optional local log storage fails.
    }
    return apiError(UI_STRINGS.common.userMessages.aiCostEstimationFailed, 500);
  }
}
