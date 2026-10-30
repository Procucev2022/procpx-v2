/* Shared declarations for lib/procurement-demo-data.ts. */

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
