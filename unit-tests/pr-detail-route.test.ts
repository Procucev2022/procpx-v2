import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/pr/[id]/route';
import { GET as GETPrLines } from '../src/app/api/pr/[id]/lines/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { PR_DETAIL_LINE_PAGE_SIZE } from '../src/lib/pr-line-pagination.constants';
import { encodePrLineCursor } from '../src/lib/pr-line-pagination';
import { PR_DETAIL_RFQ_PREVIEW_LIMIT } from '../src/app/api/pr/[id]/route.constants';

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
        rfqs: expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: PR_DETAIL_RFQ_PREVIEW_LIMIT + 1,
        }),
        _count: { select: { rfqs: true } },
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

  it('bounds the initial line collection and returns a stable continuation cursor', async () => {
    const lines = Array.from({ length: PR_DETAIL_LINE_PAGE_SIZE + 1 }, (_, index) => ({
      id: `line-${index + 1}`, lineNumber: String(index + 1),
    }));
    db.procurementRequest.findFirst.mockResolvedValueOnce({ id: 'pr-1', lines, rfqs: [] });
    const result = await GET(request(), params());
    expect(result).toMatchObject({
      ok: true,
      data: {
        lines: lines.slice(0, PR_DETAIL_LINE_PAGE_SIZE),
        linePagination: { hasMore: true, nextCursor: expect.any(String), pageSize: PR_DETAIL_LINE_PAGE_SIZE },
      },
    });
    expect(db.procurementRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        lines: expect.objectContaining({ take: PR_DETAIL_LINE_PAGE_SIZE + 1 }),
      }),
    }));
  });

  it('bounds the linked RFQ preview while returning an exact count and truncation signal', async () => {
    const rfqs = Array.from({ length: PR_DETAIL_RFQ_PREVIEW_LIMIT + 1 }, (_, index) => ({
      id: `rfq-${index + 1}`, rfqNumber: `RFQ-${index + 1}`,
    }));
    db.procurementRequest.findFirst.mockResolvedValueOnce({
      id: 'pr-1', lines: [], rfqs, _count: { rfqs: 52 },
    });

    await expect(GET(request(), params())).resolves.toMatchObject({
      ok: true,
      data: {
        rfqs: rfqs.slice(0, PR_DETAIL_RFQ_PREVIEW_LIMIT),
        rfqCount: 52,
        rfqPreviewTruncated: true,
      },
    });
  });

  it('falls back to the selected RFQ preview length for legacy query results without relation counts', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce({
      id: 'pr-1', lines: [], rfqs: [{ id: 'rfq-1' }],
    });

    await expect(GET(request(), params())).resolves.toMatchObject({
      ok: true,
      data: { rfqs: [{ id: 'rfq-1' }], rfqCount: 1, rfqPreviewTruncated: false },
    });
  });

  it('handles a legacy detail result without a line collection and captures Cloudflare request IDs for unknown errors', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce({ id: 'pr-1', lines: undefined, rfqs: [] });
    await expect(GET(request(), params())).resolves.toMatchObject({ ok: true, data: { lines: [], linePagination: { hasMore: false } } });

    db.procurementRequest.findFirst.mockRejectedValueOnce('database failure');
    await expect(GET(new NextRequest('http://localhost/api/pr/pr-1', { headers: { 'cf-ray': 'ray-1' } }), params()))
      .resolves.toMatchObject({ ok: false, status: 500 });
    expect(log).toHaveBeenLastCalledWith('error', 'purchase_request.detail_read_failed', expect.objectContaining({
      requestId: 'ray-1', error: { name: 'UnknownError' },
    }));
  });

  it('pages tenant-scoped PR lines and rejects invalid cursors before querying', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GETPrLines(request(), params())).resolves.toBe(denied);
    expect(db.procurementRequest.findFirst).not.toHaveBeenCalled();

    await expect(GETPrLines(new NextRequest('http://localhost/api/pr/pr-1/lines?cursor=bad'), params()))
      .resolves.toMatchObject({ ok: false, error: UI_STRINGS.appApiPrIdLinesRoute.invalidPurchaseRequestLineCursor, status: 400 });
    expect(db.procurementRequest.findFirst).not.toHaveBeenCalled();

    db.procurementRequest.findFirst.mockResolvedValueOnce({ id: 'pr-1', lines: [] });
    await expect(GETPrLines(request(), params())).resolves.toMatchObject({
      ok: true, data: { lines: [], linePagination: { hasMore: false, nextCursor: null } },
    });
    expect(db.procurementRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      select: expect.objectContaining({ lines: expect.objectContaining({ where: { tenantId: 'tenant-1' }, take: PR_DETAIL_LINE_PAGE_SIZE + 1 }) }),
    }));

    const cursor = encodePrLineCursor({ id: 'line-25', lineNumber: '25' });
    const lines = Array.from({ length: PR_DETAIL_LINE_PAGE_SIZE + 1 }, (_, index) => ({
      id: `line-${index + 26}`, lineNumber: String(index + 26),
    }));
    db.procurementRequest.findFirst.mockResolvedValueOnce({ id: 'pr-1', lines });
    await expect(GETPrLines(new NextRequest(`http://localhost/api/pr/pr-1/lines?cursor=${encodeURIComponent(cursor)}`), params()))
      .resolves.toMatchObject({
        ok: true,
        data: {
          lines: lines.slice(0, PR_DETAIL_LINE_PAGE_SIZE),
          linePagination: { hasMore: true, pageSize: PR_DETAIL_LINE_PAGE_SIZE },
        },
      });
    expect(db.procurementRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'pr-1', tenantId: 'tenant-1' },
      select: expect.objectContaining({
        lines: expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            OR: [
              { lineNumber: { gt: '25' } },
              { lineNumber: '25', id: { gt: 'line-25' } },
            ],
          },
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: PR_DETAIL_LINE_PAGE_SIZE + 1,
        }),
      }),
    }));
  });

  it('returns safe not-found and logged failures for line pages', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(GETPrLines(request(), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404,
    });

    db.procurementRequest.findFirst.mockRejectedValueOnce(new Error('database error'));
    await expect(GETPrLines(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchProcurementRequests, status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'purchase_request.lines_read_failed', expect.objectContaining({
      operation: 'read_purchase_request_lines', route: '/api/pr/[id]/lines', requestId: 'req-1',
      tenantId: 'tenant-1', userId: 'buyer-1', prId: 'pr-1', durationMs: expect.any(Number), error: { name: 'Error' },
    }));

    db.procurementRequest.findFirst.mockRejectedValueOnce('database failure');
    await expect(GETPrLines(new NextRequest('http://localhost/api/pr/pr-1/lines', { headers: { 'cf-ray': 'ray-2' } }), params()))
      .resolves.toMatchObject({ ok: false, status: 500 });
    expect(log).toHaveBeenLastCalledWith('error', 'purchase_request.lines_read_failed', expect.objectContaining({
      requestId: 'ray-2', error: { name: 'UnknownError' },
    }));
  });
});
