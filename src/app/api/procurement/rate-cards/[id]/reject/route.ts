// src/app/api/procurement/rate-cards/[id]/reject/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const reason = body.reason || body.remarks;

    if (!reason || !reason.trim()) {
      return apiError(UI_STRINGS.common.rejectionReasonRemarksIsMandatory, 400);
    }

    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
      include: { vendor: true },
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

    const updated = await prisma.vendorRateCard.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
        approvals: {
          create: {
            tenantId: ctx.tenantId,
            level: currentLevel,
            approverId: ctx.userId,
            approverName,
            approverEmail: ctx.userEmail || null,
            action: 'REJECTED',
            remarks: reason.trim(),
            timestamp: now,
          },
        },
      },
      include: {
        vendor: true,
        items: true,
        approvals: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: rateCard.vendorId,
      action: 'RATE_CARD_REJECTED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRejectRoute.rateCardRateCardNumberRejectedByApproverNameTrim, { "rateCardNumber": rateCard.rateCardNumber, "approverName": approverName, "trim": reason.trim() }),
      newValue: { status: 'REJECTED', reason: reason.trim() },
    });

    return apiSuccess({
      rateCard: updated,
      message: UI_STRINGS.appApiProcurementRateCardsIdRejectRoute.rateCardRejectedWithReasonRecorded,
    });
  } catch (error: any) {
    console.error('Error rejecting rate card:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToRejectRateCard2 }), 500);
  }
}
