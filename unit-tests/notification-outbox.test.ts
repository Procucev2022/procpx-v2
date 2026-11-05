import {
  dispatchNotificationOutbox,
  enqueueNotificationOutbox,
  prepareQuoteNotificationOutbox,
  prepareNotificationOutbox,
  prepareRfqNotificationOutbox,
  prepareRateCardNotificationOutbox,
} from '../src/lib/notification-outbox';
import {
  NOTIFICATION_OUTBOX_CLAIM_SQL,
  NOTIFICATION_OUTBOX_DELIVER_SQL,
  NOTIFICATION_OUTBOX_DELIVER_VENDOR_SQL,
  NOTIFICATION_OUTBOX_INSERT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_RFQ_AUDIT_SQL,
  NOTIFICATION_OUTBOX_INSERT_AFTER_RATE_CARD_AUDIT_SQL,
  NOTIFICATION_OUTBOX_MARK_DELIVERED_SQL,
  NOTIFICATION_OUTBOX_RESCHEDULE_SQL,
} from '../src/lib/notification-outbox.constants';
import { runD1BatchAtomically, writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import type { NotificationOutboxDatabase, NotificationOutboxRow } from '@app-types/lib/notification-outbox.types';

jest.mock('../src/lib/d1-batch', () => ({
  runD1BatchAtomically: jest.fn(),
  writeD1BatchAtomically: jest.fn(),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const runBatch = runD1BatchAtomically as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const log = writeStructuredLog as jest.Mock;
const database = {} as NotificationOutboxDatabase;
const now = new Date('2026-11-04T10:00:00.000Z');

function notificationPayload(tenantId = 'tenant-1') {
  return {
    tenantId,
    userId: null,
    targetRole: 'PROCUREMENT_USER',
    title: 'RFQ released',
    message: 'RFQ-1 is ready for sourcing',
    type: 'ACTION_REQUIRED' as const,
    entityType: 'RFQ' as const,
    entityId: 'rfq-1',
    recordNumber: 'RFQ-1',
    link: '/procurement/rfqs/rfq-1',
  };
}

function outboxRow(payload: unknown = notificationPayload(), attemptCount = 1): NotificationOutboxRow {
  return { id: 'outbox-1', tenantId: 'tenant-1', payload: JSON.stringify(payload), attemptCount };
}

function vendorNotificationPayload() {
  return {
    tenantId: 'tenant-1', vendorId: 'vendor-1', title: 'Auction invitation',
    message: 'You are invited to bid.', type: 'ACTION_REQUIRED' as const,
    entityType: 'AUCTION' as const, entityId: 'auction-1', link: '/vendor-portal/auctions/auction-1',
  };
}

describe('notification outbox enqueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    writeBatch.mockResolvedValue([]);
  });

  it('inserts an idempotency key and serialized payload through the D1 batch helper', async () => {
    const id = await enqueueNotificationOutbox(notificationPayload(), now);
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(writeBatch).toHaveBeenCalledWith([{
      sql: NOTIFICATION_OUTBOX_INSERT_SQL,
      values: [id, 'tenant-1', JSON.stringify(notificationPayload()), now, now, now],
    }]);
  });

  it('prepares an insert that is conditional on the same business audit event', () => {
    const prepared = prepareNotificationOutbox(notificationPayload(), now, 'audit-1');
    expect(prepared.statement).toEqual({
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_AUDIT_SQL,
      values: [prepared.id, 'tenant-1', JSON.stringify(notificationPayload()), now, now, now, 'audit-1', 'tenant-1'],
    });
    expect(prepared.statement.sql).toContain('WHERE EXISTS');
  });

  it('binds generated RFQ numbers into a release notification inside the business batch', () => {
    const payload = { ...notificationPayload(), title: 'RFQ __RFQ_NUMBER__ released',
      message: 'RFQ __RFQ_NUMBER__ is ready', recordNumber: '__RFQ_NUMBER__' };
    const prepared = prepareRfqNotificationOutbox(payload, 'rfq-1', now, 'audit-1');
    expect(prepared.statement).toEqual({
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_RFQ_AUDIT_SQL,
      values: [prepared.id, 'tenant-1', JSON.stringify(payload), now, now, now, 'rfq-1', 'tenant-1', 'audit-1', 'tenant-1'],
    });
    expect(prepared.statement.sql).toContain('REPLACE(?, \'__RFQ_NUMBER__\', r."rfqNumber")');
  });

  it('selects the first-quote or revised-quote notification from the inserted quote version', () => {
    const submitted = { ...notificationPayload(), title: 'New quote', message: 'Initial quote received' };
    const revised = { ...notificationPayload(), title: 'Revised quote', message: 'Revised quote received' };
    const prepared = prepareQuoteNotificationOutbox(submitted, revised, 'quote-1', now, 'audit-1');
    expect(prepared.statement).toEqual({
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_QUOTE_AUDIT_SQL,
      values: [prepared.id, 'tenant-1', JSON.stringify(revised), JSON.stringify(submitted), now, now, now, 'quote-1', 'tenant-1', 'audit-1', 'tenant-1'],
    });
    expect(prepared.statement.sql).toContain('CASE WHEN q."quoteVersion" > 1 THEN ? ELSE ? END');
  });

  it('binds rate-card notifications to the matching audited rate-card transition', () => {
    const prepared = prepareRateCardNotificationOutbox(notificationPayload(), 'rate-card-1', now, 'audit-1');
    expect(prepared.statement).toEqual({
      sql: NOTIFICATION_OUTBOX_INSERT_AFTER_RATE_CARD_AUDIT_SQL,
      values: [prepared.id, 'tenant-1', JSON.stringify(notificationPayload()), now, now, now,
        'rate-card-1', 'tenant-1', 'audit-1', 'tenant-1'],
    });
  });

  it('rejects non-object payloads and quote notifications that cross tenant boundaries', () => {
    for (const payload of [null, [], 'notification']) {
      expect(() => prepareNotificationOutbox(payload as never, now)).toThrow();
    }
    expect(() => prepareNotificationOutbox({ ...notificationPayload(), tenantId: '' }, now)).toThrow();
    expect(() => prepareQuoteNotificationOutbox(
      notificationPayload('tenant-1'), notificationPayload('tenant-2'), 'quote-1', now, 'audit-1',
    )).toThrow();
  });

  it.each([
    ['empty title', { ...notificationPayload(), title: '' }],
    ['oversized message', { ...notificationPayload(), message: 'x'.repeat(4001) }],
    ['unknown type', { ...notificationPayload(), type: 'LOUD' }],
    ['wrong entity type', { ...notificationPayload(), entityType: 'USER' }],
    ['oversized link', { ...notificationPayload(), link: 'x'.repeat(501) }],
    ['oversized title', { ...notificationPayload(), title: 'x'.repeat(201) }],
    ['oversized user ID', { ...notificationPayload(), userId: 'x'.repeat(129) }],
    ['oversized target role', { ...notificationPayload(), targetRole: 'x'.repeat(101) }],
    ['oversized entity ID', { ...notificationPayload(), entityId: 'x'.repeat(129) }],
    ['oversized record number', { ...notificationPayload(), recordNumber: 'x'.repeat(129) }],
  ])('rejects an invalid %s before it reaches D1', async (_name, payload) => {
    await expect(enqueueNotificationOutbox(payload as never, now)).rejects.toThrow();
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('accepts vendor-scoped auction invitation payloads and rejects an empty vendor scope', async () => {
    const prepared = prepareNotificationOutbox(vendorNotificationPayload(), now, 'audit-1');
    expect(JSON.parse(String(prepared.statement.values[2]))).toMatchObject({
      vendorId: 'vendor-1', entityType: 'AUCTION', entityId: 'auction-1',
    });
    await expect(enqueueNotificationOutbox({ ...vendorNotificationPayload(), vendorId: '' }, now)).rejects.toThrow();
    await expect(enqueueNotificationOutbox({ ...vendorNotificationPayload(), targetRole: 'VENDOR' }, now)).rejects.toThrow();
  });
});

describe('notification outbox dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('claims bounded rows, verifies the lease before delivery, and marks delivery in the same atomic batch', async () => {
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow()] }])
      .mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);

    await expect(dispatchNotificationOutbox(database, { now, batchSize: 50 })).resolves.toEqual({
      claimed: 1, delivered: 1, retried: 0, dead: 0,
    });
    const claimStatements = runBatch.mock.calls[0][1];
    expect(claimStatements).toEqual([{
      sql: NOTIFICATION_OUTBOX_CLAIM_SQL,
      values: [now, expect.any(String), now, now, new Date(now.getTime() - 5 * 60 * 1000), null, null, 20],
    }]);
    const deliveryStatements = runBatch.mock.calls[1][1];
    expect(deliveryStatements).toHaveLength(2);
    expect(deliveryStatements[0].sql).toBe(NOTIFICATION_OUTBOX_DELIVER_SQL);
    expect(deliveryStatements[0].sql).toContain('"lockToken" = ?');
    expect(deliveryStatements[0].values).toEqual([
      'outbox-1', 'tenant-1', null, 'PROCUREMENT_USER', 'RFQ released', 'RFQ-1 is ready for sourcing',
      'ACTION_REQUIRED', 'RFQ', 'rfq-1', 'RFQ-1', '/procurement/rfqs/rfq-1', now,
      'outbox-1', 'tenant-1', expect.any(String),
    ]);
    expect(deliveryStatements[1]).toEqual({
      sql: NOTIFICATION_OUTBOX_MARK_DELIVERED_SQL,
      values: [now, now, 'outbox-1', deliveryStatements[0].values[14]],
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('delivers one durable vendor-scoped notification without requiring an active portal account', async () => {
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow(vendorNotificationPayload())] }])
      .mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);

    await expect(dispatchNotificationOutbox(database, { now })).resolves.toEqual({
      claimed: 1, delivered: 1, retried: 0, dead: 0,
    });
    const delivery = runBatch.mock.calls[1][1][0];
    expect(delivery.sql).toBe(NOTIFICATION_OUTBOX_DELIVER_VENDOR_SQL);
    expect(delivery.sql).toContain('"vendorId"');
    expect(delivery.sql).not.toContain('FROM "users"');
    expect(delivery.values).toEqual([
      'outbox-1', 'tenant-1', 'vendor-1', 'Auction invitation', 'You are invited to bid.',
      'ACTION_REQUIRED', 'AUCTION', 'auction-1', null, '/vendor-portal/auctions/auction-1', now,
      'outbox-1', 'tenant-1', expect.any(String),
    ]);
  });

  it('uses stable defaults and returns cleanly when there are no queued rows', async () => {
    runBatch.mockResolvedValueOnce([{ results: [] }]);
    await expect(dispatchNotificationOutbox(database)).resolves.toEqual({
      claimed: 0, delivered: 0, retried: 0, dead: 0,
    });
    const values = runBatch.mock.calls[0][1][0].values;
    expect(values[0]).toBeInstanceOf(Date);
    expect(values[5]).toBeNull();
    expect(values[6]).toBeNull();
    expect(values[7]).toBe(20);
  });

  it('uses safe fallbacks for optional delivery fields', async () => {
    const sparsePayload = { tenantId: 'tenant-1', title: 'Plain notice', message: 'No optional fields' };
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow(sparsePayload as never)] }])
      .mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(dispatchNotificationOutbox(database, { now, batchSize: 0 })).resolves.toEqual({
      claimed: 1, delivered: 1, retried: 0, dead: 0,
    });
    expect(runBatch.mock.calls[0][1][0].values[7]).toBe(20);
    expect(runBatch.mock.calls[1][1][0].values.slice(2, 11)).toEqual([
      null, null, 'Plain notice', 'No optional fields', 'INFO', null, null, null, null,
    ]);
  });

  it('logs a claim failure and returns an empty result without processing rows', async () => {
    runBatch.mockRejectedValueOnce(new Error('sensitive SQL value for user@example.com'));
    await expect(dispatchNotificationOutbox(database, { now, onlyId: 'outbox-1' })).resolves.toEqual({
      claimed: 0, delivered: 0, retried: 0, dead: 0,
    });
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('error', 'notification.outbox_claim_failed', expect.objectContaining({
      operation: 'claim_notification_outbox', onlyId: 'outbox-1', error: 'Error',
    }), 'application', undefined);
    expect(JSON.stringify(log.mock.calls)).not.toContain('user@example.com');
  });

  it('marks malformed or cross-tenant payloads dead after the maximum attempts', async () => {
    const malformed = { ...outboxRow(), payload: '{not-json' };
    runBatch
      .mockResolvedValueOnce([{ results: [malformed] }])
      .mockResolvedValueOnce([{ results: [{ status: 'DEAD' }] }]);
    await expect(dispatchNotificationOutbox(database, { now })).resolves.toEqual({
      claimed: 1, delivered: 0, retried: 0, dead: 1,
    });
    expect(runBatch.mock.calls[1][1][0]).toEqual({
      sql: NOTIFICATION_OUTBOX_RESCHEDULE_SQL,
      values: [8, new Date(now.getTime() + 1000), 'SyntaxError', now, 'outbox-1', expect.any(String)],
    });

    jest.clearAllMocks();
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow(notificationPayload('other-tenant'), 8)] }])
      .mockResolvedValueOnce([{ results: [{ status: 'DEAD' }] }]);
    await expect(dispatchNotificationOutbox(database, { now })).resolves.toMatchObject({ dead: 1, delivered: 0 });
  });

  it('schedules transient failures with capped exponential retry and excludes raw error text from diagnostics', async () => {
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow(notificationPayload(), 4)] }])
      .mockRejectedValueOnce(new Error('private value user@example.com'))
      .mockResolvedValueOnce([{ results: [{ status: 'PENDING' }] }]);

    await expect(dispatchNotificationOutbox(database, { now })).resolves.toEqual({
      claimed: 1, delivered: 0, retried: 1, dead: 0,
    });
    expect(runBatch.mock.calls[2][1][0]).toEqual({
      sql: NOTIFICATION_OUTBOX_RESCHEDULE_SQL,
      values: [8, new Date(now.getTime() + 8000), 'Error', now, 'outbox-1', expect.any(String)],
    });
    expect(log).toHaveBeenCalledWith('error', 'notification.outbox_dispatch_failed', expect.objectContaining({
      outboxId: 'outbox-1', tenantId: 'tenant-1', attemptCount: 4, error: 'Error',
    }), 'application', undefined);
    expect(JSON.stringify(log.mock.calls)).not.toContain('user@example.com');
  });

  it('does not claim delivery or retry ownership after the lease token is lost', async () => {
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow()] }])
      .mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }])
      .mockResolvedValueOnce([{ results: [] }]);

    await expect(dispatchNotificationOutbox(database, { now })).resolves.toEqual({
      claimed: 1, delivered: 0, retried: 0, dead: 0,
    });
    expect(runBatch.mock.calls[1][1][0].sql).toContain('"lockToken" = ?');
    expect(log).toHaveBeenCalledWith('error', 'notification.outbox_retry_state_failed', expect.objectContaining({
      outboxId: 'outbox-1', error: 'Error',
    }), 'application', undefined);
  });

  it('contains a row when retry-state persistence itself fails', async () => {
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow()] }])
      .mockRejectedValueOnce(new Error('database error'))
      .mockRejectedValueOnce(new Error('retry store error'));
    await expect(dispatchNotificationOutbox(database, { now })).resolves.toEqual({
      claimed: 1, delivered: 0, retried: 0, dead: 0,
    });
    expect(log).toHaveBeenCalledWith('error', 'notification.outbox_retry_state_failed', expect.any(Object), 'application', undefined);
    expect(log).toHaveBeenCalledWith('error', 'notification.outbox_dispatch_failed', expect.any(Object), 'application', undefined);
  });

  it('sanitizes unknown errors and rejects unrecognized retry states', async () => {
    runBatch
      .mockResolvedValueOnce([{ results: [outboxRow()] }])
      .mockRejectedValueOnce({ detail: 'private-value' })
      .mockResolvedValueOnce([{ results: [{ status: 'UNEXPECTED' }] }]);
    await expect(dispatchNotificationOutbox(database, { now })).resolves.toEqual({
      claimed: 1, delivered: 0, retried: 0, dead: 0,
    });
    expect(log).toHaveBeenCalledWith('error', 'notification.outbox_retry_state_failed', expect.objectContaining({
      outboxId: 'outbox-1', error: 'Error',
    }), 'application', undefined);
    expect(log).toHaveBeenCalledWith('error', 'notification.outbox_dispatch_failed', expect.objectContaining({
      outboxId: 'outbox-1', error: 'Unknown notification dispatch failure',
    }), 'application', undefined);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-value');
  });
});
