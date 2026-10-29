// src/app/api/procurement/rfqs/[id]/messages/route.ts
// Timestamped, persistent chat and query clarifications for RFQ & Negotiations
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

  const { id: rfqId } = await params;
  const { searchParams } = new URL(req.url);
  let vendorId = searchParams.get('vendorId');

  if (ctx.role === 'VENDOR') {
    if (!ctx.vendorId) {
      return apiError('Forbidden: unmapped vendor account', 403);
    }
    // Force vendorId to authenticated vendor
    vendorId = ctx.vendorId;
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError('Forbidden: insufficient permissions', 403);
    }
  }

  try {
    const rfq = await prisma.rfq.findFirst({
      where: {
        id: rfqId,
        tenantId: ctx.tenantId,
        ...(ctx.role === 'VENDOR'
          ? { invitedVendors: { some: { vendorId: ctx.vendorId! } } }
          : {}),
      },
    });

    if (!rfq) return apiError('RFQ not found or access denied', 404);

    const where: any = {
      tenantId: ctx.tenantId,
      rfqId,
    };

    if (vendorId) {
      where.OR = [
        { vendorId },
        { vendorId: null }, // broadcast announcements from buyer
      ];
    }

    const messages = await prisma.rfqMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return apiSuccess({ messages, total: messages.length });
  } catch (error: any) {
    console.error('Error fetching RFQ messages:', error);
    return apiError(error.message || 'Failed to fetch messages', 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id: rfqId } = await params;

  if (ctx.role === 'VENDOR') {
    if (!ctx.vendorId) {
      return apiError('Forbidden: unmapped vendor account', 403);
    }
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError('Forbidden: insufficient permissions', 403);
    }
  }

  try {
    const body = await req.json();
    const { message, attachments, vendorId, isVendorSent, senderName, senderRole } = body;

    if (!message || !message.trim()) {
      return apiError('Message text is required', 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: {
        id: rfqId,
        tenantId: ctx.tenantId,
        ...(ctx.role === 'VENDOR'
          ? { invitedVendors: { some: { vendorId: ctx.vendorId! } } }
          : {}),
      },
    });

    if (!rfq) return apiError('RFQ not found or access denied', 404);

    const effectiveVendorId = ctx.role === 'VENDOR' ? ctx.vendorId : (vendorId || null);
    const effectiveIsVendorSent = ctx.role === 'VENDOR' ? true : Boolean(isVendorSent);

    const created = await prisma.rfqMessage.create({
      data: {
        tenantId: ctx.tenantId,
        rfqId,
        senderId: ctx.userId,
        senderName: senderName || ctx.userName || (effectiveIsVendorSent ? 'Vendor Representative' : 'Procurement Manager'),
        senderRole: senderRole || (effectiveIsVendorSent ? 'VENDOR' : ctx.role),
        message: message.trim(),
        attachments: attachments ? JSON.stringify(attachments) : null,
        isVendorSent: effectiveIsVendorSent,
        vendorId: effectiveVendorId,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'RFQ',
      entityId: rfq.id,
      action: 'CLARIFICATION_MESSAGE_SENT',
      description: `Clarification message sent on RFQ ${rfq.rfqNumber} by ${created.senderName} (${created.senderRole})`,
    });

    return apiSuccess({ message: created }, 201);
  } catch (error: any) {
    console.error('Error sending RFQ message:', error);
    return apiError(error.message || 'Failed to send message', 500);
  }
}
