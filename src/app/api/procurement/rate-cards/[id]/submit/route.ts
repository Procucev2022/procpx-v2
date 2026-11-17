// src/app/api/procurement/rate-cards/[id]/submit/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeRateCardTransitionAtomically } from '@/lib/d1-batch';
import { RATE_CARD_SUBMIT_UPDATE_SQL } from '@/lib/d1-batch.constants';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '@/lib/rate-card-approval-history.constants';
import { logEvent } from '@/lib/observability/server-logger';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { items: true, vendor: true, approvals: {
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
        select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
      } },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404, { route: '/api/procurement/rate-cards/[id]/submit', method: 'POST' });
    }

    if (rateCard.items.length === 0) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsIdSubmitRoute.cannotSubmitRateCardWithNoItems, 400, { route: '/api/procurement/rate-cards/[id]/submit', method: 'POST' });
    }

    const submittableStatuses = ['DRAFT', 'RETURNED_FOR_CORRECTION', 'NEGOTIATION', 'UNDER_REVIEW'];
    if (!submittableStatuses.includes(rateCard.status)) {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdSubmitRoute.rateCardCannotBeSubmittedFromStatusStatus, { "status": rateCard.status }), 400, { route: '/api/procurement/rate-cards/[id]/submit', method: 'POST' });
    }

    let remarks = 'Submitted for Level 1 Project Approval';
    try {
      const body = await req.json();
      if (body.remarks) remarks = body.remarks;
    } catch {
      // no body provided, use default remarks
    }

    const now = new Date();
    const submittedBy = ctx.userName || ctx.userEmail || 'Category Manager';
    const approverName = ctx.userName || 'Category Manager';
    const approvalId = crypto.randomUUID();
    const changed = await writeRateCardTransitionAtomically({
      updateSql: RATE_CARD_SUBMIT_UPDATE_SQL,
      updateValues: [submittedBy, now.toISOString(), now.toISOString(), id, ctx.tenantId, rateCard.status, rateCard.approvalLevel],
      approvalValues: [approvalId, ctx.tenantId, id, 'LEVEL_1_PROJECT', ctx.userId, approverName, ctx.userEmail || null, 'SUBMITTED', remarks, now.toISOString()],
      auditValues: [crypto.randomUUID(), ctx.tenantId, ctx.userId, null, 'VENDOR', rateCard.vendorId,
        'RATE_CARD_SUBMITTED', interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdSubmitRoute.rateCardRateCardNumberSubmittedForLevel1ProjectApproval, { "rateCardNumber": rateCard.rateCardNumber }),
        null, JSON.stringify({ status: 'PENDING_PROJECT_APPROVAL', level: 'LEVEL_1_PROJECT' }), null, null, now.toISOString()],
    });
    if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

    const approval = {
      id: approvalId, tenantId: ctx.tenantId, rateCardId: id, level: 'LEVEL_1_PROJECT', approverId: ctx.userId,
      approverName, approverEmail: ctx.userEmail || null, action: 'SUBMITTED', remarks, timestamp: now,
    };
    const updated = {
      ...rateCard,
      status: 'PENDING_PROJECT_APPROVAL',
      approvalLevel: 'LEVEL_1_PROJECT',
      submittedBy,
      submittedAt: now,
      rejectionReason: null,
      revertReason: null,
      updatedAt: now,
      approvals: [approval, ...(rateCard.approvals || [])].slice(0, RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE),
    };

    return apiSuccess({ rateCard: updated, message: UI_STRINGS.appApiProcurementRateCardsIdSubmitRoute.rateCardSubmittedForProjectApproval });
  } catch (error: unknown) {
    logEvent('error', 'rate_card.submission_failed', {
      operation: 'submit_rate_card', route: '/api/procurement/rate-cards/[id]/submit', method: 'POST',
      requestId: req.headers.get('x-request-id') || undefined, tenantId: ctx.tenantId,
      userId: ctx.userId, role: ctx.role, rateCardId: id, httpStatus: 500,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitRateCard, 500, { route: '/api/procurement/rate-cards/[id]/submit', method: 'POST' });
  }
}
