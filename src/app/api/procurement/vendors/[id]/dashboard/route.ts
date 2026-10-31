// src/app/api/procurement/vendors/[id]/dashboard/route.ts
// Comprehensive Vendor Dashboard API: KPIs, RFQ Register, Negotiation Status, PPO Acceptance & Rate Cards
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id: vendorId } = await params;

  // Authorization & strict cross-vendor isolation
  if (ctx.role === 'VENDOR') {
    if (!ctx.vendorId || ctx.vendorId !== vendorId) {
      return apiError(UI_STRINGS.appApiProcurementVendorsIdDashboardRoute.forbiddenYouCanOnlyAccessYourOwnVendorDashboard, 403);
    }
  } else {
    if (!hasPermission(ctx.role, 'VENDOR_VIEW')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }
  }

  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied, 404);
    }

    // 1. Fetch all RFQs where vendor is invited
    const rfqs = await prisma.rfq.findMany({
      where: {
        tenantId: ctx.tenantId,
        invitedVendors: {
          some: { vendorId: vendor.id },
        },
      },
      include: {
        tenant: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, projectCode: true } },
        boqRevision: {
          include: {
            boq: { select: { id: true, title: true, boqCode: true } },
          },
        },
        lines: true,
        invitedVendors: {
          where: { vendorId: vendor.id },
        },
        quotes: {
          where: { vendorId: vendor.id },
          orderBy: { quoteVersion: 'desc' },
          include: { lines: true },
        },
        negotiations: {
          include: {
            rounds: {
              where: { vendorId: vendor.id },
              orderBy: { roundNumber: 'desc' },
            },
          },
        },
        ppos: {
          where: { vendorId: vendor.id },
          include: { lines: true },
          orderBy: { createdAt: 'desc' },
        },
        messages: {
          where: {
            OR: [{ vendorId: vendor.id }, { vendorId: null }],
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Fetch all PPOs issued to this vendor
    const ppos = await prisma.ppo.findMany({
      where: { vendorId: vendor.id, tenantId: ctx.tenantId },
      include: {
        project: { select: { id: true, name: true, projectCode: true, location: true } },
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            packageName: true,
            negotiations: {
              include: {
                rounds: {
                  where: { vendorId: vendor.id },
                  orderBy: { roundNumber: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
        lines: true,
        awardRecommendation: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Fetch Rate Cards for this vendor
    const rateCards = await prisma.vendorRateCard.findMany({
      where: { vendorId: vendor.id, tenantId: ctx.tenantId },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 4. Transform RFQ register with consistent persisted dates and statuses
    const rfqRegister = rfqs.map((r) => {
      const invitation = r.invitedVendors[0] || null;
      const latestQuote = r.quotes[0] || null;
      const allRounds = (r.negotiations || []).flatMap((n) => n.rounds || []);
      const latestRound = allRounds.sort((a, b) => (b.roundNumber || 1) - (a.roundNumber || 1))[0] || null;
      const activeNegotiation = r.negotiations?.find((n) => n.rounds && n.rounds.length > 0) || r.negotiations?.[0] || null;
      const latestPpo = r.ppos[0] || null;
      const messages = r.messages || [];

      // Determine Buyer Decision Status
      const hasActiveBuyerCounter = Boolean(
        latestRound &&
        (latestRound.counterOfferAmount || latestRound.nextResponsibleParty === 'VENDOR') &&
        (!latestRound.revisedQuoteAmount || latestRound.status === 'ROUND_ACTIVE')
      );

      const isVendorRevisionSubmitted = Boolean(
        latestRound &&
        latestRound.revisedQuoteAmount !== null &&
        latestRound.revisedQuoteAmount > 0 &&
        (latestRound.status === 'REVISED_SUBMITTED' || latestRound.status === 'FINAL_OFFER_SUBMITTED') &&
        (latestRound.nextResponsibleParty === 'BUYER' || latestRound.buyerDecision !== null)
      );

      let buyerDecisionStatus = '';
      if (latestPpo) {
        if (latestPpo.vendorStatus === 'ACCEPTED_BY_VENDOR' || latestPpo.status === 'CONFIRMED') {
          buyerDecisionStatus = 'PPO Accepted — Order Execution';
        } else if (latestPpo.vendorStatus === 'ISSUE_RAISED') {
          buyerDecisionStatus = 'PPO Issue Raised — Under Clarification';
        } else {
          buyerDecisionStatus = 'PPO Pending Vendor Acceptance';
        }
      } else if (latestRound?.buyerDecision === 'ACCEPTED') {
        buyerDecisionStatus = 'Quote Accepted by Buyer — PPO Awaited';
      } else if (latestRound?.buyerDecision === 'REJECTED') {
        buyerDecisionStatus = 'Quote Not Accepted / Negotiation Closed';
      } else if (latestRound?.isFinalOffer && isVendorRevisionSubmitted) {
        if (latestRound.buyerDecision === 'FINAL_ACCEPTANCE_PENDING') {
          buyerDecisionStatus = 'Final Acceptance Pending from Buyer';
        } else {
          buyerDecisionStatus = 'Final Offer Submitted — Pending Buyer Decision';
        }
      } else if (hasActiveBuyerCounter) {
        buyerDecisionStatus = `Buyer Counter-Offer Received (Round ${latestRound.roundNumber})`;
      } else if (isVendorRevisionSubmitted) {
        buyerDecisionStatus = `Revised Quote Submitted (Round ${latestRound.roundNumber})`;
      } else if (latestQuote) {
        buyerDecisionStatus = 'Quote Under Buyer Evaluation';
      } else {
        buyerDecisionStatus = 'Awaiting Initial Quotation';
      }

      // Determine quotation & negotiation status
      // A revised quote or quote is only submitted if a genuine Quote / revision record exists
      let quotationStatus = 'PENDING_SUBMISSION';
      if (latestQuote) {
        if (hasActiveBuyerCounter) {
          quotationStatus = 'AWAITING_REVISED_QUOTE';
        } else {
          quotationStatus = latestQuote.status;
        }
      }

      const negotiationStatus = latestRound
        ? (hasActiveBuyerCounter ? 'BUYER_COUNTER_ACTIVE' : latestRound.status)
        : activeNegotiation
        ? activeNegotiation.status
        : 'NOT_INITIATED';

      // Next action & responsible party
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

      // Persisted dates
      const rfqReceivedDate = invitation?.invitedAt || r.releasedAt || r.createdAt;
      const submissionDeadline = r.submissionDeadline;

      // Calculate last activity date
      const dateCandidates: number[] = [
        new Date(r.createdAt).getTime(),
        new Date(r.updatedAt).getTime(),
      ];
      if (invitation.invitedAt) dateCandidates.push(new Date(invitation.invitedAt).getTime());
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
      if (!latestQuote || quotationStatus === 'DRAFT') {
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
        id: r.id,
        rfqNumber: r.rfqNumber,
        title: r.title,
        rfqReceivedDate,
        submissionDeadline,
        clientTenant: r.tenant?.name || 'Procucev Client',
        projectPackage: `${r.project?.name || 'Project'} / ${r.packageName || 'Main Package'}`,
        rfqReference: r.rfqNumber,
        category: r.lines[0]?.category || r.boqRevision?.boq?.title || 'General Works',
        itemCount: r.lines.length,
        permittedCommercial: {
          latestQuoteTotal: latestQuote?.totalQuoteAmount || null,
          counterOfferAmount: latestRound?.counterOfferAmount || null,
          revisedQuoteAmount: isVendorRevisionSubmitted ? latestRound?.revisedQuoteAmount : null,
          ppoTotalValue: latestPpo?.totalValue || null,
        },
        quotationStatus,
        negotiationStatus,
        buyerDecisionStatus,
        lastActivityDate,
        nextAction,
        nextResponsibleParty,
        availableActions,
        unreadMessagesCount: messages.length,
        lines: r.lines,
        quotes: r.quotes,
        negotiations: r.negotiations,
        latestQuote,
        latestRound,
        latestPpo,
      };
    });

    // 5. Compute actionable summary counts strictly from persisted records
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const newRfqsCount = rfqRegister.filter(
      (r) => r.quotationStatus === 'PENDING_SUBMISSION' || r.quotationStatus === 'NOT_SUBMITTED'
    ).length;

    const quotesDueSoonCount = rfqRegister.filter(
      (r) =>
        r.submissionDeadline &&
        new Date(r.submissionDeadline) <= threeDaysFromNow &&
        r.quotationStatus === 'PENDING_SUBMISSION'
    ).length;

    const quotesSubmittedCount = rfqRegister.filter(
      (r) => r.latestQuote !== null
    ).length;

    const negotiationsAwaitingVendorCount = rfqRegister.filter(
      (r) =>
        r.nextResponsibleParty === 'VENDOR' &&
        r.latestRound &&
        r.latestRound.status === 'ROUND_ACTIVE' &&
        !r.latestRound.revisedQuoteAmount
    ).length;

    const finalOffersAwaitingBuyerCount = rfqRegister.filter(
      (r) =>
        r.latestRound?.isFinalOffer &&
        (!r.latestRound.buyerDecision || r.latestRound.buyerDecision === 'PENDING_BUYER_DECISION' || r.latestRound.buyerDecision === 'FINAL_ACCEPTANCE_PENDING')
    ).length;

    const quotesAcceptedPpoAwaitedCount = rfqRegister.filter(
      (r) =>
        r.latestRound?.buyerDecision === 'ACCEPTED' &&
        !r.latestPpo
    ).length;

    const pposAwaitingAcceptanceCount = ppos.filter(
      (p) => p.vendorStatus === 'PENDING_VENDOR_ACCEPTANCE' || (p.status === 'ISSUED' && !p.vendorAcceptedAt)
    ).length;

    const acceptedPposCount = ppos.filter(
      (p) => p.vendorStatus === 'ACCEPTED_BY_VENDOR' || p.status === 'CONFIRMED'
    ).length;

    const counts = {
      newRfqs: newRfqsCount,
      quotesDueSoon: quotesDueSoonCount,
      quotesSubmitted: quotesSubmittedCount,
      negotiationsAwaitingVendor: negotiationsAwaitingVendorCount,
      finalOffersAwaitingBuyer: finalOffersAwaitingBuyerCount,
      quotesAcceptedPpoAwaited: quotesAcceptedPpoAwaitedCount,
      pposAwaitingAcceptance: pposAwaitingAcceptanceCount,
      acceptedPpos: acceptedPposCount,
    };

    return apiSuccess({
      vendor: {
        id: vendor.id,
        code: vendor.code,
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        categories: vendor.categories,
        status: vendor.status,
      },
      counts,
      rfqRegister,
      ppos,
      rateCards,
    });
  } catch (error: any) {
    console.error('Error fetching vendor dashboard data:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchVendorDashboardData }), 500);
  }
}
