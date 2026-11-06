import { createRequire } from 'node:module';
import { getD1BatchDatabase } from '../src/lib/d1-batch';
import { runAuditedD1UpdateAtomically as applyAuditedD1UpdateAtomically } from '../src/lib/audited-update';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import type { D1BatchDatabase, D1BatchResult, D1BatchStatement } from '@app-types/lib/d1-batch.types';

jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/lib/d1-batch', () => ({
  ...jest.requireActual('../src/lib/d1-batch'),
  getD1BatchDatabase: jest.fn(),
}));

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
const getDatabase = getD1BatchDatabase as jest.Mock;

function createDatabase(): { database: D1BatchDatabase; sqlite: LocalSQLiteDatabase } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL,
      role TEXT NOT NULL, status TEXT NOT NULL, updatedBy TEXT, updatedAt TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, name TEXT NOT NULL, projectCode TEXT NOT NULL,
      description TEXT, sector TEXT, projectType TEXT, location TEXT, address TEXT, city TEXT, state TEXT, country TEXT,
      areaSqFt REAL, costCentre TEXT, projectOwner TEXT, budget REAL, currency TEXT, status TEXT, updatedBy TEXT, updatedAt TEXT NOT NULL);
    CREATE TABLE vendors (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, name TEXT NOT NULL, vendorType TEXT,
      contactPerson TEXT, email TEXT, phone TEXT, categories TEXT, operatingLocation TEXT, city TEXT, state TEXT,
      country TEXT, legalStructure TEXT, gstin TEXT, pan TEXT, website TEXT, address TEXT, experienceYears REAL,
      turnoverCrores REAL, capabilities TEXT, serviceCoverage TEXT, clientReferences TEXT, certifications TEXT,
      onboardingStatus TEXT, documents TEXT, updatedAt TEXT NOT NULL);
    CREATE TABLE auction_vendors (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, auctionId TEXT NOT NULL, vendorId TEXT NOT NULL,
      termsAccepted INTEGER NOT NULL DEFAULT 0, termsAcceptedAt TEXT, updatedAt TEXT NOT NULL);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, userId TEXT, projectId TEXT,
      entityType TEXT NOT NULL, entityId TEXT NOT NULL, action TEXT NOT NULL, description TEXT NOT NULL,
      oldValue TEXT, newValue TEXT, ipAddress TEXT, userAgent TEXT, createdAt TEXT NOT NULL);
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

  sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'user-1', 'tenant-1', 'user@example.test', 'Old User', 'BUYER', 'ACTIVE', null, '2026-01-01T00:00:00.000Z',
  );
  sqlite.prepare('INSERT INTO projects (id, tenantId, name, projectCode, status, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run(
    'project-1', 'tenant-1', 'Old Project', 'P-1', 'ACTIVE', '2026-01-01T00:00:00.000Z',
  );
  sqlite.prepare('INSERT INTO vendors (id, tenantId, name, phone, updatedAt) VALUES (?, ?, ?, ?, ?)').run(
    'vendor-1', 'tenant-1', 'Old Vendor', '111', '2026-01-01T00:00:00.000Z',
  );
  sqlite.prepare('INSERT INTO auction_vendors (id, tenantId, auctionId, vendorId, updatedAt) VALUES (?, ?, ?, ?, ?)').run(
    'auction-vendor-1', 'tenant-1', 'auction-1', 'vendor-1', '2026-01-01T00:00:00.000Z',
  );
  return { database, sqlite };
}

function audit(entityType: string, entityId: string, tenantId = 'tenant-1') {
  return { tenantId, userId: 'user-1', entityType, entityId, action: 'UPDATE', description: 'Atomic update test' };
}

function runAuditedD1UpdateAtomically(database: D1BatchDatabase, input: Parameters<typeof applyAuditedD1UpdateAtomically>[0]) {
  return applyAuditedD1UpdateAtomically(input, database);
}

