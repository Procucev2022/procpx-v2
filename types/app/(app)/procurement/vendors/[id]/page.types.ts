/* Shared declarations for app/(app)/procurement/vendors/[id]/page.tsx. */

export interface VendorData {
  id: string;
  code: string;
  name: string;
  vendorType: 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR';
  onboardingStatus: string;
  qualificationStatus: string;
  qualificationScore: number | null;
  qualificationDecision: string | null;
  performanceScore: number | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  categories: string | null;
  operatingLocation: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  legalStructure: string | null;
  gstin: string | null;
  pan: string | null;
  website: string | null;
  address: string | null;
  experienceYears: number | null;
  turnoverCrores: number | null;
  capabilities: string | null;
  serviceCoverage: string | null;
  clientReferences: string | null;
  certifications: string | null;
  documents: string | null;
  status: string;
  createdAt: string;
  evaluations: any[];
  ppoRatings: any[];
  ppos: any[];
}

export interface PerformanceSummary {
  ppoRatingsCount: number;
  averagePpoRating: number | null;
  avgQuality: number | null;
  avgDelivery: number | null;
  avgCommercial: number | null;
  avgResponsiveness: number | null;
  avgDocumentation: number | null;
  mostRecentRating: any | null;
}
