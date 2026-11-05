// src/app/api/vendor-portal/rfqs/[id]/route.ts
// Single RFQ details & Quote submission for Authenticated Vendor
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { isD1BatchWithinLimits, writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  MAX_D1_BATCH_STATEMENTS,
  AUDIT_LOG_INSERT_SQL,
  NEGOTIATION_BEST_QUOTE_UPDATE_SQL,
  NEGOTIATION_ROUND_MARK_REVISED_SQL,
  QUOTE_INSERT_SQL,
  QUOTE_LINE_INSERT_SQL,
  RFQ_MARK_RESPONSE_OPEN_SQL,
  RFQ_MESSAGE_INSERT_SQL,
  RFQ_VENDOR_MARK_SUBMITTED_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import type { NegotiationQuoteLineSnapshot } from '@app-types/app/api/vendor-portal-rfqs.types';


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404);
  }

  const { id: rfqId } = await params;
  const startedAt = Date.now();

  try {
    const rfq = await prisma.rfq.findFirst({
      where: {
        id: rfqId,
        tenantId: ctx.tenantId,
        invitedVendors: {
          some: { vendorId },
        },
      },
      include: {
        tenant: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, projectCode: true } },
        boqRevision: {
          select: {
            id: true,
            revisionNumber: true,
            boq: { select: { id: true, title: true, boqCode: true } },
          },
        },
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
        invitedVendors: {
          where: { vendorId },
        },
        quotes: {
          where: { vendorId },
          orderBy: { quoteVersion: 'desc' },
          include: { lines: true },
        },
        negotiations: {
          include: {
            rounds: {
              where: { vendorId },
              orderBy: { roundNumber: 'desc' },
            },
          },
        },
      },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }

    return apiSuccess({ rfq });
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'vendor_portal.rfq_detail_failed', {
        operation: 'read_vendor_rfq_detail', route: `/api/vendor-portal/rfqs/${rfqId}`,
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
        tenantId: ctx.tenantId, userId: ctx.userId, vendorId, rfqId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      }, 'application');
    } catch (loggingError: unknown) {
      console.error('vendor_portal.rfq_detail_log_failed', {
        operation: 'read_vendor_rfq_detail', route: `/api/vendor-portal/rfqs/${rfqId}`,
        tenantId: ctx.tenantId, userId: ctx.userId, vendorId, rfqId,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
        loggingError: loggingError instanceof Error ? { name: loggingError.name } : { type: typeof loggingError },
      });
    }
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRfqDetail, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404);
  }

  const { id: rfqId } = await params;

  try {
    const body = await req.json();
    const {
      lines, // array of { rfqLineId, unitRate, gstPercent, remarks, leadTimeDays }
      commercialNotes,
      validUntil,
      deliveryLeadTimeDays,
    } = body;

    const rfq = await prisma.rfq.findFirst({
      where: {
        id: rfqId,
        tenantId: ctx.tenantId,
        invitedVendors: {
          some: { vendorId },
        },
      },
      include: { lines: true },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.rFQNotFoundOrVendorNotInvited, 404);
    }

    if (!['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION'].includes(rfq.status)) {
      return apiError(interpolateUiString(UI_STRINGS.common.rFQStatusStatusDoesNotPermitVendorQuotationSubmissions, { "status": rfq.status }), 400);
    }

    // Determine quote version
    const existingQuotes = await prisma.quote.findMany({
      where: { rfqId, vendorId },
      orderBy: { quoteVersion: 'desc' },
      take: 1,
    });
    const nextVersion = existingQuotes.length > 0 ? existingQuotes[0].quoteVersion + 1 : 1;

    // Rule: Maximum 20 quote versions per vendor per RFQ during multi-round negotiations
    if (nextVersion > 20) {
      return apiError(UI_STRINGS.common.maximumLimitOf20QuoteVersionsReachedPerVendorForThisRFQ, 400);
    }

    // Rule: Validate that all required line-item prices are provided and positive
    if (!Array.isArray(lines) || lines.length === 0) {
      return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemQuotationRatesAreMandatoryBeforeSubmitting, 400);
    }

    const lineRateMap = new Map<string, number>();
    const rfqLineIds = new Set(rfq.lines.map((line) => line.id));
    for (const item of lines) {
      if (!item.rfqLineId || !rfqLineIds.has(item.rfqLineId) || lineRateMap.has(item.rfqLineId)) {
        return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemsMustReferenceEachRFQLineExactlyOnce, 400);
      }
      const rate = Number(item.unitRate);
      if (!Number.isFinite(rate)) {
        return apiError(
          interpolateUiString(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemLineNumberDescriptionMustHaveAValidPositiveUnitRateBeforeSubmission, {
            "lineNumber": rfq.lines.find((line) => line.id === item.rfqLineId)?.lineNumber || '',
            "description": rfq.lines.find((line) => line.id === item.rfqLineId)?.description || '',
          }),
          400,
        );
      }
      lineRateMap.set(item.rfqLineId, rate);
    }

    for (const rfqLine of rfq.lines) {
      const rate = lineRateMap.get(rfqLine.id);
      if (rate === undefined || isNaN(rate) || rate <= 0) {
        return apiError(
          interpolateUiString(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemLineNumberDescriptionMustHaveAValidPositiveUnitRateBeforeSubmission, { "lineNumber": rfqLine.lineNumber, "description": rfqLine.description }),
          400
        );
      }
    }

    // Prevent duplicate quote submissions from rapid double-clicks or retries
    const existingSameQuote = await prisma.quote.findFirst({
      where: {
        rfqId,
        vendorId,
        quoteVersion: nextVersion,
      },
      include: { lines: true },
    });
    if (existingSameQuote) {
      return apiSuccess({
        quote: existingSameQuote,
        message: nextVersion === 1 ? '1st Quote Submitted Successfully' : `Quote Version ${nextVersion} Submitted Successfully`,
        version: nextVersion,
      });
    }

    const quoteNumber = `QT-${rfq.rfqNumber}-${nextVersion.toString().padStart(2, '0')}`;

    // Calculate totals
    let totalBaseAmount = 0;
    let taxAmount = 0;
    const quoteLinesData: Array<{
      tenantId: string;
      rfqLineId: string;
      unitRate: number;
      taxPercent: number;
      discountPercent: number;
      lineTotal: number;
      remarks: string | null;
    }> = [];

    for (const item of lines) {
      // The validation above guarantees every submitted ID maps to an RFQ line
      // and every rate is finite and positive.
      const rfqLine = rfq.lines.find((l) => l.id === item.rfqLineId)!;
      const qty = rfqLine.quantity;
      const rate = Number(item.unitRate);
      const gst = item.gstPercent === undefined || item.gstPercent === null || item.gstPercent === ''
        ? 0
        : Number(item.gstPercent);
      if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
        return apiError(
          interpolateUiString(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemLineNumberDescriptionMustHaveAValidTaxRateBeforeSubmission, {
            "lineNumber": rfqLine.lineNumber || '',
            "description": rfqLine.description || '',
          }),
          400,
        );
      }
      const lineSubtotal = qty * rate;
      const lineTax = lineSubtotal * (gst / 100);
      const lineTotal = lineSubtotal + lineTax;

      totalBaseAmount += lineSubtotal;
      taxAmount += lineTax;

      quoteLinesData.push({
        tenantId: ctx.tenantId,
        rfqLineId: item.rfqLineId,
        unitRate: rate,
        taxPercent: gst,
        discountPercent: 0,
        lineTotal,
        remarks: item.remarks || null,
      });
    }

    const totalQuoteAmount = totalBaseAmount + taxAmount;

    const activeNeg = await prisma.negotiation.findFirst({
        where: { rfqId, tenantId: ctx.tenantId },
        include: {
          rounds: {
            where: { vendorId, status: { not: 'SUPERSEDED' } },
            orderBy: { roundNumber: 'desc' },
            take: 1,
          },
        },
      });
    const now = new Date();
    const validUntilDate = validUntil ? new Date(validUntil) : null;
    const submittedBy = ctx.userName || UI_STRINGS.common.vendorRepresentative;
    const quoteId = crypto.randomUUID();
    const quoteLines = quoteLinesData.map((line) => ({ ...line, id: crypto.randomUUID(), quoteId }));
    const quote = {
      id: quoteId,
      tenantId: ctx.tenantId,
      rfqId,
      vendorId,
      quoteNumber,
      quoteVersion: nextVersion,
      status: 'SUBMITTED',
      totalBaseAmount,
      taxAmount,
      discountAmount: 0,
      totalQuoteAmount,
      commercialTerms: commercialNotes || null,
      paymentTermsOffered: null,
      deliveryLeadTimeDays: deliveryLeadTimeDays ? Number(deliveryLeadTimeDays) : null,
      validUntil: validUntilDate,
      submittedAt: now,
      submittedBy,
      createdAt: now,
      updatedAt: now,
      lines: quoteLines,
    };
    const auditId = crypto.randomUUID();
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiVendorPortalRfqsIdRoute.quoteQuoteNumberVNextVersionSubmittedForRFQRfqNumberWithTotalToLocaleString,
      { quoteNumber, nextVersion, rfqNumber: rfq.rfqNumber, toLocaleString: totalQuoteAmount.toLocaleString(I18N_CONFIG.defaultLocale) },
    );
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: nextVersion > 1 ? 'REVISED_QUOTE_RECEIVED' : 'QUOTE_SUBMITTED',
      recordNumber: rfq.rfqNumber,
      entityId: rfq.id,
      actorName: ctx.userName || UI_STRINGS.common.vendorRepresentative,
      details: {
        vendorName: ctx.userName || UI_STRINGS.common.vendor,
        amount: totalQuoteAmount,
        roundNumber: nextVersion,
      },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, now, auditId)
      : null;
    const batchStatements: D1BatchInputStatement[] = [
      {
        sql: QUOTE_INSERT_SQL,
        values: [
          quote.id, quote.tenantId, quote.rfqId, quote.vendorId, quote.quoteNumber, quote.quoteVersion,
          quote.status, quote.totalBaseAmount, quote.taxAmount, quote.discountAmount, quote.totalQuoteAmount,
          quote.commercialTerms, quote.paymentTermsOffered, quote.deliveryLeadTimeDays,
          quote.validUntil?.toISOString() || null, now.toISOString(), quote.submittedBy,
          now.toISOString(), now.toISOString(),
        ],
      },
      ...quoteLines.map((line) => ({
        sql: QUOTE_LINE_INSERT_SQL,
        values: [line.id, line.tenantId, line.quoteId, line.rfqLineId, line.unitRate, line.taxPercent, line.discountPercent, line.lineTotal, line.remarks],
      })),
      { sql: RFQ_VENDOR_MARK_SUBMITTED_SQL, values: [rfqId, vendorId, ctx.tenantId] },
    ];

    if (rfq.status === 'RELEASED') {
      batchStatements.push({ sql: RFQ_MARK_RESPONSE_OPEN_SQL, values: [now.toISOString(), rfqId, ctx.tenantId] });
    }

    const candidateRound = activeNeg?.rounds[0];
    const activeRound = candidateRound && (!candidateRound.revisedQuoteAmount || candidateRound.nextResponsibleParty === 'VENDOR')
      ? candidateRound
      : null;

    if (activeRound && activeNeg) {
      let previousLineItems: NegotiationQuoteLineSnapshot[] = [];
      if (activeRound.lineItemsJson) {
        try {
          const parsed = typeof activeRound.lineItemsJson === 'string'
            ? JSON.parse(activeRound.lineItemsJson)
            : activeRound.lineItemsJson;
          if (Array.isArray(parsed)) {
            previousLineItems = parsed.filter((item): item is NegotiationQuoteLineSnapshot => typeof item === 'object' && item !== null);
          }
        } catch {
          previousLineItems = [];
        }
      }
      const mergedLineItems = lines.map((line: any) => {
        const lineId = line.rfqLineId;
        const previous = previousLineItems.find((item) => (item.rfqLineId || item.id) === lineId);
        const rfqLine = rfq.lines.find((item) => item.id === lineId)!;
        const quantity = rfqLine.quantity || previous?.quantity || 1;
        const rate = Number(line.unitRate);
        return {
          rfqLineId: lineId,
          description: rfqLine.description || previous?.description || UI_STRINGS.appAppBoqStudioPage.item,
          uom: rfqLine.uom || previous?.uom || 'Unit',
          quantity,
          counterRate: previous?.counterRate ?? null,
          revisedRate: rate,
          lineTotal: rate * quantity,
        };
      });
      batchStatements.push(
        {
          sql: NEGOTIATION_ROUND_MARK_REVISED_SQL,
          values: [totalQuoteAmount, JSON.stringify(mergedLineItems), now.toISOString(), activeRound.id, ctx.tenantId],
        },
        {
          sql: NEGOTIATION_BEST_QUOTE_UPDATE_SQL,
          values: [totalQuoteAmount, now.toISOString(), activeNeg.id, ctx.tenantId],
        },
        {
          sql: RFQ_MESSAGE_INSERT_SQL,
          values: [
            crypto.randomUUID(), ctx.tenantId, rfqId, ctx.userId, submittedBy, 'VENDOR',
            interpolateUiString(UI_STRINGS.appApiVendorPortalRfqsIdRoute.rEVISEDQUOTERECORDEDVendorSubmittedQuoteVNextVersionToLocaleStringRespondingToRoundRoundNumber, {
              "nextVersion": nextVersion,
              "toLocaleString": totalQuoteAmount.toLocaleString(I18N_CONFIG.defaultLocale),
              "roundNumber": activeRound.roundNumber,
            }),
            null, true, vendorId, now.toISOString(),
          ],
        },
      );
    }

    batchStatements.push({
      sql: AUDIT_LOG_INSERT_SQL,
      values: [
        auditId, ctx.tenantId, ctx.userId, rfq.projectId || null, 'QUOTE', quote.id, 'VENDOR_QUOTE_SUBMITTED',
        auditDescription, null,
        JSON.stringify({ rfqId: rfq.id, vendorId, quoteNumber, version: nextVersion, totalAmount: totalQuoteAmount }),
        null, null, now.toISOString(),
      ],
    });
    if (preparedNotification) batchStatements.push(preparedNotification.statement);

    if (batchStatements.length > MAX_D1_BATCH_STATEMENTS || !isD1BatchWithinLimits(batchStatements)) {
      return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.quotationHasTooManyLineItemsToSubmitAtomically, 400);
    }
    await writeD1BatchAtomically(batchStatements);
    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'QUOTE', entityId: quote.id,
        route: '/api/vendor-portal/rfqs/[id]',
      });
    }

    const confirmationMsg = nextVersion === 1
      ? '1st Quote Submitted Successfully'
      : `Quote Version ${nextVersion} Submitted Successfully`;

    return apiSuccess({ quote, message: confirmationMsg, version: nextVersion }, 201);
  } catch (error: unknown) {
    await writeStructuredLog('error', 'vendor_portal.quote_submission_failed', {
      operation: 'submit_quote',
      route: '/api/vendor-portal/rfqs/[id]',
      tenantId: ctx.tenantId,
      vendorId,
      durationMs: Date.now() - startedAt,
      requestId: req.headers?.get('x-request-id') || undefined,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitQuotation, 500);
  }
}
