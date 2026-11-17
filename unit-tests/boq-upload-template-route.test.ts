import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { POST } from '../src/app/api/boq/upload-template/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createNextBoqRevision } from '../src/lib/boq-revision-utils';
import { deleteUpload, saveUpload } from '../src/lib/storage';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { COST_CENTRE_LOOKUP_MAX_OPTIONS } from '../src/app/api/cost-centres/route.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    boq: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    boqLine: { deleteMany: jest.fn(), create: jest.fn() },
    boqRevision: { update: jest.fn() },
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
jest.mock('../src/lib/storage', () => ({ saveUpload: jest.fn(), deleteUpload: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({
  logEvent: jest.fn(),
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const createRevision = createNextBoqRevision as jest.Mock;
const storeUpload = saveUpload as jest.Mock;
const removeUpload = deleteUpload as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const project = { id: 'project-1', name: 'West Campus', projectCode: 'PROJ' };
const costCentres = [{ id: 'cc-1', code: 'CC-1', name: 'Electrical' }, { id: 'cc-2', code: 'CC-2', name: 'Mechanical' }];
const category = { id: 'cat-electrical', name: 'Electrical' };
const uom = { id: 'uom-nos', code: 'NOS' };
const boq = { id: 'boq-new', boqCode: 'BOQ-000001' };
const revision = { id: 'revision-new', revisionCode: 'R0' };

function makeRequest(rows: Record<string, unknown>[], fields: Record<string, string> = {}, fileName = 'import.xlsx', sheetName = 'BOQ Data') {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const formData = new FormData();
  formData.set('file', new File([Uint8Array.from(buffer)], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new NextRequest('http://localhost/api/boq/upload-template', { method: 'POST', body: formData });
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    'Line No': '1', 'Item Description *': 'Cable', 'BOQ Description': 'Copper cable', 'Category *': 'Electrical',
    'Sub-category': 'Wiring', 'UOM *': 'NOS', 'Quantity *': '2', 'Cost Centre Code *': 'CC-2',
    'Brand / Make': 'Acme', 'Location / Area': 'Block A', Remarks: 'Urgent', 'Drawing Reference': 'DWG-01', 'Item Code': 'EL-1',
    ...overrides,
  };
}

describe('fixed template BOQ upload API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockReset().mockResolvedValue(project);
    db.costCentre.findMany.mockReset().mockResolvedValue(costCentres);
    db.category.findMany.mockReset().mockResolvedValue([category]);
    db.uomMaster.findMany.mockReset().mockResolvedValue([uom]);
    db.boq.findFirst.mockReset().mockResolvedValue(null);
    db.boq.count.mockReset().mockResolvedValue(0);
    db.boq.create.mockReset().mockResolvedValue(boq);
    db.boq.update.mockReset().mockResolvedValue(boq);
    db.boqLine.deleteMany.mockReset().mockResolvedValue({ count: 0 });
    db.boqLine.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `line-${db.boqLine.create.mock.calls.length}`, ...data }));
    db.boqRevision.update.mockReset().mockResolvedValue({});
    db.auditLog.create.mockReset().mockResolvedValue({ id: 'audit-1' });
    createRevision.mockReset().mockResolvedValue(revision);
    writeBatch.mockReset().mockImplementation(async (statements: Array<{ sql: string; values: unknown[] }>) => statements.map((statement) => {
      if (statement.sql.includes('INSERT INTO "boqs"')) {
        return { meta: { changes: 1 }, results: [{ id: statement.values[0], boqCode: 'BOQ-PROJ-001' }] };
      }
      if (statement.sql.includes('INSERT INTO "boq_revisions"')) {
        return { meta: { changes: 1 }, results: [{ id: statement.values[0], revisionCode: 'R0' }] };
      }
      if (statement.sql.includes('DELETE FROM "boq_lines"')) return { meta: { changes: 0 } };
      return { meta: { changes: 1 } };
    }));
    structuredLog.mockReset().mockResolvedValue(undefined);
    storeUpload.mockReset().mockImplementation((segments: string[], fileName: string) =>
      Promise.resolve(`uploads/${segments.join('/')}/${fileName}`));
    removeUpload.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('authorizes upload, validates required fields and project, and rejects empty workbooks', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(makeRequest([validRow()], { projectId: 'project-1' }))).resolves.toBe(denied);

    const noFile = new FormData();
    noFile.set('projectId', 'project-1');
    await expect(POST(new NextRequest('http://localhost/api/upload', { method: 'POST', body: noFile }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqUploadTemplateRoute.spreadsheetFileAndProjectIDAreRequired, status: 400,
    });
    await expect(POST(makeRequest([validRow()]))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqUploadTemplateRoute.spreadsheetFileAndProjectIDAreRequired, status: 400,
    });

    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(makeRequest([validRow()], { projectId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound2, status: 404 });

    await expect(POST(makeRequest([], { projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqUploadTemplateRoute.uploadedSpreadsheetIsEmptyOrHasNoRecognizableRows, status: 400,
    });
    expect(storeUpload).not.toHaveBeenCalled();
  });

  it('rejects duplicate template line numbers before storing the workbook', async () => {
    const result = await POST(makeRequest([
      validRow(),
      validRow({ 'Item Description *': 'Second cable' }),
    ], { projectId: 'project-1' }));

    expect(result).toEqual({
      ok: false,
      error: UI_STRINGS.common.invalidRequestBody,
      status: 400,
    });
    expect(storeUpload).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('creates a BOQ, maps valid rows, flags warnings and errors, and saves revision statistics', async () => {
    const rows = [
      validRow({ 'Quantity *': '1,200' }),
      validRow({ 'Line No': '2', 'Item Description *': 'Unpriced motor', 'Category *': 'Unknown', 'UOM *': 'BOX', 'Quantity *': '' }),
      validRow({ 'Line No': '3', 'Item Description *': 'Zero quantity', 'Category *': '', 'UOM *': '', 'Quantity *': '0' }),
      validRow({ 'Line No': '4', 'Item Description *': '', 'Quantity *': 'abc' }),
      validRow({ 'Line No': '5', 'Item Description *': 'Negative item', 'Quantity *': '-2' }),
    ];
    const result = await POST(makeRequest(rows, {
      projectId: 'project-1', title: '  Electrical Scope  ', description: '  Imported package  ',
      category: 'Electrical', purpose: 'BUDGET',
    }, 'vendor-template.xlsx'));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      boqId: expect.any(String), revisionId: expect.any(String), boqCode: 'BOQ-PROJ-001', revisionCode: 'R0',
      totalLines: 5, validLines: 1, warningLines: 2, errorLines: 2, qualityScore: 40,
      exceptions: [
        { line: '4', description: '(blank)', errors: expect.arrayContaining([expect.objectContaining({ code: 'DESC_MISSING' }), expect.objectContaining({ code: 'QTY_INVALID' })]) },
        { line: '5', description: 'Negative item', errors: [expect.objectContaining({ code: 'QTY_NEGATIVE' })] },
      ],
    } });
    const batch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch).toHaveLength(10);
    expect(batch.map((statement) => (statement.sql.match(/\?/g) || []).length)).toEqual(batch.map((statement) => statement.values.length));
    expect(batch[0].sql).toContain('INSERT INTO "boqs"');
    expect(batch[1].sql).toContain('INSERT INTO "boq_revisions"');
    expect(batch[2].sql).toContain('INSERT INTO "audit_logs"');
    expect(batch.slice(3, 8).every((statement) => statement.sql.includes('INSERT INTO "boq_lines"'))).toBe(true);
    expect(batch[3].values).toEqual(expect.arrayContaining(['Cable', 'Copper cable', 'cat-electrical', 'uom-nos', 1200, 'Acme', 'Block A', 'Urgent', 'DWG-01']));
    expect(batch[6].values).toEqual(expect.arrayContaining(['Untitled Item', 'NOS']));
    expect(batch[5].values[25]).toBe('WARNING');
    expect(batch[5].values[26]).toContain('QTY_ZERO');
    expect(batch[8].sql).toContain('UPDATE "boq_revisions"');
    expect(batch[9].sql).toContain('json_extract');
    expect(db.boq.create).not.toHaveBeenCalled();
    expect(db.boqLine.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(storeUpload).toHaveBeenCalledWith(['tenant-1', 'project-1'], expect.stringMatching(/^[0-9a-f-]{36}\.xlsx$/), expect.any(Buffer));
    expect(batch[1].values[13]).toEqual(expect.stringMatching(/^uploads\/tenant-1\/project-1\/[0-9a-f-]{36}\.xlsx$/));
  });

  it('replaces a draft BOQ revision and uses a selected cost centre', async () => {
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-existing', boqCode: 'BOQ-OLD', revisions: [{ id: 'revision-draft', status: 'DRAFT', revisionCode: 'R0', updatedAt: new Date('2026-01-01T00:00:00.000Z') }],
    });
    const result = await POST(makeRequest([{
      '#': '9', 'Item Description': '  Legacy item ', 'Specification / Scope': '  Scope ',
      Category: 'Electrical', Unit: 'NOS', Qty: '3', Brand: 'Maker', Location: 'Floor 2', Remark: 'Note', 'Drawing Ref': 'DR-2',
    }], {
      projectId: 'project-1', costCentreId: 'cc-2', boqId: 'boq-existing', title: '', description: '', purpose: 'PR', category: 'Electrical',
    }));
    expect(result).toMatchObject({ ok: true, data: { boqId: 'boq-existing', totalLines: 1, validLines: 1 } });
    const batch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch[0].sql).toContain('UPDATE "boq_revisions" SET "updatedAt"');
    expect(batch.some((statement) => statement.sql.includes('DELETE FROM "boq_lines"'))).toBe(true);
    expect(batch.some((statement) => statement.sql.includes('INSERT INTO "boq_revisions"'))).toBe(false);
    expect(db.boqLine.deleteMany).not.toHaveBeenCalled();
    expect(db.boq.update).not.toHaveBeenCalled();
    expect(createRevision).not.toHaveBeenCalled();
    expect(batch[4].values).toEqual(expect.arrayContaining(['9', 'Legacy item', 'Scope', 'cat-electrical', 'uom-nos', 3, 'Maker', 'Floor 2', 'Note', 'DR-2']));
  });

  it('starts a new revision for a non-draft BOQ and falls back to its first cost centre', async () => {
    db.costCentre.findMany.mockResolvedValueOnce(costCentres);
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-existing', boqCode: 'BOQ-OLD', title: 'Old title', revisions: [{ id: 'revision-approved', status: 'APPROVED', revisionCode: 'R0', updatedAt: new Date('2026-01-01T00:00:00.000Z') }],
    });
    await POST(makeRequest([validRow({ 'Cost Centre Code *': 'UNKNOWN' })], {
      projectId: 'project-1', boqId: 'boq-existing', purpose: '', title: ' Revised ', description: 'Description',
    }));
    const batch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch.some((statement) => statement.sql.includes('INSERT INTO "boq_revisions"'))).toBe(true);
    expect(batch[1].values[3]).toBe('cc-1');
    expect(db.boq.update).not.toHaveBeenCalled();
    expect(createRevision).not.toHaveBeenCalled();
  });

  it('uses the first sheet and safe BOQ and line defaults when optional workbook columns are absent', async () => {
    db.costCentre.findMany.mockResolvedValueOnce([]);
    const result = await POST(makeRequest([{ Description: '  Spare pump  ', Quantity: '4' }], { projectId: 'project-1' }, 'minimal.xlsx', 'Items'));
    expect(result).toMatchObject({ ok: true, data: { totalLines: 1, validLines: 1, warningLines: 0, errorLines: 0, qualityScore: 100 } });
    const batch = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(batch[0].values).toContain('West Campus BOQ');
    expect(batch[0].values).toContain(null);
    expect(batch[1].values).toContain('Items');
    expect(batch[3].values).toEqual(expect.arrayContaining(['1', 'Spare pump', null, null, null, 'NOS', 4]));
    expect(db.boq.create).not.toHaveBeenCalled();
    expect(db.boqLine.create).not.toHaveBeenCalled();
  });

  it('bounds project cost-centre lookups and logs when the code is outside the returned window', async () => {
    db.costCentre.findMany.mockResolvedValueOnce(Array.from({ length: COST_CENTRE_LOOKUP_MAX_OPTIONS + 1 }, (_, index) => ({
      id: `cc-${index}`, code: `CC-${String(index).padStart(3, '0')}`,
    })));
    const result = await POST(makeRequest([validRow({ 'Cost Centre Code *': 'OUTSIDE-WINDOW' })], { projectId: 'project-1' }));

    expect(result).toEqual({
      ok: false,
      error: UI_STRINGS.appApiCostCentresRoute.activeCostCentreLookupExceedsMaximumSize
        .replace('{{maxItems}}', String(COST_CENTRE_LOOKUP_MAX_OPTIONS)),
      status: 413,
    });
    expect(db.costCentre.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1', tenantId: 'tenant-1' },
      select: { id: true, code: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: COST_CENTRE_LOOKUP_MAX_OPTIONS + 1,
    });
    expect(structuredLog).toHaveBeenCalledWith('warn', 'boq.template_cost_centre_lookup_limited', expect.objectContaining({
      operation: 'resolve_template_cost_centre', route: '/api/boq/upload-template',
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
      resultCountAtLeast: COST_CENTRE_LOOKUP_MAX_OPTIONS + 1,
      maxItems: COST_CENTRE_LOOKUP_MAX_OPTIONS, status: 'truncated',
    }));
    expect(storeUpload).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('maps upload processing failures to a server error', async () => {
    db.project.findFirst.mockRejectedValueOnce(new Error('project lookup failed'));
    await expect(POST(makeRequest([validRow()], { projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqUploadTemplateRoute.templateUploadFailed, status: 500,
    });
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(POST(makeRequest([validRow()], { projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqUploadTemplateRoute.templateUploadFailed, status: 500,
    });
  });

  it('removes the stored workbook when the atomic D1 batch fails', async () => {
    writeBatch.mockRejectedValueOnce(new Error('D1 batch failed'));
    const result = await POST(makeRequest([validRow()], { projectId: 'project-1' }, 'vendor-template.xlsx'));
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(removeUpload).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/tenant-1\/project-1\/[0-9a-f-]{36}\.xlsx$/), ['tenant-1', 'project-1']);
  });
});
