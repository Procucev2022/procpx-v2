import { createRequire } from 'node:module';

interface LocalSQLiteStatement {
  all(): Record<string, unknown>[];
}

interface LocalSQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): LocalSQLiteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(`${process.cwd()}/package.json`)('node:sqlite') as {
  DatabaseSync: new (path: string) => LocalSQLiteDatabase;
};
const { CHECKS } = createRequire(`${process.cwd()}/package.json`)('./scripts/report-d1-data-quality.cjs') as {
  CHECKS: Array<[string, string]>;
};

function findCheck(title: string): string {
  const check = CHECKS.find(([checkTitle]) => checkTitle === title);
  if (!check) throw new Error(`Missing data-quality check: ${title}`);
  return check[1];
}

function createDatabase(): LocalSQLiteDatabase {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL);
    CREATE TABLE cost_centres (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL);
    CREATE TABLE boqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, costCentreId TEXT);
    CREATE TABLE boq_revisions (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, boqId TEXT NOT NULL, costCentreId TEXT);
    CREATE TABLE boq_lines (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, boqRevisionId TEXT NOT NULL);
    CREATE TABLE procurement_requests (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, costCentreId TEXT NOT NULL,
      boqId TEXT NOT NULL, boqRevisionId TEXT NOT NULL
    );
    CREATE TABLE pr_lines (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, prId TEXT NOT NULL, projectId TEXT, costCentreId TEXT,
      boqId TEXT, boqRevisionId TEXT, boqLineId TEXT
    );
    CREATE TABLE rfqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, boqRevisionId TEXT NOT NULL, prId TEXT);
    CREATE TABLE rfq_lines (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, rfqId TEXT NOT NULL, projectId TEXT, costCentreId TEXT,
      boqId TEXT, boqRevisionId TEXT, boqLineId TEXT, prLineId TEXT
    );
    CREATE TABLE ppos (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, vendorId TEXT NOT NULL);
    CREATE TABLE ppo_lines (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, ppoId TEXT NOT NULL, vendorId TEXT NOT NULL, projectId TEXT NOT NULL,
      boqId TEXT, boqRevisionId TEXT, boqLineId TEXT, prLineId TEXT, rfqLineId TEXT
    );
    CREATE TABLE actual_cost_transactions (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, ppoId TEXT, ppoLineId TEXT,
      vendorId TEXT, boqId TEXT, boqRevisionId TEXT, boqLineId TEXT, prLineId TEXT, rfqLineId TEXT
    );
    INSERT INTO projects VALUES ('project-a', 'tenant-a');
    INSERT INTO projects VALUES ('project-b', 'tenant-a');
    INSERT INTO cost_centres VALUES ('centre-a', 'tenant-a', 'project-a');
    INSERT INTO cost_centres VALUES ('centre-b', 'tenant-a', 'project-a');
    INSERT INTO cost_centres VALUES ('centre-other-project', 'tenant-a', 'project-b');
    INSERT INTO cost_centres VALUES ('centre-other-tenant', 'tenant-b', 'project-a');
    INSERT INTO boqs VALUES ('boq-valid', 'tenant-a', 'project-a', 'centre-a');
    INSERT INTO boqs VALUES ('boq-wrong-centre', 'tenant-a', 'project-a', 'centre-other-project');
    INSERT INTO boqs VALUES ('boq-wrong-tenant', 'tenant-a', 'project-a', 'centre-other-tenant');
    INSERT INTO boqs VALUES ('boq-other', 'tenant-a', 'project-b', 'centre-other-project');
    INSERT INTO boq_revisions VALUES ('revision-valid', 'tenant-a', 'boq-valid', 'centre-a');
    INSERT INTO boq_revisions VALUES ('revision-wrong-tenant', 'tenant-b', 'boq-valid', 'centre-a');
    INSERT INTO boq_revisions VALUES ('revision-wrong-centre', 'tenant-a', 'boq-valid', 'centre-other-project');
    INSERT INTO boq_revisions VALUES ('revision-other', 'tenant-a', 'boq-other', 'centre-other-project');
    INSERT INTO boq_lines VALUES ('source-line-valid', 'tenant-a', 'revision-valid');
    INSERT INTO boq_lines VALUES ('source-line-other', 'tenant-a', 'revision-other');
    INSERT INTO boq_lines VALUES ('source-line-alt', 'tenant-a', 'revision-valid');
    INSERT INTO procurement_requests VALUES (
      'pr-valid', 'tenant-a', 'project-a', 'centre-a', 'boq-valid', 'revision-valid'
    );
    INSERT INTO procurement_requests VALUES (
      'pr-wrong-project', 'tenant-a', 'project-b', 'centre-b', 'boq-valid', 'revision-valid'
    );
    INSERT INTO procurement_requests VALUES (
      'pr-other', 'tenant-a', 'project-a', 'centre-a', 'boq-valid', 'revision-valid'
    );
    INSERT INTO pr_lines VALUES (
      'pr-line-valid', 'tenant-a', 'pr-valid', 'project-a', 'centre-b', 'boq-valid', 'revision-valid', 'source-line-valid'
    );
    INSERT INTO pr_lines VALUES (
      'pr-line-wrong-project', 'tenant-a', 'pr-valid', 'project-b', 'centre-other-project', 'boq-valid', 'revision-valid', 'source-line-valid'
    );
    INSERT INTO pr_lines VALUES (
      'pr-line-wrong-source', 'tenant-a', 'pr-valid', 'project-a', 'centre-a', 'boq-valid', 'revision-valid', 'source-line-other'
    );
    INSERT INTO pr_lines VALUES (
      'pr-line-other', 'tenant-a', 'pr-other', 'project-a', 'centre-a', 'boq-valid', 'revision-valid', 'source-line-valid'
    );
    INSERT INTO rfqs VALUES ('rfq-valid', 'tenant-a', 'project-a', 'revision-valid', 'pr-valid');
    INSERT INTO rfq_lines VALUES (
      'rfq-line-valid', 'tenant-a', 'rfq-valid', 'project-a', 'centre-b', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-valid'
    );
    INSERT INTO rfq_lines VALUES (
      'rfq-line-wrong-pr', 'tenant-a', 'rfq-valid', 'project-a', 'centre-a', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-other'
    );
    INSERT INTO rfq_lines VALUES (
      'rfq-line-wrong-source', 'tenant-a', 'rfq-valid', 'project-a', 'centre-a', 'boq-valid', 'revision-valid', 'source-line-other', 'pr-line-valid'
    );
    INSERT INTO rfq_lines VALUES (
      'rfq-line-alt', 'tenant-a', 'rfq-valid', 'project-a', 'centre-a', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-valid'
    );
    INSERT INTO pr_lines VALUES (
      'pr-line-alt', 'tenant-a', 'pr-valid', 'project-a', 'centre-a', 'boq-valid', 'revision-valid', 'source-line-valid'
    );
    INSERT INTO ppos VALUES
      ('ppo-valid', 'tenant-a', 'project-a', 'vendor-a'),
      ('ppo-other-project', 'tenant-a', 'project-b', 'vendor-a'),
      ('ppo-other-vendor', 'tenant-a', 'project-a', 'vendor-b');
    INSERT INTO ppo_lines VALUES (
      'ppo-line-valid', 'tenant-a', 'ppo-valid', 'vendor-a', 'project-a', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-valid', 'rfq-line-valid'
    );
    INSERT INTO actual_cost_transactions VALUES
      ('actual-valid', 'tenant-a', 'project-a', 'ppo-valid', 'ppo-line-valid', 'vendor-a', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-valid', 'rfq-line-valid'),
      ('actual-wrong-boq-line', 'tenant-a', 'project-a', 'ppo-valid', 'ppo-line-valid', 'vendor-a', 'boq-valid', 'revision-valid', 'source-line-alt', 'pr-line-valid', 'rfq-line-valid'),
      ('actual-wrong-pr-line', 'tenant-a', 'project-a', 'ppo-valid', 'ppo-line-valid', 'vendor-a', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-alt', 'rfq-line-valid'),
      ('actual-wrong-rfq-line', 'tenant-a', 'project-a', 'ppo-valid', 'ppo-line-valid', 'vendor-a', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-valid', 'rfq-line-alt'),
      ('actual-wrong-vendor', 'tenant-a', 'project-a', 'ppo-valid', 'ppo-line-valid', 'vendor-b', 'boq-valid', 'revision-valid', 'source-line-valid', 'pr-line-valid', 'rfq-line-valid'),
      ('actual-wrong-ppo-project', 'tenant-a', 'project-a', 'ppo-other-project', NULL, 'vendor-a', NULL, NULL, NULL, NULL, NULL),
      ('actual-wrong-ppo-vendor', 'tenant-a', 'project-a', 'ppo-other-vendor', NULL, 'vendor-a', NULL, NULL, NULL, NULL, NULL);
  `);
  return database;
}

describe('read-only D1 data-quality report queries', () => {
  let database: LocalSQLiteDatabase;

  beforeEach(() => {
    database = createDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('keeps every report check read-only', () => {
    expect(CHECKS.length).toBe(27);
    expect(CHECKS.every(([, sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
  });

  it('finds BOQ project and cost-centre tenant/project mismatches', () => {
    const rows = database.prepare(findCheck(
      'BOQs whose project or cost centre does not match the tenant and project',
    )).all();

    expect(rows.map(({ boqId }) => boqId).sort()).toEqual(['boq-wrong-centre', 'boq-wrong-tenant']);
  });

  it('finds revisions whose tenant or cost-centre project does not match the BOQ', () => {
    const rows = database.prepare(findCheck(
      'BOQ revisions whose tenant or cost centre does not match the parent BOQ project',
    )).all();

    expect(rows.map(({ revisionId }) => revisionId).sort()).toEqual(['revision-wrong-centre', 'revision-wrong-tenant']);
  });

  it('finds PRs whose project, cost centre, BOQ and revision relationships disagree', () => {
    const rows = database.prepare(findCheck(
      'PRs whose project, cost centre, BOQ and revision references do not align',
    )).all();

    expect(rows.map(({ prId }) => prId)).toEqual(['pr-wrong-project']);
  });

  it('finds PR line project and source-revision mismatches while allowing line-level cost centres', () => {
    const rows = database.prepare(findCheck(
      'PR lines whose project, cost centre, BOQ, revision or source line differs from the PR',
    )).all();

    expect(rows.map(({ prLineId }) => prLineId).sort()).toEqual(['pr-line-wrong-project', 'pr-line-wrong-source']);
    expect(rows.some(({ prLineId }) => prLineId === 'pr-line-valid')).toBe(false);
  });

  it('finds RFQ lines whose source PR line or BOQ revision differs from the RFQ', () => {
    const rows = database.prepare(findCheck(
      'RFQ lines whose project, cost centre, BOQ, PR line or source revision differs from the RFQ',
    )).all();

    expect(rows.map(({ rfqLineId }) => rfqLineId).sort()).toEqual(['rfq-line-wrong-pr', 'rfq-line-wrong-source']);
    expect(rows.some(({ rfqLineId }) => rfqLineId === 'rfq-line-valid')).toBe(false);
  });

  it('finds actual-cost line and vendor references that differ from the linked PPO line', () => {
    const rows = database.prepare(findCheck(
      'Actual-cost line references or vendor differ from the linked PPO line',
    )).all();

    expect(rows.map(({ actualCostId }) => actualCostId).sort()).toEqual([
      'actual-wrong-boq-line',
      'actual-wrong-pr-line',
      'actual-wrong-rfq-line',
      'actual-wrong-vendor',
    ]);
  });

  it('finds PPO header project and vendor mismatches when no PPO line is linked', () => {
    const rows = database.prepare(findCheck(
      'Actual-cost PPO references whose PPO tenant, project, vendor, or line does not match',
    )).all();

    expect(rows.filter(({ ppoLineId }) => ppoLineId === null).map(({ actualCostId }) => actualCostId).sort()).toEqual([
      'actual-wrong-ppo-project',
      'actual-wrong-ppo-vendor',
    ]);
  });
});
