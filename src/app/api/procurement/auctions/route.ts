// app/api/procurement/auctions/route.ts
// Comprehensive B2B Auction API: Guided creation, KPI aggregation, role-based visibility, and auto-scheduling
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { getD1BatchLimitViolation, writeD1BatchAtomically } from '@/lib/d1-batch';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { MAX_NOTIFICATION_MESSAGE_LENGTH } from '@/lib/notification-outbox.constants';
import {
  AUCTION_AUDIT_INSERT_AFTER_CREATE_SQL,
  AUCTION_INSERT_NEXT_NUMBER_SQL,
  AUCTION_ITEM_INSERT_IF_RFQ_LINE_VALID_SQL,
  AUCTION_VENDOR_INSERT_IF_TENANT_VALID_SQL,
  MAX_AUCTION_ITEMS,
  MAX_AUCTION_VENDOR_INVITES,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { countByD1FilterChunks, readByD1FilterChunks } from '@/lib/d1-query';


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
    // Build base query according to role
    const where: any = {
      tenantId: ctx.tenantId,
    };
    const andFilters: Array<Record<string, unknown>> = [];

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
      andFilters.push({
        OR: [
          { inviteProjectUser: true, projectUserId: ctx.userId },
          { inviteProjectUser: true },
          { rfq: { project: { team: { some: { userId: ctx.userId } } } } },
        ],
      });
    }

    // Text search
    if (search && search.trim()) {
      const q = search.trim();
      andFilters.push({
        OR: [
          { auctionNumber: { contains: q } },
          { title: { contains: q } },
          { rfq: { rfqNumber: { contains: q } } },
          { rfq: { title: { contains: q } } },
        ],
      });
    }
    if (andFilters.length > 0) where.AND = andFilters;

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
      select: {
        id: true,
        auctionNumber: true,
        title: true,
        auctionCategory: true,
        auctionType: true,
        currency: true,
        refreshIntervalSeconds: true,
        scrollingText: true,
        quantityType: true,
        hasStartPrice: true,
        startingPrice: true,
        hasLeadingPrice: true,
        currentLowestBid: true,
        currentLeadingBid: true,
        minDecrement: true,
        hasMinBidReduction: true,
        hasAutoExtension: true,
        autoExtensionMinutes: true,
        extensionCount: true,
        hasBidLimit: true,
        maxBidsPerParticipant: true,
        inviteProjectUser: true,
        projectUserId: true,
        status: true,
        startTime: true,
        endTime: true,
        scheduledEndTime: true,
        rfqId: true,
        createdAt: true,
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
        _count: {
          select: {
            vendors: true,
            items: true,
            bids: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const formattedAuctions = auctions.map((auc) => {
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
        totalBids: auc._count.bids,
        invitedVendorsCount: auc._count.vendors,
        itemsCount: auc._count.items,
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
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'auction.register_read_failed', {
        operation: 'list_auctions', route: '/api/procurement/auctions',
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
        tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role,
        page, limit, tab,
        error: error instanceof Error ? { name: error.name } : { type: typeof error },
      });
    } catch {
      // Preserve the safe API error if optional log persistence is unavailable.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToFetchAuctions, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let rfqId: string | null = null;
  let auctionId: string | null = null;
  let invitedVendorCount = 0;
  let itemCount = 0;
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const {
      rfqId: requestedRfqId,
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

    rfqId = typeof requestedRfqId === 'string' ? requestedRfqId : null;
    if (!rfqId || typeof title !== 'string' || !title.trim()
      || typeof auctionCategory !== 'string' || typeof auctionType !== 'string'
      || typeof currency !== 'string' || typeof quantityType !== 'string') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.rFQIDAndAuctionNameAreMandatoryFields, 400);
    }

    if (!Array.isArray(invitedVendorIds) || invitedVendorIds.length > MAX_AUCTION_VENDOR_INVITES
      || invitedVendorIds.some((vendorId: unknown) => typeof vendorId !== 'string' || !vendorId.trim())
      || !Array.isArray(items) || items.length > MAX_AUCTION_ITEMS
      || items.some((item: unknown) => !item || typeof item !== 'object' || Array.isArray(item))
      || (documents !== null && !Array.isArray(documents))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const normalizedInvitedVendorIds = [...new Set((invitedVendorIds as string[]).map((vendorId) => vendorId.trim()))];
    const normalizedItems = (items as Record<string, unknown>[]).map((item, index) => {
      const rfqLineId = item.rfqLineId || item.id || null;
      const quantity = Number(item.quantity || 1);
      const startPrice = item.startPrice ? Number(item.startPrice) : null;
      if ((rfqLineId !== null && typeof rfqLineId !== 'string')
        || !Number.isFinite(quantity) || quantity <= 0
        || (startPrice !== null && (!Number.isFinite(startPrice) || startPrice < 0))
        || (item.description !== undefined && typeof item.description !== 'string')) {
        return null;
      }
      return {
        rfqLineId: typeof rfqLineId === 'string' ? rfqLineId : null,
        itemCode: typeof item.itemCode === 'string' && item.itemCode.trim() ? item.itemCode.trim() : `ITEM-${index + 1}`,
        description: interpolateUiString(UI_STRINGS.common.value1, {
          value1: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : 'Auction Item',
        }),
        category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : UI_STRINGS.common.general,
        subcategory: typeof item.subCategory === 'string' && item.subCategory.trim() ? item.subCategory.trim() : null,
        brand: typeof item.brand === 'string' && item.brand.trim() ? item.brand.trim() : null,
        uom: typeof item.uom === 'string' && item.uom.trim() ? item.uom.trim() : 'EA',
        quantity,
        startPrice,
      };
    });
    if (normalizedItems.some((item) => item === null)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const validItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item !== null);
    invitedVendorCount = normalizedInvitedVendorIds.length;
    itemCount = normalizedItems.length;

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      select: { id: true, projectId: true, rfqNumber: true },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.selectedRFQWasNotFoundOrIsInaccessibleInThisWorkspace, 404, { route: '/api/procurement/auctions', method: 'POST' });
    }

    if (!isDraft) {
      const quotedVendors = await prisma.quote.groupBy({
        by: ['vendorId'],
        where: {
          tenantId: ctx.tenantId,
          rfqId,
          status: { not: 'REJECTED' },
        },
        orderBy: { vendorId: 'asc' },
        take: MAX_AUCTION_VENDOR_INVITES + 1,
      });
      const invitedVendorSet = new Set(normalizedInvitedVendorIds);
      const hasExcludedQuotedVendor = quotedVendors.length > MAX_AUCTION_VENDOR_INVITES
        || quotedVendors.some(({ vendorId }) => !invitedVendorSet.has(vendorId));
      if (hasExcludedQuotedVendor && !(typeof nonInvitedJustification === 'string' && nonInvitedJustification.trim())) {
        return apiError(
          UI_STRINGS.appApiProcurementAuctionsRoute.mandatoryJustificationIsRequiredWhenExcludingQuotedVendorsFromTheInvitedList,
          400
        );
      }
    }

    if (!isDraft && normalizedInvitedVendorIds.length === 0) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.atLeastOneVendorMustBeInvitedToScheduleAnAuction, 400);
    }

    if (normalizedInvitedVendorIds.length > 0) {
      const vendorCount = await countByD1FilterChunks(normalizedInvitedVendorIds, (chunk) => prisma.vendor.count({
        where: { tenantId: ctx.tenantId, id: { in: chunk } },
      }));
      if (vendorCount !== normalizedInvitedVendorIds.length) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
    }

    const validatedRfqId = rfqId;
    const linkedRfqLineIds = [...new Set(normalizedItems
      .map((item) => item?.rfqLineId)
      .filter((id): id is string => Boolean(id)))];
    if (linkedRfqLineIds.length > 0) {
      const validRfqLines = await readByD1FilterChunks(linkedRfqLineIds, (chunk) => prisma.rfqLine.findMany({
        where: { tenantId: ctx.tenantId, rfqId: validatedRfqId, id: { in: chunk } },
        select: { id: true },
      }));
      if (validRfqLines.length !== linkedRfqLineIds.length) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
    }

    const now = new Date();
    const start = startTime ? new Date(startTime) : now;
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.pleaseProvideValidStartAndEndDateTime, 400);
    }
    if (!isDraft) {
      if (end <= start) {
        return apiError(UI_STRINGS.common.auctionEndTimeMustBeLaterThanStartTime, 400, { route: '/api/procurement/auctions', method: 'POST' });
      }
    }

    const numericStartPrice = Number(startingPrice || 0);
    const numericMinDecrement = Number(minDecrement || 5000);
    const numericAutoExtensionMinutes = Number(autoExtensionMinutes || 3);
    const numericMaxBids = Number(maxBidsPerParticipant || 10);
    if (!Number.isFinite(numericStartPrice) || numericStartPrice < 0
      || !Number.isFinite(numericMinDecrement) || numericMinDecrement < 0
      || !Number.isFinite(numericAutoExtensionMinutes) || numericAutoExtensionMinutes < 0
      || !Number.isFinite(numericMaxBids) || numericMaxBids < 1) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
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

    const prefix = auctionType === 'SEALED_BID' ? 'SLD' : (auctionType === 'FORWARD_AUCTION' ? 'FWD' : 'AUC');
    const codePrefix = `${prefix}-${now.getFullYear()}-`;
    const createdAuctionId = crypto.randomUUID();
    auctionId = createdAuctionId;

    const effectiveLeadingPrice = auctionType === 'SEALED_BID' ? false : Boolean(hasLeadingPrice);
    const effectiveBidLimit = auctionType === 'SEALED_BID' ? 1 : numericMaxBids;
    const numericRefreshIntervalSeconds = Math.max(5, Math.min(300, Number(refreshIntervalSeconds) || 15));
    const effectiveMinDecrement = hasMinBidReduction ? numericMinDecrement : 0;
    const terms = typeof termsAndConditions === 'string' && termsAndConditions.trim()
      ? termsAndConditions.trim()
      : 'Standard ProCPX Auction Terms & Conditions apply. Bids submitted are binding.';
    const descriptionTemplate = interpolateUiString(
      UI_STRINGS.appApiProcurementAuctionsRoute.auctionTypeAuctionCategoryAuctionNumberTitleValue5ForRFQRfqNumberWithLengthInvitedVendors,
      {
        auctionType,
        auctionCategory,
        auctionNumber: '__D1_AUCTION_NUMBER__',
        title: title.trim(),
        value5: isDraft ? 'saved as Draft' : 'scheduled',
        rfqNumber: rfq.rfqNumber,
        length: normalizedInvitedVendorIds.length,
      },
    );
    const auditValueTemplate = JSON.stringify({
      auctionNumber: '__D1_AUCTION_NUMBER__',
      auctionCategory,
      auctionType,
      currency,
      startingPrice: numericStartPrice,
      minDecrement: effectiveMinDecrement,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status: initialStatus,
      invitedVendorCount: normalizedInvitedVendorIds.length,
    });
    const createdAt = new Date();
    const auditId = crypto.randomUUID();
    const statements: D1BatchInputStatement[] = [{
      sql: AUCTION_INSERT_NEXT_NUMBER_SQL,
      values: [
        createdAuctionId, ctx.tenantId, rfqId, codePrefix, title.trim(), auctionType, auctionCategory, currency,
        typeof scrollingText === 'string' ? scrollingText.trim() || null : null,
        numericRefreshIntervalSeconds, quantityType, Boolean(hasStartPrice), numericStartPrice,
        effectiveLeadingPrice, Boolean(hasMinBidReduction), effectiveMinDecrement, Boolean(hasAutoExtension),
        numericAutoExtensionMinutes, Boolean(hasBidLimit), effectiveBidLimit, Boolean(inviteProjectUser),
        inviteProjectUser && typeof projectUserId === 'string' ? projectUserId : null,
        typeof nonInvitedJustification === 'string' ? nonInvitedJustification.trim() || null : null,
        terms, JSON.stringify(documents || []), initialStatus, effectiveLeadingPrice ? 'LEADERBOARD' : 'RANK_ONLY',
        numericStartPrice > 0 ? numericStartPrice : null, numericStartPrice > 0 ? numericStartPrice : null, null,
        start, end, end, 0, createdAt, createdAt,
      ],
    }, {
      sql: AUCTION_AUDIT_INSERT_AFTER_CREATE_SQL,
      values: [
        auditId, ctx.tenantId, ctx.userId, rfq.projectId,
        isDraft ? 'AUCTION_DRAFT_CREATED' : 'AUCTION_SCHEDULED', descriptionTemplate, auditValueTemplate,
        createdAt, createdAuctionId, ctx.tenantId,
      ],
    }];

    normalizedInvitedVendorIds.forEach((vendorId) => statements.push({
      sql: AUCTION_VENDOR_INSERT_IF_TENANT_VALID_SQL,
      values: [vendorId, ctx.tenantId, crypto.randomUUID(), ctx.tenantId, createdAuctionId, vendorId, createdAt, createdAuctionId, ctx.tenantId],
    }));

    if (!isDraft && initialStatus !== 'CLOSED') {
      normalizedInvitedVendorIds.forEach((vendorId) => {
        const invitation = prepareNotificationOutbox({
          tenantId: ctx.tenantId,
          vendorId,
          title: UI_STRINGS.libNotifications.auctionInvitation,
          message: interpolateUiString(UI_STRINGS.libNotifications.auctionInvitationForTitle, { title: title.trim() })
            .slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH),
          type: 'ACTION_REQUIRED',
          entityType: 'AUCTION',
          entityId: createdAuctionId,
          link: `/vendor-portal/auctions/${createdAuctionId}`,
        }, createdAt, auditId);
        statements.push(invitation.statement);
      });
    }

    validItems.forEach((item) => {
      statements.push({
        sql: AUCTION_ITEM_INSERT_IF_RFQ_LINE_VALID_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, createdAuctionId, rfqId, item.rfqLineId, item.itemCode, item.description,
          item.category, item.subcategory, item.brand, item.uom, item.quantity, item.startPrice, item.startPrice, null,
        ],
      });
    });

    const batchLimitViolation = getD1BatchLimitViolation(statements);
    if (batchLimitViolation) {
      try {
        await writeStructuredLog('warn', 'auction.creation_rejected_batch_limit', {
          operation: 'create_auction', route: '/api/procurement/auctions',
          requestId: req.headers.get('x-request-id') || null,
          tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role,
          violation: batchLimitViolation, statementCount: statements.length,
          bindingCount: statements.reduce((total, statement) => total + statement.values.length, 0),
          invitedVendorCount, itemCount,
        });
      } catch {
        // A rejected request must keep its stable client response if logging is unavailable.
      }
      return apiError(UI_STRINGS.appApiProcurementAuctionsRoute.auctionExceedsSafeAtomicWriteLimit, 400);
    }

    const batchResults = await writeD1BatchAtomically(statements);
    let insertedAuction = batchResults[0]?.results?.[0] as Record<string, unknown> | undefined;
    if (insertedAuction?.id !== createdAuctionId || typeof insertedAuction?.auctionNumber !== 'string') {
      try {
        const persistedAuction = await prisma.auction.findUnique({ where: { id: createdAuctionId } });
        if (persistedAuction) insertedAuction = persistedAuction as unknown as Record<string, unknown>;
      } catch (readError) {
        try {
          await writeStructuredLog('warn', 'auction.created_read_fallback_failed', {
            operation: 'read_created_auction',
            route: '/api/procurement/auctions',
            requestId: req.headers.get('x-request-id') || null,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            auctionId: createdAuctionId,
            error: readError instanceof Error
              ? { name: readError.name, message: readError.message.slice(0, 300) }
              : { type: typeof readError },
          });
        } catch {
          // The write already committed; logging cannot make the caller retry it.
        }
      }
    }

    if (insertedAuction?.id !== createdAuctionId || typeof insertedAuction?.auctionNumber !== 'string') {
      try {
        await writeStructuredLog('error', 'auction.created_response_incomplete', {
          operation: 'return_created_auction',
          route: '/api/procurement/auctions',
          requestId: req.headers.get('x-request-id') || null,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          auctionId: createdAuctionId,
          statementCount: statements.length,
          resultCount: batchResults.length,
        });
      } catch {
        // The write already committed; logging cannot make the caller retry it.
      }
      return apiSuccess({
        auction: { id: createdAuctionId },
        message: isDraft ? UI_STRINGS.common.userMessages.draftSaved : UI_STRINGS.common.userMessages.auctionScheduled,
      }, 201);
    }

    return apiSuccess({
      auction: insertedAuction,
      message: isDraft
        ? interpolateUiString(UI_STRINGS.common.userMessages.auctionSavedSuccessfully, { auctionNumber: insertedAuction.auctionNumber })
        : UI_STRINGS.common.userMessages.auctionScheduled,
    }, 201);
  } catch (error) {
    try {
      await writeStructuredLog('error', 'auction.creation_failed', {
        operation: 'create_auction',
        route: '/api/procurement/auctions',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        rfqId,
        auctionId,
        invitedVendorCount,
        itemCount,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error
          ? { name: error.name, message: error.message.slice(0, 400) }
          : { type: typeof error },
      });
    } catch {
      // Logging failure must not replace the stable API error response.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToCreateAuction, 500);
  }
}
