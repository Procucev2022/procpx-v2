CREATE INDEX IF NOT EXISTS "ppo_vendor_ratings_tenant_status_vendor_idx"
ON "ppo_vendor_ratings" ("tenantId", "status", "vendorId");

CREATE INDEX IF NOT EXISTS "ppo_vendor_ratings_vendor_status_idx"
ON "ppo_vendor_ratings" ("vendorId", "status");
