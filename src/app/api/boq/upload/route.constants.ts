export const BOQ_UPLOAD_ROUTE = '/api/boq/upload';
export const BOQ_UPLOAD_CONTENT_LENGTH_OVERHEAD_BYTES = 64 * 1024;
export const BOQ_UPLOAD_PERSISTENCE_ATTEMPTS = 2;

export const BOQ_UPLOAD_CREATE_HEADER_SQL = `
  WITH input (
    "id", "tenantId", "projectId", "createdBy", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?))
  INSERT INTO "boqs" (
    "id", "tenantId", "projectId", "costCentreId", "boqCode", "title", "description", "category", "scope",
    "status", "purpose", "createdAt", "updatedAt", "createdBy"
  )
  SELECT i."id", i."tenantId", i."projectId", NULL,
    'BOQ-' || project."projectCode" || '-' || printf('%03d', COALESCE((
      SELECT MAX(CAST(substr(existing."boqCode", length('BOQ-' || project."projectCode" || '-') + 1) AS INTEGER))
      FROM "boqs" existing
      WHERE existing."tenantId" = i."tenantId" AND existing."projectId" = i."projectId"
        AND substr(existing."boqCode", 1, length('BOQ-' || project."projectCode" || '-')) = 'BOQ-' || project."projectCode" || '-'
    ), 0) + 1),
    NULL, NULL, NULL, NULL, 'DRAFT', NULL, i."createdAt", i."updatedAt", i."createdBy"
  FROM input i
  JOIN "projects" project ON project."id" = i."projectId" AND project."tenantId" = i."tenantId"
  ON CONFLICT ("id") DO NOTHING
`;

export const BOQ_UPLOAD_UPDATE_EMPTY_DRAFT_SQL = `
  UPDATE "boq_revisions"
  SET "originalFileName" = ?, "originalFilePath" = ?, "originalFileSize" = ?, "originalFileHash" = ?,
      "uploadedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "boqId" = ? AND "status" = 'DRAFT' AND "totalLines" = 0
    AND "updatedAt" IS ? AND "originalFilePath" IS ? AND "originalFileHash" IS ? AND "originalFileName" IS ?
    AND NOT EXISTS (
      SELECT 1 FROM "boq_revisions" newer
      WHERE newer."tenantId" = "boq_revisions"."tenantId" AND newer."boqId" = "boq_revisions"."boqId"
        AND newer."revisionNumber" > "boq_revisions"."revisionNumber"
    )
    AND EXISTS (
      SELECT 1 FROM "boqs" boq
      WHERE boq."id" = "boq_revisions"."boqId" AND boq."tenantId" = ? AND boq."projectId" = ?
    )
`;

export const BOQ_UPLOAD_INSERT_NEXT_REVISION_SQL = `
  WITH input (
    "id", "tenantId", "boqId", "originalFileName", "originalFilePath", "originalFileSize", "originalFileHash",
    "uploadedAt", "createdById", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "boq_revisions" (
    "id", "tenantId", "boqId", "costCentreId", "revisionNumber", "revisionCode", "status", "preparationStatus",
    "budgetStatus", "prStatus", "sourceType", "originalFileName", "originalFilePath", "originalFileSize",
    "originalFileHash", "uploadedAt", "totalLines", "validLines", "errorLines", "warningLines", "createdById",
    "createdAt", "updatedAt"
  )
  SELECT i."id", i."tenantId", i."boqId", NULL,
    COALESCE((SELECT MAX("revisionNumber") + 1 FROM "boq_revisions"
      WHERE "tenantId" = i."tenantId" AND "boqId" = i."boqId"), 0),
    'R' || COALESCE((SELECT MAX("revisionNumber") + 1 FROM "boq_revisions"
      WHERE "tenantId" = i."tenantId" AND "boqId" = i."boqId"), 0),
    'DRAFT', 'DRAFT', 'NOT_ADDED_TO_BUDGET', 'PR_NOT_CREATED', 'MANUAL', i."originalFileName", i."originalFilePath",
    i."originalFileSize", i."originalFileHash", i."uploadedAt", 0, 0, 0, 0, i."createdById", i."createdAt", i."updatedAt"
  FROM input i
  WHERE changes() = 0
    AND EXISTS (SELECT 1 FROM "boqs" boq WHERE boq."id" = i."boqId" AND boq."tenantId" = i."tenantId")
    AND NOT EXISTS (
      SELECT 1 FROM "boq_revisions" latest
      WHERE latest."tenantId" = i."tenantId" AND latest."boqId" = i."boqId"
        AND latest."status" = 'DRAFT' AND latest."originalFileHash" = i."originalFileHash"
        AND latest."originalFilePath" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "boq_revisions" newer
          WHERE newer."tenantId" = latest."tenantId" AND newer."boqId" = latest."boqId"
            AND newer."revisionNumber" > latest."revisionNumber"
        )
    )
`;

