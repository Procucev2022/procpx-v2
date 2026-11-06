import {
  RATE_CARD_APPROVAL_HISTORY_CURSOR_MAX_LENGTH,
  RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
} from './rate-card-approval-history.constants';
import type {
  RateCardApprovalHistoryCursor,
  RateCardApprovalHistoryMetadata,
  RateCardApprovalHistoryPage,
  RateCardApprovalHistoryRecord,
} from '@app-types/lib/rate-card-approval-history.types';

export function encodeRateCardApprovalCursor(record: RateCardApprovalHistoryRecord): string {
  const timestamp = record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp);
  return `${timestamp.toISOString()}~${encodeURIComponent(record.id)}`;
}

export function decodeRateCardApprovalCursor(value: string): RateCardApprovalHistoryCursor | null {
  if (!value || value.length > RATE_CARD_APPROVAL_HISTORY_CURSOR_MAX_LENGTH) return null;
  const separator = value.indexOf('~');
  if (separator < 1 || separator !== value.lastIndexOf('~')) return null;

  let id: string;
  try {
    id = decodeURIComponent(value.slice(separator + 1));
  } catch {
    return null;
  }

  const timestampText = value.slice(0, separator);
  const timestamp = new Date(timestampText);
  if (!id || id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== timestampText) return null;
  return { id, timestamp };
}

export function paginateRateCardApprovalHistory<T extends RateCardApprovalHistoryRecord>(
  records: T[],
): RateCardApprovalHistoryPage<T> {
  const hasMore = records.length > RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE;
  const approvals = records.slice(0, RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE);
  return {
    approvals,
    nextCursor: hasMore && approvals.length > 0 ? encodeRateCardApprovalCursor(approvals[approvals.length - 1]) : null,
    hasMore,
    pageSize: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
  };
}

export function getRateCardApprovalHistoryMetadata<T>(
  page: RateCardApprovalHistoryPage<T>,
): RateCardApprovalHistoryMetadata {
  return { nextCursor: page.nextCursor, hasMore: page.hasMore, pageSize: page.pageSize };
}
