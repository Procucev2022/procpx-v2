import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { standardiseDescription, standardiseUom } from '../src/lib/uom-standardise';
import { validateBoqLine, computeQualityScore, summarizeIssues } from '../src/lib/boq-validate';
import { createAuditLog } from '../src/lib/audit';
import { POST as standardiseRevision } from '../src/app/api/boq/[revisionId]/standardise/route';
import { GET as getValidation, POST as validateRevision } from '../src/app/api/boq/[revisionId]/validate/route';
import { POST as refineRevision } from '../src/app/api/boq/refine-ai/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const standardiseDesc = standardiseDescription as jest.Mock;
const standardiseUnit = standardiseUom as jest.Mock;
const validateLine = validateBoqLine as jest.Mock;
const qualityScore = computeQualityScore as jest.Mock;
const summarize = summarizeIssues as jest.Mock;
const audit = createAuditLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'CLIENT_ADMIN' };
const request = (url = 'http://localhost/api/test', body: unknown = {}) => new NextRequest(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const params = { params: Promise.resolve({ revisionId: 'revision-1' }) };

describe('BOQ revision standardisation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
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
    const lines = [
      { id: 'line-1', originalDescription: 'tile', standardDescription: 'Old tile', uomRaw: 'SQFT', uomId: null, categoryId: null, subcategoryId: null, quantity: 4, lineNumber: '1' },
      { id: 'line-2', originalDescription: 'miscellaneous', standardDescription: 'Already standard', uomRaw: '', uomId: 'uom-old', categoryId: 'cat-old', subcategoryId: 'sub-old', quantity: 1, lineNumber: '2' },
      { id: 'line-3', originalDescription: 'unknown item', standardDescription: null, uomRaw: 'UNKNOWN', uomId: null, categoryId: null, subcategoryId: null, quantity: null, lineNumber: '3' },
    ];
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', status: 'DRAFT', revisionCode: 'R0', boq: { projectId: 'project-1' }, lines });
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-sqft', code: 'SQFT' }]);
    db.category.findMany.mockResolvedValueOnce([{ id: 'cat-floor', name: 'Civil & Interior', children: [{ id: 'sub-floor', name: 'Flooring' }] }]);
    standardiseDesc.mockImplementation((description: string) => description === 'tile'
      ? { matched: true, standardDescription: 'Commercial tile', category: 'Civil & Interior', subcategory: 'Flooring' }
      : { matched: false });
    standardiseUnit.mockImplementation((uom: string) => ({ code: uom === 'SQFT' ? 'SQFT' : 'NOS' }));
    validateLine.mockReturnValue({ status: 'VALID', messages: [] });
    qualityScore.mockReturnValueOnce(75);
    db.boqLine.update.mockResolvedValue({ id: 'line-updated' });
    db.boqLine.findMany.mockResolvedValueOnce([
      { originalDescription: 'tile', standardDescription: 'Commercial tile', uomRaw: 'SQFT', uomId: 'uom-sqft', quantity: 4, categoryId: 'cat-floor', validationStatus: 'VALID' },
      { originalDescription: 'bad', standardDescription: null, uomRaw: 'UNKNOWN', uomId: null, quantity: null, categoryId: null, validationStatus: 'ERROR' },
      { originalDescription: 'warn', standardDescription: 'Warn', uomRaw: 'NOS', uomId: 'uom-nos', quantity: 1, categoryId: 'cat', validationStatus: 'WARNING' },
    ]);
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-1' });

    await expect(standardiseRevision(request(), params)).resolves.toMatchObject({ ok: true, data: {
      standardisedCount: 1, uomNormalisedCount: 1, totalLines: 3, validLines: 1, errorLines: 1, warningLines: 1, qualityScore: 75,
    } });
    expect(db.boqLine.update).toHaveBeenCalledTimes(2);
    expect(db.boqLine.update).toHaveBeenNthCalledWith(1, { where: { id: 'line-1' }, data: expect.objectContaining({
      standardDescription: 'Commercial tile', uomId: 'uom-sqft', categoryId: 'cat-floor', subcategoryId: 'sub-floor', validationStatus: UI_STRINGS.appAppBoqStudioPage.vALID,
    }) });
    expect(db.boqLine.update).toHaveBeenNthCalledWith(2, { where: { id: 'line-3' }, data: expect.objectContaining({
      standardDescription: 'unknown item', uomId: null, categoryId: null, subcategoryId: null,
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { validLines: 1, errorLines: 1, warningLines: 1, qualityScore: 75 } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: UI_STRINGS.appAppAuditPage.sTANDARDISE, entityId: 'revision-1', projectId: 'project-1', newValue: { standardisedCount: 1, uomNormalisedCount: 1, qualityScore: 75 } }));
  });
});

