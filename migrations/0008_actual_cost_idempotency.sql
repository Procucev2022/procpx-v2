-- Add optional request idempotency fields. Existing actual-cost rows remain unchanged.
ALTER TABLE "actual_cost_transactions" ADD COLUMN "completionRequestId" TEXT;
ALTER TABLE "actual_cost_transactions" ADD COLUMN "completionFingerprint" TEXT;

-- One request can create one actual-cost row per PPO line. The partial predicate
-- preserves existing/manual rows whose completion request ID is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "actual_cost_transactions_completion_request_line_key"
  ON "actual_cost_transactions" ("tenantId", "completionRequestId", "ppoLineId")
  WHERE "completionRequestId" IS NOT NULL AND "ppoLineId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "actual_cost_transactions_tenant_completion_request_idx"
  ON "actual_cost_transactions" ("tenantId", "completionRequestId");
