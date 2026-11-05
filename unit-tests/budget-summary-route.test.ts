import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/budgets/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { getUserProjectAccessFilter } from '../src/lib/project-auth';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    project: { findFirst: jest.fn(), findMany: jest.fn() },
    costCentre: { count: jest.fn() },
    budgetContribution: { groupBy: jest.fn() },
    budgetTransaction: { groupBy: jest.fn() },
    actualCostTransaction: { groupBy: jest.fn() },
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
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({ getUserProjectAccessFilter: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const projectAccessFilter = getUserProjectAccessFilter as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_APPROVER' };
const request = (query = '') => new NextRequest(`http://localhost/api/budgets${query}`);
const date = new Date('2026-01-15T00:00:00.000Z');
type BudgetSummaryFixture = {
  costCentres?: Array<{
    id: string;
    budgetContributions?: Array<{ status: string; acceptedEstimatedValue?: number | null; totalEstimatedValue?: number | null }> | null;
    budgetTransactions?: Array<{ category?: string | null; status: string; amount?: number | null }> | null;
    actualCosts?: Array<{ category?: string | null; actualAmount?: number | null; totalActualAmount?: number | null }> | null;
  }> | null;
};

function contribution(status: string, overrides: Record<string, any> = {}) {
  return { id: `contrib-${status}`, status, acceptedEstimatedValue: 100, totalEstimatedValue: 120, approvals: [], ...overrides };
}

function transaction(overrides: Record<string, any> = {}) {
  return {
    id: 'tx-1', transactionCode: 'BTX-001', budgetDate: date, category: 'Electrical', subcategory: 'Cable',
    boqId: 'boq-1', boqLineId: null, amount: 100, quantity: 2, rate: 50, status: 'APPROVED', isReversal: false,
    reversalReason: null, reference: 'BOQ-000001 R1', createdBy: 'user-1', createdAt: date,
    boqRevision: { revisionCode: 'R1', boq: { boqCode: 'BOQ-000001' } },
    boqLine: { lineNumber: '1' }, contribution: null,
    ...overrides,
  };
}

function costCentre(overrides: Record<string, any> = {}) {
  return {
    id: 'cc-1', code: 'CC-01', name: 'Electrical', areaSqFt: 100, location: 'Floor 1', floorZone: 'East',
    budgetContributions: [], budgetTransactions: [], actualCosts: [], ...overrides,
  };
}

function primeBudgetAggregateGroups(projects: BudgetSummaryFixture[]) {
  const contributions = new Map<string, Map<string, { accepted: number; total: number }>>();
  const transactions = new Map<string, Map<string, { amount: number; count: number }>>();
  for (const project of projects) {
    for (const cc of project.costCentres || []) {
      for (const item of cc.budgetContributions || []) {
        const byStatus = contributions.get(cc.id) || new Map();
        const current = byStatus.get(item.status) || { accepted: 0, total: 0 };
        current.accepted += item.acceptedEstimatedValue || 0;
        current.total += item.totalEstimatedValue || 0;
        byStatus.set(item.status, current);
        contributions.set(cc.id, byStatus);
      }
      for (const item of cc.budgetTransactions || []) {
        const key = item.status;
        const byCategoryStatus = transactions.get(cc.id) || new Map();
        const current = byCategoryStatus.get(key) || { amount: 0, count: 0 };
        current.amount += item.amount || 0;
        current.count += 1;
        byCategoryStatus.set(key, current);
        transactions.set(cc.id, byCategoryStatus);
      }
    }
  }
  db.budgetContribution.groupBy.mockResolvedValueOnce([
    { costCentreId: null, status: 'DRAFT', _sum: { acceptedEstimatedValue: 0, totalEstimatedValue: 0 }, _count: { _all: 1 } },
    ...Array.from(contributions.entries()).flatMap(([costCentreId, byStatus]) =>
      Array.from(byStatus.entries()).map(([status, sums]) => ({ costCentreId, status, _sum: { acceptedEstimatedValue: sums.accepted, totalEstimatedValue: sums.total }, _count: { _all: 1 } }))),
  ]);
  db.budgetTransaction.groupBy.mockResolvedValueOnce([
    { costCentreId: null, status: 'DRAFT', _sum: { amount: 0 }, _count: { _all: 1 } },
    ...Array.from(transactions.entries()).flatMap(([costCentreId, byKey]) =>
      Array.from(byKey.entries()).map(([status, sums]) => ({ costCentreId, status, _sum: { amount: sums.amount }, _count: { _all: sums.count } }))),
  ]);
}

describe('budget summary API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    projectAccessFilter.mockResolvedValue(null);
    db.$queryRaw.mockReset().mockResolvedValue([{ approvedBudget: 0, pendingBudget: 0, actualAmount: 0, costCentreActualsJson: '{}' }]);
    db.project.findFirst.mockReset().mockResolvedValue(null);
    db.costCentre.count.mockReset().mockResolvedValue(0);
    db.budgetContribution.groupBy.mockResolvedValue([]);
    db.budgetTransaction.groupBy.mockResolvedValue([]);
    db.actualCostTransaction.groupBy.mockResolvedValue([]);
  });

  it('authorizes access, requires a bounded project scope, and returns empty aggregates for an empty project', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);

    await expect(GET(request())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.projectIDIsRequired, status: 400,
    });
    expect(db.project.findMany).not.toHaveBeenCalled();

    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request('?projectId=project-empty'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, status: 404,
    });
    expect(db.costCentre.count).not.toHaveBeenCalled();
    expect(db.budgetContribution.groupBy).not.toHaveBeenCalled();
  });

  it('applies project assignment scope before reading budget aggregates', async () => {
    const accessFilter = { OR: [{ team: { some: { userId: 'user-1', active: true } } }] };
    projectAccessFilter.mockResolvedValueOnce(accessFilter);
    db.project.findFirst.mockResolvedValueOnce(null);

    await expect(GET(request('?projectId=other-project'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, status: 404,
    });
    expect(db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', id: 'other-project', ...accessFilter },
    }));
    expect(db.costCentre.count).not.toHaveBeenCalled();
    expect(db.budgetContribution.groupBy).not.toHaveBeenCalled();
    expect(db.budgetTransaction.groupBy).not.toHaveBeenCalled();
    expect(db.actualCostTransaction.groupBy).not.toHaveBeenCalled();
  });

  it('filters the tenant project and cost centre and summarizes budgets, actuals, states, and ledger traceability', async () => {
    const project = {
      id: 'project-1', projectCode: 'P-001', name: 'West Campus', areaSqFt: 1000,
      costCentres: [
        costCentre({
          id: 'cc-approved', code: 'CC-A', name: 'Approved',
          budgetContributions: [contribution('APPROVED', { acceptedEstimatedValue: 1000 })],
          budgetTransactions: [transaction({ id: 'tx-approved', category: 'Electrical', amount: 1000,
            contribution: { submittedBy: 'user-2', submittedAt: date, projectApprovedBy: 'user-3', projectApprovedAt: date,
              rejectionReason: null, approvals: [] } })],
          actualCosts: [{ category: 'Electrical', totalActualAmount: 200, actualAmount: 250 }],
        }),
        costCentre({
          id: 'cc-pending', code: 'CC-P', name: 'Pending', areaSqFt: 0,
          budgetContributions: [contribution('PENDING_PROJECT_APPROVAL', { totalEstimatedValue: 500 })],
          budgetTransactions: [transaction({ id: 'tx-pending', category: 'Civil', amount: 500, status: 'PENDING_PROJECT_APPROVAL',
            boqRevision: null, boqLine: null, boqLineId: 'line-123456789', reference: 'No references here',
            contribution: { submittedBy: null, submittedAt: null, projectApprovedBy: null, projectApprovedAt: null,
              rejectionReason: 'Needs correction', approvals: [{ status: 'REJECTED', reason: 'Rejected in workflow' }] },
          })],
        }),
        costCentre({
          id: 'cc-finance', code: 'CC-F', name: 'Finance', budgetContributions: [contribution('PENDING_FINANCE_APPROVAL')],
          budgetTransactions: [],
        }),
        costCentre({
          id: 'cc-rejected', code: 'CC-R', name: 'Rejected', budgetContributions: [contribution('REJECTED')],
          budgetTransactions: [],
        }),
        costCentre({
          id: 'cc-partial', code: 'CC-PA', name: 'Partial', budgetContributions: [
            contribution('APPROVED', { id: 'approved-part', acceptedEstimatedValue: 300 }), contribution('REJECTED', { id: 'rejected-part' }),
          ],
          budgetTransactions: [transaction({ id: 'tx-partial', status: 'APPROVED', amount: 300,
            boqRevision: { revisionCode: null, boq: { boqCode: null } }, boqLine: null, boqLineId: null,
            reference: 'BOQ-876543 R7', createdBy: 'unknown-user', category: null,
            contribution: { submittedBy: null, submittedAt: null, projectApprovedBy: null, projectApprovedAt: null,
              rejectionReason: null, approvals: [{ status: 'APPROVED', approverId: 'user-3', timestamp: date }, { status: 'REJECTED', reason: 'Needs more detail' }] },
          })],
        }),
        costCentre({
          id: 'cc-tx-pending', code: 'CC-TP', name: 'Transaction fallback', budgetContributions: [],
          budgetTransactions: [
            transaction({ id: 'tx-fallback-approved', amount: 400, contribution: null }),
            transaction({ id: 'tx-fallback-pending', amount: 100, status: 'PENDING_FINANCE_APPROVAL', category: null,
              isReversal: true, reversalReason: 'Correction', contribution: null, reference: '', boqRevision: null, boqLine: null }),
          ],
          actualCosts: [{ category: null, totalActualAmount: null, actualAmount: 50 }],
        }),
        costCentre({
          id: 'cc-actual-only', code: 'CC-AO', name: 'Actual only', areaSqFt: null, budgetContributions: [], budgetTransactions: [],
          actualCosts: [{ category: 'General', totalActualAmount: 0, actualAmount: 70 }],
        }),
      ],
    };
    db.project.findFirst.mockResolvedValueOnce(project);
    db.costCentre.count.mockResolvedValueOnce(7);
    primeBudgetAggregateGroups([project]);
    db.$queryRaw.mockResolvedValueOnce([{
      approvedBudget: 1700, pendingBudget: 720, actualAmount: 320,
      costCentreActualsJson: JSON.stringify({ 'cc-approved': 200, 'cc-tx-pending': 50, 'cc-actual-only': 70 }),
    }]);

    const result = await GET(request('?projectId=project-1'));
    expect(result).toMatchObject({ ok: true, status: 200, data: {
      kpis: {
        totalBudget: 2420, approvedBudget: 1700, pendingApproval: 720, actual: 320, balance: 1380,
        totalAreaSqFt: 1000, ratePerSqFt: 1.7, actualRatePerSqFt: 0.32, balanceRatePerSqFt: 1.38,
      },
      costCentres: [
        { id: 'cc-approved', totalBudget: 1000, approvedBudget: 1000, pendingBudget: 0, actual: 200, balance: 800, budgetStatus: 'APPROVED', ratePerSqFt: 10, categories: [] },
        { id: 'cc-pending', budgetStatus: 'UNDER_APPROVAL', categories: [] },
        { id: 'cc-finance', budgetStatus: 'PENDING FINANCE APPROVAL' },
        { id: 'cc-rejected', budgetStatus: 'REJECTED' },
        { id: 'cc-partial', budgetStatus: 'PARTIALLY APPROVED', categories: [] },
        { id: 'cc-tx-pending', budgetStatus: 'PARTIALLY APPROVED', totalBudget: 500, actual: 50, balance: 350, categories: [] },
        { id: 'cc-actual-only', budgetStatus: 'DRAFT', actual: 70, categories: [] },
      ],
      costCentrePagination: { page: 1, pageSize: 50, total: 7, hasMore: false },
      transactionLedgerUrl: '/api/budgets/transactions',
    } });
    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: 'project-1' },
      select: expect.objectContaining({
        id: true,
        projectCode: true,
        costCentres: expect.objectContaining({
          where: undefined, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: 0, take: 50, select: expect.any(Object),
        }),
      }),
    });
    expect(db.costCentre.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', projectId: 'project-1' } });
    expect(db.project.findMany).not.toHaveBeenCalled();
    expect(db.budgetTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['costCentreId', 'status'], where: expect.objectContaining({
        tenantId: 'tenant-1', projectId: 'project-1', costCentreId: { in: expect.arrayContaining([
          'cc-approved', 'cc-pending', 'cc-finance', 'cc-rejected', 'cc-partial', 'cc-tx-pending', 'cc-actual-only',
        ]) },
      }),
    }));
    const aggregateQuery = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(aggregateQuery.sql).toContain('"isSuperSeded" = 0');
    expect(aggregateQuery.sql).toContain('FROM "cost_centres" AS cc');
    expect(aggregateQuery.values).toContain('tenant-1');
    expect(aggregateQuery.values).toContain('project-1');
  });

  it('supports project and cost-centre filters while rejecting unbounded tenant-wide queries', async () => {
    db.project.findFirst.mockResolvedValue({
      id: 'project-1', projectCode: 'P-001', name: 'North Plant', areaSqFt: 1000, costCentres: [],
    });
    db.costCentre.count.mockResolvedValueOnce(1);
    await GET(request('?projectId=project-1&costCentreId=cc-1'));
    expect(db.project.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', id: 'project-1' },
      select: expect.objectContaining({ costCentres: expect.objectContaining({ where: { id: 'cc-1' }, skip: 0, take: 1 }) }),
    }));
    await expect(GET(request())).resolves.toMatchObject({ ok: false, status: 400 });
    expect(db.project.findFirst).toHaveBeenCalledTimes(1);
  });

  it('pages cost-centre details while keeping project KPIs based on every aggregate group', async () => {
    const allCostCentres = [
      costCentre({ id: 'cc-page-one', budgetContributions: [contribution('APPROVED', { acceptedEstimatedValue: 100 })] }),
      costCentre({ id: 'cc-page-two', budgetContributions: [contribution('APPROVED', { acceptedEstimatedValue: 300 })] }),
    ];
    db.costCentre.count.mockResolvedValueOnce(51);
    db.project.findFirst.mockResolvedValueOnce({
      id: 'project-1', projectCode: 'P-001', name: 'North Plant', areaSqFt: 1000,
      costCentres: [allCostCentres[1]],
    });
    primeBudgetAggregateGroups([{ costCentres: allCostCentres }]);
    db.$queryRaw.mockResolvedValueOnce([{ approvedBudget: 400, pendingBudget: 0, actualAmount: 0 }]);

    await expect(GET(request('?projectId=project-1&page=2&pageSize=25'))).resolves.toMatchObject({
      ok: true,
      data: {
        kpis: { totalBudget: 400, approvedBudget: 400, pendingApproval: 0, actual: 0, totalAreaSqFt: 1000 },
        costCentres: [{ id: 'cc-page-two', totalBudget: 300 }],
        costCentrePagination: { page: 2, pageSize: 25, total: 51, hasMore: true },
      },
    });
    expect(db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        costCentres: expect.objectContaining({ skip: 25, take: 25, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
      }),
    }));
  });

  it('handles draft and rejected ledger states and nullable relation collections', async () => {
    db.costCentre.count.mockResolvedValueOnce(7);
    db.project.findFirst.mockResolvedValueOnce({
      id: 'project-zero', projectCode: 'P-0', name: 'Unmeasured project', areaSqFt: 0,
      costCentres: [
          costCentre({ id: 'cc-draft', budgetContributions: [contribution('DRAFT', { acceptedEstimatedValue: 0, totalEstimatedValue: 0 })], budgetTransactions: [], actualCosts: [] }),
          costCentre({ id: 'cc-rejected-tx', budgetContributions: [], budgetTransactions: [transaction({
            id: 'tx-rejected', status: 'REJECTED', amount: 10, category: 'Rejected', contribution: null,
          })], actualCosts: [] }),
          costCentre({ id: 'cc-finance-tx', budgetContributions: null, budgetTransactions: [transaction({
            id: 'tx-finance', status: 'PENDING_FINANCE_APPROVAL', amount: 20, category: 'Finance', contribution: null,
          })], actualCosts: null }),
          costCentre({ id: 'cc-approved-tx', budgetContributions: [], budgetTransactions: [transaction({
            id: 'tx-approved-fallback', status: 'APPROVED', amount: 40, category: 'Approved fallback', contribution: null,
          })] }),
          costCentre({ id: 'cc-under-approval-tx', budgetContributions: [], budgetTransactions: [transaction({
            id: 'tx-under-approval-fallback', status: 'UNDER_APPROVAL', amount: 30, category: 'Pending fallback', contribution: null,
          })] }),
          costCentre({ id: 'cc-draft-tx', budgetContributions: [], budgetTransactions: [transaction({
            id: 'tx-draft-category', status: 'DRAFT', amount: 5, category: 'Draft category', contribution: null,
          })] }),
          costCentre({ id: 'cc-empty', budgetContributions: null, budgetTransactions: null, actualCosts: null }),
      ],
    });
    primeBudgetAggregateGroups([{
      costCentres: [
        costCentre({ id: 'cc-draft', budgetContributions: [contribution('DRAFT', { acceptedEstimatedValue: 0, totalEstimatedValue: 0 })], budgetTransactions: [], actualCosts: [] }),
        costCentre({ id: 'cc-rejected-tx', budgetContributions: [], budgetTransactions: [transaction({ status: 'REJECTED', amount: 10, category: 'Rejected' })], actualCosts: [] }),
        costCentre({ id: 'cc-finance-tx', budgetContributions: null, budgetTransactions: [transaction({ status: 'PENDING_FINANCE_APPROVAL', amount: 20, category: 'Finance' })], actualCosts: null }),
        costCentre({ id: 'cc-approved-tx', budgetContributions: [], budgetTransactions: [transaction({ status: 'APPROVED', amount: 40, category: 'Approved fallback' })] }),
        costCentre({ id: 'cc-under-approval-tx', budgetContributions: [], budgetTransactions: [transaction({ status: 'UNDER_APPROVAL', amount: 30, category: 'Pending fallback' })] }),
        costCentre({ id: 'cc-draft-tx', budgetContributions: [], budgetTransactions: [transaction({ status: 'DRAFT', amount: 5, category: 'Draft category' })] }),
        costCentre({ id: 'cc-empty', budgetContributions: null, budgetTransactions: null, actualCosts: null }),
      ],
    }]);
    db.$queryRaw.mockResolvedValueOnce([{ approvedBudget: 40, pendingBudget: 50, actualAmount: 0, costCentreActualsJson: '{}' }]);

    await expect(GET(request('?projectId=project-zero'))).resolves.toMatchObject({ ok: true, data: {
      kpis: {
        totalBudget: 90, approvedBudget: 40, pendingApproval: 50, actual: 0, balance: 40,
        totalAreaSqFt: 0, ratePerSqFt: null, actualRatePerSqFt: null, balanceRatePerSqFt: null,
      },
      costCentres: [
        { id: 'cc-draft', budgetStatus: 'DRAFT', totalBudget: 0, categories: [] },
        { id: 'cc-rejected-tx', budgetStatus: 'REJECTED', categories: [] },
        { id: 'cc-finance-tx', budgetStatus: 'DRAFT', categories: [] },
        { id: 'cc-approved-tx', budgetStatus: 'APPROVED', categories: [] },
        { id: 'cc-under-approval-tx', budgetStatus: 'UNDER_APPROVAL', categories: [] },
        { id: 'cc-draft-tx', budgetStatus: 'DRAFT', categories: [] },
        { id: 'cc-empty', budgetStatus: 'DRAFT', categories: [] },
      ],
      transactionLedgerUrl: '/api/budgets/transactions',
    } });
  });

  it('logs aggregate failures with tenant context and returns a safe error', async () => {
    db.project.findFirst.mockResolvedValueOnce({
      id: 'project-1', projectCode: 'P-001', name: 'North Plant', areaSqFt: 1000,
      costCentres: [costCentre({ id: 'cc-1' })],
    });
    db.budgetContribution.groupBy.mockRejectedValueOnce(new Error('private aggregate detail'));
    await expect(GET(request('?projectId=project-1&costCentreId=cc-1'))).resolves.toMatchObject({
      ok: false, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'budget.summary_read_failed', expect.objectContaining({
      operation: 'read_budget_summary', route: '/api/budgets', tenantId: 'tenant-1',
    }), 'next');
  });
});
