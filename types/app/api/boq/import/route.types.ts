/* Shared declarations for app/api/boq/import/route.ts. */

export interface ColumnMapping {
  lineNumber?: string;
  description: string;
  specification?: string;
  uom: string;
  quantity: string;
  location?: string;
  drawingReference?: string;
  brand?: string;
  model?: string;
  material?: string;
  grade?: string;
  remarks?: string;
}