describe('audited D1 updates', () => {
  let database: D1BatchDatabase;
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    getDatabase.mockReset();
    ({ database, sqlite } = createDatabase());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    sqlite.close();
  });

  it('updates all supported record types with matching audit entries in one batch', async () => {
    const updatedAt = new Date('2026-02-01T00:00:00.000Z');
    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'user', id: 'user-1', tenantId: 'tenant-1', data: { name: 'New User', updatedBy: 'editor-1' },
      audit: audit('USER', 'user-1'), route: '/api/admin/users/[id]', updatedAt,
    })).resolves.toMatchObject({ id: 'user-1', name: 'New User', updatedAt: updatedAt.toISOString() });
    await runAuditedD1UpdateAtomically(database, {
      table: 'project', id: 'project-1', tenantId: 'tenant-1', data: { name: 'New Project' },
      audit: audit('PROJECT', 'project-1'), route: '/api/projects/[id]', updatedAt,
    });
    await runAuditedD1UpdateAtomically(database, {
      table: 'vendor', id: 'vendor-1', tenantId: 'tenant-1',
      data: { phone: '222', capabilities: ['Electrical'], documents: [{ filename: 'certificate.pdf' }] },
      audit: audit('VENDOR', 'vendor-1'), route: '/api/vendor-portal/me', updatedAt,
    });
    await runAuditedD1UpdateAtomically(database, {
      table: 'auctionVendor', id: 'auction-vendor-1', tenantId: 'tenant-1',
      data: { termsAccepted: true, termsAcceptedAt: updatedAt },
      audit: audit('AUCTION', 'auction-1'), route: '/api/procurement/auctions/[id]/terms-accept', updatedAt,
    });

    expect(sqlite.prepare('SELECT COUNT(*) AS total FROM audit_logs').get()).toEqual({ total: 4 });
    expect(sqlite.prepare('SELECT name FROM projects WHERE id = ?').get('project-1')).toEqual({ name: 'New Project' });
    expect(sqlite.prepare('SELECT capabilities, documents FROM vendors WHERE id = ?').get('vendor-1')).toEqual({
      capabilities: '["Electrical"]', documents: '[{"filename":"certificate.pdf"}]',
    });
    expect(sqlite.prepare('SELECT termsAccepted FROM auction_vendors WHERE id = ?').get('auction-vendor-1')).toEqual({ termsAccepted: 1 });
  });

  it('uses the configured D1 binding and persists optional audit context when no database is injected', async () => {
    getDatabase.mockReturnValue(database);
    await applyAuditedD1UpdateAtomically({
      table: 'project', id: 'project-1', tenantId: 'tenant-1', data: { name: 'Audited Project' },
      audit: {
        ...audit('PROJECT', 'project-1'), userId: undefined, projectId: 'project-1',
        oldValue: { name: 'Old Project' }, newValue: { name: 'Audited Project' },
        ipAddress: '127.0.0.1', userAgent: 'test-agent',
      },
      route: '/api/projects/[id]',
    });

    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare('SELECT userId, projectId, oldValue, newValue, ipAddress, userAgent FROM audit_logs').get()).toEqual({
      userId: null, projectId: 'project-1', oldValue: '{"name":"Old Project"}', newValue: '{"name":"Audited Project"}',
      ipAddress: '127.0.0.1', userAgent: 'test-agent',
    });
  });

  it('rejects and logs a successful batch response that omits a valid updated row', async () => {
    jest.spyOn(database, 'batch').mockResolvedValue([
      { success: true, results: [{ id: 123 }] },
      { success: true, meta: { changes: 1 } },
      { success: true, results: [{ audited: 1 }] },
    ]);

    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'project', id: 'project-1', tenantId: 'tenant-1', data: { name: 'No Returned ID' },
      audit: audit('PROJECT', 'project-1'), route: '/api/projects/[id]',
    })).rejects.toThrow('Audited D1 update returned no record');
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'database.audited_update_failed', expect.objectContaining({
      route: '/api/projects/[id]', recordId: 'project-1',
    }), 'application');
  });

  it('rolls the business update back if the audit insert fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'audit store unavailable'); END`);

    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'project', id: 'project-1', tenantId: 'tenant-1', data: { name: 'Should Roll Back' },
      audit: audit('PROJECT', 'project-1'), route: '/api/projects/[id]',
    })).rejects.toThrow('audit store unavailable');

    expect(sqlite.prepare('SELECT name FROM projects WHERE id = ?').get('project-1')).toEqual({ name: 'Old Project' });
    expect(sqlite.prepare('SELECT COUNT(*) AS total FROM audit_logs').get()).toEqual({ total: 0 });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'database.audited_update_failed', expect.objectContaining({
      table: 'projects', tenantId: 'tenant-1', recordId: 'project-1', entityType: 'PROJECT',
    }), 'application');
  });

  it('rolls back when the scoped update finds no row and the audit assertion fails', async () => {
    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'user', id: 'missing', tenantId: 'tenant-1', data: { name: 'No User' },
      audit: audit('USER', 'missing'), route: '/api/admin/users/[id]',
    })).rejects.toThrow();

    expect(sqlite.prepare('SELECT COUNT(*) AS total FROM audit_logs').get()).toEqual({ total: 0 });
  });

  it('rejects an unsupported column or cross-tenant audit before writing', async () => {
    const batch = jest.spyOn(database, 'batch');
    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'vendor', id: 'vendor-1', tenantId: 'tenant-1', data: { status: 'DISABLED' },
      audit: audit('VENDOR', 'vendor-1'), route: '/api/vendor-portal/me',
    })).rejects.toThrow('unsupported field');
    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'vendor', id: 'vendor-1', tenantId: 'tenant-1', data: { phone: '333' },
      audit: audit('VENDOR', 'vendor-1', 'other-tenant'), route: '/api/vendor-portal/me',
    })).rejects.toThrow('tenant mismatch');
    expect(batch).not.toHaveBeenCalled();
  });

  it('preserves the database failure if structured logging is also unavailable', async () => {
    sqlite.exec(`CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'audit store unavailable'); END`);
    (writeStructuredLog as jest.Mock).mockRejectedValueOnce(new Error('logger unavailable'));

    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'project', id: 'project-1', tenantId: 'tenant-1', data: { name: 'Should Roll Back' },
      audit: audit('PROJECT', 'project-1'), route: '/api/projects/[id]',
    })).rejects.toThrow('audit store unavailable');
    expect(sqlite.prepare('SELECT name FROM projects WHERE id = ?').get('project-1')).toEqual({ name: 'Old Project' });
  });

  it('logs a safe error type when D1 rejects with a non-Error value', async () => {
    const failure = { code: 'D1_UNAVAILABLE' };
    jest.spyOn(database, 'batch').mockRejectedValue(failure);

    await expect(runAuditedD1UpdateAtomically(database, {
      table: 'project', id: 'project-1', tenantId: 'tenant-1', data: { name: 'Should Fail' },
      audit: audit('PROJECT', 'project-1'), route: '/api/projects/[id]',
    })).rejects.toEqual(failure);
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'database.audited_update_failed', expect.objectContaining({
      error: { name: 'UnknownError' },
    }), 'application');
  });
});
