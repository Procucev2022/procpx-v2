// src/app/api/procurement/negotiations/submit-offer/route.ts
// Handles Vendor Revised Offer and Final Offer Submissions with line-item persistence
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role === 'VENDOR') {
    if (!hasPermission(ctx.role, 'VENDOR_NEGOTIATE')) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.forbiddenInsufficientVendorNegotiationPermissions, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }
  } else {
    if (!hasPermission(ctx.role, 'NEGOTIATION_MANAGE')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }
  }

  try {
    const body = await req.json();
    let {
      rfqId,
      vendorId,
      revisedQuoteAmount,
      counterOfferAmount,
      lineItems,
      isFinalOffer = false,
      notes,
      submittedByVendor,
      deadline,
    } = body;

    // Automatically resolve vendorId from authenticated session if VENDOR role
    if (ctx.role === 'VENDOR') {
      if (!ctx.vendorId) {
        return apiError(UI_STRINGS.common.forbiddenVendorRecordNotAssociatedWithThisUserAccount, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
      if (!vendorId) {
        vendorId = ctx.vendorId;
      } else if (vendorId !== ctx.vendorId) {
        return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.forbiddenYouCanOnlySubmitOffersForYourOwnVendorAccount, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
    }

    if (!rfqId || !vendorId) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.rFQIDAndVendorIDAreRequired, 400, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: {
        quotes: {
          where: { vendorId },
          orderBy: { quoteVersion: 'desc' },
          take: 1,
        },
      },
    });

    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });

    if (ctx.role === 'VENDOR') {
      const isInvited = await prisma.rfqVendor.findFirst({
        where: { rfqId, vendorId, tenantId: ctx.tenantId },
      });
      if (!isInvited) {
        return apiError(UI_STRINGS.common.forbiddenVendorIsNotInvitedToThisRFQ, 403, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
    }

    if (!['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION'].includes(rfq.status)) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.rFQStatusStatusDoesNotPermitVendorQuotationOffers, { "status": rfq.status }), 400, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) return apiError(UI_STRINGS.common.vendorNotFound, 404, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });

    // Find or create negotiation record
    let negotiation = await prisma.negotiation.findFirst({
      where: { rfqId, tenantId: ctx.tenantId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'desc' },
        },
      },
    });

    if (!negotiation) {
      negotiation = await prisma.negotiation.create({
        data: {
          tenantId: ctx.tenantId,
          rfqId,
          currentRound: 1,
          status: 'ACTIVE',
        },
        include: {
          rounds: {
            orderBy: { roundNumber: 'desc' },
          },
        },
      });
    }

    // Previous quote amount
    const latestQuote = rfq.quotes[0];
    const previousQuoteAmount = latestQuote ? latestQuote.totalQuoteAmount : 0;
    const previousRound = negotiation.rounds.find((r) => r.vendorId === vendorId) || negotiation.rounds[0];
    const isBuyer = ctx.role !== 'VENDOR';

    const finalCounterAmount = isBuyer ? (counterOfferAmount ? Number(counterOfferAmount) : Number(revisedQuoteAmount)) : (previousRound?.counterOfferAmount || null);
    const finalRevised = isBuyer ? null : Number(revisedQuoteAmount);

    // Check round limits
    const vendorRounds = (negotiation.rounds || []).filter((r) => r.vendorId === vendorId);
    const vendorBuyerOffers = vendorRounds.filter(
      (r) => r.counterOfferAmount !== null || (!r.revisedQuoteAmount && r.nextResponsibleParty === 'VENDOR')
    );

    if (isBuyer && vendorBuyerOffers.length >= 20) {
      return apiError(UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.maximumLimitOf20BuyerCounteroffersReachedForThisVendor, 400, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
    }

    // Check vendor quote version limit
    let nextQuoteVersion = 1;
    if (!isBuyer) {
      const existingQuotes = await prisma.quote.findMany({
        where: { rfqId, vendorId },
        orderBy: { quoteVersion: 'desc' },
        take: 1,
      });
      nextQuoteVersion = existingQuotes.length > 0 ? existingQuotes[0].quoteVersion + 1 : 1;
      if (nextQuoteVersion > 20) {
        return apiError(UI_STRINGS.common.maximumLimitOf20QuoteVersionsReachedPerVendorForThisRFQ, 400, { route: '/api/procurement/negotiations/submit-offer', method: 'POST' });
      }
    }

    const roundNumber = isBuyer ? vendorBuyerOffers.length + 1 : (previousRound?.roundNumber || vendorRounds.length + 1);
    const effectiveAmt = finalRevised || (isBuyer ? finalCounterAmount : 0) || 0;
    const savingsAmount = previousQuoteAmount > 0 && finalRevised && finalRevised > 0 ? previousQuoteAmount - finalRevised : 0;
    const savingsPercent = previousQuoteAmount > 0 && finalRevised && finalRevised > 0 ? (savingsAmount / previousQuoteAmount) * 100 : 0;

    const roundStatus = isBuyer ? 'ROUND_ACTIVE' : (isFinalOffer ? 'FINAL_OFFER_SUBMITTED' : 'REVISED_SUBMITTED');
    const buyerDecision = isBuyer ? null : (isFinalOffer ? 'PENDING_BUYER_DECISION' : null);
    const nextResponsibleParty = isBuyer ? 'VENDOR' : 'BUYER';

    let round: any;
    if (
      !isBuyer &&
      previousRound &&
      previousRound.vendorId === vendorId &&
      previousRound.counterOfferAmount &&
      (!previousRound.revisedQuoteAmount || previousRound.nextResponsibleParty === 'VENDOR')
    ) {
      // Respond directly to the active buyer counteroffer round
      let mergedLineItemsJson: string | null = previousRound.lineItemsJson;
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        let prevItems: any[] = [];
        try {
          if (previousRound.lineItemsJson) {
            prevItems = typeof previousRound.lineItemsJson === 'string' ? JSON.parse(previousRound.lineItemsJson) : previousRound.lineItemsJson;
          }
        } catch {}
        const merged = lineItems.map((li: any) => {
          const prev = prevItems.find((p: any) => (p.rfqLineId || p.id) === (li.rfqLineId || li.id));
          return {
            rfqLineId: li.rfqLineId || li.id,
            description: li.description || prev?.description,
            uom: li.uom || prev?.uom,
            quantity: li.quantity || prev?.quantity || 1,
            counterRate: prev?.counterRate ?? null,
            revisedRate: Number(li.revisedRate ?? li.unitRate ?? 0),
            lineTotal: Number(li.lineTotal || (Number(li.revisedRate ?? li.unitRate ?? 0) * (li.quantity || prev?.quantity || 1))),
          };
        });
        mergedLineItemsJson = JSON.stringify(merged);
      }

      round = await prisma.negotiationRound.update({
        where: { id: previousRound.id },
        data: {
          revisedQuoteAmount: finalRevised,
          savingsAmount: Math.max(0, savingsAmount),
          savingsPercent: Math.round(savingsPercent * 100) / 100,
          status: roundStatus,
          notes: notes || (isFinalOffer ? 'Submitted by vendor as binding final offer' : 'Vendor revised offer submitted'),
          isFinalOffer: Boolean(isFinalOffer),
          buyerDecision,
          nextResponsibleParty: 'BUYER',
          lineItemsJson: mergedLineItemsJson,
          submittedByVendor: submittedByVendor || vendor.name,
        },
        include: {
          vendor: true,
        },
      });
    } else {
      // Prevent duplicate offers from repeated clicks or retries
      const recentDuplicate = negotiation.rounds.find(
        (r) =>
          r.vendorId === vendorId &&
          ((finalCounterAmount && r.counterOfferAmount === finalCounterAmount) ||
            (finalRevised && r.revisedQuoteAmount === finalRevised)) &&
          new Date().getTime() - new Date(r.createdAt).getTime() < 4000
      );
      if (recentDuplicate) {
        return apiSuccess({ round: recentDuplicate, message: UI_STRINGS.appApiProcurementNegotiationsSubmitOfferRoute.offerAlreadyRecorded });
      }

      round = await prisma.negotiationRound.create({
        data: {
          tenantId: ctx.tenantId,
          negotiationId: negotiation.id,
          vendorId,
          roundNumber,
          deadline: deadline ? new Date(deadline) : previousRound?.deadline || null,
          targetPrice: previousRound?.targetPrice || null,
          previousQuoteAmount,
          counterOfferAmount: finalCounterAmount,
          revisedQuoteAmount: finalRevised,
          savingsAmount: Math.max(0, savingsAmount),
          savingsPercent: Math.round(savingsPercent * 100) / 100,
          status: roundStatus,
          notes: notes || (isBuyer ? 'Buyer commercial counteroffer dispatched' : (isFinalOffer ? 'Submitted by vendor as binding final offer' : 'Vendor revised offer submitted')),
          isFinalOffer: isBuyer ? false : Boolean(isFinalOffer),
          buyerDecision,
          nextResponsibleParty,
          lineItemsJson: lineItems ? JSON.stringify(lineItems) : null,
          submittedByVendor: isBuyer ? null : (submittedByVendor || vendor.name),
        },
        include: {
          vendor: true,
        },
      });
    }

    // When vendor submits a revised offer, create corresponding Quote version record
    if (!isBuyer && finalRevised) {
      const quoteNumber = `QT-${rfq.rfqNumber}-${nextQuoteVersion.toString().padStart(2, '0')}`;
      let quoteLinesData: any[] = [];
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        quoteLinesData = lineItems.map((li: any) => ({
          tenantId: ctx.tenantId,
          rfqLineId: li.rfqLineId || li.id,
          unitRate: Number(li.revisedRate || li.unitRate || 0),
          taxPercent: 18,
          discountPercent: 0,
          lineTotal: Number(li.lineTotal || (Number(li.revisedRate || li.unitRate || 0) * (li.quantity || 1))),
          remarks: li.remarks || null,
        }));
      }

      await prisma.quote.create({
        data: {
          tenantId: ctx.tenantId,
          rfqId,
          vendorId,
          quoteNumber,
          quoteVersion: nextQuoteVersion,
          totalBaseAmount: finalRevised / 1.18,
          taxAmount: finalRevised - (finalRevised / 1.18),
          totalQuoteAmount: finalRevised,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          submittedBy: submittedByVendor || vendor.name,
          lines: quoteLinesData.length > 0 ? { create: quoteLinesData } : undefined,
        },
      });
    }

    // Update parent negotiation container
    await prisma.negotiation.update({
      where: { id: negotiation.id },
      data: {
        currentRound: Math.max(negotiation.currentRound, roundNumber),
        bestQuoteAmount: finalRevised || finalCounterAmount || previousQuoteAmount,
      },
    });

    // Also update RFQ status if not already NEGOTIATION
    if (rfq.status !== 'NEGOTIATION') {
      await prisma.rfq.update({
        where: { id: rfqId },
        data: { status: 'NEGOTIATION' },
      });
    }

    // Create persistent RFQ message entry for audit timeline
    await prisma.rfqMessage.create({
      data: {
        tenantId: ctx.tenantId,
        rfqId,
        senderId: ctx.userId,
        senderName: isBuyer ? (ctx.userName || 'Category Manager') : (submittedByVendor || vendor.name),
        senderRole: isBuyer ? ctx.role : 'VENDOR',
        message: isBuyer
          ? `[BUYER COUNTEROFFER] Buyer submitted counteroffer of ₹ ${(finalCounterAmount || 0).toLocaleString()} (Round ${roundNumber}) to ${vendor.name}. ${notes || ''}`
          : isFinalOffer
          ? `[FINAL OFFER SUBMITTED] Vendor ${vendor.name} submitted their binding final offer of ₹ ${finalRevised?.toLocaleString()} (Round ${roundNumber}). Awaiting Buyer Decision.`
          : `[REVISED OFFER] Vendor ${vendor.name} submitted revised quote of ₹ ${finalRevised?.toLocaleString()} (Round ${roundNumber}).`,
        isVendorSent: !isBuyer,
        vendorId: vendor.id,
      },
    });

    // Audit log
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'NEGOTIATION',
      entityId: round.id,
      action: isBuyer ? 'BUYER_COUNTEROFFER_SUBMITTED' : (isFinalOffer ? 'FINAL_OFFER_SUBMITTED' : 'REVISED_OFFER_SUBMITTED'),
      description: isBuyer
        ? `Buyer counteroffer of ₹ ${(finalCounterAmount || 0).toLocaleString()} dispatched to ${vendor.name} for RFQ ${rfq.rfqNumber}`
        : `${isFinalOffer ? 'Final Offer' : 'Revised Offer'} submitted by ${vendor.name} for RFQ ${rfq.rfqNumber}. Revised: ₹ ${(finalRevised || 0).toLocaleString()}`,
      newValue: {
        roundNumber,
        isFinalOffer,
        counterOfferAmount: finalCounterAmount,
        revisedQuoteAmount: finalRevised,
        savingsAmount,
        savingsPercent,
      },
    });

    // Notify respective party
    if (isBuyer) {
      await notifyNextResponsibleParty({
        tenantId: ctx.tenantId,
        event: 'COUNTER_OFFER_SENT',
        recordNumber: rfq.rfqNumber,
        entityId: rfq.id,
        details: {
          vendorName: vendor.name,
          amount: finalCounterAmount || undefined,
          roundNumber,
        },
      });
    } else {
      await notifyNextResponsibleParty({
        tenantId: ctx.tenantId,
        event: 'REVISED_QUOTE_RECEIVED',
        recordNumber: rfq.rfqNumber,
        entityId: rfq.id,
        details: {
          vendorName: vendor.name,
          amount: finalRevised || 0,
          roundNumber,
          isFinalOffer,
        },
      });
    }

    return apiSuccess({
      round,
      message: isBuyer
        ? `Counteroffer of ₹ ${(finalCounterAmount || 0).toLocaleString()} dispatched to ${vendor.name} successfully.`
        : isFinalOffer
        ? `Final offer of ₹ ${finalRevised?.toLocaleString()} submitted successfully. Pending Buyer Decision.`
        : `Revised offer of ₹ ${finalRevised?.toLocaleString()} submitted successfully.`,
    }, 201);
  } catch (error: any) {
    console.error('Error submitting negotiation offer:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSubmitNegotiationOffer }), 500, { route: '/api/procurement/negotiations/submit-offer', method: 'POST', error: error });
  }
}
