export const MAX_D1_BATCH_STATEMENTS = 500;
export const MAX_D1_STATEMENT_BINDINGS = 100;
export const MAX_D1_BATCH_BINDINGS = 4_500;
export const MAX_D1_BINDING_BYTES = 1_800_000;
export const D1_BATCH_SLOW_LOG_THRESHOLD_MS = 1_000;
export const MAX_RFQ_VENDOR_INVITE_COUNT = 500;
export const MAX_RATE_CARD_ITEMS = 200;
export const MAX_PPO_COMPLETION_LINES = 90;
export const MAX_PPO_CREATE_LINES = 140;
export const MAX_PR_BATCH_LINES = 200;
export const MAX_BOQ_BATCH_LINES = 80;
export const MAX_AUCTION_VENDOR_INVITES = 100;
export const MAX_AUCTION_ITEMS = 200;
export const D1_BATCH_BINDING_LIMIT_EXCEEDED = 'D1 batch exceeds the safe bound parameter limit';
export const D1_STATEMENT_BINDING_LIMIT_EXCEEDED = 'D1 statement exceeds the bound parameter limit';
export const D1_BINDING_SIZE_LIMIT_EXCEEDED = 'D1 statement contains a bound value above the safe byte limit';

export const PROJECT_INSERT_IF_CODE_AVAILABLE_SQL = `
  INSERT INTO "projects" (
    "id", "tenantId", "projectCode", "name", "description", "sector", "projectType", "location", "address",
    "city", "state", "country", "areaSqFt", "costCentre", "projectOwner", "budget", "currency", "businessUnit",
    "numberOfFloors", "numberOfUnits", "startDate", "targetCompletion", "status", "createdAt", "updatedAt", "createdBy"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)
  ON CONFLICT ("tenantId", "projectCode") DO NOTHING
  RETURNING "id", "projectCode"
`;

export const BOQ_INSERT_NEXT_CODE_SQL = `
  WITH input (
    "id", "tenantId", "projectId", "costCentreId", "title", "description", "category", "scope",
    "status", "purpose", "createdBy", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "boqs" (
    "id", "tenantId", "projectId", "costCentreId", "boqCode", "title", "description", "category", "scope",
    "status", "purpose", "createdAt", "updatedAt", "createdBy"
  )
  SELECT i."id", i."tenantId", i."projectId", i."costCentreId",
    'BOQ-' || project."projectCode" || '-' || printf('%03d', COALESCE((
      SELECT MAX(CAST(substr(existing."boqCode", length('BOQ-' || project."projectCode" || '-') + 1) AS INTEGER))
      FROM "boqs" existing
      WHERE existing."tenantId" = i."tenantId" AND existing."projectId" = i."projectId"
        AND substr(existing."boqCode", 1, length('BOQ-' || project."projectCode" || '-')) = 'BOQ-' || project."projectCode" || '-'
    ), 0) + 1),
    i."title", i."description", i."category", i."scope", i."status", i."purpose", i."createdAt", i."updatedAt", i."createdBy"
  FROM input i JOIN "projects" project ON project."id" = i."projectId" AND project."tenantId" = i."tenantId"
  WHERE i."costCentreId" IS NULL OR EXISTS (
    SELECT 1 FROM "cost_centres" centre
    WHERE centre."id" = i."costCentreId" AND centre."tenantId" = i."tenantId" AND centre."projectId" = i."projectId"
  )
  RETURNING "id", "boqCode"
`;

export const BOQ_CREATE_AUDIT_INSERT_AFTER_REVISION_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, 'BOQ', boq."id", ?,
    replace(replace(replace(replace(replace(?, '{{boqCode}}', boq."boqCode"), '{{value2}}', COALESCE(boq."title", 'Untitled')),
      '{{projectCode}}', project."projectCode"), '{{code}}', centre."code"), '{{purpose}}', COALESCE(boq."purpose", '')),
    ?, ?, ?, ?, ?
  FROM "boqs" boq
  JOIN "projects" project ON project."id" = boq."projectId" AND project."tenantId" = boq."tenantId"
  JOIN "cost_centres" centre ON centre."id" = boq."costCentreId" AND centre."tenantId" = boq."tenantId"
  WHERE boq."id" = ? AND boq."tenantId" = ? AND boq."projectId" = ? AND boq."costCentreId" = ? AND changes() = 1
    AND EXISTS (
      SELECT 1 FROM "boq_revisions" revision
      WHERE revision."id" = ? AND revision."tenantId" = ? AND revision."boqId" = boq."id"
    )
`;

export const BOQ_DUPLICATE_INSERT_NEXT_CODE_SQL = `
  WITH input (
    "id", "tenantId", "projectId", "costCentreId", "title", "category", "scope", "purpose", "status",
    "createdBy", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "boqs" (
    "id", "tenantId", "projectId", "costCentreId", "boqCode", "title", "category", "scope", "purpose",
    "status", "createdBy", "createdAt", "updatedAt"
  )
  SELECT i."id", i."tenantId", i."projectId", i."costCentreId",
    'BOQ-' || project."projectCode" || '-' || printf('%03d', COALESCE((
      SELECT MAX(CAST(substr(existing."boqCode", length('BOQ-' || project."projectCode" || '-') + 1) AS INTEGER))
      FROM "boqs" existing
      WHERE existing."tenantId" = i."tenantId" AND existing."projectId" = i."projectId"
        AND substr(existing."boqCode", 1, length('BOQ-' || project."projectCode" || '-')) = 'BOQ-' || project."projectCode" || '-'
    ), 0) + 1),
    i."title", i."category", i."scope", i."purpose", i."status", i."createdBy", i."createdAt", i."updatedAt"
  FROM input i JOIN "projects" project ON project."id" = i."projectId" AND project."tenantId" = i."tenantId"
  WHERE i."costCentreId" IS NULL OR EXISTS (
    SELECT 1 FROM "cost_centres" centre
    WHERE centre."id" = i."costCentreId" AND centre."tenantId" = i."tenantId" AND centre."projectId" = i."projectId"
  )
  RETURNING "id", "boqCode"
`;

export const BOQ_REVISION_INSERT_AFTER_HEADER_SQL = `
  INSERT INTO "boq_revisions" (
    "id", "tenantId", "boqId", "costCentreId", "revisionNumber", "revisionCode", "status", "preparationStatus",
    "budgetStatus", "prStatus", "sourceType", "sourceReference", "qualityScore", "totalLines", "validLines",
    "createdById", "uploadedAt", "notes", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE changes() = 1 AND EXISTS (
    SELECT 1 FROM "boqs" WHERE "id" = ? AND "tenantId" = ? AND "projectId" = ?
  )
`;

export const BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL = `
  WITH input (
    "id", "tenantId", "boqId", "costCentreId", "status", "preparationStatus", "budgetStatus", "prStatus",
    "sourceType", "sourceFile", "sourceReference", "sourceConfidence", "originalFileName", "originalFilePath",
    "originalFileSize", "notes", "totalLines", "validLines", "errorLines", "warningLines", "qualityScore",
    "createdById", "uploadedAt", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "boq_revisions" (
    "id", "tenantId", "boqId", "costCentreId", "revisionNumber", "revisionCode", "status", "preparationStatus",
    "budgetStatus", "prStatus", "sourceType", "sourceFile", "sourceReference", "sourceConfidence",
    "originalFileName", "originalFilePath", "originalFileSize", "notes", "totalLines", "validLines", "errorLines",
    "warningLines", "qualityScore", "createdById", "uploadedAt", "createdAt", "updatedAt"
  )
  SELECT i."id", i."tenantId", i."boqId", i."costCentreId",
    COALESCE((SELECT MAX("revisionNumber") + 1 FROM "boq_revisions" WHERE "boqId" = i."boqId" AND "tenantId" = i."tenantId"), 0),
    'R' || COALESCE((SELECT MAX("revisionNumber") + 1 FROM "boq_revisions" WHERE "boqId" = i."boqId" AND "tenantId" = i."tenantId"), 0),
    i."status", i."preparationStatus", i."budgetStatus", i."prStatus", i."sourceType", i."sourceFile", i."sourceReference",
    i."sourceConfidence", i."originalFileName", i."originalFilePath", i."originalFileSize", i."notes", i."totalLines",
    i."validLines", i."errorLines", i."warningLines", i."qualityScore", i."createdById", i."uploadedAt", i."createdAt", i."updatedAt"
  FROM input i
  WHERE changes() = 1 AND EXISTS (
    SELECT 1 FROM "boqs" WHERE "id" = i."boqId" AND "tenantId" = i."tenantId"
  )
  RETURNING "id", "revisionCode", "revisionNumber"
`;

export const BOQ_TEMPLATE_UPDATE_METADATA_IF_CURRENT_SQL = `
  UPDATE "boqs"
  SET "title" = CASE WHEN ? = 1 THEN ? ELSE "title" END,
      "description" = CASE WHEN ? = 1 THEN ? ELSE "description" END,
      "purpose" = CASE WHEN ? = 1 THEN ? ELSE "purpose" END,
      "category" = CASE WHEN ? = 1 THEN ? ELSE "category" END,
      "costCentreId" = CASE WHEN ? = 1 THEN ? ELSE "costCentreId" END,
      "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "projectId" = ?
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM "boq_revisions" revision
      WHERE revision."id" = ? AND revision."boqId" = "boqs"."id" AND revision."tenantId" = ?
        AND revision."status" IS ? AND revision."updatedAt" IS ?
    ))
`;

export const BOQ_TEMPLATE_ASSERT_COMPLETE_SQL = `
  SELECT json_extract(CASE WHEN
    EXISTS (SELECT 1 FROM "boqs" WHERE "id" = ? AND "tenantId" = ?)
    AND EXISTS (SELECT 1 FROM "boq_revisions" WHERE "id" = ? AND "tenantId" = ? AND "boqId" = ?)
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ? AND "entityId" = ?)
    AND (SELECT COUNT(*) FROM "boq_lines" WHERE "boqRevisionId" = ? AND "tenantId" = ? AND "isDeleted" = 0) = ?
    AND EXISTS (
      SELECT 1 FROM "boq_revisions" WHERE "id" = ? AND "tenantId" = ?
        AND "totalLines" = ? AND "validLines" = ? AND "errorLines" = ?
        AND "warningLines" = ? AND "qualityScore" = ?
    )
    THEN '{}' ELSE 'invalid' END, '$') AS "complete"
