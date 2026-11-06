-- Direct rate-card orders must not be issued twice for the same requirement.
-- Cancelled orders remain in history and allow a replacement workflow.
CREATE UNIQUE INDEX IF NOT EXISTS "ppos_active_direct_pr_key"
  ON "ppos" ("tenantId", "prId")
  WHERE "prId" IS NOT NULL
    AND "sourcingType" = 'DIRECT_RATE_CARD'
    AND "status" <> 'CANCELLED';

-- A direct rate-card order sourced from an RFQ is unique per tenant/RFQ/vendor.
CREATE UNIQUE INDEX IF NOT EXISTS "ppos_active_direct_rfq_vendor_key"
  ON "ppos" ("tenantId", "rfqId", "vendorId")
  WHERE "rfqId" IS NOT NULL
    AND "sourcingType" = 'DIRECT_RATE_CARD'
    AND "status" <> 'CANCELLED';
