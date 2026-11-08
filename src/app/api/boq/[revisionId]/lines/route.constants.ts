import { BOQ_LINE_DETAIL_PAGE_SIZE } from '@/lib/boq-line-pagination.constants';

export const BOQ_LINE_DEFAULT_PAGE_SIZE = 50;
export const BOQ_LINE_MAX_PAGE_SIZE = BOQ_LINE_DETAIL_PAGE_SIZE;
export const BOQ_LINE_MAX_PAGE_NUMBER = 1_000;
export const BOQ_LINE_EDITABLE_TEXT_FIELDS = [
  'standardDescription', 'originalDescription', 'specification', 'categoryId', 'subcategoryId', 'uomId', 'uomRaw',
  'location', 'drawingReference', 'brand', 'model', 'material', 'grade', 'remarks',
] as const;

export const BOQ_LINE_UPDATE_EDIT_SQL = `
  UPDATE "boq_lines"
  SET "standardDescription" = ?, "originalDescription" = ?, "specification" = ?,
      "categoryId" = ?, "subcategoryId" = ?, "uomId" = ?, "uomRaw" = ?, "quantity" = ?,
      "location" = ?, "drawingReference" = ?, "brand" = ?, "model" = ?, "material" = ?, "grade" = ?,
      "remarks" = ?, "aiUnitCost" = ?, "aiTotalCost" = ?, "validationStatus" = ?,
      "validationMessages" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0 AND "updatedAt" IS ?
    AND EXISTS (
      SELECT 1 FROM "boq_revisions" WHERE "id" = ? AND "tenantId" = ? AND "status" <> 'APPROVED'
    )
`;

export const BOQ_LINE_ASSERT_UPDATED_SQL = `
  SELECT json_extract(CASE WHEN
    EXISTS (SELECT 1 FROM "boq_lines" WHERE "id" = ? AND "tenantId" = ? AND "boqRevisionId" = ? AND "updatedAt" IS ?)
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ? AND "entityId" = ?)
    THEN '{}' ELSE 'invalid' END, '$') AS "updated"
`;

export const BOQ_LINE_INSERT_NEXT_NUMBER_SQL = `
  WITH input (
    "id", "tenantId", "boqRevisionId", "description", "specification", "categoryId", "subcategoryId", "uomId",
    "uomRaw", "quantity", "location", "brand", "model", "material", "remarks", "aiUnitCost", "aiTotalCost", "createdAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "boq_lines" (
    "id", "tenantId", "boqRevisionId", "lineNumber", "originalDescription", "standardDescription", "specification",
    "categoryId", "subcategoryId", "uomId", "uomRaw", "quantity", "location", "drawingReference", "brand", "model",
    "material", "grade", "remarks", "itemCode", "sourceSheet", "sourceRow", "sourceReference", "confidenceScore",
    "benchmarkEligible", "validationStatus", "validationMessages", "isDeleted", "deletedAt", "deletedBy",
    "aiSuggestedDescription", "aiSuggestedSpec", "aiReason", "aiConfidence", "userOverride", "userApprovedValue",
    "aiUnitCost", "aiTotalCost", "costConfidence", "costSource", "costMethod", "costDate", "geography", "createdAt", "updatedAt"
  )
  SELECT i."id", i."tenantId", i."boqRevisionId",
    CAST((SELECT COUNT(*) + 1 FROM "boq_lines" WHERE "tenantId" = i."tenantId" AND "boqRevisionId" = i."boqRevisionId" AND "isDeleted" = 0) AS TEXT),
    i."description", i."description", i."specification", i."categoryId", i."subcategoryId", i."uomId", i."uomRaw",
    i."quantity", i."location", NULL, i."brand", i."model", i."material", NULL, i."remarks",
    'ITEM-' || printf('%03d', (SELECT COUNT(*) + 1 FROM "boq_lines" WHERE "tenantId" = i."tenantId" AND "boqRevisionId" = i."boqRevisionId" AND "isDeleted" = 0)),
    NULL, NULL, NULL, NULL, 1, 'VALID', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    i."aiUnitCost", i."aiTotalCost", 0.85, 'Manual Entry / Benchmark', NULL, NULL, NULL, i."createdAt", i."createdAt"
  FROM input i
  WHERE EXISTS (
    SELECT 1 FROM "boq_revisions" WHERE "id" = i."boqRevisionId" AND "tenantId" = i."tenantId" AND "status" <> 'APPROVED'
  )
    AND (i."categoryId" IS NULL OR EXISTS (SELECT 1 FROM "categories" WHERE "id" = i."categoryId" AND "tenantId" = i."tenantId"))
    AND (i."subcategoryId" IS NULL OR EXISTS (SELECT 1 FROM "categories" WHERE "id" = i."subcategoryId" AND "tenantId" = i."tenantId"))
    AND (i."uomId" IS NULL OR EXISTS (SELECT 1 FROM "uom_masters" WHERE "id" = i."uomId" AND "tenantId" = i."tenantId"))
  RETURNING "id", "lineNumber", "itemCode"
`;

export const BOQ_REVISION_RECALCULATE_LINE_COUNTS_AFTER_AUDIT_SQL = `
  UPDATE "boq_revisions"
  SET "totalLines" = (SELECT COUNT(*) FROM "boq_lines" WHERE "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0),
      "validLines" = (SELECT COUNT(*) FROM "boq_lines" WHERE "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0 AND "validationStatus" IN ('VALID', 'COST GENERATED')),
      "errorLines" = (SELECT COUNT(*) FROM "boq_lines" WHERE "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0 AND "validationStatus" = 'ERROR'),
      "warningLines" = (SELECT COUNT(*) FROM "boq_lines" WHERE "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0 AND "validationStatus" IN ('WARNING', 'QUANTITY_REQUIRED')),
      "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const BOQ_LINE_ASSERT_CREATED_SQL = `
  SELECT json_extract(CASE WHEN
    EXISTS (SELECT 1 FROM "boq_lines" WHERE "id" = ? AND "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0)
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ? AND "entityId" = ?)
    AND EXISTS (SELECT 1 FROM "boq_revisions" WHERE "id" = ? AND "tenantId" = ?
      AND "totalLines" = (SELECT COUNT(*) FROM "boq_lines" WHERE "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0))
    THEN '{}' ELSE 'invalid' END, '$') AS "created"
`;

export const BOQ_LINE_SOFT_DELETE_IF_CURRENT_SQL = `
  UPDATE "boq_lines" SET "isDeleted" = 1, "deletedAt" = ?, "deletedBy" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0 AND "updatedAt" IS ?
    AND EXISTS (SELECT 1 FROM "boq_revisions" WHERE "id" = ? AND "tenantId" = ? AND "status" <> 'APPROVED')
`;

export const BOQ_LINE_ASSERT_DELETED_SQL = `
  SELECT json_extract(CASE WHEN
    EXISTS (SELECT 1 FROM "boq_lines" WHERE "id" = ? AND "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 1)
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ? AND "entityId" = ?)
    AND EXISTS (SELECT 1 FROM "boq_revisions" WHERE "id" = ? AND "tenantId" = ?
      AND "totalLines" = (SELECT COUNT(*) FROM "boq_lines" WHERE "tenantId" = ? AND "boqRevisionId" = ? AND "isDeleted" = 0))
    THEN '{}' ELSE 'invalid' END, '$') AS "deleted"
`;
