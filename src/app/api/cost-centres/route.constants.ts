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
  RETURNING "id", "tenantId", "projectId", "code", "name", "description", "areaSqFt",
    "location", "floorZone", "status", "createdAt", "updatedAt", "createdBy"
`;
