// src/app/api/procurement/rate-cards/[id]/message/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { message } = body;

    if (!message || !message.trim()) {
      return apiError(UI_STRINGS.common.messageTextIsRequired, 400, { route: '/api/procurement/rate-cards/[id]/message', method: 'POST' });
    }

    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404, { route: '/api/procurement/rate-cards/[id]/message', method: 'POST' });
    }

    const currentLevel = rateCard.approvalLevel || 'LEVEL_1_PROJECT';
    const now = new Date();

    const approvalEntry = await prisma.rateCardApproval.create({
      data: {
        tenantId: ctx.tenantId,
        rateCardId: id,
        level: currentLevel,
        approverId: ctx.userId,
        approverName: ctx.userName || ctx.userEmail || ctx.role,
        approverEmail: ctx.userEmail || null,
        action: 'CLARIFICATION_MESSAGE',
        remarks: message.trim(),
        timestamp: now,
      },
    });

    return apiSuccess({ approvalEntry, message: UI_STRINGS.appApiProcurementRateCardsIdMessageRoute.clarificationMessageRecordedSuccessfully });
  } catch (error: any) {
    console.error('Error adding rate card message:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToRecordMessage }), 500, { route: '/api/procurement/rate-cards/[id]/message', method: 'POST', error: error });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
      include: {
        approvals: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404, { route: '/api/procurement/rate-cards/[id]/message', method: 'GET' });
    }

    return apiSuccess({ approvals: rateCard.approvals });
  } catch (error: any) {
    console.error('Error getting rate card messages:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToGetMessages }), 500, { route: '/api/procurement/rate-cards/[id]/message', method: 'GET', error: error });
  }
}
