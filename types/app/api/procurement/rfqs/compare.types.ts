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
};
