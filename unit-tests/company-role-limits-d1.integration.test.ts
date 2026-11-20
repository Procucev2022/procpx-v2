import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUSINESS_INSERT_IF_AVAILABLE_SQL,
  BUSINESS_TOUCH_SQL,
  ROLE_LIMIT_DELETE_SQL,
  ROLE_LIMIT_UPSERT_SQL,
} from '../src/lib/business-directory.constants';
import { USER_INSERT_IF_EMAIL_AVAILABLE_SQL } from '../src/app/api/admin/users/route.constants';

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
  join(process.cwd(), 'migrations', '0036_tenant_company_profile_and_role_limits.sql'),
  'utf8',
);
const NOW = '2026-11-19T00:00:00.000Z';
const GSTIN = '29ABCDE1234F1Z5';

function createDatabase(): LocalSQLiteDatabase {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'ACTIVE',
      config TEXT, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, passwordHash TEXT NOT NULL,
      role TEXT NOT NULL, status TEXT NOT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
      createdBy TEXT, updatedBy TEXT
    );
    INSERT INTO tenants (id, name, slug, createdAt, updatedAt) VALUES ('legacy', 'Legacy Co', 'legacy', '${NOW}', '${NOW}');
  `);
  return database;
}

describe('company profile and role limits against isolated SQLite D1 semantics', () => {
  let database: LocalSQLiteDatabase;

  beforeEach(() => {
    database = createDatabase();
    database.exec(migrationSql);
  });

  afterEach(() => {
    database.close();
  });

  const insertCompany = (id: string, name: string, slug: string, gst: string) => database.prepare(BUSINESS_INSERT_IF_AVAILABLE_SQL)
    .run(id, name, slug, 'ACTIVE', gst, 'Road', null, null, 'RETAIL', null, null, NOW, NOW, name, slug, gst).changes;
  const insertUser = (id: string, tenantId: string, email: string, role: string) => database.prepare(USER_INSERT_IF_EMAIL_AVAILABLE_SQL)
    .run(id, tenantId, email, 'Name', 'hash', role, 'ACTIVE', NOW, NOW, 'root', tenantId, email, tenantId, role).changes;
  const setLimit = (tenantId: string, role: string, maxUsers: number) => database.prepare(ROLE_LIMIT_UPSERT_SQL)
    .run(`${tenantId}-${role}-${maxUsers}`, tenantId, role, maxUsers, NOW, NOW, 'root', tenantId).changes;

  it('keeps existing companies intact with empty profile columns', () => {
    expect(database.prepare('SELECT name, gstNumber, address, industry FROM tenants WHERE id = ?').get('legacy')).toEqual({
      name: 'Legacy Co', gstNumber: null, address: null, industry: null,
    });
  });

  it('creates a company once per normalized name and GSTIN', () => {
    expect(insertCompany('t1', 'Acme', 'acme-1', GSTIN)).toBe(1);
    expect(insertCompany('t2', ' ACME ', 'acme-2', '27ABCDE1234F1Z5')).toBe(0);
    expect(insertCompany('t3', 'Other', 'other-3', GSTIN.toLowerCase())).toBe(0);
    expect(insertCompany('t4', 'Other', 'other-4', '27ABCDE1234F1Z5')).toBe(1);
  });

  it('upserts and removes role limits, never for a missing company', () => {
    expect(setLimit('legacy', 'VIEWER', 2)).toBe(1);
    expect(setLimit('legacy', 'VIEWER', 5)).toBe(1);
    expect(database.prepare('SELECT COUNT(*) AS n, MAX(maxUsers) AS max FROM tenant_role_limits').get()).toEqual({ n: 1, max: 5 });
    expect(setLimit('missing', 'VIEWER', 1)).toBe(0);
    expect(database.prepare(ROLE_LIMIT_DELETE_SQL).run('legacy', 'VIEWER').changes).toBe(1);
    expect(database.prepare(BUSINESS_TOUCH_SQL).run(NOW, 'legacy').changes).toBe(1);
    expect(database.prepare(BUSINESS_TOUCH_SQL).run(NOW, 'missing').changes).toBe(0);
  });

  it('stops new users once a role is full, counting only active users of that company', () => {
    setLimit('legacy', 'VIEWER', 1);
    expect(insertUser('u1', 'legacy', 'one@example.test', 'VIEWER')).toBe(1);
    expect(insertUser('u2', 'legacy', 'two@example.test', 'VIEWER')).toBe(0);
    expect(insertUser('u3', 'legacy', 'three@example.test', 'PROJECT_USER')).toBe(1);

    database.prepare(`UPDATE users SET status = 'INACTIVE' WHERE id = 'u1'`).run();
    expect(insertUser('u4', 'legacy', 'four@example.test', 'VIEWER')).toBe(1);

    insertCompany('t1', 'Acme', 'acme-1', GSTIN);
    expect(insertUser('u5', 't1', 'five@example.test', 'VIEWER')).toBe(1);
    expect(insertUser('u6', 't1', ' FIVE@example.test ', 'VIEWER')).toBe(0);
    expect(insertUser('u7', 'missing', 'seven@example.test', 'VIEWER')).toBe(0);
  });
});
