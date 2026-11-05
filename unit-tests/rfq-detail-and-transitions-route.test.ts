import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { createAuditLog } from '../src/lib/audit';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '../src/lib/d1-batch.constants';
import { GET as getRfq, PUT as updateRfq } from '../src/app/api/procurement/rfqs/[id]/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    rfqVendor: { findFirst: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
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
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as {
  rfq: Record<string, jest.Mock>;
  rfqVendor: Record<string, jest.Mock>;
  $queryRaw: jest.Mock;
};
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const audit = createAuditLog as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
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
    db.$queryRaw.mockResolvedValue([]);
    writeBatch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 2 } }]);
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
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfqVendor.findFirst.mockRejectedValueOnce(new Error('Invitation lookup failed'));
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqDetail, status: 500 });
  });

  it('returns vendor-filtered RFQ details with auction and award data hidden', async () => {
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invite-1' });
    const rfq = { id: 'rfq-1', invitedVendors: [{ vendorId: 'vendor-1' }], negotiations: [], ppos: [] };
    db.rfq.findFirst.mockResolvedValueOnce(rfq);
    db.$queryRaw.mockResolvedValueOnce([
      {
        quoteId: 'quote-latest', vendorId: 'vendor-1', quoteNumber: 'Q-1', quoteVersion: 3,
        versionCount: 4, status: 'SUBMITTED', totalBaseAmount: 100, taxAmount: 5,
        discountAmount: 0, totalQuoteAmount: 105, commercialTerms: 'FOB',
        paymentTermsOffered: 'Net 30', deliveryLeadTimeDays: 10, validUntil: null,
        submittedAt: null, createdAt: '2026-11-01T00:00:00.000Z', vendorRecordId: 'vendor-1',
        vendorName: 'Vendor One', vendorCode: 'V1', quoteLineId: 'quote-line-1',
        rfqLineId: 'rfq-line-1', unitRate: 50, taxPercent: 5, discountPercent: 0,
        lineTotal: 52.5, lineRemarks: 'First line',
      },
      {
        quoteId: 'quote-latest', vendorId: 'vendor-1', quoteNumber: 'Q-1', quoteVersion: 3,
        versionCount: 4, status: 'SUBMITTED', totalBaseAmount: 100, taxAmount: 5,
        discountAmount: 0, totalQuoteAmount: 105, commercialTerms: 'FOB',
        paymentTermsOffered: 'Net 30', deliveryLeadTimeDays: 10, validUntil: null,
        submittedAt: null, createdAt: '2026-11-01T00:00:00.000Z', vendorRecordId: 'vendor-1',
        vendorName: 'Vendor One', vendorCode: 'V1', quoteLineId: 'quote-line-2',
        rfqLineId: 'rfq-line-2', unitRate: 50, taxPercent: 5, discountPercent: 0,
        lineTotal: 52.5, lineRemarks: null,
      },
    ]);
    await expect(getRfq(getRequest(), params)).resolves.toMatchObject({
      ok: true,
      data: {
        rfq: {
          id: 'rfq-1',
          quotes: [{
            id: 'quote-latest', quoteVersion: 3, versionCount: 4,
            vendor: { id: 'vendor-1', name: 'Vendor One', code: 'V1' },
            lines: [
              { id: 'quote-line-1', rfqLineId: 'rfq-line-1', lineTotal: 52.5 },
              { id: 'quote-line-2', rfqLineId: 'rfq-line-2', lineTotal: 52.5 },
            ],
          }],
        },
      },
      status: 200,
    });
    const query = db.rfq.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'rfq-1', tenantId: 'tenant-1' });
    expect(query.include.invitedVendors.where).toEqual({ vendorId: 'vendor-1' });
    expect(query.include).not.toHaveProperty('quotes');
    expect(query.include.negotiations.include.rounds.where).toEqual({ vendorId: 'vendor-1' });
    expect(query.include.awards).toBe(false);
    expect(query.include.ppos.where).toEqual({ vendorId: 'vendor-1' });
    expect(query.include).not.toHaveProperty('boqRevision');
    expect(query.include).not.toHaveProperty('auctions');
    expect(query.include.lines.select).toEqual(expect.objectContaining({ id: true, description: true, boqLineId: true }));
    expect(query.include.lines.select).not.toHaveProperty('boqLine');
    const quoteQuery = db.$queryRaw.mock.calls[0][0];
    expect(quoteQuery.sql).toContain('MAX(q."quoteVersion") AS "latestVersion"');
    expect(quoteQuery.sql).toContain('GROUP BY q."tenantId", q."rfqId", q."vendorId"');
    expect(quoteQuery.sql).toContain('latest."quoteVersion" = summary."latestVersion"');
    expect(quoteQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'rfq-1', 'vendor-1']));
  });

  it('returns complete buyer details and catches read failures', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', auctions: [{ id: 'auction-1' }], awards: [{ id: 'award-1' }] });
    await getRfq(getRequest(), params);
    const includes = db.rfq.findFirst.mock.calls[0][0].include;
    expect(includes).not.toHaveProperty('auctions');
    expect(includes.awards).toEqual({ select: expect.objectContaining({ recommendedVendor: { select: { id: true, name: true, code: true } } }) });
    expect(includes.ppos.select.vendor).toEqual({ select: { id: true, name: true, code: true } });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ read failed'));
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqDetail, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: 'Failed to fetch RFQ detail', status: 500 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.$queryRaw.mockRejectedValueOnce(new Error('RFQ quote summary read failed'));
    await expect(getRfq(getRequest(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchRfqDetail, status: 500 });
  });

  it('normalizes nullable quote summary fields from D1', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.$queryRaw.mockResolvedValueOnce([{
      quoteId: 'quote-nullable', vendorId: 'vendor-2', quoteNumber: 'Q-2', quoteVersion: 1,
      versionCount: 1, status: 'SUBMITTED', totalBaseAmount: 0, taxAmount: 0,
      discountAmount: 0, totalQuoteAmount: 0, commercialTerms: null,
      paymentTermsOffered: null, deliveryLeadTimeDays: null, validUntil: null,
      submittedAt: null, createdAt: '2026-11-01T00:00:00.000Z', vendorRecordId: null,
      vendorName: null, vendorCode: null, quoteLineId: 'quote-line-nullable',
      rfqLineId: 'rfq-line-1', unitRate: null, taxPercent: null, discountPercent: null,
      lineTotal: null, lineRemarks: null,
    }]);

    await expect(getRfq(getRequest(), params)).resolves.toMatchObject({
      ok: true,
      data: {
        rfq: {
          quotes: [{
            vendor: null,
            lines: [{
              id: 'quote-line-nullable', rfqLineId: 'rfq-line-1',
              unitRate: 0, taxPercent: 0, discountPercent: 0, lineTotal: 0,
            }],
          }],
        },
      },
      status: 200,
    });
  });
});