export const BOQ_UPLOAD_AUDIT_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action", "description",
    "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, revision."tenantId", ?, ?, 'BOQ_REVISION', revision."id", 'UPLOAD',
    replace(?, '__REVISION_CODE__', revision."revisionCode"), NULL,
    json_object('fileName', revision."originalFileName", 'fileSize', revision."originalFileSize",
      'revisionCode', revision."revisionCode", 'fileHash', revision."originalFileHash"), NULL, NULL, ?
  FROM "boq_revisions" revision
  WHERE revision."tenantId" = ? AND revision."boqId" = ? AND revision."status" = 'DRAFT'
    AND revision."originalFileHash" = ?
    AND (revision."originalFilePath" = ? OR revision."id" = (
      SELECT latest."id" FROM "boq_revisions" latest
      WHERE latest."tenantId" = ? AND latest."boqId" = ? AND latest."status" = 'DRAFT'
        AND latest."originalFileHash" = ?
      ORDER BY latest."revisionNumber" DESC LIMIT 1
    ))
    AND NOT EXISTS (
      SELECT 1 FROM "audit_logs" existing
      WHERE existing."tenantId" = revision."tenantId" AND existing."entityType" = 'BOQ_REVISION'
        AND existing."entityId" = revision."id" AND existing."action" = 'UPLOAD'
        AND ((json_valid(existing."newValue") AND json_extract(existing."newValue", '$.fileHash') = revision."originalFileHash")
          OR existing."description" = replace(?, '__REVISION_CODE__', revision."revisionCode"))
    )
`;

export const BOQ_UPLOAD_PROJECT_DOCUMENT_INSERT_SQL = `
  INSERT INTO "project_documents" (
    "id", "tenantId", "projectId", "name", "fileType", "fileSize", "filePath", "uploadedBy", "uploadedAt", "category"
  )
  SELECT ?, revision."tenantId", ?, revision."originalFileName", ?, revision."originalFileSize",
    revision."originalFilePath", ?, ?, 'ORIGINAL_BOQ'
  FROM "boq_revisions" revision
  WHERE revision."tenantId" = ? AND revision."boqId" = ? AND revision."status" = 'DRAFT'
    AND revision."originalFileHash" = ?
    AND (revision."originalFilePath" = ? OR revision."id" = (
      SELECT latest."id" FROM "boq_revisions" latest
      WHERE latest."tenantId" = ? AND latest."boqId" = ? AND latest."status" = 'DRAFT'
        AND latest."originalFileHash" = ?
      ORDER BY latest."revisionNumber" DESC LIMIT 1
    ))
    AND NOT EXISTS (
      SELECT 1 FROM "project_documents" existing
      WHERE existing."tenantId" = revision."tenantId" AND existing."projectId" = ?
        AND existing."category" = 'ORIGINAL_BOQ' AND existing."filePath" = revision."originalFilePath"
    )
`;
