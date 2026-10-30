import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { hasPermission } from '../src/lib/permissions';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { GET as getMessages, POST as postMessage } from '../src/app/api/procurement/rfqs/[id]/messages/route';
import { POST as recordDecision } from '../src/app/api/procurement/negotiations/decision/route';
import { GET as downloadStandardBoq } from '../src/app/api/boq/standard/download/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    rfq: { findFirst: jest.fn() },
    rfqMessage: { findMany: jest.fn(), create: jest.fn() },
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
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

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
  });

  it('enforces buyer and vendor access and forces vendor message filters to the signed-in vendor', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toBe(denied);

    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: null });
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: 'Forbidden: unmapped vendor account', status: 403 });
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockResolvedValueOnce([{ id: 'message-1' }]);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1?vendorId=attacker'), params)).resolves.toEqual({ ok: true, data: { messages: [{ id: 'message-1' }], total: 1 }, status: 200 });
    expect(db.rfq.findFirst).toHaveBeenCalledWith({ where: { id: 'rfq-1', tenantId: 'tenant-1', invitedVendors: { some: { vendorId: 'vendor-1' } } } });
    expect(db.rfqMessage.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', OR: [{ vendorId: 'vendor-1' }, { vendorId: null }] },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('checks buyer permission, filters by an optional vendor, and reports missing RFQs and query failures', async () => {
    permission.mockReturnValueOnce(false);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: 'Forbidden: insufficient permissions', status: 403 });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1?vendorId=vendor-2'), params)).resolves.toEqual({ ok: false, error: 'RFQ not found or access denied', status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockResolvedValueOnce([]);
    await getMessages(request('http://localhost/api/rfqs/rfq-1?vendorId=vendor-2'), params);
    expect(db.rfqMessage.findMany).toHaveBeenLastCalledWith({ where: { tenantId: 'tenant-1', rfqId: 'rfq-1', OR: [{ vendorId: 'vendor-2' }, { vendorId: null }] }, orderBy: { createdAt: 'asc' } });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.findMany.mockRejectedValueOnce(new Error('message lookup failed'));
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: 'message lookup failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(getMessages(request('http://localhost/api/rfqs/rfq-1'), params)).resolves.toEqual({ ok: false, error: 'Failed to fetch messages', status: 500 });
  });

  it('validates posts and stores buyer and vendor messages with their correct identity', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Hi' }), params)).resolves.toBe(denied);
    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: null });
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Hi' }), params)).resolves.toEqual({ ok: false, error: 'Forbidden: unmapped vendor account', status: 403 });
    permission.mockReturnValueOnce(false);
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Hi' }), params)).resolves.toEqual({ ok: false, error: 'Forbidden: insufficient permissions', status: 403 });
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: '  ' }), params)).resolves.toEqual({ ok: false, error: 'Message text is required', status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Question' }), params)).resolves.toEqual({ ok: false, error: 'RFQ not found or access denied', status: 404 });

    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' });
    const created = { id: 'message-1', senderName: 'Buyer', senderRole: 'PROCUREMENT_MANAGER' };
    db.rfqMessage.create.mockResolvedValueOnce(created);
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: '  Please clarify  ', attachments: [{ name: 'scope.pdf' }], vendorId: 'vendor-2' }), params)).resolves.toEqual({ ok: true, data: { message: created }, status: 201 });
    expect(db.rfqMessage.create).toHaveBeenLastCalledWith({ data: {
      tenantId: 'tenant-1', rfqId: 'rfq-1', senderId: 'buyer-1', senderName: 'Buyer', senderRole: 'PROCUREMENT_MANAGER',
      message: 'Please clarify', attachments: JSON.stringify([{ name: 'scope.pdf' }]), isVendorSent: false, vendorId: 'vendor-2',
    } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLARIFICATION_MESSAGE_SENT', entityId: 'rfq-1', projectId: 'project-1' }));

    auth.mockResolvedValueOnce({ ...buyer, role: 'VENDOR', vendorId: 'vendor-1' });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' });
    db.rfqMessage.create.mockResolvedValueOnce({ id: 'message-2', senderName: 'Vendor Representative', senderRole: 'VENDOR' });
    await postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Vendor reply', vendorId: 'vendor-2', isVendorSent: false } ), params);
    expect(db.rfqMessage.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ vendorId: 'vendor-1', isVendorSent: true, senderRole: 'VENDOR', message: 'Vendor reply' }) });
  });

  it('reports errors raised while writing a message', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1' });
    db.rfqMessage.create.mockRejectedValueOnce(new Error('message write failed'));
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Question' }), params)).resolves.toEqual({ ok: false, error: 'message write failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(postMessage(request('http://localhost/api/rfqs/rfq-1', { message: 'Question' }), params)).resolves.toEqual({ ok: false, error: 'Failed to send message', status: 500 });
  });
});

