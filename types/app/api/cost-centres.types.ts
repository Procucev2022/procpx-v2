export interface CostCentrePagePagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CostCentrePageSummary {
  totalAreaSqFt: number;
  totalBudget: number;
  approvedBudget: number;
  pendingBudget: number;
}

export interface CostCentrePageRow {
  id: string;
  projectId: string;
  code: string;
  costCentreCode?: string;
  name: string;
  description: string | null;
  areaSqFt: number | null;
  location: string | null;
  floorZone: string | null;
  status: string;
  project: { id: string; projectCode: string; name: string } | null;
  totalBudget: number;
  approvedBudget: number;
  pendingBudget: number;
  ratePerSqFt: number | null;
}

export interface CostCentreLookupOption {
  id: string;
  projectId: string;
  code: string;
  costCentreCode?: string;
  name: string;
  description: string | null;
  areaSqFt: number | null;
  location: string | null;
  floorZone: string | null;
  status: string;
  project: { id: string; projectCode: string; name: string; areaSqFt?: number | null } | null;
  totalBudget?: number;
  approvedBudget?: number;
  pendingBudget?: number;
  ratePerSqFt?: number | null;
}

export interface CostCentreLookupPage {
  costCentres?: CostCentreLookupOption[];
  pagination?: Partial<CostCentrePagePagination>;
}

export type CostCentreLookupPayload = CostCentreLookupOption[] | CostCentreLookupPage;

export interface CostCentreLookupApiResponse {
  data?: CostCentreLookupPayload;
  costCentres?: CostCentreLookupOption[];
  pagination?: Partial<CostCentrePagePagination>;
}
