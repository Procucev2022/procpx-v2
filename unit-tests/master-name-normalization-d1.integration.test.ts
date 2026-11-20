import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const migrationSql = readFileSync(
  join(process.cwd(), 'migrations-postponed', '0035_master_normalized_name_uniqueness.sql'),
  'utf8',
);

function createDatabase(): LocalSQLiteDatabase {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, name TEXT NOT NULL, projectCode TEXT NOT NULL);
    CREATE TABLE vendors (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL);
    CREATE TABLE cost_centres (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, projectId TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL
    );
  `);
  return database;
}

describe('normalized master names against isolated SQLite D1 semantics', () => {
  let database: LocalSQLiteDatabase;

  beforeEach(() => {
    database = createDatabase();
    database.exec(migrationSql);
  });

  afterEach(() => {
    database.close();
  });

  it('keeps project and vendor names unique per tenant after trimming and case folding', () => {
    database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?)').run('p1', 'tenant-a', 'Campus', 'P-1');
    database.prepare('INSERT INTO vendors VALUES (?, ?, ?, ?)').run('v1', 'tenant-a', 'BuildCo', 'V-1');

    expect(() => database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?)').run('p2', 'tenant-a', ' campus ', 'P-2'))
      .toThrow(/UNIQUE constraint failed/i);
    expect(() => database.prepare('INSERT INTO vendors VALUES (?, ?, ?, ?)').run('v2', 'tenant-a', 'BUILDCO ', 'V-2'))
      .toThrow(/UNIQUE constraint failed/i);

    expect(database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?)').run('p3', 'tenant-b', 'Campus', 'P-1').changes).toBe(1);
    expect(database.prepare('INSERT INTO vendors VALUES (?, ?, ?, ?)').run('v3', 'tenant-b', 'BuildCo', 'V-1').changes).toBe(1);
  });

  it('keeps cost-centre names unique per project and tenant, allowing reuse elsewhere', () => {
    database.prepare('INSERT INTO cost_centres VALUES (?, ?, ?, ?, ?)').run('cc1', 'tenant-a', 'project-a', 'North Wing', 'CC-1');

    expect(() => database.prepare('INSERT INTO cost_centres VALUES (?, ?, ?, ?, ?)')
      .run('cc2', 'tenant-a', 'project-a', ' north wing ', 'CC-2')).toThrow(/UNIQUE constraint failed/i);
    expect(database.prepare('INSERT INTO cost_centres VALUES (?, ?, ?, ?, ?)')
      .run('cc3', 'tenant-a', 'project-b', 'North Wing', 'CC-1').changes).toBe(1);
    expect(database.prepare('INSERT INTO cost_centres VALUES (?, ?, ?, ?, ?)')
      .run('cc4', 'tenant-b', 'project-a', 'North Wing', 'CC-1').changes).toBe(1);
  });

  it.each([
    ['projects', "INSERT INTO projects VALUES ('p1', 'tenant-a', 'Site', 'P-1'); INSERT INTO projects VALUES ('p2', 'tenant-a', ' site ', 'P-2');", 'p1', 'p2'],
    ['vendors', "INSERT INTO vendors VALUES ('v1', 'tenant-a', 'Supplier', 'V-1'); INSERT INTO vendors VALUES ('v2', 'tenant-a', ' supplier ', 'V-2');", 'v1', 'v2'],
    ['cost_centres', "INSERT INTO cost_centres VALUES ('cc1', 'tenant-a', 'p1', 'North', 'CC-1'); INSERT INTO cost_centres VALUES ('cc2', 'tenant-a', 'p1', ' north ', 'CC-2');", 'cc1', 'cc2'],
  ])('fails without deleting pre-existing normalized duplicates in %s', (table, rowsSql, firstId, secondId) => {
    const emptyDatabase = createDatabase();
    try {
      emptyDatabase.exec(rowsSql);
      expect(() => emptyDatabase.exec(migrationSql)).toThrow(/UNIQUE constraint failed/i);
      expect(emptyDatabase.prepare(`SELECT id FROM ${table} ORDER BY id`).all()).toEqual([
        { id: firstId }, { id: secondId },
      ]);
      expect(emptyDatabase.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()).toEqual({ total: 2 });
    } finally {
      emptyDatabase.close();
    }
  });
});
