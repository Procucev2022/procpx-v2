export const PROJECT_DOCUMENT_CATEGORY_VALUES = ['ORIGINAL_BOQ', 'DRAWING', 'SPECIFICATION', 'OTHER'] as const;
export const PROJECT_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const PROJECT_DOCUMENT_ACCEPT_ATTRIBUTE = '.pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx';

export const PROJECT_DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
