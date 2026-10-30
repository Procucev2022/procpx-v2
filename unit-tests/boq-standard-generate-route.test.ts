import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/standard/generate/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createNextBoqRevision } from '../src/lib/boq-revision-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boq: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), create: jest.fn() },
    boqRevision: { update: jest.fn() },
    boqLine: { create: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/boq-revision-utils', () => ({ createNextBoqRevision: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const makeRevision = createNextBoqRevision as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const request = (body: unknown) => new NextRequest('http://localhost/api/boq/standard/generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('generate BOQ from standard upload API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({ id: 'project-1', name: 'Retail Store', sector: 'Retail' });
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01' });
    db.boq.findFirst.mockResolvedValue({
      id: 'boq-1', boqCode: 'BOQ-000001', title: 'Old title', description: 'Old desc', purpose: 'BUDGET',
      category: 'Old category', costCentreId: 'old-cc', scope: 'Old scope', revisions: [{ id: 'revision-0', totalLines: 0 }],
    });
    db.boq.update.mockResolvedValue({ id: 'boq-1', boqCode: 'BOQ-000001', revisions: [{ id: 'revision-0', totalLines: 0 }] });
    db.boq.count.mockResolvedValue(5);
    db.boq.create.mockResolvedValue({ id: 'boq-new', boqCode: 'BOQ-000006', revisions: [] });
    db.boqRevision.update.mockResolvedValue({ id: 'revision-0', revisionCode: 'R0' });
    db.boqLine.create.mockResolvedValue({ id: 'line-created' });
    db.category.findMany.mockResolvedValue([{ id: 'cat-electrical', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValue([{ id: 'uom-mtr', code: 'MTR' }]);
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    makeRevision.mockResolvedValue({ id: 'revision-new', revisionCode: 'R1' });
  });

  it('checks permission, project ID, line payload, and tenant project existence', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({}))).resolves.toBe(denied);
    await expect(POST(request({ validLines: [{ description: 'Item' }] }))).resolves.toEqual({ ok: false, error: 'Project ID is required.', status: 400 });
    await expect(POST(request({ projectId: 'project-1', validLines: [] }))).resolves.toEqual({ ok: false, error: 'No valid line items to generate BOQ from.', status: 400 });
    await expect(POST(request({ projectId: 'project-1', validLines: 'invalid' }))).resolves.toEqual({ ok: false, error: 'No valid line items to generate BOQ from.', status: 400 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ projectId: 'foreign', validLines: [{ description: 'Item' }] }))).resolves.toEqual({ ok: false, error: 'Project not found.', status: 404 });
  });

  it('reuses an empty revision shell, normalizes quantities, links category/UOM rows, and calculates quality', async () => {
    const validLines = [
      { category: 'Electrical', description: 'Cable', quantity: null, benchmarkRate: 20 },
      { category: 'Electrical', description: 'Switch', quantity: undefined },
      { category: 'Electrical', description: 'Socket', quantity: '', benchmarkRate: 5 },
      { category: 'Electrical', description: 'Broken qty', quantity: 'bad', benchmarkRate: 4 },
      { category: 'Electrical', description: 'Zero qty', quantity: 0, benchmarkRate: '10' },
      { category: 'Electrical', description: 'Panel', itemCode: 'P-1', quantity: '2', benchmarkRate: '10', uom: 'mtr', validationStatus: 'REVIEW', brand: 'Acme', model: 'M1', areaZone: 'North', drawingReference: 'D-1', remarks: 'Check' },
    ];
    await expect(POST(request({ projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1', validLines, fileName: 'standard.xlsx', scope: '  fit out  ' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { boqId: 'boq-1', revisionId: 'revision-0', totalLines: 6, qualityScore: 100 },
    });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'cc-1', projectId: 'project-1', tenantId: 'tenant-1' } });
    expect(db.boq.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'boq-1' }, data: expect.objectContaining({
      title: 'Old title', description: 'fit out', purpose: 'BUDGET', category: 'Electrical', costCentreId: 'cc-1', scope: '  fit out  ',
    }) }));
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-0' }, data: expect.objectContaining({
      costCentreId: 'cc-1', status: 'DRAFT', preparationStatus: 'STANDARDISED', sourceReference: 'Uploaded: standard.xlsx',
      totalLines: 6, validLines: 3, warningLines: 3, errorLines: 0, qualityScore: 50,
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      lineNumber: '1', itemCode: 'STD-L1', originalDescription: 'Cable', standardDescription: 'Cable', quantity: null,
      aiUnitCost: 20, aiTotalCost: null, categoryId: 'cat-electrical', uomId: null, uomRaw: 'NOS', validationStatus: 'QUANTITY_REQUIRED',
      validationMessages: JSON.stringify([{ level: 'WARNING', code: 'QUANTITY_REQUIRED', message: 'Quantity is required before budgeting or PR.' }]),
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(4, { data: expect.objectContaining({ quantity: null, validationStatus: 'QUANTITY_REQUIRED', aiTotalCost: null }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(5, { data: expect.objectContaining({ quantity: 0, aiTotalCost: null, validationStatus: 'WARNING' }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(6, { data: expect.objectContaining({
      itemCode: 'P-1', quantity: 2, aiUnitCost: 10, aiTotalCost: 20, categoryId: 'cat-electrical', uomId: 'uom-mtr',
      validationStatus: 'REVIEW', brand: 'Acme', model: 'M1', location: 'North', drawingReference: 'D-1', remarks: 'Check',
    }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityType: 'BOQ', entityId: 'boq-1', action: 'BOQ_GENERATED_FROM_STANDARD_DOWNLOAD_UPLOAD' }) });
    expect(makeRevision).not.toHaveBeenCalled();
  });

  it('creates a new BOQ and revision when no matching BOQ exists, with default purpose and source references', async () => {
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce(null);
    db.boq.create.mockResolvedValueOnce({ id: 'boq-new', boqCode: 'BOQ-000006', purpose: 'BUDGET', revisions: [{ id: 'used-revision', totalLines: 3 }] });
    await expect(POST(request({
      projectId: 'project-1', boqId: 'missing-boq',
      validLines: [{ quantity: 2, benchmarkRate: 0 }],
    }))).resolves.toMatchObject({ ok: true, status: 201, data: { boqId: 'boq-new', revisionId: 'revision-new' } });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      boqCode: 'BOQ-000006', title: 'General — Retail Store', purpose: 'BUDGET', category: 'General', costCentreId: null,
    }), include: { revisions: true } });
    expect(makeRevision).toHaveBeenCalledWith(expect.objectContaining({
      boqId: 'boq-new', costCentreId: null, status: 'DRAFT', sourceReference: 'Standard BOQ Download & Upload',
      budgetStatus: 'BUDGET_DRAFT', prStatus: 'PR_NOT_CREATED', totalLines: 1, qualityScore: 100,
    }));
    expect(db.boqLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      originalDescription: 'Standard Item', standardDescription: 'Standard Item', specification: '', aiSuggestedDescription: 'Standard Item',
      aiUnitCost: null, aiTotalCost: null, uomRaw: 'NOS', quantity: 2,
    }) });
  });

  it('uses existing BOQ fields and fallback line labels when request fields are blank', async () => {
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-1', boqCode: 'BOQ-1', title: '', description: 'Retained description', purpose: '', category: 'Legacy',
      costCentreId: 'old-cc', scope: 'Existing scope', revisions: [{ id: 'revision-0', totalLines: 0 }],
    });
    db.boq.update.mockResolvedValueOnce({
      id: 'boq-1', boqCode: 'BOQ-1', title: 'General — Retail Store', description: 'Retained description',
      purpose: 'BUDGET', category: 'General', costCentreId: 'old-cc', scope: 'Existing scope', revisions: [{ id: 'revision-0', totalLines: 0 }],
    });
    await expect(POST(request({ projectId: 'project-1', boqId: 'boq-1', validLines: [{ quantity: 1 }] }))).resolves.toMatchObject({
      ok: true, data: { boqId: 'boq-1', revisionId: 'revision-0', totalLines: 1 },
    });
    expect(db.costCentre.findFirst).not.toHaveBeenCalled();
    expect(db.boq.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      title: 'General — Retail Store', description: 'Retained description', purpose: 'BUDGET', category: 'General', costCentreId: 'old-cc', scope: 'Existing scope',
    }) }));
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-0' }, data: expect.objectContaining({
      costCentreId: 'old-cc', sourceReference: 'Standard BOQ Download & Upload', notes: expect.stringContaining('(Retail - Standard)'),
    }) });
    expect(db.boqLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      originalDescription: 'Standard Item', standardDescription: 'Standard Item', specification: '', aiSuggestedDescription: 'Standard Item',
    }) });
  });

  it('honors explicit title, description, purpose and existing BOQ fallbacks, and reports failures', async () => {
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-1', boqCode: 'BOQ-1', title: '', description: 'Existing description', purpose: '', category: '',
      costCentreId: null, scope: 'Existing scope', revisions: [],
    });
    db.boq.update.mockResolvedValueOnce({ id: 'boq-1', boqCode: 'BOQ-1', purpose: 'PR', revisions: [] });
    await expect(POST(request({
      projectId: 'project-1', boqId: 'boq-1', title: ' Custom ', description: ' Details ', purpose: 'PR', category: 'Civil',
      validLines: [{ itemDescription: 'Stone', quantity: '2.5', benchmarkRate: '3' }],
    }))).resolves.toMatchObject({ ok: true, data: { totalLines: 1 } });
    expect(db.boq.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'boq-1' }, data: expect.objectContaining({
      title: 'Custom', description: 'Details', purpose: 'PR', category: 'Civil',
    }) }));
    expect(makeRevision).toHaveBeenCalledWith(expect.objectContaining({ budgetStatus: 'NOT_ADDED_TO_BUDGET', prStatus: 'PR_DRAFT' }));

    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.project.findFirst.mockRejectedValueOnce(new Error('project query failed'));
    await expect(POST(request({ projectId: 'project-1', validLines: [{ description: 'Item' }] }))).resolves.toEqual({
      ok: false, error: 'project query failed', status: 500,
    });
    expect(log).toHaveBeenCalledWith('Error generating BOQ from standard upload:', expect.any(Error));
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(POST(request({ projectId: 'project-1', validLines: [{ description: 'Item' }] }))).resolves.toEqual({
      ok: false, error: 'Failed to generate Draft BOQ.', status: 500,
    });
  });
});
