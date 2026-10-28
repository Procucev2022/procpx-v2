// app/api/procurement/rfqs/[id]/compare/route.ts
// Comprehensive Line-Level and Package-Level Quote Comparison Matrix with AI Cost, Historical PPO, and Rate Card Baselines
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('QUOTE_COMPARE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        project: true,
        boqRevision: {
          include: {
            lines: {
              include: {
                category: true,
                subcategory: true,
                uom: true,
              },
            },
          },
        },
        pr: {
          select: {
            id: true,
            prNumber: true,
            title: true,
            status: true,
            costCentre: true,
          },
        },
        lines: {
          include: {
            boqLine: {
              include: {
                category: true,
                subcategory: true,
                uom: true,
              },
            },
            prLine: {
              include: {
                boqLine: {
                  include: {
                    category: true,
                    subcategory: true,
                    uom: true,
                  },
                },
              },
            },
          },
          orderBy: { lineNumber: 'asc' },
        },
        invitedVendors: {
          include: { vendor: true },
        },
        quotes: {
          include: {
            vendor: true,
            lines: true,
          },
          orderBy: [{ quoteVersion: 'desc' }, { createdAt: 'desc' }],
        },
        negotiations: {
          include: {
            rounds: {
              include: { vendor: true },
              orderBy: { roundNumber: 'desc' },
            },
          },
        },
        awards: {
          include: { recommendedVendor: true },
        },
      },
    });

    if (!rfq) {
      return apiError('RFQ not found or access denied', 404);
    }

    // 1. Group quotes by vendor to keep full version history and evaluate latest active quote
    const allQuotesByVendor: Record<string, typeof rfq.quotes> = {};
    for (const q of rfq.quotes) {
      if (!allQuotesByVendor[q.vendorId]) {
        allQuotesByVendor[q.vendorId] = [];
      }
      allQuotesByVendor[q.vendorId].push(q);
    }

    const latestQuotesByVendor: Record<string, typeof rfq.quotes[0]> = {};
    for (const [vendorId, quoteList] of Object.entries(allQuotesByVendor)) {
      // Sort by quoteVersion descending
      const sorted = [...quoteList].sort((a, b) => b.quoteVersion - a.quoteVersion);
      latestQuotesByVendor[vendorId] = sorted[0];
    }
    const evaluatedQuotes = Object.values(latestQuotesByVendor);

    // 2. Fetch historical PPO lines for baseline price comparison
    const historicalPpoLines = await prisma.ppoLine.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['ISSUED', 'COMPLETED', 'PARTIALLY_COMPLETED'] },
      },
      select: {
        itemDescription: true,
        orderedUnitRate: true,
        orderedAmount: true,
        uom: true,
        orderDate: true,
        ppo: {
          select: {
            ppoNumber: true,
            vendor: { select: { name: true } },
          },
        },
      },
      orderBy: { orderDate: 'desc' },
      take: 100,
    });

    const historicalPpoMap = new Map<string, { rate: number; ppoNumber: string; vendor: string; date: string }>();
    for (const h of historicalPpoLines) {
      const key = h.itemDescription.toLowerCase().trim();
      if (!historicalPpoMap.has(key)) {
        historicalPpoMap.set(key, {
          rate: h.orderedUnitRate,
          ppoNumber: h.ppo?.ppoNumber || 'PPO',
          vendor: h.ppo?.vendor?.name || 'Vendor',
          date: h.orderDate.toISOString().split('T')[0],
        });
      }
    }

    // 3. Fetch active approved rate cards in the tenant
    const now = new Date();
    const approvedRateCards = await prisma.vendorRateCard.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'APPROVED',
        validFrom: { lte: now },
        validTo: { gte: now },
      },
      include: {
        vendor: { select: { id: true, name: true, code: true } },
        items: true,
      },
    });

    const rateCardItemsMap = new Map<string, { rate: number; rateCardNumber: string; vendorName: string; validTo: string }>();
    const vendorRateCardMap = new Map<string, { rate: number; rateCardNumber: string; version: string; validity: string; status: string }>();
    for (const rc of approvedRateCards) {
      for (const item of rc.items) {
        const key = item.description.toLowerCase().trim();
        if (!rateCardItemsMap.has(key)) {
          rateCardItemsMap.set(key, {
            rate: item.rate,
            rateCardNumber: rc.rateCardNumber,
            vendorName: rc.vendor.name,
            validTo: rc.validTo.toISOString().split('T')[0],
          });
        }
        const vendorKey = `${rc.vendorId}___${key}`;
        if (!vendorRateCardMap.has(vendorKey)) {
          vendorRateCardMap.set(vendorKey, {
            rate: item.rate,
            rateCardNumber: rc.rateCardNumber,
            version: `v${rc.version}.0`,
            validity: `${rc.validFrom.toISOString().split('T')[0]} to ${rc.validTo.toISOString().split('T')[0]}`,
            status: rc.status,
          });
        }
      }
    }

    // 4. Vendors participating in comparison
    const vendors = evaluatedQuotes.map((q) => {
      const allRevisions = (allQuotesByVendor[q.vendorId] || []).map((rev) => ({
        id: rev.id,
        quoteNumber: rev.quoteNumber,
        version: rev.quoteVersion,
        totalAmount: rev.totalQuoteAmount,
        submittedAt: rev.submittedAt,
        status: rev.status,
      }));

      const quotedLineIds = new Set(q.lines.filter((l) => l.unitRate > 0).map((l) => l.rfqLineId));
      const totalRfqLines = rfq.lines.length;
      const quotedCount = quotedLineIds.size;
      const completenessPercent = totalRfqLines > 0 ? Math.round((quotedCount / totalRfqLines) * 100) : 0;
      const missingLineCount = totalRfqLines - quotedCount;

      return {
        vendorId: q.vendor.id,
        vendorName: q.vendor.name,
        vendorCode: q.vendor.code,
        vendorType: q.vendor.vendorType || 'CLIENT_VENDOR',
        qualificationStatus: q.vendor.qualificationStatus || 'NOT_EVALUATED',
        complianceStatus: q.vendor.complianceStatus,
        performanceScore: q.vendor.performanceScore,
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        quoteVersion: q.quoteVersion,
        totalQuoteAmount: q.totalQuoteAmount,
        commercialTerms: q.commercialTerms,
        paymentTermsOffered: q.paymentTermsOffered,
        deliveryLeadTimeDays: q.deliveryLeadTimeDays,
        submittedAt: q.submittedAt,
        completenessPercent,
        quotedCount,
        missingLineCount,
        isComplete: missingLineCount === 0,
        revisions: allRevisions,
      };
    });

    // 5. Line-level comparison matrix
    let totalAiBenchmark = 0;
    const vendorTotals: Record<string, number> = {};
    vendors.forEach((v) => (vendorTotals[v.vendorId] = 0));

    const lineComparison = rfq.lines.map((rfqLine) => {
      // AI Estimated Unit Cost
      const aiCost = rfqLine.boqLine?.aiUnitCost || rfqLine.benchmarkRate || rfqLine.prLine?.estimatedRate || null;
      const aiTotal = aiCost !== null ? aiCost * rfqLine.quantity : null;
      if (aiTotal !== null) totalAiBenchmark += aiTotal;

      const aiSource = rfqLine.boqLine?.costSource || (aiCost ? 'AI Costing Engine / Baseline Benchmark' : null);
      const aiDate = rfqLine.boqLine?.costDate ? rfqLine.boqLine.costDate.toISOString().split('T')[0] : null;

      // Historical PPO comparison
      const reqDesc = rfqLine.description.toLowerCase().trim();
      const histPpo = historicalPpoMap.get(reqDesc) || null;

      // Rate Card comparison (General)
      const rcItem = rateCardItemsMap.get(reqDesc) || null;

      const vendorQuotes: Record<string, any> = {};
      let lowestRate = Infinity;
      let lowestVendorId = '';
      let lowestVendorName = '';

      for (const q of evaluatedQuotes) {
        const matchingLine = q.lines.find((ql) => ql.rfqLineId === rfqLine.id);
        const rate = matchingLine ? matchingLine.unitRate : 0;
        const amount = matchingLine ? matchingLine.lineTotal : rate * rfqLine.quantity;
        const quoted = rate > 0;

        const varianceVsAi = (aiCost !== null && rate > 0) ? (aiCost - rate) * rfqLine.quantity : null;

        // Vendor-specific Rate Card
        const vendorRc = vendorRateCardMap.get(`${q.vendorId}___${reqDesc}`);

        // Negotiation rounds for this vendor - sort descending by roundNumber
        const allRounds = rfq.negotiations
          .flatMap((n) => n.rounds)
          .filter((r) => r.vendorId === q.vendorId)
          .sort((a, b) => (b.roundNumber || 1) - (a.roundNumber || 1));
        const latestRound = allRounds[0];

        // 3. Our Offer Rate (persisted buyer counteroffer for this line/round)
        let ourOfferRate: number | null = null;
        if (latestRound?.lineItemsJson) {
          try {
            const items = typeof latestRound.lineItemsJson === 'string' ? JSON.parse(latestRound.lineItemsJson) : latestRound.lineItemsJson;
            if (Array.isArray(items)) {
              const matchItem = items.find((it: any) => (it.rfqLineId || it.id) === rfqLine.id);
              if (matchItem?.counterRate !== undefined && matchItem?.counterRate !== null) {
                ourOfferRate = Number(matchItem.counterRate);
              }
            }
          } catch {}
        }
        if (ourOfferRate === null && latestRound?.counterOfferAmount && q.totalQuoteAmount > 0) {
          ourOfferRate = Math.round(rate * (latestRound.counterOfferAmount / q.totalQuoteAmount));
        }

        // 4. Final negotiated RFQ rate - must only reflect a genuine submitted vendor revision
        let finalNegotiatedRate: number | null = null;
        const isRevisionSubmitted = Boolean(
          latestRound &&
          latestRound.revisedQuoteAmount !== null &&
          latestRound.revisedQuoteAmount > 0 &&
          (latestRound.status === 'REVISED_SUBMITTED' || latestRound.status === 'FINAL_OFFER_SUBMITTED') &&
          (latestRound.nextResponsibleParty === 'BUYER' || latestRound.buyerDecision !== null)
        );

        if (isRevisionSubmitted) {
          if (latestRound.lineItemsJson) {
            try {
              const items = typeof latestRound.lineItemsJson === 'string' ? JSON.parse(latestRound.lineItemsJson) : latestRound.lineItemsJson;
              if (Array.isArray(items)) {
                const matchItem = items.find((it: any) => (it.rfqLineId || it.id) === rfqLine.id);
                if (matchItem?.revisedRate !== undefined && matchItem?.revisedRate !== null) {
                  finalNegotiatedRate = Number(matchItem.revisedRate);
                }
              }
            } catch {}
          }
          if (finalNegotiatedRate === null && latestRound.revisedQuoteAmount && q.totalQuoteAmount > 0) {
            finalNegotiatedRate = Math.round(rate * (latestRound.revisedQuoteAmount / q.totalQuoteAmount));
          }
        }

        vendorQuotes[q.vendorId] = {
          rate, // 2. Vendor's current RFQ quoted unit price
          amount,
          discount: matchingLine?.discountPercent || 0,
          tax: matchingLine?.taxPercent || 18,
          quoted,
          varianceVsAi,
          // 1. Applicable approved Rate Card unit price for this vendor
          vendorRateCardRate: vendorRc?.rate || null,
          vendorRateCardNumber: vendorRc?.rateCardNumber || null,
          vendorRateCardVersion: vendorRc?.version || null,
          vendorRateCardValidity: vendorRc?.validity || null,
          // 3. Our Offer Rate
          ourOfferRate,
          // 4. Final negotiated RFQ rate
          finalNegotiatedRate,
        };

        if (quoted) {
          vendorTotals[q.vendorId] = (vendorTotals[q.vendorId] || 0) + amount;
          if (rate < lowestRate) {
            lowestRate = rate;
            lowestVendorId = q.vendorId;
            lowestVendorName = q.vendor.name;
          }
        }
      }

      const varianceVsAi = (aiCost !== null && lowestRate !== Infinity) ? (aiCost * rfqLine.quantity) - (lowestRate * rfqLine.quantity) : 0;
      const variancePercent = (aiTotal && aiTotal > 0 && lowestRate !== Infinity) ? (varianceVsAi / aiTotal) * 100 : 0;

      const sourceBoq =
        rfqLine.boqLine ||
        rfqLine.prLine?.boqLine ||
        rfq.boqRevision?.lines?.find((b: any) =>
          b.id === rfqLine.boqLineId ||
          (b.itemCode && b.itemCode === (rfqLine as any).itemCode) ||
          b.lineNumber === rfqLine.lineNumber ||
          b.lineNumber === String(rfqLine.lineNumber).replace(/^RFQ-L|^PR-L|^L-/, '') ||
          (b.standardDescription && b.standardDescription.toLowerCase() === (rfqLine.description || '').toLowerCase()) ||
          (b.originalDescription && b.originalDescription.toLowerCase() === (rfqLine.description || '').toLowerCase())
        );

      const itemCode = sourceBoq?.itemCode || (rfqLine as any).itemCode || null;
      const itemDescription = rfqLine.description || sourceBoq?.standardDescription || sourceBoq?.originalDescription || 'Line item';
      
      // BOQ Description: The source BOQ-specific description.
      // Do not copy Item Description into BOQ Description. If blank or identical to itemDescription, show null ("—").
      const rawBoqDesc = (sourceBoq?.originalDescription && sourceBoq.originalDescription.trim() !== itemDescription.trim())
        ? sourceBoq.originalDescription.trim()
        : null;
      const boqDescription = (rawBoqDesc && rawBoqDesc.trim() !== '') ? rawBoqDesc.trim() : null;

      return {
        id: rfqLine.id,
        lineNumber: rfqLine.lineNumber,
        itemCode,
        description: rfqLine.description,
        itemDescription,
        boqDescription,
        fullBoqDescription: sourceBoq?.originalDescription || null,
        specification: rfqLine.specification || sourceBoq?.specification || null,
        category: (sourceBoq as any)?.category?.name || rfqLine.category || 'General',
        subcategory: (sourceBoq as any)?.subcategory?.name || rfqLine.subcategory || null,
        location: (sourceBoq as any)?.location || null,
        drawingReference: (sourceBoq as any)?.drawingReference || null,
        brand: (sourceBoq as any)?.brand || null,
        model: (sourceBoq as any)?.model || null,
        material: (sourceBoq as any)?.material || null,
        grade: (sourceBoq as any)?.grade || null,
        remarks: (sourceBoq as any)?.remarks || null,
        uom: rfqLine.uom,
        quantity: rfqLine.quantity,
        aiUnitCost: aiCost,
        aiTotalCost: aiTotal,
        aiCostStatus: aiCost !== null ? 'AVAILABLE' : 'NOT_AVAILABLE',
        aiCostSource: aiSource,
        aiCostDate: aiDate,
        historicalPpoRate: histPpo?.rate || null,
        historicalPpoNumber: histPpo?.ppoNumber || null,
        historicalPpoVendor: histPpo?.vendor || null,
        historicalPpoDate: histPpo?.date || null,
        rateCardRate: rcItem?.rate || null,
        rateCardNumber: rcItem?.rateCardNumber || null,
        rateCardVendor: rcItem?.vendorName || null,
        rateCardValidity: rcItem?.validTo || null,
        vendorQuotes,
        lowestCompliantVendorId: lowestRate !== Infinity ? lowestVendorId : null,
        lowestCompliantVendorName: lowestRate !== Infinity ? lowestVendorName : '—',
        lowestRate: lowestRate === Infinity ? 0 : lowestRate,
        lowestLineTotal: lowestRate === Infinity ? 0 : lowestRate * rfqLine.quantity,
        varianceVsAi,
        variancePercent: Math.round(variancePercent * 10) / 10,
        commercialStatus: varianceVsAi >= 0 ? 'FAVORABLE' : 'UNFAVORABLE',
      };
    });

    // 6. Package-level comparison & dynamic rankings with tie handling
    const comparableVendors = vendors.filter((v) => v.isComplete && v.totalQuoteAmount > 0);
    const nonComparableVendors = vendors.filter((v) => !v.isComplete || v.totalQuoteAmount <= 0);

    comparableVendors.sort((a, b) => a.totalQuoteAmount - b.totalQuoteAmount);

    // Dynamic ranking with proper tie handling (e.g. 1, 1, 3)
    let currentRank = 1;
    const rankedComparableVendors = comparableVendors.map((v, idx) => {
      if (idx > 0 && v.totalQuoteAmount > comparableVendors[idx - 1].totalQuoteAmount) {
        currentRank = idx + 1;
      }
      return {
        ...v,
        rank: currentRank,
        rankLabel: `L${currentRank}`,
        isRankable: true,
      };
    });

    const unrankedVendors = nonComparableVendors.map((v) => ({
      ...v,
      rank: null,
      rankLabel: 'Partially Quoted / Incomplete',
      isRankable: false,
    }));

    const allRankedVendors = [...rankedComparableVendors, ...unrankedVendors];
    const lowestQuote = rankedComparableVendors[0] || null;
    const lowestQuoteTotal = lowestQuote ? lowestQuote.totalQuoteAmount : 0;
    const benchmarkTotal = totalAiBenchmark > 0 ? totalAiBenchmark : (rfq.estimatedBenchmarkValue || 0);
    const totalSavings = benchmarkTotal - lowestQuoteTotal;
    const savingsPercent = benchmarkTotal > 0 ? (totalSavings / benchmarkTotal) * 100 : 0;

    // Check if active negotiation exists for this RFQ
    const activeNegotiation = rfq.negotiations.find((n) => n.status === 'ACTIVE') || rfq.negotiations[0] || null;

    // Auto-transition RFQ to COMPARISON status if still open
    if (rfq.status === 'VENDOR_RESPONSE_OPEN' || rfq.status === 'RELEASED') {
      await prisma.rfq.update({
        where: { id },
        data: { status: 'COMPARISON' },
      });
    }

    // Audit comparison action
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'RFQ',
      entityId: rfq.id,
      action: 'QUOTE_COMPARED',
      description: `Evaluated ${evaluatedQuotes.length} vendor quotes for RFQ ${rfq.rfqNumber}. L1: ${lowestQuote?.vendorName || 'None'} (₹ ${lowestQuoteTotal.toLocaleString()})`,
    });

    return apiSuccess({
      rfq: {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        title: rfq.title,
        status: rfq.status,
        project: rfq.project,
        boqRevision: rfq.boqRevision,
        pr: rfq.pr,
        submissionDeadline: rfq.submissionDeadline,
        commercialValidityDays: rfq.commercialValidityDays,
        paymentTerms: rfq.paymentTerms,
        deliveryRequirement: rfq.deliveryRequirement,
      },
      vendors: allRankedVendors,
      lines: lineComparison,
      activeNegotiation,
      awards: rfq.awards,
      summary: {
        packageTotal: benchmarkTotal,
        benchmarkTotal,
        lowestQuoteTotal,
        lowestVendor: lowestQuote ? lowestQuote.vendorName : '—',
        lowestVendorId: lowestQuote ? lowestQuote.vendorId : null,
        savings: totalSavings,
        savingsPercent: Math.round(savingsPercent * 100) / 100,
        isFavorable: totalSavings >= 0,
        hasApprovedRateCards: approvedRateCards.length > 0,
        approvedRateCardsCount: approvedRateCards.length,
      },
    });
  } catch (error: any) {
    console.error('Error generating quote comparison:', error);
    return apiError(error.message || 'Failed to compare quotes', 500);
  }
}
