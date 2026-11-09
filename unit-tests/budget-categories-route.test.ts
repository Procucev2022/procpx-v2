import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/budgets/categories/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { getUserProjectAccessFilter } from '../src/lib/project-auth';
import { logEvent } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    project: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: jest.fn((params: URLSearchParams) => {
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 50));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }),
}));
jest.mock('../src/lib/project-auth', () => ({ getUserProjectAccessFilter: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));

const db = prisma as unknown as Record<string, jest.Mock | Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const projectAccessFilter = getUserProjectAccessFilter as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_APPROVER' };
const request = (query = '') => new NextRequest(`http://localhost/api/budgets/categories${query}`);
const projectFindFirst = (db.project as Record<string, jest.Mock>).findFirst;
const queryRaw = db.$queryRaw as jest.Mock;

function aggregateRow(category: string | null, overrides: Record<string, unknown> = {}) {
  return {
    category,
    approvedBudget: 0,
    pendingBudget: 0,
    actual: 0,
    txCount: 0,
    hasApproved: 0,
    hasUnderApproval: 0,
    hasProjectPending: 0,
    hasRejected: 0,
    hasDraft: 0,
    budgetStatus: 'DRAFT',
    total: 0,
    ...overrides,
  };
}

describe('budget categories API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    projectAccessFilter.mockResolvedValue(null);
    projectFindFirst.mockReset().mockResolvedValue({ id: 'project-1', costCentres: [{ id: 'cc-1', areaSqFt: 10 }] });
    queryRaw.mockReset().mockResolvedValue([aggregateRow(null)]);
  });

  it('requires auth and both project and cost-centre scope before reading data', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);

    await expect(GET(request())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectIDIsRequired, status: 400 });
    await expect(GET(request('?projectId=project-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.costCentreIsRequired, status: 400 });
    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('enforces project assignment scope and returns 404 for an inaccessible project or centre', async () => {
    const accessFilter = { OR: [{ team: { some: { userId: 'user-1', active: true } } }] };
    projectAccessFilter.mockResolvedValueOnce(accessFilter);
    projectFindFirst.mockResolvedValueOnce(null);

    await expect(GET(request('?projectId=private-project&costCentreId=cc-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, status: 404,
    });
    expect(projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', id: 'private-project', ...accessFilter },
      select: expect.objectContaining({ costCentres: expect.objectContaining({ where: { id: 'cc-1' } }) }),
    }));
    expect(queryRaw).not.toHaveBeenCalled();

    projectFindFirst.mockResolvedValueOnce({ id: 'project-1', costCentres: [] });
    await expect(GET(request('?projectId=project-1&costCentreId=foreign-cc'))).resolves.toMatchObject({ ok: false, status: 404 });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns exact paged category aggregates, statuses, rates, and a stable scoped SQL query', async () => {
    queryRaw.mockResolvedValueOnce([
      aggregateRow('Electrical', { approvedBudget: 300, actual: 200, txCount: 1, hasApproved: 1, total: 8 }),
      aggregateRow('Civil', { pendingBudget: 50, txCount: 1, hasUnderApproval: 1, budgetStatus: 'UNDER_APPROVAL', total: 8 }),
      aggregateRow('Rejected', { hasRejected: 1, total: 8 }),
      aggregateRow('Partial pending', { approvedBudget: 100, pendingBudget: 20, hasApproved: 1, hasProjectPending: 1, total: 8 }),
      aggregateRow('Partial approved', { approvedBudget: 100, hasApproved: 1, hasRejected: 1, total: 8 }),
      aggregateRow('Draft', { hasDraft: 1, total: 8 }),
      aggregateRow('Finance', { pendingBudget: 25, budgetStatus: 'PENDING FINANCE APPROVAL', total: 8 }),
      aggregateRow('Actual only', { actual: 40, total: 8 }),
    ]);

    await expect(GET(request('?projectId=project-1&costCentreId=cc-1'))).resolves.toMatchObject({
      ok: true,
      data: {
        categories: [
          { category: 'Electrical', budget: 300, approvedBudget: 300, pendingBudget: 0, actual: 200, balance: 100, ratePerSqFt: 30, actualRatePerSqFt: 20, balanceRatePerSqFt: 10, status: 'APPROVED', txCount: 1 },
          { category: 'Civil', budget: 50, status: 'UNDER_APPROVAL' },
          { category: 'Rejected', budget: 0, status: 'REJECTED' },
          { category: 'Partial pending', status: 'UNDER_APPROVAL' },
          { category: 'Partial approved', status: 'APPROVED' },
          { category: 'Draft', status: 'DRAFT' },
          { category: 'Finance', budget: 25, status: 'PENDING FINANCE APPROVAL' },
          { category: 'Actual only', actual: 40, status: 'DRAFT' },
        ],
        categoryPagination: { page: 1, pageSize: 50, total: 8, hasMore: false },
      },
    });

    const aggregateQuery = queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(aggregateQuery.sql).toContain('"tenantId" = ?');
    expect(aggregateQuery.sql).toContain('ORDER BY "category" COLLATE NOCASE ASC, "category" ASC');
    expect(aggregateQuery.sql).toContain('LIMIT ? OFFSET ?');
    expect(aggregateQuery.sql).toContain('UNION');
    expect(aggregateQuery.values).toContain('tenant-1');
    expect(aggregateQuery.values).toContain('project-1');
    expect(aggregateQuery.values).toContain('cc-1');
  });

  it('pages categories and returns an empty page safely when no category rows remain', async () => {
    projectFindFirst.mockResolvedValueOnce({ id: 'project-1', costCentres: [{ id: 'cc-1', areaSqFt: null }] });
    queryRaw.mockResolvedValueOnce([
      aggregateRow('Second', { total: 5 }),
      aggregateRow('Third', { total: 5 }),
    ]);
    await expect(GET(request('?projectId=project-1&costCentreId=cc-1&page=2&pageSize=2'))).resolves.toMatchObject({
      ok: true,
      data: {
        categories: [
          { category: 'Second', ratePerSqFt: null, actualRatePerSqFt: null, balanceRatePerSqFt: null },
          { category: 'Third', ratePerSqFt: null, actualRatePerSqFt: null, balanceRatePerSqFt: null },
        ],
        categoryPagination: { page: 2, pageSize: 2, total: 5, hasMore: true },
      },
    });

    queryRaw.mockResolvedValueOnce([aggregateRow(null, { total: 1 })]);
    await expect(GET(request('?projectId=project-1&costCentreId=cc-1&page=2&pageSize=2'))).resolves.toMatchObject({
      data: { categories: [], categoryPagination: { total: 1, hasMore: false } },
    });
  });

  it('logs failed aggregate reads and returns a safe error', async () => {
    queryRaw.mockRejectedValueOnce(new Error('private category aggregate detail'));
    await expect(GET(request('?projectId=project-1&costCentreId=cc-1'))).resolves.toMatchObject({ ok: false, status: 500 });
    expect(logEvent).toHaveBeenCalledWith('error', 'budget.categories_read_failed', expect.objectContaining({
      operation: 'read_budget_categories', route: '/api/budgets/categories', tenantId: 'tenant-1',
      projectId: 'project-1', costCentreId: 'cc-1', page: 1, pageSize: 50,
    }), 'next');
  });
});
