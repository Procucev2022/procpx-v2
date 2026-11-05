import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/pr/[id]/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: { procurementRequest: { findFirst: jest.fn() } },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as { procurementRequest: { findFirst: jest.Mock } };
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const log = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1' };
const request = () => new NextRequest('http://localhost/api/pr/pr-1', { headers: { 'x-request-id': 'req-1' } });
const params = (id = 'pr-1') => ({ params: Promise.resolve({ id }) });

describe('purchase request detail API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.procurementRequest.findFirst.mockResolvedValue({ id: 'pr-1', status: 'PR_APPROVED', lines: [], rfqs: [] });
    log.mockResolvedValue(undefined);
  });

  it('checks authorization before reading and scopes details to the tenant', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request(), params())).resolves.toBe(denied);
    expect(db.procurementRequest.findFirst).not.toHaveBeenCalled();

    await expect(GET(request(), params())).resolves.toMatchObject({ ok: true, data: { id: 'pr-1' } });
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pr-1', tenantId: 'tenant-1' },
      select: expect.objectContaining({
        lines: expect.objectContaining({
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          select: expect.objectContaining({
            itemDescription: true,
            boqLine: { select: expect.objectContaining({ itemCode: true, standardDescription: true }) },
          }),
        }),
        rfqs: expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      }),
    }));
    const query = db.procurementRequest.findFirst.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('approvals');
    expect(query).not.toHaveProperty('include');
  });

  it('returns not-found safely and logs query failures with identifiers and duration', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request(), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('database error'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchProcurementRequests, status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'purchase_request.detail_read_failed', expect.objectContaining({
      operation: 'read_purchase_request_detail',
      route: '/api/pr/[id]',
      requestId: 'req-1',
      tenantId: 'tenant-1',
      userId: 'buyer-1',
      prId: 'pr-1',
      durationMs: expect.any(Number),
      error: { name: 'Error' },
    }));
  });
});
