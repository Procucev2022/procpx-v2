CREATE INDEX IF NOT EXISTS "vendor_rate_card_items_tenant_card_idx"
ON "vendor_rate_card_items" ("tenantId", "rateCardId");
