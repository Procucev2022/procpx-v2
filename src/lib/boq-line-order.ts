// lib/boq-line-order.ts - Display order for BOQ lines: line numbers sort as numbers (1, 2, ... 10), not text.
import { Prisma } from '@prisma/client';
import type { BoqLineOrderInput, BoqLineOrderQueryRaw } from '@app-types/lib/boq-line-order.types';

export type { BoqLineOrderInput, BoqLineOrderQueryRaw };

// The integer prefix orders 2 before 10; the full text then orders 1 before 1.1, and the id breaks ties.
const ORDER_KEY = Prisma.sql`CAST("lineNumber" AS INTEGER), "lineNumber", "id"`;

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * Returns the ids of one page of a revision's active lines in display order. Callers load the full
 * rows (with relations) by id and keep this order, so every BOQ line view and cursor agrees.
 */
export async function readOrderedBoqLineIds(queryRaw: BoqLineOrderQueryRaw, input: BoqLineOrderInput): Promise<string[]> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"boqRevisionId" = ${input.revisionId}`,
    Prisma.sql`"tenantId" = ${input.tenantId}`,
    Prisma.sql`"isDeleted" = 0`,
  ];
  if (input.validationStatus) conditions.push(Prisma.sql`"validationStatus" = ${input.validationStatus}`);
  if (input.search) {
    const pattern = likePattern(input.search);
    conditions.push(Prisma.sql`(
      "originalDescription" LIKE ${pattern} ESCAPE '\\' OR "standardDescription" LIKE ${pattern} ESCAPE '\\'
      OR "specification" LIKE ${pattern} ESCAPE '\\' OR "lineNumber" LIKE ${pattern} ESCAPE '\\'
      OR "itemCode" LIKE ${pattern} ESCAPE '\\'
    )`);
  }
  if (input.cursor) {
    conditions.push(Prisma.sql`(${ORDER_KEY}) > (CAST(${input.cursor.lineNumber} AS INTEGER), ${input.cursor.lineNumber}, ${input.cursor.id})`);
  }
  const rows = await queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "boq_lines"
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY ${ORDER_KEY}
    LIMIT ${input.limit} OFFSET ${input.offset ?? 0}
  `);
  return rows.map((row) => row.id);
}

/** Puts rows loaded by id back into the order of `orderedIds`, dropping any id that did not load. */
export function sortByIdOrder<T extends { id: string }>(rows: T[], orderedIds: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
