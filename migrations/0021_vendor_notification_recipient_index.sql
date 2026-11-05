CREATE INDEX IF NOT EXISTS "users_tenant_vendor_role_status_id_idx"
ON "users" ("tenantId", "vendorId", "role", "status", "id");
