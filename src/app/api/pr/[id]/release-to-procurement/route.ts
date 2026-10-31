// src/app/api/pr/[id]/release-to-procurement/route.ts - Release PR to Procurement Queue API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  const pr = await prisma.procurementRequest.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
  if (pr.status !== 'PR_APPROVED' && pr.status !== 'PR_RELEASED_TO_PROCUREMENT') {
    return apiError(UI_STRINGS.appApiPrIdReleaseToProcurementRoute.pRMustBeApprovedBeforeReleasingToProcurement, 400);
  }

  const updated = await prisma.procurementRequest.update({
    where: { id },
    data: {
      status: 'PR_RELEASED_TO_PROCUREMENT',
      releasedAt: new Date(),
      releasedBy: ctx.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: pr.projectId,
      entityType: 'PR',
      entityId: pr.id,
      action: 'PR_RELEASED_TO_PROCUREMENT',
      description: interpolateUiString(UI_STRINGS.appApiPrIdReleaseToProcurementRoute.procurementRequestPrNumberReleasedToProcurementUserSourcingQueue, { "prNumber": pr.prNumber }),
    },
  });

  await notifyNextResponsibleParty({
    tenantId: ctx.tenantId,
    event: 'PR_RELEASED',
    recordNumber: pr.prNumber,
    entityId: pr.id,
    actorName: ctx.userName,
  });

  return apiSuccess({ pr: updated, status: 'PR_RELEASED_TO_PROCUREMENT' });
}
