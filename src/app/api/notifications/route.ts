// src/app/api/notifications/route.ts - In-App Notifications API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

  try {
    const where: any = {
      tenantId: ctx.tenantId,
      OR: [
        { userId: ctx.userId },
        { targetRole: ctx.role },
        { userId: null, targetRole: null },
      ],
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: {
          tenantId: ctx.tenantId,
          isRead: false,
          OR: [
            { userId: ctx.userId },
            { targetRole: ctx.role },
            { userId: null, targetRole: null },
          ],
        },
      }),
    ]);

    return apiSuccess({
      notifications,
      unreadCount,
    });
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToFetchNotifications }), 500);
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { notificationId, markAllAsRead } = body;

    if (markAllAsRead) {
      await prisma.notification.updateMany({
        where: {
          tenantId: ctx.tenantId,
          isRead: false,
          OR: [
            { userId: ctx.userId },
            { targetRole: ctx.role },
          ],
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return apiSuccess({ success: true, message: UI_STRINGS.appApiNotificationsRoute.allNotificationsMarkedAsRead });
    }

    if (notificationId) {
      await prisma.notification.updateMany({
        where: {
          id: notificationId,
          tenantId: ctx.tenantId,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return apiSuccess({ success: true, message: UI_STRINGS.appApiNotificationsRoute.notificationMarkedAsRead });
    }

    return apiError(UI_STRINGS.appApiNotificationsRoute.eitherNotificationIdOrMarkAllAsReadMustBeProvided, 400);
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToUpdateNotificationStatus }), 500);
  }
}
