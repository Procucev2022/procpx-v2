import type { CATEGORY_PREVIEW_SOURCES } from '@/lib/category-preview.constants';

export type CategoryPreviewSource = keyof typeof CATEGORY_PREVIEW_SOURCES;

export type CategoryPreviewRow = {
  entityId: string;
  category: string;
  categoryCount: number | bigint;
};

export type CategoryPreview = {
  categories: string[];
  total: number;
};

export type CategoryPreviewQuery = {
  tenantId: string;
  entityIds: string[];
  source: CategoryPreviewSource;
};
