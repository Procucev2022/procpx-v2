/* Shared declarations for components/ui/SpecificationCell.tsx. */

export interface SpecificationCellProps {
  specification?: string | null;
  lineNumber?: string | number;
  itemDescription?: string;
  maxWidth?: number | string;
  lineId?: string;
  emptyPlaceholder?: string;
  clampLines?: 1 | 2 | 3;
}
