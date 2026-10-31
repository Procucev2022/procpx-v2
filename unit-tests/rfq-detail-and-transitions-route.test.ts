import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { createAuditLog } from '../src/lib/audit';
import { GET as getRfq, PUT as updateRfq } from '../src/app/api/procurement/rfqs/[id]/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    rfqVendor: { findFirst: jest.fn(), updateMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const audit = createAuditLog as jest.Mock;
const buyer = { tenantId: 'tenant-1', userId: 'buyer-1', userName: 'Buyer', role: 'PROCUREMENT_MANAGER' };
const params = { params: Promise.resolve({ id: 'rfq-1' }) };
const getRequest = () => new NextRequest('http://localhost/api/procurement/rfqs/rfq-1');
const putRequest = (body: unknown) => new NextRequest('http://localhost/api/procurement/rfqs/rfq-1', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('RFQ detail read permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
    permission.mockReturnValue(true);
  });

  it('checks buyer permissions, vendor mapping, invitation membership, and missing RFQs', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getRfq(getRequest(), params)).resolves.toBe(denied);
    permission.mockReturnValueOnce(false);
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403 });
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: null });
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenUnmappedVendorAccount, status: 403 });
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfqVendor.findFirst.mockResolvedValueOnce(null);
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdRoute.forbiddenYouAreNotInvitedToThisRFQ, status: 403 });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
  });

  it('returns vendor-filtered RFQ details with auction and award data hidden', async () => {
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    const rfq = { id: 'rfq-1', invitedVendors: [{ vendorId: 'vendor-1' }], quotes: [], negotiations: [], ppos: [] };
    db.rfq.findFirst.mockResolvedValueOnce(rfq);
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: true, data: { rfq }, status: 200 });
    const query = db.rfq.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'rfq-1', tenantId: 'tenant-1' });
    expect(query.include.invitedVendors.where).toEqual({ vendorId: 'vendor-1' });
    expect(query.include.quotes.where).toEqual({ vendorId: 'vendor-1' });
    expect(query.include.negotiations.include.rounds.where).toEqual({ vendorId: 'vendor-1' });
    expect(query.include.auctions).toBe(false);
    expect(query.include.awards).toBe(false);
    expect(query.include.ppos.where).toEqual({ vendorId: 'vendor-1' });
  });

  it('returns complete buyer details and catches read failures', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', auctions: [{ id: 'auction-1' }], awards: [{ id: 'award-1' }] });
    await getRfq(getRequest(), params);
    const includes = db.rfq.findFirst.mock.calls[0][0].include;
    expect(includes.auctions).toEqual({ include: { bids: { include: { vendor: true }, orderBy: { timestamp: 'desc' } } } });
    expect(includes.awards).toEqual({ include: { recommendedVendor: true } });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ read failed'));
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: 'RFQ read failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: 'Failed to fetch RFQ detail', status: 500 });
  });
});

