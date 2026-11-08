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

export type RfqCompareFallbackBoqLine = {
  id: string;
  lineNumber: string;
  itemCode: string | null;
  standardDescription: string | null;
  originalDescription: string;
  specification: string | null;
  category: { name: string } | null;
  subcategory: { name: string } | null;
  uom: { code: string } | null;
  costSource: string | null;
  costDate: Date | null;
  aiUnitCost: number | null;
  location: string | null;
  drawingReference: string | null;
  brand: string | null;
  model: string | null;
  material: string | null;
  grade: string | null;
  remarks: string | null;
};

export type RfqLatestCompareQuoteRow = {
  quoteId: string;
  vendorId: string;
  quoteNumber: string;
  quoteVersion: number;
  versionCount: number;
  quotedCount: number | bigint;
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

export type RfqCompareVendorSummary = {
  vendorId: string;
  quotedCount: number;
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

export type RfqCompareLine = {
  id: string;
  lineNumber: string | number;
  itemCode: string | null;
  itemDescription: string;
  boqDescription: string | null;
  fullBoqDescription?: string | null;
  specification?: string | null;
  category?: string | null;
  subcategory?: string | null;
  location?: string | null;
  drawingReference?: string | null;
  brand?: string | null;
  model?: string | null;
  material?: string | null;
  grade?: string | null;
  standard?: string | null;
  standardReference?: string | null;
  remarks?: string | null;
  aiUnitCost?: number | null;
  aiCostSource?: string | null;
  lowestCompliantVendorId?: string | null;
  vendorQuotes: Record<string, { quoted: boolean; rate: number; amount: number }>;
  boqLine?: {
    itemCode?: string | null;
    standardDescription?: string | null;
    originalDescription?: string | null;
    specification?: string | null;
    category?: { name?: string | null } | null;
    subcategory?: { name?: string | null } | null;
    location?: string | null;
    drawingReference?: string | null;
    brand?: string | null;
    model?: string | null;
    material?: string | null;
    grade?: string | null;
    standard?: string | null;
    standardReference?: string | null;
    remarks?: string | null;
    costSource?: string | null;
  } | null;
};
