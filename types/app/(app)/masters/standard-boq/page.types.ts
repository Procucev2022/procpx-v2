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

/** One unique Category + Sub-category row of the master, with the items it contains. */
export interface StandardItemGroup {
  key: string;
  category: string;
  subcategory: string;
  sectors: string[];
  items: StandardItem[];
  minRate: number | null;
  maxRate: number | null;
}

/** Category, sub-category and sector used to pre-fill the create modal from a group row. */
export interface StandardItemGroupPreset {
  category: string;
  subcategory: string;
  sector: string;
}
