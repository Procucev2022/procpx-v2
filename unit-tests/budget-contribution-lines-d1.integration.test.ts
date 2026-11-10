import { createRequire } from 'node:module';
import type { Prisma } from '@prisma/client';
import type { BudgetContributionLineAggregateRow } from '@app-types/lib/budget-contribution-lines.types';
import { getBudgetContributionLineAggregate } from '../src/lib/budget-contribution-lines';

interface LocalSQLiteStatement {
  all(...values: unknown[]): unknown[];
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
    CREATE TABLE categories (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE boq_lines (
      id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, boqRevisionId TEXT NOT NULL, lineNumber TEXT NOT NULL,
      quantity REAL, aiUnitCost REAL, aiTotalCost REAL, categoryId TEXT, isDeleted INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO categories (id, tenantId, name) VALUES ('cat-electrical', 'tenant-1', 'Electrical');
    INSERT INTO categories (id, tenantId, name) VALUES ('cat-other-tenant', 'tenant-2', 'Other Tenant');
    INSERT INTO boq_lines (id, tenantId, boqRevisionId, lineNumber, quantity, aiUnitCost, aiTotalCost, categoryId)
      VALUES ('line-1', 'tenant-1', 'revision-1', '1', 2, 10, 0, 'cat-electrical');
    INSERT INTO boq_lines (id, tenantId, boqRevisionId, lineNumber, quantity, aiUnitCost, aiTotalCost)
      VALUES ('line-2', 'tenant-1', 'revision-1', '2', 4, 0, 80);
    INSERT INTO boq_lines (id, tenantId, boqRevisionId, lineNumber, quantity, aiUnitCost, aiTotalCost)
      VALUES ('line-deleted', 'tenant-1', 'revision-1', '3', 3, 20, 60);
    UPDATE boq_lines SET isDeleted = 1 WHERE id = 'line-deleted';
    INSERT INTO boq_lines (id, tenantId, boqRevisionId, lineNumber, quantity, aiUnitCost, aiTotalCost, categoryId)
      VALUES ('line-other-tenant', 'tenant-2', 'revision-1', '4', 8, 20, 160, 'cat-other-tenant');
  `);
  return sqlite;
}

function queryRaw(sqlite: LocalSQLiteDatabase) {
  return async (query: Prisma.Sql): Promise<BudgetContributionLineAggregateRow[]> =>
    sqlite.prepare(query.sql).all(...query.values) as BudgetContributionLineAggregateRow[];
}

describe('budget contribution aggregate D1 semantics', () => {
  it('aggregates category totals without returning individual BOQ lines and excludes deleted or foreign-tenant rows', async () => {
    const sqlite = createDatabase();
    const result = await getBudgetContributionLineAggregate(queryRaw(sqlite), 'revision-1', 'tenant-1', 'General');

    expect(result).toEqual({
      totalLines: 2,
      missingQuantityLines: 0,
      invalidCostLines: 0,
      totalEstimated: 100,
      categories: [
        { categoryName: 'Electrical', amount: 20, quantity: 2, firstLineId: 'line-1' },
        { categoryName: 'General', amount: 80, quantity: 4, firstLineId: 'line-2' },
      ],
    });
    sqlite.close();
  });

  it('reports invalid quantity and cost counts while preserving category summaries', async () => {
    const sqlite = createDatabase();
    sqlite.prepare(`
      INSERT INTO boq_lines (id, tenantId, boqRevisionId, lineNumber, quantity, aiUnitCost, aiTotalCost, categoryId)
      VALUES ('line-invalid-quantity', 'tenant-1', 'revision-1', '5', 0, 10, 0, 'cat-electrical')
    `).run();
    sqlite.prepare(`
      INSERT INTO boq_lines (id, tenantId, boqRevisionId, lineNumber, quantity, aiUnitCost, aiTotalCost, categoryId)
      VALUES ('line-invalid-cost', 'tenant-1', 'revision-1', '6', 1, 10, -5, 'cat-electrical')
    `).run();

    const result = await getBudgetContributionLineAggregate(queryRaw(sqlite), 'revision-1', 'tenant-1', 'General');
    expect(result.totalLines).toBe(4);
    expect(result.missingQuantityLines).toBe(1);
    expect(result.invalidCostLines).toBe(1);
    expect(result.totalEstimated).toBe(95);
    expect(result.categories[0]).toEqual({ categoryName: 'Electrical', amount: 15, quantity: 3, firstLineId: 'line-1' });
    sqlite.close();
  });
});
