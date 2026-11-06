import { runD1BatchAtomically, writeD1BatchAtomically } from './d1-batch';
import { writeRuntimeStructuredLog } from './observability/runtime-logger';
import {
  MAX_NOTIFICATION_OUTBOX_ATTEMPTS,
  MAX_NOTIFICATION_OUTBOX_BATCH_SIZE,
  MAX_NOTIFICATION_MESSAGE_LENGTH,
  NOTIFICATION_OUTBOX_BASE_RETRY_MS,
  NOTIFICATION_OUTBOX_CLAIM_SQL,
  NOTIFICATION_OUTBOX_DELIVER_SQL,
  NOTIFICATION_OUTBOX_DELIVER_VENDOR_SQL,
  NOTIFICATION_OUTBOX_INSERT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_RFQ_AUDIT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_RATE_CARD_AUDIT_SQL,
  NOTIFICATION_OUTBOX_LEASE_MS,
  NOTIFICATION_OUTBOX_MARK_DELIVERED_SQL,
  NOTIFICATION_OUTBOX_MAX_RETRY_MS,
  NOTIFICATION_OUTBOX_RESCHEDULE_SQL,
} from './notification-outbox.constants';
import type {
  NotificationOutboxDatabase,
  NotificationOutboxDispatchOptions,
  NotificationOutboxDispatchResult,
  NotificationOutboxPayload,
  NotificationOutboxRow,
  PreparedNotificationOutbox,
} from '@app-types/lib/notification-outbox.types';

const NOTIFICATION_TYPES = ['INFO', 'SUCCESS', 'WARNING', 'ACTION_REQUIRED'] as const;
const NOTIFICATION_ENTITY_TYPES = ['PR', 'RFQ', 'QUOTE', 'NEGOTIATION', 'AWARD', 'PPO', 'RATE_CARD', 'AUCTION'] as const;

function isOptionalString(value: unknown, maxLength: number): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maxLength);
}

function isNotificationPayload(value: unknown, tenantId: string): value is NotificationOutboxPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return payload.tenantId === tenantId && typeof payload.tenantId === 'string' && payload.tenantId.length > 0
    && typeof payload.title === 'string' && payload.title.length > 0 && payload.title.length <= 200
    && typeof payload.message === 'string' && payload.message.length <= MAX_NOTIFICATION_MESSAGE_LENGTH
    && isOptionalString(payload.userId, 128)
    && (payload.vendorId === undefined || (typeof payload.vendorId === 'string' && payload.vendorId.length > 0
      && payload.vendorId.length <= 128 && (payload.userId === undefined || payload.userId === null)
      && (payload.targetRole === undefined || payload.targetRole === null)))
    && isOptionalString(payload.targetRole, 100)
    && isOptionalString(payload.entityId, 128)
    && isOptionalString(payload.recordNumber, 128)
    && isOptionalString(payload.link, 500)
    && (payload.type === undefined || NOTIFICATION_TYPES.includes(payload.type as typeof NOTIFICATION_TYPES[number]))
    && (payload.entityType === undefined || payload.entityType === null
      || NOTIFICATION_ENTITY_TYPES.includes(payload.entityType as typeof NOTIFICATION_ENTITY_TYPES[number]));
}

function getRetryDelayMs(attemptCount: number): number {
  return Math.min(NOTIFICATION_OUTBOX_BASE_RETRY_MS * (2 ** Math.max(0, attemptCount - 1)), NOTIFICATION_OUTBOX_MAX_RETRY_MS);
}

function getSafeError(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/.test(error.name)) return error.name;
  if (error instanceof Error) return 'Error';
  return 'Unknown notification dispatch failure';
}

export function prepareNotificationOutbox(
  payload: NotificationOutboxPayload,
  createdAt = new Date(),
  auditLogId?: string,
): PreparedNotificationOutbox {
  if (!isNotificationPayload(payload, payload.tenantId)) {
    throw new Error();
  }
  const id = crypto.randomUUID();
  const statement = auditLogId
    ? {
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL,
      values: [id, payload.tenantId, JSON.stringify(payload), createdAt, createdAt, createdAt, auditLogId, payload.tenantId],
    }
    : {
      sql: NOTIFICATION_OUTBOX_INSERT_SQL,
      values: [id, payload.tenantId, JSON.stringify(payload), createdAt, createdAt, createdAt],
    };
  return { id, payload, createdAt, statement };
}

export function prepareRfqNotificationOutbox(
  payload: NotificationOutboxPayload,
  rfqId: string,
  createdAt = new Date(),
  auditLogId: string,
): PreparedNotificationOutbox {
  const prepared = prepareNotificationOutbox(payload, createdAt, auditLogId);
  return {
    ...prepared,
    statement: {
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_RFQ_AUDIT_SQL,
      values: [prepared.id, payload.tenantId, JSON.stringify(payload), createdAt, createdAt, createdAt,
        rfqId, payload.tenantId, auditLogId, payload.tenantId],
    },
  };
}

export function prepareQuoteNotificationOutbox(
  submittedPayload: NotificationOutboxPayload,
  revisedPayload: NotificationOutboxPayload,
  quoteId: string,
  createdAt = new Date(),
  auditLogId: string,
): PreparedNotificationOutbox {
  if (submittedPayload.tenantId !== revisedPayload.tenantId) throw new Error();
  const prepared = prepareNotificationOutbox(submittedPayload, createdAt, auditLogId);
  prepareNotificationOutbox(revisedPayload, createdAt, auditLogId);
  return {
    ...prepared,
    statement: {
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL,
      values: [prepared.id, submittedPayload.tenantId, JSON.stringify(revisedPayload), JSON.stringify(submittedPayload),
        createdAt, createdAt, createdAt, quoteId, submittedPayload.tenantId, auditLogId, submittedPayload.tenantId],
    },
  };
}

