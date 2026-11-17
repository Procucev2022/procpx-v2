// src/app/api/procurement/rate-cards/[id]/revert/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeRateCardTransitionAtomically } from '@/lib/d1-batch';
import { RATE_CARD_REVERT_UPDATE_SQL } from '@/lib/d1-batch.constants';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '@/lib/rate-card-approval-history.constants';
import { logEvent } from '@/lib/observability/server-logger';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const reason = body.reason ?? body.remarks;

    if (typeof reason !== 'string' || !reason.trim()) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsIdRevertRoute.remarksReasonForReturningForCorrectionIsMandatory, 400);
    }

    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { vendor: true, items: true, approvals: {
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
        select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
      } },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404, { route: '/api/procurement/rate-cards/[id]/revert', method: 'POST' });
    }

    const pendingStatuses = ['PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL'];
    if (!pendingStatuses.includes(rateCard.status)) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRevertRoute.cannotReturnRateCardInStatusStatus, { "status": rateCard.status }), 400, { route: '/api/procurement/rate-cards/[id]/revert', method: 'POST' });
    }

    const now = new Date();
    const approverName = ctx.userName || ctx.userEmail || ctx.role;
    const currentLevel = rateCard.status === 'PENDING_FINANCE_APPROVAL' ? 'LEVEL_2_FINANCE' : 'LEVEL_1_PROJECT';

    const approvalId = crypto.randomUUID();
    const correctionReason = reason.trim();
    const changed = await writeRateCardTransitionAtomically({
      updateSql: RATE_CARD_REVERT_UPDATE_SQL,
      updateValues: [correctionReason, now.toISOString(), id, ctx.tenantId, rateCard.status, rateCard.approvalLevel ?? null],
      approvalValues: [approvalId, ctx.tenantId, id, currentLevel, ctx.userId, approverName, ctx.userEmail || null, 'RETURNED_FOR_CORRECTION', correctionReason, now.toISOString()],
      auditValues: [crypto.randomUUID(), ctx.tenantId, ctx.userId, null, 'VENDOR', rateCard.vendorId,
        'RATE_CARD_RETURNED_FOR_CORRECTION', interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdRevertRoute.rateCardRateCardNumberReturnedForCorrectionByApproverNameTrim, { "rateCardNumber": rateCard.rateCardNumber, "approverName": approverName, "trim": correctionReason }),
        null, JSON.stringify({ status: 'RETURNED_FOR_CORRECTION', reason: correctionReason }), null, null, now.toISOString()],
    });
    if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

    const approval = {
      id: approvalId, tenantId: ctx.tenantId, rateCardId: id, level: currentLevel, approverId: ctx.userId,
      approverName, approverEmail: ctx.userEmail || null, action: 'RETURNED_FOR_CORRECTION', remarks: correctionReason, timestamp: now,
    };
    const updated = {
      ...rateCard, status: 'RETURNED_FOR_CORRECTION', revertReason: correctionReason, updatedAt: now,
      approvals: [approval, ...(rateCard.approvals || [])].slice(0, RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE),
    };

    return apiSuccess({
      rateCard: updated,
      message: UI_STRINGS.appApiProcurementRateCardsIdRevertRoute.rateCardReturnedForCorrectionWithRemarksRecorded,
    });
  } catch (error: unknown) {
    logEvent('error', 'rate_card.return_for_correction_failed', {
      operation: 'return_rate_card_for_correction', route: '/api/procurement/rate-cards/[id]/revert', method: 'POST',
      requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
      userId: ctx.userId, role: ctx.role, rateCardId: id, httpStatus: 500,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToReturnRateCardForCorrection, 500, { route: '/api/procurement/rate-cards/[id]/revert', method: 'POST' });
  }
}
