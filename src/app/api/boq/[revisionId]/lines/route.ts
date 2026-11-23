// app/api/boq/[revisionId]/lines/route.ts - BOQ lines CRUD with full auditing & validation
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { validateBoqLine } from '@/lib/boq-validate';
import { computeLineCostBreakdown } from '@/lib/boq-cost-breakdown';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { BOQ_LINE_DEFAULT_PAGE_SIZE, BOQ_LINE_MAX_PAGE_NUMBER, BOQ_LINE_MAX_PAGE_SIZE } from './route.constants';
import { BOQ_LINE_MAX_BATCH_EDITS } from '@/lib/boq-line-pagination.constants';
import { decodeBoqLineCursor, encodeBoqLineCursor } from '@/lib/boq-line-pagination';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import type { D1BatchInputStatement, D1BatchResult } from '@app-types/lib/d1-batch.types';
import type { BoqLineBatchUpdateItem, BoqRevisionLinesRouteContext } from '@app-types/app/api/boq/revision-lines.types';
import {
  BOQ_LINE_ASSERT_CREATED_SQL,
  BOQ_LINE_ASSERT_DELETED_SQL,
  BOQ_LINE_ASSERT_UPDATED_SQL,
  BOQ_LINE_EDITABLE_TEXT_FIELDS,
  BOQ_LINE_INSERT_NEXT_NUMBER_SQL,
  BOQ_LINE_SOFT_DELETE_IF_CURRENT_SQL,
  BOQ_LINE_UPDATE_EDIT_SQL,
  BOQ_REVISION_RECALCULATE_LINE_COUNTS_AFTER_AUDIT_SQL,
} from './route.constants';
import { logEvent, writeStructuredLog } from '@/lib/observability/server-logger';
import { readOrderedBoqLineIds, sortByIdOrder } from '@/lib/boq-line-order';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function batchChanged(result: D1BatchResult | undefined): number {
  return Number(result?.meta?.changes || 0);
}


async function resolveRevision(idOrBoqId: string, tenantId: string) {
  let revision = await prisma.boqRevision.findFirst({
    where: { id: idOrBoqId, tenantId },
    include: { boq: true },
  });
  if (!revision) {
    const boqRecord = await prisma.boq.findFirst({
      where: { id: idOrBoqId, tenantId },
      include: {
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
      },
    });
    if (boqRecord && boqRecord.revisions.length > 0) {
      revision = {
        ...boqRecord.revisions[0],
        boq: boqRecord,
      };
    }
  }
  return revision;
}

