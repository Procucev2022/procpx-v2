import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/standard/generate/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import {
  BOQ_STANDARD_GENERATE_AUDIT_AFTER_LINES_SQL,
  BOQ_STANDARD_GENERATE_INSERT_BOQ_SQL,
  BOQ_STANDARD_GENERATE_INSERT_LINES_JSON_SQL,
  BOQ_STANDARD_GENERATE_UPDATE_BOQ_SQL,
  BOQ_STANDARD_GENERATE_UPDATE_EMPTY_REVISION_SQL,
} from '../src/app/api/boq/standard/generate/route.constants';
import { BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL } from '../src/lib/d1-batch.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boq: { findFirst: jest.fn() },
    boqRevision: { findFirst: jest.fn() },
    boqLine: { count: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    auditLog: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/d1-batch', () => ({ ...jest.requireActual('../src/lib/d1-batch'), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const logger = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'ADMIN' };
const request = (body: unknown) => new NextRequest('http://localhost/api/boq/standard/generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-request-id': 'request-1' }, body: JSON.stringify(body),
});
const sourceRevision = {
  id: 'revision-0', revisionCode: 'R0', revisionNumber: 0, status: 'DRAFT', totalLines: 0,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};
const existingBoq = {
  id: 'boq-1', tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-old', boqCode: 'BOQ-000001',
  title: 'Old title', description: 'Old description', purpose: 'BUDGET', category: 'Old category', scope: 'Old scope',
  status: 'DRAFT', createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  createdBy: 'user-1', revisions: [sourceRevision],
};
const successBatch = (lineCount: number, boqCode = 'BOQ-000006', revisionCode = 'R1') => [
  { success: true, meta: { changes: 1 }, results: [{ id: 'boq-1', boqCode }] },
  { success: true, meta: { changes: 1 }, results: [{ id: 'revision-0', revisionCode }] },
  { success: true, meta: { changes: lineCount } },
  { success: true, meta: { changes: 1 } },
];

