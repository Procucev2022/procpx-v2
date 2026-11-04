// app/api/procurement/auctions/[id]/route.ts
// Handles auction detail, server-authoritative status evaluation, buyer live controls, and draft updates
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const now = new Date();

    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rfq: {
          include: {
            project: { select: { id: true, name: true, projectCode: true } },
            pr: {
              select: {
                id: true,
                prNumber: true,
                title: true,
                costCentre: { select: { id: true, name: true, code: true } },
                boq: { select: { id: true, boqCode: true, title: true } },
              },
            },
          },
        },
        vendors: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                code: true,
                email: true,
                contactPerson: true,
                phone: true,
              },
            },
          },
        },
        items: true,
        bids: {
          include: {
            vendor: { select: { id: true, name: true, code: true } },
            auctionItem: { select: { id: true, itemCode: true, description: true } },
          },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!auction) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionEventNotFoundOrAccessDenied, 404, { route: '/api/procurement/auctions/[id]', method: 'GET' });
    }

    // Auto-update status if time has progressed
    let currentStatus = auction.status;
    if (auction.status === 'SCHEDULED' && auction.startTime <= now && auction.endTime > now) {
      currentStatus = 'LIVE';
      await prisma.auction.update({ where: { id }, data: { status: 'LIVE' } });
    } else if (
      (auction.status === 'LIVE' || auction.status === 'EXTENDED' || auction.status === 'SCHEDULED') &&
      auction.endTime <= now
    ) {
      currentStatus = 'CLOSED';
      await prisma.auction.update({ where: { id }, data: { status: 'CLOSED' } });
    }

    // Check vendor context if caller is a vendor
    let currentVendorParticipation: any = null;
    let isInvitedVendor = false;
    let userVendorId: string | null = null;

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

      if (vendorRecord) {
        userVendorId = vendorRecord.id;
        const participation = auction.vendors.find((v) => v.vendorId === vendorRecord.id);
        if (participation) {
          isInvitedVendor = true;
          currentVendorParticipation = {
            id: participation.id,
            vendorId: vendorRecord.id,
            name: vendorRecord.name,
            termsAcceptedAt: participation.termsAcceptedAt?.toISOString() || null,
            bidCount: participation.bidsCount,
            lastBidAmount: participation.lastBidAmount ? Number(participation.lastBidAmount) : null,
            bestRank: participation.bestBidRank,
          };
        }
      }

      if (!isInvitedVendor) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.youAreNotInvitedToParticipateInThisAuction, 403, { route: '/api/procurement/auctions/[id]', method: 'GET' });
      }
    }

    // Check project user observer context
    const isObserver = ctx.role === 'PROJECT_USER' || ctx.role === 'PROJECT_APPROVER';

    // Sealed Bid & Confidentiality Filter:
    const isSealedAndActive = auction.auctionType === 'SEALED_BID' && currentStatus !== 'CLOSED' && currentStatus !== 'COMPLETED';
    const hideLeadingPrice = !auction.hasLeadingPrice || isSealedAndActive;

    // Filter bids according to role and confidentiality rules
    let visibleBids = (auction.bids || []).map((b) => {
      const isMyBid = userVendorId && b.vendorId === userVendorId;
      if (isSealedAndActive && !isMyBid) {
        return {
          id: b.id,
          bidNumber: b.bidNumber,
          timestamp: b.timestamp.toISOString(),
          vendorId: 'CONFIDENTIAL',
          vendorName: 'Anonymous Participant',
          bidAmount: null,
          rank: null,
          auctionItemId: b.auctionItemId,
        };
      }

      return {
        id: b.id,
        bidNumber: b.bidNumber,
        timestamp: b.timestamp.toISOString(),
        vendorId: ctx.role === 'VENDOR' && !isMyBid ? 'VENDOR-XXX' : b.vendorId,
        vendorName: ctx.role === 'VENDOR' && !isMyBid ? 'Competitor' : b.vendor.name,
        vendorCode: ctx.role === 'VENDOR' && !isMyBid ? '***' : b.vendor.code,
        bidAmount: hideLeadingPrice && ctx.role === 'VENDOR' && !isMyBid ? null : Number(b.bidAmount),
        rank: b.rank,
        auctionItemId: b.auctionItemId,
        itemCode: b.auctionItem?.itemCode,
      };
    });

    if (isSealedAndActive && ctx.role === 'VENDOR') {
      visibleBids = visibleBids.filter((b) => b.vendorId !== 'CONFIDENTIAL');
    }

    let parsedDocs = [];
    try {
      parsedDocs = auction.documents ? JSON.parse(auction.documents) : [];
    } catch {
      parsedDocs = [];
    }

    return apiSuccess({
      auction: {
        id: auction.id,
        auctionNumber: auction.auctionNumber,
        title: auction.title,
        auctionCategory: auction.auctionCategory,
        auctionType: auction.auctionType,
        currency: auction.currency || 'INR',
        refreshIntervalSeconds: auction.refreshIntervalSeconds || 15,
        scrollingText: auction.scrollingText,
        quantityType: auction.quantityType,
        hasStartPrice: auction.hasStartPrice,
        startingPrice: auction.startingPrice ? Number(auction.startingPrice) : null,
        currentLowestBid: hideLeadingPrice ? null : (auction.currentLowestBid ? Number(auction.currentLowestBid) : null),
        currentLeadingBid: hideLeadingPrice ? null : (auction.currentLeadingBid ? Number(auction.currentLeadingBid) : null),
        currentWinningVendorId: hideLeadingPrice ? null : auction.currentWinningVendorId,
        hasLeadingPrice: auction.hasLeadingPrice,
        minDecrement: auction.minDecrement ? Number(auction.minDecrement) : 0,
        hasMinBidReduction: auction.hasMinBidReduction,
        hasAutoExtension: auction.hasAutoExtension,
        autoExtensionMinutes: auction.autoExtensionMinutes,
        extensionCount: auction.extensionCount,
        hasBidLimit: auction.hasBidLimit,
        maxBidsPerParticipant: auction.maxBidsPerParticipant,
        inviteProjectUser: auction.inviteProjectUser,
        projectUserId: auction.projectUserId,
        nonInvitedJustification: auction.nonInvitedJustification,
        termsAndConditions: auction.termsAndConditions,
        documents: parsedDocs,
        startTime: auction.startTime.toISOString(),
        endTime: auction.endTime.toISOString(),
        scheduledEndTime: auction.scheduledEndTime?.toISOString() || auction.endTime.toISOString(),
        status: currentStatus,
        createdAt: auction.createdAt.toISOString(),
        rfq: {
          id: auction.rfq.id,
          rfqNumber: auction.rfq.rfqNumber,
          title: auction.rfq.title,
          packageName: auction.rfq.packageName,
          projectName: auction.rfq.project?.name,
          projectCode: auction.rfq.project?.projectCode,
          prNumber: auction.rfq.pr?.prNumber,
          prTitle: auction.rfq.pr?.title,
          costCentre: auction.rfq.pr?.costCentre?.name,
          boqNumber: auction.rfq.pr?.boq?.boqCode,
        },
        vendors: auction.vendors.map((v) => ({
          id: v.id,
          vendorId: v.vendorId,
          name: v.vendor.name,
          code: v.vendor.code,
          email: v.vendor.email,
          phone: v.vendor.phone,
          termsAcceptedAt: v.termsAcceptedAt?.toISOString() || null,
          bidCount: v.bidsCount,
          lastBidAmount: hideLeadingPrice && ctx.role === 'VENDOR' && v.vendorId !== userVendorId ? null : (v.lastBidAmount ? Number(v.lastBidAmount) : null),
          bestRank: isSealedAndActive ? null : v.bestBidRank,
        })),
        items: auction.items.map((i) => ({
          id: i.id,
          itemCode: i.itemCode,
          description: i.description,
          category: i.category,
          subCategory: i.subcategory,
          uom: i.uom,
          quantity: Number(i.quantity),
          startPrice: i.startPrice ? Number(i.startPrice) : null,
          currentLowestBid: hideLeadingPrice ? null : (i.currentLeadingBid ? Number(i.currentLeadingBid) : null),
        })),
        bids: visibleBids,
      },
      currentVendorParticipation,
      isObserver,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching auction details:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchAuctionDetails }), 500, { route: '/api/procurement/auctions/[id]', method: 'GET', error: error });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { action, extensionMinutes, reason, ...updateFields } = body;

    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { rfq: true },
    });

    if (!auction) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionNotFoundOrAccessDenied, 404, { route: '/api/procurement/auctions/[id]', method: 'PUT' });
    }

    if (action === 'PAUSE') {
      if (auction.status !== 'LIVE' && auction.status !== 'EXTENDED') {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyLiveAuctionsCanBePaused, 400, { route: '/api/procurement/auctions/[id]', method: 'PUT' });
      }
      await prisma.auction.update({
        where: { id },
        data: { status: 'PAUSED' },
      });
      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: auction.rfq.projectId,
        entityType: 'AUCTION',
        entityId: auction.id,
        action: 'AUCTION_PAUSED',
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberWasPausedByBuyer, { "auctionNumber": auction.auctionNumber }),
      });
      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionPausedSuccessfully });
    }

    if (action === 'RESUME') {
      if (auction.status !== 'PAUSED') {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyPausedAuctionsCanBeResumed, 400, { route: '/api/procurement/auctions/[id]', method: 'PUT' });
      }
      await prisma.auction.update({
        where: { id },
        data: { status: 'LIVE' },
      });
      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: auction.rfq.projectId,
        entityType: 'AUCTION',
        entityId: auction.id,
        action: 'AUCTION_RESUMED',
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberWasResumedByBuyer, { "auctionNumber": auction.auctionNumber }),
      });
      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionResumedSuccessfully });
    }

    if (action === 'EXTEND') {
      const minutesToAdd = Number(extensionMinutes) || 5;
      const currentEnd = new Date(auction.endTime);
      const newEnd = new Date(currentEnd.getTime() + minutesToAdd * 60 * 1000);

      await prisma.auction.update({
        where: { id },
        data: {
          endTime: newEnd,
          scheduledEndTime: newEnd,
          extensionCount: { increment: 1 },
          status: 'EXTENDED',
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: auction.rfq.projectId,
        entityType: 'AUCTION',
        entityId: auction.id,
        action: 'AUCTION_EXTENDED_MANUALLY',
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberExtendedByMinutesToAddMinutesNewScheduledEndTimeToISOString, { "auctionNumber": auction.auctionNumber, "minutesToAdd": minutesToAdd, "toISOString": newEnd.toISOString() }),
      });

      return apiSuccess({
        message: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionExtendedByMinutesToAddMinutes, { "minutesToAdd": minutesToAdd }),
        newEndTime: newEnd.toISOString(),
      });
    }

    if (action === 'CONCLUDE') {
      await prisma.auction.update({
        where: { id },
        data: {
          status: 'CLOSED',
          endTime: new Date(),
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: auction.rfq.projectId,
        entityType: 'AUCTION',
        entityId: auction.id,
        action: 'AUCTION_CONCLUDED',
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberConcludedByBuyer, { "auctionNumber": auction.auctionNumber }),
      });

      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionConcludedSuccessfully });
    }

    if (action === 'CANCEL') {
      await prisma.auction.update({
        where: { id },
        data: {
          status: 'CANCELLED',
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: auction.rfq.projectId,
        entityType: 'AUCTION',
        entityId: auction.id,
        action: 'AUCTION_CANCELLED',
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberCancelledByBuyerReasonValue2, { "auctionNumber": auction.auctionNumber, "value2": reason || 'Operational cancellation' }),
      });

      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionCancelledSuccessfully });
    }

    if (auction.status !== 'DRAFT') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyDraftAuctionsCanBeReConfigured, 400, { route: '/api/procurement/auctions/[id]', method: 'PUT' });
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: {
        title: interpolateUiString(UI_STRINGS.common.value1, { "value1": updateFields.title || auction.title }),
        scrollingText: updateFields.scrollingText !== undefined ? updateFields.scrollingText : auction.scrollingText,
        refreshIntervalSeconds: updateFields.refreshIntervalSeconds ? Number(updateFields.refreshIntervalSeconds) : auction.refreshIntervalSeconds,
        startingPrice: updateFields.startingPrice ? Number(updateFields.startingPrice) : auction.startingPrice,
        minDecrement: updateFields.minDecrement ? Number(updateFields.minDecrement) : auction.minDecrement,
        termsAndConditions: updateFields.termsAndConditions || auction.termsAndConditions,
        status: updateFields.scheduleNow ? 'SCHEDULED' : 'DRAFT',
      },
    });

    return apiSuccess({ auction: updated, message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionDraftUpdatedSuccessfully });
  } catch (error: any) {
    console.error('Error updating auction:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToUpdateAuction }), 500, { route: '/api/procurement/auctions/[id]', method: 'PUT', error: error });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { bids: true },
    });

    if (!auction) {
      return apiError(UI_STRINGS.common.auctionNotFound, 404, { route: '/api/procurement/auctions/[id]', method: 'DELETE' });
    }

    if (auction.status !== 'DRAFT' && auction.bids.length > 0) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.cannotDeleteAnAuctionThatHasAlreadyBeenScheduledOrReceivedBids, 400, { route: '/api/procurement/auctions/[id]', method: 'DELETE' });
    }

    await prisma.auctionVendor.deleteMany({ where: { auctionId: id } });
    await prisma.auctionItem.deleteMany({ where: { auctionId: id } });
    await prisma.auction.delete({ where: { id } });

    return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionDeletedSuccessfully });
  } catch (error: any) {
    console.error('Error deleting auction:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToDeleteAuction }), 500, { route: '/api/procurement/auctions/[id]', method: 'DELETE', error: error });
  }
}
