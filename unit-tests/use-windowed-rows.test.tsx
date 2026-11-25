/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useWindowedRows, WINDOWED_ROW_ATTACHED_CLASS } from '../src/lib/use-windowed-rows';
import { WINDOWED_ROW_ESTIMATED_HEIGHT, WINDOWED_ROW_OVERSCAN_PX } from '../src/lib/use-windowed-rows.constants';

const getKey = (index: number) => `row-${index}`;

function scrollContainer(height: number, scrollTop = 0) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
  Object.defineProperty(element, 'scrollTop', { configurable: true, writable: true, value: scrollTop });
  return element;
}

function sized(height: number, attachedHeight?: number) {
  const parent = document.createElement('table');
  const row = document.createElement('tr');
  Object.defineProperty(row, 'offsetHeight', { configurable: true, value: height });
  parent.appendChild(row);
  if (attachedHeight !== undefined) {
    const detail = document.createElement('tr');
    detail.className = WINDOWED_ROW_ATTACHED_CLASS;
    Object.defineProperty(detail, 'offsetHeight', { configurable: true, value: attachedHeight });
    parent.appendChild(detail);
  }
  return row;
}

describe('useWindowedRows', () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  const flushFrames = () => act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  });

  it('renders every row when the container has no layout, and handles a missing container', () => {
    const { result } = renderHook(() => useWindowedRows({ count: 5, getKey, containerRef: { current: scrollContainer(0) } }));
    flushFrames();
    expect(result.current).toMatchObject({ start: 0, end: 4, topPadding: 0, bottomPadding: 0, windowed: false });

    const missing = renderHook(() => useWindowedRows({ count: 3, getKey, containerRef: { current: null } }));
    expect(missing.result.current).toMatchObject({ start: 0, end: 2, windowed: false });
    const empty = renderHook(() => useWindowedRows({ count: 0, getKey, containerRef: { current: scrollContainer(400) } }));
    flushFrames();
    expect(empty.result.current).toMatchObject({ start: 0, end: -1, windowed: false });
  });

  it('windows rows around the visible area and follows scrolling with accurate spacers', () => {
    const container = scrollContainer(500);
    const { result } = renderHook(() => useWindowedRows({ count: 1000, getKey, containerRef: { current: container } }));
    flushFrames();
    const visibleRows = Math.floor((500 + WINDOWED_ROW_OVERSCAN_PX) / WINDOWED_ROW_ESTIMATED_HEIGHT);
    expect(result.current).toMatchObject({ start: 0, end: visibleRows, topPadding: 0, windowed: true });
    const rendered = result.current.end - result.current.start + 1;
    expect(result.current.bottomPadding).toBe((1000 - rendered) * WINDOWED_ROW_ESTIMATED_HEIGHT);

    container.scrollTop = 100 * WINDOWED_ROW_ESTIMATED_HEIGHT;
    act(() => { container.dispatchEvent(new Event('scroll')); container.dispatchEvent(new Event('scroll')); });
    expect(frames).toHaveLength(1);
    flushFrames();
    const firstVisible = Math.ceil((container.scrollTop - WINDOWED_ROW_OVERSCAN_PX) / WINDOWED_ROW_ESTIMATED_HEIGHT) - 1;
    expect(result.current.start).toBe(firstVisible);
    expect(result.current.topPadding).toBe(firstVisible * WINDOWED_ROW_ESTIMATED_HEIGHT);
    const total = result.current.topPadding + (result.current.end - result.current.start + 1) * WINDOWED_ROW_ESTIMATED_HEIGHT + result.current.bottomPadding;
    expect(total).toBe(1000 * WINDOWED_ROW_ESTIMATED_HEIGHT);

    // A scroll event that changes nothing keeps the same result.
    const before = result.current;
    act(() => { container.dispatchEvent(new Event('scroll')); });
    flushFrames();
    expect(result.current).toBe(before);
  });

  it('uses measured heights, including an attached detail row, and ignores unusable measurements', () => {
    const container = scrollContainer(500);
    const { result } = renderHook(() => useWindowedRows({ count: 100, getKey, containerRef: { current: container } }));
    flushFrames();
    const initialBottom = result.current.bottomPadding;

    act(() => result.current.measure('row-99')(sized(100, 50)));
    expect(result.current.bottomPadding).toBe(initialBottom + 150 - WINDOWED_ROW_ESTIMATED_HEIGHT);
    const afterMeasure = result.current;
    act(() => result.current.measure('row-99')(sized(150)));
    expect(result.current).toBe(afterMeasure);
    act(() => result.current.measure('row-98')(null));
    act(() => result.current.measure('row-98')(sized(0)));
    expect(result.current).toBe(afterMeasure);
  });

  it('shows the last row when scrolled beyond the content', () => {
    const container = scrollContainer(300, 1_000_000);
    const { result } = renderHook(() => useWindowedRows({ count: 10, getKey, containerRef: { current: container } }));
    flushFrames();
    expect(result.current).toMatchObject({ start: 9, end: 9, topPadding: 9 * WINDOWED_ROW_ESTIMATED_HEIGHT, bottomPadding: 0 });
  });

  it('observes container resizes when ResizeObserver exists and cleans up listeners and frames', () => {
    const observe = jest.fn();
    const disconnect = jest.fn();
    let onResize: () => void = () => undefined;
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(callback: () => void) { onResize = callback; }
      observe = observe;
      disconnect = disconnect;
    };
    try {
      const container = scrollContainer(400);
      const removeListener = jest.spyOn(container, 'removeEventListener');
      const { result, unmount } = renderHook(() => useWindowedRows({ count: 50, getKey, containerRef: { current: container } }));
      flushFrames();
      expect(observe).toHaveBeenCalledWith(container);
      Object.defineProperty(container, 'clientHeight', { configurable: true, value: 0 });
      act(() => onResize());
      flushFrames();
      expect(result.current.windowed).toBe(false);
      act(() => onResize());
      unmount();
      expect(disconnect).toHaveBeenCalled();
      expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    } finally {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
    }
  });
});
