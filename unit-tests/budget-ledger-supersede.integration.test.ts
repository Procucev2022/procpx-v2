import { createRequire } from 'node:module';
import {
  BUDGET_TRANSACTION_INSERT_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTION_SUPERSEDE_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL,
} from '../src/lib/d1-batch.constants';

// Runs the production budget ledger SQL against SQLite to prove that a resubmission
// keeps earlier ledger rows, never reuses their codes, and never revives them.

interface LocalSQLiteStatement {
  all(...values: unknown[]): Array<Record<string, unknown>>;
  run(...values: unknown[]): { changes: number | bigint };
}
interface LocalSQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): LocalSQLiteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(process.cwd() + '/package.json')('node:sqlite') as {
  DatabaseSync: new (path: string) => LocalSQLiteDatabase;
};

const TENANT = 'tenant-1';
const CONTRIBUTION = 'contribution-1';
const NOW = '2026-11-17T00:00:00.000Z';

interface LedgerRow {
  transactionCode: string;
  status: string;
  amount: number;
}

function createLedger(): LocalSQLiteDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE audit_logs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL);' +
    'CREATE TABLE budget_transactions (' +
    'id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, transactionCode TEXT NOT NULL, projectId TEXT NOT NULL, ' +
    'costCentreId TEXT NOT NULL, boqId TEXT, boqRevisionId TEXT, boqLineId TEXT, contributionId TEXT, ' +
    'category TEXT NOT NULL, amount REAL NOT NULL, quantity REAL, rate REAL, status TEXT NOT NULL, ' +
    'reference TEXT, createdBy TEXT NOT NULL, budgetDate TEXT NOT NULL, createdAt TEXT NOT NULL, ' +
    'UNIQUE (tenantId, transactionCode));',
  );
  return sqlite;
}

function recordAudit(sqlite: LocalSQLiteDatabase, auditId: string) {
  sqlite.prepare('INSERT INTO audit_logs (id, tenantId) VALUES (?, ?)').run(auditId, TENANT);
}

function seedRejectedLedger(sqlite: LocalSQLiteDatabase) {
  recordAudit(sqlite, 'audit-created');
  const insert = sqlite.prepare(
    'INSERT INTO budget_transactions (id, tenantId, transactionCode, projectId, costCentreId, boqId, boqRevisionId, ' +
    'contributionId, category, amount, quantity, rate, status, reference, createdBy, budgetDate, createdAt) ' +
    "VALUES (?, ?, ?, 'project-1', 'cc-1', 'boq-1', 'revision-1', ?, ?, ?, 1, ?, 'REJECTED', 'seed', 'user-1', ?, ?)",
  );
  insert.run('tx-1', TENANT, 'BTX-000001', CONTRIBUTION, 'Electrical', 100, 100, NOW, NOW);
  insert.run('tx-2', TENANT, 'BTX-000002', CONTRIBUTION, 'Plumbing', 50, 50, NOW, NOW);
}

function supersedeEarlierRows(sqlite: LocalSQLiteDatabase, auditId: string) {
  return sqlite.prepare(BUDGET_TRANSACTION_SUPERSEDE_AFTER_AUDIT_SQL).run(TENANT, CONTRIBUTION, auditId, TENANT);
}

function insertAllocation(sqlite: LocalSQLiteDatabase, id: string, category: string, amount: number, auditId: string) {
  // Same parameter order as add-to-budget: id, tenant, MAX-code tenant, scope columns, values, audit guard.
  return sqlite.prepare(BUDGET_TRANSACTION_INSERT_AFTER_AUDIT_SQL).all(
    id, TENANT, TENANT, 'project-1', 'cc-1', 'boq-1', 'revision-1', 'line-1', CONTRIBUTION,
    category, amount, 1, amount, 'allocation', 'user-1', NOW, NOW, auditId, TENANT,
  );
}

function ledgerRows(sqlite: LocalSQLiteDatabase): LedgerRow[] {
  return sqlite.prepare(
    'SELECT transactionCode, status, amount FROM budget_transactions WHERE contributionId = ? ORDER BY transactionCode',
  ).all(CONTRIBUTION) as unknown as LedgerRow[];
}

function sumWhere(sqlite: LocalSQLiteDatabase, statusSql: string): number {
  const row = sqlite.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM budget_transactions WHERE tenantId = ? AND ${statusSql}`,
  ).all(TENANT)[0];
  return Number(row?.total ?? 0);
}

describe('budget ledger supersede on resubmission (D1 SQL)', () => {
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    sqlite = createLedger();
    seedRejectedLedger(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('keeps earlier ledger rows as SUPERSEDED instead of deleting them', () => {
    recordAudit(sqlite, 'audit-resubmit');

    const result = supersedeEarlierRows(sqlite, 'audit-resubmit');

    expect(Number(result.changes)).toBe(2);
    expect(ledgerRows(sqlite)).toEqual([
      { transactionCode: 'BTX-000001', status: 'SUPERSEDED', amount: 100 },
      { transactionCode: 'BTX-000002', status: 'SUPERSEDED', amount: 50 },
    ]);
  });

  it('continues transaction codes after superseded rows, so no code is reissued', () => {
    recordAudit(sqlite, 'audit-resubmit');
    supersedeEarlierRows(sqlite, 'audit-resubmit');

    const first = insertAllocation(sqlite, 'tx-3', 'Electrical', 80, 'audit-resubmit');
    const second = insertAllocation(sqlite, 'tx-4', 'General', 20, 'audit-resubmit');

    expect(first).toEqual([{ id: 'tx-3', transactionCode: 'BTX-000003' }]);
    expect(second).toEqual([{ id: 'tx-4', transactionCode: 'BTX-000004' }]);
    expect(ledgerRows(sqlite).map((row) => row.transactionCode)).toEqual([
      'BTX-000001', 'BTX-000002', 'BTX-000003', 'BTX-000004',
    ]);
  });

  it('excludes superseded rows from active totals and does not revive them on approval', () => {
    recordAudit(sqlite, 'audit-resubmit');
    supersedeEarlierRows(sqlite, 'audit-resubmit');
    insertAllocation(sqlite, 'tx-3', 'Electrical', 80, 'audit-resubmit');
    insertAllocation(sqlite, 'tx-4', 'General', 20, 'audit-resubmit');
    expect(sumWhere(sqlite, "status <> 'SUPERSEDED'")).toBe(100);

    recordAudit(sqlite, 'audit-approve');
    sqlite.prepare(BUDGET_TRANSACTIONS_UPDATE_AFTER_AUDIT_SQL).run('APPROVED', TENANT, CONTRIBUTION, 'audit-approve', TENANT);

    expect(ledgerRows(sqlite)).toEqual([
      { transactionCode: 'BTX-000001', status: 'SUPERSEDED', amount: 100 },
      { transactionCode: 'BTX-000002', status: 'SUPERSEDED', amount: 50 },
      { transactionCode: 'BTX-000003', status: 'APPROVED', amount: 80 },
      { transactionCode: 'BTX-000004', status: 'APPROVED', amount: 20 },
    ]);
    expect(sumWhere(sqlite, "status = 'APPROVED'")).toBe(100);
  });

  it('changes nothing when the audit record for the resubmission is missing', () => {
    const result = supersedeEarlierRows(sqlite, 'audit-missing');

    expect(Number(result.changes)).toBe(0);
    expect(ledgerRows(sqlite).map((row) => row.status)).toEqual(['REJECTED', 'REJECTED']);
  });
});
