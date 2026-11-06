CREATE INDEX IF NOT EXISTS "rate_card_approvals_tenant_card_timestamp_idx"
ON "rate_card_approvals" ("tenantId", "rateCardId", "timestamp", "id");
