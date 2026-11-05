// src/app/api/procurement/rate-cards/[id]/reject/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeRateCardTransitionAtomically } from '@/lib/d1-batch';
import { RATE_CARD_REJECT_UPDATE_SQL } from '@/lib/d1-batch.constants';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const reason = body.reason ?? body.remarks;

    if (typeof reason !== 'string' || !reason.trim()) {
      return apiError(UI_STRINGS.common.rejectionReasonRemarksIsMandatory, 400);
    }

    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { vendor: true, items: true, approvals: { orderBy: { timestamp: 'desc' } } },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404);
    }

    const pendingStatuses = ['PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL'];
    if (!pendingStatuses.includes(rateCard.status)) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRejectRoute.cannotRejectRateCardInStatusStatus, { "status": rateCard.status }), 400);
    }

    const now = new Date();
    const approverName = ctx.userName || ctx.userEmail || ctx.role;
    const currentLevel = rateCard.status === 'PENDING_FINANCE_APPROVAL' ? 'LEVEL_2_FINANCE' : 'LEVEL_1_PROJECT';

    const approvalId = crypto.randomUUID();
    const rejectionReason = reason.trim();
    const changed = await writeRateCardTransitionAtomically({
      updateSql: RATE_CARD_REJECT_UPDATE_SQL,
      updateValues: [rejectionReason, now.toISOString(), id, ctx.tenantId, rateCard.status, rateCard.approvalLevel ?? null],
      approvalValues: [approvalId, ctx.tenantId, id, currentLevel, ctx.userId, approverName, ctx.userEmail || null, 'REJECTED', rejectionReason, now.toISOString()],
      auditValues: [crypto.randomUUID(), ctx.tenantId, ctx.userId, null, 'VENDOR', rateCard.vendorId,
        'RATE_CARD_REJECTED', interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRejectRoute.rateCardRateCardNumberRejectedByApproverNameTrim, { "rateCardNumber": rateCard.rateCardNumber, "approverName": approverName, "trim": rejectionReason }),
        null, JSON.stringify({ status: 'REJECTED', reason: rejectionReason }), null, null, now.toISOString()],
    });
    if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

    const approval = {
      id: approvalId, tenantId: ctx.tenantId, rateCardId: id, level: currentLevel, approverId: ctx.userId,
      approverName, approverEmail: ctx.userEmail || null, action: 'REJECTED', remarks: rejectionReason, timestamp: now,
    };
    const updated = {
      ...rateCard, status: 'REJECTED', rejectionReason, updatedAt: now,
      approvals: [approval, ...(rateCard.approvals || [])],
    };

    return apiSuccess({
      rateCard: updated,
      message: UI_STRINGS.appApiProcurementRateCardsIdRejectRoute.rateCardRejectedWithReasonRecorded,
    });
  } catch (error: any) {
    console.error('Error rejecting rate card:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToRejectRateCard2 }), 500);
  }
}
