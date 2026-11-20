CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_normalized_name_unique_idx
  ON projects (tenantId, lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS vendors_tenant_normalized_name_unique_idx
  ON vendors (tenantId, lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS cost_centres_project_normalized_name_unique_idx
  ON cost_centres (tenantId, projectId, lower(trim(name)));
