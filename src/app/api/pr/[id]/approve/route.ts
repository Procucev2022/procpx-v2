// src/app/api/pr/[id]/approve/route.ts - Project Approver PR Approval API
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


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

    if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404, { route: '/api/pr/[id]/approve', method: 'POST' });
    if (pr.status !== 'PR_PENDING_PROJECT_APPROVAL') {
      return apiError(interpolateUiString(UI_STRINGS.appApiPrIdApproveRoute.cannotApprovePRInStatusStatusExpectedPRPENDINGPROJECTAPPROVAL, { "status": pr.status }), 400, { route: '/api/pr/[id]/approve', method: 'POST' });
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
        description: interpolateUiString(UI_STRINGS.appApiPrIdApproveRoute.procurementRequestPrNumberApprovedByProjectApproverAndRELEASEDToProcurementUserToLocaleString, { "prNumber": pr.prNumber, "toLocaleString": pr.totalEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) }),
      },
    });

    return apiSuccess({
      pr: updated,
      status: 'PR_RELEASED_TO_PROCUREMENT',
      message: UI_STRINGS.appApiPrIdApproveRoute.pRApprovedAndReleasedToProcurementUserForSourcing,
    });
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.prApprovalFailed }), 500, { route: '/api/pr/[id]/approve', method: 'POST', error: err });
  }
}