export async function GET(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const startedAt = Date.now();
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const { searchParams } = new URL(req.url);
  const requestedPage = Number(searchParams.get('page'));
  const requestedPageSize = Number(searchParams.get('pageSize'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, BOQ_LINE_MAX_PAGE_NUMBER)
    : 1;
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, BOQ_LINE_MAX_PAGE_SIZE)
    : BOQ_LINE_DEFAULT_PAGE_SIZE;
  const cursorParam = searchParams.get('cursor');
  const cursor = cursorParam === null ? null : decodeBoqLineCursor(cursorParam);
  if (cursorParam !== null && !cursor) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  const includeTotal = searchParams.get('includeTotal') !== 'false';
  const validationStatus = searchParams.get('validationStatus') || '';
  const search = (searchParams.get('search') || '').trim().slice(0, 120);

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404, { route: '/api/boq/[revisionId]/lines', method: 'GET' });

  const where: any = { boqRevisionId: revision.id, tenantId: ctx.tenantId, isDeleted: false };
  if (validationStatus) where.validationStatus = validationStatus;
  if (search) {
    where.OR = [
      { originalDescription: { contains: search } },
      { standardDescription: { contains: search } },
      { specification: { contains: search } },
      { lineNumber: { contains: search } },
      { itemCode: { contains: search } },
    ];
  }
  // Ids come back in display order (line numbers as numbers); full rows are then loaded by id.
  const [total, orderedIds] = await Promise.all([
    includeTotal ? prisma.boqLine.count({ where }) : Promise.resolve(null),
    readOrderedBoqLineIds((query) => prisma.$queryRaw(query), {
      tenantId: ctx.tenantId,
      revisionId: revision.id,
      search,
      validationStatus,
      cursor,
      offset: cursor ? 0 : (page - 1) * pageSize,
      limit: pageSize + 1,
    }),
  ]);
  const lines = orderedIds.length === 0 ? [] : sortByIdOrder(await prisma.boqLine.findMany({
    where: { id: { in: orderedIds }, boqRevisionId: revision.id, tenantId: ctx.tenantId, isDeleted: false },
    include: {
      category: { select: { id: true, name: true } },
      subcategory: { select: { id: true, name: true } },
      uom: { select: { id: true, code: true, name: true } },
    },
  }), orderedIds);

  const hasMore = lines.length > pageSize;
  const pageLines = lines.slice(0, pageSize);
  const nextCursor = hasMore && pageLines.length > 0
    ? encodeBoqLineCursor(pageLines[pageLines.length - 1])
    : null;
  let malformedCostBreakdownCount = 0;
  let fallbackAppliedCount = 0;
  let fallbackUnavailableCount = 0;
  const malformedCostBreakdownLineIds: string[] = [];
  const enrichedLines = pageLines.map(l => {
    let costBreakdown = null;
    let malformedCostBreakdown = false;
    if (typeof l.aiReason === 'string' && l.aiReason.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(l.aiReason);
        if (parsed.costBreakdown) costBreakdown = parsed.costBreakdown;
      } catch {
        malformedCostBreakdown = true;
        malformedCostBreakdownCount += 1;
        if (malformedCostBreakdownLineIds.length < 20) malformedCostBreakdownLineIds.push(l.id);
      }
    }
    if (!costBreakdown && l.aiUnitCost !== null && l.aiUnitCost !== undefined && Number(l.aiUnitCost) > 0) {
      costBreakdown = computeLineCostBreakdown(
        Number(l.aiUnitCost),
        l.quantity,
        l.category?.name,
        l.standardDescription || l.originalDescription
      );
      if (malformedCostBreakdown) fallbackAppliedCount += 1;
    } else if (malformedCostBreakdown) {
      fallbackUnavailableCount += 1;
    }
    return {
      ...l,
      costBreakdown,
    };
  });
  if (malformedCostBreakdownCount > 0) {
    const requestId = (req.headers.get('x-request-id') || req.headers.get('cf-ray') || '').trim().slice(0, 128);
    logEvent('warn', 'boq.cost_breakdown_parse_failed', {
      operation: 'parse_saved_cost_breakdown',
      route: '/api/boq/[revisionId]/lines',
      ...(requestId ? { requestId } : {}),
      tenantId: ctx.tenantId,
      revisionId: revision.id,
      durationMs: Date.now() - startedAt,
      status: 'degraded',
      malformedLineCount: malformedCostBreakdownCount,
      fallbackAppliedCount,
      fallbackUnavailableCount,
      lineIds: malformedCostBreakdownLineIds,
      omittedLineIdCount: Math.max(0, malformedCostBreakdownCount - malformedCostBreakdownLineIds.length),
      errorType: 'SyntaxError',
    });
  }

  return apiSuccess({
    data: enrichedLines,
    ...(total === null ? {} : { total, totalPages: Math.ceil(total / pageSize) }),
    page,
    pageSize,
    hasMore,
    nextCursor,
    revision,
  });
}

