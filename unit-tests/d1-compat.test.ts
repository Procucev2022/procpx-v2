import {
  canPage,
  findManyInPages,
  findManyWithinD1Limits,
  isD1ParameterLimitError,
  withD1Compat,
  withStableOrder,
} from '../src/lib/d1-compat';
import { D1_MAX_PAGE_SIZE } from '../src/lib/d1-compat.constants';
import type { PageableFindManyArgs } from '../types/lib/d1-compat.types';

const tooManyVariables = new Error('D1_ERROR: too many SQL variables at offset 631: SQLITE_ERROR');
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `row-${i}` }));

// Simulates D1: a page fails when it loads more parents than `limit`.
function d1Table(total: number, limit = D1_MAX_PAGE_SIZE) {
  const all = rows(total);
  return jest.fn(async (args: PageableFindManyArgs) => {
    const skip = args.skip ?? 0;
    const take = args.take ?? total;
    if (Math.min(take, total - skip) > limit) throw tooManyVariables;
    return all.slice(skip, skip + take);
  });
}

describe('D1 compatibility', () => {
  it('recognises D1 parameter-limit errors only', () => {
    expect(isD1ParameterLimitError(tooManyVariables)).toBe(true);
    expect(isD1ParameterLimitError(new Error('Prisma: no entry found for key'))).toBe(true);
    expect(isD1ParameterLimitError('too many SQL variables')).toBe(true);
    expect(isD1ParameterLimitError(new Error('Unique constraint failed'))).toBe(false);
  });

  it('pages only plain offset queries', () => {
    expect(canPage({})).toBe(true);
    expect(canPage({ take: 10 })).toBe(true);
    expect(canPage({ take: -5 })).toBe(false);
    expect(canPage({ cursor: { id: 'x' } })).toBe(false);
    expect(canPage({ distinct: ['name'] })).toBe(false);
  });

  it('adds an id tiebreaker unless the order already uses id', () => {
    expect(withStableOrder(undefined)).toEqual([{ id: 'asc' }]);
    expect(withStableOrder({ name: 'asc' })).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    expect(withStableOrder([{ name: 'asc' }, { id: 'desc' }])).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });

  it('returns successful queries untouched', async () => {
    const run = jest.fn().mockResolvedValue(rows(3));
    await expect(findManyWithinD1Limits({ where: { a: 1 } }, run)).resolves.toEqual(rows(3));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ where: { a: 1 } });
  });

  it('rethrows unrelated errors and limit errors for queries it cannot page', async () => {
    await expect(findManyWithinD1Limits({}, jest.fn().mockRejectedValue(new Error('boom')))).rejects.toThrow('boom');
    await expect(findManyWithinD1Limits({ cursor: { id: 'x' } }, jest.fn().mockRejectedValue(tooManyVariables)))
      .rejects.toBe(tooManyVariables);
  });

  it('falls back to pages that together return every row in order', async () => {
    const run = d1Table(805);
    const result = await findManyWithinD1Limits({ where: { tenantId: 't' }, orderBy: { name: 'asc' } }, run);

    expect(result).toEqual(rows(805));
    const pages = run.mock.calls.slice(1).map(([a]) => a);
    expect(pages.every((a) => (a.take ?? 0) <= D1_MAX_PAGE_SIZE)).toBe(true);
    expect(pages[0]).toMatchObject({ where: { tenantId: 't' }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: 0 });
  });

  it('respects the caller skip and take', async () => {
    await expect(findManyInPages({ skip: 10, take: 150 }, d1Table(805))).resolves.toEqual(rows(805).slice(10, 160));
    await expect(findManyInPages({ take: 0 }, d1Table(5))).resolves.toEqual([]);
  });

  it('halves the page size while a page still exceeds the limit', async () => {
    const run = d1Table(100, 20);
    await expect(findManyInPages({}, run)).resolves.toEqual(rows(100));
    expect(run.mock.calls.map(([a]) => a.take)).toEqual(expect.arrayContaining([90, 45, 23, 12]));
  });

  it('gives up when even single-row pages fail or the error is unrelated', async () => {
    await expect(findManyInPages({}, jest.fn().mockRejectedValue(tooManyVariables))).rejects.toBe(tooManyVariables);
    await expect(findManyInPages({}, jest.fn().mockRejectedValue(new Error('boom')))).rejects.toThrow('boom');
  });

  it('installs a findMany query extension on the client', async () => {
    const extended = { extended: true };
    const client = { $extends: jest.fn().mockReturnValue(extended) };
    expect(withD1Compat(client as never)).toBe(extended);

    const { findMany } = client.$extends.mock.calls[0][0].query.$allModels;
    const query = jest.fn().mockResolvedValue(rows(2));
    await expect(findMany({ args: { take: 2 }, query })).resolves.toEqual(rows(2));
    expect(query).toHaveBeenCalledWith({ take: 2 });
  });
});
