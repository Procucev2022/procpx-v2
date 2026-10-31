/* Shared declarations for lib/rate-card-utils.ts. */

// src/lib/rate-card-utils.ts
// Utility functions for Rate Card Multi-Round Negotiation & Enterprise Workflow

export interface ParsedRateCardItemMeta {
  buyerOffer1: number | null;
  vendorQuote1: number | null;
  buyerOffer2: number | null;
  vendorQuote2: number | null;
  finalAgreedRate: number | null;
  previousPpoRate: number | null;
  referenceQty: number;
  remarks: string;
  status: string;
  isExcluded?: boolean;
  exclusionReason?: string;
}

export interface RateCardNegotiationMeta {
  currentRound: number; // 1, 2, 3, etc.
  workflowStage?: string;
  round1?: {
    buyerOffer1Date?: string;
    buyerOffer1Actor?: string;
    buyerOffer1Remarks?: string;
    vendorQuote1Date?: string;
    vendorQuote1Actor?: string;
    vendorQuote1Remarks?: string;
  };
  round2?: {
    buyerOffer2Date?: string;
    buyerOffer2Actor?: string;
    buyerOffer2Remarks?: string;
    vendorQuote2Date?: string;
    vendorQuote2Actor?: string;
    vendorQuote2Remarks?: string;
  };
  round3?: {
    buyerOffer3Date?: string;
    buyerOffer3Actor?: string;
    buyerOffer3Remarks?: string;
    vendorQuote3Date?: string;
    vendorQuote3Actor?: string;
    vendorQuote3Remarks?: string;
  };
  acceptedFinalOffer?: {
    roundNumber: number;
    acceptedBy: string;
    acceptedAt: string;
    remarks?: string;
    totalAgreedValue: number;
    terms?: string;
  };
  categoryManagerAccepted?: {
    actor: string;
    timestamp: string;
    remarks?: string;
  };
  vendorAccepted?: {
    actor: string;
    timestamp: string;
    remarks?: string;
  };
  categoryManagerSignedOff?: {
    actor: string;
    timestamp: string;
    remarks?: string;
  };
  history?: Array<{
    stage: string;
    actor: string;
    role: string;
    timestamp: string;
    remarks?: string;
    snapshotSummary?: string;
  }>;
}
