import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORY_INSERT_IF_VALID_SQL } from '../src/lib/d1-batch.constants';

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
  join(process.cwd(), 'migrations', '0034_category_normalized_name_uniqueness.sql'),
  'utf8',
);

function createDatabase(): LocalSQLiteDatabase {
  return new DatabaseSync(':memory:');
}

function createCategoryTable(database: LocalSQLiteDatabase): void {
  database.exec(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, name TEXT NOT NULL, code TEXT,
      parentId TEXT, level INTEGER NOT NULL, isActive INTEGER NOT NULL, sortOrder INTEGER NOT NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
  `);
}

function insertThroughProductionGuard(
  database: LocalSQLiteDatabase,
  id: string,
  name: string,
  tenantId = 'tenant-a',
  parentId: string | null = null,
): number {
  const now = '2026-11-10T00:00:00.000Z';
  const result = database.prepare(CATEGORY_INSERT_IF_VALID_SQL).run(
    id, tenantId, name, `${id}-code`, parentId, parentId ? 2 : 1, now, now,
    parentId, parentId, tenantId, tenantId, name, parentId,
  );
  return Number(result.changes);
}

describe('normalized category uniqueness against isolated SQLite D1 semantics', () => {
  let database: LocalSQLiteDatabase;

  beforeEach(() => {
    database = createDatabase();
    createCategoryTable(database);
  });

  afterEach(() => {
    database.close();
  });

  it('rejects case and whitespace variants at the atomic insert and index boundary', () => {
    database.exec(migrationSql);

    expect(insertThroughProductionGuard(database, 'root-1', 'Electrical')).toBe(1);
    expect(insertThroughProductionGuard(database, 'root-2', ' electrical ')).toBe(0);
    expect(() => database.prepare(`
      INSERT INTO categories (id, tenantId, name, code, parentId, level, isActive, sortOrder, createdAt, updatedAt)
      VALUES ('root-3', 'tenant-a', 'ELECTRICAL', 'root-3-code', NULL, 1, 1, 0, 'now', 'now')
    `).run()).toThrow(/UNIQUE constraint failed/i);
  });

  it('keeps child uniqueness scoped to tenant and parent', () => {
    database.exec(migrationSql);
    expect(insertThroughProductionGuard(database, 'parent-a', 'Equipment')).toBe(1);
    expect(insertThroughProductionGuard(database, 'parent-b', 'Other Equipment')).toBe(1);
    expect(insertThroughProductionGuard(database, 'parent-c', 'Tenant B Equipment', 'tenant-b')).toBe(1);

    expect(insertThroughProductionGuard(database, 'child-a1', 'Spare Parts', 'tenant-a', 'parent-a')).toBe(1);
    expect(insertThroughProductionGuard(database, 'child-a2', ' spare parts ', 'tenant-a', 'parent-a')).toBe(0);
    expect(insertThroughProductionGuard(database, 'child-b1', 'SPARE PARTS', 'tenant-a', 'parent-b')).toBe(1);
    expect(insertThroughProductionGuard(database, 'child-other-tenant', 'Spare Parts', 'tenant-b', 'parent-c')).toBe(1);
    expect(insertThroughProductionGuard(database, 'root-spare-parts', 'Spare Parts')).toBe(1);
  });

  it('fails the additive migration without deleting pre-existing normalized duplicates', () => {
    database.exec(`
      INSERT INTO categories (id, tenantId, name, code, parentId, level, isActive, sortOrder, createdAt, updatedAt)
      VALUES ('existing-a', 'tenant-a', 'Office Supplies', 'office-a', NULL, 1, 1, 0, 'now', 'now');
      INSERT INTO categories (id, tenantId, name, code, parentId, level, isActive, sortOrder, createdAt, updatedAt)
      VALUES ('existing-b', 'tenant-a', ' office supplies ', 'office-b', NULL, 1, 1, 0, 'now', 'now');
    `);

    expect(() => database.exec(migrationSql)).toThrow(/UNIQUE constraint failed/i);
    expect(database.prepare('SELECT id FROM categories ORDER BY id').all()).toEqual([
      { id: 'existing-a' },
      { id: 'existing-b' },
    ]);
    expect(database.prepare('SELECT COUNT(*) AS total FROM categories').get()).toEqual({ total: 2 });
  });
});
