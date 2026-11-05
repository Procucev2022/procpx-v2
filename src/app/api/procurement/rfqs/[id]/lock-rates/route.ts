// app/api/procurement/rfqs/[id]/lock-rates/route.ts
// Locks Final Negotiated Rates for an RFQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, RFQ_LOCK_FINAL_RATES_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { LOCKABLE_RFQ_STATUSES, MAX_LOCK_RATES_REMARKS_LENGTH } from './route.constants';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('FINAL_RATE_LOCK');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  let vendorIdForLog: string | undefined;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const payload = body as Record<string, unknown>;
    const vendorId = typeof payload.vendorId === 'string' ? payload.vendorId : undefined;
    const remarks = typeof payload.remarks === 'string' ? payload.remarks.trim() : '';
    vendorIdForLog = vendorId;
    const hasFinalCommercialValue = payload.finalCommercialValue !== undefined && payload.finalCommercialValue !== null;
    const finalCommercialValue = hasFinalCommercialValue ? Number(payload.finalCommercialValue) : undefined;

    if ((payload.remarks !== undefined && typeof payload.remarks !== 'string')
      || remarks.length > MAX_LOCK_RATES_REMARKS_LENGTH
      || (hasFinalCommercialValue && (typeof payload.finalCommercialValue !== 'number' && typeof payload.finalCommercialValue !== 'string'))
      || (hasFinalCommercialValue && (!Number.isFinite(finalCommercialValue) || (finalCommercialValue as number) < 0))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    if (!vendorId) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.winningVendorIDIsRequiredToLockRates, 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        tenantId: true,
        rfqNumber: true,
        projectId: true,
        status: true,
        estimatedBenchmarkValue: true,
      },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }
    if (!LOCKABLE_RFQ_STATUSES.includes(rfq.status as typeof LOCKABLE_RFQ_STATUSES[number])) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFound, 404);
    }

    const [invitation, latestQuote] = await Promise.all([
      prisma.rfqVendor.findFirst({ where: { rfqId: id, vendorId, tenantId: ctx.tenantId }, select: { id: true } }),
      prisma.quote.findFirst({
        where: { rfqId: id, vendorId, tenantId: ctx.tenantId, status: { in: ['SUBMITTED', 'UNDER_EVALUATION', 'REVISED', 'ACCEPTED'] } },
        orderBy: [{ quoteVersion: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, totalQuoteAmount: true },
      }),
    ]);
    if (!invitation) return apiError(UI_STRINGS.common.forbiddenVendorIsNotInvitedToThisRFQ, 403);
    if (!latestQuote) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

    const benchmark = Number(rfq.estimatedBenchmarkValue || 0);
    const finalAmount = hasFinalCommercialValue ? finalCommercialValue as number : Number(latestQuote.totalQuoteAmount);
    const savings = benchmark - finalAmount;
    const savingsPercent = benchmark > 0 ? (savings / benchmark) * 100 : 0;
    const lockedAt = new Date();
    const auditId = crypto.randomUUID();
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'FINAL_RATES_LOCKED',
      recordNumber: rfq.rfqNumber,
      entityId: rfq.id,
      actorName: ctx.userName,
      details: { vendorName: vendor.name, amount: finalAmount },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, lockedAt, auditId)
      : null;
    const description = interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.finalRatesLockedForRFQRfqNumberWithVendorNameAtToLocaleStringBenchmarkToLocaleString2SavingsRound, { "rfqNumber": rfq.rfqNumber, "name": vendor.name, "toLocaleString": finalAmount.toLocaleString(), "toLocaleString2": benchmark.toLocaleString(), "round": Math.round(savingsPercent) });
    const results = await writeD1BatchAtomically([
      {
        sql: RFQ_LOCK_FINAL_RATES_SQL,
        values: [lockedAt, ctx.userId, lockedAt, id, ctx.tenantId, rfq.status, vendorId, vendorId, vendorId],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, rfq.projectId, 'RFQ', rfq.id,
          'FINAL_RATE_LOCKED', description, JSON.stringify({ status: rfq.status }),
          JSON.stringify({ vendorId, vendorName: vendor.name, finalCommercialValue: finalAmount,
            benchmarkValue: benchmark, savings, savingsPercent, remarks: remarks || null }), null, null, lockedAt],
      },
      ...(preparedNotification ? [preparedNotification.statement] : []),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1
      || (preparedNotification && Number(results[2]?.meta?.changes || 0) !== 1)) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, lockedAt, {
        tenantId: ctx.tenantId, entityType: 'RFQ', entityId: rfq.id,
        route: `/api/procurement/rfqs/${id}/lock-rates`,
      });
    }

    const updated = { ...rfq, status: 'FINAL_RATE_LOCKED', finalLockedAt: lockedAt, finalLockedById: ctx.userId, updatedAt: lockedAt };
    return apiSuccess({
      rfq: updated,
      finalVendor: vendor,
      finalCommercialValue: finalAmount,
      savings,
      savingsPercent: Math.round(savingsPercent * 100) / 100,
      message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.finalCommercialRatesLockedSuccessfullyForName, { "name": vendor.name }),
    });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.final_rates_lock_failed', {
      operation: 'lock_final_rates', route: `/api/procurement/rfqs/${id}/lock-rates`,
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, userId: ctx.userId, rfqId: id, vendorId: vendorIdForLog,
      durationMs: Date.now() - startedAt, error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToLockFinalRates, 500);
  }
}
