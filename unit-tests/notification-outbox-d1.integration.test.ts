import { createRequire } from 'node:module';
import { dispatchNotificationOutbox, prepareNotificationOutbox } from '../src/lib/notification-outbox';
import {
  NOTIFICATION_OUTBOX_CLAIM_SQL,
  NOTIFICATION_OUTBOX_LEASE_MS,
} from '../src/lib/notification-outbox.constants';
import { runD1BatchAtomically } from '../src/lib/d1-batch';
import type { D1BatchDatabase, D1BatchResult, D1BatchStatement } from '@app-types/lib/d1-batch.types';
import type { NotificationOutboxDatabase } from '@app-types/lib/notification-outbox.types';

const TEST_TENANT_ID = 'outbox-integration-tenant';
const STARTED_AT = new Date('2026-11-05T10:00:00.000Z');

const payload = {
  tenantId: TEST_TENANT_ID,
  userId: null,
  targetRole: 'PROCUREMENT_USER',
  title: 'Outbox recovery check',
  message: 'Isolated D1 integration fixture.',
  type: 'INFO' as const,
  entityType: 'RFQ' as const,
  entityId: 'outbox-integration-rfq',
};

type BoundStatement = D1BatchStatement & { sql: string; values: unknown[] };
interface LocalSQLiteStatement {
  all(...values: never[]): unknown[];
  get(...values: never[]): unknown;
  run(...values: never[]): { changes: number | bigint };
}
interface LocalSQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): LocalSQLiteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(`${process.cwd()}/package.json`)('node:sqlite') as {
  DatabaseSync: new (path: string) => LocalSQLiteDatabase;
};

function createDatabase(): { database: NotificationOutboxDatabase; sqlite: LocalSQLiteDatabase } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE notification_outbox (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', attemptCount INTEGER NOT NULL DEFAULT 0,
      nextAttemptAt TEXT NOT NULL, lockedAt TEXT, lockToken TEXT, deliveredAt TEXT,
      lastError TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, userId TEXT, targetRole TEXT,
      vendorId TEXT, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL,
      entityType TEXT, entityId TEXT, recordNumber TEXT, link TEXT, isRead INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  const database: D1BatchDatabase = {
    prepare(sql) {
      return {
        bind(...values) {
          return { sql, values } as BoundStatement;
        },
      };
    },
    async batch(statements): Promise<D1BatchResult[]> {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => {
          const { sql, values } = statement as BoundStatement;
          const prepared = sqlite.prepare(sql);
          const parameters = values.map((value) => value instanceof Date ? value.toISOString() : value) as never[];
          if (/\bRETURNING\b/i.test(sql)) {
            const rows = prepared.all(...parameters) as Array<Record<string, unknown>>;
            const changes = sqlite.prepare('SELECT changes() AS changes').get() as { changes: number };
            return { success: true, results: rows, meta: { changes: Number(changes.changes) } };
          }
          const result = prepared.run(...parameters);
          return { success: true, meta: { changes: Number(result.changes) } };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };

  return { database: database as NotificationOutboxDatabase, sqlite };
}

function readRow<T extends object>(sqlite: LocalSQLiteDatabase, sql: string, ...values: unknown[]): T | undefined {
  return sqlite.prepare(sql).get(...(values as never[])) as T | undefined;
}

async function addOutboxRow(database: NotificationOutboxDatabase): Promise<string> {
  const prepared = prepareNotificationOutbox(payload, STARTED_AT);
  await runD1BatchAtomically(database, [prepared.statement]);
  return prepared.id;
}

describe('notification outbox against isolated SQLite D1 semantics', () => {
  let database: NotificationOutboxDatabase;
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    ({ database, sqlite } = createDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  it('recovers a worker crash after claim and delivers once after the lease expires', async () => {
    const outboxId = await addOutboxRow(database);
    const crashedLockToken = 'worker-crashed-before-delivery';
    await runD1BatchAtomically(database, [{
      sql: NOTIFICATION_OUTBOX_CLAIM_SQL,
      values: [
        STARTED_AT, crashedLockToken, STARTED_AT, STARTED_AT,
        new Date(STARTED_AT.getTime() - NOTIFICATION_OUTBOX_LEASE_MS), null, null, 1,
      ],
    }]);

    expect(readRow(sqlite,
      'SELECT status, attemptCount, lockToken FROM notification_outbox WHERE id = ?', outboxId,
    )).toEqual({ status: 'PROCESSING', attemptCount: 1, lockToken: crashedLockToken });

    const recoveredAt = new Date(STARTED_AT.getTime() + NOTIFICATION_OUTBOX_LEASE_MS + 1);
    await expect(dispatchNotificationOutbox(database, { now: recoveredAt, onlyId: outboxId }))
      .resolves.toEqual({ claimed: 1, delivered: 1, retried: 0, dead: 0 });
    expect(readRow(sqlite,
      'SELECT status, attemptCount, deliveredAt FROM notification_outbox WHERE id = ?', outboxId,
    )).toEqual({ status: 'DELIVERED', attemptCount: 2, deliveredAt: recoveredAt.toISOString() });
    expect(readRow<{ total: number }>(sqlite, 'SELECT COUNT(*) AS total FROM notifications'))
      .toEqual({ total: 1 });

    await expect(dispatchNotificationOutbox(database, {
      now: new Date(recoveredAt.getTime() + NOTIFICATION_OUTBOX_LEASE_MS + 1),
      onlyId: outboxId,
    })).resolves.toEqual({ claimed: 0, delivered: 0, retried: 0, dead: 0 });
    expect(readRow<{ total: number }>(sqlite, 'SELECT COUNT(*) AS total FROM notifications'))
      .toEqual({ total: 1 });
  });

  it('rolls back a failed D1 delivery batch and retries the same notification', async () => {
    const outboxId = await addOutboxRow(database);
    sqlite.exec(`CREATE TRIGGER reject_test_notification BEFORE INSERT ON notifications
      BEGIN SELECT RAISE(ABORT, 'isolated delivery failure'); END`);

    await expect(dispatchNotificationOutbox(database, { now: STARTED_AT, onlyId: outboxId }))
      .resolves.toEqual({ claimed: 1, delivered: 0, retried: 1, dead: 0 });
    expect(readRow(sqlite,
      'SELECT status, attemptCount FROM notification_outbox WHERE id = ?', outboxId,
    )).toEqual({ status: 'PENDING', attemptCount: 1 });
    expect(readRow<{ total: number }>(sqlite, 'SELECT COUNT(*) AS total FROM notifications'))
      .toEqual({ total: 0 });

    sqlite.exec('DROP TRIGGER reject_test_notification');
    await expect(dispatchNotificationOutbox(database, {
      now: new Date(STARTED_AT.getTime() + 1001),
      onlyId: outboxId,
    })).resolves.toEqual({ claimed: 1, delivered: 1, retried: 0, dead: 0 });
    expect(readRow(sqlite,
      'SELECT status, attemptCount FROM notification_outbox WHERE id = ?', outboxId,
    )).toEqual({ status: 'DELIVERED', attemptCount: 2 });
    expect(readRow<{ total: number }>(sqlite, 'SELECT COUNT(*) AS total FROM notifications'))
      .toEqual({ total: 1 });
  });
});
