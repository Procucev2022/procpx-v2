import type { DemoRfqState } from "@app-types/lib/procurement-demo-data.types";
export type { DemoRfqState };
import { DEMO_SCOPE_LINES, DEMO_VENDORS, DEMO_QUOTES_DATA } from "./procurement-demo-data.constants";
export { DEMO_SCOPE_LINES, DEMO_VENDORS, DEMO_QUOTES_DATA };


// Helpers to build parts of the Demo RFQ State
export function buildDemoQuotes() {
  return DEMO_QUOTES_DATA.map((qd) => ({
    id: `quote-${qd.vendorId}`,
    quoteNumber: qd.quoteNumber,
    quoteVersion: qd.quoteVersion,
    vendorId: qd.vendorId,
    totalQuoteAmount: qd.totalQuoteAmount,
    status: 'SUBMITTED',
    commercialTerms: qd.commercialTerms,
    deliveryLeadTimeDays: qd.deliveryDays,
    validityDays: qd.validityDays,
    paymentTerms: qd.paymentTerms,
    warranty: qd.warranty,
    freightTerms: qd.freightTerms,
    submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    lines: qd.rates.map((r, idx) => ({
      id: `ql-${qd.vendorId}-${idx}`,
      rfqLineId: r.rfqLineId,
      unitRate: r.rate,
      lineTotal: r.total,
      taxPercent: 18,
    })),
  }));
}

export function buildDemoNegotiations() {
  return [
    {
      id: 'neg-demo-001',
      vendorId: 'v-demo-001',
      status: 'ACTIVE',
      currentRound: 1,
      targetSavingsPercent: 4.5,
      bestQuoteAmount: 880000,
      rounds: [
        {
          id: 'round-1',
          roundNumber: 1,
          vendorId: 'v-demo-001',
          vendorName: 'Acme Infra Solutions Pvt Ltd',
          previousQuoteAmount: 880000,
          counterOfferAmount: 840000,
          revisedQuoteAmount: 850000,
          savingsAmount: 30000,
          savingsPercent: 3.41,
          status: 'REVISED_SUBMITTED',
          deadline: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
          notes: 'Counter-offer sent seeking 4.5% volume discount for consolidated CC45 retail package. Vendor responded with revised offer of ₹8,50,000.',
          timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
        },
      ],
    },
  ];
}

export function buildDemoAwards() {
  return [
    {
      id: 'award-demo-001',
      recommendedVendorId: 'v-demo-001',
      recommendedVendor: {
        id: 'v-demo-001',
        name: 'Acme Infra Solutions Pvt Ltd',
        code: 'VEND-ACME-01',
      },
      finalNegotiatedAmount: 850000,
      status: 'PENDING_APPROVAL',
      justification: 'Recommended L1 lowest compliant offer after Round 1 negotiation. Vendor successfully conceded ₹30,000 discount (3.41% savings). Full technical compliance across all 8 scope items.',
      isNonL1Exception: false,
    },
  ];
}

// Helper to construct Initial Demo RFQ State
// If startWithZeroQuotes is true, quotes start empty to demonstrate receipt/recording
export function getInitialDemoRfq(startWithZeroQuotes: boolean = true): DemoRfqState {
  if (startWithZeroQuotes) {
    return {
      id: 'RFQ-DEMO-001',
      rfqNumber: 'RFQ-DEMO-001',
      title: 'Civil Finishing & Interior Fitout Package',
      packageName: 'Kundanahalli Retail Store — CC45 Fitout',
      prNumber: 'PR-DEMO-001',
      prId: 'PR-DEMO-001',
      costCentre: 'CC45 - Civil & Interior Fitout',
      status: 'VENDOR_RESPONSE_OPEN',
      deliveryRequirement: 'Site delivery within 30 days to Kundanahalli, Bengaluru',
      paymentTerms: '30 days net from certified measurement invoice',
      submissionDeadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      project: {
        id: 'proj-knd-01',
        name: 'Kundanahalli Retail Project',
        projectCode: 'KND-RET-01',
        location: 'Kundanahalli Main Road',
        city: 'Bengaluru',
      },
      boqRevision: {
        revisionCode: 'BOQ-R1',
        boq: {
          title: 'Kundanahalli Retail Project BOQ',
          boqCode: 'BOQ-KND-001',
        },
      },
      lines: DEMO_SCOPE_LINES,
      invitedVendors: DEMO_VENDORS.map((v) => ({
        id: `iv-${v.id}`,
        vendorId: v.id,
        invitationStatus: 'INVITED',
        submissionStatus: 'PENDING',
        vendor: v,
      })),
      quotes: [],
      negotiations: [],
      awards: [],
      ppos: [],
    };
  }

  return {
    id: 'RFQ-DEMO-001',
    rfqNumber: 'RFQ-DEMO-001',
    title: 'Civil Finishing & Interior Fitout Package',
    packageName: 'Kundanahalli Retail Store — CC45 Fitout',
    prNumber: 'PR-DEMO-001',
    prId: 'PR-DEMO-001',
    costCentre: 'CC45 - Civil & Interior Fitout',
    status: 'NEGOTIATION',
    deliveryRequirement: 'Site delivery within 30 days to Kundanahalli, Bengaluru',
    paymentTerms: '30 days net from certified measurement invoice',
    submissionDeadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    project: {
      id: 'proj-knd-01',
      name: 'Kundanahalli Retail Project',
      projectCode: 'KND-RET-01',
      location: 'Kundanahalli Main Road',
      city: 'Bengaluru',
    },
    boqRevision: {
      revisionCode: 'BOQ-R1',
      boq: {
        title: 'Kundanahalli Retail Project BOQ',
        boqCode: 'BOQ-KND-001',
      },
    },
    lines: DEMO_SCOPE_LINES,
    invitedVendors: DEMO_VENDORS.map((v) => ({
      id: `iv-${v.id}`,
      vendorId: v.id,
      invitationStatus: 'SUBMITTED',
      submissionStatus: 'SUBMITTED',
      vendor: v,
    })),
    quotes: buildDemoQuotes(),
    negotiations: buildDemoNegotiations(),
    awards: buildDemoAwards(),
    ppos: [],
  };
}

