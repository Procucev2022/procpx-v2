// src/app/api/procurement/negotiations/decision/route.ts
// Handles Buyer Decision on Vendor Offers / Final Offers (Accept, Reject, Final Acceptance Pending)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  NEGOTIATION_BUYER_DECISION_UPDATE_SQL,
  NEGOTIATION_CLOSE_AFTER_AUDIT_SQL,
  QUOTE_ACCEPT_AFTER_AUDIT_SQL,
  RFQ_MESSAGE_INSERT_AFTER_AUDIT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('NEGOTIATION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let roundId: string | undefined;
  try {
    const body = await req.json();
    roundId = typeof body?.roundId === 'string' ? body.roundId : undefined;
    const decision = body?.decision;
    const remarks = typeof body?.remarks === 'string' ? body.remarks.trim() : '';

    if (!roundId || !decision) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.roundIDAndDecisionAreRequired, 400);
    }
    if (!['ACCEPTED', 'REJECTED', 'FINAL_ACCEPTANCE_PENDING'].includes(decision)) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.decisionMustBeACCEPTEDREJECTEDOrFINALACCEPTANCEPENDING, 400);
    }

    const round = await prisma.negotiationRound.findFirst({
      where: { id: roundId, tenantId: ctx.tenantId },
      include: { vendor: true, negotiation: { include: { rfq: true } } },
    });
    if (!round) return apiError(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.negotiationRoundNotFoundOrAccessDenied, 404);

    const rfq = round.negotiation.rfq;
    const vendor = round.vendor;
    const currentDecision = round.buyerDecision;
    if (currentDecision && !['PENDING_BUYER_DECISION', 'FINAL_ACCEPTANCE_PENDING'].includes(currentDecision)) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerDecisionConflictPleaseRefresh, 409);
    }
    if (currentDecision === 'FINAL_ACCEPTANCE_PENDING' && decision === 'FINAL_ACCEPTANCE_PENDING') {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerDecisionConflictPleaseRefresh, 409);
    }

    const decisionDate = new Date();
    const finalAmount = round.revisedQuoteAmount ?? round.previousQuoteAmount;
    const accepted = decision === 'ACCEPTED';
    const rejected = decision === 'REJECTED';
    const newRoundStatus = accepted ? 'CONCLUDED' : rejected ? 'REJECTED' : round.status;
    const nextResponsibleParty = accepted ? 'BUYER' : rejected ? 'CLOSED' : 'BUYER';
    const senderName = ctx.userName || UI_STRINGS.appLoginPageConstants.buyer;
    let message: string;
    let statusLabel: string;

    if (accepted) {
      message = interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerAcceptedOfferMessage, {
        amount: finalAmount.toLocaleString(I18N_CONFIG.defaultLocale), vendorName: vendor.name,
      });
      statusLabel = UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.quoteAcceptedByBuyerPpoAwaited;
    } else if (rejected) {
      message = interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerRejectedOfferMessage, {
        vendorName: vendor.name, remarks: remarks || UI_STRINGS.common.none,
      });
      statusLabel = UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.quoteNotAcceptedNegotiationClosed;
    } else {
      message = interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerPendingFinalAcceptanceMessage, {
        vendorName: vendor.name,
      });
      statusLabel = UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.finalAcceptancePendingFromBuyer;
    }

    const auditId = crypto.randomUUID();
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerDecisionDecisionRecordedForNameOnRFQRfqNumberRemarksValue4,
      { decision, name: vendor.name, rfqNumber: rfq.rfqNumber, value4: remarks || UI_STRINGS.common.none },
    );
    const notificationPayload = accepted || rejected
      ? await notifyNextResponsibleParty({
        tenantId: ctx.tenantId,
        event: accepted ? 'COMMERCIAL_AWARD_APPROVED' : 'NEGOTIATION_CLOSED',
        recordNumber: rfq.rfqNumber,
        entityId: rfq.id,
        actorName: ctx.userName,
        details: { vendorName: vendor.name, decision, amount: finalAmount },
      }, { prepareOnly: true })
      : undefined;
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, decisionDate, auditId)
      : null;
    const batch: D1BatchInputStatement[] = [
      {
        sql: NEGOTIATION_BUYER_DECISION_UPDATE_SQL,
        values: [decision, decisionDate, remarks || null, newRoundStatus, nextResponsibleParty, decisionDate,
          round.id, ctx.tenantId, decision, ctx.tenantId, ctx.tenantId],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, rfq.projectId, 'NEGOTIATION', round.id,
          `BUYER_DECISION_${decision}`, auditDescription, JSON.stringify({ buyerDecision: currentDecision }),
          JSON.stringify({ decision, decisionDate, remarks: remarks || null }), null, null, decisionDate],
      },
    ];
    if (accepted) {
      batch.push({
        sql: QUOTE_ACCEPT_AFTER_AUDIT_SQL,
        values: [decisionDate, ctx.tenantId, rfq.id, vendor.id, ctx.tenantId, rfq.id, vendor.id, auditId, ctx.tenantId],
      });
    }
    if (accepted || rejected) {
      batch.push({
        sql: NEGOTIATION_CLOSE_AFTER_AUDIT_SQL,
        values: [decisionDate, decisionDate, round.negotiation.id, ctx.tenantId, auditId, ctx.tenantId],
      });
    }
    batch.push({
      sql: RFQ_MESSAGE_INSERT_AFTER_AUDIT_SQL,
      values: [crypto.randomUUID(), ctx.tenantId, rfq.id, ctx.userId, senderName, ctx.role, message, vendor.id,
        decisionDate, auditId, ctx.tenantId],
    });
    if (preparedNotification) batch.push(preparedNotification.statement);

    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1
      || (preparedNotification && Number(results[results.length - 1]?.meta?.changes || 0) !== 1)) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerDecisionConflictPleaseRefresh, 409);
    }

    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, decisionDate, {
        tenantId: ctx.tenantId, entityType: 'NEGOTIATION', entityId: round.id,
        route: '/api/procurement/negotiations/decision',
      });
    }

    const updatedRound = {
      ...round,
      buyerDecision: decision,
      buyerDecisionDate: decisionDate,
      buyerDecisionRemarks: remarks || null,
      status: newRoundStatus,
      nextResponsibleParty,
      updatedAt: decisionDate,
    };
    return apiSuccess({
      round: updatedRound,
      decision,
      statusLabel,
      message: interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerDecisionRecordedSuccessfullyDecision, { decision }),
    });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.negotiation_decision_failed', {
      operation: 'record_buyer_negotiation_decision', route: '/api/procurement/negotiations/decision',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, roundId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToRecordBuyerDecision, 500);
  }
}
