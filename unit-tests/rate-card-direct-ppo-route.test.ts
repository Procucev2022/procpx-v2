import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/procurement/rate-cards/direct-ppo/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { isUserAuthorizedForProject } from '../src/lib/project-auth';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({ isUserAuthorizedForProject: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResult = apiError as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const batchWrite = writeD1BatchAtomically as jest.Mock;
const projectAuthorized = isUserAuthorizedForProject as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
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
    batchWrite.mockImplementation(async (statements: unknown[]) => statements.map(() => ({ meta: { changes: 1 } })));
    projectAuthorized.mockResolvedValue(true);
    structuredLog.mockReset().mockResolvedValue(undefined);
    audit.mockResolvedValue(undefined);
    notify.mockResolvedValue({
      tenantId: 'tenant-1', targetRole: 'PROCUREMENT_USER', title: 'PPO created', message: 'Review PPO',
      entityType: 'PPO', entityId: 'ppo-1', recordNumber: 'PPO-2026-000001',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('validates authorization, required source identifiers, rate cards, status, validity, and compliance', async () => {
    const denied = { ok: false, status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toBe(denied);

    await expect(POST(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.rateCardIDAndEitherPrIdOrRfqIdAreRequired, status: 400 });
    await expect(POST(request({ rateCardId: 'rate-card-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.rateCardIDAndEitherPrIdOrRfqIdAreRequired, status: 400 });

    db.vendorRateCard.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rateCardId: 'foreign', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.vendorRateCardNotFoundOrAccessDenied, status: 404,
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
      ok: false, error: UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.approvedProcurementRequestNotFound, status: 404,
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
      ok: false, error: UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.requirementHasNoLinesToSource, status: 400,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce({ ...pr, lines: [{ ...pr.lines[0], itemDescription: 'Concrete pump' }] });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: expect.stringContaining('Rate card does not cover all items (1 item(s) missing'),
    });
  });

  it('creates a direct PPO from a PR using rate card matches and supplied terms', async () => {
    db.ppo.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ppoNumber: 'PPO-2026-000002' });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1', deliveryTerms: 'Delivered', paymentTerms: 'Net 15', taxDetails: 'GST 5%', remarks: 'ignored' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { ppo: { id: expect.any(String) }, message: expect.stringContaining('PPO-2026-000003') },
    });
    expect(db.vendorRateCard.findFirst).toHaveBeenCalledWith({
      where: { id: 'rate-card-1', tenantId: 'tenant-1' }, include: { vendor: true, items: true },
    });
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'pr-1', tenantId: 'tenant-1' }, include: { lines: true, project: true, costCentre: true },
    });
    expect(db.ppo.findFirst).toHaveBeenNthCalledWith(1, { where: { tenantId: 'tenant-1', prId: 'pr-1', status: { not: 'CANCELLED' } }, select: { ppoNumber: true } });
    expect(db.ppo.findFirst).toHaveBeenNthCalledWith(2, {
      where: { tenantId: 'tenant-1', ppoNumber: { startsWith: 'PPO-2026-' } }, orderBy: { ppoNumber: 'desc' }, select: { ppoNumber: true },
    });
    const statements = batchWrite.mock.calls[0][0];
    expect(statements).toHaveLength(4);
    expect(statements[0].sql).toContain('NOT EXISTS');
    expect(statements[0].values).toHaveLength(40);
    expect(statements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'PPO-2026-000003', 'project-1', 'rate-card-1', 'vendor-1', 'pr-1']));
    expect(statements[1].sql).toContain('WHERE changes() = 1');
    expect(statements[1].values).toEqual(expect.arrayContaining(['PO-1', 'copper cable', '4C x 25mm', 10, 125, 1250]));
    expect(statements[2].sql).toContain('WHERE changes() = 1');
    expect(statements[2].values).toEqual(expect.arrayContaining(['PPO', 'PPO_CREATED_FROM_RATE_CARD']));
    expect(statements[3].sql).toContain('INSERT INTO "notification_outbox"');
    expect(audit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', event: 'PPO_CREATED', recordNumber: 'PPO-2026-000003', entityId: statements[0].values[0],
    }), { prepareOnly: true });
    expect(dispatchPreparedWorkflowNotification).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityId: statements[0].values[0] }));
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ ppo: expect.objectContaining({ id: statements[0].values[0] }) }), 201);
  });

  it('creates a PPO from RFQ lines with fallback category and rate card terms', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({
      id: 'rfq-1', title: 'Cable supply', status: 'AWARDED', projectId: 'project-2', boqRevisionId: 'revision-2',
      boqRevision: { costCentreId: null, boqId: null },
      lines: [{ id: 'rfq-line-1', lineNumber: '2', description: 'Cable', specification: '4C', category: null,
        subcategory: null, uom: 'm', quantity: 3, prLineId: null, boqLineId: null }],
    });
    const result = await POST(request({ rateCardId: 'rate-card-1', rfqId: 'rfq-1' }));
    expect(db.rfq.findFirst).toHaveBeenCalledWith({ where: { id: 'rfq-1', tenantId: 'tenant-1' }, include: { lines: true, boqRevision: true } });
    expect(batchWrite).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining('"status" IN (\'APPROVED\', \'AWARDED\')'), values: expect.arrayContaining(['project-2', 'rfq-1', 'vendor-1']) }),
      expect.objectContaining({ sql: expect.stringContaining('"rfqLineId"'), values: expect.arrayContaining(['General', 'rfq-line-1']) }),
    ]));
    expect(result).toMatchObject({ ok: true, status: 201, data: { ppo: { projectId: 'project-2', costCentreId: null, boqId: null, rfqId: 'rfq-1', prId: null,
      deliveryTerms: 'Rate card terms', paymentTerms: 'Rate card terms', taxDetails: 'GST 18% as applicable', lines: [{ category: 'General', prLineId: null, rfqLineId: 'rfq-line-1' }] } } });
  });

  it('returns RFQ lookup errors and reports persistence failures', async () => {
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ rateCardId: 'rate-card-1', rfqId: 'missing' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.rFQNotFound, status: 404,
    });

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.vendorRateCard.findFirst.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateDirectPpo, status: 500,
    });
    expect(errorResult).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToCreateDirectPpo, 500);
  });

  it('rejects cross-project writes and commits the vendor notification with the PPO', async () => {
    projectAuthorized.mockResolvedValueOnce(false);
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403,
    });

    db.ppo.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    notify.mockResolvedValueOnce({
      tenantId: 'tenant-1', title: 'PPO created', message: 'Review PPO', entityType: 'PPO',
      targetRole: 'PROCUREMENT_USER', recordNumber: 'PPO-2026-000002', entityId: 'ppo-1',
    });
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(batchWrite.mock.calls.at(-1)?.[0].at(-1).sql).toContain('INSERT INTO "notification_outbox"');
    expect(dispatchPreparedWorkflowNotification).toHaveBeenCalledTimes(1);
  });

  it('maps duplicate races and conditional D1 persistence failures to conflicts', async () => {
    db.ppo.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ppoNumber: 'PPO-2026-000009' });
    batchWrite.mockRejectedValueOnce(new Error('UNIQUE constraint failed'));
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: expect.stringContaining('PPO-2026-000009'), status: 409,
    });

    db.ppo.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    batchWrite.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(POST(request({ rateCardId: 'rate-card-1', prId: 'pr-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPpoSourceChangedPleaseReloadAndRetry, status: 409,
    });
  });
});
