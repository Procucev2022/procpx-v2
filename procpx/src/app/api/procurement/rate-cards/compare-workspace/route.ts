// src/app/api/procurement/rate-cards/compare-workspace/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const vendorId = searchParams.get('vendorId');
  const category = searchParams.get('category');
  const subcategory = searchParams.get('subcategory');

  if (!vendorId) {
    return apiError('vendorId query parameter is required', 400);
  }

  try {
    // 1. Selected Vendor Info
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        code: true,
        name: true,
        vendorType: true,
        complianceStatus: true,
        qualificationStatus: true,
        performanceScore: true,
        city: true,
        state: true,
      },
    });

    if (!vendor) {
      return apiError('Vendor not found', 404);
    }

    // 2. Selected Vendor's Past Quotations
    const pastQuotes = await prisma.quote.findMany({
      where: {
        tenantId: ctx.tenantId,
        vendorId,
        status: { in: ['SUBMITTED', 'ACCEPTED', 'UNDER_EVALUATION', 'REVISED'] },
      },
      include: {
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            status: true,
            releasedAt: true,
          },
        },
        lines: {
          include: {
            rfqLine: {
              select: {
                id: true,
                lineNumber: true,
                description: true,
                specification: true,
                category: true,
                subcategory: true,
                uom: true,
                quantity: true,
                benchmarkRate: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    });

    // Flatten quotation line items for easier item-level comparison
    const formattedPastQuotes: any[] = [];
    pastQuotes.forEach((q) => {
      q.lines.forEach((l) => {
        if (!category || !l.rfqLine.category || l.rfqLine.category.toLowerCase().includes(category.toLowerCase())) {
          formattedPastQuotes.push({
            quoteId: q.id,
            quoteNumber: q.quoteNumber,
            rfqNumber: q.rfq.rfqNumber,
            rfqTitle: q.rfq.title,
            submittedAt: q.submittedAt,
            rfqLineId: l.rfqLineId,
            description: l.rfqLine.description,
            specification: l.rfqLine.specification,
            category: l.rfqLine.category,
            subcategory: l.rfqLine.subcategory,
            uom: l.rfqLine.uom,
            quantity: l.rfqLine.quantity,
            quotedRate: l.unitRate,
            lineTotal: l.lineTotal,
            source: `RFQ Quote (${q.rfq.rfqNumber})`,
          });
        }
      });
    });

    // 3. Existing Rate Cards for that Vendor & Category
    const rateCardWhere: any = {
      tenantId: ctx.tenantId,
      vendorId,
    };
    if (category) {
      rateCardWhere.category = category;
    }

    const existingRateCards = await prisma.vendorRateCard.findMany({
      where: rateCardWhere,
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Flatten existing rate card items
    const formattedExistingRateCardItems: any[] = [];
    existingRateCards.forEach((rc) => {
      rc.items.forEach((item) => {
        formattedExistingRateCardItems.push({
          rateCardId: rc.id,
          rateCardNumber: rc.rateCardNumber,
          version: rc.version,
          status: rc.status,
          validFrom: rc.validFrom,
          validTo: rc.validTo,
          scope: rc.scope,
          location: item.location || rc.location,
          itemId: item.id,
          standardBoqItemId: item.standardBoqItemId,
          itemCode: item.itemCode,
          description: item.description,
          specification: item.specification,
          category: item.category,
          subcategory: item.subcategory,
          uom: item.uom,
          rate: item.rate,
          source: `Rate Card (${rc.rateCardNumber} ${rc.version})`,
        });
      });
    });

    // 4. Historical PPO/PO Rates for comparable items
    const ppoWhere: any = {
      tenantId: ctx.tenantId,
    };
    if (category) {
      ppoWhere.category = category;
    }

    const historicalPpoLines = await prisma.ppoLine.findMany({
      where: ppoWhere,
      include: {
        ppo: {
          select: {
            id: true,
            ppoNumber: true,
            title: true,
            vendorId: true,
            vendor: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const formattedHistoricalPpos = historicalPpoLines.map((pl: any) => ({
      ppoId: pl.ppoId,
      ppoNumber: pl.ppo?.ppoNumber || 'PPO',
      ppoTitle: pl.ppo?.title || '',
      vendorId: pl.ppo?.vendorId,
      vendorName: pl.ppo?.vendor?.name || 'Vendor',
      isSameVendor: pl.ppo?.vendorId === vendorId,
      orderDate: pl.orderDate || pl.createdAt,
      description: pl.itemDescription,
      specification: pl.specification,
      category: pl.category,
      subcategory: pl.subcategory,
      uom: pl.uom,
      quantity: pl.orderedQuantity,
      rate: pl.orderedUnitRate,
      amount: pl.orderedAmount,
      source: `Historical PPO (${pl.ppo?.ppoNumber || 'PPO'})`,
    }));

    // 5. Benchmark Rates (from Standard BOQ Library)
    const stdWhere: any = {
      tenantId: ctx.tenantId,
      isActive: true,
    };
    if (category) {
      stdWhere.category = category;
    }
    if (subcategory) {
      stdWhere.subcategory = subcategory;
    }

    const standardBoqItems = await prisma.standardBoqItem.findMany({
      where: stdWhere,
      orderBy: { itemCode: 'asc' },
      take: 50,
    });

    const formattedBenchmarks = standardBoqItems.map((sb: any) => ({
      standardBoqItemId: sb.id,
      itemCode: sb.itemCode,
      category: sb.category,
      subcategory: sb.subcategory,
      description: sb.standardDescription,
      specification: sb.detailedSpecification,
      uom: sb.uom,
      benchmarkRate: sb.benchmarkRate,
      brandMake: sb.brandMake,
      source: 'proCPX Standard BOQ Library Benchmark',
      sourceDate: sb.updatedAt,
    }));

    return apiSuccess({
      vendor,
      vendorPastQuotes: formattedPastQuotes,
      existingRateCards: formattedExistingRateCardItems,
      historicalPpoRates: formattedHistoricalPpos,
      benchmarkRates: formattedBenchmarks,
    });
  } catch (error: any) {
    console.error('Error in rate card compare-workspace:', error);
    return apiError(error.message || 'Failed to fetch comparison workspace data', 500);
  }
}
