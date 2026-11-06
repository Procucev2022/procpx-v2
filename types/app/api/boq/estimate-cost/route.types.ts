export interface BoqCostEstimateRate {
  rate: number;
  source: string;
  conf: number;
  category: string;
}

export interface BoqCostEstimateUpdate {
  id: string;
  aiUnitCost: number;
  aiTotalCost: number | null;
  aiReason: string;
  costConfidence: number;
  costSource: string;
  costMethod: string;
  costDate: string;
  geography: string;
  validationStatus: string;
  updatedAt: string;
}

export interface BoqCostEstimateCategoryTotals {
  Material: number;
  Electrical: number;
  Civil: number;
  Interior: number;
  Other: number;
}
