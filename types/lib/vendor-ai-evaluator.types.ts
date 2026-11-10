/* Shared declarations for lib/vendor-ai-evaluator.ts. */

// src/lib/vendor-ai-evaluator.ts
// Structured & Evidence-Based AI Vendor Evaluation Engine

export interface VendorEvaluationInput {
  id: string;
  code: string;
  name: string;
  vendorType: string; // CLIENT_VENDOR | PROCUCEV_VENDOR
  contactPerson?: string | null;
  email: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  legalStructure?: string | null;
  gstin?: string | null;
  pan?: string | null;
  website?: string | null;
  address?: string | null;
  operatingLocation?: string | null;
  experienceYears?: number | null;
  turnoverCrores?: number | null;
  categories?: string | null;
  capabilities?: string | null;
  serviceCoverage?: string | null;
  clientReferences?: string | null;
  certifications?: string | null;
  complianceStatus?: string | null;
  empanelmentStatus?: string | null;
  isBlacklisted?: boolean;
  documents?: string | null;
}

export interface VendorEvaluationInputDataIssue {
  fieldName: 'documents' | 'clientReferences';
  reason: 'invalid_json' | 'invalid_shape';
  fallback: 'empty_array' | 'legacy_text' | 'filtered_invalid_entries';
  invalidEntryCount?: number;
}

export interface VendorEvaluationOptions {
  onInputDataIssue?: (issue: VendorEvaluationInputDataIssue) => void;
}

export interface CriterionEvaluation {
  id: string;
  name: string;
  weight: number; // percentage, e.g. 15
  suggestedScore: number; // 0 - 100
  humanScore?: number;
  isNotApplicable?: boolean;
  evidenceFound: string[];
  verificationGaps: string[];
  rationale: string;
  sourceReferences: string[];
}

export interface AiEvaluationReport {
  overallWeightedScore: number;
  qualificationOutcome: 'RECOMMENDED' | 'CONDITIONAL' | 'NOT_RECOMMENDED';
  criteria: Record<string, CriterionEvaluation>;
  strengths: string[];
  weaknesses: string[];
  verificationGaps: string[];
  criticalRiskFlags: string[];
  contradictions: string[];
  evaluatedAt: string;
}
