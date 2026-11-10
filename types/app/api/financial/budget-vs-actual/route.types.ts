export type BudgetVsActualLineSource = {
  id: string;
  quantity: number | null;
  aiUnitCost: number | null;
  aiTotalCost: number | null;
  lineNumber?: string;
  itemCode?: string | null;
  originalDescription?: string;
  specification?: string | null;
  aiSuggestedSpec?: string | null;
  subcategoryId?: string | null;
  uomRaw?: string | null;
  category?: { name: string } | null;
  revision?: {
    revisionCode?: string | null;
    boq?: { boqCode: string } | null;
    costCentre?: {
      id: string;
      code: string;
      name: string;
      areaSqFt: number | null;
    } | null;
  } | null;
};

export type BudgetVsActualSummaryGroup = {
  costCentreId: string | null;
  category: string;
  budgetAmount: number | bigint | null;
  committedAmount: number | bigint | null;
  actualAmount: number | bigint | null;
};

export type BudgetVsActualCostCentreSummary = {
  id: string;
  code: string;
  name: string;
  areaSqFt: number;
  budgetAmount: number;
  committedAmount: number;
  actualAmount: number;
  budgetVariance: number;
  costPerSqFtBudget: number;
  costPerSqFtActual: number;
};

export type BudgetVsActualCategorySummary = {
  category: string;
  budgetAmount: number;
  committedAmount: number;
  actualAmount: number;
  budgetVariance: number;
  variancePercent: number;
};
