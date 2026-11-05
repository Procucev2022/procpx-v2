import {
  PR_DETAIL_LINE_CURSOR_MAX_LENGTH,
  PR_DETAIL_LINE_PAGE_SIZE,
} from './pr-line-pagination.constants';
import type {
  PrLineCursorRecord,
  PrLinePaginationMetadata,
  PrLinePaginationPage,
} from '@app-types/lib/pr-line-pagination.types';

export function encodePrLineCursor(record: PrLineCursorRecord): string {
  return encodeURIComponent(JSON.stringify({ lineNumber: record.lineNumber, id: record.id }));
}

export function decodePrLineCursor(value: string): PrLineCursorRecord | null {
  if (!value || value.length > PR_DETAIL_LINE_CURSOR_MAX_LENGTH) return null;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const cursor = parsed as Record<string, unknown>;
    if (typeof cursor.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(cursor.id)) return null;
    if (typeof cursor.lineNumber !== 'string' || !cursor.lineNumber.trim() || cursor.lineNumber.length > 100) return null;
    if (/[\u0000-\u001f]/.test(cursor.lineNumber)) return null;
    return { id: cursor.id, lineNumber: cursor.lineNumber };
  } catch {
    return null;
  }
}

export function paginatePrLineRecords<T extends PrLineCursorRecord>(records: T[]): PrLinePaginationPage<T> {
  const hasMore = records.length > PR_DETAIL_LINE_PAGE_SIZE;
  const lines = records.slice(0, PR_DETAIL_LINE_PAGE_SIZE);
  const lastLine = lines[lines.length - 1];
  return {
    lines,
    metadata: {
      hasMore,
      nextCursor: hasMore && lastLine ? encodePrLineCursor(lastLine) : null,
      pageSize: PR_DETAIL_LINE_PAGE_SIZE,
    },
  };
}

export function getPrLinePaginationMetadata<T extends PrLineCursorRecord>(
  page: PrLinePaginationPage<T>,
): PrLinePaginationMetadata {
  return page.metadata;
}
