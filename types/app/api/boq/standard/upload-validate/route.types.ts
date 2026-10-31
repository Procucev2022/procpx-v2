/* Shared declarations for app/api/boq/standard/upload-validate/route.ts. */

export interface ValidationIssue {
  rowNumber: number;
  itemCode: string;
  description: string;
  issue: string;
  action: string;
  severity: 'ERROR' | 'WARNING';
}
