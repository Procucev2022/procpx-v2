export type DashboardRecentBoqLineValueAggregate = {
  boqRevisionId: string;
  estimatedValue: number | bigint | string | null;
};

export type DashboardApprovedBoqLineAggregate = {
  boqRevisionId: string;
  lineCount: number | bigint | string;
  amount: number | bigint | string | null;
};
