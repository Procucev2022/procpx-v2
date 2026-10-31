// app/api/boq/[revisionId]/approve/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_APPROVE');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: { boq: true },
  });
  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404);
  if (revision.status !== 'SUBMITTED') return apiError(UI_STRINGS.appApiBoqRevisionIdApproveRoute.onlySubmittedBOQsCanBeApproved);

  await prisma.boqRevision.update({
    where: { id: revisionId },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: ctx.userId },
  });

  await prisma.boq.update({
    where: { id: revision.boqId },
    data: { status: 'APPROVED' },
  });

  await prisma.project.updateMany({
    where: { id: revision.boq.projectId, tenantId: ctx.tenantId },
    data: { status: 'BOQ_APPROVED' },
  });

  await createAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    projectId: revision.boq.projectId,
    entityType: 'BOQ_REVISION',
    entityId: revisionId,
    action: 'APPROVE',
    description: interpolateUiString(UI_STRINGS.appApiBoqRevisionIdApproveRoute.bOQRevisionRevisionCodeAPPROVED, { "revisionCode": revision.revisionCode }),
  });

  return apiSuccess({ message: UI_STRINGS.common.bOQApprovedSuccessfully, revisionCode: revision.revisionCode });
}
