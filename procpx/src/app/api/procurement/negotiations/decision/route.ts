// src/app/api/procurement/negotiations/decision/route.ts
// Handles Buyer Decision on Vendor Offers / Final Offers (Accept, Reject, Final Acceptance Pending)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('NEGOTIATION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { roundId, decision, remarks } = body;

    if (!roundId || !decision) {
      return apiError('Round ID and Decision are required', 400);
    }

    if (!['ACCEPTED', 'REJECTED', 'FINAL_ACCEPTANCE_PENDING'].includes(decision)) {
      return apiError('Decision must be ACCEPTED, REJECTED, or FINAL_ACCEPTANCE_PENDING', 400);
    }

    const round = await prisma.negotiationRound.findFirst({
      where: { id: roundId, tenantId: ctx.tenantId },
      include: {
        vendor: true,
        negotiation: {
          include: {
            rfq: true,
          },
        },
      },
    });

    if (!round) {
      return apiError('Negotiation round not found or access denied', 404);
    }

    const rfq = round.negotiation.rfq;
    const vendor = round.vendor;
    const decisionDate = new Date();

    const updatedRound = await prisma.negotiationRound.update({
      where: { id: round.id },
      data: {
        buyerDecision: decision,
        buyerDecisionDate: decisionDate,
        buyerDecisionRemarks: remarks || null,
        status: decision === 'ACCEPTED' ? 'CONCLUDED' : decision === 'REJECTED' ? 'REJECTED' : round.status,
        nextResponsibleParty: decision === 'ACCEPTED' ? 'BUYER' : decision === 'REJECTED' ? 'CLOSED' : 'BUYER',
      },
    });

    // If accepted, update vendor quote status to ACCEPTED
    if (decision === 'ACCEPTED') {
      const quote = await prisma.quote.findFirst({
        where: { rfqId: rfq.id, vendorId: vendor.id, tenantId: ctx.tenantId },
        orderBy: { quoteVersion: 'desc' },
      });
      if (quote) {
        await prisma.quote.update({
          where: { id: quote.id },
          data: { status: 'ACCEPTED' },
        });
      }
    }

    // Add persistent RFQ message
    const msgText = decision === 'ACCEPTED'
      ? `[QUOTE ACCEPTED BY BUYER — PPO AWAITED] Buyer accepted final offer of ₹ ${(round.revisedQuoteAmount || round.previousQuoteAmount).toLocaleString()} submitted by ${vendor.name}. Formal Purchase Order (PPO) generation is awaited.`
      : decision === 'REJECTED'
      ? `[QUOTE NOT ACCEPTED / NEGOTIATION CLOSED] Buyer declined offer from ${vendor.name}. Remarks: ${remarks || 'Commercial parameters not aligned'}`
      : `[FINAL ACCEPTANCE PENDING] Buyer acknowledged final offer from ${vendor.name}; internal commercial committee approval in progress.`;

    await prisma.rfqMessage.create({
      data: {
        tenantId: ctx.tenantId,
        rfqId: rfq.id,
        senderId: ctx.userId,
        senderName: ctx.userName || 'Procurement Authority',
        senderRole: ctx.role,
        message: msgText,
        isVendorSent: false,
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
      action: `BUYER_DECISION_${decision}`,
      description: `Buyer decision '${decision}' recorded for ${vendor.name} on RFQ ${rfq.rfqNumber}. Remarks: ${remarks || 'None'}`,
      newValue: {
        decision,
        decisionDate,
        remarks,
      },
    });

    // Notify next party
    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: decision === 'ACCEPTED' ? 'COMMERCIAL_AWARD_APPROVED' : 'NEGOTIATION_CLOSED',
      recordNumber: rfq.rfqNumber,
      entityId: rfq.id,
      actorName: ctx.userName,
      details: {
        vendorName: vendor.name,
        decision,
        amount: round.revisedQuoteAmount || round.previousQuoteAmount,
      },
    });

    return apiSuccess({
      round: updatedRound,
      decision,
      statusLabel: decision === 'ACCEPTED'
        ? 'Quote Accepted by Buyer — PPO Awaited'
        : decision === 'REJECTED'
        ? 'Quote Not Accepted / Negotiation Closed'
        : 'Final Acceptance Pending from Buyer',
      message: `Buyer decision recorded successfully: ${decision}`,
    });
  } catch (error: any) {
    console.error('Error recording buyer decision:', error);
    return apiError(error.message || 'Failed to record buyer decision', 500);
  }
}
