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
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { MANUAL_BOQ_CREATE_AUDIT_ACTION, MANUAL_BOQ_CREATION_NOTES, MANUAL_BOQ_LINES_SAVED_AUDIT_ACTION } from '../src/app/api/boq/manual/route.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boqLine: { groupBy: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
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
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const writeBatch = writeD1BatchAtomically as jest.Mock;
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
  const editableRevision = (overrides: Record<string, unknown> = {}) => ({
    id: 'revision-1', boqId: 'boq-1', status: 'DRAFT', updatedAt: new Date('2026-11-03T10:00:00.000Z'),
    costCentreId: 'cc-1', totalLines: 2, validLines: 2, errorLines: 0, warningLines: 0,
    boq: { id: 'boq-1', tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-1', boqCode: 'BOQ-000001', title: 'Cable BOQ' },
    ...overrides,
  });

  const makeSuccessfulBatch = (boqCode = 'BOQ-000005') => writeBatch.mockImplementation(async (statements: Array<{ sql: string }>) =>
    statements.map((_, index) => ({ success: true, meta: { changes: 1 }, results: index === 0 ? [{ boqCode }] : [] })));

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    writeBatch.mockResolvedValue([]);
  });

  it('checks access, required project/BOQ, revision existence, and approval immutability', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(editManualBoq(request({}))).resolves.toBe(denied);
    await expect(editManualBoq(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqManualRoute.projectIDOrBOQIDIsRequired, status: 400 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(editManualBoq(request({ projectId: 'project-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound2, status: 404 });
    await expect(editManualBoq(request({ boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce(editableRevision({ status: 'APPROVED' }));
    await expect(editManualBoq(request({ boqId: 'boq-1', boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqManualRoute.approvedBOQRevisionsAreStrictlyImmutableBranchANewRevisionToEdit, status: 403 });
  });

  it('creates a manual draft and atomically saves validated lines, metrics, and audit history', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', name: 'Retail Store' });
    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-1' });
    db.category.findMany.mockResolvedValueOnce([{ id: 'cat-1', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-1', code: 'MTR' }]);
    makeSuccessfulBatch();

    await expect(editManualBoq(request({
      projectId: 'project-1', costCentreId: 'cc-1', purpose: 'PR', description: ' Scope ', lines: [
        { lineNumber: '10', itemCode: 'WIRE-1', originalDescription: ' Wire ', specification: ' Copper ', category: 'Electrical', uom: 'mtr', quantity: '2', aiUnitCost: '15', brand: 'Acme' },
        { description: '', specification: '', category: 'Other', uomRaw: 'nos', quantity: 0 },
      ],
    }))).resolves.toMatchObject({
      ok: true, status: 201, data: { boqId: expect.any(String), revisionId: expect.any(String), totalLines: 2, boq: { boqCode: 'BOQ-000005', purpose: 'PR' }, revision: { totalLines: 2, validLines: 1, errorLines: 1, qualityScore: 50 } },
    });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements).toHaveLength(6);
    expect(statements.every((statement: { sql: string; values: unknown[] }) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].sql).toContain('MAX(CAST(substr(existing."boqCode", length(\'BOQ-\' || project."projectCode" || \'-\') + 1) AS INTEGER))');
    expect(statements[1].sql).toContain('WHERE changes() = 1');
    expect(statements[1].values).toContain(MANUAL_BOQ_CREATION_NOTES);
    expect(statements[2].sql).toContain('replace(?, \'{{boqCode}}\', boq."boqCode")');
    expect(statements[2].values).toContain(MANUAL_BOQ_CREATE_AUDIT_ACTION);
    expect(statements[3].sql).toContain('audit_logs');
    expect(statements[3].values.slice(-4)).toEqual([expect.any(String), 'tenant-1', expect.any(String), 'tenant-1']);
    expect(statements[3].values[4]).toBe('Wire');
    expect(statements[3].values[11]).toBe(2);
    expect(statements[3].values[25]).toBe('VALID');
    expect(statements[4].values[4]).toBe('Untitled Item');
    expect(statements[4].values[11]).toBe(0);
    expect(statements[4].values[25]).toBe('ERROR');
    expect(statements[5].sql).toContain('"warningLines" = ?');
  });

  it('appends with a compare-and-set and recalculates counts from persisted line statuses', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(editableRevision({ status: 'UNDER_REVIEW' }));
    db.boqLine.groupBy.mockResolvedValueOnce([
      { validationStatus: 'VALID', _count: { _all: 2 } },
      { validationStatus: 'ERROR', _count: { _all: 1 } },
    ]);
    db.category.findMany.mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    makeSuccessfulBatch();
    await expect(editManualBoq(request({ boqId: 'boq-1', boqRevisionId: 'revision-1', action: 'APPEND', lines: [
      { description: 'Panel', quantity: 3 },
    ] }))).resolves.toMatchObject({
      ok: true, data: { totalLines: 4, revision: { validLines: 3, errorLines: 1, qualityScore: 75 } },
    });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements[0].sql).toContain('"updatedAt" IS ?');
    expect(statements[1].values[6]).toBe(MANUAL_BOQ_LINES_SAVED_AUDIT_ACTION);
    expect(statements[2].values[3]).toBe('4');
    expect(statements[2].values[11]).toBe(3);
  });

  it('replaces an empty line set safely and accepts a no-op line delete', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(editableRevision());
    writeBatch.mockResolvedValueOnce([
      { success: true, meta: { changes: 1 } }, { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 0 } }, { success: true, meta: { changes: 1 } },
    ]);
    await expect(editManualBoq(request({ boqId: 'boq-1', boqRevisionId: 'revision-1', lines: [] }))).resolves.toMatchObject({
      ok: true, data: { totalLines: 0, revision: { totalLines: 0, validLines: 0, qualityScore: 100 } },
    });
    expect(writeBatch.mock.calls[0][0][2].sql).toContain('DELETE FROM "boq_lines"');
    expect(writeBatch.mock.calls[0][0][2].values).toEqual(['revision-1', 'tenant-1', expect.any(String), 'tenant-1']);
  });

  it('returns a conflict for stale revisions and avoids writes for read-only requests', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(editableRevision());
    writeBatch.mockResolvedValueOnce([{ success: true, meta: { changes: 0 } }]);
    await expect(editManualBoq(request({ boqId: 'boq-1', boqRevisionId: 'revision-1', lines: [] }))).resolves.toMatchObject({ status: 409 });
    db.boqRevision.findFirst.mockResolvedValueOnce(editableRevision());
    await expect(editManualBoq(request({ boqId: 'boq-1', boqRevisionId: 'revision-1' }))).resolves.toMatchObject({
      ok: true, data: { boqId: 'boq-1', revisionId: 'revision-1', totalLines: 2 },
    });
    expect(writeBatch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed and oversized line input before persistence', async () => {
    await expect(editManualBoq(request({ projectId: 'project-1', lines: [null] }))).resolves.toMatchObject({ status: 400 });
    await expect(editManualBoq(request({ projectId: 'project-1', lines: Array.from({ length: 451 }, () => ({})) }))).resolves.toMatchObject({ status: 400 });
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('returns a generic failure when D1 rejects the batch', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', name: 'Retail Store' });
    writeBatch.mockRejectedValueOnce(new Error('D1 details remain in logs only'));
    await expect(editManualBoq(request({ projectId: 'project-1', lines: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.manualBoqOperationFailed, status: 500,
    });
  });

  it('keeps stable manual BOQ audit action names', () => {
    expect(MANUAL_BOQ_CREATE_AUDIT_ACTION).toBe('MANUAL_BOQ_CREATED');
    expect(MANUAL_BOQ_LINES_SAVED_AUDIT_ACTION).toBe('MANUAL_BOQ_LINES_SAVED');
  });
});
describe('BOQ spreadsheet import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    writeBatch.mockResolvedValue([]);
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
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', tenantId: 'tenant-1', status: 'DRAFT', updatedAt: new Date('2026-11-03T10:00:00.000Z'), originalFilePath: 'upload.xlsx', boq: { projectId: 'project-1', boqCode: 'BOQ-001' } });
    readUploadedFile.mockResolvedValueOnce(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-mtr', code: 'MTR' }]);
    standardiseUnit.mockImplementation((value: string) => ({ code: value.toUpperCase() }));
    validateLine.mockImplementation(({ originalDescription }: { originalDescription: string }) => originalDescription === 'Cable'
      ? { status: 'VALID', messages: [] }
      : { status: 'ERROR', messages: ['invalid quantity'] });
    qualityScore.mockReturnValueOnce(50);
    writeBatch.mockImplementationOnce(async (statements: Array<{ sql: string }>) => statements.map(() => ({ success: true, meta: { changes: 1 } })));

    await expect(importBoq(request({ revisionId: 'revision-1', sheetName: 'Items', columnMapping: mapping }))).resolves.toEqual({
      ok: true, data: { imported: 2, valid: 1, warnings: 0, errors: 1, qualityScore: 50 }, status: 200,
    });
    expect(readUploadedFile).toHaveBeenCalledWith('upload.xlsx');
    const statements = writeBatch.mock.calls[0][0];
    expect(statements).toHaveLength(6);
    expect(statements.every((statement: { sql: string; values: unknown[] }) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].sql).toContain('"updatedAt" IS ?');
    expect(statements[1].values[6]).toBe('IMPORT');
    expect(statements[2].sql).toContain('DELETE FROM "boq_lines"');
    expect(statements[3].values.slice(3, 19)).toEqual(['L-1', 'Cable', 'Cable', 'Copper', null, null, 'uom-mtr', 'mtr', 2, 'Room 1', 'D-1', 'Acme', 'M1', 'Copper', 'A', 'Check']);
    expect(statements[3].values[25]).toBe('VALID');
    expect(statements[4].values[3]).toBe('2');
    expect(statements[4].values[11]).toBeNull();
    expect(statements[4].values[25]).toBe('ERROR');
    expect(JSON.parse(statements[5].values[0] as string)).toEqual(mapping);
    expect(statements[5].values.slice(1, 6)).toEqual([2, 1, 1, 0, 50]);
  });

  it('uses the first worksheet and minimal mapping defaults when optional columns are omitted', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Description', 'UOM', 'Quantity'], ['Loose item', '', '']]), 'Default Data');
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', tenantId: 'tenant-1', status: 'DRAFT', updatedAt: new Date('2026-11-03T10:00:00.000Z'), originalFilePath: 'minimal.xlsx', boq: { projectId: 'project-1', boqCode: 'BOQ-001' } });
    readUploadedFile.mockResolvedValueOnce(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    standardiseUnit.mockReturnValueOnce({ code: 'NOS' });
    validateLine.mockReturnValueOnce({ status: 'WARNING', messages: ['unit not mapped'] });
    qualityScore.mockReturnValueOnce(80);
    writeBatch.mockImplementationOnce(async (statements: Array<{ sql: string }>) => statements.map(() => ({ success: true, meta: { changes: 1 } })));
    const minimalMapping = { description: 'Description', uom: 'UOM', quantity: 'Quantity' };

    await expect(importBoq(request({ revisionId: 'revision-1', columnMapping: minimalMapping }))).resolves.toEqual({
      ok: true, data: { imported: 1, valid: 0, warnings: 1, errors: 0, qualityScore: 80 }, status: 200,
    });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements).toHaveLength(5);
    expect(statements[3].values.slice(3, 12)).toEqual(['1', 'Loose item', 'Loose item', null, null, null, null, null, null]);
    expect(statements[3].values[20]).toBe('Default Data');
    expect(statements[3].values[21]).toBe(2);
    expect(statements[3].values[25]).toBe('WARNING');
    expect(statements[4].values.slice(1, 6)).toEqual([1, 0, 0, 1, 80]);
  });
});
