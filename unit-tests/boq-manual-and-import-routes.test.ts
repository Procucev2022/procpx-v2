import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { readFile } from 'fs/promises';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { standardiseUom } from '../src/lib/uom-standardise';
import { validateBoqLine, computeQualityScore } from '../src/lib/boq-validate';
import { POST as editManualBoq } from '../src/app/api/boq/manual/route';
import { POST as importBoq } from '../src/app/api/boq/import/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boq: { count: jest.fn(), create: jest.fn() },
    project: { findFirst: jest.fn() },
    boqRevision: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    boqLine: { deleteMany: jest.fn(), create: jest.fn(), createMany: jest.fn() },
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
jest.mock('../src/lib/uom-standardise', () => ({ standardiseUom: jest.fn() }));
jest.mock('../src/lib/boq-validate', () => ({ validateBoqLine: jest.fn(), computeQualityScore: jest.fn() }));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const standardiseUnit = standardiseUom as jest.Mock;
const validateLine = validateBoqLine as jest.Mock;
const qualityScore = computeQualityScore as jest.Mock;
const readUploadedFile = readFile as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'CLIENT_ADMIN' };
const request = (body: unknown) => new NextRequest('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ revisionId: 'revision-1' }) };

describe('manual BOQ workspace API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('checks access, required project/BOQ, revision existence, and approval immutability', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(editManualBoq(request({}))).resolves.toBe(denied);
    await expect(editManualBoq(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqManualRoute.projectIDOrBOQIDIsRequired, status: 400 });
    db.boq.count.mockResolvedValueOnce(0);
    db.project.findFirst.mockResolvedValueOnce(null);
    db.boq.create.mockResolvedValueOnce({ id: 'boq-1', boqCode: 'BOQ-000001' });
    db.boqRevision.create.mockResolvedValueOnce({ id: 'revision-1' });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(editManualBoq(request({ projectId: 'project-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(editManualBoq(request({ boqId: 'boq-1', boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqManualRoute.approvedBOQRevisionsAreStrictlyImmutableBranchANewRevisionToEdit, status: 403 });
  });

  it('creates a manual draft and replaces lines with validation, category/UOM matches, and quality metrics', async () => {
    db.boq.count.mockResolvedValueOnce(4);
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', name: 'Retail Store' });
    db.boq.create.mockResolvedValueOnce({ id: 'boq-1', boqCode: 'BOQ-000005' });
    db.boqRevision.create.mockResolvedValueOnce({ id: 'revision-1' });
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', status: 'DRAFT' });
    db.category.findMany.mockResolvedValueOnce([{ id: 'cat-1', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-1', code: 'MTR' }]);
    validateLine.mockReturnValueOnce({ status: 'VALID', messages: [] });
    db.boqLine.create.mockResolvedValue({ id: 'line' });
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-1' });
    const updatedRevision = { id: 'revision-1', lines: [{ id: 'line-1' }, { id: 'line-2' }] };
    db.boqRevision.findUnique.mockResolvedValueOnce(updatedRevision);

    await expect(editManualBoq(request({
      projectId: 'project-1', costCentreId: 'cc-1', purpose: 'PR', description: ' Scope ', lines: [
        { lineNumber: '10', itemCode: 'WIRE-1', originalDescription: ' Wire ', specification: ' Copper ', category: 'Electrical', uom: 'mtr', quantity: '2', aiUnitCost: '15', brand: 'Acme' },
        { description: '', specification: '', category: 'Other', uomRaw: 'nos', quantity: 0 },
      ],
    }))).resolves.toMatchObject({
      ok: true, data: { boqId: 'boq-1', revisionId: 'revision-1', totalLines: 2, revision: updatedRevision },
    });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      projectId: 'project-1', costCentreId: 'cc-1', boqCode: 'BOQ-000005', title: expect.stringContaining('Retail Store'), description: 'Scope', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, purpose: 'PR', status: 'DRAFT',
    }) });
    expect(db.boqLine.deleteMany).toHaveBeenCalledWith({ where: { boqRevisionId: 'revision-1' } });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      lineNumber: '10', originalDescription: 'Wire', specification: 'Copper', categoryId: 'cat-1', uomId: 'uom-1', uomRaw: 'MTR', quantity: 2,
      validationStatus: UI_STRINGS.appAppBoqStudioPage.vALID, aiUnitCost: 15, aiTotalCost: 30,
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      lineNumber: UI_STRINGS.common.copyf9vgt1, originalDescription: 'Untitled Item', quantity: 0, categoryId: null, uomId: null, validationStatus: 'ERROR', aiUnitCost: null, aiTotalCost: null,
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { totalLines: 2, validLines: 1, errorLines: 1, qualityScore: 50 } });
  });

  it('appends to an existing draft without clearing lines and reads a revision without line input', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-2', status: 'UNDER_REVIEW' });
    db.boqRevision.findUnique.mockResolvedValueOnce({ id: 'revision-2', lines: [{ id: 'kept' }] });
    await expect(editManualBoq(request({ boqId: 'boq-2', boqRevisionId: 'revision-2', action: 'APPEND' }))).resolves.toMatchObject({ ok: true, data: { totalLines: 1 } });
    expect(db.boqLine.deleteMany).not.toHaveBeenCalled();
    expect(db.category.findMany).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-2', status: 'DRAFT' });
    db.category.findMany.mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-2' });
    db.boqRevision.findUnique.mockResolvedValueOnce(null);
    await expect(editManualBoq(request({ boqId: 'boq-2', boqRevisionId: 'revision-2', lines: [] }))).resolves.toMatchObject({
      ok: true, data: { totalLines: 0, revision: null },
    });
    expect(db.boqLine.deleteMany).toHaveBeenCalledWith({ where: { boqRevisionId: 'revision-2' } });
    expect(db.boqRevision.update).toHaveBeenLastCalledWith({ where: { id: 'revision-2' }, data: { totalLines: 0, validLines: 0, errorLines: 0, qualityScore: 100 } });
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('manual BOQ failed'));
    await expect(editManualBoq(request({ boqId: 'boq-2', boqRevisionId: 'revision-2' }))).resolves.toEqual({ ok: false, error: 'manual BOQ failed', status: 500 });
    db.boqRevision.findFirst.mockRejectedValueOnce({});
    await expect(editManualBoq(request({ boqId: 'boq-2', boqRevisionId: 'revision-2' }))).resolves.toEqual({ ok: false, error: 'Manual BOQ operation failed.', status: 500 });
  });
});

