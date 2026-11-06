import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { standardiseDescription, standardiseUom } from '../src/lib/uom-standardise';
import { validateBoqLine, computeQualityScore, summarizeIssues } from '../src/lib/boq-validate';
import { createAuditLog } from '../src/lib/audit';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { POST as standardiseRevision } from '../src/app/api/boq/[revisionId]/standardise/route';
import { GET as getValidation, POST as validateRevision } from '../src/app/api/boq/[revisionId]/validate/route';
import { POST as refineRevision } from '../src/app/api/boq/refine-ai/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { BOQ_REFINEMENT_AUDIT_INSERT_AFTER_UPDATE_SQL, BOQ_REFINEMENT_LINES_UPDATE_JSON_SQL, BOQ_REFINEMENT_REVISION_UPDATE_SQL } from '../src/app/api/boq/refine-ai/route.constants';
import { BOQ_STANDARDISE_LINES_UPDATE_JSON_SQL, BOQ_STANDARDISE_REVISION_UPDATE_SQL } from '../src/app/api/boq/[revisionId]/standardise/route.constants';
import { BOQ_VALIDATE_LINES_UPDATE_JSON_SQL, BOQ_VALIDATE_REVISION_UPDATE_SQL } from '../src/app/api/boq/[revisionId]/validate/route.constants';
import { MAX_BOQ_BATCH_LINES } from '../src/lib/d1-batch.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { findFirst: jest.fn() },
    boqLine: { findMany: jest.fn(), update: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/uom-standardise', () => ({ standardiseDescription: jest.fn(), standardiseUom: jest.fn() }));
jest.mock('../src/lib/boq-validate', () => ({ validateBoqLine: jest.fn(), computeQualityScore: jest.fn(), summarizeIssues: jest.fn() }));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue(undefined) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const standardiseDesc = standardiseDescription as jest.Mock;
const standardiseUnit = standardiseUom as jest.Mock;
const validateLine = validateBoqLine as jest.Mock;
const qualityScore = computeQualityScore as jest.Mock;
const summarize = summarizeIssues as jest.Mock;
const audit = createAuditLog as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const writeLog = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'CLIENT_ADMIN' };
const request = (url = 'http://localhost/api/test', body: unknown = {}) => new NextRequest(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const params = { params: Promise.resolve({ revisionId: 'revision-1' }) };
const mockSuccessfulWorkflowBatch = () => {
  writeBatch.mockReset().mockImplementation(async (statements: Array<{ values: unknown[] }>) => {
    const lineUpdates = JSON.parse(String(statements[0].values[0])) as unknown[];
    return [
      { success: true, meta: { changes: lineUpdates.length } },
      { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 1 } },
    ];
  });
};

