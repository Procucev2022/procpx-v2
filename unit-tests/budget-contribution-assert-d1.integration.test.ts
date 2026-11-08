import { createRequire } from 'node:module';
import type { D1BatchDatabase, D1BatchResult, D1BatchStatement } from '@app-types/lib/d1-batch.types';
import {
  BUDGET_AGGREGATE_PENDING_UPSERT_SQL,
  BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
  BUDGET_CONTRIBUTION_ASSERT_AFTER_UPSERT_SQL,
  BUDGET_CONTRIBUTION_BOQ_UPDATE_AFTER_AUDIT_SQL,
  BUDGET_CONTRIBUTION_CREATE_UNDER_APPROVAL_SQL,
  BUDGET_CONTRIBUTION_REVISION_UPDATE_AFTER_AUDIT_SQL,
  BUDGET_TRANSACTION_INSERT_AFTER_AUDIT_SQL,
} from '../src/lib/d1-batch.constants';
import { runD1BatchAtomically } from '../src/lib/d1-batch';

jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

interface LocalSQLiteStatement {
  all(...values: unknown[]): Array<Record<string, unknown>>;
  get(...values: unknown[]): Record<string, unknown> | undefined;
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

function createDatabase(seedConflictingBudget: boolean): { sqlite: LocalSQLiteDatabase; database: D1BatchDatabase } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE budget_contributions (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, costCentreId TEXT NOT NULL, boqId TEXT NOT NULL, boqRevisionId TEXT NOT NULL, totalEstimatedValue REAL NOT NULL, acceptedEstimatedValue REAL NOT NULL, status TEXT NOT NULL, submittedAt TEXT, submittedBy TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, createdBy TEXT NOT NULL);' +
    'CREATE TABLE audit_logs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, userId TEXT, projectId TEXT, entityType TEXT NOT NULL, entityId TEXT NOT NULL, action TEXT NOT NULL, description TEXT NOT NULL, oldValue TEXT, newValue TEXT, ipAddress TEXT, userAgent TEXT, createdAt TEXT NOT NULL);' +
    'CREATE TABLE budget_transactions (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, transactionCode TEXT NOT NULL, projectId TEXT NOT NULL, costCentreId TEXT NOT NULL, boqId TEXT, boqRevisionId TEXT, boqLineId TEXT, contributionId TEXT, category TEXT NOT NULL, amount REAL NOT NULL, quantity REAL, rate REAL, status TEXT NOT NULL, reference TEXT, createdBy TEXT NOT NULL, budgetDate TEXT NOT NULL, createdAt TEXT NOT NULL);' +
    'CREATE TABLE boq_revisions (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, boqId TEXT NOT NULL, costCentreId TEXT, budgetStatus TEXT NOT NULL, updatedAt TEXT NOT NULL);' +
    'CREATE TABLE boqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, costCentreId TEXT, purpose TEXT NOT NULL, updatedAt TEXT NOT NULL);' +
    'CREATE TABLE budgets (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, costCentreId TEXT NOT NULL, totalAmount REAL NOT NULL, approvedAmount REAL NOT NULL, pendingAmount REAL NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, createdBy TEXT NOT NULL, UNIQUE (tenantId, costCentreId));',
  );
  sqlite.prepare('INSERT INTO boq_revisions VALUES (?, ?, ?, ?, ?, ?)').run(
    'revision-1', 'tenant-1', 'boq-1', 'cc-original', 'NOT_ADDED_TO_BUDGET', 'old',
  );
  sqlite.prepare('INSERT INTO boqs VALUES (?, ?, ?, ?, ?)').run('boq-1', 'tenant-1', 'cc-original', 'PR', 'old');
  if (seedConflictingBudget) {
    sqlite.prepare('INSERT INTO budgets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'budget-other-project', 'tenant-1', 'project-other', 'cc-target', 500, 100, 50, 'APPROVED', 'old', 'old', 'user-other',
    );
  }

  const database: D1BatchDatabase = {
    prepare(sql) {
      return {
        bind(...values) {
          return { sql, values } as unknown as D1BatchStatement;
        },
      };
    },
    async batch(statements): Promise<D1BatchResult[]> {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => {
          const { sql, values } = statement as unknown as { sql: string; values: unknown[] };
          const prepared = sqlite.prepare(sql);
          if (/^\s*SELECT\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
            const rows = prepared.all(...values);
            const changes = Number(sqlite.prepare('SELECT changes() AS changes').get()?.changes || 0);
            return { success: true, results: rows, meta: { changes } };
          }
          return { success: true, meta: { changes: Number(prepared.run(...values).changes) } };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, database };
}

function allocationBatch() {
  const now = '2026-11-08T00:00:00.000Z';
  const contributionId = 'contribution-1';
  const auditId = 'audit-1';
  const totalAmount = 100;
  return [
    {
      sql: BUDGET_CONTRIBUTION_CREATE_UNDER_APPROVAL_SQL,
      values: [contributionId, 'tenant-1', 'project-1', 'cc-target', 'boq-1', 'revision-1',
        totalAmount, totalAmount, now, 'user-1', now, now, 'user-1', 'tenant-1', 'revision-1'],
    },
    {
      sql: BUDGET_AUDIT_INSERT_AFTER_TRANSITION_SQL,
      values: [auditId, 'tenant-1', 'user-1', 'project-1', 'BUDGET_CONTRIBUTION', contributionId,
        'BUDGET_CONTRIBUTION_CREATED', 'Allocate BOQ to budget', null, '{}', null, null, now],
    },
    {
      sql: BUDGET_TRANSACTION_INSERT_AFTER_AUDIT_SQL,
      values: ['transaction-1', 'tenant-1', 'tenant-1', 'project-1', 'cc-target', 'boq-1',
        'revision-1', 'line-1', contributionId, 'Electrical', totalAmount, 2, 50, 'BOQ allocation',
        'user-1', now, now, auditId, 'tenant-1'],
    },
    {
      sql: BUDGET_CONTRIBUTION_REVISION_UPDATE_AFTER_AUDIT_SQL,
      values: ['cc-target', now, 'revision-1', 'tenant-1', auditId, 'tenant-1'],
    },
    {
      sql: BUDGET_CONTRIBUTION_BOQ_UPDATE_AFTER_AUDIT_SQL,
      values: ['cc-target', now, 'boq-1', 'tenant-1', auditId, 'tenant-1'],
    },
    {
      sql: BUDGET_AGGREGATE_PENDING_UPSERT_SQL,
      values: ['budget-1', 'tenant-1', 'project-1', 'cc-target', totalAmount, totalAmount,
        now, now, 'user-1', auditId, 'tenant-1'],
    },
    {
      sql: BUDGET_CONTRIBUTION_ASSERT_AFTER_UPSERT_SQL,
      values: [
        contributionId, 'tenant-1', 'revision-1', 'project-1', 'cc-target',
        auditId, 'tenant-1', contributionId,
        'tenant-1', contributionId, 'project-1', 'cc-target', 'boq-1', 'revision-1', 1,
        'revision-1', 'tenant-1', 'boq-1', 'cc-target',
        'boq-1', 'tenant-1', 'cc-target',
        'tenant-1', 'cc-target', 'project-1', totalAmount,
      ],
    },
  ];
}

describe('BOQ budget contribution D1 batch assertion', () => {
  it('commits a complete allocation batch', async () => {
    const { sqlite, database } = createDatabase(false);
    try {
      await expect(runD1BatchAtomically(database, allocationBatch())).resolves.toHaveLength(7);
      expect(sqlite.prepare('SELECT status FROM budget_contributions WHERE id = ?').get('contribution-1'))
        .toEqual({ status: 'UNDER_APPROVAL' });
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get()).toEqual({ count: 1 });
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM budget_transactions').get()).toEqual({ count: 1 });
      expect(sqlite.prepare('SELECT pendingAmount, status FROM budgets WHERE costCentreId = ?').get('cc-target'))
        .toEqual({ pendingAmount: 100, status: 'UNDER_APPROVAL' });
    } finally {
      sqlite.close();
    }
  });

  it('rolls back every allocation write when a conflicting budget project makes the upsert a no-op', async () => {
    const { sqlite, database } = createDatabase(true);
    try {
      await expect(runD1BatchAtomically(database, allocationBatch())).rejects.toThrow(/malformed JSON/i);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM budget_contributions').get()).toEqual({ count: 0 });
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get()).toEqual({ count: 0 });
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM budget_transactions').get()).toEqual({ count: 0 });
      expect(sqlite.prepare('SELECT costCentreId, budgetStatus FROM boq_revisions WHERE id = ?').get('revision-1'))
        .toEqual({ costCentreId: 'cc-original', budgetStatus: 'NOT_ADDED_TO_BUDGET' });
      expect(sqlite.prepare('SELECT costCentreId, purpose FROM boqs WHERE id = ?').get('boq-1'))
        .toEqual({ costCentreId: 'cc-original', purpose: 'PR' });
      expect(sqlite.prepare('SELECT projectId, pendingAmount, status FROM budgets WHERE id = ?').get('budget-other-project'))
        .toEqual({ projectId: 'project-other', pendingAmount: 50, status: 'APPROVED' });
    } finally {
      sqlite.close();
    }
  });

  it('rolls back when the transaction row does not match the contribution scope', async () => {
    const { sqlite, database } = createDatabase(false);
    const batch = allocationBatch();
    batch[2].values[3] = 'project-other';
    try {
      await expect(runD1BatchAtomically(database, batch)).rejects.toThrow(/malformed JSON/i);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM budget_contributions').get()).toEqual({ count: 0 });
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get()).toEqual({ count: 0 });
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM budget_transactions').get()).toEqual({ count: 0 });
      expect(sqlite.prepare('SELECT costCentreId, budgetStatus FROM boq_revisions WHERE id = ?').get('revision-1'))
        .toEqual({ costCentreId: 'cc-original', budgetStatus: 'NOT_ADDED_TO_BUDGET' });
    } finally {
      sqlite.close();
    }
  });
});
