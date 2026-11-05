export type StandardBoqLineInput = Record<string, unknown>;

export type StandardBoqGenerationBody = {
  projectId?: unknown;
  costCentreId?: unknown;
  sector?: unknown;
  projectType?: unknown;
  validLines?: unknown;
  fileName?: unknown;
  boqId?: unknown;
  title?: unknown;
  description?: unknown;
  purpose?: unknown;
  category?: unknown;
  scope?: unknown;
};

export type StandardBoqPreparedLine = {
  id: string;
  lineNumber: string;
  itemCode: string;
  originalDescription: string;
  standardDescription: string;
  specification: string;
  aiSuggestedDescription: string;
  aiConfidence: number;
  aiUnitCost: number | null;
  aiTotalCost: number | null;
  costConfidence: number;
  costSource: string;
  costMethod: string;
  categoryId: string | null;
  uomId: string | null;
  uomRaw: string;
  quantity: number | null;
  brand: string | null;
  model: string | null;
  location: string | null;
  drawingReference: string | null;
  remarks: string | null;
  validationStatus: string;
  validationMessages: string;
  benchmarkEligible: number;
  createdAt: string;
  updatedAt: string;
};
