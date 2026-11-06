-- Enforce one negotiation workflow per tenant/RFQ and accelerate quote lookups.
-- Pre-migration review found no duplicate negotiation pairs; no rows are changed.
CREATE UNIQUE INDEX IF NOT EXISTS "negotiations_tenantId_rfqId_key"
  ON "negotiations" ("tenantId", "rfqId");

CREATE INDEX IF NOT EXISTS "quotes_tenantId_quoteNumber_idx"
  ON "quotes" ("tenantId", "quoteNumber");
