import { createRequire } from 'node:module';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { writeRfqVendorInvitationsAtomically } from '../src/lib/d1-batch';
import type { D1BatchDatabase, D1BatchResult, D1BatchStatement } from '@app-types/lib/d1-batch.types';

jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue({}) }));

type BoundStatement = D1BatchStatement & { sql: string; values: unknown[] };
interface LocalSQLiteStatement {
  all(...values: unknown[]): unknown[];
  get(...values: unknown[]): unknown;
  run(...values: unknown[]): { changes: number | bigint };
}
interface LocalSQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): LocalSQLiteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(`${process.cwd()}/package.json`)('node:sqlite') as {
  DatabaseSync: new (path: string) => LocalSQLiteDatabase;
};
const getContextMock = getCloudflareContext as jest.Mock;

function createDatabase(): { database: D1BatchDatabase; sqlite: LocalSQLiteDatabase } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE rfqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE vendors (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, isBlacklisted INTEGER NOT NULL);
    CREATE TABLE rfq_vendors (
      id TEXT NOT NULL PRIMARY KEY, tenantId TEXT NOT NULL, rfqId TEXT NOT NULL, vendorId TEXT NOT NULL,
      invitationStatus TEXT NOT NULL, submissionStatus TEXT NOT NULL, UNIQUE(rfqId, vendorId)
    );
    CREATE TABLE audit_logs (
      id TEXT NOT NULL PRIMARY KEY, tenantId TEXT NOT NULL, userId TEXT, projectId TEXT, entityType TEXT NOT NULL,
      entityId TEXT NOT NULL, action TEXT NOT NULL, description TEXT NOT NULL, oldValue TEXT, newValue TEXT,
      ipAddress TEXT, userAgent TEXT, createdAt TEXT NOT NULL
    );
    INSERT INTO rfqs (id, tenantId, status) VALUES ('rfq-1', 'tenant-1', 'DRAFT');
    INSERT INTO vendors (id, tenantId, isBlacklisted) VALUES
      ('vendor-1', 'tenant-1', 0), ('vendor-2', 'tenant-1', 0), ('blocked', 'tenant-1', 1), ('other-tenant', 'tenant-2', 0);
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
          const parameters = values.map((value) => value instanceof Date ? value.toISOString() : value) as never[];
          const result = sqlite.prepare(sql).run(...parameters);
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
  return { database, sqlite };
}

function invitationInput(vendorIds: string[]) {
  return {
    tenantId: 'tenant-1',
    rfqId: 'rfq-1',
    vendorIds,
    audit: { userId: 'user-1', projectId: 'project-1', description: 'Invited vendors' },
    createdAt: new Date('2026-11-07T10:00:00.000Z'),
  };
}

function count(sqlite: LocalSQLiteDatabase, table: string): number {
  return Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count);
}

describe('RFQ vendor invitation D1 consistency', () => {
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('writes deduplicated invitations and one matching audit event atomically', async () => {
    const testDatabase = createDatabase();
    sqlite = testDatabase.sqlite;
    getContextMock.mockReturnValue({ env: { DB: testDatabase.database } });

    await expect(writeRfqVendorInvitationsAtomically(invitationInput(['vendor-1', 'vendor-2', 'vendor-1'])))
      .resolves.toBe(2);

    expect(count(sqlite, 'rfq_vendors')).toBe(2);
    expect(sqlite.prepare('SELECT invitationStatus FROM rfq_vendors ORDER BY vendorId').all()).toEqual([
      { invitationStatus: 'PENDING' }, { invitationStatus: 'PENDING' },
    ]);
    expect(count(sqlite, 'audit_logs')).toBe(1);
    const audit = sqlite.prepare('SELECT * FROM audit_logs').get() as Record<string, unknown>;
    expect(audit).toMatchObject({
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1', entityType: 'RFQ',
      entityId: 'rfq-1', action: 'VENDOR_INVITED', description: 'Invited vendors',
      newValue: JSON.stringify({ vendorIds: ['vendor-1', 'vendor-2'] }),
      createdAt: '2026-11-07T10:00:00.000Z',
    });
  });

  it('derives the invitation status from the persisted RFQ state at batch time', async () => {
    const testDatabase = createDatabase();
    sqlite = testDatabase.sqlite;
    sqlite.prepare('UPDATE rfqs SET status = ? WHERE id = ?').run('RELEASED', 'rfq-1');
    getContextMock.mockReturnValue({ env: { DB: testDatabase.database } });

    await expect(writeRfqVendorInvitationsAtomically(invitationInput(['vendor-1']))).resolves.toBe(1);
    expect(sqlite.prepare('SELECT invitationStatus FROM rfq_vendors WHERE vendorId = ?').get('vendor-1'))
      .toEqual({ invitationStatus: 'INVITED' });
  });

  it('rolls back every invitation if audit persistence fails', async () => {
    const testDatabase = createDatabase();
    sqlite = testDatabase.sqlite;
    sqlite.exec(`CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;`);
    getContextMock.mockReturnValue({ env: { DB: testDatabase.database } });

    await expect(writeRfqVendorInvitationsAtomically(invitationInput(['vendor-1', 'vendor-2'])))
      .rejects.toThrow('audit unavailable');

    expect(count(sqlite, 'rfq_vendors')).toBe(0);
    expect(count(sqlite, 'audit_logs')).toBe(0);
  });

  it.each([['missing vendor', ['vendor-1', 'missing']], ['blacklisted vendor', ['vendor-1', 'blocked']], ['cross-tenant vendor', ['vendor-1', 'other-tenant']]])(
    'does not partially invite a request containing a %s', async (_label, vendorIds) => {
      const testDatabase = createDatabase();
      sqlite = testDatabase.sqlite;
      getContextMock.mockReturnValue({ env: { DB: testDatabase.database } });

      await expect(writeRfqVendorInvitationsAtomically(invitationInput(vendorIds))).rejects.toThrow();

      expect(count(sqlite, 'rfq_vendors')).toBe(0);
      expect(count(sqlite, 'audit_logs')).toBe(0);
    },
  );
});
