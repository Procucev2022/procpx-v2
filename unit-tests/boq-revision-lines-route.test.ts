import { NextRequest } from 'next/server';
import { DELETE, GET, POST, PUT } from '../src/app/api/boq/[revisionId]/lines/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { validateBoqLine } from '../src/lib/boq-validate';
import { createAuditLog } from '../src/lib/audit';
import { computeLineCostBreakdown } from '../src/lib/boq-cost-breakdown';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { findFirst: jest.fn() },
    boqLine: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/boq-validate', () => ({ validateBoqLine: jest.fn() }));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/boq-cost-breakdown', () => ({ computeLineCostBreakdown: jest.fn(() => ({ material: 2, labour: 1 })) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const validate = validateBoqLine as jest.Mock;
const audit = createAuditLog as jest.Mock;
const computeCost = computeLineCostBreakdown as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const revision = { id: 'revision-1', status: 'DRAFT', validLines: 4, boq: { projectId: 'project-1' } };
const existingLine = {
  id: 'line-1', boqRevisionId: 'revision-1', tenantId: 'tenant-1', lineNumber: '1', quantity: 4, aiUnitCost: null,
  originalDescription: 'Old description', standardDescription: 'Old standard', specification: 'Old spec', categoryId: 'category-old',
  subcategoryId: 'subcategory-old', uomId: 'uom-old', uomRaw: 'NOS', location: 'Old location', drawingReference: 'D-0',
  brand: 'Old brand', model: 'Old model', material: 'Old material', grade: 'Old grade', remarks: 'Old remarks',
};
const paramsFor = (revisionId = 'revision-1') => ({ params: Promise.resolve({ revisionId }) });
const params = paramsFor();

function request(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

describe('BOQ revision lines API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.boqRevision.findFirst.mockResolvedValue(revision);
    db.boqRevision.update.mockResolvedValue({ id: revision.id });
    db.boq.findFirst.mockResolvedValue(null);
    db.boqLine.count.mockResolvedValue(2);
    db.boqLine.findMany.mockResolvedValue([]);
    db.boqLine.findUnique.mockResolvedValue(existingLine);
    db.boqLine.findFirst.mockResolvedValue(existingLine);
    db.boqLine.update.mockResolvedValue({ ...existingLine, id: 'line-1', quantity: 2, aiUnitCost: null, originalDescription: 'Updated description', standardDescription: 'Updated standard', uomRaw: 'EA' });
    db.boqLine.create.mockResolvedValue({ id: 'line-new', lineNumber: '3' });
    validate.mockReturnValue({ status: 'REVIEW', messages: ['Check the unit'] });
    audit.mockResolvedValue(undefined);
  });

  it('requires access and resolves BOQ aliases to their latest revision', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request('/api/boq/revision-1/lines'), params)).resolves.toBe(denied);

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1', revisions: [] });
    await expect(GET(request('/api/boq/boq-1/lines'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request('/api/boq/missing/lines'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    const boqRecord = { id: 'boq-2', projectId: 'project-2', revisions: [{ ...revision, id: 'latest-revision' }] };
    db.boq.findFirst.mockResolvedValueOnce(boqRecord);
    const result = await GET(request('/api/boq/boq-2/lines'), paramsFor('boq-2')) as any;
    expect(result.data.revision.id).toBe('latest-revision');
    expect(db.boq.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'boq-2', tenantId: context.tenantId } }));
  });

  it('filters and paginates lines while decoding and deriving cost breakdowns', async () => {
    db.boqLine.count.mockResolvedValue(25);
    db.boqLine.findMany.mockResolvedValue([
      { id: 'line-a', aiReason: '{"costBreakdown":{"material":8}}', aiUnitCost: 10, quantity: 2 },
      { id: 'line-b', aiReason: '{invalid', aiUnitCost: 12, quantity: 3, category: { name: 'Electrical' }, originalDescription: 'Wire' },
      { id: 'line-c', aiReason: '{"other":true}', aiUnitCost: 15, quantity: 1, standardDescription: 'Switch' },
      { id: 'line-d', aiReason: null, aiUnitCost: null, quantity: null },
      { id: 'line-e', aiReason: null, aiUnitCost: 0, quantity: 1 },
    ]);
    const result = await GET(request('/api/boq/revision-1/lines?page=2&pageSize=5&validationStatus=VALID&search=wire'), params) as any;
    expect(result.data).toMatchObject({ total: 25, page: 2, pageSize: 5, totalPages: 5 });
    expect(result.data.data.map((line: any) => line.costBreakdown)).toEqual([
      { material: 8 }, { material: 2, labour: 1 }, { material: 2, labour: 1 }, null, null,
    ]);
    expect(computeCost).toHaveBeenCalledTimes(2);
    expect(db.boqLine.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      boqRevisionId: 'revision-1', tenantId: context.tenantId, isDeleted: false, validationStatus: UI_STRINGS.appAppBoqStudioPage.vALID,
      OR: expect.arrayContaining([{ originalDescription: { contains: 'wire' } }]),
    }) });
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5, orderBy: [{ lineNumber: 'asc' }] }));
  });

  it('returns the default GET page and handles a missing aiReason cost', async () => {
    db.boqLine.findMany.mockResolvedValue([{ id: 'line', aiReason: null, aiUnitCost: 4, quantity: 1 }]);
    const result = await GET(request('/api/boq/revision-1/lines'), params) as any;
    expect(result.data).toMatchObject({ page: 1, pageSize: 50, totalPages: 1 });
    expect(computeCost).toHaveBeenCalledWith(4, 1, undefined, undefined);
    expect(db.boqLine.count).toHaveBeenCalledWith({ where: { boqRevisionId: 'revision-1', tenantId: 'tenant-1', isDeleted: false } });
  });

  it('blocks unauthorized, missing, and approved revision updates', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', {}), params)).resolves.toBe(denied);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(request('/api/boq/missing/lines', 'PUT', {}), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...revision, status: 'APPROVED' });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', {}), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.approvedBOQsCannotBeEditedCreateANewRevisionInstead, status: 400 });
  });

  it('batch-updates existing lines, skips missing IDs and records quantity or cost states', async () => {
    db.boqLine.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...existingLine, quantity: 4 })
      .mockResolvedValueOnce({ ...existingLine, quantity: 3 })
      .mockResolvedValueOnce({ ...existingLine, quantity: 5 })
      .mockResolvedValueOnce({ ...existingLine, quantity: 6 })
      .mockResolvedValueOnce({ ...existingLine, quantity: 6, aiUnitCost: 2 });
    const result = await PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [
      {}, { id: 'gone', updates: {} },
      { lineId: 'line-1', updates: { quantity: '2', aiUnitCost: '3', standardDescription: 'New standard', location: 'Roof', brand: 'Brand', remarks: 'Note' } },
      { id: 'line-2', updates: { quantity: 'bad', aiUnitCost: null, specification: 'Spec', uomRaw: 'M' } },
      { id: 'line-3', updates: { quantity: '', aiUnitCost: '' } },
      { id: 'line-4', updates: { quantity: null, aiUnitCost: 4, originalDescription: 'Original' } },
      { id: 'line-5', updates: {} },
    ] }), params) as any;

    expect(result.data.count).toBe(5);
    expect(db.boqLine.update).toHaveBeenCalledTimes(5);
    expect(db.boqLine.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'line-1' }, data: expect.objectContaining({ quantity: 2, aiUnitCost: 3, aiTotalCost: 6, validationStatus: UI_STRINGS.appAppBoqStudioPage.cOSTGENERATED, standardDescription: 'New standard', location: 'Roof', brand: UI_STRINGS.common.brand, remarks: 'Note' }),
    }));
    expect(db.boqLine.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ aiTotalCost: null, validationStatus: UI_STRINGS.appAppBoqStudioPage.vALID, specification: 'Spec', uomRaw: 'M' }) }));
    expect(db.boqLine.update).toHaveBeenNthCalledWith(3, expect.objectContaining({ data: expect.objectContaining({ quantity: null, validationStatus: 'QUANTITY_REQUIRED' }) }));
    expect(db.boqLine.update).toHaveBeenNthCalledWith(4, expect.objectContaining({ data: expect.objectContaining({ quantity: null, aiUnitCost: 4, validationStatus: 'QUANTITY_REQUIRED' }) }));
    expect(db.boqLine.update).toHaveBeenNthCalledWith(5, expect.objectContaining({ data: expect.objectContaining({ aiUnitCost: 2, aiTotalCost: 12, validationStatus: UI_STRINGS.appAppBoqStudioPage.cOSTGENERATED }) }));
  });

  it('returns an empty batch result for an empty lines array', async () => {
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [] }), params)).resolves.toEqual({ ok: true, data: { count: 0, lines: [] }, status: 200 });
    expect(db.boqLine.update).not.toHaveBeenCalled();
  });

  it('validates single-line IDs, quantities, and descriptions', async () => {
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', {}), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineIDRequired, status: 400 });
    db.boqLine.findFirst.mockResolvedValueOnce(null);
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'missing', updates: {} }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.bOQLineNotFound, status: 404 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { quantity: 0 } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.quantityMustBeGreaterThanZero, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { standardDescription: '  ' } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.descriptionCannotBeBlank, status: 400 });
    expect(validate).not.toHaveBeenCalled();
  });

  it('updates a single line, revalidates fields, and audits the change', async () => {
    db.boqLine.update.mockResolvedValueOnce({ ...existingLine, id: 'line-1', quantity: 2, aiUnitCost: null, originalDescription: 'Original', standardDescription: 'Standard', uomRaw: 'EA', categoryId: 'category-new', uomId: 'uom-new' });
    const result = await PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: {
      standardDescription: 'Standard', originalDescription: 'Original', specification: 'Spec', categoryId: 'category-new',
      subcategoryId: 'subcategory-new', uomId: 'uom-new', uomRaw: 'EA', quantity: '2', location: 'Level 2',
      drawingReference: 'D-2', brand: 'Brand', model: 'Model', material: 'Copper', grade: 'A', remarks: 'Note',
    } }), params) as any;
    expect(result.data).toMatchObject({ validationStatus: 'REVIEW', validationMessages: ['Check the unit'] });
    expect(validate).toHaveBeenCalledWith({ originalDescription: 'Original', standardDescription: UI_STRINGS.common.standard, uomRaw: 'EA', uomId: 'uom-new', quantity: 2, categoryId: 'category-new' });
    expect(db.boqLine.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'line-1' }, data: expect.objectContaining({ categoryId: 'category-new', subcategoryId: 'subcategory-new', uomId: 'uom-new', drawingReference: 'D-2', material: 'Copper', grade: 'A', quantity: 2 }),
    }));
    expect(db.boqLine.update).toHaveBeenNthCalledWith(2, { where: { id: 'line-1' }, data: { validationStatus: 'REVIEW', validationMessages: '["Check the unit"]' } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entityType: UI_STRINGS.appAppAuditPage.bOQLINE, action: 'BOQ_LINE_UPDATED', projectId: 'project-1', oldValue: expect.objectContaining({ quantity: 4 }), newValue: expect.objectContaining({ quantity: 2 }) }));
  });

  it('preserves nullable quantity and overrides validation when calculated cost is available', async () => {
    db.boqLine.update.mockResolvedValueOnce({ ...existingLine, id: 'line-1', quantity: null, aiUnitCost: 5, originalDescription: 'Original', standardDescription: 'Standard', uomRaw: 'NOS', categoryId: null, uomId: null });
    const result = await PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { quantity: null, aiUnitCost: '5', originalDescription: 'Original' } }), params) as any;
    expect(result.data.validationStatus).toBe('REVIEW');
    expect(db.boqLine.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ quantity: null, aiUnitCost: 5, aiTotalCost: null, validationStatus: 'QUANTITY_REQUIRED' }) }));
    expect(db.boqLine.update).toHaveBeenNthCalledWith(2, { where: { id: 'line-1' }, data: { validationStatus: 'QUANTITY_REQUIRED', validationMessages: '["Check the unit"]' } });
  });

  it('blocks invalid creates and validates the revision before reading the body', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', {}), params)).resolves.toBe(denied);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request('/api/boq/missing/lines', 'POST', {}), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...revision, status: 'APPROVED' });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', {}), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.approvedBOQsCannotBeEditedCreateANewRevisionInstead, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: '  ' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.descriptionIsRequired, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Bad line', quantity: -1 }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.quantityMustBeGreaterThanZero, status: 400 });
  });

  it('creates populated line items and updates revision counters', async () => {
    db.boqLine.count.mockResolvedValue(3);
    db.boqLine.create.mockResolvedValue({ id: 'line-new', lineNumber: '4' });
    const result = await POST(request('/api/boq/revision-1/lines', 'POST', {
      description: '  New cable tray  ', specification: 'Hot dipped', categoryId: 'cat-1', subcategoryId: 'sub-1', uomId: 'uom-1',
      uomRaw: 'M', quantity: '3', location: 'Roof', brand: 'Acme', model: 'A1', material: 'Steel', remarks: 'Install safely', aiUnitCost: '12.5',
    }), params) as any;
    expect(result).toEqual({ ok: true, status: 201, data: { line: { id: 'line-new', lineNumber: UI_STRINGS.common.copydlxun7 }, message: UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineItemAddedSuccessfully } });
    expect(db.boqLine.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      lineNumber: UI_STRINGS.common.copydlxun7, itemCode: 'ITEM-004', originalDescription: 'New cable tray', standardDescription: 'New cable tray',
      specification: 'Hot dipped', categoryId: 'cat-1', subcategoryId: 'sub-1', uomId: 'uom-1', uomRaw: 'M', quantity: 3,
      aiUnitCost: 12.5, aiTotalCost: 37.5, costConfidence: 0.85, benchmarkEligible: true,
    }) }));
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { totalLines: 4, validLines: 5 } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entityType: UI_STRINGS.appAppAuditPage.bOQLINE, action: 'BOQ_LINE_ADDED', entityId: 'line-new' }));
  });

  it('applies safe defaults for optional create fields and invalid or blank quantities', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...revision, validLines: null });
    await POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Minimal line', quantity: '', aiUnitCost: 0 }), params);
    expect(db.boqLine.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      itemCode: 'ITEM-003', specification: null, categoryId: null, subcategoryId: null, uomId: null, uomRaw: UI_STRINGS.common.nOS,
      quantity: 1, location: null, brand: null, model: null, material: null, remarks: null, aiUnitCost: 150, aiTotalCost: 150,
    }) }));
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { totalLines: 3, validLines: 1 } });
  });

  it('blocks invalid deletes and soft-deletes valid lines with updated counts', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(DELETE(request('/api/boq/revision-1/lines', 'DELETE'), params)).resolves.toBe(denied);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(DELETE(request('/api/boq/missing/lines', 'DELETE'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...revision, status: 'APPROVED' });
    await expect(DELETE(request('/api/boq/revision-1/lines?lineId=line-1', 'DELETE'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.approvedBOQsCannotBeEditedCreateANewRevisionInstead, status: 400 });
    await expect(DELETE(request('/api/boq/revision-1/lines', 'DELETE'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineIDIsRequired, status: 400 });
    db.boqLine.findFirst.mockResolvedValueOnce(null);
    await expect(DELETE(request('/api/boq/revision-1/lines?lineId=missing', 'DELETE'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineNotFound, status: 404 });

    db.boqLine.count.mockResolvedValue(1);
    const result = await DELETE(request('/api/boq/revision-1/lines?lineId=line-1', 'DELETE'), params);
    expect(result).toEqual({ ok: true, data: { message: 'Line 1 deleted successfully.' }, status: 200 });
    expect(db.boqLine.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'line-1' }, data: expect.objectContaining({ isDeleted: true, deletedBy: 'user-1' }) }));
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { totalLines: 1 } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOQ_LINE_DELETED', entityId: 'line-1' }));
  });
});
