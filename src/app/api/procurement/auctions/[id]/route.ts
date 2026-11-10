// app/api/procurement/auctions/[id]/route.ts
// Handles auction detail, server-authoritative status evaluation, buyer live controls, and draft updates
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, AUCTION_AUTO_CLOSE_IF_DUE_SQL, AUCTION_AUTO_START_IF_DUE_SQL, AUCTION_CONCLUDE_IF_EXPECTED_SQL, AUCTION_DELETE_DRAFT_WITHOUT_BIDS_SQL, AUCTION_DRAFT_UPDATE_IF_EXPECTED_SQL, AUCTION_EXTEND_IF_EXPECTED_SQL, AUCTION_STATUS_UPDATE_IF_EXPECTED_SQL } from '@/lib/d1-batch.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';

function getRequestId(req: NextRequest): string | undefined {
  const value = req.headers.get('x-request-id') || req.headers.get('cf-ray');
  return value && value.length <= 128 ? value : undefined;
}

async function writeAuctionChange(input: {
  sql: string;
  values: unknown[];
  tenantId: string;
  userId: string | null;
  projectId: string | null;
  auctionId: string;
  action: string;
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
  changedAt: Date;
  requestId?: string;
}): Promise<boolean> {
  const auditId = crypto.randomUUID();
  const results = await writeD1BatchAtomically([
    { sql: input.sql, values: input.values },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, input.tenantId, input.userId, input.projectId, 'AUCTION', input.auctionId,
        input.action, input.description,
        input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
        input.newValue === undefined ? null : JSON.stringify(input.newValue),
        null, null, input.changedAt],
    },
  ]);
  const changed = Number(results[0]?.meta?.changes || 0) === 1;
  const audited = Number(results[1]?.meta?.changes || 0) === 1;
  if (changed && !audited) {
    await writeStructuredLog('error', 'auction.transition_audit_missing', {
      operation: input.action.toLowerCase(), route: '/api/procurement/auctions/[id]',
      requestId: input.requestId, tenantId: input.tenantId, userId: input.userId,
      auctionId: input.auctionId, auditId, action: input.action, durationMs: Date.now() - input.changedAt.getTime(),
    }, 'application');
  }
  return changed;
}


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const requestId = getRequestId(req);
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const { pageSize } = getListPageWindow(searchParams);
  const beforeId = searchParams.get('beforeId')?.trim().slice(0, 128) || '';
  const beforeTimestampRaw = searchParams.get('beforeTimestamp') || '';
  if (Boolean(beforeId) !== Boolean(beforeTimestampRaw)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  const beforeTimestamp = beforeTimestampRaw ? new Date(beforeTimestampRaw) : null;
  if (beforeTimestampRaw && (!beforeTimestamp || Number.isNaN(beforeTimestamp.getTime()))) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  const bidCursorWhere = beforeId && beforeTimestamp ? {
    OR: [
      { timestamp: { lt: beforeTimestamp } },
      { timestamp: beforeTimestamp, id: { lt: beforeId } },
    ],
  } : {};

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
      },
    });

    if (!auction) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionEventNotFoundOrAccessDenied, 404, { route: '/api/procurement/auctions/[id]', method: 'GET' });
    }

    // Auto-update status if time has progressed
    let currentStatus = auction.status;
    if (auction.status === 'SCHEDULED' && auction.startTime <= now && auction.endTime > now) {
      const changed = await writeAuctionChange({
        sql: AUCTION_AUTO_START_IF_DUE_SQL,
        values: [now.toISOString(), id, ctx.tenantId, now.toISOString(), now.toISOString()],
        tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
        auctionId: auction.id, action: 'AUCTION_AUTO_STARTED', changedAt: now, requestId,
        oldValue: { status: 'SCHEDULED' }, newValue: { status: 'LIVE' },
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberAutomaticallyStartedAtScheduledTime, {
          auctionNumber: auction.auctionNumber,
        }),
      });
      if (changed) currentStatus = 'LIVE';
      else {
        const latest = await prisma.auction.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { status: true } });
        if (latest?.status) currentStatus = latest.status;
      }
    } else if (
      (auction.status === 'LIVE' || auction.status === 'EXTENDED' || auction.status === 'SCHEDULED') &&
      auction.endTime <= now
    ) {
      const changed = await writeAuctionChange({
        sql: AUCTION_AUTO_CLOSE_IF_DUE_SQL,
        values: [now.toISOString(), id, ctx.tenantId, auction.status, now.toISOString()],
        tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
        auctionId: auction.id, action: 'AUCTION_AUTO_CLOSED', changedAt: now, requestId,
        oldValue: { status: auction.status }, newValue: { status: 'CLOSED' },
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberAutomaticallyClosedAtScheduledEndTime, {
          auctionNumber: auction.auctionNumber,
        }),
      });
      if (changed) currentStatus = 'CLOSED';
      else {
        const latest = await prisma.auction.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { status: true } });
        if (latest?.status) currentStatus = latest.status;
      }
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

    const bidVendorScope = isSealedAndActive && ctx.role === 'VENDOR' && userVendorId
      ? { vendorId: userVendorId }
      : {};
    const fetchedBidPage = await prisma.auctionBid.findMany({
      where: { tenantId: ctx.tenantId, auctionId: auction.id, ...bidVendorScope, ...bidCursorWhere },
      take: pageSize + 1,
      include: {
        vendor: { select: { id: true, name: true, code: true } },
        auctionItem: { select: { id: true, itemCode: true, description: true } },
      },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    });
    const hasMoreBids = fetchedBidPage.length > pageSize;
    const bidPage = hasMoreBids ? fetchedBidPage.slice(0, pageSize) : fetchedBidPage;

    // Filter bids according to role and confidentiality rules
    let visibleBids = bidPage.map((b) => {
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
      await writeStructuredLog('warn', 'auction.documents_invalid', {
        operation: 'parse_stored_auction_documents', route: '/api/procurement/auctions/[id]',
        requestId, tenantId: ctx.tenantId, userId: ctx.userId, auctionId: auction.id,
        field: 'documents', fallback: 'empty_array', durationMs: Date.now() - startedAt,
      }, 'application');
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
          bidCount: isSealedAndActive && ctx.role === 'VENDOR' && v.vendorId !== userVendorId ? null : v.bidsCount,
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
      bidHistory: {
        pageSize,
        hasMore: hasMoreBids,
        nextCursor: hasMoreBids && bidPage.length > 0 ? {
          beforeId: bidPage[bidPage.length - 1].id,
          beforeTimestamp: bidPage[bidPage.length - 1].timestamp.toISOString(),
        } : null,
      },
      currentVendorParticipation,
      isObserver,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    await writeStructuredLog('error', 'auction.detail_read_failed', {
      operation: 'read_auction_detail', route: '/api/procurement/auctions/[id]', requestId,
      tenantId: ctx.tenantId, userId: ctx.userId, auctionId: id, durationMs: Date.now() - startedAt, error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchAuctionDetails, 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  try {
    const parsedBody: unknown = await req.json();
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const body = parsedBody as Record<string, unknown>;
    const { action, extensionMinutes, reason, ...updateFields } = body;
    if (action !== undefined && (typeof action !== 'string'
      || !['PAUSE', 'RESUME', 'EXTEND', 'CONCLUDE', 'CANCEL'].includes(action))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

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
      const changedAt = new Date();
      const changed = await writeAuctionChange({
        sql: AUCTION_STATUS_UPDATE_IF_EXPECTED_SQL,
        values: ['PAUSED', changedAt.toISOString(), id, ctx.tenantId, auction.status],
        tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
        auctionId: auction.id, action: 'AUCTION_PAUSED', changedAt, requestId,
        oldValue: { status: auction.status }, newValue: { status: 'PAUSED' },
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberWasPausedByBuyer, { auctionNumber: auction.auctionNumber }),
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionPausedSuccessfully });
    }

    if (action === 'RESUME') {
      if (auction.status !== 'PAUSED') {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyPausedAuctionsCanBeResumed, 400, { route: '/api/procurement/auctions/[id]', method: 'PUT' });
      }
      const changedAt = new Date();
      const changed = await writeAuctionChange({
        sql: AUCTION_STATUS_UPDATE_IF_EXPECTED_SQL,
        values: ['LIVE', changedAt.toISOString(), id, ctx.tenantId, auction.status],
        tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
        auctionId: auction.id, action: 'AUCTION_RESUMED', changedAt, requestId,
        oldValue: { status: 'PAUSED' }, newValue: { status: 'LIVE' },
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberWasResumedByBuyer, { auctionNumber: auction.auctionNumber }),
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionResumedSuccessfully });
    }

    if (action === 'EXTEND') {
      if (auction.status !== 'LIVE' && auction.status !== 'EXTENDED') {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyLiveOrExtendedAuctionsCanBeExtended, 400);
      }
      const parsedMinutes = Number(extensionMinutes);
      const minutesToAdd = extensionMinutes === undefined || extensionMinutes === null || extensionMinutes === '' || parsedMinutes === 0
        ? 5
        : parsedMinutes;
      if (!Number.isSafeInteger(minutesToAdd) || minutesToAdd < 1 || minutesToAdd > 60) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      const currentEnd = new Date(auction.endTime);
      const newEnd = new Date(currentEnd.getTime() + minutesToAdd * 60 * 1000);
      const changedAt = new Date();
      const changed = await writeAuctionChange({
        sql: AUCTION_EXTEND_IF_EXPECTED_SQL,
        values: [newEnd.toISOString(), newEnd.toISOString(), changedAt.toISOString(), id, ctx.tenantId, auction.status],
        tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
        auctionId: auction.id, action: 'AUCTION_EXTENDED_MANUALLY', changedAt, requestId,
        oldValue: { status: auction.status, endTime: currentEnd.toISOString(), extensionCount: auction.extensionCount },
        newValue: { status: 'EXTENDED', endTime: newEnd.toISOString(), extensionCount: auction.extensionCount + 1 },
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberExtendedByMinutesToAddMinutesNewScheduledEndTimeToISOString, {
          auctionNumber: auction.auctionNumber, minutesToAdd, toISOString: newEnd.toISOString(),
        }),
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

      return apiSuccess({
        message: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionExtendedByMinutesToAddMinutes, { "minutesToAdd": minutesToAdd }),
        newEndTime: newEnd.toISOString(),
      });
    }

    if (action === 'CONCLUDE') {
      if (!['LIVE', 'EXTENDED', 'PAUSED', 'SCHEDULED'].includes(auction.status)) {
        return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      }
      const changedAt = new Date();
      const changed = await writeAuctionChange({
        sql: AUCTION_CONCLUDE_IF_EXPECTED_SQL,
        values: [changedAt.toISOString(), changedAt.toISOString(), id, ctx.tenantId, auction.status],
        tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
        auctionId: auction.id, action: 'AUCTION_CONCLUDED', changedAt, requestId,
        oldValue: { status: auction.status }, newValue: { status: 'CLOSED', endTime: changedAt.toISOString() },
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberConcludedByBuyer, { auctionNumber: auction.auctionNumber }),
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionConcludedSuccessfully });
    }

    if (action === 'CANCEL') {
      if (typeof reason !== 'undefined' && typeof reason !== 'string') return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      if (['CLOSED', 'CANCELLED', 'COMPLETED'].includes(auction.status)) {
        return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      }
      const changedAt = new Date();
      const cancellationReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 1000) : 'Operational cancellation';
      const changed = await writeAuctionChange({
        sql: AUCTION_STATUS_UPDATE_IF_EXPECTED_SQL,
        values: ['CANCELLED', changedAt.toISOString(), id, ctx.tenantId, auction.status],
        tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
        auctionId: auction.id, action: 'AUCTION_CANCELLED', changedAt, requestId,
        oldValue: { status: auction.status }, newValue: { status: 'CANCELLED', reason: cancellationReason },
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberCancelledByBuyerReasonValue2, {
          auctionNumber: auction.auctionNumber, value2: cancellationReason,
        }),
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

      return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionCancelledSuccessfully });
    }

    if (auction.status !== 'DRAFT') {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.onlyDraftAuctionsCanBeReConfigured, 400, { route: '/api/procurement/auctions/[id]', method: 'PUT' });
    }

    if ((updateFields.title !== undefined && typeof updateFields.title !== 'string')
      || (updateFields.scrollingText !== undefined && updateFields.scrollingText !== null && typeof updateFields.scrollingText !== 'string')
      || (updateFields.termsAndConditions !== undefined && updateFields.termsAndConditions !== null && typeof updateFields.termsAndConditions !== 'string')
      || (updateFields.scheduleNow !== undefined && typeof updateFields.scheduleNow !== 'boolean')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const refreshIntervalSeconds = updateFields.refreshIntervalSeconds
      ? Number(updateFields.refreshIntervalSeconds)
      : auction.refreshIntervalSeconds;
    const startingPrice = updateFields.startingPrice ? Number(updateFields.startingPrice) : Number(auction.startingPrice);
    const minDecrement = updateFields.minDecrement ? Number(updateFields.minDecrement) : Number(auction.minDecrement);
    if (!Number.isSafeInteger(refreshIntervalSeconds) || refreshIntervalSeconds < 1 || refreshIntervalSeconds > 300
      || !Number.isFinite(startingPrice) || startingPrice <= 0
      || !Number.isFinite(minDecrement) || minDecrement <= 0) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const changedAt = new Date();
    const title = typeof updateFields.title === 'string' && updateFields.title.trim()
      ? updateFields.title
      : auction.title;
    const scrollingText = updateFields.scrollingText !== undefined ? updateFields.scrollingText : auction.scrollingText;
    const termsAndConditions = updateFields.termsAndConditions || auction.termsAndConditions;
    const status = updateFields.scheduleNow === true ? 'SCHEDULED' : 'DRAFT';
    const changed = await writeAuctionChange({
      sql: AUCTION_DRAFT_UPDATE_IF_EXPECTED_SQL,
      values: [title, scrollingText, refreshIntervalSeconds, startingPrice, minDecrement, termsAndConditions,
        status, changedAt.toISOString(), id, ctx.tenantId],
      tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq.projectId,
      auctionId: auction.id, action: 'AUCTION_DRAFT_UPDATED', changedAt, requestId,
      oldValue: { title: auction.title, status: auction.status },
      newValue: { title, status, scrollingText, refreshIntervalSeconds, startingPrice, minDecrement, termsAndConditions },
      description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberDraftConfigurationUpdatedByBuyer, {
        auctionNumber: auction.auctionNumber,
      }),
    });
    if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    const updated = {
      ...auction, title, scrollingText, refreshIntervalSeconds, startingPrice, minDecrement,
      termsAndConditions, status, updatedAt: changedAt,
    };

    return apiSuccess({ auction: updated, message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionDraftUpdatedSuccessfully });
  } catch (error) {
    await writeStructuredLog('error', 'auction.update_failed', {
      operation: 'update_auction', route: '/api/procurement/auctions/[id]', requestId,
      tenantId: ctx.tenantId, userId: ctx.userId, auctionId: id, durationMs: Date.now() - startedAt, error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateAuction, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  try {
    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { rfq: { select: { projectId: true } }, _count: { select: { bids: true } } },
    });

    if (!auction) {
      return apiError(UI_STRINGS.common.auctionNotFound, 404, { route: '/api/procurement/auctions/[id]', method: 'DELETE' });
    }

    if (auction.status !== 'DRAFT' || auction._count.bids > 0) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdRoute.cannotDeleteAnAuctionThatHasAlreadyBeenScheduledOrReceivedBids, 400);
    }

    const changedAt = new Date();
    const deleted = await writeAuctionChange({
      sql: AUCTION_DELETE_DRAFT_WITHOUT_BIDS_SQL,
      values: [id, ctx.tenantId, id, ctx.tenantId],
      tenantId: ctx.tenantId, userId: ctx.userId, projectId: auction.rfq?.projectId || null,
      auctionId: auction.id, action: 'AUCTION_DELETED', changedAt, requestId,
      oldValue: { auctionNumber: auction.auctionNumber, status: auction.status },
      description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionAuctionNumberDeletedByBuyer, {
        auctionNumber: auction.auctionNumber,
      }),
    });
    if (!deleted) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

    return apiSuccess({ message: UI_STRINGS.appApiProcurementAuctionsIdRoute.auctionDeletedSuccessfully });
  } catch (error) {
    await writeStructuredLog('error', 'auction.delete_failed', {
      operation: 'delete_auction', route: '/api/procurement/auctions/[id]', requestId,
      tenantId: ctx.tenantId, userId: ctx.userId, auctionId: id, durationMs: Date.now() - startedAt, error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToDeleteAuction, 500);
  }
}
