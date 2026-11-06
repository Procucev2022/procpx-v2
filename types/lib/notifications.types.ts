/* Shared declarations for lib/notifications.ts. */

export interface WorkflowNotificationParams {
  tenantId: string;
  vendorId?: string;
  userId?: string | null;
  targetRole?: string | null;
  title: string;
  message: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ACTION_REQUIRED';
  entityType?: 'PR' | 'RFQ' | 'QUOTE' | 'NEGOTIATION' | 'AWARD' | 'PPO' | 'RATE_CARD' | 'AUCTION';
  entityId?: string;
  recordNumber?: string;
  link?: string;
}

export type WorkflowNotificationEvent =
  | 'PR_RELEASED'
  | 'RFQ_RELEASED'
  | 'QUOTE_SUBMITTED'
  | 'COUNTER_OFFER_SENT'
  | 'REVISED_QUOTE_RECEIVED'
  | 'FINAL_RATES_LOCKED'
  | 'AWARD_RECOMMENDED'
  | 'AWARD_APPROVED'
  | 'AWARD_REJECTED'
  | 'PPO_CREATED'
  | 'ENQUIRY_SENT'
  | 'FINAL_OFFER_SUBMITTED'
  | 'COMMERCIAL_AWARD_APPROVED'
  | 'NEGOTIATION_CLOSED'
  | 'PPO_ACCEPTED_BY_VENDOR'
  | 'PPO_ISSUE_RAISED';

export interface WorkflowNotificationDetails {
  vendorName?: string;
  amount?: number;
  roundNumber?: number;
  link?: string;
  isFinalOffer?: boolean;
  decision?: string;
  acceptedAt?: Date;
  issueRemarks?: string;
}

export interface NotifyNextResponsiblePartyInput {
  tenantId: string;
  event: WorkflowNotificationEvent;
  recordNumber: string;
  entityId: string;
  actorName?: string;
  details?: WorkflowNotificationDetails;
}

export interface WorkflowNotificationPreparationOptions {
  prepareOnly?: boolean;
}
