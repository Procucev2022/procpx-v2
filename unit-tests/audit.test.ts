import { prisma } from '../src/lib/prisma';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { createAuditLog } from '../src/lib/audit';

jest.mock('../src/lib/prisma', () => ({ prisma: { auditLog: { create: jest.fn() } } }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const createAuditRecord = (prisma.auditLog as unknown as { create: jest.Mock }).create;
const writeLog = writeStructuredLog as jest.MockedFunction<typeof writeStructuredLog>;

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
    const error = Object.assign(new Error('database unavailable'), { code: 'P2002' });
    createAuditRecord.mockRejectedValueOnce(error);

    await expect(createAuditLog({
      tenantId: 'tenant-1', entityType: 'PR', entityId: 'pr-1', action: 'CREATED', description: 'Created request',
      requestId: ' request-123 ', route: '/api/pr/[id]',
    })).resolves.toBeUndefined();
    expect(writeLog).toHaveBeenCalledWith('error', 'audit.write_failed', expect.objectContaining({
      operation: 'create_audit_log', module: 'audit', route: '/api/pr/[id]', requestId: 'request-123',
      tenantId: 'tenant-1', entityType: 'PR', entityId: 'pr-1', action: 'CREATED', status: 'failed',
      durationMs: expect.any(Number), error: { name: 'Error', code: 'P2002' },
    }));
    expect(JSON.stringify(writeLog.mock.calls[0][2])).not.toContain(error.message);
  });

  it('falls back to a safe console event when structured logging fails', async () => {
    const loggerError = Object.assign(new Error('logger backend details'), { code: 'BAD CODE' });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    createAuditRecord.mockRejectedValueOnce({ name: 'unsafe error name', code: 'private value' });
    writeLog.mockRejectedValueOnce(loggerError);

    await expect(createAuditLog({
      tenantId: 'tenant-1', entityType: 'RFQ', entityId: 'rfq-1', action: 'QUOTE_COMPARED', description: 'Compared',
    })).resolves.toBeUndefined();

    expect(writeLog).toHaveBeenCalledWith('error', 'audit.write_failed', expect.objectContaining({
      error: { name: 'Error' },
    }));
    expect(consoleError).toHaveBeenCalledWith('audit.write_failed_log_failed', expect.objectContaining({
      module: 'audit', tenantId: 'tenant-1', entityType: 'RFQ', entityId: 'rfq-1',
      error: { name: 'Error' }, loggingError: { name: 'Error' },
    }));
    expect(JSON.stringify(consoleError.mock.calls[0][1])).not.toContain(loggerError.message);
    consoleError.mockRestore();
  });
});
