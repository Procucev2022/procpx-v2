import { existingCodes } from './test-helpers/existing-codes';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/drawing-extract/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { processDrawingFile } from '../src/lib/drawing-parser';
import { saveUpload } from '../src/lib/storage';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    boq: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    boqRevision: { create: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    boqLine: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    projectDocument: { create: jest.fn() },
  },
}));

jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));

jest.mock('../src/lib/drawing-parser', () => ({ processDrawingFile: jest.fn() }));
jest.mock('../src/lib/storage', () => ({ saveUpload: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResult = apiError as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const parseDrawing = processDrawingFile as jest.Mock;
const storeUpload = saveUpload as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };

function jsonRequest(body: unknown) {
  return {
    headers: { get: () => 'application/json; charset=utf-8' },
    json: jest.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

function formRequest(values: Record<string, unknown> = {}) {
  return {
    headers: { get: () => 'multipart/form-data; boundary=test' },
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
    db.project.findFirst.mockResolvedValue({ id: 'project-1', name: 'Clinic Extension' });
    db.boq.findMany.mockResolvedValue(existingCodes('boqCode', 'BOQ-', 6, 4));
    db.boq.create.mockResolvedValue({ id: 'boq-1', boqCode: 'BOQ-000005' });
    db.boqRevision.create.mockResolvedValue({ id: 'revision-1', revisionCode: 'R0' });
    db.category.findMany.mockResolvedValue([{ id: 'cat-electrical', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValue([{ id: 'uom-ea', code: 'EA' }]);
    db.boqLine.create.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ data }));
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    db.projectDocument.create.mockResolvedValue({ id: 'document-1' });
    storeUpload.mockImplementation((segments: string[], fileName: string) =>
      Promise.resolve(`uploads/${segments.join('/')}/${fileName}`));
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
      ok: false, error: 'Project ID is required to generate Draft BOQ.', status: 400,
    });
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [] }))).resolves.toEqual({
      ok: false, error: 'At least one BOQ line item is required.', status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(jsonRequest({ projectId: 'foreign-project', lines: [{}] }))).resolves.toEqual({
      ok: false, error: 'Project not found.', status: 404,
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
      savedFilePath: 'uploads/plans.pdf', fileSize: 42, title: '  Package title  ', description: '  Reviewed drawing  ',
      purpose: 'TENDER', lines,
    }))).resolves.toEqual({
      ok: true,
      data: { boqId: 'boq-1', revisionId: 'revision-1', boqCode: 'BOQ-000005', revisionCode: 'R0', totalLines: 3, validLines: 1, drawingNumber: 'D-101' },
      status: 201,
    });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      boqCode: 'BOQ-000005', title: 'Package title', description: 'Reviewed drawing', purpose: 'TENDER',
    }) });
    expect(db.boqRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      originalFileSize: 42, sourceFile: 'plans.pdf', sourceReference: 'D-101', totalLines: 3, validLines: 1, qualityScore: 33,
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      lineNumber: '1', categoryId: 'cat-electrical', uomId: 'uom-ea', quantity: 4, validationStatus: 'VALID',
      sourceReference: 'CT-01 - Cable tray', location: 'Roof',
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      categoryId: null, uomId: null, quantity: null, validationStatus: 'WARNING',
      validationMessages: JSON.stringify([{ level: 'WARNING', code: 'UNVERIFIED_QUANTITY', message: 'Scale is unclear' }]),
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(3, { data: expect.objectContaining({ quantity: 0, validationStatus: 'WARNING' }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DRAWING_BOQ_GENERATED' }) });
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ boqId: 'boq-1', totalLines: 3 }), 201);
  });

  it('uses defaults for optional JSON fields and persists zero quantities as warnings', async () => {
    await expect(POST(jsonRequest({
      projectId: 'project-1',
      lines: [{ description: 'Unverified item', quantity: 0, drawingReference: 'ITEM-1' }, { description: 'No quantity', uom: 'EA' }],
    }))).resolves.toMatchObject({ ok: true, data: { totalLines: 2, validLines: 0, drawingNumber: undefined } });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      costCentreId: null, title: 'Architectural Drawing — Clinic Extension',
      description: 'Extracted from architectural drawing DWG', purpose: 'BUDGET',
    }) });
    expect(db.boqRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      sourceFile: 'drawing.pdf', sourceReference: 'DWG-A-101', originalFilePath: null, originalFileSize: 0,
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      drawingReference: 'ITEM-1', sourceSheet: 'Sheet 01', sourceReference: 'Unverified item',
      validationMessages: JSON.stringify([{ level: 'WARNING', code: 'UNVERIFIED_QUANTITY', message: 'Quantity unverified in drawing schedule. Field verification required.' }]),
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ quantity: null, uomRaw: 'EA' }) });
  });

  it('validates multipart uploads and tenant-scoped projects', async () => {
    await expect(POST(formRequest())).resolves.toEqual({ ok: false, error: 'Drawing file and Project ID are required.', status: 400 });
    await expect(POST(formRequest({ file: upload('plan.pdf') }))).resolves.toEqual({
      ok: false, error: 'Drawing file and Project ID are required.', status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(formRequest({ file: upload('plan.pdf'), projectId: 'foreign' }))).resolves.toEqual({
      ok: false, error: 'Project not found.', status: 404,
    });
    await expect(POST(formRequest({ file: upload('plan.svg'), projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: 'Unsupported drawing format (.svg). Supported formats are PDF, PNG, JPG, and JPEG.', status: 400,
    });
    await expect(POST(formRequest({ file: upload('plan.'), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('Unsupported drawing format (.).'), status: 400,
    });
  });

  it('stores and parses a supported drawing and returns parser details', async () => {
    const file = upload('floor-plan.pdf', '');
    const now = jest.spyOn(Date, 'now').mockReturnValue(1234);
    const result = await POST(formRequest({ file, projectId: 'project-1', drawingNumber: 'A-22' }));
    expect(result).toEqual({ ok: true, data: expect.objectContaining({
      success: true, fileName: 'floor-plan.pdf', fileSize: file.size, savedFilePath: expect.stringContaining('1234_floor-plan.pdf'),
      drawingNumber: 'D-101', parserUsed: 'native', totalDetected: 1, items: [{ description: 'Cable tray', quantity: 4 }],
    }), status: 200 });
    expect(storeUpload).toHaveBeenCalledWith(['tenant-1', 'project-1', 'drawings'], '1234_floor-plan.pdf', expect.any(Buffer));
    expect(db.projectDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      fileType: 'application/pdf', category: 'DRAWING', uploadedBy: 'user-1',
      filePath: 'uploads/tenant-1/project-1/drawings/1234_floor-plan.pdf',
    }) });
    expect(parseDrawing).toHaveBeenCalledWith(expect.any(Buffer), 'floor-plan.pdf', 'A-22');
    expect(now).toHaveBeenCalled();
    now.mockRestore();
  });

  it('returns server errors when parsing or persistence throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    parseDrawing.mockRejectedValueOnce(new Error('OCR unavailable'));
    await expect(POST(formRequest({ file: upload('plan.png', 'image/png'), projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: 'OCR unavailable', status: 500,
    });
    db.boq.findMany.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [{ description: 'Pipe', quantity: 1 }] }))).resolves.toEqual({
      ok: false, error: 'storage unavailable', status: 500,
    });
    expect(errorResult).toHaveBeenCalledWith('OCR unavailable', 500, expect.objectContaining({ route: expect.any(String) }));
  });
});
