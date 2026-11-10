// src/app/api/vendor-portal/rfqs/route.ts
// Vendor-specific RFQs listing API (strictly isolated to invited vendor's records)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { VENDOR_RFQ_DEFAULT_PAGE_SIZE, VENDOR_RFQ_MAX_PAGE_NUMBER, VENDOR_RFQ_MAX_PAGE_SIZE } from './route.constants';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/rfqs', method: 'GET' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/rfqs', method: 'GET' });
  }

  const { searchParams } = new URL(req.url);
  const requestedPage = Number(searchParams.get('page'));
  const requestedPageSize = Number(searchParams.get('pageSize'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, VENDOR_RFQ_MAX_PAGE_NUMBER)
    : 1;
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, VENDOR_RFQ_MAX_PAGE_SIZE)
    : VENDOR_RFQ_DEFAULT_PAGE_SIZE;
  const cursor = (searchParams.get('cursor') || '').slice(0, 100) || null;
  const search = (searchParams.get('search') || '').trim();
  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    invitedVendors: { some: { vendorId } },
  };
  if (search) {
    where.OR = [
      { rfqNumber: { contains: search } },
      { title: { contains: search } },
      { packageName: { contains: search } },
      { project: { name: { contains: search } } },
    ];
  }

  try {
    const [total, rfqs] = await Promise.all([
      prisma.rfq.count({ where }),
      prisma.rfq.findMany({
      where,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : { skip: (page - 1) * pageSize }),
      take: pageSize,
      include: {
        _count: { select: { lines: true } },
        tenant: { select: { id: true, name: true, slug: true } },
        project: { select: { id: true, name: true, projectCode: true } },
        boqRevision: {
          select: {
            id: true,
            revisionNumber: true,
            boq: { select: { id: true, title: true, boqCode: true } },
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
          take: 1,
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
          },
        },
        negotiations: {
          where: { tenantId: ctx.tenantId },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            rounds: {
              where: { vendorId },
              orderBy: { roundNumber: 'desc' },
              take: 1,
              select: {
                roundNumber: true, buyerDecision: true, isFinalOffer: true, counterOfferAmount: true,
                revisedQuoteAmount: true, nextResponsibleParty: true, createdAt: true, updatedAt: true,
              },
            },
          },
        },
        ppos: {
          where: { vendorId },
          orderBy: { createdAt: 'desc' },
          take: 1,
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
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    ]);

    const enrichedRfqs = rfqs.map((r) => {
      const invitation = r.invitedVendors[0] || null;
      const latestQuote = r.quotes[0] || null;
      const allRounds = (r.negotiations || []).flatMap((n) => n.rounds || []);
      const latestRound = allRounds.sort((a, b) => (b.roundNumber || 1) - (a.roundNumber || 1))[0] || null;
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
        lineCount: r._count?.lines || 0,
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

    return apiSuccess({
      rfqs: enrichedRfqs, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
      hasMore: cursor ? rfqs.length === pageSize : page * pageSize < total,
      nextCursor: rfqs.length === pageSize ? rfqs[rfqs.length - 1]?.id || null : null,
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor_portal.rfqs_fetch_failed', {
      operation: 'list_vendor_rfqs', route: '/api/vendor-portal/rfqs', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, vendorId, page, pageSize,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRfqs, 500);
  }
}
