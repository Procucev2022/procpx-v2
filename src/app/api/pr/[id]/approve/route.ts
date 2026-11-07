// src/app/api/pr/[id]/approve/route.ts - Project Approver PR Approval API
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL, PR_APPROVE_STATUS_UPDATE_SQL, PR_AUDIT_INSERT_AFTER_TRANSITION_SQL, PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const remarks = typeof body?.remarks === 'string' ? body.remarks : undefined;

    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { costCentre: true },
    });

    if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404, { route: '/api/pr/[id]/approve', method: 'POST' });
    if (pr.status !== 'PR_PENDING_PROJECT_APPROVAL') {
      return apiError(interpolateUiString(UI_STRINGS.appApiPrIdApproveRoute.cannotApprovePRInStatusStatusExpectedPRPENDINGPROJECTAPPROVAL, { "status": pr.status }), 400, { route: '/api/pr/[id]/approve', method: 'POST' });
    }

    const approvedAt = new Date();
    const updated = {
      ...pr,
      status: 'PR_RELEASED_TO_PROCUREMENT',
      projectApprovedAt: approvedAt,
      projectApprovedBy: ctx.userId,
      releasedAt: approvedAt,
      releasedBy: ctx.userId,
    };
    const approvalRemarks = remarks || UI_STRINGS.appApiPrIdApproveRoute.procurementRequestTechnicalSpecificationAndQuantityApproved;
    const batch: Array<{ sql: string; values: unknown[] }> = [
      {
        sql: PR_APPROVE_STATUS_UPDATE_SQL,
        values: [approvedAt.toISOString(), ctx.userId, approvedAt.toISOString(), ctx.userId, approvedAt.toISOString(), id, ctx.tenantId],
      },
      {
        sql: PR_APPROVAL_INSERT_AFTER_STATUS_UPDATE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, id, ctx.userId, 'APPROVED', approvalRemarks, approvedAt.toISOString()],
      },
    ];
    if (pr.boqRevisionId) {
      batch.push({
        sql: PR_REVISION_STATUS_UPDATE_AFTER_APPROVAL_SQL,
        values: ['PR_APPROVED', approvedAt.toISOString(), pr.boqRevisionId, ctx.tenantId],
      });
    }
    batch.push({
      sql: PR_AUDIT_INSERT_AFTER_TRANSITION_SQL,
      values: [
        crypto.randomUUID(), ctx.tenantId, ctx.userId, pr.projectId, 'PR', pr.id, 'PR_APPROVED',
        interpolateUiString(UI_STRINGS.appApiPrIdApproveRoute.procurementRequestPrNumberApprovedByProjectApproverAndRELEASEDToProcurementUserToLocaleString, {
          prNumber: pr.prNumber,
          toLocaleString: pr.totalEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale),
        }), null, null, null, null, approvedAt.toISOString(),
      ],
    });
    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    return apiSuccess({
      pr: updated,
      status: 'PR_RELEASED_TO_PROCUREMENT',
      message: UI_STRINGS.appApiPrIdApproveRoute.pRApprovedAndReleasedToProcurementUserForSourcing,
    });
  } catch (error) {
    await writeStructuredLog('error', 'purchase_request.approval_failed', {
      operation: 'approve', route: '/api/pr/[id]/approve', tenantId: ctx.tenantId,
      userId: ctx.userId, prId: id, requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      error,
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.prApprovalFailed, 500);
  }
}
