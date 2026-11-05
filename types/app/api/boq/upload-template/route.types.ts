export type TemplateValidationMessage = {
  level: 'ERROR' | 'WARNING';
  code: string;
  message: string;
};

export type TemplateBoqLine = {
  lineNumber: string;
  itemCode: string | null;
  originalDescription: string;
  standardDescription: string;
  specification: string | null;
  categoryId: string | null;
  uomId: string | null;
  uomRaw: string;
  quantity: number | null;
  brand: string | null;
  location: string | null;
  remarks: string | null;
  drawingReference: string | null;
  sourceSheet: string;
  sourceRow: number;
  validationStatus: string;
  validationMessages: TemplateValidationMessage[];
};

export type TemplateBoqException = {
  line: string;
  description: string;
  errors: TemplateValidationMessage[];
};
