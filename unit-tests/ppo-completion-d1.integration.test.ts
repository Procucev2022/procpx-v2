import { createRequire } from 'node:module';
import { runD1BatchAtomically } from '../src/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  PPO_ACTUAL_COST_INSERT_AFTER_LINE_UPDATE_SQL,
  PPO_LINE_COMPLETION_UPDATE_SQL,
  PPO_STATUS_UPDATE_AFTER_COMPLETION_SQL,
} from '../src/lib/d1-batch.constants';
import type { D1BatchDatabase, D1BatchResult, D1BatchStatement } from '@app-types/lib/d1-batch.types';

const TENANT_ID = 'ppo-completion-integration-tenant';
const PPO_ID = 'ppo-completion-integration-ppo';
const PPO_LINE_ID = 'ppo-completion-integration-line';
const PROJECT_ID = 'ppo-completion-integration-project';
const COMPLETION_REQUEST_ID = 'ppo-completion-request-0001';
const COMPLETION_FINGERPRINT = 'ppo-completion-fingerprint-0001';
const COMPLETED_AT = '2026-11-07T10:00:00.000Z';

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

function createDatabase(): { database: D1BatchDatabase; sqlite: LocalSQLiteDatabase } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL);
    CREATE TABLE ppos (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL,
      status TEXT NOT NULL, completedAt TEXT, updatedAt TEXT NOT NULL
    );
    CREATE TABLE ppo_lines (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, ppoId TEXT NOT NULL,
      orderedQuantity REAL NOT NULL, completedQuantity REAL NOT NULL,
      completedAmount REAL NOT NULL, status TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE actual_cost_transactions (
      id TEXT NOT NULL PRIMARY KEY, tenantId TEXT NOT NULL, transactionCode TEXT NOT NULL,
      projectId TEXT NOT NULL, costCentreId TEXT, category TEXT NOT NULL, subcategory TEXT,
      boqId TEXT, boqRevisionId TEXT, boqLineId TEXT, prId TEXT, prLineId TEXT, rfqId TEXT,
      rfqLineId TEXT, ppoId TEXT, ppoLineId TEXT, vendorId TEXT, uom TEXT NOT NULL,
      actualQuantity REAL NOT NULL, actualUnitRate REAL NOT NULL, actualAmount REAL NOT NULL,
      taxAmount REAL NOT NULL, totalActualAmount REAL NOT NULL, actualDate TEXT NOT NULL,
      source TEXT NOT NULL, status TEXT NOT NULL, completionReference TEXT, documents TEXT,
      remarks TEXT, createdById TEXT, createdBy TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      completionRequestId TEXT NOT NULL, completionFingerprint TEXT NOT NULL,
      UNIQUE (tenantId, transactionCode)
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, userId TEXT, projectId TEXT,
      entityType TEXT NOT NULL, entityId TEXT NOT NULL, action TEXT NOT NULL, description TEXT NOT NULL,
      oldValue TEXT, newValue TEXT, ipAddress TEXT, userAgent TEXT, createdAt TEXT NOT NULL
    );
    INSERT INTO projects (id, tenantId) VALUES ('${PROJECT_ID}', '${TENANT_ID}');
    INSERT INTO ppos (id, tenantId, projectId, status, completedAt, updatedAt)
      VALUES ('${PPO_ID}', '${TENANT_ID}', '${PROJECT_ID}', 'ISSUED', NULL, '2026-11-06T10:00:00.000Z');
    INSERT INTO ppo_lines (id, tenantId, ppoId, orderedQuantity, completedQuantity, completedAmount, status, updatedAt)
      VALUES ('${PPO_LINE_ID}', '${TENANT_ID}', '${PPO_ID}', 10, 0, 0, 'ISSUED', '2026-11-06T10:00:00.000Z');
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
          if (/^\s*SELECT\b/i.test(sql)) {
            return { success: true, results: prepared.all(...parameters) as Array<Record<string, unknown>> };
          }
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

  return { database, sqlite };
}

