// app/api/procurement/rfqs/[id]/route.ts
// Detailed RFQ view and status transition/editing endpoint
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  if (ctx.role === 'VENDOR') {
    if (!ctx.vendorId) {
      return apiError('Forbidden: unmapped vendor account', 403);
    }
    const isInvited = await prisma.rfqVendor.findFirst({
      where: { rfqId: id, vendorId: ctx.vendorId, tenantId: ctx.tenantId },
    });
    if (!isInvited) {
      return apiError('Forbidden: you are not invited to this RFQ', 403);
    }
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError('Forbidden: insufficient permissions', 403);
    }
  }

  try {
    const rfq = await prisma.rfq.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
      },
      include: {
        project: true,
        boqRevision: {
          include: {
            approvedBy: { select: { id: true, name: true, email: true } },
          },
        },
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
        invitedVendors: {
          where: ctx.role === 'VENDOR' ? { vendorId: ctx.vendorId! } : undefined,
          include: {
            vendor: true,
          },
        },
        quotes: {
          where: ctx.role === 'VENDOR' ? { vendorId: ctx.vendorId! } : undefined,
          include: {
            vendor: true,
            lines: {
              include: {
                rfqLine: true,
              },
            },
          },
          orderBy: [{ vendorId: 'asc' }, { quoteVersion: 'desc' }],
        },
        negotiations: {
          include: {
            rounds: {
              where: ctx.role === 'VENDOR' ? { vendorId: ctx.vendorId! } : undefined,
              include: {
                vendor: true,
              },
              orderBy: { roundNumber: 'desc' },
            },
          },
        },
        auctions: ctx.role === 'VENDOR' ? false : {
          include: {
            bids: {
              include: { vendor: true },
              orderBy: { timestamp: 'desc' },
            },
          },
        },
        awards: ctx.role === 'VENDOR' ? false : {
          include: {
            recommendedVendor: true,
          },
        },
        ppos: {
          where: ctx.role === 'VENDOR' ? { vendorId: ctx.vendorId! } : undefined,
          include: {
            vendor: true,
          },
        },
      },
    });

    if (!rfq) {
      return apiError('RFQ not found or access denied', 404);
    }

    return apiSuccess({ rfq });
  } catch (error: any) {
    console.error('Error fetching RFQ detail:', error);
    return apiError(error.message || 'Failed to fetch RFQ detail', 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { action, status, reason, ...updateFields } = body;

  const requiredPerm = action === 'RELEASE' ? 'RFQ_RELEASE' : action === 'CANCEL' ? 'RFQ_CANCEL' : 'RFQ_EDIT';
  const ctx = await requireAuth(requiredPerm);
  if (!isApiContext(ctx)) return ctx;

  try {
    const existing = await prisma.rfq.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
      },
      include: {
        invitedVendors: true,
      },
    });

    if (!existing) {
      return apiError('RFQ not found or access denied', 404);
    }

    const updateData: any = {};
    let auditAction = 'RFQ_UPDATED';
    let auditDesc = `RFQ ${existing.rfqNumber} updated`;

    if (action === 'RELEASE' || status === 'RELEASED') {
      if (existing.status !== 'DRAFT' && existing.status !== 'UNDER_REVIEW') {
        return apiError(`Cannot release RFQ in status ${existing.status}`, 400);
      }
      updateData.status = 'RELEASED';
      updateData.releasedAt = new Date();
      auditAction = 'RFQ_RELEASED';
      auditDesc = `RFQ ${existing.rfqNumber} released to ${existing.invitedVendors.length} vendors`;

      // Update invited vendors status to INVITED
      await prisma.rfqVendor.updateMany({
        where: { rfqId: id },
        data: { invitationStatus: 'INVITED' },
      });
    } else if (action === 'CANCEL' || status === 'CANCELLED') {
      if (!reason) {
        return apiError('Cancellation reason is required', 400);
      }
      updateData.status = 'CANCELLED';
      auditAction = 'RFQ_CANCELLED';
      auditDesc = `RFQ ${existing.rfqNumber} cancelled. Reason: ${reason}`;
    } else if (status) {
      updateData.status = status;
      auditDesc = `RFQ ${existing.rfqNumber} status transitioned to ${status}`;
    }

    // Apply allowed field updates if in draft or review
    if (existing.status === 'DRAFT' || existing.status === 'UNDER_REVIEW') {
      if (updateFields.title) updateData.title = updateFields.title;
      if (updateFields.scopeOfWork) updateData.scopeOfWork = updateFields.scopeOfWork;
      if (updateFields.submissionDeadline) updateData.submissionDeadline = new Date(updateFields.submissionDeadline);
      if (updateFields.clarificationDeadline) updateData.clarificationDeadline = new Date(updateFields.clarificationDeadline);
      if (updateFields.deliveryRequirement) updateData.deliveryRequirement = updateFields.deliveryRequirement;
      if (updateFields.paymentTerms) updateData.paymentTerms = updateFields.paymentTerms;
      if (updateFields.taxTerms) updateData.taxTerms = updateFields.taxTerms;
    }

    const updated = await prisma.rfq.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: existing.projectId,
      entityType: 'RFQ',
      entityId: existing.id,
      action: auditAction,
      description: auditDesc,
      oldValue: { status: existing.status },
      newValue: { status: updated.status, reason },
    });

    return apiSuccess({ rfq: updated, message: auditDesc });
  } catch (error: any) {
    console.error('Error updating RFQ:', error);
    return apiError(error.message || 'Failed to update RFQ', 500);
  }
}
