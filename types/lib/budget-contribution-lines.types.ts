export type BudgetContributionLineAggregateRow = {
  categoryName?: string | null;
  categoryAmount?: number | bigint | null;
  categoryQuantity?: number | bigint | null;
  firstLineId?: string | null;
  totalLines?: number | bigint | null;
  missingQuantityLines?: number | bigint | null;
  invalidCostLines?: number | bigint | null;
  totalEstimated?: number | bigint | null;
};

export type BudgetContributionCategoryAggregate = {
  categoryName: string;
  amount: number;
  quantity: number;
  firstLineId: string | null;
};

export type BudgetContributionLineAggregate = {
  totalLines: number;
  missingQuantityLines: number;
  invalidCostLines: number;
  totalEstimated: number;
  categories: BudgetContributionCategoryAggregate[];
};
