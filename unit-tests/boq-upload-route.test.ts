import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { POST } from '../src/app/api/boq/upload/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { mkdir, writeFile } from 'fs/promises';
import { createNextBoqRevision } from '../src/lib/boq-revision-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    boq: { findFirst: jest.fn(), create: jest.fn() },
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    projectDocument: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn() }));
jest.mock('../src/lib/boq-revision-utils', () => ({ createNextBoqRevision: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const makeRevision = createNextBoqRevision as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };

function request(values: Record<string, unknown> = {}) {
  return {
    formData: jest.fn().mockResolvedValue({ get: (name: string) => values[name] ?? null }),
  } as unknown as NextRequest;
}

function uploadFile(name = 'source.csv', body = 'Description,Qty\nCable,2') {
  const bytes = Buffer.from(body);
  const arrayBuffer = Uint8Array.from(bytes).buffer;
  return {
    name,
    size: bytes.byteLength,
    type: 'text/csv',
    arrayBuffer: async () => arrayBuffer,
    bytes,
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

describe('BOQ upload route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({ id: 'project-1' });
    db.boqRevision.findFirst.mockResolvedValue(null);
    db.boqRevision.update.mockResolvedValue({ id: 'revision-1', revisionCode: 'REV-1' });
    db.projectDocument.create.mockResolvedValue({ id: 'document-1' });
    audit.mockResolvedValue(undefined);
    jest.spyOn(Date, 'now').mockReturnValue(1234);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires an authenticated BOQ upload context, a file, a project, and tenant ownership', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request())).resolves.toBe(denied);

    await expect(POST(request({ projectId: 'project-1' }))).resolves.toEqual({ ok: false, error: 'No file provided.', status: 400 });
    const file = uploadFile();
    await expect(POST(request({ file }))).resolves.toEqual({ ok: false, error: 'Project ID is required.', status: 400 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ file, projectId: 'foreign-project' }))).resolves.toEqual({ ok: false, error: 'Project not found.', status: 404 });
    expect(db.project.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-project', tenantId: 'tenant-1' } });
  });

  it('rejects unsupported extensions before storing or parsing the upload', async () => {
    await expect(POST(request({ file: uploadFile('source.pdf'), projectId: 'project-1' }))).resolves.toEqual({
      ok: false, error: 'BOQ upload failed. Only .xlsx, .xls, and .csv files are supported.', status: 400,
    });
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('stores a file, detects headers and preview rows, updates a same-hash draft, and records audit/document entries', async () => {
    const file = spreadsheetFile();
    const hash = require('crypto').createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-1', revisionCode: 'REV-1', status: 'DRAFT', originalFileHash: hash, totalLines: 3,
    });
    const result = await POST(request({ file, projectId: 'project-1', boqId: 'boq-1' }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      boqId: 'boq-1', revisionId: 'revision-1', revisionCode: 'REV-1', fileName: 'source.xlsx',
      sheets: ['Items'], columns: ['Description', 'Column_2', 'Quantity'],
      previewRows: [{ Description: 'Cable', Column_2: '', Quantity: '2' }],
    } });
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('tenant-1'), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('1234_source.xlsx'), expect.any(Buffer));
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: expect.objectContaining({
      originalFileName: 'source.xlsx', originalFileHash: hash,
    }) });
    expect(makeRevision).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPLOAD', entityId: 'revision-1' }));
    expect(db.projectDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', category: 'ORIGINAL_BOQ', fileType: expect.stringContaining('spreadsheetml'),
    }) });
  });

  it('updates an empty draft shell and defaults a missing file MIME type', async () => {
    const file = { ...uploadFile('source.xls'), type: '' };
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-2', status: 'DRAFT', originalFileHash: 'old-hash', totalLines: 0 });
    await expect(POST(request({ file, projectId: 'project-1', boqId: 'boq-2' }))).resolves.toMatchObject({
      ok: true, data: { boqId: 'boq-2', sheets: expect.any(Array), columns: expect.any(Array) },
    });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-2' }, data: expect.objectContaining({ originalFileName: 'source.xls' }) });
    expect(db.projectDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }) });
  });

  it('creates a new BOQ and revision when no target BOQ is supplied', async () => {
    const file = uploadFile('source.csv');
    db.boq.findFirst.mockResolvedValueOnce({ boqCode: 'BOQ-000010' });
    db.boq.create.mockResolvedValueOnce({ id: 'boq-new' });
    makeRevision.mockResolvedValueOnce({ id: 'revision-new', revisionCode: 'R1' });
    const result = await POST(request({ file, projectId: 'project-1' }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { boqId: 'boq-new', revisionId: 'revision-new' } });
    expect(db.boq.create).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', projectId: 'project-1', boqCode: 'BOQ-000011', status: 'DRAFT', createdBy: 'user-1',
    } });
    expect(makeRevision).toHaveBeenCalledWith(expect.objectContaining({ boqId: 'boq-new', tenantId: 'tenant-1', status: 'DRAFT' }));
  });

  it('retries a unique BOQ-code collision before creating the BOQ', async () => {
    const file = uploadFile('source.csv');
    db.boq.findFirst.mockResolvedValue({ boqCode: 'BOQ-000010' });
    db.boq.create.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({ id: 'boq-retried' });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    makeRevision.mockResolvedValueOnce({ id: 'revision-retried', revisionCode: 'R1' });
    await expect(POST(request({ file, projectId: 'project-1' }))).resolves.toMatchObject({
      ok: true, data: { boqId: 'boq-retried' },
    });
    expect(db.boq.create).toHaveBeenCalledTimes(2);
  });

  it('uses a new revision when the latest revision is populated or non-draft and handles one-row text files', async () => {
    const file = uploadFile('source.csv', 'Description,Qty\nBolt,4');
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-old', status: 'APPROVED', totalLines: 2, originalFileHash: 'different' });
    makeRevision.mockResolvedValueOnce({ id: 'revision-next', revisionCode: 'R2' });
    await expect(POST(request({ file, projectId: 'project-1', boqId: 'boq-1' }))).resolves.toMatchObject({
      ok: true, data: { revisionId: 'revision-next', sheets: expect.any(Array) },
    });
    expect(makeRevision).toHaveBeenCalledWith(expect.objectContaining({ boqId: 'boq-1', originalFileName: 'source.csv' }));

    const corrupt = uploadFile('corrupt.xlsx', 'not an excel file');
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    makeRevision.mockResolvedValueOnce({ id: 'revision-corrupt', revisionCode: 'R1' });
    await expect(POST(request({ file: corrupt, projectId: 'project-1', boqId: 'boq-2' }))).resolves.toMatchObject({
      ok: true, data: { sheets: ['Sheet1'], columns: ['not an excel file'], previewRows: [] },
    });
  });
});
