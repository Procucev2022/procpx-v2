import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { runAuditedD1UpdateAtomically } from '../src/lib/audited-update';
import { isApiContext, requireAuth } from '../src/lib/api-utils';
import { POST as createUser } from '../src/app/api/admin/users/route';
import { PUT } from '../src/app/api/admin/users/[id]/route';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: { user: { findFirst: jest.fn(), create: jest.fn() } },
}));
jest.mock('../src/lib/audited-update', () => ({ runAuditedD1UpdateAtomically: jest.fn() }));
jest.mock('../src/lib/password', () => ({ hashPassword: jest.fn(async () => 'hashed-password') }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: () => ({ page: 1, pageSize: 50, skip: 0 }),
}));

const userDb = prisma.user as unknown as { findFirst: jest.Mock; create: jest.Mock };
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const auditedUpdate = runAuditedD1UpdateAtomically as jest.Mock;
const clientAdmin = { tenantId: 'tenant-1', userId: 'admin-1', role: 'CLIENT_ADMIN' };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (method: string, body: unknown, url: string) => new NextRequest(url, {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

describe('admin user routes enforce the user administration policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(clientAdmin);
    isContext.mockReturnValue(true);
    userDb.findFirst.mockResolvedValue(null);
    userDb.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'user-new', ...(data as object) }));
  });

  it('rejects creating a platform administrator from a client administrator account', async () => {
    const response = await createUser(jsonRequest('POST', {
      email: 'new@example.test', name: 'New', role: 'SUPER_ADMIN', password: 'long-enough-password',
    }, 'http://localhost/api/admin/users'));
    expect(response).toEqual({ ok: false, error: UI_STRINGS.libAdminUserPolicy.platformAdminAssignmentForbidden, status: 403 });
    expect(userDb.create).not.toHaveBeenCalled();
  });

  it('rejects unknown roles before the duplicate lookup', async () => {
    const response = await createUser(jsonRequest('POST', {
      email: 'new@example.test', name: 'New', role: 'ROOT', password: 'long-enough-password',
    }, 'http://localhost/api/admin/users'));
    expect(response).toEqual({ ok: false, error: UI_STRINGS.libAdminUserPolicy.unknownRole, status: 400 });
    expect(userDb.findFirst).not.toHaveBeenCalled();
  });

  it('matches duplicate emails case-insensitively and stores the normalised address', async () => {
    userDb.findFirst.mockResolvedValueOnce({ id: 'existing-user' });
    const duplicate = await createUser(jsonRequest('POST', {
      email: '  Ada@Example.TEST ', name: 'Ada', role: 'PROJECT_USER', password: 'long-enough-password',
    }, 'http://localhost/api/admin/users'));
    expect(userDb.findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', email: 'ada@example.test' } });
    expect(duplicate).toMatchObject({ ok: false, status: 400 });
    expect(userDb.create).not.toHaveBeenCalled();

    await createUser(jsonRequest('POST', {
      email: '  Ada@Example.TEST ', name: 'Ada', role: 'PROJECT_USER', password: 'long-enough-password',
    }, 'http://localhost/api/admin/users'));
    expect(userDb.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'ada@example.test', role: 'PROJECT_USER' }),
    }));
  });

  it('rejects editing a platform administrator and changing one’s own role', async () => {
    userDb.findFirst.mockResolvedValueOnce({ id: 'platform-1', email: 'root@example.test', name: 'Root', role: 'SUPER_ADMIN', status: 'ACTIVE' });
    await expect(PUT(jsonRequest('PUT', { status: 'INACTIVE' }, 'http://localhost/api/admin/users/platform-1'), params('platform-1')))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.libAdminUserPolicy.platformAdminAccountProtected, status: 403 });

    userDb.findFirst.mockResolvedValueOnce({ id: 'admin-1', email: 'me@example.test', name: 'Me', role: 'CLIENT_ADMIN', status: 'ACTIVE' });
    await expect(PUT(jsonRequest('PUT', { role: 'VIEWER' }, 'http://localhost/api/admin/users/admin-1'), params('admin-1')))
      .resolves.toEqual({ ok: false, error: UI_STRINGS.libAdminUserPolicy.ownRoleOrStatusChangeForbidden, status: 403 });
    expect(auditedUpdate).not.toHaveBeenCalled();
  });

  it('applies valid changes to other users through the audited update', async () => {
    userDb.findFirst.mockResolvedValueOnce({ id: 'user-2', email: 'pu@example.test', name: 'PU', role: 'PROJECT_USER', status: 'ACTIVE' });
    auditedUpdate.mockResolvedValueOnce({ id: 'user-2' });
    await expect(PUT(jsonRequest('PUT', { role: 'VIEWER', status: 'LOCKED' }, 'http://localhost/api/admin/users/user-2'), params('user-2')))
      .resolves.toEqual({ ok: true, data: { id: 'user-2' }, status: 200 });
    expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'VIEWER', status: 'LOCKED' }),
    }));
  });
});
