import {
  decodePrLineCursor,
  encodePrLineCursor,
  getPrLinePaginationMetadata,
  paginatePrLineRecords,
} from '../src/lib/pr-line-pagination';
import { PR_DETAIL_LINE_PAGE_SIZE } from '../src/lib/pr-line-pagination.constants';

describe('purchase request line pagination', () => {
  it('round trips line-number and identifier cursors', () => {
    const record = { id: 'line-1', lineNumber: '1.2/3' };
    expect(decodePrLineCursor(encodePrLineCursor(record))).toEqual(record);
  });

  it('rejects malformed, oversized, and unsafe cursors', () => {
    expect(decodePrLineCursor('')).toBeNull();
    expect(decodePrLineCursor('%')).toBeNull();
    expect(decodePrLineCursor(encodeURIComponent('[]'))).toBeNull();
    expect(decodePrLineCursor(encodeURIComponent(JSON.stringify({ id: 'line/1', lineNumber: '1' })))).toBeNull();
    expect(decodePrLineCursor(encodeURIComponent(JSON.stringify({ id: 'line-1', lineNumber: '1\n2' })))).toBeNull();
    expect(decodePrLineCursor('x'.repeat(600))).toBeNull();
  });

  it('returns one bounded page and a continuation cursor only when needed', () => {
    const records = Array.from({ length: PR_DETAIL_LINE_PAGE_SIZE + 1 }, (_, index) => ({
      id: `line-${index + 1}`,
      lineNumber: String(index + 1),
    }));
    const page = paginatePrLineRecords(records);
    expect(page.lines).toHaveLength(PR_DETAIL_LINE_PAGE_SIZE);
    expect(page.lines.at(-1)).toEqual(records[PR_DETAIL_LINE_PAGE_SIZE - 1]);
    expect(page.metadata.hasMore).toBe(true);
    expect(decodePrLineCursor(page.metadata.nextCursor!)).toEqual(records[PR_DETAIL_LINE_PAGE_SIZE - 1]);
    expect(getPrLinePaginationMetadata(page)).toEqual(page.metadata);
    expect(paginatePrLineRecords(records.slice(0, 1)).metadata).toEqual({ hasMore: false, nextCursor: null, pageSize: PR_DETAIL_LINE_PAGE_SIZE });
  });
});
