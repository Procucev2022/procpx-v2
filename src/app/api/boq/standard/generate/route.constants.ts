export const BOQ_STANDARD_GENERATE_SOURCE_TYPE = 'STANDARD_BOQ_DOWNLOAD_UPLOAD';
export const BOQ_STANDARD_GENERATE_AUDIT_ACTION = 'BOQ_GENERATED_FROM_STANDARD_DOWNLOAD_UPLOAD';
export const BOQ_STANDARD_GENERATE_DEFAULT_CATEGORY = 'General';
export const BOQ_STANDARD_GENERATE_DEFAULT_PURPOSE = 'BUDGET';
export const BOQ_STANDARD_GENERATE_DEFAULT_UOM = 'NOS';
export const BOQ_STANDARD_GENERATE_COST_SOURCE = 'Standard Catalogue Benchmark';
export const BOQ_STANDARD_GENERATE_COST_METHOD = 'WEIGHTED_MEDIAN';

export const BOQ_STANDARD_GENERATE_INSERT_BOQ_SQL = `
  WITH input (
    "id", "tenantId", "projectId", "costCentreId", "title", "description", "category", "scope",
    "status", "purpose", "createdBy", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "boqs" (
    "id", "tenantId", "projectId", "costCentreId", "boqCode", "title", "description", "category", "scope",
    "status", "purpose", "createdBy", "createdAt", "updatedAt"
  )
  SELECT input."id", input."tenantId", input."projectId", input."costCentreId",
    'BOQ-' || printf('%06d', COALESCE((
      SELECT MAX(CAST(substr(existing."boqCode", 5) AS INTEGER))
      FROM "boqs" existing
      WHERE existing."tenantId" = input."tenantId" AND existing."boqCode" GLOB 'BOQ-[0-9]*'
    ), 0) + 1),
    input."title", input."description", input."category", input."scope", input."status", input."purpose",
    input."createdBy", input."createdAt", input."updatedAt"
  FROM input
  JOIN "projects" project ON project."id" = input."projectId" AND project."tenantId" = input."tenantId"
  WHERE input."costCentreId" IS NULL OR EXISTS (
    SELECT 1 FROM "cost_centres" centre
    WHERE centre."id" = input."costCentreId" AND centre."tenantId" = input."tenantId"
      AND centre."projectId" = input."projectId"
  )
  RETURNING "id", "boqCode"
`;

export const BOQ_STANDARD_GENERATE_UPDATE_BOQ_SQL = `
  UPDATE "boqs"
  SET "title" = ?, "description" = ?, "purpose" = ?, "category" = ?, "costCentreId" = ?, "scope" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "projectId" = ? AND "updatedAt" IS ?
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM "cost_centres" centre
      WHERE centre."id" = ? AND centre."tenantId" = ? AND centre."projectId" = ?
    ))
  RETURNING "id", "boqCode"
`;

export const BOQ_STANDARD_GENERATE_UPDATE_EMPTY_REVISION_SQL = `
  UPDATE "boq_revisions"
  SET "costCentreId" = ?, "status" = 'DRAFT', "preparationStatus" = 'STANDARDISED',
    "budgetStatus" = ?, "prStatus" = ?, "sourceType" = 'STANDARD_BOQ_DOWNLOAD_UPLOAD',
    "sourceReference" = ?, "notes" = ?, "totalLines" = ?, "validLines" = ?, "warningLines" = ?,
    "errorLines" = 0, "qualityScore" = ?, "uploadedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "boqId" = ? AND "status" = 'DRAFT'
    AND "totalLines" = 0 AND "updatedAt" IS ? AND changes() = 1
  RETURNING "id", "revisionCode"
`;

export const BOQ_STANDARD_GENERATE_INSERT_LINES_JSON_SQL = `
  INSERT INTO "boq_lines" (
    "id", "tenantId", "boqRevisionId", "lineNumber", "itemCode", "originalDescription", "standardDescription",
    "specification", "aiSuggestedDescription", "aiConfidence", "aiUnitCost", "aiTotalCost", "costConfidence",
    "costSource", "costMethod", "categoryId", "subcategoryId", "uomId", "uomRaw", "quantity", "brand", "model",
    "location", "drawingReference", "remarks", "validationStatus", "validationMessages", "benchmarkEligible",
    "createdAt", "updatedAt"
  )
  SELECT json_extract(line.value, '$.id'), ?, ?, json_extract(line.value, '$.lineNumber'), json_extract(line.value, '$.itemCode'),
    json_extract(line.value, '$.originalDescription'), json_extract(line.value, '$.standardDescription'),
    json_extract(line.value, '$.specification'), json_extract(line.value, '$.aiSuggestedDescription'),
    json_extract(line.value, '$.aiConfidence'), json_extract(line.value, '$.aiUnitCost'), json_extract(line.value, '$.aiTotalCost'),
    json_extract(line.value, '$.costConfidence'), json_extract(line.value, '$.costSource'), json_extract(line.value, '$.costMethod'),
    json_extract(line.value, '$.categoryId'), NULL, json_extract(line.value, '$.uomId'), json_extract(line.value, '$.uomRaw'),
    json_extract(line.value, '$.quantity'), json_extract(line.value, '$.brand'), json_extract(line.value, '$.model'),
    json_extract(line.value, '$.location'), json_extract(line.value, '$.drawingReference'), json_extract(line.value, '$.remarks'),
    json_extract(line.value, '$.validationStatus'), json_extract(line.value, '$.validationMessages'),
    json_extract(line.value, '$.benchmarkEligible'), json_extract(line.value, '$.createdAt'), json_extract(line.value, '$.updatedAt')
  FROM json_each(?) line
  WHERE EXISTS (
    SELECT 1 FROM "boq_revisions" revision
    WHERE revision."id" = ? AND revision."tenantId" = ? AND revision."boqId" = ?
      AND revision."totalLines" = ? AND revision."updatedAt" IS ?
  )
`;

export const BOQ_STANDARD_GENERATE_AUDIT_AFTER_LINES_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action", "description",
    "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN revision."totalLines" = ? AND revision."updatedAt" IS ?
      AND (SELECT COUNT(*) FROM "boq_lines" line
        WHERE line."boqRevisionId" = revision."id" AND line."tenantId" = revision."tenantId" AND line."isDeleted" = 0) = ?
      THEN ? ELSE NULL END,
    ?, ?, boq."projectId", 'BOQ', boq."id", ?,
    replace(replace(replace(?, '{{boqCode}}', boq."boqCode"), '{{length}}', CAST(? AS TEXT)),
      '{{value3}}', COALESCE(centre."code", ?)),
    NULL, ?, NULL, ?, ?
  FROM "boqs" boq
  JOIN "projects" project ON project."id" = boq."projectId" AND project."tenantId" = boq."tenantId"
  JOIN "boq_revisions" revision ON revision."id" = ? AND revision."tenantId" = boq."tenantId"
    AND revision."boqId" = boq."id"
  LEFT JOIN "cost_centres" centre ON centre."id" = boq."costCentreId" AND centre."tenantId" = boq."tenantId"
  WHERE boq."id" = ? AND boq."tenantId" = ? AND boq."projectId" = ?
`;
