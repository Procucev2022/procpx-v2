// src/app/api/pr/[id]/submit/route.ts - Submit PR for Approval API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_SUBMIT');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  const pr = await prisma.procurementRequest.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { costCentre: true },
  });

  if (!pr) return apiError('Procurement Request not found.', 404);
  if (pr.status !== 'PR_DRAFT' && pr.status !== 'PR_RETURNED_FOR_CORRECTION') {
    return apiError(`Cannot submit PR in status ${pr.status}. Expected PR_DRAFT or PR_RETURNED_FOR_CORRECTION.`, 400);
  }

  const isResubmission = pr.status === 'PR_RETURNED_FOR_CORRECTION';

  const updated = await prisma.procurementRequest.update({
    where: { id },
    data: {
      status: 'PR_PENDING_PROJECT_APPROVAL',
      requestedDate: new Date(),
      requestedBy: ctx.userId,
    },
  });

  if (pr.boqRevisionId) {
    await prisma.boqRevision.update({
      where: { id: pr.boqRevisionId },
      data: { prStatus: 'PR_PENDING_PROJECT_APPROVAL' },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: pr.projectId,
      entityType: 'PR',
      entityId: pr.id,
      action: isResubmission ? 'PR_RESUBMITTED' : 'PR_SUBMITTED',
      description: `BOQ ${pr.prNumber} ${isResubmission ? 'RESUBMITTED after correction' : 'submitted'} for Project Approver review (₹ ${pr.totalEstimatedValue.toLocaleString('en-IN')})`,
    },
  });

  return apiSuccess({ pr: updated, status: 'PR_PENDING_PROJECT_APPROVAL' });
}
