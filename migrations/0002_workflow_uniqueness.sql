-- Prevent duplicate line identities and repeated workflow submissions.
-- Existing rows are retained. The migration intentionally fails if conflicting
-- historical rows exist so they can be reviewed before any cleanup is approved.
CREATE UNIQUE INDEX IF NOT EXISTS "categories_tenant_root_name_key"
  ON "categories" ("tenantId", "name") WHERE "parentId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "boq_lines_revision_lineNumber_key"
  ON "boq_lines" ("boqRevisionId", "lineNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "pr_lines_pr_lineNumber_key"
  ON "pr_lines" ("prId", "lineNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "rfq_lines_rfq_lineNumber_key"
  ON "rfq_lines" ("rfqId", "lineNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "quote_lines_quote_rfqLine_key"
  ON "quote_lines" ("quoteId", "rfqLineId");

CREATE UNIQUE INDEX IF NOT EXISTS "negotiation_rounds_negotiation_vendor_round_key"
  ON "negotiation_rounds" ("negotiationId", "vendorId", "roundNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "ppos_awardRecommendationId_key"
  ON "ppos" ("awardRecommendationId");
