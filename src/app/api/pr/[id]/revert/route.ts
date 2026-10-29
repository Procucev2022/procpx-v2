// src/app/api/pr/[id]/revert/route.ts - Project Approver Revert BOQ for Correction API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createWorkflowNotification } from '@/lib/notifications';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { reason } = body;

    if (!reason || !reason.trim()) {
      return apiError('Mandatory reason for reverting for correction must be provided.', 400);
    }

    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        costCentre: true,
        project: true,
        boq: true,
      },
    });

    if (!pr) return apiError('Procurement Request not found.', 404);

    if (pr.status !== 'PR_PENDING_PROJECT_APPROVAL') {
      return apiError(`Cannot revert BOQ in status ${pr.status}. Expected PR_PENDING_PROJECT_APPROVAL.`, 400);
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
        description: `BOQ ${pr.prNumber} (${pr.title}) REVERTED FOR CORRECTION by Project Approver. Reason: "${trimmedReason}"`,
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
      title: `BOQ Returned for Correction: ${pr.prNumber}`,
      message: `${ctx.userName || 'Project Approver'} returned BOQ ${pr.prNumber} for correction: "${trimmedReason}"`,
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
      message: `BOQ ${pr.prNumber} successfully returned for correction to the Project User.`,
    });
  } catch (err: any) {
    console.error('Error reverting BOQ for correction:', err);
    return apiError(err.message || 'Failed to revert BOQ for correction.', 500);
  }
}
