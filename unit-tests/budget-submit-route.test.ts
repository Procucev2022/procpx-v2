import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { POST } from '../src/app/api/budgets/submit/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    budgetContribution: { findFirst: jest.fn(), update: jest.fn() },
    budgetTransaction: { updateMany: jest.fn() },
    boqRevision: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as {
  budgetContribution: { findFirst: jest.Mock; update: jest.Mock };
  budgetTransaction: { updateMany: jest.Mock };
  boqRevision: { update: jest.Mock };
  auditLog: { create: jest.Mock };
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const ctx = { tenantId: 'tenant-1', userId: 'user-1' };
const makeRequest = (body: unknown) => new NextRequest('http://localhost/api/budgets/submit', {
  method: 'POST', body: JSON.stringify(body),
});

describe('budget submission route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(ctx);
    isContext.mockReturnValue(true);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValue(Array.from({ length: 4 }, () => ({ meta: { changes: 1 } })));
  });

  it('authorizes submission and validates the contribution state', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toBe(denied);
    await expect(POST(makeRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });

    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(POST(makeRequest({ contributionId: 'missing' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(POST(makeRequest({ contributionId: 'approved' }))).resolves.toEqual({
      ok: false, error: 'Cannot submit contribution in state APPROVED.', status: 400,
    });
  });

  it('submits drafts with one guarded D1 batch for all dependent records', async () => {
    const contribution = {
      id: 'budget-1', status: 'DRAFT', boqRevisionId: 'revision-1', projectId: 'project-1',
      costCentre: { code: 'CC-1' }, totalEstimatedValue: 15000,
    };
    db.budgetContribution.findFirst.mockResolvedValue(contribution);

    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: true, data: { contribution: expect.objectContaining({ ...contribution, status: 'PENDING_PROJECT_APPROVAL', submittedBy: 'user-1' }), status: 'PENDING_PROJECT_APPROVAL' }, status: 200,
    });
    expect(db.budgetContribution.findFirst).toHaveBeenCalledWith({
      where: { id: 'budget-1', tenantId: 'tenant-1' }, include: { boqRevision: true, boq: true, costCentre: true },
    });
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0];
    expect(batch).toHaveLength(4);
    expect(batch[0].sql).toContain('"status" = \'DRAFT\'');
    expect(batch[1].sql).toContain('WHERE changes() = 1');
    expect(batch[1].values).toEqual(expect.arrayContaining(['BUDGET_SUBMITTED', 'budget-1']));
    expect(batch[2].sql).toContain('budget_transactions');
    expect(batch[3].sql).toContain('boq_revisions');
    expect(db.budgetContribution.update).not.toHaveBeenCalled();
    expect(db.budgetTransaction.updateMany).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns a conflict when another request wins the status compare-and-set', async () => {
    db.budgetContribution.findFirst.mockResolvedValue({
      id: 'budget-1', status: 'DRAFT', boqRevisionId: 'revision-1', projectId: 'project-1', costCentre: { code: 'CC-1' }, totalEstimatedValue: 15,
    });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionChangedPleaseRefresh, status: 409,
    });
  });

  it('converts database and body parsing errors to API responses', async () => {
    db.budgetContribution.findFirst.mockRejectedValueOnce(new Error('database offline'));
    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitBudgetContribution, status: 500,
    });

    db.budgetContribution.findFirst.mockRejectedValueOnce({});
    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: 'Failed to submit budget contribution.', status: 500,
    });

    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid request body')), headers: new Headers() } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitBudgetContribution, status: 500,
    });
  });
});
