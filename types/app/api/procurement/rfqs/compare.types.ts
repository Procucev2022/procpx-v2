export type RfqCompareRateCardRow = {
  description: string;
  rate: number;
  rateCardNumber: string;
  version: number;
  status: string;
  validFrom: string | Date;
  validTo: string | Date;
  vendorId: string;
  vendorName: string;
};

export type RfqLatestCompareQuoteRow = {
  quoteId: string;
  vendorId: string;
  quoteNumber: string;
  quoteVersion: number;
  versionCount: number;
  totalQuoteAmount: number;
  submittedAt: string | Date;
  status: string;
  commercialTerms: string | null;
  paymentTermsOffered: string | null;
  deliveryLeadTimeDays: number | null;
  vendorName: string | null;
  vendorCode: string | null;
  vendorType: string | null;
  qualificationStatus: string | null;
  complianceStatus: string | null;
  performanceScore: number | null;
  quoteLineId: string | null;
  rfqLineId: string | null;
  unitRate: number | null;
  lineTotal: number | null;
  discountPercent: number | null;
  taxPercent: number | null;
};

export type RfqLatestCompareNegotiationRoundRow = {
  vendorId: string;
  roundNumber: number;
  lineItemsJson: string | null;
  counterOfferAmount: number | null;
  revisedQuoteAmount: number | null;
  status: string;
  nextResponsibleParty: string | null;
  buyerDecision: string | null;
  totalRoundCount: number | bigint;
  activeBuyerOfferCount: number | bigint;
  submittedRoundId: string | null;
  submittedRoundNumber: number | null;
  submittedRevisedQuoteAmount: number | null;
  submittedStatus: string | null;
  submittedNextResponsibleParty: string | null;
  submittedBuyerDecision: string | null;
  pendingRoundId: string | null;
  pendingRoundNumber: number | null;
  pendingCounterOfferAmount: number | null;
  pendingRevisedQuoteAmount: number | null;
  pendingStatus: string | null;
  pendingNextResponsibleParty: string | null;
  pendingBuyerDecision: string | null;
};

export type RfqCompareNegotiationSummary = {
  vendorId: string;
  totalRoundCount: number;
  activeBuyerOfferCount: number;
  submittedRevisionRound: {
    id: string;
    roundNumber: number;
    revisedQuoteAmount: number;
    status: string;
    nextResponsibleParty: string | null;
    buyerDecision: string | null;
  } | null;
  pendingBuyerOffer: {
    id: string;
    roundNumber: number;
    counterOfferAmount: number | null;
    revisedQuoteAmount: number | null;
    status: string;
    nextResponsibleParty: string | null;
    buyerDecision: string | null;
  } | null;
};
