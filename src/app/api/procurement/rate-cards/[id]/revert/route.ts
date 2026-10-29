// src/app/api/procurement/rate-cards/[id]/revert/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

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
      return apiError('Remarks / reason for returning for correction is mandatory', 400);
    }

    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
      include: { vendor: true },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError('Rate Card not found', 404);
    }

    const pendingStatuses = ['PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL'];
    if (!pendingStatuses.includes(rateCard.status)) {
      return apiError(`Cannot return rate card in status: ${rateCard.status}`, 400);
    }

    const now = new Date();
    const approverName = ctx.userName || ctx.userEmail || ctx.role;
    const currentLevel = rateCard.status === 'PENDING_FINANCE_APPROVAL' ? 'LEVEL_2_FINANCE' : 'LEVEL_1_PROJECT';

    const updated = await prisma.vendorRateCard.update({
      where: { id },
      data: {
        status: 'RETURNED_FOR_CORRECTION',
        revertReason: reason.trim(),
        approvals: {
          create: {
            tenantId: ctx.tenantId,
            level: currentLevel,
            approverId: ctx.userId,
            approverName,
            approverEmail: ctx.userEmail || null,
            action: 'RETURNED_FOR_CORRECTION',
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
      action: 'RATE_CARD_RETURNED_FOR_CORRECTION',
      description: `Rate Card ${rateCard.rateCardNumber} returned for correction by ${approverName}: ${reason.trim()}`,
      newValue: { status: 'RETURNED_FOR_CORRECTION', reason: reason.trim() },
    });

    return apiSuccess({
      rateCard: updated,
      message: 'Rate Card returned for correction with remarks recorded',
    });
  } catch (error: any) {
    console.error('Error returning rate card:', error);
    return apiError(error.message || 'Failed to return rate card for correction', 500);
  }
}
