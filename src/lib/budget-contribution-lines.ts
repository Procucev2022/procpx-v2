import { Prisma } from '@prisma/client';
import type {
  BudgetContributionLineAggregate,
  BudgetContributionLineAggregateRow,
} from '@app-types/lib/budget-contribution-lines.types';
import { MAX_D1_BATCH_STATEMENTS } from './d1-batch.constants';

type QueryRaw = (query: Prisma.Sql) => Promise<BudgetContributionLineAggregateRow[]>;

function toNumber(value: number | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getBudgetContributionLineAggregate(
  queryRaw: QueryRaw,
  revisionId: string,
  tenantId: string,
  generalCategoryLabel: string,
): Promise<BudgetContributionLineAggregate> {
  const rows = await queryRaw(Prisma.sql`
    WITH line_data AS (
      SELECT
        l."id" AS id,
        l."lineNumber" AS lineNumber,
        l."quantity" AS quantity,
        COALESCE(NULLIF(category."name", ''), ${generalCategoryLabel}) AS categoryName,
        CASE
          WHEN l."aiTotalCost" IS NOT NULL AND l."aiTotalCost" <> 0 THEN l."aiTotalCost"
          ELSE ROUND(COALESCE(NULLIF(l."aiUnitCost", 0), 100) * l."quantity" * 100) / 100
        END AS lineCost
      FROM "boq_lines" l
      LEFT JOIN "categories" category
        ON category."id" = l."categoryId" AND category."tenantId" = l."tenantId"
      WHERE l."boqRevisionId" = ${revisionId}
        AND l."tenantId" = ${tenantId}
        AND l."isDeleted" = 0
    ), line_stats AS (
      SELECT
        COUNT(*) AS totalLines,
        COALESCE(SUM(CASE WHEN quantity IS NULL OR quantity <= 0 THEN 1 ELSE 0 END), 0) AS missingQuantityLines,
        COALESCE(SUM(CASE WHEN quantity > 0 AND (
          lineCost IS NULL OR lineCost < 0 OR ABS(lineCost) > 1.0e308
        ) THEN 1 ELSE 0 END), 0) AS invalidCostLines,
        COALESCE(SUM(lineCost), 0) AS totalEstimated
      FROM line_data
    ), ordered_lines AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY categoryName ORDER BY lineNumber, id) AS categoryPosition
      FROM line_data
    ), category_totals AS (
      SELECT
        categoryName,
        SUM(lineCost) AS categoryAmount,
        SUM(quantity) AS categoryQuantity,
        MAX(CASE WHEN categoryPosition = 1 THEN id END) AS firstLineId
      FROM ordered_lines
      GROUP BY categoryName
    )
    SELECT
      category_totals.categoryName,
      category_totals.categoryAmount,
      category_totals.categoryQuantity,
      category_totals.firstLineId,
      line_stats.totalLines,
      line_stats.missingQuantityLines,
      line_stats.invalidCostLines,
      line_stats.totalEstimated
    FROM category_totals CROSS JOIN line_stats
    ORDER BY category_totals.categoryName
    LIMIT ${MAX_D1_BATCH_STATEMENTS + 1}
  `);

  const first = rows[0];
  if (!first) {
    return { totalLines: 0, missingQuantityLines: 0, invalidCostLines: 0, totalEstimated: 0, categories: [] };
  }

  return {
    totalLines: toNumber(first.totalLines),
    missingQuantityLines: toNumber(first.missingQuantityLines),
    invalidCostLines: toNumber(first.invalidCostLines),
    totalEstimated: toNumber(first.totalEstimated),
    categories: rows.map((row) => ({
      categoryName: typeof row.categoryName === 'string' ? row.categoryName : generalCategoryLabel,
      amount: toNumber(row.categoryAmount),
      quantity: toNumber(row.categoryQuantity),
      firstLineId: typeof row.firstLineId === 'string' ? row.firstLineId : null,
    })),
  };
}
