// src/lib/notifications.ts - Enterprise Workflow Notification & Communication Helper
import { prisma } from './prisma';
import type { WorkflowNotificationParams } from "@app-types/lib/notifications.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { WorkflowNotificationParams };


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
        title: interpolateUiString(UI_STRINGS.libNotifications.pRRecordNumberReadyForSourcing, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.approvedPRRecordNumberHasBeenReleasedToProcurementCreateAnRFQOrEvaluateApprovedRateCards, { "recordNumber": recordNumber }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.rFQRecordNumberReleasedToVendors, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.sourcingPackageRecordNumberPublishedQuotationSubmissionsAreNowOpenForInvitedVendors, { "recordNumber": recordNumber }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.newQuotationForRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1SubmittedQuotationValue2ForRFQRecordNumber, { "value1": details?.vendorName || 'A supplier', "value2": details?.amount ? `₹${details.amount.toLocaleString()}` : 'rates recorded', "recordNumber": recordNumber }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.counterOfferDispatchedRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.roundValue1CounterOfferOfValue2DispatchedToValue3, { "value1": details?.roundNumber || 1, "value2": details?.amount?.toLocaleString() || 'negotiated total', "value3": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.revisedQuoteReceivedRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1SubmittedRevisedQuotationForRecordNumberFollowingNegotiation, { "value1": details?.vendorName || UI_STRINGS.common.vendor, "recordNumber": recordNumber }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.commercialRatesLockedRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.commercialRatesFinalizedAtValue1ReadyToPrepareAwardRecommendation, { "value1": details?.amount?.toLocaleString() || 'agreed amount' }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.awardSignOffRequiredRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.awardRecommendationOfValue1ForValue2SubmittedForFinanceApproval, { "value1": details?.amount?.toLocaleString() || 'amount', "value2": details?.vendorName || 'selected vendor' }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.awardApprovedForRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.financeApprovedCommercialAwardForValue1YouMayNowIssueThePPOContract, { "value1": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.awardReturnedRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.awardRecommendationForRecordNumberWasRejectedReturnedByFinanceForReview, { "recordNumber": recordNumber }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.pPORecordNumberGenerated, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.procurementOrderRecordNumberCreatedForValue2Value3, { "recordNumber": recordNumber, "value2": details?.amount?.toLocaleString() || 'order value', "value3": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor }),
        type: 'SUCCESS',
        entityType: 'PPO',
        entityId,
        recordNumber,
        link: `/procurement/ppos`,
      });

    case 'ENQUIRY_SENT':
      return createWorkflowNotification({
        tenantId,
        title: interpolateUiString(UI_STRINGS.libNotifications.clarificationEnquiryOnRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1SentAMessageEnquiryOnRecordNumber, { "value1": actorName || UI_STRINGS.common.user, "recordNumber": recordNumber }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.bindingFinalOfferOnRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1SubmittedABindingFinalOfferOfValue2BuyerDecisionPending, { "value1": details?.vendorName || UI_STRINGS.common.vendor, "value2": details?.amount?.toLocaleString() || 'amount' }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.offerAcceptedForRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.vendorQuoteFromValue1OfValue2WasAcceptedPPOGenerationAwaited, { "value1": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor, "value2": details?.amount?.toLocaleString() || 'amount' }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.negotiationConcludedForRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.negotiationWithValue1WasClosed, { "value1": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.pPORecordNumberAcceptedByVendor, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1Value2FormallyAcceptedPPORecordNumberOrderExecutionCommenced, { "value1": details?.vendorName || UI_STRINGS.common.vendor, "value2": actorName || 'Signatory', "recordNumber": recordNumber }),
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
        title: interpolateUiString(UI_STRINGS.libNotifications.issueRaisedOnPPORecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1ReportedClarificationIssueValue2PPOAcceptanceOnHold, { "value1": details?.vendorName || UI_STRINGS.common.vendor, "value2": details?.issueRemarks || 'Issue reported' }),
        type: 'WARNING',
        entityType: 'PPO',
        entityId,
        recordNumber,
        link: `/procurement/ppos`,
      });
  }
}

