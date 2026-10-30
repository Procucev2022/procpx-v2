import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/procurement/rate-cards/direct-ppo/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    vendorRateCard: { findFirst: jest.fn() },
    procurementRequest: { findFirst: jest.fn() },
    rfq: { findFirst: jest.fn() },
    ppo: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResult = apiError as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1', userName: 'Buyer One' };
const rateCard = {
  id: 'rate-card-1', rateCardNumber: 'VRC-2026-000001', status: 'APPROVED',
  validFrom: new Date('2020-01-01'), validTo: new Date('2099-12-31'), terms: 'Rate card terms',
  vendorId: 'vendor-1', vendor: { name: 'Northwind Electrical', complianceStatus: 'COMPLIANT' },
  items: [{ description: 'Copper Cable', rate: 125, specification: '4C x 25mm' }],
};
const pr = {
  id: 'pr-1', status: 'PR_APPROVED', projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1',
  boqRevisionId: 'revision-1', title: 'Electrical package',
  lines: [{ id: 'pr-line-1', lineNumber: '1', itemDescription: 'copper cable', specification: null,
    category: 'Electrical', subcategory: 'Power', uom: 'm', quantity: 10, boqLineId: 'boq-line-1' }],
};

function request(body: unknown) {
  return { json: jest.fn().mockResolvedValue(body) } as unknown as NextRequest;
}

describe('direct PPO from rate card route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.vendorRateCard.findFirst.mockResolvedValue(rateCard);
    db.procurementRequest.findFirst.mockResolvedValue(pr);
    db.rfq.findFirst.mockResolvedValue(null);
    db.ppo.findFirst.mockResolvedValue(null);
    db.ppo.count.mockResolvedValue(2);
    db.ppo.create.mockResolvedValue({ id: 'ppo-1', ppoNumber: 'PPO-2026-000003' });
    audit.mockResolvedValue(undefined);
    notify.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('validates authorization, required source identifiers, rate cards, status, validity, and compliance', async () => {
    const denied = { ok: false, status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toBe(denied);

    await expect(POST(request({}))).resolves.toEqual({ ok: false, error: 'Rate Card ID and either prId or rfqId are required', status: 400 });
    await expect(POST(request({ rateCardId: 'rate-card-1' }))).resolves.toEqual({ ok: false, error: 'Rate Card ID and either prId or rfqId are required', status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rateCardId: 'foreign', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: 'Vendor Rate Card not found or access denied', status: 404,
    });

    db.vendorRateCard.findFirst.mockResolvedValueOnce({ ...rateCard, status: 'DRAFT' });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining("status 'DRAFT'"),
    });

    db.vendorRateCard.findFirst.mockResolvedValueOnce({ ...rateCard, validFrom: new Date('2099-01-01') });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('not yet valid'),
    });

    db.vendorRateCard.findFirst.mockResolvedValueOnce({ ...rateCard, validTo: new Date('2020-01-01') });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('expired or not yet valid'),
    });

    db.vendorRateCard.findFirst.mockResolvedValueOnce({ ...rateCard, vendor: { ...rateCard.vendor, complianceStatus: 'SUSPENDED' } });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining("compliance status is 'SUSPENDED'"),
    });
  });

  it('validates approved PRs, duplicate orders, and non-empty requirements', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'missing' }))).resolves.toEqual({
      ok: false, error: 'Approved Procurement Request not found', status: 404,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce({ ...pr, status: 'PR_DRAFT' });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining("PR is in status 'PR_DRAFT'"),
    });

    db.ppo.findFirst.mockResolvedValueOnce({ ppoNumber: 'PPO-EXISTING' });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: 'Duplicate PPO prevented: Purchase Order PPO-EXISTING already exists for this PR', status: 409,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce({ ...pr, lines: [] });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: 'Requirement has no lines to source', status: 400,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce({ ...pr, lines: [{ ...pr.lines[0], itemDescription: 'Concrete pump' }] });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('Rate card does not cover all items (1 item(s) missing'),
    });
  });

  it('creates a direct PPO from a PR using rate card matches and supplied terms', async () => {
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1', deliveryTerms: 'Delivered', paymentTerms: 'Net 15', taxDetails: 'GST 5%', remarks: 'ignored' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { ppo: { id: 'ppo-1' }, message: expect.stringContaining('PPO-2026-000003') },
    });
    expect(db.vendorRateCard.findFirst).toHaveBeenCalledWith({
      where: { id: 'rate-card-1', tenantId: 'tenant-1' }, include: { vendor: true, items: true },
    });
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'pr-1', tenantId: 'tenant-1' }, include: { lines: true, project: true, costCentre: true },
    });
    expect(db.ppo.findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', prId: 'pr-1', status: { not: 'CANCELLED' } } });
    expect(db.ppo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1', boqRevisionId: 'revision-1',
        prId: 'pr-1', rfqId: null, rateCardId: 'rate-card-1', sourcingType: 'DIRECT_RATE_CARD', vendorId: 'vendor-1',
        totalValue: 1250, deliveryTerms: 'Delivered', paymentTerms: 'Net 15', taxDetails: 'GST 5%', createdById: 'buyer-1',
        lines: { create: [expect.objectContaining({
          lineNumber: 'PO-1', itemDescription: 'copper cable', specification: '4C x 25mm', orderedQuantity: 10,
        })] },
      }), include: { project: true, vendor: true, rateCard: true, lines: true },
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'PPO', entityId: 'ppo-1', action: 'PPO_CREATED_FROM_RATE_CARD', newValue: expect.objectContaining({ prId: 'pr-1' }),
    }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', event: 'PPO_CREATED', recordNumber: 'PPO-2026-000003', entityId: 'ppo-1',
    }));
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ ppo: expect.objectContaining({ id: 'ppo-1' }) }), 201);
  });

  it('creates a PPO from RFQ lines with fallback category and rate card terms', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({
      id: 'rfq-1', title: 'Cable supply', projectId: 'project-2', boqRevisionId: 'revision-2',
      boqRevision: { costCentreId: null, boqId: null },
      lines: [{ id: 'rfq-line-1', lineNumber: '2', description: 'Cable', specification: '4C', category: null,
        subcategory: null, uom: 'm', quantity: 3, prLineId: null, boqLineId: null }],
    });
    await expect(POST(request({ rateCardId: 'rate-card-1', rfqId: 'rfq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(db.rfq.findFirst).toHaveBeenCalledWith({ where: { id: 'rfq-1', tenantId: 'tenant-1' }, include: { lines: true, boqRevision: true } });
    const data = db.ppo.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'project-2', costCentreId: null, boqId: null, rfqId: 'rfq-1', prId: null,
      deliveryTerms: 'Rate card terms', paymentTerms: 'Rate card terms', taxDetails: 'GST 18% as applicable' });
    expect(data.lines.create[0]).toMatchObject({ category: 'General', prLineId: null, rfqLineId: 'rfq-line-1' });
  });

  it('returns RFQ lookup errors and reports persistence failures', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rateCardId: 'rate-card-1', rfqId: 'missing' }))).resolves.toEqual({
      ok: false, error: 'RFQ not found', status: 404,
    });

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: 'database unavailable', status: 500,
    });
    expect(errorResult).toHaveBeenCalledWith('database unavailable', 500);
  });
});
