// app/api/procurement/negotiations/route.ts
// Handles Negotiation Rounds and Counter-Offers across RFQs
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_SQL,
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  NEGOTIATION_INSERT_IF_ABSENT_SQL,
  NEGOTIATION_ROUND_INSERT_SQL,
  NEGOTIATION_ROUND_SUPERSEDE_SQL,
  NEGOTIATION_UPDATE_AFTER_ROUND_SQL,
  RFQ_MARK_NEGOTIATION_SQL,
  RFQ_MESSAGE_INSERT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { getListPageWindow } from '@/lib/api-utils';
import { readByD1FilterChunks } from '@/lib/d1-query';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import type {
  NegotiationDispatchLatestQuoteRow,
  NegotiationDispatchRoundSummaryRow,
} from '@app-types/app/api/procurement/negotiations.types';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('NEGOTIATION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  const startedAt = Date.now();

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;

    const [total, statusGroups, negotiations] = await Promise.all([
      prisma.negotiation.count({ where }),
      prisma.negotiation.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.negotiation.findMany({
        where,
        include: {
          rfq: {
            include: {
              project: { select: { id: true, name: true, projectCode: true } },
              boqRevision: { select: { id: true, revisionCode: true } },
            },
          },
          _count: { select: { rounds: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    const statusCounts = Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all]));
    return apiSuccess({ negotiations, total, statusCounts, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.negotiations_read_failed', {
      operation: 'read_negotiations', route: '/api/procurement/negotiations',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      rfqId, page, pageSize, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchNegotiations, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('NEGOTIATION_MANAGE');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  const requestId = req.headers?.get('x-request-id') || undefined;
  let failedRfqId: string | undefined;

  try {
    const body = await req.json();
    const {
      rfqId,
      vendorId,
      vendorIds,
      bulkAllEligible,
      targetPrice,
      counterOfferAmount,
      revisedQuoteAmount,
      deadline,
      notes,
      lineItemsJson,
      nextResponsibleParty,
      allowSupersede = false,
    } = body;

    const isBulkRequest = Boolean(
      (Array.isArray(vendorIds) && vendorIds.length > 0) || bulkAllEligible,
    );

    if (!rfqId) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsRoute.rFQIDIsRequired, 400, { route: '/api/procurement/negotiations', method: 'POST' });
    }
    if (!isBulkRequest && (typeof vendorId !== 'string' || vendorId.trim().length === 0)) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsRoute.vendorIDIsRequiredForSingleCounterofferDispatch, 400, { route: '/api/procurement/negotiations', method: 'POST' });
    }
    failedRfqId = rfqId;

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: {
        invitedVendors: { select: { vendorId: true } },
      },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/negotiations', method: 'POST' });
    }

    const requestedTargetList: unknown[] = isBulkRequest
      ? Array.isArray(vendorIds) && vendorIds.length > 0
        ? vendorIds
        : rfq.invitedVendors.map((iv) => iv.vendorId)
      : [vendorId];
    const validTargetIds = requestedTargetList.filter(
      (targetVendorId): targetVendorId is string => typeof targetVendorId === 'string' && targetVendorId.trim().length > 0,
    );
    const targetList = Array.from(new Set(validTargetIds));
    const invalidTargetCount = requestedTargetList.length - validTargetIds.length;
    const duplicateTargetCount = validTargetIds.length - targetList.length;
    if (invalidTargetCount > 0 || duplicateTargetCount > 0) {
      await writeStructuredLog('warn', 'procurement.negotiation_targets_normalized', {
        operation: 'normalize_dispatch_targets',
        route: '/api/procurement/negotiations',
        requestId,
        tenantId: ctx.tenantId,
        rfqId,
        requestedTargetCount: requestedTargetList.length,
        targetCount: targetList.length,
        invalidTargetCount,
        duplicateTargetCount,
      });
    }
    if (targetList.length === 0) {
      await writeStructuredLog('warn', 'procurement.negotiation_dispatch_rejected', {
        operation: 'dispatch_negotiation_offers',
        route: '/api/procurement/negotiations',
        requestId,
        tenantId: ctx.tenantId,
        rfqId,
        reason: 'no_valid_vendor_targets',
        requestedTargetCount: requestedTargetList.length,
        invalidTargetCount,
        duplicateTargetCount,
      });
      return apiError(UI_STRINGS.appApiProcurementNegotiationsRoute.vendorIDIsRequiredForSingleCounterofferDispatch, 400, { route: '/api/procurement/negotiations', method: 'POST' });
    }

    const permittedStatuses = ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION'];
    if (!permittedStatuses.includes(rfq.status)) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsRoute.rFQIsInStatusStatusAndDoesNotPermitCommercialNegotiationOffers, { "status": rfq.status }), 400, { route: '/api/procurement/negotiations', method: 'POST' });
    }

    if (counterOfferAmount !== undefined && counterOfferAmount !== null) {
      const numAmt = Number(counterOfferAmount);
      if (isNaN(numAmt) || numAmt <= 0) {
        return apiError(UI_STRINGS.appApiProcurementNegotiationsRoute.counterofferAmountMustBeAPositiveNumber, 400, { route: '/api/procurement/negotiations', method: 'POST' });
      }
    }

    // Find or create negotiation container for this RFQ
    let negotiation = await prisma.negotiation.findFirst({
      where: { rfqId, tenantId: ctx.tenantId },
      select: { id: true, status: true, currentRound: true },
    });

    if (negotiation && (negotiation.status === 'CONCLUDED' || negotiation.status === 'CANCELLED')) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsRoute.negotiationForRFQRfqNumberIsAlreadyToLowerCaseAndLockedAgainstFurtherOffers, { "rfqNumber": rfq.rfqNumber, "toLowerCase": negotiation.status.toLowerCase() }), 400, { route: '/api/procurement/negotiations', method: 'POST' });
    }

    if (!negotiation) {
      const negotiationId = crypto.randomUUID();
      const now = new Date();
      const auditId = crypto.randomUUID();
      const description = interpolateUiString(
        UI_STRINGS.appApiProcurementNegotiationsRoute.startedNegotiationProcessForRFQRfqNumber,
        { rfqNumber: rfq.rfqNumber },
      );
      await writeD1BatchAtomically([
        {
          sql: NEGOTIATION_INSERT_IF_ABSENT_SQL,
          values: [negotiationId, ctx.tenantId, rfqId, now, now, rfqId, ctx.tenantId, ctx.tenantId, rfqId],
        },
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [auditId, ctx.tenantId, ctx.userId, rfq.projectId, 'NEGOTIATION', negotiationId,
            'NEGOTIATION_CREATED', description, null, JSON.stringify({ rfqId, status: 'ACTIVE' }), null, null, now],
        },
      ]);
      negotiation = await prisma.negotiation.findFirst({
        where: { rfqId, tenantId: ctx.tenantId },
        select: { id: true, status: true, currentRound: true },
      });
      if (!negotiation) throw new Error();
    }

    const currentTenantId = ctx.tenantId;
    const currentUserId = ctx.userId;
    const currentUserName = ctx.userName || 'Category Manager';
    const currentUserRole = ctx.role;
    const currentRfq: any = rfq;
    const currentNegotiation: any = negotiation;
    const requestedCounterOfferAmount = counterOfferAmount ? Number(counterOfferAmount) : null;
    const requestedRevisedQuoteAmount = revisedQuoteAmount ? Number(revisedQuoteAmount) : null;
    const duplicateWindowStart = new Date(Date.now() - 4_000);
    const [latestQuoteRows, roundSummaryRows] = await Promise.all([
      readByD1FilterChunks(targetList, (vendorIdChunk) => prisma.$queryRaw<NegotiationDispatchLatestQuoteRow[]>(Prisma.sql`
        WITH latest_vendor_quotes AS (
          SELECT quote."tenantId", quote."rfqId", quote."vendorId", MAX(quote."quoteVersion") AS "latestVersion"
          FROM "quotes" AS quote
          WHERE quote."tenantId" = ${currentTenantId} AND quote."rfqId" = ${rfqId}
            AND quote."vendorId" IN (${Prisma.join(vendorIdChunk)})
          GROUP BY quote."tenantId", quote."rfqId", quote."vendorId"
        )
        SELECT quote."vendorId", quote."quoteVersion", quote."totalQuoteAmount"
        FROM latest_vendor_quotes AS latest
        INNER JOIN "quotes" AS quote
          ON quote."tenantId" = latest."tenantId" AND quote."rfqId" = latest."rfqId"
            AND quote."vendorId" = latest."vendorId" AND quote."quoteVersion" = latest."latestVersion"
      `),
      ),
      readByD1FilterChunks(targetList, (vendorIdChunk) => prisma.$queryRaw<NegotiationDispatchRoundSummaryRow[]>(Prisma.sql`
        WITH vendor_round_stats AS (
          SELECT rounds."tenantId", rounds."negotiationId", rounds."vendorId",
            MAX(rounds."roundNumber") AS "latestRoundNumber",
            SUM(CASE WHEN rounds."status" <> 'SUPERSEDED' AND (
              rounds."counterOfferAmount" IS NOT NULL OR
              ((rounds."revisedQuoteAmount" IS NULL OR rounds."revisedQuoteAmount" = 0)
                AND rounds."nextResponsibleParty" = 'VENDOR')
            ) THEN 1 ELSE 0 END) AS "activeBuyerOfferCount",
            MAX(CASE WHEN rounds."status" <> 'SUPERSEDED' AND rounds."counterOfferAmount" IS NOT NULL
              AND rounds."counterOfferAmount" <> 0
              AND ((rounds."revisedQuoteAmount" IS NULL OR rounds."revisedQuoteAmount" = 0)
                OR rounds."nextResponsibleParty" = 'VENDOR')
              THEN rounds."roundNumber" END) AS "pendingRoundNumber",
            MAX(CASE WHEN rounds."status" <> 'SUPERSEDED'
              AND ((${requestedCounterOfferAmount} IS NOT NULL AND rounds."counterOfferAmount" = ${requestedCounterOfferAmount})
                OR (${requestedRevisedQuoteAmount} IS NOT NULL AND rounds."revisedQuoteAmount" = ${requestedRevisedQuoteAmount}))
              AND julianday(rounds."createdAt") >= julianday(${duplicateWindowStart.toISOString()})
              THEN rounds."roundNumber" END) AS "duplicateRoundNumber"
          FROM "negotiation_rounds" AS rounds
          WHERE rounds."tenantId" = ${currentTenantId} AND rounds."negotiationId" = ${currentNegotiation.id}
            AND rounds."vendorId" IN (${Prisma.join(vendorIdChunk)})
          GROUP BY rounds."tenantId", rounds."negotiationId", rounds."vendorId"
        )
        SELECT stats."vendorId", stats."latestRoundNumber", stats."activeBuyerOfferCount",
          pending."id" AS "pendingRoundId", stats."pendingRoundNumber",
          pending."counterOfferAmount" AS "pendingCounterOfferAmount", pending."notes" AS "pendingNotes",
          duplicate."id" AS "duplicateRoundId", stats."duplicateRoundNumber",
          duplicate."deadline" AS "duplicateDeadline", duplicate."targetPrice" AS "duplicateTargetPrice",
          duplicate."previousQuoteAmount" AS "duplicatePreviousQuoteAmount",
          duplicate."counterOfferAmount" AS "duplicateCounterOfferAmount",
          duplicate."revisedQuoteAmount" AS "duplicateRevisedQuoteAmount",
          duplicate."savingsAmount" AS "duplicateSavingsAmount", duplicate."savingsPercent" AS "duplicateSavingsPercent",
          duplicate."status" AS "duplicateStatus", duplicate."notes" AS "duplicateNotes",
          duplicate."isFinalOffer" AS "duplicateIsFinalOffer", duplicate."buyerDecision" AS "duplicateBuyerDecision",
          duplicate."buyerDecisionDate" AS "duplicateBuyerDecisionDate",
          duplicate."buyerDecisionRemarks" AS "duplicateBuyerDecisionRemarks",
          duplicate."nextResponsibleParty" AS "duplicateNextResponsibleParty",
          duplicate."lineItemsJson" AS "duplicateLineItemsJson",
          duplicate."submittedByVendor" AS "duplicateSubmittedByVendor",
          duplicate."createdAt" AS "duplicateCreatedAt", duplicate."updatedAt" AS "duplicateUpdatedAt"
        FROM vendor_round_stats AS stats
        LEFT JOIN "negotiation_rounds" AS pending
          ON pending."tenantId" = stats."tenantId" AND pending."negotiationId" = stats."negotiationId"
            AND pending."vendorId" = stats."vendorId" AND pending."roundNumber" = stats."pendingRoundNumber"
            AND pending."status" <> 'SUPERSEDED'
        LEFT JOIN "negotiation_rounds" AS duplicate
          ON duplicate."tenantId" = stats."tenantId" AND duplicate."negotiationId" = stats."negotiationId"
            AND duplicate."vendorId" = stats."vendorId" AND duplicate."roundNumber" = stats."duplicateRoundNumber"
            AND duplicate."status" <> 'SUPERSEDED'
      `),
      ),
    ]);
    const latestQuoteByVendor = new Map(latestQuoteRows.map((quote) => [quote.vendorId, quote]));
    const roundSummaryByVendor = new Map(roundSummaryRows.map((summary) => [summary.vendorId, summary]));
    const vendorById = new Map<string, { id: string; name: string }>();

    async function loadDispatchVendors(vendorIdsToLoad: string[]) {
      const vendors = await readByD1FilterChunks(vendorIdsToLoad, (vendorIdChunk) => prisma.vendor.findMany({
        where: { tenantId: currentTenantId, id: { in: vendorIdChunk } },
        select: { id: true, name: true },
      }));
      for (const vendor of vendors) vendorById.set(vendor.id, vendor);
    }

    // Internal helper to dispatch an offer to a single vendor
    async function dispatchToVendor(targetVendorId: string) {
      const vendor = vendorById.get(targetVendorId);
      if (!vendor) {
        return { success: false, vendorId: targetVendorId, vendorName: 'Unknown', reason: 'Vendor not found' };
      }

      const isInvited = currentRfq.invitedVendors?.find((iv: any) => iv.vendorId === targetVendorId);
      if (!isInvited) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          reason: `Vendor ${vendor.name} is not invited to RFQ ${currentRfq.rfqNumber}`,
        };
      }

      const latestQuote = latestQuoteByVendor.get(targetVendorId);
      if (!latestQuote) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          reason: `Vendor ${vendor.name} has not submitted an initial quotation (Quote 1) yet.`,
        };
      }

      const previousQuoteAmount = latestQuote.totalQuoteAmount;

      const roundSummary = roundSummaryByVendor.get(targetVendorId);
      const activeBuyerOfferCount = Number(roundSummary?.activeBuyerOfferCount || 0);

      // Rule: Category Managers may submit a maximum of 4 active buyer counteroffers per vendor per RFQ
      if (activeBuyerOfferCount >= 4) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          reason: `Maximum limit of 4 buyer counteroffers already reached for ${vendor.name}.`,
        };
      }

      // Check for pending round awaiting vendor response
      const activePendingRound = roundSummary?.pendingRoundId ? {
        id: roundSummary.pendingRoundId,
        roundNumber: roundSummary.pendingRoundNumber,
        counterOfferAmount: roundSummary.pendingCounterOfferAmount,
        notes: roundSummary.pendingNotes,
      } : null;

      if (activePendingRound && !revisedQuoteAmount && !allowSupersede) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          requiresSupersedeConfirm: true,
          pendingRoundNumber: activePendingRound.roundNumber,
          pendingAmount: activePendingRound.counterOfferAmount,
          reason: `Round ${activePendingRound.roundNumber} counteroffer is currently pending vendor response. Confirm superseding offer to replace it.`,
        };
      }

      // Active offer count enforces the cap; the historical maximum keeps round IDs sequential after superseding.
      const roundNumber = (Number(roundSummary?.latestRoundNumber) || 0) + 1;
      const finalRevised = revisedQuoteAmount ? Number(revisedQuoteAmount) : null;
      const targetCounter = counterOfferAmount ? Number(counterOfferAmount) : null;
      const savingsAmount = finalRevised
        ? previousQuoteAmount - finalRevised
        : targetCounter
        ? previousQuoteAmount - targetCounter
        : 0;
      const savingsPercent = previousQuoteAmount > 0 ? (savingsAmount / previousQuoteAmount) * 100 : 0;

      // Prevent duplicate offers from repeated clicks or rapid retries within 4s window
      const recentDuplicate = roundSummary?.duplicateRoundId ? {
        id: roundSummary.duplicateRoundId,
        tenantId: currentTenantId,
        negotiationId: currentNegotiation.id,
        vendorId: targetVendorId,
        roundNumber: roundSummary.duplicateRoundNumber,
        deadline: roundSummary.duplicateDeadline,
        targetPrice: roundSummary.duplicateTargetPrice,
        previousQuoteAmount: roundSummary.duplicatePreviousQuoteAmount,
        counterOfferAmount: roundSummary.duplicateCounterOfferAmount,
        revisedQuoteAmount: roundSummary.duplicateRevisedQuoteAmount,
        savingsAmount: roundSummary.duplicateSavingsAmount,
        savingsPercent: roundSummary.duplicateSavingsPercent,
        status: roundSummary.duplicateStatus,
        notes: roundSummary.duplicateNotes,
        isFinalOffer: Boolean(roundSummary.duplicateIsFinalOffer),
        buyerDecision: roundSummary.duplicateBuyerDecision,
        buyerDecisionDate: roundSummary.duplicateBuyerDecisionDate,
        buyerDecisionRemarks: roundSummary.duplicateBuyerDecisionRemarks,
        nextResponsibleParty: roundSummary.duplicateNextResponsibleParty,
        lineItemsJson: roundSummary.duplicateLineItemsJson,
        submittedByVendor: roundSummary.duplicateSubmittedByVendor,
        createdAt: roundSummary.duplicateCreatedAt,
        updatedAt: roundSummary.duplicateUpdatedAt,
        vendor,
      } : null;
      if (recentDuplicate) {
        return {
          success: true,
          isDuplicate: true,
          round: recentDuplicate,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          roundNumber: recentDuplicate.roundNumber,
          counterOfferAmount: recentDuplicate.counterOfferAmount,
        };
      }

      const now = new Date();
      const roundId = crypto.randomUUID();
      const roundNotes = notes || (activePendingRound && allowSupersede
        ? `Superseding counteroffer (Round ${roundNumber}) replacing previous pending offer.`
        : null);
      const serializedLineItems = lineItemsJson
        ? (typeof lineItemsJson === 'string' ? lineItemsJson : JSON.stringify(lineItemsJson))
        : null;
      const resolvedNextParty = nextResponsibleParty || (finalRevised ? 'BUYER' : 'VENDOR');
      const roundStatus = finalRevised ? 'REVISED_SUBMITTED' : 'ROUND_ACTIVE';
      const round = {
        id: roundId,
        tenantId: currentTenantId,
        negotiationId: currentNegotiation.id,
        vendorId: targetVendorId,
        roundNumber,
        deadline: deadline ? new Date(deadline) : null,
        targetPrice: targetPrice ? Number(targetPrice) : null,
        previousQuoteAmount,
        counterOfferAmount: targetCounter,
        revisedQuoteAmount: finalRevised,
        savingsAmount,
        savingsPercent: Math.round(savingsPercent * 100) / 100,
        status: roundStatus,
        notes: roundNotes,
        isFinalOffer: false,
        buyerDecision: null,
        buyerDecisionDate: null,
        buyerDecisionRemarks: null,
        nextResponsibleParty: resolvedNextParty,
        lineItemsJson: serializedLineItems,
        submittedByVendor: null,
        createdAt: now,
        updatedAt: now,
        vendor,
      };
      const isSuperseding = Boolean(activePendingRound && allowSupersede);
      const auditDescription = isSuperseding
        ? `Superseding Round ${roundNumber} counteroffer issued to ${vendor.name} for RFQ ${currentRfq.rfqNumber}. Previous Round ${activePendingRound?.roundNumber} marked SUPERSEDED.`
        : `Round ${roundNumber} initiated with ${vendor.name} for RFQ ${currentRfq.rfqNumber}. Previous: ₹ ${previousQuoteAmount.toLocaleString()}, Target/Counter: ₹ ${(targetCounter || targetPrice || 0).toLocaleString()}`;
      const rfqTimelineMessage = finalRevised
        ? `[REVISED QUOTE RECORDED] Recorded vendor revised quote of ₹ ${finalRevised.toLocaleString()} (Round ${roundNumber}) for ${vendor.name}.`
        : isSuperseding
        ? `[SUPERSEDING COUNTEROFFER] Buyer issued superseding counteroffer of ₹ ${(targetCounter || targetPrice || 0).toLocaleString()} (Round ${roundNumber}) to ${vendor.name}, replacing pending Round ${activePendingRound?.roundNumber}.`
        : `[BUYER COUNTEROFFER] Buyer submitted counteroffer of ₹ ${(targetCounter || targetPrice || 0).toLocaleString()} (Round ${roundNumber}) to ${vendor.name}. ${notes || ''}`;
      const auditId = crypto.randomUUID();
      const notificationPayload = finalRevised
        ? await notifyNextResponsibleParty({
          tenantId: currentTenantId, event: 'REVISED_QUOTE_RECEIVED', recordNumber: currentRfq.rfqNumber,
          entityId: currentRfq.id, details: { vendorName: vendor.name, amount: finalRevised, roundNumber },
        }, { prepareOnly: true })
        : await notifyNextResponsibleParty({
          tenantId: currentTenantId, event: 'COUNTER_OFFER_SENT', recordNumber: currentRfq.rfqNumber,
          entityId: currentRfq.id, details: { vendorName: vendor.name, amount: targetCounter ? Number(targetCounter) : undefined, roundNumber },
        }, { prepareOnly: true });
      const preparedNotification = notificationPayload
        ? prepareNotificationOutbox(notificationPayload, now, auditId)
        : null;
      const batchStatements: D1BatchInputStatement[] = [];

      if (isSuperseding && activePendingRound) {
        batchStatements.push({
          sql: NEGOTIATION_ROUND_SUPERSEDE_SQL,
          values: [
            `${activePendingRound.notes ? `${activePendingRound.notes} ` : ''}[Superseded by Buyer Offer Round ${roundNumber}]`,
            now.toISOString(), activePendingRound.id, currentTenantId,
          ],
        });
      }
      batchStatements.push(
        {
          sql: NEGOTIATION_ROUND_INSERT_SQL,
          values: [
            round.id, round.tenantId, round.negotiationId, round.vendorId, round.roundNumber,
            round.deadline?.toISOString() || null, round.targetPrice, round.previousQuoteAmount,
            round.counterOfferAmount, round.revisedQuoteAmount, round.savingsAmount,
            round.savingsPercent, round.status, round.notes, round.nextResponsibleParty,
            round.lineItemsJson, now.toISOString(), now.toISOString(),
          ],
        },
        {
          sql: NEGOTIATION_UPDATE_AFTER_ROUND_SQL,
          values: [Math.max(Number(currentNegotiation.currentRound) || 0, roundNumber), now.toISOString(), currentNegotiation.id, currentTenantId],
        },
      );
      if (currentRfq.status !== 'NEGOTIATION') {
        batchStatements.push({
          sql: RFQ_MARK_NEGOTIATION_SQL,
          values: [now.toISOString(), rfqId, currentTenantId],
        });
      }
      batchStatements.push(
        {
          sql: AUDIT_LOG_INSERT_SQL,
          values: [
            auditId, currentTenantId, currentUserId, currentRfq.projectId, 'NEGOTIATION', round.id,
            isSuperseding ? 'SUPERSEDING_COUNTEROFFER_ISSUED' : 'NEGOTIATION_ROUND_CREATED',
            auditDescription, null, JSON.stringify({
              roundNumber,
              vendorId: targetVendorId,
              previousQuoteAmount,
              counterOfferAmount: targetCounter,
              revisedQuoteAmount: finalRevised,
              supersededRoundId: isSuperseding ? activePendingRound?.id : null,
            }), null, null, now.toISOString(),
          ],
        },
        {
          sql: RFQ_MESSAGE_INSERT_SQL,
          values: [
            crypto.randomUUID(), currentTenantId, rfqId, currentUserId, currentUserName, currentUserRole,
            rfqTimelineMessage, null, Boolean(finalRevised), vendor.id, now.toISOString(),
          ],
        },
      );
      if (preparedNotification) batchStatements.push(preparedNotification.statement);
      const writeResults = await writeD1BatchAtomically(batchStatements);
      if (preparedNotification && Number(writeResults[writeResults.length - 1]?.meta?.changes || 0) !== 1) {
        throw new Error();
      }

      if (preparedNotification) {
        await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
          tenantId: currentTenantId, entityType: 'NEGOTIATION', entityId: round.id,
          route: '/api/procurement/negotiations',
        });
      }

      return {
        success: true,
        round,
        vendorId: targetVendorId,
        vendorName: vendor.name,
        roundNumber,
        counterOfferAmount: targetCounter,
        isSuperseding: Boolean(activePendingRound && allowSupersede),
      };
    }

    // CHECK IF BULK DISPATCH REQUESTED
    if (isBulkRequest) {
      await loadDispatchVendors(targetList);

      const dispatched: any[] = [];
      const failed: any[] = [];

      for (const tVendorId of targetList) {
        const result = await dispatchToVendor(tVendorId);
        if (result.success) {
          dispatched.push({
            vendorId: result.vendorId,
            vendorName: result.vendorName,
            status: 'DISPATCHED',
            roundNumber: result.roundNumber,
            counterOfferAmount: result.counterOfferAmount,
            isDuplicate: result.isDuplicate || false,
            isSuperseding: result.isSuperseding || false,
          });
        } else {
          failed.push({
            vendorId: result.vendorId,
            vendorName: result.vendorName,
            status: 'FAILED',
            reason: result.reason,
            requiresSupersedeConfirm: result.requiresSupersedeConfirm || false,
          });
        }
      }

      return apiSuccess(
        {
          message: interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsRoute.bulkOfferProcessedLengthDispatchedLength2Failed, { "length": dispatched.length, "length2": failed.length }),
          summary: {
            totalSelected: targetList.length,
            dispatchedCount: dispatched.length,
            failedCount: failed.length,
          },
          dispatched,
          failed,
          results: [...dispatched, ...failed],
        },
        dispatched.length > 0 ? 201 : 400
      );
    }

    // SINGLE VENDOR DISPATCH
    await loadDispatchVendors([vendorId]);
    const singleResult = await dispatchToVendor(vendorId);
    if (!singleResult.success) {
      const { NextResponse } = await import('next/server');
      return NextResponse.json(
        {
          error: interpolateUiString(UI_STRINGS.common.value1, { "value1": singleResult.reason || 'Failed to dispatch counteroffer' }),
          requiresSupersedeConfirm: singleResult.requiresSupersedeConfirm,
          pendingRoundNumber: singleResult.pendingRoundNumber,
          pendingAmount: singleResult.pendingAmount,
        },
        { status: 400 }
      );
    }

    return apiSuccess(
      {
        round: singleResult.round,
        message: revisedQuoteAmount
          ? `Vendor Revised Quote recorded for Round ${singleResult.roundNumber}`
          : singleResult.isSuperseding
          ? `Superseding Buyer Offer Dispatched (Round ${singleResult.roundNumber})`
          : `Buyer Offer Submitted Successfully (Round ${singleResult.roundNumber})`,
        roundNumber: singleResult.roundNumber,
      },
      201
    );
  } catch (error: any) {
    await writeStructuredLog('error', 'procurement.negotiation_round_batch_failed', {
      operation: 'create_negotiation_round',
      route: '/api/procurement/negotiations',
      requestId,
      tenantId: ctx.tenantId,
      rfqId: failedRfqId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 500) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToCreateNegotiationRound, 500);
  }
}