describe('BOQ validation route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('validates duplicate line numbers and invalid UOMs, updates the issue summary, and audits', async () => {
    const lines = [
      { id: 'line-1', lineNumber: '1', originalDescription: 'Cable', uomId: 'missing-uom', quantity: 2 },
      { id: 'line-2', lineNumber: '1', originalDescription: 'Cable 2', uomId: 'known-uom', quantity: 3 },
      { id: 'line-3', lineNumber: '', originalDescription: 'Other', uomId: null, quantity: 1 },
    ];
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-1', revisionCode: 'R1', boq: { projectId: 'project-1' }, lines });
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'known-uom', code: 'EA' }]);
    validateLine.mockReturnValueOnce({ status: 'ERROR', messages: ['duplicate and invalid'] }).mockReturnValueOnce({ status: 'WARNING', messages: ['duplicate'] }).mockReturnValueOnce({ status: 'VALID', messages: [] });
    db.boqLine.update.mockResolvedValue({});
    db.boqLine.findMany.mockResolvedValueOnce([
      { ...lines[0], validationStatus: 'ERROR' }, { ...lines[1], validationStatus: 'WARNING' }, { ...lines[2], validationStatus: 'VALID' },
    ]);
    const issues = { qualityScore: 67, errors: 1, warnings: 1 };
    summarize.mockReturnValueOnce(issues);
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-1' });
    await expect(validateRevision(request(), params)).resolves.toEqual({ ok: true, data: { qualityScore: 67, totalLines: 3, validLines: 1, errorLines: 1, warningLines: 1, issues }, status: 200 });
    expect(validateLine).toHaveBeenNthCalledWith(1, expect.objectContaining({ lineNumber: UI_STRINGS.common.copyefwnq4, isDuplicate: true, isInvalidUom: true }));
    expect(validateLine).toHaveBeenNthCalledWith(2, expect.objectContaining({ lineNumber: UI_STRINGS.common.copyefwnq4, isDuplicate: true, isInvalidUom: false }));
    expect(validateLine).toHaveBeenNthCalledWith(3, expect.objectContaining({ lineNumber: '', isDuplicate: false, isInvalidUom: false }));
    expect(summarize).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ lineNumber: UI_STRINGS.common.copyefwnq4, isDuplicate: true, isInvalidUom: true })]));
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { totalLines: 3, validLines: 1, errorLines: 1, warningLines: 1, qualityScore: 67 } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: UI_STRINGS.appAppAuditPage.vALIDATE, entityId: 'revision-1', projectId: 'project-1' }));
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
});

describe('AI BOQ refinement route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
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
    const revision = { id: 'revision-1', revisionNumber: 2, boq: { projectId: 'project-1', boqCode: 'BOQ-1' }, lines };
    db.boqRevision.findFirst.mockResolvedValueOnce(revision);
    db.boqLine.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, lineNumber: where.id.replace('line-', ''), originalDescription: lines[Number(where.id.replace('line-', ''))].originalDescription, ...data }));
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-1' });
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-1', lineIds: ['line-0'], acceptConfidenceThreshold: 0.9 }))).resolves.toMatchObject({
      ok: true, data: { boqRevisionId: 'revision-1', totalRefined: 9, lines: expect.arrayContaining([
        expect.objectContaining({ id: 'line-0', accepted: true, aiConfidence: 0.94 }),
        expect.objectContaining({ id: 'line-6', accepted: false, aiConfidence: 0.89 }),
        expect.objectContaining({ id: 'line-8', accepted: false, aiConfidence: 0.85 }),
      ]) },
    });
    expect(db.boqRevision.findFirst).toHaveBeenCalledWith({ where: { id: 'revision-1', tenantId: 'tenant-1' }, include: { lines: { where: { id: { in: ['line-0'] } } }, boq: true } });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { preparationStatus: 'AI_REVIEW' } });
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'AI_REFINEMENT_REQUESTED', entityId: 'revision-1', projectId: 'project-1' }) }));
    expect(db.boqLine.update.mock.calls[8][0].data).toEqual(expect.objectContaining({ aiSuggestedDescription: expect.stringContaining('Market Standard'), aiConfidence: 0.85, standardDescription: null }));
  });

  it('keeps suggestions pending without an accept threshold and reports storage errors', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'revision-2', revisionNumber: 0, boq: { projectId: 'project-2', boqCode: 'BOQ-2' }, lines: [{ id: 'line-1', lineNumber: '1', originalDescription: 'tile' }] });
    db.boqLine.update.mockImplementationOnce(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, lineNumber: '1', originalDescription: 'tile', ...data }));
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-2' });
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-2', lineIds: [] }))).resolves.toMatchObject({ ok: true, data: { lines: [expect.objectContaining({ accepted: undefined, aiConfidence: 0.94 })] } });
    expect(db.boqRevision.findFirst).toHaveBeenLastCalledWith({ where: { id: 'revision-2', tenantId: 'tenant-1' }, include: { lines: true, boq: true } });
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('refinement failed'));
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-2' }))).resolves.toEqual({ ok: false, error: 'refinement failed', status: 500 });
    db.boqRevision.findFirst.mockRejectedValueOnce({});
    await expect(refineRevision(request('http://localhost/api/test', { boqRevisionId: 'revision-2' }))).resolves.toEqual({ ok: false, error: 'AI refinement failed.', status: 500 });
  });
});
