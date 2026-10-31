/* Shared declarations for components/ui/LongTextCell.tsx. */

import type React from "react";

export interface LongTextCellProps {
  /** The full text content to display */
  text?: string | null;
  /** Modal header title */
  title?: string;
  /** Modal subtitle or context label (e.g., Item Code / Description) */
  subtitle?: string;
  /** Preview maximum width in pixels or Tailwind class (default: 260) */
  maxWidth?: number | string;
  /** Placeholder when text is empty (default: '—') */
  emptyPlaceholder?: string;
  /** Whether to show a subtle icon next to preview (default: true) */
  showIcon?: boolean;
  /** Highlight color/accent (default: 'slate') */
  accent?: 'slate' | 'blue' | 'amber';
  /** Max lines to clamp in table preview (default: 1) */
  clampLines?: 1 | 2;
  /** Optional extra action in modal footer */
  extraFooterAction?: React.ReactNode;
}
