import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/budgets/[id]/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({ prisma: { budgetContribution: { findFirst: jest.fn() } } }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown) => ({ ok: true, data })),
  apiError: jest.fn((error: string, status: number) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const findFirst = prisma.budgetContribution.findFirst as jest.Mock;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const success = apiSuccess as jest.Mock;
const failure = apiError as jest.Mock;
const log = writeStructuredLog as jest.Mock;
const request = new NextRequest('http://localhost/api/budgets/contribution-1', {
  headers: { 'x-request-id': 'request-1' },
});
const context = { tenantId: 'tenant-1', userId: 'finance-1', role: 'FINANCE_APPROVER' };

describe('budget contribution detail route', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    success.mockImplementation((data: unknown) => ({ ok: true, data }));
    failure.mockImplementation((error: string, status: number) => ({ ok: false, error, status }));
  });

  it('returns detail with all workflow lines and transactions only for the authenticated tenant', async () => {
    const detail = { id: 'contribution-1', boqRevision: { lines: [] }, transactions: [] };
    findFirst.mockResolvedValue(detail);
    await expect(GET(request, { params: Promise.resolve({ id: 'contribution-1' }) })).resolves.toEqual({ ok: true, data: detail });
    expect(auth).toHaveBeenCalledWith('BUDGET_VIEW');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'contribution-1', tenantId: 'tenant-1' },
      include: expect.objectContaining({
        boqRevision: expect.objectContaining({ select: expect.objectContaining({ lines: expect.any(Object) }) }),
        transactions: expect.objectContaining({ orderBy: [{ category: 'asc' }, { id: 'asc' }] }),
      }),
    }));
  });

  it('returns authorization and not-found responses without leaking tenant data', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request, { params: Promise.resolve({ id: 'contribution-1' }) })).resolves.toBe(denied);
    expect(findFirst).not.toHaveBeenCalled();

    findFirst.mockResolvedValueOnce(null);
    await expect(GET(request, { params: Promise.resolve({ id: 'missing' }) })).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
  });

  it('logs safe identifiers and returns a generic response when D1 fails', async () => {
    findFirst.mockRejectedValueOnce(new Error('private query detail'));
    await expect(GET(request, { params: Promise.resolve({ id: 'contribution-1' }) })).resolves.toEqual({
      ok: false, error: UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData, status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'budget.contribution_detail_read_failed', expect.objectContaining({
      requestId: 'request-1', tenantId: 'tenant-1', userId: 'finance-1', contributionId: 'contribution-1',
      error: { name: 'Error' },
    }));
    expect(log.mock.calls[0][2]).not.toHaveProperty('error.message');
  });

  it('handles non-Error D1 failures', async () => {
    findFirst.mockRejectedValueOnce({ private: true });
    await GET(request, { params: Promise.resolve({ id: 'contribution-2' }) });
    expect(log).toHaveBeenCalledWith('error', 'budget.contribution_detail_read_failed', expect.objectContaining({
      error: { name: 'UnknownError' },
    }));
  });

  it.each([
    [{ 'cf-ray': 'ray-2' }, 'ray-2'],
    [{}, undefined],
  ])('uses the Cloudflare request ID fallback when present', async (headers, expectedRequestId) => {
    findFirst.mockRejectedValueOnce(new Error('read failed'));
    const req = new NextRequest('http://localhost/api/budgets/contribution-2', { headers });
    await GET(req, { params: Promise.resolve({ id: 'contribution-2' }) });
    expect(log).toHaveBeenCalledWith('error', 'budget.contribution_detail_read_failed', expect.objectContaining({
      requestId: expectedRequestId,
    }));
  });
});
