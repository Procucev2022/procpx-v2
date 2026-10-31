// app/api/procurement/auctions/[id]/bid/route.ts
// Server-authoritative bid acceptance engine: Reverse, Forward, Sealed Bid, Rolling Auto-Extension & Bid Limits
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    if (ctx.role === 'PROJECT_USER' || ctx.role === 'PROJECT_APPROVER') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.projectUsersHaveReadOnlyObserverAccessAndCannotSubmitBids, 403);
    }

    const body = await req.json();
    let { vendorId, bidAmount, auctionItemId } = body;

    if (ctx.role === 'VENDOR') {
      const vendorRecord = await prisma.vendor.findFirst({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { email: ctx.userEmail || '' },
            { id: ctx.vendorId || '' },
            { id: ctx.userId },
          ],
        },
      });

      if (!vendorRecord) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorProfileNotFoundForThisAccount, 403);
      }
      vendorId = vendorRecord.id;
    } else {
      if (!vendorId) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIDIsRequired, 400);
      }
    }

    const numericBid = Number(bidAmount);
    if (isNaN(numericBid) || numericBid <= 0) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.pleaseEnterAValidPositiveBidAmount, 400);
    }

    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rfq: true,
        vendors: { where: { vendorId } },
        items: true,
        bids: {
          where: auctionItemId ? { auctionItemId } : undefined,
          orderBy: { timestamp: 'desc' },
        },
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
      await prisma.auction.update({ where: { id }, data: { status: 'CLOSED' } });
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.auctionTimeHasExpiredNoFurtherBidsAreAccepted, 400);
    }

    const participantRecord = auction.vendors[0];
    if (!participantRecord) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.vendorIsNotInvitedToParticipateInThisAuction, 403);
    }

    if (!participantRecord.termsAcceptedAt) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.youMustReviewAndAcceptTheAuctionTermsConditionsBeforePlacingYourFirstBid, 400);
    }

    const vendorBids = auction.bids.filter((b) => b.vendorId === vendorId);
    if (auction.auctionType === 'SEALED_BID') {
      if (vendorBids.length > 0) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.sealedBidProtocolYouHaveAlreadySubmittedYourSinglePermittedSealedBidForThisAuction, 400);
      }
    } else if (auction.hasBidLimit && auction.maxBidsPerParticipant) {
      if (vendorBids.length >= auction.maxBidsPerParticipant) {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.bidLimitReachedYouHavePlacedAllMaxBidsPerParticipantPermittedBidsForThisAuction, { "maxBidsPerParticipant": auction.maxBidsPerParticipant }), 400);
      }
    }

    let currentReference = 0;
    const isItemWise = auction.auctionCategory === 'ITEM_WISE';
    let targetItem: any = null;

    if (isItemWise) {
      if (!auctionItemId) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.itemIDIsRequiredForAnItemWiseAuctionBid, 400);
      }
      targetItem = auction.items.find((i) => i.id === auctionItemId);
      if (!targetItem) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.selectedAuctionItemWasNotFound, 404);
      }
      currentReference = targetItem.currentLeadingBid
        ? Number(targetItem.currentLeadingBid)
        : (targetItem.startPrice ? Number(targetItem.startPrice) : 0);
    } else {
      currentReference = auction.currentLowestBid
        ? Number(auction.currentLowestBid)
        : (auction.startingPrice ? Number(auction.startingPrice) : 0);
    }

    const isFirstBid = auction.bids.length === 0;

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

    const bidCount = auction.bids.length + 1;
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';

    const bid = await prisma.auctionBid.create({
      data: {
        tenantId: ctx.tenantId,
        auctionId: id,
        auctionItemId: auctionItemId || null,
        vendorId,
        bidNumber: bidCount,
        bidAmount: numericBid,
        rank: 1,
        ipAddress: clientIp,
        timestamp: now,
      },
      include: {
        vendor: { select: { id: true, name: true, code: true } },
      },
    });

    const auctionUpdateData: any = {
      currentLowestBid: numericBid,
      currentLeadingBid: numericBid,
      currentWinningVendorId: vendorId,
      status: extended ? 'EXTENDED' : 'LIVE',
    };

    if (extended) {
      auctionUpdateData.endTime = newScheduledEnd;
      auctionUpdateData.scheduledEndTime = newScheduledEnd;
      auctionUpdateData.extensionCount = { increment: 1 };
    }

    await prisma.auction.update({
      where: { id },
      data: auctionUpdateData,
    });

    if (isItemWise && targetItem) {
      await prisma.auctionItem.update({
        where: { id: targetItem.id },
        data: {
          currentLeadingBid: numericBid,
        },
      });
    }

    await prisma.auctionVendor.update({
      where: { id: participantRecord.id },
      data: {
        bidsCount: { increment: 1 },
        lastBidAmount: numericBid,
        lastBidAt: now,
        bestBidAmount: numericBid,
        bestBidRank: 1,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: auction.rfq.projectId,
      entityType: 'AUCTION',
      entityId: auction.id,
      action: extended ? 'AUCTION_BID_AND_AUTO_EXTENDED' : 'AUCTION_BID_SUBMITTED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdBidRoute.bidBidCountOfCurrencyToLocaleStringAcceptedFromNameInAuctionAuctionNumberValue6, { "bidCount": bidCount, "currency": auction.currency, "toLocaleString": numericBid.toLocaleString(I18N_CONFIG.defaultLocale), "name": bid.vendor.name, "auctionNumber": auction.auctionNumber, "value6": extended ? ` (Triggered ${auction.autoExtensionMinutes}m rolling extension until ${newScheduledEnd.toISOString()})` : '' }),
      newValue: {
        bidAmount: numericBid,
        bidNumber: bidCount,
        extended,
        newEndTime: extended ? newScheduledEnd.toISOString() : undefined,
      },
    });

    return apiSuccess({
      bid: {
        id: bid.id,
        bidNumber: bid.bidNumber,
        bidAmount: numericBid,
        timestamp: bid.timestamp.toISOString(),
        vendorName: bid.vendor.name,
      },
      extended,
      newEndTime: newScheduledEnd.toISOString(),
      remainingBids: auction.hasBidLimit && auction.maxBidsPerParticipant
        ? auction.maxBidsPerParticipant - (vendorBids.length + 1)
        : null,
      message: extended
        ? `Bid accepted! Rolling auto-extension triggered (+${auction.autoExtensionMinutes}m).`
        : 'Bid accepted successfully.',
    }, 201);
  } catch (error: any) {
    console.error('Error submitting auction bid:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSubmitBid }), 500);
  }
}