// Generate Quote Comparison Matrix for the Demo
export function getDemoComparison(currentRfq: DemoRfqState) {
  // Total AI Benchmark
  const totalBenchmark = currentRfq.lines.reduce((acc, l) => acc + l.benchmarkAmount, 0);

  // Sort vendors by amount to identify L1
  const sortedVendors = currentRfq.invitedVendors.map((iv) => {
    const q = currentRfq.quotes.find((quote) => quote.vendorId === iv.vendorId);
    // If negotiated, Acme uses revised 8,50,000
    const hasNegotiatedRev = currentRfq.negotiations?.[0]?.rounds?.[0]?.revisedQuoteAmount;
    const finalAmt = (iv.vendorId === 'v-demo-001' && hasNegotiatedRev) ? hasNegotiatedRev : (q?.totalQuoteAmount || 0);

    const savingsVsAi = finalAmt > 0 ? totalBenchmark - finalAmt : 0;
    const savingsPct = finalAmt > 0 ? (((totalBenchmark - finalAmt) / totalBenchmark) * 100).toFixed(1) : '0.0';

    return {
      vendorId: iv.vendorId,
      vendorName: iv.vendor.name,
      vendorCode: iv.vendor.code,
      totalAmount: finalAmt,
      totalQuoteAmount: finalAmt,
      originalQuoteAmount: q?.totalQuoteAmount || 0,
      quoteNumber: q?.quoteNumber || '—',
      quoteVersion: q?.quoteVersion || 1,
      completenessPercent: q ? 100 : 0,
      hasSubmitted: !!q,
      rating: iv.vendor.performanceRating,
      grade: iv.vendor.grade,
      paymentTerms: q?.paymentTerms || 'Net 30 days',
      deliveryDays: q?.deliveryLeadTimeDays || 30,
      warranty: q?.warranty || '12 Months',
      savingsVsAi,
      savingsPercent: savingsPct,
    };
  }).sort((a, b) => (a.totalAmount || 9999999) - (b.totalAmount || 9999999));

  const hasAnyQuotes = currentRfq.quotes.length > 0;

  const rankedVendors = sortedVendors.map((v, idx) => ({
    ...v,
    rank: v.hasSubmitted ? idx + 1 : null,
    isL1: hasAnyQuotes && v.hasSubmitted && idx === 0,
    isLowestCompliant: hasAnyQuotes && v.hasSubmitted && idx === 0,
  }));

  const l1Vendor = hasAnyQuotes ? rankedVendors.find((v) => v.hasSubmitted) : null;

  // Line by line matrix
  const tableLines = currentRfq.lines.map((l) => {
    const vendorQuotes: Record<string, any> = {};
    const vendorRates: Record<string, any> = {};

    let lowestRate = Infinity;
    let lowestCompliantVendorId = '';

    currentRfq.invitedVendors.forEach((iv) => {
      const q = currentRfq.quotes.find((quote) => quote.vendorId === iv.vendorId);
      const qLine = q?.lines.find((line) => line.rfqLineId === l.id);

      if (qLine && qLine.unitRate > 0) {
        vendorQuotes[iv.vendorId] = {
          quoted: true,
          rate: qLine.unitRate,
          amount: qLine.lineTotal || qLine.unitRate * l.quantity,
        };
        vendorRates[iv.vendorId] = {
          rate: qLine.unitRate,
          total: qLine.lineTotal || qLine.unitRate * l.quantity,
          isLowest: false,
        };
        if (qLine.unitRate < lowestRate) {
          lowestRate = qLine.unitRate;
          lowestCompliantVendorId = iv.vendorId;
        }
      } else {
        vendorQuotes[iv.vendorId] = {
          quoted: false,
          rate: 0,
          amount: 0,
        };
        vendorRates[iv.vendorId] = {
          rate: null,
          total: null,
          isLowest: false,
        };
      }
    });

    if (lowestRate !== Infinity) {
      Object.keys(vendorRates).forEach((vid) => {
        if (vendorRates[vid].rate === lowestRate) {
          vendorRates[vid].isLowest = true;
        }
      });
    }

    const effectiveLowest = lowestRate !== Infinity ? lowestRate : 0;
    const varianceVsAi = effectiveLowest > 0 ? l.benchmarkRate - effectiveLowest : 0;
    const variancePercent = effectiveLowest > 0 ? (((l.benchmarkRate - effectiveLowest) / l.benchmarkRate) * 100).toFixed(1) : '0.0';

    return {
      id: l.id,
      rfqLineId: l.id,
      lineNumber: l.lineNumber,
      itemCode: l.itemCode,
      description: l.description,
      specification: l.specification,
      uom: l.uom,
      quantity: l.quantity,
      aiUnitCost: l.benchmarkRate,
      aiTotalCost: l.benchmarkAmount,
      benchmarkRate: l.benchmarkRate,
      benchmarkAmount: l.benchmarkAmount,
      historicalPpoRate: Math.round(l.benchmarkRate * 0.95),
      historicalPpoNumber: 'PPO-2025-0042',
      historicalPpoDate: 'Dec 2025',
      rateCardRate: l.rateCardRate,
      rateCardNumber: 'VRC-2026-000001',
      rateCardVendor: l.rateCardVendor,
      vendorQuotes,
      vendorRates,
      lowestCompliantVendorId,
      lowestRate: effectiveLowest,
      varianceVsAi,
      variancePercent,
    };
  });

  const l1Total = l1Vendor?.totalAmount || 0;
  const savingsVsBench = l1Total > 0 ? totalBenchmark - l1Total : 0;
  const savingsPct = l1Total > 0 ? (((totalBenchmark - l1Total) / totalBenchmark) * 100).toFixed(1) : '0.0';

  return {
    rfqNumber: currentRfq.rfqNumber,
    packageName: currentRfq.packageName,
    totalBenchmark,
    l1VendorId: l1Vendor?.vendorId || null,
    l1VendorName: l1Vendor?.vendorName || null,
    l1TotalAmount: l1Total || null,
    savingsVsBenchmark: savingsVsBench,
    savingsPercent: savingsPct,
    vendors: rankedVendors,
    lines: tableLines,
    matrixLines: tableLines,
    summary: {
      benchmarkTotal: totalBenchmark,
      totalVendorsInvited: currentRfq.invitedVendors.length,
      quotesSubmittedCount: currentRfq.quotes.length,
      lowestVendorId: l1Vendor?.vendorId || null,
      lowestVendorName: l1Vendor?.vendorName || null,
      lowestTotalAmount: l1Total || null,
    },
  };
}

