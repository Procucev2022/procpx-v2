// app/api/procurement/auctions/rfq-options/route.ts
// Returns RFQs eligible for auction creation with PR/BOQ details, line items, and quoted vendors
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) {
      where.id = rfqId;
    }

    const rfqs = await prisma.rfq.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, projectCode: true },
        },
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
            boqLine: {
              select: {
                id: true,
                itemCode: true,
              },
            },
            prLine: {
              select: {
                id: true,
                itemDescription: true,
                estimatedRate: true,
                quantity: true,
              },
            },
          },
          orderBy: { lineNumber: 'asc' },
        },
        invitedVendors: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                code: true,
                email: true,
                contactPerson: true,
                phone: true,
              },
            },
          },
        },
        quotes: {
          where: { status: { in: ['SUBMITTED', 'REVISED', 'EVALUATED'] } },
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            lines: true,
          },
          orderBy: { totalQuoteAmount: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: rfqId ? 1 : 50,
    });

    // Also get project users who can be invited as observers
    const projectUsers = await prisma.user.findMany({
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
      orderBy: { name: 'asc' },
    });

    const formattedRfqs = (rfqs as any[]).map((rfq) => {
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
      projectUsers,
    });
  } catch (error: any) {
    console.error('Error fetching auction RFQ options:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchRfqOptions }), 500);
  }
}
