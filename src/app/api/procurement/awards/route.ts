import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  AWARD_DECISION_UPDATE_SQL,
  AWARD_RECOMMENDATION_INSERT_IF_VALID_SQL,
  RFQ_MARK_AWARD_RECOMMENDED_AFTER_INSERT_SQL,
  RFQ_UPDATE_AWARD_DECISION_AFTER_AUDIT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { AWARD_DECISION_ACTIONS, AWARD_RECOMMENDABLE_RFQ_STATUSES } from './route.constants';
import { getListPageWindow } from '@/lib/api-utils';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AWARD_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const status = searchParams.get('status');
  const { page, pageSize, skip } = getListPageWindow(searchParams);

  try {
    const where = { tenantId: ctx.tenantId, ...(rfqId ? { rfqId } : {}), ...(status ? { status } : {}) };
    const [total, awards] = await Promise.all([
      prisma.awardRecommendation.count({ where }),
      prisma.awardRecommendation.findMany({
        where,
        include: {
          rfq: { include: { project: { select: { id: true, name: true, projectCode: true } }, boqRevision: { select: { id: true, revisionCode: true } } } },
          recommendedVendor: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);
    return apiSuccess({ awards, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.awards_read_failed', {
      operation: 'read_award_recommendations', route: '/api/procurement/awards',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, rfqId, status,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchAwards, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('AWARD_RECOMMEND');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let rfqId: string | undefined;
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    rfqId = typeof body.rfqId === 'string' ? body.rfqId : undefined;
    const recommendedVendorId = typeof body.recommendedVendorId === 'string' ? body.recommendedVendorId : undefined;
    const justification = typeof body.justification === 'string' ? body.justification.trim() : '';
    if (!rfqId || !recommendedVendorId || !justification) {
      return apiError(UI_STRINGS.appApiProcurementAwardsRoute.rFQIDRecommendedVendorAndJustificationAreRequired, 400, { route: '/api/procurement/awards', method: 'POST' });
    }

    const rfq = await prisma.rfq.findFirst({ where: { id: rfqId, tenantId: ctx.tenantId } });
    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    if (!AWARD_RECOMMENDABLE_RFQ_STATUSES.includes(rfq.status as typeof AWARD_RECOMMENDABLE_RFQ_STATUSES[number])) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementAwardsRoute.rFQStatusDoesNotPermitAwardRecommendation, { status: rfq.status }), 409);
    }

    const vendor = await prisma.vendor.findFirst({ where: { id: recommendedVendorId, tenantId: ctx.tenantId } });
    if (!vendor) return apiError(UI_STRINGS.appApiProcurementAwardsRoute.recommendedVendorNotFound, 404);
    const invitation = await prisma.rfqVendor.findFirst({
      where: { tenantId: ctx.tenantId, rfqId, vendorId: recommendedVendorId },
      select: { id: true },
    });
    if (!invitation) return apiError(UI_STRINGS.appApiProcurementAwardsRoute.recommendedVendorWasNotInvitedToThisRFQ, 400);

    const finalAmount = Number(body.finalNegotiatedAmount);
    const benchmarkAmount = body.benchmarkAmount === undefined || body.benchmarkAmount === null
      ? Number(rfq.estimatedBenchmarkValue || 0)
      : Number(body.benchmarkAmount);
    const originalAmount = body.originalQuoteAmount === undefined || body.originalQuoteAmount === null
      ? finalAmount
      : Number(body.originalQuoteAmount);
    if (![finalAmount, benchmarkAmount, originalAmount].every((amount) => Number.isFinite(amount) && amount >= 0)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const technicalStatus = typeof body.technicalStatus === 'string' ? body.technicalStatus : 'COMPLIANT';
    const commercialStatus = typeof body.commercialStatus === 'string' ? body.commercialStatus : 'BEST_VALUE';
    const savings = benchmarkAmount - finalAmount;
    const savingsPercent = benchmarkAmount > 0 ? (savings / benchmarkAmount) * 100 : 0;
    const roundedSavingsPercent = Math.round(savingsPercent * 100) / 100;
    const now = new Date();
    const awardId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const description = interpolateUiString(
      UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendedForNameOnRFQRfqNumberAtToLocaleStringSavingsToLocaleString2Round,
      { name: vendor.name, rfqNumber: rfq.rfqNumber, toLocaleString: finalAmount.toLocaleString(), toLocaleString2: savings.toLocaleString(), round: Math.round(savingsPercent) },
    );
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId, event: 'AWARD_RECOMMENDED', recordNumber: rfq.rfqNumber,
      entityId: awardId, actorName: ctx.userName, details: { vendorName: vendor.name, amount: finalAmount },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, now, auditId)
      : null;
    const results = await writeD1BatchAtomically([
      {
        sql: AWARD_RECOMMENDATION_INSERT_IF_VALID_SQL,
        values: [awardId, ctx.tenantId, rfqId, recommendedVendorId, originalAmount, finalAmount, benchmarkAmount,
          savings, roundedSavingsPercent, technicalStatus, commercialStatus, justification, ctx.userId, now, now, now,
          rfqId, ctx.tenantId, rfq.status, recommendedVendorId, ctx.tenantId, ctx.tenantId, rfqId],
      },
      {
        sql: RFQ_MARK_AWARD_RECOMMENDED_AFTER_INSERT_SQL,
        values: [now, rfqId, ctx.tenantId, rfq.status, awardId, ctx.tenantId],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, rfq.projectId, 'AWARD', awardId,
          'AWARD_RECOMMENDED', description, null,
          JSON.stringify({ vendorId: vendor.id, finalNegotiatedAmount: finalAmount, savings, savingsPercent }), null, null, now],
      },
      ...(preparedNotification ? [preparedNotification.statement] : []),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const award = {
      id: awardId, tenantId: ctx.tenantId, rfqId, recommendedVendorId, originalQuoteAmount: originalAmount,
      finalNegotiatedAmount: finalAmount, benchmarkAmount, totalSavingsAmount: savings,
      savingsPercent: roundedSavingsPercent, technicalStatus, commercialStatus, justification,
      status: 'PENDING_APPROVAL', submittedById: ctx.userId, submittedAt: now, createdAt: now, updatedAt: now,
      recommendedVendor: vendor,
    };
    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'AWARD', entityId: awardId, route: '/api/procurement/awards',
      });
    }
    return apiSuccess({ award, message: UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendationSubmittedForApproval }, 201);
  } catch (error) {
    if (rfqId) {
      try {
        const pending = await prisma.awardRecommendation.findFirst({ where: { tenantId: ctx.tenantId, rfqId, status: 'PENDING_APPROVAL' }, select: { id: true } });
        if (pending) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      } catch {
        // Keep the original workflow failure for logging.
      }
    }
    await writeStructuredLog('error', 'procurement.award_submission_failed', {
      operation: 'submit_award_recommendation', route: '/api/procurement/awards',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, rfqId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitAwardRecommendation, 500);
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAuth('AWARD_APPROVE');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let awardId: string | undefined;
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    awardId = typeof body.awardId === 'string' ? body.awardId : undefined;
    const action = body.action;
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';
    if (!awardId || typeof action !== 'string') {
      return apiError(UI_STRINGS.appApiProcurementAwardsRoute.awardIDAndActionAPPROVEREJECTAreRequired, 400);
    }
    if (!AWARD_DECISION_ACTIONS.includes(action as typeof AWARD_DECISION_ACTIONS[number])) {
      return apiError(UI_STRINGS.appApiProcurementAwardsRoute.awardIDAndActionAPPROVEREJECTAreRequired, 400);
    }

    const award = await prisma.awardRecommendation.findFirst({
      where: { id: awardId, tenantId: ctx.tenantId },
      include: { rfq: true, recommendedVendor: true },
    });
    if (!award) return apiError(UI_STRINGS.common.awardRecommendationNotFound, 404);
    if (award.status !== 'PENDING_APPROVAL') return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

    const approved = action === 'APPROVE';
    const updatedStatus = approved ? 'APPROVED' : 'REJECTED';
    const rfqStatus = approved ? 'APPROVED' : 'COMPARISON';
    const now = new Date();
    const auditId = crypto.randomUUID();
    const description = interpolateUiString(
      UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendationForNameOnRFQRfqNumberWasToLowerCaseByRoleRemarksValue5,
      { name: award.recommendedVendor.name, rfqNumber: award.rfq.rfqNumber, toLowerCase: updatedStatus.toLowerCase(), role: ctx.role, value5: remarks || UI_STRINGS.common.none },
    );
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId, event: approved ? 'AWARD_APPROVED' : 'AWARD_REJECTED',
      recordNumber: award.rfq.rfqNumber, entityId: award.id, actorName: ctx.userName,
      details: { vendorName: award.recommendedVendor.name, amount: award.finalNegotiatedAmount },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, now, auditId)
      : null;
    const results = await writeD1BatchAtomically([
      {
        sql: AWARD_DECISION_UPDATE_SQL,
        values: [updatedStatus, ctx.userId, now, remarks || null, now, awardId, ctx.tenantId, ctx.tenantId],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, award.rfq.projectId, 'AWARD', award.id,
          approved ? 'AWARD_APPROVED' : 'AWARD_REJECTED', description,
          JSON.stringify({ status: 'PENDING_APPROVAL' }), JSON.stringify({ status: updatedStatus, remarks: remarks || null }), null, null, now],
      },
      {
        sql: RFQ_UPDATE_AWARD_DECISION_AFTER_AUDIT_SQL,
        values: [rfqStatus, now, award.rfqId, ctx.tenantId, auditId, ctx.tenantId],
      },
      ...(preparedNotification ? [preparedNotification.statement] : []),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const updated = { ...award, status: updatedStatus, approvedById: ctx.userId, approvedAt: now, approvalRemarks: remarks || null, updatedAt: now };
    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'AWARD', entityId: award.id, route: '/api/procurement/awards',
      });
    }
    return apiSuccess({
      award: updated,
      message: interpolateUiString(UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendationSuccessfullyToLowerCase, { toLowerCase: updatedStatus.toLowerCase() }),
    });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.award_decision_failed', {
      operation: 'review_award_recommendation', route: '/api/procurement/awards',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, awardId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToReviewAwardRecommendation, 500);
  }
}
