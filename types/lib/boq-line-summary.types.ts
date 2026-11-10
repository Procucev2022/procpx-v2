export type BoqLineSummary = {
  totalLines: number;
  validQuantityLines: number;
  missingQuantityLines: number;
  missingRateLines: number;
  validationErrorLines: number;
  estimatedLineCount: number;
  totalAiEstimate: number;
  categoryTotals: Record<'Material' | 'Electrical' | 'Civil' | 'Interior' | 'Other', number>;
};

export type BoqLineSummaryQueryRow = {
  totalLines?: number | bigint | null;
  validQuantityLines?: number | bigint | null;
  missingQuantityLines?: number | bigint | null;
  missingRateLines?: number | bigint | null;
  validationErrorLines?: number | bigint | null;
  estimatedLineCount?: number | bigint | null;
  totalAiEstimate?: number | bigint | null;
  materialTotal?: number | bigint | null;
  electricalTotal?: number | bigint | null;
  civilTotal?: number | bigint | null;
  interiorTotal?: number | bigint | null;
  otherTotal?: number | bigint | null;
};
