export type ApprovedPrSummary = {
  id: string;
  prNumber: string;
  title: string | null;
  status: string;
  totalEstimatedValue: number | null;
  releasedAt: Date | null;
  project: { id: string; projectCode: string; name: string; city: string | null } | null;
  costCentre: { id: string; code: string; name: string } | null;
  lineCount: number;
  rfqCount: number;
};
