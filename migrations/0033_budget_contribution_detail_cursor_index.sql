CREATE INDEX IF NOT EXISTS budget_transactions_contribution_category_cursor_idx
ON budget_transactions (tenantId, contributionId, category, id);
