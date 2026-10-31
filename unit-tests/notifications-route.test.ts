import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { GET, PUT } from '../src/app/api/notifications/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: { notification: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() } },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const notificationDb = prisma.notification as unknown as {
  findMany: jest.Mock; count: jest.Mock; updateMany: jest.Mock;
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const ctx = { tenantId: 'tenant-1', userId: 'user-1', role: 'BUYER' };
const makeRequest = (url: string, body?: unknown) => new NextRequest(new URL(url, 'http://localhost'), {
  ...(body === undefined ? {} : { method: 'PUT', body: JSON.stringify(body) }),
});

describe('notification listing and read-status routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(ctx);
    isContext.mockReturnValue(true);
    notificationDb.findMany.mockResolvedValue([]);
    notificationDb.count.mockResolvedValue(0);
    notificationDb.updateMany.mockResolvedValue({ count: 1 });
  });

  it('lists visible notifications with default limits and unread-only filtering', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(makeRequest('/api/notifications'))).resolves.toBe(denied);

    const rows = [{ id: 'n-1', message: 'Review needed' }];
    notificationDb.findMany.mockResolvedValueOnce(rows);
    notificationDb.count.mockResolvedValueOnce(4);
    await expect(GET(makeRequest('/api/notifications'))).resolves.toEqual({
      ok: true, data: { notifications: rows, unreadCount: 4 }, status: 200,
    });
    expect(notificationDb.findMany).toHaveBeenLastCalledWith({
      where: {
        tenantId: 'tenant-1',
        OR: [{ userId: 'user-1' }, { targetRole: 'BUYER' }, { userId: null, targetRole: null }],
      },
      orderBy: { createdAt: 'desc' }, take: 20,
    });

    await GET(makeRequest('/api/notifications?unread=true&limit=80'));
    expect(notificationDb.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', isRead: false }), take: 50,
    }));
    expect(notificationDb.count).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', isRead: false }),
    }));
  });

  it('returns readable errors for notification listing failures', async () => {
    notificationDb.findMany.mockRejectedValueOnce(new Error('notification store unavailable'));
    await expect(GET(makeRequest('/api/notifications'))).resolves.toEqual({
      ok: false, error: 'notification store unavailable', status: 500,
    });
    notificationDb.findMany.mockRejectedValueOnce({});
    await expect(GET(makeRequest('/api/notifications'))).resolves.toEqual({
      ok: false, error: 'Failed to fetch notifications', status: 500,
    });
  });

  it('marks all visible notifications or one tenant notification as read', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(PUT(makeRequest('/api/notifications', { markAllAsRead: true }))).resolves.toBe(denied);

    await expect(PUT(makeRequest('/api/notifications', {}))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiNotificationsRoute.eitherNotificationIdOrMarkAllAsReadMustBeProvided, status: 400,
    });
    await expect(PUT(makeRequest('/api/notifications', { markAllAsRead: true }))).resolves.toEqual({
      ok: true, data: { success: true, message: UI_STRINGS.appApiNotificationsRoute.allNotificationsMarkedAsRead }, status: 200,
    });
    expect(notificationDb.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1', isRead: false,
        OR: [{ userId: 'user-1' }, { targetRole: 'BUYER' }],
      },
      data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
    }));

    await expect(PUT(makeRequest('/api/notifications', { notificationId: 'n-7' }))).resolves.toEqual({
      ok: true, data: { success: true, message: UI_STRINGS.appApiNotificationsRoute.notificationMarkedAsRead }, status: 200,
    });
    expect(notificationDb.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'n-7', tenantId: 'tenant-1' }, data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('converts notification update exceptions into API errors', async () => {
    notificationDb.updateMany.mockRejectedValueOnce(new Error('write rejected'));
    await expect(PUT(makeRequest('/api/notifications', { notificationId: 'n-1' }))).resolves.toEqual({
      ok: false, error: 'write rejected', status: 500,
    });
    notificationDb.updateMany.mockRejectedValueOnce({});
    await expect(PUT(makeRequest('/api/notifications', { markAllAsRead: true }))).resolves.toEqual({
      ok: false, error: 'Failed to update notification status', status: 500,
    });
  });
});
