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

export type RfqLatestCompareQuoteLineRow = {
  quoteId: string;
  id: string;
  rfqLineId: string;
  unitRate: number;
  lineTotal: number;
  discountPercent: number;
  taxPercent: number;
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