`;

export const BOQ_LINE_INSERT_AFTER_REVISION_SQL = `
  INSERT INTO "boq_lines" (
    "id", "tenantId", "boqRevisionId", "lineNumber", "originalDescription", "standardDescription", "specification",
    "categoryId", "subcategoryId", "uomId", "uomRaw", "quantity", "location", "drawingReference", "brand", "model",
    "material", "grade", "remarks", "itemCode", "sourceSheet", "sourceRow", "sourceReference", "confidenceScore",
    "benchmarkEligible", "validationStatus", "validationMessages", "isDeleted", "deletedAt", "deletedBy",
    "aiSuggestedDescription", "aiSuggestedSpec", "aiReason", "aiConfidence", "userOverride", "userApprovedValue",
    "aiUnitCost", "aiTotalCost", "costConfidence", "costSource", "costMethod", "costDate", "geography", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE changes() = 1 AND EXISTS (
    SELECT 1 FROM "boq_revisions" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const BOQ_REVISION_UPDATE_LINE_COUNTS_AFTER_LINES_SQL = `
  UPDATE "boq_revisions"
  SET "totalLines" = ?, "validLines" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND changes() = 1
`;

export const BOQ_REVISION_TOUCH_IF_CURRENT_SQL = `
  UPDATE "boq_revisions" SET "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IS ? AND "updatedAt" IS ?
`;

export const BOQ_LINE_DELETE_AFTER_AUDIT_SQL = `
  DELETE FROM "boq_lines"
  WHERE "boqRevisionId" = ? AND "tenantId" = ?
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const BOQ_LINE_INSERT_AFTER_AUDIT_SQL = BOQ_LINE_INSERT_AFTER_REVISION_SQL.replace(
  'WHERE changes() = 1 AND EXISTS (',
  'WHERE EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?) AND EXISTS (',
);

export const BOQ_REVISION_UPDATE_MANUAL_METRICS_AFTER_AUDIT_SQL = `
  UPDATE "boq_revisions"
  SET "totalLines" = ?, "validLines" = ?, "errorLines" = ?, "warningLines" = ?, "qualityScore" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const BOQ_REVISION_UPDATE_IMPORT_METRICS_AFTER_AUDIT_SQL = `
  UPDATE "boq_revisions"
  SET "columnMapping" = ?, "totalLines" = ?, "validLines" = ?, "errorLines" = ?, "warningLines" = ?,
      "qualityScore" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const BOQ_MANUAL_AUDIT_INSERT_CREATED_AFTER_REVISION_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, 'BOQ', boq."id", ?, replace(?, '{{boqCode}}', boq."boqCode"), ?, ?, ?, ?, ?
  FROM "boqs" boq
  WHERE boq."id" = ? AND boq."tenantId" = ? AND changes() = 1
    AND EXISTS (
      SELECT 1 FROM "boq_revisions" revision
      WHERE revision."id" = ? AND revision."tenantId" = ? AND revision."boqId" = boq."id"
    )
`;

export const BOQ_DUPLICATE_AUDIT_INSERT_AFTER_CHANGE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, 'BOQ', duplicate."id", ?,
    replace(replace(replace(?, '{{boqCode}}', source."boqCode"), '{{boqCode2}}', duplicate."boqCode"), '{{title}}', COALESCE(duplicate."title", '')),
    ?, ?, ?, ?, ?
  FROM "boqs" duplicate
  JOIN "boqs" source ON source."id" = ? AND source."tenantId" = duplicate."tenantId"
  WHERE duplicate."id" = ? AND duplicate."tenantId" = ? AND changes() = 1
`;

export const RFQ_VENDOR_INVITATION_BULK_UPSERT_SQL = `
  WITH input AS (
    SELECT json_extract(value, '$.id') AS "id", json_extract(value, '$.vendorId') AS "vendorId"
    FROM json_each(?)
  ), eligible AS (
    SELECT input."id", input."vendorId"
    FROM input
    JOIN "vendors" v ON v."id" = input."vendorId" AND v."tenantId" = ? AND v."isBlacklisted" = 0
  )
  INSERT INTO "rfq_vendors"
    ("id", "tenantId", "rfqId", "vendorId", "invitationStatus", "submissionStatus")
  SELECT eligible."id", ?, ?, eligible."vendorId", ?, 'PENDING'
  FROM eligible
  WHERE EXISTS (
    SELECT 1 FROM "rfqs" r WHERE r."id" = ? AND r."tenantId" = ?
  )
    AND (SELECT COUNT(*) FROM input) = (SELECT COUNT(*) FROM eligible)
  ON CONFLICT ("rfqId", "vendorId") DO UPDATE SET
    "invitationStatus" = excluded."invitationStatus"
  WHERE "rfq_vendors"."tenantId" = excluded."tenantId"
`;

export const RFQ_INSERT_IF_VALID_SQL = `
  WITH input (
    "id", "tenantId", "projectId", "boqRevisionId", "year", "title", "scopeOfWork", "packageType", "packageName",
    "status", "submissionDeadline", "clarificationDeadline", "commercialValidityDays", "deliveryRequirement",
    "paymentTerms", "taxTerms", "requiredDocuments", "technicalRequirements", "commercialRequirements",
    "estimatedBenchmarkValue", "totalLines", "releasedAt", "prId", "createdAt", "updatedAt", "createdById"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "rfqs" (
    "id", "tenantId", "projectId", "boqRevisionId", "rfqNumber", "title", "scopeOfWork", "packageType", "packageName",
    "status", "submissionDeadline", "clarificationDeadline", "commercialValidityDays", "deliveryRequirement",
    "paymentTerms", "taxTerms", "requiredDocuments", "technicalRequirements", "commercialRequirements",
    "estimatedBenchmarkValue", "totalLines", "releasedAt", "prId", "createdAt", "updatedAt", "createdById"
  )
  SELECT
    i."id", i."tenantId", i."projectId", i."boqRevisionId",
    'RFQ-' || i."year" || '-' || printf('%06d', COALESCE((
      SELECT MAX(CAST(substr(existing."rfqNumber", -6) AS INTEGER))
      FROM "rfqs" existing WHERE existing."tenantId" = i."tenantId"
        AND existing."rfqNumber" LIKE 'RFQ-' || i."year" || '-%'
    ), 0) + 1),
    i."title", i."scopeOfWork", i."packageType", i."packageName", i."status", i."submissionDeadline",
    i."clarificationDeadline", i."commercialValidityDays", i."deliveryRequirement", i."paymentTerms", i."taxTerms",
    i."requiredDocuments", i."technicalRequirements", i."commercialRequirements", i."estimatedBenchmarkValue",
    i."totalLines", i."releasedAt", i."prId", i."createdAt", i."updatedAt", i."createdById"
  FROM input i
  WHERE EXISTS (
    SELECT 1 FROM "projects" p WHERE p."id" = i."projectId" AND p."tenantId" = i."tenantId"
  )
    AND EXISTS (
      SELECT 1 FROM "boq_revisions" r JOIN "boqs" b ON b."id" = r."boqId"
      WHERE r."id" = i."boqRevisionId" AND r."tenantId" = i."tenantId" AND b."projectId" = i."projectId"
        AND (r."status" = 'APPROVED' OR r."prStatus" IN ('PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT')
          OR EXISTS (
            SELECT 1 FROM "procurement_requests" approved_pr
            WHERE approved_pr."tenantId" = i."tenantId" AND approved_pr."boqRevisionId" = r."id"
              AND approved_pr."status" IN ('PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT')
          ))
    )
    AND (i."prId" IS NULL OR EXISTS (
      SELECT 1 FROM "procurement_requests" pr
      WHERE pr."id" = i."prId" AND pr."tenantId" = i."tenantId" AND pr."projectId" = i."projectId"
        AND pr."boqRevisionId" = i."boqRevisionId"
        AND pr."status" IN ('PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT')
    ))
    AND (i."prId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "rfqs" existing
      WHERE existing."tenantId" = i."tenantId" AND existing."prId" = i."prId" AND existing."status" <> 'CANCELLED'
    ))
  ON CONFLICT ("tenantId", "rfqNumber") DO NOTHING
  RETURNING "id", "rfqNumber"
`;

export const RFQ_LINE_INSERT_AFTER_HEADER_SQL = `
  INSERT INTO "rfq_lines" (
    "id", "tenantId", "rfqId", "projectId", "costCentreId", "boqId", "boqRevisionId", "boqLineId", "prLineId",
    "lineNumber", "description", "specification", "category", "subcategory", "uom", "quantity", "benchmarkRate",
    "benchmarkAmount", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE changes() = 1 AND EXISTS (
    SELECT 1 FROM "rfqs" WHERE "id" = ? AND "tenantId" = ? AND "projectId" = ?
  )
`;

export const RFQ_VENDOR_INVITATION_INSERT_AFTER_CHANGE_SQL = `
  INSERT INTO "rfq_vendors" ("id", "tenantId", "rfqId", "vendorId", "invitationStatus", "submissionStatus")
  SELECT ?, ?, ?, ?, ?, 'PENDING'
  WHERE changes() = 1 AND EXISTS (
    SELECT 1 FROM "vendors" WHERE "id" = ? AND "tenantId" = ?
  )
  ON CONFLICT ("rfqId", "vendorId") DO UPDATE SET
    "invitationStatus" = excluded."invitationStatus"
  WHERE "rfq_vendors"."tenantId" = excluded."tenantId"
`;

export const AUDIT_LOG_INSERT_FAIL_CLOSED_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
`;

export const RFQ_VENDOR_INVITATION_AUDIT_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() > 0 THEN ? ELSE NULL END, ?, ?, ?, 'RFQ', ?, 'VENDOR_INVITED', ?, NULL, ?, NULL, NULL, ?
`;

export const D1_BATCH_STATEMENT_FAILED = 'D1 batch statement failed';
export const D1_BATCH_STATEMENT_LIMIT_EXCEEDED = 'D1 batch statement limit exceeded';
export const D1_QUOTE_INSERT_RESULT_MISSING = 'D1 quote insert did not return the created quote';
export const RATE_CARD_APPROVAL_INSERT_AFTER_UPDATE_SQL = `
  INSERT INTO "rate_card_approvals" (
    "id", "tenantId", "rateCardId", "level", "approverId", "approverName", "approverEmail",
    "action", "remarks", "timestamp"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE changes() = 1
`;

export const RATE_CARD_TRANSITION_ASSERT_SQL = `
  SELECT json_extract(CASE WHEN
    EXISTS (
      SELECT 1 FROM "rate_card_approvals"
      WHERE "id" = ? AND "tenantId" = ? AND "rateCardId" = ?
    )
    AND EXISTS (
      SELECT 1 FROM "audit_logs"
      WHERE "id" = ? AND "tenantId" = ? AND "entityType" = ? AND "entityId" = ?
    )
    THEN '{}' ELSE 'invalid' END, '$') AS "transition"
`;

export const RATE_CARD_INSERT_IF_VENDOR_VALID_SQL = `
  INSERT INTO "vendor_rate_cards" (
    "id", "tenantId", "vendorId", "rateCardNumber", "version", "title", "category", "subcategory",
    "scope", "location", "status", "approvalLevel", "validFrom", "validTo", "currency", "terms",
    "submittedBy", "submittedAt", "approvedBy", "approvedAt", "notes", "justification", "comparisonNotes",
    "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, 'VRC-' || ? || '-' || printf('%06d', COALESCE((
    SELECT MAX(CAST(substr("rateCardNumber", -6) AS INTEGER))
    FROM "vendor_rate_cards"
    WHERE "tenantId" = ? AND "rateCardNumber" LIKE 'VRC-' || ? || '-%'
  ), 0) + 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (SELECT 1 FROM "vendors" WHERE "id" = ? AND "tenantId" = ?)
`;

export const RATE_CARD_ITEMS_INSERT_JSON_AFTER_CARD_SQL = `
  INSERT INTO "vendor_rate_card_items" (
    "id", "tenantId", "rateCardId", "standardBoqItemId", "itemCode", "description", "specification",
    "category", "subcategory", "uom", "rate", "proposedRate", "historicalRate", "benchmarkRate",
    "comparisonRef", "minQuantity", "maxQuantity", "location", "isActive", "createdAt", "updatedAt"
  )
  SELECT json_extract(value, '$.id'), json_extract(value, '$.tenantId'), json_extract(value, '$.rateCardId'),
    json_extract(value, '$.standardBoqItemId'), json_extract(value, '$.itemCode'), json_extract(value, '$.description'),
    json_extract(value, '$.specification'), json_extract(value, '$.category'), json_extract(value, '$.subcategory'),
    json_extract(value, '$.uom'), json_extract(value, '$.rate'), json_extract(value, '$.proposedRate'),
    json_extract(value, '$.historicalRate'), json_extract(value, '$.benchmarkRate'), json_extract(value, '$.comparisonRef'),
    json_extract(value, '$.minQuantity'), json_extract(value, '$.maxQuantity'), json_extract(value, '$.location'),
    json_extract(value, '$.isActive'), json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt')
  FROM json_each(?)
  WHERE EXISTS (
    SELECT 1 FROM "vendor_rate_cards" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const RATE_CARD_AUDIT_INSERT_AFTER_CREATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, NULL, 'VENDOR', ?, ?, REPLACE(?, '__RATE_CARD_NUMBER__', rc."rateCardNumber"),
    NULL, ?, NULL, NULL, ?
  FROM "vendor_rate_cards" rc
  WHERE rc."id" = ? AND rc."tenantId" = ?
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = rc."tenantId" AND i."rateCardId" = rc."id") = ?
`;

export const RATE_CARD_VENDOR_ACCEPT_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'PENDING_PROJECT_APPROVAL', "approvalLevel" = 'LEVEL_1_PROJECT',
      "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "vendorId" = ? AND "status" = 'CATEGORY_MANAGER_ACCEPTED'
`;

export const RATE_CARD_VENDOR_QUOTE_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = ?, "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "vendorId" = ? AND "status" = ?
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = "vendor_rate_cards"."tenantId"
        AND i."rateCardId" = "vendor_rate_cards"."id" AND i."isActive" = 1
        AND i."id" IN (SELECT value FROM json_each(?))) = ?
`;

export const RATE_CARD_ITEM_VENDOR_QUOTE_UPDATE_SQL = `
  UPDATE "vendor_rate_card_items"
  SET "proposedRate" = ?, "comparisonRef" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "rateCardId" = ? AND "isActive" = 1
    AND EXISTS (SELECT 1 FROM "vendor_rate_cards" r
      WHERE r."id" = "vendor_rate_card_items"."rateCardId"
        AND r."tenantId" = "vendor_rate_card_items"."tenantId" AND r."status" = ?)
`;

export const RATE_CARD_SUBMIT_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'PENDING_PROJECT_APPROVAL', "approvalLevel" = 'LEVEL_1_PROJECT',
      "submittedBy" = ?, "submittedAt" = ?, "rejectionReason" = NULL, "revertReason" = NULL,
      "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ? AND "approvalLevel" IS ?
`;

export const RATE_CARD_APPROVE_PROJECT_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'PENDING_FINANCE_APPROVAL', "approvalLevel" = 'LEVEL_2_FINANCE',
      "projectApprovedBy" = ?, "projectApprovedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ? AND "approvalLevel" IS ?
`;

export const RATE_CARD_APPROVE_FINANCE_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'APPROVED', "approvalLevel" = 'COMPLETED', "financeApprovedBy" = ?,
      "financeApprovedAt" = ?, "approvedBy" = ?, "approvedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ? AND "approvalLevel" IS ?
`;

export const RATE_CARD_REJECT_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'REJECTED', "rejectionReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ? AND "approvalLevel" IS ?
`;

export const RATE_CARD_REVERT_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'RETURNED_FOR_CORRECTION', "revertReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ? AND "approvalLevel" IS ?
`;

export const RATE_CARD_DRAFT_DELETE_AUDIT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, rc."tenantId", ?, NULL, 'VENDOR', rc."vendorId", 'RATE_CARD_DRAFT_DELETED', ?, NULL, ?, NULL, NULL, ?
  FROM "vendor_rate_cards" rc
  WHERE rc."id" = ? AND rc."tenantId" = ? AND rc."status" = 'DRAFT'
`;

export const RATE_CARD_DRAFT_DELETE_AFTER_AUDIT_SQL = `
  DELETE FROM "vendor_rate_cards"
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'DRAFT'
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const RATE_CARD_CATEGORY_ACCEPT_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'CATEGORY_MANAGER_ACCEPTED', "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
    AND "status" IN ('FINAL_VENDOR_OFFER_ACCEPTED', 'ROUND_2_VENDOR_QUOTE', 'ROUND_1_VENDOR_QUOTE', 'NEGOTIATION', 'ROUND_2_BUYER_OFFER')
`;

export const RATE_CARD_CATEGORY_SIGNOFF_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'PENDING_PROJECT_APPROVAL', "approvalLevel" = 'LEVEL_1_PROJECT',
      "submittedBy" = ?, "submittedAt" = ?, "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'VENDOR_ACCEPTED'
`;

export const RATE_CARD_BUYER_OFFER2_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'ROUND_2_BUYER_OFFER', "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = "vendor_rate_cards"."tenantId" AND i."rateCardId" = "vendor_rate_cards"."id") = ?
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = "vendor_rate_cards"."tenantId" AND i."rateCardId" = "vendor_rate_cards"."id"
        AND i."id" IN (SELECT json_extract(value, '$.id') FROM json_each(?))) = ?
`;

export const RATE_CARD_BUYER_OFFER2_DRAFT_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'ROUND_1_VENDOR_QUOTE'
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = "vendor_rate_cards"."tenantId" AND i."rateCardId" = "vendor_rate_cards"."id") = ?
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = "vendor_rate_cards"."tenantId" AND i."rateCardId" = "vendor_rate_cards"."id"
        AND i."id" IN (SELECT json_extract(value, '$.id') FROM json_each(?))) = ?
`;

export const RATE_CARD_FINAL_VENDOR_OFFER_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "status" = 'FINAL_VENDOR_OFFER_ACCEPTED', "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = "vendor_rate_cards"."tenantId" AND i."rateCardId" = "vendor_rate_cards"."id") = ?
    AND (SELECT COUNT(*) FROM "vendor_rate_card_items" i
      WHERE i."tenantId" = "vendor_rate_cards"."tenantId" AND i."rateCardId" = "vendor_rate_cards"."id"
        AND i."id" IN (SELECT json_extract(value, '$.id') FROM json_each(?))) = ?
`;

export const RATE_CARD_ITEMS_JSON_UPDATE_AFTER_CARD_SQL = `
  UPDATE "vendor_rate_card_items"
  SET "rate" = COALESCE(CAST(json_extract((
        SELECT value FROM json_each(?) input WHERE json_extract(input.value, '$.id') = "vendor_rate_card_items"."id"
      ), '$.rate') AS REAL), "rate"),
      "comparisonRef" = json_extract((
        SELECT value FROM json_each(?) input WHERE json_extract(input.value, '$.id') = "vendor_rate_card_items"."id"
      ), '$.comparisonRef'),
      "updatedAt" = ?
  WHERE "tenantId" = ? AND "rateCardId" = ?
    AND "id" IN (SELECT json_extract(value, '$.id') FROM json_each(?))
    AND EXISTS (
      SELECT 1 FROM "vendor_rate_cards" rc
      WHERE rc."id" = "vendor_rate_card_items"."rateCardId"
        AND rc."tenantId" = "vendor_rate_card_items"."tenantId"
        AND rc."status" = ? AND rc."updatedAt" = ?
    )
`;

export const RATE_CARD_AUDIT_INSERT_AFTER_ITEMS_UPDATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, NULL, 'VENDOR', ?, ?, ?, NULL, ?, NULL, NULL, ?
  WHERE EXISTS (
    SELECT 1 FROM "vendor_rate_cards" rc
    WHERE rc."id" = ? AND rc."tenantId" = ? AND rc."status" = ? AND rc."updatedAt" = ?
  ) AND (
    SELECT COUNT(*) FROM "vendor_rate_card_items" i
    WHERE i."tenantId" = ? AND i."rateCardId" = ? AND i."updatedAt" = ?
      AND i."id" IN (SELECT json_extract(value, '$.id') FROM json_each(?))
  ) = ?
`;

export const RATE_CARD_DETAIL_UPDATE_SQL = `
  UPDATE "vendor_rate_cards"
  SET "title" = ?, "category" = ?, "subcategory" = ?, "scope" = ?, "location" = ?, "version" = ?,
      "validFrom" = ?, "validTo" = ?, "terms" = ?, "notes" = ?, "justification" = ?,
      "comparisonNotes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ? AND "updatedAt" IS ?
`;

export const RATE_CARD_DETAIL_ITEMS_DELETE_AFTER_UPDATE_SQL = `
  DELETE FROM "vendor_rate_card_items"
  WHERE "tenantId" = ? AND "rateCardId" = ?
    AND "id" NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?))
    AND EXISTS (
      SELECT 1 FROM "vendor_rate_cards" rc
      WHERE rc."id" = "vendor_rate_card_items"."rateCardId"
        AND rc."tenantId" = "vendor_rate_card_items"."tenantId"
        AND rc."status" = ? AND rc."updatedAt" = ?
    )
`;

export const RATE_CARD_DETAIL_ITEMS_UPSERT_JSON_SQL = `
  INSERT INTO "vendor_rate_card_items" (
    "id", "tenantId", "rateCardId", "standardBoqItemId", "itemCode", "description", "specification",
    "category", "subcategory", "uom", "rate", "proposedRate", "historicalRate", "benchmarkRate",
    "comparisonRef", "minQuantity", "maxQuantity", "location", "isActive", "createdAt", "updatedAt"
  )
  SELECT
    json_extract(item.value, '$.id'), json_extract(item.value, '$.tenantId'),
    json_extract(item.value, '$.rateCardId'), json_extract(item.value, '$.standardBoqItemId'),
    json_extract(item.value, '$.itemCode'), json_extract(item.value, '$.description'),
    json_extract(item.value, '$.specification'), json_extract(item.value, '$.category'),
    json_extract(item.value, '$.subcategory'), json_extract(item.value, '$.uom'),
    json_extract(item.value, '$.rate'), json_extract(item.value, '$.proposedRate'),
    json_extract(item.value, '$.historicalRate'), json_extract(item.value, '$.benchmarkRate'),
    json_extract(item.value, '$.comparisonRef'), json_extract(item.value, '$.minQuantity'),
    json_extract(item.value, '$.maxQuantity'), json_extract(item.value, '$.location'),
    json_extract(item.value, '$.isActive'), json_extract(item.value, '$.createdAt'),
    json_extract(item.value, '$.updatedAt')
  FROM json_each(?) item
  WHERE EXISTS (
    SELECT 1 FROM "vendor_rate_cards" rc
    WHERE rc."id" = ? AND rc."tenantId" = ? AND rc."status" = ? AND rc."updatedAt" = ?
  )
  ON CONFLICT ("id") DO UPDATE SET
    "standardBoqItemId" = excluded."standardBoqItemId", "itemCode" = excluded."itemCode",
    "description" = excluded."description", "specification" = excluded."specification",
    "category" = excluded."category", "subcategory" = excluded."subcategory", "uom" = excluded."uom",
    "rate" = excluded."rate", "proposedRate" = excluded."proposedRate",
    "historicalRate" = excluded."historicalRate", "benchmarkRate" = excluded."benchmarkRate",
    "comparisonRef" = excluded."comparisonRef", "minQuantity" = excluded."minQuantity",
    "maxQuantity" = excluded."maxQuantity", "location" = excluded."location",
    "isActive" = excluded."isActive", "updatedAt" = excluded."updatedAt"
  WHERE "vendor_rate_card_items"."tenantId" = excluded."tenantId"
    AND "vendor_rate_card_items"."rateCardId" = excluded."rateCardId"
`;

export const RATE_CARD_DETAIL_AUDIT_AFTER_UPDATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, NULL, 'VENDOR', ?, ?, ?, ?, ?, NULL, NULL, ?
  WHERE EXISTS (
    SELECT 1 FROM "vendor_rate_cards" rc
    WHERE rc."id" = ? AND rc."tenantId" = ? AND rc."status" = ? AND rc."updatedAt" = ?
  ) AND (
    SELECT COUNT(*) FROM "vendor_rate_card_items" i
    WHERE i."tenantId" = ? AND i."rateCardId" = ?
  ) = ?
`;

export const PROCUREMENT_REQUEST_INSERT_IF_VALID_SQL = `
  INSERT INTO "procurement_requests" (
    "id", "tenantId", "prNumber", "projectId", "costCentreId", "boqId", "boqRevisionId",
    "title", "purpose", "totalEstimatedValue", "totalLines", "status", "requestedBy",
    "requestedDate", "requiredDate", "createdAt", "updatedAt"
  )
  SELECT ?, ?, 'PR-' || ? || '-' || printf('%06d', COALESCE((
    SELECT MAX(CAST(substr("prNumber", -6) AS INTEGER))
    FROM "procurement_requests"
    WHERE "tenantId" = ? AND "prNumber" LIKE 'PR-' || ? || '-%'
  ), 0) + 1), ?, ?, ?, ?, ?, 'PROCUREMENT_SOURCING', ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "boq_revisions"
    WHERE "id" = ? AND "tenantId" = ? AND "boqId" = ?
  )
    AND EXISTS (
      SELECT 1 FROM "boqs"
      WHERE "id" = ? AND "tenantId" = ? AND "projectId" = ?
    )
    AND EXISTS (
      SELECT 1 FROM "cost_centres"
      WHERE "id" = ? AND "tenantId" = ? AND "projectId" = ?
    )
    AND NOT EXISTS (
      SELECT 1 FROM "procurement_requests"
      WHERE "tenantId" = ? AND "boqRevisionId" = ?
        AND "status" NOT IN ('PR_REJECTED', 'CANCELLED')
    )
  RETURNING "id", "prNumber"
