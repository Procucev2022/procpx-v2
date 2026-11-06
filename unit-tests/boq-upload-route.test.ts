import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { POST } from '../src/app/api/boq/upload/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { saveUpload, deleteUpload } from '../src/lib/storage';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    boq: { findFirst: jest.fn() },
    boqRevision: { findFirst: jest.fn() },
    projectDocument: { findFirst: jest.fn() },
    auditLog: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/storage', () => ({ saveUpload: jest.fn(), deleteUpload: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const saveFile = saveUpload as jest.Mock;
const removeFile = deleteUpload as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const log = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const storedPath = 'r2://tenant-1/project-1/upload.csv';

function request(values: Record<string, unknown> = {}, headers = new Headers()) {
  return {
    headers,
    formData: jest.fn().mockResolvedValue({ get: (name: string) => values[name] ?? null }),
  } as unknown as NextRequest;
}

function uploadFile(name = 'source.csv', body = 'Description,Qty\nCable,2') {
  const bytes = Buffer.from(body);
  return {
    name,
    size: bytes.byteLength,
    type: name.endsWith('.xls') ? 'application/vnd.ms-excel'
      : name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv',
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

function spreadsheetFile(name = 'source.xlsx') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Description', '', 'Quantity'],
    ['Cable', '', 2],
  ]), 'Items');
  const bytes = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  return {
    name,
    size: bytes.byteLength,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1',
    revisionCode: 'R0',
    status: 'APPROVED',
    totalLines: 3,
    originalFileName: null,
    originalFilePath: null,
    originalFileHash: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('BOQ upload route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({ id: 'project-1' });
    db.boq.findFirst.mockResolvedValue({ id: 'boq-1' });
    db.boqRevision.findFirst.mockResolvedValue(null);
    db.projectDocument.findFirst.mockResolvedValue({ id: 'document-1' });
    db.auditLog.findFirst.mockResolvedValue({ id: 'audit-1' });
    saveFile.mockResolvedValue(storedPath);
    removeFile.mockResolvedValue(undefined);
    writeBatch.mockResolvedValue([]);
    log.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires authenticated context, a file, a project and a tenant-owned project', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request())).resolves.toBe(denied);
    await expect(POST(request({ projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqUploadRoute.noFileProvided, status: 400,
    });
    const file = uploadFile();
    await expect(POST(request({ file }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.projectIDIsRequired, status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ file, projectId: 'foreign-project' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.projectNotFound2, status: 404,
    });
    expect(db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign-project', tenantId: 'tenant-1' },
    }));
  });

  it('rejects an oversized request, empty files, unsupported extensions and mismatched MIME types', async () => {
    const tooLarge = new Headers({ 'content-length': String(21 * 1024 * 1024) });
    await expect(POST(request({}, tooLarge))).resolves.toMatchObject({ status: 413 });
    const oversized = { ...uploadFile(), size: 20 * 1024 * 1024 + 1 };
    await expect(POST(request({ file: oversized, projectId: 'project-1' }))).resolves.toMatchObject({ status: 413 });
    await expect(POST(request({ file: { ...uploadFile(), size: 0 }, projectId: 'project-1' }))).resolves.toMatchObject({ status: 413 });
    await expect(POST(request({ file: uploadFile('source.pdf'), projectId: 'project-1' }))).resolves.toMatchObject({ status: 400 });
    await expect(POST(request({ file: { ...uploadFile('source.xlsx'), type: 'text/csv' }, projectId: 'project-1' }))).resolves.toMatchObject({ status: 415 });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('logs spreadsheet parse failures and rejects workbooks with no recognizable first sheet', async () => {
    const parseFailure = jest.spyOn(jest.requireActual('xlsx'), 'read').mockImplementation(() => { throw new Error('invalid workbook'); });
    const file = uploadFile('invalid.xlsx');
    await expect(POST(request({ file, projectId: 'project-1' }))).resolves.toMatchObject({ status: 400 });
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_preview_parse_failed', expect.objectContaining({ projectId: 'project-1' }));
    parseFailure.mockRestore();

    jest.spyOn(jest.requireActual('xlsx'), 'read').mockReturnValue({ SheetNames: [], Sheets: {} } as ReturnType<typeof XLSX.read>);
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1' }))).resolves.toMatchObject({ status: 400 });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('rejects a supplied BOQ from another tenant or project before storing the file', async () => {
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'foreign-boq' }))).resolves.toMatchObject({ status: 404 });
    expect(db.boq.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-boq', tenantId: 'tenant-1', projectId: 'project-1' },
      select: { id: true },
    });
    expect(saveFile).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('reuses an identical draft upload and batches audit and document recovery idempotently', async () => {
    const file = spreadsheetFile();
    const hash = crypto.createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
    const existing = revision({
      status: 'DRAFT', totalLines: 3, originalFileHash: hash, originalFilePath: storedPath,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(existing);

    const result = await POST(request({ file, projectId: 'project-1', boqId: 'boq-1' }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      boqId: 'boq-1', revisionId: 'revision-1', revisionCode: 'R0', fileName: 'source.xlsx',
      sheets: ['Items'], columns: ['Description', 'Column_2', 'Quantity'],
      previewRows: [{ Description: 'Cable', Column_2: '', Quantity: '2' }],
    } });
    expect(saveFile).not.toHaveBeenCalled();
    const statements = writeBatch.mock.calls[0][0];
    expect(statements).toHaveLength(4);
    expect(statements[0].sql).toContain('UPDATE "boq_revisions"');
    expect(statements[1].sql).toContain('INSERT INTO "boq_revisions"');
    expect(statements[2].sql).toContain('INSERT INTO "audit_logs"');
    expect(statements[3].sql).toContain('INSERT INTO "project_documents"');
    expect(statements[2].sql).toContain('json_valid(existing."newValue")');
  });

  it('fills an empty draft with compare-and-set semantics and falls back to a new revision when stale', async () => {
    const emptyDraft = revision({ id: 'revision-shell', status: 'DRAFT', totalLines: 0 });
    db.boqRevision.findFirst.mockResolvedValueOnce(emptyDraft).mockResolvedValueOnce({
      id: 'revision-shell', revisionCode: 'R0', originalFilePath: storedPath,
    });
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({
      ok: true, data: { revisionId: 'revision-shell', revisionCode: 'R0' },
    });
    expect(writeBatch.mock.calls[0][0][0].values[6]).toBe('revision-shell');
    expect(writeBatch.mock.calls[0][0][1].sql).toContain('WHERE changes() = 0');

    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({ id: 'project-1' });
    db.boq.findFirst.mockResolvedValue({ id: 'boq-1' });
    db.boqRevision.findFirst.mockResolvedValueOnce(emptyDraft).mockResolvedValueOnce({
      id: 'revision-new', revisionCode: 'R1', originalFilePath: storedPath,
    });
    saveFile.mockResolvedValue(storedPath);
    writeBatch.mockResolvedValue([]);
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({
      ok: true, data: { revisionId: 'revision-new', revisionCode: 'R1' },
    });
  });

  it('creates a BOQ and its first revision in the same atomic D1 batch', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'revision-new', revisionCode: 'R0', originalFilePath: storedPath,
    });
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1' }))).resolves.toMatchObject({
      ok: true, data: { boqId: expect.any(String), revisionId: 'revision-new', revisionCode: 'R0' },
    });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements).toHaveLength(5);
    expect(statements[0].sql).toContain('INSERT INTO "boqs"');
    expect(statements[0].sql).toContain('project."projectCode"');
    expect(statements[1].sql).toContain('UPDATE "boq_revisions"');
    expect(statements[2].sql).toContain('COALESCE((SELECT MAX("revisionNumber") + 1');
  });

  it('creates a new revision after a populated or non-draft revision', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(revision()).mockResolvedValueOnce({
      id: 'revision-next', revisionCode: 'R2', originalFilePath: storedPath,
    });
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({
      ok: true, data: { revisionId: 'revision-next', revisionCode: 'R2' },
    });
    expect(writeBatch.mock.calls[0][0][0].values[6]).toBeNull();
  });

  it('removes the extra file when a concurrent request already persisted the same draft hash', async () => {
    db.boqRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'revision-race-winner', revisionCode: 'R0', originalFilePath: 'r2://tenant-1/project-1/winner.csv' });
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({
      ok: true, data: { revisionId: 'revision-race-winner' },
    });
    expect(removeFile).toHaveBeenCalledWith(storedPath, ['tenant-1', 'project-1']);
  });

  it('retries an uncertain batch and confirms a committed upload with audit and document records', async () => {
    const hash = crypto.createHash('sha256').update(Buffer.from('Description,Qty\nCable,2')).digest('hex');
    const existing = revision({ status: 'DRAFT', originalFileHash: hash, originalFilePath: storedPath });
    db.boqRevision.findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(existing);
    writeBatch.mockRejectedValueOnce(new Error('network response lost')).mockRejectedValueOnce(new Error('retry failed'));
    const result = await POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { revisionId: 'revision-1' } });
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_commit_confirmed_after_retry_failure', expect.any(Object));
  });

  it('cleans the losing upload after confirming a concurrent winner during uncertain commit recovery', async () => {
    db.boqRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'revision-race-winner', revisionCode: 'R0', originalFilePath: 'r2://tenant-1/project-1/winner.csv' });
    writeBatch.mockRejectedValue(new Error('D1 response lost'));
    removeFile.mockRejectedValueOnce(new Error('R2 delete unavailable'));
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { revisionId: 'revision-race-winner' },
    });
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_duplicate_file_cleanup_failed', expect.any(Object));
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_commit_confirmed_after_retry_failure', expect.any(Object));
  });

  it('cleans an unreferenced upload after both batch attempts fail', async () => {
    writeBatch.mockRejectedValue(new Error('D1 unavailable'));
    const result = await POST(request({ file: uploadFile(), projectId: 'project-1' }));
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(removeFile).toHaveBeenCalledWith(storedPath, ['tenant-1', 'project-1']);
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_persistence_failed', expect.any(Object));
  });

  it('logs but preserves a harmless duplicate when object cleanup fails after a successful D1 batch', async () => {
    db.boqRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'revision-race-winner', revisionCode: 'R0', originalFilePath: 'r2://tenant-1/project-1/winner.csv' });
    removeFile.mockRejectedValueOnce('R2 delete unavailable');
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_duplicate_file_cleanup_failed', expect.any(Object));
  });

  it('does not confirm an uncertain revision with no object path or document, and logs verification failures', async () => {
    writeBatch.mockRejectedValue(new Error('D1 response lost'));
    db.boqRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'revision-no-path', revisionCode: 'R0', originalFilePath: null });
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({ status: 500 });
    expect(db.projectDocument.findFirst).not.toHaveBeenCalled();
    expect(removeFile).toHaveBeenCalledWith(storedPath, ['tenant-1', 'project-1']);

    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({ id: 'project-1' });
    db.boq.findFirst.mockResolvedValue({ id: 'boq-1' });
    db.boqRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'revision-verified', revisionCode: 'R1', originalFilePath: storedPath });
    writeBatch.mockRejectedValue(new Error('D1 response lost'));
    db.projectDocument.findFirst.mockRejectedValueOnce(new Error('document read unavailable'));
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({ status: 500 });
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_commit_verification_failed', expect.any(Object));
    expect(removeFile).not.toHaveBeenCalled();
  });

  it('logs failed cleanup and continues returning the database error', async () => {
    writeBatch.mockRejectedValue('D1 unavailable');
    removeFile.mockRejectedValueOnce(new Error('object cleanup unavailable'));
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1' }))).resolves.toMatchObject({ status: 500 });
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_file_cleanup_failed', expect.any(Object));

    log.mockRejectedValue(new Error('logger unavailable'));
    const req = { headers: new Headers(), formData: jest.fn().mockRejectedValue('malformed request') } as unknown as NextRequest;
    await expect(POST(req)).resolves.toMatchObject({ status: 500 });
  });

  it('preserves the upload when recovery reads fail because the database reference is uncertain', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('recovery read failed'));
    await expect(POST(request({ file: uploadFile(), projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({ status: 500 });
    expect(removeFile).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_commit_recovery_check_failed', expect.any(Object));
  });

  it('returns a logged server error when multipart parsing throws', async () => {
    const req = { headers: new Headers(), formData: jest.fn().mockRejectedValue(new Error('invalid multipart body')) } as unknown as NextRequest;
    await expect(POST(req)).resolves.toMatchObject({ ok: false, status: 500 });
    expect(log).toHaveBeenCalledWith('error', 'boq.upload_request_failed', expect.any(Object));
  });
});
