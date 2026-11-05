import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/drawing-extract/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { processDrawingFile } from '../src/lib/drawing-parser';
import { deleteUpload, saveUpload } from '../src/lib/storage';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';
import { interpolateUiString } from '../src/lib/i18n';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boq: { count: jest.fn(), create: jest.fn() },
    boqRevision: { create: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    boqLine: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    projectDocument: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));

jest.mock('../src/lib/drawing-parser', () => ({ processDrawingFile: jest.fn() }));
jest.mock('../src/lib/storage', () => ({ saveUpload: jest.fn(), deleteUpload: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResult = apiError as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const parseDrawing = processDrawingFile as jest.Mock;
const storeUpload = saveUpload as jest.Mock;
const removeUpload = deleteUpload as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };

function jsonRequest(body: unknown) {
  return {
    headers: { get: (name: string) => name === 'content-type' ? 'application/json; charset=utf-8' : null },
    json: jest.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

function formRequest(values: Record<string, unknown> = {}) {
  return {
    headers: { get: (name: string) => name === 'content-type' ? 'multipart/form-data; boundary=test' : null },
    formData: jest.fn().mockResolvedValue({ get: (key: string) => values[key] ?? null }),
  } as unknown as NextRequest;
}

function upload(name: string, type = 'application/pdf') {
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49]);
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  };
}

describe('BOQ drawing extraction route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({ id: 'project-1', name: 'Clinic Extension', projectCode: 'CLINIC' });
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1' });
    db.boq.count.mockResolvedValue(4);
    db.boq.create.mockResolvedValue({ id: 'boq-1', boqCode: 'BOQ-000005' });
    db.boqRevision.create.mockResolvedValue({ id: 'revision-1', revisionCode: 'R0' });
    db.category.findMany.mockResolvedValue([{ id: 'cat-electrical', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValue([{ id: 'uom-ea', code: 'EA' }]);
    db.boqLine.create.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ data }));
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    db.projectDocument.create.mockResolvedValue({ id: 'document-1' });
    db.projectDocument.findFirst.mockResolvedValue({ id: 'document-1', filePath: 'uploads/plans.pdf', fileSize: 42, name: 'plans.pdf' });
    storeUpload.mockImplementation((segments: string[], fileName: string) =>
      Promise.resolve(`uploads/${segments.join('/')}/${fileName}`));
    removeUpload.mockResolvedValue(undefined);
    writeBatch.mockImplementation(async (statements: Array<{ sql: string; values: unknown[] }>) => statements.map((statement) => {
      if (statement.sql.includes('INSERT INTO "boqs"')) return { success: true, meta: { changes: 1 }, results: [{ id: statement.values[0], boqCode: 'BOQ-CLINIC-001' }] };
      if (statement.sql.includes('INSERT INTO "boq_revisions"')) return { success: true, meta: { changes: 1 }, results: [{ id: statement.values[0], revisionCode: 'R0' }] };
      return { success: true, meta: { changes: 1 } };
    }));
    parseDrawing.mockResolvedValue({
      parserUsed: 'native', providerMessage: 'schedule parsed', totalDetected: 1,
      explicitCount: 1, uncertainCount: 0, drawingReference: 'D-101',
      items: [{ description: 'Cable tray', quantity: 4 }], warnings: [],
    });
  });

  it('returns authentication and JSON validation responses before persistence', async () => {
    const denied = { ok: false, status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(jsonRequest({}))).resolves.toBe(denied);

    await expect(POST(jsonRequest({ lines: [{}] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqDrawingExtractRoute.projectIDIsRequiredToGenerateDraftBOQ, status: 400,
    });
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqDrawingExtractRoute.atLeastOneBOQLineItemIsRequired, status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(jsonRequest({ projectId: 'foreign-project', lines: [{}] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.projectNotFound2, status: 404,
    });
    expect(db.project.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-project', tenantId: 'tenant-1' } });
  });

  it('creates a draft BOQ with matched and uncertain reviewed lines', async () => {
    const lines = [
      { description: 'Cable tray', specification: 'Hot dip galvanized', category: 'ELECTRICAL', uom: 'ea', quantity: '4', confidence: 0.8, mark: 'CT-01', location: 'Roof' },
      { description: 'Unknown fitting', category: 'Unmatched', uom: 'nos', quantity: null, quantityType: 'UNCERTAIN', uncertainReason: 'Scale is unclear' },
      { description: 'Zero quantity', quantity: 0 },
    ];
    await expect(POST(jsonRequest({
      projectId: 'project-1', costCentreId: 'cc-1', drawingNumber: 'D-101', fileName: 'plans.pdf',
      savedDocumentId: 'drawing-document-1', fileSize: 42, title: '  Package title  ', description: '  Reviewed drawing  ',
      purpose: 'TENDER', lines,
    }))).resolves.toEqual({
      ok: true,
      data: { boqId: expect.any(String), revisionId: expect.any(String), boqCode: 'BOQ-CLINIC-001', revisionCode: 'R0', totalLines: 3, validLines: 1, drawingNumber: 'D-101' },
      status: 201,
    });
    expect(db.projectDocument.findFirst).toHaveBeenCalledWith({ where: { id: 'drawing-document-1', projectId: 'project-1', tenantId: 'tenant-1', category: 'DRAWING' }, select: { id: true, filePath: true, fileSize: true, name: true } });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(8);
    expect(statements.every((statement) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].sql).toContain('INSERT INTO "boqs"');
    expect(statements[1].values.slice(8, 15)).toEqual(['DRAWING_AI', 'plans.pdf', 'D-101', 0.9, 'plans.pdf', 'uploads/plans.pdf', 42]);
    expect(statements[2].values[6]).toBe('DRAWING_BOQ_GENERATED');
    expect(statements[3].values.slice(3, 14)).toEqual(['1', 'Cable tray', 'Cable tray', 'Hot dip galvanized', 'cat-electrical', null, 'uom-ea', 'ea', 4, 'Roof', 'D-101']);
    expect(statements[4].values[25]).toBe('WARNING');
    expect(statements[4].values[26]).toContain('Scale is unclear');
    expect(statements[6].values.slice(0, 5)).toEqual([3, 1, 0, 2, 33]);
    expect(statements[7].sql).toContain('json_extract');
    expect(db.boq.create).not.toHaveBeenCalled();
    expect(db.boqLine.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ totalLines: 3 }), 201);
  });

  it('uses defaults for optional JSON fields and persists zero quantities as warnings', async () => {
    await expect(POST(jsonRequest({
      projectId: 'project-1',
      lines: [{ description: 'Unverified item', quantity: 0, drawingReference: 'ITEM-1' }, { description: 'No quantity', uom: 'EA' }],
    }))).resolves.toMatchObject({ ok: true, data: { totalLines: 2, validLines: 0, drawingNumber: 'DWG-A-101' } });
    const statements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements[0].values).toContain('Architectural Drawing — Clinic Extension');
    expect(statements[0].values).toContain('Extracted from architectural drawing DWG-A-101');
    expect(statements[1].values.slice(8, 15)).toEqual(['DRAWING_AI', 'DWG-A-101.pdf', 'DWG-A-101', 0.9, 'DWG-A-101.pdf', null, 0]);
    expect(statements[3].values).toEqual(expect.arrayContaining(['ITEM-1', 'Sheet 01', 'Unverified item']));
    expect(statements[4].values[11]).toBeNull();
    expect(statements[4].values[10]).toBe('EA');
  });

  it('validates multipart uploads and tenant-scoped projects', async () => {
    await expect(POST(formRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired, status: 400 });
    await expect(POST(formRequest({ file: upload('plan.pdf') }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired, status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(formRequest({ file: upload('plan.pdf'), projectId: 'foreign' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.projectNotFound2, status: 404,
    });
    await expect(POST(formRequest({ file: upload('plan.svg'), projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.unsupportedDrawingFormatExtSupportedFormatsArePDFPNGJPGAndJPEG, { ext: 'svg' }), status: 400,
    });
    await expect(POST(formRequest({ file: upload('plan.'), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining(interpolateUiString(UI_STRINGS.appApiBoqDrawingExtractRoute.unsupportedDrawingFormatExtSupportedFormatsArePDFPNGJPGAndJPEG, { ext: '' })), status: 400,
    });
  });

  it('rejects drawing references that are not registered to the selected tenant and project', async () => {
    db.projectDocument.findFirst.mockResolvedValueOnce(null);
    await expect(POST(jsonRequest({
      projectId: 'project-1', savedDocumentId: 'foreign-document', lines: [{ description: 'Cable', quantity: 1 }],
    }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqDrawingExtractRoute.uploadedDrawingNotFound, status: 404 });
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('stores and parses a supported drawing and returns parser details', async () => {
    const file = upload('floor-plan.pdf', '');
    const result = await POST(formRequest({ file, projectId: 'project-1', drawingNumber: 'A-22' }));
    expect(result).toEqual({ ok: true, data: expect.objectContaining({
      success: true, fileName: 'floor-plan.pdf', fileSize: file.size, documentId: 'document-1',
      drawingNumber: 'D-101', parserUsed: 'native', totalDetected: 1, items: [{ description: 'Cable tray', quantity: 4 }],
    }), status: 200 });
    expect(storeUpload).toHaveBeenCalledWith(['tenant-1', 'project-1', 'drawings'], expect.stringMatching(/^[0-9a-f-]{36}\.pdf$/), expect.any(Buffer));
    expect(db.projectDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      fileType: 'application/pdf', category: 'DRAWING', uploadedBy: 'user-1',
      filePath: expect.stringMatching(/drawings[\\/][0-9a-f-]{36}\.pdf$/),
    }) });
    expect(parseDrawing).toHaveBeenCalledWith(expect.any(Buffer), 'floor-plan.pdf', 'A-22');
  });

  it('returns server errors when parsing or persistence throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    parseDrawing.mockRejectedValueOnce(new Error('OCR unavailable'));
    await expect(POST(formRequest({ file: upload('plan.png', 'image/png'), projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqDrawingExtractRoute.drawingProcessingFailed, status: 500,
    });
    writeBatch.mockRejectedValueOnce(new Error('D1 batch unavailable'));
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [{ description: 'Pipe', quantity: 1 }] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqDrawingExtractRoute.drawingProcessingFailed, status: 500,
    });
    expect(errorResult).toHaveBeenCalledWith(UI_STRINGS.appApiBoqDrawingExtractRoute.drawingProcessingFailed, 500);
  });
});
