// src/app/api/procurement/ppos/[id]/vendor-issue/route.ts
// Handles Vendor Raising Clarification / Issue on Issued Purchase Order without false acceptance
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('PPO_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id: ppoId } = await params;

  try {
    const body = await req.json();
    const { issueRemarks, raisedBy } = body;

    if (!issueRemarks || !issueRemarks.trim()) {
      return apiError('Issue / clarification description is required', 400);
    }

    const ppo = await prisma.ppo.findFirst({
      where: { id: ppoId, tenantId: ctx.tenantId },
      include: {
        vendor: true,
        project: true,
        rfq: true,
      },
    });

    if (!ppo) {
      return apiError('Purchase Order not found or access denied', 404);
    }

    if (ctx.role === 'VENDOR') {
      if (!ctx.vendorId || ctx.vendorId !== ppo.vendorId) {
        return apiError('Forbidden: you can only raise issues on purchase orders issued to your company', 403);
      }
    }

    const raisedAt = new Date();
    const reporterName = raisedBy || ctx.userName || `${ppo.vendor.name} Representative`;

    // Update PPO: record issue remarks and status WITHOUT false acceptance
    const updated = await prisma.ppo.update({
      where: { id: ppo.id },
      data: {
        vendorStatus: 'ISSUE_RAISED',
        vendorIssueRemarks: issueRemarks.trim(),
        vendorIssueRaisedAt: raisedAt,
        // status remains ISSUED or DRAFT, NOT CONFIRMED
      },
      include: {
        vendor: true,
        project: true,
        rfq: true,
        lines: true,
      },
    });

    // Post clarification to RFQ if linked
    if (ppo.rfqId) {
      await prisma.rfqMessage.create({
        data: {
          tenantId: ctx.tenantId,
          rfqId: ppo.rfqId,
          senderId: ctx.userId,
          senderName: reporterName,
          senderRole: 'VENDOR',
          message: `[PPO CLARIFICATION / ISSUE RAISED] Vendor ${ppo.vendor.name} raised an issue on PPO ${ppo.ppoNumber}: "${issueRemarks.trim()}". PPO acceptance is held pending resolution.`,
          isVendorSent: true,
          vendorId: ppo.vendorId,
        },
      });
    }

    // Audit log
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: ppo.projectId,
      entityType: 'PPO',
      entityId: ppo.id,
      action: 'PPO_VENDOR_ISSUE_RAISED',
      description: `Clarification/Issue raised on Purchase Order ${ppo.ppoNumber} by vendor ${ppo.vendor.name}: ${issueRemarks.trim()}`,
      newValue: {
        vendorStatus: 'ISSUE_RAISED',
        issueRemarks: issueRemarks.trim(),
        raisedBy: reporterName,
        raisedAt,
      },
    });

    // Notify buyer
    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_ISSUE_RAISED',
      recordNumber: ppo.ppoNumber,
      entityId: ppo.id,
      actorName: reporterName,
      details: {
        vendorName: ppo.vendor.name,
        issueRemarks: issueRemarks.trim(),
        amount: ppo.totalValue,
      },
    });

    return apiSuccess({
      ppo: updated,
      message: `Issue successfully logged and routed to the procurement team for review.`,
    });
  } catch (error: any) {
    console.error('Error raising issue on PPO:', error);
    return apiError(error.message || 'Failed to submit issue on Purchase Order', 500);
  }
}
