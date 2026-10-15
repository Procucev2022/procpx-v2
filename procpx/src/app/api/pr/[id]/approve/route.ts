// src/app/api/pr/[id]/approve/route.ts - Project Approver PR Approval API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { remarks } = body;

    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { costCentre: true },
    });

    if (!pr) return apiError('Procurement Request not found.', 404);
    if (pr.status !== 'PR_PENDING_PROJECT_APPROVAL') {
      return apiError(`Cannot approve PR in status ${pr.status}. Expected PR_PENDING_PROJECT_APPROVAL.`, 400);
    }

    // Record PR approval log
    await prisma.pRApproval.create({
      data: {
        tenantId: ctx.tenantId,
        prId: id,
        approverId: ctx.userId,
        status: 'APPROVED',
        remarks: remarks || 'Procurement request technical specification and quantity approved.',
        timestamp: new Date(),
      },
    });

    // Move to PR_APPROVED and directly release to procurement
    const updated = await prisma.procurementRequest.update({
      where: { id },
      data: {
        status: 'PR_RELEASED_TO_PROCUREMENT',
        projectApprovedAt: new Date(),
        projectApprovedBy: ctx.userId,
        releasedAt: new Date(),
        releasedBy: ctx.userId,
      },
    });

    // Update revision PR status (DOES NOT TOUCH BUDGET WORKFLOW STATUS!)
    await prisma.boqRevision.update({
      where: { id: pr.boqRevisionId },
      data: { prStatus: 'PR_APPROVED' },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: pr.projectId,
        entityType: 'PR',
        entityId: pr.id,
        action: 'PR_APPROVED',
        description: `Procurement Request ${pr.prNumber} approved by Project Approver and RELEASED to Procurement User (₹ ${pr.totalEstimatedValue.toLocaleString('en-IN')})`,
      },
    });

    return apiSuccess({
      pr: updated,
      status: 'PR_RELEASED_TO_PROCUREMENT',
      message: 'PR approved and released to Procurement User for sourcing.',
    });
  } catch (err: any) {
    return apiError(err.message || 'PR approval failed.', 500);
  }
}
