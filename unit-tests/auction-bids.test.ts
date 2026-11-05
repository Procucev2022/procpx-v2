import { mergeAuctionBidPages } from '../src/lib/auction-bids';

describe('mergeAuctionBidPages', () => {
  it('deduplicates refreshed bids, prefers the fresh record, and orders by timestamp then ID', () => {
    const merged = mergeAuctionBidPages([
      { id: 'b2', timestamp: '2026-01-02T00:00:00.000Z', amount: 20 },
      { id: 'b3', timestamp: '2026-01-03T00:00:00.000Z', amount: 30 },
    ], [
      { id: 'b1', timestamp: '2026-01-01T00:00:00.000Z', amount: 10 },
      { id: 'b2', timestamp: '2026-01-02T00:00:00.000Z', amount: 19 },
    ]);

    expect(merged).toEqual([
      { id: 'b3', timestamp: '2026-01-03T00:00:00.000Z', amount: 30 },
      { id: 'b2', timestamp: '2026-01-02T00:00:00.000Z', amount: 20 },
      { id: 'b1', timestamp: '2026-01-01T00:00:00.000Z', amount: 10 },
    ]);
  });

  it('uses descending IDs when bid timestamps match and accepts empty pages', () => {
    const timestamp = '2026-01-01T00:00:00.000Z';
    expect(mergeAuctionBidPages([
      { id: 'bid-a', timestamp }, { id: 'bid-z', timestamp },
    ], [])).toEqual([
      { id: 'bid-z', timestamp }, { id: 'bid-a', timestamp },
    ]);
    expect(mergeAuctionBidPages([], [])).toEqual([]);
  });
});
