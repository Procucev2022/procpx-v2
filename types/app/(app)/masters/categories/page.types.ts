/* Shared declarations for app/(app)/masters/categories/page.tsx. */

export interface CategoryItem {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  level: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  parent?: { id: string; name: string } | null;
  children?: CategoryItem[];
}
