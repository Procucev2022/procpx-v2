import type { AuctionVendorRankInput } from '@app-types/lib/auction-ranking.types';
import { rankAuctionVendors } from '../src/lib/auction-ranking';

function vendor(vendorId: string, bidsCount: number, bestBidAmount: number | null): AuctionVendorRankInput {
  return { vendorId, bidsCount, bestBidAmount };
}

describe('rankAuctionVendors', () => {
  it('ranks reverse auction bidders with the lowest best bid first', () => {
    const ranks = rankAuctionVendors('REVERSE_AUCTION', 'RFQ_TOTAL_WISE', [
      vendor('vendor-a', 2, 900), vendor('vendor-b', 1, 850), vendor('vendor-c', 3, 1000),
    ]);

    expect(ranks.get('vendor-b')).toBe(1);
    expect(ranks.get('vendor-a')).toBe(2);
    expect(ranks.get('vendor-c')).toBe(3);
  });

  it('ranks forward auction bidders with the highest best bid first', () => {
    const ranks = rankAuctionVendors('FORWARD_AUCTION', 'RFQ_TOTAL_WISE', [
      vendor('vendor-a', 1, 900), vendor('vendor-b', 1, 1000),
    ]);

    expect(ranks.get('vendor-b')).toBe(1);
    expect(ranks.get('vendor-a')).toBe(2);
  });

  it('shares a rank between equal bids and leaves out vendors without a usable bid', () => {
    const ranks = rankAuctionVendors('REVERSE_AUCTION', 'RFQ_TOTAL_WISE', [
      vendor('vendor-a', 1, 800), vendor('vendor-b', 1, 800), vendor('vendor-c', 1, 900),
      vendor('vendor-d', 0, null), vendor('vendor-e', 2, null),
    ]);

    expect(ranks.get('vendor-a')).toBe(1);
    expect(ranks.get('vendor-b')).toBe(1);
    expect(ranks.get('vendor-c')).toBe(3);
    expect(ranks.has('vendor-d')).toBe(false);
    expect(ranks.has('vendor-e')).toBe(false);
  });

  it('does not rank item-wise or sealed bid auctions at vendor level', () => {
    const vendors = [vendor('vendor-a', 1, 800)];

    expect(rankAuctionVendors('REVERSE_AUCTION', 'ITEM_WISE', vendors).size).toBe(0);
    expect(rankAuctionVendors('SEALED_BID', 'RFQ_TOTAL_WISE', vendors).size).toBe(0);
  });
});
