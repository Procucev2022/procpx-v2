export interface RateCardApprovalHistoryCursor {
  id: string;
  timestamp: Date;
}

export interface RateCardApprovalHistoryRecord {
  id: string;
  timestamp: Date | string;
}

export interface RateCardApprovalHistoryPage<T> {
  approvals: T[];
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

export interface RateCardApprovalHistoryMetadata {
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

export interface RateCardApprovalHistoryUiEntry extends RateCardApprovalHistoryRecord {
  [key: string]: unknown;
}

export interface RateCardApprovalHistoryUiCard {
  id: string;
  approvals?: RateCardApprovalHistoryUiEntry[];
  approvalHistory?: RateCardApprovalHistoryMetadata;
  [key: string]: unknown;
}
