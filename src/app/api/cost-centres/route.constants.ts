export const COST_CENTRE_SEARCH_MAX_LENGTH = 120;
export const COST_CENTRE_LOOKUP_MAX_OPTIONS = 100;

export const COST_CENTRE_INSERT_IF_PROJECT_EXISTS_SQL = `
  INSERT INTO "cost_centres" (
    "id", "tenantId", "projectId", "code", "name", "description", "areaSqFt",
    "location", "floorZone", "status", "createdAt", "updatedAt", "createdBy"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "projects" WHERE "id" = ? AND "tenantId" = ?
  )
  ON CONFLICT DO NOTHING
  RETURNING "id", "tenantId", "projectId", "code", "name", "description", "areaSqFt",
    "location", "floorZone", "status", "createdAt", "updatedAt", "createdBy"
`;

export const COST_CENTRE_NORMALIZED_NAME_EXISTS_SQL = `
  SELECT "id" FROM "cost_centres"
  WHERE "tenantId" = ? AND "projectId" = ? AND lower(trim("name")) = lower(trim(?))
  LIMIT 1
`;
