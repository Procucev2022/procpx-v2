import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/pr/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '../src/lib/project-auth';
import { logEvent } from '../src/lib/observability/server-logger';
import { MAX_PR_BATCH_LINES } from '../src/lib/d1-batch.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    procurementRequest: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), groupBy: jest.fn(), create: jest.fn() },
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    pRLine: { create: jest.fn() },
    boq: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/d1-batch', () => ({ isD1BatchWithinLimits: (input: Array<{ values: unknown[] }>) => input.reduce((total, item) => total + item.values.length, 0) <= 4500 && input.every((item) => item.values.length <= 100), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/project-auth', () => ({
  getUserProjectAccessFilter: jest.fn(),
  isUserAuthorizedForProject: jest.fn(),
}));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: jest.fn((params: URLSearchParams) => {
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 50));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const rawQuery = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const batchWrite = writeD1BatchAtomically as jest.Mock;
const projectAccessFilter = getUserProjectAccessFilter as jest.Mock;
const projectAuthorized = isUserAuthorizedForProject as jest.Mock;
const backgroundLog = logEvent as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/pr${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/pr', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1', boqId: 'boq-1', revisionNumber: 2,
    boq: { projectId: 'project-1', boqCode: 'BOQ-000001', purpose: 'BUDGET' },
    lines: [
      {
        id: 'line-1', aiTotalCost: 30, aiUnitCost: 10, quantity: 3,
        standardDescription: 'Copper wire', originalDescription: 'Wire', specification: '2 core',
        category: { name: 'Electrical' }, subcategory: { name: 'Cable' }, uomRaw: 'MTR',
        drawingReference: 'D-1',
      },
      {
        id: 'line-2', aiTotalCost: 0, aiUnitCost: 5, quantity: 1,
        originalDescription: 'Panel', category: null, subcategory: null, uomRaw: '',
      },
    ],
    ...overrides,
  };
}

