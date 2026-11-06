import { NextRequest } from 'next/server';
import { GET, PUT } from '../src/app/api/notifications/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({ prisma: { notification: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() } } }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const notificationDb = prisma.notification as unknown as Record<string, jest.Mock>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const logger = writeStructuredLog as jest.Mock;
const ctx = { tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_USER' };
const request = (url = 'http://localhost/api/notifications', body?: unknown) => new NextRequest(url, {
  method: body === undefined ? 'GET' : 'PUT',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe('notifications route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(ctx);
    isContext.mockReturnValue(true);
    notificationDb.findMany.mockResolvedValue([{ id: 'note-1' }]);
    notificationDb.count.mockResolvedValue(2);
    notificationDb.updateMany.mockResolvedValue({ count: 1 });
  });

  it('caps list reads, applies unread filtering, and uses a stable tie-break order', async () => {
    await expect(GET(request('http://localhost/api/notifications?limit=500&unread=true'))).resolves.toMatchObject({
      ok: true, data: { notifications: [{ id: 'note-1' }], unreadCount: 2, limit: 50 },
    });
    expect(notificationDb.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', isRead: false }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    }));
    await GET(request('http://localhost/api/notifications?limit=-4'));
    expect(notificationDb.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 20, where: expect.not.objectContaining({ isRead: false }) }));
  });

  it('keeps read-state changes within the caller visibility scope', async () => {
    await PUT(request('http://localhost/api/notifications', { notificationId: 'note-1' }));
    expect(notificationDb.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'note-1', tenantId: 'tenant-1', OR: [
        { userId: 'user-1' }, { targetRole: 'PROJECT_USER' }, { userId: null, targetRole: null, vendorId: null },
      ] },
    }));
    await PUT(request('http://localhost/api/notifications', { markAllAsRead: true }));
    expect(notificationDb.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', isRead: false, OR: [
        { userId: 'user-1' }, { targetRole: 'PROJECT_USER' }, { userId: null, targetRole: null, vendorId: null },
      ] },
    }));
  });

  it('includes vendor notifications only for the authenticated vendor and keeps read updates scoped', async () => {
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'vendor-user-1', role: 'VENDOR', vendorId: 'vendor-1' });

    await GET(request());
    expect(notificationDb.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', OR: [
        { userId: 'vendor-user-1' }, { targetRole: 'VENDOR' },
        { userId: null, targetRole: null, vendorId: null }, { vendorId: 'vendor-1' },
      ] },
    }));

    await PUT(request('http://localhost/api/notifications', { notificationId: 'vendor-note-1' }));
    expect(notificationDb.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'vendor-note-1', tenantId: 'tenant-1', OR: [
        { userId: 'vendor-user-1' }, { targetRole: 'VENDOR' },
        { userId: null, targetRole: null, vendorId: null }, { vendorId: 'vendor-1' },
      ] },
    }));
  });

  it('handles missing records, invalid bodies, authorization failures, and database errors safely', async () => {
    notificationDb.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(PUT(request('http://localhost/api/notifications', { notificationId: 'other' }))).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(PUT(request('http://localhost/api/notifications', {}))).resolves.toMatchObject({ ok: false, status: 400 });
    notificationDb.findMany.mockRejectedValueOnce(new Error('sensitive database detail'));
    await expect(GET(request())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchNotifications, status: 500 });
    expect(logger).toHaveBeenCalledWith('error', 'notification.list_failed', expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1' }));
    notificationDb.updateMany.mockRejectedValueOnce(new Error('sensitive write detail'));
    await expect(PUT(request('http://localhost/api/notifications', { notificationId: 'note-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateNotificationStatus, status: 500,
    });
    auth.mockResolvedValueOnce({ status: 401 });
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toEqual({ status: 401 });
  });

  it('handles denied PUTs, non-object bodies, and non-Error database failures', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(PUT(request('http://localhost/api/notifications', {}))).resolves.toEqual({ status: 403 });

    await expect(PUT(request('http://localhost/api/notifications', null))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });

    notificationDb.findMany.mockRejectedValueOnce({ cause: 'unavailable' });
    await expect(GET(request())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchNotifications, status: 500,
    });
    expect(logger).toHaveBeenLastCalledWith('error', 'notification.list_failed', expect.objectContaining({
      error: { type: 'object' },
    }));

    notificationDb.updateMany.mockRejectedValueOnce({ cause: 'unavailable' });
    await expect(PUT(request('http://localhost/api/notifications', { notificationId: 'note-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateNotificationStatus, status: 500,
    });
    expect(logger).toHaveBeenLastCalledWith('error', 'notification.read_state_update_failed', expect.objectContaining({
      error: { type: 'object' },
    }));
  });
});
