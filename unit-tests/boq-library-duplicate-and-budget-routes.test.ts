import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { POST as createFromLibrary } from '../src/app/api/boq/from-standard-library/route';
import { POST as duplicateBoq } from '../src/app/api/boq/duplicate/route';
import { POST as addBoqToBudget } from '../src/app/api/budgets/add-boq/route';
import { POST as canonicalBudgetPost } from '../src/app/api/boq/add-to-budget/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { MAX_BOQ_BATCH_LINES } from '../src/lib/d1-batch.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boq: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    boqRevision: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    boqLine: { create: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    budgetContribution: { create: jest.fn() },
    budgetTransaction: { count: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/app/api/boq/add-to-budget/route', () => ({ POST: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ ...jest.requireActual('../src/lib/d1-batch'), isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue({}) }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const d1Batch = writeD1BatchAtomically as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userEmail: 'user@example.test', role: 'CLIENT_ADMIN' };
const post = (body: unknown) => new NextRequest('http://localhost/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('BOQ generation from the standard library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    d1Batch.mockReset().mockImplementation(async (statements: Array<{ sql: string }>) => statements.map((_, index) => ({
      meta: { changes: 1 },
      ...(index === 0 ? { results: [{ id: 'boq-1', boqCode: 'BOQ-P1-009' }] } : {}),
    })));
  });

  it('checks permission, required input, project, and optional cost centre', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{}] }))).resolves.toBe(denied);
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqFromStandardLibraryRoute.projectIDAndAListOfSelectedStandardItemsAreRequired, status: 400 });
    await expect(createFromLibrary(post({ projectId: 'project-1', items: 'not-an-array' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqFromStandardLibraryRoute.projectIDAndAListOfSelectedStandardItemsAreRequired, status: 400 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(createFromLibrary(post({ projectId: 'missing', items: [{ standardDescription: 'Cable' }] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound2, status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(createFromLibrary(post({ projectId: 'project-1', costCentreId: 'bad-cc', items: [{ standardDescription: 'Cable' }] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.costCentreNotFoundForThisProject, status: 404 });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'bad-cc', projectId: 'project-1', tenantId: 'tenant-1' }, select: { id: true } });
  });

  it('creates a draft BOQ and maps standard item categories, UOMs, quantities, and costs', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-1' });
    db.category.findMany.mockResolvedValueOnce([{ id: 'cat-1', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-1', code: 'MTR' }]);
    const items = [
      { category: 'electrical', uom: 'mtr', itemCode: 'WIRE-1', standardDescription: 'Cable', detailedSpecification: 'Copper', quantity: '3.5', benchmarkRate: '10', brandMake: 'Acme' },
      { category: 'Unknown', uom: '', standardDescription: 'Other', quantity: 'invalid', benchmarkRate: 0 },
    ];
    await expect(createFromLibrary(post({ projectId: 'project-1', costCentreId: 'cc-1', items }))).resolves.toMatchObject({
      ok: true, data: { boqId: expect.any(String), revisionId: expect.any(String), boqCode: 'BOQ-P1-009', revisionCode: UI_STRINGS.common.r0, totalLines: 2, qualityScore: 100 }, status: 201,
    });
    const statements = d1Batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(6);
    expect(statements[0].sql).toContain('INSERT INTO "boqs"');
    expect(statements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'cc-1', 'user-1']));
    expect(statements[0].values).toHaveLength(statements[0].sql.split('?').length - 1);
    expect(statements[1].sql).toContain('INSERT INTO "boq_revisions"');
    expect(statements[1].values).toEqual(expect.arrayContaining(['R0', 'STANDARD_BOQ']));
    expect(statements[1].values).toHaveLength(statements[1].sql.split('?').length - 1);
    expect(statements[2].values).toEqual(expect.arrayContaining(['Cable', 'cat-1', 'uom-1', 3.5, 10, 35, 'Acme']));
    expect(statements[2].values).toHaveLength(statements[2].sql.split('?').length - 1);
    expect(statements[3].values).toEqual(expect.arrayContaining(['Other', 'NOS', null]));
    expect(statements[4].sql).toContain('SET "totalLines" = ?, "validLines" = ?');
    expect(statements[5].values).toEqual(expect.arrayContaining(['BOQ_GENERATED_FROM_STANDARD_LIBRARY']));
  });

  it('allows creation without a cost centre and reports generation failures', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.category.findMany.mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    await createFromLibrary(post({ projectId: 'project-1', items: [
      { standardDescription: 'Item' },
      { standardDescription: 'Blank quantities', quantity: ' ', benchmarkRate: null },
    ] }));
    expect(d1Batch.mock.calls[0][0][0].values).toContain(null);

    db.project.findFirst.mockRejectedValueOnce(new Error('BOQ setup failed'));
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{ standardDescription: 'Item' }] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.standardBoqGenerationFailed, status: 500 });
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{ standardDescription: 'Item' }] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.standardBoqGenerationFailed, status: 500 });
  });

  it('rejects malformed input and oversized item lists and detects partial D1 writes', async () => {
    const malformed = new NextRequest('http://localhost/api/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
    });
    await expect(createFromLibrary(malformed)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createFromLibrary(post({ items: [{ standardDescription: 'Missing project' }] }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [null] }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createFromLibrary(post({ projectId: 'project-1', items: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, () => ({ standardDescription: 'Valid line' })) }))).resolves.toMatchObject({ ok: false, status: 400 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.category.findMany.mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    d1Batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{ standardDescription: 'Item' }] }))).resolves.toMatchObject({ ok: false, status: 409 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.category.findMany.mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    d1Batch.mockResolvedValueOnce([
      { meta: { changes: 1 }, results: [{ boqCode: 'BOQ-1' }] },
      { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } },
    ]);
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{ standardDescription: 'Item' }] }))).resolves.toMatchObject({ ok: false, status: 409 });
  });
});

