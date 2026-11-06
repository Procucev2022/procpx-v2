// app/api/procurement/auctions/[id]/bid/route.ts
// Server-authoritative bid acceptance engine: Reverse, Forward, Sealed Bid, Rolling Auto-Extension & Bid Limits
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  AUCTION_BID_INSERT_AFTER_CHANGE_SQL,
  AUCTION_BID_UPDATE_IF_CURRENT_SQL,
  AUCTION_ITEM_UPDATE_AFTER_CHANGE_SQL,
  AUCTION_VENDOR_UPDATE_AFTER_BID_SQL,
  EXPIRED_AUCTION_CLOSE_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    if (ctx.role === 'PROJECT_USER' || ctx.role === 'PROJECT_APPROVER') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.projectUsersHaveReadOnlyObserverAccessAndCannotSubmitBids, 403);
    }

    let body: Record<string, unknown>;
    try {
      const parsedBody: unknown = await req.json();
      if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    let vendorId = typeof body.vendorId === 'string' ? body.vendorId : undefined;
    const bidAmount = body.bidAmount;
    const auctionItemId = typeof body.auctionItemId === 'string' ? body.auctionItemId : undefined;
    let vendorRecord;

    if (ctx.role === 'VENDOR') {
      vendorRecord = await prisma.vendor.findFirst({
        where: ctx.vendorId
          ? { tenantId: ctx.tenantId, id: ctx.vendorId }
          : { tenantId: ctx.tenantId, email: ctx.userEmail || '' },
      });

      if (!vendorRecord) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorProfileNotFoundForThisAccount, 403);
      }
      vendorId = vendorRecord.id;
    } else {
      if (!vendorId) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIDIsRequired, 400);
      }
      vendorRecord = await prisma.vendor.findFirst({ where: { tenantId: ctx.tenantId, id: vendorId } });
      if (!vendorRecord) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIsNotInvitedToParticipateInThisAuction, 403);
      }
    }

    const numericBid = Number(bidAmount);
    if (!Number.isFinite(numericBid) || numericBid <= 0) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.pleaseEnterAValidPositiveBidAmount, 400);
    }

    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rfq: true,
        vendors: { where: { tenantId: ctx.tenantId, vendorId } },
        items: true,
        _count: { select: { bids: true } },
      },
    });

    if (!auction) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.auctionNotFoundOrAccessDenied, 404);
    }

    const now = new Date();

    if (auction.status === 'PAUSED') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.biddingIsTemporarilyPausedByTheAuctionAdministrator, 400);
    }
    if (auction.status === 'CLOSED' || auction.status === 'COMPLETED') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.thisAuctionHasConcludedFurtherBidsCannotBeAccepted, 400);
    }
    if (auction.status === 'CANCELLED') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.thisAuctionHasBeenCancelled, 400);
    }
    if (auction.status === 'SCHEDULED' && now < auction.startTime) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.auctionHasNotStartedYetStartsAtToISOString, { "toISOString": auction.startTime.toISOString() }), 400);
    }
    if (now >= auction.endTime) {
      await writeD1BatchAtomically([{
        sql: EXPIRED_AUCTION_CLOSE_SQL,
        values: [now, id, ctx.tenantId, now],
      }]);
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.auctionTimeHasExpiredNoFurtherBidsAreAccepted, 400);
    }

    if (!['SCHEDULED', 'LIVE', 'EXTENDED'].includes(auction.status)) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.thisAuctionHasConcludedFurtherBidsCannotBeAccepted, 400);
    }

    const participantRecord = auction.vendors[0];
    if (!participantRecord) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIsNotInvitedToParticipateInThisAuction, 403);
    }

    if (!participantRecord.isEligible) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIsNotInvitedToParticipateInThisAuction, 403);
    }

    if (!participantRecord.termsAcceptedAt) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.youMustReviewAndAcceptTheAuctionTermsConditionsBeforePlacingYourFirstBid, 400);
    }

    const isItemWise = auction.auctionCategory === 'ITEM_WISE';
    let targetItem = null as (typeof auction.items)[number] | null;

    if (isItemWise) {
      if (!auctionItemId) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.itemIDIsRequiredForAnItemWiseAuctionBid, 400);
      }
      targetItem = auction.items.find((i) => i.id === auctionItemId) || null;
      if (!targetItem) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.selectedAuctionItemWasNotFound, 404);
      }
    } else if (auctionItemId) {
      targetItem = auction.items.find((i) => i.id === auctionItemId) || null;
      if (!targetItem) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.selectedAuctionItemWasNotFound, 404);
      }
    }

    const itemBidCountQuery = isItemWise && targetItem
      ? prisma.auctionBid.count({ where: { tenantId: ctx.tenantId, auctionId: id, auctionItemId: targetItem.id } })
      : Promise.resolve(0);
    const [vendorBidCount, itemBidCount] = await Promise.all([
      prisma.auctionBid.count({ where: { tenantId: ctx.tenantId, auctionId: id, vendorId } }),
      itemBidCountQuery,
    ]);
    if (vendorBidCount !== participantRecord.bidsCount) {
      await writeStructuredLog('warn', 'procurement.auction_bid_counter_drift', {
        operation: 'submit_auction_bid', route: '/api/procurement/auctions/[id]/bid',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, auctionId: id,
        vendorId, storedBidCount: participantRecord.bidsCount, actualBidCount: vendorBidCount,
      });
    }

    if (auction.auctionType === 'SEALED_BID') {
      if (vendorBidCount > 0) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.sealedBidProtocolYouHaveAlreadySubmittedYourSinglePermittedSealedBidForThisAuction, 400);
      }
    } else if (auction.hasBidLimit && auction.maxBidsPerParticipant) {
      if (vendorBidCount >= auction.maxBidsPerParticipant) {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.bidLimitReachedYouHavePlacedAllMaxBidsPerParticipantPermittedBidsForThisAuction, { "maxBidsPerParticipant": auction.maxBidsPerParticipant }), 400);
      }
    }

    let currentReference = 0;
    if (isItemWise) {
      const item = targetItem!;
      currentReference = item.currentLeadingBid
        ? Number(item.currentLeadingBid)
        : (item.startPrice ? Number(item.startPrice) : 0);
    } else {
      currentReference = auction.currentLowestBid
        ? Number(auction.currentLowestBid)
        : (auction.startingPrice ? Number(auction.startingPrice) : 0);
    }

    const isFirstBid = isItemWise ? itemBidCount === 0 : auction._count.bids === 0;

    if (auction.auctionType === 'REVERSE_AUCTION') {
      if (isFirstBid && auction.hasStartPrice && currentReference > 0) {
        if (numericBid > currentReference) {
          return apiError(
            interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.firstBidCannotExceedTheConfiguredStartingCeilingPriceOfCurrencyToLocaleString, { "currency": auction.currency, "toLocaleString": currentReference.toLocaleString(I18N_CONFIG.defaultLocale) }),
            400
          );
        }
      } else if (!isFirstBid && currentReference > 0) {
        const minDec = auction.hasMinBidReduction ? Number(auction.minDecrement || 0) : 1;
        const maxAllowed = currentReference - minDec;
        if (numericBid > maxAllowed) {
          return apiError(
            interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.bidCurrencyToLocaleStringMustBeAtLeastCurrency2ToLocaleString2LowerThanCurrentLeadingBidCurrency3ToLocaleString3MaximumAllowedCurrency4ToLocaleString4, { "currency": auction.currency, "toLocaleString": numericBid.toLocaleString(I18N_CONFIG.defaultLocale), "currency2": auction.currency, "toLocaleString2": minDec.toLocaleString(I18N_CONFIG.defaultLocale), "currency3": auction.currency, "toLocaleString3": currentReference.toLocaleString(I18N_CONFIG.defaultLocale), "currency4": auction.currency, "toLocaleString4": maxAllowed.toLocaleString(I18N_CONFIG.defaultLocale) }),
            400
          );
        }
      }
    } else if (auction.auctionType === 'FORWARD_AUCTION') {
      if (isFirstBid && auction.hasStartPrice && currentReference > 0) {
        if (numericBid < currentReference) {
          return apiError(
            interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.firstBidCannotBeLowerThanTheConfiguredStartingFloorPriceOfCurrencyToLocaleString, { "currency": auction.currency, "toLocaleString": currentReference.toLocaleString(I18N_CONFIG.defaultLocale) }),
            400
          );
        }
      } else if (!isFirstBid && currentReference > 0) {
        const minInc = auction.hasMinBidReduction ? Number(auction.minDecrement || 0) : 1;
        const minAllowed = currentReference + minInc;
        if (numericBid < minAllowed) {
          return apiError(
            interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.bidCurrencyToLocaleStringMustBeAtLeastCurrency2ToLocaleString2HigherThanCurrentLeadingBidCurrency3ToLocaleString3MinimumAllowedCurrency4ToLocaleString4, { "currency": auction.currency, "toLocaleString": numericBid.toLocaleString(I18N_CONFIG.defaultLocale), "currency2": auction.currency, "toLocaleString2": minInc.toLocaleString(I18N_CONFIG.defaultLocale), "currency3": auction.currency, "toLocaleString3": currentReference.toLocaleString(I18N_CONFIG.defaultLocale), "currency4": auction.currency, "toLocaleString4": minAllowed.toLocaleString(I18N_CONFIG.defaultLocale) }),
            400
          );
        }
      }
    }

    let extended = false;
    let newScheduledEnd = auction.endTime;
    if (auction.hasAutoExtension && auction.autoExtensionMinutes > 0 && auction.auctionType !== 'SEALED_BID') {
      const remainingMs = auction.endTime.getTime() - now.getTime();
      const triggerThresholdMs = auction.autoExtensionMinutes * 60 * 1000;

      if (remainingMs <= triggerThresholdMs && remainingMs > 0) {
        newScheduledEnd = new Date(auction.endTime.getTime() + triggerThresholdMs);
        extended = true;
      }
    }

    const bidCount = auction._count.bids + 1;
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
    const bidId = crypto.randomUUID();
    const status = extended ? 'EXTENDED' : 'LIVE';
    const auditId = crypto.randomUUID();
    const description = interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.bidBidCountOfCurrencyToLocaleStringAcceptedFromNameInAuctionAuctionNumberValue6, { "bidCount": bidCount, "currency": auction.currency, "toLocaleString": numericBid.toLocaleString(I18N_CONFIG.defaultLocale), "name": vendorRecord!.name, "auctionNumber": auction.auctionNumber, "value6": extended ? ` (Triggered ${auction.autoExtensionMinutes}m rolling extension until ${newScheduledEnd.toISOString()})` : '' });
    const batch = [{
      sql: AUCTION_BID_UPDATE_IF_CURRENT_SQL,
      values: [
        numericBid, numericBid, vendorId, status,
        extended ? 1 : 0, newScheduledEnd, extended ? 1 : 0, newScheduledEnd,
        extended ? 1 : 0, now,
        id, ctx.tenantId, auction.status,
        auction.startTime, now, auction.endTime, now,
        auction.currentLowestBid, auction.currentLeadingBid, auction.extensionCount,
        auction.auctionType, auction.auctionCategory, auction.hasStartPrice, auction.startingPrice,
        auction.hasMinBidReduction, auction.minDecrement, auction.hasAutoExtension, auction.autoExtensionMinutes,
        auction.hasBidLimit, auction.maxBidsPerParticipant, auction._count.bids,
        vendorId, vendorBidCount,
        participantRecord.id, ctx.tenantId, vendorId, participantRecord.bidsCount,
        targetItem?.id ?? null, targetItem?.id ?? null, ctx.tenantId,
        targetItem?.currentLeadingBid ?? null, targetItem?.startPrice ?? null,
      ],
    }];
    if (isItemWise && targetItem) {
      batch.push({
        sql: AUCTION_ITEM_UPDATE_AFTER_CHANGE_SQL,
        values: [numericBid, vendorId, targetItem.id, ctx.tenantId, id, targetItem.currentLeadingBid, targetItem.startPrice],
      });
    }
    batch.push({
      sql: AUCTION_BID_INSERT_AFTER_CHANGE_SQL,
      values: [bidId, ctx.tenantId, id, vendorId, auctionItemId || null, bidCount, numericBid, 1, clientIp, now],
    });
    batch.push({
      sql: AUCTION_VENDOR_UPDATE_AFTER_BID_SQL,
      values: [vendorBidCount + 1, numericBid, now, numericBid, participantRecord.id, ctx.tenantId, id, vendorId, participantRecord.bidsCount],
    });
    batch.push({
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, auction.rfq.projectId, 'AUCTION', auction.id,
        extended ? 'AUCTION_BID_AND_AUTO_EXTENDED' : 'AUCTION_BID_SUBMITTED', description, null,
        JSON.stringify({ bidAmount: numericBid, bidNumber: bidCount, extended,
          newEndTime: extended ? newScheduledEnd.toISOString() : undefined }),
        clientIp, req.headers.get('user-agent'), now],
    });
    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const bidResultIndex = isItemWise ? 2 : 1;
    if (Number(results[bidResultIndex]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({
      bid: {
        id: bidId,
        bidNumber: bidCount,
        bidAmount: numericBid,
        timestamp: now.toISOString(),
        vendorName: vendorRecord!.name,
      },
      extended,
      newEndTime: newScheduledEnd.toISOString(),
      remainingBids: auction.hasBidLimit && auction.maxBidsPerParticipant
        ? auction.maxBidsPerParticipant - (vendorBidCount + 1)
        : null,
      message: extended
        ? `Bid accepted! Rolling auto-extension triggered (+${auction.autoExtensionMinutes}m).`
        : 'Bid accepted successfully.',
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'procurement.auction_bid_submission_failed', {
      operation: 'submit_auction_bid', route: '/api/procurement/auctions/[id]/bid',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      auctionId: id, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitBid, 500);
  }
}
