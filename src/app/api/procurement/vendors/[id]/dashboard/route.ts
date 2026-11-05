// src/app/api/procurement/vendors/[id]/dashboard/route.ts
// Comprehensive Vendor Dashboard API: KPIs, RFQ Register, Negotiation Status, PPO Acceptance & Rate Cards
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { getD1BatchDatabase, runD1BatchAtomically } from '@/lib/d1-batch';
import { VENDOR_DASHBOARD_COUNTS_SQL, DEFAULT_VENDOR_DASHBOARD_PAGE_SIZE, MAX_VENDOR_DASHBOARD_PAGE_SIZE } from './route.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id: vendorId } = await params;
  const startedAt = Date.now();
  const searchParams = new URL(req.url).searchParams;
  const requestedSection = searchParams.get('section');
  if (requestedSection && !['rfqs', 'ppos', 'rateCards'].includes(requestedSection)) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  const section = requestedSection as 'rfqs' | 'ppos' | 'rateCards' | null;
  const pageSizeValue = Number(searchParams.get('pageSize'));
  const pageSize = Number.isSafeInteger(pageSizeValue) && pageSizeValue > 0
    ? Math.min(pageSizeValue, MAX_VENDOR_DASHBOARD_PAGE_SIZE)
    : DEFAULT_VENDOR_DASHBOARD_PAGE_SIZE;
  const readPage = (key: string) => {
    const value = Number(searchParams.get(key));
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 10_000) : 1;
  };
  const rfqPage = readPage('rfqPage');
  const ppoPage = readPage('ppoPage');
  const rateCardPage = readPage('rateCardPage');

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
      select: { id: true, tenantId: true, code: true, name: true, email: true, phone: true, categories: true, status: true },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied, 404);
    }

    const rfqWhere = { tenantId: ctx.tenantId, invitedVendors: { some: { tenantId: ctx.tenantId, vendorId: vendor.id } } };
    const ppoWhere = { vendorId: vendor.id, tenantId: ctx.tenantId };
    const rateCardWhere = { vendorId: vendor.id, tenantId: ctx.tenantId };
    const rfqsPromise = section && section !== 'rfqs' ? Promise.resolve([]) : prisma.rfq.findMany({
      where: rfqWhere,
      include: {
        tenant: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, projectCode: true } },
        boqRevision: { select: { boq: { select: { id: true, title: true, boqCode: true } } } },
        _count: { select: { lines: true } },
        lines: { select: { id: true, lineNumber: true, category: true }, orderBy: { lineNumber: 'asc' }, take: 1 },
        invitedVendors: { where: { tenantId: ctx.tenantId, vendorId: vendor.id }, take: 1 },
        quotes: {
          where: { tenantId: ctx.tenantId, vendorId: vendor.id },
          orderBy: [{ quoteVersion: 'desc' }, { id: 'desc' }], take: 1,
          select: { id: true, status: true, totalQuoteAmount: true, submittedAt: true, updatedAt: true },
        },
        negotiations: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 1,
          include: { rounds: {
            where: { tenantId: ctx.tenantId, vendorId: vendor.id },
            orderBy: [{ roundNumber: 'desc' }, { id: 'desc' }], take: 1,
          } },
        },
        ppos: {
          where: { tenantId: ctx.tenantId, vendorId: vendor.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
          select: { id: true, status: true, vendorStatus: true, totalValue: true, createdAt: true, updatedAt: true },
        },
        messages: {
          where: { tenantId: ctx.tenantId, OR: [{ vendorId: vendor.id }, { vendorId: null }] },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { createdAt: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (rfqPage - 1) * pageSize, take: pageSize,
    });
    const rfqCountPromise = section && section !== 'rfqs' ? Promise.resolve(0) : prisma.rfq.count({ where: rfqWhere });
    const pposPromise = section && section !== 'ppos' ? Promise.resolve([]) : prisma.ppo.findMany({
      where: ppoWhere,
      include: {
        project: { select: { id: true, name: true, projectCode: true, location: true } },
        rfq: { select: { id: true, rfqNumber: true, title: true, packageName: true, negotiations: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 1,
          include: { rounds: {
            where: { tenantId: ctx.tenantId, vendorId: vendor.id },
            orderBy: [{ roundNumber: 'desc' }, { id: 'desc' }], take: 1,
          } },
        } } },
        lines: { orderBy: { lineNumber: 'asc' }, take: 140 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (ppoPage - 1) * pageSize, take: pageSize,
    });
    const ppoCountPromise = section && section !== 'ppos' ? Promise.resolve(0) : prisma.ppo.count({ where: ppoWhere });
    const rateCardsPromise = section && section !== 'rateCards' ? Promise.resolve([]) : prisma.vendorRateCard.findMany({
      where: rateCardWhere, include: { _count: { select: { items: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (rateCardPage - 1) * pageSize, take: pageSize,
    });
    const rateCardCountPromise = section && section !== 'rateCards' ? Promise.resolve(0) : prisma.vendorRateCard.count({ where: rateCardWhere });
    const countsPromise = section ? Promise.resolve(null) : runD1BatchAtomically(getD1BatchDatabase(), [{
      sql: VENDOR_DASHBOARD_COUNTS_SQL,
      values: [ctx.tenantId, vendor.id, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), ctx.tenantId, vendor.id, ctx.tenantId, vendor.id],
    }]);
    const [rfqs, rfqTotal, ppos, ppoTotal, rateCards, rateCardTotal, countRows] = await Promise.all([
      rfqsPromise, rfqCountPromise, pposPromise, ppoCountPromise,
      rateCardsPromise, rateCardCountPromise, countsPromise,
    ]);
    const rfqIds = rfqs.map((rfq) => rfq.id);
    const messageGroups = rfqIds.length > 0 ? await prisma.rfqMessage.groupBy({
      by: ['rfqId'], where: {
        tenantId: ctx.tenantId, rfqId: { in: rfqIds },
        OR: [{ vendorId: vendor.id }, { vendorId: null }],
      }, _count: { _all: true },
    }) : [];
    const messageCounts = new Map(messageGroups.map((group) => [group.rfqId, group._count._all]));

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
        itemCount: r._count?.lines ?? r.lines.length,
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
        unreadMessagesCount: messageCounts.get(r.id) || 0,
        lines: r.lines,
        quotes: r.quotes,
        negotiations: r.negotiations,
        latestQuote,
        latestRound,
        latestPpo,
      };
    });

    const countsRow = countRows?.[0]?.results?.[0] as Record<string, number | string> | undefined;
    if (!section && !countsRow) throw new Error(UI_STRINGS.common.userMessages.failedToFetchVendorDashboardData);
    const counts = countsRow ? {
      newRfqs: Number(countsRow.newRfqs || 0),
      quotesDueSoon: Number(countsRow.quotesDueSoon || 0),
      quotesSubmitted: Number(countsRow.quotesSubmitted || 0),
      negotiationsAwaitingVendor: Number(countsRow.negotiationsAwaitingVendor || 0),
      finalOffersAwaitingBuyer: Number(countsRow.finalOffersAwaitingBuyer || 0),
      quotesAcceptedPpoAwaited: Number(countsRow.quotesAcceptedPpoAwaited || 0),
      pposAwaitingAcceptance: Number(countsRow.pposAwaitingAcceptance || 0),
      acceptedPpos: Number(countsRow.acceptedPpos || 0),
    } : undefined;
    const pagination: Record<string, { page: number; pageSize: number; total: number; hasMore: boolean }> = {};
    if (!section || section === 'rfqs') pagination.rfqs = {
      page: rfqPage, pageSize, total: rfqTotal, hasMore: rfqPage * pageSize < rfqTotal,
    };
    if (!section || section === 'ppos') pagination.ppos = {
      page: ppoPage, pageSize, total: ppoTotal, hasMore: ppoPage * pageSize < ppoTotal,
    };
    if (!section || section === 'rateCards') pagination.rateCards = {
      page: rateCardPage, pageSize, total: rateCardTotal, hasMore: rateCardPage * pageSize < rateCardTotal,
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
      pagination,
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor.dashboard_read_failed', {
      operation: 'read_vendor_dashboard', route: '/api/procurement/vendors/[id]/dashboard',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      vendorId, section, rfqPage, ppoPage, rateCardPage, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchVendorDashboardData, 500);
  }
}
