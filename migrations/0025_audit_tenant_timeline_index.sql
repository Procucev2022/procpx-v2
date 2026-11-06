CREATE INDEX IF NOT EXISTS "audit_logs_tenant_created_idx"
  ON "audit_logs" ("tenantId", "createdAt", "id");
