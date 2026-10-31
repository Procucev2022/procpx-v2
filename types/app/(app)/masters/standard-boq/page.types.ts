/* Shared declarations for app/(app)/masters/standard-boq/page.tsx. */

export interface StandardItem {
  id: string;
  itemCode: string;
  sector: string;
  projectType: string;
  category: string;
  subcategory: string;
  standardDescription: string;
  detailedSpecification: string;
  uom: string;
  brandMake: string | null;
  benchmarkRate: number | null;
  isActive: boolean;
  createdAt: string;
}
