export interface BudgetContributionTransactionCursor {
  category: string;
  id: string;
}

export type BudgetContributionDetailSection = 'lines' | 'transactions';

export interface BudgetContributionDetailPage<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface BudgetContributionDetailRouteContext {
  params: Promise<{ id: string }>;
}
