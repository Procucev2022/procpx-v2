// src/app/api/procurement/negotiations/submit-offer/route.ts
// Handles Vendor Revised Offer and Final Offer Submissions with line-item persistence
import { NextRequest } from 'next/server';
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { MAX_D1_BATCH_STATEMENTS, NEGOTIATION_ENSURE_ACTIVE_FOR_RFQ_SQL, NEGOTIATION_OFFER_AUDIT_INSERT_SQL, NEGOTIATION_OFFER_MESSAGE_INSERT_SQL, NEGOTIATION_OFFER_PARENT_UPDATE_SQL, NEGOTIATION_OFFER_QUOTE_INSERT_SQL, NEGOTIATION_OFFER_QUOTE_LINE_INSERT_AFTER_QUOTE_SQL, NEGOTIATION_OFFER_RFQ_UPDATE_SQL, NEGOTIATION_OFFER_ROUND_INSERT_SQL, NEGOTIATION_OFFER_ROUND_UPDATE_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { readByD1FilterChunks } from '@/lib/d1-query';


export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role === 'VENDOR') {
    if (!hasPermission(ctx.role, 'VENDOR_NEGOTIATE')) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.forbiddenInsufficientVendorNegotiationPermissions, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }
  } else {
    if (!hasPermission(ctx.role, 'NEGOTIATION_MANAGE')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }
  }

  const startedAt = Date.now();
  let requestRfqId: string | undefined;
  let requestVendorId: string | undefined;
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
    let {
      rfqId,
      vendorId,
      revisedQuoteAmount,
      counterOfferAmount,
      lineItems,
      isFinalOffer = false,
      notes,
      submittedByVendor,
      deadline,
    } = body as Record<string, any>;
    if ((counterOfferAmount !== undefined && !['number', 'string'].includes(typeof counterOfferAmount))
      || (revisedQuoteAmount !== undefined && !['number', 'string'].includes(typeof revisedQuoteAmount))
      || (lineItems !== undefined && !Array.isArray(lineItems))
      || (Array.isArray(lineItems) && lineItems.some((item) => !item || typeof item !== 'object' || Array.isArray(item)))
      || (isFinalOffer !== undefined && typeof isFinalOffer !== 'boolean')
      || (notes !== undefined && typeof notes !== 'string')
      || (submittedByVendor !== undefined && typeof submittedByVendor !== 'string')
      || (deadline !== undefined && deadline !== null && typeof deadline !== 'string')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    requestRfqId = typeof rfqId === 'string' ? rfqId : undefined;
    requestVendorId = typeof vendorId === 'string' ? vendorId : undefined;

    // Automatically resolve vendorId from authenticated session if VENDOR role
    if (ctx.role === 'VENDOR') {
      if (!ctx.vendorId) {
        return apiError(UI_STRINGS.common.forbiddenVendorRecordNotAssociatedWithThisUserAccount, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
      if (!vendorId) {
        vendorId = ctx.vendorId;
      } else if (vendorId !== ctx.vendorId) {
        return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.forbiddenYouCanOnlySubmitOffersForYourOwnVendorAccount, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
    }

    if (typeof rfqId !== 'string' || typeof vendorId !== 'string' || !rfqId || !vendorId) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.rFQIDAndVendorIDAreRequired, 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: {
        quotes: {
          where: { vendorId },
          orderBy: { quoteVersion: 'desc' },
          take: 1,
        },
      },
    });

    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });

    if (ctx.role === 'VENDOR') {
      const isInvited = await prisma.rfqVendor.findFirst({
        where: { rfqId, vendorId, tenantId: ctx.tenantId },
      });
      if (!isInvited) {
        return apiError(UI_STRINGS.common.forbiddenVendorIsNotInvitedToThisRFQ, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
    }

    if (!['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION'].includes(rfq.status)) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.rFQStatusStatusDoesNotPermitVendorQuotationOffers, { "status": rfq.status }), 400, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) return apiError(UI_STRINGS.common.vendorNotFound, 404, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });

    // Find or create negotiation record
    const negotiation = await prisma.negotiation.findFirst({
      where: { rfqId, tenantId: ctx.tenantId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'desc' },
        },
      },
    });

    if (negotiation && negotiation.status !== 'ACTIVE') {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    // Previous quote amount
    const latestQuote = rfq.quotes[0];
    const previousQuoteAmount = latestQuote ? latestQuote.totalQuoteAmount : 0;
    const negotiationRounds = negotiation?.rounds || [];
    const previousRound = negotiationRounds.find((r) => r.vendorId === vendorId) || negotiationRounds[0];
    const isBuyer = ctx.role !== 'VENDOR';

    const finalCounterAmount = isBuyer
      ? (counterOfferAmount !== undefined && counterOfferAmount !== null ? Number(counterOfferAmount) : Number(revisedQuoteAmount))
      : (previousRound?.counterOfferAmount || null);
    const finalRevised = isBuyer ? null : Number(revisedQuoteAmount);
    if ((isBuyer && (!Number.isFinite(finalCounterAmount) || Number(finalCounterAmount) < 0))
      || (!isBuyer && (finalRevised === null || !Number.isFinite(finalRevised) || finalRevised < 0))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const revisedQuoteTotal = finalRevised ?? 0;
    if (deadline && !Number.isFinite(new Date(deadline).getTime())) {
      return apiError(UI_STRINGS.common.invalidDate, 400);
    }

    // Check round limits
    const vendorRounds = negotiationRounds.filter((r) => r.vendorId === vendorId);
    const vendorBuyerOffers = vendorRounds.filter(
      (r) => r.counterOfferAmount !== null || (!r.revisedQuoteAmount && r.nextResponsibleParty === 'VENDOR')
    );

    if (isBuyer && vendorBuyerOffers.length >= 20) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.maximumLimitOf20BuyerCounteroffersReachedForThisVendor, 400, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }

    // Check vendor quote version limit
    let nextQuoteVersion = 1;
    if (!isBuyer) {
      const existingQuotes = await prisma.quote.findMany({
        where: { rfqId, vendorId },
        orderBy: { quoteVersion: 'desc' },
        take: 1,
      });
      nextQuoteVersion = existingQuotes.length > 0 ? existingQuotes[0].quoteVersion + 1 : 1;
      if (nextQuoteVersion > 20) {
        return apiError(UI_STRINGS.common.maximumLimitOf20QuoteVersionsReachedPerVendorForThisRFQ, 400, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
    }

    const roundNumber = isBuyer ? vendorBuyerOffers.length + 1 : (previousRound?.roundNumber || vendorRounds.length + 1);
    const savingsAmount = previousQuoteAmount > 0 && finalRevised && finalRevised > 0 ? previousQuoteAmount - finalRevised : 0;
    const savingsPercent = previousQuoteAmount > 0 && finalRevised && finalRevised > 0 ? (savingsAmount / previousQuoteAmount) * 100 : 0;

    const roundStatus = isBuyer ? 'ROUND_ACTIVE' : (isFinalOffer ? 'FINAL_OFFER_SUBMITTED' : 'REVISED_SUBMITTED');
    const buyerDecision = isBuyer ? null : (isFinalOffer ? 'PENDING_BUYER_DECISION' : null);
    const nextResponsibleParty = isBuyer ? 'VENDOR' : 'BUYER';

    const updatesActiveCounteroffer = Boolean(
      !isBuyer &&
      previousRound &&
      previousRound.vendorId === vendorId &&
      previousRound.counterOfferAmount &&
      (!previousRound.revisedQuoteAmount || previousRound.nextResponsibleParty === 'VENDOR')
    );
    let mergedLineItemsJson: string | null = lineItems ? JSON.stringify(lineItems) : null;
    if (updatesActiveCounteroffer) {
      // Respond directly to the active buyer counteroffer round
      mergedLineItemsJson = previousRound.lineItemsJson;
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        let prevItems: any[] = [];
        try {
          if (previousRound.lineItemsJson) {
            prevItems = typeof previousRound.lineItemsJson === 'string' ? JSON.parse(previousRound.lineItemsJson) : previousRound.lineItemsJson;
          }
        } catch (error) {
          await writeStructuredLog('warn', 'procurement.negotiation_line_items_invalid', {
            operation: 'submit_offer', route: '/api/procurement/negotiations/submit-offer',
            requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
            rfqId, vendorId, negotiationRoundId: previousRound.id,
            error: error instanceof Error ? { name: error.name } : { type: typeof error },
          });
        }
        const merged = lineItems.map((li: any) => {
          const prev = prevItems.find((p: any) => (p.rfqLineId || p.id) === (li.rfqLineId || li.id));
          return {
            rfqLineId: li.rfqLineId || li.id,
            description: li.description || prev?.description,
            uom: li.uom || prev?.uom,
            quantity: li.quantity || prev?.quantity || 1,
            counterRate: prev?.counterRate ?? null,
            revisedRate: Number(li.revisedRate ?? li.unitRate ?? 0),
            lineTotal: Number(li.lineTotal || (Number(li.revisedRate ?? li.unitRate ?? 0) * (li.quantity || prev?.quantity || 1))),
          };
        });
        mergedLineItemsJson = JSON.stringify(merged);
      }
    } else {
      // Prevent duplicate offers from repeated clicks or retries
      const recentDuplicate = negotiationRounds.find(
        (r) =>
          r.vendorId === vendorId &&
          ((finalCounterAmount && r.counterOfferAmount === finalCounterAmount) ||
            (finalRevised && r.revisedQuoteAmount === finalRevised)) &&
          new Date().getTime() - new Date(r.createdAt).getTime() < 4000
      );
      if (recentDuplicate) {
        return apiSuccess({ round: recentDuplicate, message: UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.offerAlreadyRecorded });
      }
    }

    const quoteLineItems = !isBuyer && finalRevised && Array.isArray(lineItems) ? lineItems : [];
    if (quoteLineItems.length > MAX_D1_BATCH_STATEMENTS - 8) {
      return apiError(interpolateUiString(UI_STRINGS.common.prExceedsAtomicWriteLimitMaxLines, {
        maxLines: MAX_D1_BATCH_STATEMENTS - 8,
      }), 400);
    }

    if (quoteLineItems.length > 0) {
      const rfqLineIds = quoteLineItems.map((item: any) => item.rfqLineId || item.id);
      if (rfqLineIds.some((id: unknown) => typeof id !== 'string') || new Set(rfqLineIds).size !== rfqLineIds.length) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      const invalidLineAmounts = quoteLineItems.some((item: any) => {
        const unitRate = Number(item.revisedRate || item.unitRate || 0);
        const quantity = Number(item.quantity || 1);
        const lineTotal = Number(item.lineTotal || (unitRate * quantity));
        return !Number.isFinite(unitRate) || unitRate < 0 || !Number.isFinite(quantity) || quantity < 0
          || !Number.isFinite(lineTotal) || lineTotal < 0;
      });
      if (invalidLineAmounts) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      const rfqLines = await readByD1FilterChunks(rfqLineIds, (chunk) => prisma.rfqLine.findMany({
        where: { tenantId: ctx.tenantId, rfqId, id: { in: chunk } },
        select: { id: true },
      }));
      if (rfqLines.length !== rfqLineIds.length) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
    }

    const createdAt = new Date().toISOString();
    const roundId = updatesActiveCounteroffer ? previousRound.id : crypto.randomUUID();
    const requiresQuoteSlot = !isBuyer && Boolean(finalRevised);
    const action = isBuyer ? 'BUYER_COUNTEROFFER_SUBMITTED' : (isFinalOffer ? 'FINAL_OFFER_SUBMITTED' : 'REVISED_OFFER_SUBMITTED');
    const formattedAmount = Intl.NumberFormat(I18N_CONFIG.defaultLocale).format(isBuyer ? Number(finalCounterAmount || 0) : Number(finalRevised || 0));
    const description = isBuyer
      ? interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.buyerCounterofferAmountDispatchedToVendorForRFQ, {
        amount: formattedAmount, vendorName: vendor.name, rfqNumber: rfq.rfqNumber,
      })
      : interpolateUiString(isFinalOffer
        ? UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.finalOfferSubmittedByVendorForRFQ
        : UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.revisedOfferSubmittedByVendorForRFQ, {
        amount: formattedAmount, vendorName: vendor.name, rfqNumber: rfq.rfqNumber,
      });
    const message = isBuyer
      ? `[BUYER COUNTEROFFER] Buyer submitted counteroffer of ₹ ${(finalCounterAmount || 0).toLocaleString()} (Round ${roundNumber}) to ${vendor.name}. ${notes || ''}`
      : isFinalOffer
      ? `[FINAL OFFER SUBMITTED] Vendor ${vendor.name} submitted their binding final offer of ₹ ${finalRevised?.toLocaleString()} (Round ${roundNumber}). Awaiting Buyer Decision.`
      : `[REVISED OFFER] Vendor ${vendor.name} submitted revised quote of ₹ ${finalRevised?.toLocaleString()} (Round ${roundNumber}).`;
    const senderName = isBuyer ? (ctx.userName || UI_STRINGS.common.categoryManager) : (submittedByVendor || vendor.name);
    const roundData = {
      tenantId: ctx.tenantId,
      negotiationId: negotiation?.id,
      vendorId,
      roundNumber,
      deadline: deadline ? new Date(deadline) : previousRound?.deadline || null,
      targetPrice: previousRound?.targetPrice || null,
      previousQuoteAmount,
      counterOfferAmount: finalCounterAmount,
      revisedQuoteAmount: finalRevised,
      savingsAmount: Math.max(0, savingsAmount),
      savingsPercent: Math.round(savingsPercent * 100) / 100,
      status: roundStatus,
      notes: notes || (isBuyer ? 'Buyer commercial counteroffer dispatched' : (isFinalOffer ? 'Submitted by vendor as binding final offer' : 'Vendor revised offer submitted')),
      isFinalOffer: isBuyer ? false : Boolean(isFinalOffer),
      buyerDecision,
      nextResponsibleParty: updatesActiveCounteroffer ? 'BUYER' : nextResponsibleParty,
      lineItemsJson: mergedLineItemsJson,
      submittedByVendor: isBuyer ? null : (submittedByVendor || vendor.name),
      createdAt: updatesActiveCounteroffer ? previousRound.createdAt : createdAt,
      updatedAt: createdAt,
      vendor,
    };

    const batch: Array<{ sql: string; values: unknown[] }> = [{
      sql: NEGOTIATION_ENSURE_ACTIVE_FOR_RFQ_SQL,
      values: [crypto.randomUUID(), ctx.tenantId, rfqId, createdAt, createdAt, rfqId, ctx.tenantId],
    }];
    const roundStatementIndex = batch.length;
    if (updatesActiveCounteroffer) {
      batch.push({
        sql: NEGOTIATION_OFFER_ROUND_UPDATE_SQL,
        values: [
          finalRevised, Math.max(0, savingsAmount), Math.round(savingsPercent * 100) / 100, roundStatus,
          roundData.notes, roundData.isFinalOffer ? 1 : 0, buyerDecision, 'BUYER', mergedLineItemsJson,
          roundData.submittedByVendor, createdAt, previousRound.id, ctx.tenantId, vendorId,
          ctx.tenantId, rfqId, previousRound.counterOfferAmount, previousRound.revisedQuoteAmount ?? null,
          rfqId, ctx.tenantId, requiresQuoteSlot ? 1 : 0, ctx.tenantId, rfqId, vendorId,
        ],
      });
    } else {
      batch.push({
        sql: NEGOTIATION_OFFER_ROUND_INSERT_SQL,
        values: [
          roundId, ctx.tenantId, ctx.tenantId, rfqId, vendorId, roundNumber,
          roundData.deadline instanceof Date ? roundData.deadline.toISOString() : roundData.deadline,
          roundData.targetPrice, previousQuoteAmount, finalCounterAmount, finalRevised,
          Math.max(0, savingsAmount), Math.round(savingsPercent * 100) / 100, roundStatus, roundData.notes,
          roundData.isFinalOffer ? 1 : 0, buyerDecision, nextResponsibleParty,
          lineItems ? JSON.stringify(lineItems) : null, roundData.submittedByVendor, createdAt, createdAt,
          ctx.tenantId, rfqId, rfqId, ctx.tenantId,
          requiresQuoteSlot ? 1 : 0, ctx.tenantId, rfqId, vendorId,
        ],
      });
    }

    let quoteStatementIndex: number | undefined;
    let quoteId: string | undefined;
    if (requiresQuoteSlot) {
      quoteId = crypto.randomUUID();
      quoteStatementIndex = batch.length;
      batch.push({
        sql: NEGOTIATION_OFFER_QUOTE_INSERT_SQL,
        values: [
          quoteId, ctx.tenantId, rfqId, vendorId, rfq.rfqNumber,
          ctx.tenantId, rfqId, vendorId, ctx.tenantId, rfqId, vendorId,
          revisedQuoteTotal / 1.18, revisedQuoteTotal - (revisedQuoteTotal / 1.18), revisedQuoteTotal,
          createdAt, submittedByVendor || vendor.name, createdAt, createdAt,
          ctx.tenantId, rfqId, vendorId, rfqId, ctx.tenantId,
        ],
      });
      for (const item of quoteLineItems) {
        const rfqLineId = item.rfqLineId || item.id;
        const unitRate = Number(item.revisedRate || item.unitRate || 0);
        const quantity = item.quantity || 1;
        batch.push({
          sql: NEGOTIATION_OFFER_QUOTE_LINE_INSERT_AFTER_QUOTE_SQL,
          values: [
            crypto.randomUUID(), ctx.tenantId, quoteId, rfqLineId, unitRate,
            Number(item.lineTotal || (unitRate * quantity)), item.remarks || null,
          ],
        });
      }
    }

    batch.push({
      sql: NEGOTIATION_OFFER_PARENT_UPDATE_SQL,
      values: [Math.max(negotiation?.currentRound || 1, roundNumber), finalRevised || finalCounterAmount || previousQuoteAmount, createdAt, ctx.tenantId, rfqId],
    });
    batch.push({ sql: NEGOTIATION_OFFER_RFQ_UPDATE_SQL, values: [createdAt, rfqId, ctx.tenantId] });
    batch.push({
      sql: NEGOTIATION_OFFER_MESSAGE_INSERT_SQL,
      values: [crypto.randomUUID(), ctx.tenantId, rfqId, ctx.userId, senderName, isBuyer ? ctx.role : 'VENDOR', message, isBuyer ? 0 : 1, vendor.id, createdAt],
    });
    const notificationPayload = isBuyer
      ? await notifyNextResponsibleParty({
        tenantId: ctx.tenantId, event: 'COUNTER_OFFER_SENT', recordNumber: rfq.rfqNumber,
        entityId: rfq.id, details: { vendorName: vendor.name, amount: finalCounterAmount || undefined, roundNumber },
      }, { prepareOnly: true })
      : await notifyNextResponsibleParty({
        tenantId: ctx.tenantId, event: 'REVISED_QUOTE_RECEIVED', recordNumber: rfq.rfqNumber,
        entityId: rfq.id, details: { vendorName: vendor.name, amount: finalRevised || 0, roundNumber, isFinalOffer },
      }, { prepareOnly: true });
    const auditId = crypto.randomUUID();
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, new Date(createdAt), auditId)
      : null;

    batch.push({
      sql: NEGOTIATION_OFFER_AUDIT_INSERT_SQL,
      values: [
        auditId, ctx.tenantId, ctx.userId, rfq.projectId, roundId, action, description,
        JSON.stringify({ roundNumber, isFinalOffer, counterOfferAmount: finalCounterAmount,
          revisedQuoteAmount: finalRevised, savingsAmount, savingsPercent }), createdAt,
      ],
    });
    if (preparedNotification) batch.push(preparedNotification.statement);

    const results = await writeD1BatchAtomically(batch);
    const ensuredNegotiationId = results[0]?.results?.[0]?.id;
    if (typeof ensuredNegotiationId !== 'string' || Number(results[roundStatementIndex]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    if (quoteStatementIndex !== undefined && Number(results[quoteStatementIndex]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    if (preparedNotification && Number(results[results.length - 1]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const round = { ...roundData, id: roundId, negotiationId: ensuredNegotiationId };

    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, new Date(createdAt), {
        tenantId: ctx.tenantId, entityType: 'NEGOTIATION', entityId: roundId,
        route: '/api/procurement/negotiations/submit-offer',
      });
    }

    return apiSuccess({
      round,
      message: isBuyer
        ? `Counteroffer of ₹ ${(finalCounterAmount || 0).toLocaleString()} dispatched to ${vendor.name} successfully.`
        : isFinalOffer
        ? `Final offer of ₹ ${finalRevised?.toLocaleString()} submitted successfully. Pending Buyer Decision.`
        : `Revised offer of ₹ ${finalRevised?.toLocaleString()} submitted successfully.`,
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'procurement.negotiation_offer_submission_failed', {
      operation: 'submit_offer',
      route: '/api/procurement/negotiations/submit-offer',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      rfqId: requestRfqId,
      vendorId: requestVendorId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitNegotiationOffer, 500);
  }
}
