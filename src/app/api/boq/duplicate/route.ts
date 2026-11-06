import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BOQ_DUPLICATE_AUDIT_INSERT_AFTER_CHANGE_SQL,
  BOQ_DUPLICATE_INSERT_NEXT_CODE_SQL,
  BOQ_LINE_INSERT_AFTER_REVISION_SQL,
  BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
  BOQ_REVISION_UPDATE_LINE_COUNTS_AFTER_LINES_SQL,
  MAX_BOQ_BATCH_LINES,
} from '@/lib/d1-batch.constants';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import type { BoqDuplicateRequest } from '@app-types/app/api/boq/duplicate.types';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import {
  BOQ_DUPLICATE_AUDIT_ACTION,
  BOQ_DUPLICATE_PREPARATION_STATUS,
  BOQ_DUPLICATE_REVISION_STATUS,
} from './route.constants';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_CREATE');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let sourceBoqId: string | undefined;
  let lineCount = 0;

  try {
    let body: BoqDuplicateRequest;
    try {
      const parsed: unknown = await req.json();
      if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      body = parsed as BoqDuplicateRequest;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    sourceBoqId = typeof body.boqId === 'string' ? body.boqId : undefined;
    if (!sourceBoqId) return apiError(UI_STRINGS.appApiBoqDuplicateRoute.boqIdIsRequired, 400);

    const sourceBoq = await prisma.boq.findFirst({
      where: { id: sourceBoqId, tenantId: ctx.tenantId },
      include: {
        project: { select: { id: true, projectCode: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        },
      },
    });
    if (!sourceBoq) return apiError(UI_STRINGS.appApiBoqDuplicateRoute.sourceBOQNotFound, 404);

    const sourceRevision = sourceBoq.revisions[0] || null;
    const sourceLines = sourceRevision?.lines || [];
    lineCount = sourceLines.length;
    if (lineCount > MAX_BOQ_BATCH_LINES) return apiError(UI_STRINGS.common.boqLineBatchLimitExceeded, 400);

    const newBoqId = crypto.randomUUID();
    const newRevisionId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const now = new Date();
    const newBoqTitle = interpolateUiString(UI_STRINGS.appApiBoqDuplicateRoute.value1Copy, {
      value1: sourceBoq.title || sourceBoq.boqCode,
    });
    const createdBy = ctx.userEmail || ctx.userId;
    const budgetStatus = sourceBoq.purpose === 'BUDGET' ? 'BUDGET_DRAFT' : 'NOT_ADDED_TO_BUDGET';
    const prStatus = sourceBoq.purpose === 'PR' ? 'PR_DRAFT' : 'PR_NOT_CREATED';

    const statements: D1BatchInputStatement[] = [{
      sql: BOQ_DUPLICATE_INSERT_NEXT_CODE_SQL,
      values: [newBoqId, ctx.tenantId, sourceBoq.projectId, sourceBoq.costCentreId, newBoqTitle,
        sourceBoq.category, sourceBoq.scope, sourceBoq.purpose, 'DRAFT', createdBy, now, now],
    }, {
      sql: BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
      values: [newRevisionId, ctx.tenantId, newBoqId, sourceBoq.costCentreId, 0, 'R0',
        BOQ_DUPLICATE_REVISION_STATUS, BOQ_DUPLICATE_PREPARATION_STATUS, budgetStatus, prStatus,
        sourceRevision?.sourceType || 'MANUAL', null, null, 0, 0, ctx.userId, null, sourceRevision?.notes || null,
        now, now, newBoqId, ctx.tenantId, sourceBoq.projectId],
    }];

    for (const line of sourceLines) {
      statements.push({
        sql: BOQ_LINE_INSERT_AFTER_REVISION_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, newRevisionId, line.lineNumber, line.originalDescription,
          nullable(line.standardDescription), nullable(line.specification), nullable(line.categoryId),
          nullable(line.subcategoryId), nullable(line.uomId), nullable(line.uomRaw), nullable(line.quantity),
          nullable(line.location), nullable(line.drawingReference), nullable(line.brand), nullable(line.model),
          nullable(line.material), nullable(line.grade), nullable(line.remarks), nullable(line.itemCode),
          nullable(line.sourceSheet), nullable(line.sourceRow), nullable(line.sourceReference), nullable(line.confidenceScore),
          line.benchmarkEligible ?? true, line.validationStatus || 'PENDING', nullable(line.validationMessages), false,
          null, null, nullable(line.aiSuggestedDescription), nullable(line.aiSuggestedSpec), nullable(line.aiReason),
          nullable(line.aiConfidence), nullable(line.userOverride), nullable(line.userApprovedValue),
          nullable(line.aiUnitCost), nullable(line.aiTotalCost), nullable(line.costConfidence), nullable(line.costSource),
          nullable(line.costMethod), nullable(line.costDate), nullable(line.geography), now, now,
          newRevisionId, ctx.tenantId,
        ],
      });
    }

    if (sourceLines.length > 0) {
      const validLines = Math.min(sourceRevision?.validLines ?? sourceLines.length, sourceLines.length);
      statements.push({
        sql: BOQ_REVISION_UPDATE_LINE_COUNTS_AFTER_LINES_SQL,
        values: [sourceLines.length, validLines, now, newRevisionId, ctx.tenantId],
      });
    }
    statements.push({
      sql: BOQ_DUPLICATE_AUDIT_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, sourceBoq.projectId, BOQ_DUPLICATE_AUDIT_ACTION,
        UI_STRINGS.appApiBoqDuplicateRoute.duplicatedBOQBoqCodeIntoBoqCode2Title, null,
        JSON.stringify({ sourceBoqId: sourceBoq.id, sourceBoqCode: sourceBoq.boqCode }), null,
        req.headers.get('user-agent'), now, sourceBoq.id, newBoqId, ctx.tenantId],
    });

    const results = await writeD1BatchAtomically(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const boqCode = String(results[0]?.results?.[0]?.boqCode || '');
    if (!boqCode) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    if (sourceLines.length > 0 && Number(results[2 + sourceLines.length]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    if (Number(results[results.length - 1]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const newBoq = {
      id: newBoqId, tenantId: ctx.tenantId, projectId: sourceBoq.projectId, costCentreId: sourceBoq.costCentreId,
      boqCode, title: newBoqTitle, category: sourceBoq.category, scope: sourceBoq.scope, purpose: sourceBoq.purpose,
      status: 'DRAFT', createdBy, createdAt: now, updatedAt: now,
    };
    return apiSuccess({
      success: true,
      boq: newBoq,
      boqId: newBoqId,
      boqCode,
      message: interpolateUiString(UI_STRINGS.appApiBoqDuplicateRoute.bOQSuccessfullyDuplicatedAsBoqCode, { boqCode }),
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'boq.duplicate_failed', {
      operation: 'duplicate_boq', route: '/api/boq/duplicate',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      sourceBoqId, lineCount, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToDuplicateBoq, 500);
  }
}
