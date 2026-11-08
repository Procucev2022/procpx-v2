import { Prisma } from '@prisma/client';
import type { BoqLineSummary, BoqLineSummaryQueryRow } from '@app-types/lib/boq-line-summary.types';

type QueryRaw = <T = unknown>(query: Prisma.Sql) => Promise<T>;

function toNumber(value: number | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getBoqLineSummary(
  queryRaw: QueryRaw,
  revisionId: string,
  tenantId: string,
): Promise<BoqLineSummary> {
  const rows = await queryRaw<BoqLineSummaryQueryRow[]>(Prisma.sql`
    WITH line_costs AS (
      SELECT
        l."quantity" AS quantity,
        l."aiUnitCost" AS aiUnitCost,
        l."validationStatus" AS validationStatus,
        c."name" AS categoryName,
        CASE
          WHEN l."quantity" > 0 AND l."aiUnitCost" > 0
          THEN COALESCE(l."aiTotalCost", l."aiUnitCost" * l."quantity")
          ELSE 0
        END AS estimatedCost
      FROM "boq_lines" l
      LEFT JOIN "categories" c
        ON c."id" = l."categoryId" AND c."tenantId" = l."tenantId"
      WHERE l."boqRevisionId" = ${revisionId}
        AND l."tenantId" = ${tenantId}
        AND l."isDeleted" = 0
    )
    SELECT
      COUNT(*) AS totalLines,
      COALESCE(SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END), 0) AS validQuantityLines,
      COALESCE(SUM(CASE WHEN quantity IS NULL OR quantity <= 0 THEN 1 ELSE 0 END), 0) AS missingQuantityLines,
      COALESCE(SUM(CASE WHEN aiUnitCost IS NULL OR aiUnitCost <= 0 THEN 1 ELSE 0 END), 0) AS missingRateLines,
      COALESCE(SUM(CASE WHEN validationStatus IN ('ERROR', 'QUANTITY_REQUIRED') THEN 1 ELSE 0 END), 0) AS validationErrorLines,
      COALESCE(SUM(CASE WHEN quantity > 0 AND aiUnitCost > 0 THEN 1 ELSE 0 END), 0) AS estimatedLineCount,
      COALESCE(SUM(estimatedCost), 0) AS totalAiEstimate,
      COALESCE(SUM(CASE WHEN LOWER(categoryName) LIKE '%electrical%' THEN estimatedCost ELSE 0 END), 0) AS electricalTotal,
      COALESCE(SUM(CASE WHEN LOWER(categoryName) NOT LIKE '%electrical%' AND LOWER(categoryName) LIKE '%civil%' THEN estimatedCost ELSE 0 END), 0) AS civilTotal,
      COALESCE(SUM(CASE WHEN LOWER(categoryName) NOT LIKE '%electrical%' AND LOWER(categoryName) NOT LIKE '%civil%' AND LOWER(categoryName) LIKE '%interior%' THEN estimatedCost ELSE 0 END), 0) AS interiorTotal,
      COALESCE(SUM(CASE WHEN LOWER(categoryName) NOT LIKE '%electrical%' AND LOWER(categoryName) NOT LIKE '%civil%' AND LOWER(categoryName) NOT LIKE '%interior%' AND LOWER(categoryName) LIKE '%material%' THEN estimatedCost ELSE 0 END), 0) AS materialTotal,
      COALESCE(SUM(CASE WHEN categoryName IS NULL OR (
        LOWER(categoryName) NOT LIKE '%electrical%' AND
        LOWER(categoryName) NOT LIKE '%civil%' AND
        LOWER(categoryName) NOT LIKE '%interior%' AND
        LOWER(categoryName) NOT LIKE '%material%'
      ) THEN estimatedCost ELSE 0 END), 0) AS otherTotal
    FROM line_costs
  `);

  const row = rows[0] ?? {};
  return {
    totalLines: toNumber(row.totalLines),
    validQuantityLines: toNumber(row.validQuantityLines),
    missingQuantityLines: toNumber(row.missingQuantityLines),
    missingRateLines: toNumber(row.missingRateLines),
    validationErrorLines: toNumber(row.validationErrorLines),
    estimatedLineCount: toNumber(row.estimatedLineCount),
    totalAiEstimate: Math.round(toNumber(row.totalAiEstimate) * 100) / 100,
    categoryTotals: {
      Material: Math.round(toNumber(row.materialTotal) * 100) / 100,
      Electrical: Math.round(toNumber(row.electricalTotal) * 100) / 100,
      Civil: Math.round(toNumber(row.civilTotal) * 100) / 100,
      Interior: Math.round(toNumber(row.interiorTotal) * 100) / 100,
      Other: Math.round(toNumber(row.otherTotal) * 100) / 100,
    },
  };
}
