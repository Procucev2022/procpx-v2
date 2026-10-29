// app/api/boq/[revisionId]/submit/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_SUBMIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: { boq: true },
  });
  if (!revision) return apiError('Revision not found', 404);
  if (revision.status !== 'DRAFT') return apiError(`Cannot submit a BOQ in ${revision.status} status.`);
  if (revision.errorLines > 0) {
    return apiError(`BOQ cannot be submitted because ${revision.errorLines} lines contain errors.`);
  }

  await prisma.boqRevision.update({
    where: { id: revisionId },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });

  await prisma.boq.update({
    where: { id: revision.boqId },
    data: { status: 'SUBMITTED' },
  });

  // Update project status
  await prisma.project.updateMany({
    where: { id: revision.boq.projectId, tenantId: ctx.tenantId },
    data: { status: 'BOQ_REVIEW' },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_REVISION',
    entityId: revisionId,
    action: 'SUBMIT',
    description: `BOQ Revision ${revision.revisionCode} submitted for approval`,
  });

  return apiSuccess({ message: 'BOQ submitted for approval.', revisionCode: revision.revisionCode });
}
