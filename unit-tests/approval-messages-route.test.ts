import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/approvals/messages/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    procurementRequest: { findFirst: jest.fn() },
    pRApproval: { findMany: jest.fn(), create: jest.fn() },
    budgetContribution: { findFirst: jest.fn() },
    budgetApproval: { findMany: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(), isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Jordan Buyer', role: 'PROJECT_APPROVER' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/approvals/messages${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/approvals/messages', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const user = { id: 'approver-1', email: 'approver@example.com', name: 'Avery', role: 'FINANCE_APPROVER' };

describe('approval communication API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    db.user.findMany.mockResolvedValue([user]);
    db.procurementRequest.findFirst.mockResolvedValue({ id: 'pr-1', prNumber: 'PR-1', requestedBy: 'approver-1', projectId: 'project-1' });
    db.pRApproval.findMany.mockResolvedValue([]);
    db.pRApproval.create.mockResolvedValue({ id: 'msg-pr', status: 'MESSAGE', remarks: 'Thanks', timestamp: new Date('2026-01-01') });
    db.budgetContribution.findFirst.mockResolvedValue({ id: 'contribution-1', submittedBy: 'approver@example.com', projectId: 'project-1', costCentre: { code: 'CC01' } });
    db.budgetApproval.findMany.mockResolvedValue([]);
    db.budgetApproval.create.mockResolvedValue({ id: 'msg-budget', status: 'ENQUIRY', reason: 'Clarify', timestamp: new Date('2026-02-01') });
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    notify.mockResolvedValue(undefined);
  });

  it('checks auth and requires an entity ID for reads', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiApprovalsMessagesRoute.eitherPrIdOrContributionIdMustBeProvided, status: 400 });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('returns PR messages with resolved and fallback sender identities', async () => {
    db.pRApproval.findMany.mockResolvedValueOnce([
      { id: 'm1', approverId: 'approver-1', status: 'ENQUIRY', remarks: null, timestamp: new Date('2026-01-01') },
      { id: 'm2', approverId: 'ghost', status: 'MESSAGE', remarks: 'Question', timestamp: new Date('2026-01-02') },
    ]);
    await expect(GET(getRequest('?prId=pr-1&contributionId=ignored'))).resolves.toMatchObject({ ok: true, data: {
      entityId: 'pr-1', entityType: 'PR', prNumber: 'PR-1', requester: 'Avery', total: 2,
      messages: [
        { id: 'm1', senderName: 'Avery', senderRole: 'FINANCE_APPROVER', senderEmail: 'approver@example.com', content: '' },
        { id: 'm2', senderName: 'ghost', senderRole: 'PROJECT_APPROVER', senderEmail: '', content: 'Question' },
      ],
    } });
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'pr-1', tenantId: 'tenant-1' }, select: { id: true, prNumber: true, requestedBy: true, createdAt: true },
    });
    expect(db.budgetContribution.findFirst).not.toHaveBeenCalled();
  });

  it('handles missing PR and budget contribution reads and formats budget messages', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest('?prId=missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest('?contributionId=missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404 });
    db.budgetApproval.findMany.mockResolvedValueOnce([
      { id: 'b1', approverId: 'approver@example.com', approvalLevel: null, status: 'MESSAGE', reason: null, timestamp: new Date() },
      { id: 'b2', approverId: 'unknown', approvalLevel: 'FINANCE', status: 'ENQUIRY', reason: 'Please clarify', timestamp: new Date() },
      { id: 'b3', approverId: 'unknown-default', approvalLevel: null, status: 'MESSAGE', reason: '', timestamp: new Date() },
    ]);
    await expect(GET(getRequest('?contributionId=contribution-1'))).resolves.toMatchObject({ ok: true, data: {
      entityId: 'contribution-1', entityType: 'BUDGET', submitter: 'Avery', total: 3,
      messages: [
        { senderName: 'Avery', senderRole: 'FINANCE_APPROVER', senderEmail: 'approver@example.com', content: '' },
        { senderName: 'unknown', senderRole: 'FINANCE', senderEmail: '', content: 'Please clarify' },
        { senderName: 'unknown-default', senderRole: 'APPROVER', content: '' },
      ],
    } });
  });

  it('reports read failures and resolves unnamed budget submitters to the stored value', async () => {
    db.budgetContribution.findFirst.mockResolvedValueOnce({ id: 'c2', submittedBy: null, projectId: 'p2', costCentreId: 'cc2' });
    await expect(GET(getRequest('?contributionId=c2'))).resolves.toMatchObject({ ok: true, data: { submitter: null, messages: [] } });
    db.procurementRequest.findFirst.mockResolvedValueOnce({ id: 'pr-2', prNumber: 'PR-2', requestedBy: 'unknown-user' });
    await expect(GET(getRequest('?prId=pr-2'))).resolves.toMatchObject({ ok: true, data: { requester: 'unknown-user' } });
    db.user.findMany.mockRejectedValueOnce(new Error('user query failed'));
    await expect(GET(getRequest('?prId=pr-1'))).resolves.toEqual({ ok: false, error: 'user query failed', status: 500 });
    db.user.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest('?prId=pr-1'))).resolves.toEqual({ ok: false, error: 'Failed to fetch messages.', status: 500 });
  });

  it('checks auth, nonblank message text, and an entity ID before sending', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({ message: 'hello' }))).resolves.toBe(denied);
    await expect(POST(postRequest({ message: '   ', prId: 'pr-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiApprovalsMessagesRoute.messageContentCannotBeEmpty, status: 400 });
    await expect(POST(postRequest({ message: ' hello ' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiApprovalsMessagesRoute.eitherPrIdOrContributionIdMustBeProvided, status: 400 });
  });

  it('sends PR messages and enquiries, auditing, notifying, and using identity fallbacks', async () => {
    await expect(POST(postRequest({ prId: 'pr-1', message: '  status update  ' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { success: true, message: { id: 'msg-pr', senderName: 'Jordan Buyer', senderRole: 'PROJECT_APPROVER', type: 'MESSAGE', content: 'Thanks' } },
    });
    expect(db.pRApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', prId: 'pr-1', approverId: 'user-1', status: 'MESSAGE', remarks: 'status update',
    }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'PR_MESSAGE_SENT', projectId: 'project-1' }) });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'ENQUIRY_SENT', recordNumber: 'PR-1', actorName: 'Jordan Buyer', details: { link: '/pr/pr-1' } }));

    db.pRApproval.create.mockResolvedValueOnce({ id: 'enquiry', status: 'ENQUIRY', remarks: 'Need approval', timestamp: new Date() });
    auth.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_APPROVER' });
    await expect(POST(postRequest({ prId: 'pr-1', message: ' Need approval ', type: 'ENQUIRY' }))).resolves.toMatchObject({
      ok: true, data: { message: { type: 'ENQUIRY', content: 'Need approval' } },
    });
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'PR_ENQUIRY_SENT', description: expect.stringContaining('Clarification requested') }) });
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ actorName: 'PROJECT_APPROVER' }));
  });

  it('sends budget enquiries, handles missing records, and reports POST failures', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ prId: 'missing', message: 'Hello' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ contributionId: 'missing', message: 'Hello' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404 });
    auth.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_APPROVER' });
    await expect(POST(postRequest({ contributionId: 'contribution-1', message: '  Please clarify  ', type: 'ENQUIRY' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { message: { id: 'msg-budget', senderName: 'User', senderRole: 'PROJECT_APPROVER', content: 'Clarify' } },
    });
    expect(db.budgetApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', contributionId: 'contribution-1', approvalLevel: 'PROJECT_APPROVER', status: 'ENQUIRY', reason: 'Please clarify',
    }) });
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ entityType: 'BUDGET_CONTRIBUTION', action: 'BUDGET_ENQUIRY_SENT', description: expect.stringContaining('CC01') }) });
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ recordNumber: 'CC01', actorName: 'PROJECT_APPROVER', details: { link: '/budgets' } }));

    const malformed = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: 'Failed to send message.', status: 500 });
    db.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(POST(postRequest({ contributionId: 'contribution-1', message: 'hello' }))).resolves.toEqual({ ok: false, error: 'audit unavailable', status: 500 });
  });
});
