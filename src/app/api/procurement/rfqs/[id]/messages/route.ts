// src/app/api/procurement/rfqs/[id]/messages/route.ts
// Timestamped, persistent chat and query clarifications for RFQ & Negotiations
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, RFQ_MESSAGE_INSERT_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { RFQ_MESSAGE_CURSOR_SEPARATOR, RFQ_MESSAGE_MAX_PAGE_SIZE, RFQ_MESSAGE_PAGE_SIZE } from './route.constants';
import type { RfqMessageCursor, RfqMessagesRouteContext } from '@app-types/app/api/procurement/rfq-messages.types';


import { READ_ONLY_ROLES } from '@/lib/permissions.constants';
export async function GET(
  req: NextRequest,
  { params }: RfqMessagesRouteContext
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id: rfqId } = await params;
  const { searchParams } = new URL(req.url);
  let vendorId = searchParams.get('vendorId');
  const startedAt = Date.now();
  const requestedPageSize = Number(searchParams.get('pageSize'));
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, RFQ_MESSAGE_MAX_PAGE_SIZE)
    : RFQ_MESSAGE_PAGE_SIZE;
  const cursorValue = searchParams.get('cursor');
  let cursor: RfqMessageCursor | undefined;
  if (cursorValue) {
    const separatorIndex = cursorValue.lastIndexOf(RFQ_MESSAGE_CURSOR_SEPARATOR);
    const cursorDate = separatorIndex > 0 ? new Date(cursorValue.slice(0, separatorIndex)) : new Date(Number.NaN);
    const cursorId = separatorIndex > 0 ? cursorValue.slice(separatorIndex + 1).trim() : '';
    if (!Number.isFinite(cursorDate.getTime()) || !cursorId || cursorId.length > 128) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    cursor = { createdAt: cursorDate, id: cursorId };
  }

  if (ctx.role === 'VENDOR') {
    if (!ctx.vendorId) {
      return apiError(UI_STRINGS.common.forbiddenUnmappedVendorAccount, 403, { route: '/api/procurement/rfqs/[id]/messages', method: 'GET' });
    }
    // Force vendorId to authenticated vendor
    vendorId = ctx.vendorId;
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403, { route: '/api/procurement/rfqs/[id]/messages', method: 'GET' });
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

    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/rfqs/[id]/messages', method: 'GET' });

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      rfqId,
    };

    if (vendorId) {
      where.OR = [
        { vendorId },
        { vendorId: null }, // broadcast announcements from buyer
      ];
    }

    const pageWhere = cursor ? {
      ...where,
      AND: [{
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }],
    } : where;
    const [total, fetchedMessages] = await Promise.all([
      prisma.rfqMessage.count({ where }),
      prisma.rfqMessage.findMany({
        where: pageWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
      }),
    ]);
    const hasMore = fetchedMessages.length > pageSize;
    const pageMessages = fetchedMessages.slice(0, pageSize);
    const oldestMessage = pageMessages[pageMessages.length - 1];
    const nextCursor = hasMore && oldestMessage
      ? `${new Date(oldestMessage.createdAt).toISOString()}${RFQ_MESSAGE_CURSOR_SEPARATOR}${oldestMessage.id}`
      : null;

    return apiSuccess({ messages: pageMessages.reverse(), total, hasMore, nextCursor });
  } catch (error: any) {
    await writeStructuredLog('error', 'procurement.rfq_messages_read_failed', {
      operation: 'read_rfq_messages', route: '/api/procurement/rfqs/[id]/messages',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, rfqId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchMessages2, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;
  if (READ_ONLY_ROLES.includes(ctx.role)) return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403, { route: '/api/procurement/rfqs/[id]/messages', method: 'POST' });

  const { id: rfqId } = await params;
  const startedAt = Date.now();
  let messageId: string | undefined;

  if (ctx.role === 'VENDOR') {
    if (!ctx.vendorId) {
      return apiError(UI_STRINGS.common.forbiddenUnmappedVendorAccount, 403, { route: '/api/procurement/rfqs/[id]/messages', method: 'POST' });
    }
  } else {
    if (!hasPermission(ctx.role, 'RFQ_VIEW')) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403, { route: '/api/procurement/rfqs/[id]/messages', method: 'POST' });
    }
  }

  try {
    const body = await req.json();
    const { message, attachments, vendorId } = body ?? {};

    if (typeof message !== 'string' || !message.trim()) {
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

    if (!rfq) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/rfqs/[id]/messages', method: 'POST' });

    const effectiveVendorId = ctx.role === 'VENDOR' ? ctx.vendorId! : (typeof vendorId === 'string' ? vendorId : null);
    if (effectiveVendorId && ctx.role !== 'VENDOR') {
      const invitation = await prisma.rfqVendor.findFirst({
        where: { tenantId: ctx.tenantId, rfqId, vendorId: effectiveVendorId },
        select: { id: true },
      });
      if (!invitation) return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }
    const isVendorSent = ctx.role === 'VENDOR';
    const senderName = ctx.userName || (isVendorSent ? 'Vendor Representative' : 'Procurement Manager');
    const senderRole = ctx.role;
    messageId = crypto.randomUUID();
    const now = new Date();
    const description = interpolateUiString(
      UI_STRINGS.appApiProcurementRfqsIdMessagesRoute.clarificationMessageSentOnRFQRfqNumberBySenderNameSenderRole,
      { rfqNumber: rfq.rfqNumber, senderName, senderRole },
    );
    const results = await writeD1BatchAtomically([
      {
        sql: RFQ_MESSAGE_INSERT_SQL,
        values: [messageId, ctx.tenantId, rfqId, ctx.userId, senderName, senderRole, message.trim(),
          attachments === undefined ? null : JSON.stringify(attachments), isVendorSent ? 1 : 0, effectiveVendorId, now],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, ctx.userId, rfq.projectId, 'RFQ', rfq.id,
          'CLARIFICATION_MESSAGE_SENT', description, null,
          JSON.stringify({ messageId, vendorId: effectiveVendorId, isVendorSent }), null, null, now],
      },
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }

    return apiSuccess({ message: {
      id: messageId, tenantId: ctx.tenantId, rfqId, senderId: ctx.userId, senderName, senderRole,
      message: message.trim(), attachments: attachments === undefined ? null : JSON.stringify(attachments),
      isVendorSent, vendorId: effectiveVendorId, createdAt: now,
    } }, 201);
  } catch (error: any) {
    await writeStructuredLog('error', 'procurement.rfq_message_send_failed', {
      operation: 'send_rfq_message', route: '/api/procurement/rfqs/[id]/messages',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, rfqId, messageId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSendMessage, 500);
  }
}
