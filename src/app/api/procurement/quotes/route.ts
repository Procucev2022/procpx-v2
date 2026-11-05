// app/api/procurement/quotes/route.ts
// Vendor quote submission and retrieval with immutable version history
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { isD1BatchWithinLimits, writeD1BatchAtomically } from '@/lib/d1-batch';
import { D1_QUOTE_INSERT_RESULT_MISSING, MAX_D1_BATCH_STATEMENTS, QUOTE_AUDIT_INSERT_AFTER_INSERT_SQL, QUOTE_INSERT_WITH_NEXT_VERSION_SQL, QUOTE_LINE_INSERT_SQL, RFQ_MARK_RESPONSE_OPEN_SQL, RFQ_VENDOR_SUBMITTED_UPSERT_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { getListPageWindow } from '@/lib/api-utils';
import { prepareQuoteNotificationOutbox } from '@/lib/notification-outbox';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('QUOTE_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const vendorId = searchParams.get('vendorId');
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  const startedAt = Date.now();

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;
    if (vendorId) where.vendorId = vendorId;

    const include = {
      vendor: { select: { id: true, name: true, code: true } },
      rfq: { select: { id: true, rfqNumber: true, title: true, status: true } },
      ...(rfqId ? { lines: { include: { rfqLine: true } } } : {}),
    };
    const [total, quotes] = await Promise.all([
      prisma.quote.count({ where }),
      prisma.quote.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return apiSuccess({ quotes, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    await writeStructuredLog('error', 'procurement.quotes_read_failed', {
      operation: 'read_quotes', route: '/api/procurement/quotes',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      rfqId, vendorId, page, pageSize, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchQuotes, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('QUOTE_SUBMIT');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let rfqId: string | undefined;
  let vendorId: string | undefined;
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.appApiProcurementQuotesRoute.rFQIDVendorIDAndLinePricingAreRequired, 400);
    }
    rfqId = typeof body.rfqId === 'string' ? body.rfqId : undefined;
    vendorId = typeof body.vendorId === 'string' ? body.vendorId : undefined;
    const lines: unknown[] = Array.isArray(body.lines) ? body.lines : [];
    const { commercialTerms, paymentTermsOffered, deliveryLeadTimeDays, validUntil } = body;

    if (!rfqId || !vendorId || !lines.length) {
      return apiError(UI_STRINGS.appApiProcurementQuotesRoute.rFQIDVendorIDAndLinePricingAreRequired, 400);
    }

    if (ctx.role === 'VENDOR') {
      if (!ctx.vendorId) {
        return apiError(UI_STRINGS.common.forbiddenVendorRecordNotAssociatedWithThisUserAccount, 403);
      }
      if (vendorId !== ctx.vendorId) {
        return apiError(UI_STRINGS.appApiProcurementQuotesRoute.forbiddenYouCanOnlySubmitQuotesForYourOwnVendorAccount, 403);
      }
    }

    // 1. Verify RFQ exists and belongs to this tenant
    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: { lines: true },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }

    if (ctx.role === 'VENDOR') {
      const isInvited = await prisma.rfqVendor.findFirst({
        where: { rfqId, vendorId: ctx.vendorId!, tenantId: ctx.tenantId },
      });
      if (!isInvited) {
        return apiError(UI_STRINGS.common.forbiddenVendorIsNotInvitedToThisRFQ, 403);
      }
    }

    if (!['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION'].includes(rfq.status)) {
      return apiError(interpolateUiString(UI_STRINGS.common.rFQStatusStatusDoesNotPermitVendorQuotationSubmissions, { "status": rfq.status }), 400);
    }

    // 2. Verify vendor exists
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied, 404);
    }

    if (commercialTerms !== undefined && commercialTerms !== null && typeof commercialTerms !== 'string') {
      return apiError(UI_STRINGS.appApiProcurementQuotesRoute.commercialAndPaymentTermsMustBeText, 400);
    }
    if (paymentTermsOffered !== undefined && paymentTermsOffered !== null && typeof paymentTermsOffered !== 'string') {
      return apiError(UI_STRINGS.appApiProcurementQuotesRoute.commercialAndPaymentTermsMustBeText, 400);
    }

    const leadTime = deliveryLeadTimeDays === undefined || deliveryLeadTimeDays === null || deliveryLeadTimeDays === ''
      ? 30
      : Number(deliveryLeadTimeDays);
    const validUntilDate = validUntil === undefined || validUntil === null || validUntil === ''
      ? null
      : new Date(validUntil);
    if (!Number.isInteger(leadTime) || leadTime < 0 || (validUntilDate && Number.isNaN(validUntilDate.getTime()))) {
      return apiError(UI_STRINGS.appApiProcurementQuotesRoute.deliveryLeadTimeAndValidityDateMustBeValid, 400);
    }

    // Validate every line against this RFQ before creating any quote data.
    const rfqLineById = new Map(rfq.lines.map((line) => [line.id, line]));
    const seenLineIds = new Set<string>();
    const quoteId = crypto.randomUUID();
    let totalBaseAmount = 0;
    let totalTaxAmount = 0;
    let totalDiscountAmount = 0;
    let grandTotalQuoteAmount = 0;

    const quoteLinesData: Array<{
      id: string;
      tenantId: string;
      quoteId: string;
      rfqLineId: string;
      unitRate: number;
      taxPercent: number;
      discountPercent: number;
      lineTotal: number;
      remarks: string | null;
    }> = [];
    for (const inputLine of lines) {
      if (!inputLine || typeof inputLine !== 'object' || Array.isArray(inputLine)) {
        return apiError(UI_STRINGS.appApiProcurementQuotesRoute.linePricingValuesMustBeFiniteWithNonNegativeRatesAndTaxAndDiscountUpToOneHundredPercent, 400);
      }
      const line = inputLine as Record<string, unknown>;
      const rfqLineId = typeof line.rfqLineId === 'string' ? line.rfqLineId : '';
      const rfqLine = rfqLineById.get(rfqLineId);
      if (!rfqLine || seenLineIds.has(rfqLineId)) {
        return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemsMustReferenceEachRFQLineExactlyOnce, 400);
      }
      seenLineIds.add(rfqLineId);

      const unitRate = Number(line.unitRate);
      const taxPercent = line.taxPercent === undefined || line.taxPercent === null || line.taxPercent === ''
        ? 18
        : Number(line.taxPercent);
      const discountPercent = line.discountPercent === undefined || line.discountPercent === null || line.discountPercent === ''
        ? 0
        : Number(line.discountPercent);
      if (!Number.isFinite(unitRate) || unitRate < 0 || !Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100
        || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        return apiError(UI_STRINGS.appApiProcurementQuotesRoute.linePricingValuesMustBeFiniteWithNonNegativeRatesAndTaxAndDiscountUpToOneHundredPercent, 400);
      }

      const qty = Number(rfqLine.quantity);
      const baseLine = unitRate * qty;
      if (!Number.isFinite(baseLine)) {
        return apiError(UI_STRINGS.appApiProcurementQuotesRoute.linePricingValuesMustBeFiniteWithNonNegativeRatesAndTaxAndDiscountUpToOneHundredPercent, 400);
      }

      const discountAmt = baseLine * (discountPercent / 100);
      const afterDiscount = baseLine - discountAmt;
      const taxAmt = afterDiscount * (taxPercent / 100);
      const lineTotal = afterDiscount + taxAmt;
      if (![discountAmt, taxAmt, lineTotal].every(Number.isFinite)) {
        return apiError(UI_STRINGS.appApiProcurementQuotesRoute.linePricingValuesMustBeFiniteWithNonNegativeRatesAndTaxAndDiscountUpToOneHundredPercent, 400);
      }

      totalBaseAmount += baseLine;
      totalDiscountAmount += discountAmt;
      totalTaxAmount += taxAmt;
      grandTotalQuoteAmount += lineTotal;

      quoteLinesData.push({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        quoteId,
        rfqLineId,
        unitRate,
        taxPercent,
        discountPercent,
        lineTotal,
        remarks: typeof line.remarks === 'string' && line.remarks ? line.remarks : null,
      });
    }

    if (![totalBaseAmount, totalTaxAmount, totalDiscountAmount, grandTotalQuoteAmount].every(Number.isFinite)) {
      return apiError(UI_STRINGS.appApiProcurementQuotesRoute.linePricingValuesMustBeFiniteWithNonNegativeRatesAndTaxAndDiscountUpToOneHundredPercent, 400);
    }

    const now = new Date();
    const auditId = crypto.randomUUID();
    const submittedNotificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId, event: 'QUOTE_SUBMITTED', recordNumber: rfq.rfqNumber,
      entityId: rfq.id, actorName: ctx.userName, details: { vendorName: vendor.name, amount: grandTotalQuoteAmount },
    }, { prepareOnly: true });
    const revisedNotificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId, event: 'REVISED_QUOTE_RECEIVED', recordNumber: rfq.rfqNumber,
      entityId: rfq.id, actorName: ctx.userName, details: { vendorName: vendor.name, amount: grandTotalQuoteAmount },
    }, { prepareOnly: true });
    const preparedNotification = submittedNotificationPayload && revisedNotificationPayload
      ? prepareQuoteNotificationOutbox(submittedNotificationPayload, revisedNotificationPayload, quoteId, now, auditId)
      : null;
    const batchStatements: D1BatchInputStatement[] = [
      {
        sql: QUOTE_INSERT_WITH_NEXT_VERSION_SQL,
        values: [
          quoteId, ctx.tenantId, rfqId, vendorId, now.getFullYear(), ctx.tenantId,
          ctx.tenantId, rfqId, vendorId, ctx.tenantId, rfqId, vendorId,
          totalBaseAmount, totalTaxAmount, totalDiscountAmount, grandTotalQuoteAmount,
          typeof commercialTerms === 'string' ? commercialTerms : null,
          typeof paymentTermsOffered === 'string' ? paymentTermsOffered : null,
          leadTime, validUntilDate?.toISOString() || null, now.toISOString(), ctx.userId,
          now.toISOString(), now.toISOString(),
        ],
      },
      ...quoteLinesData.map((line) => ({
        sql: QUOTE_LINE_INSERT_SQL,
        values: [line.id, line.tenantId, line.quoteId, line.rfqLineId, line.unitRate, line.taxPercent, line.discountPercent, line.lineTotal, line.remarks],
      })),
      {
        sql: RFQ_VENDOR_SUBMITTED_UPSERT_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, rfqId, vendorId],
      },
    ];
    if (rfq.status === 'RELEASED') {
      batchStatements.push({ sql: RFQ_MARK_RESPONSE_OPEN_SQL, values: [now.toISOString(), rfqId, ctx.tenantId] });
    }
    batchStatements.push({
      sql: QUOTE_AUDIT_INSERT_AFTER_INSERT_SQL,
      values: [auditId, ctx.tenantId, ctx.userId, rfq.projectId,
        interpolateUiString(UI_STRINGS.appApiProcurementQuotesRoute.quoteQuoteNumberVNextVersionSubmittedByNameForRFQRfqNumberToLocaleString, {
          quoteNumber: '__QUOTE_NUMBER__', nextVersion: '__QUOTE_VERSION__', name: vendor.name,
          rfqNumber: rfq.rfqNumber, toLocaleString: grandTotalQuoteAmount.toLocaleString(),
        }),
        JSON.stringify({ quoteNumber: '__QUOTE_NUMBER__', version: '__QUOTE_VERSION__', totalQuoteAmount: grandTotalQuoteAmount,
          baseAmount: totalBaseAmount, taxAmount: totalTaxAmount }),
        null, null, now.toISOString(), quoteId, ctx.tenantId],
    });
    if (preparedNotification) batchStatements.push(preparedNotification.statement);
    if (batchStatements.length > MAX_D1_BATCH_STATEMENTS || !isD1BatchWithinLimits(batchStatements)) {
      return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.quotationHasTooManyLineItemsToSubmitAtomically, 400);
    }

    const results = await writeD1BatchAtomically(batchStatements);
    const quoteRow = results[0]?.results?.[0];
    if (!quoteRow || typeof quoteRow.id !== 'string' || typeof quoteRow.quoteNumber !== 'string'
      || !Number.isFinite(Number(quoteRow.quoteVersion))) {
      throw new Error(D1_QUOTE_INSERT_RESULT_MISSING);
    }
    const auditIndex = batchStatements.findIndex(({ sql }) => sql === QUOTE_AUDIT_INSERT_AFTER_INSERT_SQL);
    if (auditIndex < 0 || Number(results[auditIndex]?.meta?.changes || 0) !== 1
      || (preparedNotification && Number(results[results.length - 1]?.meta?.changes || 0) !== 1)) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const quoteNumber = quoteRow.quoteNumber;
    const nextVersion = Number(quoteRow.quoteVersion);
    const quote = {
      ...quoteRow,
      id: quoteRow.id,
      quoteNumber,
      quoteVersion: nextVersion,
      validUntil: validUntilDate,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      vendor,
      lines: quoteLinesData,
    };

    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'QUOTE', entityId: quote.id,
        route: '/api/procurement/quotes',
      });
    }

    return apiSuccess({ quote, message: interpolateUiString(UI_STRINGS.appApiProcurementQuotesRoute.quoteVNextVersionSubmittedSuccessfully, { "nextVersion": nextVersion }) }, 201);
  } catch (error: any) {
    await writeStructuredLog('error', 'procurement.quote_submission_failed', {
      operation: 'submit_quote',
      route: '/api/procurement/quotes',
      tenantId: ctx.tenantId,
      rfqId,
      vendorId,
      requestId: req.headers.get('x-request-id') || undefined,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitQuote, 500);
  }
}
