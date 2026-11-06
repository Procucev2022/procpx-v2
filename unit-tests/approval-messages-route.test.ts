import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/approvals/messages/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess, getListPageWindow } from '../src/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    procurementRequest: { findFirst: jest.fn() },
    pRApproval: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    budgetContribution: { findFirst: jest.fn() },
    budgetApproval: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(), isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  getListPageWindow: jest.fn((searchParams: URLSearchParams) => {
    const rawPageSize = Number(searchParams.get('pageSize'));
    const pageSize = Number.isSafeInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 50;
    return { page: 1, pageSize, skip: 0 };
  }),
}));
jest.mock('../src/lib/notifications', () => ({
  dispatchPreparedWorkflowNotification: jest.fn(),
  notifyNextResponsibleParty: jest.fn(),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const pageWindow = getListPageWindow as unknown as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchPrepared = dispatchPreparedWorkflowNotification as jest.Mock;
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
    pageWindow.mockImplementation((searchParams: URLSearchParams) => {
      const rawPageSize = Number(searchParams.get('pageSize'));
      const pageSize = Number.isSafeInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 50;
      return { page: 1, pageSize, skip: 0 };
    });
    db.user.findMany.mockResolvedValue([user]);
    db.procurementRequest.findFirst.mockResolvedValue({ id: 'pr-1', prNumber: 'PR-1', requestedBy: 'approver-1', projectId: 'project-1' });
    db.pRApproval.findMany.mockResolvedValue([]);
    db.pRApproval.count.mockResolvedValue(0);
    db.pRApproval.create.mockResolvedValue({ id: 'msg-pr', status: 'MESSAGE', remarks: 'Thanks', timestamp: new Date('2026-01-01') });
    db.budgetContribution.findFirst.mockResolvedValue({ id: 'contribution-1', submittedBy: 'approver@example.com', projectId: 'project-1', costCentre: { code: 'CC01' } });
    db.budgetApproval.findMany.mockResolvedValue([]);
    db.budgetApproval.count.mockResolvedValue(0);
    db.budgetApproval.create.mockResolvedValue({ id: 'msg-budget', status: 'ENQUIRY', reason: 'Clarify', timestamp: new Date('2026-02-01') });
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    notify.mockImplementation((input: Record<string, unknown>, options?: { prepareOnly?: boolean }) => options?.prepareOnly ? ({
      tenantId: input.tenantId, title: 'Clarification requested', message: 'A message is waiting',
      type: 'INFO', entityType: 'RFQ', entityId: input.entityId, recordNumber: input.recordNumber,
      link: '/approvals/messages',
    }) : undefined);
    dispatchPrepared.mockResolvedValue(undefined);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockImplementation((statements: unknown[]) => Promise.resolve(statements.map(() => ({ meta: { changes: 1 } }))));
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
      { id: 'm2', approverId: 'ghost', status: 'MESSAGE', remarks: 'Question', timestamp: new Date('2026-01-02') },
      { id: 'm1', approverId: 'approver-1', status: 'ENQUIRY', remarks: null, timestamp: new Date('2026-01-01') },
    ]);
    db.pRApproval.count.mockResolvedValueOnce(2);
    await expect(GET(getRequest('?prId=pr-1&contributionId=ignored'))).resolves.toMatchObject({ ok: true, data: {
      entityId: 'pr-1', entityType: 'PR', prNumber: 'PR-1', requester: 'Avery', total: 2,
      hasMore: false, nextCursor: null,
      messages: [
        { id: 'm1', senderName: 'Avery', senderRole: 'FINANCE_APPROVER', senderEmail: 'approver@example.com', content: '' },
        { id: 'm2', senderName: 'ghost', senderRole: 'PROJECT_APPROVER', senderEmail: '', content: 'Question' },
      ],
    } });
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'pr-1', tenantId: 'tenant-1' }, select: { id: true, prNumber: true, requestedBy: true },
    });
    expect(db.pRApproval.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 51, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    }));
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', OR: [{ id: { in: ['approver-1', 'ghost'] } }, { email: { in: ['approver-1', 'ghost'] } }] },
    }));
    expect(db.budgetContribution.findFirst).not.toHaveBeenCalled();
  });

  it('chunks identity lookups for the maximum approval message page', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce({
      id: 'pr-1', prNumber: 'PR-1', requestedBy: 'requester-1', projectId: 'project-1',
    });
    db.pRApproval.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({
      id: `approval-${index}`,
      approverId: `approver-${index}`,
      status: 'MESSAGE',
      remarks: '',
      timestamp: new Date(`2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
    })));
    db.user.findMany.mockResolvedValue([]);

    await expect(GET(getRequest('?prId=pr-1&pageSize=100'))).resolves.toMatchObject({ ok: true });

    const chunks = db.user.findMany.mock.calls.map(([query]) => {
      const where = (query as { where: { OR: Array<{ id?: { in: string[] }; email?: { in: string[] } }> } }).where;
      const ids = where.OR[0].id?.in ?? [];
      const emails = where.OR[1].email?.in ?? [];
      expect(where.OR[0].id?.in).toEqual(where.OR[1].email?.in);
      expect(ids.length).toBeLessThanOrEqual(45);
      expect(emails.length).toBeLessThanOrEqual(45);
      return ids.length;
    });
    expect(chunks).toEqual([45, 45, 11]);
  });

  it('handles missing PR and budget contribution reads and formats budget messages', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest('?prId=missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(GET(getRequest('?contributionId=missing'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404 });
    db.budgetApproval.findMany.mockResolvedValueOnce([
      { id: 'b3', approverId: 'unknown-default', approvalLevel: null, status: 'MESSAGE', reason: '', timestamp: new Date('2026-02-03') },
      { id: 'b2', approverId: 'unknown', approvalLevel: 'FINANCE', status: 'ENQUIRY', reason: 'Please clarify', timestamp: new Date('2026-02-02') },
      { id: 'b1', approverId: 'approver@example.com', approvalLevel: null, status: 'MESSAGE', reason: null, timestamp: new Date('2026-02-01') },
    ]);
    db.budgetApproval.count.mockResolvedValueOnce(3);
    await expect(GET(getRequest('?contributionId=contribution-1'))).resolves.toMatchObject({ ok: true, data: {
      entityId: 'contribution-1', entityType: 'BUDGET', submitter: 'Avery', total: 3,
      hasMore: false, nextCursor: null,
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
    await expect(GET(getRequest('?prId=pr-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchMessages, status: 500 });
    db.user.findMany.mockRejectedValueOnce({});
    await expect(GET(getRequest('?prId=pr-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchMessages, status: 500 });
  });

  it('uses a stable timestamp and id cursor, and rejects partial cursors', async () => {
    await expect(GET(getRequest('?prId=pr-1&beforeId=m1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    db.pRApproval.findMany.mockResolvedValueOnce([
      { id: 'older-2', approverId: 'approver-1', status: 'MESSAGE', remarks: 'Second oldest', timestamp: new Date('2026-01-01T00:00:00.000Z') },
      { id: 'older-1', approverId: 'approver-1', status: 'MESSAGE', remarks: 'Oldest', timestamp: new Date('2025-12-31T00:00:00.000Z') },
    ]);
    db.pRApproval.count.mockResolvedValueOnce(60);
    await expect(GET(getRequest('?prId=pr-1&pageSize=1&beforeId=newest&beforeTimestamp=2026-01-02T00%3A00%3A00.000Z'))).resolves.toMatchObject({
      ok: true, data: {
        total: 60, hasMore: true,
        messages: [{ id: 'older-2' }],
        nextCursor: { id: 'older-2', timestamp: '2026-01-01T00:00:00.000Z' },
      },
    });
    expect(db.pRApproval.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { prId: 'pr-1', tenantId: 'tenant-1', OR: [
        { timestamp: { lt: new Date('2026-01-02T00:00:00.000Z') } },
        { timestamp: new Date('2026-01-02T00:00:00.000Z'), id: { lt: 'newest' } },
      ] },
      take: 2,
    }));
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
      ok: true, status: 201, data: { success: true, message: { id: expect.any(String), senderName: 'Jordan Buyer', senderRole: 'PROJECT_APPROVER', type: 'MESSAGE', content: 'status update' } },
    });
    const messageBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(messageBatch).toHaveLength(3);
    expect(messageBatch[0].values).toEqual(expect.arrayContaining(['tenant-1', 'pr-1', 'user-1', 'MESSAGE', 'status update']));
    expect(messageBatch[1].values).toContain('PR_MESSAGE_SENT');
    expect(db.pRApproval.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'ENQUIRY_SENT', recordNumber: 'PR-1', actorName: 'Jordan Buyer', details: { link: '/pr/pr-1' } }), { prepareOnly: true });
    expect(messageBatch[2].sql).toContain('notification_outbox');
    expect(dispatchPrepared).toHaveBeenCalledWith(messageBatch[2].values[0], expect.any(Date), expect.objectContaining({ entityId: 'pr-1' }));

    auth.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_APPROVER' });
    await expect(POST(postRequest({ prId: 'pr-1', message: ' Need approval ', type: 'ENQUIRY' }))).resolves.toMatchObject({
      ok: true, data: { message: { type: 'ENQUIRY', content: 'Need approval' } },
    });
    const enquiryBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(enquiryBatch[0].values).toEqual(expect.arrayContaining(['ENQUIRY', 'Need approval']));
    expect(enquiryBatch[1].values).toContain('PR_ENQUIRY_SENT');
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ actorName: 'PROJECT_APPROVER' }), { prepareOnly: true });
  });

  it('sends budget enquiries, handles missing records, and reports POST failures', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ prId: 'missing', message: 'Hello' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.procurementRequestNotFound, status: 404 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ contributionId: 'missing', message: 'Hello' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404 });
    auth.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_APPROVER' });
    await expect(POST(postRequest({ contributionId: 'contribution-1', message: '  Please clarify  ', type: 'ENQUIRY' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { message: { id: expect.any(String), senderName: 'User', senderRole: 'PROJECT_APPROVER', content: 'Please clarify' } },
    });
    const budgetBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(budgetBatch).toHaveLength(3);
    expect(budgetBatch[0].values).toEqual(expect.arrayContaining(['tenant-1', 'contribution-1', 'PROJECT_APPROVER', 'user-1', 'ENQUIRY', 'Please clarify']));
    expect(budgetBatch[1].values).toContain('BUDGET_ENQUIRY_SENT');
    expect(db.budgetApproval.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ recordNumber: 'CC01', actorName: 'PROJECT_APPROVER', details: { link: '/budgets' } }), { prepareOnly: true });
    expect(budgetBatch[2].sql).toContain('notification_outbox');

    const malformed = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('approval store failed'));
    await expect(POST(postRequest({ contributionId: 'contribution-1', message: 'hello' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSendMessage2, status: 500 });
  });
});
