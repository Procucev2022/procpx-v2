import { getCategoryPreviews } from '../src/lib/category-preview';

const mockQueryRaw = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) },
}));

describe('category previews', () => {
  beforeEach(() => mockQueryRaw.mockReset());

  it('returns an empty map without querying D1 for an empty page', async () => {
    await expect(getCategoryPreviews({ tenantId: 'tenant-1', entityIds: [], source: 'purchaseRequests' }))
      .resolves.toEqual(new Map());
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('chunks large entity pages below the D1 binding ceiling and merges their rows', async () => {
    const entityIds = Array.from({ length: 95 }, (_, index) => `entity-${index}`);
    entityIds.push('entity-0');
    mockQueryRaw
      .mockResolvedValueOnce([
        { entityId: 'entity-0', category: 'Electrical', categoryCount: 2 },
        { entityId: 'entity-0', category: 'Mechanical', categoryCount: 2 },
      ])
      .mockResolvedValueOnce([
        { entityId: 'entity-94', category: 'Civil', categoryCount: 1 },
      ]);

    const result = await getCategoryPreviews({ tenantId: 'tenant-1', entityIds, source: 'purchaseRequests' });

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    const bindingCounts = mockQueryRaw.mock.calls.map(([query]) => {
      const sql = (query as { sql: string }).sql;
      return (sql.match(/\?/g) || []).length;
    });
    // Each statement includes one tenant ID and one category limit in addition to entity IDs.
    expect(bindingCounts).toEqual([92, 7]);
    expect(result.get('entity-0')).toEqual({ categories: ['Electrical', 'Mechanical'], total: 2 });
    expect(result.get('entity-94')).toEqual({ categories: ['Civil'], total: 1 });
  });

  it('skips superseded ledger rows when previewing budget contribution categories', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ entityId: 'contribution-1', category: 'Electrical', categoryCount: 1 }]);

    const result = await getCategoryPreviews({ tenantId: 'tenant-1', entityIds: ['contribution-1'], source: 'budgetContributions' });

    const query = mockQueryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain('"status" <>');
    expect(query.values).toContain('SUPERSEDED');
    expect(result.get('contribution-1')).toEqual({ categories: ['Electrical'], total: 1 });
  });
});
