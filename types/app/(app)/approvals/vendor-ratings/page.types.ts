/* Shared declarations for app/(app)/approvals/vendor-ratings/page.tsx. */

export interface VendorRatingItem {
  id: string;
  tenantId: string;
  vendorId: string;
  ppoId: string;
  projectId?: string | null;
  costCentreId?: string | null;
  qualityScore: number;
  deliveryScore: number;
  commercialComplianceScore: number;
  responsivenessScore: number;
  documentationClosureScore: number;
  overallScore: number;
  comments?: string | null;
  status: string;
  ratedBy: string;
  ratedByName?: string;
  ratedAt: string;
  createdAt: string;
  updatedAt: string;
  qualityComments?: string;
  deliveryComments?: string;
  commercialComments?: string;
  documentationComments?: string;
  responsivenessComments?: string;
  overallImprovement?: string;
  approverComments?: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  returnReason?: string | null;
  decisionHistory?: any[];
  vendor?: {
    id: string;
    code: string;
    name: string;
    vendorType: string;
    categories?: string;
    performanceScore?: number | null;
  };
  ppo?: {
    id: string;
    ppoNumber: string;
    title: string;
    totalValue: number;
    status: string;
    completedAt?: string | null;
    project?: { id: string; name: string; projectCode: string } | null;
    costCentre?: { id: string; name: string; code: string } | null;
  };
}
