export const VENDOR_QUALIFICATION_COMPARE_AND_SET_SQL = `
  UPDATE "vendors"
  SET "qualificationStatus" = ?, "qualificationScore" = ?, "qualificationDecision" = ?,
    "evaluatedAt" = ?, "evaluatedById" = ?, "empanelmentStatus" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "updatedAt" IS ?
`;

export const VENDOR_EVALUATION_INSERT_AFTER_UPDATE_SQL = `
  WITH payload AS (SELECT ? AS "data")
  INSERT INTO "vendor_evaluations" (
    "id", "tenantId", "vendorId", "evaluationType", "status", "businessProfileScore", "financialStrengthScore",
    "previousClientsScore", "referencesScore", "technicalCapabilityScore", "complianceRiskScore", "overallWeightedScore",
    "qualificationOutcome", "criteriaDetails", "aiSummary", "criticalRiskFlags", "evaluatedBy", "evaluatedAt",
    "approvedBy", "approvedAt", "decisionRemarks", "createdAt", "updatedAt"
  )
  SELECT CASE WHEN ? = 0 OR changes() = 1 THEN json_extract(payload."data", '$.id') ELSE NULL END,
    json_extract(payload."data", '$.tenantId'), json_extract(payload."data", '$.vendorId'),
    json_extract(payload."data", '$.evaluationType'), json_extract(payload."data", '$.status'),
    json_extract(payload."data", '$.businessProfileScore'), json_extract(payload."data", '$.financialStrengthScore'),
    json_extract(payload."data", '$.previousClientsScore'), json_extract(payload."data", '$.referencesScore'),
    json_extract(payload."data", '$.technicalCapabilityScore'), json_extract(payload."data", '$.complianceRiskScore'),
    json_extract(payload."data", '$.overallWeightedScore'), json_extract(payload."data", '$.qualificationOutcome'),
    json_extract(payload."data", '$.criteriaDetails'), json_extract(payload."data", '$.aiSummary'),
    json_extract(payload."data", '$.criticalRiskFlags'), json_extract(payload."data", '$.evaluatedBy'),
    json_extract(payload."data", '$.evaluatedAt'), json_extract(payload."data", '$.approvedBy'),
    json_extract(payload."data", '$.approvedAt'), json_extract(payload."data", '$.decisionRemarks'),
    json_extract(payload."data", '$.createdAt'), json_extract(payload."data", '$.updatedAt')
  FROM payload
  JOIN "vendors" vendor ON vendor."id" = json_extract(payload."data", '$.vendorId')
  WHERE vendor."tenantId" = json_extract(payload."data", '$.tenantId')
    OR vendor."vendorType" = 'PROCUCEV_VENDOR'
`;

export const VENDOR_EVALUATION_AUDIT_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action", "description",
    "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, NULL, 'VENDOR', evaluation."vendorId", ?, ?, ?, ?, NULL, ?, ?
  FROM "vendor_evaluations" evaluation
  WHERE evaluation."id" = ? AND evaluation."tenantId" = ?
`;
