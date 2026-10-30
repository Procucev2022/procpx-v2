import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/add-to-budget/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { findFirst: jest.fn(), update: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    budgetContribution: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    budgetTransaction: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    budget: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
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
const request = (body: unknown) => new NextRequest('http://localhost/api/boq/add-to-budget', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const revision = (overrides: Record<string, any> = {}) => ({
  id: 'revision-1', boqId: 'boq-1', revisionCode: 'BOQ-001-R1', costCentreId: 'cc-revision',
  boq: { id: 'boq-1', boqCode: 'BOQ-001', projectId: 'project-1', costCentreId: 'cc-boq' },
  lines: [
    { id: 'line-1', quantity: 2, aiUnitCost: 10, aiTotalCost: 0, benchmarkRate: 20, category: { name: 'Electrical' } },
    { id: 'line-2', quantity: 4, aiUnitCost: 0, aiTotalCost: 80, benchmarkRate: 25, category: null },
  ],
  ...overrides,
});
const costCentre = { id: 'cc-target', code: 'CC-T', name: 'Target Centre' };

describe('BOQ add-to-budget API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.boqRevision.findFirst.mockReset().mockResolvedValue(revision());
    db.boqRevision.update.mockReset().mockResolvedValue({});
    db.boq.findFirst.mockReset().mockResolvedValue(null);
    db.boq.update.mockReset().mockResolvedValue({});
    db.costCentre.findFirst.mockReset().mockResolvedValue(costCentre);
    db.budgetContribution.findFirst.mockReset().mockResolvedValue(null);
    db.budgetContribution.create.mockReset().mockResolvedValue({ id: 'contribution-new' });
    db.budgetContribution.update.mockReset().mockResolvedValue({ id: 'contribution-existing' });
    db.budgetTransaction.findMany.mockReset().mockResolvedValue([]);
    db.budgetTransaction.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tx-new', ...data }));
    db.budgetTransaction.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    db.budget.findFirst.mockReset().mockResolvedValue(null);
    db.budget.update.mockReset().mockResolvedValue({});
    db.budget.create.mockReset().mockResolvedValue({ id: 'budget-new' });
    db.auditLog.create.mockReset().mockResolvedValue({ id: 'audit-1' });
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('checks permissions and resolves explicit revision or BOQ references', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toBe(denied);
    await expect(POST(request({}))).resolves.toEqual({ ok: false, error: 'BOQ Revision ID or BOQ ID is required.', status: 400 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqRevisionId: 'missing' }))).resolves.toEqual({ ok: false, error: 'BOQ Revision not found.', status: 404 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ ...revision().boq, revisions: [] });
    await expect(POST(request({ boqRevisionId: 'stale', boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: 'BOQ Revision not found.', status: 404 });

    db.boqRevision.findFirst.mockResolvedValueOnce(revision());
    await POST(request({ revisionId: 'revision-1' }));
    expect(db.boqRevision.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'revision-1', tenantId: 'tenant-1' } }));

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ ...revision().boq, revisions: [revision()] });
    await POST(request({ boqId: 'boq-1' }));
    expect(db.boq.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'boq-1', tenantId: 'tenant-1' } }));
  });

  it('requires a cost centre and valid positive quantities before allocating a BOQ', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ costCentreId: null, boq: { ...revision().boq, costCentreId: null } }));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false, error: 'A valid Cost Centre is required to allocate budget.', status: 400,
    });

    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'bad-cc', projectId: 'project-9' }))).resolves.toEqual({
      ok: false, error: 'Cost centre not found for this project.', status: 404,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ lines: [{ id: 'line-null', quantity: null }, { id: 'line-zero', quantity: 0 }, { id: 'line-undefined' }] }));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false, error: '3 BOQ lines require quantity before this BOQ can be added to Budget.', status: 400,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ lines: [{ id: 'line-negative', quantity: -1 }] }));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false, error: '1 BOQ line require quantity before this BOQ can be added to Budget.', status: 400,
    });
  });

  it('returns the existing transaction for pending contributions and blocks approved ones', async () => {
    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'contribution-1', status: 'UNDER_APPROVAL', totalEstimatedValue: 100 });
    db.budgetTransaction.findMany.mockResolvedValueOnce([{ transactionCode: 'BTX-000008' }, { transactionCode: 'BTX-000009' }]);
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: true, status: 200, data: expect.objectContaining({
        success: true, alreadySubmitted: true, contributionId: 'contribution-1', transactionCode: 'BTX-000008',
        totalAmount: 100, transactionsCount: 2, status: 'UNDER_APPROVAL',
      }),
    });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'contribution-2', status: 'PENDING_PROJECT_APPROVAL', totalEstimatedValue: 70 });
    db.budgetTransaction.findMany.mockResolvedValueOnce([]);
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toMatchObject({ ok: true, data: {
      alreadySubmitted: true, transactionCode: 'BTX-contribu', transactionsCount: 0,
    } });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'approved-contribution', status: 'APPROVED' });
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false, error: 'BOQ BOQ-001 has already been approved in budget for Cost Centre CC-T.', status: 400,
    });
  });

  it('creates category transactions, updates BOQ and cost-centre budget, and audits allocation', async () => {
    db.budgetTransaction.findMany.mockResolvedValueOnce([{ transactionCode: 'BTX-000001' }]);
    db.budget.findFirst.mockResolvedValueOnce(null);
    const result = await POST(request({ boqRevisionId: 'revision-1', projectId: 'project-target', costCentreId: 'cc-target', autoSubmit: true }));
    expect(result).toEqual({ ok: true, status: 201, data: expect.objectContaining({
      success: true, contributionId: 'contribution-new', transactionCode: 'BTX-000002', totalAmount: 100,
      status: 'UNDER_APPROVAL', transactionsCount: 2,
    }) });
    expect(db.budgetContribution.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-target', costCentreId: 'cc-target', boqId: 'boq-1',
      boqRevisionId: 'revision-1', totalEstimatedValue: 100, acceptedEstimatedValue: 100, status: 'UNDER_APPROVAL',
      submittedBy: 'user-1', createdBy: 'user-1', submittedAt: expect.any(Date),
    }) });
    expect(db.budgetTransaction.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      transactionCode: 'BTX-000002', category: 'Electrical', amount: 20, quantity: 2, rate: 10,
      boqLineId: 'line-1', reference: 'BOQ BOQ-001 BOQ-001-R1 - Electrical', status: 'UNDER_APPROVAL',
    }) });
    expect(db.budgetTransaction.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      transactionCode: 'BTX-000003', category: 'General', amount: 80, quantity: 4, rate: 20, boqLineId: 'line-2',
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { budgetStatus: 'BUDGET_UNDER_APPROVAL' } });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-1' }, data: { costCentreId: 'cc-target', purpose: 'BUDGET' } });
    expect(db.budget.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-target', costCentreId: 'cc-target', totalAmount: 100,
      approvedAmount: 0, pendingAmount: 100, status: 'UNDER_APPROVAL', createdBy: 'user-1',
    }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityType: 'BUDGET_CONTRIBUTION', entityId: 'contribution-new', action: 'BUDGET_CONTRIBUTION_CREATED',
      newValue: expect.stringContaining('"transactions":2'),
    }) });
  });

  it('resubmits rejected contributions, replaces their transactions, and adds to an existing budget', async () => {
    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'contribution-rejected', status: 'REJECTED' });
    db.budgetContribution.update.mockResolvedValueOnce({ id: 'contribution-rejected' });
    db.budget.findFirst.mockResolvedValueOnce({ id: 'budget-1', pendingAmount: 25 });
    await POST(request({ revisionId: 'revision-1', costCentreId: 'cc-target' }));
    expect(db.budgetContribution.update).toHaveBeenCalledWith({ where: { id: 'contribution-rejected' }, data: expect.objectContaining({
      costCentreId: 'cc-target', totalEstimatedValue: 100, acceptedEstimatedValue: 100, status: 'UNDER_APPROVAL',
      submittedAt: expect.any(Date), submittedBy: 'user-1', rejectionReason: null,
    }) });
    expect(db.budgetTransaction.deleteMany).toHaveBeenCalledWith({ where: { contributionId: 'contribution-rejected' } });
    expect(db.budget.update).toHaveBeenCalledWith({ where: { id: 'budget-1' }, data: { pendingAmount: 125 } });
    expect(db.budget.create).not.toHaveBeenCalled();
  });

  it('uses fallbacks for transaction identifiers and maps provider failures to API errors', async () => {
    const badJson = { json: jest.fn().mockRejectedValue(new Error('malformed JSON')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'malformed JSON', status: 500 });

    db.budgetTransaction.findMany.mockResolvedValueOnce([]);
    db.budgetTransaction.create.mockResolvedValueOnce({ id: 'tx-no-code' }).mockResolvedValueOnce({ id: 'tx-no-code-2' });
    await POST(request({ boqRevisionId: 'revision-1' }));
    expect(db.budgetTransaction.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ transactionCode: 'BTX-000001' }) });

    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('budget database failure'));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: 'budget database failure', status: 500 });
    db.boqRevision.findFirst.mockRejectedValueOnce({});
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: 'Failed to add BOQ to budget.', status: 500 });
  });
});