describe('BOQ spreadsheet import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  const mapping = { lineNumber: 'Line', description: 'Description', specification: 'Specification', uom: 'UOM', quantity: 'Quantity', location: 'Location', drawingReference: 'Drawing', brand: 'Brand', model: 'Model', material: 'Material', grade: 'Grade', remarks: 'Remarks' };

  it('requires upload permission, revision ID, and complete column mappings', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(importBoq(request({}))).resolves.toBe(denied);
    await expect(importBoq(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqImportRoute.revisionIDIsRequired, status: 400 });
    await expect(importBoq(request({ revisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.columnMappingIsIncompletePleaseMapDescriptionUOMAndQuantity, status: 400 });
    await expect(importBoq(request({ revisionId: 'revision-1', columnMapping: { description: 'Description' } }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.columnMappingIsIncompletePleaseMapUOM, status: 400 });
    await expect(importBoq(request({ revisionId: 'revision-1', columnMapping: { description: 'Description', uom: 'UOM' } }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.columnMappingIsIncompletePleaseMapQuantity, status: 400 });
  });

  it('checks revision state and sheet availability before replacing imported lines', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(importBoq(request({ revisionId: 'missing', columnMapping: mapping }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(importBoq(request({ revisionId: 'approved', columnMapping: mapping }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqImportRoute.onlyDRAFTRevisionsCanBeImported, status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'DRAFT', originalFilePath: null });
    await expect(importBoq(request({ revisionId: 'revision-1', columnMapping: mapping }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqImportRoute.noUploadedFileFoundForThisRevision, status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'DRAFT', originalFilePath: 'upload.xlsx' });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Description', 'UOM', 'Quantity']]), 'Data');
    readUploadedFile.mockResolvedValueOnce(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    await expect(importBoq(request({ revisionId: 'revision-1', sheetName: 'Missing', columnMapping: mapping }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqImportRoute.sheetNotFoundInUploadedFile, status: 400 });
  });

  it('imports mapped rows, skips blank descriptions, links known UOMs, and recomputes quality', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Line', 'Description', 'Specification', 'UOM', 'Quantity', 'Location', 'Drawing', 'Brand', 'Model', 'Material', 'Grade', 'Remarks'],
      ['L-1', 'Cable', 'Copper', 'mtr', '2', 'Room 1', 'D-1', 'Acme', 'M1', 'Copper', 'A', 'Check'],
      ['L-EMPTY', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Panel', 'Steel', 'nos', 'bad', '', '', '', '', '', '', ''],
    ]), 'Items');
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', status: 'DRAFT', originalFilePath: 'upload.xlsx' });
    readUploadedFile.mockResolvedValueOnce(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-mtr', code: 'MTR' }]);
    standardiseUnit.mockImplementation((value: string) => ({ code: value.toUpperCase() }));
    validateLine.mockImplementation(({ originalDescription }: { originalDescription: string }) => originalDescription === 'Cable'
      ? { status: 'VALID', messages: [] }
      : { status: 'ERROR', messages: ['invalid quantity'] });
    qualityScore.mockReturnValueOnce(50);
    db.boqLine.createMany.mockResolvedValueOnce({ count: 2 });
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-1' });

    await expect(importBoq(request({ revisionId: 'revision-1', sheetName: 'Items', columnMapping: mapping }))).resolves.toEqual({
      ok: true, data: { imported: 2, valid: 1, warnings: 0, errors: 1, qualityScore: 50 }, status: 200,
    });
    expect(readUploadedFile).toHaveBeenCalledWith('upload.xlsx');
    expect(db.boqLine.deleteMany).toHaveBeenCalledWith({ where: { boqRevisionId: 'revision-1' } });
    expect(db.boqLine.createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({
        lineNumber: 'L-1', originalDescription: 'Cable', specification: 'Copper', uomRaw: 'mtr', uomId: 'uom-mtr', quantity: 2,
        location: 'Room 1', drawingReference: 'D-1', brand: 'Acme', model: 'M1', material: 'Copper', grade: 'A', remarks: 'Check', sourceSheet: UI_STRINGS.common.items4, sourceRow: 2, confidenceScore: 1, validationStatus: UI_STRINGS.appAppBoqStudioPage.vALID,
      }),
      expect.objectContaining({ lineNumber: UI_STRINGS.common.copyf9vgt1, originalDescription: 'Panel', uomId: undefined, quantity: Number.NaN, sourceRow: 4, confidenceScore: 0.5, validationStatus: 'ERROR' }),
    ] });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: expect.objectContaining({ columnMapping: JSON.stringify(mapping), totalLines: 2, validLines: 1, errorLines: 1, warningLines: 0, qualityScore: 50 }) });
  });

  it('uses the first worksheet and minimal mapping defaults when optional columns are omitted', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Description', 'UOM', 'Quantity'], ['Loose item', '', '']]), 'Default Data');
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'DRAFT', originalFilePath: 'minimal.xlsx' });
    readUploadedFile.mockResolvedValueOnce(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    standardiseUnit.mockReturnValueOnce({ code: 'NOS' });
    validateLine.mockReturnValueOnce({ status: 'WARNING', messages: ['unit not mapped'] });
    qualityScore.mockReturnValueOnce(80);
    db.boqLine.createMany.mockResolvedValueOnce({ count: 1 });
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-1' });
    const minimalMapping = { description: 'Description', uom: 'UOM', quantity: 'Quantity' };

    await expect(importBoq(request({ revisionId: 'revision-1', columnMapping: minimalMapping }))).resolves.toEqual({
      ok: true, data: { imported: 1, valid: 0, warnings: 1, errors: 0, qualityScore: 80 }, status: 200,
    });
    expect(db.boqLine.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      lineNumber: UI_STRINGS.common.copyefwnq4, originalDescription: 'Loose item', specification: undefined, uomRaw: '', uomId: undefined, quantity: null,
      location: undefined, drawingReference: undefined, brand: undefined, model: undefined, material: undefined, grade: undefined,
      remarks: undefined, sourceSheet: 'Default Data', sourceRow: 2, confidenceScore: 0.5, validationStatus: 'WARNING',
    })] });
    expect(db.boqRevision.update).toHaveBeenLastCalledWith({ where: { id: 'revision-1' }, data: expect.objectContaining({ totalLines: 1, validLines: 0, warningLines: 1, errorLines: 0 }) });
  });
});
