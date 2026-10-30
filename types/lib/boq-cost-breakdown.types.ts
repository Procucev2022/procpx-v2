/* Shared declarations for lib/boq-cost-breakdown.ts. */

// src/lib/boq-cost-breakdown.ts - AI Cost Breakdown Calculation & Reconciliation
export interface LineCostBreakdown {
  materialCost: number;
  materialPercent: number;
  labourCost: number;
  labourPercent: number;
  otherCharges: number;
  otherChargesPercent: number;
  contractorMargin: number;
  contractorMarginPercent: number;
  totalAiUnitCost: number;
  aiUnitCost: number;
  aiLineTotal: number | null;
  basis: string;
  engineeringBasis: string;
  isEstimate: boolean;
  reconciled: boolean;
}
