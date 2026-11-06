import type { BoqCostEstimateRate } from '@app-types/app/api/boq/estimate-cost/route.types';

export const BOQ_COST_ESTIMATE_BENCHMARK_RATES: Record<string, BoqCostEstimateRate> = {
  tile: { rate: 125, source: 'Approved Vendor Rate Card', conf: 0.94, category: 'Civil & Interior' },
  flooring: { rate: 140, source: 'Approved Vendor Rate Card', conf: 0.93, category: 'Civil & Interior' },
  granite: { rate: 220, source: 'Market Benchmark', conf: 0.90, category: 'Civil & Interior' },
  ceiling: { rate: 110, source: 'Standard Catalogue', conf: 0.91, category: 'Civil & Interior' },
  gypsum: { rate: 105, source: 'Standard Catalogue', conf: 0.92, category: 'Civil & Interior' },
  partition: { rate: 165, source: 'Standard Catalogue', conf: 0.90, category: 'Civil & Interior' },
  paint: { rate: 38, source: 'Historical Awarded Price', conf: 0.88, category: 'Civil & Interior' },
  door: { rate: 14500, source: 'Historical Awarded Price', conf: 0.87, category: 'Civil & Interior' },
  glass: { rate: 450, source: 'Market Rate Benchmark', conf: 0.89, category: 'Civil & Interior' },
  carpet: { rate: 180, source: 'Approved Vendor Catalog', conf: 0.91, category: 'Civil & Interior' },
  plywood: { rate: 95, source: 'Standard Catalogue', conf: 0.90, category: 'Material' },
  cable: { rate: 65, source: 'Standard Catalogue', conf: 0.95, category: 'Electrical' },
  wire: { rate: 65, source: 'Standard Catalogue', conf: 0.95, category: 'Electrical' },
  conduit: { rate: 42, source: 'Standard Catalogue', conf: 0.93, category: 'Electrical' },
  light: { rate: 2100, source: 'Client Contract / Rate Card', conf: 0.96, category: 'Electrical' },
  led: { rate: 1850, source: 'Client Contract / Rate Card', conf: 0.95, category: 'Electrical' },
  switch: { rate: 320, source: 'Standard Catalogue', conf: 0.92, category: 'Electrical' },
  socket: { rate: 280, source: 'Standard Catalogue', conf: 0.92, category: 'Electrical' },
  mcb: { rate: 750, source: 'Standard Catalogue', conf: 0.94, category: 'Electrical' },
  db: { rate: 4500, source: 'Standard Catalogue', conf: 0.91, category: 'Electrical' },
  distribution: { rate: 6500, source: 'Engineered Cost Model', conf: 0.89, category: 'Electrical' },
  panel: { rate: 18500, source: 'Engineered Cost Model', conf: 0.88, category: 'Electrical' },
  earthing: { rate: 3500, source: 'Standard Catalogue', conf: 0.92, category: 'Electrical' },
  ups: { rate: 42000, source: 'Client Contract / Rate Card', conf: 0.94, category: 'Electrical' },
  ac: { rate: 52000, source: 'Approved Vendor Rate Card', conf: 0.93, category: 'HVAC' },
  hvac: { rate: 48000, source: 'Approved Vendor Rate Card', conf: 0.91, category: 'HVAC' },
  cassette: { rate: 62000, source: 'Approved Vendor Rate Card', conf: 0.94, category: 'HVAC' },
  chiller: { rate: 75000, source: 'Approved Vendor Rate Card', conf: 0.92, category: 'HVAC' },
  duct: { rate: 120, source: 'Historical Awarded Price', conf: 0.88, category: 'HVAC' },
  chair: { rate: 4500, source: 'Standard Furniture Catalogue', conf: 0.93, category: 'Furniture' },
  table: { rate: 12500, source: 'Standard Furniture Catalogue', conf: 0.91, category: 'Furniture' },
  desk: { rate: 14000, source: 'Standard Furniture Catalogue', conf: 0.90, category: 'Furniture' },
  workstation: { rate: 18500, source: 'Validated Vendor Catalogue', conf: 0.92, category: 'Furniture' },
  rack: { rate: 8500, source: 'Validated Vendor Catalogue', conf: 0.90, category: 'Furniture' },
  storage: { rate: 9500, source: 'Standard Catalogue', conf: 0.89, category: 'Furniture' },
  counter: { rate: 24000, source: 'Engineered Cost Build-up', conf: 0.85, category: 'Interior' },
  signage: { rate: 18500, source: 'Historical Awarded Price', conf: 0.89, category: 'Signage & Branding' },
  branding: { rate: 15000, source: 'Standard Catalogue', conf: 0.87, category: 'Signage & Branding' },
  board: { rate: 8500, source: 'Standard Catalogue', conf: 0.86, category: 'Signage & Branding' },
  camera: { rate: 3800, source: 'Standard Catalogue', conf: 0.94, category: 'ELV / IT' },
  cctv: { rate: 4200, source: 'Standard Catalogue', conf: 0.94, category: 'ELV / IT' },
  dvr: { rate: 12000, source: 'Standard Catalogue', conf: 0.92, category: 'ELV / IT' },
  nvr: { rate: 16000, source: 'Standard Catalogue', conf: 0.93, category: 'ELV / IT' },
  wifi: { rate: 5500, source: 'Standard Catalogue', conf: 0.93, category: 'ELV / IT' },
  access: { rate: 8500, source: 'Standard Catalogue', conf: 0.91, category: 'ELV / IT' },
  biometric: { rate: 9500, source: 'Standard Catalogue', conf: 0.92, category: 'ELV / IT' },
};

