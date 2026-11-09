import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/budgets/transactions/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiSuccess } from '../src/lib/api-utils';
import { logEvent } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    budgetTransaction: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    costCentre: { count: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  getListPageWindow: (params: URLSearchParams) => {
    const page = Number(params.get('page')) || 1;
    const pageSize = Number(params.get('pageSize')) || 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const request = (query = '') => new NextRequest(`http://localhost/api/budgets/transactions${query}`);
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'FINANCE_USER' };

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1', transactionCode: 'BTX-001', budgetDate: new Date('2026-01-15'), category: 'Electrical',
    subcategory: 'Cable', boqId: 'boq-1', boqLineId: 'line-1', reference: 'BOQ-000001 R2', amount: 100,
    quantity: 2, rate: 50, status: 'APPROVED', isReversal: false, reversalReason: null, createdBy: 'user-1',
    createdAt: new Date('2026-01-14'), project: { id: 'project-1', name: 'West Campus' },
    costCentre: { id: 'cc-1', code: 'CC-1', name: 'Electrical' },
    boqLine: { id: 'line-1', lineNumber: '2', originalDescription: 'Cable installation' },
    boqRevision: { revisionCode: 'R2', boq: { boqCode: 'BOQ-000001' } },
    contribution: {
      submittedBy: 'user-2', submittedAt: new Date('2026-01-12'), projectApprovedBy: null,
      projectApprovedAt: null, rejectionReason: null,
      approvals: [
        { approverId: 'user-3', status: 'REJECTED', reason: 'Returned', timestamp: new Date('2026-01-11') },
        { approverId: 'user-4', status: 'APPROVED', reason: null, timestamp: new Date('2026-01-13') },
      ],
    },
    ...overrides,
  };
}

