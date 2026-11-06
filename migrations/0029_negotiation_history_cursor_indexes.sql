CREATE INDEX IF NOT EXISTS "negotiation_rounds_tenant_negotiation_created_idx"
ON "negotiation_rounds" ("tenantId", "negotiationId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "negotiation_rounds_tenant_neg_vendor_created_idx"
ON "negotiation_rounds" ("tenantId", "negotiationId", "vendorId", "createdAt", "id");
