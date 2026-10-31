// src/app/api/pr/[id]/submit/route.ts - Submit PR for Approval API
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('PR_SUBMIT');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  const pr = await prisma.procurementRequest.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { costCentre: true },
  });

  if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
  if (pr.status !== 'PR_DRAFT' && pr.status !== 'PR_RETURNED_FOR_CORRECTION') {
    return apiError(interpolateUiString(UI_STRINGS.appApiPrIdSubmitRoute.cannotSubmitPRInStatusStatusExpectedPRDRAFTOrPRRETURNEDFORCORRECTION, { "status": pr.status }), 400);
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
      description: interpolateUiString(UI_STRINGS.appApiPrIdSubmitRoute.bOQPrNumberValue2ForProjectApproverReviewToLocaleString, { "prNumber": pr.prNumber, "value2": isResubmission ? 'RESUBMITTED after correction' : 'submitted', "toLocaleString": pr.totalEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) }),
    },
  });

  return apiSuccess({ pr: updated, status: 'PR_PENDING_PROJECT_APPROVAL' });
}
