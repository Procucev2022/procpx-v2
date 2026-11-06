export const MAX_NOTIFICATION_OUTBOX_BATCH_SIZE = 20;
export const MAX_NOTIFICATION_OUTBOX_ATTEMPTS = 8;
export const NOTIFICATION_OUTBOX_LEASE_MS = 5 * 60 * 1000;
export const NOTIFICATION_OUTBOX_BASE_RETRY_MS = 1000;
export const NOTIFICATION_OUTBOX_MAX_RETRY_MS = 6 * 60 * 60 * 1000;
export const MAX_NOTIFICATION_MESSAGE_LENGTH = 4_000;

export const NOTIFICATION_OUTBOX_INSERT_SQL = `
  INSERT INTO "notification_outbox" (
    "id", "tenantId", "payload", "status", "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, 'PENDING', 0, ?, ?, ?)
`;

export const NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL = `
  INSERT INTO "notification_outbox" (
    "id", "tenantId", "payload", "status", "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
  )
  SELECT ?, ?, ?, 'PENDING', 0, ?, ?, ?
  WHERE EXISTS (
    SELECT 1 FROM "audit_logs" WHERE "id" = ? AND "tenantId" = ?
  )
`;

export const NOTIFICATION_OUTBOX_INSERT_AFTER_RFQ_AUDIT_SQL = `
  INSERT INTO "notification_outbox" (
    "id", "tenantId", "payload", "status", "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
  )
  SELECT ?, ?, REPLACE(?, '__RFQ_NUMBER__', r."rfqNumber"), 'PENDING', 0, ?, ?, ?
  FROM "rfqs" r
  WHERE r."id" = ? AND r."tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" a WHERE a."id" = ? AND a."tenantId" = ?
  )
`;

export const NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL = `
  INSERT INTO "notification_outbox" (
    "id", "tenantId", "payload", "status", "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
  )
  SELECT ?, ?, CASE WHEN q."quoteVersion" > 1 THEN ? ELSE ? END, 'PENDING', 0, ?, ?, ?
  FROM "quotes" q
  WHERE q."id" = ? AND q."tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" a WHERE a."id" = ? AND a."tenantId" = ?
  )
`;

export const NOTIFICATION_OUTBOX_INSERT_AFTER_RATE_CARD_AUDIT_SQL = `
  INSERT INTO "notification_outbox" (
    "id", "tenantId", "payload", "status", "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
  )
  SELECT ?, ?, REPLACE(?, '__RATE_CARD_NUMBER__', rc."rateCardNumber"), 'PENDING', 0, ?, ?, ?
  FROM "vendor_rate_cards" rc
  WHERE rc."id" = ? AND rc."tenantId" = ? AND EXISTS (
    SELECT 1 FROM "audit_logs" a WHERE a."id" = ? AND a."tenantId" = ?
  )
`;

export const NOTIFICATION_OUTBOX_CLAIM_SQL = `
  UPDATE "notification_outbox"
  SET "status" = 'PROCESSING', "attemptCount" = "attemptCount" + 1,
      "lockedAt" = ?, "lockToken" = ?, "updatedAt" = ?
  WHERE "id" IN (
    SELECT "id" FROM "notification_outbox"
    WHERE (("status" = 'PENDING' AND "nextAttemptAt" <= ?)
      OR ("status" = 'PROCESSING' AND "lockedAt" <= ?))
      AND (? IS NULL OR "id" = ?)
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT ?
  )
  RETURNING "id", "tenantId", "payload", "attemptCount"
`;

export const NOTIFICATION_OUTBOX_DELIVER_SQL = `
  INSERT INTO "notifications" (
    "id", "tenantId", "userId", "targetRole", "title", "message", "type",
    "entityType", "entityId", "recordNumber", "link", "isRead", "createdAt"
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?
  WHERE EXISTS (
    SELECT 1 FROM "notification_outbox"
    WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PROCESSING' AND "lockToken" = ?
  )
  ON CONFLICT ("id") DO NOTHING
`;

export const NOTIFICATION_OUTBOX_DELIVER_VENDOR_SQL = `
  INSERT INTO "notifications" (
    "id", "tenantId", "userId", "targetRole", "vendorId", "title", "message", "type",
    "entityType", "entityId", "recordNumber", "link", "isRead", "createdAt"
  )
  SELECT ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?
  WHERE EXISTS (
    SELECT 1 FROM "notification_outbox"
    WHERE "id" = ? AND "tenantId" = ? AND "status" = 'PROCESSING' AND "lockToken" = ?
  )
  ON CONFLICT ("id") DO NOTHING
`;

export const NOTIFICATION_OUTBOX_MARK_DELIVERED_SQL = `
  UPDATE "notification_outbox"
  SET "status" = 'DELIVERED', "deliveredAt" = ?, "lockedAt" = NULL,
      "lockToken" = NULL, "lastError" = NULL, "updatedAt" = ?
  WHERE "id" = ? AND "status" = 'PROCESSING' AND "lockToken" = ?
    AND EXISTS (SELECT 1 FROM "notifications" WHERE "id" = "notification_outbox"."id" AND "tenantId" = "notification_outbox"."tenantId")
`;

export const NOTIFICATION_OUTBOX_RESCHEDULE_SQL = `
  UPDATE "notification_outbox"
  SET "status" = CASE WHEN "attemptCount" >= ? THEN 'DEAD' ELSE 'PENDING' END,
      "nextAttemptAt" = ?, "lastError" = substr(?, 1, 400),
      "lockedAt" = NULL, "lockToken" = NULL, "updatedAt" = ?
  WHERE "id" = ? AND "status" = 'PROCESSING' AND "lockToken" = ?
  RETURNING "status"
`;
