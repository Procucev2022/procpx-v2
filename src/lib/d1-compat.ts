// lib/d1-compat.ts - Keep Prisma queries within Cloudflare D1 limits
import type { PrismaClient } from '@prisma/client';
import { D1_MAX_PAGE_SIZE, D1_PARAMETER_LIMIT_ERRORS } from './d1-compat.constants';
import type { FindManyRunner, PageableFindManyArgs } from '@app-types/lib/d1-compat.types';
import { logEvent } from './observability/server-logger';

export function isD1ParameterLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return D1_PARAMETER_LIMIT_ERRORS.some((pattern) => pattern.test(message));
}

/** Paging needs plain offset semantics: no cursor, no distinct, no backwards take. */
export function canPage(args: PageableFindManyArgs): boolean {
  return args.cursor === undefined && args.distinct === undefined && (args.take === undefined || args.take >= 0);
}

/** Appends `id` as a tiebreaker so offset pages never overlap or skip rows. */
export function withStableOrder(orderBy: PageableFindManyArgs['orderBy']): Record<string, unknown>[] {
  const list = orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  return list.some((entry) => 'id' in entry) ? list : [...list, { id: 'asc' }];
}

/**
 * Runs a findMany in pages so each nested relation load binds few enough
 * parameters for D1. Halves the page size while a page still exceeds the limit.
 */
export async function findManyInPages(args: PageableFindManyArgs, run: FindManyRunner): Promise<unknown[]> {
  const rows: unknown[] = [];
  const orderBy = withStableOrder(args.orderBy);
  let offset = args.skip ?? 0;
  let pageSize = D1_MAX_PAGE_SIZE;

  for (;;) {
    const remaining = args.take === undefined ? Infinity : args.take - rows.length;
    if (remaining <= 0) return rows;
    const size = Math.min(pageSize, remaining);
    let page: unknown[];
    try {
      page = await run({ ...args, orderBy, skip: offset, take: size });
    } catch (error) {
      if (!isD1ParameterLimitError(error) || pageSize === 1) throw error;
      pageSize = Math.ceil(pageSize / 2);
      continue;
    }
    rows.push(...page);
    offset += page.length;
    if (page.length < size) return rows;
  }
}

/** findMany that falls back to paging only when D1 rejects the full query. */
export async function findManyWithinD1Limits(args: PageableFindManyArgs, run: FindManyRunner): Promise<unknown[]> {
  try {
    return await run(args);
  } catch (error) {
    if (!isD1ParameterLimitError(error) || !canPage(args)) throw error;
    // Recovered, but each page is another D1 query: a frequent event points at a query to narrow.
    logEvent('warn', 'db.d1_parameter_limit_paging', { take: args.take, skip: args.skip, error });
    return findManyInPages(args, run);
  }
}

/** Wraps a D1-backed client so large nested findMany queries stay within D1 limits. */
export function withD1Compat(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        findMany({ args, query }) {
          return findManyWithinD1Limits(args as PageableFindManyArgs, query as unknown as FindManyRunner);
        },
      },
    },
  }) as unknown as PrismaClient;
}
