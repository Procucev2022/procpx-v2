import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { runAuditedD1UpdateAtomically } from '../src/lib/audited-update';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { writeD1BatchAtomically, writeRateCardTransitionAtomically } from '../src/lib/d1-batch';
import { POST as acceptAuctionTerms } from '../src/app/api/procurement/auctions/[id]/terms-accept/route';
import { POST as raisePpoIssue } from '../src/app/api/procurement/ppos/[id]/vendor-issue/route';
import { POST as acceptPpo } from '../src/app/api/procurement/ppos/[id]/vendor-accept/route';
import { POST as approveRateCard } from '../src/app/api/procurement/rate-cards/[id]/approve/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { RATE_CARD_APPROVE_PROJECT_UPDATE_SQL } from '../src/lib/d1-batch.constants';
import { PPO_VENDOR_ACCEPT_UPDATE_IF_ISSUED_SQL, PPO_VENDOR_ISSUE_UPDATE_IF_ISSUED_SQL, RFQ_VENDOR_MESSAGE_INSERT_AFTER_AUDIT_SQL } from '../src/lib/d1-batch.constants';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '../src/lib/rate-card-approval-history.constants';
import { PPO_VENDOR_ACTION_COMMENT_MAX_LENGTH } from '../src/app/api/procurement/ppos/vendor-action.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn() },
    auction: { findFirst: jest.fn() },
    auctionVendor: { findFirst: jest.fn(), update: jest.fn() },
    ppo: { findFirst: jest.fn(), update: jest.fn() },
    rfqMessage: { create: jest.fn() },
    vendorRateCard: { findFirst: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/audited-update', () => ({ runAuditedD1UpdateAtomically: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn(), writeRateCardTransitionAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const auditedUpdate = runAuditedD1UpdateAtomically as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const transition = writeRateCardTransitionAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const context = {
  tenantId: 'tenant-1', userId: 'user-1', userName: 'Vendor User', userEmail: 'vendor@example.test', role: 'VENDOR', vendorId: 'vendor-1',
};
const request = (body?: unknown) => new NextRequest('http://localhost/api/action', {
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const params = (id = 'record-1') => ({ params: Promise.resolve({ id }) });
const ppoRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'ppo-1', tenantId: 'tenant-1', ppoNumber: 'PPO-001', vendorId: 'vendor-1', vendor: { name: 'Acme' },
  projectId: 'project-1', project: { name: 'Store' }, rfqId: 'rfq-1', rfq: { rfqNumber: 'RFQ-001' },
  status: 'ISSUED', vendorStatus: 'PENDING', totalValue: 1500, ...overrides,
});
const rateCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1', tenantId: 'tenant-1', vendorId: 'vendor-1', rateCardNumber: 'RC-001', status: 'PENDING_PROJECT_APPROVAL',
  approvalLevel: 'LEVEL_1_PROJECT', notes: null, items: [], vendor: { id: 'vendor-1', name: 'Acme' }, ...overrides,
});
const expectBoundedApprovalHistoryRead = () => expect(db.vendorRateCard.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
  where: { id: 'card-1', tenantId: 'tenant-1' },
  include: expect.objectContaining({ approvals: expect.objectContaining({
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
    select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
  }) }),
}));

