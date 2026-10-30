import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { POST as acceptAuctionTerms } from '../src/app/api/procurement/auctions/[id]/terms-accept/route';
import { POST as raisePpoIssue } from '../src/app/api/procurement/ppos/[id]/vendor-issue/route';
import { POST as acceptPpo } from '../src/app/api/procurement/ppos/[id]/vendor-accept/route';
import { POST as approveRateCard } from '../src/app/api/procurement/rate-cards/[id]/approve/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendor: { findFirst: jest.fn() },
    auction: { findFirst: jest.fn() },
    auctionVendor: { findFirst: jest.fn(), update: jest.fn() },
    ppo: { findFirst: jest.fn(), update: jest.fn() },
    rfqMessage: { create: jest.fn() },
    vendorRateCard: { findUnique: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
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

describe('auction terms, vendor PPO actions, and rate card approval routes', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    notify.mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('accepts auction terms only for invited vendors and audits the acceptance', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toBe(denied);

    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toEqual({ ok: false, error: 'Vendor record not found for this user', status: 404 });
    auth.mockResolvedValueOnce({ ...context, userEmail: '', vendorId: undefined });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toEqual({ ok: false, error: 'Vendor record not found for this user', status: 404 });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toEqual({ ok: false, error: 'Vendor ID is required to accept terms', status: 400 });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    db.auction.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request({ vendorId: 'vendor-1' }), params('auction-1'))).resolves.toEqual({ ok: false, error: 'Auction not found', status: 404 });
    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER', vendorId: undefined });
    db.auction.findFirst.mockResolvedValueOnce({ id: 'auction-1', rfq: { projectId: 'project-1' } });
    db.auctionVendor.findFirst.mockResolvedValueOnce(null);
    await expect(acceptAuctionTerms(request({ vendorId: 'vendor-1' }), params('auction-1'))).resolves.toEqual({ ok: false, error: 'Vendor is not invited to this auction event', status: 403 });

    auth.mockResolvedValueOnce({ ...context, role: 'VENDOR' });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-1', name: 'Acme' });
    db.auction.findFirst.mockResolvedValueOnce({ id: 'auction-1', auctionNumber: 'AUC-001', rfq: { projectId: 'project-1' } });
    db.auctionVendor.findFirst.mockResolvedValueOnce({ id: 'participant-1', vendor: { name: 'Acme' } });
    db.auctionVendor.update.mockResolvedValueOnce({ id: 'participant-1' });
    await expect(acceptAuctionTerms(request(), params('auction-1'))).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('eligible to place bids'), termsAcceptedAt: expect.any(String) },
    });
    expect(db.vendor.findFirst).toHaveBeenLastCalledWith({ where: {
      tenantId: 'tenant-1', OR: [{ email: 'vendor@example.test' }, { id: 'vendor-1' }, { id: 'user-1' }],
    } });
    expect(db.auctionVendor.update).toHaveBeenCalledWith({ where: { id: 'participant-1' }, data: { termsAccepted: true, termsAcceptedAt: expect.any(Date) } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUCTION_TERMS_ACCEPTED', entityId: 'auction-1' }));

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
    await expect(raisePpoIssue(request({ issueRemarks: ' ' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'Issue / clarification description is required', status: 400 });
    db.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(raisePpoIssue(request({ issueRemarks: 'Clarify scope' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'Purchase Order not found or access denied', status: 404 });

    auth.mockResolvedValueOnce({ ...context, vendorId: undefined });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(raisePpoIssue(request({ issueRemarks: 'Clarify scope' }), params('ppo-1'))).resolves.toEqual({
      ok: false, error: 'Forbidden: you can only raise issues on purchase orders issued to your company', status: 403,
    });
    auth.mockResolvedValueOnce({ ...context, vendorId: 'vendor-2' });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(raisePpoIssue(request({ issueRemarks: 'Clarify scope' }), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 403 });

    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    db.ppo.update.mockResolvedValueOnce({ id: 'ppo-1', status: 'ISSUED', vendorStatus: 'ISSUE_RAISED' });
    await expect(raisePpoIssue(request({ issueRemarks: '  Confirm cable specification  ', raisedBy: 'Site Buyer' }), params('ppo-1'))).resolves.toMatchObject({
      ok: true, data: { ppo: { vendorStatus: 'ISSUE_RAISED' }, message: expect.stringContaining('successfully logged') },
    });
    expect(db.rfqMessage.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      senderName: 'Site Buyer', senderRole: 'VENDOR', isVendorSent: true, vendorId: 'vendor-1',
      message: expect.stringContaining('PPO acceptance is held pending resolution'),
    }) });
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'PPO_ISSUE_RAISED', actorName: 'Site Buyer' }));

    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ rfqId: null }));
    db.ppo.update.mockResolvedValueOnce({ id: 'ppo-1' });
    await raisePpoIssue(request({ issueRemarks: 'Question' }), params('ppo-1'));
    expect(db.rfqMessage.create).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'PPO_VENDOR_ISSUE_RAISED' }));

    db.ppo.findFirst.mockRejectedValueOnce(new Error('issue database error'));
    await expect(raisePpoIssue(request({ issueRemarks: 'Question' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'issue database error', status: 500 });
    db.ppo.findFirst.mockRejectedValueOnce({});
    await expect(raisePpoIssue(request({ issueRemarks: 'Question' }), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'Failed to submit issue on Purchase Order', status: 500 });
  });

  it('accepts PPOs once, posts the acceptance when linked to an RFQ, and handles alternate signatories', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toBe(denied);
    db.ppo.findFirst.mockResolvedValueOnce(null);
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'Purchase Order not found or access denied', status: 404 });

    auth.mockResolvedValueOnce({ ...context, vendorId: undefined });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 403 });
    auth.mockResolvedValueOnce({ ...context, vendorId: 'vendor-2' });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toMatchObject({ ok: false, status: 403 });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ vendorStatus: 'ACCEPTED_BY_VENDOR' }));
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'This Purchase Order has already been accepted', status: 400 });

    const updated = { id: 'ppo-1', status: 'CONFIRMED', vendorStatus: 'ACCEPTED_BY_VENDOR' };
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord());
    db.ppo.update.mockResolvedValueOnce(updated);
    await expect(acceptPpo(request({ acceptedBy: 'Authorized Buyer', vendorComments: 'Ready to proceed' }), params('ppo-1'))).resolves.toMatchObject({
      ok: true, data: { ppo: updated, message: expect.stringContaining('Authorized Buyer') },
    });
    expect(db.ppo.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'CONFIRMED', vendorStatus: 'ACCEPTED_BY_VENDOR', vendorAcceptedBy: 'Authorized Buyer',
        vendorAcceptedVersion: 1, vendorIssueRemarks: null, vendorAcceptedAt: expect.any(Date),
      }),
    }));
    expect(db.rfqMessage.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ senderName: 'Authorized Buyer', message: expect.stringContaining('formally accepted') }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'PPO_VENDOR_ACCEPTED', newValue: expect.objectContaining({ vendorComments: 'Ready to proceed' }) }));
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'PPO_ACCEPTED_BY_VENDOR', actorName: 'Authorized Buyer' }));

    auth.mockResolvedValueOnce({ ...context, userName: '' });
    db.ppo.findFirst.mockResolvedValueOnce(ppoRecord({ rfqId: null }));
    db.ppo.update.mockResolvedValueOnce(updated);
    await acceptPpo(request(), params('ppo-1'));
    expect(db.ppo.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendorAcceptedBy: 'Acme Authorized Signatory' }),
    }));
    expect(db.rfqMessage.create).toHaveBeenCalledTimes(1);

    db.ppo.findFirst.mockRejectedValueOnce(new Error('acceptance database error'));
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'acceptance database error', status: 500 });
    db.ppo.findFirst.mockRejectedValueOnce({});
    await expect(acceptPpo(request(), params('ppo-1'))).resolves.toEqual({ ok: false, error: 'Failed to accept Purchase Order', status: 500 });
  });

  it('enforces approval levels, role access, agreement signatures, and finalizes rate cards', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(approveRateCard(request(), params('card-1'))).resolves.toBe(denied);
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard({ tenantId: 'other-tenant' }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: 'Rate Card not found', status: 404 });

    auth.mockResolvedValueOnce({ ...context, role: 'PROCUREMENT_USER' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard());
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({
      ok: false, error: 'Forbidden: Only Project Approvers or Admins can perform Level 1 approval', status: 403,
    });

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard());
    db.vendorRateCard.update.mockResolvedValueOnce({ id: 'card-1', status: 'PENDING_FINANCE_APPROVAL' });
    await expect(approveRateCard(request({ remarks: 'Commercial review complete' }), params('card-1'))).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('forwarded to Finance') },
    });
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE', projectApprovedBy: 'Vendor User' }),
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard());
    db.vendorRateCard.update.mockResolvedValueOnce({ id: 'card-1' });
    await approveRateCard(request(), params('card-1'));
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvals: { create: expect.objectContaining({ remarks: 'Level 1 Project Approval granted. Routed to Finance Approver.' }) } }),
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_APPROVER' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard({ status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE' }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({ ok: false, status: 403 });

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_APPROVER' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard({
      status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE',
      notes: JSON.stringify({ agreement: { required: true, signatureRequired: true } }),
    }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Activation Blocked'), status: 400 });

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_USER', userName: '', userEmail: '' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard({
      status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE', notes: 'not-json',
    }));
    db.vendorRateCard.update.mockResolvedValueOnce({ id: 'card-1', status: 'APPROVED' });
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({
      ok: true, data: { message: expect.stringContaining('now Active and Approved') },
    });
    expect(db.vendorRateCard.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', approvalLevel: 'COMPLETED', financeApprovedBy: 'FINANCE_USER', approvedBy: 'FINANCE_USER' }),
    }));

    auth.mockResolvedValueOnce({ ...context, role: 'FINANCE_APPROVER' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard({
      status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE',
      notes: JSON.stringify({ agreement: { required: true, signatureRequired: true, signature: { verified: true } } }),
    }));
    db.vendorRateCard.update.mockResolvedValueOnce({ id: 'card-1' });
    await approveRateCard(request({ remarks: 'Signed agreement verified' }), params('card-1'));

    db.vendorRateCard.findUnique.mockResolvedValueOnce(rateCard({ status: 'DRAFT', approvalLevel: 'UNASSIGNED' }));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('not in a pending approval state'), status: 400 });
    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('approval database error'));
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: 'approval database error', status: 500 });
    db.vendorRateCard.findUnique.mockRejectedValueOnce({});
    await expect(approveRateCard(request(), params('card-1'))).resolves.toEqual({ ok: false, error: 'Failed to approve rate card', status: 500 });
  });
});
