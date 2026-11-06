export const RFQ_COMPARE_STATUS_UPDATE_SQL = `
  UPDATE "rfqs"
  SET "status" = 'COMPARISON', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
`;

export const RFQ_COMPARE_RATE_CARD_DESCRIPTION_CHUNK_SIZE = 90;
