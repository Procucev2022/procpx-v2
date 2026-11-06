// src/app/api/procurement/rate-cards/[id]/message/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '@/lib/rate-card-approval-history.constants';
import {
  decodeRateCardApprovalCursor,
  getRateCardApprovalHistoryMetadata,
  paginateRateCardApprovalHistory,
} from '@/lib/rate-card-approval-history';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const { message } = body;

    if (!message || !message.trim()) {
      return apiError(UI_STRINGS.common.messageTextIsRequired, 400, { route: '/api/procurement/rate-cards/[id]/message', method: 'POST' });
    }

    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id, tenantId: ctx.tenantId },
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
  } catch (error) {
    await writeStructuredLog('error', 'rate_card.clarification_message_create_failed', {
      operation: 'create_rate_card_clarification_message',
      route: '/api/procurement/rate-cards/[id]/message',
      requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      rateCardId: id,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToRecordMessage, 500);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  const cursorParam = req.nextUrl.searchParams.get('cursor');
  const cursor = cursorParam ? decodeRateCardApprovalCursor(cursorParam) : null;

  if (cursorParam && !cursor) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

  try {
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404, { route: '/api/procurement/rate-cards/[id]/message', method: 'GET' });
    }

    const approvals = await prisma.rateCardApproval.findMany({
      where: {
        tenantId: ctx.tenantId,
        rateCardId: id,
        ...(cursor ? {
          OR: [
            { timestamp: { lt: cursor.timestamp } },
            { timestamp: cursor.timestamp, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE + 1,
    });
    const page = paginateRateCardApprovalHistory(approvals);

    return apiSuccess({ approvals: page.approvals, approvalHistory: getRateCardApprovalHistoryMetadata(page) });
  } catch (error) {
    await writeStructuredLog('error', 'rate_card.clarification_messages_read_failed', {
      operation: 'read_rate_card_clarification_messages',
      route: '/api/procurement/rate-cards/[id]/message',
      requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      rateCardId: id,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToGetMessages, 500);
  }
}
