import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  PPO_VENDOR_ACCEPT_UPDATE_IF_ISSUED_SQL,
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
    const body: unknown = await req.json().catch(() => ({}));
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const requestBody = body as Record<string, unknown>;
    if (requestBody.vendorComments !== undefined
      && (typeof requestBody.vendorComments !== 'string' || requestBody.vendorComments.length > PPO_VENDOR_ACTION_COMMENT_MAX_LENGTH)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const vendorComments = typeof requestBody.vendorComments === 'string'
      ? requestBody.vendorComments.trim() || null
      : null;

    const ppo = await prisma.ppo.findFirst({
      where: { id: ppoId, tenantId: ctx.tenantId },
      include: { vendor: true, project: true, rfq: true, lines: true },
    });
    if (!ppo) return apiError(UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, 404);
    if (ctx.role === 'VENDOR' && (!ctx.vendorId || ctx.vendorId !== ppo.vendorId)) {
      return apiError(UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.forbiddenYouCanOnlyAcceptPurchaseOrdersIssuedToYourCompany, 403);
    }
    if (ppo.vendorStatus === 'ACCEPTED_BY_VENDOR') {
      return apiError(UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.thisPurchaseOrderHasAlreadyBeenAccepted, 400, { route: '/api/procurement/ppos/[id]/vendor-accept', method: 'POST' });
    }
    if (ppo.status !== 'ISSUED') {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const now = new Date();
    const suppliedSignatory = typeof requestBody.acceptedBy === 'string' ? requestBody.acceptedBy.trim() : '';
    const signatoryName = (suppliedSignatory || ctx.userName || `${ppo.vendor.name} Authorized Signatory`)
      .slice(0, PPO_VENDOR_ACTION_ACTOR_NAME_MAX_LENGTH);
    const auditId = crypto.randomUUID();
    const messageId = ppo.rfqId ? crypto.randomUUID() : undefined;
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.purchaseOrderPpoNumberFormallyAcceptedByVendorNameSignatoryNameStatusTransitionedToCONFIRMED,
      { ppoNumber: ppo.ppoNumber, name: ppo.vendor.name, signatoryName },
    );
    const messageText = interpolateUiString(
      UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.pPOACCEPTEDORDEREXECUTIONVendorNameHasFormallyAcceptedPurchaseOrderPpoNumberTotalToLocaleStringOnToLocaleString2OrderExecutionCommenced,
      {
        name: ppo.vendor.name,
        ppoNumber: ppo.ppoNumber,
        toLocaleString: ppo.totalValue.toLocaleString(),
        toLocaleString2: now.toLocaleString(),
      },
    );
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_ACCEPTED_BY_VENDOR',
      recordNumber: ppo.ppoNumber,
      entityId: ppo.id,
      actorName: signatoryName,
      details: { vendorName: ppo.vendor.name, amount: ppo.totalValue, acceptedAt: now },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, now, auditId)
      : null;

    const statements = [
      {
        sql: PPO_VENDOR_ACCEPT_UPDATE_IF_ISSUED_SQL,
        values: [now, signatoryName, now, ppo.id, ctx.tenantId],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, ppo.projectId, 'PPO', ppo.id,
          'PPO_VENDOR_ACCEPTED', auditDescription,
          JSON.stringify({ status: ppo.status, vendorStatus: ppo.vendorStatus }),
          JSON.stringify({ vendorStatus: 'ACCEPTED_BY_VENDOR', status: 'CONFIRMED', acceptedBy: signatoryName,
            acceptedAt: now, vendorComments }), null, null, now],
      },
      ...(messageId && ppo.rfqId ? [{
        sql: RFQ_VENDOR_MESSAGE_INSERT_AFTER_AUDIT_SQL,
        values: [messageId, ctx.tenantId, ppo.rfqId, ctx.userId, signatoryName, 'VENDOR', messageText,
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
      status: 'CONFIRMED',
      vendorStatus: 'ACCEPTED_BY_VENDOR',
      vendorAcceptedAt: now,
      vendorAcceptedBy: signatoryName,
      vendorAcceptedVersion: 1,
      vendorIssueRemarks: null,
      updatedAt: now,
    };
    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'PPO', entityId: ppo.id,
        route: '/api/procurement/ppos/[id]/vendor-accept',
      });
    }
    return apiSuccess({
      ppo: updated,
      message: interpolateUiString(
        UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.purchaseOrderPpoNumberSuccessfullyAcceptedBySignatoryName,
        { ppoNumber: ppo.ppoNumber, signatoryName },
      ),
    });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'procurement.ppo_vendor_accept_failed', {
      operation: 'accept_ppo_as_vendor', route: '/api/procurement/ppos/[id]/vendor-accept',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId,
      userId: ctx.userId, ppoId, durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 500) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToAcceptPurchaseOrder2, 500);
  }
}
