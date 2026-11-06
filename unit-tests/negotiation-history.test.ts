import {
  decodeNegotiationHistoryCursor,
  encodeNegotiationHistoryCursor,
  getNegotiationHistoryPageMetadata,
  paginateNegotiationHistory,
} from '../src/lib/negotiation-history';
import { NEGOTIATION_HISTORY_PAGE_SIZE } from '../src/lib/negotiation-history.constants';

describe('negotiation history cursor paging', () => {
  it('encodes and decodes a stable timestamp and record identifier', () => {
    const createdAt = new Date('2026-11-05T12:30:45.000Z');
    const cursor = encodeNegotiationHistoryCursor({ id: 'round_1-a', createdAt });

    expect(decodeNegotiationHistoryCursor(cursor)).toEqual({ id: 'round_1-a', createdAt });
  });

  it('rejects malformed, ambiguous, oversized, and invalid identifier cursors', () => {
    expect(decodeNegotiationHistoryCursor('')).toBeNull();
    expect(decodeNegotiationHistoryCursor('not-a-date~round-1')).toBeNull();
    expect(decodeNegotiationHistoryCursor('2026-11-05T12:30:45.000Z~round-1~extra')).toBeNull();
    expect(decodeNegotiationHistoryCursor(`2026-11-05T12:30:45.000Z~${'x'.repeat(600)}`)).toBeNull();
    expect(decodeNegotiationHistoryCursor('2026-11-05T12:30:45.000Z~bad%2Fid')).toBeNull();
  });

  it('returns a bounded page and a cursor only when another page exists', () => {
    const records = Array.from({ length: NEGOTIATION_HISTORY_PAGE_SIZE + 1 }, (_, index) => ({
      id: `round-${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    }));
    const page = paginateNegotiationHistory(records);

    expect(page.rounds).toHaveLength(NEGOTIATION_HISTORY_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(encodeNegotiationHistoryCursor(records[NEGOTIATION_HISTORY_PAGE_SIZE - 1]));
    expect(getNegotiationHistoryPageMetadata(page)).toEqual({
      nextCursor: page.nextCursor, hasMore: true, pageSize: NEGOTIATION_HISTORY_PAGE_SIZE,
    });
  });

  it('does not report another page when the query returns no overflow row', () => {
    const page = paginateNegotiationHistory([{ id: 'round-1', createdAt: '2026-11-05T12:30:45.000Z' }]);

    expect(page).toEqual({
      rounds: [{ id: 'round-1', createdAt: '2026-11-05T12:30:45.000Z' }],
      nextCursor: null,
      hasMore: false,
      pageSize: NEGOTIATION_HISTORY_PAGE_SIZE,
    });
  });
});
