// src/app/api/pr/[id]/reject/route.ts - Project Approver PR Rejection API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { reason } = body;

    if (!reason || !reason.trim()) {
      return apiError('Mandatory rejection reason must be provided.', 400);
    }

    const pr = await prisma.procurementRequest.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { costCentre: true },
    });

    if (!pr) return apiError('Procurement Request not found.', 404);

    const updated = await prisma.procurementRequest.update({
      where: { id },
      data: {
        status: 'PR_REJECTED',
        rejectionReason: reason.trim(),
      },
    });

    await prisma.pRApproval.create({
      data: {
        tenantId: ctx.tenantId,
        prId: id,
        approverId: ctx.userId,
        status: 'REJECTED',
        remarks: reason.trim(),
        timestamp: new Date(),
      },
    });

    await prisma.boqRevision.update({
      where: { id: pr.boqRevisionId },
      data: { prStatus: 'PR_REJECTED' },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: pr.projectId,
        entityType: 'PR',
        entityId: pr.id,
        action: 'PR_REJECTED',
        description: `Procurement Request ${pr.prNumber} REJECTED by Project Approver. Reason: ${reason.trim()}`,
      },
    });

    return apiSuccess({ pr: updated, status: 'PR_REJECTED' });
  } catch (err: any) {
    return apiError(err.message || 'PR rejection failed.', 500);
  }
}
