// app/api/boq/[revisionId]/reject/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_REJECT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const body = await req.json();
  const { reason } = body;
  if (!reason?.trim()) return apiError(UI_STRINGS.appApiBoqRevisionIdRejectRoute.rejectionReasonIsRequired);

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: { boq: true },
  });
  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404, { route: '/api/boq/[revisionId]/reject', method: 'POST' });
  if (revision.status !== 'SUBMITTED') return apiError(UI_STRINGS.appApiBoqRevisionIdRejectRoute.onlySubmittedBOQsCanBeRejected);

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
    description: interpolateUiString(UI_STRINGS.appApiBoqRevisionIdRejectRoute.bOQRevisionRevisionCodeREJECTEDTrim, { "revisionCode": revision.revisionCode, "trim": reason.trim() }),
    newValue: { rejectionReason: reason.trim() },
  });

  return apiSuccess({ message: UI_STRINGS.appApiBoqRevisionIdRejectRoute.bOQRejected, revisionCode: revision.revisionCode });
}
