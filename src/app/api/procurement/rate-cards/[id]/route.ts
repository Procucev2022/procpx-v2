// src/app/api/procurement/rate-cards/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  RATE_CARD_CATEGORY_ACCEPT_UPDATE_SQL,
  RATE_CARD_CATEGORY_SIGNOFF_UPDATE_SQL,
  RATE_CARD_DETAIL_AUDIT_AFTER_UPDATE_SQL,
  RATE_CARD_DETAIL_ITEMS_DELETE_AFTER_UPDATE_SQL,
  RATE_CARD_DETAIL_ITEMS_UPSERT_JSON_SQL,
  RATE_CARD_DETAIL_UPDATE_SQL,
  RATE_CARD_AUDIT_INSERT_AFTER_ITEMS_UPDATE_SQL,
  RATE_CARD_BUYER_OFFER2_UPDATE_SQL,
  RATE_CARD_BUYER_OFFER2_DRAFT_UPDATE_SQL,
  RATE_CARD_DRAFT_DELETE_AFTER_AUDIT_SQL,
  RATE_CARD_DRAFT_DELETE_AUDIT_SQL,
  RATE_CARD_FINAL_VENDOR_OFFER_UPDATE_SQL,
  RATE_CARD_ITEMS_JSON_UPDATE_AFTER_CARD_SQL,
  MAX_RATE_CARD_ITEMS,
} from '@/lib/d1-batch.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareRateCardNotificationOutbox } from '@/lib/notification-outbox';
import { dispatchPreparedWorkflowNotification } from '@/lib/notifications';
import { MAX_RATE_CARD_NOTES_LENGTH, MAX_RATE_CARD_TERMS_LENGTH, MAX_RATE_CARD_TEXT_LENGTH } from '../route.constants';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '@/lib/rate-card-approval-history.constants';
import { getRateCardApprovalHistoryMetadata, paginateRateCardApprovalHistory } from '@/lib/rate-card-approval-history';
import type { RateCardDetailItemInput, RateCardDetailUpdateBody, RateCardItemStateUpdate } from '@app-types/app/api/procurement/rate-card-detail.types';
import { parseStoredJsonObject } from '@/lib/rate-card-utils';

async function writeRateCardEvent(input: {
  updateSql: string;
  updateValues: unknown[];
  tenantId: string;
  userId: string;
  vendorId: string;
  rateCardId: string;
  action: string;
  description: string;
  newValue: unknown;
  notification: Parameters<typeof prepareRateCardNotificationOutbox>[0];
  now: Date;
}): Promise<boolean> {
  const auditId = crypto.randomUUID();
  const notification = prepareRateCardNotificationOutbox(input.notification, input.rateCardId, input.now, auditId);
  const results = await writeD1BatchAtomically([
    { sql: input.updateSql, values: input.updateValues },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [auditId, input.tenantId, input.userId, null, 'VENDOR', input.vendorId, input.action,
        input.description, null, JSON.stringify(input.newValue), null, null, input.now],
    },
    notification.statement,
  ]);
  if (results.some((result) => Number(result.meta?.changes || 0) !== 1)) return false;
  await dispatchPreparedWorkflowNotification(notification.id, input.now, {
    tenantId: input.tenantId, entityType: 'RATE_CARD', entityId: input.rateCardId,
    route: '/api/procurement/rate-cards/[id]',
  });
  return true;
}

async function writeRateCardItemEvent(input: {
  updateSql: string;
  updateValues: unknown[];
  itemUpdates: RateCardItemStateUpdate[];
  tenantId: string;
  userId: string;
  vendorId: string;
  rateCardId: string;
  status: string;
  action: string;
  description: string;
  newValue: unknown;
  notification: Parameters<typeof prepareRateCardNotificationOutbox>[0];
  now: Date;
}): Promise<boolean> {
  const itemsJson = JSON.stringify(input.itemUpdates);
  const auditId = crypto.randomUUID();
  const notification = prepareRateCardNotificationOutbox(input.notification, input.rateCardId, input.now, auditId);
  const results = await writeD1BatchAtomically([
    { sql: input.updateSql, values: input.updateValues },
    {
      sql: RATE_CARD_ITEMS_JSON_UPDATE_AFTER_CARD_SQL,
      values: [itemsJson, itemsJson, input.now, input.tenantId, input.rateCardId, itemsJson,
        input.status, input.now],
    },
    {
      sql: RATE_CARD_AUDIT_INSERT_AFTER_ITEMS_UPDATE_SQL,
      values: [auditId, input.tenantId, input.userId, input.vendorId, input.action, input.description,
        JSON.stringify(input.newValue), input.now, input.rateCardId, input.tenantId, input.status, input.now,
        input.tenantId, input.rateCardId, input.now, itemsJson, input.itemUpdates.length],
    },
    notification.statement,
  ]);
  if (results.length !== 4 || Number(results[0]?.meta?.changes || 0) !== 1
    || Number(results[1]?.meta?.changes || 0) !== input.itemUpdates.length
    || Number(results[2]?.meta?.changes || 0) !== 1 || Number(results[3]?.meta?.changes || 0) !== 1) return false;
  await dispatchPreparedWorkflowNotification(notification.id, input.now, {
    tenantId: input.tenantId, entityType: 'RATE_CARD', entityId: input.rateCardId,
    route: '/api/procurement/rate-cards/[id]',
  });
  return true;
}

