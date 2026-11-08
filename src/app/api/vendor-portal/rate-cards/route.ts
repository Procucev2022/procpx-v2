// src/app/api/vendor-portal/rate-cards/route.ts
// Vendor Rate Cards listing API (strictly isolated to logged-in vendor)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getListPageWindow, requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  MAX_RATE_CARD_ITEMS,
  RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL,
  RATE_CARD_ITEM_VENDOR_QUOTE_UPDATE_SQL,
  RATE_CARD_VENDOR_ACCEPT_UPDATE_SQL,
  RATE_CARD_VENDOR_QUOTE_UPDATE_SQL,
} from '@/lib/d1-batch.constants';
import { dispatchPreparedWorkflowNotification } from '@/lib/notifications';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { parseStoredJsonObject } from '@/lib/rate-card-utils';
import { VENDOR_RATE_CARD_LIST_PAGE_SIZE } from '@/lib/vendor-rate-card-list.constants';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/rate-cards', method: 'GET' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/rate-cards', method: 'GET' });
  }

  const startedAt = Date.now();
  try {
    const window = getListPageWindow(req.nextUrl.searchParams);
    const search = (req.nextUrl.searchParams.get('search') || '').trim().slice(0, 200);
    const requestedRateCardId = (req.nextUrl.searchParams.get('rateCardId') || '').trim().slice(0, 128);
    const page = requestedRateCardId ? 1 : window.page;
    const pageSize = requestedRateCardId ? 1 : Math.min(window.pageSize, VENDOR_RATE_CARD_LIST_PAGE_SIZE);
    const skip = requestedRateCardId ? 0 : window.skip;
    const where = {
      tenantId: ctx.tenantId,
      vendorId,
      ...(requestedRateCardId
        ? { id: requestedRateCardId }
        : search
          ? { OR: [
            { rateCardNumber: { contains: search } },
            { category: { contains: search } },
            { scope: { contains: search } },
          ] }
          : {}),
    };
    const [rateCards, total] = await Promise.all([
      prisma.vendorRateCard.findMany({
        where,
        include: { items: {
          where: { isActive: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: MAX_RATE_CARD_ITEMS + 1,
        } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.vendorRateCard.count({ where }),
    ]);

    const oversizedRateCardCount = rateCards.filter((rateCard) => rateCard.items.length > MAX_RATE_CARD_ITEMS).length;
    if (oversizedRateCardCount > 0) {
      await writeStructuredLog('warn', 'vendor_portal.rate_card_items_limit_exceeded', {
        operation: 'list_vendor_rate_cards', route: '/api/vendor-portal/rate-cards',
        requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
        actorId: ctx.userId, vendorId, oversizedRateCardCount, maxItems: MAX_RATE_CARD_ITEMS,
      });
      return apiError(UI_STRINGS.common.userMessages.failedToFetchRateCards, 500);
    }

    const invalidStoredFields: Array<{ rateCardId: string; recordId: string; field: string }> = [];
    const formatted = rateCards.map((rc) => {
      const enrichedItems = rc.items.map((it) => {
        const parsedMeta = parseStoredJsonObject(it.comparisonRef);
        if (it.comparisonRef && !parsedMeta) invalidStoredFields.push({ rateCardId: rc.id, recordId: it.id, field: 'comparisonRef' });
        const meta = parsedMeta || {};
        return {
          ...it,
          buyerOffer1: meta.buyerOffer1 !== undefined ? meta.buyerOffer1 : it.rate,
          vendorQuote1: meta.vendorQuote1 !== undefined ? meta.vendorQuote1 : it.proposedRate,
          buyerOffer2: meta.buyerOffer2 !== undefined ? meta.buyerOffer2 : null,
          vendorQuote2: meta.vendorQuote2 !== undefined ? meta.vendorQuote2 : null,
          finalAgreedRate: meta.finalAgreedRate !== undefined ? meta.finalAgreedRate : (rc.status === 'APPROVED' || rc.status === 'FINAL_VENDOR_OFFER_ACCEPTED' ? it.rate : null),
          previousPpoRate: meta.previousPpoRate !== undefined ? meta.previousPpoRate : it.historicalRate,
          referenceQty: meta.referenceQty !== undefined ? meta.referenceQty : (it.minQuantity || 1),
          remarks: meta.remarks || '',
          variance: it.benchmarkRate ? Math.round(((it.rate - it.benchmarkRate) / it.benchmarkRate) * 100) : 0,
        };
      });

      const parsedNotes = parseStoredJsonObject(rc.notes);
      if (rc.notes && !parsedNotes) invalidStoredFields.push({ rateCardId: rc.id, recordId: rc.id, field: 'notes' });
      const notesData = parsedNotes || {};

      return {
        ...rc,
        items: enrichedItems,
        itemCount: rc.items.length,
        agreement: notesData.agreement || null,
      };
    });

    if (invalidStoredFields.length > 0) {
      await writeStructuredLog('warn', 'vendor_portal.rate_card_metadata_invalid', {
        operation: 'list_vendor_rate_cards', route: '/api/vendor-portal/rate-cards',
        requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
        actorId: ctx.userId, vendorId, invalidFieldCount: invalidStoredFields.length,
        invalidFields: invalidStoredFields.slice(0, 20),
      });
    }

    return apiSuccess({ rateCards: formatted, total, page, pageSize, hasMore: skip + formatted.length < total });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'vendor_portal.rate_cards_fetch_failed', {
      operation: 'list_vendor_rate_cards', route: '/api/vendor-portal/rate-cards',
      requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
      actorId: ctx.userId, vendorId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRateCards, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/rate-cards', method: 'POST' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/rate-cards', method: 'POST' });
  }

  const startedAt = Date.now();
  let rateCardId: string | undefined;
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardIDIsRequired, 400);
    }
    const input = body as Record<string, unknown>;
    rateCardId = typeof input.rateCardId === 'string' ? input.rateCardId.trim() : undefined;
    const items = Array.isArray(input.items) ? input.items : [];
    const remarks = typeof input.remarks === 'string' ? input.remarks.slice(0, 1000) : '';
    const action = typeof input.action === 'string' ? input.action : undefined;

    if (!rateCardId) {
      return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardIDIsRequired, 400, { route: '/api/vendor-portal/rate-cards', method: 'POST' });
    }

    const rateCard = await prisma.vendorRateCard.findFirst({
      where: {
        id: rateCardId,
        vendorId,
        tenantId: ctx.tenantId,
      },
      include: {
        vendor: { select: { id: true, name: true } },
        items: {
          where: { isActive: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: MAX_RATE_CARD_ITEMS + 1,
        },
      },
    });

    if (!rateCard) {
      return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardNotFoundOrAccessDenied, 404, { route: '/api/vendor-portal/rate-cards', method: 'POST' });
    }

    if (rateCard.items.length > MAX_RATE_CARD_ITEMS) {
      await writeStructuredLog('warn', 'vendor_portal.rate_card_items_limit_exceeded', {
        operation: 'submit_vendor_rate_card', route: '/api/vendor-portal/rate-cards',
        requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
        actorId: ctx.userId, vendorId, rateCardId, itemCountAtLeast: rateCard.items.length, maxItems: MAX_RATE_CARD_ITEMS,
      });
      return apiError(UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, 500);
    }

    const now = new Date();
    const vendorUserName = rateCard.vendor.name || ctx.userName || 'Vendor User';

    // Workflow writes must not replace unreadable stored history with an empty object.
    const notesData = parseStoredJsonObject(rateCard.notes);
    if (!notesData) {
      await writeStructuredLog('error', 'rate_card.workflow_metadata_invalid', {
        operation: 'submit_vendor_rate_card', route: '/api/vendor-portal/rate-cards',
        requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
        actorId: ctx.userId, vendorId, rateCardId, field: 'notes', action: action || 'SUBMIT_VENDOR_QUOTE',
        durationMs: Date.now() - startedAt,
      });
      return apiError(UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, 500);
    }

    // ── CASE 1: VENDOR_ACCEPT (Accept Final Rate Card Version & Terms) ──
    if (action === 'VENDOR_ACCEPT') {
      if (rateCard.status !== 'CATEGORY_MANAGER_ACCEPTED') {
        return apiError(interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorAcceptanceRequiresPriorCategoryManagerAcceptanceCurrentStatusStatus, { "status": rateCard.status }), 400, { route: '/api/vendor-portal/rate-cards', method: 'POST' });
      }

      const signature = input.signature && typeof input.signature === 'object' && !Array.isArray(input.signature)
        ? input.signature as Record<string, unknown>
        : undefined;
      const isSigned = signature?.verified === true;

      if (notesData.agreement && typeof notesData.agreement === 'object' && !Array.isArray(notesData.agreement)) {
        const agreement = notesData.agreement as Record<string, unknown>;
        if (isSigned) {
          agreement.status = 'SIGNED';
          agreement.signature = {
            signedBy: typeof signature.signedBy === 'string' ? signature.signedBy.slice(0, 200) : '',
            designation: typeof signature.designation === 'string' ? signature.designation.slice(0, 200) : '',
            signedAt: typeof signature.signedAt === 'string' ? signature.signedAt.slice(0, 80) : now.toISOString(),
            signatureType: typeof signature.signatureType === 'string' ? signature.signatureType.slice(0, 80) : 'DIGITAL_VERIFIED',
            signatureEvidenceId: typeof signature.signatureEvidenceId === 'string'
              ? signature.signatureEvidenceId.slice(0, 200)
              : `DSC-${now.getFullYear()}-${rateCard.rateCardNumber}`,
            verified: true,
          };
        } else {
          agreement.status = 'VENDOR_ACCEPTED';
          agreement.signature = null;
        }
      }

      notesData.vendorAccepted = {
        actor: vendorUserName,
        timestamp: now.toISOString(),
        remarks: remarks || 'Vendor accepted final negotiated rate card agreement and commercial terms',
        hasSignature: isSigned,
      };

      // Canonical Sequence: Vendor Acceptance -> Level 1 Project Approver Approval
      const approvalId = crypto.randomUUID();
      const auditLogId = crypto.randomUUID();
      const notification = prepareNotificationOutbox({
        tenantId: ctx.tenantId,
        title: UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardAcceptedByVendorLevel1ProjectApprovalRequired,
        message: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorVendorUserNameAcceptedRateCardRateCardNumberLevel1ProjectApprovalIsNowRequired, { vendorUserName, rateCardNumber: rateCard.rateCardNumber }),
        type: 'ACTION_REQUIRED',
        entityType: 'RATE_CARD',
        entityId: rateCardId,
        recordNumber: rateCard.rateCardNumber,
        targetRole: 'PROJECT_APPROVER',
        link: '/approvals/rate-cards',
      }, now, auditLogId);
      const approvalRemarks = isSigned
        ? `Vendor ${vendorUserName} accepted terms & executed digital signature (${typeof signature?.signatureEvidenceId === 'string' ? signature.signatureEvidenceId.slice(0, 200) : ''})`
        : remarks || 'Vendor accepted final negotiated rate card agreement';
      const auditDescription = interpolateUiString(
        UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorVendorUserNameAcceptedFinalRateCardRateCardNumberTermsRoutedToLevel1ProjectApprover,
        { vendorUserName, rateCardNumber: rateCard.rateCardNumber },
      );
      const results = await writeD1BatchAtomically([
        {
          sql: RATE_CARD_VENDOR_ACCEPT_UPDATE_SQL,
          values: [JSON.stringify(notesData), now, rateCardId, ctx.tenantId, vendorId],
        },
        {
          sql: RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL,
          values: [approvalId, ctx.tenantId, rateCardId, 'LEVEL_1_PROJECT', ctx.userId, vendorUserName, ctx.userEmail || null, 'VENDOR_ACCEPTED', approvalRemarks, now],
        },
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [auditLogId, ctx.tenantId, ctx.userId, null, 'VENDOR', vendorId, 'RATE_CARD_VENDOR_ACCEPTED', auditDescription,
            JSON.stringify({ status: rateCard.status }), JSON.stringify({ status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT', isSigned }), null, null, now],
        },
        notification.statement,
      ]);
      if (results.some((result) => Number(result.meta?.changes || 0) !== 1)) throw new Error();
      await dispatchPreparedWorkflowNotification(notification.id, now, {
        tenantId: ctx.tenantId, entityType: 'RATE_CARD', entityId: rateCardId, route: '/api/vendor-portal/rate-cards',
      });
      const updated = { ...rateCard, status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT', notes: JSON.stringify(notesData), updatedAt: now };

      return apiSuccess({
        message: UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardFinalTermsAcceptedRequestForwardedToLevel1ProjectApproverQueue,
        rateCard: updated,
      });
    }

    // Determine round from action or current rate card status
    const isRound2 = action === 'SUBMIT_VENDOR_QUOTE_2' || rateCard.status === 'ROUND_2_BUYER_OFFER';
    const roundTarget = isRound2 ? 2 : 1;
    const newStatus = isRound2 ? 'ROUND_2_VENDOR_QUOTE' : 'ROUND_1_VENDOR_QUOTE';
    const expectedStatus = isRound2 ? 'ROUND_2_BUYER_OFFER' : 'ROUND_1_BUYER_OFFER';
    if (rateCard.status !== expectedStatus || (action && action !== `SUBMIT_VENDOR_QUOTE_${roundTarget}`)) {
      return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorQuoteSubmissionRequiresBuyerOfferStage, 400);
    }
    if (items.length === 0 || items.length > MAX_RATE_CARD_ITEMS) {
      return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorQuoteSubmissionRequiresValidLineItems, 400);
    }

    const seenItemIds = new Set<string>();
    const quoteItems: Array<{ id: string; rate: number; comparisonRef: string }> = [];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorQuoteSubmissionRequiresValidLineItems, 400);
      }
      const quoteItem = rawItem as Record<string, unknown>;
      const itemId = typeof quoteItem.id === 'string' ? quoteItem.id.trim() : '';
      const existingItem = rateCard.items.find((candidate) => candidate.id === itemId);
      const rate = Number(quoteItem.proposedRate !== undefined ? quoteItem.proposedRate : quoteItem.rate);
      if (!itemId || seenItemIds.has(itemId) || !existingItem || !Number.isFinite(rate) || rate <= 0) {
        return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorQuoteSubmissionRequiresValidLineItems, 400);
      }
      seenItemIds.add(itemId);
      const comparisonData = parseStoredJsonObject(existingItem.comparisonRef);
      if (!comparisonData) {
        await writeStructuredLog('error', 'rate_card.workflow_metadata_invalid', {
          operation: 'submit_vendor_rate_card', route: '/api/vendor-portal/rate-cards',
          requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
          actorId: ctx.userId, vendorId, rateCardId, itemId, field: 'comparisonRef',
          action: action || 'SUBMIT_VENDOR_QUOTE', durationMs: Date.now() - startedAt,
        });
        return apiError(UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, 500);
      }
      comparisonData[roundTarget === 1 ? 'vendorQuote1' : 'vendorQuote2'] = rate;
      quoteItems.push({ id: itemId, rate, comparisonRef: JSON.stringify(comparisonData) });
    }

    // Update rateCard notes and status
    if (roundTarget === 1) {
      const priorRound = notesData.round1 && typeof notesData.round1 === 'object' && !Array.isArray(notesData.round1)
        ? notesData.round1 as Record<string, unknown> : {};
      notesData.round1 = {
        ...priorRound,
        vendorQuote1Date: now.toISOString(),
        vendorQuote1Actor: vendorUserName,
        vendorQuote1Remarks: remarks,
      };
    } else {
      const priorRound = notesData.round2 && typeof notesData.round2 === 'object' && !Array.isArray(notesData.round2)
        ? notesData.round2 as Record<string, unknown> : {};
      notesData.round2 = {
        ...priorRound,
        vendorQuote2Date: now.toISOString(),
        vendorQuote2Actor: vendorUserName,
        vendorQuote2Remarks: remarks,
      };
    }

    const auditLogId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const notification = prepareNotificationOutbox({
      tenantId: ctx.tenantId,
      title: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorRCQuoteRoundTargetSubmitted, { roundTarget }),
      message: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorVendorUserNameSubmittedVendorRCQuoteRoundTargetForRateCardRateCardNumber, { vendorUserName, roundTarget, rateCardNumber: rateCard.rateCardNumber }),
      type: 'ACTION_REQUIRED',
      entityType: 'RATE_CARD',
      entityId: rateCardId,
      recordNumber: rateCard.rateCardNumber,
      targetRole: 'CATEGORY_MANAGER',
      link: '/procurement/rate-cards',
    }, now, auditLogId);
    const approvalRemarks = remarks || `Vendor submitted Vendor RC Quote-${roundTarget} for commercial review`;
    const auditAction = `RATE_CARD_VENDOR_QUOTE_${roundTarget}_SUBMITTED`;
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorRCQuoteRoundTargetSubmittedForRateCardRateCardNumber,
      { roundTarget, rateCardNumber: rateCard.rateCardNumber },
    );
    const batch = [
      {
        sql: RATE_CARD_VENDOR_QUOTE_UPDATE_SQL,
        values: [newStatus, JSON.stringify(notesData), now, rateCardId, ctx.tenantId, vendorId, rateCard.status,
          JSON.stringify(quoteItems.map(({ id }) => id)), quoteItems.length],
      },
      ...quoteItems.map((item) => ({
        sql: RATE_CARD_ITEM_VENDOR_QUOTE_UPDATE_SQL,
        values: [item.rate, item.comparisonRef, now, item.id, ctx.tenantId, rateCardId, newStatus],
      })),
      {
        sql: RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL,
        values: [approvalId, ctx.tenantId, rateCardId, rateCard.approvalLevel || 'LEVEL_1_PROJECT', ctx.userId,
          vendorUserName, ctx.userEmail || null, `VENDOR_QUOTE_${roundTarget}_SUBMITTED`, approvalRemarks, now],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditLogId, ctx.tenantId, ctx.userId, null, 'VENDOR', vendorId, auditAction, auditDescription,
          JSON.stringify({ status: rateCard.status }), JSON.stringify({ status: newStatus, round: roundTarget }), null, null, now],
      },
      notification.statement,
    ];
    const results = await writeD1BatchAtomically(batch);
    if (results.some((result) => Number(result.meta?.changes || 0) !== 1)) throw new Error();
    await dispatchPreparedWorkflowNotification(notification.id, now, {
      tenantId: ctx.tenantId, entityType: 'RATE_CARD', entityId: rateCardId, route: '/api/vendor-portal/rate-cards',
    });
    const updatedCard = { ...rateCard, status: newStatus, notes: JSON.stringify(notesData), updatedAt: now };

    return apiSuccess({
      message: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorRCQuoteRoundTargetSuccessfullySubmittedForCommercialReview, { "roundTarget": roundTarget }),
      rateCardId,
      rateCard: updatedCard,
    });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'vendor_portal.rate_card_submission_failed', {
      operation: 'submit_vendor_rate_card', route: '/api/vendor-portal/rate-cards',
      requestId: req.headers.get('x-request-id') || undefined,
      tenantId: ctx.tenantId, actorId: ctx.userId, vendorId, rateCardId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals, 500);
  }
}