describe('BOQ revision standardisation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    writeLog.mockResolvedValue(undefined);
    mockSuccessfulWorkflowBatch();
  });

  it('checks authorization, revision access, and the immutable approved state', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(standardiseRevision(request(), params)).resolves.toBe(denied);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(standardiseRevision(request(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', status: 'APPROVED' });
    await expect(standardiseRevision(request(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRevisionIdStandardiseRoute.approvedBOQsAreImmutableAndCannotBeStandardisedCreateANewRevision, status: 400 });
  });

  it('standardises descriptions, units, category and subcategory while preserving unchanged lines', async () => {
    const lines: Array<Record<string, unknown>> = [
      { id: 'line-1', originalDescription: 'tile', standardDescription: 'Old tile', uomRaw: 'SQFT', uomId: null, categoryId: null, subcategoryId: null, quantity: 4, lineNumber: '1' },
      { id: 'line-2', originalDescription: 'miscellaneous', standardDescription: 'Already standard', uomRaw: '', uomId: 'uom-old', categoryId: 'cat-old', subcategoryId: 'sub-old', quantity: 1, lineNumber: '2' },
      { id: 'line-3', originalDescription: 'unknown item', standardDescription: null, uomRaw: 'UNKNOWN', uomId: null, categoryId: null, subcategoryId: null, quantity: null, lineNumber: '3' },
    ];
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', status: 'DRAFT', revisionCode: 'R0', updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' }, lines });
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-sqft', code: 'SQFT' }]);
    db.category.findMany.mockResolvedValueOnce([{ id: 'cat-floor', name: 'Civil & Interior', children: [{ id: 'sub-floor', name: 'Flooring' }] }]);
    standardiseDesc.mockImplementation((description: string) => description === 'tile'
      ? { matched: true, standardDescription: 'Commercial tile', category: 'Civil & Interior', subcategory: 'Flooring' }
      : { matched: false });
    standardiseUnit.mockImplementation((uom: string) => ({ code: uom === 'SQFT' ? 'SQFT' : 'NOS' }));
    validateLine.mockImplementation(({ originalDescription }: { originalDescription: string }) => ({
      status: originalDescription === 'unknown item' ? 'ERROR' : originalDescription === 'miscellaneous' ? 'WARNING' : 'VALID',
      messages: [],
    }));
    qualityScore.mockReturnValueOnce(75);
    lines[1].validationStatus = 'WARNING';

    await expect(standardiseRevision(request(), params)).resolves.toMatchObject({ ok: true, data: {
      standardisedCount: 1, uomNormalisedCount: 1, totalLines: 3, validLines: 1, errorLines: 1, warningLines: 1, qualityScore: 75,
    } });
    const [lineUpdate, revisionUpdate, auditInsert] = writeBatch.mock.calls[0][0];
    expect(lineUpdate.sql).toBe(BOQ_STANDARDISE_LINES_UPDATE_JSON_SQL);
    expect(revisionUpdate.sql).toBe(BOQ_STANDARDISE_REVISION_UPDATE_SQL);
    expect(revisionUpdate.values.slice(0, 4)).toEqual([1, 1, 1, 75]);
    expect(revisionUpdate.values.slice(5, 8)).toEqual(['revision-1', 'tenant-1', new Date('2026-01-01T00:00:00.000Z')]);
    expect(auditInsert.values.slice(4, 7)).toEqual(['BOQ_REVISION', 'revision-1', 'STANDARDISE']);
    expect(JSON.parse(lineUpdate.values[0] as string)).toEqual([
      expect.objectContaining({ id: 'line-1', standardDescription: 'Commercial tile', uomId: 'uom-sqft', categoryId: 'cat-floor', subcategoryId: 'sub-floor', validationStatus: 'VALID' }),
      expect.objectContaining({ id: 'line-3', standardDescription: 'unknown item', uomId: null, categoryId: null, subcategoryId: null, validationStatus: 'ERROR' }),
    ]);
    expect(db.boqLine.update).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('enforces the standardisation batch limit and detects partial atomic writes', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-large', status: 'DRAFT', lines: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, () => ({})),
    });
    await expect(standardiseRevision(request(), params)).resolves.toMatchObject({ ok: false, status: 400 });

    const revisionWithMissingOptionalFields = {
      id: 'revision-null-uom', status: 'DRAFT', revisionCode: 'R1', updatedAt: new Date(), boq: { projectId: 'project-1' },
      lines: [{ id: 'line-1', originalDescription: 'unknown item', standardDescription: null, uomRaw: null, uomId: null, categoryId: null, subcategoryId: null, quantity: 1 }],
    };
    db.boqRevision.findFirst.mockResolvedValueOnce(revisionWithMissingOptionalFields);
    standardiseDesc.mockReturnValueOnce({ matched: false });
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(standardiseRevision(request(), params)).resolves.toMatchObject({ ok: true });

    db.boqRevision.findFirst.mockResolvedValueOnce(revisionWithMissingOptionalFields);
    standardiseDesc.mockReturnValueOnce({ matched: false });
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    await expect(standardiseRevision(request(), params)).resolves.toMatchObject({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce(revisionWithMissingOptionalFields);
    standardiseDesc.mockReturnValueOnce({ matched: false });
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }]);
    await expect(standardiseRevision(request(), params)).resolves.toMatchObject({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
  });
});

