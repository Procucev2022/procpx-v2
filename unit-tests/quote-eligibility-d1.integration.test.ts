import { createRequire } from 'node:module';
import { QUOTE_INSERT_WITH_NEXT_VERSION_SQL } from '../src/lib/d1-batch.constants';
import { QUOTE_SUBMISSION_ALLOWED_RFQ_STATUSES } from '../src/app/api/procurement/quotes/route.constants';

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

const { DatabaseSync } = createRequire(`${process.cwd()}/package.json`)('node:sqlite') as {
  DatabaseSync: new (path: string) => LocalSQLiteDatabase;
};

function createDatabase(): LocalSQLiteDatabase {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE rfqs (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE quotes (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, rfqId TEXT NOT NULL, vendorId TEXT NOT NULL,
      quoteNumber TEXT NOT NULL, quoteVersion INTEGER NOT NULL, status TEXT NOT NULL,
      totalBaseAmount REAL NOT NULL, taxAmount REAL NOT NULL, discountAmount REAL NOT NULL,
      totalQuoteAmount REAL NOT NULL, commercialTerms TEXT, paymentTermsOffered TEXT,
      deliveryLeadTimeDays INTEGER, validUntil TEXT, submittedAt TEXT, submittedBy TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
  `);
  return database;
}

function quoteValues(id: string, rfqId: string, tenantId = 'tenant-1'): unknown[] {
  const now = '2026-11-09T00:00:00.000Z';
  return [id, tenantId, rfqId, 'vendor-1', 2026, tenantId, tenantId, rfqId, 'vendor-1', tenantId, rfqId,
    'vendor-1', 100, 18, 0, 118, null, null, 30, null, now, 'user-1', now, now,
    rfqId, tenantId, ...QUOTE_SUBMISSION_ALLOWED_RFQ_STATUSES];
}

describe('D1 quote eligibility guard', () => {
  it('inserts only when the same tenant RFQ is still in an eligible state', () => {
    const database = createDatabase();
    try {
      const insertRfq = database.prepare('INSERT INTO rfqs (id, tenantId, status) VALUES (?, ?, ?)');
      const insertQuote = database.prepare(QUOTE_INSERT_WITH_NEXT_VERSION_SQL);
      for (const [index, status] of QUOTE_SUBMISSION_ALLOWED_RFQ_STATUSES.entries()) {
        const rfqId = `rfq-valid-${index}`;
        const quoteId = `quote-valid-${index}`;
        insertRfq.run(rfqId, 'tenant-1', status);
        const result = insertQuote.all(...quoteValues(quoteId, rfqId));
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: quoteId, rfqId, tenantId: 'tenant-1' }));
      }

      insertRfq.run('rfq-cancelled', 'tenant-1', 'CANCELLED');
      expect(insertQuote.all(...quoteValues('quote-cancelled', 'rfq-cancelled'))).toEqual([]);

      insertRfq.run('rfq-other-tenant', 'tenant-2', 'RELEASED');
      expect(insertQuote.all(...quoteValues('quote-cross-tenant', 'rfq-other-tenant'))).toEqual([]);

      expect(database.prepare('SELECT COUNT(*) AS count FROM quotes').get()).toEqual({ count: 4 });
    } finally {
      database.close();
    }
  });
});
