export const CATEGORY_PREVIEW_LIMIT = 8;

export const CATEGORY_PREVIEW_SOURCES = {
  budgetContributions: { table: 'budget_transactions', entityColumn: 'contributionId' },
  purchaseRequests: { table: 'pr_lines', entityColumn: 'prId' },
} as const;
