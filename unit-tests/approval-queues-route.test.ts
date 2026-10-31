import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/approvals/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiSuccess } from '../src/lib/api-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    budget: { findMany: jest.fn() },
    budgetContribution: { findMany: jest.fn(), count: jest.fn() },
    procurementRequest: { findMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(), isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown) => ({ ok: true, data })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const request = (query = '') => new NextRequest(`http://localhost/api/approvals${query}`);
const users = [
  { id: 'submitter-1', name: 'Sam Submitter', role: 'PROJECT_USER', email: 'sam@example.com' },
  { id: 'requester-1', name: 'Rory Requester', role: 'PROJECT_USER', email: 'rory@example.com' },
  { id: 'finance-approver', name: 'Fin Approver', role: 'FINANCE_USER', email: 'finance@example.com' },
];

describe('dual approval queues API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'approver-1', role: 'PROJECT_APPROVER' });
    isContext.mockReturnValue(true);
    successResponse.mockImplementation((data: unknown) => ({ ok: true, data }));
    db.user.findMany.mockResolvedValue(users);
    db.budget.findMany.mockResolvedValue([]);
    db.budgetContribution.findMany.mockResolvedValue([]);
    db.procurementRequest.findMany.mockResolvedValue([]);
    db.budgetContribution.count.mockResolvedValue(0);
    db.procurementRequest.count.mockResolvedValue(0);
  });

  it('returns the auth response before reading queue data', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request())).resolves.toBe(denied);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.budgetContribution.count).not.toHaveBeenCalled();
  });

  it('builds the project approver budget and PR queues with financial totals, identities, categories, and messages', async () => {
    db.budget.findMany.mockResolvedValueOnce([
      { costCentreId: 'cc-1', approvedAmount: 200, pendingAmount: 30, totalAmount: 500 },
      { costCentreId: null, approvedAmount: 500, pendingAmount: 0, totalAmount: 500 },
    ]);
    db.budgetContribution.findMany.mockResolvedValueOnce([
      {
        id: 'contribution-1', costCentreId: 'cc-1', totalEstimatedValue: 100, submittedBy: 'submitter-1', createdBy: 'unknown',
        transactions: [{ category: 'Electrical' }, { category: 'Electrical' }, { category: null }],
        approvals: [{ status: 'ENQUIRY', reason: 'Clarify' }, { status: 'APPROVED' }],
      },
      {
        id: 'contribution-2', costCentreId: 'missing-cc', totalEstimatedValue: 50, submittedBy: 'outside-user', createdBy: 'unknown',
        transactions: [], approvals: [],
      },
    ]);
    db.procurementRequest.findMany.mockResolvedValueOnce([
      { id: 'pr-1', requestedBy: 'requester-1', lines: [{ category: 'Civil' }, { category: 'Civil' }, { category: null }], boq: { category: 'Fallback' }, approvals: [{ status: 'ENQUIRY', reason: 'More info' }] },
      { id: 'pr-2', requestedBy: 'external-requester', lines: [], boq: { category: 'Mechanical' }, approvals: [] },
      { id: 'pr-3', requestedBy: 'external-requester', lines: [], boq: { category: null }, approvals: [] },
    ]);
    db.budgetContribution.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(7).mockResolvedValueOnce(1);
    db.procurementRequest.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);

    await expect(GET(request())).resolves.toMatchObject({ ok: true, data: {
      budgetQueue: [
        {
          id: 'contribution-1', submitterName: 'Sam Submitter', submitterEmail: 'sam@example.com', categories: ['Electrical'],
          financialImpact: { currentApprovedAmount: 200, proposedContribution: 100, projectedApprovedTotal: 300, pendingBudget: 30 },
          hasEnquiry: true, latestMessage: { status: 'ENQUIRY', reason: 'Clarify' },
        },
        {
          id: 'contribution-2', submitterName: 'outside-user', submitterEmail: '', categories: ['General'],
          financialImpact: { currentApprovedAmount: 0, proposedContribution: 50, projectedApprovedTotal: 50, pendingBudget: 50 },
          hasEnquiry: false, latestMessage: null,
        },
      ],
      prQueue: [
        { id: 'pr-1', requesterName: 'Rory Requester', requesterEmail: 'rory@example.com', categories: ['Civil'], hasEnquiry: true },
        { id: 'pr-2', requesterName: 'external-requester', requesterEmail: '', categories: ['Mechanical'], hasEnquiry: false },
        { id: 'pr-3', categories: ['Standard'] },
      ],
      financeQueue: [],
      counts: { budgetPending: 3, prPending: 4, financePending: 2, approvedBudgets: 7, rejectedTotal: 3 },
    } });
    expect(db.budgetContribution.findMany).toHaveBeenCalledTimes(1);
    expect(db.procurementRequest.findMany).toHaveBeenCalledTimes(1);
  });

  it('shows finance queues only to finance users and applies accepted value and project approval fallbacks', async () => {
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'finance-1', role: 'FINANCE_USER' });
    db.budget.findMany.mockResolvedValueOnce([{ costCentreId: 'cc-1', approvedAmount: 50, pendingAmount: 0, totalAmount: 500 }]);
    db.budgetContribution.findMany.mockResolvedValueOnce([
      {
        id: 'finance-1', costCentreId: 'cc-1', acceptedEstimatedValue: 80, totalEstimatedValue: 100,
        submittedBy: 'submitter-1', createdBy: 'external-user', projectApprovedBy: 'finance-approver',
        projectApprovedAt: null,
        transactions: [{ category: 'Civil' }, { category: 'Civil' }],
        approvals: [{ approvalLevel: 'PROJECT_APPROVER', status: 'APPROVED', timestamp: new Date('2026-01-01'), reason: 'Scope checked' }],
      },
      {
        id: 'finance-2', costCentreId: 'missing', acceptedEstimatedValue: null, totalEstimatedValue: 40,
        submittedBy: null, createdBy: 'not-in-directory', projectApprovedBy: null, projectApprovedAt: new Date('2026-02-02'),
        transactions: [], approvals: [],
      },
    ]);
    db.budgetContribution.count.mockResolvedValueOnce(2).mockResolvedValueOnce(4).mockResolvedValueOnce(6).mockResolvedValueOnce(8);
    db.procurementRequest.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);

    await expect(GET(request('?type=ALL'))).resolves.toMatchObject({ ok: true, data: {
      budgetQueue: [], prQueue: [],
      financeQueue: [
        {
          id: 'finance-1', submitterName: 'Sam Submitter', submitterEmail: 'sam@example.com', projectApproverName: 'Fin Approver',
          projectApproverDecision: { approverName: 'Fin Approver', approvedAt: new Date('2026-01-01'), remarks: 'Scope checked' },
          categories: ['Civil'], financialImpact: { currentApprovedAmount: 50, proposedContribution: 80, projectedApprovedTotal: 130, pendingBudget: 80 },
        },
        {
          id: 'finance-2', submitterName: 'Project User', submitterEmail: '', projectApproverName: 'Project Approver',
          projectApproverDecision: { approverName: 'Project Approver', approvedAt: new Date('2026-02-02'), remarks: 'Project level scope and commercial estimate approved.' },
          categories: ['General'], financialImpact: { currentApprovedAmount: 0, proposedContribution: 40, projectedApprovedTotal: 40, pendingBudget: 40 },
        },
      ],
      counts: { budgetPending: 2, prPending: 10, financePending: 4, approvedBudgets: 6, rejectedTotal: 9 },
    } });
    expect(db.budgetContribution.findMany).toHaveBeenCalledTimes(1);
    expect(db.procurementRequest.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['BUDGET', 'PROJECT_APPROVER', 1, 0],
    ['PR', 'PROJECT_APPROVER', 0, 1],
    ['FINANCE', 'CLIENT_ADMIN', 1, 0],
  ])('honors the %s queue filter for role %s', async (type, role, expectedContributionCalls, expectedPrCalls) => {
    auth.mockResolvedValue({ tenantId: 'tenant-1', userId: 'user-1', role });
    await GET(request(`?type=${type}`));
    expect(db.budgetContribution.findMany).toHaveBeenCalledTimes(expectedContributionCalls);
    expect(db.procurementRequest.findMany).toHaveBeenCalledTimes(expectedPrCalls);
  });
});
