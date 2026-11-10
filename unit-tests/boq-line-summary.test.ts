import { getBoqLineSummary } from '../src/lib/boq-line-summary';

describe('BOQ line summary aggregate', () => {
  it('uses tenant-scoped aggregate SQL and normalizes D1 numeric totals', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{
      totalLines: BigInt(4),
      validQuantityLines: 3,
      missingQuantityLines: 1,
      missingRateLines: 2,
      validationErrorLines: 1,
      estimatedLineCount: 2,
      totalAiEstimate: 125.678,
      materialTotal: 25.555,
      electricalTotal: 100.123,
      civilTotal: 0,
      interiorTotal: 0,
      otherTotal: null,
    }]);

    await expect(getBoqLineSummary(queryRaw, 'revision-1', 'tenant-1')).resolves.toEqual({
      totalLines: 4,
      validQuantityLines: 3,
      missingQuantityLines: 1,
      missingRateLines: 2,
      validationErrorLines: 1,
      estimatedLineCount: 2,
      totalAiEstimate: 125.68,
      categoryTotals: { Material: 25.56, Electrical: 100.12, Civil: 0, Interior: 0, Other: 0 },
    });

    const query = queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain('LEFT JOIN "categories"');
    expect(query.sql).toContain('l."tenantId" = ?');
    expect(query.sql).toContain('COALESCE(l."aiTotalCost", l."aiUnitCost" * l."quantity")');
    expect(query.values).toEqual(['revision-1', 'tenant-1']);
  });

  it('returns a zero summary for no rows and non-finite aggregate values', async () => {
    const emptyQuery = jest.fn().mockResolvedValue([]);
    await expect(getBoqLineSummary(emptyQuery, 'revision-empty', 'tenant-1')).resolves.toEqual({
      totalLines: 0,
      validQuantityLines: 0,
      missingQuantityLines: 0,
      missingRateLines: 0,
      validationErrorLines: 0,
      estimatedLineCount: 0,
      totalAiEstimate: 0,
      categoryTotals: { Material: 0, Electrical: 0, Civil: 0, Interior: 0, Other: 0 },
    });

    const malformedQuery = jest.fn().mockResolvedValue([{ totalLines: Number.POSITIVE_INFINITY }]);
    await expect(getBoqLineSummary(malformedQuery, 'revision-empty', 'tenant-1')).resolves.toMatchObject({ totalLines: 0 });
  });
});
