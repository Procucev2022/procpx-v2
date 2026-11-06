-- A tenant may have only one active regular RFQ PPO for the same RFQ/vendor pair.
-- Cancelled orders remain historical records and do not block a replacement award.
CREATE UNIQUE INDEX IF NOT EXISTS "ppos_active_rfq_vendor_key"
  ON "ppos" ("tenantId", "rfqId", "vendorId")
  WHERE "rfqId" IS NOT NULL
    AND "sourcingType" = 'REGULAR_RFQ'
    AND "status" <> 'CANCELLED';
