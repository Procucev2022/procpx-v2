-- Category codes are optional, so use a partial index to keep populated codes
-- unique per tenant while preserving multiple rows with no code.
CREATE UNIQUE INDEX IF NOT EXISTS "categories_tenant_code_key"
  ON "categories" ("tenantId", "code")
  WHERE "code" IS NOT NULL;
