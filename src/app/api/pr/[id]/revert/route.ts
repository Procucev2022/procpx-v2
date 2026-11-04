// src/app/api/pr/[id]/revert/route.ts - Project Approver Revert BOQ for Correction API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createWorkflowNotification } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { reason } = body;

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

    // 1. Update ProcurementRequest status to PR_RETURNED_FOR_CORRECTION
    const updated = await prisma.procurementRequest.update({
      where: { id },
      data: {
        status: 'PR_RETURNED_FOR_CORRECTION',
        rejectionReason: trimmedReason,
      },
    });

    // 2. Add an approval audit record for the revert action
    await prisma.pRApproval.create({
      data: {
        tenantId: ctx.tenantId,
        prId: id,
        approverId: ctx.userId,
        status: 'RETURNED_FOR_CORRECTION',
        remarks: trimmedReason,
        timestamp: new Date(),
      },
    });

    // 3. Update associated BoqRevision prStatus
    if (pr.boqRevisionId) {
      await prisma.boqRevision.update({
        where: { id: pr.boqRevisionId },
        data: {
          prStatus: 'PR_RETURNED_FOR_CORRECTION',
          rejectionReason: trimmedReason,
        },
      });
    }

    // 4. Audit Log entry
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: pr.projectId,
        entityType: 'PR',
        entityId: pr.id,
        action: 'PR_RETURNED_FOR_CORRECTION',
        description: interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.bOQPrNumberTitleREVERTEDFORCORRECTIONByProjectApproverReasonTrimmedReason, { "prNumber": pr.prNumber, "title": pr.title, "trimmedReason": trimmedReason }),
        newValue: JSON.stringify({
          prNumber: pr.prNumber,
          status: 'PR_RETURNED_FOR_CORRECTION',
          reason: trimmedReason,
          approverId: ctx.userId,
        }),
      },
    });

    // 5. Notify the submitting Project User
    await createWorkflowNotification({
      tenantId: ctx.tenantId,
      userId: pr.requestedBy,
      title: interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.bOQReturnedForCorrectionPrNumber, { "prNumber": pr.prNumber }),
      message: interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.value1ReturnedBOQPrNumberForCorrectionTrimmedReason, { "value1": ctx.userName || UI_STRINGS.common.projectApprover, "prNumber": pr.prNumber, "trimmedReason": trimmedReason }),
      type: 'WARNING',
      entityType: 'PR',
      entityId: pr.id,
      recordNumber: pr.prNumber,
      link: `/pr`,
    });

    return apiSuccess({
      success: true,
      pr: updated,
      status: 'PR_RETURNED_FOR_CORRECTION',
      message: interpolateUiString(UI_STRINGS.appApiPrIdRevertRoute.bOQPrNumberSuccessfullyReturnedForCorrectionToTheProjectUser, { "prNumber": pr.prNumber }),
    });
  } catch (err: any) {
    console.error('Error reverting BOQ for correction:', err);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToRevertBoqForCorrection }), 500, { route: '/api/pr/[id]/revert', method: 'POST', error: err });
  }
}
