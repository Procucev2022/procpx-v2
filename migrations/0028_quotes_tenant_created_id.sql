CREATE INDEX IF NOT EXISTS "quotes_tenant_created_id_idx"
ON "quotes" ("tenantId", "createdAt", "id");