describe('generate BOQ from standard upload API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({ id: 'project-1', name: 'Retail Store', sector: 'Retail' });
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01' });
    db.boq.findFirst.mockResolvedValue(existingBoq);
    db.boqRevision.findFirst.mockResolvedValue(null);
    db.boqLine.count.mockResolvedValue(0);
    db.category.findMany.mockResolvedValue([{ id: 'cat-electrical', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValue([{ id: 'uom-mtr', code: 'MTR' }, { id: 'uom-nos', code: 'NOS' }]);
    db.auditLog.findFirst.mockResolvedValue(null);
    batch.mockResolvedValue(successBatch(1, existingBoq.boqCode, sourceRevision.revisionCode));
    logger.mockResolvedValue(undefined);
  });

  it('checks permission, required fields, line bounds, project, cost centre, and BOQ scope', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({}))).resolves.toBe(denied);
    await expect(POST(request(null))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    await expect(POST(request({ projectId: 12, validLines: [{}] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    await expect(POST(request({ validLines: [{ description: 'Item' }] }))).resolves.toMatchObject({ status: 400 });
    await expect(POST(request({ projectId: 'project-1', validLines: [] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqStandardGenerateRoute.noValidLineItemsToGenerateBOQFrom, status: 400,
    });
    await expect(POST(request({ projectId: 'project-1', validLines: [{}, []] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.boqLineBatchLimitExceeded, status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ projectId: 'foreign', validLines: [{ description: 'Item' }] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.projectNotFound2, status: 404,
    });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ projectId: 'project-1', costCentreId: 'foreign-cc', validLines: [{}] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRoute.costCentreDoesNotBelongToTheSelectedProject, status: 400,
    });
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(POST(request({ projectId: 'project-1', boqId: 'missing-boq', validLines: [{}] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqRevisionIdRoute.bOQNotFound, status: 404,
    });
    expect(batch).not.toHaveBeenCalled();
  });

  it('reuses only an empty draft shell and atomically writes lines, revision metrics, and audit', async () => {
    const validLines = [
      { category: 'Electrical', description: 'Cable', quantity: null, benchmarkRate: 20 },
      { category: 'Electrical', description: 'Switch', quantity: undefined },
      { category: 'Electrical', description: 'Socket', quantity: '', benchmarkRate: 5 },
      { category: 'Electrical', description: 'Broken qty', quantity: 'bad', benchmarkRate: 4 },
      { category: 'Electrical', description: 'Zero qty', quantity: 0, benchmarkRate: '10' },
      { category: 'Electrical', description: 'Panel', itemCode: 'P-1', quantity: '2', benchmarkRate: '10', uom: 'mtr', validationStatus: 'REVIEW', brand: 'Acme', model: 'M1', areaZone: 'North', drawingReference: 'D-1', remarks: 'Check' },
    ];
    batch.mockResolvedValueOnce(successBatch(6, existingBoq.boqCode, sourceRevision.revisionCode));
    await expect(POST(request({ projectId: 'project-1', costCentreId: 'cc-1', boqId: 'boq-1', validLines, fileName: 'standard.xlsx', scope: '  fit out  ' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { boqId: 'boq-1', revisionId: 'revision-0', totalLines: 6, qualityScore: 33 },
    });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({
      where: { id: 'cc-1', projectId: 'project-1', tenantId: 'tenant-1' }, select: { id: true, code: true },
    });
    expect(db.boq.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'boq-1', tenantId: 'tenant-1', projectId: 'project-1' },
    }));
    expect(db.boqLine.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', boqRevisionId: 'revision-0', isDeleted: false },
    });
    expect(db.category.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', name: { in: ['Electrical'] } },
    }));
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.map((statement) => statement.sql)).toEqual([
      BOQ_STANDARD_GENERATE_UPDATE_BOQ_SQL,
      BOQ_STANDARD_GENERATE_UPDATE_EMPTY_REVISION_SQL,
      BOQ_STANDARD_GENERATE_INSERT_LINES_JSON_SQL,
      BOQ_STANDARD_GENERATE_AUDIT_AFTER_LINES_SQL,
    ]);
    expect(statements[0].values).toHaveLength(15);
    expect(statements[0].values).toContain('fit out');
    expect(statements[1].values).toContain(6);
    expect(statements[1].values).toContain(2);
    expect(statements[1].values).toContain(4);
    const insertedLines = JSON.parse(String(statements[2].values[2])) as Array<Record<string, unknown>>;
    expect(insertedLines).toHaveLength(6);
    expect(insertedLines[0]).toMatchObject({
      lineNumber: '1', itemCode: 'STD-L1', originalDescription: 'Cable', quantity: null,
      aiUnitCost: 20, aiTotalCost: null, categoryId: 'cat-electrical', uomId: 'uom-nos', validationStatus: 'QUANTITY_REQUIRED',
    });
    expect(insertedLines[4]).toMatchObject({ quantity: 0, aiUnitCost: 10, aiTotalCost: null, validationStatus: 'WARNING' });
    expect(insertedLines[5]).toMatchObject({
      itemCode: 'P-1', quantity: 2, aiUnitCost: 10, aiTotalCost: 20, categoryId: 'cat-electrical', uomId: 'uom-mtr',
      validationStatus: 'REVIEW', brand: 'Acme', model: 'M1', location: 'North', drawingReference: 'D-1', remarks: 'Check',
    });
    expect(statements[3].values[0]).toBe(6);
    expect(statements[3].values[3]).toEqual(expect.any(String));
    expect(JSON.parse(String(statements[3].values[10]))).toMatchObject({ totalLines: 6, validLines: 2, warningLines: 4, qualityScore: 33 });
  });

  it('creates a tenant-unique BOQ and its first revision when no BOQ id is supplied', async () => {
    db.boq.findFirst.mockClear();
    batch.mockResolvedValueOnce(successBatch(1, 'BOQ-000006', 'R0'));
    const result = await POST(request({ projectId: 'project-1', validLines: [{ quantity: 2, benchmarkRate: 10 }] }));
    expect(result).toMatchObject({ ok: true, status: 201, data: { boqCode: 'BOQ-000006', revisionCode: 'R0', qualityScore: 100 } });
    expect(db.boq.findFirst).not.toHaveBeenCalled();
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements[0].sql).toBe(BOQ_STANDARD_GENERATE_INSERT_BOQ_SQL);
    expect(statements[1].sql).toBe(BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL);
    expect(statements[0].values[3]).toBeNull();
    expect(statements[1].values).toContain('BUDGET_DRAFT');
  });

  it('creates a new revision instead of repopulating an approved or physically nonempty shell', async () => {
    db.boq.findFirst.mockResolvedValueOnce({ ...existingBoq, revisions: [{ ...sourceRevision, status: 'APPROVED' }] });
    batch.mockResolvedValueOnce(successBatch(1, existingBoq.boqCode, 'R1'));
    await expect(POST(request({ projectId: 'project-1', boqId: 'boq-1', validLines: [{ quantity: 1 }] }))).resolves.toMatchObject({
      ok: true, data: { revisionCode: 'R1' },
    });
    let statements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements[1].sql).toBe(BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL);
    expect(db.boqLine.count).not.toHaveBeenCalled();

    db.boq.findFirst.mockResolvedValueOnce(existingBoq);
    db.boqLine.count.mockResolvedValueOnce(1);
    batch.mockResolvedValueOnce(successBatch(1, existingBoq.boqCode, 'R1'));
    await expect(POST(request({ projectId: 'project-1', boqId: 'boq-1', validLines: [{ quantity: 1 }] }))).resolves.toMatchObject({
      ok: true, data: { revisionCode: 'R1' },
    });
    statements = batch.mock.calls[1][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements[1].sql).toBe(BOQ_TEMPLATE_REVISION_INSERT_NEXT_SQL);
  });

  it('rejects invalid compare-and-set timestamps and maps unknown category values safely', async () => {
    db.boq.findFirst.mockResolvedValueOnce({ ...existingBoq, updatedAt: 'invalid-date' });
    await expect(POST(request({ projectId: 'project-1', boqId: 'boq-1', validLines: [{ quantity: 1 }] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    expect(batch).not.toHaveBeenCalled();

    db.boq.findFirst.mockResolvedValueOnce({
      ...existingBoq,
      revisions: [{ ...sourceRevision, updatedAt: 'invalid-date' }],
    });
    await expect(POST(request({ projectId: 'project-1', boqId: 'boq-1', validLines: [{ quantity: 1 }] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    expect(batch).not.toHaveBeenCalled();
  });

  it('keeps PR purpose and fallback identifiers when D1 omits optional returning rows', async () => {
    const results = successBatch(1, existingBoq.boqCode, sourceRevision.revisionCode);
    results[0].results = undefined;
    results[1].results = undefined;
    batch.mockResolvedValueOnce(results);
    const result = await POST(request({
      projectId: 'project-1', boqId: 'boq-1', purpose: 'PR', title: '  ', description: ' ',
      validLines: [{ originalDescription: '  ', description: '', itemDescription: '  ', quantity: 1, category: 'Unknown' }],
    }));
    expect(result).toMatchObject({ ok: true, data: { boqCode: existingBoq.boqCode, revisionCode: sourceRevision.revisionCode } });
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements[1].values).toContain('PR_DRAFT');
    const insertedLines = JSON.parse(String(statements[2].values[2])) as Array<Record<string, unknown>>;
    expect(insertedLines[0]).toMatchObject({ originalDescription: 'Standard Item', categoryId: null, quantity: 1 });
    expect(db.category.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', name: { in: ['Unknown'] } },
    }));
  });

  it('rolls partial batch results back and returns a stable error when recovery cannot confirm a commit', async () => {
    batch.mockResolvedValueOnce([
      { success: true, meta: { changes: 1 }, results: [{ boqCode: existingBoq.boqCode }] },
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 0 } },
    ]);
    await expect(POST(request({ projectId: 'project-1', boqId: 'boq-1', validLines: [{ quantity: 1 }] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToGenerateDraftBoq2, status: 500,
    });
    expect(logger).toHaveBeenCalledWith('error', 'boq.standard_generation_failed', expect.objectContaining({
      operation: 'generate_boq_from_standard_upload', projectId: 'project-1', boqId: 'boq-1',
    }));
  });

  it('recovers a fully committed batch after a lost response even when warning-log storage fails', async () => {
    db.boq.findFirst.mockClear();
    batch.mockRejectedValueOnce(new Error('batch response interrupted'));
    db.boqRevision.findFirst.mockImplementationOnce(({ where }: { where: { id: string; boqId: string } }) => ({
      id: where.id, revisionCode: 'R0', totalLines: 1,
      boq: { id: where.boqId, boqCode: 'BOQ-000009', projectId: 'project-1', tenantId: 'tenant-1' },
    }));
    db.boqLine.count.mockResolvedValueOnce(1);
    db.auditLog.findFirst.mockImplementationOnce(({ where }: { where: { id: string } }) => ({ id: where.id }));
    logger.mockRejectedValueOnce(new Error('local log unavailable'));
    const response = await POST(request({ projectId: 'project-1', validLines: [{ quantity: 1 }] }));
    expect(response).toMatchObject({
      ok: true, status: 201, data: {
        boqId: expect.any(String), revisionId: expect.any(String), boqCode: 'BOQ-000009', revisionCode: 'R0', totalLines: 1,
      },
    });
    const generated = (response as unknown as { data: { boqId: string; revisionId: string } }).data;
    expect(db.boqRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: generated.revisionId, boqId: generated.boqId }) }));
  });

  it('does not expose database errors or fail when the error logger is unavailable', async () => {
    db.project.findFirst.mockRejectedValueOnce(new Error('sensitive database detail'));
    logger.mockRejectedValueOnce(new Error('local log unavailable'));
    await expect(POST(request({ projectId: 'project-1', validLines: [{ description: 'Cable' }] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToGenerateDraftBoq2, status: 500,
    });
  });

  it('handles non-Error batch failures and unavailable recovery reads with a request id fallback', async () => {
    db.boq.findFirst.mockResolvedValueOnce({ ...existingBoq, revisions: [{ ...sourceRevision, status: 'APPROVED' }] });
    batch.mockRejectedValueOnce('D1 unavailable');
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('recovery query failed'));
    const noRequestId = new NextRequest('http://localhost/api/boq/standard/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', boqId: 'boq-1', validLines: [{ quantity: 1 }] }),
    });
    await expect(POST(noRequestId)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToGenerateDraftBoq2, status: 500,
    });
    expect(logger).toHaveBeenCalledWith('error', 'boq.standard_generation_failed', expect.objectContaining({
      requestId: null, error: { type: 'string' },
    }));
  });
});