describe('negotiation buyer decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(buyer);
    isContext.mockReturnValue(true);
  });

  it('validates authorization, decision input, and negotiation round access', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(recordDecision(request('http://localhost/api/decision', {}))).resolves.toBe(denied);
    await expect(recordDecision(request('http://localhost/api/decision', {}))).resolves.toEqual({ ok: false, error: 'Round ID and Decision are required', status: 400 });
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'MAYBE' }))).resolves.toEqual({ ok: false, error: 'Decision must be ACCEPTED, REJECTED, or FINAL_ACCEPTANCE_PENDING', status: 400 });
    db.negotiationRound.findFirst.mockResolvedValueOnce(null);
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'ACCEPTED' }))).resolves.toEqual({ ok: false, error: 'Negotiation round not found or access denied', status: 404 });
  });

  it('accepts a final offer, updates its quote, posts a message, audits, and notifies', async () => {
    const round = {
      id: 'round-1', status: 'OPEN', revisedQuoteAmount: 0, previousQuoteAmount: 500,
      vendor: { id: 'vendor-1', name: 'Acme Works' },
      negotiation: { rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' } },
    };
    db.negotiationRound.findFirst.mockResolvedValueOnce(round);
    const updated = { id: 'round-1', status: 'CONCLUDED' };
    db.negotiationRound.update.mockResolvedValueOnce(updated);
    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote-1' });
    db.quote.update.mockResolvedValueOnce({ id: 'quote-1', status: 'ACCEPTED' });
    db.rfqMessage.create.mockResolvedValueOnce({ id: 'message-1' });

    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'ACCEPTED', remarks: 'Approved' }))).resolves.toMatchObject({
      ok: true, data: { round: updated, decision: 'ACCEPTED', statusLabel: expect.stringContaining('PPO Awaited') },
    });
    expect(db.negotiationRound.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'round-1', tenantId: 'tenant-1' } }));
    expect(db.negotiationRound.update).toHaveBeenCalledWith({ where: { id: 'round-1' }, data: expect.objectContaining({ buyerDecision: 'ACCEPTED', buyerDecisionRemarks: 'Approved', status: 'CONCLUDED', nextResponsibleParty: 'BUYER' }) });
    expect(db.quote.update).toHaveBeenCalledWith({ where: { id: 'quote-1' }, data: { status: 'ACCEPTED' } });
    expect(db.rfqMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rfqId: 'rfq-1', vendorId: 'vendor-1', isVendorSent: false, message: expect.stringContaining('500') }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'BUYER_DECISION_ACCEPTED', entityId: 'round-1' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'COMMERCIAL_AWARD_APPROVED', entityId: 'rfq-1', details: expect.objectContaining({ amount: 500 }) }));
  });

  it('rejects and acknowledges final acceptance without changing quote state', async () => {
    for (const [decision, status, next, label] of [
      ['REJECTED', 'REJECTED', 'CLOSED', 'Quote Not Accepted / Negotiation Closed'],
      ['FINAL_ACCEPTANCE_PENDING', 'OPEN', 'BUYER', 'Final Acceptance Pending from Buyer'],
    ]) {
      db.negotiationRound.findFirst.mockResolvedValueOnce({
        id: 'round-1', status: 'OPEN', previousQuoteAmount: 700, vendor: { id: 'vendor-1', name: 'Acme Works' },
        negotiation: { rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1' } },
      });
      db.negotiationRound.update.mockResolvedValueOnce({ id: 'round-1', status });
      db.rfqMessage.create.mockResolvedValueOnce({ id: `message-${decision}` });
      await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision }))).resolves.toMatchObject({ ok: true, data: { decision, statusLabel: label } });
      expect(db.negotiationRound.update).toHaveBeenLastCalledWith({ where: { id: 'round-1' }, data: expect.objectContaining({ status, nextResponsibleParty: next, buyerDecisionRemarks: null }) });
      expect(db.rfqMessage.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ message: expect.stringContaining(decision === 'REJECTED' ? 'Commercial parameters not aligned' : 'internal commercial committee') }) });
      expect(db.quote.findFirst).not.toHaveBeenCalled();
    }
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'NEGOTIATION_CLOSED' }));
  });

  it('returns a useful server error if a decision cannot be loaded', async () => {
    db.negotiationRound.findFirst.mockRejectedValueOnce(new Error('decision lookup failed'));
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'REJECTED' }))).resolves.toEqual({ ok: false, error: 'decision lookup failed', status: 500 });
    db.negotiationRound.findFirst.mockRejectedValueOnce({});
    await expect(recordDecision(request('http://localhost/api/decision', { roundId: 'round-1', decision: 'REJECTED' }))).resolves.toEqual({ ok: false, error: 'Failed to record buyer decision', status: 500 });
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
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true, sector: 'RETAIL', category: { in: ['Electrical', 'Plumbing'] } } }));
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true, category: { in: ['Electrical', 'Plumbing'] } } }));

    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['BOQ', 'INSTRUCTIONS', 'MASTER_DATA']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.BOQ) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(expect.objectContaining({ 'S.No.': 1, 'Item Code': 'ELE-1', Quantity: '', 'Area / Zone': 'L1', '_ProjectID': 'project-1', '_ProjectCode': 'P-1', '_CostCentreCode': 'CC-1', '_Sector': 'RETAIL' }));
    expect(rows[1]).toEqual(expect.objectContaining({ 'S.No.': 2, 'Item Code': 'PL-1', 'Sub-category': '', 'Benchmark Rate (Ref)': '' }));
    const instructions = XLSX.utils.sheet_to_json(workbook.Sheets.INSTRUCTIONS, { header: 1 }) as unknown[][];
    expect(instructions).toContainEqual(['Project Name:', 'Retail Store']);
    expect(instructions).toContainEqual(['Cost Centre:', expect.stringContaining('Ground Floor')]);
    const masterRows = XLSX.utils.sheet_to_json(workbook.Sheets.MASTER_DATA) as Record<string, unknown>[];
    expect(masterRows[0]).toEqual(expect.objectContaining({ 'Approved UOM Code': 'MTR', 'Standard Category': 'Electrical', 'Sub-categories': 'Wiring' }));
  });

  it('uses general active items when there are no category matches and emits blank reference rows', async () => {
    db.standardBoqItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    db.category.findMany.mockResolvedValueOnce([]);
    const response = await downloadStandardBoq(request('http://localhost/api/boq/standard/download?sector=ALL'));
    expect(response.status).toBe(200);
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(1, { where: { tenantId: 'tenant-1', isActive: true }, orderBy: [{ category: 'asc' }, { subcategory: 'asc' }, { itemCode: 'asc' }] });
    expect(db.standardBoqItem.findMany).toHaveBeenNthCalledWith(2, { where: { tenantId: 'tenant-1', isActive: true }, take: 30, orderBy: [{ category: 'asc' }, { itemCode: 'asc' }] });
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
    await expect(downloadStandardBoq(request('http://localhost/api/boq/standard/download'))).resolves.toEqual({ ok: false, error: 'catalog unavailable', status: 500 });
  });
});
