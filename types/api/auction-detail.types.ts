export interface AuctionBidCursor {
  beforeId: string;
  beforeTimestamp: string;
}

export interface AuctionBidHistoryState {
  auctionId: string | null;
  initialized: boolean;
  hasMore: boolean;
  cursor: AuctionBidCursor | null;
}

export interface AuctionBidViewRecord {
  id: string;
  timestamp: string;
  [field: string]: unknown;
}

export interface AuctionDetailSnapshot {
  id: string;
  bids?: AuctionBidViewRecord[];
  [field: string]: unknown;
}
