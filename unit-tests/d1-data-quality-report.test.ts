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
    CREATE TABLE procurement_requests (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, costCentreId TEXT NOT NULL,
      boqId TEXT NOT NULL, boqRevisionId TEXT NOT NULL
    );
    INSERT INTO projects VALUES ('project-a', 'tenant-a');
    INSERT INTO projects VALUES ('project-b', 'tenant-a');
    INSERT INTO cost_centres VALUES ('centre-a', 'tenant-a', 'project-a');
    INSERT INTO cost_centres VALUES ('centre-b', 'tenant-a', 'project-b');
    INSERT INTO cost_centres VALUES ('centre-other-tenant', 'tenant-b', 'project-a');
    INSERT INTO boqs VALUES ('boq-valid', 'tenant-a', 'project-a', 'centre-a');
    INSERT INTO boqs VALUES ('boq-wrong-centre', 'tenant-a', 'project-a', 'centre-b');
    INSERT INTO boqs VALUES ('boq-wrong-tenant', 'tenant-a', 'project-a', 'centre-other-tenant');
    INSERT INTO boq_revisions VALUES ('revision-valid', 'tenant-a', 'boq-valid', 'centre-a');
    INSERT INTO boq_revisions VALUES ('revision-wrong-tenant', 'tenant-b', 'boq-valid', 'centre-a');
    INSERT INTO boq_revisions VALUES ('revision-wrong-centre', 'tenant-a', 'boq-valid', 'centre-b');
    INSERT INTO procurement_requests VALUES (
      'pr-valid', 'tenant-a', 'project-a', 'centre-a', 'boq-valid', 'revision-valid'
    );
    INSERT INTO procurement_requests VALUES (
      'pr-wrong-project', 'tenant-a', 'project-b', 'centre-b', 'boq-valid', 'revision-valid'
    );
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
    expect(CHECKS.length).toBe(23);
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
});
