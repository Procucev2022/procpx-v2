// src/app/api/vendor-portal/rfqs/[id]/route.ts
// Single RFQ details & Quote submission for Authenticated Vendor
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/rfqs/[id]', method: 'GET' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/rfqs/[id]', method: 'GET' });
  }

  const { id: rfqId } = await params;

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
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/vendor-portal/rfqs/[id]', method: 'GET' });
    }

    return apiSuccess({ rfq });
  } catch (error: any) {
    console.error('Error fetching vendor RFQ detail:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchRfqDetail }), 500, { route: '/api/vendor-portal/rfqs/[id]', method: 'GET', error: error });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST' });
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
      return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.rFQNotFoundOrVendorNotInvited, 404, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST' });
    }

    if (!['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION'].includes(rfq.status)) {
      return apiError(interpolateUiString(UI_STRINGS.common.rFQStatusStatusDoesNotPermitVendorQuotationSubmissions, { "status": rfq.status }), 400, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST' });
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
      return apiError(UI_STRINGS.common.maximumLimitOf20QuoteVersionsReachedPerVendorForThisRFQ, 400, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST' });
    }

    // Rule: Validate that all required line-item prices are provided and positive
    if (!Array.isArray(lines) || lines.length === 0) {
      return apiError(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemQuotationRatesAreMandatoryBeforeSubmitting, 400, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST' });
    }

    const lineRateMap = new Map<string, number>();
    for (const item of lines) {
      const rate = Number(item.unitRate);
      if (item.rfqLineId) {
        lineRateMap.set(item.rfqLineId, rate);
      }
    }

    for (const rfqLine of rfq.lines) {
      const rate = lineRateMap.get(rfqLine.id);
      if (rate === undefined || isNaN(rate) || rate <= 0) {
        return apiError(
          interpolateUiString(UI_STRINGS.appApiVendorPortalRfqsIdRoute.lineItemLineNumberDescriptionMustHaveAValidPositiveUnitRateBeforeSubmission, { "lineNumber": rfqLine.lineNumber, "description": rfqLine.description }),
          400, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST' });
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
    const quoteLinesData: any[] = [];

    for (const item of lines) {
      const rfqLine = rfq.lines.find((l) => l.id === item.rfqLineId);
      const qty = rfqLine ? rfqLine.quantity : 1;
      const rate = Number(item.unitRate) || 0;
      const gst = Number(item.gstPercent) || 0;
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

    // Execute quote creation, vendor status update, negotiation round response transactionally
    const { quote, updatedRound } = await prisma.$transaction(async (tx) => {
      const newQuote = await tx.quote.create({
        data: {
          tenantId: ctx.tenantId,
          rfqId,
          vendorId,
          quoteNumber,
          quoteVersion: nextVersion,
          totalBaseAmount,
          taxAmount,
          totalQuoteAmount,
          status: 'SUBMITTED',
          validUntil: validUntil ? new Date(validUntil) : null,
          commercialTerms: commercialNotes || null,
          deliveryLeadTimeDays: deliveryLeadTimeDays ? Number(deliveryLeadTimeDays) : null,
          submittedAt: new Date(),
          submittedBy: ctx.userName || 'Vendor Representative',
          lines: {
            create: quoteLinesData,
          },
        },
        include: { lines: true },
      });

      // Update invited vendor status
      await tx.rfqVendor.updateMany({
        where: { rfqId, vendorId },
        data: {
          invitationStatus: 'SUBMITTED',
          submissionStatus: 'SUBMITTED',
        },
      });

      // Transition RFQ status to VENDOR_RESPONSE_OPEN if currently RELEASED
      if (rfq.status === 'RELEASED') {
        await tx.rfq.update({
          where: { id: rfqId },
          data: { status: 'VENDOR_RESPONSE_OPEN' },
        });
      }

      // Sync active negotiation round if vendor is responding to an open buyer counteroffer
      let matchedRound: any = null;
      const activeNeg = await tx.negotiation.findFirst({
        where: { rfqId, tenantId: ctx.tenantId },
        include: {
          rounds: {
            where: { vendorId, status: { not: 'SUPERSEDED' } },
            orderBy: { roundNumber: 'desc' },
            take: 1,
          },
        },
      });

      if (activeNeg && activeNeg.rounds.length > 0) {
        const activeRound = activeNeg.rounds[0];
        if (!activeRound.revisedQuoteAmount || activeRound.nextResponsibleParty === 'VENDOR') {
          // Merge line items so both buyer counter rates and vendor revised rates are preserved
          let mergedLineItemsJson = activeRound.lineItemsJson;
          if (Array.isArray(lines) && lines.length > 0) {
            let prevItems: any[] = [];
            try {
              if (activeRound.lineItemsJson) {
                prevItems = typeof activeRound.lineItemsJson === 'string' ? JSON.parse(activeRound.lineItemsJson) : activeRound.lineItemsJson;
              }
            } catch {}
            const merged = lines.map((li: any) => {
              const prev = prevItems.find((p: any) => (p.rfqLineId || p.id) === (li.rfqLineId || li.id));
              const rfqLine = rfq.lines.find((l: any) => l.id === (li.rfqLineId || li.id));
              const qty = rfqLine?.quantity || prev?.quantity || 1;
              const rate = Number(li.unitRate || 0);
              return {
                rfqLineId: li.rfqLineId || li.id,
                description: interpolateUiString(UI_STRINGS.common.value1, { "value1": rfqLine?.description || prev?.description || UI_STRINGS.appAppBoqStudioPage.item }),
                uom: rfqLine?.uom || prev?.uom || 'Unit',
                quantity: qty,
                counterRate: prev?.counterRate ?? null,
                revisedRate: rate,
                lineTotal: rate * qty,
              };
            });
            mergedLineItemsJson = JSON.stringify(merged);
          }

          matchedRound = await tx.negotiationRound.update({
            where: { id: activeRound.id },
            data: {
              revisedQuoteAmount: totalQuoteAmount,
              status: 'REVISED_SUBMITTED',
              nextResponsibleParty: 'BUYER',
              lineItemsJson: mergedLineItemsJson,
            },
          });

          await tx.negotiation.update({
            where: { id: activeNeg.id },
            data: {
              bestQuoteAmount: totalQuoteAmount,
            },
          });

          await tx.rfqMessage.create({
            data: {
              tenantId: ctx.tenantId,
              rfqId,
              senderId: ctx.userId,
              senderName: ctx.userName || 'Vendor Representative',
              senderRole: 'VENDOR',
              message: interpolateUiString(UI_STRINGS.appApiVendorPortalRfqsIdRoute.rEVISEDQUOTERECORDEDVendorSubmittedQuoteVNextVersionToLocaleStringRespondingToRoundRoundNumber, { "nextVersion": nextVersion, "toLocaleString": totalQuoteAmount.toLocaleString(I18N_CONFIG.defaultLocale), "roundNumber": activeRound.roundNumber }),
              isVendorSent: true,
              vendorId,
            },
          });
        }
      }

      return { quote: newQuote, updatedRound: matchedRound };
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'QUOTE',
      entityId: quote.id,
      action: 'VENDOR_QUOTE_SUBMITTED',
      description: interpolateUiString(UI_STRINGS.appApiVendorPortalRfqsIdRoute.quoteQuoteNumberVNextVersionSubmittedForRFQRfqNumberWithTotalToLocaleString, { "quoteNumber": quoteNumber, "nextVersion": nextVersion, "rfqNumber": rfq.rfqNumber, "toLocaleString": totalQuoteAmount.toLocaleString(I18N_CONFIG.defaultLocale) }),
    });

    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: nextVersion > 1 ? 'REVISED_QUOTE_RECEIVED' : 'QUOTE_SUBMITTED',
      recordNumber: rfq.rfqNumber,
      entityId: rfq.id,
      actorName: ctx.userName || 'Vendor Representative',
      details: {
        vendorName: ctx.userName || 'Vendor',
        amount: totalQuoteAmount,
        roundNumber: nextVersion,
      },
    });

    const confirmationMsg = nextVersion === 1
      ? '1st Quote Submitted Successfully'
      : `Quote Version ${nextVersion} Submitted Successfully`;

    return apiSuccess({ quote, message: confirmationMsg, version: nextVersion }, 201);
  } catch (error: any) {
    console.error('Error submitting quotation:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSubmitQuotation }), 500, { route: '/api/vendor-portal/rfqs/[id]', method: 'POST', error: error });
  }
}