export const BOQ_COST_ESTIMATE_LINES_UPDATE_JSON_SQL = `
  WITH "line_updates" AS (
    SELECT json_extract("value", '$.id') AS "id",
      json_extract("value", '$.aiUnitCost') AS "aiUnitCost",
      json_extract("value", '$.aiTotalCost') AS "aiTotalCost",
      json_extract("value", '$.aiReason') AS "aiReason",
      json_extract("value", '$.costConfidence') AS "costConfidence",
      json_extract("value", '$.costSource') AS "costSource",
      json_extract("value", '$.costMethod') AS "costMethod",
      json_extract("value", '$.costDate') AS "costDate",
      json_extract("value", '$.geography') AS "geography",
      json_extract("value", '$.validationStatus') AS "validationStatus",
      json_extract("value", '$.updatedAt') AS "updatedAt"
    FROM json_each(?)
  )
  UPDATE "boq_lines"
  SET "aiUnitCost" = "line_updates"."aiUnitCost",
      "aiTotalCost" = "line_updates"."aiTotalCost",
      "aiReason" = "line_updates"."aiReason",
      "costConfidence" = "line_updates"."costConfidence",
      "costSource" = "line_updates"."costSource",
      "costMethod" = "line_updates"."costMethod",
      "costDate" = "line_updates"."costDate",
      "geography" = "line_updates"."geography",
      "validationStatus" = "line_updates"."validationStatus",
      "updatedAt" = "line_updates"."updatedAt"
  FROM "line_updates"
  WHERE "boq_lines"."id" = "line_updates"."id"
    AND "boq_lines"."tenantId" = ?
    AND "boq_lines"."boqRevisionId" = ?
    AND "boq_lines"."isDeleted" = 0
`;

export const BOQ_COST_ESTIMATE_REVISION_UPDATE_SQL = `
  UPDATE "boq_revisions"
  SET "preparationStatus" = 'AI_COST_GENERATED', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "updatedAt" = ?
    AND changes() = ?
    AND EXISTS (
      SELECT 1 FROM "boqs" b
      WHERE b."id" = "boq_revisions"."boqId" AND b."tenantId" = "boq_revisions"."tenantId"
    )
`;

export const BOQ_COST_ESTIMATE_AUDIT_INSERT_AFTER_UPDATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?,
    'BOQ_REVISION', ?, 'AI_COST_GENERATED', ?, NULL, NULL, NULL, NULL, ?
`;
