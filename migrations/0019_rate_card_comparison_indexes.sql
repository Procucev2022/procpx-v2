CREATE INDEX "vendor_rate_cards_tenant_status_validity_idx"
  ON "vendor_rate_cards" ("tenantId", "status", "validFrom", "validTo");

CREATE INDEX "vendor_rate_card_items_tenant_active_card_idx"
  ON "vendor_rate_card_items" ("tenantId", "isActive", "rateCardId");

CREATE INDEX "vendor_rate_card_items_normalized_description_idx"
  ON "vendor_rate_card_items" ("tenantId", "isActive", lower(trim("description")), "rateCardId");
