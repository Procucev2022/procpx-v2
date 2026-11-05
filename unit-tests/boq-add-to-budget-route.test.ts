import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/add-to-budget/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { findFirst: jest.fn(), update: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    budgetContribution: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    budgetTransaction: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
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
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

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
    db.budgetTransaction.findFirst.mockReset().mockResolvedValue(null);
    db.budgetTransaction.count.mockReset().mockResolvedValue(0);
    db.budgetTransaction.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tx-new', ...data }));
    db.budgetTransaction.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    db.budget.findFirst.mockReset().mockResolvedValue(null);
    db.budget.update.mockReset().mockResolvedValue({});
    db.budget.create.mockReset().mockResolvedValue({ id: 'budget-new' });
    db.auditLog.create.mockReset().mockResolvedValue({ id: 'audit-1' });
    (writeD1BatchAtomically as jest.Mock).mockReset().mockImplementation(async (statements: Array<{ sql: string }>) => {
      let code = 2;
      return statements.map(({ sql }) => sql.includes('INSERT INTO "budget_transactions"')
        ? { meta: { changes: 1 }, results: [{ id: `tx-${code}`, transactionCode: `BTX-${String(code++).padStart(6, '0')}` }] }
        : { meta: { changes: 1 } });
    });
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('checks permissions and resolves explicit revision or BOQ references', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toBe(denied);
    await expect(POST(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionIDOrBOQIDIsRequired, status: 400 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqRevisionId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ ...revision().boq, revisions: [] });
    await expect(POST(request({ boqRevisionId: 'stale', boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });

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
      ok: false, error: UI_STRINGS.appApiBoqAddToBudgetRoute.aValidCostCentreIsRequiredToAllocateBudget, status: 400,
    });

    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'bad-cc', projectId: 'project-9' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.costCentreNotFoundForThisProject, status: 404,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ lines: [{ id: 'line-null', quantity: null }, { id: 'line-zero', quantity: 0 }, { id: 'line-undefined' }] }));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('3'), status: 400,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ lines: [{ id: 'line-negative', quantity: -1 }] }));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('1'), status: 400,
    });
  });

  it('returns the existing transaction for pending contributions and blocks approved ones', async () => {
    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'contribution-1', status: 'UNDER_APPROVAL', totalEstimatedValue: 100 });
    db.budgetTransaction.findFirst.mockResolvedValueOnce({ transactionCode: 'BTX-000008' });
    db.budgetTransaction.count.mockResolvedValueOnce(2);
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: true, status: 200, data: expect.objectContaining({
        success: true, alreadySubmitted: true, contributionId: 'contribution-1', transactionCode: 'BTX-000008',
        totalAmount: 100, transactionsCount: 2, status: 'UNDER_APPROVAL',
      }),
    });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'contribution-2', status: 'PENDING_PROJECT_APPROVAL', totalEstimatedValue: 70 });
    db.budgetTransaction.findFirst.mockResolvedValueOnce(null);
    db.budgetTransaction.count.mockResolvedValueOnce(0);
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toMatchObject({ ok: true, data: {
      alreadySubmitted: true, transactionCode: 'BTX-contribu', transactionsCount: 0,
    } });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'approved-contribution', status: 'APPROVED' });
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false, error: 'BOQ BOQ-001 has already been approved in budget for Cost Centre CC-T.', status: 400,
    });
  });

  it('creates category transactions, updates BOQ and cost-centre budget, and audits allocation', async () => {
    const result = await POST(request({ boqRevisionId: 'revision-1', projectId: 'project-target', costCentreId: 'cc-target', autoSubmit: true }));
    expect(result).toEqual({ ok: true, status: 201, data: expect.objectContaining({
      success: true, contributionId: expect.any(String), transactionCode: 'BTX-000002', totalAmount: 100,
      status: 'UNDER_APPROVAL', transactionsCount: 2,
    }) });
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(7);
    expect(batch[0].sql).toContain('NOT EXISTS');
    expect(batch[1].sql).toContain('WHERE changes() = 1');
    expect(batch[2].sql).toContain('MAX(CASE WHEN "transactionCode" GLOB');
    expect(batch[2].values).toEqual(expect.arrayContaining(['project-target', 'cc-target', 'boq-1', 'revision-1', 'line-1']));
    expect(batch[3].values).toEqual(expect.arrayContaining(['General', 80, 4, 20]));
    expect(batch[4].sql).toContain('boq_revisions');
    expect(batch[5].sql).toContain("CASE WHEN \"purpose\" IN ('PR', 'BOTH') THEN 'BOTH'");
    expect(batch[6].sql).toContain('ON CONFLICT');
    expect(db.budgetContribution.create).not.toHaveBeenCalled();
    expect(db.budgetTransaction.create).not.toHaveBeenCalled();
  });

  it('resubmits rejected contributions, replaces their transactions, and adds to an existing budget', async () => {
    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'contribution-rejected', status: 'REJECTED' });
    await POST(request({ revisionId: 'revision-1', costCentreId: 'cc-target' }));
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(8);
    expect(batch[0].sql).toContain("'DRAFT', 'REJECTED'");
    expect(batch[1].sql).toContain('WHERE changes() = 1');
    expect(batch[2].sql).toContain('DELETE FROM "budget_transactions"');
    expect(batch[3].sql).toContain('INSERT INTO "budget_transactions"');
    expect(batch[7].sql).toContain('"pendingAmount" = "budgets"."pendingAmount" + excluded."pendingAmount"');
    expect(db.budgetContribution.update).not.toHaveBeenCalled();
    expect(db.budgetTransaction.deleteMany).not.toHaveBeenCalled();
  });

  it('uses fallbacks for transaction identifiers and maps provider failures to API errors', async () => {
    const badJson = { json: jest.fn().mockRejectedValue(new Error('malformed JSON')), headers: new Headers() } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToAddBoqToBudget, status: 500 });

    await POST(request({ boqRevisionId: 'revision-1' }));
    expect((writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0][2].sql)
      .toContain('MAX(CASE WHEN "transactionCode" GLOB');

    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('budget database failure'));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToAddBoqToBudget, status: 500 });
    db.boqRevision.findFirst.mockRejectedValueOnce({});
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: 'Failed to add BOQ to budget.', status: 500 });
  });
});
