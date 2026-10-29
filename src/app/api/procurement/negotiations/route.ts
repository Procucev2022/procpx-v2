// app/api/procurement/negotiations/route.ts
// Handles Negotiation Rounds and Counter-Offers across RFQs
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('NEGOTIATION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;

    const negotiations = await prisma.negotiation.findMany({
      where,
      include: {
        rfq: {
          include: {
            project: { select: { id: true, name: true, projectCode: true } },
            boqRevision: { select: { id: true, revisionCode: true } },
          },
        },
        rounds: {
          include: {
            vendor: true,
          },
          orderBy: { roundNumber: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return apiSuccess({ negotiations, total: negotiations.length });
  } catch (error: any) {
    console.error('Error fetching negotiations:', error);
    return apiError(error.message || 'Failed to fetch negotiations', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('NEGOTIATION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      rfqId,
      vendorId,
      vendorIds,
      bulkAllEligible,
      targetPrice,
      counterOfferAmount,
      revisedQuoteAmount,
      deadline,
      notes,
      lineItemsJson,
      nextResponsibleParty,
      allowSupersede = false,
    } = body;

    if (!rfqId) {
      return apiError('RFQ ID is required', 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: {
        lines: true,
        invitedVendors: {
          include: { vendor: true },
        },
        quotes: {
          orderBy: { quoteVersion: 'desc' },
        },
      },
    });

    if (!rfq) {
      return apiError('RFQ not found or access denied', 404);
    }

    const permittedStatuses = ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION'];
    if (!permittedStatuses.includes(rfq.status)) {
      return apiError(`RFQ is in '${rfq.status}' status and does not permit commercial negotiation offers`, 400);
    }

    if (counterOfferAmount !== undefined && counterOfferAmount !== null) {
      const numAmt = Number(counterOfferAmount);
      if (isNaN(numAmt) || numAmt <= 0) {
        return apiError('Counteroffer amount must be a positive number', 400);
      }
    }

    // Find or create negotiation container for this RFQ
    let negotiation = await prisma.negotiation.findFirst({
      where: { rfqId, tenantId: ctx.tenantId },
      include: {
        rounds: {
          include: { vendor: true },
          orderBy: { roundNumber: 'desc' },
        },
      },
    });

    if (negotiation && (negotiation.status === 'CONCLUDED' || negotiation.status === 'CANCELLED')) {
      return apiError(`Negotiation for RFQ ${rfq.rfqNumber} is already ${negotiation.status.toLowerCase()} and locked against further offers`, 400);
    }

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
            include: { vendor: true },
            orderBy: { roundNumber: 'desc' },
          },
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: rfq.projectId,
        entityType: 'NEGOTIATION',
        entityId: negotiation.id,
        action: 'NEGOTIATION_CREATED',
        description: `Started negotiation process for RFQ ${rfq.rfqNumber}`,
      });
    }

    const currentTenantId = ctx.tenantId;
    const currentUserId = ctx.userId;
    const currentUserName = ctx.userName || 'Category Manager';
    const currentUserRole = ctx.role;
    const currentRfq: any = rfq;
    const currentNegotiation: any = negotiation;

    // Internal helper to dispatch an offer to a single vendor
    async function dispatchToVendor(targetVendorId: string) {
      const vendor = await prisma.vendor.findFirst({
        where: { id: targetVendorId, tenantId: currentTenantId },
      });
      if (!vendor) {
        return { success: false, vendorId: targetVendorId, vendorName: 'Unknown', reason: 'Vendor not found' };
      }

      const isInvited = currentRfq.invitedVendors?.find((iv: any) => iv.vendorId === targetVendorId);
      if (!isInvited) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          reason: `Vendor ${vendor.name} is not invited to RFQ ${currentRfq.rfqNumber}`,
        };
      }

      const vendorQuotes = (currentRfq.quotes || []).filter((q: any) => q.vendorId === targetVendorId);
      const latestQuote = vendorQuotes.sort((a: any, b: any) => b.quoteVersion - a.quoteVersion)[0];
      if (!latestQuote) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          reason: `Vendor ${vendor.name} has not submitted an initial quotation (Quote 1) yet.`,
        };
      }

      const previousQuoteAmount = latestQuote.totalQuoteAmount;

      const vendorRounds = (currentNegotiation.rounds || []).filter((r: any) => r.vendorId === targetVendorId);
      const vendorActiveBuyerOffers = vendorRounds.filter(
        (r: any) => r.status !== 'SUPERSEDED' && (r.counterOfferAmount !== null || (!r.revisedQuoteAmount && r.nextResponsibleParty === 'VENDOR'))
      );

      // Rule: Category Managers may submit a maximum of 4 active buyer counteroffers per vendor per RFQ
      if (vendorActiveBuyerOffers.length >= 4) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          reason: `Maximum limit of 4 buyer counteroffers already reached for ${vendor.name}.`,
        };
      }

      // Check for pending round awaiting vendor response
      const activePendingRound = vendorRounds.find(
        (r: any) => r.status !== 'SUPERSEDED' && r.counterOfferAmount && (!r.revisedQuoteAmount || r.nextResponsibleParty === 'VENDOR')
      );

      if (activePendingRound && !revisedQuoteAmount && !allowSupersede) {
        return {
          success: false,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          requiresSupersedeConfirm: true,
          pendingRoundNumber: activePendingRound.roundNumber,
          pendingAmount: activePendingRound.counterOfferAmount,
          reason: `Round ${activePendingRound.roundNumber} counteroffer is currently pending vendor response. Confirm superseding offer to replace it.`,
        };
      }

      // Calculate sequential round number for this vendor (1 through 4)
      const roundNumber = vendorActiveBuyerOffers.length + 1;
      const finalRevised = revisedQuoteAmount ? Number(revisedQuoteAmount) : null;
      const targetCounter = counterOfferAmount ? Number(counterOfferAmount) : null;
      const savingsAmount = finalRevised
        ? previousQuoteAmount - finalRevised
        : targetCounter
        ? previousQuoteAmount - targetCounter
        : 0;
      const savingsPercent = previousQuoteAmount > 0 ? (savingsAmount / previousQuoteAmount) * 100 : 0;

      // Prevent duplicate offers from repeated clicks or rapid retries within 4s window
      const recentDuplicate = (currentNegotiation.rounds || []).find(
        (r: any) =>
          r.vendorId === targetVendorId &&
          r.status !== 'SUPERSEDED' &&
          ((targetCounter && r.counterOfferAmount === targetCounter) ||
            (finalRevised && r.revisedQuoteAmount === finalRevised)) &&
          new Date().getTime() - new Date(r.createdAt).getTime() < 4000
      );
      if (recentDuplicate) {
        return {
          success: true,
          isDuplicate: true,
          round: recentDuplicate,
          vendorId: targetVendorId,
          vendorName: vendor.name,
          roundNumber: recentDuplicate.roundNumber,
          counterOfferAmount: recentDuplicate.counterOfferAmount,
        };
      }

      const { round } = await prisma.$transaction(async (tx) => {
        // If an earlier round was pending and superseding was approved, mark earlier round as SUPERSEDED
        if (activePendingRound && allowSupersede) {
          await tx.negotiationRound.update({
            where: { id: activePendingRound.id },
            data: {
              status: 'SUPERSEDED',
              notes: `${activePendingRound.notes ? activePendingRound.notes + ' ' : ''}[Superseded by Buyer Offer Round ${roundNumber}]`,
            },
          });
        }

        const createdRound = await tx.negotiationRound.create({
          data: {
            tenantId: currentTenantId,
            negotiationId: currentNegotiation.id,
            vendorId: targetVendorId,
            roundNumber,
            deadline: deadline ? new Date(deadline) : null,
            targetPrice: targetPrice ? Number(targetPrice) : null,
            previousQuoteAmount,
            counterOfferAmount: targetCounter,
            revisedQuoteAmount: finalRevised,
            savingsAmount,
            savingsPercent: Math.round(savingsPercent * 100) / 100,
            status: finalRevised ? 'REVISED_SUBMITTED' : 'ROUND_ACTIVE',
            notes: notes || (activePendingRound && allowSupersede ? `Superseding counteroffer (Round ${roundNumber}) replacing previous pending offer.` : null),
            lineItemsJson: lineItemsJson ? (typeof lineItemsJson === 'string' ? lineItemsJson : JSON.stringify(lineItemsJson)) : null,
            nextResponsibleParty: nextResponsibleParty || (finalRevised ? 'BUYER' : 'VENDOR'),
          },
          include: {
            vendor: true,
          },
        });

        // Update parent negotiation record
        await tx.negotiation.update({
          where: { id: currentNegotiation.id },
          data: {
            currentRound: Math.max(currentNegotiation.currentRound, roundNumber),
            bestQuoteAmount: finalRevised || previousQuoteAmount,
          },
        });

        // Update RFQ status to NEGOTIATION
        if (currentRfq.status !== 'NEGOTIATION') {
          await tx.rfq.update({
            where: { id: rfqId },
            data: { status: 'NEGOTIATION' },
          });
        }

        return { round: createdRound };
      });

      // Audit log
      await createAuditLog({
        tenantId: currentTenantId,
        userId: currentUserId,
        projectId: currentRfq.projectId,
        entityType: 'NEGOTIATION',
        entityId: round.id,
        action: activePendingRound && allowSupersede ? 'SUPERSEDING_COUNTEROFFER_ISSUED' : 'NEGOTIATION_ROUND_CREATED',
        description: activePendingRound && allowSupersede
          ? `Superseding Round ${roundNumber} counteroffer issued to ${vendor.name} for RFQ ${currentRfq.rfqNumber}. Previous Round ${activePendingRound.roundNumber} marked SUPERSEDED.`
          : `Round ${roundNumber} initiated with ${vendor.name} for RFQ ${currentRfq.rfqNumber}. Previous: ₹ ${previousQuoteAmount.toLocaleString()}, Target/Counter: ₹ ${(targetCounter || targetPrice || 0).toLocaleString()}`,
        newValue: {
          roundNumber,
          vendorId: targetVendorId,
          previousQuoteAmount,
          counterOfferAmount: targetCounter,
          revisedQuoteAmount: finalRevised,
          supersededRoundId: activePendingRound && allowSupersede ? activePendingRound.id : null,
        },
      });

      // Create persistent RFQ message for negotiation audit timeline
      await prisma.rfqMessage.create({
        data: {
          tenantId: currentTenantId,
          rfqId,
          senderId: currentUserId,
          senderName: currentUserName,
          senderRole: currentUserRole,
          message: finalRevised
            ? `[REVISED QUOTE RECORDED] Recorded vendor revised quote of ₹ ${finalRevised.toLocaleString()} (Round ${roundNumber}) for ${vendor.name}.`
            : activePendingRound && allowSupersede
            ? `[SUPERSEDING COUNTEROFFER] Buyer issued superseding counteroffer of ₹ ${(targetCounter || targetPrice || 0).toLocaleString()} (Round ${roundNumber}) to ${vendor.name}, replacing pending Round ${activePendingRound.roundNumber}.`
            : `[BUYER COUNTEROFFER] Buyer submitted counteroffer of ₹ ${(targetCounter || targetPrice || 0).toLocaleString()} (Round ${roundNumber}) to ${vendor.name}. ${notes || ''}`,
          isVendorSent: Boolean(finalRevised),
          vendorId: vendor.id,
        },
      });

      // Notify next responsible party
      if (finalRevised) {
        await notifyNextResponsibleParty({
          tenantId: currentTenantId,
          event: 'REVISED_QUOTE_RECEIVED',
          recordNumber: currentRfq.rfqNumber,
          entityId: currentRfq.id,
          details: {
            vendorName: vendor.name,
            amount: finalRevised,
            roundNumber,
          },
        });
      } else {
        await notifyNextResponsibleParty({
          tenantId: currentTenantId,
          event: 'COUNTER_OFFER_SENT',
          recordNumber: currentRfq.rfqNumber,
          entityId: currentRfq.id,
          details: {
            vendorName: vendor.name,
            amount: targetCounter ? Number(targetCounter) : undefined,
            roundNumber,
          },
        });
      }

      return {
        success: true,
        round,
        vendorId: targetVendorId,
        vendorName: vendor.name,
        roundNumber,
        counterOfferAmount: targetCounter,
        isSuperseding: Boolean(activePendingRound && allowSupersede),
      };
    }

    // CHECK IF BULK DISPATCH REQUESTED
    const isBulkRequest = Boolean(
      (Array.isArray(vendorIds) && vendorIds.length > 0) || bulkAllEligible
    );

    if (isBulkRequest) {
      let targetList: string[] = [];
      if (Array.isArray(vendorIds) && vendorIds.length > 0) {
        targetList = vendorIds;
      } else {
        targetList = rfq.invitedVendors.map((iv) => iv.vendorId);
      }

      const dispatched: any[] = [];
      const failed: any[] = [];

      for (const tVendorId of targetList) {
        const result = await dispatchToVendor(tVendorId);
        if (result.success) {
          dispatched.push({
            vendorId: result.vendorId,
            vendorName: result.vendorName,
            status: 'DISPATCHED',
            roundNumber: result.roundNumber,
            counterOfferAmount: result.counterOfferAmount,
            isDuplicate: result.isDuplicate || false,
            isSuperseding: result.isSuperseding || false,
          });
        } else {
          failed.push({
            vendorId: result.vendorId,
            vendorName: result.vendorName,
            status: 'FAILED',
            reason: result.reason,
            requiresSupersedeConfirm: result.requiresSupersedeConfirm || false,
          });
        }
      }

      return apiSuccess(
        {
          message: `Bulk offer processed: ${dispatched.length} dispatched, ${failed.length} failed`,
          summary: {
            totalSelected: targetList.length,
            dispatchedCount: dispatched.length,
            failedCount: failed.length,
          },
          dispatched,
          failed,
          results: [...dispatched, ...failed],
        },
        dispatched.length > 0 ? 201 : 400
      );
    }

    // SINGLE VENDOR DISPATCH
    if (!vendorId) {
      return apiError('Vendor ID is required for single counteroffer dispatch', 400);
    }

    const singleResult = await dispatchToVendor(vendorId);
    if (!singleResult.success) {
      const { NextResponse } = await import('next/server');
      return NextResponse.json(
        {
          error: singleResult.reason || 'Failed to dispatch counteroffer',
          requiresSupersedeConfirm: singleResult.requiresSupersedeConfirm,
          pendingRoundNumber: singleResult.pendingRoundNumber,
          pendingAmount: singleResult.pendingAmount,
        },
        { status: 400 }
      );
    }

    return apiSuccess(
      {
        round: singleResult.round,
        message: revisedQuoteAmount
          ? `Vendor Revised Quote recorded for Round ${singleResult.roundNumber}`
          : singleResult.isSuperseding
          ? `Superseding Buyer Offer Dispatched (Round ${singleResult.roundNumber})`
          : `Buyer Offer Submitted Successfully (Round ${singleResult.roundNumber})`,
        roundNumber: singleResult.roundNumber,
      },
      201
    );
  } catch (error: any) {
    console.error('Error logging negotiation round:', error);
    return apiError(error.message || 'Failed to create negotiation round', 500);
  }
}
