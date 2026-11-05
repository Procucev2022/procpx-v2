import {
  decodeRateCardApprovalCursor,
  encodeRateCardApprovalCursor,
  getRateCardApprovalHistoryMetadata,
  paginateRateCardApprovalHistory,
} from '../src/lib/rate-card-approval-history';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '../src/lib/rate-card-approval-history.constants';

describe('rate-card approval history cursor paging', () => {
  it('encodes and decodes stable timestamp and identifier cursors', () => {
    const record = { id: 'approval-1', timestamp: new Date('2026-11-06T10:00:00.000Z') };
    const cursor = encodeRateCardApprovalCursor(record);
    expect(decodeRateCardApprovalCursor(cursor)).toEqual(record);
    expect(encodeRateCardApprovalCursor({ ...record, timestamp: record.timestamp.toISOString() })).toBe(cursor);
  });

  it('rejects malformed, oversized, and unsupported cursors', () => {
    expect(decodeRateCardApprovalCursor('')).toBeNull();
    expect(decodeRateCardApprovalCursor('2026-11-06T10:00:00.000Z')).toBeNull();
    expect(decodeRateCardApprovalCursor('2026-11-06T10:00:00.000Z~a~b')).toBeNull();
    expect(decodeRateCardApprovalCursor('2026-11-06T10:00:00.000Z~%')).toBeNull();
    expect(decodeRateCardApprovalCursor('not-a-date~approval-1')).toBeNull();
    expect(decodeRateCardApprovalCursor('2026-11-06T10:00:00.000Z~approval%201')).toBeNull();
    expect(decodeRateCardApprovalCursor(`2026-11-06T10:00:00.000Z~${'a'.repeat(600)}`)).toBeNull();
  });

  it('limits each page and exposes a cursor only when more history exists', () => {
    const records = Array.from({ length: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE + 1 }, (_, index) => ({
      id: `approval-${index}`,
      timestamp: new Date(Date.UTC(2026, 10, 6, 10, 0, index)),
    }));
    const page = paginateRateCardApprovalHistory(records);
    expect(page.approvals).toHaveLength(RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE);
    expect(page.approvals.at(-1)).toEqual(records[RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE - 1]);
    expect(page.hasMore).toBe(true);
    expect(decodeRateCardApprovalCursor(page.nextCursor!)).toEqual(records[RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE - 1]);
    expect(getRateCardApprovalHistoryMetadata(page)).toEqual({
      nextCursor: page.nextCursor,
      hasMore: true,
      pageSize: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
    });

    const lastPage = paginateRateCardApprovalHistory(records.slice(0, 1));
    expect(lastPage).toMatchObject({ approvals: records.slice(0, 1), nextCursor: null, hasMore: false });
  });
});
