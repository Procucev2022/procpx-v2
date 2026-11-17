/** Props for the live countdown shown in the auction room header. */
export interface AuctionCountdownProps {
  /** Epoch milliseconds of the server end time, or null when the auction has no end time. */
  targetTime: number | null;
  isLive: boolean;
  isClosed: boolean;
  closedLabel: string;
}
