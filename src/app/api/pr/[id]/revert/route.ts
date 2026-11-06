// src/app/api/pr/[id]/revert/route.ts - Project Approver Revert BOQ for Correction API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification } from '@/lib/notifications';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL, PR_REVERT_STATUS_UPDATE_SQL, PR_REVISION_REVERT_UPDATE_AFTER_APPROVAL_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const reason = body && typeof body === 'object' && typeof body.reason === 'string' ? body.reason : undefined;

    if (!reason || !reason.trim()) {
      return apiError(UI_STRINGS.appApiPrIdRevertRoute.mandatoryReasonForRevertingForCorrectionMustBeProvided, 400, { route: '/api/pr/[id]/revert', method: 'POST' });
    }

    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        costCentre: true,
        project: true,
        boq: true,
      },
    });

    if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404, { route: '/api/pr/[id]/revert', method: 'POST' });

    if (pr.status !== 'PR_PENDING_PROJECT_APPROVAL') {
      return apiError(interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.cannotRevertBOQInStatusStatusExpectedPRPENDINGPROJECTAPPROVAL, { "status": pr.status }), 400, { route: '/api/pr/[id]/revert', method: 'POST' });
    }

    const trimmedReason = reason.trim();

    const returnedAtDate = new Date();
    const returnedAt = returnedAtDate.toISOString();
    const updated = { ...pr, status: 'PR_RETURNED_FOR_CORRECTION', rejectionReason: trimmedReason };
    const auditId = crypto.randomUUID();
    const preparedNotification = prepareNotificationOutbox({
      tenantId: ctx.tenantId,
      userId: pr.requestedBy,
      title: interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.bOQReturnedForCorrectionPrNumber, { prNumber: pr.prNumber }),
      message: interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.value1ReturnedBOQPrNumberForCorrectionTrimmedReason, {
        value1: ctx.userName || UI_STRINGS.common.projectApprover,
        prNumber: pr.prNumber,
        trimmedReason,
      }),
      type: 'WARNING',
      entityType: 'PR',
      entityId: pr.id,
      recordNumber: pr.prNumber,
      link: '/pr',
    }, returnedAtDate, auditId);
    const batch: Array<{ sql: string; values: unknown[] }> = [
      { sql: PR_REVERT_STATUS_UPDATE_SQL, values: [trimmedReason, returnedAt, id, ctx.tenantId] },
      {
        sql: PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, id, ctx.userId, 'RETURNED_FOR_CORRECTION', trimmedReason, returnedAt],
      },
    ];
    if (pr.boqRevisionId) {
      batch.push({
        sql: PR_REVISION_REVERT_UPDATE_AFTER_APPROVAL_SQL,
        values: [trimmedReason, returnedAt, pr.boqRevisionId, ctx.tenantId],
      });
    }
    batch.push({
      sql: PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
      values: [
        auditId, ctx.tenantId, ctx.userId, pr.projectId, 'PR', pr.id, 'PR_RETURNED_FOR_CORRECTION',
        interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.bOQPrNumberTitleREVERTEDFORCORRECTIONByProjectApproverReasonTrimmedReason, {
          prNumber: pr.prNumber, title: pr.title, trimmedReason,
        }), null, JSON.stringify({
          prNumber: pr.prNumber, status: 'PR_RETURNED_FOR_CORRECTION', reason: trimmedReason, approverId: ctx.userId,
        }), null, null, returnedAt,
      ],
    });
    batch.push(preparedNotification.statement);
    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    await dispatchPreparedWorkflowNotification(preparedNotification.id, returnedAtDate, {
      tenantId: ctx.tenantId,
      entityType: 'PR',
      entityId: pr.id,
      route: '/api/pr/[id]/revert',
    });

    return apiSuccess({
      success: true,
      pr: updated,
      status: 'PR_RETURNED_FOR_CORRECTION',
      message: interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.bOQPrNumberSuccessfullyReturnedForCorrectionToTheProjectUser, { "prNumber": pr.prNumber }),
    });
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.revert_failed', {
      operation: 'return_for_correction', route: '/api/pr/[id]/revert', tenantId: ctx.tenantId,
      userId: ctx.userId, prId: id, requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToRevertBoqForCorrection, 500);
  }
}
