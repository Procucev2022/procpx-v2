CREATE INDEX IF NOT EXISTS "rfq_vendors_tenant_rfq_invited_order_idx"
ON "rfq_vendors" ("tenantId", "rfqId", "invitedAt", "id");
