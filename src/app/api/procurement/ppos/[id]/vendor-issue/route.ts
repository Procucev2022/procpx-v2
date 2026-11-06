import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  PPO_VENDOR_ISSUE_UPDATE_IF_ISSUED_SQL,
  RFQ_VENDOR_MESSAGE_INSERT_AFTER_AUDIT_SQL,
} from '@/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { PPO_VENDOR_ACTION_ACTOR_NAME_MAX_LENGTH, PPO_VENDOR_ACTION_COMMENT_MAX_LENGTH } from '../../vendor-action.constants';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth('PPO_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id: ppoId } = await params;
  const startedAt = Date.now();

  try {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const requestBody = body as Record<string, unknown>;
    if (typeof requestBody.issueRemarks !== 'string' || !requestBody.issueRemarks.trim()) {
      return apiError(UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.issueClarificationDescriptionIsRequired, 400);
    }
    const issueRemarks = requestBody.issueRemarks.trim();
    if (issueRemarks.length > PPO_VENDOR_ACTION_COMMENT_MAX_LENGTH) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const ppo = await prisma.ppo.findFirst({
      where: { id: ppoId, tenantId: ctx.tenantId },
      include: { vendor: true, project: true, rfq: true, lines: true },
    });

    if (!ppo) return apiError(UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, 404);
    if (ctx.role === 'VENDOR' && (!ctx.vendorId || ctx.vendorId !== ppo.vendorId)) {
      return apiError(UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.forbiddenYouCanOnlyRaiseIssuesOnPurchaseOrdersIssuedToYourCompany, 403);
    }
    if (ppo.status !== 'ISSUED' || ppo.vendorStatus === 'ACCEPTED_BY_VENDOR') {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const now = new Date();
    const suppliedReporter = typeof requestBody.raisedBy === 'string' ? requestBody.raisedBy.trim() : '';
    const reporterName = (suppliedReporter || ctx.userName || `${ppo.vendor.name} Representative`)
      .slice(0, PPO_VENDOR_ACTION_ACTOR_NAME_MAX_LENGTH);
    const auditId = crypto.randomUUID();
    const messageId = ppo.rfqId ? crypto.randomUUID() : undefined;
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.clarificationIssueRaisedOnPurchaseOrderPpoNumberByVendorNameTrim,
      { ppoNumber: ppo.ppoNumber, name: ppo.vendor.name, trim: issueRemarks },
    );
    const messageText = interpolateUiString(
      UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.pPOCLARIFICATIONISSUERAISEDVendorNameRaisedAnIssueOnPPOPpoNumberTrimPPOAcceptanceIsHeldPendingResolution,
      { name: ppo.vendor.name, ppoNumber: ppo.ppoNumber, trim: issueRemarks },
    );
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_ISSUE_RAISED',
      recordNumber: ppo.ppoNumber,
      entityId: ppo.id,
      actorName: reporterName,
      details: { vendorName: ppo.vendor.name, issueRemarks, amount: ppo.totalValue },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, now, auditId)
      : null;

    const statements = [
      {
        sql: PPO_VENDOR_ISSUE_UPDATE_IF_ISSUED_SQL,
        values: [issueRemarks, now, now, ppo.id, ctx.tenantId],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, ppo.projectId, 'PPO', ppo.id,
          'PPO_VENDOR_ISSUE_RAISED', auditDescription,
          JSON.stringify({ vendorStatus: ppo.vendorStatus, issueRemarks: ppo.vendorIssueRemarks }),
          JSON.stringify({ vendorStatus: 'ISSUE_RAISED', issueRemarks, raisedBy: reporterName, raisedAt: now }),
          null, null, now],
      },
      ...(messageId && ppo.rfqId ? [{
        sql: RFQ_VENDOR_MESSAGE_INSERT_AFTER_AUDIT_SQL,
        values: [messageId, ctx.tenantId, ppo.rfqId, ctx.userId, reporterName, 'VENDOR', messageText,
          ppo.vendorId, now, auditId, ctx.tenantId],
      }] : []),
      ...(preparedNotification ? [preparedNotification.statement] : []),
    ];
    const results = await writeD1BatchAtomically(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1
      || Number(results[1]?.meta?.changes || 0) !== 1
      || (preparedNotification && Number(results[results.length - 1]?.meta?.changes || 0) !== 1)) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const updated = {
      ...ppo,
      vendorStatus: 'ISSUE_RAISED',
      vendorIssueRemarks: issueRemarks,
      vendorIssueRaisedAt: now,
      updatedAt: now,
    };
    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'PPO', entityId: ppo.id,
        route: '/api/procurement/ppos/[id]/vendor-issue',
      });
    }
    return apiSuccess({
      ppo: updated,
      message: UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.issueSuccessfullyLoggedAndRoutedToTheProcurementTeamForReview,
    });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'procurement.ppo_vendor_issue_failed', {
      operation: 'raise_ppo_vendor_issue', route: '/api/procurement/ppos/[id]/vendor-issue',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId,
      userId: ctx.userId, ppoId, durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 500) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitIssueOnPurchaseOrder, 500);
  }
}
