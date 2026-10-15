// src/app/api/vendor-portal/rate-cards/route.ts
// Vendor Rate Cards listing API (strictly isolated to logged-in vendor)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError('Forbidden: Vendor Portal is accessible only to mapped vendor accounts', 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError('Vendor record not associated with this user account', 404);
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

      return {
        ...rc,
        items: enrichedItems,
        itemCount: rc.items.length,
      };
    });

    return apiSuccess({ rateCards: formatted, total: formatted.length });
  } catch (error: any) {
    console.error('Error fetching vendor rate cards:', error);
    return apiError(error.message || 'Failed to fetch rate cards', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError('Forbidden: Vendor Portal is accessible only to mapped vendor accounts', 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError('Vendor record not associated with this user account', 404);
  }

  try {
    const body = await req.json();
    const { rateCardId, items = [], remarks = '', action } = body;

    if (!rateCardId) {
      return apiError('Rate Card ID is required', 400);
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
      return apiError('Rate card not found or access denied', 404);
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
        return apiError(`Vendor Acceptance requires prior Category Manager Acceptance (Current status: ${rateCard.status})`, 400);
      }

      notesData.vendorAccepted = {
        actor: vendorUserName,
        timestamp: now.toISOString(),
        remarks: remarks || 'Vendor accepted final negotiated rate card agreement and commercial terms',
      };

      const updated = await prisma.vendorRateCard.update({
        where: { id: rateCardId },
        data: {
          status: 'VENDOR_ACCEPTED',
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
          remarks: remarks || 'Vendor accepted final negotiated rate card agreement',
          timestamp: now,
        },
      });

      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          title: 'Vendor Accepted Final Rate Card Agreement',
          message: `Vendor ${vendorUserName} accepted Rate Card ${rateCard.rateCardNumber}. Category Manager Sign Off is now pending.`,
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
        action: 'RATE_CARD_VENDOR_ACCEPTED',
        description: `Vendor ${vendorUserName} accepted final Rate Card ${rateCard.rateCardNumber} terms`,
        newValue: { status: 'VENDOR_ACCEPTED' },
      });

      return apiSuccess({
        message: 'Rate Card final terms accepted! Category Manager Sign Off is now pending.',
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
        title: `Vendor RC Quote-${roundTarget} Submitted`,
        message: `Vendor ${vendorUserName} submitted Vendor RC Quote-${roundTarget} for Rate Card ${rateCard.rateCardNumber}.`,
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
      description: `Vendor RC Quote-${roundTarget} submitted for Rate Card ${rateCard.rateCardNumber}`,
      newValue: { status: newStatus, round: roundTarget },
    });

    return apiSuccess({
      message: `Vendor RC Quote-${roundTarget} successfully submitted for commercial review!`,
      rateCardId,
      rateCard: updatedCard,
    });
  } catch (error: any) {
    console.error('Error submitting vendor rate card negotiation offer:', error);
    return apiError(error.message || 'Failed to submit rate card proposals', 500);
  }
}
