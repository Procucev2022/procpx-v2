// src/app/api/procurement/rfqs/[id]/messages/route.ts
// Timestamped, persistent chat and query clarifications for RFQ & Negotiations
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


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
      return apiError(UI_STRINGS.common.forbiddenUnmappedVendorAccount, 403);
    }
    // Force vendorId to authenticated vendor
    vendorId = ctx.vendorId;
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
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

    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);

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
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchMessages2 }), 500);
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
      return apiError(UI_STRINGS.common.forbiddenUnmappedVendorAccount, 403);
    }
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }
  }

  try {
    const body = await req.json();
    const { message, attachments, vendorId, isVendorSent, senderName, senderRole } = body;

    if (!message || !message.trim()) {
      return apiError(UI_STRINGS.common.messageTextIsRequired, 400);
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

    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);

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
      description: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdMessagesRoute.clarificationMessageSentOnRFQRfqNumberBySenderNameSenderRole, { "rfqNumber": rfq.rfqNumber, "senderName": created.senderName, "senderRole": created.senderRole }),
    });

    return apiSuccess({ message: created }, 201);
  } catch (error: any) {
    console.error('Error sending RFQ message:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSendMessage }), 500);
  }
}
