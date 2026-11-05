export interface VendorEvaluationPersistenceInput {
  audit: {
    action: string;
    createdAt: Date;
    description: string;
    id: string;
    newValue: Record<string, unknown>;
    oldValue: Record<string, unknown>;
    userId: string;
    userAgent: string | null;
  };
  evaluation: Record<string, unknown>;
  expectedVendorUpdatedAt: Date;
  requiresVendorUpdate: boolean;
  tenantId: string;
  vendorId: string;
  vendorUpdate: {
    empanelmentStatus: string;
    evaluatedAt: Date | null;
    evaluatedById: string | null;
    qualificationDecision: string;
    qualificationScore: number;
    qualificationStatus: string;
    updatedAt: Date;
  };
}
