import { createRequire } from 'node:module';
import { ACTUAL_COST_INSERT_IF_VALID_SQL } from '../src/lib/d1-batch.constants';

const TENANT_ID = 'actual-cost-integration-tenant';
const PROJECT_ID = 'actual-cost-integration-project';

interface LocalSQLiteStatement {
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

function createDatabase(): LocalSQLiteDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL);
    CREATE TABLE cost_centres (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL);
    CREATE TABLE boqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL);
    CREATE TABLE boq_revisions (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, boqId TEXT NOT NULL);
    CREATE TABLE boq_lines (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, boqRevisionId TEXT NOT NULL);
    CREATE TABLE procurement_requests (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL);
    CREATE TABLE pr_lines (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, prId TEXT NOT NULL);
    CREATE TABLE rfqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL);
    CREATE TABLE rfq_lines (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, rfqId TEXT NOT NULL);
    CREATE TABLE ppos (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL);
    CREATE TABLE ppo_lines (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, ppoId TEXT NOT NULL);
    CREATE TABLE vendors (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL);
    CREATE TABLE actual_cost_transactions (
      id TEXT NOT NULL PRIMARY KEY, tenantId TEXT NOT NULL, transactionCode TEXT NOT NULL,
      projectId TEXT NOT NULL, costCentreId TEXT, category TEXT NOT NULL, subcategory TEXT,
      boqId TEXT, boqRevisionId TEXT, boqLineId TEXT, prId TEXT, prLineId TEXT, rfqId TEXT,
      rfqLineId TEXT, ppoId TEXT, ppoLineId TEXT, vendorId TEXT, uom TEXT NOT NULL,
      actualQuantity REAL NOT NULL, actualUnitRate REAL NOT NULL, actualAmount REAL NOT NULL,
      taxAmount REAL NOT NULL, totalActualAmount REAL NOT NULL, actualDate TEXT NOT NULL,
      source TEXT NOT NULL, status TEXT NOT NULL, completionReference TEXT, completionRequestId TEXT,
      completionFingerprint TEXT, externalReference TEXT, erpDocumentNumber TEXT, erpDate TEXT,
      integrationTimestamp TEXT, documents TEXT, remarks TEXT, createdById TEXT, createdBy TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      UNIQUE (tenantId, transactionCode)
    );
    INSERT INTO projects VALUES ('${PROJECT_ID}', '${TENANT_ID}');
    INSERT INTO projects VALUES ('other-project', 'other-tenant');
    INSERT INTO cost_centres VALUES ('cc-1', '${TENANT_ID}', '${PROJECT_ID}');
    INSERT INTO cost_centres VALUES ('cc-other', 'other-tenant', 'other-project');
    INSERT INTO boqs VALUES ('boq-1', '${TENANT_ID}', '${PROJECT_ID}');
    INSERT INTO boqs VALUES ('boq-other', 'other-tenant', 'other-project');
    INSERT INTO boq_revisions VALUES ('revision-1', '${TENANT_ID}', 'boq-1');
    INSERT INTO boq_revisions VALUES ('revision-other', 'other-tenant', 'boq-other');
    INSERT INTO boq_lines VALUES ('boq-line-1', '${TENANT_ID}', 'revision-1');
    INSERT INTO boq_lines VALUES ('boq-line-other', 'other-tenant', 'revision-other');
    INSERT INTO procurement_requests VALUES ('pr-1', '${TENANT_ID}', '${PROJECT_ID}');
    INSERT INTO procurement_requests VALUES ('pr-other', 'other-tenant', 'other-project');
    INSERT INTO pr_lines VALUES ('pr-line-1', '${TENANT_ID}', 'pr-1');
    INSERT INTO pr_lines VALUES ('pr-line-other', 'other-tenant', 'pr-other');
    INSERT INTO rfqs VALUES ('rfq-1', '${TENANT_ID}', '${PROJECT_ID}');
    INSERT INTO rfqs VALUES ('rfq-other', 'other-tenant', 'other-project');
    INSERT INTO rfq_lines VALUES ('rfq-line-1', '${TENANT_ID}', 'rfq-1');
    INSERT INTO rfq_lines VALUES ('rfq-line-other', 'other-tenant', 'rfq-other');
    INSERT INTO ppos VALUES ('ppo-1', '${TENANT_ID}', '${PROJECT_ID}');
    INSERT INTO ppos VALUES ('ppo-other', 'other-tenant', 'other-project');
    INSERT INTO ppo_lines VALUES ('ppo-line-1', '${TENANT_ID}', 'ppo-1');
    INSERT INTO ppo_lines VALUES ('ppo-line-other', 'other-tenant', 'ppo-other');
    INSERT INTO vendors VALUES ('vendor-1', '${TENANT_ID}');
    INSERT INTO vendors VALUES ('vendor-other', 'other-tenant');
  `);
  return sqlite;
}

function actualCostValues(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
  const values: unknown[] = [
    'actual-cost-1', TENANT_ID, 'ACT-2026-000001', PROJECT_ID, 'cc-1', 'Electrical', 'Wiring',
    'boq-1', 'revision-1', 'boq-line-1', 'pr-1', 'pr-line-1', 'rfq-1', 'rfq-line-1',
    'ppo-1', 'ppo-line-1', 'vendor-1', 'EA', 2, 120, 240, 24, 264,
    '2026-11-07T10:00:00.000Z', 'GRN', 'APPROVED', 'GRN-001', null, null,
    'external-1', 'ERP-001', null, null, null, 'Reconciled integration row',
    'integration-user', 'Integration User', '2026-11-07T10:00:00.000Z', '2026-11-07T10:00:00.000Z',
  ];
  const valueIndexes: Record<string, number> = {
    id: 0, tenantId: 1, transactionCode: 2, projectId: 3, costCentreId: 4, category: 5,
    subcategory: 6, boqId: 7, boqRevisionId: 8, boqLineId: 9, prId: 10, prLineId: 11,
    rfqId: 12, rfqLineId: 13, ppoId: 14, ppoLineId: 15, vendorId: 16, uom: 17,
    actualQuantity: 18, actualUnitRate: 19, actualAmount: 20, taxAmount: 21, totalActualAmount: 22,
    actualDate: 23, source: 24, status: 25, completionReference: 26,
    completionRequestId: 27, completionFingerprint: 28, externalReference: 29,
    erpDocumentNumber: 30, erpDate: 31, integrationTimestamp: 32, documents: 33,
    remarks: 34, createdById: 35, createdBy: 36, createdAt: 37, updatedAt: 38,
  };
  for (const [key, value] of Object.entries(overrides)) values[valueIndexes[key]] = value;
  return values;
}

describe('actual-cost reference validation against isolated SQLite D1 semantics', () => {
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    sqlite = createDatabase();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('persists an actual-cost row when every linked record belongs to the same tenant and project', () => {
    const result = sqlite.prepare(ACTUAL_COST_INSERT_IF_VALID_SQL).run(...actualCostValues());

    expect(Number(result.changes)).toBe(1);
    expect(sqlite.prepare(`SELECT tenantId, projectId, costCentreId, boqId, boqRevisionId, boqLineId,
      prId, prLineId, rfqId, rfqLineId, ppoId, ppoLineId, vendorId, totalActualAmount
      FROM actual_cost_transactions WHERE id = ?`).get('actual-cost-1')).toEqual({
      tenantId: TENANT_ID, projectId: PROJECT_ID, costCentreId: 'cc-1', boqId: 'boq-1',
      boqRevisionId: 'revision-1', boqLineId: 'boq-line-1', prId: 'pr-1', prLineId: 'pr-line-1',
      rfqId: 'rfq-1', rfqLineId: 'rfq-line-1', ppoId: 'ppo-1', ppoLineId: 'ppo-line-1',
      vendorId: 'vendor-1', totalActualAmount: 264,
    });
  });

  it.each([
    ['costCentreId', 'cc-other'],
    ['boqId', 'boq-other'],
    ['boqRevisionId', 'revision-other'],
    ['boqLineId', 'boq-line-other'],
    ['prId', 'pr-other'],
    ['prLineId', 'pr-line-other'],
    ['rfqId', 'rfq-other'],
    ['rfqLineId', 'rfq-line-other'],
    ['ppoId', 'ppo-other'],
    ['ppoLineId', 'ppo-line-other'],
    ['vendorId', 'vendor-other'],
  ])('rejects a linked %s from another tenant or project', (field, id) => {
    const result = sqlite.prepare(ACTUAL_COST_INSERT_IF_VALID_SQL).run(...actualCostValues({ [field]: id }));

    expect(Number(result.changes)).toBe(0);
    expect(sqlite.prepare('SELECT COUNT(*) AS total FROM actual_cost_transactions').get())
      .toEqual({ total: 0 });
  });
});
