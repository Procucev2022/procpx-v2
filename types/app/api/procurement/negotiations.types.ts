export type NegotiationDispatchLatestQuoteRow = {
  vendorId: string;
  quoteVersion: number;
  totalQuoteAmount: number;
};

export type NegotiationDispatchRoundSummaryRow = {
  vendorId: string;
  latestRoundNumber: number | null;
  activeBuyerOfferCount: number;
  pendingRoundId: string | null;
  pendingRoundNumber: number | null;
  pendingCounterOfferAmount: number | null;
  pendingNotes: string | null;
  duplicateRoundId: string | null;
  duplicateRoundNumber: number | null;
  duplicateDeadline: string | Date | null;
  duplicateTargetPrice: number | null;
  duplicatePreviousQuoteAmount: number | null;
  duplicateCounterOfferAmount: number | null;
  duplicateRevisedQuoteAmount: number | null;
  duplicateSavingsAmount: number | null;
  duplicateSavingsPercent: number | null;
  duplicateStatus: string | null;
  duplicateNotes: string | null;
  duplicateIsFinalOffer: boolean | number | null;
  duplicateBuyerDecision: string | null;
  duplicateBuyerDecisionDate: string | Date | null;
  duplicateBuyerDecisionRemarks: string | null;
  duplicateNextResponsibleParty: string | null;
  duplicateLineItemsJson: string | null;
  duplicateSubmittedByVendor: string | null;
  duplicateCreatedAt: string | Date | null;
  duplicateUpdatedAt: string | Date | null;
};
