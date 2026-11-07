import { countByD1FilterChunks, readByD1FilterChunks } from '../src/lib/d1-query';
import { MAX_D1_QUERY_DUPLICATED_FILTER_VALUES, MAX_D1_QUERY_FILTER_VALUES } from '../src/lib/d1-query.constants';

describe('D1 query filter chunking', () => {
  it('returns no rows and avoids a database read for empty filters', async () => {
    const readChunk = jest.fn().mockResolvedValue([]);
    await expect(readByD1FilterChunks([], readChunk)).resolves.toEqual([]);
    expect(readChunk).not.toHaveBeenCalled();
  });

  it('deduplicates filters, runs bounded chunks sequentially, and preserves chunk results', async () => {
    const order: string[] = [];
    const readChunk = jest.fn(async (values: string[]) => {
      order.push(values[0]);
      return values.map((value) => ({ value }));
    });

    await expect(readByD1FilterChunks(['a', 'b', 'a', 'c', 'd'], readChunk, 2)).resolves.toEqual([
      { value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' },
    ]);
    expect(readChunk.mock.calls.map(([values]) => values)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(order).toEqual(['a', 'c']);
  });

  it('keeps default filter chunks below the D1 binding limit', async () => {
    const values = Array.from({ length: MAX_D1_QUERY_FILTER_VALUES + 6 }, (_, index) => `id-${index}`);
    const seen: string[][] = [];
    const result = await readByD1FilterChunks(values, async (chunk) => {
      seen.push(chunk);
      return chunk;
    });

    expect(result).toEqual(values);
    expect(seen.map((chunk) => chunk.length)).toEqual([MAX_D1_QUERY_FILTER_VALUES, 6]);
  });

  it('sums count queries across chunks and uses safe D1-derived defaults', async () => {
    const seen: string[][] = [];
    await expect(countByD1FilterChunks(['v1', 'v2', 'v3'], async (values) => {
      seen.push(values);
      return values.length;
    }, 2)).resolves.toBe(3);

    expect(seen).toEqual([['v1', 'v2'], ['v3']]);
    expect(MAX_D1_QUERY_FILTER_VALUES).toBe(90);
    expect(MAX_D1_QUERY_DUPLICATED_FILTER_VALUES).toBe(45);
  });

  it('rejects invalid chunk sizes before calling the database', async () => {
    const readChunk = jest.fn().mockResolvedValue([]);
    await expect(readByD1FilterChunks(['id-1'], readChunk, 0)).rejects.toThrow();
    await expect(readByD1FilterChunks(['id-1'], readChunk, MAX_D1_QUERY_FILTER_VALUES + 1)).rejects.toThrow();
    expect(readChunk).not.toHaveBeenCalled();
  });
});
