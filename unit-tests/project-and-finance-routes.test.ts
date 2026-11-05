import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { GET as getProjectDocuments, POST as addProjectDocument } from '../src/app/api/projects/[id]/documents/route';
import { GET as getProject, PUT as updateProject } from '../src/app/api/projects/[id]/route';
import { POST as createNewRevision } from '../src/app/api/boq/[revisionId]/new-revision/route';
import { GET as getRateCardMessages, POST as addRateCardMessage } from '../src/app/api/procurement/rate-cards/[id]/message/route';
import { POST as rejectFinanceBudget } from '../src/app/api/budgets/finance-reject/route';
import { POST as rejectProjectBudget } from '../src/app/api/budgets/reject/route';
import { POST as approveProjectBudget } from '../src/app/api/budgets/approve/route';
import { POST as approveFinanceBudget } from '../src/app/api/budgets/finance-approve/route';
import { POST as reverseBudgetTransaction } from '../src/app/api/budgets/reverse/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { deleteUpload, saveUpload } from '../src/lib/storage';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { PROJECT_DOCUMENT_MAX_BYTES } from '../src/lib/project-document.constants';
import { MAX_BOQ_BATCH_LINES } from '../src/lib/d1-batch.constants';
import {
  BOQ_NEW_REVISION_AUDIT_INSERT_SQL,
  BOQ_NEW_REVISION_COPY_LINES_JSON_SQL,
  BOQ_NEW_REVISION_INSERT_SQL,
} from '../src/app/api/boq/[revisionId]/new-revision/route.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn(), update: jest.fn() },
    projectDocument: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boqLine: { createMany: jest.fn() },
    vendorRateCard: { findUnique: jest.fn() },
    rateCardApproval: { create: jest.fn(), findMany: jest.fn() },
    budgetContribution: { findFirst: jest.fn(), update: jest.fn() },
    budgetApproval: { create: jest.fn() },
    budgetTransaction: { updateMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    budget: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/storage', () => ({ saveUpload: jest.fn(), deleteUpload: jest.fn(), readUpload: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: jest.fn(() => ({ page: 1, pageSize: 50, skip: 0 })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const context = {
  tenantId: 'tenant-1', userId: 'user-1', userName: 'Project User', userEmail: 'user@example.test', role: 'ADMIN',
};
const request = (body?: unknown) => new NextRequest('http://localhost/api/test', {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const projectParams = (id = 'project-1') => ({ params: Promise.resolve({ id }) });
const revisionParams = (revisionId = 'revision-1') => ({ params: Promise.resolve({ revisionId }) });
const cardParams = (id = 'rate-card-1') => ({ params: Promise.resolve({ id }) });
const uploadRequest = (file: unknown, category: string | null = 'DRAWING', headers = new Headers({ 'x-request-id': 'request-1' })) => ({
  headers,
  formData: jest.fn().mockResolvedValue({ get: (name: string) => name === 'file' ? file : name === 'category' ? category : null }),
}) as unknown as NextRequest;
const uploadFile = (overrides: Record<string, unknown> = {}) => ({
  name: 'Plan.pdf', type: 'application/pdf', size: 3,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  ...overrides,
});

describe('project document, project detail, BOQ revision, rate-card message and budget rejection routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    audit.mockResolvedValue(undefined);
    db.rateCardApproval.findMany.mockReset().mockResolvedValue([]);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValue(Array.from({ length: 10 }, () => ({ meta: { changes: 1 } })));
  });

  it('lists and uploads real project documents with tenant scoping, audit history, and compensation', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    const denied = await getProjectDocuments(request(), projectParams());
    expect(denied).toEqual({ status: 403 });

    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(getProjectDocuments(request(), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.projectDocument.findMany.mockResolvedValueOnce([{ id: 'doc-1' }]);
    db.projectDocument.count.mockResolvedValueOnce(1);
    await expect(getProjectDocuments(request(), projectParams())).resolves.toEqual({
      ok: true, data: { documents: [{ id: 'doc-1' }], total: 1, page: 1, pageSize: 50, hasMore: false }, status: 200,
    });
    expect(db.projectDocument.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1', tenantId: 'tenant-1' },
      select: { id: true, projectId: true, name: true, fileType: true, fileSize: true, uploadedBy: true, uploadedAt: true, category: true },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }], skip: 0, take: 50,
    });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    expect(await addProjectDocument(uploadRequest(uploadFile()), projectParams())).toEqual({ status: 403 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(addProjectDocument(uploadRequest(uploadFile()), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    await expect(addProjectDocument(uploadRequest(null), projectParams())).resolves.toMatchObject({ status: 400 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    await expect(addProjectDocument(uploadRequest(uploadFile({ name: 'malware.exe' })), projectParams())).resolves.toMatchObject({ status: 415 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    await expect(addProjectDocument(uploadRequest(uploadFile(), 'INVALID'), projectParams())).resolves.toMatchObject({ status: 400 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    (saveUpload as jest.Mock).mockResolvedValueOnce('uploads/tenant-1/project-1/document.pdf');
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    const uploaded = await addProjectDocument(uploadRequest(uploadFile()), projectParams());
    expect(uploaded).toMatchObject({ ok: true, status: 201, data: { projectId: 'project-1', name: 'Plan.pdf', fileSize: 3, category: 'DRAWING' } });
    expect(saveUpload).toHaveBeenCalledWith(['tenant-1', 'project-1'], expect.stringMatching(/\.pdf$/), Buffer.from([1, 2, 3]));
    expect(writeD1BatchAtomically).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining('INSERT INTO "project_documents"') }),
      expect.objectContaining({ values: expect.arrayContaining(['Project document added: Plan.pdf (DRAWING)']) }),
    ]));

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    (saveUpload as jest.Mock).mockResolvedValueOnce('uploads/tenant-1/project-1/another.pdf');
    (writeD1BatchAtomically as jest.Mock)
      .mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }])
      .mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(addProjectDocument(uploadRequest(uploadFile()), projectParams())).resolves.toMatchObject({ status: 409 });
    expect(writeD1BatchAtomically).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining('DELETE FROM "audit_logs"') }),
      expect.objectContaining({ sql: expect.stringContaining('DELETE FROM "project_documents"') }),
    ]));
    expect(deleteUpload).toHaveBeenCalledWith('uploads/tenant-1/project-1/another.pdf', ['tenant-1', 'project-1']);
  });

  it('logs project-document reads and resolves request IDs from the Cloudflare ray header', async () => {
    db.project.findFirst.mockRejectedValueOnce({ database: 'offline' });
    const readRequest = new NextRequest('http://localhost/api/projects/project-1/documents', {
      headers: { 'cf-ray': 'ray-123' },
    });
    await expect(getProjectDocuments(readRequest, projectParams())).resolves.toMatchObject({ status: 500 });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'project.documents_read_failed', expect.objectContaining({
      requestId: 'ray-123', tenantId: 'tenant-1', projectId: 'project-1', error: { name: 'UnknownError' },
    }));
  });

  it('rejects oversized transport bodies, empty or oversized files, and mismatched MIME types', async () => {
    const tooLargeTransport = uploadRequest(uploadFile(), 'DRAWING', new Headers({
      'content-length': String(PROJECT_DOCUMENT_MAX_BYTES + 65_537),
    }));
    await expect(addProjectDocument(tooLargeTransport, projectParams())).resolves.toMatchObject({ status: 413 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    await expect(addProjectDocument(uploadRequest(uploadFile({ size: 0 })), projectParams())).resolves.toMatchObject({ status: 413 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    await expect(addProjectDocument(uploadRequest(uploadFile({ size: PROJECT_DOCUMENT_MAX_BYTES + 1 })), projectParams())).resolves.toMatchObject({ status: 413 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    await expect(addProjectDocument(uploadRequest(uploadFile({ type: 'text/plain' })), projectParams())).resolves.toMatchObject({ status: 415 });
  });

  it('defaults an empty category to OTHER and keeps a blob if D1 compensation fails', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    (saveUpload as jest.Mock).mockResolvedValueOnce('uploads/tenant-1/project-1/other.pdf');
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(addProjectDocument(uploadRequest(uploadFile(), ''), projectParams())).resolves.toMatchObject({
      status: 201, data: { category: 'OTHER' },
    });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    (saveUpload as jest.Mock).mockResolvedValueOnce('uploads/tenant-1/project-1/preserved.pdf');
    (writeD1BatchAtomically as jest.Mock)
      .mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }])
      .mockRejectedValueOnce(new Error('compensation unavailable'));
    await expect(addProjectDocument(uploadRequest(uploadFile()), projectParams())).resolves.toMatchObject({ status: 500 });
    expect(deleteUpload).not.toHaveBeenCalledWith('uploads/tenant-1/project-1/preserved.pdf', ['tenant-1', 'project-1']);
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'project.document_upload_compensation_failed', expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', storagePreserved: true,
      error: { name: 'Error' },
    }));
  });

  it('compensates stored files when the first D1 write fails and records failed cleanup', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    (saveUpload as jest.Mock).mockResolvedValueOnce('uploads/tenant-1/project-1/write-failed.pdf');
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('D1 batch unavailable'));
    (deleteUpload as jest.Mock).mockRejectedValueOnce({ storage: 'offline' });
    await expect(addProjectDocument(uploadRequest(uploadFile()), projectParams())).resolves.toMatchObject({ status: 500 });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'project.document_upload_cleanup_failed', expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', error: { name: 'UnknownError' },
    }));
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'project.document_upload_failed', expect.objectContaining({
      requestId: 'request-1', fileSize: 3, category: 'DRAWING', error: { name: 'Error' },
    }));
  });

  it('reads and updates project details with tenant checks and keeps omitted values', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(getProject(request(), projectParams())).resolves.toEqual({ status: 403 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(getProject(request(), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', projectCode: 'P-1' });
    await expect(getProject(request(), projectParams())).resolves.toMatchObject({ ok: true, data: { projectCode: 'P-1' } });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(updateProject(request({ name: 'Updated' }), projectParams())).resolves.toEqual({ status: 403 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(updateProject(request({ name: 'Updated' }), projectParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });

    const existing = {
      id: 'project-1', projectCode: 'P-1', name: 'Old', description: 'Old description', sector: 'Retail', projectType: 'New',
      location: 'East', address: 'Old address', city: 'Pune', state: 'MH', country: 'IN', areaSqFt: 10,
      costCentre: 'CC-1', projectOwner: 'Owner', budget: 100, currency: 'INR', status: 'ACTIVE',
    };
    db.project.findFirst.mockResolvedValueOnce(existing);
    const updated = { ...existing, name: 'New', areaSqFt: 250.5, budget: 2000, updatedBy: 'user-1' };
    db.project.update.mockResolvedValueOnce(updated);
    await expect(updateProject(request({
      name: 'New', description: 'New description', sector: 'Health', projectType: 'Expansion', location: 'West', address: 'New address',
      city: 'Mumbai', state: 'MH', country: 'IN', areaSqFt: '250.5', costCentre: 'CC-2', projectOwner: 'New owner', budget: '2000',
      currency: 'USD', status: 'ON_HOLD',
    }), projectParams())).resolves.toEqual({ ok: true, data: updated, status: 200 });
    expect(db.project.update).toHaveBeenLastCalledWith({ where: { id: 'project-1' }, data: expect.objectContaining({
      name: 'New', areaSqFt: 250.5, budget: 2000, status: 'ON_HOLD', updatedBy: 'user-1',
    }) });

    db.project.findFirst.mockResolvedValueOnce(existing);
    db.project.update.mockResolvedValueOnce(existing);
    await updateProject(request({ areaSqFt: 0, budget: 0 }), projectParams());
    expect(db.project.update).toHaveBeenLastCalledWith({ where: { id: 'project-1' }, data: expect.objectContaining({
      name: 'Old', description: 'Old description', areaSqFt: 10, budget: 100, status: UI_STRINGS.common.aCTIVE,
    }) });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: UI_STRINGS.appAppAuditPage.uPDATE, oldValue: { status: UI_STRINGS.common.aCTIVE, name: 'Old' } }));
  });

  it('creates revisions only from approved BOQs and copies available source lines', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(createNewRevision(request(), revisionParams())).resolves.toEqual({ status: 403 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(createNewRevision(request(), revisionParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'DRAFT' });
    await expect(createNewRevision(request(), revisionParams())).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRevisionIdNewRevisionRoute.newRevisionsCanOnlyBeCreatedFromAnApprovedRevision, status: 400,
    });

    const source = {
      id: 'revision-1', boqId: 'boq-1', costCentreId: 'cc-1', status: 'APPROVED', revisionCode: 'R1',
      totalLines: 2, validLines: 2, warningLines: 0, qualityScore: 100, lines: [],
      tenantId: 'tenant-1', updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' },
    };
    db.boqRevision.findFirst.mockResolvedValueOnce(source);
    db.boqRevision.findFirst.mockResolvedValueOnce({ revisionNumber: 1 });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([
      { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 1 } },
    ]);
    const emptyRevisionResult = await createNewRevision(request(), revisionParams());
    expect(emptyRevisionResult).toMatchObject({
      ok: true, data: { revisionId: expect.any(String), revisionCode: 'R2', copiedLines: 0 }, status: 201,
    });
    expect(db.boqLine.createMany).not.toHaveBeenCalled();
    const emptyRevisionBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0];
    expect(emptyRevisionBatch.map(({ sql }: { sql: string }) => sql)).toEqual([
      BOQ_NEW_REVISION_INSERT_SQL,
      BOQ_NEW_REVISION_COPY_LINES_JSON_SQL,
      BOQ_NEW_REVISION_AUDIT_INSERT_SQL,
    ]);
    expect(JSON.parse(emptyRevisionBatch[1].values[2] as string)).toHaveLength(0);
    expect(emptyRevisionBatch[2].values[4]).toBe(0);

    const sourceLine = {
      lineNumber: '1', originalDescription: 'Cable', standardDescription: 'Copper cable', specification: null, categoryId: null,
      subcategoryId: null, uomId: null, uomRaw: null, quantity: 4, location: null, drawingReference: null, brand: null,
      model: null, material: null, grade: null, remarks: null, itemCode: null, validationStatus: 'VALID',
      validationMessages: null, benchmarkEligible: true,
    };
    const sourceLines = [
      sourceLine,
      { ...sourceLine, lineNumber: '2', validationStatus: 'WARNING' },
      { ...sourceLine, lineNumber: '3', validationStatus: 'ERROR' },
    ];
    db.boqRevision.findFirst.mockResolvedValueOnce({ ...source, lines: sourceLines });
    db.boqRevision.findFirst.mockResolvedValueOnce({ revisionNumber: 2 });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([
      { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 3 } },
      { success: true, meta: { changes: 1 } },
    ]);
    const copiedRevisionResult = await createNewRevision(request(), revisionParams());
    const copiedRevisionId = (copiedRevisionResult as unknown as { data: { revisionId: string } }).data.revisionId;
    const copiedRevisionBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[1][0];
    expect(copiedRevisionResult).toMatchObject({ ok: true, data: { copiedLines: 3 } });
    expect(copiedRevisionBatch[0].values).toContain('R3');
    expect(copiedRevisionBatch[0].values.slice(4, 9)).toEqual([3, 1, 1, 1, 57]);
    expect(copiedRevisionBatch[1].values[1]).toBe(copiedRevisionId);
    expect(copiedRevisionBatch[2].values[0]).toBe(copiedRevisionId);
    expect(JSON.parse(copiedRevisionBatch[1].values[2] as string)).toHaveLength(3);
    expect(JSON.parse(copiedRevisionBatch[1].values[2] as string)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(String), lineNumber: '1', originalDescription: 'Cable', quantity: 4, benchmarkEligible: true,
        createdAt: expect.any(String), updatedAt: expect.any(String),
      }),
    ]));
    expect(copiedRevisionBatch[2].values.slice(4, 6)).toEqual([3, expect.any(String)]);
    expect(db.boqLine.createMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('caps copied BOQ lines and recovers a committed batch result after an interrupted response', async () => {
    const source = {
      id: 'revision-large', tenantId: 'tenant-1', boqId: 'boq-1', costCentreId: 'cc-1', status: 'APPROVED', revisionCode: 'R1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' },
      lines: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, (_, index) => ({ lineNumber: String(index + 1) })),
    };
    db.boqRevision.findFirst.mockResolvedValueOnce(source);
    await expect(createNewRevision(request(), revisionParams('revision-large'))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.common.boqLineBatchLimitExceeded,
    });
    expect(writeD1BatchAtomically).not.toHaveBeenCalled();

    const singleLineSource = {
      ...source,
      id: 'revision-recover',
      revisionCode: 'R1',
      lines: [{ lineNumber: '1', originalDescription: 'Cable', validationStatus: 'VALID', benchmarkEligible: true }],
    };
    db.boqRevision.findFirst.mockResolvedValueOnce(singleLineSource);
    db.boqRevision.findFirst.mockResolvedValueOnce({ revisionNumber: 1 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'persisted-revision', revisionCode: 'R2' });
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('batch response interrupted'));
    await expect(createNewRevision(request(), revisionParams('revision-recover'))).resolves.toEqual({
      ok: true, data: { revisionId: 'persisted-revision', revisionCode: 'R2', copiedLines: 1 }, status: 201,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('warn', 'boq.revision_copy_result_recovered', expect.objectContaining({
      operation: 'copy_approved_boq_revision', sourceRevisionId: 'revision-recover', copiedLines: 1,
    }));
  });

  it('logs a failed revision copy and keeps database errors out of the client response', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-error', tenantId: 'tenant-1', boqId: 'boq-1', costCentreId: null, status: 'APPROVED', revisionCode: 'R0',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' }, lines: [],
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('database internal details'));
    await expect(createNewRevision(request(), revisionParams('revision-error'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateBoqRecord, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'boq.revision_copy_failed', expect.objectContaining({
      sourceRevisionId: 'revision-error', error: { name: 'Error', message: 'database internal details' },
    }));
  });

  it('rejects partial batch results at every write boundary and confirms recovery when optional logging fails', async () => {
    db.boqRevision.findFirst.mockReset();
    (writeD1BatchAtomically as jest.Mock).mockReset();
    (writeStructuredLog as jest.Mock).mockReset().mockResolvedValue(undefined);
    const source = {
      id: 'revision-partial', tenantId: 'tenant-1', boqId: 'boq-1', costCentreId: null, status: 'APPROVED', revisionCode: 'R1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' },
      lines: [{ lineNumber: '1', validationStatus: 'VALID', benchmarkEligible: true }],
    };
    const incompleteResults = [
      [{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }],
      [{ meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }],
      [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }],
    ];

    for (const [index, results] of incompleteResults.entries()) {
      db.boqRevision.findFirst.mockResolvedValueOnce({ ...source, id: `revision-partial-${index}` });
      db.boqRevision.findFirst.mockResolvedValueOnce(null);
      db.boqRevision.findFirst.mockResolvedValueOnce(null);
      (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce(results);
      await expect(createNewRevision(request(), revisionParams(`revision-partial-${index}`))).resolves.toMatchObject({
        ok: false, status: 500, error: UI_STRINGS.common.userMessages.failedToCreateBoqRecord,
      });
    }

    db.boqRevision.findFirst.mockResolvedValueOnce({ ...source, id: 'revision-recovered-log-failure' });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'persisted-revision-log-failure', revisionCode: 'R1' });
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('batch response interrupted'));
    (writeStructuredLog as jest.Mock).mockRejectedValueOnce(new Error('local log unavailable'));
    await expect(createNewRevision(request(), revisionParams('revision-recovered-log-failure'))).resolves.toMatchObject({
      ok: true, status: 201, data: { revisionId: 'persisted-revision-log-failure', copiedLines: 1 },
    });
  });

  it('handles recovery lookup and error logging failures without exposing raw errors', async () => {
    db.boqRevision.findFirst.mockReset();
    (writeD1BatchAtomically as jest.Mock).mockReset();
    (writeStructuredLog as jest.Mock).mockReset().mockResolvedValue(undefined);
    const source = {
      id: 'revision-recovery-lookup-error', tenantId: 'tenant-1', boqId: 'boq-1', costCentreId: null, status: 'APPROVED', revisionCode: 'R1',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' }, lines: [],
    };
    db.boqRevision.findFirst.mockResolvedValueOnce(source);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('recovery lookup unavailable'));
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce('non-error database failure');
    (writeStructuredLog as jest.Mock).mockRejectedValueOnce(new Error('local log unavailable'));
    await expect(createNewRevision(request(), revisionParams(source.id))).resolves.toMatchObject({
      ok: false, status: 500, error: UI_STRINGS.common.userMessages.failedToCreateBoqRecord,
    });
  });

  it('records and lists rate-card clarification messages while enforcing tenant ownership', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(addRateCardMessage(request({ message: 'Question' }), cardParams())).resolves.toEqual({ status: 403 });
    await expect(addRateCardMessage(request({ message: '  ' }), cardParams())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.messageTextIsRequired, status: 400,
    });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(addRateCardMessage(request({ message: 'Question' }), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'other-tenant' });
    await expect(addRateCardMessage(request({ message: 'Question' }), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });

    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1', approvalLevel: null });
    db.rateCardApproval.create.mockResolvedValueOnce({ id: 'message-1' });
    await expect(addRateCardMessage(request({ message: '  Please confirm lead time  ' }), cardParams())).resolves.toMatchObject({
      ok: true, data: { approvalEntry: { id: 'message-1' } },
    });
    expect(db.vendorRateCard.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'rate-card-1', tenantId: 'tenant-1' },
    });
    expect(db.rateCardApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      level: UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT, approverName: UI_STRINGS.common.projectUser, approverEmail: 'user@example.test',
      action: 'CLARIFICATION_MESSAGE', remarks: 'Please confirm lead time', timestamp: expect.any(Date),
    }) });

    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: 'fallback@example.test' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1', approvalLevel: 'LEVEL_2_FINANCE' });
    db.rateCardApproval.create.mockResolvedValueOnce({ id: 'message-2' });
    await addRateCardMessage(request({ message: 'Noted' }), cardParams());
    expect(db.rateCardApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      level: 'LEVEL_2_FINANCE', approverName: 'fallback@example.test', approverEmail: 'fallback@example.test',
    }) });
    auth.mockResolvedValueOnce({ ...context, userName: '', userEmail: '' });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1' });
    db.rateCardApproval.create.mockResolvedValueOnce({ id: 'message-3' });
    await addRateCardMessage(request({ message: 'Noted' }), cardParams());
    expect(db.rateCardApproval.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ approverName: 'ADMIN', approverEmail: null }) });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({ status: 403 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce(null);
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'other-tenant' });
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rateCardNotFound, status: 404 });
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1' });
    db.rateCardApproval.findMany.mockResolvedValueOnce([{ id: 'message-1', timestamp: new Date('2026-04-02T10:00:00.000Z') }]);
    await expect(getRateCardMessages(request(), cardParams())).resolves.toMatchObject({
      ok: true,
      data: { approvals: [{ id: 'message-1' }], approvalHistory: { hasMore: false, nextCursor: null, pageSize: 25 } },
      status: 200,
    });
    expect(db.vendorRateCard.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'rate-card-1', tenantId: 'tenant-1' },
    });
    expect(db.rateCardApproval.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rateCardId: 'rate-card-1' },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 26,
      select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
    }));

    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('database detail that must not reach the client'));
    await expect(addRateCardMessage(request({ message: 'Question' }), cardParams())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToRecordMessage, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'rate_card.clarification_message_create_failed', expect.objectContaining({
      operation: 'create_rate_card_clarification_message',
      tenantId: 'tenant-1', userId: 'user-1', rateCardId: 'rate-card-1',
      error: { name: 'Error' },
    }));
    expect(writeStructuredLog).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      error: expect.objectContaining({ message: expect.anything() }),
    }));

    db.vendorRateCard.findUnique.mockRejectedValueOnce(new Error('database detail that must not reach the client'));
    await expect(getRateCardMessages(request(), cardParams())).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToGetMessages, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'rate_card.clarification_messages_read_failed', expect.objectContaining({
      operation: 'read_rate_card_clarification_messages',
      tenantId: 'tenant-1', userId: 'user-1', rateCardId: 'rate-card-1',
      error: { name: 'Error' },
    }));
  });

  it('validates and applies stable tenant-scoped clarification history cursors', async () => {
    await expect(getRateCardMessages(
      new NextRequest('http://localhost/api/test?cursor=not-a-cursor'), cardParams(),
    )).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    expect(db.vendorRateCard.findUnique).not.toHaveBeenCalled();

    const cursor = '2026-04-02T10:00:00.000Z~approval-1';
    db.vendorRateCard.findUnique.mockResolvedValueOnce({ tenantId: 'tenant-1' });
    await expect(getRateCardMessages(
      new NextRequest(`http://localhost/api/test?cursor=${encodeURIComponent(cursor)}`), cardParams(),
    )).resolves.toMatchObject({ ok: true, data: { approvals: [], approvalHistory: { hasMore: false } } });
    expect(db.rateCardApproval.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1', rateCardId: 'rate-card-1',
        OR: [
          { timestamp: { lt: new Date('2026-04-02T10:00:00.000Z') } },
          { timestamp: new Date('2026-04-02T10:00:00.000Z'), id: { lt: 'approval-1' } },
        ],
      },
    }));
  });

  it('validates and performs finance and project budget rejections, including pending amount cleanup', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: 'Overrun' }))).resolves.toEqual({ status: 403 });
    await expect(rejectFinanceBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: ' ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsFinanceRejectRoute.mandatoryFinanceRejectionReasonIsRequired, status: 400,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(rejectFinanceBudget(request({ contributionId: 'missing', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    const contribution = {
      id: 'budget-1', status: 'PENDING_FINANCE_APPROVAL', projectId: 'project-1', boqRevisionId: 'revision-1', costCentreId: 'cc-1',
      costCentre: { code: 'CC-1' }, totalEstimatedValue: 800,
    };
    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: '  Over budget  ' }))).resolves.toMatchObject({
      ok: true, data: { status: 'REJECTED' },
    });
    let batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch).toHaveLength(6);
    expect(batch[2].values).toEqual(expect.arrayContaining(['FINANCE', 'REJECTED', 'Over budget']));
    expect(batch[3].sql).toContain('budget_transactions');
    expect(batch[4].values).toContain('BUDGET_REJECTED');

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'APPROVED' });
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: 'Overrun' }))).resolves.toMatchObject({ ok: false, status: 400 });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PENDING_FINANCE_APPROVAL' });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-1', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionChangedPleaseRefresh, status: 409,
    });

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(rejectProjectBudget(request({ contributionId: 'budget-2', reason: 'Overrun' }))).resolves.toEqual({ status: 403 });
    await expect(rejectProjectBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    await expect(rejectProjectBudget(request({ contributionId: 'budget-2', reason: ' ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.mandatoryRejectionReasonMustBeProvided, status: 400,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(rejectProjectBudget(request({ contributionId: 'missing', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, id: 'budget-2', status: 'PENDING_PROJECT_APPROVAL' });
    await expect(rejectProjectBudget(request({ contributionId: 'budget-2', reason: 'Not aligned' }))).resolves.toMatchObject({
      ok: true, data: { status: 'REJECTED' },
    });
    expect(db.budget.update).not.toHaveBeenCalled();

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, id: 'budget-3', status: 'PENDING_PROJECT_APPROVAL' });
    await rejectProjectBudget(request({ contributionId: 'budget-3', reason: 'Not aligned' }));
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch[5].sql).toContain('pendingAmount');
    expect(batch[5].values).toContain(800);

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, id: 'budget-race', status: 'PENDING_PROJECT_APPROVAL' });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(rejectProjectBudget(request({ contributionId: 'budget-race', reason: 'Not aligned' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionChangedPleaseRefresh, status: 409,
    });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, id: 'budget-wrong-state', status: 'APPROVED' });
    await expect(rejectProjectBudget(request({ contributionId: 'budget-wrong-state', reason: 'Not aligned' }))).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('APPROVED'), status: 400,
    });

    db.budgetContribution.findFirst.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(rejectFinanceBudget(request({ contributionId: 'budget-4', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.financeBudgetRejectionFailed, status: 500,
    });
    db.budgetContribution.findFirst.mockRejectedValueOnce({});
    await expect(rejectProjectBudget(request({ contributionId: 'budget-4', reason: 'Overrun' }))).resolves.toEqual({
      ok: false, error: 'Project budget rejection failed.', status: 500,
    });
  });

  it('approves project and finance budgets with direct approval, budget aggregation, and validation', async () => {
    let batch: Array<{ sql: string; values: unknown[] }>;
    const contribution = {
      id: 'budget-approve-1', status: 'PENDING_PROJECT_APPROVAL', projectId: 'project-1', costCentreId: 'cc-1',
      boqRevisionId: 'revision-1', costCentre: { code: 'CC-1' }, acceptedEstimatedValue: 700, totalEstimatedValue: 850,
    };
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(approveProjectBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toEqual({ status: 403 });
    await expect(approveProjectBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(approveProjectBudget(request({ contributionId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404 });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'REJECTED' });
    await expect(approveProjectBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toMatchObject({ ok: false, status: 400 });

    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', remarks: '' }));
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch).toHaveLength(5);
    expect(batch[2].values).toEqual(expect.arrayContaining(['PROJECT_APPROVER', 'APPROVED', 'Project level scope and commercial estimate approved.']));
    expect(batch[4].values).toContain('BUDGET_UNDER_FINANCE_APPROVAL');

    auth.mockResolvedValueOnce({ ...context, role: 'SUPER_ADMIN' });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'UNDER_APPROVAL' });
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', directApprove: true, remarks: 'Approved' }));
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch).toHaveLength(6);
    expect(batch[5].sql).toContain('ON CONFLICT');
    expect(batch[5].values).toEqual(expect.arrayContaining([700, 850]));

    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(approveProjectBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionChangedPleaseRefresh, status: 409,
    });

    auth.mockResolvedValueOnce({ ...context, role: 'CLIENT_ADMIN' });
    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', directApprove: true }));
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch[5].values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'cc-1', 700]));

    auth.mockResolvedValueOnce({ ...context, role: 'PROJECT_USER' });
    db.budgetContribution.findFirst.mockResolvedValueOnce(contribution);
    await approveProjectBudget(request({ contributionId: 'budget-approve-1', directApprove: true }));
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch[0].values).toContain('PENDING_FINANCE_APPROVAL');

    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(approveFinanceBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toEqual({ status: 403 });
    db.budgetContribution.findFirst.mockResolvedValueOnce(null);
    await expect(approveFinanceBudget(request({ contributionId: 'missing' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionNotFound, status: 404,
    });
    await expect(approveFinanceBudget(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.contributionIDIsRequired, status: 400 });
    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PENDING_PROJECT_APPROVAL' });
    await expect(approveFinanceBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toMatchObject({ ok: false, status: 400 });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PROJECT_APPROVED' });
    await expect(approveFinanceBudget(request({ contributionId: 'budget-approve-1', remarks: '' }))).resolves.toMatchObject({
      ok: true, data: { status: 'APPROVED', approvedAmount: 700 },
    });
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch[2].values).toEqual(expect.arrayContaining(['FINANCE', 'APPROVED', 'Capex financial budget allocation validated and sanctioned.']));
    expect(batch[5].sql).toContain('"totalAmount" = "budgets"."totalAmount" + excluded."totalAmount"');
    expect(batch[5].values).toEqual(expect.arrayContaining([700, 850]));

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PENDING_FINANCE_APPROVAL' });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(approveFinanceBudget(request({ contributionId: 'budget-approve-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetContributionChangedPleaseRefresh, status: 409,
    });

    db.budgetContribution.findFirst.mockResolvedValueOnce({ ...contribution, status: 'PENDING_FINANCE_APPROVAL' });
    await approveFinanceBudget(request({ contributionId: 'budget-approve-1', remarks: 'Sanctioned' }));
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch[5].values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'cc-1', 700]));

    db.budgetContribution.findFirst.mockRejectedValueOnce(new Error('project approve failed'));
    await expect(approveProjectBudget(request({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.projectBudgetApprovalFailed, status: 500,
    });
    db.budgetContribution.findFirst.mockRejectedValueOnce({});
    await expect(approveFinanceBudget(request({ contributionId: 'budget-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.financeBudgetApprovalFailed, status: 500,
    });
  });

  it('validates reversals and creates linked negative budget transactions', async () => {
    auth.mockResolvedValueOnce({ status: 403 });
    isContext.mockReturnValueOnce(false);
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }))).resolves.toEqual({ status: 403 });
    await expect(reverseBudgetTransaction(request({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.transactionIDIsRequired, status: 400 });
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: ' ' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.mandatoryReversalReasonMustBeProvided, status: 400,
    });
    db.budgetTransaction.findFirst = jest.fn();
    db.budgetTransaction.findFirst.mockResolvedValueOnce(null);
    await expect(reverseBudgetTransaction(request({ transactionId: 'missing', reversalReason: 'Fix' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.budgetTransactionNotFound, status: 404,
    });
    db.budgetTransaction.findFirst.mockResolvedValueOnce({ isReversal: true });
    await expect(reverseBudgetTransaction(request({ transactionId: 'reverse', reversalReason: 'Fix' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.cannotReverseATransactionThatIsAlreadyAReversal, status: 400,
    });
    db.budgetTransaction.findFirst.mockResolvedValueOnce({ isReversal: false, status: 'PENDING' });
    await expect(reverseBudgetTransaction(request({ transactionId: 'pending', reversalReason: 'Fix' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBudgetsReverseRoute.onlyApprovedBudgetTransactionsCanBeReversed, status: 400,
    });

    const transaction = {
      id: 'tx-1', tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1',
      boqRevisionId: 'revision-1', boqLineId: 'line-1', contributionId: 'contribution-1', category: 'Materials',
      subcategory: 'Cable', amount: 900, quantity: 3, rate: 300, status: 'APPROVED', isReversal: false, transactionCode: 'BTX-0001',
    };
    db.budgetTransaction.findFirst.mockResolvedValueOnce(transaction);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([
      { meta: { changes: 1 } },
      { meta: { changes: 1 }, results: [{ id: 'tx-rev-1', transactionCode: 'BTX-REV-00005' }] },
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
    ]);
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: '  Duplicate entry  ' }))).resolves.toEqual({
      ok: true, data: {
        originalTransaction: { ...transaction, status: 'REVERSED' },
        reversalTransaction: expect.objectContaining({ id: expect.any(String), transactionCode: 'BTX-REV-00005', amount: -900, quantity: -3,
          isReversal: true, reversalReason: 'Duplicate entry', reversedTransactionId: 'tx-1', createdBy: 'user-1' }),
        reversedAmount: -900,
      }, status: 201,
    });
    let batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch).toHaveLength(4);
    expect(batch[0].sql).toContain("SET \"status\" = 'REVERSED'");
    expect(batch[1].sql).toContain("'BTX-REV-'");
    expect(batch[2].values).toEqual(expect.arrayContaining(['BUDGET_TRANSACTION_REVERSED', expect.stringContaining('Duplicate entry')]));
    expect(batch[3].sql).toContain('MAX(0, "approvedAmount" - ?)');

    db.budgetTransaction.findFirst.mockResolvedValueOnce(transaction);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Duplicate retry' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.budgetTransactionChangedPleaseRefresh, status: 409,
    });

    db.budgetTransaction.findFirst.mockResolvedValueOnce({ ...transaction, quantity: 0 });
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([
      { meta: { changes: 1 } },
      { meta: { changes: 1 }, results: [{ id: 'tx-rev-2', transactionCode: 'BTX-REV-00011' }] },
      { meta: { changes: 1 } },
      { meta: { changes: 0 } },
    ]);
    await reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }));
    batch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0];
    expect(batch[1].values).toContain(null);
    expect(batch[1].values).toContain(-900);

    db.budgetTransaction.findFirst.mockRejectedValueOnce(new Error('reversal failed'));
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.transactionReversalFailed, status: 500,
    });
    db.budgetTransaction.findFirst.mockRejectedValueOnce({});
    await expect(reverseBudgetTransaction(request({ transactionId: 'tx-1', reversalReason: 'Correction' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.transactionReversalFailed, status: 500,
    });
  });
});
