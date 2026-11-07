import { BOQ_LINE_CURSOR_MAX_LENGTH, BOQ_LINE_DETAIL_PAGE_SIZE } from './boq-line-pagination.constants';
import { UI_STRINGS } from './ui-strings.constants';
import type { BoqLineCursorRecord } from '@app-types/lib/boq-line-pagination.types';

export function encodeBoqLineCursor(record: BoqLineCursorRecord): string {
  return encodeURIComponent(JSON.stringify({ lineNumber: record.lineNumber, id: record.id }));
}

export function decodeBoqLineCursor(value: string): BoqLineCursorRecord | null {
  if (!value || value.length > BOQ_LINE_CURSOR_MAX_LENGTH) return null;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const cursor = parsed as Record<string, unknown>;
    if (typeof cursor.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(cursor.id)) return null;
    if (typeof cursor.lineNumber !== 'string' || !cursor.lineNumber.trim() || cursor.lineNumber.length > 100) return null;
    if (/[\u0000-\u001f]/.test(cursor.lineNumber)) return null;
    return { id: cursor.id, lineNumber: cursor.lineNumber };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function fetchBoqLineContinuationPages(
  revisionId: string,
  initialCursor: string | null,
  fetchPage: typeof fetch = fetch,
): Promise<unknown[]> {
  if (initialCursor === null) return [];
  if (!decodeBoqLineCursor(initialCursor)) throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);

  const lines: unknown[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = initialCursor;

  while (cursor) {
    if (seenCursors.has(cursor)) throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
    seenCursors.add(cursor);

    const query = new URLSearchParams({ cursor, pageSize: String(BOQ_LINE_DETAIL_PAGE_SIZE) });
    const response = await fetchPage(`/api/boq/${encodeURIComponent(revisionId)}/lines?${query.toString()}`);
    if (!response.ok) throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
    }
    const nextCursor = payload.nextCursor;
    if (nextCursor !== null && (typeof nextCursor !== 'string' || !decodeBoqLineCursor(nextCursor))) {
      throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
    }
    if (typeof nextCursor === 'string' && (nextCursor === cursor || seenCursors.has(nextCursor) || payload.data.length === 0)) {
      throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
    }

    lines.push(...payload.data);
    cursor = typeof nextCursor === 'string' ? nextCursor : null;
  }

  return lines;
}