export function prepareRateCardNotificationOutbox(
  payload: NotificationOutboxPayload,
  rateCardId: string,
  createdAt = new Date(),
  auditLogId: string,
): PreparedNotificationOutbox {
  const prepared = prepareNotificationOutbox(payload, createdAt, auditLogId);
  return {
    ...prepared,
    statement: {
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_RATE_CARD_AUDIT_SQL,
      values: [prepared.id, payload.tenantId, JSON.stringify(payload), createdAt, createdAt, createdAt,
        rateCardId, payload.tenantId, auditLogId, payload.tenantId],
    },
  };
}

export async function enqueueNotificationOutbox(
  payload: NotificationOutboxPayload,
  createdAt = new Date(),
): Promise<string> {
  const prepared = prepareNotificationOutbox(payload, createdAt);
  await writeD1BatchAtomically([{
    ...prepared.statement,
  }]);
  return prepared.id;
}

async function rescheduleFailedRow(
  database: NotificationOutboxDatabase,
  row: NotificationOutboxRow,
  lockToken: string,
  now: Date,
  error: unknown,
): Promise<'PENDING' | 'DEAD'> {
  const retryAt = new Date(now.getTime() + getRetryDelayMs(row.attemptCount));
  const results = await runD1BatchAtomically(database, [{
    sql: NOTIFICATION_OUTBOX_RESCHEDULE_SQL,
    values: [MAX_NOTIFICATION_OUTBOX_ATTEMPTS, retryAt, getSafeError(error), now, row.id, lockToken],
  }]);
  const status = results[0]?.results?.[0]?.status;
  if (status === 'DEAD' || status === 'PENDING') return status;
  throw new Error();
}

export async function dispatchNotificationOutbox(
  database: NotificationOutboxDatabase,
  options: NotificationOutboxDispatchOptions = {},
): Promise<NotificationOutboxDispatchResult> {
  const now = options.now || new Date();
  const batchSize = Math.max(1, Math.min(options.batchSize || MAX_NOTIFICATION_OUTBOX_BATCH_SIZE, MAX_NOTIFICATION_OUTBOX_BATCH_SIZE));
  const lockToken = crypto.randomUUID();
  const staleBefore = new Date(now.getTime() - NOTIFICATION_OUTBOX_LEASE_MS);
  const result: NotificationOutboxDispatchResult = { claimed: 0, delivered: 0, retried: 0, dead: 0 };

  let rows: NotificationOutboxRow[];
  try {
    const claim = await runD1BatchAtomically(database, [{
      sql: NOTIFICATION_OUTBOX_CLAIM_SQL,
      values: [now, lockToken, now, now, staleBefore, options.onlyId || null, options.onlyId || null, batchSize],
    }]);
    rows = (claim[0]?.results || []) as unknown as NotificationOutboxRow[];
    result.claimed = rows.length;
  } catch (error) {
    await writeRuntimeStructuredLog('error', 'notification.outbox_claim_failed', {
      operation: 'claim_notification_outbox', route: 'scheduled_worker',
      batchSize, onlyId: options.onlyId, error: getSafeError(error),
    }, 'application');
    return result;
  }

  for (const row of rows) {
    try {
      const payload: unknown = JSON.parse(row.payload);
      if (!isNotificationPayload(payload, row.tenantId)) {
        throw new Error();
      }
      const deliveredAt = now;
      const deliveryStatement = payload.vendorId
        ? {
          sql: NOTIFICATION_OUTBOX_DELIVER_VENDOR_SQL,
          values: [row.id, row.tenantId, payload.vendorId, payload.title, payload.message,
            payload.type || 'INFO', payload.entityType || null,
            payload.entityId || null, payload.recordNumber || null, payload.link || null, deliveredAt,
            row.id, row.tenantId, lockToken],
        }
        : {
          sql: NOTIFICATION_OUTBOX_DELIVER_SQL,
          values: [row.id, row.tenantId, payload.userId || null, payload.targetRole || null,
            payload.title, payload.message, payload.type || 'INFO', payload.entityType || null,
            payload.entityId || null, payload.recordNumber || null, payload.link || null, deliveredAt,
            row.id, row.tenantId, lockToken],
        };
      const delivery = await runD1BatchAtomically(database, [
        deliveryStatement,
        {
          sql: NOTIFICATION_OUTBOX_MARK_DELIVERED_SQL,
          values: [deliveredAt, deliveredAt, row.id, lockToken],
        },
      ]);
      if (Number(delivery[1]?.meta?.changes || 0) !== 1) {
        throw new Error();
      }
      result.delivered += 1;
    } catch (error) {
      try {
        const status = await rescheduleFailedRow(database, row, lockToken, now, error);
        if (status === 'DEAD') result.dead += 1;
        else result.retried += 1;
      } catch (retryError) {
        await writeRuntimeStructuredLog('error', 'notification.outbox_retry_state_failed', {
          operation: 'reschedule_notification_outbox', route: 'scheduled_worker',
          outboxId: row.id, tenantId: row.tenantId, attemptCount: row.attemptCount,
          error: getSafeError(retryError),
        }, 'application');
      }
      await writeRuntimeStructuredLog('error', 'notification.outbox_dispatch_failed', {
        operation: 'deliver_notification_outbox', route: 'scheduled_worker',
        outboxId: row.id, tenantId: row.tenantId, attemptCount: row.attemptCount,
        error: getSafeError(error),
      }, 'application');
    }
  }

  return result;
}
