import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/drawing-extract/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { processDrawingFile } from '../src/lib/drawing-parser';
import { deleteUpload, saveUpload } from '../src/lib/storage';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';
import { interpolateUiString } from '../src/lib/i18n';
import { MAX_DRAWING_BOQ_LINES } from '../src/app/api/boq/drawing-extract/route.constants';
import { MAX_BOQ_UPLOAD_BYTES } from '../src/lib/boq-upload.constants';
import { logEvent, writeStructuredLog } from '../src/lib/observability/server-logger';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '../src/lib/d1-batch.constants';
import { PROJECT_DOCUMENT_INSERT_SQL } from '../src/app/api/projects/[id]/documents/route.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boq: { count: jest.fn(), create: jest.fn() },
    boqRevision: { create: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    boqLine: { create: jest.fn() },
    auditLog: { create: jest.fn(), findFirst: jest.fn() },
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
jest.mock('../src/lib/d1-batch', () => ({ ...jest.requireActual('../src/lib/d1-batch'), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({
  logEvent: jest.fn(),
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResult = apiError as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const parseDrawing = processDrawingFile as jest.Mock;
const storeUpload = saveUpload as jest.Mock;
const removeUpload = deleteUpload as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const backgroundLog = logEvent as jest.Mock;
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

function upload(name: string, type = 'application/pdf', size?: number) {
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49]);
  return {
    name,
    type,
    size: size ?? bytes.byteLength,
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
    db.projectDocument.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(
      where.id === 'drawing-document-1' ? { id: where.id, filePath: 'uploads/plans.pdf', fileSize: 42, name: 'plans.pdf' } : null,
    ));
    db.auditLog.findFirst.mockResolvedValue(null);
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

  it('rejects oversized and malformed JSON draft requests before persistence', async () => {
    const oversized = {
      headers: { get: (name: string) => name === 'content-type' ? 'multipart/form-data' : name === 'content-length' ? String(MAX_BOQ_UPLOAD_BYTES + 65_537) : null },
      formData: jest.fn(),
    } as unknown as NextRequest;
    await expect(POST(oversized)).resolves.toMatchObject({ ok: false, status: 413 });
    expect(oversized.formData).not.toHaveBeenCalled();
    await expect(POST(jsonRequest(null))).resolves.toMatchObject({ ok: false, status: 400, error: UI_STRINGS.common.invalidRequestBody });
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [null] }))).resolves.toMatchObject({ ok: false, status: 400, error: UI_STRINGS.common.invalidRequestBody });
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: Array.from({ length: MAX_DRAWING_BOQ_LINES + 1 }, () => ({ description: 'Line' })) }))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.common.boqLineBatchLimitExceeded,
    });
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [{ description: '   ' }] }))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.common.descriptionIsRequired,
    });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(jsonRequest({ projectId: 'project-1', costCentreId: 'foreign-cc', lines: [{ description: 'Cable' }] }))).resolves.toMatchObject({
      ok: false, status: 404, error: UI_STRINGS.common.costCentreNotFoundForThisProject,
    });
    expect(writeBatch).not.toHaveBeenCalled();
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

  it('persists negative quantities as errors and reports a failed atomic draft invariant', async () => {
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [{ description: 'Invalid count', quantity: -2, confidence: 'unknown' }] }))).resolves.toMatchObject({
      ok: true, data: { totalLines: 1, validLines: 0 },
    });
    const statements = writeBatch.mock.calls[0][0] as Array<{ values: unknown[] }>;
    expect(statements[3].values[25]).toBe('ERROR');
    expect(statements[3].values[11]).toBe(-2);

    writeBatch.mockImplementationOnce(async (input: Array<{ sql: string }>) => input.map((statement) => ({
      success: statement.sql.includes('INSERT INTO "boqs"'),
      meta: { changes: 1 },
      ...(statement.sql.includes('INSERT INTO "boqs"') ? { results: [{ boqCode: '' }] } : {}),
    })));
    await expect(POST(jsonRequest({ projectId: 'project-1', lines: [{ description: 'No generated code', quantity: 1 }] }))).resolves.toMatchObject({
      ok: false, status: 409, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.drawing_draft_batch_invariant_failed', expect.objectContaining({ hasBoqCode: false }));
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
    await expect(POST(formRequest({ file: { name: 'plan.pdf' }, projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired,
    });
    await expect(POST(formRequest({ file: { name: 'plan.pdf', size: 1 }, projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired,
    });
    await expect(POST(formRequest({ file: upload('empty.pdf', 'application/pdf', 0), projectId: 'project-1' }))).resolves.toMatchObject({ ok: false, status: 413 });
    await expect(POST(formRequest({ file: upload('large.pdf', 'application/pdf', MAX_BOQ_UPLOAD_BYTES + 1), projectId: 'project-1' }))).resolves.toMatchObject({ ok: false, status: 413 });
    await expect(POST(formRequest({ file: upload('x'.repeat(205) + '.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.appApiBoqDrawingExtractRoute.drawingFileAndProjectIDAreRequired,
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
    const documentStatements = writeBatch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    const documentId = String(documentStatements[0].values[0]);
    expect(result).toEqual({ ok: true, data: expect.objectContaining({
      success: true, fileName: 'floor-plan.pdf', fileSize: file.size, documentId,
      drawingNumber: 'D-101', parserUsed: 'native', totalDetected: 1, items: [{ description: 'Cable tray', quantity: 4 }],
    }), status: 200 });
    expect(storeUpload).toHaveBeenCalledWith(['tenant-1', 'project-1', 'drawings'], expect.stringMatching(/^[0-9a-f-]{36}\.pdf$/), expect.any(Buffer));
    expect(documentStatements.map(({ sql }) => sql)).toEqual([PROJECT_DOCUMENT_INSERT_SQL, AUDIT_LOG_INSERT_AFTER_CHANGE_SQL]);
    expect(documentStatements[0].values).toEqual(expect.arrayContaining([
      documentId, 'project-1', 'tenant-1', 'floor-plan.pdf', 'application/pdf', file.size, 'user-1', 'DRAWING',
    ]));
    expect(documentStatements[0].values[6]).toEqual(expect.stringMatching(/drawings[\\/][0-9a-f-]{36}\.pdf$/));
    expect(documentStatements[1].values[5]).toBe('project-1');
    expect(JSON.parse(String(documentStatements[1].values[9]))).toEqual(expect.objectContaining({
      documentId, name: 'floor-plan.pdf', category: 'DRAWING', fileSize: file.size,
    }));
    expect(db.projectDocument.create).not.toHaveBeenCalled();
    expect(parseDrawing).toHaveBeenCalledWith(expect.any(Buffer), 'floor-plan.pdf', 'A-22');
  });

  it('stores JPEG drawings with a safe basename and removes uploads when document persistence fails', async () => {
    const result = await POST(formRequest({ file: upload('folder\\floor-plan.jpg', 'image/jpeg'), projectId: 'project-1' }));
    expect(result).toMatchObject({ ok: true, status: 200, data: { success: true, fileName: 'floor-plan.jpg' } });
    expect(writeBatch.mock.calls[0][0][0].values).toEqual(expect.arrayContaining(['floor-plan.jpg', 'image/jpeg']));

    writeBatch.mockRejectedValueOnce(new Error('document row failed'));
    await expect(POST(formRequest({ file: upload('orphan.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({ ok: false, status: 500 });
    expect(removeUpload).toHaveBeenCalledWith(expect.stringContaining('uploads/tenant-1/project-1/drawings/'), ['tenant-1', 'project-1', 'drawings']);

    writeBatch.mockRejectedValueOnce({ code: 'D1_UNAVAILABLE' });
    removeUpload.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(POST(formRequest({ file: upload('orphan-again.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({ ok: false, status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.drawing_upload_cleanup_failed', expect.objectContaining({
      error: { name: 'Error', message: 'cleanup failed' },
    }));
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.drawing_processing_failed', expect.objectContaining({
      error: { type: 'object' }, documentPersisted: false,
    }));
  });

  it('compensates a document insert when its audit statement reports no change', async () => {
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);

    await expect(POST(formRequest({ file: upload('audit-mismatch.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, status: 409, error: UI_STRINGS.appApiProjectsIdDocumentsRoute.projectDocumentChangedPleaseRetry,
    });
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(writeBatch.mock.calls[1][0].map(({ sql }: { sql: string }) => sql)).toEqual([
      expect.stringContaining('DELETE FROM "audit_logs"'),
      expect.stringContaining('DELETE FROM "project_documents"'),
    ]);
    expect(removeUpload).toHaveBeenCalledWith(expect.stringContaining('uploads/tenant-1/project-1/drawings/'), ['tenant-1', 'project-1', 'drawings']);
  });

  it('preserves the drawing blob and reports a failed D1 compensation', async () => {
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);
    writeBatch.mockRejectedValueOnce(new Error('compensation unavailable'));

    await expect(POST(formRequest({ file: upload('preserve-on-failure.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, status: 500, error: UI_STRINGS.appApiProjectsIdDocumentsRoute.documentUploadFailed,
    });
    expect(removeUpload).not.toHaveBeenCalled();
    expect(backgroundLog).toHaveBeenCalledWith('error', 'boq.drawing_upload_compensation_failed', expect.objectContaining({
      projectId: 'project-1', documentPersisted: true, storagePreserved: true,
      error: { name: 'Error' },
    }));
  });

  it('returns the persisted drawing when D1 committed but lost the batch response', async () => {
    let reconciledDocumentId = '';
    let reconciledAuditId = '';
    writeBatch.mockRejectedValueOnce(new Error('D1 response was lost after commit'));
    db.projectDocument.findFirst.mockImplementationOnce(({ where }: { where: { id: string } }) => {
      reconciledDocumentId = where.id;
      return Promise.resolve({ id: where.id });
    });
    db.auditLog.findFirst.mockImplementationOnce(({ where }: { where: { id: string } }) => {
      reconciledAuditId = where.id;
      return Promise.resolve({ id: where.id });
    });

    await expect(POST(formRequest({ file: upload('committed-drawing.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: true, status: 200, data: { documentId: expect.any(String), fileName: 'committed-drawing.pdf' },
    });
    expect(reconciledDocumentId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(reconciledAuditId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(removeUpload).not.toHaveBeenCalled();
    expect(backgroundLog).toHaveBeenCalledWith('warn', 'boq.drawing_upload_acknowledgement_lost', expect.objectContaining({
      projectId: 'project-1', documentId: reconciledDocumentId, auditId: reconciledAuditId,
    }));
  });

  it('preserves the drawing when D1 persistence cannot be reconciled', async () => {
    writeBatch.mockRejectedValueOnce(new Error('D1 response unavailable'));
    db.projectDocument.findFirst.mockRejectedValueOnce(new Error('D1 read unavailable'));

    await expect(POST(formRequest({ file: upload('uncertain-drawing.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: false, status: 500,
    });
    expect(removeUpload).not.toHaveBeenCalled();
    expect(backgroundLog).toHaveBeenCalledWith('warn', 'boq.drawing_upload_reconciliation_failed', expect.objectContaining({
      projectId: 'project-1', documentId: expect.any(String), auditId: expect.any(String),
    }));
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.drawing_processing_failed', expect.objectContaining({
      documentPersisted: false, documentPersistenceUncertain: true,
    }));
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
