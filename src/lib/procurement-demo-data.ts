// src/lib/procurement-demo-data.ts
// Illustrative non-persistent demonstration dataset for proCPX Procurement Workspace
// Project: Kundanahalli Retail Project | Cost Centre: CC45 | PR: PR-DEMO-001 | RFQ: RFQ-DEMO-001

export interface DemoRfqState {
  id: string;
  rfqNumber: string;
  title: string;
  packageName: string;
  prNumber: string;
  prId: string;
  costCentre: string;
  status: string; // DRAFT | RELEASED | VENDOR_RESPONSE_OPEN | COMPARISON | NEGOTIATION | FINAL_RATE_LOCKED | AWARD_RECOMMENDED | APPROVED | AWARDED
  deliveryRequirement: string;
  paymentTerms: string;
  submissionDeadline: string;
  project: {
    id: string;
    name: string;
    projectCode: string;
    location: string;
    city: string;
  };
  boqRevision: {
    revisionCode: string;
    boq: {
      title: string;
      boqCode: string;
    };
  };
  lines: Array<{
    id: string;
    lineNumber: number;
    itemCode: string;
    description: string;
    specification: string;
    uom: string;
    quantity: number;
    benchmarkRate: number;
    benchmarkAmount: number;
    rateCardRate: number;
    rateCardVendor: string;
  }>;
  invitedVendors: Array<{
    id: string;
    vendorId: string;
    invitationStatus: string;
    submissionStatus: string;
    vendor: {
      id: string;
      code: string;
      name: string;
      vendorType: string;
      qualificationStatus: string;
      performanceRating: number;
      grade: string;
      contactPerson: string;
      phone: string;
      city: string;
      categories: string[];
    };
  }>;
  quotes: Array<{
    id: string;
    quoteNumber: string;
    quoteVersion: number;
    vendorId: string;
    totalQuoteAmount: number;
    status: string;
    commercialTerms: string;
    deliveryLeadTimeDays: number;
    validityDays: number;
    paymentTerms: string;
    warranty: string;
    freightTerms: string;
    submittedAt: string;
    lines: Array<{
      id: string;
      rfqLineId: string;
      unitRate: number;
      lineTotal: number;
      taxPercent: number;
      remarks?: string;
    }>;
  }>;
  negotiations: Array<{
    id: string;
    vendorId: string;
    status: string;
    currentRound: number;
    targetSavingsPercent: number;
    bestQuoteAmount: number;
    rounds: Array<{
      id: string;
      roundNumber: number;
      vendorId: string;
      vendorName: string;
      previousQuoteAmount: number;
      counterOfferAmount: number;
      revisedQuoteAmount: number;
      savingsAmount: number;
      savingsPercent: number;
      status: string;
      deadline: string;
      notes: string;
      timestamp: string;
      lineCounters?: Record<string, number>;
    }>;
  }>;
  awards: Array<{
    id: string;
    recommendedVendorId: string;
    recommendedVendor: {
      id: string;
      name: string;
      code: string;
    };
    finalNegotiatedAmount: number;
    status: string; // PENDING_APPROVAL | APPROVED | REJECTED
    justification: string;
    isNonL1Exception: boolean;
    approvedBy?: string;
    approvedAt?: string;
    approvalRemarks?: string;
  }>;
  ppos: Array<{
    id: string;
    ppoNumber: string;
    vendorId: string;
    vendor: {
      id: string;
      name: string;
    };
    totalValue: number;
    status: string; // DRAFT | ISSUED | CONFIRMED
    deliveryTerms: string;
    paymentTerms: string;
    issuedAt: string;
  }>;
}

