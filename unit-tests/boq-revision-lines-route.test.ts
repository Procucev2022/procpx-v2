import { NextRequest } from 'next/server';
import { DELETE, GET, POST, PUT } from '../src/app/api/boq/[revisionId]/lines/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { validateBoqLine } from '../src/lib/boq-validate';
import { createAuditLog } from '../src/lib/audit';
import { computeLineCostBreakdown } from '../src/lib/boq-cost-breakdown';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { encodeBoqLineCursor } from '../src/lib/boq-line-pagination';


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
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const validate = validateBoqLine as jest.Mock;
const audit = createAuditLog as jest.Mock;
const computeCost = computeLineCostBreakdown as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
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
    writeBatch.mockImplementation(async (statements: Array<{ sql: string }>) => statements.map((statement) => ({
      success: true,
      meta: { changes: statement.sql.includes('UPDATE "') || statement.sql.includes('INSERT INTO "') ? 1 : 0 },
      ...(statement.sql.includes('INSERT INTO "boq_lines"')
        ? { results: [{ id: 'returned-line', lineNumber: '4', itemCode: 'ITEM-004' }] }
        : {}),
    })));
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
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5, orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }] }));
  });

  it('returns the default GET page and handles a missing aiReason cost', async () => {
    db.boqLine.findMany.mockResolvedValue([{ id: 'line', aiReason: null, aiUnitCost: 4, quantity: 1 }]);
    const result = await GET(request('/api/boq/revision-1/lines'), params) as any;
    expect(result.data).toMatchObject({ page: 1, pageSize: 50, totalPages: 1 });
    expect(computeCost).toHaveBeenCalledWith(4, 1, undefined, undefined);
    expect(db.boqLine.count).toHaveBeenCalledWith({ where: { boqRevisionId: 'revision-1', tenantId: 'tenant-1', isDeleted: false } });
  });

  it('bounds BOQ line page sizes and normalizes invalid page numbers', async () => {
    await GET(request('/api/boq/revision-1/lines?page=-2&pageSize=10000&search=%20wire%20'), params);
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
    expect(db.boqLine.count).toHaveBeenCalledWith({ where: expect.objectContaining({ OR: expect.arrayContaining([{ originalDescription: { contains: 'wire' } }]) }) });
  });

  it('continues line reads with a stable line-number and ID cursor', async () => {
    const cursor = encodeBoqLineCursor({ id: 'line-1', lineNumber: '2' });
    db.boqLine.count.mockResolvedValueOnce(5);
    db.boqLine.findMany.mockResolvedValueOnce([
      { id: 'line-3', lineNumber: '3', aiReason: null, aiUnitCost: null },
      { id: 'line-4', lineNumber: '4', aiReason: null, aiUnitCost: null },
      { id: 'line-5', lineNumber: '5', aiReason: null, aiUnitCost: null },
    ]);

    const result = await GET(request(`/api/boq/revision-1/lines?cursor=${encodeURIComponent(cursor)}&pageSize=2`), params) as unknown as {
      data: { data: Array<{ id: string }>; total: number; hasMore: boolean; nextCursor: string | null };
    };

    expect(db.boqLine.count).toHaveBeenCalledWith({
      where: { boqRevisionId: 'revision-1', tenantId: 'tenant-1', isDeleted: false },
    });
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { boqRevisionId: 'revision-1', tenantId: 'tenant-1', isDeleted: false },
          { OR: [
            { lineNumber: { gt: '2' } },
            { lineNumber: '2', id: { gt: 'line-1' } },
          ] },
        ],
      },
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
      take: 3,
    }));
    expect(result.data).toMatchObject({
      data: [{ id: 'line-3' }, { id: 'line-4' }],
      total: 5,
      hasMore: true,
      nextCursor: encodeBoqLineCursor({ id: 'line-4', lineNumber: '4' }),
    });
  });

  it('rejects malformed cursors and returns no continuation for the final cursor page', async () => {
    await expect(GET(request('/api/boq/revision-1/lines?cursor=invalid'), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    expect(db.boqLine.count).not.toHaveBeenCalled();

    const cursor = encodeBoqLineCursor({ id: 'line-1', lineNumber: '2' });
    db.boqLine.findMany.mockResolvedValueOnce([{ id: 'line-3', lineNumber: '3', aiReason: null, aiUnitCost: null }]);
    const result = await GET(request(`/api/boq/revision-1/lines?cursor=${encodeURIComponent(cursor)}&pageSize=2`), params) as unknown as {
      data: { data: Array<{ id: string }>; hasMore: boolean; nextCursor: string | null };
    };
    expect(result.data).toMatchObject({ data: [{ id: 'line-3' }], hasMore: false, nextCursor: null });
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

  it('rejects a batch if any line is missing and does not partially update valid lines', async () => {
    db.boqLine.findMany.mockResolvedValueOnce([{ ...existingLine, id: 'line-1' }]);
    const result = await PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [
      { id: 'line-1', updates: { quantity: 2 } }, { id: 'gone', updates: { quantity: 3 } },
    ] }), params);
    expect(result).toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.bOQLineNotFound, status: 404 });
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('batch-updates tenant and revision scoped lines in one audited D1 batch', async () => {
    db.boqLine.findMany.mockResolvedValueOnce([
      { ...existingLine, id: 'line-1', quantity: 4, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
      { ...existingLine, id: 'line-2', quantity: 3, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
      { ...existingLine, id: 'line-3', quantity: 5, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
      { ...existingLine, id: 'line-4', quantity: 6, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
      { ...existingLine, id: 'line-5', quantity: 6, aiUnitCost: 2, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    validate.mockReturnValue({ status: 'VALID', messages: [] });
    const result = await PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [
      { lineId: 'line-1', updates: { quantity: '2', aiUnitCost: '3', standardDescription: 'New standard', location: 'Roof', brand: 'Brand', remarks: 'Note' } },
      { id: 'line-2', updates: { quantity: 'bad', aiUnitCost: null, specification: 'Spec', uomRaw: 'M' } },
      { id: 'line-3', updates: { quantity: '', aiUnitCost: '' } },
      { id: 'line-4', updates: { quantity: null, aiUnitCost: 4, originalDescription: 'Original' } },
      { id: 'line-5', updates: {} },
    ] }), params) as any;

    expect(result.data.count).toBe(5);
    expect(db.boqLine.findMany).toHaveBeenCalledWith({ where: { id: { in: ['line-1', 'line-2', 'line-3', 'line-4', 'line-5'] }, tenantId: 'tenant-1', boqRevisionId: 'revision-1', isDeleted: false } });
    expect(db.boqLine.update).not.toHaveBeenCalled();
    expect(writeBatch).toHaveBeenCalledTimes(1);
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(15);
    expect(statements.every((statement) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].values[0]).toBe('New standard');
    expect(statements[0].values[7]).toBe(2);
    expect(statements[0].values[15]).toBe(3);
    expect(statements[0].values[16]).toBe(6);
    expect(statements[0].values[17]).toBe('COST GENERATED');
    expect(statements[1].values[6]).toBe('BOQ_LINE_UPDATED');
    expect(statements[2].sql).toContain('json_extract');
    expect(statements[3].values[7]).toBe(3);
    expect(statements[3].values[17]).toBe('VALID');
    expect(statements[6].values[7]).toBeNull();
    expect(statements[6].values[17]).toBe('QUANTITY_REQUIRED');
    expect(statements[9].values[7]).toBeNull();
    expect(statements[9].values[15]).toBe(4);
    expect(statements[12].values[16]).toBe(12);
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
    expect(db.boqLine.update).not.toHaveBeenCalled();
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(3);
    expect(statements.every((statement) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].values.slice(0, 20)).toEqual(expect.arrayContaining(['Standard', 'Original', 'Spec', 'category-new', 'subcategory-new', 'uom-new', 'EA', 2, 'Level 2', 'D-2', 'Brand', 'Model', 'Copper', 'A', 'Note', null, null, 'REVIEW', '["Check the unit"]', expect.any(Date)]));
    expect(statements[1].values).toEqual(expect.arrayContaining(['BOQ_LINE', 'line-1', 'BOQ_LINE_UPDATED', expect.any(String), expect.stringContaining('"quantity":4'), expect.stringContaining('"quantity":2')]));
    expect(statements[2].sql).toContain('json_extract');
    expect(audit).not.toHaveBeenCalled();
  });

  it('preserves nullable quantity and overrides validation when calculated cost is available', async () => {
    db.boqLine.update.mockResolvedValueOnce({ ...existingLine, id: 'line-1', quantity: null, aiUnitCost: 5, originalDescription: 'Original', standardDescription: 'Standard', uomRaw: 'NOS', categoryId: null, uomId: null });
    const result = await PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { quantity: null, aiUnitCost: '5', originalDescription: 'Original' } }), params) as any;
    expect(result.data.validationStatus).toBe('QUANTITY_REQUIRED');
    expect(db.boqLine.update).not.toHaveBeenCalled();
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements[0].values.slice(7, 18)).toEqual(expect.arrayContaining([null, 'Old location', 'D-0', 'Old brand', 'Old model', 'Old material', 'Old grade', 'Old remarks', 5, null, 'QUANTITY_REQUIRED']));
    expect(statements[1].sql).toContain('INSERT INTO "audit_logs"');
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
    const result = await POST(request('/api/boq/revision-1/lines', 'POST', {
      description: '  New cable tray  ', specification: 'Hot dipped', categoryId: 'cat-1', subcategoryId: 'sub-1', uomId: 'uom-1',
      uomRaw: 'M', quantity: '3', location: 'Roof', brand: 'Acme', model: 'A1', material: 'Steel', remarks: 'Install safely', aiUnitCost: '12.5',
    }), params) as any;
    expect(result).toEqual({ ok: true, status: 201, data: { line: { id: expect.any(String), lineNumber: '4' }, message: UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineItemAddedSuccessfully } });
    expect(db.boqLine.create).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(4);
    expect(statements.every((statement) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].values).toEqual(expect.arrayContaining(['New cable tray', 'Hot dipped', 'cat-1', 'sub-1', 'uom-1', 'M', 3, 12.5, 37.5]));
    expect(statements[1].values).toEqual(expect.arrayContaining(['BOQ_LINE', expect.any(String), 'BOQ_LINE_ADDED']));
    expect(statements[2].sql).toContain('"warningLines"');
    expect(statements[3].sql).toContain('"totalLines" = (SELECT COUNT(*)');
  });

  it('applies safe defaults for optional create fields and invalid or blank quantities', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...revision, validLines: null });
    await POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Minimal line', quantity: '', aiUnitCost: 0 }), params);
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements[0].values).toEqual(expect.arrayContaining(['Minimal line', UI_STRINGS.common.nOS, 1, 0, 0]));
    expect(db.boqLine.create).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
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

    const result = await DELETE(request('/api/boq/revision-1/lines?lineId=line-1', 'DELETE'), params);
    expect(result).toEqual({ ok: true, data: { message: 'Line 1 deleted successfully.' }, status: 200 });
    expect(db.boqLine.update).not.toHaveBeenCalled();
    expect(db.boqLine.count).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(4);
    expect(statements.every((statement) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].sql).toContain('"updatedAt" IS ?');
    expect(statements[1].sql).toContain('INSERT INTO "audit_logs"');
    expect(statements[2].sql).toContain('"warningLines"');
    expect(statements[3].sql).toContain('"isDeleted" = 1');
  });

  it('rejects malformed batch requests before querying or writing lines', async () => {
    const malformedJson = new NextRequest(new URL('/api/boq/revision-1/lines', 'http://localhost'), { method: 'PUT', body: '{' });
    await expect(PUT(malformedJson, params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', null), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [null] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [{ id: ' ' }] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [{ id: 'line-1' }, { lineId: 'line-1' }] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: Array.from({ length: 91 }, (_, index) => ({ id: `line-${index}` })) }), params)).resolves.toMatchObject({ ok: false, status: 400 });
    db.boqLine.findMany.mockResolvedValueOnce([{ ...existingLine, id: 'line-1' }]);
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [{ id: 'line-1', updates: { brand: 42 } }] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.boqLine.findMany.mockResolvedValueOnce([{ ...existingLine, id: 'line-1' }]);
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [{ id: 'line-1', updates: { originalDescription: null } }] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.boqLine.findMany.mockResolvedValueOnce([{ ...existingLine, id: 'line-1' }]);
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [{ id: 'line-1', updates: { quantity: -1 } }] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.quantityMustBeGreaterThanZero, status: 400 });
    expect(db.boqLine.findMany).toHaveBeenCalledTimes(3);
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('reports atomic batch conflicts and logs failed batch writes', async () => {
    db.boqLine.findMany.mockResolvedValueOnce([{ ...existingLine, id: 'line-1' }]).mockResolvedValueOnce([{ ...existingLine, id: 'line-1' }]);
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }]);
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [{ id: 'line-1', updates: { quantity: 2 } }] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    writeBatch.mockRejectedValueOnce(new Error('D1 batch unavailable'));
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lines: [{ id: 'line-1', updates: { quantity: 2 } }] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.line_batch_update_failed', expect.objectContaining({ lineIds: ['line-1'], error: { name: 'Error', message: 'D1 batch unavailable' } }));
  });

  it('validates malformed single-line updates and stale timestamps', async () => {
    const malformedJson = new NextRequest(new URL('/api/boq/revision-1/lines', 'http://localhost'), { method: 'PUT', body: '{' });
    await expect(PUT(malformedJson, params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 42, updates: {} }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdLinesRoute.lineIDRequired, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: [] }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { brand: 4 } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { originalDescription: null } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { quantity: 'not-a-number' } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { aiUnitCost: 'not-a-number' } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.boqLine.findFirst.mockResolvedValueOnce({ ...existingLine, updatedAt: 'invalid-date' });
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: {} }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
  });

  it('reports single-line write conflicts and captures unexpected D1 failures', async () => {
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { quantity: '' } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    writeBatch.mockRejectedValueOnce(new Error('single update failed'));
    await expect(PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { aiUnitCost: null } }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.line_update_failed', expect.objectContaining({ lineId: 'line-1', error: { name: 'Error', message: 'single update failed' } }));
  });

  it('calculates a single-line total when quantity and unit cost are present', async () => {
    const result = await PUT(request('/api/boq/revision-1/lines', 'PUT', { lineId: 'line-1', updates: { quantity: '2', aiUnitCost: '3' } }), params) as unknown as { data: { aiTotalCost: number } };
    expect(result.data.aiTotalCost).toBe(6);
    const statements = writeBatch.mock.calls[0][0] as Array<{ values: unknown[] }>;
    expect(statements[0].values[16]).toBe(6);
  });

  it('validates create values, applies text defaults, and handles D1 create failures', async () => {
    const malformedJson = new NextRequest(new URL('/api/boq/revision-1/lines', 'http://localhost'), { method: 'POST', body: '{' });
    await expect(POST(malformedJson, params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', null), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 42 }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.descriptionIsRequired, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Valid', quantity: 'bad' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.quantityMustBeGreaterThanZero, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Valid', aiUnitCost: 'bad' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Valid', aiUnitCost: -1 }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Valid', brand: 42 }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });

    await POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Defaults', specification: '  ', uomRaw: '', quantity: null, aiUnitCost: null }), params);
    const statements = writeBatch.mock.calls.at(-1)?.[0] as Array<{ values: unknown[] }>;
    expect(statements[0].values).toEqual(expect.arrayContaining(['Defaults', null, UI_STRINGS.common.nOS, 1, 150, 150]));

    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Conflict' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 }, results: [{ lineNumber: '' }] }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'No line number' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    writeBatch.mockRejectedValueOnce(new Error('create failed'));
    await expect(POST(request('/api/boq/revision-1/lines', 'POST', { description: 'Failed' }), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.line_create_failed', expect.objectContaining({ error: { name: 'Error', message: 'create failed' } }));
  });

  it('reports delete conflicts and records failed soft-delete batches', async () => {
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(DELETE(request('/api/boq/revision-1/lines?lineId=line-1', 'DELETE'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    writeBatch.mockRejectedValueOnce(new Error('delete failed'));
    await expect(DELETE(request('/api/boq/revision-1/lines?lineId=line-1', 'DELETE'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.line_delete_failed', expect.objectContaining({ lineId: 'line-1', error: { name: 'Error', message: 'delete failed' } }));
  });
});
