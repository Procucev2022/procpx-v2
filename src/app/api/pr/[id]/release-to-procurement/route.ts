// src/app/api/pr/[id]/release-to-procurement/route.ts - Release PR to Procurement Queue API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { PR_AUDIT_INSERT_AFTER_TRANSITION_SQL, PR_RELEASE_STATUS_UPDATE_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  try {
    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
    if (pr.status === 'PR_RELEASED_TO_PROCUREMENT') {
      return apiSuccess({ pr, status: 'PR_RELEASED_TO_PROCUREMENT' });
    }
    if (pr.status !== 'PR_APPROVED') {
      return apiError(UI_STRINGS.appApiPrIdReleaseToProcurementRoute.pRMustBeApprovedBeforeReleasingToProcurement, 400);
    }

    const releasedAt = new Date();
    const updated = { ...pr, status: 'PR_RELEASED_TO_PROCUREMENT', releasedAt, releasedBy: ctx.userId };
    const auditId = crypto.randomUUID();
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PR_RELEASED',
      recordNumber: pr.prNumber,
      entityId: pr.id,
      actorName: ctx.userName,
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, releasedAt, auditId)
      : null;
    const results = await writeD1BatchAtomically([
      {
        sql: PR_RELEASE_STATUS_UPDATE_SQL,
        values: [releasedAt.toISOString(), ctx.userId, releasedAt.toISOString(), id, ctx.tenantId],
      },
      {
        sql: PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
        values: [
          auditId, ctx.tenantId, ctx.userId, pr.projectId, 'PR', pr.id, 'PR_RELEASED_TO_PROCUREMENT',
          interpolateUiString(UI_STRINGS.appApiPrIdReleaseToProcurementRoute.procurementRequestPrNumberReleasedToProcurementUserSourcingQueue, {
            prNumber: pr.prNumber,
          }), null, null, null, null, releasedAt.toISOString(),
        ],
      },
      ...(preparedNotification ? [preparedNotification.statement] : []),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, releasedAt, {
        tenantId: ctx.tenantId, entityType: 'PR', entityId: pr.id,
        route: '/api/pr/[id]/release-to-procurement',
      });
    }

    return apiSuccess({ pr: updated, status: 'PR_RELEASED_TO_PROCUREMENT' });
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.release_failed', {
      operation: 'release_to_procurement', route: '/api/pr/[id]/release-to-procurement',
      tenantId: ctx.tenantId, userId: ctx.userId, prId: id,
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      durationMs: Date.now() - startedAt, error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToReleaseProcurementRequest, 500);
  }
}