async function writeRateCardDetailsAtomically(input: {
  updateValues: unknown[];
  itemRows?: Array<Record<string, unknown>>;
  expectedDeletedItems: number;
  expectedItemCount: number;
  tenantId: string;
  userId: string;
  vendorId: string;
  rateCardId: string;
  updatedAt: Date;
  expectedStatus: string;
  action: string;
  description: string;
  oldValue: unknown;
  newValue: unknown;
}): Promise<boolean> {
  const statements = [{ sql: RATE_CARD_DETAIL_UPDATE_SQL, values: input.updateValues }];
  if (input.itemRows) {
    const itemJson = JSON.stringify(input.itemRows);
    statements.push(
      {
        sql: RATE_CARD_DETAIL_ITEMS_DELETE_AFTER_UPDATE_SQL,
        values: [input.tenantId, input.rateCardId, itemJson, input.expectedStatus, input.updatedAt],
      },
      {
        sql: RATE_CARD_DETAIL_ITEMS_UPSERT_JSON_SQL,
        values: [itemJson, input.rateCardId, input.tenantId, input.expectedStatus, input.updatedAt],
      },
    );
  }
  statements.push({
    sql: RATE_CARD_DETAIL_AUDIT_AFTER_UPDATE_SQL,
    values: [crypto.randomUUID(), input.tenantId, input.userId, input.vendorId, input.action,
      input.description, JSON.stringify(input.oldValue), JSON.stringify(input.newValue), input.updatedAt,
      input.rateCardId, input.tenantId, input.expectedStatus, input.updatedAt,
      input.tenantId, input.rateCardId, input.expectedItemCount],
  });
  const results = await writeD1BatchAtomically(statements);
  if (Number(results[0]?.meta?.changes || 0) !== 1) return false;
  if (input.itemRows) {
    return Number(results[1]?.meta?.changes || 0) === input.expectedDeletedItems
      && Number(results[2]?.meta?.changes || 0) === input.itemRows.length
      && Number(results[3]?.meta?.changes || 0) === 1;
  }
  return Number(results[1]?.meta?.changes || 0) === 1;
}


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        vendor: {
          select: {
            id: true,
            code: true,
            name: true,
            vendorType: true,
            complianceStatus: true,
            qualificationStatus: true,
            performanceScore: true,
            email: true,
            phone: true,
            city: true,
            state: true,
          },
        },
        items: true,
        approvals: {
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
          take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE + 1,
          select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
        },
      },
    });

    if (!rateCard) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404);
    }

    const invalidStoredFields: Array<{ recordId: string; field: string }> = [];
    const enrichedItems = rateCard.items.map((it) => {
      const parsedMeta = parseStoredJsonObject(it.comparisonRef);
      if (it.comparisonRef && !parsedMeta) invalidStoredFields.push({ recordId: it.id, field: 'comparisonRef' });
      const meta = parsedMeta || {};
      return {
        ...it,
        buyerOffer1: meta.buyerOffer1 !== undefined ? meta.buyerOffer1 : it.rate,
        vendorQuote1: meta.vendorQuote1 !== undefined ? meta.vendorQuote1 : it.proposedRate,
        buyerOffer2: meta.buyerOffer2 !== undefined ? meta.buyerOffer2 : null,
        vendorQuote2: meta.vendorQuote2 !== undefined ? meta.vendorQuote2 : null,
        finalAgreedRate: meta.finalAgreedRate !== undefined ? meta.finalAgreedRate : (rateCard.status === 'APPROVED' || rateCard.status === 'FINAL_VENDOR_OFFER_ACCEPTED' ? it.rate : null),
        previousPpoRate: meta.previousPpoRate !== undefined ? meta.previousPpoRate : it.historicalRate,
        referenceQty: meta.referenceQty !== undefined ? meta.referenceQty : (it.minQuantity || 1),
        remarks: meta.remarks || '',
        variance: it.benchmarkRate ? Math.round(((it.rate - it.benchmarkRate) / it.benchmarkRate) * 100) : 0,
      };
    });

    const parsedNotes = parseStoredJsonObject(rateCard.notes);
    if (rateCard.notes && !parsedNotes) invalidStoredFields.push({ recordId: rateCard.id, field: 'notes' });
    const notesData = parsedNotes || {};
    const approvalHistoryPage = paginateRateCardApprovalHistory(rateCard.approvals);

    if (invalidStoredFields.length > 0) {
      await writeStructuredLog('warn', 'rate_card.stored_metadata_invalid', {
        operation: 'read_rate_card_detail', route: '/api/procurement/rate-cards/[id]',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
        rateCardId: id, invalidFieldCount: invalidStoredFields.length,
        invalidFields: invalidStoredFields.slice(0, 20),
      });
    }

    return apiSuccess({
      rateCard: {
        ...rateCard,
        items: enrichedItems,
        approvals: approvalHistoryPage.approvals,
        approvalHistory: getRateCardApprovalHistoryMetadata(approvalHistoryPage),
        agreement: notesData.agreement || null,
      },
    });
  } catch (error) {
    await writeStructuredLog('error', 'rate_card.detail_read_failed', {
      operation: 'read_rate_card_detail', route: '/api/procurement/rate-cards/[id]',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      rateCardId: id, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRateCard, 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { items: true, vendor: true, approvals: {
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
        select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
      } },
    });

    if (!rateCard) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404);
    }

    const bodyValue: unknown = await req.json();
    if (!bodyValue || typeof bodyValue !== 'object' || Array.isArray(bodyValue)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const body = bodyValue as RateCardDetailUpdateBody;
    if (JSON.stringify(body).length > MAX_RATE_CARD_NOTES_LENGTH) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const now = new Date();
    const actorName = ctx.userName || ctx.userEmail || 'Category Manager';

    // Workflow actions must preserve the existing negotiation and agreement history.
    const workflowActions = new Set([
      'SAVE_BUYER_OFFER_2_DRAFT', 'SUBMIT_BUYER_OFFER_2', 'ACCEPT_FINAL_VENDOR_OFFER',
      'CATEGORY_MANAGER_ACCEPT', 'CATEGORY_MANAGER_SIGNOFF',
    ]);
    let notesData: Record<string, unknown> = {};
    if (workflowActions.has(String(body.action))) {
      const parsedNotes = parseStoredJsonObject(rateCard.notes);
      if (!parsedNotes) {
        await writeStructuredLog('error', 'rate_card.workflow_metadata_invalid', {
          operation: 'update_rate_card_workflow', route: '/api/procurement/rate-cards/[id]',
          requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
          rateCardId: id, field: 'notes', action: body.action, durationMs: Date.now() - startedAt,
        });
        return apiError(UI_STRINGS.common.userMessages.failedToUpdateRateCard, 500);
      }
      notesData = parsedNotes;
    }

    if (body.action === 'SAVE_BUYER_OFFER_2_DRAFT') {
      if (rateCard.status !== 'ROUND_1_VENDOR_QUOTE') {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardCannotBeEditedInStatusStatus, { status: rateCard.status }), 400);
      }
      const items = body.items;
      const remarks = body.remarks ?? '';
      if (!Array.isArray(items) || items.length === 0 || items.length > MAX_RATE_CARD_ITEMS
        || typeof remarks !== 'string' || remarks.length > MAX_RATE_CARD_TEXT_LENGTH) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }

      const itemUpdates: RateCardItemStateUpdate[] = [];
      const seenItemIds = new Set<string>();
      for (const item of items) {
        if (!item || typeof item.id !== 'string' || !item.id || seenItemIds.has(item.id)) {
          return apiError(UI_STRINGS.common.invalidRequestBody, 400);
        }
        const existingItem = rateCard.items.find((candidate) => candidate.id === item.id);
        const buyerOffer2 = Number(item.buyerOffer2);
        if (!existingItem || !Number.isFinite(buyerOffer2) || buyerOffer2 < 0
          || (item.remarks !== undefined && (typeof item.remarks !== 'string' || item.remarks.length > MAX_RATE_CARD_TEXT_LENGTH))) {
          return apiError(UI_STRINGS.common.invalidRequestBody, 400);
        }
        seenItemIds.add(item.id);
        const parsedMeta = parseStoredJsonObject(existingItem.comparisonRef);
        if (!parsedMeta) {
          await writeStructuredLog('error', 'rate_card.workflow_metadata_invalid', {
            operation: 'update_rate_card_workflow', route: '/api/procurement/rate-cards/[id]',
            requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
            rateCardId: id, itemId: existingItem.id, field: 'comparisonRef', action: body.action,
            durationMs: Date.now() - startedAt,
          });
          return apiError(UI_STRINGS.common.userMessages.failedToUpdateRateCard, 500);
        }
        const compMeta = parsedMeta;
        compMeta.buyerOffer2 = buyerOffer2;
        if (item.remarks !== undefined) compMeta.remarks = item.remarks;
        itemUpdates.push({ id: item.id, comparisonRef: JSON.stringify(compMeta) });
      }

      notesData.currentRound = 2;
      const priorRound2 = notesData.round2 && typeof notesData.round2 === 'object' && !Array.isArray(notesData.round2)
        ? notesData.round2 as Record<string, unknown> : {};
      notesData.round2 = {
        ...priorRound2,
        buyerOffer2DraftDate: now.toISOString(),
        buyerOffer2DraftActor: actorName,
        buyerOffer2DraftRemarks: remarks,
      };
      const notes = JSON.stringify(notesData);
      const itemsJson = JSON.stringify(itemUpdates);
      const auditId = crypto.randomUUID();
      const description = interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.buyerRCOffer2SubmittedForRateCardRateCardNumberByActorName, { rateCardNumber: rateCard.rateCardNumber, actorName });
      const results = await writeD1BatchAtomically([
        {
          sql: RATE_CARD_BUYER_OFFER2_DRAFT_UPDATE_SQL,
          values: [notes, now, id, ctx.tenantId, rateCard.items.length, itemsJson, itemUpdates.length],
        },
        {
          sql: RATE_CARD_ITEMS_JSON_UPDATE_AFTER_CARD_SQL,
          values: [itemsJson, itemsJson, now, ctx.tenantId, id, itemsJson, rateCard.status, now],
        },
        {
          sql: RATE_CARD_AUDIT_INSERT_AFTER_ITEMS_UPDATE_SQL,
          values: [auditId, ctx.tenantId, ctx.userId, rateCard.vendorId, 'RATE_CARD_BUYER_OFFER_2_DRAFT_SAVED',
            description, JSON.stringify({ status: rateCard.status, remarks }), now, id, ctx.tenantId,
            rateCard.status, now, ctx.tenantId, id, now, itemsJson, itemUpdates.length],
        },
      ]);
      if (results.length !== 3 || Number(results[0]?.meta?.changes || 0) !== 1
        || Number(results[1]?.meta?.changes || 0) !== itemUpdates.length
        || Number(results[2]?.meta?.changes || 0) !== 1) {
        return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      }
      const updatedItems = rateCard.items.map((item) => {
        const update = itemUpdates.find((candidate) => candidate.id === item.id);
        return update ? { ...item, comparisonRef: update.comparisonRef, updatedAt: now } : item;
      });
      return apiSuccess({ rateCard: { ...rateCard, notes, updatedAt: now, items: updatedItems } });
    }

    // ── ACTION 1: SUBMIT_BUYER_OFFER_2 ──────────────────────────
    if (body.action === 'SUBMIT_BUYER_OFFER_2') {
      if (rateCard.status !== 'ROUND_1_VENDOR_QUOTE') {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardCannotBeEditedInStatusStatus, { status: rateCard.status }), 400);
      }
      const items = body.items;
      const remarks = body.remarks ?? '';
      if (!Array.isArray(items) || items.length === 0 || items.length > MAX_RATE_CARD_ITEMS
        || typeof remarks !== 'string' || remarks.length > MAX_RATE_CARD_TEXT_LENGTH) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }

      const itemUpdates: RateCardItemStateUpdate[] = [];
      const seenItemIds = new Set<string>();
      for (const item of items) {
        if (!item || typeof item.id !== 'string' || !item.id || seenItemIds.has(item.id)) {
          return apiError(UI_STRINGS.common.invalidRequestBody, 400);
        }
        const existingItem = rateCard.items.find((candidate) => candidate.id === item.id);
        const buyerOffer2 = Number(item.buyerOffer2);
        if (!existingItem || !Number.isFinite(buyerOffer2) || buyerOffer2 < 0
          || (item.remarks !== undefined && (typeof item.remarks !== 'string' || item.remarks.length > MAX_RATE_CARD_TEXT_LENGTH))) {
          return apiError(UI_STRINGS.common.invalidRequestBody, 400);
        }
        seenItemIds.add(item.id);
        const parsedMeta = parseStoredJsonObject(existingItem.comparisonRef);
        if (!parsedMeta) {
          await writeStructuredLog('error', 'rate_card.workflow_metadata_invalid', {
            operation: 'update_rate_card_workflow', route: '/api/procurement/rate-cards/[id]',
            requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
            rateCardId: id, itemId: existingItem.id, field: 'comparisonRef', action: body.action,
            durationMs: Date.now() - startedAt,
          });
          return apiError(UI_STRINGS.common.userMessages.failedToUpdateRateCard, 500);
        }
        const compMeta = parsedMeta;
        compMeta.buyerOffer2 = buyerOffer2;
        if (item.remarks !== undefined) compMeta.remarks = item.remarks;
        itemUpdates.push({ id: item.id, comparisonRef: JSON.stringify(compMeta) });
      }

      // Requirement 6: If rates change, do not reuse old signature as evidence for the changed version
      if (notesData.agreement && typeof notesData.agreement === 'object' && !Array.isArray(notesData.agreement)) {
        const agreement = notesData.agreement as Record<string, unknown>;
        if (agreement.signature) {
          agreement.signature = null;
          agreement.status = 'DRAFT';
        }
      }

      notesData.currentRound = 2;
      const priorRound2 = notesData.round2 && typeof notesData.round2 === 'object' && !Array.isArray(notesData.round2)
        ? notesData.round2 as Record<string, unknown> : {};
      notesData.round2 = {
        ...priorRound2,
        buyerOffer2Date: now.toISOString(),
        buyerOffer2Actor: actorName,
        buyerOffer2Remarks: remarks,
      };

      const notes = JSON.stringify(notesData);
      const description = interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.buyerRCOffer2SubmittedForRateCardRateCardNumberByActorName, { rateCardNumber: rateCard.rateCardNumber, actorName });
      const changed = await writeRateCardItemEvent({
        updateSql: RATE_CARD_BUYER_OFFER2_UPDATE_SQL,
        updateValues: [notes, now, id, ctx.tenantId, rateCard.status, rateCard.items.length,
          JSON.stringify(itemUpdates), itemUpdates.length],
        itemUpdates, tenantId: ctx.tenantId, userId: ctx.userId, vendorId: rateCard.vendorId,
        rateCardId: id, status: 'ROUND_2_BUYER_OFFER', action: 'RATE_CARD_BUYER_OFFER_2_SUBMITTED',
        description, newValue: { status: 'ROUND_2_BUYER_OFFER', remarks }, now,
        notification: {
          tenantId: ctx.tenantId, title: UI_STRINGS.appApiProcurementRateCardsIdRoute.buyerRCOffer2Submitted,
          message: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.buyerSubmittedBuyerRCOffer2ForRateCardRateCardNumberPleaseSubmitYourResponseInVendorPortal, { rateCardNumber: rateCard.rateCardNumber }),
          type: 'ACTION_REQUIRED', entityType: 'RATE_CARD', entityId: id,
          recordNumber: rateCard.rateCardNumber, targetRole: 'VENDOR', link: '/vendor-portal/rate-cards',
        },
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      const updatedItems = rateCard.items.map((item) => {
        const update = itemUpdates.find((candidate) => candidate.id === item.id);
        return update ? { ...item, comparisonRef: update.comparisonRef, updatedAt: now } : item;
      });
      const updated = { ...rateCard, status: 'ROUND_2_BUYER_OFFER', notes, updatedAt: now, items: updatedItems };

      return apiSuccess({ rateCard: updated, message: UI_STRINGS.appApiProcurementRateCardsIdRoute.buyerRCOffer2SuccessfullySubmittedToVendor });
    }

    // ── ACTION 2: ACCEPT_FINAL_VENDOR_OFFER ────────────────────
    if (body.action === 'ACCEPT_FINAL_VENDOR_OFFER') {
      if (!['ROUND_1_VENDOR_QUOTE', 'ROUND_2_VENDOR_QUOTE'].includes(rateCard.status)) {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardCannotBeEditedInStatusStatus, { status: rateCard.status }), 400);
      }
      const remarks = body.remarks ?? '';
      const roundNumber = body.roundNumber ?? 2;
      const totalAgreedValue = Number(body.totalAgreedValue ?? 0);
      if (typeof remarks !== 'string' || remarks.length > MAX_RATE_CARD_TEXT_LENGTH
        || !Number.isInteger(Number(roundNumber)) || Number(roundNumber) < 1 || Number(roundNumber) > 2
        || !Number.isFinite(totalAgreedValue) || totalAgreedValue < 0
        || rateCard.items.length === 0 || rateCard.items.length > MAX_RATE_CARD_ITEMS) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }

      // Freeze line items with final agreed vendor rates
      const itemUpdates: RateCardItemStateUpdate[] = [];
      for (const item of rateCard.items) {
        const parsedMeta = parseStoredJsonObject(item.comparisonRef);
        if (!parsedMeta) {
          await writeStructuredLog('error', 'rate_card.workflow_metadata_invalid', {
            operation: 'update_rate_card_workflow', route: '/api/procurement/rate-cards/[id]',
            requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
            rateCardId: id, itemId: item.id, field: 'comparisonRef', action: body.action,
            durationMs: Date.now() - startedAt,
          });
          return apiError(UI_STRINGS.common.userMessages.failedToUpdateRateCard, 500);
        }
        const compMeta = parsedMeta;

        // Determine final vendor rate from latest quote
        const quoteValue = compMeta.vendorQuote2 ?? compMeta.vendorQuote1 ?? item.proposedRate ?? item.rate;
        const finalRate = Number(quoteValue);
        if (!Number.isFinite(finalRate) || finalRate < 0) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

        compMeta.finalAgreedRate = finalRate;
        itemUpdates.push({ id: item.id, rate: finalRate, comparisonRef: JSON.stringify(compMeta) });
      }

      notesData.acceptedFinalOffer = {
        roundNumber,
        acceptedBy: actorName,
        acceptedAt: now.toISOString(),
        totalAgreedValue,
        remarks,
        terms: rateCard.terms,
      };

      const notes = JSON.stringify(notesData);
      const description = interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.finalVendorOfferAcceptedForRateCardRateCardNumberByActorNameCommercialSnapshotFrozen, { rateCardNumber: rateCard.rateCardNumber, actorName });
      const changed = await writeRateCardItemEvent({
        updateSql: RATE_CARD_FINAL_VENDOR_OFFER_UPDATE_SQL,
        updateValues: [notes, now, id, ctx.tenantId, rateCard.status, rateCard.items.length,
          JSON.stringify(itemUpdates), itemUpdates.length],
        itemUpdates, tenantId: ctx.tenantId, userId: ctx.userId, vendorId: rateCard.vendorId,
        rateCardId: id, status: 'FINAL_VENDOR_OFFER_ACCEPTED', action: 'RATE_CARD_FINAL_VENDOR_OFFER_ACCEPTED',
        description, newValue: { status: 'FINAL_VENDOR_OFFER_ACCEPTED', totalAgreedValue }, now,
        notification: {
          tenantId: ctx.tenantId, title: UI_STRINGS.appApiProcurementRateCardsIdRoute.finalVendorOfferAcceptedCategoryManagerReviewRequired,
          message: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.buyerAcceptedTheFinalVendorOfferForRateCardRateCardNumberCategoryManagerAcceptanceIsNowPending, { rateCardNumber: rateCard.rateCardNumber }),
          type: 'ACTION_REQUIRED', entityType: 'RATE_CARD', entityId: id,
          recordNumber: rateCard.rateCardNumber, targetRole: 'CATEGORY_MANAGER', link: '/procurement/rate-cards',
        },
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      const updatedItems = rateCard.items.map((item) => {
        const update = itemUpdates.find((candidate) => candidate.id === item.id);
        return update ? { ...item, rate: update.rate, comparisonRef: update.comparisonRef, updatedAt: now } : item;
      });
      const updated = { ...rateCard, status: 'FINAL_VENDOR_OFFER_ACCEPTED', notes, updatedAt: now, items: updatedItems };

      return apiSuccess({
        rateCard: updated,
        message: UI_STRINGS.appApiProcurementRateCardsIdRoute.finalVendorOfferAcceptedSuccessfullyCategoryManagerAcceptanceIsNowPending,
      });
    }

    // ── ACTION 3: CATEGORY_MANAGER_ACCEPT ──────────────────────
    if (body.action === 'CATEGORY_MANAGER_ACCEPT') {
      const allowedSourceStatuses = [
        'FINAL_VENDOR_OFFER_ACCEPTED',
        'ROUND_2_VENDOR_QUOTE',
        'ROUND_1_VENDOR_QUOTE',
        'NEGOTIATION',
        'ROUND_2_BUYER_OFFER',
      ];
      if (!allowedSourceStatuses.includes(rateCard.status)) {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.cannotPerformCategoryManagerAcceptanceFromStatusStatus, { "status": rateCard.status }), 400);
      }

      // Handle optional formal agreement attached by Category Manager
      const { agreement, remarks = '' } = body;
      if (typeof remarks !== 'string' || remarks.length > MAX_RATE_CARD_TEXT_LENGTH) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      if (agreement) {
        notesData.agreement = agreement;
      }

      notesData.categoryManagerAccepted = {
        actor: actorName,
        timestamp: now.toISOString(),
        remarks,
        hasAgreement: !!(agreement && agreement.required),
      };

      const notes = JSON.stringify(notesData);
      const description = interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.categoryManagerAcceptedRateCardRateCardNumber, { "rateCardNumber": rateCard.rateCardNumber });
      const changed = await writeRateCardEvent({
        updateSql: RATE_CARD_CATEGORY_ACCEPT_UPDATE_SQL,
        updateValues: [notes, now, id, ctx.tenantId, rateCard.status],
        tenantId: ctx.tenantId, userId: ctx.userId, vendorId: rateCard.vendorId, rateCardId: id,
        action: 'RATE_CARD_CATEGORY_MANAGER_ACCEPTED', description,
        newValue: { status: 'CATEGORY_MANAGER_ACCEPTED' }, now,
        notification: {
          tenantId: ctx.tenantId, targetRole: 'VENDOR', title: UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardAcceptedByCategoryManagerVendorFinalAcceptanceRequired,
          message: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.categoryManagerAcceptedRateCardRateCardNumberPleaseAcceptTheFinalContractTermsInVendorPortal, { "rateCardNumber": rateCard.rateCardNumber }),
          type: 'ACTION_REQUIRED', entityType: 'RATE_CARD', entityId: id, recordNumber: rateCard.rateCardNumber, link: '/vendor-portal/rate-cards',
        },
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      const updated = { ...rateCard, status: 'CATEGORY_MANAGER_ACCEPTED', notes, updatedAt: now };

      return apiSuccess({
        rateCard: updated,
        message: UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardAcceptedByCategoryManagerVendorFinalAcceptanceIsNowRequired,
      });
    }

    // ── ACTION 4: CATEGORY_MANAGER_SIGNOFF ─────────────────────
    if (body.action === 'CATEGORY_MANAGER_SIGNOFF') {
      if (rateCard.status !== 'VENDOR_ACCEPTED') {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.categoryManagerSignOffRequiresPriorVendorAcceptanceCurrentStatusStatus, { "status": rateCard.status }), 400);
      }

      if (typeof body.remarks !== 'undefined' && (typeof body.remarks !== 'string' || body.remarks.length > MAX_RATE_CARD_TEXT_LENGTH)) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      notesData.categoryManagerSignedOff = {
        actor: actorName,
        timestamp: now.toISOString(),
        remarks: body.remarks || '',
      };

      const notes = JSON.stringify(notesData);
      const description = interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.categoryManagerSignedOffRateCardRateCardNumberForwardedToLevel1ProjectApprover, { "rateCardNumber": rateCard.rateCardNumber });
      const changed = await writeRateCardEvent({
        updateSql: RATE_CARD_CATEGORY_SIGNOFF_UPDATE_SQL,
        updateValues: [actorName, now, notes, now, id, ctx.tenantId],
        tenantId: ctx.tenantId, userId: ctx.userId, vendorId: rateCard.vendorId, rateCardId: id,
        action: 'RATE_CARD_CM_SIGNED_OFF', description,
        newValue: { status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT' }, now,
        notification: {
          tenantId: ctx.tenantId, targetRole: 'PROJECT_APPROVER', title: UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardSignedOffLevel1ProjectApprovalPending,
          message: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardRateCardNumberSignedOffByCategoryManagerLevel1ProjectApprovalRequired, { "rateCardNumber": rateCard.rateCardNumber }),
          type: 'ACTION_REQUIRED', entityType: 'RATE_CARD', entityId: id, recordNumber: rateCard.rateCardNumber, link: '/approvals/rate-cards',
        },
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
      const updated = { ...rateCard, status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT', submittedBy: actorName, submittedAt: now, notes, updatedAt: now };

      return apiSuccess({
        rateCard: updated,
        message: UI_STRINGS.appApiProcurementRateCardsIdRoute.categoryManagerSignOffCompleteRateCardForwardedToProjectApproverQueueLevel1,
      });
    }

    // ── FALLBACK STANDARD UPDATE ───────────────────────────────
    // Editable if DRAFT, RETURNED_FOR_CORRECTION, or NEGOTIATION
    const editableStatuses = ['DRAFT', 'RETURNED_FOR_CORRECTION', 'NEGOTIATION', 'UNDER_REVIEW', 'ROUND_1_BUYER_OFFER'];
    if (!editableStatuses.includes(rateCard.status)) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardCannotBeEditedInStatusStatus, { "status": rateCard.status }), 400);
    }

    if (body.status !== undefined && body.status !== rateCard.status) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const readText = (value: unknown, current: string | null, maxLength: number): string | null | undefined => {
      if (value === undefined) return current;
      if (value === null) return null;
      if (typeof value !== 'string' || value.length > maxLength) return undefined;
      return value;
    };
    const title = readText(body.title || rateCard.title, rateCard.title, MAX_RATE_CARD_TEXT_LENGTH);
    const category = readText(body.category || rateCard.category, rateCard.category, MAX_RATE_CARD_TEXT_LENGTH);
    const subcategory = readText(body.subcategory, rateCard.subcategory, MAX_RATE_CARD_TEXT_LENGTH);
    const scope = readText(body.scope, rateCard.scope, MAX_RATE_CARD_TEXT_LENGTH);
    const location = readText(body.location, rateCard.location, MAX_RATE_CARD_TEXT_LENGTH);
    const terms = readText(body.terms, rateCard.terms, MAX_RATE_CARD_TERMS_LENGTH);
    const notes = readText(body.notes, rateCard.notes, MAX_RATE_CARD_NOTES_LENGTH);
    const justification = readText(body.justification, rateCard.justification, MAX_RATE_CARD_TEXT_LENGTH);
    const comparisonNotes = readText(body.comparisonNotes, rateCard.comparisonNotes, MAX_RATE_CARD_TEXT_LENGTH);
    if (title === undefined || category === undefined || subcategory === undefined || scope === undefined
      || location === undefined || terms === undefined || notes === undefined || justification === undefined
      || comparisonNotes === undefined || title === null || category === null || !title.trim() || !category.trim()) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    let version = rateCard.version;
    if (body.version !== undefined) {
      const parsedVersion = typeof body.version === 'number'
        ? body.version
        : Number.parseInt(String(body.version).replace(/\D/g, '') || '', 10);
      if (!Number.isInteger(parsedVersion) || parsedVersion < 1) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      version = parsedVersion;
    }
    const parseDate = (value: unknown, current: Date): Date | null => {
      if (value === undefined || value === null || value === '') return current;
      if (typeof value !== 'string') return null;
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    };
    const validFrom = parseDate(body.validFrom, rateCard.validFrom);
    const validTo = parseDate(body.validTo, rateCard.validTo);
    if (!validFrom || !validTo || validTo < validFrom) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

    let itemRows: Array<Record<string, unknown>> | undefined;
    let expectedDeletedItems = 0;
    if (body.items !== undefined) {
      if (!Array.isArray(body.items) || body.items.length > MAX_RATE_CARD_ITEMS) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }
      const existingById = new Map(rateCard.items.map((item) => [item.id, item]));
      const seenIds = new Set<string>();
      itemRows = [];
      for (const rawItem of body.items) {
        if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
          return apiError(UI_STRINGS.common.invalidRequestBody, 400);
        }
        const item = rawItem as RateCardDetailItemInput;
        const description = typeof item.description === 'string' ? item.description.trim() : '';
        const itemId = item.id === undefined ? crypto.randomUUID() : item.id;
        const previous = item.id ? existingById.get(item.id) : undefined;
        if (!description || description.length > MAX_RATE_CARD_TEXT_LENGTH || typeof itemId !== 'string'
          || !itemId || seenIds.has(itemId) || (item.id !== undefined && !previous)) {
          return apiError(UI_STRINGS.common.invalidRequestBody, 400);
        }
        seenIds.add(itemId);

        const rate = Number(item.rate ?? 0);
        const proposedRate = Number(item.proposedRate ?? rate);
        const nullableNumber = (value: unknown): number | null | undefined => {
          if (value === undefined || value === null || value === '') return null;
          const parsed = Number(value);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
        };
        const historicalRate = nullableNumber(item.historicalRate);
        const benchmarkRate = nullableNumber(item.benchmarkRate);
        const minQuantity = item.minQuantity === undefined || item.minQuantity === null || item.minQuantity === ''
          ? 1 : nullableNumber(item.minQuantity);
        const maxQuantity = nullableNumber(item.maxQuantity);
        const validItemText = (value: unknown, maxLength: number): value is string | null | undefined =>
          value === undefined || value === null || (typeof value === 'string' && value.length <= maxLength);
        if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(proposedRate) || proposedRate < 0
          || historicalRate === undefined || benchmarkRate === undefined || minQuantity === undefined || maxQuantity === undefined
          || !validItemText(item.itemCode, 128) || !validItemText(item.standardBoqItemId, 128)
          || !validItemText(item.specification, MAX_RATE_CARD_TEXT_LENGTH) || !validItemText(item.category, MAX_RATE_CARD_TEXT_LENGTH)
          || !validItemText(item.subcategory, MAX_RATE_CARD_TEXT_LENGTH) || !validItemText(item.uom, 40)
          || !validItemText(item.location, MAX_RATE_CARD_TEXT_LENGTH)
          || !validItemText(item.comparisonRef, MAX_RATE_CARD_NOTES_LENGTH)) {
          return apiError(UI_STRINGS.common.invalidRequestBody, 400);
        }
        const itemCategory = item.category || category || rateCard.category;
        const itemSubcategory = item.subcategory || subcategory || rateCard.subcategory;
        const itemLocation = item.location || location || rateCard.location;
        itemRows.push({
          id: itemId, tenantId: ctx.tenantId, rateCardId: id,
          standardBoqItemId: item.standardBoqItemId || null, itemCode: item.itemCode || null,
          description, specification: item.specification || null, category: itemCategory,
          subcategory: itemSubcategory, uom: item.uom || 'Nos', rate, proposedRate,
          historicalRate, benchmarkRate, comparisonRef: item.comparisonRef || null,
          minQuantity, maxQuantity, location: itemLocation, isActive: true,
          createdAt: previous?.createdAt || now, updatedAt: now,
        });
      }
      expectedDeletedItems = rateCard.items.filter((item) => !seenIds.has(item.id)).length;
    }

    const expectedUpdatedAt = rateCard.updatedAt ? new Date(rateCard.updatedAt) : null;
    const updatedAt = new Date(Math.max(Date.now(), (expectedUpdatedAt?.getTime() || 0) + 1));
    if (itemRows) itemRows.forEach((item) => { item.updatedAt = updatedAt; });
    const description = interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardRateCardNumberUpdated, { rateCardNumber: rateCard.rateCardNumber });
    const updated = await writeRateCardDetailsAtomically({
      updateValues: [title, category, subcategory, scope, location, version, validFrom, validTo,
        terms, notes, justification, comparisonNotes, updatedAt, id, ctx.tenantId, rateCard.status, expectedUpdatedAt],
      itemRows, expectedDeletedItems, expectedItemCount: itemRows ? itemRows.length : rateCard.items.length,
      tenantId: ctx.tenantId, userId: ctx.userId, vendorId: rateCard.vendorId, rateCardId: id,
      updatedAt, expectedStatus: rateCard.status, action: 'RATE_CARD_UPDATED', description,
      oldValue: { title: rateCard.title, category: rateCard.category, version: rateCard.version, itemCount: rateCard.items.length },
      newValue: { title, category, status: rateCard.status, version, itemCount: itemRows?.length ?? rateCard.items.length },
    });
    if (!updated) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    return apiSuccess({ rateCard: {
      ...rateCard, title, category, subcategory, scope, location, version, validFrom, validTo,
      terms, notes, justification, comparisonNotes, updatedAt,
      items: itemRows || rateCard.items,
    } });
  } catch (error) {
    await writeStructuredLog('error', 'rate_card.update_failed', {
      operation: 'update_rate_card', route: '/api/procurement/rate-cards/[id]',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      rateCardId: id, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateRateCard, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!rateCard) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404);
    }

    if (rateCard.status !== 'DRAFT') {
      return apiError(UI_STRINGS.appApiProcurementRateCardsIdRoute.onlyDraftRateCardsCanBeDeleted, 400);
    }

    const now = new Date();
    const auditId = crypto.randomUUID();
    const results = await writeD1BatchAtomically([
      {
        sql: RATE_CARD_DRAFT_DELETE_AUDIT_SQL,
        values: [auditId, ctx.userId, `Draft rate card ${rateCard.rateCardNumber} deleted`,
          JSON.stringify({ status: 'DRAFT', rateCardNumber: rateCard.rateCardNumber }), now,
          id, ctx.tenantId],
      },
      { sql: RATE_CARD_DRAFT_DELETE_AFTER_AUDIT_SQL, values: [id, ctx.tenantId, auditId, ctx.tenantId] },
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({ message: UI_STRINGS.appApiProcurementRateCardsIdRoute.rateCardDeletedSuccessfully });
  } catch (error) {
    await writeStructuredLog('error', 'rate_card.delete_failed', {
      operation: 'delete_draft_rate_card', route: '/api/procurement/rate-cards/[id]',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      rateCardId: id, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToDeleteRateCard, 500);
  }
}
