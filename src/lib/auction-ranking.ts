import type { AuctionVendorRankInput } from '@app-types/lib/auction-ranking.types';
import { FORWARD_AUCTION_TYPE, ITEM_WISE_AUCTION_CATEGORY, SEALED_BID_AUCTION_TYPE } from './auction-ranking.constants';

/**
 * Ranks invited vendors by their best bid, computed from the stored best bid of each vendor.
 * Forward auctions favour higher amounts and every other type favours lower amounts. Vendors with equal amounts
 * share a rank (1, 1, 3). Vendors without a bid get no rank. Item-wise and sealed auctions are not ranked at vendor level,
 * because one vendor-level amount does not compare vendors there.
 */
export function rankAuctionVendors(
  auctionType: string,
  auctionCategory: string,
  vendors: AuctionVendorRankInput[],
): Map<string, number> {
  const ranks = new Map<string, number>();
  if (auctionCategory === ITEM_WISE_AUCTION_CATEGORY || auctionType === SEALED_BID_AUCTION_TYPE) return ranks;

  const bidders = vendors.filter((vendor): vendor is AuctionVendorRankInput & { bestBidAmount: number } =>
    vendor.bidsCount > 0 && typeof vendor.bestBidAmount === 'number');
  const isBetter = auctionType === FORWARD_AUCTION_TYPE
    ? (candidate: number, reference: number) => candidate > reference
    : (candidate: number, reference: number) => candidate < reference;

  for (const bidder of bidders) {
    const betterBidders = bidders.filter((other) => isBetter(other.bestBidAmount, bidder.bestBidAmount)).length;
    ranks.set(bidder.vendorId, betterBidders + 1);
  }
  return ranks;
}
