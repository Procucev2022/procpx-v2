// src/app/api/procurement/rate-cards/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
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
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError('Rate Card not found', 404);
    }

    const enrichedItems = rateCard.items.map((it) => {
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
        finalAgreedRate: meta.finalAgreedRate !== undefined ? meta.finalAgreedRate : (rateCard.status === 'APPROVED' || rateCard.status === 'FINAL_VENDOR_OFFER_ACCEPTED' ? it.rate : null),
        previousPpoRate: meta.previousPpoRate !== undefined ? meta.previousPpoRate : it.historicalRate,
        referenceQty: meta.referenceQty !== undefined ? meta.referenceQty : (it.minQuantity || 1),
        remarks: meta.remarks || '',
        variance: it.benchmarkRate ? Math.round(((it.rate - it.benchmarkRate) / it.benchmarkRate) * 100) : 0,
      };
    });

    return apiSuccess({ rateCard: { ...rateCard, items: enrichedItems } });
  } catch (error: any) {
    console.error('Error fetching rate card details:', error);
    return apiError(error.message || 'Failed to fetch rate card', 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
      include: { items: true, vendor: true },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError('Rate Card not found', 404);
    }

    const body = await req.json();
    const now = new Date();
    const actorName = ctx.userName || ctx.userEmail || 'Category Manager';

    // Parse existing notes
    let notesData: any = {};
    if (rateCard.notes) {
      try {
        notesData = JSON.parse(rateCard.notes);
      } catch {}
    }

    // ── ACTION 1: SUBMIT_BUYER_OFFER_2 ──────────────────────────
    if (body.action === 'SUBMIT_BUYER_OFFER_2') {
      const { items = [], remarks = '' } = body;

      // Update comparisonRef on each line item
      for (const it of items) {
        if (!it.id) continue;
        const existingItem = rateCard.items.find((x) => x.id === it.id);
        if (!existingItem) continue;

        let compMeta: any = {};
        if (existingItem.comparisonRef) {
          try { compMeta = JSON.parse(existingItem.comparisonRef); } catch {}
        }
        compMeta.buyerOffer2 = Number(it.buyerOffer2);
        if (it.remarks) compMeta.remarks = it.remarks;

        await prisma.vendorRateCardItem.update({
          where: { id: it.id },
          data: {
            comparisonRef: JSON.stringify(compMeta),
          },
        });
      }

      notesData.currentRound = 2;
      notesData.round2 = {
        ...notesData.round2,
        buyerOffer2Date: now.toISOString(),
        buyerOffer2Actor: actorName,
        buyerOffer2Remarks: remarks,
      };

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'ROUND_2_BUYER_OFFER',
          notes: JSON.stringify(notesData),
        },
        include: { vendor: true, items: true, approvals: true },
      });

      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          title: 'Buyer RC Offer-2 Submitted',
          message: `Buyer submitted Buyer RC Offer-2 for Rate Card ${rateCard.rateCardNumber}. Please submit your response in Vendor Portal.`,
          type: 'ACTION_REQUIRED',
          entityType: 'RATE_CARD',
          entityId: id,
          recordNumber: rateCard.rateCardNumber,
          targetRole: 'VENDOR',
          link: '/vendor-portal/rate-cards',
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: rateCard.vendorId,
        action: 'RATE_CARD_BUYER_OFFER_2_SUBMITTED',
        description: `Buyer RC Offer-2 submitted for Rate Card ${rateCard.rateCardNumber} by ${actorName}`,
        newValue: { status: 'ROUND_2_BUYER_OFFER', remarks },
      });

      return apiSuccess({ rateCard: updated, message: 'Buyer RC Offer-2 successfully submitted to vendor!' });
    }

    // ── ACTION 2: ACCEPT_FINAL_VENDOR_OFFER ────────────────────
    if (body.action === 'ACCEPT_FINAL_VENDOR_OFFER') {
      const { remarks = '', roundNumber = 2, totalAgreedValue = 0 } = body;

      // Freeze line items with final agreed vendor rates
      for (const item of rateCard.items) {
        let compMeta: any = {};
        if (item.comparisonRef) {
          try { compMeta = JSON.parse(item.comparisonRef); } catch {}
        }

        // Determine final vendor rate from latest quote
        const finalRate = compMeta.vendorQuote2 !== null && compMeta.vendorQuote2 !== undefined
          ? Number(compMeta.vendorQuote2)
          : compMeta.vendorQuote1 !== null && compMeta.vendorQuote1 !== undefined
          ? Number(compMeta.vendorQuote1)
          : (item.proposedRate || item.rate);

        compMeta.finalAgreedRate = finalRate;

        await prisma.vendorRateCardItem.update({
          where: { id: item.id },
          data: {
            rate: finalRate,
            comparisonRef: JSON.stringify(compMeta),
          },
        });
      }

      notesData.acceptedFinalOffer = {
        roundNumber,
        acceptedBy: actorName,
        acceptedAt: now.toISOString(),
        totalAgreedValue,
        remarks,
        terms: rateCard.terms,
      };

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'FINAL_VENDOR_OFFER_ACCEPTED',
          notes: JSON.stringify(notesData),
        },
        include: { vendor: true, items: true, approvals: true },
      });

      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          title: 'Final Vendor Offer Accepted — Category Manager Review Required',
          message: `Buyer accepted the final vendor offer for Rate Card ${rateCard.rateCardNumber}. Category Manager Acceptance is now pending.`,
          type: 'ACTION_REQUIRED',
          entityType: 'RATE_CARD',
          entityId: id,
          recordNumber: rateCard.rateCardNumber,
          targetRole: 'CATEGORY_MANAGER',
          link: '/procurement/rate-cards',
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: rateCard.vendorId,
        action: 'RATE_CARD_FINAL_VENDOR_OFFER_ACCEPTED',
        description: `Final vendor offer accepted for Rate Card ${rateCard.rateCardNumber} by ${actorName}. Commercial snapshot frozen.`,
        newValue: { status: 'FINAL_VENDOR_OFFER_ACCEPTED', totalAgreedValue },
      });

      return apiSuccess({
        rateCard: updated,
        message: 'Final Vendor Offer accepted successfully! Category Manager Acceptance is now pending.',
      });
    }

    // ── ACTION 3: CATEGORY_MANAGER_ACCEPT ──────────────────────
    if (body.action === 'CATEGORY_MANAGER_ACCEPT') {
      if (rateCard.status !== 'FINAL_VENDOR_OFFER_ACCEPTED') {
        return apiError(`Cannot perform Category Manager Acceptance from status: ${rateCard.status}`, 400);
      }

      notesData.categoryManagerAccepted = {
        actor: actorName,
        timestamp: now.toISOString(),
        remarks: body.remarks || '',
      };

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'CATEGORY_MANAGER_ACCEPTED',
          notes: JSON.stringify(notesData),
        },
        include: { vendor: true, items: true, approvals: true },
      });

      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          title: 'Rate Card Accepted by Category Manager — Vendor Final Acceptance Required',
          message: `Category Manager accepted Rate Card ${rateCard.rateCardNumber}. Please accept the final contract terms in Vendor Portal.`,
          type: 'ACTION_REQUIRED',
          entityType: 'RATE_CARD',
          entityId: id,
          recordNumber: rateCard.rateCardNumber,
          targetRole: 'VENDOR',
          link: '/vendor-portal/rate-cards',
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: rateCard.vendorId,
        action: 'RATE_CARD_CATEGORY_MANAGER_ACCEPTED',
        description: `Category Manager accepted Rate Card ${rateCard.rateCardNumber}`,
        newValue: { status: 'CATEGORY_MANAGER_ACCEPTED' },
      });

      return apiSuccess({
        rateCard: updated,
        message: 'Rate Card accepted by Category Manager. Vendor final acceptance is now required.',
      });
    }

    // ── ACTION 4: CATEGORY_MANAGER_SIGNOFF ─────────────────────
    if (body.action === 'CATEGORY_MANAGER_SIGNOFF') {
      if (rateCard.status !== 'VENDOR_ACCEPTED') {
        return apiError(`Category Manager Sign Off requires prior Vendor Acceptance (Current status: ${rateCard.status})`, 400);
      }

      notesData.categoryManagerSignedOff = {
        actor: actorName,
        timestamp: now.toISOString(),
        remarks: body.remarks || '',
      };

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'PENDING_PROJECT_APPROVAL',
          approvalLevel: 'LEVEL_1_PROJECT',
          submittedBy: actorName,
          submittedAt: now,
          notes: JSON.stringify(notesData),
        },
        include: { vendor: true, items: true, approvals: true },
      });

      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          title: 'Rate Card Signed Off — Level 1 Project Approval Pending',
          message: `Rate Card ${rateCard.rateCardNumber} signed off by Category Manager. Level 1 Project Approval required.`,
          type: 'ACTION_REQUIRED',
          entityType: 'RATE_CARD',
          entityId: id,
          recordNumber: rateCard.rateCardNumber,
          targetRole: 'PROJECT_APPROVER',
          link: '/approvals/rate-cards',
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: rateCard.vendorId,
        action: 'RATE_CARD_CM_SIGNED_OFF',
        description: `Category Manager signed off Rate Card ${rateCard.rateCardNumber}. Forwarded to Level 1 Project Approver.`,
        newValue: { status: 'PENDING_PROJECT_APPROVAL', approvalLevel: 'LEVEL_1_PROJECT' },
      });

      return apiSuccess({
        rateCard: updated,
        message: 'Category Manager Sign Off complete. Rate Card forwarded to Project Approver queue (Level 1).',
      });
    }

    // ── FALLBACK STANDARD UPDATE ───────────────────────────────
    // Editable if DRAFT, RETURNED_FOR_CORRECTION, or NEGOTIATION
    const editableStatuses = ['DRAFT', 'RETURNED_FOR_CORRECTION', 'NEGOTIATION', 'UNDER_REVIEW', 'ROUND_1_BUYER_OFFER'];
    if (!editableStatuses.includes(rateCard.status)) {
      return apiError(`Rate Card cannot be edited in status: ${rateCard.status}`, 400);
    }

    const {
      title,
      category,
      subcategory,
      scope,
      location,
      version,
      validFrom,
      validTo,
      terms,
      notes,
      justification,
      comparisonNotes,
      items,
      status,
    } = body;

    // If items are provided, delete old ones and recreate
    if (Array.isArray(items)) {
      await prisma.vendorRateCardItem.deleteMany({
        where: { rateCardId: id },
      });
    }

    const updated = await prisma.vendorRateCard.update({
      where: { id },
      data: {
        title: title || rateCard.title,
        category: category || rateCard.category,
        subcategory: subcategory !== undefined ? subcategory : rateCard.subcategory,
        scope: scope !== undefined ? scope : rateCard.scope,
        location: location !== undefined ? location : rateCard.location,
        version: version ? (typeof version === 'number' ? version : parseInt(String(version).replace(/\D/g, '') || '1', 10)) : rateCard.version,
        validFrom: validFrom ? new Date(validFrom) : rateCard.validFrom,
        validTo: validTo ? new Date(validTo) : rateCard.validTo,
        terms: terms !== undefined ? terms : rateCard.terms,
        notes: notes !== undefined ? notes : rateCard.notes,
        justification: justification !== undefined ? justification : rateCard.justification,
        comparisonNotes: comparisonNotes !== undefined ? comparisonNotes : rateCard.comparisonNotes,
        status: status || rateCard.status,
        ...(Array.isArray(items) ? {
          items: {
            create: items.map((it: any) => ({
              tenantId: ctx.tenantId,
              itemCode: it.itemCode || null,
              standardBoqItemId: it.standardBoqItemId || null,
              description: it.description,
              specification: it.specification || null,
              category: it.category || category || rateCard.category,
              subcategory: it.subcategory || subcategory || rateCard.subcategory,
              uom: it.uom || 'Nos',
              rate: Number(it.rate) || 0,
              proposedRate: it.proposedRate !== undefined ? Number(it.proposedRate) : Number(it.rate) || 0,
              historicalRate: it.historicalRate !== undefined ? Number(it.historicalRate) : null,
              benchmarkRate: it.benchmarkRate !== undefined ? Number(it.benchmarkRate) : null,
              comparisonRef: it.comparisonRef || null,
              minQuantity: it.minQuantity ? Number(it.minQuantity) : 1,
              maxQuantity: it.maxQuantity ? Number(it.maxQuantity) : null,
              location: it.location || location || rateCard.location,
              isActive: true,
            })),
          },
        } : {}),
      },
      include: {
        vendor: true,
        items: true,
        approvals: true,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: rateCard.vendorId,
      action: 'RATE_CARD_UPDATED',
      description: `Rate card ${rateCard.rateCardNumber} updated`,
      newValue: { title: updated.title, status: updated.status, version: updated.version },
    });

    return apiSuccess({ rateCard: updated });
  } catch (error: any) {
    console.error('Error updating rate card:', error);
    return apiError(error.message || 'Failed to update rate card', 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError('Rate Card not found', 404);
    }

    if (rateCard.status !== 'DRAFT') {
      return apiError('Only Draft Rate Cards can be deleted', 400);
    }

    await prisma.vendorRateCardItem.deleteMany({
      where: { rateCardId: id },
    });
    await prisma.rateCardApproval.deleteMany({
      where: { rateCardId: id },
    });
    await prisma.vendorRateCard.delete({
      where: { id },
    });

    return apiSuccess({ message: 'Rate Card deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting rate card:', error);
    return apiError(error.message || 'Failed to delete rate card', 500);
  }
}
