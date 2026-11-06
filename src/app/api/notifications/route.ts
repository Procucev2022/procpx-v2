import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { NOTIFICATION_LIST_DEFAULT_LIMIT, NOTIFICATION_LIST_MAX_LIMIT } from './route.constants';

function notificationVisibilityWhere(ctx: { userId: string; role: string; vendorId?: string | null }) {
  return {
    OR: [
      { userId: ctx.userId },
      { targetRole: ctx.role },
      { userId: null, targetRole: null, vendorId: null },
      ...(ctx.role === 'VENDOR' && ctx.vendorId ? [{ vendorId: ctx.vendorId }] : []),
    ],
  };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const rawLimit = Number(new URL(req.url).searchParams.get('limit'));
  const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, NOTIFICATION_LIST_MAX_LIMIT)
    : NOTIFICATION_LIST_DEFAULT_LIMIT;
  const startedAt = Date.now();

  try {
    const visibilityWhere = notificationVisibilityWhere(ctx);
    const where = { tenantId: ctx.tenantId, ...visibilityWhere };
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { ...where, ...(new URL(req.url).searchParams.get('unread') === 'true' ? { isRead: false } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return apiSuccess({ notifications, unreadCount, limit });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'notification.list_failed', {
      operation: 'list_notifications', route: '/api/notifications',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId,
      userId: ctx.userId, role: ctx.role, limit, durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchNotifications, 500);
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();

  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const requestBody = body as Record<string, unknown>;
    const visibilityWhere = notificationVisibilityWhere(ctx);
    const now = new Date();
    const markAllAsRead = requestBody.markAllAsRead === true;
    const notificationId = typeof requestBody.notificationId === 'string'
      ? requestBody.notificationId.trim().slice(0, 128)
      : '';

    if (!markAllAsRead && !notificationId) {
      return apiError(UI_STRINGS.appApiNotificationsRoute.eitherNotificationIdOrMarkAllAsReadMustBeProvided, 400);
    }

    const result = await prisma.notification.updateMany({
      where: markAllAsRead
        ? { tenantId: ctx.tenantId, isRead: false, ...visibilityWhere }
        : { id: notificationId, tenantId: ctx.tenantId, ...visibilityWhere },
      data: { isRead: true, readAt: now },
    });
    if (!markAllAsRead && result.count === 0) {
      return apiError(UI_STRINGS.common.userMessages.failedToUpdateNotificationStatus, 404);
    }
    return apiSuccess({
      success: true,
      message: markAllAsRead
        ? UI_STRINGS.appApiNotificationsRoute.allNotificationsMarkedAsRead
        : UI_STRINGS.appApiNotificationsRoute.notificationMarkedAsRead,
    });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'notification.read_state_update_failed', {
      operation: 'mark_notification_read', route: '/api/notifications',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId,
      userId: ctx.userId, role: ctx.role, durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateNotificationStatus, 500);
  }
}
