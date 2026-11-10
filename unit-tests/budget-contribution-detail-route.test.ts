import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/budgets/[id]/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';
import {
  BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE,
  BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE,
} from '../src/lib/budget-contribution-detail.constants';
import {
  encodeBudgetContributionTransactionCursor,
} from '../src/lib/budget-contribution-detail-pagination';
import { encodeBoqLineCursor } from '../src/lib/boq-line-pagination';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    budgetContribution: { findFirst: jest.fn() },
    boqLine: { findMany: jest.fn() },
    budgetTransaction: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown) => ({ ok: true, data })),
  apiError: jest.fn((error: string, status: number) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const findContribution = prisma.budgetContribution.findFirst as jest.Mock;
const findLines = prisma.boqLine.findMany as jest.Mock;
const findTransactions = prisma.budgetTransaction.findMany as jest.Mock;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const success = apiSuccess as jest.Mock;
const failure = apiError as jest.Mock;
const log = writeStructuredLog as jest.Mock;
const request = (query = '') => new NextRequest('http://localhost/api/budgets/contribution-1' + query, {
  headers: { 'x-request-id': 'request-1' },
});
const params = (id = 'contribution-1') => ({ params: Promise.resolve({ id }) });
const context = { tenantId: 'tenant-1', userId: 'finance-1', role: 'FINANCE_APPROVER' };

describe('budget contribution detail route', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    success.mockImplementation((data: unknown) => ({ ok: true, data }));
    failure.mockImplementation((error: string, status: number) => ({ ok: false, error, status }));
    findLines.mockResolvedValue([]);
    findTransactions.mockResolvedValue([]);
  });

  it('returns a bounded detail page scoped to the authenticated tenant', async () => {
    const detail = { id: 'contribution-1', boqRevision: { lines: [] }, transactions: [] };
    findContribution.mockResolvedValue(detail);
    await expect(GET(request(), params())).resolves.toEqual({
      ok: true,
      data: {
        ...detail,
        detailPages: {
          lines: { hasMore: false, nextCursor: null },
          transactions: { hasMore: false, nextCursor: null },
        },
      },
    });
    expect(auth).toHaveBeenCalledWith('BUDGET_VIEW');
    expect(findContribution).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'contribution-1', tenantId: 'tenant-1' },
      include: expect.objectContaining({
        boqRevision: expect.objectContaining({
          select: expect.objectContaining({
            lines: expect.objectContaining({
              where: { tenantId: 'tenant-1', isDeleted: false },
              take: BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE + 1,
              orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
            }),
          }),
        }),
        transactions: expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          take: BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE + 1,
          orderBy: [{ category: 'asc' }, { id: 'asc' }],
        }),
      }),
    }));
  });

  it('returns only the configured preview windows and continuation cursors', async () => {
    const lines = Array.from({ length: BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE + 1 }, (_, index) => ({
      id: 'line-' + String(index + 1),
      lineNumber: String(index + 1),
    }));
    const transactions = Array.from({ length: BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE + 1 }, (_, index) => ({
      id: 'transaction-' + String(index + 1),
      category: 'Category ' + String(index + 1),
    }));
    findContribution.mockResolvedValue({ id: 'contribution-1', boqRevision: { lines }, transactions });

    const result = await GET(request(), params()) as unknown as {
      data: {
        boqRevision: { lines: Array<{ id: string }> };
        transactions: Array<{ id: string }>;
        detailPages: {
          lines: { hasMore: boolean; nextCursor: string | null };
          transactions: { hasMore: boolean; nextCursor: string | null };
        };
      };
    };
    expect(result.data.boqRevision.lines).toHaveLength(BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE);
    expect(result.data.transactions).toHaveLength(BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE);
    expect(result.data.detailPages.lines).toEqual({
      hasMore: true,
      nextCursor: encodeBoqLineCursor({ id: 'line-50', lineNumber: '50' }),
    });
    expect(result.data.detailPages.transactions).toEqual({
      hasMore: true,
      nextCursor: encodeBudgetContributionTransactionCursor({ id: 'transaction-25', category: 'Category 25' }),
    });
  });

  it('continues BOQ line reads with a tenant and revision scoped keyset', async () => {
    const cursor = encodeBoqLineCursor({ id: 'line-50', lineNumber: '50' });
    findContribution.mockResolvedValueOnce({ id: 'contribution-1', boqRevisionId: 'revision-1' });
    findLines.mockResolvedValueOnce([
      { id: 'line-51', lineNumber: '51' },
      { id: 'line-52', lineNumber: '52' },
    ]);

    await expect(GET(request('?section=lines&cursor=' + encodeURIComponent(cursor)), params())).resolves.toEqual({
      ok: true,
      data: { data: [{ id: 'line-51', lineNumber: '51' }, { id: 'line-52', lineNumber: '52' }], hasMore: false, nextCursor: null },
    });
    expect(findContribution).toHaveBeenCalledWith({
      where: { id: 'contribution-1', tenantId: 'tenant-1' },
      select: { id: true, boqRevisionId: true },
    });
    expect(findLines).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1',
        boqRevisionId: 'revision-1',
        isDeleted: false,
        OR: [
          { lineNumber: { gt: '50' } },
          { lineNumber: '50', id: { gt: 'line-50' } },
        ],
      },
      take: BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE + 1,
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
    }));
  });

  it('returns a continuation cursor when another bounded BOQ line page exists', async () => {
    const cursor = encodeBoqLineCursor({ id: 'line-50', lineNumber: '50' });
    const records = Array.from({ length: BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE + 1 }, (_, index) => ({
      id: 'line-' + String(index + 51),
      lineNumber: String(index + 51),
    }));
    findContribution.mockResolvedValueOnce({ id: 'contribution-1', boqRevisionId: 'revision-1' });
    findLines.mockResolvedValueOnce(records);

    const result = await GET(request('?section=lines&cursor=' + encodeURIComponent(cursor)), params()) as unknown as {
      data: { data: Array<{ id: string; lineNumber: string }>; hasMore: boolean; nextCursor: string | null };
    };
    expect(result.data.data).toHaveLength(BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.nextCursor).toBe(encodeBoqLineCursor({ id: 'line-100', lineNumber: '100' }));
  });

  it('returns not found before reading continuation lines outside the tenant', async () => {
    const cursor = encodeBoqLineCursor({ id: 'line-50', lineNumber: '50' });
    findContribution.mockResolvedValueOnce(null);

    await expect(GET(request('?section=lines&cursor=' + encodeURIComponent(cursor)), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    expect(findLines).not.toHaveBeenCalled();
  });

  it('continues transaction reads with a stable category and ID cursor', async () => {
    const cursor = encodeBudgetContributionTransactionCursor({ category: 'Electrical', id: 'transaction-25' });
    findContribution.mockResolvedValueOnce({ id: 'contribution-1' });
    findTransactions.mockResolvedValueOnce([{ id: 'transaction-26', category: 'General' }]);

    await expect(GET(request('?section=transactions&cursor=' + encodeURIComponent(cursor)), params())).resolves.toEqual({
      ok: true,
      data: { data: [{ id: 'transaction-26', category: 'General' }], hasMore: false, nextCursor: null },
    });
    expect(findTransactions).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1',
        contributionId: 'contribution-1',
        OR: [
          { category: { gt: 'Electrical' } },
          { category: 'Electrical', id: { gt: 'transaction-25' } },
        ],
      },
      take: BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE + 1,
      orderBy: [{ category: 'asc' }, { id: 'asc' }],
    }));
  });

  it('returns an empty transaction continuation without a cursor', async () => {
    const cursor = encodeBudgetContributionTransactionCursor({ category: 'Electrical', id: 'transaction-25' });
    findContribution.mockResolvedValueOnce({ id: 'contribution-1' });
    findTransactions.mockResolvedValueOnce([]);

    await expect(GET(request('?section=transactions&cursor=' + encodeURIComponent(cursor)), params())).resolves.toEqual({
      ok: true,
      data: { data: [], hasMore: false, nextCursor: null },
    });
  });

  it('returns a transaction continuation cursor when another bounded page exists', async () => {
    const cursor = encodeBudgetContributionTransactionCursor({ category: 'Electrical', id: 'transaction-25' });
    const records = Array.from({ length: BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE + 1 }, (_, index) => ({
      id: 'transaction-' + String(index + 26),
      category: 'Services',
    }));
    findContribution.mockResolvedValueOnce({ id: 'contribution-1' });
    findTransactions.mockResolvedValueOnce(records);

    const result = await GET(request('?section=transactions&cursor=' + encodeURIComponent(cursor)), params()) as unknown as {
      data: { data: Array<{ id: string; category: string }>; hasMore: boolean; nextCursor: string | null };
    };
    expect(result.data.data).toHaveLength(BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.nextCursor).toBe(encodeBudgetContributionTransactionCursor({
      id: 'transaction-50', category: 'Services',
    }));
  });

  it('handles a contribution without BOQ revision or transactions', async () => {
    findContribution.mockResolvedValueOnce({ id: 'contribution-1', boqRevision: null, transactions: undefined });

    await expect(GET(request(), params())).resolves.toEqual({
      ok: true,
      data: {
        id: 'contribution-1',
        boqRevision: null,
        transactions: [],
        detailPages: {
          lines: { hasMore: false, nextCursor: null },
          transactions: { hasMore: false, nextCursor: null },
        },
      },
    });
  });

  it.each([
    '?section=unknown&cursor=x',
    '?section=lines',
    '?cursor=x',
    '?section=lines&cursor=bad',
    '?section=transactions&cursor=bad',
  ])('rejects malformed detail pagination request %s', async (query) => {
    await expect(GET(request(query), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    expect(findContribution).not.toHaveBeenCalled();
    expect(findLines).not.toHaveBeenCalled();
    expect(findTransactions).not.toHaveBeenCalled();
  });

  it('does not read continuation rows when the contribution is outside the tenant', async () => {
    findContribution.mockResolvedValueOnce(null);
    const cursor = encodeBudgetContributionTransactionCursor({ category: 'Electrical', id: 'transaction-25' });
    await expect(GET(request('?section=transactions&cursor=' + encodeURIComponent(cursor)), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    expect(findTransactions).not.toHaveBeenCalled();
  });

  it('returns authorization and not-found responses without leaking tenant data', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request(), params())).resolves.toBe(denied);
    expect(findContribution).not.toHaveBeenCalled();

    findContribution.mockResolvedValueOnce(null);
    await expect(GET(request(), params('missing'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
  });

  it('logs safe identifiers and returns a generic response when D1 fails', async () => {
    findContribution.mockRejectedValueOnce(new Error('private query detail'));
    await expect(GET(request(), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData, status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'budget.contribution_detail_read_failed', expect.objectContaining({
      requestId: 'request-1', tenantId: 'tenant-1', userId: 'finance-1', contributionId: 'contribution-1',
      error: { name: 'Error' },
    }));
    expect(log.mock.calls[0][2]).not.toHaveProperty('error.message');
  });

  it('handles non-Error continuation failures and logs the section', async () => {
    const cursor = encodeBudgetContributionTransactionCursor({ category: 'Electrical', id: 'transaction-25' });
    findContribution.mockResolvedValueOnce({ id: 'contribution-1' });
    findTransactions.mockRejectedValueOnce({ private: true });
    await expect(GET(request('?section=transactions&cursor=' + encodeURIComponent(cursor)), params())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData, status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'budget.contribution_detail_read_failed', expect.objectContaining({
      section: 'transactions', contributionId: 'contribution-1', error: { name: 'UnknownError' },
    }));
  });

  it.each([
    [{ 'cf-ray': 'ray-2' }, 'ray-2'],
    [{}, undefined],
  ])('uses the Cloudflare request ID fallback when present', async (headers, expectedRequestId) => {
    findContribution.mockRejectedValueOnce(new Error('read failed'));
    const req = new NextRequest('http://localhost/api/budgets/contribution-2', { headers });
    await GET(req, params('contribution-2'));
    expect(log).toHaveBeenCalledWith('error', 'budget.contribution_detail_read_failed', expect.objectContaining({
      requestId: expectedRequestId,
    }));
  });
});
