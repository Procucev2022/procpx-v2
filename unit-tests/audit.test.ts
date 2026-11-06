import { prisma } from '../src/lib/prisma';
import { createAuditLog } from '../src/lib/audit';

jest.mock('../src/lib/prisma', () => ({ prisma: { auditLog: { create: jest.fn() } } }));

const createAuditRecord = (prisma.auditLog as unknown as { create: jest.Mock }).create;

describe('createAuditLog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes audit data and JSON-serializes old and new values', async () => {
    const params = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      projectId: 'project-1',
      entityType: 'PR',
      entityId: 'pr-1',
      action: 'UPDATED',
      description: 'Updated request',
      oldValue: { status: 'DRAFT' },
      newValue: { status: 'SUBMITTED' },
      ipAddress: '127.0.0.1',
      userAgent: 'unit-test',
    };

    await expect(createAuditLog(params)).resolves.toBeUndefined();
    expect(createAuditRecord).toHaveBeenCalledWith({ data: {
      ...params,
      oldValue: JSON.stringify(params.oldValue),
      newValue: JSON.stringify(params.newValue),
    } });
  });

  it('writes null snapshots when values are omitted', async () => {
    await createAuditLog({
      tenantId: 'tenant-1', entityType: 'PR', entityId: 'pr-1', action: 'CREATED', description: 'Created request',
    });

    expect(createAuditRecord).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: undefined,
      projectId: undefined,
      oldValue: null,
      newValue: null,
      ipAddress: undefined,
      userAgent: undefined,
    }) });
  });

  it('does not throw when audit persistence fails', async () => {
    const error = new Error('database unavailable');
    const logError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    createAuditRecord.mockRejectedValueOnce(error);

    await expect(createAuditLog({
      tenantId: 'tenant-1', entityType: 'PR', entityId: 'pr-1', action: 'CREATED', description: 'Created request',
    })).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith('audit.write_failed', expect.objectContaining({
      tenantId: 'tenant-1', entityType: 'PR', entityId: 'pr-1', action: 'CREATED', error,
    }));
    logError.mockRestore();
  });
});
