import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/budgets/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const request = (query = '') => new NextRequest(`http://localhost/api/budgets${query}`);
const date = new Date('2026-01-15T00:00:00.000Z');

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

describe('budget summary API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
  });

  it('authorizes access and returns empty aggregates when no project data exists', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);

    db.project.findMany.mockResolvedValueOnce(null);
    await expect(GET(request())).resolves.toEqual({ ok: true, status: 200, data: {
      kpis: {
        totalBudget: 0, approvedBudget: 0, pendingApproval: 0, actual: 0, balance: 0,
        totalAreaSqFt: 0, ratePerSqFt: null, actualRatePerSqFt: null, balanceRatePerSqFt: null,
      },
      costCentres: [], transactions: [],
    } });
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
    db.project.findMany.mockResolvedValueOnce([project]);
    db.user.findMany.mockResolvedValueOnce([
      { id: 'user-1', name: 'Created by', email: 'created@example.test' },
      { id: 'user-2', name: null, email: 'submitter@example.test' },
      { id: 'user-3', name: 'Approver', email: 'approver@example.test' },
    ]);

    const result = await GET(request('?projectId=project-1'));
    expect(result).toMatchObject({ ok: true, status: 200, data: {
      kpis: {
        totalBudget: 2420, approvedBudget: 1700, pendingApproval: 720, actual: 320, balance: 1380,
        totalAreaSqFt: 1000, ratePerSqFt: 1.7, actualRatePerSqFt: 0.32, balanceRatePerSqFt: 1.38,
      },
      costCentres: [
        { id: 'cc-approved', totalBudget: 1000, approvedBudget: 1000, pendingBudget: 0, actual: 200, balance: 800, budgetStatus: 'APPROVED', ratePerSqFt: 10,
          categories: [{ category: 'Electrical', budget: 1000, approvedBudget: 1000, actual: 200, balance: 800, status: 'APPROVED', txCount: 1 }] },
        { id: 'cc-pending', budgetStatus: 'UNDER_APPROVAL', categories: [{ category: 'Civil', status: 'UNDER_APPROVAL', approvedBudget: 0, pendingBudget: 500 }] },
        { id: 'cc-finance', budgetStatus: 'PENDING FINANCE APPROVAL' },
        { id: 'cc-rejected', budgetStatus: 'REJECTED' },
        { id: 'cc-partial', budgetStatus: 'PARTIALLY APPROVED', categories: [{ category: 'General', status: 'APPROVED', approvedBudget: 300, actual: 0 }] },
        { id: 'cc-tx-pending', budgetStatus: 'PARTIALLY APPROVED', totalBudget: 500, actual: 50, balance: 350,
          categories: [{ category: 'Electrical', status: 'APPROVED' }, { category: 'General', actual: 50 }] },
        { id: 'cc-actual-only', budgetStatus: 'DRAFT', actual: 70 },
      ],
      transactions: expect.arrayContaining([
        expect.objectContaining({ id: 'tx-approved', boqNumber: 'BOQ-000001', boqRevision: 'R1', boqLineReference: '1',
          createdByName: 'Created by', submitterName: 'submitter@example.test', approverName: 'Approver',
          transactionType: 'ALLOCATION', rejectionReason: null }),
        expect.objectContaining({ id: 'tx-pending', boqNumber: '—', boqRevision: 'R0', boqLineReference: 'Line line-123',
          createdByName: 'Created by', submitter: 'user-1', approverName: null, rejectionReason: 'Needs correction' }),
        expect.objectContaining({ id: 'tx-partial', boqNumber: 'BOQ-876543', boqRevision: 'R7', boqLineReference: '—',
          createdByName: 'unknown-user', submitterName: 'unknown-user', approverName: 'Approver', rejectionReason: 'Needs more detail' }),
        expect.objectContaining({ id: 'tx-fallback-pending', transactionType: 'REVERSAL', description: 'null Budget Allocation',
          boqNumber: '—', boqRevision: 'R0', boqLineReference: '—', approver: null, reversalReason: 'Correction' }),
      ]),
    } });
    expect(db.project.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: 'project-1' },
      include: { costCentres: expect.objectContaining({ where: undefined }) },
    });
    expect(db.user.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' }, select: { id: true, name: true, email: true } });
  });

  it('supports all-project and all-cost-centre queries', async () => {
    await GET(request('?projectId=project-1&costCentreId=cc-1'));
    expect(db.project.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', id: 'project-1' }, include: { costCentres: expect.objectContaining({ where: { id: 'cc-1' } }) },
    }));
    await GET(request());
    expect(db.project.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' }, include: { costCentres: expect.objectContaining({ where: undefined }) },
    }));
  });

  it('handles draft and rejected ledger states and nullable relation collections', async () => {
    db.project.findMany.mockResolvedValueOnce([
      {
        id: 'project-zero', projectCode: 'P-0', name: 'Unmeasured project', areaSqFt: 0,
        costCentres: [
          costCentre({ id: 'cc-draft', budgetContributions: [contribution('DRAFT', { acceptedEstimatedValue: 0, totalEstimatedValue: 0 })], budgetTransactions: [], actualCosts: [] }),
          costCentre({ id: 'cc-rejected-tx', budgetContributions: [], budgetTransactions: [transaction({
            id: 'tx-rejected', status: 'REJECTED', amount: 10, category: 'Rejected', contribution: null,
          })], actualCosts: [] }),
          costCentre({ id: 'cc-finance-tx', budgetContributions: null, budgetTransactions: [transaction({
            id: 'tx-finance', status: 'PENDING_FINANCE_APPROVAL', amount: 20, category: 'Finance', contribution: null,
          })], actualCosts: null }),
          costCentre({ id: 'cc-empty', budgetContributions: null, budgetTransactions: null, actualCosts: null }),
        ],
      },
      { id: 'project-no-cost-centres', projectCode: 'P-NULL', name: 'No cost centres', areaSqFt: null, costCentres: null },
    ]);

    await expect(GET(request())).resolves.toMatchObject({ ok: true, data: {
      kpis: {
        totalBudget: 20, approvedBudget: 0, pendingApproval: 20, actual: 0, balance: 0,
        totalAreaSqFt: 0, ratePerSqFt: null, actualRatePerSqFt: null, balanceRatePerSqFt: null,
      },
      costCentres: [
        { id: 'cc-draft', budgetStatus: 'DRAFT', totalBudget: 0, categories: [] },
        { id: 'cc-rejected-tx', budgetStatus: 'REJECTED', categories: [{ category: 'Rejected', status: 'REJECTED', budget: 0, txCount: 1 }] },
        { id: 'cc-finance-tx', budgetStatus: 'DRAFT', categories: [{ category: 'Finance', status: 'DRAFT', budget: 20, pendingBudget: 20 }] },
        { id: 'cc-empty', budgetStatus: 'DRAFT', categories: [] },
      ],
      transactions: expect.arrayContaining([
        expect.objectContaining({ id: 'tx-rejected', status: 'REJECTED', approver: null, rejectionReason: null }),
        expect.objectContaining({ id: 'tx-finance', status: 'PENDING_FINANCE_APPROVAL', approver: null }),
      ]),
    } });
  });
});
