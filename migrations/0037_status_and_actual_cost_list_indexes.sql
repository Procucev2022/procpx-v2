-- Additive indexes for tenant-wide status filters and the newest-first actual cost list.
-- Without them, D1 scans every row of the tenant for these lists as the data grows.
-- These indexes do not modify or remove application rows.
CREATE INDEX IF NOT EXISTS "procurement_requests_tenantId_status_idx"
  ON "procurement_requests" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "rfqs_tenantId_status_idx"
  ON "rfqs" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "boqs_tenantId_status_idx"
  ON "boqs" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "actual_cost_transactions_tenantId_actualDate_id_idx"
  ON "actual_cost_transactions" ("tenantId", "actualDate", "id");
