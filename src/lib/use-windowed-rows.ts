// lib/use-windowed-rows.ts - Render only the rows near the visible part of a scrolling table.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WindowedRows, WindowedRowsInput } from '@app-types/lib/use-windowed-rows.types';
import { WINDOWED_ROW_ESTIMATED_HEIGHT, WINDOWED_ROW_OVERSCAN_PX } from './use-windowed-rows.constants';

export type { WindowedRows, WindowedRowsInput };

/** Rows marked with this class right after a row are measured as part of it (e.g. an expanded detail row). */
export const WINDOWED_ROW_ATTACHED_CLASS = 'windowed-row-attached';

function measuredHeight(element: HTMLElement): number {
  const next = element.nextElementSibling;
  const attached = next instanceof HTMLElement && next.classList.contains(WINDOWED_ROW_ATTACHED_CLASS) ? next.offsetHeight : 0;
  return element.offsetHeight + attached;
}

/**
 * Variable-height row windowing for long tables. Rows are measured as they render, unmeasured rows use
 * an estimate, and spacer heights keep the scrollbar accurate. Without layout (container height 0, as in
 * tests or a hidden tab) every row renders, so nothing is ever silently hidden.
 */
export function useWindowedRows({ count, getKey, containerRef }: WindowedRowsInput): WindowedRows {
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setViewport((current) => (current.scrollTop === container.scrollTop && current.height === container.clientHeight
        ? current
        : { scrollTop: container.scrollTop, height: container.clientHeight }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    container.addEventListener('scroll', schedule, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(container);
    return () => {
      container.removeEventListener('scroll', schedule);
      resizeObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerRef]);

  const measure = useCallback((key: string) => (element: HTMLElement | null) => {
    if (!element) return;
    const height = measuredHeight(element);
    if (height <= 0) return;
    setHeights((current) => (current.get(key) === height ? current : new Map(current).set(key, height)));
  }, []);

  return useMemo(() => {
    if (viewport.height <= 0 || count === 0) {
      return { start: 0, end: count - 1, topPadding: 0, bottomPadding: 0, windowed: false, measure };
    }
    const heightOf = (index: number) => heights.get(getKey(index)) ?? WINDOWED_ROW_ESTIMATED_HEIGHT;
    const top = viewport.scrollTop - WINDOWED_ROW_OVERSCAN_PX;
    const bottom = viewport.scrollTop + viewport.height + WINDOWED_ROW_OVERSCAN_PX;
    const offsets: number[] = [];
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      offsets.push(total);
      total += heightOf(index);
    }
    // First row whose bottom edge reaches the top of the window; last row whose top edge is inside it.
    let start = offsets.findIndex((offset, index) => offset + heightOf(index) >= top);
    if (start === -1) start = count - 1;
    let end = start;
    while (end + 1 < count && offsets[end + 1] <= bottom) end += 1;
    const topPadding = offsets[start];
    const bottomPadding = total - (offsets[end] + heightOf(end));
    return { start, end, topPadding, bottomPadding, windowed: true, measure };
  }, [viewport, count, getKey, measure, heights]);
}
