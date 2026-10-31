/* Shared declarations for components/ui/BoqDescriptionCell.tsx. */

export interface BoqDescriptionCellProps {
  /** The full untruncated BOQ Description or specification text */
  text?: string | null;
  /** Popover header title (default: 'BOQ Description') */
  title?: string;
  /** Optional vendor name or context label in tooltip header */
  contextLabel?: string | null;
  /** Optional Item Code for context in tooltip */
  itemCode?: string | null;
  /** Optional Item Description for context in tooltip */
  itemDescription?: string | null;
  /** Optional Line Number */
  lineNumber?: string | number | null;
  /** Preview column max width in pixels or CSS string (default: 220) */
  maxWidth?: number | string;
  /** Number of lines to clamp in table preview (default: 2) */
  clampLines?: 1 | 2 | 3;
  /** Placeholder when text is empty (default: '—') */
  emptyPlaceholder?: string;
  /** Custom additional className */
  className?: string;
  /** Whether to show a subtle icon next to preview (default: false for cleaner table text) */
  showIcon?: boolean;
}
