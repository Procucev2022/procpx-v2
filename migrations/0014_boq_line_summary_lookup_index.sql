CREATE INDEX IF NOT EXISTS boq_lines_tenant_revision_deleted_category_cost_idx
ON boq_lines (tenantId, boqRevisionId, isDeleted, categoryId, aiUnitCost);
