// src/app/api/procurement/rate-cards/[id]/approve/route.ts
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
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
      include: { items: true, vendor: true },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError('Rate Card not found', 404);
    }

    let remarks = '';
    try {
      const body = await req.json();
      if (body.remarks) remarks = body.remarks;
    } catch {
      // no body
    }

    const now = new Date();
    const approverName = ctx.userName || ctx.userEmail || ctx.role;

    // Determine current level and role authorisation
    if (rateCard.status === 'PENDING_PROJECT_APPROVAL' || rateCard.approvalLevel === 'LEVEL_1_PROJECT') {
      // Level 1: Project Approver
      const allowedRoles = ['PROJECT_APPROVER', 'SUPER_ADMIN', 'CLIENT_ADMIN'];
      if (!allowedRoles.includes(ctx.role)) {
        return apiError('Forbidden: Only Project Approvers or Admins can perform Level 1 approval', 403);
      }

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'PENDING_FINANCE_APPROVAL',
          approvalLevel: 'LEVEL_2_FINANCE',
          projectApprovedBy: approverName,
          projectApprovedAt: now,
          approvals: {
            create: {
              tenantId: ctx.tenantId,
              level: 'LEVEL_1_PROJECT',
              approverId: ctx.userId,
              approverName,
              approverEmail: ctx.userEmail || null,
              action: 'APPROVED',
              remarks: remarks || 'Level 1 Project Approval granted. Routed to Finance Approver.',
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
        action: 'RATE_CARD_LEVEL1_APPROVED',
        description: `Rate Card ${rateCard.rateCardNumber} approved by Project Approver ${approverName} and routed to Finance`,
        newValue: { status: 'PENDING_FINANCE_APPROVAL', level: 'LEVEL_2_FINANCE' },
      });

      return apiSuccess({
        rateCard: updated,
        message: 'Level 1 Project Approval completed. Request forwarded to Finance Approver.',
      });
    } else if (rateCard.status === 'PENDING_FINANCE_APPROVAL' || rateCard.approvalLevel === 'LEVEL_2_FINANCE') {
      // Level 2: Finance Approver
      const allowedRoles = ['FINANCE_APPROVER', 'FINANCE_USER', 'SUPER_ADMIN', 'CLIENT_ADMIN'];
      if (!allowedRoles.includes(ctx.role)) {
        return apiError('Forbidden: Only Finance Approvers or Admins can perform Level 2 approval', 403);
      }

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvalLevel: 'COMPLETED',
          financeApprovedBy: approverName,
          financeApprovedAt: now,
          approvedBy: approverName,
          approvedAt: now,
          approvals: {
            create: {
              tenantId: ctx.tenantId,
              level: 'LEVEL_2_FINANCE',
              approverId: ctx.userId,
              approverName,
              approverEmail: ctx.userEmail || null,
              action: 'APPROVED',
              remarks: remarks || 'Level 2 Finance Approval granted. Rate Card is now Active.',
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
        action: 'RATE_CARD_LEVEL2_APPROVED',
        description: `Rate Card ${rateCard.rateCardNumber} approved by Finance Approver ${approverName}. Rate Card is now Active.`,
        newValue: { status: 'APPROVED', level: 'COMPLETED' },
      });

      return apiSuccess({
        rateCard: updated,
        message: 'Level 2 Finance Approval completed. Rate Card is now Active and Approved.',
      });
    } else {
      return apiError(`Rate Card is not in a pending approval state (Current status: ${rateCard.status})`, 400);
    }
  } catch (error: any) {
    console.error('Error approving rate card:', error);
    return apiError(error.message || 'Failed to approve rate card', 500);
  }
}