describe('BOQ validation route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    mockSuccessfulWorkflowBatch();
  });

  it('validates duplicate line numbers and invalid UOMs, updates the issue summary, and audits', async () => {
    const lines = [
      { id: 'line-1', lineNumber: '1', originalDescription: 'Cable', uomId: 'missing-uom', quantity: 2 },
      { id: 'line-2', lineNumber: '1', originalDescription: 'Cable 2', uomId: 'known-uom', quantity: 3 },
      { id: 'line-3', lineNumber: '', originalDescription: 'Other', uomId: null, quantity: 1 },
    ];
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', revisionCode: 'R1', updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' }, lines });
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'known-uom', code: 'EA' }]);
    validateLine.mockReturnValueOnce({ status: 'ERROR', messages: ['duplicate and invalid'] }).mockReturnValueOnce({ status: 'WARNING', messages: ['duplicate'] }).mockReturnValueOnce({ status: 'VALID', messages: [] });
    const issues = { qualityScore: 67, errors: 1, warnings: 1 };
    summarize.mockReturnValueOnce(issues);
    await expect(validateRevision(request(), params)).resolves.toEqual({ ok: true, data: { qualityScore: 67, totalLines: 3, validLines: 1, errorLines: 1, warningLines: 1, issues }, status: 200 });
    expect(validateLine).toHaveBeenNthCalledWith(1, expect.objectContaining({ lineNumber: UI_STRINGS.common.copyefwnq4, isDuplicate: true, isInvalidUom: true }));
    expect(validateLine).toHaveBeenNthCalledWith(2, expect.objectContaining({ lineNumber: UI_STRINGS.common.copyefwnq4, isDuplicate: true, isInvalidUom: false }));
    expect(validateLine).toHaveBeenNthCalledWith(3, expect.objectContaining({ lineNumber: '', isDuplicate: false, isInvalidUom: false }));
    expect(summarize).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ lineNumber: UI_STRINGS.common.copyefwnq4, isDuplicate: true, isInvalidUom: true })]));
    const [lineUpdate, revisionUpdate, auditInsert] = writeBatch.mock.calls[0][0];
    expect(lineUpdate.sql).toBe(BOQ_VALIDATE_LINES_UPDATE_JSON_SQL);
    expect(revisionUpdate.sql).toBe(BOQ_VALIDATE_REVISION_UPDATE_SQL);
    expect(revisionUpdate.values.slice(0, 5)).toEqual([3, 1, 1, 1, 67]);
    expect(JSON.parse(lineUpdate.values[0] as string)).toEqual([
      expect.objectContaining({ id: 'line-1', validationStatus: 'ERROR' }),
      expect.objectContaining({ id: 'line-2', validationStatus: 'WARNING' }),
      expect.objectContaining({ id: 'line-3', validationStatus: 'VALID' }),
    ]);
    expect(auditInsert.values.slice(4, 7)).toEqual(['BOQ_REVISION', 'revision-1', 'VALIDATE']);
    expect(db.boqLine.update).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('checks access and missing revisions for validation and read-only quality details', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(validateRevision(request(), params)).resolves.toBe(denied);
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(validateRevision(request(), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });

    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getValidation(request('http://localhost/api/test'), params)).resolves.toBe(denied);
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', lines: [{ id: 'line-1' }], qualityScore: 88, totalLines: 1, validLines: 1, warningLines: 0, errorLines: 0 });
    await expect(getValidation(request('http://localhost/api/test'), params)).resolves.toEqual({ ok: true, data: {
      revision: expect.objectContaining({ id: 'revision-1' }), lines: [{ id: 'line-1' }], qualityScore: 88, totalLines: 1, validLines: 1, warningLines: 0, errorLines: 0,
    }, status: 200 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1', revisions: [{ id: 'revision-latest', lines: [{ id: 'line-2' }], qualityScore: 70, totalLines: 0 }], project: { id: 'project-1' } });
    await expect(getValidation(request('http://localhost/api/test'), params)).resolves.toMatchObject({ ok: true, data: { revision: { id: 'revision-latest' }, totalLines: 1 } });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(getValidation(request('http://localhost/api/test'), params)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.revisionNotFound, status: 404 });
  });

  it('enforces validation batch limits and reports each partial write conflict', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-large', lines: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, (_, index) => ({ id: `line-${index}` })),
    });
    await expect(validateRevision(request(), params)).resolves.toMatchObject({ ok: false, status: 400 });

    const revision = {
      id: 'revision-1', revisionCode: 'R1', updatedAt: new Date('2026-01-01T00:00:00.000Z'), boq: { projectId: 'project-1' },
      lines: [{ id: 'line-1', lineNumber: '1', originalDescription: 'Cable', quantity: 1 }],
    };
    validateLine.mockReturnValue({ status: 'VALID', messages: [] });
    summarize.mockReturnValue({ qualityScore: 100 });
    const partialResults = [
      [{}, { meta: { changes: 1 } }, { meta: { changes: 1 } }],
      [{ meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 1 } }],
      [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }],
    ];
    for (const results of partialResults) {
      db.boqRevision.findFirst.mockResolvedValueOnce(revision);
      db.uomMaster.findMany.mockResolvedValueOnce([]);
      writeBatch.mockResolvedValueOnce(results);
      await expect(validateRevision(request(), params)).resolves.toMatchObject({
        ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
      });
    }
  });

  it('logs validation and quality-read failures while keeping logging failures contained', async () => {
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('validation lookup failed'));
    writeLog.mockRejectedValueOnce(new Error('local diagnostic store unavailable'));
    await expect(validateRevision(request(), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateBoq, status: 500,
    });
    expect(writeLog).toHaveBeenCalledWith('error', 'boq.validation_failed', expect.objectContaining({
      operation: 'validate_boq_revision', boqRevisionId: 'revision-1', error: { name: 'Error', message: 'validation lookup failed' },
    }));

    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-large', lines: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, (_, index) => ({ id: `line-${index}` })),
    });
    await expect(getValidation(request('http://localhost/api/test'), params)).resolves.toMatchObject({ ok: false, status: 400 });

    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('quality lookup failed'));
    await expect(getValidation(request('http://localhost/api/test'), params)).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToUpdateBoq, status: 500,
    });
    expect(writeLog).toHaveBeenCalledWith('error', 'boq.validation_read_failed', expect.objectContaining({
      operation: 'read_boq_validation', boqRevisionId: 'revision-1', error: { name: 'Error', message: 'quality lookup failed' },
    }));

    db.boqRevision.findFirst.mockRejectedValueOnce('non-error validation failure');
    await expect(validateRevision(request(), params)).resolves.toMatchObject({ ok: false, status: 500 });
    expect(writeLog).toHaveBeenLastCalledWith('error', 'boq.validation_failed', expect.objectContaining({
      error: { type: 'string' },
    }));
    db.boqRevision.findFirst.mockRejectedValueOnce('non-error quality failure');
    await expect(getValidation(request('http://localhost/api/test'), params)).resolves.toMatchObject({ ok: false, status: 500 });
    expect(writeLog).toHaveBeenLastCalledWith('error', 'boq.validation_read_failed', expect.objectContaining({
      error: { type: 'string' },
    }));
  });
});

