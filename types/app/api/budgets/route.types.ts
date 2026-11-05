export type BudgetProjectAggregate = {
  approvedBudget: number | bigint | null;
  pendingBudget: number | bigint | null;
  actualAmount: number | bigint | null;
  costCentreActualsJson?: string | Record<string, number> | null;
};
