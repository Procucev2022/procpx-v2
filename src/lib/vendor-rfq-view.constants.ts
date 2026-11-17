/** Buyer-only RFQ fields that must never be returned to a vendor. */
export const VENDOR_HIDDEN_RFQ_FIELDS = ['estimatedBenchmarkValue'] as const;

/** Buyer reference prices on RFQ lines. Vendors price their own quotes without seeing them. */
export const VENDOR_HIDDEN_RFQ_LINE_FIELDS = ['benchmarkRate', 'benchmarkAmount'] as const;

/** Lowest amount across every vendor's offers. It reveals competitors' pricing to a vendor. */
export const VENDOR_HIDDEN_NEGOTIATION_FIELDS = ['bestQuoteAmount'] as const;
