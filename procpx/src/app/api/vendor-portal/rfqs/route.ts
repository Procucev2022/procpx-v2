// src/app/api/vendor-portal/rfqs/route.ts
// Vendor-specific RFQs listing API (strictly isolated to invited vendor's records)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

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
    const rfqs = await prisma.rfq.findMany({
      where: {
        tenantId: ctx.tenantId,
        invitedVendors: {
          some: { vendorId },
        },
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        project: { select: { id: true, name: true, projectCode: true } },
        boqRevision: {
          select: {
            id: true,
            revisionNumber: true,
            boq: { select: { id: true, title: true, boqCode: true } },
          },
        },
        lines: {
          select: {
            id: true,
            lineNumber: true,
            description: true,
            quantity: true,
            uom: true,
            specification: true,
            category: true,
            benchmarkRate: true,
          },
        },
        invitedVendors: {
          where: { vendorId },
          select: {
            id: true,
            vendorId: true,
            invitedAt: true,
            invitationStatus: true,
            submissionStatus: true,
          },
        },
        quotes: {
          where: { vendorId },
          orderBy: { quoteVersion: 'desc' },
          select: {
            id: true,
            vendorId: true,
            quoteNumber: true,
            quoteVersion: true,
            totalQuoteAmount: true,
            totalBaseAmount: true,
            taxAmount: true,
            status: true,
            submittedAt: true,
            updatedAt: true,
            validUntil: true,
            commercialTerms: true,
            lines: true,
          },
        },
        negotiations: {
          include: {
            rounds: {
              where: { vendorId },
              orderBy: { roundNumber: 'desc' },
            },
          },
        },
        ppos: {
          where: { vendorId },
          select: {
            id: true,
            ppoNumber: true,
            status: true,
            vendorStatus: true,
            totalValue: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        messages: {
          where: {
            OR: [{ vendorId }, { vendorId: null }],
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enrichedRfqs = rfqs.map((r) => {
      const invitation = r.invitedVendors[0] || null;
      const latestQuote = r.quotes[0] || null;
      const allRounds = (r.negotiations || []).flatMap((n) => n.rounds || []);
      const latestRound = allRounds.sort((a, b) => (b.roundNumber || 1) - (a.roundNumber || 1))[0] || null;
      const activeNegotiation = r.negotiations?.find((n) => n.rounds && n.rounds.length > 0) || r.negotiations?.[0] || null;
      const latestPpo = r.ppos[0] || null;
      const messages = (r as any).messages || [];

      // Persisted RFQ Received Date
      const rfqReceivedDate = invitation?.invitedAt || r.releasedAt || r.createdAt;

      // Buyer Decision Status
      let buyerDecisionStatus = 'Under Evaluation';
      if (latestPpo) {
        if (latestPpo.vendorStatus === 'ACCEPTED_BY_VENDOR' || latestPpo.status === 'CONFIRMED') {
          buyerDecisionStatus = 'PPO Accepted — Order Execution';
        } else if (latestPpo.vendorStatus === 'ISSUE_RAISED') {
          buyerDecisionStatus = 'PPO Issue Raised — Under Clarification';
        } else {
          buyerDecisionStatus = 'PPO Issued — Pending Acceptance';
        }
      } else if (latestRound?.buyerDecision === 'ACCEPTED') {
        buyerDecisionStatus = 'Quote Accepted by Buyer — PPO Awaited';
      } else if (latestRound?.buyerDecision === 'REJECTED') {
        buyerDecisionStatus = 'Quote Not Accepted / Negotiation Closed';
      } else if (latestRound?.isFinalOffer) {
        if (latestRound.buyerDecision === 'FINAL_ACCEPTANCE_PENDING') {
          buyerDecisionStatus = 'Final Acceptance Pending';
        } else {
          buyerDecisionStatus = 'Final Offer Submitted — Pending Decision';
        }
      } else if (latestRound && (latestRound.counterOfferAmount || latestRound.nextResponsibleParty === 'VENDOR') && !latestRound.revisedQuoteAmount) {
        buyerDecisionStatus = `Buyer Counter-Offer Received (Round ${latestRound.roundNumber})`;
      } else if (latestQuote) {
        buyerDecisionStatus = 'Quote Under Buyer Evaluation';
      } else {
        buyerDecisionStatus = 'Awaiting Initial Quotation';
      }

      // Quote Status
      const quoteStatus = latestQuote
        ? latestQuote.status
        : invitation?.submissionStatus === 'SUBMITTED'
        ? 'SUBMITTED'
        : 'PENDING_SUBMISSION';

      // Next Action & Responsible Party
      let nextAction = 'Submit quote before deadline';
      let nextResponsibleParty = 'VENDOR';

      if (latestPpo) {
        if (latestPpo.vendorStatus === 'ACCEPTED_BY_VENDOR' || latestPpo.status === 'CONFIRMED') {
          nextAction = 'Order Execution & Delivery Fulfilment';
          nextResponsibleParty = 'VENDOR';
        } else if (latestPpo.vendorStatus === 'ISSUE_RAISED') {
          nextAction = 'Awaiting Buyer Review of Raised Issue';
          nextResponsibleParty = 'BUYER';
        } else {
          nextAction = 'Review and Accept Issued Purchase Order (PPO)';
          nextResponsibleParty = 'VENDOR';
        }
      } else if (latestRound?.buyerDecision === 'ACCEPTED') {
        nextAction = 'PPO issuance awaited from Procurement Team';
        nextResponsibleParty = 'BUYER';
      } else if (latestRound?.buyerDecision === 'REJECTED') {
        nextAction = 'Negotiation Concluded / Sourcing Closed';
        nextResponsibleParty = 'CLOSED';
      } else if (latestRound?.isFinalOffer) {
        nextAction = 'Awaiting Buyer Commercial Acceptance / Award';
        nextResponsibleParty = 'BUYER';
      } else if (latestRound && latestRound.counterOfferAmount && !latestRound.revisedQuoteAmount) {
        nextAction = 'Buyer Counter-Offer received; Submit revised offer';
        nextResponsibleParty = 'VENDOR';
      } else if (latestQuote) {
        nextAction = 'Under technical & commercial evaluation';
        nextResponsibleParty = 'BUYER';
      }

      // Calculate last activity date from persisted events
      const dateCandidates: number[] = [
        new Date(r.createdAt).getTime(),
        new Date(r.updatedAt).getTime(),
      ];
      if (invitation?.invitedAt) dateCandidates.push(new Date(invitation.invitedAt).getTime());
      if (latestQuote?.submittedAt) dateCandidates.push(new Date(latestQuote.submittedAt).getTime());
      if (latestQuote?.updatedAt) dateCandidates.push(new Date(latestQuote.updatedAt).getTime());
      if (latestRound?.createdAt) dateCandidates.push(new Date(latestRound.createdAt).getTime());
      if (latestRound?.updatedAt) dateCandidates.push(new Date(latestRound.updatedAt).getTime());
      if (latestPpo?.createdAt) dateCandidates.push(new Date(latestPpo.createdAt).getTime());
      if (latestPpo?.updatedAt) dateCandidates.push(new Date(latestPpo.updatedAt).getTime());
      if (messages.length > 0) dateCandidates.push(new Date(messages[0].createdAt).getTime());

      const lastActivityDate = new Date(Math.max(...dateCandidates));

      // Available Actions
      const availableActions: string[] = ['VIEW_RFQ'];
      if (!latestQuote || quoteStatus === 'DRAFT') {
        availableActions.push('SUBMIT_QUOTE');
      } else {
        availableActions.push('REVISE_QUOTE');
      }
      availableActions.push('OPEN_NEGOTIATION');
      availableActions.push('CHAT_CLARIFY');
      if (latestRound?.buyerDecision || latestRound?.isFinalOffer) {
        availableActions.push('VIEW_DECISION');
      }
      if (latestPpo && latestPpo.vendorStatus !== 'ACCEPTED_BY_VENDOR') {
        availableActions.push('ACCEPT_PPO');
      }

      return {
        ...r,
        rfqReceivedDate,
        clientTenant: r.tenant?.name || 'Enterprise Client',
        projectPackage: `${r.project?.name || 'Project'} / ${r.packageName || 'Main Package'}`,
        rfqReference: r.rfqNumber,
        quoteStatus,
        buyerDecisionStatus,
        lastActivityDate,
        nextAction,
        nextResponsibleParty,
        availableActions,
        latestQuote,
        latestRound,
        latestPpo,
      };
    });

    return apiSuccess({ rfqs: enrichedRfqs, total: enrichedRfqs.length });
  } catch (error: any) {
    console.error('Error fetching vendor RFQs:', error);
    return apiError(error.message || 'Failed to fetch RFQs', 500);
  }
}
