import { prisma } from '../src/lib/prisma';
import { MAX_D1_QUERY_FILTER_VALUES } from '../src/lib/d1-query.constants';
import { readSelectedPrBoqLines } from '../src/lib/pr-line-selection';

jest.mock('../src/lib/prisma', () => ({ prisma: { boqLine: { findMany: jest.fn() } } }));

const findMany = (prisma as unknown as { boqLine: { findMany: jest.Mock } }).boqLine.findMany;

describe('readSelectedPrBoqLines', () => {
  beforeEach(() => jest.resetAllMocks());

  it('reads selected lines in safe D1 filter chunks and returns one stable order', async () => {
    const selectedIds = Array.from({ length: MAX_D1_QUERY_FILTER_VALUES + 1 }, (_, index) => `line-${String(index).padStart(3, '0')}`);
    const rows = new Map(selectedIds.map((id, index) => [id, {
      id,
      lineNumber: index < 2 ? 'A' : 'B',
    }]));
    findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.slice().reverse().map((id) => rows.get(id)).filter(Boolean));

    const result = await readSelectedPrBoqLines('tenant-1', 'revision-1', selectedIds);

    expect(findMany).toHaveBeenCalledTimes(2);
    for (const [query] of findMany.mock.calls) {
      expect(query.where).toMatchObject({ tenantId: 'tenant-1', boqRevisionId: 'revision-1', isDeleted: false });
      expect(query.where.id.in.length).toBeLessThanOrEqual(MAX_D1_QUERY_FILTER_VALUES);
      expect(query.orderBy).toEqual([{ lineNumber: 'asc' }, { id: 'asc' }]);
      expect(query.include).toEqual({ category: true, subcategory: true, uom: true });
    }
    expect(findMany.mock.calls.map(([query]) => query.where.id.in.length)).toEqual([MAX_D1_QUERY_FILTER_VALUES, 1]);
    expect(result.slice(0, 2).map(({ id }) => id)).toEqual(['line-000', 'line-001']);
    expect(result.every((line, index) => index === 0
      || result[index - 1].lineNumber <= line.lineNumber)).toBe(true);
  });

  it('returns an empty selection without issuing a query', async () => {
    await expect(readSelectedPrBoqLines('tenant-1', 'revision-1', [])).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
