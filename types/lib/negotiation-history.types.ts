export interface NegotiationHistoryCursor {
  id: string;
  createdAt: Date;
}

export interface NegotiationHistoryCursorRecord {
  id: string;
  createdAt: Date | string;
}

export interface NegotiationHistoryPage<T> {
  rounds: T[];
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

export interface NegotiationHistoryPageMetadata {
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}
