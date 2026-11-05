// src/app/api/procurement/rate-cards/route.ts
// Vendor Rate Card Management & Approved Catalogues
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import {
  RATE_CARD_AUDIT_INSERT_AFTER_CREATE_SQL,
  RATE_CARD_INSERT_IF_VENDOR_VALID_SQL,
  RATE_CARD_ITEMS_INSERT_JSON_AFTER_CARD_SQL,
  MAX_RATE_CARD_ITEMS,
} from '@/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { dispatchPreparedWorkflowNotification } from '@/lib/notifications';
import { prepareRateCardNotificationOutbox } from '@/lib/notification-outbox';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { parseStoredJsonObject } from '@/lib/rate-card-utils';
import {
  MAX_RATE_CARD_NOTES_LENGTH,
  MAX_RATE_CARD_TERMS_LENGTH,
  MAX_RATE_CARD_TEXT_LENGTH,
  DEFAULT_RATE_CARD_LIST_PAGE_SIZE,
  MAX_RATE_CARD_LIST_PAGE_SIZE,
  RATE_CARD_CREATE_STATUSES,
} from './route.constants';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const vendorId = searchParams.get('vendorId');
  const status = searchParams.get('status');
  const category = searchParams.get('category');
    const search = (searchParams.get('search') || '').trim();
    if (search.length > MAX_RATE_CARD_TEXT_LENGTH) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { rateCardNumber: { contains: search } },
        { title: { contains: search } },
        { category: { contains: search } },
        { vendor: { name: { contains: search } } },
      ];
    }

    const pageParam = Number(searchParams.get('page'));
    const page = Number.isSafeInteger(pageParam) && pageParam > 0 ? Math.min(pageParam, 10_000) : 1;
    const pageSizeParam = Number(searchParams.get('pageSize') || searchParams.get('limit'));
    const pageSize = Number.isSafeInteger(pageSizeParam) && pageSizeParam > 0
      ? Math.min(pageSizeParam, MAX_RATE_CARD_LIST_PAGE_SIZE)
      : DEFAULT_RATE_CARD_LIST_PAGE_SIZE;
    const queue = searchParams.get('queue');
    if (queue === 'ALL_PENDING') where.status = { in: ['PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL'] };
    if (queue === 'LEVEL_1') where.status = 'PENDING_PROJECT_APPROVAL';
    if (queue === 'LEVEL_2') where.status = 'PENDING_FINANCE_APPROVAL';
    if (queue === 'CONCLUDED') where.status = { in: ['APPROVED', 'RETURNED_FOR_CORRECTION', 'REJECTED'] };
    const summaryWhere: Record<string, unknown> = { ...where };
    if (queue) {
      delete summaryWhere.status;
      if (status) summaryWhere.status = status;
    }

    const findOptions: any = {
      where,
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
          },
        },
        items: {
          select: {
            id: true,
            rate: true,
            proposedRate: true,
            historicalRate: true,
            benchmarkRate: true,
            minQuantity: true,
            comparisonRef: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    };

    const [rateCards, totalCount, statusGroups] = await Promise.all([
      prisma.vendorRateCard.findMany(findOptions),
      prisma.vendorRateCard.count({ where }),
      prisma.vendorRateCard.groupBy({ by: ['status'], where: summaryWhere, _count: { _all: true } }),
    ]);

    const now = new Date();
    const invalidStoredFields: Array<{ rateCardId: string; recordId: string; field: string }> = [];
    const formatted = rateCards.map((rc: any) => {
      const isValid = rc.status === 'APPROVED' && rc.validFrom <= now && rc.validTo >= now;
      const isExpired = rc.validTo < now || rc.status === 'EXPIRED';

      const enrichedItems = (rc.items || []).map((it: any) => {
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
        isValid,
        isExpired,
        items: enrichedItems,
        itemCount: rc.items.length,
        agreement: notesData.agreement || null,
      };
    });

    if (invalidStoredFields.length > 0) {
      await writeStructuredLog('warn', 'rate_card.stored_metadata_invalid', {
        operation: 'list_rate_cards', route: '/api/procurement/rate-cards',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
        invalidFieldCount: invalidStoredFields.length, invalidFields: invalidStoredFields.slice(0, 20),
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const summary = (statusGroups as Array<{ status: string; _count: { _all: number } }>).reduce((totals, group) => {
      if (group.status === 'APPROVED') totals.finalised += group._count._all;
      else totals.inProgress += group._count._all;
      if (group.status === 'PENDING_PROJECT_APPROVAL') totals.level1Pending += group._count._all;
      if (group.status === 'PENDING_FINANCE_APPROVAL') totals.level2Pending += group._count._all;
      return totals;
    }, { finalised: 0, inProgress: 0, level1Pending: 0, level2Pending: 0 });
    return apiSuccess({
      rateCards: formatted,
      total: totalCount,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
      summary,
    });
  } catch (error) {
    await writeStructuredLog('error', 'rate_card.list_read_failed', {
      operation: 'list_rate_cards', route: '/api/procurement/rate-cards',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      page: Number(searchParams.get('page')) || 1, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRateCards, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let vendorId: string | undefined;
  let rateCardId: string | undefined;
  let itemCount = 0;
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const input = body as Record<string, unknown>;
    vendorId = typeof input.vendorId === 'string' ? input.vendorId.trim() : undefined;
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const category = typeof input.category === 'string' ? input.category.trim() : '';
    const subcategory = typeof input.subcategory === 'string' ? input.subcategory.trim() : null;
    const scope = typeof input.scope === 'string' ? input.scope.trim() : null;
    const location = typeof input.location === 'string' ? input.location.trim() : null;
    const version = input.version ?? 'v1.0';
    const status = typeof input.status === 'string' ? input.status : 'DRAFT';
    const items = input.items === undefined ? [] : input.items;
    const terms = typeof input.terms === 'string' ? input.terms : null;
    const suppliedNotes = typeof input.notes === 'string' ? input.notes : null;
    const justification = typeof input.justification === 'string' ? input.justification : null;
    const comparisonNotes = typeof input.comparisonNotes === 'string' ? input.comparisonNotes : null;
    const validFrom = typeof input.validFrom === 'string' && input.validFrom.trim() || input.validFrom instanceof Date ? new Date(input.validFrom) : null;
    const validTo = typeof input.validTo === 'string' && input.validTo.trim() || input.validTo instanceof Date ? new Date(input.validTo) : null;

    if (!vendorId || !title || !category || !validFrom || !validTo) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.vendorIDTitleCategoryValidFromAndValidToAreRequired, 400);
    }
    if (!validFrom.getTime() || !validTo.getTime() || validTo < validFrom
      || !RATE_CARD_CREATE_STATUSES.includes(status as typeof RATE_CARD_CREATE_STATUSES[number])) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.rateCardDatesAndStatusAreInvalid, 400);
    }
    if (title.length > MAX_RATE_CARD_TEXT_LENGTH || category.length > MAX_RATE_CARD_TEXT_LENGTH
      || [subcategory, scope, location, justification, comparisonNotes].some((value) => value !== null && value.length > MAX_RATE_CARD_TEXT_LENGTH)
      || (terms !== null && terms.length > MAX_RATE_CARD_TERMS_LENGTH)
      || (suppliedNotes !== null && suppliedNotes.length > MAX_RATE_CARD_NOTES_LENGTH)) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.rateCardTextFieldsExceedAllowedLength, 400);
    }
    if (!Array.isArray(items)) return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.rateCardItemDescriptionAndNonnegativeRateAreRequired, 400);
    itemCount = items.length;
    if (itemCount > MAX_RATE_CARD_ITEMS) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsRoute.rateCardCannotContainMoreThanLengthItems, { length: MAX_RATE_CARD_ITEMS }), 400);
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!vendor) return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.vendorNotFoundForCurrentTenant, 404);

    const isSubmittingL1 = status === 'PENDING_PROJECT_APPROVAL';
    const isSendingToVendor = status === 'ROUND_1_BUYER_OFFER' || status === 'SENT_TO_VENDOR';
    const effectiveStatus = isSendingToVendor ? 'ROUND_1_BUYER_OFFER' : status;
    const now = new Date();
    const year = now.getFullYear();
    rateCardId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const actorName = ctx.userName || ctx.userEmail || 'Category Manager';
    const parsedVersion = typeof version === 'number' && Number.isFinite(version)
      ? Math.max(1, Math.trunc(version))
      : Math.max(1, parseInt(String(version).replace(/\D/g, '') || '1', 10));

    const initialNegotiationNotes = {
      currentRound: 1,
      round1: {
        buyerOffer1Date: now.toISOString(),
        buyerOffer1Actor: actorName,
      },
    };

    const finalNotes = suppliedNotes || JSON.stringify(initialNegotiationNotes);
    const itemRows = [];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.rateCardItemDescriptionAndNonnegativeRateAreRequired, 400);
      }
      const item = rawItem as Record<string, unknown>;
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      const initialBuyerRate = Number(item.buyerOffer1 ?? item.rate ?? 0);
      const proposedRate = item.proposedRate !== undefined ? Number(item.proposedRate) : initialBuyerRate;
      const referenceSource = item.referenceQty ?? item.qty ?? item.minQuantity;
      const referenceQuantity = referenceSource !== undefined && referenceSource !== null
        && String(referenceSource).trim() !== '' && Number.isFinite(Number(referenceSource))
        ? Number(referenceSource) : null;
      if (!description || description.length > MAX_RATE_CARD_TEXT_LENGTH || !Number.isFinite(initialBuyerRate)
        || initialBuyerRate < 0 || !Number.isFinite(proposedRate) || proposedRate < 0) {
        return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.rateCardItemDescriptionAndNonnegativeRateAreRequired, 400);
      }
      const optionalNumber = (value: unknown) => value === undefined || value === null || value === ''
        ? null : Number.isFinite(Number(value)) ? Number(value) : null;
      const previousPpoRate = item.previousPpoRate
        ? optionalNumber(item.previousPpoRate)
        : item.historicalRate ? optionalNumber(item.historicalRate) : null;
      const vendorQuote1 = item.vendorQuote1 ? optionalNumber(item.vendorQuote1) : null;
      const comparisonRef = JSON.stringify({
        buyerOffer1: initialBuyerRate, vendorQuote1, previousPpoRate,
        referenceQty: referenceQuantity,
        remarks: typeof item.remarks === 'string' ? item.remarks.slice(0, MAX_RATE_CARD_TEXT_LENGTH) : '',
      });
      itemRows.push({
        id: crypto.randomUUID(), tenantId: ctx.tenantId, rateCardId,
        standardBoqItemId: typeof item.standardBoqItemId === 'string' ? item.standardBoqItemId : null,
        itemCode: typeof item.itemCode === 'string' ? item.itemCode.slice(0, 128) : null,
        description,
        specification: typeof item.specification === 'string' ? item.specification.slice(0, MAX_RATE_CARD_TEXT_LENGTH) : null,
        category: typeof item.category === 'string' ? item.category.slice(0, MAX_RATE_CARD_TEXT_LENGTH) : category,
        subcategory: typeof item.subcategory === 'string' ? item.subcategory.slice(0, MAX_RATE_CARD_TEXT_LENGTH) : subcategory,
        uom: typeof item.uom === 'string' ? item.uom.slice(0, 40) : 'Nos',
        rate: initialBuyerRate, proposedRate,
        historicalRate: optionalNumber(item.historicalRate ?? item.previousPpoRate),
        benchmarkRate: optionalNumber(item.benchmarkRate),
        comparisonRef,
        minQuantity: referenceQuantity,
        maxQuantity: item.maxQuantity ? optionalNumber(item.maxQuantity) : null,
        location: typeof item.location === 'string' ? item.location.slice(0, MAX_RATE_CARD_TEXT_LENGTH) : location || 'All India',
        isActive: true, createdAt: now, updatedAt: now,
      });
    }

    const action = isSendingToVendor ? 'RATE_CARD_OFFER_1_SENT' : isSubmittingL1 ? 'RATE_CARD_SUBMITTED' : 'RATE_CARD_CREATED';
    const actionDescription = isSendingToVendor
      ? 'sent to vendor (Buyer RC Offer-1)'
      : isSubmittingL1 ? 'submitted for Level 1 Project Approval' : 'created as draft';
    const description = interpolateUiString(
      UI_STRINGS.appApiProcurementRateCardsRoute.rateCardRateCardNumberVersionValue3ForVendorNameLengthItems,
      { rateCardNumber: '__RATE_CARD_NUMBER__', version: parsedVersion, value3: actionDescription, name: vendor.name, length: itemCount },
    );
    const outbox = isSendingToVendor ? prepareRateCardNotificationOutbox({
      tenantId: ctx.tenantId,
      title: UI_STRINGS.appApiProcurementRateCardsRoute.newRateCardOfferReceived,
      message: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsRoute.buyerSubmittedBuyerRCOffer1ForRateCardRateCardNumberCategory, {
        rateCardNumber: '__RATE_CARD_NUMBER__', category,
      }),
      type: 'ACTION_REQUIRED', entityType: 'RATE_CARD', entityId: rateCardId,
      recordNumber: '__RATE_CARD_NUMBER__', targetRole: 'VENDOR', link: '/vendor-portal/rate-cards',
    }, rateCardId, now, auditId) : null;
    const statements = [
      {
        sql: RATE_CARD_INSERT_IF_VENDOR_VALID_SQL,
        values: [rateCardId, ctx.tenantId, vendorId, year, ctx.tenantId, year, parsedVersion, title, category,
          subcategory || null, scope || null, location || 'All India', effectiveStatus, isSubmittingL1 ? 'LEVEL_1_PROJECT' : null,
          validFrom, validTo, terms || null, (isSubmittingL1 || isSendingToVendor) ? actorName : null,
          (isSubmittingL1 || isSendingToVendor) ? now : null, effectiveStatus === 'APPROVED' ? ctx.role : null,
          effectiveStatus === 'APPROVED' ? now : null, finalNotes, justification || null, comparisonNotes || null,
          now, now, vendorId, ctx.tenantId],
      },
      { sql: RATE_CARD_ITEMS_INSERT_JSON_AFTER_CARD_SQL, values: [JSON.stringify(itemRows), rateCardId, ctx.tenantId] },
      {
        sql: RATE_CARD_AUDIT_INSERT_AFTER_CREATE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, vendorId, action, description,
          JSON.stringify({ title, status: effectiveStatus, version: parsedVersion, itemCount }), now,
          rateCardId, ctx.tenantId, itemCount],
      },
      ...(outbox ? [outbox.statement] : []),
    ];
    const results = await writeD1BatchAtomically(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1
      || Number(results[1]?.meta?.changes || 0) !== itemCount
      || Number(results[2]?.meta?.changes || 0) !== 1
      || (outbox && Number(results[3]?.meta?.changes || 0) !== 1)) {
      throw new Error();
    }
    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id: rateCardId, tenantId: ctx.tenantId },
      include: { vendor: { select: { id: true, code: true, name: true } }, items: true, approvals: true },
    });
    if (!rateCard) throw new Error();

    if (outbox) await dispatchPreparedWorkflowNotification(outbox.id, now, {
      tenantId: ctx.tenantId, entityType: 'RATE_CARD', entityId: rateCardId, route: '/api/procurement/rate-cards',
    });

    return apiSuccess({ rateCard }, 201);
  } catch (error: unknown) {
    await writeStructuredLog('error', 'rate_card.creation_failed', {
      operation: 'create_rate_card', route: '/api/procurement/rate-cards',
      requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
      actorId: ctx.userId, vendorId, rateCardId, itemCount, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToCreateRateCard, 500);
  }
}
