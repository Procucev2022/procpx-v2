export const VENDOR_PROFILE_UPDATE_SQL = `
  UPDATE "vendors"
  SET "name" = ?, "contactPerson" = ?, "email" = ?, "phone" = ?, "categories" = ?,
      "operatingLocation" = ?, "city" = ?, "state" = ?, "country" = ?, "legalStructure" = ?,
      "gstin" = ?, "pan" = ?, "website" = ?, "address" = ?, "experienceYears" = ?,
      "turnoverCrores" = ?, "capabilities" = ?, "serviceCoverage" = ?, "clientReferences" = ?,
      "certifications" = ?, "documents" = ?, "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
    AND "updatedAt" = ?
  RETURNING *
`;

export const VENDOR_PROFILE_AUDIT_INSERT_AFTER_UPDATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, NULL, 'VENDOR', ?,
    'VENDOR_UPDATED', ?, ?, ?, NULL, NULL, ?
`;
