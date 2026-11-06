export interface BoqRevisionCopyLine {
  id: string;
  lineNumber: string;
  originalDescription: string;
  standardDescription: string | null;
  specification: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  uomId: string | null;
  uomRaw: string | null;
  quantity: number | null;
  location: string | null;
  drawingReference: string | null;
  brand: string | null;
  model: string | null;
  material: string | null;
  grade: string | null;
  remarks: string | null;
  itemCode: string | null;
  validationStatus: string;
  validationMessages: string | null;
  benchmarkEligible: boolean;
  createdAt: string;
  updatedAt: string;
}
