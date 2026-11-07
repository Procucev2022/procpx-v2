import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  BOQ_INSERT_NEXT_CODE_SQL,
  BOQ_LINE_INSERT_AFTER_REVISION_SQL,
  BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
  BOQ_REVISION_UPDATE_LINE_COUNTS_AFTER_LINES_SQL,
  MAX_BOQ_BATCH_LINES,
} from '@/lib/d1-batch.constants';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import type { StandardLibraryBoqItemInput, StandardLibraryBoqRequest } from '@app-types/app/api/boq/from-standard-library.types';
import { STANDARD_LIBRARY_BOQ_AUDIT_ACTION, STANDARD_LIBRARY_BOQ_SOURCE_REFERENCE, STANDARD_LIBRARY_BOQ_SOURCE_TYPE } from './route.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { loadActiveBoqReferenceCatalog } from '@/lib/boq-reference-catalog';

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let projectId: string | undefined;
  let lineCount = 0;

  try {
    let body: StandardLibraryBoqRequest;
    try {
      const parsed: unknown = await req.json();
      if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      body = parsed as StandardLibraryBoqRequest;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    projectId = typeof body.projectId === 'string' ? body.projectId : undefined;
    const costCentreId = typeof body.costCentreId === 'string' && body.costCentreId ? body.costCentreId : null;
    if (!projectId || !Array.isArray(body.items) || body.items.length === 0) {
      return apiError(UI_STRINGS.appApiBoqFromStandardLibraryRoute.projectIDAndAListOfSelectedStandardItemsAreRequired, 400);
    }
    if (body.items.length > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    lineCount = body.items.length;
    const items = body.items as StandardLibraryBoqItemInput[];
    if (items.some((item) => !isRecord(item) || typeof item.standardDescription !== 'string' || !item.standardDescription.trim())) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);

    if (costCentreId) {
      const costCentre = await prisma.costCentre.findFirst({
        where: { id: costCentreId, projectId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!costCentre) return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404);
    }

    const references = await loadActiveBoqReferenceCatalog({
      tenantId: ctx.tenantId, userId: ctx.userId, route: '/api/boq/from-standard-library',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray'),
    });
    if (!references.ok) return apiError(references.message, 413);
    const { categories, uoms } = references;
    const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
    const uomByCode = new Map(uoms.map((uom) => [uom.code.toUpperCase(), uom.id]));
    const now = new Date();
    const boqId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const revisionNotes = `Generated from Standard BOQ Library (${items.length} items)`;

    const statements: D1BatchInputStatement[] = [{
      sql: BOQ_INSERT_NEXT_CODE_SQL,
      values: [boqId, ctx.tenantId, projectId, costCentreId, null, null, null, null, 'DRAFT', null, ctx.userId, now, now],
    }, {
      sql: BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
      values: [revisionId, ctx.tenantId, boqId, costCentreId, 0, 'R0', 'DRAFT', 'STANDARDISED', 'NOT_ADDED_TO_BUDGET',
        'PR_NOT_CREATED', STANDARD_LIBRARY_BOQ_SOURCE_TYPE, STANDARD_LIBRARY_BOQ_SOURCE_REFERENCE, 100,
        items.length, items.length, ctx.userId, now, revisionNotes, now, now, boqId, ctx.tenantId, projectId],
    }];

    items.forEach((item, index) => {
      const description = item.standardDescription as string;
      const quantity = optionalNumber(item.quantity);
      const benchmarkRate = optionalNumber(item.benchmarkRate);
      const totalCost = quantity !== null && benchmarkRate !== null && Number.isFinite(quantity * benchmarkRate)
        ? quantity * benchmarkRate
        : null;
      const category = typeof item.category === 'string' ? item.category : '';
      const uom = typeof item.uom === 'string' && item.uom ? item.uom : 'NOS';
      const specification = typeof item.detailedSpecification === 'string' && item.detailedSpecification
        ? item.detailedSpecification
        : description;
      const brand = typeof item.brandMake === 'string' && item.brandMake ? item.brandMake : null;
      const itemCode = typeof item.itemCode === 'string' && item.itemCode ? item.itemCode : `STD-ITEM-${index + 1}`;

      statements.push({
        sql: BOQ_LINE_INSERT_AFTER_REVISION_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, revisionId, String(index + 1), description, description, specification,
          categoryByName.get(category.toLowerCase()) || null, null, uomByCode.get(uom.toUpperCase()) || null, uom,
          quantity, null, null, brand, null, null, null, null, itemCode, null, null, null, 0.98, true, 'VALID',
          JSON.stringify([]), false, null, null, description, specification, null, 0.98, null, null, benchmarkRate,
          totalCost, 0.95, 'Standard Catalogue', null, null, null, now, now, revisionId, ctx.tenantId,
        ],
      });
    });

    statements.push({
      sql: BOQ_REVISION_UPDATE_LINE_COUNTS_AFTER_LINES_SQL,
      values: [items.length, items.length, now, revisionId, ctx.tenantId],
    });
    statements.push({
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, projectId, 'BOQ', boqId, STANDARD_LIBRARY_BOQ_AUDIT_ACTION,
        interpolateUiString(UI_STRINGS.appApiBoqFromStandardLibraryRoute.draftBOQGeneratedFromStandardLibraryWithLengthItems, { length: items.length }),
        null, JSON.stringify({ sourceType: STANDARD_LIBRARY_BOQ_SOURCE_TYPE, lineCount: items.length }), null, req.headers.get('user-agent'), now],
    });

    const results = await writeD1BatchAtomically(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const boqCode = String(results[0]?.results?.[0]?.boqCode || '');
    if (!boqCode || Number(results[2 + items.length]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({ boqId, revisionId, boqCode, revisionCode: 'R0', totalLines: items.length, qualityScore: 100 }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'boq.standard_library_generation_failed', {
      operation: 'generate_boq_from_standard_library', route: '/api/boq/from-standard-library',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      projectId, lineCount, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.standardBoqGenerationFailed, 500);
  }
}
