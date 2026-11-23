import type { Prisma } from '@prisma/client';

export type BoqLineOrderQueryRaw = <T = unknown>(query: Prisma.Sql) => Promise<T>;

export type BoqLineOrderCursor = { lineNumber: string; id: string };

export type BoqLineOrderInput = {
  tenantId: string;
  revisionId: string;
  /** Case-insensitive text match on line number, descriptions, specification and item code. */
  search?: string;
  validationStatus?: string;
  /** Lines strictly after this line in display order. */
  cursor?: BoqLineOrderCursor | null;
  offset?: number;
  limit: number;
};
