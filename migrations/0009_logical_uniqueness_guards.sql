-- SQLite treats NULL values as distinct inside a composite unique index. Use
-- partial indexes to enforce category uniqueness at each hierarchy level.
CREATE UNIQUE INDEX IF NOT EXISTS "categories_root_tenant_name_key"
  ON "categories" ("tenantId", "name")
  WHERE "parentId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "categories_child_tenant_parent_name_key"
  ON "categories" ("tenantId", "parentId", "name")
  WHERE "parentId" IS NOT NULL;

-- Preserve approved/rejected award history while allowing only one open review
-- per RFQ. Existing pending duplicates were checked before this migration.
CREATE UNIQUE INDEX IF NOT EXISTS "award_recommendations_one_pending_per_rfq_key"
  ON "award_recommendations" ("tenantId", "rfqId")
  WHERE "status" = 'PENDING_APPROVAL';