describe('AI BOQ refinement route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    writeLog.mockResolvedValue(undefined);
  });

  it('checks permission, required revision, revision access, and approval status', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(refineRevision(request())).resolves.toBe(denied);
    await expect(refineRevision(request('http://localhost/api/test', {}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRefineAiRoute.bOQRevisionIDIsRequired, status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'approved' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRefineAiRoute.approvedBOQRevisionsCannotBeRefinedBranchANewRevisionFirst, status: 403 });
  });

  it('suggests all known catalog rules and auto-accepts suggestions meeting the threshold', async () => {
    const words = ['tile', 'ceiling', 'cable', 'wire', 'light', 'ac', 'paint', 'door', 'unknown'];
    const lines = words.map((word, index) => ({ id: `line-${index}`, lineNumber: String(index + 1), originalDescription: `Test ${word}`, standardDescription: index === 0 ? 'Existing tile' : null, specification: index === 0 ? 'Existing spec' : null }));
    const revision = { id: 'revision-1', revisionNumber: 2, updatedAt: new Date('2026-11-04T00:00:00.000Z'), boq: { projectId: 'project-1', boqCode: 'BOQ-1' }, lines };
    db.boqRevision.findFirst.mockResolvedValueOnce(revision);
    writeBatch.mockResolvedValueOnce([
      { success: true, meta: { changes: lines.length }, results: [] },
      { success: true, meta: { changes: 1 }, results: [] },
      { success: true, meta: { changes: 1 }, results: [] },
    ]);
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-1', lineIds: ['line-0'], acceptConfidenceThreshold: 0.9 }))).resolves.toMatchObject({
      ok: true, data: { boqRevisionId: 'revision-1', totalRefined: 9, lines: expect.arrayContaining([
        expect.objectContaining({ id: 'line-0', accepted: true, aiConfidence: 0.94 }),
        expect.objectContaining({ id: 'line-6', accepted: false, aiConfidence: 0.89 }),
        expect.objectContaining({ id: 'line-8', accepted: false, aiConfidence: 0.85 }),
      ]) },
    });
    expect(db.boqRevision.findFirst).toHaveBeenCalledWith({
      where: { id: 'revision-1', tenantId: 'tenant-1' },
      include: { lines: { where: { id: { in: ['line-0'] } }, take: MAX_BOQ_BATCH_LINES + 1, orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }] }, boq: true },
    });
    const [lineUpdate, revisionUpdate, auditInsert] = writeBatch.mock.calls[0][0];
    expect([lineUpdate.sql, revisionUpdate.sql, auditInsert.sql]).toEqual([
      BOQ_REFINEMENT_LINES_UPDATE_JSON_SQL,
      BOQ_REFINEMENT_REVISION_UPDATE_SQL,
      BOQ_REFINEMENT_AUDIT_INSERT_AFTER_UPDATE_SQL,
    ]);
    const linePayload = JSON.parse(lineUpdate.values[0] as string);
    expect(linePayload).toHaveLength(9);
    expect(linePayload[0]).toMatchObject({ id: 'line-0', aiConfidence: 0.94, standardDescription: expect.stringContaining('vitrified floor tile') });
    expect(linePayload[8]).toMatchObject({ id: 'line-8', aiConfidence: 0.85, standardDescription: null });
    expect(revisionUpdate.values.slice(1)).toEqual(['revision-1', 'tenant-1', revision.updatedAt, lines.length]);
    expect(auditInsert.values.slice(1, 6)).toEqual(['tenant-1', 'user-1', 'project-1', 'revision-1', expect.any(String)]);
    expect(writeBatch.mock.calls[0][0]).toHaveLength(3);
    expect(db.boqLine.update).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('keeps suggestions pending without an accept threshold and reports storage errors', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-2', revisionNumber: 0, updatedAt: new Date('2026-11-04T00:00:00.000Z'), boq: { projectId: 'project-2', boqCode: 'BOQ-2' }, lines: [{ id: 'line-1', lineNumber: '1', originalDescription: 'tile' }] });
    writeBatch.mockResolvedValueOnce([
      { success: true, meta: { changes: 1 }, results: [] },
      { success: true, meta: { changes: 1 }, results: [] },
      { success: true, meta: { changes: 1 }, results: [] },
    ]);
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-2', lineIds: [] }))).resolves.toMatchObject({ ok: true, data: { lines: [expect.objectContaining({ accepted: undefined, aiConfidence: 0.94 })] } });
    expect(db.boqRevision.findFirst).toHaveBeenLastCalledWith({ where: { id: 'revision-2', tenantId: 'tenant-1' }, include: { lines: { take: MAX_BOQ_BATCH_LINES + 1, orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }] }, boq: true } });
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('refinement failed'));
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-2' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.aiRefinementFailed, status: 500 });
    db.boqRevision.findFirst.mockRejectedValueOnce({});
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-2' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.aiRefinementFailed, status: 500 });
  });

  it('rejects malformed and over-limit line identifiers before loading the revision', async () => {
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-1', lineIds: 'line-1' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiBoqRefineAiRoute.lineIdsMustBeAListOfStrings,
      status: 400,
    });
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-1', lineIds: Array(MAX_BOQ_BATCH_LINES + 1).fill('line-1') }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.boqLineBatchLimitExceeded,
      status: 400,
    });
    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
  });

  it('rolls back to a stable generic response and logs a failed atomic refinement', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-3', revisionNumber: 1, updatedAt: new Date('2026-11-04T00:00:00.000Z'), boq: { projectId: 'project-3', boqCode: 'BOQ-3' }, lines: [{ id: 'line-1', lineNumber: '1', originalDescription: 'tile' }] });
    writeBatch.mockRejectedValueOnce(new Error('D1 batch unavailable'));

    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-3' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.aiRefinementFailed,
      status: 500,
    });
    expect(writeLog).toHaveBeenCalledWith('error', 'boq.refinement_failed', expect.objectContaining({
      operation: 'refine_boq_lines',
      route: '/api/boq/refine-ai',
      tenantId: 'tenant-1',
      userId: 'user-1',
      boqRevisionId: 'revision-3',
      error: { name: 'Error', message: 'D1 batch unavailable' },
    }));
  });

  it('bounds loaded lines, handles blank descriptions, and tolerates diagnostic storage failure', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-large', revisionNumber: 1, updatedAt: new Date(), boq: { projectId: 'project-1', boqCode: 'BOQ-1' },
      lines: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, (_, index) => ({
        id: `line-${index}`, lineNumber: String(index + 1), originalDescription: 'Cable',
      })),
    });
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-large' }))).resolves.toMatchObject({
      ok: false, status: 400,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce({
      id: 'revision-blank', revisionNumber: 1, updatedAt: new Date(), boq: { projectId: 'project-1', boqCode: 'BOQ-1' },
      lines: [{ id: 'line-blank', lineNumber: '1', originalDescription: '', standardDescription: null }],
    });
    writeBatch.mockResolvedValueOnce([
      { meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } },
    ]);
    writeLog.mockRejectedValueOnce(new Error('local log storage unavailable'));
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-blank' }))).resolves.toMatchObject({
      ok: false, status: 500,
    });
    expect(writeLog).toHaveBeenLastCalledWith('error', 'boq.refinement_failed', expect.objectContaining({ boqRevisionId: 'revision-blank' }));
  });
});
