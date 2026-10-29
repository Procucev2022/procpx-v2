// app/api/boq/[revisionId]/reject/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_REJECT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const body = await req.json();
  const { reason } = body;
  if (!reason?.trim()) return apiError('Rejection reason is required.');

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: { boq: true },
  });
  if (!revision) return apiError('Revision not found', 404);
  if (revision.status !== 'SUBMITTED') return apiError('Only submitted BOQs can be rejected.');

  await prisma.boqRevision.update({
    where: { id: revisionId },
    data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason.trim() },
  });

  await prisma.boq.update({ where: { id: revision.boqId }, data: { status: 'REJECTED' } });
  await prisma.project.updateMany({
    where: { id: revision.boq.projectId, tenantId: ctx.tenantId },
    data: { status: 'BOQ_PREPARATION' },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_REVISION',
    entityId: revisionId,
    action: 'REJECT',
    description: `BOQ Revision ${revision.revisionCode} REJECTED: ${reason.trim()}`,
    newValue: { rejectionReason: reason.trim() },
  });

  return apiSuccess({ message: 'BOQ rejected.', revisionCode: revision.revisionCode });
}
