import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { createAuditLog } from '../src/lib/audit';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { GET as getMessages, POST as postMessage } from '../src/app/api/procurement/rfqs/[id]/messages/route';
import { POST as recordDecision } from '../src/app/api/procurement/negotiations/decision/route';
import { GET as downloadStandardBoq } from '../src/app/api/boq/standard/download/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { interpolateUiString } from '../src/lib/i18n';
import {
  MAX_STANDARD_BOQ_EXPORT_CATEGORIES,
  MAX_STANDARD_BOQ_EXPORT_CATEGORY_CHILDREN,
  MAX_STANDARD_BOQ_EXPORT_ITEMS,
  MAX_STANDARD_BOQ_EXPORT_UOMS,
} from '../src/app/api/boq/standard/download/route.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn() },
    rfqVendor: { findFirst: jest.fn() },
    rfqMessage: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    negotiationRound: { findFirst: jest.fn(), update: jest.fn() },
    quote: { findFirst: jest.fn(), update: jest.fn() },
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    standardBoqItem: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
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
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const permission = hasPermission as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const buyer = { tenantId: 'tenant-1', userId: 'buyer-1', userName: 'Buyer', role: 'PROCUREMENT_MANAGER' };
const request = (url: string, body?: unknown) => new NextRequest(url, {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});
const params = { params: Promise.resolve({ id: 'rfq-1' }) };

