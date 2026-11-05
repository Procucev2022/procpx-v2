-- Cover tenant/project/cost-centre budget summaries and ordered ledger pages.
-- These indexes do not modify or remove application rows.
CREATE INDEX IF NOT EXISTS budget_contributions_project_status_summary_idx
  ON budget_contributions (tenantId, projectId, costCentreId, status);

CREATE INDEX IF NOT EXISTS budget_transactions_project_status_category_summary_idx
  ON budget_transactions (tenantId, projectId, costCentreId, status, category);

CREATE INDEX IF NOT EXISTS budget_transactions_tenant_date_ledger_idx
  ON budget_transactions (tenantId, budgetDate, id);

CREATE INDEX IF NOT EXISTS actual_cost_transactions_project_status_category_summary_idx
  ON actual_cost_transactions (tenantId, projectId, costCentreId, status, category);
