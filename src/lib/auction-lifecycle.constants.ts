export const AUCTION_ACTIVATE_SCHEDULED_SQL = `
  UPDATE "auctions"
  SET "status" = 'LIVE', "updatedAt" = ?
  WHERE "status" = 'SCHEDULED' AND "startTime" <= ? AND "endTime" > ?
`;

export const AUCTION_CLOSE_EXPIRED_SQL = `
  UPDATE "auctions"
  SET "status" = 'CLOSED', "updatedAt" = ?
  WHERE "status" IN ('LIVE', 'EXTENDED', 'SCHEDULED') AND "endTime" <= ?
`;