describe('RFQ clarification messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
    permission.mockReturnValue(true);
    db.rfqMessage.count.mockResolvedValue(1);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  });

  it('enforces buyer and vendor access and forces vendor message filters to the signed-in vendor', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: null });
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenUnmappedVendorAccount, status: 403 });
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockResolvedValueOnce([{ id: 'message-1' }]);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1?vendorId=attacker'), params)).resolves.toEqual({
      ok: true, data: { messages: [{ id: 'message-1' }], total: 1, hasMore: false, nextCursor: null }, status: 200,
    });
    expect(db.rfq.findFirst).toHaveBeenCalledWith({ where: { id: 'rfq-1', tenantId: 'tenant-1', invitedVendors: { some: { vendorId: 'vendor-1' } } } });
    expect(db.rfqMessage.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', OR: [{ vendorId: 'vendor-1' }, { vendorId: null }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    });
  });

  it('checks buyer permission, filters by an optional vendor, and reports missing RFQs and query failures', async () => {
    permission.mockReturnValueOnce(false);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403 });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1?vendorId=vendor-2'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockResolvedValueOnce([]);
    await getMessages(request('http://localhost/api/rfqs/rfq-1?vendorId=vendor-2'), params);
    expect(db.rfqMessage.findMany).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', OR: [{ vendorId: 'vendor-2' }, { vendorId: null }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
    });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockRejectedValueOnce(new Error('message lookup failed'));
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchMessages2, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: 'Failed to fetch messages', status: 500 });
  });

  it('returns the newest bounded page and an exclusive cursor for older conversation history', async () => {
    const messages = Array.from({ length: 51 }, (_, offset) => {
      const index = 50 - offset;
      return {
        id: `message-${String(index).padStart(2, '0')}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      };
    });
    db.rfqMessage.count.mockResolvedValueOnce(151);
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockResolvedValueOnce(messages);
    const result = await getMessages(request('http://localhost/api/rfqs/rfq-1'), params) as unknown as {
      data: { total: number; hasMore: boolean; nextCursor: string | null; messages: Array<{ id: string }> };
    };
    expect(result.data).toMatchObject({ total: 151, hasMore: true, nextCursor: '2026-01-01T00:01:00.000Z|message-01' });
    expect(result.data.messages).toHaveLength(50);
    expect(result.data.messages[0].id).toBe('message-01');
    expect(result.data.messages[49].id).toBe('message-50');

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockResolvedValueOnce([]);
    await getMessages(request('http://localhost/api/rfqs/rfq-1?cursor=2026-01-01T00%3A01%3A00.000Z%7Cmessage-01'), params);
    expect(db.rfqMessage.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1', rfqId: 'rfq-1',
        AND: [{ OR: [
          { createdAt: { lt: new Date('2026-01-01T00:01:00.000Z') } },
          { createdAt: new Date('2026-01-01T00:01:00.000Z'), id: { lt: 'message-01' } },
        ] }],
      },
    }));
  });

  it('rejects malformed history cursors before querying message rows', async () => {
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1?cursor=not-a-cursor'), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    expect(db.rfqMessage.findMany).not.toHaveBeenCalled();
  });

  it('validates posts and stores buyer and vendor messages with their correct identity', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Hi' }), params)).resolves.toBe(denied);
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: null });
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Hi' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenUnmappedVendorAccount, status: 403 });
    permission.mockReturnValueOnce(false);
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Hi' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403 });
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: '  ' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.messageTextIsRequired, status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Question' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invitation-1' });
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: '  Please clarify  ', attachments: [{ name: 'scope.pdf' }], vendorId: 'vendor-2' }), params)).resolves.toMatchObject({
      ok: true, status: 201, data: { message: {
        id: expect.any(String), senderId: 'buyer-1', senderName: 'Buyer', senderRole: 'PROCUREMENT_MANAGER',
        message: 'Please clarify', isVendorSent: false, vendorId: 'vendor-2',
      } },
    });
    expect(db.rfqVendor.findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', rfqId: 'rfq-1', vendorId: 'vendor-2' }, select: { id: true } });
    const buyerBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(buyerBatch).toHaveLength(2);
    expect(buyerBatch[0].values).toEqual(expect.arrayContaining(['buyer-1', 'Buyer', 'PROCUREMENT_MANAGER', 'Please clarify', JSON.stringify([{ name: 'scope.pdf' }]), 0, 'vendor-2']));
    expect(buyerBatch[1].sql).toContain('WHERE changes() = 1');
    expect(db.rfqMessage.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();

    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' });
    await postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Vendor reply', vendorId: 'vendor-2', isVendorSent: false, senderName: 'Spoofed', senderRole: 'ADMIN' } ), params);
    const vendorBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(vendorBatch[0].values).toEqual(expect.arrayContaining(['Buyer', 'VENDOR', 'Vendor reply', 1, 'vendor-1']));
    expect(vendorBatch[0].values).not.toContain('Spoofed');
  });

  it('reports errors raised while writing a message', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('message write failed'));
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Question' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSendMessage, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Question' }), params)).resolves.toEqual({ ok: false, error: 'Failed to send message', status: 500 });
  });
});

describe('negotiation buyer decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValue(Array.from({ length: 6 }, () => ({ meta: { changes: 1 } })));
  });

  it('validates authorization, decision input, and negotiation round access', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(recordDecision(request('http://localhost/api/decision', {}))).resolves.toBe(denied);
    await expect(recordDecision(request('http://localhost/api/decision', {}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.roundIDAndDecisionAreRequired, status: 400 });
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'MAYBE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.decisionMustBeACCEPTEDREJECTEDOrFINALACCEPTANCEPENDING, status: 400 });
    db.negotiationRound.findFirst.mockResolvedValueOnce(null);
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'ACCEPTED' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.negotiationRoundNotFoundOrAccessDenied, status: 404 });
  });

  it('accepts a final offer, updates its quote, posts a message, audits, and notifies', async () => {
    notify.mockResolvedValueOnce({
      tenantId: 'tenant-1', targetRole: 'PROCUREMENT_USER', title: 'Offer accepted', message: 'PPO awaited',
      entityType: 'NEGOTIATION', entityId: 'rfq-1', recordNumber: 'RFQ-1',
    });
    const round = {
      id: 'round-1', status: 'OPEN', buyerDecision: null, revisedQuoteAmount: 0, previousQuoteAmount: 500,
      vendor: { id: 'vendor-1', name: 'Acme Works' },
      negotiation: { id: 'negotiation-1', rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' } },
    };
    db.negotiationRound.findFirst.mockResolvedValueOnce(round);

    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'ACCEPTED', remarks: 'Approved' }))).resolves.toMatchObject({
      ok: true, data: {
        round: expect.objectContaining({ id: 'round-1', status: 'CONCLUDED', buyerDecision: 'ACCEPTED' }),
        decision: 'ACCEPTED', statusLabel: UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.quoteAcceptedByBuyerPpoAwaited,
      },
    });
    expect(db.negotiationRound.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'round-1', tenantId: 'tenant-1' } }));
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(6);
    expect(batch[0].values).toContain('ACCEPTED');
    expect(batch[1].values).toContain('BUYER_DECISION_ACCEPTED');
    expect(batch[2].sql).toContain('ORDER BY "quoteVersion" DESC');
    expect(batch[3].sql).toContain("SET \"status\" = 'CONCLUDED'");
    expect(batch[4].values).toContain(interpolateUiString(UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerAcceptedOfferMessage, { amount: '0', vendorName: 'Acme Works' }));
    expect(batch[4].sql).toContain('rfq_messages');
    expect(batch[5].sql).toContain('INSERT INTO "notification_outbox"');
    expect(db.negotiationRound.update).not.toHaveBeenCalled();
    expect(db.quote.update).not.toHaveBeenCalled();
    expect(db.rfqMessage.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'COMMERCIAL_AWARD_APPROVED', entityId: 'rfq-1', details: expect.objectContaining({ amount: 0 }) }), { prepareOnly: true });
    expect(dispatchPreparedWorkflowNotification).toHaveBeenCalledWith(expect.any(String), expect.any(Date), expect.objectContaining({ entityId: 'round-1' }));
  });

  it('allows a buyer to decide on a vendor final offer awaiting buyer decision', async () => {
    db.negotiationRound.findFirst.mockResolvedValueOnce({
      id: 'round-final', status: 'FINAL_OFFER_SUBMITTED', buyerDecision: 'PENDING_BUYER_DECISION',
      revisedQuoteAmount: 450, previousQuoteAmount: 500,
      vendor: { id: 'vendor-1', name: 'Acme Works' },
      negotiation: { id: 'negotiation-1', rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' } },
    });
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-final', decision: 'ACCEPTED' })))
      .resolves.toMatchObject({ ok: true, data: { decision: 'ACCEPTED' } });
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch[0].sql).toContain("'PENDING_BUYER_DECISION'");
    expect(batch[0].values.slice(-3)).toEqual(['ACCEPTED', 'tenant-1', 'tenant-1']);
  });

  it('rejects and acknowledges final acceptance without changing quote state', async () => {
    for (const [decision, status, next, label] of [
      ['REJECTED', 'REJECTED', 'CLOSED', UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.quoteNotAcceptedNegotiationClosed],
      ['FINAL_ACCEPTANCE_PENDING', 'OPEN', 'BUYER', UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.finalAcceptancePendingFromBuyer],
    ]) {
      db.negotiationRound.findFirst.mockResolvedValueOnce({
        id: 'round-1', status: 'OPEN', buyerDecision: null, previousQuoteAmount: 700, vendor: { id: 'vendor-1', name: 'Acme Works' },
        negotiation: { id: 'negotiation-1', rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' } },
      });
      await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision }))).resolves.toMatchObject({ ok: true, data: { decision, statusLabel: label } });
      const batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0] as Array<{ sql: string; values: unknown[] }>;
      expect(batch[0].values).toEqual(expect.arrayContaining([decision, status, next]));
      expect(batch[batch.length - 1].sql).toContain('rfq_messages');
      expect(db.quote.findFirst).not.toHaveBeenCalled();
    }
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'NEGOTIATION_CLOSED' }), { prepareOnly: true });
  });

  it('prevents repeated or racing buyer decisions from duplicating negotiation records', async () => {
    db.negotiationRound.findFirst.mockResolvedValueOnce({
      id: 'round-1', buyerDecision: 'ACCEPTED', negotiation: { rfq: { id: 'rfq-1' } },
    });
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'ACCEPTED' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerDecisionConflictPleaseRefresh, status: 409,
    });
    db.negotiationRound.findFirst.mockResolvedValueOnce({
      id: 'round-2', status: 'OPEN', buyerDecision: null, previousQuoteAmount: 50,
      vendor: { id: 'vendor-1', name: 'Acme Works' },
      negotiation: { id: 'negotiation-1', rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' } },
    });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-2', decision: 'REJECTED' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiProcurementNegotiationsDecisionRoute.buyerDecisionConflictPleaseRefresh, status: 409,
    });
  });

  it('returns a useful server error if a decision cannot be loaded', async () => {
    db.negotiationRound.findFirst.mockRejectedValueOnce(new Error('decision lookup failed'));
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'REJECTED' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToRecordBuyerDecision, status: 500,
    });
    db.negotiationRound.findFirst.mockRejectedValueOnce({});
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'REJECTED' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToRecordBuyerDecision, status: 500,
    });
  });
});

describe('standard BOQ download', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
  });

  it('requires BOQ access before reading catalog data', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(downloadStandardBoq(request('http://localhost/api/boq/standard/download'))).resolves.toBe(denied);
    expect(auth).toHaveBeenCalledWith('BOQ_VIEW');
  });

  it('falls back to category-matched items and includes project, cost-centre, UOM, and category metadata', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', projectCode: 'P-1', name: 'Retail Store' });
    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-1', code: 'CC-1', name: 'Ground Floor', floorZone: 'L1', areaSqFt: 2500 });
    db.standardBoqItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { itemCode: 'ELE-1', standardDescription: 'Cable', detailedSpecification: 'Copper cable', uom: 'MTR', category: 'Electrical', subcategory: 'Wiring', benchmarkRate: 12, brandMake: 'Acme' },
      { itemCode: 'PL-1', standardDescription: 'Pipe', detailedSpecification: 'Water pipe', uom: 'MTR', category: 'Plumbing', subcategory: null, benchmarkRate: 0, brandMake: null },
    ]);
    db.uomMaster.findMany.mockResolvedValueOnce([{ code: 'MTR', name: 'Metre', category: 'Length' }]);
    db.category.findMany.mockResolvedValueOnce([
      { name: 'Electrical', children: [{ name: 'Wiring' }] },
      { name: 'Plumbing', children: [] },
    ]);

    const response = await downloadStandardBoq(request('http://localhost/api/boq/standard/download?sector=retail&projectType=Store%20Fitout&projectId=project-1&costCentreId=cc-1&categories=%20Electrical%20%2C%2C%20Plumbing%20'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="Standard_BOQ_RETAIL_Store_Fitout.xlsx"');
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true, sector: 'RETAIL', category: { in: [UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, 'Plumbing'] } } }));
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true, category: { in: [UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, 'Plumbing'] } } }));

    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual([UI_STRINGS.common.bOQ, 'INSTRUCTIONS', 'MASTER_DATA']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.BOQ) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(expect.objectContaining({ [UI_STRINGS.common.sNo2]: 1, [UI_STRINGS.common.itemCode]: 'ELE-1', Quantity: '', 'Area / Zone': UI_STRINGS.componentsProcurementCommercialWorkspace.l1, '_ProjectID': 'project-1', '_ProjectCode': 'P-1', '_CostCentreCode': 'CC-1', '_Sector': 'RETAIL' }));
    expect(rows[1]).toEqual(expect.objectContaining({ [UI_STRINGS.common.sNo2]: 2, [UI_STRINGS.common.itemCode]: 'PL-1', [UI_STRINGS.common.subCategory]: '', 'Benchmark Rate (Ref)': '' }));
    const instructions = XLSX.utils.sheet_to_json(workbook.Sheets.INSTRUCTIONS, { header: 1 }) as unknown[][];
    expect(instructions).toContainEqual(['Project Name:', 'Retail Store']);
    expect(instructions).toContainEqual(['Cost Centre:', expect.stringContaining('Ground Floor')]);
    const masterRows = XLSX.utils.sheet_to_json(workbook.Sheets.MASTER_DATA) as Record<string, unknown>[];
    expect(masterRows[0]).toEqual(expect.objectContaining({ 'Approved UOM Code': 'MTR', 'Standard Category': UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, 'Sub-categories': 'Wiring' }));
  });

  it('uses general active items when there are no category matches and emits blank reference rows', async () => {
    db.standardBoqItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    db.category.findMany.mockResolvedValueOnce([]);
    const response = await downloadStandardBoq(request('http://localhost/api/boq/standard/download?sector=ALL'));
    expect(response.status).toBe(200);
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true }, take: MAX_STANDARD_BOQ_EXPORT_ITEMS + 1 }));
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true }, take: 30 }));
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.BOQ)).toEqual([]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.MASTER_DATA)).toHaveLength(10);
  });

  it('uses an already matched item and reports catalog failures', async () => {
    db.project.findFirst.mockResolvedValueOnce(null);
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    db.standardBoqItem.findMany.mockResolvedValueOnce([{ itemCode: 'GEN-1', standardDescription: 'General', detailedSpecification: '', uom: 'NOS', category: 'General', benchmarkRate: null }]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    db.category.findMany.mockResolvedValueOnce([]);
    const response = await downloadStandardBoq(request('http://localhost/api/boq/standard/download?sector=all&projectType=Other%20Type&projectId=missing&costCentreId=missing-cc&categories=General'));
    expect(response.status).toBe(200);
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.BOQ) as Record<string, unknown>[];
    expect(rows[0]).toEqual(expect.objectContaining({ '_ProjectID': 'missing', '_ProjectCode': '', '_CostCentreID': 'missing-cc', '_CostCentreCode': '', '_Sector': 'ALL', 'Area / Zone': '' }));
    const instructions = XLSX.utils.sheet_to_json(workbook.Sheets.INSTRUCTIONS, { header: 1 }) as unknown[][];
    expect(instructions).toContainEqual(['Project Name:', 'Current Project']);
    expect(instructions).toContainEqual(['Cost Centre:', 'Not Specified']);

    db.standardBoqItem.findMany.mockRejectedValueOnce(new Error('catalog unavailable'));
    await expect(downloadStandardBoq(request('http://localhost/api/boq/standard/download'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToGenerateStandardBoqDownload, status: 500 });
  });

  it('bounds exported BOQ items and master references instead of building unbounded workbooks', async () => {
    db.standardBoqItem.findMany.mockResolvedValueOnce(Array.from({ length: MAX_STANDARD_BOQ_EXPORT_ITEMS + 1 }, () => ({})));
    await expect(downloadStandardBoq(request('http://localhost/api/boq/standard/download'))).resolves.toMatchObject({ status: 413 });

    db.standardBoqItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce(Array.from({ length: MAX_STANDARD_BOQ_EXPORT_UOMS + 1 }, () => ({})));
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(downloadStandardBoq(request('http://localhost/api/boq/standard/download'))).resolves.toMatchObject({ status: 413 });

    db.standardBoqItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    db.category.findMany.mockResolvedValueOnce(Array.from({ length: MAX_STANDARD_BOQ_EXPORT_CATEGORIES + 1 }, () => ({ children: [] })));
    await expect(downloadStandardBoq(request('http://localhost/api/boq/standard/download'))).resolves.toMatchObject({ status: 413 });

    db.standardBoqItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    db.category.findMany.mockResolvedValueOnce([{ children: Array.from({ length: MAX_STANDARD_BOQ_EXPORT_CATEGORY_CHILDREN + 1 }, () => ({})) }]);
    await expect(downloadStandardBoq(request('http://localhost/api/boq/standard/download'))).resolves.toMatchObject({ status: 413 });
  });
});