function completionBatch() {
  const amount = 245;
  const tax = 24.5;
  return [
    {
      sql: PPO_LINE_COMPLETION_UPDATE_SQL,
      values: [10, amount, 'COMPLETED', COMPLETED_AT, PPO_LINE_ID, TENANT_ID, PPO_ID, 0, 0, 10, TENANT_ID],
    },
    {
      sql: PPO_ACTUAL_COST_INSERT_AFTER_LINE_UPDATE_SQL,
      values: [
        'actual-cost-integration-1', TENANT_ID, 2026, TENANT_ID, 2026,
        PROJECT_ID, null, 'Electrical', null, null, null, null, null, null, null, null,
        PPO_ID, PPO_LINE_ID, null, 'EA', 10, 24.5, amount, tax, amount + tax,
        COMPLETED_AT, 'WCC-PPO-001', null, 'Integrated completion fixture', 'integration-user',
        'Integration User', COMPLETED_AT, COMPLETED_AT, COMPLETION_REQUEST_ID, COMPLETION_FINGERPRINT,
      ],
    },
    {
      sql: PPO_STATUS_UPDATE_AFTER_COMPLETION_SQL,
      values: [COMPLETED_AT, COMPLETED_AT, PPO_ID, TENANT_ID, TENANT_ID, COMPLETION_REQUEST_ID],
    },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [
        'audit-ppo-completion-integration-1', TENANT_ID, 'integration-user', PROJECT_ID, 'PPO', PPO_ID,
        'PPO_COMPLETION_RECORDED', 'Completed PPO line and recorded actual cost.',
        JSON.stringify({ status: 'ISSUED' }),
        JSON.stringify({ completionRequestId: COMPLETION_REQUEST_ID, actualTransactionsCount: 1 }),
        null, null, COMPLETED_AT,
      ],
    },
  ];
}

function readRow<T extends object>(sqlite: LocalSQLiteDatabase, sql: string, ...values: unknown[]): T | undefined {
  return sqlite.prepare(sql).get(...(values as never[])) as T | undefined;
}

describe('PPO completion against isolated SQLite D1 semantics', () => {
  let database: D1BatchDatabase;
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    ({ database, sqlite } = createDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  it('commits the completed line, actual cost, PPO state, and audit record together', async () => {
    const results = await runD1BatchAtomically(database, completionBatch());

    expect(results).toHaveLength(4);
    expect(results.map((result) => result.meta?.changes)).toEqual([1, 1, 1, 1]);
    expect(readRow(sqlite,
      'SELECT completedQuantity, completedAmount, status FROM ppo_lines WHERE id = ?', PPO_LINE_ID,
    )).toEqual({ completedQuantity: 10, completedAmount: 245, status: 'COMPLETED' });
    expect(readRow(sqlite,
      'SELECT status, completedAt FROM ppos WHERE id = ?', PPO_ID,
    )).toEqual({ status: 'COMPLETED', completedAt: COMPLETED_AT });
    expect(readRow(sqlite,
      'SELECT source, status, actualQuantity, actualAmount, taxAmount, totalActualAmount, ppoId, ppoLineId, completionRequestId FROM actual_cost_transactions',
    )).toEqual({
      source: 'PPO_COMPLETION', status: 'APPROVED', actualQuantity: 10,
      actualAmount: 245, taxAmount: 24.5, totalActualAmount: 269.5,
      ppoId: PPO_ID, ppoLineId: PPO_LINE_ID, completionRequestId: COMPLETION_REQUEST_ID,
    });
    expect(readRow(sqlite,
      'SELECT entityType, entityId, action FROM audit_logs WHERE id = ?', 'audit-ppo-completion-integration-1',
    )).toEqual({ entityType: 'PPO', entityId: PPO_ID, action: 'PPO_COMPLETION_RECORDED' });
  });

  it('rolls back line completion and PPO state if actual-cost insertion fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_test_actual_cost BEFORE INSERT ON actual_cost_transactions
      BEGIN SELECT RAISE(ABORT, 'isolated actual-cost store failure'); END`);

    await expect(runD1BatchAtomically(database, completionBatch()))
      .rejects.toThrow('isolated actual-cost store failure');
    expect(readRow(sqlite,
      'SELECT completedQuantity, completedAmount, status FROM ppo_lines WHERE id = ?', PPO_LINE_ID,
    )).toEqual({ completedQuantity: 0, completedAmount: 0, status: 'ISSUED' });
    expect(readRow(sqlite,
      'SELECT status, completedAt FROM ppos WHERE id = ?', PPO_ID,
    )).toEqual({ status: 'ISSUED', completedAt: null });
    expect(readRow<{ total: number }>(sqlite, 'SELECT COUNT(*) AS total FROM actual_cost_transactions'))
      .toEqual({ total: 0 });
    expect(readRow<{ total: number }>(sqlite, 'SELECT COUNT(*) AS total FROM audit_logs'))
      .toEqual({ total: 0 });
  });
});
