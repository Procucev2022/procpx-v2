// app/api/procurement/rfqs/route.ts
// Handles RFQ listing and RFQ creation from Approved BOQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { createRfq } from './post';
import { RFQ_REGISTER_VENDOR_PREVIEW_LIMIT } from './route.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('RFQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const projectId = searchParams.get('projectId');
  const search = searchParams.get('search') || '';
  const { page, pageSize, skip } = getListPageWindow(searchParams);

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (status) {
      if (status === 'active') {
        where.status = {
          in: ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION'],
        };
      } else {
        where.status = status;
      }
    }

    if (projectId) {
      where.projectId = projectId;
    }

    if (search) {
      where.OR = [
        { rfqNumber: { contains: search } },
        { title: { contains: search } },
        { packageName: { contains: search } },
        { project: { name: { contains: search } } },
        { project: { projectCode: { contains: search } } },
      ];
    }

    const [total, statusGroups, rfqs] = await Promise.all([
      prisma.rfq.count({ where }),
      prisma.rfq.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.rfq.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            name: true,
            location: true,
            city: true,
            state: true,
          },
        },
        boqRevision: {
          select: {
            id: true,
            revisionCode: true,
            approvedAt: true,
            boq: {
              select: {
                id: true,
                boqCode: true,
                title: true,
              },
            },
          },
        },
        pr: {
          select: {
            id: true,
            prNumber: true,
            costCentre: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            boq: {
              select: {
                id: true,
                boqCode: true,
              },
            },
          },
        },
        invitedVendors: {
          take: RFQ_REGISTER_VENDOR_PREVIEW_LIMIT,
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                code: true,
                performanceScore: true,
                complianceStatus: true,
              },
            },
          },
        },
        negotiations: {
          select: { id: true, status: true, updatedAt: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        auctions: {
          select: {
            id: true,
            auctionNumber: true,
            auctionType: true,
            status: true,
            currentLowestBid: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        awards: {
          select: { id: true, status: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        ppos: {
          select: {
            id: true,
            ppoNumber: true,
            status: true,
            totalValue: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        _count: {
          select: {
            lines: true,
            invitedVendors: true,
            negotiations: true,
            auctions: true,
            awards: true,
            ppos: true,
          },
        },
        },
      }),
    ]);

    const quoteGroups = rfqs.length > 0 ? await prisma.quote.groupBy({
      by: ['rfqId'],
      where: { tenantId: ctx.tenantId, rfqId: { in: rfqs.map(({ id }) => id) } },
      _count: { _all: true },
      _min: { totalQuoteAmount: true },
    }) : [];
    const quotesByRfqId = new Map(quoteGroups.map((group) => [group.rfqId, group]));

    const formatted = rfqs.map((rfq: any) => {
      const quoteGroup = quotesByRfqId.get(rfq.id);
      const quotesCount = quoteGroup?._count?._all ?? rfq.quotes?.length ?? 0;
      const invitedVendorsCount = rfq._count?.invitedVendors ?? rfq.invitedVendors?.length ?? 0;
      return ({
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      title: rfq.title,
      scopeOfWork: rfq.scopeOfWork,
      packageType: rfq.packageType,
      packageName: rfq.packageName,
      status: rfq.status,
      submissionDeadline: rfq.submissionDeadline,
      clarificationDeadline: rfq.clarificationDeadline,
      commercialValidityDays: rfq.commercialValidityDays,
      estimatedBenchmarkValue: rfq.estimatedBenchmarkValue,
      totalLines: rfq.totalLines || rfq._count.lines,
      project: rfq.project,
      boqRevision: rfq.boqRevision,
      boqCode: rfq.boqRevision?.boq?.boqCode || rfq.pr?.boq?.boqCode || (rfq.project?.projectCode ? `BOQ-${rfq.project.projectCode}` : 'BOQ-R1'),
      costCentre: rfq.pr?.costCentre ? `${rfq.pr.costCentre.code} - ${rfq.pr.costCentre.name}` : 'CC45 - Fitout',
      location: rfq.project?.location || rfq.project?.city || 'India',
      totalBoqValue: rfq.boqRevision?.boq?.totalBenchmarkAmount || rfq.estimatedBenchmarkValue || 0,
      invitedVendorsCount,
      invitedVendors: rfq.invitedVendors?.map((iv: any) => ({
        id: iv.id,
        vendorId: iv.vendorId,
        vendorName: iv.vendor?.name,
        invitationStatus: iv.invitationStatus,
        submissionStatus: iv.submissionStatus,
        performanceScore: iv.vendor?.performanceScore,
      })) || [],
      quotesCount,
      hasQuotes: quotesCount > 0,
      lowestQuoteAmount: quoteGroup?._min?.totalQuoteAmount ?? null,
      negotiations: rfq.negotiations,
      negotiation: rfq.negotiations[0] || null,
      auction: rfq.auctions[0] || null,
      awards: rfq.awards,
      award: rfq.awards[0] || null,
      ppos: rfq.ppos,
      ppo: rfq.ppos[0] || null,
      createdAt: rfq.createdAt,
      releasedAt: rfq.releasedAt,
      });
    });

    return apiSuccess({
      rfqs: formatted,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts: Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all])),
    });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'procurement.rfq_register_read_failed', {
      operation: 'list_rfqs', route: '/api/procurement/rfqs',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, userId: ctx.userId, page, pageSize,
      status: status || undefined, projectId: projectId || undefined, searchLength: search.length,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRfqs, 500);
  }
}

export async function POST(req: NextRequest) {
  return createRfq(req);
}
