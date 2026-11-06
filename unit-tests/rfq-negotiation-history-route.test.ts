import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/procurement/rfqs/[id]/negotiation-history/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { encodeNegotiationHistoryCursor } from '../src/lib/negotiation-history';
import { NEGOTIATION_HISTORY_PAGE_SIZE } from '../src/lib/negotiation-history.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfqVendor: { findFirst: jest.fn() },
    negotiation: { findFirst: jest.fn() },
    negotiationRound: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const buyer = { tenantId: 'tenant-1', userId: 'buyer-1', role: 'PROCUREMENT_USER' };
const negotiation = { id: 'negotiation-1', status: 'ACTIVE', currentRound: 3 };
const params = { params: Promise.resolve({ id: 'rfq-1' }) };
const getRequest = (cursor?: string, vendorId?: string) => {
  const query = new URLSearchParams();
  if (cursor !== undefined) query.set('cursor', cursor);
  if (vendorId !== undefined) query.set('vendorId', vendorId);
  const search = query.size > 0 ? `?${query.toString()}` : '';
  return new NextRequest(`http://localhost/api/procurement/rfqs/rfq-1/negotiation-history${search}`);
};
const round = (index: number) => ({
  id: `round-${index}`,
  vendorId: 'vendor-1',
  roundNumber: index,
  createdAt: new Date(Date.UTC(2026, 10, 5, 0, 0, index)),
  vendor: { id: 'vendor-1', name: 'Vendor One', code: 'V1' },
});

describe('RFQ negotiation history cursor API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
    permission.mockReturnValue(true);
    db.rfqVendor.findFirst.mockResolvedValue({ id: 'invite-1' });
    db.negotiation.findFirst.mockResolvedValue(negotiation);
    db.negotiationRound.findMany.mockResolvedValue([]);
    structuredLog.mockResolvedValue({});
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('returns a bounded tenant-scoped page with a stable next cursor', async () => {
    const rounds = Array.from({ length: NEGOTIATION_HISTORY_PAGE_SIZE + 1 }, (_, index) => round(index + 1));
    db.negotiationRound.findMany.mockResolvedValueOnce(rounds);

    const response = await GET(getRequest(), params);

    expect(response).toMatchObject({
      ok: true,
      data: {
        negotiation,
        rounds: rounds.slice(0, NEGOTIATION_HISTORY_PAGE_SIZE),
        nextCursor: encodeNegotiationHistoryCursor(rounds[NEGOTIATION_HISTORY_PAGE_SIZE - 1]),
        hasMore: true,
        pageSize: NEGOTIATION_HISTORY_PAGE_SIZE,
      },
      status: 200,
    });
    expect(db.negotiation.findFirst).toHaveBeenCalledWith({
      where: { rfqId: 'rfq-1', tenantId: 'tenant-1' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true, currentRound: true },
    });
    expect(db.negotiationRound.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', negotiationId: 'negotiation-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NEGOTIATION_HISTORY_PAGE_SIZE + 1,
      select: expect.objectContaining({ vendor: { select: { id: true, name: true, code: true } } }),
    }));
  });

  it('uses both cursor columns and vendor scope on subsequent vendor pages', async () => {
    const createdAt = new Date('2026-11-05T12:30:45.000Z');
    const cursor = encodeNegotiationHistoryCursor({ id: 'round-older', createdAt });
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.negotiationRound.findMany.mockResolvedValueOnce([round(1)]);

    await GET(getRequest(cursor), params);

    expect(db.rfqVendor.findFirst).toHaveBeenCalledWith({
      where: { rfqId: 'rfq-1', tenantId: 'tenant-1', vendorId: 'vendor-1' },
      select: { id: true },
    });
    expect(db.negotiationRound.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1',
        negotiationId: 'negotiation-1',
        vendorId: 'vendor-1',
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: 'round-older' } },
        ],
      },
    }));
  });

  it('scopes buyer history pages to an invited vendor', async () => {
    db.negotiationRound.findMany.mockResolvedValueOnce([round(1)]);

    await GET(getRequest(undefined, 'vendor-1'), params);

    expect(db.rfqVendor.findFirst).toHaveBeenCalledWith({
      where: { rfqId: 'rfq-1', tenantId: 'tenant-1', vendorId: 'vendor-1' },
      select: { id: true },
    });
    expect(db.negotiationRound.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', negotiationId: 'negotiation-1', vendorId: 'vendor-1' },
    }));
  });

  it('rejects a vendor requesting another vendor history or a malformed vendor scope', async () => {
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    await expect(GET(getRequest(undefined, 'vendor-2'), params)).resolves.toMatchObject({ status: 403 });
    await expect(GET(getRequest(undefined, 'bad%2Fvendor'), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.invalidNegotiationHistoryVendor, status: 400,
    });
    expect(db.negotiation.findFirst).not.toHaveBeenCalled();
  });

  it('rejects invalid cursors and roles before reading negotiation records', async () => {
    await expect(GET(getRequest('bad-cursor'), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.invalidNegotiationHistoryCursor, status: 400,
    });
    permission.mockReturnValueOnce(false);
    await expect(GET(getRequest(), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403,
    });
    expect(db.negotiation.findFirst).not.toHaveBeenCalled();
    expect(db.negotiationRound.findMany).not.toHaveBeenCalled();
  });

  it('returns authentication responses unchanged when the context is not an API user', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);

    await expect(GET(getRequest(), params)).resolves.toBe(denied);
    expect(db.negotiation.findFirst).not.toHaveBeenCalled();
  });

  it('requires vendor mapping and invitation membership and returns empty history cleanly', async () => {
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: null });
    await expect(GET(getRequest(), params)).resolves.toMatchObject({ status: 403 });
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfqVendor.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest(), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRfqsIdRoute.forbiddenYouAreNotInvitedToThisRFQ, status: 403,
    });
    db.negotiation.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest(), params)).resolves.toEqual({
      ok: true,
      data: { rounds: [], nextCursor: null, hasMore: false, pageSize: NEGOTIATION_HISTORY_PAGE_SIZE },
      status: 200,
    });
    expect(db.negotiationRound.findMany).not.toHaveBeenCalled();
  });

  it('logs read failures and keeps the public response safe when logging also fails', async () => {
    db.negotiation.findFirst.mockRejectedValueOnce(new Error('D1 negotiation read failed'));
    structuredLog.mockRejectedValueOnce(new Error('log sink unavailable'));

    await expect(GET(getRequest(), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchNegotiationHistory, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'procurement.rfq_negotiation_history_failed', expect.objectContaining({
      operation: 'read_rfq_negotiation_history', tenantId: 'tenant-1', rfqId: 'rfq-1',
      error: { name: 'Error', message: 'D1 negotiation read failed' },
    }), 'application');
    expect(consoleError).toHaveBeenCalledWith('procurement.rfq_negotiation_history_log_failed', expect.objectContaining({
      loggingError: { name: 'Error' },
    }));
  });

  it('captures non-Error database and logger failures with safe fallback details', async () => {
    db.negotiation.findFirst.mockRejectedValueOnce({ reason: 'D1 unavailable' });
    structuredLog.mockRejectedValueOnce({ reason: 'log sink unavailable' });

    await expect(GET(getRequest(), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchNegotiationHistory, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'procurement.rfq_negotiation_history_failed', expect.objectContaining({
      error: { type: 'object' },
    }), 'application');
    expect(consoleError).toHaveBeenCalledWith('procurement.rfq_negotiation_history_log_failed', expect.objectContaining({
      error: { type: 'object' },
      loggingError: { type: 'object' },
    }));
  });
});