describe('budget transaction ledger API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.budgetTransaction.count.mockResolvedValue(1);
    db.budgetTransaction.findMany.mockResolvedValue([record()]);
    db.budgetTransaction.groupBy.mockResolvedValue([{ category: 'Electrical' }, { category: null }]);
    db.costCentre.count.mockResolvedValue(1);
    db.costCentre.findMany.mockResolvedValue([{ id: 'cc-1', projectId: 'project-1', code: 'CC-1', name: 'Electrical' }]);
    db.user.findMany.mockResolvedValue([
      { id: 'user-1', name: 'Creator', email: 'creator@example.test' },
      { id: 'user-2', name: null, email: 'submitter@example.test' },
      { id: 'user-3', name: 'Approver', email: 'approver@example.test' },
      { id: 'user-4', name: 'Reviewer', email: 'reviewer@example.test' },
    ]);
  });

  it('returns a bounded tenant-scoped page with traceability and user names', async () => {
    const result = await GET(request('?projectId=project-1&page=2&pageSize=25'));

    expect(db.budgetTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', projectId: 'project-1' }, skip: 25, take: 25,
      orderBy: [{ budgetDate: 'desc' }, { id: 'desc' }],
    }));
    expect(result).toMatchObject({ ok: true, data: {
      transactions: [expect.objectContaining({
        id: 'tx-1', boqNumber: 'BOQ-000001', boqRevision: 'R2', boqLineReference: '2',
        createdByName: 'Creator', submitterName: 'submitter@example.test', approverName: 'Reviewer',
        approvedAt: new Date('2026-01-13'), rejectionReason: 'Returned', transactionType: 'ALLOCATION',
      })],
      costCentres: [{ id: 'cc-1' }], categories: ['Electrical'],
      costCentrePagination: { total: 1, page: 1, pageSize: 100, hasMore: false },
      pagination: { total: 1, page: 2, pageSize: 25, totalPages: 1 },
    } });
  });

  it('returns stable, bounded cost-centre option pages without loading the ledger', async () => {
    db.costCentre.count.mockResolvedValueOnce(205);
    db.costCentre.findMany.mockResolvedValueOnce([{ id: 'cc-101', projectId: 'project-1', code: 'CC-101', name: 'Floor 101' }]);

    await GET(request('?onlyCostCentres=true&projectId=project-1&costCentrePage=2'));

    expect(db.costCentre.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', projectId: 'project-1' } });
    expect(db.costCentre.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', projectId: 'project-1' },
      select: { id: true, projectId: true, code: true, name: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: 100, take: 100,
    });
    expect(apiSuccess).toHaveBeenCalledWith({
      costCentres: [{ id: 'cc-101', projectId: 'project-1', code: 'CC-101', name: 'Floor 101' }],
      costCentrePagination: { total: 205, page: 2, pageSize: 100, hasMore: true },
    });
    expect(db.budgetTransaction.count).not.toHaveBeenCalled();
    expect(db.budgetTransaction.findMany).not.toHaveBeenCalled();
    expect(db.budgetTransaction.groupBy).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('applies reversal, pending status, category, and search filters', async () => {
    await GET(request('?costCentreId=cc-1&category=Civil&type=REVERSAL&status=UNDER_APPROVAL&search=needle'));
    expect(db.budgetTransaction.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      tenantId: 'tenant-1', costCentreId: 'cc-1', category: 'Civil', isReversal: true,
      status: { in: ['UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL'] },
      OR: expect.arrayContaining([
        { transactionCode: { contains: 'needle' } },
        { boqRevision: { boq: { boqCode: { contains: 'needle' } } } },
      ]),
    }) });
  });

  it('supports finance status, allocation type, exact status, and empty relation fallbacks', async () => {
    db.budgetTransaction.count.mockResolvedValueOnce(2);
    db.budgetTransaction.findMany.mockResolvedValueOnce([
      record({ id: 'fallback', boqId: null, boqLineId: null, reference: null, boqRevision: null, boqLine: null, contribution: null,
        createdBy: 'unknown-user', project: { id: 'project-1', name: 'West Campus' }, costCentre: { id: 'cc-1', code: 'CC-1', name: 'Electrical' } }),
      record({ id: 'reference-fallback', boqId: null, boqLineId: 'line-123456789', reference: 'BOQ-000777 R3', boqRevision: null,
        boqLine: { id: 'line-123456789', lineNumber: null, originalDescription: 'Fallback line' }, contribution: null,
        createdBy: 'unknown-user', project: { id: 'project-1', name: 'West Campus' }, costCentre: { id: 'cc-1', code: 'CC-1', name: 'Electrical' } }),
      record({ id: 'tx-2', status: 'REJECTED', isReversal: true, contribution: { submittedBy: null, submittedAt: null,
        projectApprovedBy: null, projectApprovedAt: null, rejectionReason: null, approvals: [] } }),
    ]);
    db.user.findMany.mockResolvedValueOnce([]);
    await GET(request('?type=ALLOCATION&status=PENDING_FINANCE_APPROVAL'));
    expect(db.budgetTransaction.count).toHaveBeenLastCalledWith({ where: {
      tenantId: 'tenant-1', isReversal: false, status: { in: ['PENDING_FINANCE_APPROVAL', 'PROJECT_APPROVED'] },
    } });

    await GET(request('?status=REJECTED'));
    expect(db.budgetTransaction.count).toHaveBeenLastCalledWith({ where: { tenantId: 'tenant-1', status: 'REJECTED' } });
    expect(apiSuccess).toHaveBeenNthCalledWith(1, expect.objectContaining({ transactions: expect.arrayContaining([
      expect.objectContaining({ id: 'fallback', boqNumber: '—', boqRevision: 'R0', boqLineReference: '—', approver: null }),
      expect.objectContaining({ id: 'reference-fallback', boqNumber: 'BOQ-000777', boqRevision: 'R3', boqLineReference: 'Line line-123', createdByName: 'unknown-user' }),
    ]) }));
  });

  it('returns an empty page without making a user lookup when there are no transactions', async () => {
    db.budgetTransaction.count.mockResolvedValueOnce(0);
    db.budgetTransaction.findMany.mockResolvedValueOnce([]);
    await expect(GET(request())).resolves.toMatchObject({ ok: true, data: {
      transactions: [], categories: ['Electrical'], pagination: { total: 0, totalPages: 0 },
    } });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('returns the authorization response unchanged', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);
  });

  it('logs and returns a safe error when the ledger query fails', async () => {
    db.budgetTransaction.count.mockRejectedValueOnce(new Error('private db detail'));
    await expect(GET(request('?projectId=project-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchBudgetTransactions, status: 500,
    });
    expect(logEvent).toHaveBeenCalledWith('error', 'budget.transaction_ledger_failed', expect.objectContaining({
      operation: 'list', route: '/api/budgets/transactions', tenantId: 'tenant-1', projectId: 'project-1',
    }), 'next');
  });

  it('logs cost-centre option failures with a stable event name', async () => {
    db.costCentre.count.mockRejectedValueOnce(new Error('private db detail'));

    await expect(GET(request('?onlyCostCentres=true&projectId=project-1'))).resolves.toMatchObject({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchBudgetTransactions, status: 500,
    });
    expect(logEvent).toHaveBeenCalledWith('error', 'budget.cost_centre_filter_options_failed', expect.objectContaining({
      operation: 'list_cost_centre_options', route: '/api/budgets/transactions', tenantId: 'tenant-1', projectId: 'project-1',
    }), 'next');
  });
});