// 8 Civil and Interior Scope Items for Kundanahalli Retail Project
export const DEMO_SCOPE_LINES = [
  {
    id: 'demo-line-1',
    lineNumber: 1,
    itemCode: 'CV-FLR-01',
    description: 'Vitrified Floor Tiling (600x600mm)',
    specification: '600x600mm Double Charged Vitrified Tiles (Somany / Kajaria or equivalent approved), laid with polymer-modified adhesive with 3mm spacers and epoxy grout finish.',
    uom: 'SQM',
    quantity: 450,
    benchmarkRate: 950,
    benchmarkAmount: 427500,
    rateCardRate: 920,
    rateCardVendor: 'Acme Infra Solutions',
  },
  {
    id: 'demo-line-2',
    lineNumber: 2,
    itemCode: 'INT-CLG-02',
    description: 'Gypsum False Ceiling (12.5mm Board)',
    specification: '12.5mm Saint-Gobain Gyproc board on GI framework, perimeter channels, intermediate channels with fastener fixings, flush tape & joint compound finish.',
    uom: 'SQM',
    quantity: 380,
    benchmarkRate: 380,
    benchmarkAmount: 144400,
    rateCardRate: 370,
    rateCardVendor: 'Acme Infra Solutions',
  },
  {
    id: 'demo-line-3',
    lineNumber: 3,
    itemCode: 'INT-GLS-03',
    description: '12mm Toughened Glass Partitions',
    specification: '12mm clear toughened architectural glass partitions with matte black anodized aluminum top & bottom profiles, patch fittings & frosted film banding.',
    uom: 'SQM',
    quantity: 65,
    benchmarkRate: 2400,
    benchmarkAmount: 156000,
    rateCardRate: 2350,
    rateCardVendor: 'Acme Infra Solutions',
  },
  {
    id: 'demo-line-4',
    lineNumber: 4,
    itemCode: 'CV-PNT-04',
    description: 'Premium Acrylic Emulsion Painting',
    specification: 'Asian Paints Royale Luxury Emulsion, 2 coats over 1 coat primer and 2 coats acrylic putty on prepared plastered and drywall surfaces.',
    uom: 'SQM',
    quantity: 850,
    benchmarkRate: 95,
    benchmarkAmount: 80750,
    rateCardRate: 90,
    rateCardVendor: 'Acme Infra Solutions',
  },
  {
    id: 'demo-line-5',
    lineNumber: 5,
    itemCode: 'INT-DOR-05',
    description: 'Commercial Grade Flush Doors (35mm Solid Core)',
    specification: '35mm solid core hardwood flush door with 1mm Merino high-pressure laminate on both faces, teakwood lipping, SS 304 ball-bearing hinges & mortise lever locks.',
    uom: 'NOS',
    quantity: 8,
    benchmarkRate: 8500,
    benchmarkAmount: 68000,
    rateCardRate: 8200,
    rateCardVendor: 'Acme Infra Solutions',
  },
  {
    id: 'demo-line-6',
    lineNumber: 6,
    itemCode: 'EL-CND-06',
    description: 'Concealed Electrical Conduiting & FRLS Wiring',
    specification: 'Heavy-duty 25mm PVC conduits embedded in walls/ceiling, Polycab FRLS copper wiring (2.5 sq mm / 4 sq mm), modular switch boxes & faceplates (Schneider Vivace).',
    uom: 'POINTS',
    quantity: 120,
    benchmarkRate: 650,
    benchmarkAmount: 78000,
    rateCardRate: 620,
    rateCardVendor: 'Acme Infra Solutions',
  },
  {
    id: 'demo-line-7',
    lineNumber: 7,
    itemCode: 'MEP-HVC-07',
    description: 'HVAC Supply & Return Ducting (GI 24 Gauge)',
    specification: 'Factory-fabricated GI sheet ducting 24 gauge Class 4, complete with acoustic lining, 13mm nitrile foam thermal insulation, volume control dampers & diffusers.',
    uom: 'SQM',
    quantity: 110,
    benchmarkRate: 850,
    benchmarkAmount: 93500,
    rateCardRate: 830,
    rateCardVendor: 'Acme Infra Solutions',
  },
  {
    id: 'demo-line-8',
    lineNumber: 8,
    itemCode: 'INT-FUR-08',
    description: 'Reception Counter & Wall Panelling (Bespoke)',
    specification: 'Custom L-shaped reception desk in 18mm BWR ply finished with natural oak veneer, solid surface counter slab, wire manager, cable conduits & LED cove backlighting.',
    uom: 'SET',
    quantity: 1,
    benchmarkRate: 85000,
    benchmarkAmount: 85000,
    rateCardRate: 80000,
    rateCardVendor: 'Acme Infra Solutions',
  },
];

// 3 Illustrative Qualified Vendors
export const DEMO_VENDORS = [
  {
    id: 'v-demo-001',
    vendorId: 'v-demo-001',
    code: 'VEND-ACME-01',
    name: 'Acme Infra Solutions Pvt Ltd',
    vendorType: 'CLIENT_VENDOR',
    qualificationStatus: 'APPROVED',
    performanceRating: 4.8,
    grade: 'Grade A',
    contactPerson: 'Rajesh Sharma (Commercial Lead)',
    phone: '+91 98450 12345',
    city: 'Bengaluru',
    categories: ['Civil & Interior', 'Flooring & Partitions', 'Turnkey Fitout'],
  },
  {
    id: 'v-demo-002',
    vendorId: 'v-demo-002',
    code: 'VEND-DECC-02',
    name: 'Deccan Interiors & Fitouts',
    vendorType: 'PROCUCEV_VENDOR',
    qualificationStatus: 'APPROVED',
    performanceRating: 4.6,
    grade: 'Grade A',
    contactPerson: 'Kavitha Reddy (Key Account Mgr)',
    phone: '+91 98860 67890',
    city: 'Bengaluru',
    categories: ['Interior & Fitout', 'False Ceiling', 'Custom Joinery'],
  },
  {
    id: 'v-demo-003',
    vendorId: 'v-demo-003',
    code: 'VEND-APEX-03',
    name: 'Apex Buildcon Solutions',
    vendorType: 'PROCUCEV_VENDOR',
    qualificationStatus: 'APPROVED',
    performanceRating: 4.3,
    grade: 'Grade B',
    contactPerson: 'Anand Kumar (Estimations)',
    phone: '+91 97400 54321',
    city: 'Bengaluru',
    categories: ['Civil & MEP', 'Finishes & Painting'],
  },
];

