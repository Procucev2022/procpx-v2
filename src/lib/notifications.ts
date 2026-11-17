// src/lib/notifications.ts - Enterprise Workflow Notification & Communication Helper
import { I18N_CONFIG } from '@/lib/i18n.constants';
import type {
  NotifyNextResponsiblePartyInput,
  WorkflowNotificationParams,
  WorkflowNotificationPreparationOptions,
} from "@app-types/lib/notifications.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { getD1BatchDatabase } from './d1-batch';
import { dispatchNotificationOutbox, enqueueNotificationOutbox } from './notification-outbox';
import { writeStructuredLog } from './observability/server-logger';

export type { WorkflowNotificationParams };

export async function dispatchPreparedWorkflowNotification(
  outboxId: string,
  now = new Date(),
  context: { tenantId?: string; entityType?: string; entityId?: string; route?: string } = {},
): Promise<void> {
  try {
    await dispatchNotificationOutbox(getD1BatchDatabase(), { onlyId: outboxId, now, batchSize: 1 });
  } catch (error) {
    await writeStructuredLog('warn', 'workflow_notification.dispatch_deferred', {
      operation: 'dispatch_notification_outbox', tenantId: context.tenantId,
      entityType: context.entityType, entityId: context.entityId, outboxId,
      route: context.route,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    }, 'application');
  }
}


