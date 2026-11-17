import { createRequire } from 'node:module';
import {
  BUDGET_AGGREGATE_FINANCE_APPROVE_UPSERT_SQL,
  BUDGET_AGGREGATE_PENDING_DECREMENT_SQL,
  BUDGET_AGGREGATE_PENDING_UPSERT_SQL,
  BUDGET_AGGREGATE_PROJECT_APPROVE_UPSERT_SQL,
  BUDGET_AGGREGATE_REVERSE_UPDATE_SQL,
} from '../src/lib/d1-batch.constants';

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

const TENANT_ID = 'tenant-1';
const PROJECT_ID = 'project-1';
const COST_CENTRE_ID = 'cc-1';
const USER_ID = 'user-1';
const NOW = '2026-11-17T00:00:00.000Z';

interface BudgetTotals {
  totalAmount: number;
  approvedAmount: number;
  pendingAmount: number;
}

// The audit table only needs the columns the budget statements check with EXISTS.
function openDatabase(): LocalSQLiteDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE budgets (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, costCentreId TEXT NOT NULL, totalAmount REAL NOT NULL, approvedAmount REAL NOT NULL, pendingAmount REAL NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, createdBy TEXT NOT NULL, UNIQUE (tenantId, costCentreId));' +
    'CREATE TABLE audit_logs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL);',
  );
  return sqlite;
}

function createBudgetActions(sqlite: LocalSQLiteDatabase) {
  let sequence = 0;
  function nextId(prefix: string) {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }
  function recordAudit(): string {
    const auditId = nextId('audit');
    sqlite.prepare('INSERT INTO audit_logs (id, tenantId) VALUES (?, ?)').run(auditId, TENANT_ID);
    return auditId;
  }
  function execute(sql: string, values: unknown[]): number {
    return Number(sqlite.prepare(sql).run(...values).changes);
  }

  return {
    submitForApproval(amount: number) {
      const auditId = recordAudit();
      expect(execute(BUDGET_AGGREGATE_PENDING_UPSERT_SQL, [
        nextId('budget'), TENANT_ID, PROJECT_ID, COST_CENTRE_ID, amount, amount, NOW, NOW, USER_ID, auditId, TENANT_ID,
      ])).toBe(1);
    },
    projectApprove(amount: number) {
      const auditId = recordAudit();
      expect(execute(BUDGET_AGGREGATE_PROJECT_APPROVE_UPSERT_SQL, [
        nextId('budget'), TENANT_ID, PROJECT_ID, COST_CENTRE_ID, amount, amount, NOW, NOW, USER_ID, auditId, TENANT_ID, amount,
      ])).toBe(1);
    },
    financeApprove(amount: number) {
      const auditId = recordAudit();
      expect(execute(BUDGET_AGGREGATE_FINANCE_APPROVE_UPSERT_SQL, [
        nextId('budget'), TENANT_ID, PROJECT_ID, COST_CENTRE_ID, amount, amount, NOW, NOW, USER_ID, auditId, TENANT_ID, amount,
      ])).toBe(1);
    },
    reject(amount: number) {
      const auditId = recordAudit();
      expect(execute(BUDGET_AGGREGATE_PENDING_DECREMENT_SQL, [
        amount, amount, NOW, TENANT_ID, PROJECT_ID, COST_CENTRE_ID, auditId, TENANT_ID,
      ])).toBe(1);
    },
    reverse(amount: number) {
      const auditId = recordAudit();
      expect(execute(BUDGET_AGGREGATE_REVERSE_UPDATE_SQL, [
        amount, amount, NOW, TENANT_ID, PROJECT_ID, COST_CENTRE_ID, auditId, TENANT_ID,
      ])).toBe(1);
    },
    totals(): BudgetTotals {
      const row = sqlite.prepare(
        'SELECT totalAmount, approvedAmount, pendingAmount FROM budgets WHERE tenantId = ? AND costCentreId = ?',
      ).all(TENANT_ID, COST_CENTRE_ID)[0];
      return {
        totalAmount: Number(row.totalAmount),
        approvedAmount: Number(row.approvedAmount),
        pendingAmount: Number(row.pendingAmount),
      };
    },
  };
}

describe('budget aggregate totals', () => {
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    sqlite = openDatabase();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('keeps total equal to approved plus pending through submit, finance approval, rejection and reversal', () => {
    const budget = createBudgetActions(sqlite);

    budget.submitForApproval(100);
    expect(budget.totals()).toEqual({ totalAmount: 100, approvedAmount: 0, pendingAmount: 100 });

    budget.submitForApproval(40);
    expect(budget.totals()).toEqual({ totalAmount: 140, approvedAmount: 0, pendingAmount: 140 });

    budget.financeApprove(100);
    expect(budget.totals()).toEqual({ totalAmount: 140, approvedAmount: 100, pendingAmount: 40 });

    budget.reject(40);
    expect(budget.totals()).toEqual({ totalAmount: 100, approvedAmount: 100, pendingAmount: 0 });

    budget.reverse(100);
    expect(budget.totals()).toEqual({ totalAmount: 0, approvedAmount: 0, pendingAmount: 0 });
  });

  it('moves a directly approved project submission from pending to approved without changing the total', () => {
    const budget = createBudgetActions(sqlite);

    budget.submitForApproval(60);
    budget.projectApprove(60);

    expect(budget.totals()).toEqual({ totalAmount: 60, approvedAmount: 60, pendingAmount: 0 });
  });

  it('never leaves a rejected submission counted in the total', () => {
    const budget = createBudgetActions(sqlite);

    budget.submitForApproval(25);
    budget.reject(25);

    expect(budget.totals()).toEqual({ totalAmount: 0, approvedAmount: 0, pendingAmount: 0 });
  });
});
