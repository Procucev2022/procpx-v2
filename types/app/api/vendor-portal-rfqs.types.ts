export type NegotiationQuoteLineSnapshot = {
  rfqLineId?: string;
  id?: string;
  description?: string;
  uom?: string;
  quantity?: number;
  counterRate?: number | null;
};

export type VendorPortalRfqSummary = {
  id: string;
  rfqNumber?: string;
};