describe('PR list and create API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.procurementRequest.findMany.mockResolvedValue([]);
    db.procurementRequest.findFirst.mockResolvedValue(null);
    db.boqRevision.findFirst.mockResolvedValue(revision());
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01', name: 'North Wing' });
    db.procurementRequest.count.mockResolvedValue(4);
    db.procurementRequest.groupBy.mockResolvedValue([]);
    rawQuery.mockResolvedValue([]);
    db.procurementRequest.create.mockResolvedValue({ id: 'pr-1', prNumber: 'PR-2026-000005' });
    db.pRLine.create.mockResolvedValue({ id: 'pr-line' });
    db.boqRevision.update.mockResolvedValue({ id: 'revision-1' });
    db.boq.update.mockResolvedValue({ id: 'boq-1' });
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    projectAccessFilter.mockResolvedValue(null);
    projectAuthorized.mockResolvedValue(true);
    batchWrite.mockImplementation(async (statements: Array<{ values: unknown[] }>) => [
      { results: [{ id: statements[0].values[0], prNumber: `PR-${statements[0].values[2]}-000005` }], meta: { changes: 1 } },
      ...statements.slice(1).map(() => ({ meta: { changes: 1 } })),
    ]);
  });

  it('checks list and create permissions before queries or body parsing', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    expect(db.procurementRequest.findMany).not.toHaveBeenCalled();
    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
  });

  it('rejects malformed PR bodies, oversized line selections, and invalid required dates', async () => {
    for (const body of [
      [],
      { boqRevisionId: 'revision-1', costCentreId: 'cc-1', projectId: 12 },
      { boqRevisionId: 'revision-1', costCentreId: 'cc-1', title: 12 },
      { boqRevisionId: 'revision-1', costCentreId: 'cc-1', requiredDate: 12 },
      { boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: 'line-1' },
      { boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: [12] },
      { boqRevisionId: 'revision-1', costCentreId: 'cc-1', autoSubmit: 'yes' },
    ]) {
      await expect(POST(postRequest(body))).resolves.toEqual({
        ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
      });
    }

    await expect(POST(postRequest({
      boqRevisionId: 'revision-1', costCentreId: 'cc-1',
      selectedLineIds: Array.from({ length: MAX_PR_BATCH_LINES + 1 }, (_, index) => `line-${index}`),
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', requiredDate: 'not-a-date' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidDate, status: 400,
    });
  });

  it('applies tenant and query filters and derives unique or fallback categories', async () => {
    db.procurementRequest.findMany.mockResolvedValueOnce([
      { id: 'pr-1', _count: { lines: 3 }, boq: { category: 'Fallback' } },
      { id: 'pr-2', _count: { lines: 0 }, boq: { category: 'Civil' } },
      { id: 'pr-3', _count: { lines: 0 }, boq: { category: null } },
    ]);
    db.procurementRequest.count.mockResolvedValueOnce(25);
    db.procurementRequest.groupBy.mockResolvedValueOnce([{ status: 'PR_APPROVED', _count: { _all: 7 } }]);
    rawQuery.mockResolvedValueOnce([
      ...Array.from({ length: 8 }, (_, index) => ({ entityId: 'pr-1', category: `Category ${index + 1}`, categoryCount: 14 })),
      { entityId: 'pr-2', category: 'Civil', categoryCount: 1 },
    ]);
    const scopedProjectFilter = { OR: [{ team: { some: { userId: 'user-1', active: true } } }] };
    projectAccessFilter.mockResolvedValueOnce(scopedProjectFilter);
    await expect(GET(getRequest('?projectId=p-1&costCentreId=cc-1&status=APPROVED&search=wire&page=2&pageSize=10'))).resolves.toMatchObject({
      ok: true, data: { total: 25, page: 2, pageSize: 10, totalPages: 3, statusCounts: { PR_APPROVED: 7 }, data: [
        {
          id: 'pr-1',
          categories: ['Category 1', 'Category 2', 'Category 3', 'Category 4', 'Category 5', 'Category 6', 'Category 7', 'Category 8'],
          remainingCategoryCount: 6,
        },
        { id: 'pr-2', categories: ['Civil'] },
        { id: 'pr-3', categories: ['Standard'] },
      ] },
    });
    expect(db.procurementRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1', project: { is: scopedProjectFilter }, projectId: 'p-1', costCentreId: 'cc-1', status: UI_STRINGS.common.aPPROVED,
        OR: [
          { prNumber: { contains: 'wire' } }, { title: { contains: 'wire' } }, { requestedBy: { contains: 'wire' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    }));
    const categoryQuery = rawQuery.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(categoryQuery.sql).toContain('ROW_NUMBER() OVER (PARTITION BY "entityId"');
    expect(categoryQuery.sql).toContain('WHERE "categoryRank" <= ?');
    expect(categoryQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'pr-1', 'pr-2', 'pr-3']));
    expect(db.procurementRequest.findMany.mock.calls[0][0].include).not.toHaveProperty('lines');
    db.procurementRequest.findMany.mockResolvedValueOnce([{ id: 'pr-empty', _count: { lines: 0 } }]);
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: true, data: { data: [{ id: 'pr-empty', categories: ['Standard'] }] } });
    expect(db.procurementRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' }, skip: 0, take: 50 }));

    projectAccessFilter.mockResolvedValueOnce(scopedProjectFilter);
    db.procurementRequest.findMany.mockResolvedValueOnce([]);
    await GET(getRequest());
    expect(db.procurementRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', project: { is: scopedProjectFilter } },
    }));
  });

  it('validates mandatory revision and cost-centre references and selected lines', async () => {
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionIDAndCostCentreIDAreMandatory, status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ boqRevisionId: 'missing', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'wrong-cc' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.costCentreNotFoundForThisProject, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ lines: [] }));
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ lines: [] }));
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: ['missing-line'] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, status: 400,
    });
  });

  it('creates and auto-submits a PR from selected BOQ lines, copying traceable line details', async () => {
    const result = await POST(postRequest({
      boqRevisionId: 'revision-1', costCentreId: 'cc-1', projectId: 'project-1', title: '  Urgent cabling ',
      requiredDate: '2026-12-01', selectedLineIds: ['line-1', 'line-2'], autoSubmit: true,
    }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      prId: expect.any(String), prNumber: 'PR-2026-000005', totalEstimatedValue: 35, totalLines: 2, status: 'PR_PENDING_PROJECT_APPROVAL',
    } });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'cc-1', projectId: 'project-1', tenantId: 'tenant-1' } });
    expect(db.boqRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        lines: expect.objectContaining({
          where: { isDeleted: false, id: { in: ['line-1', 'line-2'] } },
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: MAX_PR_BATCH_LINES + 1,
        }),
      }),
    }));
    const statements = batchWrite.mock.calls[0][0];
    expect(statements).toHaveLength(6);
    expect(statements[0].sql).toContain('RETURNING "id", "prNumber"');
    expect(statements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'cc-1', 'boq-1', 'revision-1', 'Urgent cabling']));
    expect(statements[1].values).toEqual(expect.arrayContaining(['line-1', 'Copper wire', '2 core', 'Electrical', 'Cable', 'MTR', 3, 10, 30]));
    expect(statements[2].values).toEqual(expect.arrayContaining(['line-2', 'Panel', 'General', 'NOS', 1, 5, 5]));
    expect(statements[3].sql).toContain('changes() = 1');
    expect(statements[4].sql).toContain('changes() = 1');
    expect(statements[5].sql).toContain('CASE WHEN changes() = 1 THEN ? ELSE NULL END');
    expect(db.procurementRequest.create).not.toHaveBeenCalled();
    expect(db.pRLine.create).not.toHaveBeenCalled();
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.boq.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('creates a draft PR using revision defaults when optional request values are absent', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(revision({
      boq: { projectId: 'project-1', boqCode: 'BOQ-000001', purpose: 'PR' },
      lines: [{ id: 'line-3', aiTotalCost: null, aiUnitCost: null, quantity: 1, originalDescription: 'Pump' }],
    }));
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: [] }))).resolves.toMatchObject({
      ok: true, data: { totalEstimatedValue: 0, totalLines: 1, status: 'PR_DRAFT' },
    });
    expect(batchWrite).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ values: expect.arrayContaining(['project-1', 'cc-1', 'boq-1', 'revision-1', 'PR for North Wing (BOQ-000001 R2)', 'PR_DRAFT']) }),
      expect.objectContaining({ values: expect.arrayContaining(['Pump', 'General', 'NOS', 1, 0, 0]) }),
    ]));
    expect(db.boq.update).not.toHaveBeenCalled();
  });

  it('blocks cross-project BOQ overrides and lines without quantity before any D1 write', async () => {
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', projectId: 'project-other' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiBoqCreatePrRoute.projectMustMatchTheProjectLinkedToThisBOQ, status: 400,
    });
    db.boqRevision.findFirst.mockResolvedValueOnce(revision({
      lines: [{ id: 'line-unknown-quantity', quantity: null, originalDescription: 'Cable' }],
    }));
    const invalidQuantity = await POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }));
    expect(invalidQuantity).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('Quantity required for 1 item') });
    expect(batchWrite).not.toHaveBeenCalled();

    projectAuthorized.mockResolvedValueOnce(false);
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.forbiddenInsufficientPermissions, status: 403,
    });

    db.procurementRequest.findFirst.mockResolvedValueOnce({ prNumber: 'PR-EXISTING' });
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toMatchObject({
      ok: false, status: 409, error: expect.stringContaining('PR-EXISTING'),
    });
  });

  it('returns a conflict when an atomic PR insert loses the race', async () => {
    batchWrite.mockResolvedValueOnce([{ results: [], meta: { changes: 0 } }]);
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });

    batchWrite.mockResolvedValueOnce([{ results: [], meta: { changes: 0 } }]);
    db.procurementRequest.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce({ prNumber: 'PR-RACE' });
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toMatchObject({
      ok: false, status: 409, error: expect.stringContaining('PR-RACE'),
    });
  });

  it('returns clear errors for malformed requests and failed persistence', async () => {
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid PR body')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    const unknownFailure = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(unknownFailure)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    batchWrite.mockRejectedValueOnce(new Error('database write failed'));
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateProcurementRequest, status: 500,
    });
    expect(backgroundLog).toHaveBeenCalledWith('error', 'purchase_request.creation_failed', expect.objectContaining({
      operation: 'create', route: '/api/pr', tenantId: 'tenant-1',
    }), 'next');
  });
});
