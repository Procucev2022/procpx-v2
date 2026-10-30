import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { POST } from '../src/app/api/budgets/submit/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    budgetContribution: { findFirst: jest.fn(), update: jest.fn() },
    budgetTransaction: { updateMany: jest.fn() },
    boqRevision: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
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
  });

  it('authorizes submission and validates the contribution state', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toBe(denied);
    await expect(POST(makeRequest({}))).resolves.toEqual({ ok: false, error: 'Contribution ID is required.', status: 400 });

    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(POST(makeRequest({ contributionId: 'missing' }))).resolves.toEqual({
      ok: false, error: 'Budget contribution not found.', status: 404,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(POST(makeRequest({ contributionId: 'approved' }))).resolves.toEqual({
      ok: false, error: 'Cannot submit contribution in state APPROVED.', status: 400,
    });
  });

  it('submits drafts, updates transactions and the BOQ revision, then audits', async () => {
    const contribution = {
      id: 'budget-1', status: 'DRAFT', boqRevisionId: 'revision-1', projectId: 'project-1',
      costCentre: { code: 'CC-1' }, totalEstimatedValue: 15000,
    };
    const updated = { ...contribution, status: 'PENDING_PROJECT_APPROVAL' };
    db.budgetContribution.findFirst.mockResolvedValue(contribution);
    db.budgetContribution.update.mockResolvedValue(updated);

    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: true, data: { contribution: updated, status: 'PENDING_PROJECT_APPROVAL' }, status: 200,
    });
    expect(db.budgetContribution.findFirst).toHaveBeenCalledWith({
      where: { id: 'budget-1', tenantId: 'tenant-1' }, include: { boqRevision: true, boq: true, costCentre: true },
    });
    expect(db.budgetContribution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'budget-1' }, data: expect.objectContaining({ status: 'PENDING_PROJECT_APPROVAL', submittedAt: expect.any(Date), submittedBy: 'user-1' }),
    }));
    expect(db.budgetTransaction.updateMany).toHaveBeenCalledWith({ where: { contributionId: 'budget-1' }, data: { status: 'PENDING_PROJECT_APPROVAL' } });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { budgetStatus: 'BUDGET_PENDING_PROJECT_APPROVAL' } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1', entityId: 'budget-1', action: 'BUDGET_SUBMITTED',
      description: expect.stringContaining('Cost Centre CC-1 submitted for Project Approver review'),
    }) });
  });

  it('converts database and body parsing errors to API responses', async () => {
    db.budgetContribution.findFirst.mockRejectedValueOnce(new Error('database offline'));
    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: 'database offline', status: 500,
    });

    db.budgetContribution.findFirst.mockRejectedValueOnce({});
    await expect(POST(makeRequest({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: 'Failed to submit budget contribution.', status: 500,
    });

    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid request body')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'invalid request body', status: 500 });
  });
});
