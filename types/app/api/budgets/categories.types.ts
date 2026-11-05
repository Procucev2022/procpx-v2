export type BudgetCategoryAggregateRow = {
  category: string | null;
  approvedBudget: number | bigint | null;
  pendingBudget: number | bigint | null;
  actual: number | bigint | null;
  txCount: number | bigint | null;
  hasApproved: number | bigint | null;
  hasUnderApproval: number | bigint | null;
  hasProjectPending: number | bigint | null;
  hasRejected: number | bigint | null;
  hasDraft: number | bigint | null;
  budgetStatus: string | null;
  total: number | bigint | null;
};

export type BudgetCategory = {
  category: string;
  budget: number;
  approvedBudget: number;
  pendingBudget: number;
  actual: number;
  balance: number;
  ratePerSqFt: number | null;
  actualRatePerSqFt: number | null;
  balanceRatePerSqFt: number | null;
  status: string;
  txCount: number;
};

export type BudgetCategoryPagination = {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type BudgetCategoriesResponse = {
  categories: BudgetCategory[];
  categoryPagination: BudgetCategoryPagination;
};

export type BudgetCategoryWorkspaceState = BudgetCategoriesResponse & {
  key: string;
  loading: boolean;
  error: boolean;
};
