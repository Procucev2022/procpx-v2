import type { RefObject } from 'react';

export type WindowedRowsInput = {
  /** Number of rows that could be rendered. */
  count: number;
  /** Stable key for row `index` (heights are remembered per key). */
  getKey: (index: number) => string;
  /** The scrolling element that contains the rows. */
  containerRef: RefObject<HTMLElement | null>;
};

export type WindowedRows = {
  /** First and last (inclusive) row index to render. */
  start: number;
  end: number;
  /** Heights of the spacers that stand in for the rows that are not rendered. */
  topPadding: number;
  bottomPadding: number;
  /** True once the container has a real size; false in layout-less environments, where every row renders. */
  windowed: boolean;
  /** Ref callback for a rendered row; measures it (and an attached detail row) for accurate spacing. */
  measure: (key: string) => (element: HTMLElement | null) => void;
};