describe('auction terms, vendor PPO actions, and rate card approval routes', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    auditedUpdate.mockResolvedValue({ id: 'participant-1' });
    notify.mockResolvedValue(undefined);
    transition.mockResolvedValue(true);
    batch.mockImplementation(async (statements: unknown[]) => statements.map(() => ({ meta: { changes: 1 } })));
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('accepts auction terms only for invited vendors and audits the acceptance', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toBe(denied);

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.vendorRecordNotFoundForThisUser, status: 404 });
    auth.mockResolvedValueOnce({ ...context, userEmail: '', vendorId: undefined });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.vendorRecordNotFoundForThisUser, status: 404 });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.vendorIDIsRequiredToAcceptTerms, status: 400 });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request({ vendorId: 'vendor-1' }), params('auction-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.auctionNotFound, status: 404 });
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    db.auction.findFirst.mockResolvedValueOnce({ id: 'auction-1', rfq: { projectId: 'project-1' } });
    db.auctionVendor.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request({ vendorId: 'vendor-1' }), params('auction-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.vendorIsNotInvitedToThisAuctionEvent, status: 403 });

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR' });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-1', name: 'Acme' });
    db.auction.findFirst.mockResolvedValueOnce({ id: 'auction-1', auctionNumber: 'AUC-001', rfq: { projectId: 'project-1' } });
    db.auctionVendor.findFirst.mockResolvedValueOnce({ id: 'participant-1', vendor: { name: 'Acme' } });
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('eligible to place bids'), termsAcceptedAt: expect.any(String) },
    });
    expect(db.vendor.findFirst).toHaveBeenLastCalledWith({ where: {
      tenantId: 'tenant-1', OR: [{ email: 'vendor@example.test' }, { id: 'vendor-1' }, { id: 'user-1' }],
    } });
    expect(auditedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      table: 'auctionVendor', id: 'participant-1', tenantId: 'tenant-1',
      data: { termsAccepted: true, termsAcceptedAt: expect.any(Date) },
      route: '/api/procurement/auctions/[id]/terms-accept',
      audit: expect.objectContaining({ action: 'AUCTION_TERMS_ACCEPTED', entityId: 'auction-1' }),
    }));
    expect(audit).not.toHaveBeenCalled();

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    db.auction.findFirst.mockRejectedValueOnce(new Error('auction database error'));
    await expect(acceptAuctionTerms(request({ vendorId: 'vendor-1' }), params('auction-1'))).resolves.toEqual({ ok: false, error: 'auction database error', status: 500 });
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    db.auction.findFirst.mockRejectedValueOnce({});
    await expect(acceptAuctionTerms(request({ vendorId: 'vendor-1' }), params('auction-1'))).resolves.toEqual({ ok: false, error: 'Failed to accept auction terms', status: 500 });
  });

  it('raises PPO issues for the correct vendor and notifies buyers without confirming the order', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(raisePpoIssue(request({ issueRemarks: 'Need clarification' }), params('ppo-1'))).resolves.toBe(denied);
    await expect(raisePpoIssue(request({ issueRemarks: ' ' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.issueClarificationDescriptionIsRequired, status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(raisePpoIssue(request({ issueRemarks: 'Clarify scope' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, status: 404 });

    auth.mockResolvedValueOnce({ ...context, vendorId: undefined });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(raisePpoIssue(request({ issueRemarks: 'Clarify scope' }), params('ppo-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.forbiddenYouCanOnlyRaiseIssuesOnPurchaseOrdersIssuedToYourCompany, status: 403,
    });
    auth.mockResolvedValueOnce({ ...context, vendorId: 'vendor-2' });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(raisePpoIssue(request({ issueRemarks: 'Clarify scope' }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 403 });

    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    notify.mockResolvedValueOnce({
      tenantId: 'tenant-1', targetRole: 'PROCUREMENT_USER', title: 'Issue raised', message: 'Review PPO issue',
      entityType: 'PPO', entityId: 'ppo-1', recordNumber: 'PPO-001',
    });
    await expect(raisePpoIssue(request({ issueRemarks: '  Confirm cable specification  ', raisedBy: 'Site Buyer' }), params('ppo-1'))).resolves.toMatchObject({
      ok: true, data: { ppo: { vendorStatus: 'ISSUE_RAISED' }, message: expect.stringContaining('successfully logged') },
    });
    const issueBatch = batch.mock.calls.at(-1)?.[0] as Array<{ sql: string; values: unknown[] }>;
    expect(issueBatch.map(({ sql }) => sql)).toEqual([
      PPO_VENDOR_ISSUE_UPDATE_IF_ISSUED_SQL,
      expect.stringContaining('INSERT INTO "audit_logs"'),
      RFQ_VENDOR_MESSAGE_INSERT_AFTER_AUDIT_SQL,
      expect.stringContaining('INSERT INTO "notification_outbox"'),
    ]);
    expect(issueBatch[0].values).toEqual(['Confirm cable specification', expect.any(Date), expect.any(Date), 'ppo-1', 'tenant-1']);
    expect(issueBatch[1].values[6]).toBe('PPO_VENDOR_ISSUE_RAISED');
    expect(issueBatch[2].values[5]).toBe('VENDOR');
    expect(issueBatch[2].values[6]).toContain('PPO acceptance is held pending resolution');
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'PPO_ISSUE_RAISED', actorName: 'Site Buyer' }), { prepareOnly: true });
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.rfqMessage.create).not.toHaveBeenCalled();

    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ rfqId: null }));
    notify.mockResolvedValueOnce(undefined);
    await raisePpoIssue(request({ issueRemarks: 'Question' }), params('ppo-1'));
    expect(batch.mock.calls.at(-1)?.[0]).toHaveLength(2);

    db.ppo.findFirst.mockRejectedValueOnce(new Error('issue database error'));
    await expect(raisePpoIssue(request({ issueRemarks: 'Question' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitIssueOnPurchaseOrder, status: 500 });
    db.ppo.findFirst.mockRejectedValueOnce({});
    await expect(raisePpoIssue(request({ issueRemarks: 'Question' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitIssueOnPurchaseOrder, status: 500 });
  });

  it('accepts PPOs once, posts the acceptance when linked to an RFQ, and handles alternate signatories', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toBe(denied);
    db.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, status: 404 });

    auth.mockResolvedValueOnce({ ...context, vendorId: undefined });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 403 });
    auth.mockResolvedValueOnce({ ...context, vendorId: 'vendor-2' });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 403 });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ vendorStatus: 'ACCEPTED_BY_VENDOR' }));
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.thisPurchaseOrderHasAlreadyBeenAccepted, status: 400 });

    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    notify.mockResolvedValueOnce({
      tenantId: 'tenant-1', targetRole: 'PROJECT_USER', title: 'Accepted', message: 'PPO accepted',
      entityType: 'PPO', entityId: 'ppo-1', recordNumber: 'PPO-001',
    });
    await expect(acceptPpo(request({ acceptedBy: 'Authorized Buyer', vendorComments: 'Ready to proceed' }), params('ppo-1'))).resolves.toMatchObject({
      ok: true, data: { ppo: { id: 'ppo-1', status: 'CONFIRMED', vendorStatus: 'ACCEPTED_BY_VENDOR', vendorAcceptedBy: 'Authorized Buyer' }, message: expect.stringContaining('Authorized Buyer') },
    });
    const acceptBatch = batch.mock.calls.at(-1)?.[0] as Array<{ sql: string; values: unknown[] }>;
    expect(acceptBatch.map(({ sql }) => sql)).toEqual([
      PPO_VENDOR_ACCEPT_UPDATE_IF_ISSUED_SQL,
      expect.stringContaining('INSERT INTO "audit_logs"'),
      RFQ_VENDOR_MESSAGE_INSERT_AFTER_AUDIT_SQL,
      expect.stringContaining('INSERT INTO "notification_outbox"'),
    ]);
    expect(acceptBatch[0].values).toEqual([expect.any(Date), 'Authorized Buyer', expect.any(Date), 'ppo-1', 'tenant-1']);
    expect(JSON.parse(String(acceptBatch[1].values[9]))).toEqual(expect.objectContaining({ vendorComments: 'Ready to proceed' }));
    expect(acceptBatch[2].values[5]).toBe('VENDOR');
    expect(acceptBatch[2].values[6]).toContain('formally accepted');
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'PPO_ACCEPTED_BY_VENDOR', actorName: 'Authorized Buyer' }), { prepareOnly: true });
    expect(db.ppo.update).not.toHaveBeenCalled();
    expect(db.rfqMessage.create).not.toHaveBeenCalled();

    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ rfqId: null }));
    notify.mockResolvedValueOnce(undefined);
    await acceptPpo(request(), params('ppo-1'));
    expect(batch.mock.calls.at(-1)?.[0][0].values[1]).toBe('Acme Authorized Signatory');

    db.ppo.findFirst.mockRejectedValueOnce(new Error('acceptance database error'));
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToAcceptPurchaseOrder2, status: 500 });
    db.ppo.findFirst.mockRejectedValueOnce({});
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToAcceptPurchaseOrder2, status: 500 });
  });

  it('rejects malformed vendor action payloads, invalid lifecycle states, and unsuccessful D1 transitions', async () => {
    await expect(acceptPpo(request([]), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(acceptPpo(request({ vendorComments: 4 }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(acceptPpo(request({ vendorComments: 'x'.repeat(PPO_VENDOR_ACTION_COMMENT_MAX_LENGTH + 1) }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ status: 'DRAFT' }));
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 409 });

    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 409 });

    await expect(raisePpoIssue(request([]), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(raisePpoIssue(request({ issueRemarks: 7 }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(raisePpoIssue(request({ issueRemarks: 'x'.repeat(PPO_VENDOR_ACTION_COMMENT_MAX_LENGTH + 1) }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ status: 'DRAFT' }));
    await expect(raisePpoIssue(request({ issueRemarks: 'Blocked item' }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 409 });

    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ rfqId: null, vendor: { name: 'Acme' } }));
    batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    await expect(raisePpoIssue(request({ issueRemarks: 'Blocked item' }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 409 });
    expect(JSON.parse(String(batch.mock.calls.at(-1)?.[0][1].values[9]))).toMatchObject({ raisedBy: 'Acme Representative' });
  });

  it('enforces approval levels, role access, agreement signatures, and finalizes rate cards', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(approveRateCard(request(), params('card-1'))).resolves.toBe(denied);
    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({ tenantId: 'other-tenant' }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });

    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_USER' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard());
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.forbiddenOnlyProjectApproversOrAdminsCanPerformLevel1Approval, status: 403,
    });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard());
    await expect(approveRateCard(request({ remarks: 'Commercial review complete' }), params('card-1'))).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('forwarded to Finance') },
    });
    expectBoundedApprovalHistoryRead();
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_APPROVE_PROJECT_UPDATE_SQL,
      updateValues: expect.arrayContaining(['Vendor User', 'card-1', 'tenant-1', 'PENDING_PROJECT_APPROVAL']),
      approvalValues: expect.arrayContaining(['LEVEL_1_PROJECT', 'APPROVED', 'Commercial review complete']),
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard());
    await approveRateCard(request(), params('card-1'));
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateSql: RATE_CARD_APPROVE_PROJECT_UPDATE_SQL,
      approvalValues: expect.arrayContaining(['APPROVED', 'Level 1 Project Approval granted. Routed to Finance Approver.']),
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({ status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE' }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({ ok: false, status: 403 });

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_APPROVER' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({
      status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE',
      notes: JSON.stringify({ agreement: { required: true, signatureRequired: true } }),
    }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Activation Blocked'), status: 400 });

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_USER', userName: '', userEmail: '' });
    transition.mockClear();
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({
      status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE', notes: 'not-json',
    }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({
      ok: false, error: UI_STRINGS.common.userMessages.failedToApproveRateCard, status: 500,
    });
    expect(transition).not.toHaveBeenCalled();
    expect(structuredLog).toHaveBeenCalledWith('error', 'rate_card.workflow_metadata_invalid', expect.objectContaining({
      rateCardId: 'card-1', field: 'notes',
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_APPROVER' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({
      status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE',
      notes: JSON.stringify({ agreement: { required: true, signatureRequired: true, signature: { verified: true } } }),
    }));
    await approveRateCard(request({ remarks: 'Signed agreement verified' }), params('card-1'));

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_APPROVER' });
    transition.mockResolvedValueOnce(false);
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({ status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE' }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({ status: 'DRAFT', approvalLevel: 'UNASSIGNED' }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('not in a pending approval state'), status: 400 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('approval database error'));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToApproveRateCard, status: 500 });
    db.vendorRateCard.findFirst.mockRejectedValueOnce({});
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: 'Failed to approve rate card', status: 500 });
  });

  it('handles missing approver metadata and a stale project approval transition', async () => {
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER', userName: '', userEmail: '' });
    transition.mockResolvedValueOnce(false);
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({ approvalLevel: undefined }));

    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateValues: expect.arrayContaining(['PROJECT_APPROVER', null]),
      approvalValues: expect.arrayContaining(['PROJECT_APPROVER', null, 'Level 1 Project Approval granted. Routed to Finance Approver.']),
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER', userName: '', userEmail: '' });
    transition.mockResolvedValueOnce(true);
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({ approvalLevel: undefined, approvals: [] }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({
      ok: true, data: { rateCard: { approvals: [expect.objectContaining({ approverEmail: null })] } },
    });

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_APPROVER', userName: '', userEmail: '' });
    db.vendorRateCard.findFirst.mockResolvedValueOnce(rateCard({
      status: 'PENDING_FINANCE_APPROVAL', approvalLevel: undefined, notes: '{}', approvals: undefined,
    }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({
      ok: true, data: { rateCard: { approvals: [expect.objectContaining({ approverEmail: null })] } },
    });
    expect(transition).toHaveBeenLastCalledWith(expect.objectContaining({
      updateValues: expect.arrayContaining(['FINANCE_APPROVER', null]),
      approvalValues: expect.arrayContaining(['FINANCE_APPROVER', null, 'Level 2 Finance Approval granted. Rate Card is now Active.']),
    }));
  });
});
