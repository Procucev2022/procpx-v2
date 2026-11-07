// src/app/api/pr/[id]/submit/route.ts - Submit PR for Approval API
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { PR_AUDIT_INSERT_AFTER_TRANSITION_SQL, PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL, PR_SUBMIT_STATUS_UPDATE_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_SUBMIT');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
  const pr = await prisma.procurementRequest.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { costCentre: true },
  });

  if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404, { route: '/api/pr/[id]/submit', method: 'POST' });
  if (pr.status !== 'PR_DRAFT' && pr.status !== 'PR_RETURNED_FOR_CORRECTION') {
    return apiError(interpolateUiString(UI_STRINGS.appApiPrIdSubmitRoute.cannotSubmitPRInStatusStatusExpectedPRDRAFTOrPRRETURNEDFORCORRECTION, { "status": pr.status }), 400, { route: '/api/pr/[id]/submit', method: 'POST' });
  }

  const isResubmission = pr.status === 'PR_RETURNED_FOR_CORRECTION';

  const requestedDate = new Date();
  const updated = { ...pr, status: 'PR_PENDING_PROJECT_APPROVAL', requestedDate, requestedBy: ctx.userId };
  const batch: Array<{ sql: string; values: unknown[] }> = [{
    sql: PR_SUBMIT_STATUS_UPDATE_SQL,
    values: [requestedDate.toISOString(), ctx.userId, requestedDate.toISOString(), id, ctx.tenantId],
  }];
  if (pr.boqRevisionId) {
    batch.push({
      sql: PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL,
      values: ['PR_PENDING_PROJECT_APPROVAL', requestedDate.toISOString(), pr.boqRevisionId, ctx.tenantId],
    });
  }
  batch.push({
    sql: PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
    values: [
      crypto.randomUUID(), ctx.tenantId, ctx.userId, pr.projectId, 'PR', pr.id,
      isResubmission ? 'PR_RESUBMITTED' : 'PR_SUBMITTED',
      interpolateUiString(UI_STRINGS.appApiPrIdSubmitRoute.bOQPrNumberValue2ForProjectApproverReviewToLocaleString, {
        prNumber: pr.prNumber,
        value2: isResubmission ? 'RESUBMITTED after correction' : 'submitted',
        toLocaleString: pr.totalEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale),
      }),
      null, null, null, null, requestedDate.toISOString(),
    ],
  });
  const results = await writeD1BatchAtomically(batch);
  if (Number(results[0]?.meta?.changes || 0) !== 1) {
    return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
  }

  return apiSuccess({ pr: updated, status: 'PR_PENDING_PROJECT_APPROVAL' });
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.submit_failed', {
      operation: 'submit', route: '/api/pr/[id]/submit', tenantId: ctx.tenantId,
      userId: ctx.userId, prId: id, requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitPr, 500);
  }
}
