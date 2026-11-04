// src/app/api/vendor-portal/rate-cards/route.ts
// Vendor Rate Cards listing API (strictly isolated to logged-in vendor)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


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

  try {
    const rateCards = await prisma.vendorRateCard.findMany({
      where: {
        tenantId: ctx.tenantId,
        vendorId,
      },
      include: {
        vendor: true,
        items: {
          where: { isActive: true },
        },
        approvals: {
          orderBy: { timestamp: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = rateCards.map((rc) => {
      const enrichedItems = rc.items.map((it) => {
        let meta: any = {};
        if (it.comparisonRef) {
          try {
            meta = JSON.parse(it.comparisonRef);
          } catch {}
        }
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

      let notesData: any = {};
      if (rc.notes) {
        try { notesData = JSON.parse(rc.notes); } catch {}
      }

      return {
        ...rc,
        items: enrichedItems,
        itemCount: rc.items.length,
        agreement: notesData.agreement || null,
      };
    });

    return apiSuccess({ rateCards: formatted, total: formatted.length });
  } catch (error: any) {
    console.error('Error fetching vendor rate cards:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchRateCards }), 500, { route: '/api/vendor-portal/rate-cards', method: 'GET', error: error });
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

  try {
    const body = await req.json();
    const { rateCardId, items = [], remarks = '', action } = body;

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
        vendor: true,
        items: true,
      },
    });

    if (!rateCard) {
      return apiError(UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardNotFoundOrAccessDenied, 404, { route: '/api/vendor-portal/rate-cards', method: 'POST' });
    }

    const now = new Date();
    const vendorUserName = rateCard.vendor.name || ctx.userName || 'Vendor User';

    // Parse existing notes
    let notesData: any = {};
    if (rateCard.notes) {
      try { notesData = JSON.parse(rateCard.notes); } catch {}
    }

    // ── CASE 1: VENDOR_ACCEPT (Accept Final Rate Card Version & Terms) ──
    if (action === 'VENDOR_ACCEPT') {
      if (rateCard.status !== 'CATEGORY_MANAGER_ACCEPTED') {
        return apiError(interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorAcceptanceRequiresPriorCategoryManagerAcceptanceCurrentStatusStatus, { "status": rateCard.status }), 400, { route: '/api/vendor-portal/rate-cards', method: 'POST' });
      }

      const { signature } = body;
      const isSigned = !!(signature && signature.verified);

      if (notesData.agreement) {
        if (isSigned) {
          notesData.agreement.status = 'SIGNED';
          notesData.agreement.signature = {
            signedBy: signature.signedBy,
            designation: signature.designation,
            signedAt: signature.signedAt || now.toISOString(),
            signatureType: signature.signatureType || 'DIGITAL_VERIFIED',
            signatureEvidenceId: signature.signatureEvidenceId || `DSC-${now.getFullYear()}-${rateCard.rateCardNumber}`,
            verified: true,
          };
        } else {
          notesData.agreement.status = 'VENDOR_ACCEPTED';
          notesData.agreement.signature = null;
        }
      }

      notesData.vendorAccepted = {
        actor: vendorUserName,
        timestamp: now.toISOString(),
        remarks: remarks || 'Vendor accepted final negotiated rate card agreement and commercial terms',
        hasSignature: isSigned,
      };

      // Canonical Sequence: Vendor Acceptance -> Level 1 Project Approver Approval
      const updated = await prisma.vendorRateCard.update({
        where: { id: rateCardId },
        data: {
          status: 'PENDING_PROJECT_APPROVAL',
          approvalLevel: 'LEVEL_1_PROJECT',
          notes: JSON.stringify(notesData),
        },
      });

      await prisma.rateCardApproval.create({
        data: {
          tenantId: ctx.tenantId,
          rateCardId,
          level: 'LEVEL_1_PROJECT',
          approverId: ctx.userId,
          approverName: vendorUserName,
          approverEmail: ctx.userEmail || null,
          action: 'VENDOR_ACCEPTED',
          remarks: isSigned
            ? `Vendor ${vendorUserName} accepted terms & executed digital signature (${signature.signatureEvidenceId})`
            : remarks || 'Vendor accepted final negotiated rate card agreement',
          timestamp: now,
        },
      });

      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          title: UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardAcceptedByVendorLevel1ProjectApprovalRequired,
          message: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorVendorUserNameAcceptedRateCardRateCardNumberLevel1ProjectApprovalIsNowRequired, { "vendorUserName": vendorUserName, "rateCardNumber": rateCard.rateCardNumber }),
          type: 'ACTION_REQUIRED',
          entityType: 'RATE_CARD',
          entityId: rateCardId,
          recordNumber: rateCard.rateCardNumber,
          targetRole: 'PROJECT_APPROVER',
          link: '/approvals/rate-cards',
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: vendorId,
        action: 'RATE_CARD_VENDOR_ACCEPTED',
        description: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorVendorUserNameAcceptedFinalRateCardRateCardNumberTermsRoutedToLevel1ProjectApprover, { "vendorUserName": vendorUserName, "rateCardNumber": rateCard.rateCardNumber }),
        newValue: { status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT', isSigned },
      });

      return apiSuccess({
        message: UI_STRINGS.appApiVendorPortalRateCardsRoute.rateCardFinalTermsAcceptedRequestForwardedToLevel1ProjectApproverQueue,
        rateCard: updated,
      });
    }

    // Determine round from action or current rate card status
    const isRound2 = action === 'SUBMIT_VENDOR_QUOTE_2' || rateCard.status === 'ROUND_2_BUYER_OFFER';
    const isRound1 = action === 'SUBMIT_VENDOR_QUOTE_1' || rateCard.status === 'ROUND_1_BUYER_OFFER' || !isRound2;

    const roundTarget = isRound2 ? 2 : 1;
    const newStatus = isRound2 ? 'ROUND_2_VENDOR_QUOTE' : 'ROUND_1_VENDOR_QUOTE';

    // Update proposedRate and comparisonRef on items
    for (const item of items) {
      if (!item.id) continue;
      const existingItem = rateCard.items.find((x) => x.id === item.id);
      if (!existingItem) continue;

      let compMeta: any = {};
      if (existingItem.comparisonRef) {
        try { compMeta = JSON.parse(existingItem.comparisonRef); } catch {}
      }

      const quoteVal = item.proposedRate !== undefined ? Number(item.proposedRate) : Number(item.rate);

      if (roundTarget === 1) {
        compMeta.vendorQuote1 = quoteVal;
      } else {
        compMeta.vendorQuote2 = quoteVal;
      }

      await prisma.vendorRateCardItem.update({
        where: { id: item.id },
        data: {
          proposedRate: quoteVal,
          comparisonRef: JSON.stringify(compMeta),
        },
      });
    }

    // Update rateCard notes and status
    if (roundTarget === 1) {
      notesData.round1 = {
        ...notesData.round1,
        vendorQuote1Date: now.toISOString(),
        vendorQuote1Actor: vendorUserName,
        vendorQuote1Remarks: remarks,
      };
    } else {
      notesData.round2 = {
        ...notesData.round2,
        vendorQuote2Date: now.toISOString(),
        vendorQuote2Actor: vendorUserName,
        vendorQuote2Remarks: remarks,
      };
    }

    const updatedCard = await prisma.vendorRateCard.update({
      where: { id: rateCardId },
      data: {
        status: newStatus,
        notes: JSON.stringify(notesData),
      },
    });

    // Record formal audit & clarification entry
    await prisma.rateCardApproval.create({
      data: {
        tenantId: ctx.tenantId,
        rateCardId,
        level: rateCard.approvalLevel || 'LEVEL_1_PROJECT',
        approverId: ctx.userId,
        approverName: vendorUserName,
        approverEmail: ctx.userEmail || null,
        action: `VENDOR_QUOTE_${roundTarget}_SUBMITTED`,
        remarks: remarks || `Vendor submitted Vendor RC Quote-${roundTarget} for commercial review`,
        timestamp: now,
      },
    });

    // Notify Category Manager
    await prisma.notification.create({
      data: {
        tenantId: ctx.tenantId,
        title: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorRCQuoteRoundTargetSubmitted, { "roundTarget": roundTarget }),
        message: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorVendorUserNameSubmittedVendorRCQuoteRoundTargetForRateCardRateCardNumber, { "vendorUserName": vendorUserName, "roundTarget": roundTarget, "rateCardNumber": rateCard.rateCardNumber }),
        type: 'ACTION_REQUIRED',
        entityType: 'RATE_CARD',
        entityId: rateCardId,
        recordNumber: rateCard.rateCardNumber,
        targetRole: 'CATEGORY_MANAGER',
        link: '/procurement/rate-cards',
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendorId,
      action: `RATE_CARD_VENDOR_QUOTE_${roundTarget}_SUBMITTED`,
      description: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorRCQuoteRoundTargetSubmittedForRateCardRateCardNumber, { "roundTarget": roundTarget, "rateCardNumber": rateCard.rateCardNumber }),
      newValue: { status: newStatus, round: roundTarget },
    });

    return apiSuccess({
      message: interpolateUiString(UI_STRINGS.appApiVendorPortalRateCardsRoute.vendorRCQuoteRoundTargetSuccessfullySubmittedForCommercialReview, { "roundTarget": roundTarget }),
      rateCardId,
      rateCard: updatedCard,
    });
  } catch (error: any) {
    console.error('Error submitting vendor rate card negotiation offer:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals }), 500, { route: '/api/vendor-portal/rate-cards', method: 'POST', error: error });
  }
}
