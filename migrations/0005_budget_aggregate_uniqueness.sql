-- A cost-centre budget is an aggregate row. Preserve multiple project-level
-- budgets with NULL costCentreId while preventing duplicate cost-centre rows.
-- Pre-migration review found no duplicate non-null tenant/cost-centre pairs.
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_tenantId_costCentreId_key"
  ON "budgets" ("tenantId", "costCentreId");

CREATE INDEX IF NOT EXISTS "budget_contributions_tenantId_status_idx"
  ON "budget_contributions" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "budget_transactions_tenantId_contributionId_idx"
  ON "budget_transactions" ("tenantId", "contributionId");
