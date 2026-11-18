import { BUDGET_TRANSACTION_SUPERSEDED_STATUS } from './budget-transaction-status.constants';

export const CATEGORY_PREVIEW_LIMIT = 8;

export const CATEGORY_PREVIEW_SOURCES = {
  budgetContributions: {
    table: 'budget_transactions',
    entityColumn: 'contributionId',
    excludedStatus: BUDGET_TRANSACTION_SUPERSEDED_STATUS,
  },
  purchaseRequests: { table: 'pr_lines', entityColumn: 'prId', excludedStatus: null },
} as const;
