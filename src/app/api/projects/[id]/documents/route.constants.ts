export const PROJECT_DOCUMENT_INSERT_SQL = `
  INSERT INTO "project_documents" (
    "id", "projectId", "tenantId", "name", "fileType", "fileSize", "filePath", "uploadedBy", "uploadedAt", "category"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const PROJECT_DOCUMENT_DELETE_IF_PRESENT_SQL = `
  DELETE FROM "project_documents" WHERE "id" = ? AND "projectId" = ? AND "tenantId" = ?
`;

export const PROJECT_DOCUMENT_AUDIT_DELETE_IF_PRESENT_SQL = `
  DELETE FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ? AND "entityId" = ? AND "entityType" = 'PROJECT'
`;
