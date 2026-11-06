export const MAX_RERFQ_LINES = 500;
export const MAX_RERFQ_VENDORS = 500;
export const MAX_RERFQ_VENDOR_ID_LENGTH = 128;
export const MAX_RERFQ_REASON_LENGTH = 1_000;
export const RERFQ_NUMBER_MARKER = '__GENERATED_RERFQ_NUMBER__';
export const RERFQ_FAILED_EVENT = 'procurement.rerfq_creation_failed';
export const RERFQ_RECOVERED_EVENT = 'procurement.rerfq_creation_result_recovered';

export const RERFQ_INSERT_SQL = `
  INSERT INTO "rfqs" (
    "id", "tenantId", "projectId", "boqRevisionId", "rfqNumber", "title", "scopeOfWork", "packageType",
    "packageName", "status", "submissionDeadline", "clarificationDeadline", "commercialValidityDays",
    "deliveryRequirement", "paymentTerms", "taxTerms", "requiredDocuments", "technicalRequirements",
    "commercialRequirements", "estimatedBenchmarkValue", "totalLines", "isReRfq", "reRfqReason",
    "originalRfqId", "finalLockedAt", "finalLockedById", "releasedAt", "prId", "createdAt", "updatedAt", "createdById"
  )
  SELECT ?, source."tenantId", source."projectId", source."boqRevisionId",
    root."rfqNumber" || '-R' || (
      COALESCE((
        SELECT MAX(CAST(substr(candidate."rfqNumber", length(root."rfqNumber") + 3) AS INTEGER))
        FROM "rfqs" candidate
        WHERE candidate."tenantId" = root."tenantId"
          AND candidate."rfqNumber" GLOB root."rfqNumber" || '-R[0-9]*'
      ), 0) + 1
    ),
    ?, source."scopeOfWork", source."packageType", source."packageName", 'RELEASED', ?, NULL,
    source."commercialValidityDays", source."deliveryRequirement", source."paymentTerms", source."taxTerms",
    source."requiredDocuments", source."technicalRequirements", source."commercialRequirements",
    source."estimatedBenchmarkValue", ?, 1, ?, root."id", NULL, NULL, ?, source."prId", ?, ?, ?
  FROM "rfqs" source
  JOIN "rfqs" root ON root."id" = COALESCE(source."originalRfqId", source."id") AND root."tenantId" = source."tenantId"
  WHERE source."id" = ? AND source."tenantId" = ?
`;

export const RERFQ_LINES_INSERT_SQL = `
  INSERT INTO "rfq_lines" (
    "id", "tenantId", "rfqId", "projectId", "costCentreId", "boqId", "boqRevisionId", "boqLineId", "prLineId",
    "lineNumber", "description", "specification", "category", "subcategory", "uom", "quantity",
    "benchmarkRate", "benchmarkAmount", "createdAt"
  )
  SELECT json_extract(line.value, '$.id'), ?, ?, json_extract(line.value, '$.projectId'),
    json_extract(line.value, '$.costCentreId'), json_extract(line.value, '$.boqId'),
    json_extract(line.value, '$.boqRevisionId'), json_extract(line.value, '$.boqLineId'),
    json_extract(line.value, '$.prLineId'), json_extract(line.value, '$.lineNumber'),
    json_extract(line.value, '$.description'), json_extract(line.value, '$.specification'),
    json_extract(line.value, '$.category'), json_extract(line.value, '$.subcategory'),
    json_extract(line.value, '$.uom'), json_extract(line.value, '$.quantity'),
    json_extract(line.value, '$.benchmarkRate'), json_extract(line.value, '$.benchmarkAmount'),
    json_extract(line.value, '$.createdAt')
  FROM json_each(?) line
  WHERE EXISTS (SELECT 1 FROM "rfqs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const RERFQ_VENDORS_INSERT_SQL = `
  INSERT INTO "rfq_vendors" (
    "id", "tenantId", "rfqId", "vendorId", "invitedAt", "invitationStatus", "submissionStatus"
  )
  SELECT json_extract(invitee.value, '$.id'), ?, ?, json_extract(invitee.value, '$.vendorId'), ?, 'INVITED', 'PENDING'
  FROM json_each(?) invitee
  WHERE EXISTS (SELECT 1 FROM "rfqs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const RERFQ_AUDIT_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action", "description",
    "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, created."projectId", 'RFQ', created."id", 'RERFQ_CREATED',
    ? || created."rfqNumber" || ?, ?, ?, NULL, ?, ?
  FROM "rfqs" created
  WHERE created."id" = ? AND created."tenantId" = ?
`;