describe('RFQ status and edit transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
  });

  it('selects the correct permission and reports missing RFQs', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(updateRfq(putRequest({ action: 'RELEASE' }), params)).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('RFQ_RELEASE');
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(updateRfq(putRequest({ action: 'CANCEL' }), params)).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('RFQ_CANCEL');
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(updateRfq(putRequest({ title: 'Edit' }), params)).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('RFQ_EDIT');
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(updateRfq(putRequest({ status: 'UNDER_REVIEW' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
  });

  it('releases drafts, updates invitations, and applies draft fields with audit history', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'DRAFT', invitedVendors: [{}, {}] });
    db.rfqVendor.updateMany.mockResolvedValueOnce({ count: 2 });
    const updated = { id: 'rfq-1', status: 'RELEASED' };
    db.rfq.update.mockResolvedValueOnce(updated);
    await expect(updateRfq(putRequest({
      action: 'RELEASE', title: 'Lighting', scopeOfWork: 'Install lights', submissionDeadline: '2026-11-30T00:00:00.000Z',
      clarificationDeadline: '2026-11-01T00:00:00.000Z', deliveryRequirement: '30 days', paymentTerms: 'Net 30', taxTerms: 'GST',
    }), params)).resolves.toEqual({ ok: true, data: { rfq: updated, message: 'RFQ RFQ-1 released to 2 vendors' }, status: 200 });
    expect(db.rfqVendor.updateMany).toHaveBeenCalledWith({ where: { rfqId: 'rfq-1' }, data: { invitationStatus: UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED } });
    expect(db.rfq.update).toHaveBeenCalledWith({ where: { id: 'rfq-1' }, data: expect.objectContaining({
      status: 'RELEASED', title: 'Lighting', scopeOfWork: 'Install lights', submissionDeadline: new Date('2026-11-30T00:00:00.000Z'),
      clarificationDeadline: new Date('2026-11-01T00:00:00.000Z'), deliveryRequirement: '30 days', paymentTerms: 'Net 30', taxTerms: 'GST', releasedAt: expect.any(Date),
    }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RFQ_RELEASED', entityId: 'rfq-1', projectId: 'project-1', oldValue: { status: 'DRAFT' }, newValue: { status: 'RELEASED', reason: undefined } }));
  });

  it('rejects invalid release and cancellation requests, then records a valid cancellation', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'ISSUED', rfqNumber: 'RFQ-1', invitedVendors: [] });
    await expect(updateRfq(putRequest({ action: 'RELEASE' }), params)).resolves.toEqual({ ok: false, error: 'Cannot release RFQ in status ISSUED', status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'RELEASED', rfqNumber: 'RFQ-1', invitedVendors: [] });
    await expect(updateRfq(putRequest({ action: 'CANCEL' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdRoute.cancellationReasonIsRequired, status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'RELEASED', invitedVendors: [] });
    db.rfq.update.mockResolvedValueOnce({ id: 'rfq-1', status: 'CANCELLED' });
    await expect(updateRfq(putRequest({ action: 'CANCEL', reason: 'Project paused', title: 'Ignored after release' }), params)).resolves.toMatchObject({ ok: true, data: { rfq: { status: 'CANCELLED' }, message: 'RFQ RFQ-1 cancelled. Reason: Project paused' } });
    expect(db.rfq.update).toHaveBeenLastCalledWith({ where: { id: 'rfq-1' }, data: { status: 'CANCELLED' } });
    expect(db.rfqVendor.updateMany).not.toHaveBeenCalled();
  });

  it('allows generic status transitions, prevents edits after review, and reports write errors', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'UNDER_REVIEW', invitedVendors: [] });
    db.rfq.update.mockResolvedValueOnce({ id: 'rfq-1', status: 'UNDER_REVIEW' });
    await updateRfq(putRequest({ status: 'UNDER_REVIEW', title: 'Updated', submissionDeadline: '2026-12-01T00:00:00.000Z', scopeOfWork: '' }), params);
    expect(db.rfq.update).toHaveBeenCalledWith({ where: { id: 'rfq-1' }, data: { status: 'UNDER_REVIEW', title: UI_STRINGS.appAppProjectsPage.updated, submissionDeadline: new Date('2026-12-01T00:00:00.000Z') } });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'APPROVED', invitedVendors: [] });
    db.rfq.update.mockResolvedValueOnce({ id: 'rfq-1', status: 'APPROVED' });
    await updateRfq(putRequest({ title: 'Must not overwrite' }), params);
    expect(db.rfq.update).toHaveBeenLastCalledWith({ where: { id: 'rfq-1' }, data: {} });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ update failed'));
    await expect(updateRfq(putRequest({ status: 'DRAFT' }), params)).resolves.toEqual({ ok: false, error: 'RFQ update failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(updateRfq(putRequest({ status: 'DRAFT' }), params)).resolves.toEqual({ ok: false, error: 'Failed to update RFQ', status: 500 });
  });
});
