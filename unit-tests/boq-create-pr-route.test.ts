import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/create-pr/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { findFirst: jest.fn(), update: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    procurementRequest: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    pRLine: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'buyer-1' };
const request = (body: unknown) => new NextRequest('http://localhost/api/boq/create-pr', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function validRevision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1', revisionCode: 'R2', revisionNumber: 2, boqId: 'boq-1', costCentreId: 'cc-1',
    boq: { id: 'boq-1', projectId: 'project-1', costCentreId: null, title: 'Electrical BOQ', boqCode: 'BOQ-000001' },
    lines: [
      { id: 'line-1', lineNumber: 'L-1', quantity: 2, aiUnitCost: 10, aiTotalCost: 20, standardDescription: 'Cable', specification: 'Copper', category: { name: 'Electrical' }, subcategory: { name: 'Wire' }, uom: { code: 'MTR' }, drawingReference: 'D-1' },
      { id: 'line-2', lineNumber: null, quantity: 3, aiUnitCost: null, benchmarkRate: 4, aiTotalCost: null, originalDescription: 'Panel', category: null, subcategory: null, uom: null, uomRaw: '', drawingReference: '' },
    ],
    ...overrides,
  };
}

describe('create PR from BOQ route', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    db.boqRevision.findFirst.mockResolvedValue(validRevision());
    db.boq.findFirst.mockResolvedValue(null);
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01', name: 'North Wing' });
    db.procurementRequest.findFirst.mockResolvedValue(null);
    db.procurementRequest.count.mockResolvedValue(8);
    db.procurementRequest.create.mockResolvedValue({ id: 'pr-1', prNumber: 'PR-2026-000009' });
    db.pRLine.create.mockResolvedValue({ id: 'pr-line-1' });
    db.boqRevision.update.mockResolvedValue({ id: 'revision-1' });
    db.boq.update.mockResolvedValue({ id: 'boq-1' });
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('requires PR creation permission and at least one BOQ identifier', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({}))).resolves.toBe(denied);
    await expect(POST(request({}))).resolves.toEqual({ ok: false, error: 'BOQ Revision ID or BOQ ID is required.', status: 400 });
    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
  });

  it('resolves revision IDs or latest BOQ revisions and rejects absent revisions or cost centres', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1', revisions: [{ id: 'revision-latest', boqId: 'boq-1', lines: [] }] });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqId: 'boq-1', costCentreId: 'wrong-cc' }))).resolves.toEqual({
      ok: false, error: 'Cost centre not found for this project.', status: 404,
    });
    expect(db.boq.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'boq-1', tenantId: 'tenant-1' } }));

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-empty', revisions: [] });
    await expect(POST(request({ boqId: 'boq-empty', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: 'BOQ Revision not found.', status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqId: 'missing', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: 'BOQ Revision not found.', status: 404 });
  });

  it('requires a target cost centre, checks project scope, and rejects empty selected lines', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({
      costCentreId: null,
      boq: { id: 'boq-1', projectId: 'project-1', costCentreId: null, title: 'Electrical BOQ', boqCode: 'BOQ-000001' },
    }));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false, error: 'A valid Cost Centre is required to create a PR.', status: 400,
    });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'wrong-cc', projectId: 'project-other' }))).resolves.toEqual({
      ok: false, error: 'Cost centre not found for this project.', status: 404,
    });
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: ['missing'] }))).resolves.toEqual({
      ok: false, error: 'No valid BOQ lines available to generate PR.', status: 400,
    });
  });

  it('blocks blank or non-positive quantities with singular and plural messages', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ lines: [{ id: 'blank', quantity: null }] }));
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: 'Quantity required for 1 item before creating PR.', status: 400,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ lines: [
      { id: 'zero', quantity: 0 }, { id: 'negative', quantity: -1 },
    ] }));
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: 'Quantity required for 2 items before creating PR.', status: 400,
    });
  });

  it('prevents duplicate active PRs while allowing rejected or cancelled PRs to be retried', async () => {
    db.procurementRequest.findFirst.mockResolvedValueOnce({ prNumber: 'PR-OLD' });
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false,
      error: 'An active Procurement Request (PR-OLD) already exists for this BOQ Revision. Duplicate PR creation is prevented.',
      status: 409,
    });
    expect(db.procurementRequest.findFirst).toHaveBeenCalledWith({ where: {
      tenantId: 'tenant-1', boqRevisionId: 'revision-1', status: { notIn: ['PR_REJECTED', 'CANCELLED'] },
    } });
  });

  it('creates an auto-submitted PR with calculated values and linked line items', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ lines: [
      ...validRevision().lines,
      { id: 'line-3', lineNumber: null, quantity: 1, aiUnitCost: null, benchmarkRate: null, aiTotalCost: null, standardDescription: null, originalDescription: null, specification: '', category: null, subcategory: null, uom: null, uomRaw: null, drawingReference: null },
    ] }));
    await expect(POST(request({
      boqRevisionId: 'revision-1', projectId: 'project-override', costCentreId: 'cc-override',
      title: 'Urgent package', requiredDate: '2026-12-20', selectedLineIds: ['line-1', 'line-2', 'line-3'], autoSubmit: true,
    }))).resolves.toMatchObject({ ok: true, status: 201, data: {
      success: true, prId: 'pr-1', totalLines: 3, totalValue: 132, status: 'PR_PENDING_PROJECT_APPROVAL',
    } });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'cc-override', projectId: 'project-override', tenantId: 'tenant-1' } });
    expect(db.procurementRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', prNumber: expect.stringMatching(/^PR-\d{4}-000009$/), projectId: 'project-override',
      costCentreId: 'cc-override', boqId: 'boq-1', boqRevisionId: 'revision-1', title: 'Urgent package',
      totalEstimatedValue: 132, totalLines: 3, status: 'PR_PENDING_PROJECT_APPROVAL', requiredDate: new Date('2026-12-20'),
    }) });
    expect(db.pRLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      boqLineId: 'line-1', lineNumber: 'L-1', itemDescription: 'Cable', specification: 'Copper', category: 'Electrical',
      subcategory: 'Wire', uom: 'MTR', quantity: 2, estimatedRate: 10, estimatedValue: 20, drawingReference: 'D-1', costCentre: 'CC01',
    }) });
    expect(db.pRLine.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      boqLineId: 'line-2', lineNumber: '1', itemDescription: 'Panel', specification: null, category: 'General',
      subcategory: null, uom: 'NOS', quantity: 3, estimatedRate: 4, estimatedValue: 12, drawingReference: null,
    }) });
    expect(db.pRLine.create).toHaveBeenNthCalledWith(3, { data: expect.objectContaining({
      boqLineId: 'line-3', itemDescription: 'Line Item', specification: null, quantity: 1, estimatedRate: 100, estimatedValue: 100,
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { prStatus: 'PR_PENDING_PROJECT_APPROVAL' } });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-1' }, data: { costCentreId: 'cc-override', purpose: 'PR' } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'PR_CREATED_FROM_BOQ', entityId: 'pr-1' }) });
  });

  it('uses a draft status and generated title/date when optional PR fields are missing', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(validRevision({ boq: {
      id: 'boq-1', projectId: 'project-1', costCentreId: null, title: '', boqCode: 'BOQ-000001',
    }, costCentreId: 'cc-1' }));
    await expect(POST(request({ boqId: 'unused-fallback', boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toMatchObject({
      ok: true, data: { status: 'PR_DRAFT', totalValue: 32, message: expect.stringContaining('created with 2 items') },
    });
    expect(db.procurementRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      title: 'BOQ-000001 - Procurement Package', status: 'PR_DRAFT', requiredDate: expect.any(Date),
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { prStatus: 'PR_DRAFT' } });
  });

  it('reports parse and persistence failures with the available error message', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const malformed = { json: jest.fn().mockRejectedValue(new Error('invalid body')) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: 'invalid body', status: 500 });
    const generic = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(generic)).resolves.toEqual({ ok: false, error: 'Failed to create Procurement Request from BOQ.', status: 500 });
    db.procurementRequest.create.mockRejectedValueOnce(new Error('database unavailable'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(POST(request({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: 'database unavailable', status: 500,
    });
    expect(log).toHaveBeenCalledWith('Error creating PR from BOQ:', expect.any(Error));
    errorLog.mockRestore();
  });
});
