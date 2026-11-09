import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  MAX_PPO_COMPLETION_LINES,
  MAX_PPO_CREATE_LINES,
  PPO_ACTUAL_COST_INSERT_AFTER_LINE_UPDATE_SQL,
  PPO_LINE_COMPLETION_UPDATE_SQL,
  PPO_STATUS_UPDATE_AFTER_COMPLETION_SQL,
} from '@/lib/d1-batch.constants';
import { logEvent, writeStructuredLog } from '@/lib/observability/server-logger';
import type { PreparedPpoLineCompletion } from '@app-types/app/api/procurement/ppos/complete.types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

async function fingerprintRequest(ppoId: string, body: Record<string, unknown>): Promise<string> {
  const payload = { ...body };
  delete payload.idempotencyKey;
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize({ ppoId, payload })));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getReplayResponse(tenantId: string, ppoId: string, requestId: string, fingerprint: string) {
  const actualTransactions = await prisma.actualCostTransaction.findMany({
    where: { tenantId, ppoId, completionRequestId: requestId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_PPO_COMPLETION_LINES + 1,
  });
  if (actualTransactions.length > MAX_PPO_COMPLETION_LINES) {
    logEvent('error', 'procurement.ppo_completion_replay_limit_exceeded', {
      operation: 'replay_completion',
      route: '/api/procurement/ppos/[id]/complete',
      tenantId,
      ppoId,
      transactionCount: actualTransactions.length,
      maximumTransactions: MAX_PPO_COMPLETION_LINES,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToCompletePpo, 500);
  }
  if (actualTransactions.length === 0) return null;
  if (actualTransactions.some((transaction) => transaction.completionFingerprint !== fingerprint)) {
    return apiError(UI_STRINGS.appApiProcurementPposIdCompleteRoute.completionRequestKeyReusedWithDifferentData, 409);
  }
  const ppo = await prisma.ppo.findFirst({
    where: { id: ppoId, tenantId },
    include: {
      lines: {
        orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        take: MAX_PPO_CREATE_LINES + 1,
      },
    },
  });
  if (!ppo) return apiError(UI_STRINGS.appApiProcurementPposIdCompleteRoute.pPOPONotFound, 404);
  if ((ppo.lines?.length ?? 0) > MAX_PPO_CREATE_LINES) {
    await writeStructuredLog('error', 'procurement.ppo_line_limit_exceeded', {
      operation: 'replay_completion', route: '/api/procurement/ppos/[id]/complete',
      tenantId, ppoId, observedLineCountAtLeast: ppo.lines.length,
      maximumLines: MAX_PPO_CREATE_LINES,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToCompletePpo, 500);
  }
  return apiSuccess({
    message: interpolateUiString(UI_STRINGS.appApiProcurementPposIdCompleteRoute.pPOCompletionRecordedSuccessfullyGeneratedLengthActualCostTransactionS, { length: actualTransactions.length }),
    ppo,
    actualTransactions,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('ACTUAL_COST_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const { id: ppoId } = await params;
  const startedAt = Date.now();
  let idempotencyKey: string | undefined;
  let fingerprint: string | undefined;
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    idempotencyKey = req.headers.get('idempotency-key')?.trim()
      || (typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : undefined);
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return apiError(UI_STRINGS.appApiProcurementPposIdCompleteRoute.completionRequestIdempotencyKeyRequired, 400);
    }
    fingerprint = await fingerprintRequest(ppoId, body);

    const ppo = await prisma.ppo.findFirst({
      where: { id: ppoId, tenantId: ctx.tenantId },
      include: {
        lines: {
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: MAX_PPO_CREATE_LINES + 1,
        },
        project: true,
        rfq: { include: { pr: true, boqRevision: true } },
      },
    });
    if (!ppo) return apiError(UI_STRINGS.appApiProcurementPposIdCompleteRoute.pPOPONotFound, 404);
    if ((ppo.lines?.length ?? 0) > MAX_PPO_CREATE_LINES) {
      await writeStructuredLog('error', 'procurement.ppo_line_limit_exceeded', {
        operation: 'complete_ppo', route: '/api/procurement/ppos/[id]/complete',
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
        tenantId: ctx.tenantId, userId: ctx.userId, ppoId,
        observedLineCountAtLeast: ppo.lines.length, maximumLines: MAX_PPO_CREATE_LINES,
        durationMs: Date.now() - startedAt,
      }, 'application');
      return apiError(UI_STRINGS.common.userMessages.failedToCompletePpo, 500);
    }

    const replay = await getReplayResponse(ctx.tenantId, ppoId, idempotencyKey, fingerprint);
    if (replay) return replay;
    if (ppo.status === 'CANCELLED') {
      return apiError(UI_STRINGS.appApiProcurementPposIdCompleteRoute.cannotCompleteACancelledOrder, 400, { route: '/api/procurement/ppos/[id]/complete', method: 'POST' });
    }
    if (!['ISSUED', 'CONFIRMED', 'PARTIALLY_COMPLETED'].includes(ppo.status)) {
      return apiError(UI_STRINGS.appApiProcurementPposIdCompleteRoute.completionCannotBeRecordedInCurrentStatus, 409);
    }

    const now = new Date();
    let completionDate = now;
    if (body.completionDate !== undefined && body.completionDate !== null && body.completionDate !== '') {
      if (typeof body.completionDate !== 'string' || !Number.isFinite(Date.parse(body.completionDate))) {
        return apiError(UI_STRINGS.common.invalidDate, 400);
      }
      completionDate = new Date(body.completionDate);
    }
    const completionReference = typeof body.completionReference === 'string' && body.completionReference.trim()
      ? body.completionReference.trim()
      : `WCC-${ppo.ppoNumber}`;
    const documents = body.documents === undefined || body.documents === null
      ? null
      : typeof body.documents === 'string' ? body.documents : JSON.stringify(body.documents);
    const requestRemarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';

    let items: Array<Record<string, unknown>>;
    if (body.lineCompletions === undefined || body.lineCompletions === null) {
      items = ppo.lines
        .filter((line) => line.orderedQuantity > line.completedQuantity)
        .map((line) => ({
          ppoLineId: line.id,
          completedQuantity: line.orderedQuantity - line.completedQuantity,
          finalRate: line.orderedUnitRate,
          actualAmount: (line.orderedQuantity - line.completedQuantity) * line.orderedUnitRate,
          remarks: 'Full order line completion',
        }));
    } else if (Array.isArray(body.lineCompletions)) {
      items = body.lineCompletions as Array<Record<string, unknown>>;
    } else {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (items.length === 0) return apiError(UI_STRINGS.appApiProcurementPposIdCompleteRoute.noValidPpoLinesToComplete, 400);
    if (items.length > MAX_PPO_COMPLETION_LINES) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementPposIdCompleteRoute.ppoCompletionLineLimitExceeded, { limit: MAX_PPO_COMPLETION_LINES }), 400);
    }

    const seenLineIds = new Set<string>();
    const preparedLines: PreparedPpoLineCompletion[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.ppoLineId !== 'string') {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      if (seenLineIds.has(item.ppoLineId)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      seenLineIds.add(item.ppoLineId);
      const line = ppo.lines.find((candidate) => candidate.id === item.ppoLineId);
      if (!line || !['ISSUED', 'PARTIALLY_COMPLETED'].includes(line.status)) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }

      const completedQuantity = Number(item.completedQuantity);
      const finalRate = item.finalRate === undefined || item.finalRate === null ? line.orderedUnitRate : Number(item.finalRate);
      const actualAmount = item.actualAmount === undefined || item.actualAmount === null
        ? completedQuantity * finalRate
        : Number(item.actualAmount);
      const taxAmount = item.taxAmount === undefined || item.taxAmount === null ? 0 : Number(item.taxAmount);
      const remainingQuantity = line.orderedQuantity - line.completedQuantity;
      if (!Number.isFinite(completedQuantity) || completedQuantity <= 0 || completedQuantity > remainingQuantity
        || !Number.isFinite(finalRate) || finalRate < 0 || !Number.isFinite(actualAmount) || actualAmount < 0
        || !Number.isFinite(taxAmount) || taxAmount < 0) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }

      const newCompletedQuantity = line.completedQuantity + completedQuantity;
      const newCompletedAmount = line.completedAmount + actualAmount;
      preparedLines.push({
        line,
        completedQuantity,
        finalRate,
        actualAmount,
        taxAmount,
        totalActualAmount: actualAmount + taxAmount,
        newCompletedQuantity,
        newCompletedAmount,
        status: newCompletedQuantity >= line.orderedQuantity ? 'COMPLETED' : 'PARTIALLY_COMPLETED',
        remarks: typeof item.remarks === 'string' && item.remarks.trim()
          ? item.remarks.trim()
          : requestRemarks || 'PPO milestone completion verified',
      });
    }

    const batch = [] as Array<{ sql: string; values: unknown[] }>;
    const transactionIds = preparedLines.map(() => crypto.randomUUID());
    const createdBy = ctx.userName || 'System User';
    const year = completionDate.getUTCFullYear();
    const createdAt = now.toISOString();
    const actualDate = completionDate.toISOString();
    for (let index = 0; index < preparedLines.length; index += 1) {
      const item = preparedLines[index];
      const line = item.line;
      batch.push({
        sql: PPO_LINE_COMPLETION_UPDATE_SQL,
        values: [item.newCompletedQuantity, item.newCompletedAmount, item.status, createdAt,
          line.id, ctx.tenantId, ppo.id, line.completedQuantity, line.completedAmount,
          item.completedQuantity, ctx.tenantId],
      });
      batch.push({
        sql: PPO_ACTUAL_COST_INSERT_AFTER_LINE_UPDATE_SQL,
        values: [transactionIds[index], ctx.tenantId, year, ctx.tenantId, year,
          ppo.projectId, line.costCentreId || ppo.costCentreId || null, line.category || 'General', line.subcategory || null,
          line.boqId || ppo.boqId || ppo.rfq?.boqRevision?.boqId || null,
          line.boqRevisionId || ppo.boqRevisionId || ppo.rfq?.boqRevisionId || null,
          line.boqLineId || null, ppo.prId || ppo.rfq?.prId || null, line.prLineId || null,
          ppo.rfqId, line.rfqLineId || null, ppo.id, line.id, ppo.vendorId, line.uom,
          item.completedQuantity, item.finalRate, item.actualAmount, item.taxAmount, item.totalActualAmount,
          actualDate, completionReference, documents, item.remarks, ctx.userId, createdBy, createdAt, createdAt,
          idempotencyKey, fingerprint],
      });
    }

    const auditId = crypto.randomUUID();
    batch.push({
      sql: PPO_STATUS_UPDATE_AFTER_COMPLETION_SQL,
      values: [createdAt, createdAt, ppo.id, ctx.tenantId, ctx.tenantId, idempotencyKey],
    });
    batch.push({
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, ppo.projectId, 'PPO', ppo.id, 'PPO_COMPLETION_RECORDED',
        interpolateUiString(UI_STRINGS.appApiProcurementPposIdCompleteRoute.ppoCompletionRecordedAuditDescription, { ppoNumber: ppo.ppoNumber, length: preparedLines.length }),
        JSON.stringify({ status: ppo.status }), JSON.stringify({ completionRequestId: idempotencyKey, actualTransactionsCount: preparedLines.length, completionReference }),
        null, null, createdAt],
    });

    await writeD1BatchAtomically(batch);
    const replayAfterWrite = await getReplayResponse(ctx.tenantId, ppoId, idempotencyKey, fingerprint);
    if (replayAfterWrite) return replayAfterWrite;
    return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
  } catch (error) {
    if (idempotencyKey && fingerprint) {
      try {
        const replayAfterFailure = await getReplayResponse(ctx.tenantId, ppoId, idempotencyKey, fingerprint);
        if (replayAfterFailure) return replayAfterFailure;
      } catch {
        // Preserve the original failure for structured diagnostics.
      }
    }
    await writeStructuredLog('error', 'procurement.ppo_completion_failed', {
      operation: 'complete_ppo', route: '/api/procurement/ppos/[id]/complete',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, ppoId, idempotencyKey,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToCompletePpo, 500);
  }
}
