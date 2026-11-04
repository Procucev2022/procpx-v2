// app/api/boq/[revisionId]/submit/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(_req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_SUBMIT');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const revision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: { boq: true },
  });
  if (!revision) return apiError(UI_STRINGS.common.revisionNotFound, 404, { route: '/api/boq/[revisionId]/submit', method: 'POST' });
  if (revision.status !== 'DRAFT') return apiError(interpolateUiString(UI_STRINGS.appApiBoqRevisionIdSubmitRoute.cannotSubmitABOQInStatusStatus, { "status": revision.status }));
  if (revision.errorLines > 0) {
    return apiError(interpolateUiString(UI_STRINGS.appApiBoqRevisionIdSubmitRoute.bOQCannotBeSubmittedBecauseErrorLinesLinesContainErrors, { "errorLines": revision.errorLines }));
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
    description: interpolateUiString(UI_STRINGS.appApiBoqRevisionIdSubmitRoute.bOQRevisionRevisionCodeSubmittedForApproval, { "revisionCode": revision.revisionCode }),
  });

  return apiSuccess({ message: UI_STRINGS.appApiBoqRevisionIdSubmitRoute.bOQSubmittedForApproval, revisionCode: revision.revisionCode });
}
