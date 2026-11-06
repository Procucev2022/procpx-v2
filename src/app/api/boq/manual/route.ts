import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  BOQ_INSERT_NEXT_CODE_SQL,
  BOQ_LINE_DELETE_AFTER_AUDIT_SQL,
  BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
  BOQ_MANUAL_AUDIT_INSERT_CREATED_AFTER_REVISION_SQL,
  BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
  BOQ_REVISION_TOUCH_IF_CURRENT_SQL,
  BOQ_REVISION_UPDATE_MANUAL_METRICS_AFTER_AUDIT_SQL,
  MAX_BOQ_BATCH_LINES,
} from '@/lib/d1-batch.constants';
import type { D1BatchInputStatement, D1BatchResult } from '@app-types/lib/d1-batch.types';
import type { ManualBoqLineInput, ManualBoqRequest } from '@app-types/app/api/boq/manual.types';
import { MANUAL_BOQ_CREATE_AUDIT_ACTION, MANUAL_BOQ_CREATION_NOTES, MANUAL_BOQ_LINES_SAVED_AUDIT_ACTION } from './route.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';

type PreparedLine = {
  lineNumber: string;
  originalDescription: string;
  standardDescription: string;
  specification: string | null;
  categoryId: string | null;
  uomId: string | null;
  uomRaw: string;
  quantity: number;
  brand: string | null;
  drawingReference: string | null;
  location: string | null;
  itemCode: string | null;
  validationStatus: string;
  validationMessages: Array<{ level: string; code: string; message: string }>;
  aiSuggestedDescription: string | null;
  aiUnitCost: number | null;
  aiTotalCost: number | null;
  costSource: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function createPreparedLines(
  lines: ManualBoqLineInput[],
  startNumber: number,
  categories: Array<{ id: string; name: string }>,
  uoms: Array<{ id: string; code: string }>,
): { lines: PreparedLine[]; validCount: number; errorCount: number } {
  const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
  const uomByCode = new Map(uoms.map((uom) => [uom.code.toUpperCase(), uom.id]));
  let validCount = 0;
  let errorCount = 0;

  const prepared = lines.map((line, index) => {
    const description = optionalString(line.originalDescription) || optionalString(line.description) || '';
    const specification = optionalString(line.specification);
    const categoryName = optionalString(line.category) || '';
    const uomRaw = (optionalString(line.uom) || optionalString(line.uomRaw) || 'NOS').toUpperCase();
    const quantity = optionalNumber(line.quantity) ?? 0;
    const explicitLineNumber = optionalString(line.lineNumber) || (typeof line.lineNumber === 'number' ? String(line.lineNumber) : null);
    const lineNumber = explicitLineNumber || String(startNumber + index + 1);
    const validationMessages: PreparedLine['validationMessages'] = [];
    let validationStatus = 'VALID';

    if (!description) {
      validationMessages.push({ level: 'ERROR', code: 'DESC_MISSING', message: UI_STRINGS.appApiBoqManualRoute.descriptionIsRequired });
      validationStatus = 'ERROR';
    }
    if (quantity <= 0) {
      validationMessages.push({ level: 'ERROR', code: 'QTY_INVALID', message: UI_STRINGS.appApiBoqManualRoute.quantityMustBePositive });
      validationStatus = 'ERROR';
    }

    if (validationStatus === 'VALID') validCount += 1;
    else errorCount += 1;

    const aiUnitCost = optionalNumber(line.aiUnitCost);
    return {
      lineNumber,
      originalDescription: description || UI_STRINGS.common.untitledItemFallback,
      standardDescription: optionalString(line.standardDescription) || description || UI_STRINGS.common.untitledItemFallback,
      specification,
      categoryId: categoryByName.get(categoryName.toLowerCase()) || null,
      uomId: uomByCode.get(uomRaw) || null,
      uomRaw,
      quantity,
      brand: optionalString(line.brand),
      drawingReference: optionalString(line.drawingReference),
      location: optionalString(line.location),
      itemCode: optionalString(line.itemCode),
      validationStatus,
      validationMessages,
      aiSuggestedDescription: optionalString(line.aiSuggestedDescription),
      aiUnitCost,
      aiTotalCost: aiUnitCost !== null && Number.isFinite(aiUnitCost * quantity) ? aiUnitCost * quantity : null,
      costSource: optionalString(line.costSource),
    };
  });

  return { lines: prepared, validCount, errorCount };
}

function lineInsertStatement(
  line: PreparedLine,
  revisionId: string,
  tenantId: string,
  auditId: string,
  now: Date,
): D1BatchInputStatement {
  return {
    sql: BOQ_LINE_INSERT_AFTER_AUDIT_SQL,
    values: [
      crypto.randomUUID(), tenantId, revisionId, line.lineNumber, line.originalDescription, line.standardDescription,
      line.specification, line.categoryId, null, line.uomId, line.uomRaw, line.quantity, line.location,
      line.drawingReference, line.brand, null, null, null, null, line.itemCode, null, null, null, null,
      true, line.validationStatus, JSON.stringify(line.validationMessages), false, null, null,
      line.aiSuggestedDescription, null, null, null, null, null, line.aiUnitCost, line.aiTotalCost,
      null, line.costSource, null, null, null, now, now, auditId, tenantId, revisionId, tenantId,
    ],
  };
}

function getChangedCount(result: D1BatchResult | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function summarizeExistingLines(groups: Array<{ validationStatus: string; _count: { _all: number } }>) {
  return groups.reduce((counts, group) => {
    const numberOfLines = Number(group._count._all || 0);
    counts.total += numberOfLines;
    if (group.validationStatus === 'VALID') counts.valid += numberOfLines;
    if (group.validationStatus === 'ERROR') counts.error += numberOfLines;
    if (group.validationStatus === 'WARNING') counts.warning += numberOfLines;
    return counts;
  }, { total: 0, valid: 0, error: 0, warning: 0 });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let targetBoqId: string | undefined;
  let targetRevisionId: string | undefined;
  let lineCount = 0;

  try {
    let body: ManualBoqRequest;
    try {
      const parsed: unknown = await req.json();
      if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      body = parsed as ManualBoqRequest;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const projectId = optionalString(body.projectId) || undefined;
    const requestedBoqId = optionalString(body.boqId) || undefined;
    targetBoqId = requestedBoqId;
    targetRevisionId = optionalString(body.boqRevisionId) || undefined;
    const costCentreId = optionalString(body.costCentreId);
    const isNewBoq = !requestedBoqId;
    const submittedLines = Array.isArray(body.lines) ? body.lines : null;
    const hasLines = submittedLines !== null;

    if (!projectId && !requestedBoqId) {
      return apiError(UI_STRINGS.appApiBoqManualRoute.projectIDOrBOQIDIsRequired, 400);
    }
    if ((body.lines !== undefined && !hasLines) || (body.action !== undefined && body.action !== 'APPEND' && body.action !== 'REPLACE_ALL')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (submittedLines && submittedLines.length > MAX_BOQ_BATCH_LINES) {
      return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);
    }
    if (submittedLines && submittedLines.some((line) => !isRecord(line))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (submittedLines) lineCount = submittedLines.length;
    if (isNewBoq && targetRevisionId) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

    const isReplace = body.action !== 'APPEND';
    const now = new Date();
    const revisionId = targetRevisionId || (isNewBoq ? crypto.randomUUID() : undefined);
    if (!revisionId) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
    targetRevisionId = revisionId;

    let boq: Record<string, unknown>;
    let currentRevision: Record<string, unknown> | null = null;
    let projectName = '';
    let currentLineCounts = { total: 0, valid: 0, error: 0, warning: 0 };

    if (isNewBoq) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
      if (!project) return apiError(UI_STRINGS.common.projectNotFound2, 404);
      projectName = project.name;
      if (costCentreId) {
        const costCentre = await prisma.costCentre.findFirst({
          where: { id: costCentreId, projectId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!costCentre) return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404);
      }
      boq = {
        id: crypto.randomUUID(), tenantId: ctx.tenantId, projectId, costCentreId,
      };
      targetBoqId = String(boq.id);
    } else {
      if (!targetRevisionId) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
      currentRevision = await prisma.boqRevision.findFirst({
        where: { id: targetRevisionId, tenantId: ctx.tenantId, boqId: requestedBoqId },
        select: {
          id: true, boqId: true, status: true, updatedAt: true, costCentreId: true,
          totalLines: true, validLines: true, errorLines: true, warningLines: true,
          boq: { select: { id: true, tenantId: true, projectId: true, costCentreId: true, boqCode: true, title: true,
            description: true, category: true, scope: true, purpose: true, status: true, createdAt: true, updatedAt: true, createdBy: true } },
        },
      });
      if (!currentRevision) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
      if (currentRevision.status === 'APPROVED') {
        return apiError(UI_STRINGS.appApiBoqManualRoute.approvedBOQRevisionsAreStrictlyImmutableBranchANewRevisionToEdit, 403);
      }
      const revisionBoq = currentRevision.boq as Record<string, unknown> | undefined;
      if (!revisionBoq || revisionBoq.tenantId !== ctx.tenantId) return apiError(UI_STRINGS.common.bOQRevisionNotFound, 404);
      if (projectId && projectId !== revisionBoq.projectId) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      if (costCentreId) {
        const costCentre = await prisma.costCentre.findFirst({
          where: { id: costCentreId, projectId: String(revisionBoq.projectId), tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!costCentre) return apiError(UI_STRINGS.common.costCentreNotFoundForThisProject, 404);
      }
      targetBoqId = String(revisionBoq.id);
      boq = revisionBoq;

      if (!hasLines) {
        return apiSuccess({
          boqId: targetBoqId,
          revisionId,
          boq,
          revision: currentRevision,
          totalLines: Number(currentRevision.totalLines || 0),
        });
      }

      if (!isReplace) {
        const lineGroups = await prisma.boqLine.groupBy({
          by: ['validationStatus'],
          where: { tenantId: ctx.tenantId, boqRevisionId: revisionId },
          _count: { _all: true },
        });
        currentLineCounts = summarizeExistingLines(lineGroups);
      }
    }

    const lines = submittedLines ? submittedLines as ManualBoqLineInput[] : [];
    const [categories, uoms] = lines.length > 0 ? await Promise.all([
      prisma.category.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } }),
      prisma.uomMaster.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } }),
    ]) : [[], []];
    const preparedResult = createPreparedLines(lines, isReplace ? 0 : currentLineCounts.total, categories, uoms);
    const lineNumbers = new Set<string>();
    for (const line of preparedResult.lines) {
      if (lineNumbers.has(line.lineNumber)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      lineNumbers.add(line.lineNumber);
    }

    const totalLines = (isReplace ? 0 : currentLineCounts.total) + preparedResult.lines.length;
    const validLines = (isReplace ? 0 : currentLineCounts.valid) + preparedResult.validCount;
    const errorLines = (isReplace ? 0 : currentLineCounts.error) + preparedResult.errorCount;
    const warningLines = isReplace ? 0 : currentLineCounts.warning;
    const qualityScore = totalLines > 0 ? Math.round((validLines / totalLines) * 100) : 100;
    const auditId = crypto.randomUUID();
    const statements: D1BatchInputStatement[] = [];
    let metricsUpdatedAt = now;

    if (isNewBoq) {
      const category = optionalString(body.category)
        || (preparedResult.lines.length > 0 ? optionalString(lines[0]?.category) : null)
        || '';
      const projectLabel = projectName || 'Project';
      const defaultTitle = category ? `${category} — ${projectLabel}` : `${projectLabel} BOQ`;
      const title = optionalString(body.title) || defaultTitle;
      const description = optionalString(body.description);
      const purpose = optionalString(body.purpose) || 'BUDGET';
      if (!['BUDGET', 'PR', 'BOTH'].includes(purpose)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      const createdBoqId = targetBoqId as string;
      const createdBy = ctx.userId;
      const revisionCostCentreId = costCentreId;
      statements.push({
        sql: BOQ_INSERT_NEXT_CODE_SQL,
        values: [createdBoqId, ctx.tenantId, projectId, costCentreId, title, description, category || null, null,
          'DRAFT', purpose, createdBy, now, now],
      }, {
        sql: BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
        values: [revisionId, ctx.tenantId, createdBoqId, revisionCostCentreId, 0, 'R0', 'DRAFT', 'DRAFT',
          'NOT_ADDED_TO_BUDGET', 'PR_NOT_CREATED', 'MANUAL', null, qualityScore, 0, 0, ctx.userId, null,
          MANUAL_BOQ_CREATION_NOTES, now, now, createdBoqId, ctx.tenantId, projectId],
      }, {
        sql: BOQ_MANUAL_AUDIT_INSERT_CREATED_AFTER_REVISION_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, projectId, MANUAL_BOQ_CREATE_AUDIT_ACTION,
          UI_STRINGS.appApiBoqManualRoute.manualBOQCreatedBoqCode, null,
          JSON.stringify({ source: 'manual_workspace', initialLineCount: preparedResult.lines.length }), null,
          req.headers.get('user-agent'), now, createdBoqId, ctx.tenantId, revisionId, ctx.tenantId],
      });
      boq = {
        id: createdBoqId, tenantId: ctx.tenantId, projectId, costCentreId, title, description, category: category || null,
        purpose, status: 'DRAFT', createdBy, createdAt: now, updatedAt: now,
      };
    } else {
      const previousUpdatedAt = currentRevision?.updatedAt instanceof Date
        ? currentRevision.updatedAt
        : new Date(String(currentRevision?.updatedAt || ''));
      if (!Number.isFinite(previousUpdatedAt.getTime())) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      const touchedAt = new Date(Math.max(now.getTime(), previousUpdatedAt.getTime() + 1));
      metricsUpdatedAt = touchedAt;
      const oldValue = JSON.stringify({ status: currentRevision?.status, totalLines: currentRevision?.totalLines,
        validLines: currentRevision?.validLines, errorLines: currentRevision?.errorLines, warningLines: currentRevision?.warningLines });
      const newValue = JSON.stringify({ totalLines, validLines, errorLines, warningLines, action: isReplace ? 'REPLACE_ALL' : 'APPEND' });
      statements.push({
        sql: BOQ_REVISION_TOUCH_IF_CURRENT_SQL,
        values: [touchedAt, revisionId, ctx.tenantId, currentRevision?.status ?? null, currentRevision?.updatedAt],
      }, {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, String((boq as Record<string, unknown>).projectId), 'BOQ', targetBoqId,
          MANUAL_BOQ_LINES_SAVED_AUDIT_ACTION,
          interpolateUiString(UI_STRINGS.appApiBoqManualRoute.manualBOQLinesSaved, { boqCode: String((boq as Record<string, unknown>).boqCode), lineCount: totalLines }),
          oldValue, newValue, null, req.headers.get('user-agent'), touchedAt],
      });
      if (isReplace) {
        statements.push({ sql: BOQ_LINE_DELETE_AFTER_AUDIT_SQL, values: [revisionId, ctx.tenantId, auditId, ctx.tenantId] });
      }
    }

    const lineStartIndex = statements.length;
    for (const line of preparedResult.lines) {
      statements.push(lineInsertStatement(line, revisionId, ctx.tenantId, auditId, now));
    }
    statements.push({
      sql: BOQ_REVISION_UPDATE_MANUAL_METRICS_AFTER_AUDIT_SQL,
      values: [totalLines, validLines, errorLines, warningLines, qualityScore, metricsUpdatedAt, revisionId, ctx.tenantId, auditId, ctx.tenantId],
    });

    const results = await writeD1BatchAtomically(statements);
    const auditIndex = isNewBoq ? 2 : 1;
    const metricsIndex = results.length - 1;
    const parentWritesSucceeded = isNewBoq
      ? getChangedCount(results[0]) === 1 && getChangedCount(results[1]) === 1
      : getChangedCount(results[0]) === 1;
    const auditSucceeded = getChangedCount(results[auditIndex]) === 1;
    const linesSucceeded = preparedResult.lines.every((_, index) => getChangedCount(results[lineStartIndex + index]) === 1);
    if (!parentWritesSucceeded || !auditSucceeded || !linesSucceeded || getChangedCount(results[metricsIndex]) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const boqCode = isNewBoq ? String(results[0]?.results?.[0]?.boqCode || '') : String((boq as Record<string, unknown>).boqCode || '');
    if (!boqCode) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    const revision = {
      ...(currentRevision || {}), id: revisionId, boqId: targetBoqId, status: currentRevision?.status || 'DRAFT',
      totalLines, validLines, errorLines, warningLines, qualityScore, updatedAt: now,
    };

    return apiSuccess({ boqId: targetBoqId, revisionId, boq: { ...boq, boqCode }, revision, totalLines }, isNewBoq ? 201 : 200);
  } catch (error) {
    await writeStructuredLog('error', 'boq.manual_operation_failed', {
      operation: 'save_manual_boq_lines', route: '/api/boq/manual',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      boqId: targetBoqId, revisionId: targetRevisionId, lineCount, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.manualBoqOperationFailed, 500);
  }
}
