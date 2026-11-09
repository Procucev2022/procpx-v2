import { prisma } from './prisma';
import { readByD1FilterChunks } from './d1-query';
import type { SelectedPrBoqLine } from '@app-types/lib/pr-line-selection.types';

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareLineOrder(
  left: { lineNumber: string; id: string },
  right: { lineNumber: string; id: string },
): number {
  return compareText(left.lineNumber, right.lineNumber) || compareText(left.id, right.id);
}

export async function readSelectedPrBoqLines(
  tenantId: string,
  boqRevisionId: string,
  selectedLineIds: readonly string[],
): Promise<SelectedPrBoqLine[]> {
  const lines = await readByD1FilterChunks<SelectedPrBoqLine>(selectedLineIds, (chunk) => prisma.boqLine.findMany({
    where: {
      tenantId,
      boqRevisionId,
      isDeleted: false,
      id: { in: chunk },
    },
    orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
    include: { category: true, subcategory: true, uom: true },
  }));

  return lines.sort(compareLineOrder);
}
