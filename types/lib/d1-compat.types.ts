// Subset of Prisma findMany arguments that D1 paging reads or rewrites.
export interface PageableFindManyArgs {
  skip?: number;
  take?: number;
  cursor?: unknown;
  distinct?: unknown;
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  [key: string]: unknown;
}

export type FindManyRunner = (args: PageableFindManyArgs) => Promise<unknown[]>;