// Generate Rate Card Sourcing Match Data for Demo
// Generate Rate Card Sourcing Match Data for Demo
export function getDemoRateCards() {
  return {
    rfqNumber: 'RFQ-DEMO-001',
    eligibleCount: 1,
    rfqScopeItemsCount: 8,
    rfqEstimatedBenchmark: 1133150,
    matchedRateCards: [
      {
        rateCardId: 'vrc-demo-001',
        rateCardNumber: 'VRC-2026-000001',
        title: 'Commercial Interior & Civil Fitouts (Kundanahalli Hub Master)',
        vendorName: 'Acme Infra Solutions Pvt Ltd',
        vendorCode: 'VEND-ACME-01',
        vendor: {
          name: 'Acme Infra Solutions Pvt Ltd',
          code: 'VEND-ACME-01',
          qualificationStatus: 'APPROVED / PRE-QUALIFIED',
          performanceScore: 96,
        },
        category: 'Civil & Interior',
        validity: {
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          isValidNow: true,
          status: 'APPROVED',
        },
        validFrom: '01 Jan 2026',
        validTo: '31 Dec 2026',
        itemCoverage: {
          matchedItemsCount: 8,
          totalRfqItemsCount: 8,
          coveragePercent: 100.0,
          isFullCoverage: true,
        },
        matchedItemsCount: 8,
        totalItemsCount: 8,
        coveragePercent: 100,
        rateCardTotalAmount: 855000,
        rateCardTotalValue: 855000,
        benchmarkTotalAmount: 1133150,
        historicalPpoAverage: 890000,
        savingsVsBenchmark: 278150,
        totalSavings: 278150,
        savingsPercent: 24.5,
        directPpoEligible: true,
        directPpoConditions: [
          'Pre-approved corporate master rate card with active governance validity.',
          'Complete 100% item coverage matching all 8 civil & interior fitout scope lines.',
          'Rate card total ₹8,55,000 sits 24.5% below baseline AI cost estimate.',
          'Direct PPO creation allowed by Commercial Governance without competitive RFQ auction.',
        ],
        lineMatches: DEMO_SCOPE_LINES.map((l) => ({
          itemCode: l.itemCode,
          description: l.description,
          uom: l.uom,
          quantity: l.quantity,
          aiEstimatedRate: l.benchmarkRate,
          historicalPpoRate: Math.round(l.benchmarkRate * 0.95),
          agreedRateCardRate: l.rateCardRate,
          lineTotal: l.rateCardRate * l.quantity,
          savingsVsAi: Math.round((l.benchmarkRate - l.rateCardRate) * l.quantity),
        })),
      },
    ],
  };
}
