// src/app/api/procurement/rate-cards/[id]/message/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

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
      return apiError('Message text is required', 400);
    }

    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError('Rate Card not found', 404);
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

    return apiSuccess({ approvalEntry, message: 'Clarification message recorded successfully' });
  } catch (error: any) {
    console.error('Error adding rate card message:', error);
    return apiError(error.message || 'Failed to record message', 500);
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
      return apiError('Rate Card not found', 404);
    }

    return apiSuccess({ approvals: rateCard.approvals });
  } catch (error: any) {
    console.error('Error getting rate card messages:', error);
    return apiError(error.message || 'Failed to get messages', 500);
  }
}
