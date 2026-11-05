export interface DrawingDraftLine {
  description: string;
  specification?: string;
  category?: string;
  uom?: string;
  quantity?: number | string | null;
  quantityType?: 'EXPLICIT' | 'CALCULATED' | 'UNCERTAIN';
  uncertainReason?: string;
  confidence?: number;
  drawingReference?: string;
  mark?: string;
  location?: string;
  sheet?: string;
}

export interface DrawingDraftRequest {
  projectId?: string;
  costCentreId?: string;
  drawingNumber?: string;
  fileName?: string;
  savedDocumentId?: string;
  fileSize?: number | string;
  title?: string;
  description?: string;
  purpose?: string;
  lines?: DrawingDraftLine[];
}

export type PreparedDrawingBoqLine = {
  lineNumber: string;
  description: string;
  specification: string | null;
  categoryId: string | null;
  uomId: string | null;
  uomRaw: string;
  quantity: number | null;
  location: string | null;
  drawingReference: string | null;
  sourceSheet: string;
  sourceReference: string;
  confidence: number;
  aiReason: string | null;
  status: string;
  validationMessages: Array<{ level: string; code: string; message: string }>;
};