export async function createWorkflowNotification(params: WorkflowNotificationParams) {
  const createdAt = new Date();
  const payload: WorkflowNotificationParams = {
    tenantId: params.tenantId,
    userId: params.userId || null,
    targetRole: params.targetRole || null,
    title: params.title,
    message: params.message,
    type: params.type || 'INFO',
    entityType: params.entityType || undefined,
    entityId: params.entityId || undefined,
    recordNumber: params.recordNumber || undefined,
    link: params.link || undefined,
  };
  try {
    const id = await enqueueNotificationOutbox(payload, createdAt);
    await dispatchPreparedWorkflowNotification(id, createdAt, {
      tenantId: params.tenantId, entityType: params.entityType, entityId: params.entityId,
    });
    return { id, ...payload, isRead: false, createdAt };
  } catch (error) {
    await writeStructuredLog('error', 'workflow_notification.enqueue_failed', {
      operation: 'create',
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      recordNumber: params.recordNumber,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    // Notification creation failure should never crash the parent transaction
    return null;
  }
}

type CreatedWorkflowNotification = Awaited<ReturnType<typeof createWorkflowNotification>>;

export function notifyNextResponsibleParty(
  input: NotifyNextResponsiblePartyInput,
  options: { prepareOnly: true },
): Promise<WorkflowNotificationParams | undefined>;
export function notifyNextResponsibleParty(
  input: NotifyNextResponsiblePartyInput,
  options?: { prepareOnly?: false },
): Promise<CreatedWorkflowNotification | undefined>;

/**
 * Notifies the next responsible actor/role in the procurement sequence
 */
export async function notifyNextResponsibleParty(
  { tenantId, event, recordNumber, entityId, actorName, details }: NotifyNextResponsiblePartyInput,
  options: WorkflowNotificationPreparationOptions = {},
): Promise<WorkflowNotificationParams | CreatedWorkflowNotification | undefined> {
  const notificationWriter = options.prepareOnly
    ? async (params: WorkflowNotificationParams) => params
    : createWorkflowNotification;
  switch (event) {
    case 'PR_RELEASED':
      return notificationWriter({
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
      return notificationWriter({
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
      return notificationWriter({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: interpolateUiString(UI_STRINGS.libNotifications.newQuotationForRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1SubmittedQuotationValue2ForRFQRecordNumber, { "value1": details?.vendorName || 'A supplier', "value2": details?.amount ? `₹${details.amount.toLocaleString(I18N_CONFIG.defaultLocale)}` : 'rates recorded', "recordNumber": recordNumber }),
        type: 'INFO',
        entityType: 'QUOTE',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=rfq`,
      });

    case 'COUNTER_OFFER_SENT':
      return notificationWriter({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: interpolateUiString(UI_STRINGS.libNotifications.counterOfferDispatchedRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.roundValue1CounterOfferOfValue2DispatchedToValue3, { "value1": details?.roundNumber || 1, "value2": details?.amount?.toLocaleString(I18N_CONFIG.defaultLocale) || 'negotiated total', "value3": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor }),
        type: 'INFO',
        entityType: 'NEGOTIATION',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=negotiation`,
      });

    case 'REVISED_QUOTE_RECEIVED':
      return notificationWriter({
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
      return notificationWriter({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: interpolateUiString(UI_STRINGS.libNotifications.commercialRatesLockedRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.commercialRatesFinalizedAtValue1ReadyToPrepareAwardRecommendation, { "value1": details?.amount?.toLocaleString(I18N_CONFIG.defaultLocale) || 'agreed amount' }),
        type: 'ACTION_REQUIRED',
        entityType: 'RFQ',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=awarding`,
      });

    case 'AWARD_RECOMMENDED':
      return notificationWriter({
        tenantId,
        targetRole: 'FINANCE_USER',
        title: interpolateUiString(UI_STRINGS.libNotifications.awardSignOffRequiredRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.awardRecommendationOfValue1ForValue2SubmittedForFinanceApproval, { "value1": details?.amount?.toLocaleString(I18N_CONFIG.defaultLocale) || 'amount', "value2": details?.vendorName || 'selected vendor' }),
        type: 'ACTION_REQUIRED',
        entityType: 'AWARD',
        entityId,
        recordNumber,
        link: `/procurement/awards`,
      });

    case 'AWARD_APPROVED':
      return notificationWriter({
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
      return notificationWriter({
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
      return notificationWriter({
        tenantId,
        targetRole: 'FINANCE_USER',
        title: interpolateUiString(UI_STRINGS.libNotifications.pPORecordNumberGenerated, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.procurementOrderRecordNumberCreatedForValue2Value3, { "recordNumber": recordNumber, "value2": details?.amount?.toLocaleString(I18N_CONFIG.defaultLocale) || 'order value', "value3": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor }),
        type: 'SUCCESS',
        entityType: 'PPO',
        entityId,
        recordNumber,
        link: `/procurement/ppos`,
      });

    case 'ENQUIRY_SENT':
      return notificationWriter({
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
      return notificationWriter({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: interpolateUiString(UI_STRINGS.libNotifications.bindingFinalOfferOnRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.value1SubmittedABindingFinalOfferOfValue2BuyerDecisionPending, { "value1": details?.vendorName || UI_STRINGS.common.vendor, "value2": details?.amount?.toLocaleString(I18N_CONFIG.defaultLocale) || 'amount' }),
        type: 'ACTION_REQUIRED',
        entityType: 'NEGOTIATION',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=negotiation`,
      });

    case 'COMMERCIAL_AWARD_APPROVED':
      return notificationWriter({
        tenantId,
        targetRole: 'PROCUREMENT_USER',
        title: interpolateUiString(UI_STRINGS.libNotifications.offerAcceptedForRecordNumber, { "recordNumber": recordNumber }),
        message: interpolateUiString(UI_STRINGS.libNotifications.vendorQuoteFromValue1OfValue2WasAcceptedPPOGenerationAwaited, { "value1": details?.vendorName || UI_STRINGS.appAppProcurementVendorsPage.vendor, "value2": details?.amount?.toLocaleString(I18N_CONFIG.defaultLocale) || 'amount' }),
        type: 'SUCCESS',
        entityType: 'NEGOTIATION',
        entityId,
        recordNumber,
        link: `/procurement/rfqs/${entityId}?tab=awarding`,
      });

    case 'NEGOTIATION_CLOSED':
      return notificationWriter({
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
      return notificationWriter({
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
      return notificationWriter({
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

