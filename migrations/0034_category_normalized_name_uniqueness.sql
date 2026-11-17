-- Match the category duplicate checks and API normalization rules at the database boundary.
-- The existing exact-name indexes remain in place; these expression indexes prevent
-- case and surrounding-whitespace variants from creating logical duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "categories_root_tenant_normalized_name_key"
  ON "categories" ("tenantId", lower(trim("name")))
  WHERE "parentId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "categories_child_tenant_parent_normalized_name_key"
  ON "categories" ("tenantId", "parentId", lower(trim("name")))
  WHERE "parentId" IS NOT NULL;
