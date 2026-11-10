import type { ApprovedBoqCategorySummary, ApprovedBoqLine, ApprovedBoqSummary } from '@app-types/app/api/procurement/approved-boqs.types';

export type RfqBaselineLine = ApprovedBoqLine & {
  boqLineId?: string;
  prLineId?: string;
};

export type RfqBaselineCategory = ApprovedBoqCategorySummary & {
  benchmarkSubtotal?: number;
};

export type RfqBaseline = Omit<ApprovedBoqSummary, 'categories' | 'lines'> & {
  categories: RfqBaselineCategory[];
  lines: RfqBaselineLine[];
  prId?: string;
  prNumber?: string;
  costCentreId?: string;
  totalBenchmarkAmount?: number;
};