describe('BOQ duplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    d1Batch.mockReset().mockImplementation(async (statements: Array<{ sql: string }>) => statements.map((_, index) => ({
      meta: { changes: 1 },
      ...(index === 0 ? { results: [{ id: 'boq-2', boqCode: 'BOQ-P-1-003' }] } : {}),
    })));
  });

  it('validates access and source BOQ before cloning', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toBe(denied);
    await expect(duplicateBoq(post({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqDuplicateRoute.boqIdIsRequired, status: 400 });
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(duplicateBoq(post({ boqId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqDuplicateRoute.sourceBOQNotFound, status: 404 });
  });

  it('duplicates a BOQ, its latest revision and lines, with a fresh draft identity', async () => {
    const line = {
      lineNumber: '1', itemCode: 'ITEM-1', originalDescription: 'Original', standardDescription: 'Standard', specification: 'Spec',
      categoryId: 'cat-1', subcategoryId: 'sub-1', uomId: 'uom-1', uomRaw: 'NOS', quantity: 3, location: 'East', drawingReference: 'D1',
      brand: 'Acme', model: 'M1', material: 'Steel', grade: 'A', aiSuggestedDescription: 'AI', aiSuggestedSpec: 'AI spec', aiConfidence: 0.9,
      aiUnitCost: 100, aiTotalCost: 300, costConfidence: 0.8, costSource: 'Catalogue', costMethod: 'Benchmark', remarks: 'Keep',
    };
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-1', boqCode: 'SOURCE', projectId: 'project-1', costCentreId: 'cc-1', title: null, category: 'Electrical', scope: 'Wiring', purpose: 'PR',
      project: { projectCode: 'P-1' }, revisions: [{ sourceType: null, notes: null, validLines: 1, lines: [line] }],
    });
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toMatchObject({
      ok: true, data: { success: true, boq: { id: expect.any(String), boqCode: 'BOQ-P-1-003', title: 'SOURCE (Copy)' },
        boqId: expect.any(String), boqCode: 'BOQ-P-1-003', message: 'BOQ successfully duplicated as BOQ-P-1-003' }, status: 201,
    });
    expect(db.boq.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        revisions: expect.objectContaining({
          take: 1,
          include: { lines: { orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }], take: MAX_BOQ_BATCH_LINES + 1 } },
        }),
      }),
    }));
    const statements = d1Batch.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(5);
    expect(statements[0].sql).toContain("'BOQ-' || project.\"projectCode\"");
    expect(statements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'cc-1', 'SOURCE (Copy)', 'user@example.test']));
    expect(statements[1].values).toEqual(expect.arrayContaining(['R0', 'NOT_ADDED_TO_BUDGET', 'PR_DRAFT', 'MANUAL']));
    expect(statements[2].values).toEqual(expect.arrayContaining(['Original', 'Standard', 'Spec', 'ITEM-1', 'AI spec', 300, 'Keep']));
    expect(statements[2].values).toHaveLength(statements[2].sql.split('?').length - 1);
    // Line counts update only when every copied line exists (safe for bulk copies of large BOQs).
    expect(statements[3].values).toEqual([1, 1, expect.any(Date), expect.any(String), 'tenant-1', expect.any(String), 'tenant-1', 1]);
    expect(statements[4].sql).toContain('replace(replace(replace');
    expect(statements[4].values).toEqual(expect.arrayContaining(['BOQ_DUPLICATED', UI_STRINGS.appApiBoqDuplicateRoute.duplicatedBOQBoqCodeIntoBoqCode2Title]));
  });

  it('creates a blank copy when the source has no revisions and rolls back if its audit cannot be written', async () => {
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1', boqCode: 'SOURCE', projectId: 'project-1', costCentreId: null, title: 'Title', purpose: 'BUDGET', project: { projectCode: 'P-1' }, revisions: [] });
    d1Batch.mockRejectedValueOnce(new Error('D1 batch unavailable'));
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToDuplicateBoq, status: 500 });
    db.boq.findFirst.mockRejectedValueOnce(new Error('duplicate failed'));
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToDuplicateBoq, status: 500 });
    db.boq.findFirst.mockRejectedValueOnce({});
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToDuplicateBoq, status: 500 });
  });

  it('rejects malformed and oversized source records and detects each D1 clone conflict', async () => {
    const malformed = new NextRequest('http://localhost/api/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
    });
    await expect(duplicateBoq(malformed)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(duplicateBoq(post([]))).resolves.toMatchObject({ ok: false, status: 400 });
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-large', projectId: 'project-1', boqCode: 'LARGE', project: { projectCode: 'P-1' },
      revisions: [{ lines: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, () => ({})) }],
    });
    await expect(duplicateBoq(post({ boqId: 'boq-large' }))).resolves.toMatchObject({ ok: false, status: 400 });

    const source = {
      id: 'boq-1', boqCode: 'SOURCE', projectId: 'project-1', costCentreId: null, title: null,
      purpose: 'OTHER', project: { projectCode: 'P-1' },
      revisions: [{ validLines: null, lines: [{ id: 'line-1', lineNumber: '1', originalDescription: 'Cable' }] }],
    };
    auth.mockResolvedValueOnce({ ...context, userEmail: '' });
    db.boq.findFirst.mockResolvedValueOnce(source);
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(d1Batch.mock.calls[0][0][0].values).toContain('user-1');

    const conflicts = [
      [{ meta: { changes: 0 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }],
      [{ meta: { changes: 1 }, results: [{ boqCode: '' }] }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }],
      [{ meta: { changes: 1 }, results: [{ boqCode: 'COPY-1' }] }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 1 } }],
      [{ meta: { changes: 1 }, results: [{ boqCode: 'COPY-1' }] }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }],
    ];
    for (const result of conflicts) {
      db.boq.findFirst.mockResolvedValueOnce(source);
      d1Batch.mockResolvedValueOnce(result);
      await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toMatchObject({ ok: false, status: 409 });
    }
  });
});

describe('add BOQ to budget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('validates permission, revision, and target cost centre', async () => {
    const request = post({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' });
    const response = { ok: true, data: { contributionId: 'contribution-1' }, status: 201 };
    (canonicalBudgetPost as jest.Mock).mockResolvedValueOnce(response);
    await expect(addBoqToBudget(request)).resolves.toBe(response);
    expect(canonicalBudgetPost).toHaveBeenCalledWith(request);
  });
});
