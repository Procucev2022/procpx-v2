// app/api/procurement/auctions/rfq-options/route.ts
// Returns RFQs eligible for auction creation with PR/BOQ details, line items, and quoted vendors
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const usersOnly = searchParams.get('usersOnly') === 'true';
  const observerPage = getListPageWindow(searchParams);
  const rfqPageParams = new URLSearchParams({
    page: searchParams.get('rfqPage') || '1',
    pageSize: searchParams.get('rfqPageSize') || '50',
  });
  const rfqPage = getListPageWindow(rfqPageParams);
  const includeObservers = searchParams.get('includeObservers') !== 'false';
  const startedAt = Date.now();

  try {
    const listProjectUsers = async () => {
      const users = await prisma.user.findMany({
        where: {
          tenantId: ctx.tenantId,
          role: { in: ['PROJECT_USER', 'PROJECT_APPROVER'] },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: observerPage.skip,
        take: observerPage.pageSize + 1,
      });
      return {
        projectUsers: users.slice(0, observerPage.pageSize),
        projectUsersPage: observerPage.page,
        projectUsersPageSize: observerPage.pageSize,
        projectUsersHasMore: users.length > observerPage.pageSize,
      };
    };

    if (usersOnly) {
      return apiSuccess(await listProjectUsers());
    }

    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) {
      where.id = rfqId;
    }

    let rfqs: unknown[];
    let rfqHasMore = false;
    if (rfqId) {
      rfqs = await prisma.rfq.findMany({
        where,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          pr: {
            select: {
              id: true,
              prNumber: true,
              title: true,
              costCentre: { select: { id: true, name: true, code: true } },
              boq: { select: { id: true, boqCode: true, title: true } },
            },
          },
          lines: {
            include: {
              boqLine: { select: { id: true, itemCode: true } },
              prLine: { select: { id: true, itemDescription: true, estimatedRate: true, quantity: true } },
            },
            orderBy: { lineNumber: 'asc' },
          },
          invitedVendors: {
            include: {
              vendor: { select: { id: true, name: true, code: true, email: true, contactPerson: true, phone: true } },
            },
          },
          quotes: {
            where: { status: { in: ['SUBMITTED', 'REVISED', 'EVALUATED'] } },
            include: { vendor: { select: { id: true, name: true, code: true } } },
            orderBy: { totalQuoteAmount: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    } else {
      const rfqPageRows = await prisma.rfq.findMany({
        where,
        select: {
          id: true,
          rfqNumber: true,
          title: true,
          packageName: true,
          status: true,
          projectId: true,
          prId: true,
          project: { select: { id: true, name: true, projectCode: true } },
          pr: {
            select: {
              id: true,
              prNumber: true,
              title: true,
              costCentre: { select: { id: true, name: true, code: true } },
              boq: { select: { id: true, boqCode: true, title: true } },
            },
          },
          _count: { select: { invitedVendors: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: rfqPage.skip,
        take: rfqPage.pageSize + 1,
      });
      rfqHasMore = rfqPageRows.length > rfqPage.pageSize;
      rfqs = rfqPageRows.slice(0, rfqPage.pageSize);
    }

    // Observer options are tenant-scoped and loaded in stable bounded pages.
    const observerOptions = includeObservers && !rfqId
      ? await listProjectUsers()
      : {
        projectUsers: [],
        projectUsersPage: observerPage.page,
        projectUsersPageSize: observerPage.pageSize,
        projectUsersHasMore: false,
      };

    const formattedRfqs = (rfqs as any[]).map((rfq) => {
      if (!rfqId) {
        return {
          id: rfq.id,
          rfqNumber: rfq.rfqNumber,
          title: rfq.title,
          packageName: rfq.packageName,
          status: rfq.status,
          projectId: rfq.projectId,
          projectName: rfq.project?.name,
          projectCode: rfq.project?.projectCode,
          prId: rfq.prId,
          prNumber: rfq.pr?.prNumber,
          prTitle: rfq.pr?.title,
          costCentre: rfq.pr?.costCentre?.name,
          boqId: rfq.pr?.boq?.id,
          boqNumber: rfq.pr?.boq?.boqCode,
          quotedVendorCount: rfq._count?.invitedVendors || 0,
        };
      }

      const quotedVendors = (rfq.invitedVendors || []).map((iv: any) => {
        const quote = (rfq.quotes || []).find((q: any) => q.vendorId === iv.vendorId);
        return {
          vendorId: iv.vendorId,
          code: iv.vendor?.code,
          name: iv.vendor?.name,
          email: iv.vendor?.email,
          phone: iv.vendor?.phone,
          hasSubmittedQuote: !!quote,
          quoteAmount: quote ? Number(quote.totalQuoteAmount) : null,
          quoteNumber: quote?.quoteNumber || null,
        };
      });

      const validQuotes = (rfq.quotes || []).filter((q: any) => Number(q.totalQuoteAmount) > 0);
      const lowestQuotedAmount = validQuotes.length > 0 ? Number(validQuotes[0].totalQuoteAmount) : null;

      return {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        title: rfq.title,
        packageName: rfq.packageName,
        status: rfq.status,
        projectId: rfq.projectId,
        projectName: rfq.project?.name,
        projectCode: rfq.project?.projectCode,
        prId: rfq.prId,
        prNumber: rfq.pr?.prNumber,
        prTitle: rfq.pr?.title,
        costCentre: rfq.pr?.costCentre?.name,
        boqId: rfq.pr?.boq?.id,
        boqNumber: rfq.pr?.boq?.boqCode,
        lowestQuotedAmount,
        quotedVendorCount: quotedVendors.length,
        lines: (rfq.lines || []).map((l: any) => ({
          id: l.id,
          lineNumber: l.lineNumber,
          itemCode: l.boqLine?.itemCode || `ITEM-${l.lineNumber}`,
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": l.description || l.prLine?.itemDescription || 'Scope Line Item' }),
          boqDescription: l.specification || l.prLine?.itemDescription || '',
          category: l.category || 'General',
          subCategory: l.subcategory || '',
          uom: l.uom || 'EA',
          quantity: Number(l.quantity),
          estimatedRate: l.benchmarkRate ? Number(l.benchmarkRate) : (l.prLine?.estimatedRate ? Number(l.prLine.estimatedRate) : null),
        })),
        quotedVendors,
      };
    });

    return apiSuccess({
      rfqs: formattedRfqs,
      rfqPage: rfqPage.page,
      rfqPageSize: rfqPage.pageSize,
      rfqHasMore,
      ...observerOptions,
    });
  } catch (error: any) {
    await writeStructuredLog('error', 'auction.rfq_options_read_failed', {
      operation: usersOnly ? 'list_auction_observers' : 'list_auction_rfq_options',
      route: '/api/procurement/auctions/rfq-options',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      rfqId: rfqId || undefined,
      page: observerPage.page,
      pageSize: observerPage.pageSize,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchRfqOptions, 500);
  }
}