describe('RFQ status and edit transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
    db.$queryRaw.mockResolvedValue([]);
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
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'DRAFT', _count: { invitedVendors: 2 } });
    const updated = { id: 'rfq-1', status: 'RELEASED' };
    await expect(updateRfq(putRequest({
      action: 'RELEASE', title: 'Lighting', scopeOfWork: 'Install lights', submissionDeadline: '2026-11-30T00:00:00.000Z',
      clarificationDeadline: '2026-11-01T00:00:00.000Z', deliveryRequirement: '30 days', paymentTerms: 'Net 30', taxTerms: 'GST',
    }), params)).resolves.toMatchObject({ ok: true, data: { rfq: { status: updated.status }, message: 'RFQ RFQ-1 released to 2 vendors' }, status: 200 });
    const batch = writeBatch.mock.calls[0][0];
    expect(batch).toHaveLength(3);
    expect(batch[0].sql).toContain('UPDATE "rfqs" SET');
    expect(batch[0].sql).toContain('"status" = ?');
    expect(batch[0].sql).toContain('"releasedAt" = ?');
    expect(batch[0].values).toEqual(expect.arrayContaining(['RELEASED', 'Lighting', 'Install lights', 'Net 30', 'GST', 'tenant-1', 'DRAFT']));
    expect(batch[1].sql).toBe(AUDIT_LOG_INSERT_AFTER_CHANGE_SQL);
    expect(batch[1].values).toEqual(expect.arrayContaining(['RFQ_RELEASED', 'RFQ RFQ-1 released to 2 vendors']));
    expect(batch[2].sql).toContain('UPDATE "rfq_vendors"');
    expect(db.rfq.update).not.toHaveBeenCalled();
    expect(db.rfqVendor.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('rejects invalid release and cancellation requests, then records a valid cancellation', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'ISSUED', rfqNumber: 'RFQ-1', invitedVendors: [] });
    await expect(updateRfq(putRequest({ action: 'RELEASE' }), params)).resolves.toEqual({ ok: false, error: 'Cannot release RFQ in status ISSUED', status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'RELEASED', rfqNumber: 'RFQ-1', invitedVendors: [] });
    await expect(updateRfq(putRequest({ action: 'CANCEL' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRfqsIdRoute.cancellationReasonIsRequired, status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'RELEASED', _count: { invitedVendors: 0 } });
    db.rfq.update.mockResolvedValueOnce({ id: 'rfq-1', status: 'CANCELLED' });
    await expect(updateRfq(putRequest({ action: 'CANCEL', reason: 'Project paused', title: 'Ignored after release' }), params)).resolves.toMatchObject({ ok: true, data: { rfq: { status: 'CANCELLED' }, message: 'RFQ RFQ-1 cancelled. Reason: Project paused' } });
    expect(writeBatch.mock.calls.at(-1)?.[0][0].values).toEqual(expect.arrayContaining(['CANCELLED', 'tenant-1', 'RELEASED']));
    expect(db.rfqVendor.updateMany).not.toHaveBeenCalled();
  });

  it('allows generic status transitions, prevents edits after review, and reports write errors', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'UNDER_REVIEW', _count: { invitedVendors: 0 } });
    await updateRfq(putRequest({ status: 'UNDER_REVIEW', title: 'Updated', submissionDeadline: '2026-12-01T00:00:00.000Z', scopeOfWork: '' }), params);
    expect(writeBatch.mock.calls.at(-1)?.[0][0].sql).toContain('"title" = ?');
    expect(writeBatch.mock.calls.at(-1)?.[0][0].values).toEqual(expect.arrayContaining(['UNDER_REVIEW', 'Updated', 'tenant-1']));
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', status: 'APPROVED', _count: { invitedVendors: 0 } });
    await updateRfq(putRequest({ title: 'Must not overwrite' }), params);
    expect(writeBatch.mock.calls.at(-1)?.[0][0].sql).toContain('"updatedAt" = ?');
    expect(writeBatch.mock.calls.at(-1)?.[0][0].values).not.toContain('Must not overwrite');
    db.rfq.findFirst.mockRejectedValueOnce(new Error('RFQ update failed'));
    await expect(updateRfq(putRequest({ status: 'DRAFT' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateRfq, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(updateRfq(putRequest({ status: 'DRAFT' }), params)).resolves.toEqual({ ok: false, error: 'Failed to update RFQ', status: 500 });
  });

  it('returns a conflict when the compare-and-set transition loses a race', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', tenantId: 'tenant-1', status: 'DRAFT', _count: { invitedVendors: 0 } });
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(updateRfq(putRequest({ action: 'RELEASE' }), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
  });
});
