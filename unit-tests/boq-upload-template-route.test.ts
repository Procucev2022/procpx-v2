import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs';
import { POST } from '../src/app/api/boq/upload-template/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createNextBoqRevision } from '../src/lib/boq-revision-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const createRevision = createNextBoqRevision as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const project = { id: 'project-1', name: 'West Campus' };
const costCentres = [{ id: 'cc-1', code: 'CC-1', name: 'Electrical' }, { id: 'cc-2', code: 'CC-2', name: 'Mechanical' }];
const category = { id: 'cat-electrical', name: 'Electrical' };
const uom = { id: 'uom-nos', code: 'NOS' };
const boq = { id: 'boq-new', boqCode: 'BOQ-000001' };
const revision = { id: 'revision-new', revisionCode: 'BOQ-000001-R1' };
let existsSpy: jest.SpyInstance;
let mkdirSpy: jest.SpyInstance;
let writeSpy: jest.SpyInstance;

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
    existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
    writeSpy.mockRestore();
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
    expect(writeSpy).toHaveBeenCalled();
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
      boqId: 'boq-new', revisionId: 'revision-new', boqCode: 'BOQ-000001', revisionCode: 'BOQ-000001-R1',
      totalLines: 5, validLines: 1, warningLines: 2, errorLines: 2, qualityScore: 40,
      exceptions: [
        { line: '4', description: '(blank)', errors: expect.arrayContaining([expect.objectContaining({ code: 'DESC_MISSING' }), expect.objectContaining({ code: 'QTY_INVALID' })]) },
        { line: '5', description: 'Negative item', errors: [expect.objectContaining({ code: 'QTY_NEGATIVE' })] },
      ],
    } });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-2', boqCode: 'BOQ-000001',
      title: 'Electrical Scope', description: 'Imported package', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, purpose: UI_STRINGS.componentsSidebar.bUDGET, status: 'DRAFT', createdBy: 'user-1',
    }) });
    expect(createRevision).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', boqId: 'boq-new', costCentreId: 'cc-2', status: 'DRAFT', sourceType: 'FIXED_TEMPLATE',
      sourceFile: 'vendor-template.xlsx', sourceReference: 'BOQ Data', originalFileName: 'vendor-template.xlsx', createdById: 'user-1',
    }));
    expect(db.boqLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      lineNumber: UI_STRINGS.common.copyefwnq4, originalDescription: 'Cable', specification: 'Copper cable', categoryId: 'cat-electrical',
      uomId: 'uom-nos', uomRaw: UI_STRINGS.common.nOS, quantity: 1200, brand: 'Acme', location: 'Block A', remarks: 'Urgent',
      drawingReference: 'DWG-01', validationStatus: UI_STRINGS.appAppBoqStudioPage.vALID, benchmarkEligible: true,
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      lineNumber: UI_STRINGS.common.copyf9vgt1, quantity: null, categoryId: null, uomId: null, validationStatus: 'WARNING',
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(3, { data: expect.objectContaining({
      lineNumber: UI_STRINGS.common.copyezvv42, quantity: 0, validationStatus: 'WARNING',
      validationMessages: expect.stringContaining('QTY_ZERO'),
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-new' }, data: {
      totalLines: 5, validLines: 1, warningLines: 2, errorLines: 2, qualityScore: 40, preparationStatus: 'VALIDATION_REQUIRED',
    } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityType: UI_STRINGS.common.bOQ, entityId: 'boq-new', action: 'BOQ_UPLOADED', description: expect.stringContaining('5 lines'),
    }) });
    expect(existsSpy).toHaveBeenCalled();
    expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('uploads'), { recursive: true });
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('vendor-template.xlsx'), expect.any(Buffer));
  });

  it('replaces a draft BOQ revision and uses a selected cost centre', async () => {
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-existing', boqCode: 'BOQ-OLD', revisions: [{ id: 'revision-draft', status: 'DRAFT' }],
    });
    db.boq.update.mockResolvedValueOnce({ id: 'boq-existing', boqCode: 'BOQ-OLD' });
    const result = await POST(makeRequest([{
      '#': '9', 'Item Description': '  Legacy item ', 'Specification / Scope': '  Scope ',
      Category: 'Electrical', Unit: 'NOS', Qty: '3', Brand: 'Maker', Location: 'Floor 2', Remark: 'Note', 'Drawing Ref': 'DR-2',
    }], {
      projectId: 'project-1', costCentreId: 'cc-explicit', boqId: 'boq-existing', title: '', description: '', purpose: 'PR', category: 'Electrical',
    }));
    expect(result).toMatchObject({ ok: true, data: { boqId: 'boq-existing', totalLines: 1, validLines: 1 } });
    expect(db.boqLine.deleteMany).toHaveBeenCalledWith({ where: { boqRevisionId: 'revision-draft' } });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-existing' }, data: {
      description: null, purpose: 'PR', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical,
    } });
    expect(createRevision).not.toHaveBeenCalled();
    expect(db.boqLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      lineNumber: '9', originalDescription: 'Legacy item', specification: 'Scope', categoryId: 'cat-electrical',
      uomId: 'uom-nos', quantity: 3, brand: 'Maker', location: 'Floor 2', remarks: 'Note', drawingReference: 'DR-2',
    }) });
  });

  it('starts a new revision for a non-draft BOQ and falls back to its first cost centre', async () => {
    db.costCentre.findMany.mockResolvedValueOnce(costCentres);
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-existing', boqCode: 'BOQ-OLD', revisions: [{ id: 'revision-approved', status: 'APPROVED' }],
    });
    db.boq.update.mockResolvedValueOnce({ id: 'boq-existing', boqCode: 'BOQ-OLD' });
    await POST(makeRequest([validRow({ 'Cost Centre Code *': 'UNKNOWN' })], {
      projectId: 'project-1', boqId: 'boq-existing', purpose: '', title: ' Revised ', description: 'Description',
    }));
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-existing' }, data: {
      title: 'Revised', description: UI_STRINGS.common.description,
    } });
    expect(createRevision).toHaveBeenCalledWith(expect.objectContaining({ costCentreId: 'cc-1', sourceType: 'FIXED_TEMPLATE' }));
  });

  it('uses the first sheet and safe BOQ and line defaults when optional workbook columns are absent', async () => {
    db.costCentre.findMany.mockResolvedValueOnce([]);
    const result = await POST(makeRequest([{ Description: '  Spare pump  ', Quantity: '4' }], { projectId: 'project-1' }, 'minimal.xlsx', 'Items'));
    expect(result).toMatchObject({ ok: true, data: { totalLines: 1, validLines: 1, warningLines: 0, errorLines: 0, qualityScore: 100 } });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      costCentreId: null, boqCode: 'BOQ-000001', title: 'West Campus BOQ', description: null, category: null,
      purpose: UI_STRINGS.componentsSidebar.bUDGET,
    }) });
    expect(createRevision).toHaveBeenCalledWith(expect.objectContaining({ costCentreId: null, sourceReference: UI_STRINGS.common.items4 }));
    expect(db.boqLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      lineNumber: UI_STRINGS.common.copyefwnq4, originalDescription: 'Spare pump', standardDescription: 'Spare pump', specification: null,
      categoryId: null, uomId: null, uomRaw: UI_STRINGS.common.nOS, quantity: 4, itemCode: null,
      brand: null, location: null, remarks: null, drawingReference: null, validationStatus: UI_STRINGS.appAppBoqStudioPage.vALID,
    }) });
  });

  it('maps upload processing failures to a server error', async () => {
    db.project.findFirst.mockRejectedValueOnce(new Error('project lookup failed'));
    await expect(POST(makeRequest([validRow()], { projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: 'project lookup failed', status: 500,
    });
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(POST(makeRequest([validRow()], { projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: 'Template upload failed.', status: 500,
    });
  });
});
