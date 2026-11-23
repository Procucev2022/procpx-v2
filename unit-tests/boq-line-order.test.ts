import type { Prisma } from '@prisma/client';
import { readOrderedBoqLineIds, sortByIdOrder } from '../src/lib/boq-line-order';

function captureQuery(rows: Array<{ id: string }> = []) {
  const queries: Prisma.Sql[] = [];
  const queryRaw = jest.fn(async (query: Prisma.Sql) => {
    queries.push(query);
    return rows;
  });
  return { queryRaw: queryRaw as unknown as <T>(query: Prisma.Sql) => Promise<T>, queries };
}

describe('BOQ line display order', () => {
  it('orders a revision page numerically by line number with tenant and deletion scoping', async () => {
    const { queryRaw, queries } = captureQuery([{ id: 'line-2' }, { id: 'line-10' }]);
    await expect(readOrderedBoqLineIds(queryRaw, { tenantId: 'tenant-1', revisionId: 'revision-1', limit: 91 }))
      .resolves.toEqual(['line-2', 'line-10']);

    const [query] = queries;
    expect(query.sql).toContain('ORDER BY CAST("lineNumber" AS INTEGER), "lineNumber", "id"');
    expect(query.sql).toContain('"isDeleted" = 0');
    expect(query.sql).not.toContain('LIKE');
    expect(query.sql).not.toContain('"validationStatus"');
    expect(query.values).toEqual(['revision-1', 'tenant-1', 91, 0]);
  });

  it('adds status, escaped search and cursor conditions, and honours the offset', async () => {
    const { queryRaw, queries } = captureQuery();
    await readOrderedBoqLineIds(queryRaw, {
      tenantId: 'tenant-1', revisionId: 'revision-1', validationStatus: 'VALID', search: '50%_off\\x',
      cursor: { lineNumber: '9', id: 'line-9' }, offset: 30, limit: 10,
    });

    const [query] = queries;
    expect(query.sql).toContain('"validationStatus" = ?');
    expect(query.sql.match(/LIKE \? ESCAPE/g)).toHaveLength(5);
    expect(query.sql).toContain('(CAST("lineNumber" AS INTEGER), "lineNumber", "id") > (CAST(? AS INTEGER), ?, ?)');
    const pattern = '%50\\%\\_off\\\\x%';
    expect(query.values).toEqual([
      'revision-1', 'tenant-1', 'VALID', pattern, pattern, pattern, pattern, pattern, '9', '9', 'line-9', 10, 30,
    ]);
  });

  it('restores loaded rows to the ordered ids and drops ids that did not load', () => {
    const rows = [{ id: 'b', name: 'second' }, { id: 'a', name: 'first' }];
    expect(sortByIdOrder(rows, ['a', 'missing', 'b'])).toEqual([{ id: 'a', name: 'first' }, { id: 'b', name: 'second' }]);
    expect(sortByIdOrder([], ['a'])).toEqual([]);
  });
});
