import type { BoqRefinementRule } from '@app-types/app/api/boq/refine-ai/route.types';

export const BOQ_REFINEMENT_RULES: Record<string, BoqRefinementRule> = {
  tile: {
    std: '600 x 600 mm vitrified floor tile, commercial-grade, heavy-traffic retail application',
    spec: 'Full body 10mm thickness, matte anti-skid surface, PEI Group 5, installed with polymer modified adhesive.',
    reason: 'Upgraded generic tile to commercial-grade retail spec with dimensional standards.',
    conf: 0.94,
  },
  ceiling: {
    std: 'Gypsum Board False Ceiling (12.5mm Saint-Gobain) with Galvanized Steel Perimeter Framing',
    spec: 'Tapered edge 12.5mm board on galvanized intermediate and perimeter channels @ 450mm c/c with perimeter cove detail.',
    reason: 'Standardized to Saint-Gobain enterprise commercial ceiling spec with framing intervals.',
    conf: 0.92,
  },
  cable: {
    std: 'Electrical Cable 2.5 SQMM (FRLS Multi-strand Electrolytic Copper Conductors)',
    spec: '1100V grade fire-retardant low-smoke copper wire drawn through 25mm rigid PVC conduit.',
    reason: 'Added fire safety FRLS classification and PVC conduit specification for retail MEP compliance.',
    conf: 0.96,
  },
  wire: {
    std: 'Electrical Cable 2.5 SQMM (FRLS Multi-strand Electrolytic Copper Conductors)',
    spec: '1100V grade fire-retardant low-smoke copper wire drawn through 25mm rigid PVC conduit.',
    reason: 'Standardized wire terminology to technical electrical cable standards.',
    conf: 0.95,
  },
  light: {
    std: 'LED Recessed Track Light Fixture (30W COB 4000K Neutral White)',
    spec: 'Die-cast aluminum housing, Citizen COB LED, CRI > 90, flicker-free constant current driver.',
    reason: 'Added CRI, color temperature (4000K), and commercial heat-sink driver criteria.',
    conf: 0.91,
  },
  ac: {
    std: '2.0 TR Inverter Split AC Unit (5 Star BEE Rated, 100% Copper Condenser)',
    spec: 'Twin rotary inverter compressor, eco-friendly R32 refrigerant, gold-fin coils with wireless remote.',
    reason: 'Applied BEE energy efficiency rating and 100% copper tube technical clause.',
    conf: 0.95,
  },
  paint: {
    std: 'Interior Acrylic Emulsion Painting (2 Coats over Primer & Wall Putty)',
    spec: 'Low-VOC anti-fungal acrylic emulsion paint applied over 2 coats acrylic putty and water-thinnable primer.',
    reason: 'Standardized surface prep sequence and low-VOC environmental standard.',
    conf: 0.89,
  },
  door: {
    std: '12mm Toughened Glass Entrance Door with Stainless Steel Patch Fittings & Floor Spring',
    spec: 'Clear float glass with top/bottom patch fittings, heavy-duty hydraulic floor spring, and 300mm SS D-handles.',
    reason: 'Specified commercial glass entrance hardware package.',
    conf: 0.93,
  },
};

export const BOQ_REFINEMENT_LINES_UPDATE_JSON_SQL = `
  WITH "line_updates" AS (
    SELECT json_extract("value", '$.id') AS "id",
      json_extract("value", '$.aiSuggestedDescription') AS "aiSuggestedDescription",
      json_extract("value", '$.aiSuggestedSpec') AS "aiSuggestedSpec",
      json_extract("value", '$.aiReason') AS "aiReason",
      json_extract("value", '$.aiConfidence') AS "aiConfidence",
      json_extract("value", '$.standardDescription') AS "standardDescription",
      json_extract("value", '$.specification') AS "specification",
      json_extract("value", '$.updatedAt') AS "updatedAt"
    FROM json_each(?)
  )
  UPDATE "boq_lines"
  SET "aiSuggestedDescription" = "line_updates"."aiSuggestedDescription",
      "aiSuggestedSpec" = "line_updates"."aiSuggestedSpec",
      "aiReason" = "line_updates"."aiReason",
      "aiConfidence" = "line_updates"."aiConfidence",
      "standardDescription" = "line_updates"."standardDescription",
      "specification" = "line_updates"."specification",
      "updatedAt" = "line_updates"."updatedAt"
  FROM "line_updates"
  WHERE "boq_lines"."id" = "line_updates"."id"
    AND "boq_lines"."tenantId" = ?
    AND "boq_lines"."boqRevisionId" = ?
    AND "boq_lines"."isDeleted" = 0
`;

export const BOQ_REFINEMENT_REVISION_UPDATE_SQL = `
  UPDATE "boq_revisions"
  SET "preparationStatus" = 'AI_REVIEW', "updatedAt" = ?
  WHERE "id" = ? AND "tenantId" = ? AND "updatedAt" = ?
    AND changes() = ?
    AND EXISTS (
      SELECT 1 FROM "boqs" b
      WHERE b."id" = "boq_revisions"."boqId" AND b."tenantId" = "boq_revisions"."tenantId"
    )
`;

export const BOQ_REFINEMENT_AUDIT_INSERT_AFTER_UPDATE_SQL = `
  INSERT INTO "audit_logs" (
    "id", "tenantId", "userId", "projectId", "entityType", "entityId", "action",
    "description", "oldValue", "newValue", "ipAddress", "userAgent", "createdAt"
  )
  SELECT CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?,
    'BOQ_REVISION', ?, 'AI_REFINEMENT_REQUESTED', ?, NULL, NULL, NULL, NULL, ?
`;
