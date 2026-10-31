// app/api/procurement/auctions/route.ts
// Comprehensive B2B Auction API: Guided creation, KPI aggregation, role-based visibility, and auto-scheduling
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab') || 'ALL';
  const rfqId = searchParams.get('rfqId');
  const type = searchParams.get('type');
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));

  try {
    const now = new Date();

    // Auto-transition time-based statuses non-destructively
    // 1. Transition SCHEDULED -> LIVE if startTime <= now < endTime
    await prisma.auction.updateMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'SCHEDULED',
        startTime: { lte: now },
        endTime: { gt: now },
      },
      data: {
        status: 'LIVE',
      },
    });

    // 2. Transition LIVE / EXTENDED / SCHEDULED -> CLOSED if endTime <= now
    await prisma.auction.updateMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['LIVE', 'EXTENDED', 'SCHEDULED'] },
        endTime: { lte: now },
      },
      data: {
        status: 'CLOSED',
      },
    });

    // Build base query according to role
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;
    if (type && type !== 'ALL') where.auctionType = type;
    if (category && category !== 'ALL') where.auctionCategory = category;

    // Role-based visibility
    if (ctx.role === 'VENDOR') {
      const vendorUser = await prisma.vendor.findFirst({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { email: ctx.userEmail || '' },
            { id: ctx.vendorId || '' },
            { id: ctx.userId },
          ],
        },
      });

      if (vendorUser) {
        where.vendors = {
          some: {
            vendorId: vendorUser.id,
          },
        };
      } else {
        return apiSuccess({
          auctions: [],
          total: 0,
          kpis: { total: 0, live: 0, upcoming: 0, draft: 0, completed: 0, pending: 0 },
        });
      }
    } else if (ctx.role === 'PROJECT_USER' || ctx.role === 'PROJECT_APPROVER') {
      where.OR = [
        { inviteProjectUser: true, projectUserId: ctx.userId },
        { inviteProjectUser: true },
        { rfq: { project: { team: { some: { userId: ctx.userId } } } } },
      ];
    }

    // Text search
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { auctionNumber: { contains: q } },
        { title: { contains: q } },
        { rfq: { rfqNumber: { contains: q } } },
        { rfq: { title: { contains: q } } },
      ];
    }

    // Compute KPI card counts across all auctions for this scope
    const [totalCount, liveCount, upcomingCount, draftCount, completedCount] = await Promise.all([
      prisma.auction.count({ where }),
      prisma.auction.count({
        where: { ...where, status: { in: ['LIVE', 'EXTENDED'] } },
      }),
      prisma.auction.count({
        where: { ...where, status: 'SCHEDULED' },
      }),
      prisma.auction.count({
        where: { ...where, status: 'DRAFT' },
      }),
      prisma.auction.count({
        where: { ...where, status: { in: ['CLOSED', 'COMPLETED'] } },
      }),
    ]);

    const pendingCount = draftCount + (ctx.role !== 'VENDOR' ? await prisma.auction.count({
      where: { ...where, status: 'CLOSED', currentWinningVendorId: { not: null } },
    }) : 0);

    // Apply Tab filter
    if (tab === 'LIVE') {
      where.status = { in: ['LIVE', 'EXTENDED'] };
    } else if (tab === 'UPCOMING') {
      where.status = 'SCHEDULED';
    } else if (tab === 'DRAFT') {
      where.status = 'DRAFT';
    } else if (tab === 'COMPLETED') {
      where.status = { in: ['CLOSED', 'COMPLETED'] };
    } else if (tab === 'RESULTS') {
      where.status = { in: ['CLOSED', 'COMPLETED'] };
    }

    const totalFiltered = await prisma.auction.count({ where });

    const auctions = await prisma.auction.findMany({
      where,
      include: {
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            packageName: true,
            projectId: true,
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
            vendor: { select: { id: true, name: true, code: true } },
          },
        },
        items: true,
        bids: {
          include: {
            vendor: { select: { id: true, name: true, code: true } },
          },
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const formattedAuctions = (auctions as any[]).map((auc) => {
      const isSealedAndActive = auc.auctionType === 'SEALED_BID' && auc.status !== 'CLOSED' && auc.status !== 'COMPLETED';

      return {
        id: auc.id,
        auctionNumber: auc.auctionNumber,
        title: auc.title,
        auctionCategory: auc.auctionCategory,
        auctionType: auc.auctionType,
        currency: auc.currency || 'INR',
        refreshIntervalSeconds: auc.refreshIntervalSeconds || 15,
        scrollingText: auc.scrollingText,
        quantityType: auc.quantityType,
        hasStartPrice: auc.hasStartPrice,
        startingPrice: auc.startingPrice ? Number(auc.startingPrice) : null,
        hasLeadingPrice: auc.hasLeadingPrice,
        currentLowestBid: isSealedAndActive ? null : (auc.currentLowestBid ? Number(auc.currentLowestBid) : null),
        currentLeadingBid: isSealedAndActive ? null : (auc.currentLeadingBid ? Number(auc.currentLeadingBid) : null),
        minDecrement: auc.minDecrement ? Number(auc.minDecrement) : 0,
        hasMinBidReduction: auc.hasMinBidReduction,
        hasAutoExtension: auc.hasAutoExtension,
        autoExtensionMinutes: auc.autoExtensionMinutes,
        extensionCount: auc.extensionCount,
        hasBidLimit: auc.hasBidLimit,
        maxBidsPerParticipant: auc.maxBidsPerParticipant,
        inviteProjectUser: auc.inviteProjectUser,
        projectUserId: auc.projectUserId,
        status: auc.status,
        startTime: auc.startTime.toISOString(),
        endTime: auc.endTime.toISOString(),
        scheduledEndTime: auc.scheduledEndTime?.toISOString() || auc.endTime.toISOString(),
        totalBids: auc.bids ? auc.bids.length : 0,
        invitedVendorsCount: auc.vendors ? auc.vendors.length : 0,
        vendors: (auc.vendors || []).map((v: any) => ({
          id: v.id,
          vendorId: v.vendorId,
          name: v.vendor?.name,
          code: v.vendor?.code,
          termsAcceptedAt: v.termsAcceptedAt,
          bidCount: v.bidsCount,
          lastBidAmount: isSealedAndActive ? null : (v.lastBidAmount ? Number(v.lastBidAmount) : null),
          bestRank: isSealedAndActive ? null : v.bestBidRank,
        })),
        itemsCount: auc.items ? auc.items.length : 0,
        items: (auc.items || []).map((i: any) => ({
          id: i.id,
          itemCode: i.itemCode,
          description: i.description,
          category: i.category,
          subCategory: i.subcategory,
          uom: i.uom,
          quantity: Number(i.quantity),
          startPrice: i.startPrice ? Number(i.startPrice) : null,
          currentLowestBid: isSealedAndActive ? null : (i.currentLeadingBid ? Number(i.currentLeadingBid) : null),
        })),
        rfqId: auc.rfqId,
        rfqNumber: auc.rfq?.rfqNumber,
        rfqTitle: auc.rfq?.title,
        packageName: auc.rfq?.packageName,
        projectName: auc.rfq?.project?.name,
        projectCode: auc.rfq?.project?.projectCode,
        prNumber: auc.rfq?.pr?.prNumber,
        prTitle: auc.rfq?.pr?.title,
        costCentre: auc.rfq?.pr?.costCentre?.name,
        boqNumber: auc.rfq?.pr?.boq?.boqCode,
        createdAt: auc.createdAt.toISOString(),
      };
    });

    return apiSuccess({
      auctions: formattedAuctions,
      total: totalFiltered,
      page,
      limit,
      totalPages: Math.ceil(totalFiltered / limit),
      kpis: {
        total: totalCount,
        live: liveCount,
        upcoming: upcomingCount,
        draft: draftCount,
        completed: completedCount,
        pending: pendingCount,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching auctions:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchAuctions }), 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      rfqId,
      title,
      auctionCategory = 'RFQ_TOTAL_WISE',
      auctionType = 'REVERSE_AUCTION',
      startTime,
      endTime,
      currency = 'INR',
      refreshIntervalSeconds = 15,
      scrollingText = '',
      quantityType = 'FULL',
      hasStartPrice = true,
      startingPrice,
      hasLeadingPrice = true,
      hasMinBidReduction = true,
      minDecrement = 5000,
      hasAutoExtension = true,
      autoExtensionMinutes = 3,
      hasBidLimit = false,
      maxBidsPerParticipant = 10,
      inviteProjectUser = false,
      projectUserId = null,
      invitedVendorIds = [],
      nonInvitedJustification = '',
      items = [],
      documents = [],
      termsAndConditions = '',
      isDraft = false,
    } = body;

    if (!rfqId || !title?.trim()) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.rFQIDAndAuctionNameAreMandatoryFields, 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: {
        invitedVendors: { include: { vendor: true } },
        quotes: true,
      },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.selectedRFQWasNotFoundOrIsInaccessibleInThisWorkspace, 404);
    }

    const quotedVendorIds = rfq.quotes
      .filter((q) => q.status !== 'REJECTED')
      .map((q) => q.vendorId);

    const missingVendors = quotedVendorIds.filter((vid) => !invitedVendorIds.includes(vid));
    if (missingVendors.length > 0 && !nonInvitedJustification?.trim() && !isDraft) {
      return apiError(
        UI_STRINGS.appApiProcurementAuctionsRoute.mandatoryJustificationIsRequiredWhenExcludingQuotedVendorsFromTheInvitedList,
        400
      );
    }

    if (!isDraft && invitedVendorIds.length === 0) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.atLeastOneVendorMustBeInvitedToScheduleAnAuction, 400);
    }

    const now = new Date();
    const start = startTime ? new Date(startTime) : now;
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000);

    if (!isDraft) {
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.pleaseProvideValidStartAndEndDateTime, 400);
      }
      if (end <= start) {
        return apiError(UI_STRINGS.common.auctionEndTimeMustBeLaterThanStartTime, 400);
      }
    }

    let initialStatus = 'DRAFT';
    if (!isDraft) {
      if (start <= now && end > now) {
        initialStatus = 'LIVE';
      } else if (start > now) {
        initialStatus = 'SCHEDULED';
      } else {
        initialStatus = 'CLOSED';
      }
    }

    const count = await prisma.auction.count({ where: { tenantId: ctx.tenantId } });
    const prefix = auctionType === 'SEALED_BID' ? 'SLD' : (auctionType === 'FORWARD_AUCTION' ? 'FWD' : 'AUC');
    const auctionNumber = `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const effectiveLeadingPrice = auctionType === 'SEALED_BID' ? false : Boolean(hasLeadingPrice);
    const effectiveBidLimit = auctionType === 'SEALED_BID' ? 1 : Number(maxBidsPerParticipant || 10);
    const numericStartPrice = Number(startingPrice || 0);

    const auction = await prisma.auction.create({
      data: {
        tenantId: ctx.tenantId,
        rfqId,
        auctionNumber,
        title: title.trim(),
        auctionCategory,
        auctionType,
        currency,
        refreshIntervalSeconds: Math.max(5, Math.min(300, Number(refreshIntervalSeconds) || 15)),
        scrollingText: scrollingText?.trim() || null,
        quantityType,
        hasStartPrice: Boolean(hasStartPrice),
        startingPrice: numericStartPrice,
        currentLowestBid: numericStartPrice > 0 ? numericStartPrice : null,
        currentLeadingBid: numericStartPrice > 0 ? numericStartPrice : null,
        hasLeadingPrice: effectiveLeadingPrice,
        hasMinBidReduction: Boolean(hasMinBidReduction),
        minDecrement: hasMinBidReduction ? Number(minDecrement || 5000) : 0,
        hasAutoExtension: Boolean(hasAutoExtension),
        autoExtensionMinutes: Number(autoExtensionMinutes || 3),
        hasBidLimit: Boolean(hasBidLimit),
        maxBidsPerParticipant: effectiveBidLimit,
        inviteProjectUser: Boolean(inviteProjectUser),
        projectUserId: inviteProjectUser ? projectUserId : null,
        nonInvitedJustification: nonInvitedJustification?.trim() || null,
        termsAndConditions: termsAndConditions?.trim() || 'Standard ProCPX Auction Terms & Conditions apply. Bids submitted are binding.',
        documents: JSON.stringify(documents || []),
        startTime: start,
        endTime: end,
        scheduledEndTime: end,
        extensionCount: 0,
        status: initialStatus,
        bidVisibility: effectiveLeadingPrice ? 'LEADERBOARD' : 'RANK_ONLY',
      },
    });

    if (invitedVendorIds.length > 0) {
      await prisma.auctionVendor.createMany({
        data: invitedVendorIds.map((vId: string) => ({
          tenantId: ctx.tenantId,
          auctionId: auction.id,
          vendorId: vId,
          invitedAt: new Date(),
        })),
      });
    }

    if (items && items.length > 0) {
      await prisma.auctionItem.createMany({
        data: items.map((item: any, idx: number) => ({
          tenantId: ctx.tenantId,
          auctionId: auction.id,
          rfqLineId: item.rfqLineId || item.id || null,
          itemCode: item.itemCode || `ITEM-${idx + 1}`,
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": item.description || 'Auction Item' }),
          category: item.category || 'General',
          subcategory: item.subCategory || null,
          uom: item.uom || 'EA',
          quantity: Number(item.quantity || 1),
          startPrice: item.startPrice ? Number(item.startPrice) : null,
          currentLeadingBid: item.startPrice ? Number(item.startPrice) : null,
        })),
      });
    }

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'AUCTION',
      entityId: auction.id,
      action: isDraft ? 'AUCTION_DRAFT_CREATED' : 'AUCTION_SCHEDULED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsRoute.auctionTypeAuctionCategoryAuctionNumberTitleValue5ForRFQRfqNumberWithLengthInvitedVendors, { "auctionType": auctionType, "auctionCategory": auctionCategory, "auctionNumber": auctionNumber, "title": title, "value5": isDraft ? 'saved as Draft' : 'scheduled', "rfqNumber": rfq.rfqNumber, "length": invitedVendorIds.length }),
      newValue: {
        auctionNumber,
        auctionCategory,
        auctionType,
        currency,
        startingPrice: numericStartPrice,
        minDecrement,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: initialStatus,
        invitedVendorCount: invitedVendorIds.length,
      },
    });

    return apiSuccess({
      auction,
      message: isDraft
        ? `Draft auction ${auctionNumber} saved successfully.`
        : `Auction ${auctionNumber} scheduled successfully. Invited vendors have been notified.`,
    }, 201);
  } catch (error: any) {
    console.error('Error creating auction:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToCreateAuction }), 500);
  }
}
