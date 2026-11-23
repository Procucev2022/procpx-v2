export const BOQ_NEW_REVISION_INSERT_SQL = `
  INSERT INTO "boq_revisions" (
    "id", "tenantId", "boqId", "costCentreId", "revisionNumber", "revisionCode", "status",
    "preparationStatus", "budgetStatus", "prStatus", "sourceType", "notes", "totalLines",
    "validLines", "errorLines", "warningLines", "qualityScore", "uploadedAt", "createdAt",
    "updatedAt", "createdById"
  )
  SELECT ?, source."tenantId", source."boqId", source."costCentreId", ?, ?, 'DRAFT', 'DRAFT',
    'NOT_ADDED_TO_BUDGET', 'PR_NOT_CREATED', 'MANUAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM "boq_revisions" source
  JOIN "boqs" boq ON boq."id" = source."boqId" AND boq."tenantId" = source."tenantId"
  WHERE source."id" = ? AND source."tenantId" = ? AND source."boqId" = ?
    AND source."status" = 'APPROVED' AND source."updatedAt" = ?
    AND NOT EXISTS (
      SELECT 1 FROM "boq_revisions" existing
      WHERE existing."tenantId" = source."tenantId" AND existing."boqId" = source."boqId"
        AND existing."revisionNumber" = ?
    )
  ON CONFLICT ("boqId", "revisionNumber") DO NOTHING
`;

export const BOQ_NEW_REVISION_COPY_LINES_JSON_SQL = `
  INSERT INTO "boq_lines" (
    "id", "tenantId", "boqRevisionId", "lineNumber", "originalDescription", "standardDescription",
    "specification", "categoryId", "subcategoryId", "uomId", "uomRaw", "quantity", "location",
    "drawingReference", "brand", "model", "material", "grade", "remarks", "itemCode",
    "validationStatus", "validationMessages", "benchmarkEligible", "createdAt", "updatedAt"
  )
  SELECT json_extract("value", '$.id'), ?, ?, json_extract("value", '$.lineNumber'),
    json_extract("value", '$.originalDescription'), json_extract("value", '$.standardDescription'),
    json_extract("value", '$.specification'), json_extract("value", '$.categoryId'),
    json_extract("value", '$.subcategoryId'), json_extract("value", '$.uomId'),
    json_extract("value", '$.uomRaw'), json_extract("value", '$.quantity'), json_extract("value", '$.location'),
    json_extract("value", '$.drawingReference'), json_extract("value", '$.brand'),
    json_extract("value", '$.model'), json_extract("value", '$.material'), json_extract("value", '$.grade'),
    json_extract("value", '$.remarks'), json_extract("value", '$.itemCode'),
    json_extract("value", '$.validationStatus'), json_extract("value", '$.validationMessages'),
    json_extract("value", '$.benchmarkEligible'), json_extract("value", '$.createdAt'),
    json_extract("value", '$.updatedAt')
  FROM json_each(?)
  -- No changes() guard: large copies are split into several statements. The revision row is inserted
  -- earlier in the same atomic batch, and the audit statement afterwards verifies the copied line count.
  WHERE EXISTS (
    SELECT 1 FROM "boq_revisions" revision
    WHERE revision."id" = ? AND revision."tenantId" = ?
  )
`;

export const BOQ_NEW_REVISION_AUDIT_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN EXISTS (
      SELECT 1 FROM "boq_revisions" revision
      WHERE revision."id" = ? AND revision."tenantId" = ?
    ) AND (
      SELECT COUNT(*) FROM "boq_lines" line
      WHERE line."boqRevisionId" = ? AND line."tenantId" = ? AND line."isDeleted" = 0
    ) = ? THEN ? ELSE NULL END,
    ?, ?, ?, 'BOQ_REVISION', ?, 'CREATE', ?, NULL, ?, NULL, NULL, ?
`;