`;

export const PROCUREMENT_REQUEST_LINE_INSERT_AFTER_PARENT_SQL = `
  INSERT INTO "pr_lines" (
    "id", "tenantId", "prId", "projectId", "costCentreId", "boqId", "boqRevisionId", "boqLineId",
    "lineNumber", "itemDescription", "specification", "category", "subcategory", "uom", "quantity",
    "estimatedRate", "estimatedValue", "drawingReference", "requiredDate", "costCentre", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE changes() = 1
`;

export const PROCUREMENT_REQUEST_REVISION_UPDATE_AFTER_LINES_SQL = `
  UPDATE "boq_revisions"
  SET "costCentreId" = ?, "prStatus" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND changes() = 1
`;

export const PROCUREMENT_REQUEST_BOQ_UPDATE_AFTER_REVISION_SQL = `
  UPDATE "boqs"
  SET "costCentreId" = ?,
      "purpose" = CASE WHEN "purpose" IN ('BUDGET', 'BOTH') THEN 'BOTH' ELSE 'PR' END,
      "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND changes() = 1
`;

export const PROCUREMENT_REQUEST_AUDIT_INSERT_AFTER_BOQ_UPDATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?, 'PR', "id", 'PR_CREATED_FROM_BOQ',
    'Procurement Request ' || "prNumber" || ' created from BOQ ' || ? || ' with ' || ? || ' lines.',
    NULL, ?, NULL, NULL, ?
  FROM "procurement_requests" WHERE "id" = ? AND "tenantId" = ?
`;

export const NEGOTIATION_ENSURE_ACTIVE_FOR_RFQ_SQL = `
  INSERT INTO "negotiations" (
    "id", "tenantId", "rfqId", "status", "currentRound", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, 'ACTIVE', 1, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "rfqs"
    WHERE "id" = ? AND "tenantId" = ?
      AND "status" IN ('RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION')
  )
  ON CONFLICT ("tenantId", "rfqId") DO UPDATE SET "updatedAt" = excluded."updatedAt"
    WHERE "negotiations"."status" = 'ACTIVE'
  RETURNING "id"
`;

export const NEGOTIATION_OFFER_ROUND_INSERT_SQL = `
  INSERT INTO "negotiation_rounds" (
    "id", "tenantId", "negotiationId", "vendorId", "roundNumber", "deadline", "targetPrice",
    "previousQuoteAmount", "counterOfferAmount", "revisedQuoteAmount", "savingsAmount", "savingsPercent",
    "status", "notes", "isFinalOffer", "buyerDecision", "nextResponsibleParty", "lineItemsJson",
    "submittedByVendor", "createdAt", "updatedAt"
  )
  SELECT ?, ?, (SELECT "id" FROM "negotiations" WHERE "tenantId" = ? AND "rfqId" = ?), ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "negotiations"
    WHERE "tenantId" = ? AND "rfqId" = ? AND "status" = 'ACTIVE'
  )
    AND EXISTS (
      SELECT 1 FROM "rfqs"
      WHERE "id" = ? AND "tenantId" = ?
        AND "status" IN ('RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION')
    )
    AND (? = 0 OR COALESCE((
      SELECT MAX("quoteVersion") FROM "quotes" WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
    ), 0) < 20)
  RETURNING "id"
`;

export const NEGOTIATION_OFFER_ROUND_UPDATE_SQL = `
  UPDATE "negotiation_rounds"
  SET "revisedQuoteAmount" = ?, "savingsAmount" = ?, "savingsPercent" = ?, "status" = ?, "notes" = ?,
      "isFinalOffer" = ?, "buyerDecision" = ?, "nextResponsibleParty" = ?, "lineItemsJson" = ?,
      "submittedByVendor" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "vendorId" = ?
    AND "negotiationId" = (SELECT "id" FROM "negotiations" WHERE "tenantId" = ? AND "rfqId" = ?)
    AND "nextResponsibleParty" = 'VENDOR'
    AND "counterOfferAmount" IS ? AND "revisedQuoteAmount" IS ?
    AND EXISTS (
      SELECT 1 FROM "rfqs"
      WHERE "id" = ? AND "tenantId" = ?
        AND "status" IN ('RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION')
    )
    AND (? = 0 OR COALESCE((
      SELECT MAX("quoteVersion") FROM "quotes" WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
    ), 0) < 20)
  RETURNING "id"
`;

export const NEGOTIATION_OFFER_QUOTE_INSERT_SQL = `
  INSERT INTO "quotes" (
    "id", "tenantId", "rfqId", "vendorId", "quoteNumber", "quoteVersion", "status",
    "totalBaseAmount", "taxAmount", "discountAmount", "totalQuoteAmount", "submittedAt", "submittedBy",
    "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, 'QT-' || ? || '-' || printf('%02d', COALESCE((
      SELECT MAX("quoteVersion") FROM "quotes" WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
    ), 0) + 1), COALESCE((
      SELECT MAX("quoteVersion") FROM "quotes" WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
    ), 0) + 1, 'SUBMITTED', ?, ?, 0, ?, ?, ?, ?, ?
  WHERE changes() = 1
    AND COALESCE((
      SELECT MAX("quoteVersion") FROM "quotes" WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
    ), 0) < 20
    AND EXISTS (
      SELECT 1 FROM "rfqs" WHERE "id" = ? AND "tenantId" = ?
        AND "status" IN ('RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION')
    )
  RETURNING "id", "quoteNumber", "quoteVersion"
`;

export const NEGOTIATION_OFFER_QUOTE_LINE_INSERT_AFTER_QUOTE_SQL = `
  INSERT INTO "quote_lines" (
    "id", "tenantId", "quoteId", "rfqLineId", "unitRate", "taxPercent", "discountPercent", "lineTotal", "remarks"
  )
  SELECT ?, ?, ?, ?, ?, 18, 0, ?, ?
  WHERE changes() = 1
`;

export const NEGOTIATION_OFFER_PARENT_UPDATE_SQL = `
  UPDATE "negotiations"
  SET "currentRound" = MAX("currentRound", ?), "bestQuoteAmount" = ?, "updatedAt" = ?
  WHERE "tenantId" = ? AND "rfqId" = ? AND "status" = 'ACTIVE' AND changes() = 1
`;

export const NEGOTIATION_OFFER_RFQ_UPDATE_SQL = `
  UPDATE "rfqs" SET "status" = 'NEGOTIATION', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
    AND "status" IN ('RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'NEGOTIATION')
    AND changes() = 1
`;

export const NEGOTIATION_OFFER_MESSAGE_INSERT_SQL = `
  INSERT INTO "rfq_messages" (
    "id", "tenantId", "rfqId", "senderId", "senderName", "senderRole", "message",
    "attachments", "isVendorSent", "vendorId", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ? WHERE changes() = 1
`;

export const NEGOTIATION_OFFER_AUDIT_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, 'NEGOTIATION', ?, ?, ?, NULL, ?, NULL, NULL, ? WHERE changes() = 1
`;

export const PR_SUBMIT_STATUS_UPDATE_SQL = `
  UPDATE "procurement_requests"
  SET "status" = 'PR_PENDING_PROJECT_APPROVAL', "requestedDate" = ?, "requestedBy" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('PR_DRAFT', 'PR_RETURNED_FOR_CORRECTION')
`;

export const PR_APPROVE_STATUS_UPDATE_SQL = `
  UPDATE "procurement_requests"
  SET "status" = 'PR_RELEASED_TO_PROCUREMENT', "projectApprovedAt" = ?, "projectApprovedBy" = ?,
      "releasedAt" = ?, "releasedBy" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PR_PENDING_PROJECT_APPROVAL'
`;

export const PR_REJECT_STATUS_UPDATE_SQL = `
  UPDATE "procurement_requests"
  SET "status" = 'PR_REJECTED', "rejectionReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PR_PENDING_PROJECT_APPROVAL'
`;

export const PR_REVERT_STATUS_UPDATE_SQL = `
  UPDATE "procurement_requests"
  SET "status" = 'PR_RETURNED_FOR_CORRECTION', "rejectionReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PR_PENDING_PROJECT_APPROVAL'
`;

export const PR_RELEASE_STATUS_UPDATE_SQL = `
  UPDATE "procurement_requests"
  SET "status" = 'PR_RELEASED_TO_PROCUREMENT', "releasedAt" = ?, "releasedBy" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PR_APPROVED'
`;

export const PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL = `
  INSERT INTO "pr_approvals" ("id", "tenantId", "prId", "approverId", "status", "remarks", "timestamp")
  SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
`;

export const PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL = `
  UPDATE "boq_revisions" SET "prStatus" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND changes() = 1
`;

export const PR_REVISION_REVERT_UPDATE_AFTER_APPROVAL_SQL = `
  UPDATE "boq_revisions" SET "prStatus" = 'PR_RETURNED_FOR_CORRECTION', "rejectionReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND changes() = 1
`;

export const PR_AUDIT_INSERT_AFTER_TRANSITION_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
`;

export const BUDGET_CONTRIBUTION_SUBMIT_SQL = `
  UPDATE "budget_contributions"
  SET "status" = 'PENDING_PROJECT_APPROVAL', "submittedAt" = ?, "submittedBy" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'DRAFT'
`;

export const BUDGET_CONTRIBUTION_PROJECT_APPROVE_SQL = `
  UPDATE "budget_contributions"
  SET "status" = ?, "projectApprovedAt" = ?, "projectApprovedBy" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('PENDING_PROJECT_APPROVAL', 'UNDER_APPROVAL')
`;

export const BUDGET_CONTRIBUTION_FINANCE_APPROVE_SQL = `
  UPDATE "budget_contributions"
  SET "status" = 'APPROVED', "financeApprovedAt" = ?, "financeApprovedBy" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED')
`;

export const BUDGET_CONTRIBUTION_PROJECT_REJECT_SQL = `
  UPDATE "budget_contributions"
  SET "status" = 'REJECTED', "rejectionReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('PENDING_PROJECT_APPROVAL', 'UNDER_APPROVAL')
`;

export const BUDGET_CONTRIBUTION_FINANCE_REJECT_SQL = `
  UPDATE "budget_contributions"
  SET "status" = 'REJECTED', "rejectionReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED')
`;

export const BUDGET_APPROVAL_INSERT_AFTER_AUDIT_SQL = `
  INSERT INTO "budget_approvals" (
    "id", "tenantId", "contributionId", "approvalLevel", "approverId", "status", "reason", "timestamp"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const PR_APPROVAL_MESSAGE_INSERT_SQL = `
  INSERT INTO "pr_approvals" ("id", "tenantId", "prId", "approverId", "status", "remarks", "timestamp")
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export const BUDGET_APPROVAL_MESSAGE_INSERT_SQL = `
  INSERT INTO "budget_approvals" ("id", "tenantId", "contributionId", "approvalLevel", "approverId", "status", "reason", "timestamp")
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

export const CATEGORY_INSERT_IF_VALID_SQL = `
  INSERT INTO "categories" (
    "id", "tenantId", "name", "code", "parentId", "level", "isActive", "sortOrder", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, 1, 0, ?, ?
  WHERE (? IS NULL OR EXISTS (
    SELECT 1 FROM "categories" WHERE "id" = ? AND "tenantId" = ? AND "isActive" = 1
  ))
    AND NOT EXISTS (
      SELECT 1 FROM "categories" WHERE "tenantId" = ? AND "name" = ? AND "parentId" IS ?
    )
`;

export const BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
`;

export const BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL = `
  UPDATE "budget_transactions" SET "status" = ?
  WHERE "tenantId" = ? AND "contributionId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const BUDGET_REVISION_UPDATE_AFTER_AUDIT_SQL = `
  UPDATE "boq_revisions" SET "budgetStatus" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const BUDGET_AGGREGATE_PROJECT_APPROVE_UPSERT_SQL = `
  INSERT INTO "budgets" (
    "id", "tenantId", "projectId", "costCentreId", "totalAmount", "approvedAmount", "pendingAmount",
    "status", "createdAt", "updatedAt", "createdBy"
  )
  SELECT ?, ?, ?, ?, ?, ?, 0, 'APPROVED', ?, ?, ? WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
  ON CONFLICT ("tenantId", "costCentreId") DO UPDATE SET
    "approvedAmount" = "budgets"."approvedAmount" + excluded."approvedAmount",
    "pendingAmount" = MAX(0, "budgets"."pendingAmount" - ?),
    "status" = 'APPROVED', "updatedAt" = excluded."updatedAt"
  WHERE "budgets"."projectId" = excluded."projectId"
`;

export const BUDGET_AGGREGATE_FINANCE_APPROVE_UPSERT_SQL = `
  INSERT INTO "budgets" (
    "id", "tenantId", "projectId", "costCentreId", "totalAmount", "approvedAmount", "pendingAmount",
    "status", "createdAt", "updatedAt", "createdBy"
  )
  SELECT ?, ?, ?, ?, ?, ?, 0, 'APPROVED', ?, ?, ? WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
  ON CONFLICT ("tenantId", "costCentreId") DO UPDATE SET
    "totalAmount" = "budgets"."totalAmount" + excluded."totalAmount",
    "approvedAmount" = "budgets"."approvedAmount" + excluded."approvedAmount",
    "pendingAmount" = MAX(0, "budgets"."pendingAmount" - ?),
    "status" = 'APPROVED', "updatedAt" = excluded."updatedAt"
  WHERE "budgets"."projectId" = excluded."projectId"
`;

export const BUDGET_AGGREGATE_PENDING_DECREMENT_SQL = `
  UPDATE "budgets"
  SET "pendingAmount" = MAX(0, "pendingAmount" - ?), "updatedAt" = ?
  WHERE "tenantId" = ? AND "projectId" = ? AND "costCentreId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const BUDGET_CONTRIBUTION_CREATE_UNDER_APPROVAL_SQL = `
  INSERT INTO "budget_contributions" (
    "id", "tenantId", "projectId", "costCentreId", "boqId", "boqRevisionId",
    "totalEstimatedValue", "acceptedEstimatedValue", "status", "submittedAt", "submittedBy",
    "createdAt", "updatedAt", "createdBy"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'UNDER_APPROVAL', ?, ?, ?, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM "budget_contributions" WHERE "tenantId" = ? AND "boqRevisionId" = ?
  )
`;

export const BUDGET_CONTRIBUTION_RESUBMIT_SQL = `
  UPDATE "budget_contributions"
  SET "projectId" = ?, "costCentreId" = ?, "totalEstimatedValue" = ?, "acceptedEstimatedValue" = ?,
      "status" = 'UNDER_APPROVAL', "submittedAt" = ?, "submittedBy" = ?, "rejectionReason" = NULL, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('DRAFT', 'REJECTED')
`;

export const BUDGET_TRANSACTION_INSERT_AFTER_AUDIT_SQL = `
  INSERT INTO "budget_transactions" (
    "id", "tenantId", "transactionCode", "projectId", "costCentreId", "boqId", "boqRevisionId",
    "boqLineId", "contributionId", "category", "amount", "quantity", "rate", "status",
    "reference", "createdBy", "budgetDate", "createdAt"
  )
  SELECT ?, ?, 'BTX-' || printf('%06d', (
    SELECT COALESCE(MAX(CASE WHEN "transactionCode" GLOB 'BTX-[0-9]*'
      THEN CAST(substr("transactionCode", 5) AS INTEGER) ELSE 0 END), 0) + 1
    FROM "budget_transactions" WHERE "tenantId" = ?
  )), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNDER_APPROVAL', ?, ?, ?, ?
  WHERE EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
  RETURNING "id", "transactionCode"
`;

export const BUDGET_CONTRIBUTION_REVISION_UPDATE_AFTER_AUDIT_SQL = `
  UPDATE "boq_revisions" SET "budgetStatus" = 'BUDGET_UNDER_APPROVAL', "costCentreId" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const BUDGET_CONTRIBUTION_BOQ_UPDATE_AFTER_AUDIT_SQL = `
  UPDATE "boqs"
  SET "costCentreId" = ?,
      "purpose" = CASE WHEN "purpose" IN ('PR', 'BOTH') THEN 'BOTH' ELSE 'BUDGET' END,
      "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const BUDGET_AGGREGATE_PENDING_UPSERT_SQL = `
  INSERT INTO "budgets" (
    "id", "tenantId", "projectId", "costCentreId", "totalAmount", "approvedAmount", "pendingAmount",
    "status", "createdAt", "updatedAt", "createdBy"
  )
  SELECT ?, ?, ?, ?, ?, 0, ?, 'UNDER_APPROVAL', ?, ?, ? WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
  ON CONFLICT ("tenantId", "costCentreId") DO UPDATE SET
    "pendingAmount" = "budgets"."pendingAmount" + excluded."pendingAmount",
    "status" = 'UNDER_APPROVAL', "updatedAt" = excluded."updatedAt"
  WHERE "budgets"."projectId" = excluded."projectId"
`;

export const BUDGET_CONTRIBUTION_ASSERT_AFTER_UPSERT_SQL = `
  SELECT json_extract(CASE WHEN
    changes() = 1
    AND EXISTS (
      SELECT 1 FROM "budget_contributions"
      WHERE "id" = ? AND "tenantId" = ? AND "boqRevisionId" = ?
        AND "projectId" = ? AND "costCentreId" = ? AND "status" = 'UNDER_APPROVAL'
    )
    AND EXISTS (
      SELECT 1 FROM "audit_logs"
      WHERE "id" = ? AND "tenantId" = ?
        AND "entityType" = 'BUDGET_CONTRIBUTION' AND "entityId" = ?
    )
    AND (
      SELECT COUNT(*) FROM "budget_transactions"
      WHERE "tenantId" = ? AND "contributionId" = ? AND "projectId" = ?
        AND "costCentreId" = ? AND "boqId" = ? AND "boqRevisionId" = ?
        AND "status" = 'UNDER_APPROVAL'
    ) = ?
    AND EXISTS (
      SELECT 1 FROM "boq_revisions"
      WHERE "id" = ? AND "tenantId" = ? AND "boqId" = ?
        AND "costCentreId" = ? AND "budgetStatus" = 'BUDGET_UNDER_APPROVAL'
    )
    AND EXISTS (
      SELECT 1 FROM "boqs"
      WHERE "id" = ? AND "tenantId" = ? AND "costCentreId" = ?
        AND "purpose" IN ('BUDGET', 'BOTH')
    )
    AND EXISTS (
      SELECT 1 FROM "budgets"
      WHERE "tenantId" = ? AND "costCentreId" = ? AND "projectId" = ?
        AND "status" = 'UNDER_APPROVAL' AND "pendingAmount" >= ?
    )
    THEN '{}' ELSE 'invalid' END, '$') AS "allocation"
`;

export const BUDGET_TRANSACTION_DELETE_AFTER_AUDIT_SQL = `
  DELETE FROM "budget_transactions"
  WHERE "tenantId" = ? AND "contributionId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const BUDGET_TRANSACTION_REVERSE_CAS_SQL = `
  UPDATE "budget_transactions" SET "status" = 'REVERSED'
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'APPROVED' AND "isReversal" = 0
    AND NOT EXISTS (
      SELECT 1 FROM "budget_transactions" reversal
      WHERE reversal."tenantId" = ? AND reversal."reversedTransactionId" = ? AND reversal."isReversal" = 1
    )
`;

export const BUDGET_REVERSAL_INSERT_AFTER_STATUS_SQL = `
  INSERT INTO "budget_transactions" (
    "id", "tenantId", "transactionCode", "projectId", "costCentreId", "boqId", "boqRevisionId",
    "boqLineId", "contributionId", "category", "subcategory", "uom", "amount", "quantity", "rate",
    "budgetDate", "createdBy", "status", "isReversal", "reversalReason", "reversedTransactionId",
    "reference", "createdAt"
  )
  SELECT ?, ?, 'BTX-REV-' || printf('%05d', (
    SELECT COALESCE(MAX(CASE WHEN "transactionCode" GLOB 'BTX-REV-[0-9]*'
      THEN CAST(substr("transactionCode", 9) AS INTEGER) ELSE 0 END), 0) + 1
    FROM "budget_transactions" WHERE "tenantId" = ?
  )), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 1, ?, ?, ?, ?
  WHERE changes() = 1
  RETURNING "id", "transactionCode", "tenantId", "projectId", "costCentreId", "amount", "quantity",
    "isReversal", "reversalReason", "reversedTransactionId", "createdAt"
`;

export const BUDGET_AGGREGATE_REVERSE_UPDATE_SQL = `
  UPDATE "budgets"
  SET "approvedAmount" = MAX(0, "approvedAmount" - ?),
      "totalAmount" = MAX(0, "totalAmount" - ?), "updatedAt" = ?
  WHERE "tenantId" = ? AND "projectId" = ? AND "costCentreId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const NEGOTIATION_ROUND_SUPERSEDE_SQL = `
  UPDATE "negotiation_rounds"
  SET "status" = 'SUPERSEDED', "notes" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
`;

export const NEGOTIATION_ROUND_INSERT_SQL = `
  INSERT INTO "negotiation_rounds" (
    "id", "tenantId", "negotiationId", "vendorId", "roundNumber", "deadline",
    "targetPrice", "previousQuoteAmount", "counterOfferAmount", "revisedQuoteAmount",
    "savingsAmount", "savingsPercent", "status", "notes", "nextResponsibleParty",
    "lineItemsJson", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const NEGOTIATION_INSERT_IF_ABSENT_SQL = `
  INSERT INTO "negotiations" ("id", "tenantId", "rfqId", "status", "currentRound", "createdAt", "updatedAt")
  SELECT ?, ?, ?, 'ACTIVE', 1, ?, ?
  WHERE EXISTS (SELECT 1 FROM "rfqs" WHERE "id" = ? AND "tenantId" = ?)
    AND NOT EXISTS (SELECT 1 FROM "negotiations" WHERE "tenantId" = ? AND "rfqId" = ?)
`;

export const NEGOTIATION_UPDATE_AFTER_ROUND_SQL = `
  UPDATE "negotiations"
  SET "currentRound" = MAX("currentRound", ?), "bestQuoteAmount" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
`;

export const RFQ_MARK_NEGOTIATION_SQL = `
  UPDATE "rfqs" SET "status" = 'NEGOTIATION', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
    AND "status" IN ('RELEASED', 'VENDOR_RESPONSE_OPEN', 'RESPONSE_CLOSED', 'COMPARISON')
`;

export const RFQ_LOCK_FINAL_RATES_SQL = `
  UPDATE "rfqs"
  SET "status" = 'FINAL_RATE_LOCKED', "finalLockedAt" = ?, "finalLockedById" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
    AND "status" IN ('RESPONSE_CLOSED', 'COMPARISON', 'NEGOTIATION')
    AND EXISTS (
      SELECT 1 FROM "vendors" v
      WHERE v."id" = ? AND v."tenantId" = "rfqs"."tenantId"
    )
    AND EXISTS (
      SELECT 1 FROM "rfq_vendors" rv
      WHERE rv."tenantId" = "rfqs"."tenantId" AND rv."rfqId" = "rfqs"."id"
        AND rv."vendorId" = ?
    )
    AND EXISTS (
      SELECT 1 FROM "quotes" q
      WHERE q."tenantId" = "rfqs"."tenantId" AND q."rfqId" = "rfqs"."id"
        AND q."vendorId" = ? AND q."status" IN ('SUBMITTED', 'UNDER_EVALUATION', 'REVISED', 'ACCEPTED')
    )
`;

export const AUDIT_LOG_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const AUDIT_LOG_INSERT_AFTER_CHANGE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
`;

export const VENDOR_INSERT_NEXT_CODE_SQL = `
  WITH next_code AS (
    SELECT 'VND-' || printf('%04d', COALESCE(MAX(CAST(SUBSTR("code", 5) AS INTEGER)), 0) + 1) AS code
    FROM "vendors"
    WHERE "tenantId" = ? AND SUBSTR("code", 1, 4) = 'VND-'
      AND SUBSTR("code", 5) <> '' AND SUBSTR("code", 5) NOT GLOB '*[^0-9]*'
  )
  INSERT INTO "vendors" (
    "id", "tenantId", "code", "name", "vendorType", "contactPerson", "email", "phone", "categories",
    "operatingLocation", "city", "state", "country", "legalStructure", "gstin", "pan", "website", "address",
    "experienceYears", "turnoverCrores", "capabilities", "serviceCoverage", "clientReferences", "certifications",
    "onboardingStatus", "qualificationStatus", "complianceStatus", "empanelmentStatus", "status", "createdAt", "updatedAt"
  )
  SELECT ?, ?, next_code.code, ?, ?, ?, COALESCE(NULLIF(?, ''), 'contact@' || LOWER(next_code.code) || '.in'),
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM next_code
  WHERE EXISTS (SELECT 1 FROM "tenants" WHERE "id" = ?)
  ON CONFLICT ("tenantId", "code") DO NOTHING
  RETURNING *
`;

export const VENDOR_CREATE_AUDIT_INSERT_AFTER_CHANGE_SQL = `
  WITH created AS (
    SELECT "id", "tenantId", "name", "code", "vendorType", "onboardingStatus", "qualificationStatus"
    FROM "vendors" WHERE "id" = ? AND "tenantId" = ?
  )
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 AND created."id" IS NOT NULL THEN ? ELSE NULL END,
    ?, ?, NULL, 'VENDOR', created."id", 'VENDOR_CREATED',
    REPLACE(REPLACE(REPLACE(REPLACE(?, '__D1_VENDOR_NAME__', created."name"), '__D1_VENDOR_CODE__', created."code"),
      '__D1_VENDOR_TYPE__', CASE WHEN created."vendorType" = 'CLIENT_VENDOR' THEN 'Client Vendor' ELSE 'Procucev Vendor' END),
      '__D1_VENDOR_ONBOARDING_STATUS__', created."onboardingStatus"),
    NULL,
    json_object('name', created."name", 'code', created."code", 'vendorType', created."vendorType",
      'onboardingStatus', created."onboardingStatus", 'qualificationStatus', created."qualificationStatus"),
    NULL, NULL, ?
  FROM (SELECT 1) AS guard LEFT JOIN created ON 1 = 1
`;

export const AUCTION_STATUS_UPDATE_IF_EXPECTED_SQL = `
  UPDATE "auctions"
  SET "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
`;

export const AUCTION_AUTO_START_IF_DUE_SQL = `
  UPDATE "auctions"
  SET "status" = 'LIVE', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'SCHEDULED'
    AND "startTime" <= ? AND "endTime" > ?
`;

export const AUCTION_AUTO_CLOSE_IF_DUE_SQL = `
  UPDATE "auctions"
  SET "status" = 'CLOSED', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ? AND "endTime" <= ?
`;

export const AUCTION_EXTEND_IF_EXPECTED_SQL = `
  UPDATE "auctions"
  SET "endTime" = ?, "scheduledEndTime" = ?, "extensionCount" = "extensionCount" + 1,
      "status" = 'EXTENDED', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
`;

export const AUCTION_CONCLUDE_IF_EXPECTED_SQL = `
  UPDATE "auctions"
  SET "status" = 'CLOSED', "endTime" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
`;

export const AUCTION_DRAFT_UPDATE_IF_EXPECTED_SQL = `
  UPDATE "auctions"
  SET "title" = ?, "scrollingText" = ?, "refreshIntervalSeconds" = ?, "startingPrice" = ?,
      "minDecrement" = ?, "termsAndConditions" = ?, "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'DRAFT'
`;

export const AUCTION_DELETE_DRAFT_WITHOUT_BIDS_SQL = `
  DELETE FROM "auctions"
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'DRAFT'
    AND NOT EXISTS (
      SELECT 1 FROM "auction_bids" WHERE "auctionId" = ? AND "tenantId" = ?
    )
`;

export const AUCTION_INSERT_NEXT_NUMBER_SQL = `
  WITH input (
    "id", "tenantId", "rfqId", "codePrefix", "title", "auctionType", "auctionCategory", "currency",
    "scrollingText", "refreshIntervalSeconds", "quantityType", "hasStartPrice", "startingPrice",
    "hasLeadingPrice", "hasMinBidReduction", "minDecrement", "hasAutoExtension", "autoExtensionMinutes",
    "hasBidLimit", "maxBidsPerParticipant", "inviteProjectUser", "projectUserId", "nonInvitedJustification",
    "termsAndConditions", "documents", "status", "bidVisibility", "currentLowestBid", "currentLeadingBid",
    "currentWinningVendorId", "startTime", "endTime", "scheduledEndTime", "extensionCount", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "auctions" (
    "id", "tenantId", "rfqId", "auctionNumber", "title", "auctionType", "auctionCategory", "currency",
    "scrollingText", "refreshIntervalSeconds", "quantityType", "hasStartPrice", "startingPrice",
    "hasLeadingPrice", "hasMinBidReduction", "minDecrement", "hasAutoExtension", "autoExtensionMinutes",
    "hasBidLimit", "maxBidsPerParticipant", "inviteProjectUser", "projectUserId", "nonInvitedJustification",
    "termsAndConditions", "documents", "status", "bidVisibility", "currentLowestBid", "currentLeadingBid",
    "currentWinningVendorId", "startTime", "endTime", "scheduledEndTime", "extensionCount", "createdAt", "updatedAt"
  )
  SELECT i."id", i."tenantId", rfq."id",
    i."codePrefix" || printf('%06d', COALESCE((
      SELECT MAX(CAST(substr(existing."auctionNumber", length(i."codePrefix") + 1) AS INTEGER))
      FROM "auctions" existing
      WHERE existing."tenantId" = i."tenantId"
        AND substr(existing."auctionNumber", 1, length(i."codePrefix")) = i."codePrefix"
    ), 0) + 1),
    i."title", i."auctionType", i."auctionCategory", i."currency", i."scrollingText", i."refreshIntervalSeconds",
    i."quantityType", i."hasStartPrice", i."startingPrice", i."hasLeadingPrice", i."hasMinBidReduction",
    i."minDecrement", i."hasAutoExtension", i."autoExtensionMinutes", i."hasBidLimit", i."maxBidsPerParticipant",
    i."inviteProjectUser", i."projectUserId", i."nonInvitedJustification", i."termsAndConditions", i."documents",
    i."status", i."bidVisibility", i."currentLowestBid", i."currentLeadingBid", i."currentWinningVendorId",
    i."startTime", i."endTime", i."scheduledEndTime", i."extensionCount", i."createdAt", i."updatedAt"
  FROM input i
  JOIN "rfqs" rfq ON rfq."id" = i."rfqId" AND rfq."tenantId" = i."tenantId"
  RETURNING *
`;

export const AUCTION_AUDIT_INSERT_AFTER_CREATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 AND auction."id" IS NOT NULL THEN ? ELSE NULL END,
    ?, ?, ?, 'AUCTION', auction."id", ?,
    replace(?, '__D1_AUCTION_NUMBER__', auction."auctionNumber"), NULL,
    replace(?, '__D1_AUCTION_NUMBER__', auction."auctionNumber"), NULL, NULL, ?
  FROM (SELECT 1) guard
  LEFT JOIN "auctions" auction ON auction."id" = ? AND auction."tenantId" = ?
`;

export const AUCTION_VENDOR_INSERT_IF_TENANT_VALID_SQL = `
  INSERT INTO "auction_vendors" ("id", "tenantId", "auctionId", "vendorId", "invitedAt")
  SELECT CASE WHEN EXISTS (
      SELECT 1 FROM "vendors" WHERE "id" = ? AND "tenantId" = ?
    ) THEN ? ELSE NULL END,
    ?, ?, ?, ?
  WHERE EXISTS (SELECT 1 FROM "auctions" WHERE "id" = ? AND "tenantId" = ?)
`;

export const AUCTION_ITEM_INSERT_IF_RFQ_LINE_VALID_SQL = `
  WITH input (
    "id", "tenantId", "auctionId", "rfqId", "rfqLineId", "itemCode", "description", "category",
    "subcategory", "brand", "uom", "quantity", "startPrice", "currentLeadingBid", "currentWinningVendorId"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "auction_items" (
    "id", "tenantId", "auctionId", "rfqLineId", "itemCode", "description", "category", "subcategory",
    "brand", "uom", "quantity", "startPrice", "currentLeadingBid", "currentWinningVendorId"
  )
  SELECT CASE WHEN i."rfqLineId" IS NULL OR EXISTS (
      SELECT 1 FROM "rfq_lines" line
      WHERE line."id" = i."rfqLineId" AND line."tenantId" = i."tenantId" AND line."rfqId" = i."rfqId"
    ) THEN i."id" ELSE NULL END,
    i."tenantId", i."auctionId", i."rfqLineId", i."itemCode", i."description", i."category", i."subcategory",
    i."brand", i."uom", i."quantity", i."startPrice", i."currentLeadingBid", i."currentWinningVendorId"
  FROM input i
`;

export const PPO_VENDOR_ISSUE_UPDATE_IF_ISSUED_SQL = `
  UPDATE "ppos"
  SET "vendorStatus" = 'ISSUE_RAISED', "vendorIssueRemarks" = ?,
      "vendorIssueRaisedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'ISSUED'
    AND COALESCE("vendorStatus", '') <> 'ACCEPTED_BY_VENDOR'
`;

export const PPO_VENDOR_ACCEPT_UPDATE_IF_ISSUED_SQL = `
  UPDATE "ppos"
  SET "status" = 'CONFIRMED', "vendorStatus" = 'ACCEPTED_BY_VENDOR',
      "vendorAcceptedAt" = ?, "vendorAcceptedBy" = ?, "vendorAcceptedVersion" = 1,
      "vendorIssueRemarks" = NULL, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'ISSUED'
    AND COALESCE("vendorStatus", '') <> 'ACCEPTED_BY_VENDOR'
`;

export const AUCTION_BID_UPDATE_IF_CURRENT_SQL = `
  UPDATE "auctions"
  SET "currentLowestBid" = ?, "currentLeadingBid" = ?, "currentWinningVendorId" = ?, "status" = ?,
      "endTime" = CASE WHEN ? = 1 THEN ? ELSE "endTime" END,
      "scheduledEndTime" = CASE WHEN ? = 1 THEN ? ELSE "scheduledEndTime" END,
      "extensionCount" = "extensionCount" + ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IS ?
    AND "status" IN ('SCHEDULED', 'LIVE', 'EXTENDED')
    AND "startTime" IS ? AND "startTime" <= ?
    AND "endTime" IS ? AND "endTime" > ?
    AND "currentLowestBid" IS ? AND "currentLeadingBid" IS ?
    AND "extensionCount" IS ? AND "auctionType" IS ? AND "auctionCategory" IS ?
    AND "hasStartPrice" IS ? AND "startingPrice" IS ?
    AND "hasMinBidReduction" IS ? AND "minDecrement" IS ?
    AND "hasAutoExtension" IS ? AND "autoExtensionMinutes" IS ?
    AND "hasBidLimit" IS ? AND "maxBidsPerParticipant" IS ?
    AND (SELECT COUNT(*) FROM "auction_bids" WHERE "auctionId" = "auctions"."id") = ?
    AND (SELECT COUNT(*) FROM "auction_bids" WHERE "auctionId" = "auctions"."id" AND "vendorId" = ?) = ?
    AND EXISTS (
      SELECT 1 FROM "auction_vendors" participant
      WHERE participant."id" = ? AND participant."tenantId" = ?
        AND participant."auctionId" = "auctions"."id" AND participant."vendorId" = ?
        AND participant."isEligible" = 1 AND participant."termsAcceptedAt" IS NOT NULL
        AND participant."bidsCount" IS ?
    )
    AND (? IS NULL OR EXISTS (
      SELECT 1 FROM "auction_items" item
      WHERE item."id" = ? AND item."tenantId" = ? AND item."auctionId" = "auctions"."id"
        AND item."currentLeadingBid" IS ? AND item."startPrice" IS ?
    ))
`;

export const AUCTION_BID_INSERT_AFTER_CHANGE_SQL = `
  INSERT INTO "auction_bids" (
    "id", "tenantId", "auctionId", "vendorId", "auctionItemId", "bidNumber",
    "bidAmount", "rank", "ipAddress", "timestamp"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
`;

export const AUCTION_ITEM_UPDATE_AFTER_CHANGE_SQL = `
  UPDATE "auction_items"
  SET "currentLeadingBid" = ?, "currentWinningVendorId" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "auctionId" = ?
    AND "currentLeadingBid" IS ? AND "startPrice" IS ? AND changes() = 1
`;

export const AUCTION_VENDOR_UPDATE_AFTER_BID_SQL = `
  UPDATE "auction_vendors"
  SET "bidsCount" = ?, "lastBidAmount" = ?, "lastBidAt" = ?,
      "bestBidAmount" = ?, "bestBidRank" = 1
  WHERE "id" = ? AND "tenantId" = ? AND "auctionId" = ? AND "vendorId" = ?
    AND "bidsCount" IS ? AND changes() = 1
`;

export const EXPIRED_AUCTION_CLOSE_SQL = `
  UPDATE "auctions" SET "status" = 'CLOSED', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('SCHEDULED', 'LIVE', 'EXTENDED')
    AND "endTime" <= ?
`;

export const ACTUAL_COST_INSERT_IF_VALID_SQL = `
  WITH input (
    "id", "tenantId", "transactionCode", "projectId", "costCentreId", "category", "subcategory",
    "boqId", "boqRevisionId", "boqLineId", "prId", "prLineId", "rfqId", "rfqLineId", "ppoId",
    "ppoLineId", "vendorId", "uom", "actualQuantity", "actualUnitRate", "actualAmount", "taxAmount",
    "totalActualAmount", "actualDate", "source", "status", "completionReference", "completionRequestId",
    "completionFingerprint", "externalReference", "erpDocumentNumber", "erpDate", "integrationTimestamp",
    "documents", "remarks", "createdById", "createdBy", "createdAt", "updatedAt"
  ) AS (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  INSERT INTO "actual_cost_transactions" (
    "id", "tenantId", "transactionCode", "projectId", "costCentreId", "category", "subcategory",
    "boqId", "boqRevisionId", "boqLineId", "prId", "prLineId", "rfqId", "rfqLineId", "ppoId",
    "ppoLineId", "vendorId", "uom", "actualQuantity", "actualUnitRate", "actualAmount", "taxAmount",
    "totalActualAmount", "actualDate", "source", "status", "completionReference", "completionRequestId",
    "completionFingerprint", "externalReference", "erpDocumentNumber", "erpDate", "integrationTimestamp",
    "documents", "remarks", "createdById", "createdBy", "createdAt", "updatedAt"
  )
  SELECT
    i."id", i."tenantId", i."transactionCode", i."projectId", i."costCentreId", i."category", i."subcategory",
    i."boqId", i."boqRevisionId", i."boqLineId", i."prId", i."prLineId", i."rfqId", i."rfqLineId", i."ppoId",
    i."ppoLineId", i."vendorId", i."uom", i."actualQuantity", i."actualUnitRate", i."actualAmount", i."taxAmount",
    i."totalActualAmount", i."actualDate", i."source", i."status", i."completionReference", i."completionRequestId",
    i."completionFingerprint", i."externalReference", i."erpDocumentNumber", i."erpDate", i."integrationTimestamp",
    i."documents", i."remarks", i."createdById", i."createdBy", i."createdAt", i."updatedAt"
  FROM input i
  WHERE EXISTS (
    SELECT 1 FROM "projects" p WHERE p."id" = i."projectId" AND p."tenantId" = i."tenantId"
  )
    AND (i."costCentreId" IS NULL OR EXISTS (
      SELECT 1 FROM "cost_centres" c
      WHERE c."id" = i."costCentreId" AND c."tenantId" = i."tenantId" AND c."projectId" = i."projectId"
    ))
    AND (i."boqId" IS NULL OR EXISTS (
      SELECT 1 FROM "boqs" b
      WHERE b."id" = i."boqId" AND b."tenantId" = i."tenantId" AND b."projectId" = i."projectId"
    ))
    AND (i."boqRevisionId" IS NULL OR EXISTS (
      SELECT 1 FROM "boq_revisions" r JOIN "boqs" b ON b."id" = r."boqId"
      WHERE r."id" = i."boqRevisionId" AND r."tenantId" = i."tenantId" AND b."projectId" = i."projectId"
        AND (i."boqId" IS NULL OR r."boqId" = i."boqId")
    ))
    AND (i."boqLineId" IS NULL OR EXISTS (
      SELECT 1 FROM "boq_lines" l JOIN "boq_revisions" r ON r."id" = l."boqRevisionId"
      JOIN "boqs" b ON b."id" = r."boqId"
      WHERE l."id" = i."boqLineId" AND l."tenantId" = i."tenantId" AND b."projectId" = i."projectId"
        AND (i."boqRevisionId" IS NULL OR l."boqRevisionId" = i."boqRevisionId")
    ))
    AND (i."prId" IS NULL OR EXISTS (
      SELECT 1 FROM "procurement_requests" pr
      WHERE pr."id" = i."prId" AND pr."tenantId" = i."tenantId" AND pr."projectId" = i."projectId"
    ))
    AND (i."prLineId" IS NULL OR EXISTS (
      SELECT 1 FROM "pr_lines" l JOIN "procurement_requests" pr ON pr."id" = l."prId"
      WHERE l."id" = i."prLineId" AND l."tenantId" = i."tenantId" AND pr."projectId" = i."projectId"
        AND (i."prId" IS NULL OR l."prId" = i."prId")
    ))
    AND (i."rfqId" IS NULL OR EXISTS (
      SELECT 1 FROM "rfqs" r WHERE r."id" = i."rfqId" AND r."tenantId" = i."tenantId" AND r."projectId" = i."projectId"
    ))
    AND (i."rfqLineId" IS NULL OR EXISTS (
      SELECT 1 FROM "rfq_lines" l JOIN "rfqs" r ON r."id" = l."rfqId"
      WHERE l."id" = i."rfqLineId" AND l."tenantId" = i."tenantId" AND r."projectId" = i."projectId"
        AND (i."rfqId" IS NULL OR l."rfqId" = i."rfqId")
    ))
    AND (i."ppoId" IS NULL OR EXISTS (
      SELECT 1 FROM "ppos" p WHERE p."id" = i."ppoId" AND p."tenantId" = i."tenantId" AND p."projectId" = i."projectId"
    ))
    AND (i."ppoLineId" IS NULL OR EXISTS (
      SELECT 1 FROM "ppo_lines" l JOIN "ppos" p ON p."id" = l."ppoId"
      WHERE l."id" = i."ppoLineId" AND l."tenantId" = i."tenantId" AND p."projectId" = i."projectId"
        AND (i."ppoId" IS NULL OR l."ppoId" = i."ppoId")
    ))
    AND (i."vendorId" IS NULL OR EXISTS (
      SELECT 1 FROM "vendors" v WHERE v."id" = i."vendorId" AND v."tenantId" = i."tenantId"
    ))
  ON CONFLICT ("tenantId", "transactionCode") DO NOTHING
`;

export const BOQ_REVISION_SUBMIT_UPDATE_SQL = `
  UPDATE "boq_revisions"
  SET "status" = 'SUBMITTED', "submittedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'DRAFT' AND "errorLines" = 0
    AND EXISTS (SELECT 1 FROM "boqs" WHERE "id" = "boq_revisions"."boqId" AND "tenantId" = ?)
`;

export const BOQ_REVISION_APPROVE_UPDATE_SQL = `
  UPDATE "boq_revisions"
  SET "status" = 'APPROVED', "approvedAt" = ?, "approvedById" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'SUBMITTED'
    AND EXISTS (SELECT 1 FROM "boqs" WHERE "id" = "boq_revisions"."boqId" AND "tenantId" = ?)
`;

export const BOQ_REVISION_REJECT_UPDATE_SQL = `
  UPDATE "boq_revisions"
  SET "status" = 'REJECTED', "rejectedAt" = ?, "rejectionReason" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'SUBMITTED'
    AND EXISTS (SELECT 1 FROM "boqs" WHERE "id" = "boq_revisions"."boqId" AND "tenantId" = ?)
`;

export const BOQ_UPDATE_STATUS_AFTER_AUDIT_SQL = `
  UPDATE "boqs" SET "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const PROJECT_UPDATE_STATUS_AFTER_AUDIT_SQL = `
  UPDATE "projects" SET "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const PPO_LINE_COMPLETION_UPDATE_SQL = `
  UPDATE "ppo_lines"
  SET "completedQuantity" = ?, "completedAmount" = ?, "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "ppoId" = ?
    AND "completedQuantity" = ? AND "completedAmount" = ?
    AND "status" IN ('ISSUED', 'PARTIALLY_COMPLETED')
    AND "completedQuantity" + ? <= "orderedQuantity"
    AND EXISTS (
      SELECT 1 FROM "ppos" WHERE "id" = "ppo_lines"."ppoId" AND "tenantId" = ?
        AND "status" IN ('ISSUED', 'CONFIRMED', 'PARTIALLY_COMPLETED')
    )
`;

export const PPO_ACTUAL_COST_INSERT_AFTER_LINE_UPDATE_SQL = `
  INSERT INTO "actual_cost_transactions" (
    "id", "tenantId", "transactionCode", "projectId", "costCentreId", "category", "subcategory",
    "boqId", "boqRevisionId", "boqLineId", "prId", "prLineId", "rfqId", "rfqLineId", "ppoId",
    "ppoLineId", "vendorId", "uom", "actualQuantity", "actualUnitRate", "actualAmount", "taxAmount",
    "totalActualAmount", "actualDate", "source", "status", "completionReference", "documents", "remarks",
    "createdById", "createdBy", "createdAt", "updatedAt", "completionRequestId", "completionFingerprint"
  )
  SELECT
    CASE WHEN changes() = 1 THEN ? ELSE NULL END,
    ?,
    'ACT-' || ? || '-' || printf('%06d', COALESCE((
      SELECT MAX(CAST(substr("transactionCode", -6) AS INTEGER))
      FROM "actual_cost_transactions"
      WHERE "tenantId" = ? AND "transactionCode" LIKE 'ACT-' || ? || '-%'
    ), 0) + 1),
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, 'PPO_COMPLETION', 'APPROVED',
    ?, ?, ?, ?, ?, ?, ?, ?, ?
`;

export const PPO_STATUS_UPDATE_AFTER_COMPLETION_SQL = `
  UPDATE "ppos"
  SET "status" = CASE
        WHEN NOT EXISTS (SELECT 1 FROM "ppo_lines" WHERE "ppoId" = "ppos"."id" AND "tenantId" = "ppos"."tenantId" AND "status" <> 'COMPLETED') THEN 'COMPLETED'
        WHEN EXISTS (SELECT 1 FROM "ppo_lines" WHERE "ppoId" = "ppos"."id" AND "tenantId" = "ppos"."tenantId" AND "completedQuantity" > 0) THEN 'PARTIALLY_COMPLETED'
        ELSE "status"
      END,
      "completedAt" = CASE
        WHEN NOT EXISTS (SELECT 1 FROM "ppo_lines" WHERE "ppoId" = "ppos"."id" AND "tenantId" = "ppos"."tenantId" AND "status" <> 'COMPLETED') THEN COALESCE("completedAt", ?)
        ELSE "completedAt"
      END,
      "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
    AND "status" IN ('ISSUED', 'CONFIRMED', 'PARTIALLY_COMPLETED')
    AND EXISTS (SELECT 1 FROM "actual_cost_transactions" WHERE "tenantId" = ? AND "completionRequestId" = ?)
`;

export const AWARD_RECOMMENDATION_INSERT_IF_VALID_SQL = `
  INSERT INTO "award_recommendations" (
    "id", "tenantId", "rfqId", "recommendedVendorId", "originalQuoteAmount", "finalNegotiatedAmount",
    "benchmarkAmount", "totalSavingsAmount", "savingsPercent", "technicalStatus", "commercialStatus",
    "justification", "status", "submittedById", "submittedAt", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "rfqs" WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
  )
    AND EXISTS (SELECT 1 FROM "vendors" WHERE "id" = ? AND "tenantId" = ?)
    AND NOT EXISTS (
      SELECT 1 FROM "award_recommendations"
      WHERE "tenantId" = ? AND "rfqId" = ? AND "status" = 'PENDING_APPROVAL'
    )
`;

export const RFQ_MARK_AWARD_RECOMMENDED_AFTER_INSERT_SQL = `
  UPDATE "rfqs" SET "status" = 'AWARD_RECOMMENDED', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
    AND EXISTS (SELECT 1 FROM "award_recommendations" WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PENDING_APPROVAL')
`;

export const AWARD_DECISION_UPDATE_SQL = `
  UPDATE "award_recommendations"
  SET "status" = ?, "approvedById" = ?, "approvedAt" = ?, "approvalRemarks" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PENDING_APPROVAL'
    AND EXISTS (SELECT 1 FROM "rfqs" WHERE "id" = "award_recommendations"."rfqId" AND "tenantId" = ? AND "status" = 'AWARD_RECOMMENDED')
`;

export const RFQ_UPDATE_AWARD_DECISION_AFTER_AUDIT_SQL = `
  UPDATE "rfqs" SET "status" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'AWARD_RECOMMENDED'
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const VENDOR_RATING_DECISION_UPDATE_SQL = `
  UPDATE "ppo_vendor_ratings"
  SET "status" = ?, "criteriaDetails" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'SUBMITTED'
    AND EXISTS (SELECT 1 FROM "vendors" WHERE "id" = "ppo_vendor_ratings"."vendorId" AND "tenantId" = ?)
    AND EXISTS (SELECT 1 FROM "ppos" WHERE "id" = "ppo_vendor_ratings"."ppoId" AND "tenantId" = ?)
`;

export const VENDOR_PERFORMANCE_SCORE_UPDATE_AFTER_AUDIT_SQL = `
  UPDATE "vendors"
  SET "performanceScore" = (
    SELECT CAST(ROUND(AVG("overallScore") * 20) AS INTEGER)
    FROM "ppo_vendor_ratings"
    WHERE "tenantId" = ? AND "vendorId" = ? AND "status" = 'APPROVED'
  ), "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const PPO_MARK_COMPLETED_AFTER_AUDIT_SQL = `
  UPDATE "ppos" SET "status" = 'COMPLETED', "completedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" NOT IN ('COMPLETED', 'CANCELLED') AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const PPO_VENDOR_RATING_UPSERT_IF_ELIGIBLE_SQL = `
  INSERT INTO "ppo_vendor_ratings" (
    "id", "tenantId", "vendorId", "ppoId", "projectId", "costCentreId", "qualityScore", "deliveryScore",
    "commercialComplianceScore", "responsivenessScore", "documentationClosureScore", "overallScore",
    "criteriaDetails", "comments", "supportingEvidence", "status", "ratedBy", "ratedAt", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "ppos" p
    WHERE p."id" = ? AND p."tenantId" = ? AND p."vendorId" = ?
      AND p."status" NOT IN ('DRAFT', 'CANCELLED')
  )
  ON CONFLICT ("ppoId") DO UPDATE SET
    "qualityScore" = excluded."qualityScore",
    "deliveryScore" = excluded."deliveryScore",
    "commercialComplianceScore" = excluded."commercialComplianceScore",
    "responsivenessScore" = excluded."responsivenessScore",
    "documentationClosureScore" = excluded."documentationClosureScore",
    "overallScore" = excluded."overallScore",
    "criteriaDetails" = excluded."criteriaDetails",
    "comments" = excluded."comments",
    "supportingEvidence" = excluded."supportingEvidence",
    "status" = excluded."status",
    "ratedBy" = excluded."ratedBy",
    "ratedAt" = excluded."ratedAt",
    "updatedAt" = excluded."updatedAt"
  WHERE "ppo_vendor_ratings"."tenantId" = excluded."tenantId"
    AND "ppo_vendor_ratings"."vendorId" = excluded."vendorId"
    AND "ppo_vendor_ratings"."status" IN ('DRAFT', 'RETURNED_FOR_CORRECTION')
    AND EXISTS (
      SELECT 1 FROM "ppos" p
      WHERE p."id" = excluded."ppoId" AND p."tenantId" = excluded."tenantId"
        AND p."vendorId" = excluded."vendorId" AND p."status" NOT IN ('DRAFT', 'CANCELLED')
    )
  RETURNING *
`;

export const NOTIFICATION_INSERT_AFTER_AUDIT_SQL = `
  INSERT INTO "notifications" (
    "id", "tenantId", "userId", "targetRole", "title", "message", "type", "entityType", "entityId", "recordNumber", "link"
  )
  SELECT ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  ) AND EXISTS (
    SELECT 1 FROM "users" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const NEGOTIATION_BUYER_DECISION_UPDATE_SQL = `
  UPDATE "negotiation_rounds"
  SET "buyerDecision" = ?, "buyerDecisionDate" = ?, "buyerDecisionRemarks" = ?,
      "status" = ?, "nextResponsibleParty" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
    AND ("buyerDecision" IS NULL OR ("buyerDecision" IN ('PENDING_BUYER_DECISION', 'FINAL_ACCEPTANCE_PENDING') AND ? <> "buyerDecision"))
    AND "status" NOT IN ('CONCLUDED', 'REJECTED')
    AND EXISTS (SELECT 1 FROM "negotiations" WHERE "id" = "negotiation_rounds"."negotiationId" AND "tenantId" = ?)
    AND EXISTS (SELECT 1 FROM "vendors" WHERE "id" = "negotiation_rounds"."vendorId" AND "tenantId" = ?)
`;

export const NEGOTIATION_CLOSE_AFTER_AUDIT_SQL = `
  UPDATE "negotiations"
  SET "status" = 'CONCLUDED', "concludedAt" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const QUOTE_ACCEPT_AFTER_AUDIT_SQL = `
  UPDATE "quotes" SET "status" = 'ACCEPTED', "updatedAt" = ?
  WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
    AND "id" = (
      SELECT "id" FROM "quotes" WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
      ORDER BY "quoteVersion" DESC LIMIT 1
    )
    AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?)
`;

export const RFQ_MESSAGE_INSERT_AFTER_AUDIT_SQL = `
  INSERT INTO "rfq_messages" (
    "id", "tenantId", "rfqId", "senderId", "senderName", "senderRole", "message",
    "attachments", "isVendorSent", "vendorId", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ? WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const RFQ_VENDOR_MESSAGE_INSERT_AFTER_AUDIT_SQL = `
  INSERT INTO "rfq_messages" (
    "id", "tenantId", "rfqId", "senderId", "senderName", "senderRole", "message",
    "attachments", "isVendorSent", "vendorId", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ? WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const RFQ_MESSAGE_INSERT_SQL = `
  INSERT INTO "rfq_messages" (
    "id", "tenantId", "rfqId", "senderId", "senderName", "senderRole", "message",
    "attachments", "isVendorSent", "vendorId", "createdAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const QUOTE_INSERT_SQL = `
  INSERT INTO "quotes" (
    "id", "tenantId", "rfqId", "vendorId", "quoteNumber", "quoteVersion", "status",
    "totalBaseAmount", "taxAmount", "discountAmount", "totalQuoteAmount", "commercialTerms",
    "paymentTermsOffered", "deliveryLeadTimeDays", "validUntil", "submittedAt", "submittedBy",
    "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const QUOTE_INSERT_WITH_NEXT_VERSION_SQL = `
  INSERT INTO "quotes" (
    "id", "tenantId", "rfqId", "vendorId", "quoteNumber", "quoteVersion", "status",
    "totalBaseAmount", "taxAmount", "discountAmount", "totalQuoteAmount", "commercialTerms",
    "paymentTermsOffered", "deliveryLeadTimeDays", "validUntil", "submittedAt", "submittedBy",
    "createdAt", "updatedAt"
  )
  SELECT
    ?, ?, ?, ?,
    'QTE-' || ? || '-' || printf('%06d', (SELECT COUNT(*) + 1 FROM "quotes" WHERE "tenantId" = ?)),
    COALESCE((SELECT MAX("quoteVersion") FROM "quotes"
      WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?), 0) + 1,
    CASE WHEN COALESCE((SELECT MAX("quoteVersion") FROM "quotes"
      WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?), 0) > 0
      THEN 'REVISED' ELSE 'SUBMITTED' END,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  RETURNING "id", "tenantId", "rfqId", "vendorId", "quoteNumber", "quoteVersion", "status",
    "totalBaseAmount", "taxAmount", "discountAmount", "totalQuoteAmount", "commercialTerms",
    "paymentTermsOffered", "deliveryLeadTimeDays", "validUntil", "submittedAt", "submittedBy",
    "createdAt", "updatedAt"
`;

export const QUOTE_LINE_INSERT_SQL = `
  INSERT INTO "quote_lines" (
    "id", "tenantId", "quoteId", "rfqLineId", "unitRate", "taxPercent", "discountPercent", "lineTotal", "remarks"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const QUOTE_AUDIT_INSERT_AFTER_INSERT_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT ?, ?, ?, ?, 'QUOTE', q."id",
    CASE WHEN q."quoteVersion" > 1 THEN 'QUOTE_REVISED' ELSE 'QUOTE_SUBMITTED' END,
    REPLACE(REPLACE(?, '__QUOTE_NUMBER__', q."quoteNumber"), '__QUOTE_VERSION__', CAST(q."quoteVersion" AS TEXT)),
    NULL,
    REPLACE(REPLACE(?, '__QUOTE_NUMBER__', q."quoteNumber"), '__QUOTE_VERSION__', CAST(q."quoteVersion" AS TEXT)),
    ?, ?, ?
  FROM "quotes" q WHERE q."id" = ? AND q."tenantId" = ?
`;

export const RFQ_VENDOR_MARK_SUBMITTED_SQL = `
  UPDATE "rfq_vendors" SET "invitationStatus" = 'SUBMITTED', "submissionStatus" = 'SUBMITTED'
  WHERE "rfqId" = ? AND "vendorId" = ? AND "tenantId" = ?
`;

export const RFQ_VENDOR_SUBMITTED_UPSERT_SQL = `
  INSERT INTO "rfq_vendors"
    ("id", "tenantId", "rfqId", "vendorId", "invitationStatus", "submissionStatus")
  VALUES (?, ?, ?, ?, 'SUBMITTED', 'SUBMITTED')
  ON CONFLICT ("rfqId", "vendorId") DO UPDATE SET
    "invitationStatus" = 'SUBMITTED', "submissionStatus" = 'SUBMITTED'
  WHERE "rfq_vendors"."tenantId" = excluded."tenantId"
`;

export const RFQ_MARK_RESPONSE_OPEN_SQL = `
  UPDATE "rfqs" SET "status" = 'VENDOR_RESPONSE_OPEN', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = 'RELEASED'
`;

export const NEGOTIATION_ROUND_MARK_REVISED_SQL = `
  UPDATE "negotiation_rounds"
  SET "revisedQuoteAmount" = ?, "status" = 'REVISED_SUBMITTED',
      "nextResponsibleParty" = 'BUYER', "lineItemsJson" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
`;

export const NEGOTIATION_BEST_QUOTE_UPDATE_SQL = `
  UPDATE "negotiations" SET "bestQuoteAmount" = ?, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
`;

export const AWARD_RECOMMENDATION_INSERT_SQL = `
  INSERT INTO "award_recommendations" (
    "id", "tenantId", "rfqId", "recommendedVendorId", "originalQuoteAmount", "finalNegotiatedAmount",
    "benchmarkAmount", "totalSavingsAmount", "savingsPercent", "technicalStatus", "commercialStatus",
    "justification", "status", "submittedById", "submittedAt", "approvedById", "approvedAt",
    "approvalRemarks", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const PPO_INSERT_SQL = `
  INSERT INTO "ppos" (
    "id", "tenantId", "projectId", "costCentreId", "boqId", "boqRevisionId", "rfqId", "vendorId",
    "awardRecommendationId", "prId", "sourcingType", "ppoNumber", "title", "totalValue", "currency",
    "status", "deliveryTerms", "paymentTerms", "taxDetails", "issuedAt", "createdById", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const DIRECT_RATE_CARD_PPO_INSERT_IF_VALID_SQL = `
  INSERT INTO "ppos" (
    "id", "tenantId", "projectId", "costCentreId", "boqId", "boqRevisionId", "rfqId", "vendorId",
    "awardRecommendationId", "prId", "rateCardId", "sourcingType", "ppoNumber", "title", "totalValue", "currency",
    "status", "deliveryTerms", "paymentTerms", "taxDetails", "issuedAt", "createdById", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'DIRECT_RATE_CARD', ?, ?, ?, 'INR', 'ISSUED', ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "projects" p WHERE p."id" = ? AND p."tenantId" = ?
  )
    AND EXISTS (
      SELECT 1 FROM "vendor_rate_cards" rc
      WHERE rc."id" = ? AND rc."tenantId" = ? AND rc."vendorId" = ? AND rc."status" = 'APPROVED'
        AND rc."validFrom" <= ? AND rc."validTo" >= ?
    )
    AND (
      (? IS NOT NULL AND EXISTS (
        SELECT 1 FROM "procurement_requests" pr
        WHERE pr."id" = ? AND pr."tenantId" = ? AND pr."projectId" = ?
          AND pr."status" IN ('PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT')
      ))
      OR (? IS NOT NULL AND EXISTS (
        SELECT 1 FROM "rfqs" r WHERE r."id" = ? AND r."tenantId" = ? AND r."projectId" = ?
          AND r."status" IN ('APPROVED', 'AWARDED')
      ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ppos" existing
      WHERE existing."tenantId" = ? AND existing."prId" = ?
        AND existing."sourcingType" = 'DIRECT_RATE_CARD' AND existing."status" <> 'CANCELLED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ppos" existing
      WHERE existing."tenantId" = ? AND existing."rfqId" = ? AND existing."vendorId" = ?
        AND existing."sourcingType" = 'DIRECT_RATE_CARD' AND existing."status" <> 'CANCELLED'
    )
  ON CONFLICT ("tenantId", "ppoNumber") DO NOTHING
`;

export const PPO_LINE_INSERT_AFTER_HEADER_SQL = `
  INSERT INTO "ppo_lines" (
    "id", "tenantId", "ppoId", "projectId", "costCentreId", "boqId", "boqRevisionId", "boqLineId",
    "prLineId", "rfqLineId", "vendorId", "lineNumber", "itemDescription", "specification", "category",
    "subcategory", "uom", "orderedQuantity", "orderedUnitRate", "orderedAmount", "taxAmount",
    "totalOrderValue", "orderDate", "expectedCompletionDate", "completedQuantity", "completedAmount",
    "status", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 'ISSUED', ?, ?
  WHERE changes() = 1 AND EXISTS (
    SELECT 1 FROM "ppos" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const PPO_INSERT_IF_VALID_SQL = `
  INSERT INTO "ppos" (
    "id", "tenantId", "projectId", "costCentreId", "boqId", "boqRevisionId", "rfqId", "vendorId",
    "awardRecommendationId", "prId", "sourcingType", "ppoNumber", "title", "totalValue", "currency",
    "status", "deliveryTerms", "paymentTerms", "taxDetails", "issuedAt", "createdById", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "rfqs" WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('APPROVED', 'AWARDED')
  )
    AND EXISTS (
      SELECT 1 FROM "award_recommendations"
      WHERE "id" = ? AND "tenantId" = ? AND "rfqId" = ? AND "recommendedVendorId" = ? AND "status" = 'APPROVED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ppos"
      WHERE "tenantId" = ? AND "rfqId" = ? AND "vendorId" = ?
        AND "sourcingType" = 'REGULAR_RFQ' AND "status" <> 'CANCELLED'
    )
`;

export const PPO_LINE_INSERT_SQL = `
  INSERT INTO "ppo_lines" (
    "id", "tenantId", "ppoId", "projectId", "costCentreId", "boqId", "boqRevisionId", "boqLineId",
    "prLineId", "rfqLineId", "vendorId", "lineNumber", "itemDescription", "specification", "category",
    "subcategory", "uom", "orderedQuantity", "orderedUnitRate", "orderedAmount", "taxAmount",
    "totalOrderValue", "orderDate", "expectedCompletionDate", "completedQuantity", "completedAmount",
    "status", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const RFQ_MARK_AWARDED_SQL = `
  UPDATE "rfqs" SET "status" = 'AWARDED', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ?
`;

export const RFQ_MARK_AWARDED_AFTER_PPO_INSERT_SQL = `
  UPDATE "rfqs" SET "status" = CASE WHEN ? = 'ISSUED' THEN 'AWARDED' ELSE "status" END, "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" IN ('APPROVED', 'AWARDED')
    AND EXISTS (
      SELECT 1 FROM "ppos"
      WHERE "id" = ? AND "tenantId" = ? AND "rfqId" = ? AND "awardRecommendationId" = ?
    )
    AND EXISTS (
      SELECT 1 FROM "award_recommendations"
      WHERE "id" = ? AND "tenantId" = ? AND "rfqId" = ? AND "status" = 'APPROVED'
    )
`;
