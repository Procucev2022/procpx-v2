// types/app/vendor-pipeline/page.types.ts
// Type definitions for the Vendor Sourcing & Order Fulfillment Pipeline Dashboard

export type VendorPipelineFilterId =
  | 'NEW_RFQS'
  | 'QUOTATIONS_DUE_SOON'
  | 'QUOTES_SUBMITTED'
  | 'NEGOTIATIONS_PENDING'
  | 'FINAL_OFFERS_SUBMITTED'
  | 'ACCEPTED_PPO_AWAITED'
  | 'PPOS_AWAITING_ACCEPTANCE'
  | 'ACCEPTED_PPOS';

export interface VendorPipelineStatCard {
  id: VendorPipelineFilterId;
  label: string;
  count: number;
  subtitle: string;
  icon: 'clock' | 'warning' | 'file' | 'message' | 'sparkles' | 'alertCircle' | 'checkCircle';
  colorScheme: 'slate' | 'amber' | 'blue' | 'indigo' | 'purple' | 'emerald';
  highlightBorder?: boolean;
}

export interface VendorPipelineRfqRow {
  id: string;
  receivedDate: string;
  reference: string;
  rfqSubject: string;
  project: string;
  package: string;
  buyer: string;
  deadline: string;
  isDeadlineRed: boolean;
  commercialSummaryType: 'PENDING_QUOTE' | 'COUNTER_OFFER' | 'AMOUNT';
  commercialSummaryText?: string;
  commercialAmount?: string;
  counterAmount?: string;
  quoteStatus: string;
  quoteStatusType: 'PENDING_SUBMISSION' | 'AWAITING_REVISED_QUOTE' | 'SUBMITTED' | 'ORDER_ACTIVE' | 'PPO_AWAITING';
  responsibleParty: string;
  action: string;
  categories: VendorPipelineFilterId[];
}

export interface SidebarMenuItem {
  id: string;
  label: string;
  href: string;
  icon: 'dashboard' | 'profile' | 'rfqs' | 'quotations' | 'orders' | 'cards';
  active?: boolean;
}
