/* Shared declarations for app/(app)/boq/page.tsx. */

export interface BoqSummary {
  id: string;
  projectId: string;
  boqCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    projectCode: string;
    name: string;
    sector: string;
    status: string;
  };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    status: string;
    totalLines: number;
    validLines: number;
    errorLines: number;
    warningLines: number;
    qualityScore: number | null;
    submittedAt: string | null;
    approvedAt: string | null;
    createdAt: string;
  }>;
}
