import {
  expectedColumnsByTable,
  expectedIndexNamesFromMigrations,
  findMissingColumns,
  findMissingIndexes,
  migrationStatus,
} from '../scripts/d1-schema-integrity.cjs';

describe('D1 schema integrity helpers', () => {
  it('maps Prisma model and field names to their physical D1 names', () => {
    const expected = expectedColumnsByTable([{
      name: 'PurchaseRequest',
      dbName: 'purchase_requests',
      fields: [
        { name: 'id', kind: 'scalar' },
        { name: 'requestCode', dbName: 'request_code', kind: 'scalar' },
        { name: 'status', kind: 'enum' },
        { name: 'tenant', kind: 'object' },
      ],
    }]);

    expect([...expected]).toEqual([['purchase_requests', new Set(['id', 'request_code', 'status'])]]);
  });

  it('tracks indexes in migration order, including drops and quoted names', () => {
    const expected = expectedIndexNamesFromMigrations([
      { filename: '0001.sql', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "tenant_code_key" ON items(tenantId, code);\nCREATE INDEX `lookup_idx` ON items(code);' },
      { filename: '0002.sql', sql: 'DROP INDEX IF EXISTS lookup_idx;\nCREATE INDEX [active_idx] ON items(active);' },
    ]);

    expect(expected).toEqual(new Set(['tenant_code_key', 'active_idx']));
  });

  it('reports columns and indexes missing from the database', () => {
    expect(findMissingColumns(
      new Map([['items', new Set(['id', 'tenantId', 'code'])]]),
      new Map([['items', new Set(['id', 'tenantId'])]]),
    )).toEqual([{ tableName: 'items', columnName: 'code' }]);
    expect(findMissingIndexes(new Set(['tenant_code_key', 'lookup_idx']), new Set(['lookup_idx']))).toEqual(['tenant_code_key']);
  });

  it('reports pending migrations in order and applied names that are no longer tracked', () => {
    expect(migrationStatus(
      ['0002_b.sql', '0001_a.sql', '0003_c.sql'],
      ['0001_a.sql', '0002_renamed.sql'],
    )).toEqual({ pending: ['0002_b.sql', '0003_c.sql'], unknownApplied: ['0002_renamed.sql'] });
    expect(migrationStatus(['0001_a.sql'], [])).toEqual({ pending: ['0001_a.sql'], unknownApplied: [] });
    expect(migrationStatus(['0001_a.sql'], ['0001_a.sql'])).toEqual({ pending: [], unknownApplied: [] });
  });
});
