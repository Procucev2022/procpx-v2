/* Shared declarations for lib/boq-revision-utils.ts. */

export interface CreateRevisionData {
  boqId: string;
  tenantId: string;
  createdById: string;
  costCentreId?: string | null;
  status?: string;
  preparationStatus?: string;
  budgetStatus?: string;
  prStatus?: string;
  sourceType?: string;
  sourceFile?: string | null;
  sourceReference?: string | null;
  sourceConfidence?: number | null;
  originalFileName?: string | null;
  originalFilePath?: string | null;
  originalFileSize?: number | null;
  originalFileHash?: string | null;
  uploadedAt?: Date | null;
  columnMapping?: string | null;
  notes?: string | null;
  totalLines?: number;
  validLines?: number;
  errorLines?: number;
  warningLines?: number;
  qualityScore?: number | null;
}
