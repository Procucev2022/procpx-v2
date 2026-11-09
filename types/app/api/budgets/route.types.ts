export type BudgetProjectAggregate = {
  approvedBudget: number | bigint | null;
  pendingBudget: number | bigint | null;
  actualAmount: number | bigint | null;
  costCentreActualsJson?: string | Record<string, number> | null;
};

export type BudgetContributionSummaryRow = {
  status: string;
  acceptedEstimatedValue: number;
  totalEstimatedValue: number;
};

export type BudgetTransactionSummaryRow = {
  status: string;
  amount: number;
  count: number;
};
