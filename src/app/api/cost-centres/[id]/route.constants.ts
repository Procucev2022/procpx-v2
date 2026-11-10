export const COST_CENTRE_UPDATE_ACTION = 'UPDATE';
export const COST_CENTRE_UPDATE_ENTITY_TYPE = 'COST_CENTRE';
export const COST_CENTRE_ALLOWED_STATUSES = ['ACTIVE', 'INACTIVE', 'COMPLETED'] as const;
export const COST_CENTRE_APPROVAL_PAGE_SIZE = 25;

export const COST_CENTRE_UPDATE_IF_CURRENT_SQL = `
  UPDATE "cost_centres"
  SET "name" = ?, "description" = ?, "areaSqFt" = ?, "location" = ?, "floorZone" = ?, "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "updatedAt" IS ?
`;

export const COST_CENTRE_AUDIT_AFTER_UPDATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action", "description",
    "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 THEN ? ELSE NULL END,
    ?, ?, centre."projectId", '${COST_CENTRE_UPDATE_ENTITY_TYPE}', centre."id", '${COST_CENTRE_UPDATE_ACTION}', ?, ?, ?, NULL, ?, ?
  FROM "cost_centres" centre
  WHERE centre."id" = ? AND centre."tenantId" = ?
`;

export const COST_CENTRE_UPDATE_FAILED_EVENT = 'cost_centre.update_failed';
export const COST_CENTRE_UPDATE_RECOVERED_EVENT = 'cost_centre.update_result_recovered';
