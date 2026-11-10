import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CATEGORY_PREVIEW_LIMIT, CATEGORY_PREVIEW_SOURCES } from './category-preview.constants';
import type { CategoryPreview, CategoryPreviewQuery, CategoryPreviewRow } from '@app-types/lib/category-preview.types';
import { readByD1FilterChunks } from './d1-query';

function mapCategoryPreviewRows(rows: CategoryPreviewRow[]) {
  const previews = new Map<string, CategoryPreview>();
  for (const row of rows) {
    const preview = previews.get(row.entityId) || { categories: [], total: Number(row.categoryCount) };
    preview.categories.push(row.category);
    previews.set(row.entityId, preview);
  }
  return previews;
}

export async function getCategoryPreviews(input: CategoryPreviewQuery) {
  if (input.entityIds.length === 0) return new Map<string, CategoryPreview>();

  const source = CATEGORY_PREVIEW_SOURCES[input.source];
  const tableName = Prisma.raw(`"${source.table}"`);
  const entityColumn = Prisma.raw(`"${source.entityColumn}"`);
  const rows = await readByD1FilterChunks(input.entityIds, (entityIds) => prisma.$queryRaw<CategoryPreviewRow[]>(Prisma.sql`
    WITH distinct_categories AS (
      SELECT DISTINCT ${entityColumn} AS "entityId", "category"
      FROM ${tableName}
      WHERE "tenantId" = ${input.tenantId}
        AND ${entityColumn} IN (${Prisma.join(entityIds)})
        AND "category" IS NOT NULL AND TRIM("category") <> ''
    ), ranked_categories AS (
      SELECT "entityId", "category",
        ROW_NUMBER() OVER (PARTITION BY "entityId" ORDER BY "category" COLLATE NOCASE, "category") AS "categoryRank",
        COUNT(*) OVER (PARTITION BY "entityId") AS "categoryCount"
      FROM distinct_categories
    )
    SELECT "entityId", "category", "categoryCount"
    FROM ranked_categories
    WHERE "categoryRank" <= ${CATEGORY_PREVIEW_LIMIT}
    ORDER BY "entityId" ASC, "categoryRank" ASC
  `));
  return mapCategoryPreviewRows(rows);
}
