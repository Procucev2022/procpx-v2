import type { Prisma } from '@prisma/client';

export const RFQ_COMPARE_STATUS_UPDATE_SQL = `
  UPDATE "rfqs"
  SET "status" = 'COMPARISON', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "status" = ?
`;

export const RFQ_COMPARE_RATE_CARD_DESCRIPTION_CHUNK_SIZE = 90;
export const RFQ_COMPARE_LINE_PAGE_SIZE = 50;
export const RFQ_COMPARE_FALLBACK_MATCH_CHUNK_SIZE = 30;
export const RFQ_COMPARE_FALLBACK_DESCRIPTION_CHUNK_SIZE = 40;
export const RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT = 500;
export const RFQ_COMPARE_FALLBACK_BOQ_LINE_SELECT = {
  id: true,
  lineNumber: true,
  itemCode: true,
  standardDescription: true,
  originalDescription: true,
  specification: true,
  category: { select: { name: true } },
  subcategory: { select: { name: true } },
  uom: { select: { code: true } },
  costSource: true,
  costDate: true,
  aiUnitCost: true,
  location: true,
  drawingReference: true,
  brand: true,
  model: true,
  material: true,
  grade: true,
  remarks: true,
} satisfies Prisma.BoqLineSelect;
