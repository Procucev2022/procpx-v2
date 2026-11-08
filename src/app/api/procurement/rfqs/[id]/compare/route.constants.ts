export const RFQ_COMPARE_STATUS_UPDATE_SQL = `
  UPDATE "rfqs"
  SET "status" = 'COMPARISON', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
`;

export const RFQ_COMPARE_RATE_CARD_DESCRIPTION_CHUNK_SIZE = 90;
export const RFQ_COMPARE_LINE_PAGE_SIZE = 50;
export const RFQ_COMPARE_FALLBACK_MATCH_CHUNK_SIZE = 12;
export const RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT = 500;
