import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/budgets/categories/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { getUserProjectAccessFilter } from '../src/lib/project-auth';
import { logEvent } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import type { BudgetCategoriesResponse, BudgetCategory, BudgetSubcategory } from '@app-types/app/api/budgets/categories.types';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    project: { findFirst: jest.fn() },
    budgetTransaction: { findMany: jest.fn() },
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

  it('reconciles subcategories from explicit transaction subcategory and line items dynamically', async () => {
    const txFindMany = (db.budgetTransaction as Record<string, jest.Mock>).findMany;
    queryRaw.mockResolvedValueOnce([
      aggregateRow('Interior works', { pendingBudget: 42920, hasUnderApproval: 1, total: 2 }),
      aggregateRow('General', { pendingBudget: 200000, hasUnderApproval: 1, total: 2 }),
    ]);

    txFindMany.mockResolvedValueOnce([
      {
        id: 'tx-1',
        category: 'Interior works',
        subcategory: null,
        amount: 42920,
        status: 'UNDER_APPROVAL',
        reference: 'BOQ-001',
        boqRevisionId: 'rev-1',
        boqRevision: {
          lines: [
            { id: 'l1', standardDescription: 'Civil & Interior works', originalDescription: 'Civil & Interior works', quantity: 20, aiUnitCost: 616, aiTotalCost: 12320, category: { name: 'Interior works' }, subcategory: { name: 'Partitions' } },
            { id: 'l2', standardDescription: 'Civil & Interior works', originalDescription: 'Civil & Interior works', quantity: 30, aiUnitCost: 10, aiTotalCost: 300, category: { name: 'Interior works' }, subcategory: { name: 'Partitions' } },
            { id: 'l3', standardDescription: 'Civil & Interior works', originalDescription: 'Civil & Interior works', quantity: 40, aiUnitCost: 100, aiTotalCost: 4000, category: { name: 'Interior works' }, subcategory: null },
            { id: 'l4', standardDescription: 'Civil & Interior works', originalDescription: 'Civil & Interior works', quantity: 50, aiUnitCost: 250, aiTotalCost: 12500, category: { name: 'Interior works' }, subcategory: null },
            { id: 'l5', standardDescription: 'Civil & Interior works', originalDescription: 'Civil & Interior works', quantity: 60, aiUnitCost: 100, aiTotalCost: 6000, category: { name: 'Interior works' }, subcategory: null },
            { id: 'l6', standardDescription: 'Civil & Interior works', originalDescription: 'Civil & Interior works', quantity: 70, aiUnitCost: 100, aiTotalCost: 7000, category: { name: 'Interior works' }, subcategory: null },
            { id: 'l7', standardDescription: 'Civil & Interior works', originalDescription: 'Civil & Interior works', quantity: 80, aiUnitCost: 10, aiTotalCost: 800, category: { name: 'Interior works' }, subcategory: null },
          ],
        },
      },
      {
        id: 'tx-1b',
        category: 'Interior works',
        subcategory: 'Partitions',
        amount: 5000,
        status: 'UNDER_APPROVAL',
        reference: 'Extra Partitions',
        boqRevisionId: null,
        boqRevision: null,
      },
      {
        id: 'tx-1c',
        category: 'Interior works',
        subcategory: 'Partitions',
        amount: 3000,
        status: 'UNDER_APPROVAL',
        reference: 'Extra Partitions 2',
        boqRevisionId: null,
        boqRevision: null,
      },
      {
        id: 'tx-2',
        category: 'General',
        subcategory: null,
        amount: 200000,
        status: 'UNDER_APPROVAL',
        reference: 'BOQ-004',
        boqRevisionId: 'rev-4',
        boqRevision: {
          lines: [
            { id: 'g1', standardDescription: 'Tiles 600x600', originalDescription: 'Tiles 600x600', quantity: 300, aiUnitCost: 50, aiTotalCost: null, category: null, subcategory: null },
            { id: 'g2', standardDescription: null, originalDescription: 'Copper Cable', quantity: 100, aiUnitCost: null, aiTotalCost: null, category: null, subcategory: null },
            { id: 'g3', standardDescription: null, originalDescription: null, quantity: null, aiUnitCost: null, aiTotalCost: null, category: null, subcategory: null },
          ],
        },
      },
    ]);

    const res = (await GET(request('?projectId=project-1&costCentreId=cc-1'))) as unknown as { ok: boolean; data: BudgetCategoriesResponse };
    expect(res.ok).toBe(true);
    const categories = res.data.categories;
    expect(categories).toHaveLength(2);

    const interior = categories.find((c: BudgetCategory) => c.category === 'Interior works');
    expect(interior).toBeDefined();
    expect(interior?.pendingBudget).toBe(42920);
    expect(interior?.subcategories).toHaveLength(2);
    const partitions = interior?.subcategories?.find((s: BudgetSubcategory) => s.subcategory === 'Partitions');
    expect(partitions).toBeDefined();
    expect(partitions?.pendingBudget).toBeGreaterThan(0);
    const totalInterior = (interior?.subcategories || []).reduce((sum: number, s: BudgetSubcategory) => sum + s.pendingBudget, 0);
    expect(totalInterior).toBe(42920 + 5000 + 3000);

    const general = categories.find((c: BudgetCategory) => c.category === 'General');
    expect(general).toBeDefined();
    expect(general?.pendingBudget).toBe(200000);
    expect(general?.subcategories).toHaveLength(3);
    const subSum = (general?.subcategories || []).reduce((sum: number, s: BudgetSubcategory) => sum + s.pendingBudget, 0);
    expect(subSum).toBe(200000);
    expect(subSum).toBe(general?.pendingBudget);
  });

  it('handles multiple transactions for the same revision matching line categories', async () => {
    projectFindFirst.mockResolvedValueOnce({ id: 'project-1', costCentres: [{ id: 'cc-1', areaSqFt: 0 }] });
    const txFindMany = (db.budgetTransaction as Record<string, jest.Mock>).findMany;
    queryRaw.mockResolvedValueOnce([
      aggregateRow('HVAC', { approvedBudget: 40000, hasApproved: 1, total: 1 }),
      aggregateRow('Firefighting', { approvedBudget: 60000, hasApproved: 1, total: 1 }),
    ]);

    const sharedRevision = {
      lines: [
        { id: 'h1', standardDescription: 'Chiller Unit', originalDescription: 'Chiller Unit', quantity: 1, aiUnitCost: 40000, aiTotalCost: 40000, category: { name: 'HVAC' }, subcategory: null },
        { id: 'f1', standardDescription: 'Sprinklers', originalDescription: 'Sprinklers', quantity: 50, aiUnitCost: 1200, aiTotalCost: 60000, category: { name: 'Firefighting' }, subcategory: null },
      ],
    };

    txFindMany.mockResolvedValueOnce([
      {
        id: 'tx-h',
        category: 'HVAC',
        subcategory: null,
        amount: 40000,
        status: 'APPROVED',
        reference: 'MEP-BOQ',
        boqRevisionId: 'rev-shared',
        boqRevision: sharedRevision,
      },
      {
        id: 'tx-f',
        category: 'Firefighting',
        subcategory: null,
        amount: 60000,
        status: 'APPROVED',
        reference: 'MEP-BOQ',
        boqRevisionId: 'rev-shared',
        boqRevision: sharedRevision,
      },
    ]);

    const res = (await GET(request('?projectId=project-1&costCentreId=cc-1'))) as unknown as { ok: boolean; data: BudgetCategoriesResponse };
    expect(res.ok).toBe(true);
    const hvac = res.data.categories.find((c: BudgetCategory) => c.category === 'HVAC');
    expect(hvac).toBeDefined();
    expect(hvac?.approvedBudget).toBe(40000);
    expect(hvac?.subcategories).toHaveLength(1);
    expect(hvac?.subcategories?.[0].subcategory).toBe('Chiller Unit');
    expect(hvac?.subcategories?.[0].approvedBudget).toBe(40000);

    const ff = res.data.categories.find((c: BudgetCategory) => c.category === 'Firefighting');
    expect(ff).toBeDefined();
    expect(ff?.approvedBudget).toBe(60000);
    expect(ff?.subcategories).toHaveLength(1);
    expect(ff?.subcategories?.[0].subcategory).toBe('Sprinklers');
    expect(ff?.subcategories?.[0].approvedBudget).toBe(60000);
  });

  it('allocates explicit subcategories and falls back to reference when no lines exist', async () => {
    const txFindMany = (db.budgetTransaction as Record<string, jest.Mock>).findMany;
    queryRaw.mockResolvedValueOnce([
      aggregateRow('Electrical', { approvedBudget: 90000, pendingBudget: 15000, hasApproved: 1, hasUnderApproval: 1, total: 1 }),
    ]);

    txFindMany.mockResolvedValueOnce([
      {
        id: 'tx-e1',
        category: 'Electrical',
        subcategory: 'Panel Board',
        amount: 50000,
        status: 'APPROVED',
        reference: 'Direct PO',
        boqRevisionId: null,
        boqRevision: null,
      },
      {
        id: 'tx-e1-approved-2',
        category: 'Electrical',
        subcategory: 'Panel Board',
        amount: 5000,
        status: 'APPROVED',
        reference: 'Direct PO Additional',
        boqRevisionId: null,
        boqRevision: null,
      },
      {
        id: 'tx-e1-pending',
        category: 'Electrical',
        subcategory: 'Panel Board',
        amount: 10000,
        status: 'UNDER_APPROVAL',
        reference: 'Direct PO Addon',
        boqRevisionId: null,
        boqRevision: null,
      },
      {
        id: 'tx-e2',
        category: 'Electrical',
        subcategory: null,
        amount: 35000,
        status: 'APPROVED',
        reference: 'Cables Baseline',
        boqRevisionId: null,
        boqRevision: null,
      },
      {
        id: 'tx-e2-pending',
        category: 'Electrical',
        subcategory: null,
        amount: 5000,
        status: 'UNDER_APPROVAL',
        reference: 'Cables Baseline',
        boqRevisionId: null,
        boqRevision: null,
      },
    ]);

    const res = (await GET(request('?projectId=project-1&costCentreId=cc-1'))) as unknown as { ok: boolean; data: BudgetCategoriesResponse };
    expect(res.ok).toBe(true);
    const electrical = res.data.categories[0];
    expect(electrical.approvedBudget).toBe(90000);
    expect(electrical.pendingBudget).toBe(15000);
    expect(electrical.subcategories).toHaveLength(2);
    expect(electrical.subcategories?.[0].subcategory).toBe('Panel Board');
    expect(electrical.subcategories?.[0].approvedBudget).toBe(55000);
    expect(electrical.subcategories?.[0].pendingBudget).toBe(10000);
    expect(electrical.subcategories?.[1].subcategory).toBe('Cables Baseline');
    expect(electrical.subcategories?.[1].approvedBudget).toBe(35000);
    expect(electrical.subcategories?.[1].pendingBudget).toBe(5000);
    const totalApproved = (electrical.subcategories || []).reduce((acc: number, s: BudgetSubcategory) => acc + s.approvedBudget, 0);
    expect(totalApproved).toBe(electrical.approvedBudget);
    const totalPending = (electrical.subcategories || []).reduce((acc: number, s: BudgetSubcategory) => acc + s.pendingBudget, 0);
    expect(totalPending).toBe(electrical.pendingBudget);
  });
});
