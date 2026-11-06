export interface RfqLineWrite {
  tenantId: string;
  projectId: string;
  costCentreId: string | null;
  boqId: string | null;
  boqRevisionId: string;
  boqLineId: string | null;
  prLineId: string | null;
  lineNumber: string;
  description: string;
  specification: string | null;
  category: string;
  subcategory: string | null;
  uom: string;
  quantity: number;
  benchmarkRate: number;
  benchmarkAmount: number;
}

export interface RfqLatestQuoteSummaryRow {
  quoteId: string;
  vendorId: string;
  quoteNumber: string;
  quoteVersion: number;
  versionCount: number | bigint;
  status: string;
  totalBaseAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalQuoteAmount: number;
  commercialTerms: string | null;
  paymentTermsOffered: string | null;
  deliveryLeadTimeDays: number | null;
  validUntil: Date | string | null;
  submittedAt: Date | string | null;
  createdAt: Date | string;
  vendorRecordId: string | null;
  vendorName: string | null;
  vendorCode: string | null;
  quoteLineId: string | null;
  rfqLineId: string | null;
  unitRate: number | null;
  taxPercent: number | null;
  discountPercent: number | null;
  lineTotal: number | null;
  lineRemarks: string | null;
}

export interface RfqDetailQuoteSummary {
  id: string;
  vendorId: string;
  quoteNumber: string;
  quoteVersion: number;
  versionCount: number;
  status: string;
  totalBaseAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalQuoteAmount: number;
  commercialTerms: string | null;
  paymentTermsOffered: string | null;
  deliveryLeadTimeDays: number | null;
  validUntil: Date | string | null;
  submittedAt: Date | string | null;
  createdAt: Date | string;
  vendor: { id: string; name: string; code: string } | null;
  lines: Array<{
    id: string;
    rfqLineId: string;
    unitRate: number;
    taxPercent: number;
    discountPercent: number;
    lineTotal: number;
    remarks: string | null;
  }>;
}
