// src/app/api/pr/[id]/reject/route.ts - Project Approver PR Rejection API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL, PR_REJECT_STATUS_UPDATE_SQL, PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const reason = body && typeof body === 'object' && typeof body.reason === 'string' ? body.reason : undefined;

    if (!reason || !reason.trim()) {
      return apiError(UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, 400);
    }

    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { costCentre: true },
    });

    if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
    if (pr.status !== 'PR_PENDING_PROJECT_APPROVAL') {
      return apiError(interpolateUiString(UI_STRINGS.appApiPrIdRejectRoute.cannotRejectPRInStatusStatusExpectedPRPENDINGPROJECTAPPROVAL, { status: pr.status }), 400);
    }

    const rejectedAt = new Date().toISOString();
    const trimmedReason = reason.trim();
    const updated = { ...pr, status: 'PR_REJECTED', rejectionReason: trimmedReason };
    const batch: Array<{ sql: string; values: unknown[] }> = [
      { sql: PR_REJECT_STATUS_UPDATE_SQL, values: [trimmedReason, rejectedAt, id, ctx.tenantId] },
      {
        sql: PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, id, ctx.userId, 'REJECTED', trimmedReason, rejectedAt],
      },
      {
        sql: PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL,
        values: ['PR_REJECTED', rejectedAt, pr.boqRevisionId, ctx.tenantId],
      },
      {
        sql: PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, ctx.userId, pr.projectId, 'PR', pr.id, 'PR_REJECTED',
          interpolateUiString(UI_STRINGS.appApiPrIdRejectRoute.procurementRequestPrNumberREJECTEDByProjectApproverReasonTrim, {
            prNumber: pr.prNumber, trim: trimmedReason,
          }), null, null, null, null, rejectedAt,
        ],
      },
    ];
    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({ pr: updated, status: 'PR_REJECTED' });
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.rejection_failed', {
      operation: 'reject', route: '/api/pr/[id]/reject', tenantId: ctx.tenantId,
      userId: ctx.userId, prId: id, requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.prRejectionFailed, 500);
  }
}
