export const BOQ_VALIDATE_LINES_UPDATE_JSON_SQL = `
  WITH "line_updates" AS (
    SELECT json_extract("value", '$.id') AS "id",
      json_extract("value", '$.validationStatus') AS "validationStatus",
      json_extract("value", '$.validationMessages') AS "validationMessages",
      json_extract("value", '$.updatedAt') AS "updatedAt"
    FROM json_each(?)
  )
  UPDATE "boq_lines"
  SET "validationStatus" = "line_updates"."validationStatus",
      "validationMessages" = "line_updates"."validationMessages",
      "updatedAt" = "line_updates"."updatedAt"
  FROM "line_updates"
  WHERE "boq_lines"."id" = "line_updates"."id"
    AND "boq_lines"."tenantId" = ?
    AND "boq_lines"."boqRevisionId" = ?
    AND "boq_lines"."isDeleted" = 0
`;

export const BOQ_VALIDATE_REVISION_UPDATE_SQL = `
  UPDATE "boq_revisions"
  SET "totalLines" = ?, "validLines" = ?, "errorLines" = ?, "warningLines" = ?, "qualityScore" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "updatedAt" = ?
    AND changes() = ?
    AND EXISTS (
      SELECT 1 FROM "boqs" b
      WHERE b."id" = "boq_revisions"."boqId" AND b."tenantId" = "boq_revisions"."tenantId"
    )
`;
