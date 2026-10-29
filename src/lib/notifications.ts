// src/lib/notifications.ts - Enterprise Workflow Notification & Communication Helper
import { prisma } from './prisma';

export interface WorkflowNotificationParams {
  tenantId: string;
  userId?: string | null;
  targetRole?: string | null;
  title: string;
  message: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ACTION_REQUIRED';
  entityType?: 'PR' | 'RFQ' | 'QUOTE' | 'NEGOTIATION' | 'AWARD' | 'PPO';
  entityId?: string;
  recordNumber?: string;
  link?: string;
}

export async function createWorkflowNotification(params: WorkflowNotificationParams) {
  try {
    return await prisma.notification.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId || null,
        targetRole: params.targetRole || null,
        title: params.title,
        message: params.message,
        type: params.type || 'INFO',
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        recordNumber: params.recordNumber || null,
        link: params.link || null,
      },
    });
  } catch (err) {
    console.error('Failed to create workflow notification:', err);
    // Notification creation failure should never crash the parent transaction
    return null;
  }
}

/**
 * Notifies the next responsible actor/role in the procurement sequence
 */
export async function notifyNextResponsibleParty({
  tenantId,
  event,
  recordNumber,
  entityId,
  actorName,
  details,
}: {
  tenantId: string;
  event:
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
  recordNumber: string;
  entityId: string;
  actorName?: string;
  details?: {
    vendorName?: string;
    amount?: number;
    roundNumber?: number;
    link?: string;
    isFinalOffer?: boolean;
    decision?: string;
    acceptedAt?: Date;
    issueRemarks?: string;
  };
}) {
  switch (event) {
    case 'PR_RELEASED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `PR ${recordNumber} Ready for Sourcing`,
        message: `Approved PR ${recordNumber} has been released to Procurement. Create an RFQ or evaluate approved rate cards.`,
        type: 'ACTION_REQUIRED',
        entityType: 'PR',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/new?prId=${entityId}`,
      });

    case 'RFQ_RELEASED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `RFQ ${recordNumber} Released to Vendors`,
        message: `Sourcing package ${recordNumber} published. Quotation submissions are now open for invited vendors.`,
        type: 'INFO',
        entityType: 'RFQ',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}`,
      });

    case 'QUOTE_SUBMITTED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `New Quotation for ${recordNumber}`,
        message: `${details?.vendorName || 'A supplier'} submitted quotation (${details?.amount ? `₹${details.amount.toLocaleString()}` : 'rates recorded'}) for RFQ ${recordNumber}.`,
        type: 'INFO',
        entityType: 'QUOTE',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=rfq`,
      });

    case 'COUNTER_OFFER_SENT':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Counter-Offer Dispatched: ${recordNumber}`,
        message: `Round ${details?.roundNumber || 1} counter-offer of ₹${details?.amount?.toLocaleString() || 'negotiated total'} dispatched to ${details?.vendorName || 'vendor'}.`,
        type: 'INFO',
        entityType: 'NEGOTIATION',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=negotiation`,
      });

    case 'REVISED_QUOTE_RECEIVED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Revised Quote Received: ${recordNumber}`,
        message: `${details?.vendorName || 'Vendor'} submitted revised quotation for ${recordNumber} following negotiation.`,
        type: 'ACTION_REQUIRED',
        entityType: 'QUOTE',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=negotiation`,
      });

    case 'FINAL_RATES_LOCKED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Commercial Rates Locked: ${recordNumber}`,
        message: `Commercial rates finalized at ₹${details?.amount?.toLocaleString() || 'agreed amount'}. Ready to prepare award recommendation.`,
        type: 'ACTION_REQUIRED',
        entityType: 'RFQ',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=awarding`,
      });

    case 'AWARD_RECOMMENDED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'FINANCE_USER',
        title: `Award Sign-off Required: ${recordNumber}`,
        message: `Award recommendation of ₹${details?.amount?.toLocaleString() || 'amount'} for ${details?.vendorName || 'selected vendor'} submitted for Finance approval.`,
        type: 'ACTION_REQUIRED',
        entityType: 'AWARD',
        entityId,
        recordNumber,
        link: `/procurement/awards`,
      });

    case 'AWARD_APPROVED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Award Approved for ${recordNumber}`,
        message: `Finance approved commercial award for ${details?.vendorName || 'vendor'}. You may now issue the PPO contract.`,
        type: 'ACTION_REQUIRED',
        entityType: 'AWARD',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=awarding`,
      });

    case 'AWARD_REJECTED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Award Returned: ${recordNumber}`,
        message: `Award recommendation for ${recordNumber} was rejected/returned by Finance for review.`,
        type: 'WARNING',
        entityType: 'AWARD',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=awarding`,
      });

    case 'PPO_CREATED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'FINANCE_USER',
        title: `PPO ${recordNumber} Generated`,
        message: `Procurement order ${recordNumber} created for ₹${details?.amount?.toLocaleString() || 'order value'} (${details?.vendorName || 'vendor'}).`,
        type: 'SUCCESS',
        entityType: 'PPO',
        entityId,
        recordNumber,
        link: `/procurement/ppos`,
      });

    case 'ENQUIRY_SENT':
      return createWorkflowNotification({
        tenantId,
        title: `Clarification Enquiry on ${recordNumber}`,
        message: `${actorName || 'User'} sent a message/enquiry on ${recordNumber}.`,
        type: 'INFO',
        entityType: 'RFQ',
        entityId,
        recordNumber,
        link: details?.link || `/procurement/rfqs/${entityId}`,
      });

    case 'FINAL_OFFER_SUBMITTED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Binding Final Offer on ${recordNumber}`,
        message: `${details?.vendorName || 'Vendor'} submitted a binding final offer of ₹${details?.amount?.toLocaleString() || 'amount'}. Buyer decision pending.`,
        type: 'ACTION_REQUIRED',
        entityType: 'NEGOTIATION',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=negotiation`,
      });

    case 'COMMERCIAL_AWARD_APPROVED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Offer Accepted for ${recordNumber}`,
        message: `Vendor quote from ${details?.vendorName || 'vendor'} of ₹${details?.amount?.toLocaleString() || 'amount'} was accepted. PPO generation awaited.`,
        type: 'SUCCESS',
        entityType: 'NEGOTIATION',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=awarding`,
      });

    case 'NEGOTIATION_CLOSED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Negotiation Concluded for ${recordNumber}`,
        message: `Negotiation with ${details?.vendorName || 'vendor'} was closed.`,
        type: 'INFO',
        entityType: 'NEGOTIATION',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=negotiation`,
      });

    case 'PPO_ACCEPTED_BY_VENDOR':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `PPO ${recordNumber} Accepted by Vendor`,
        message: `${details?.vendorName || 'Vendor'} (${actorName || 'Signatory'}) formally accepted PPO ${recordNumber}. Order execution commenced.`,
        type: 'SUCCESS',
        entityType: 'PPO',
        entityId,
        recordNumber,
        link: `/procurement/ppos`,
      });

    case 'PPO_ISSUE_RAISED':
      return createWorkflowNotification({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: `Issue Raised on PPO ${recordNumber}`,
        message: `${details?.vendorName || 'Vendor'} reported clarification/issue: "${details?.issueRemarks || 'Issue reported'}". PPO acceptance on hold.`,
        type: 'WARNING',
        entityType: 'PPO',
        entityId,
        recordNumber,
        link: `/procurement/ppos`,
      });
  }
}

