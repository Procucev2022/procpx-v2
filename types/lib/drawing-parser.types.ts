/* Shared declarations for lib/drawing-parser.ts. */

export interface ExtractedDrawingItem {
  lineNumber: string;
  mark?: string;
  description: string;
  specification: string;
  category: string;
  subCategory?: string;
  uom: string;
  quantity: number | null;
  quantityType: 'EXPLICIT' | 'CALCULATED' | 'UNCERTAIN';
  uncertainReason?: string;
  location?: string;
  confidence: number;
  drawingReference?: string;
  sheet?: string;
}

export interface DrawingParseResult {
  success: boolean;
  parserUsed: 'NATIVE_PDF_SCHEDULE' | 'AI_GEMINI_VISION' | 'AI_OPENAI_VISION';
  providerMessage?: string;
  drawingReference?: string;
  totalDetected: number;
  explicitCount: number;
  uncertainCount: number;
  items: ExtractedDrawingItem[];
  warnings: string[];
}
