/* Shared declarations for lib/boq-validate.ts. */

// lib/boq-validate.ts - BOQ line validation rules
export interface BoqLineInput {
  originalDescription?: string;
  standardDescription?: string;
  uomRaw?: string;
  uomId?: string;
  quantity?: number | null;
  categoryId?: string;
  lineNumber?: string;
  isDuplicate?: boolean;
  isInvalidUom?: boolean;
}

export interface ValidationMessage {
  level: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string;
}

export interface ValidationResult {
  status: 'VALID' | 'WARNING' | 'ERROR';
  messages: ValidationMessage[];
}
