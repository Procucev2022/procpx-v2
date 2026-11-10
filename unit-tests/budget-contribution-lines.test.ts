import { getBudgetContributionLineAggregate } from '../src/lib/budget-contribution-lines';

describe('budget contribution line aggregate', () => {
  it('normalizes D1 category totals and keeps the query tenant and revision scoped', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        categoryName: 'Electrical', categoryAmount: 20, categoryQuantity: BigInt(2), firstLineId: 'line-1',
        totalLines: BigInt(2), missingQuantityLines: 0, invalidCostLines: 0, totalEstimated: 100,
      },
      {
        categoryName: 'General', categoryAmount: 80, categoryQuantity: 4, firstLineId: 'line-2',
        totalLines: 2, missingQuantityLines: 0, invalidCostLines: 0, totalEstimated: 100,
      },
    ]);

    await expect(getBudgetContributionLineAggregate(queryRaw, 'revision-1', 'tenant-1', 'General')).resolves.toEqual({
      totalLines: 2,
      missingQuantityLines: 0,
      invalidCostLines: 0,
      totalEstimated: 100,
      categories: [
        { categoryName: 'Electrical', amount: 20, quantity: 2, firstLineId: 'line-1' },
        { categoryName: 'General', amount: 80, quantity: 4, firstLineId: 'line-2' },
      ],
    });

    const query = queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain('FROM "boq_lines" l');
    expect(query.sql).toContain('l."tenantId" = ?');
    expect(query.sql).toContain('l."isDeleted" = 0');
    expect(query.sql).toContain('ROW_NUMBER() OVER (PARTITION BY categoryName ORDER BY lineNumber, id)');
    expect(query.sql).toContain('LIMIT ?');
    expect(query.values).toEqual(['General', 'revision-1', 'tenant-1', 501]);
  });

  it('returns an empty summary and safely normalizes malformed aggregate fields', async () => {
    const emptyQuery = jest.fn().mockResolvedValue([]);
    await expect(getBudgetContributionLineAggregate(emptyQuery, 'revision-empty', 'tenant-1', 'General')).resolves.toEqual({
      totalLines: 0, missingQuantityLines: 0, invalidCostLines: 0, totalEstimated: 0, categories: [],
    });

    const malformedQuery = jest.fn().mockResolvedValue([{
      categoryName: null, categoryAmount: Number.POSITIVE_INFINITY, categoryQuantity: null, firstLineId: null,
      totalLines: Number.NaN, missingQuantityLines: undefined, invalidCostLines: null, totalEstimated: Number.NaN,
    }]);
    await expect(getBudgetContributionLineAggregate(malformedQuery, 'revision-empty', 'tenant-1', 'General')).resolves.toEqual({
      totalLines: 0, missingQuantityLines: 0, invalidCostLines: 0, totalEstimated: 0,
      categories: [{ categoryName: 'General', amount: 0, quantity: 0, firstLineId: null }],
    });
  });
});
