import { NEGOTIATION_HISTORY_CURSOR_MAX_LENGTH, NEGOTIATION_HISTORY_PAGE_SIZE } from './negotiation-history.constants';
import type {
  NegotiationHistoryCursor,
  NegotiationHistoryCursorRecord,
  NegotiationHistoryPage,
  NegotiationHistoryPageMetadata,
} from '@app-types/lib/negotiation-history.types';

export function encodeNegotiationHistoryCursor(record: NegotiationHistoryCursorRecord): string {
  const createdAt = record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt);
  return `${createdAt.toISOString()}~${encodeURIComponent(record.id)}`;
}

export function decodeNegotiationHistoryCursor(value: string): NegotiationHistoryCursor | null {
  if (!value || value.length > NEGOTIATION_HISTORY_CURSOR_MAX_LENGTH) return null;
  const separator = value.indexOf('~');
  if (separator < 1 || separator !== value.lastIndexOf('~')) return null;

  let id: string;
  try {
    id = decodeURIComponent(value.slice(separator + 1));
  } catch {
    return null;
  }
  const dateText = value.slice(0, separator);
  const createdAt = new Date(dateText);
  if (!id || id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== dateText) return null;
  return { id, createdAt };
}

export function paginateNegotiationHistory<T extends NegotiationHistoryCursorRecord>(
  records: T[],
): NegotiationHistoryPage<T> {
  const hasMore = records.length > NEGOTIATION_HISTORY_PAGE_SIZE;
  const rounds = records.slice(0, NEGOTIATION_HISTORY_PAGE_SIZE);
  return {
    rounds,
    nextCursor: hasMore && rounds.length > 0 ? encodeNegotiationHistoryCursor(rounds[rounds.length - 1]) : null,
    hasMore,
    pageSize: NEGOTIATION_HISTORY_PAGE_SIZE,
  };
}

export function getNegotiationHistoryPageMetadata<T extends NegotiationHistoryCursorRecord>(
  page: NegotiationHistoryPage<T>,
): NegotiationHistoryPageMetadata {
  return { nextCursor: page.nextCursor, hasMore: page.hasMore, pageSize: page.pageSize };
}
