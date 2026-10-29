// src/app/api/procurement/rate-cards/[id]/submit/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
      include: { items: true, vendor: true },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError('Rate Card not found', 404);
    }

    if (rateCard.items.length === 0) {
      return apiError('Cannot submit rate card with no items', 400);
    }

    const submittableStatuses = ['DRAFT', 'RETURNED_FOR_CORRECTION', 'NEGOTIATION', 'UNDER_REVIEW'];
    if (!submittableStatuses.includes(rateCard.status)) {
      return apiError(`Rate Card cannot be submitted from status: ${rateCard.status}`, 400);
    }

    let remarks = 'Submitted for Level 1 Project Approval';
    try {
      const body = await req.json();
      if (body.remarks) remarks = body.remarks;
    } catch {
      // no body provided, use default remarks
    }

    const now = new Date();
    const updated = await prisma.vendorRateCard.update({
      where: { id },
      data: {
        status: 'PENDING_PROJECT_APPROVAL',
        approvalLevel: 'LEVEL_1_PROJECT',
        submittedBy: ctx.userName || ctx.userEmail || 'Category Manager',
        submittedAt: now,
        rejectionReason: null,
        revertReason: null,
        approvals: {
          create: {
            tenantId: ctx.tenantId,
            level: 'LEVEL_1_PROJECT',
            approverId: ctx.userId,
            approverName: ctx.userName || 'Category Manager',
            approverEmail: ctx.userEmail || null,
            action: 'SUBMITTED',
            remarks,
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
      action: 'RATE_CARD_SUBMITTED',
      description: `Rate Card ${rateCard.rateCardNumber} submitted for Level 1 Project Approval`,
      newValue: { status: 'PENDING_PROJECT_APPROVAL', level: 'LEVEL_1_PROJECT' },
    });

    return apiSuccess({ rateCard: updated, message: 'Rate Card submitted for Project Approval' });
  } catch (error: any) {
    console.error('Error submitting rate card:', error);
    return apiError(error.message || 'Failed to submit rate card', 500);
  }
}
