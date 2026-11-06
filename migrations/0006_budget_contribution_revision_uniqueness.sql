-- One budget contribution workflow belongs to a BOQ revision within a tenant.
-- Pre-migration review found no duplicate tenant/revision pairs; no rows change.
CREATE UNIQUE INDEX IF NOT EXISTS "budget_contributions_tenantId_boqRevisionId_key"
  ON "budget_contributions" ("tenantId", "boqRevisionId");
