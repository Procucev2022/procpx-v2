import type { PrLineDisplayRecord, PrLineDisplayRow } from '@app-types/lib/pr-line-pagination.types';

export function normalizePrLineForDisplay(
  line: PrLineDisplayRecord,
  index: number,
  fallbackCategory?: string | null,
): PrLineDisplayRow {
  return {
    id: line.id || `line-${index}`,
    lineNumber: line.lineNumber ?? String(index + 1),
    itemCode: line.itemCode ?? line.boqLine?.itemCode ?? null,
    itemDescription: line.itemDescription ?? line.boqLine?.standardDescription ?? line.boqLine?.originalDescription ?? null,
    specification: line.specification ?? line.boqLine?.specification ?? line.itemDescription ?? null,
    category: line.category ?? fallbackCategory ?? null,
    quantity: line.quantity,
    uom: line.uom ?? line.boqLine?.uom?.code ?? line.boqLine?.uomRaw ?? null,
    estimatedRate: line.estimatedRate ?? line.boqLine?.aiUnitCost ?? null,
    estimatedValue: line.estimatedValue ?? line.boqLine?.aiTotalCost ?? null,
  };
}
