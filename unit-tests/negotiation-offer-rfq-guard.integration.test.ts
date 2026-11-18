import { createRequire } from 'node:module';
import { NEGOTIATION_OFFER_RFQ_UPDATE_SQL } from '../src/lib/d1-batch.constants';

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

const NOW = '2026-11-17T00:00:00.000Z';

function openDatabase(): LocalSQLiteDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE rfqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, status TEXT NOT NULL, updatedAt TEXT NOT NULL);' +
    'CREATE TABLE offer_chain (id TEXT PRIMARY KEY);' +
    "INSERT INTO rfqs VALUES ('rfq-1', 'tenant-1', 'RELEASED', '2026-01-01T00:00:00.000Z');",
  );
  return sqlite;
}

function rfqStatus(sqlite: LocalSQLiteDatabase): string {
  return String(sqlite.prepare("SELECT status FROM rfqs WHERE id = 'rfq-1'").all()[0].status);
}

describe('negotiation offer RFQ status update', () => {
  it('moves the RFQ into negotiation only when the offer statement before it recorded a row', () => {
    const sqlite = openDatabase();

    // A refused offer writes nothing, so the statement before the RFQ update changes zero rows.
    sqlite.prepare('INSERT INTO offer_chain SELECT ? WHERE 0').run('refused');
    sqlite.prepare(NEGOTIATION_OFFER_RFQ_UPDATE_SQL).run(NOW, 'rfq-1', 'tenant-1');
    expect(rfqStatus(sqlite)).toBe('RELEASED');

    sqlite.prepare('INSERT INTO offer_chain VALUES (?)').run('recorded');
    sqlite.prepare(NEGOTIATION_OFFER_RFQ_UPDATE_SQL).run(NOW, 'rfq-1', 'tenant-1');
    expect(rfqStatus(sqlite)).toBe('NEGOTIATION');

    sqlite.close();
  });
});
