CREATE INDEX IF NOT EXISTS "ppos_tenant_vendor_created_idx"
ON "ppos" ("tenantId", "vendorId", "createdAt");
