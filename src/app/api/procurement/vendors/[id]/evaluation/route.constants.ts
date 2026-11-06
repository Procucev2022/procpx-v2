export const VENDOR_QUALIFICATION_STATUSES = ['QUALIFIED', 'CONDITIONALLY_QUALIFIED', 'NOT_QUALIFIED'] as const;
export const VENDOR_QUALIFICATION_DECISIONS = ['RECOMMENDED', 'CONDITIONAL', 'NOT_RECOMMENDED'] as const;
export const VENDOR_EVALUATION_SCORE_WEIGHTS = {
  businessProfile: 0.15,
  financialStrength: 0.2,
  previousClients: 0.2,
  references: 0.15,
  technicalCapability: 0.2,
  complianceRisk: 0.1,
} as const;
export const MAX_VENDOR_DECISION_REMARKS_LENGTH = 4_000;
export const MAX_VENDOR_CRITERIA_DETAILS_BYTES = 40_000;
export const VENDOR_EVALUATION_FAILED_EVENT = 'vendor.evaluation_submit_failed';
export const VENDOR_EVALUATION_RECOVERED_EVENT = 'vendor.evaluation_submit_result_recovered';