export async function PUT(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404, { route: '/api/boq/[revisionId]/lines', method: 'PUT' });
  if (revision.status === 'APPROVED') {
    return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.approvedBOQsCannotBeEditedCreateANewRevisionInstead);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    body = parsed;
  } catch {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }

  // Support batch updates if body.lines is supplied
  if (body.lines && Array.isArray(body.lines)) {
    const items = body.lines as unknown[];
    if (items.length > BOQ_LINE_MAX_BATCH_EDITS) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqRevisionIdLinesRoute.batchLineUpdateLimitExceeded, { limit: BOQ_LINE_MAX_BATCH_EDITS }), 400);
    }
    if (!items.every(isRecord)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    const batchItems = items as BoqLineBatchUpdateItem[];
    const lineIds = batchItems.map((item) => {
      const rawId = item.id || item.lineId;
      return typeof rawId === 'string' ? rawId.trim() : '';
    });
    if (lineIds.some((id) => !id) || new Set(lineIds).size !== lineIds.length) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    if (lineIds.length === 0) return apiSuccess({ count: 0, lines: [] });

    const existingLines = await prisma.boqLine.findMany({
      where: { id: { in: lineIds }, tenantId: ctx.tenantId, boqRevisionId: revision.id, isDeleted: false },
    });
    if (existingLines.length !== lineIds.length) return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.bOQLineNotFound, 404);
    const linesById = new Map(existingLines.map((line) => [line.id, line]));
    const statements: D1BatchInputStatement[] = [];
    const updatedLines: Array<Record<string, unknown>> = [];

    for (let index = 0; index < batchItems.length; index += 1) {
      const item = batchItems[index];
      const lineId = lineIds[index];
      const existingLine = linesById.get(lineId)!;
      const updates = isRecord(item.updates) ? item.updates : item;
      if (BOQ_LINE_EDITABLE_TEXT_FIELDS.some((field) => updates[field] !== undefined && updates[field] !== null && typeof updates[field] !== 'string')) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      if (updates.originalDescription === null) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      const rawQuantity = updates.quantity;
      let quantity = existingLine.quantity as number | null;
      if (rawQuantity === null || rawQuantity === '') quantity = null;
      else if (rawQuantity !== undefined && Number.isFinite(Number.parseFloat(String(rawQuantity)))) quantity = Number.parseFloat(String(rawQuantity));
      if (quantity !== null && quantity !== undefined && quantity <= 0) return apiError(UI_STRINGS.common.quantityMustBeGreaterThanZero, 400);

      const rawUnitCost = updates.aiUnitCost;
      let unitCost = existingLine.aiUnitCost as number | null;
      if (rawUnitCost === null || rawUnitCost === '') unitCost = null;
      else if (rawUnitCost !== undefined && Number.isFinite(Number.parseFloat(String(rawUnitCost)))) unitCost = Number.parseFloat(String(rawUnitCost));
      const newTotalCost = unitCost !== null && unitCost !== undefined && quantity !== null && quantity !== undefined
        ? Math.round(unitCost * quantity * 100) / 100
        : null;

      const values = {
        standardDescription: (updates.standardDescription !== undefined ? updates.standardDescription : existingLine.standardDescription) as string | null,
        originalDescription: (updates.originalDescription !== undefined ? updates.originalDescription : existingLine.originalDescription) as string,
        specification: (updates.specification !== undefined ? updates.specification : existingLine.specification) as string | null,
        categoryId: (updates.categoryId !== undefined ? updates.categoryId : existingLine.categoryId) as string | null,
        subcategoryId: (updates.subcategoryId !== undefined ? updates.subcategoryId : existingLine.subcategoryId) as string | null,
        uomId: (updates.uomId !== undefined ? updates.uomId : existingLine.uomId) as string | null,
        uomRaw: (updates.uomRaw !== undefined ? updates.uomRaw : existingLine.uomRaw) as string | null,
        quantity,
        location: (updates.location !== undefined ? updates.location : existingLine.location) as string | null,
        drawingReference: (updates.drawingReference !== undefined ? updates.drawingReference : existingLine.drawingReference) as string | null,
        brand: (updates.brand !== undefined ? updates.brand : existingLine.brand) as string | null,
        model: (updates.model !== undefined ? updates.model : existingLine.model) as string | null,
        material: (updates.material !== undefined ? updates.material : existingLine.material) as string | null,
        grade: (updates.grade !== undefined ? updates.grade : existingLine.grade) as string | null,
        remarks: (updates.remarks !== undefined ? updates.remarks : existingLine.remarks) as string | null,
        aiUnitCost: unitCost,
        aiTotalCost: newTotalCost,
      };
      const validation = validateBoqLine({
        originalDescription: values.originalDescription,
        standardDescription: values.standardDescription ?? undefined,
        uomRaw: values.uomRaw ?? undefined,
        uomId: values.uomId ?? undefined,
        quantity: values.quantity,
        categoryId: values.categoryId ?? undefined,
      });
      const validationStatus = quantity === null || quantity === undefined
        ? 'QUANTITY_REQUIRED'
        : unitCost !== null && unitCost !== undefined ? 'COST GENERATED' : validation.status;
      const priorUpdatedAt = existingLine.updatedAt instanceof Date
        ? existingLine.updatedAt
        : existingLine.updatedAt ? new Date(String(existingLine.updatedAt)) : null;
      if (priorUpdatedAt && !Number.isFinite(priorUpdatedAt.getTime())) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      const updatedAt = new Date(Math.max(Date.now() + index, (priorUpdatedAt?.getTime() || 0) + 1));
      const auditId = crypto.randomUUID();
      const description = interpolateUiString(UI_STRINGS.appApiBoqRevisionIdLinesRoute.bOQLineLineNumberUpdatedValue2, {
        lineNumber: existingLine.lineNumber, value2: values.standardDescription || values.originalDescription,
      });

      statements.push({
        sql: BOQ_LINE_UPDATE_EDIT_SQL,
        values: [values.standardDescription, values.originalDescription, values.specification, values.categoryId,
          values.subcategoryId, values.uomId, values.uomRaw, values.quantity, values.location, values.drawingReference,
          values.brand, values.model, values.material, values.grade, values.remarks, values.aiUnitCost, values.aiTotalCost,
          validationStatus, JSON.stringify(validation.messages), updatedAt, lineId, ctx.tenantId, revision.id,
          existingLine.updatedAt ?? null, revision.id, ctx.tenantId],
      });
      statements.push({
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_LINE', lineId, 'BOQ_LINE_UPDATED',
          description,
          JSON.stringify({ standardDescription: existingLine.standardDescription, quantity: existingLine.quantity, uom: existingLine.uomRaw }),
          JSON.stringify({ standardDescription: values.standardDescription, quantity, uom: values.uomRaw }),
          null, req.headers.get('user-agent'), updatedAt],
      });
      statements.push({
        sql: BOQ_LINE_ASSERT_UPDATED_SQL,
        values: [lineId, ctx.tenantId, revision.id, updatedAt, auditId, ctx.tenantId, lineId],
      });
      updatedLines.push({
        ...existingLine, ...values, validationStatus,
        validationMessages: validation.messages, updatedAt,
      });
    }

    try {
      const results = await writeD1BatchAtomically(statements);
      const allUpdatesSucceeded = batchItems.every((_, index) => batchChanged(results[index * 3]) === 1 && batchChanged(results[index * 3 + 1]) === 1);
      if (!allUpdatesSucceeded) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    } catch (error) {
      await writeStructuredLog('error', 'boq.line_batch_update_failed', {
        operation: 'update_boq_lines', route: '/api/boq/[revisionId]/lines', requestId: req.headers.get('x-request-id'),
        tenantId: ctx.tenantId, userId: ctx.userId, revisionId: revision.id, lineIds, lineCount: lineIds.length,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    return apiSuccess({ count: updatedLines.length, lines: updatedLines });
  }

  const lineId = typeof body.lineId === 'string' ? body.lineId.trim() : '';
  const updates = isRecord(body.updates) ? body.updates : null;
  if (!lineId) return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineIDRequired);
  if (!updates) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

  const line = await prisma.boqLine.findFirst({
    where: { id: lineId, boqRevisionId: revision.id, tenantId: ctx.tenantId },
  });
  if (!line) return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.bOQLineNotFound, 404);
  if (BOQ_LINE_EDITABLE_TEXT_FIELDS.some((field) => updates[field] !== undefined && updates[field] !== null && typeof updates[field] !== 'string')) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  if (updates.originalDescription === null) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

  const rawQty = updates.quantity;
  const updatedQty = rawQty === undefined
    ? line.quantity
    : rawQty === null || rawQty === ''
      ? null
      : Number.parseFloat(String(rawQty));
  if (rawQty !== undefined && rawQty !== null && rawQty !== '' && !Number.isFinite(updatedQty)) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  if (updatedQty !== null && updatedQty !== undefined && updatedQty <= 0) {
    return apiError(UI_STRINGS.common.quantityMustBeGreaterThanZero, 400, { route: '/api/boq/[revisionId]/lines', method: 'PUT' });
  }

  const updatedDesc = updates.standardDescription !== undefined ? updates.standardDescription : (updates.originalDescription ?? line.originalDescription);
  if (typeof updatedDesc !== 'string' || !updatedDesc.trim()) {
    return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.descriptionCannotBeBlank, 400);
  }

  const rawUnitCost = updates.aiUnitCost;
  const unitCost = rawUnitCost === undefined
    ? line.aiUnitCost
    : rawUnitCost === null || rawUnitCost === ''
      ? null
      : Number.parseFloat(String(rawUnitCost));
  if (rawUnitCost !== undefined && rawUnitCost !== null && rawUnitCost !== '' && !Number.isFinite(unitCost)) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  const values = {
    standardDescription: (updates.standardDescription !== undefined ? updates.standardDescription : line.standardDescription) as string | null,
    originalDescription: (updates.originalDescription !== undefined ? updates.originalDescription : line.originalDescription) as string,
    specification: (updates.specification !== undefined ? updates.specification : line.specification) as string | null,
    categoryId: (updates.categoryId !== undefined ? updates.categoryId : line.categoryId) as string | null,
    subcategoryId: (updates.subcategoryId !== undefined ? updates.subcategoryId : line.subcategoryId) as string | null,
    uomId: (updates.uomId !== undefined ? updates.uomId : line.uomId) as string | null,
    uomRaw: (updates.uomRaw !== undefined ? updates.uomRaw : line.uomRaw) as string | null,
    quantity: updatedQty,
    location: (updates.location !== undefined ? updates.location : line.location) as string | null,
    drawingReference: (updates.drawingReference !== undefined ? updates.drawingReference : line.drawingReference) as string | null,
    brand: (updates.brand !== undefined ? updates.brand : line.brand) as string | null,
    model: (updates.model !== undefined ? updates.model : line.model) as string | null,
    material: (updates.material !== undefined ? updates.material : line.material) as string | null,
    grade: (updates.grade !== undefined ? updates.grade : line.grade) as string | null,
    remarks: (updates.remarks !== undefined ? updates.remarks : line.remarks) as string | null,
    aiUnitCost: unitCost,
    aiTotalCost: unitCost !== null && unitCost !== undefined && updatedQty !== null && updatedQty !== undefined
      ? Math.round(unitCost * updatedQty * 100) / 100
      : null,
  };
  const validation = validateBoqLine({
    originalDescription: values.originalDescription,
    standardDescription: values.standardDescription ?? undefined,
    uomRaw: values.uomRaw ?? undefined,
    uomId: values.uomId ?? undefined,
    quantity: values.quantity,
    categoryId: values.categoryId ?? undefined,
  });
  const validationStatus = updatedQty === null || updatedQty === undefined
    ? 'QUANTITY_REQUIRED'
    : unitCost !== null && unitCost !== undefined ? 'COST GENERATED' : validation.status;
  const previousUpdatedAt = line.updatedAt instanceof Date ? line.updatedAt : line.updatedAt ? new Date(String(line.updatedAt)) : null;
  if (previousUpdatedAt && !Number.isFinite(previousUpdatedAt.getTime())) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
  const updatedAt = new Date(Math.max(Date.now(), (previousUpdatedAt?.getTime() || 0) + 1));
  const auditId = crypto.randomUUID();
  const description = interpolateUiString(UI_STRINGS.appApiBoqRevisionIdLinesRoute.bOQLineLineNumberUpdatedValue2, {
    lineNumber: line.lineNumber, value2: values.standardDescription || values.originalDescription,
  });
  const statements: D1BatchInputStatement[] = [
    {
      sql: BOQ_LINE_UPDATE_EDIT_SQL,
      values: [values.standardDescription, values.originalDescription, values.specification, values.categoryId,
        values.subcategoryId, values.uomId, values.uomRaw, values.quantity, values.location, values.drawingReference,
        values.brand, values.model, values.material, values.grade, values.remarks, values.aiUnitCost, values.aiTotalCost,
        validationStatus, JSON.stringify(validation.messages), updatedAt, lineId, ctx.tenantId, revision.id,
        line.updatedAt ?? null, revision.id, ctx.tenantId],
    },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_LINE', lineId, 'BOQ_LINE_UPDATED', description,
        JSON.stringify({ standardDescription: line.standardDescription, quantity: line.quantity, uom: line.uomRaw }),
        JSON.stringify({ standardDescription: values.standardDescription, quantity: values.quantity, uom: values.uomRaw }),
        null, req.headers.get('user-agent'), updatedAt],
    },
    { sql: BOQ_LINE_ASSERT_UPDATED_SQL, values: [lineId, ctx.tenantId, revision.id, updatedAt, auditId, ctx.tenantId, lineId] },
  ];
  try {
    const results = await writeD1BatchAtomically(statements);
    if (batchChanged(results[0]) !== 1 || batchChanged(results[1]) !== 1) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
  } catch (error) {
    await writeStructuredLog('error', 'boq.line_update_failed', {
      operation: 'update_boq_line', route: '/api/boq/[revisionId]/lines', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, revisionId: revision.id, lineId,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
  }

  return apiSuccess({ ...line, ...values, validationStatus, validationMessages: validation.messages, updatedAt });
}

export async function POST(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404, { route: '/api/boq/[revisionId]/lines', method: 'POST' });
  if (revision.status === 'APPROVED') {
    return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.approvedBOQsCannotBeEditedCreateANewRevisionInstead);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    body = parsed;
  } catch {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }

  const desc = typeof body.description === 'string' ? body.description.trim() : '';
  if (!desc) {
    return apiError(UI_STRINGS.common.descriptionIsRequired, 400, { route: '/api/boq/[revisionId]/lines', method: 'POST' });
  }

  const quantityInput = body.quantity === undefined || body.quantity === null || body.quantity === ''
    ? 1
    : Number.parseFloat(String(body.quantity));
  if (!Number.isFinite(quantityInput) || quantityInput <= 0) {
    return apiError(UI_STRINGS.common.quantityMustBeGreaterThanZero, 400);
  }
  const rateInput = body.aiUnitCost === undefined || body.aiUnitCost === null || body.aiUnitCost === ''
    ? 150
    : Number.parseFloat(String(body.aiUnitCost));
  if (!Number.isFinite(rateInput) || rateInput < 0) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  const textField = (key: string): string | null => {
    const value = body[key];
    if (value === undefined || value === null || value === '') return null;
    return typeof value === 'string' ? value.trim() || null : null;
  };
  for (const key of ['specification', 'categoryId', 'subcategoryId', 'uomId', 'uomRaw', 'location', 'brand', 'model', 'material', 'remarks']) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  const uomRaw = textField('uomRaw') || UI_STRINGS.common.nOS;
  const quantity = quantityInput;
  const totalCost = Math.round(rateInput * quantity * 100) / 100;
  const lineId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date();
  const auditDescription = interpolateUiString(UI_STRINGS.appApiBoqRevisionIdLinesRoute.boqLineAddedFromManualEntry, {
    description: desc, quantity, uom: uomRaw,
  });
  const statements: D1BatchInputStatement[] = [
    {
      sql: BOQ_LINE_INSERT_NEXT_NUMBER_SQL,
      values: [lineId, ctx.tenantId, revision.id, desc, textField('specification'), textField('categoryId'),
        textField('subcategoryId'), textField('uomId'), uomRaw, quantity, textField('location'), textField('brand'),
        textField('model'), textField('material'), textField('remarks'), rateInput, totalCost, now],
    },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_LINE', lineId, 'BOQ_LINE_ADDED',
        auditDescription, null, JSON.stringify({ description: desc, quantity, uom: uomRaw }), null,
        req.headers.get('user-agent'), now],
    },
    {
      sql: BOQ_REVISION_RECALCULATE_LINE_COUNTS_AFTER_AUDIT_SQL,
      values: [ctx.tenantId, revision.id, ctx.tenantId, revision.id, ctx.tenantId, revision.id, ctx.tenantId,
        revision.id, now, revision.id, ctx.tenantId, auditId, ctx.tenantId],
    },
    {
      sql: BOQ_LINE_ASSERT_CREATED_SQL,
      values: [lineId, ctx.tenantId, revision.id, auditId, ctx.tenantId, lineId, revision.id, ctx.tenantId,
        ctx.tenantId, revision.id],
    },
  ];
  try {
    const results = await writeD1BatchAtomically(statements);
    if (results.slice(0, 3).some((result) => batchChanged(result) !== 1)) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const createdLineNumber = String(results[0]?.results?.[0]?.lineNumber || '');
    if (!createdLineNumber) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    return apiSuccess({
      line: { id: lineId, lineNumber: createdLineNumber },
      message: UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineItemAddedSuccessfully,
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'boq.line_create_failed', {
      operation: 'create_boq_line', route: '/api/boq/[revisionId]/lines', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, revisionId: revision.id, lineId,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
  }
}

export async function DELETE(req: NextRequest, { params }: BoqRevisionLinesRouteContext) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await resolveRevision(revisionId, ctx.tenantId);
  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404, { route: '/api/boq/[revisionId]/lines', method: 'DELETE' });
  if (revision.status === 'APPROVED') {
    return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.approvedBOQsCannotBeEditedCreateANewRevisionInstead);
  }

  const { searchParams } = new URL(req.url);
  const lineId = searchParams.get('lineId');
  if (!lineId) return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineIDIsRequired, 400, { route: '/api/boq/[revisionId]/lines', method: 'DELETE' });

  const line = await prisma.boqLine.findFirst({
    where: { id: lineId, boqRevisionId: revision.id, tenantId: ctx.tenantId, isDeleted: false },
  });
  if (!line) return apiError(UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineNotFound, 404, { route: '/api/boq/[revisionId]/lines', method: 'DELETE' });

  const deletedAt = new Date();
  const auditId = crypto.randomUUID();
  const description = interpolateUiString(UI_STRINGS.appApiBoqRevisionIdLinesRoute.bOQLineLineNumberDeletedValue2, {
    lineNumber: line.lineNumber,
    value2: line.standardDescription || line.originalDescription,
  });
  const statements: D1BatchInputStatement[] = [
    {
      sql: BOQ_LINE_SOFT_DELETE_IF_CURRENT_SQL,
      values: [deletedAt, ctx.userId, deletedAt, lineId, ctx.tenantId, revision.id, line.updatedAt ?? null, revision.id, ctx.tenantId],
    },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, revision.boq.projectId, 'BOQ_LINE', lineId, 'BOQ_LINE_DELETED', description,
        JSON.stringify({ lineNumber: line.lineNumber, isDeleted: false }), JSON.stringify({ lineNumber: line.lineNumber, isDeleted: true }),
        null, req.headers.get('user-agent'), deletedAt],
    },
    {
      sql: BOQ_REVISION_RECALCULATE_LINE_COUNTS_AFTER_AUDIT_SQL,
      values: [ctx.tenantId, revision.id, ctx.tenantId, revision.id, ctx.tenantId, revision.id, ctx.tenantId,
        revision.id, deletedAt, revision.id, ctx.tenantId, auditId, ctx.tenantId],
    },
    {
      sql: BOQ_LINE_ASSERT_DELETED_SQL,
      values: [lineId, ctx.tenantId, revision.id, auditId, ctx.tenantId, lineId, revision.id, ctx.tenantId,
        ctx.tenantId, revision.id],
    },
  ];
  try {
    const results = await writeD1BatchAtomically(statements);
    if (results.slice(0, 3).some((result) => batchChanged(result) !== 1)) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
  } catch (error) {
    await writeStructuredLog('error', 'boq.line_delete_failed', {
      operation: 'delete_boq_line', route: '/api/boq/[revisionId]/lines', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, userId: ctx.userId, revisionId: revision.id, lineId,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
  }

  return apiSuccess({ message: interpolateUiString(UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineLineNumberDeletedSuccessfully, { "lineNumber": line.lineNumber }) });
}