// Initial Quote Line Rates for the 3 Vendors
export const DEMO_QUOTES_DATA = [
  {
    vendorId: 'v-demo-001',
    vendorName: 'Acme Infra Solutions Pvt Ltd',
    quoteNumber: 'QTE-ACME-001',
    quoteVersion: 1,
    rates: [
      { rfqLineId: 'demo-line-1', rate: 735, total: 330750 },
      { rfqLineId: 'demo-line-2', rate: 295, total: 112100 },
      { rfqLineId: 'demo-line-3', rate: 1850, total: 120250 },
      { rfqLineId: 'demo-line-4', rate: 74, total: 62900 },
      { rfqLineId: 'demo-line-5', rate: 6600, total: 52800 },
      { rfqLineId: 'demo-line-6', rate: 505, total: 60600 },
      { rfqLineId: 'demo-line-7', rate: 660, total: 72600 },
      { rfqLineId: 'demo-line-8', rate: 68000, total: 68000 },
    ],
    totalQuoteAmount: 880000,
    commercialTerms: 'Payment: Net 30 days. Delivery: FOB Site within 25 days. Taxes: Extra 18% GST.',
    deliveryDays: 25,
    validityDays: 60,
    paymentTerms: 'Net 30 days from certified measurement invoice',
    warranty: '12 months defect liability period from handover',
    freightTerms: 'Included in quoted unit rates (Door Delivery)',
  },
  {
    vendorId: 'v-demo-002',
    vendorName: 'Deccan Interiors & Fitouts',
    quoteNumber: 'QTE-DECC-001',
    quoteVersion: 1,
    rates: [
      { rfqLineId: 'demo-line-1', rate: 750, total: 337500 },
      { rfqLineId: 'demo-line-2', rate: 300, total: 114000 },
      { rfqLineId: 'demo-line-3', rate: 1890, total: 122850 },
      { rfqLineId: 'demo-line-4', rate: 76, total: 64600 },
      { rfqLineId: 'demo-line-5', rate: 6700, total: 53600 },
      { rfqLineId: 'demo-line-6', rate: 515, total: 61800 },
      { rfqLineId: 'demo-line-7', rate: 670, total: 73700 },
      { rfqLineId: 'demo-line-8', rate: 66950, total: 66950 },
    ],
    totalQuoteAmount: 895000,
    commercialTerms: 'Payment: Net 30 days. Delivery: Site delivery within 30 days. Taxes: 18% GST.',
    deliveryDays: 30,
    validityDays: 45,
    paymentTerms: 'Net 30 days against progressive billing',
    warranty: '12 months standard warranty',
    freightTerms: 'Included in unit rates',
  },
  {
    vendorId: 'v-demo-003',
    vendorName: 'Apex Buildcon Solutions',
    quoteNumber: 'QTE-APEX-001',
    quoteVersion: 1,
    rates: [
      { rfqLineId: 'demo-line-1', rate: 775, total: 348750 },
      { rfqLineId: 'demo-line-2', rate: 310, total: 117800 },
      { rfqLineId: 'demo-line-3', rate: 1950, total: 126750 },
      { rfqLineId: 'demo-line-4', rate: 78, total: 66300 },
      { rfqLineId: 'demo-line-5', rate: 6900, total: 55200 },
      { rfqLineId: 'demo-line-6', rate: 530, total: 63600 },
      { rfqLineId: 'demo-line-7', rate: 690, total: 75900 },
      { rfqLineId: 'demo-line-8', rate: 65700, total: 65700 },
    ],
    totalQuoteAmount: 920000,
    commercialTerms: 'Payment: Net 45 days. Delivery: 35 days. Taxes: 18% GST extra.',
    deliveryDays: 35,
    validityDays: 30,
    paymentTerms: 'Net 45 days from engineer signoff',
    warranty: '12 months warranty on workmanship',
    freightTerms: 'Included up to Kundanahalli boundary',
  },
];

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
