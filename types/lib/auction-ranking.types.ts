/** The auction vendor fields that the bid ranking reads. */
export interface AuctionVendorRankInput {
  vendorId: string;
  bidsCount: number;
  bestBidAmount: number | null;
}
