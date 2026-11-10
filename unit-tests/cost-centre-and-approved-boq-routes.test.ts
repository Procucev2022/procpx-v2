import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { POST as createCostCentre, GET as listCostCentres } from '../src/app/api/cost-centres/route';
import { GET as listApprovedBoqs } from '../src/app/api/procurement/approved-boqs/route';
import { encodeBoqLineCursor } from '../src/lib/boq-line-pagination';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    costCentre: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    budget: { aggregate: jest.fn(), groupBy: jest.fn() },
    project: { findFirst: jest.fn() },
    boqRevision: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    boqLine: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => {
    const result = { ok: true, data, status };
    Object.defineProperty(result, 'headers', { value: new Headers(), enumerable: false });
    return result;
  }),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: (params: URLSearchParams) => {
    const rawPage = Number(params.get('page'));
    const rawSize = Number(params.get('pageSize'));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
}));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const rawQuery = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const ctx = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Admin', role: 'CLIENT_ADMIN' };
const request = (url = 'http://localhost/api/test', body?: unknown) => new NextRequest(url, {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe('cost centre and approved BOQ APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(ctx);
    isContext.mockReturnValue(true);
    db.boqRevision.count.mockResolvedValue(2);
    db.boqRevision.findFirst.mockResolvedValue({ id: 'rev-1' });
    db.boqLine.findMany.mockResolvedValue([]);
    rawQuery.mockResolvedValue([]);
    db.budget.groupBy.mockResolvedValue([]);
    writeBatch.mockReset().mockResolvedValue([{ meta: { changes: 1 }, results: [{ id: 'created' }] }, { meta: { changes: 1 } }]);
  });

  it('lists cost centres with optional project/search filters and budget metrics', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listCostCentres(request())).resolves.toBe(denied);

    db.costCentre.findMany.mockResolvedValueOnce([
      { id: 'cc-1', areaSqFt: 10, budgets: [{ totalAmount: 100, approvedAmount: 50, pendingAmount: 25 }, { totalAmount: null, approvedAmount: null, pendingAmount: 0 }] },
      { id: 'cc-2', areaSqFt: 0, budgets: [] },
    ]);
    db.budget.groupBy.mockResolvedValueOnce([
      { costCentreId: 'cc-1', _sum: { totalAmount: 100, approvedAmount: 50, pendingAmount: 25 } },
    ]);
    await expect(listCostCentres(request('http://localhost/api/cost-centres?projectId=project-1&search=East'))).resolves.toEqual({
      ok: true,
      data: [
        expect.objectContaining({ id: 'cc-1', totalBudget: 100, approvedBudget: 50, pendingBudget: 25, ratePerSqFt: 5 }),
        expect.objectContaining({ id: 'cc-2', totalBudget: 0, approvedBudget: 0, pendingBudget: 0, ratePerSqFt: null }),
      ],
      status: 200,
    });
    expect(db.costCentre.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1', projectId: 'project-1',
        OR: [
          { code: { contains: 'East' } }, { name: { contains: 'East' } },
          { location: { contains: 'East' } }, { floorZone: { contains: 'East' } },
        ],
      }),
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: 101,
    }));

    db.costCentre.findMany.mockResolvedValueOnce([]);
    await listCostCentres(request());
    expect(db.costCentre.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });

  it('bounds cost-centre lookup reads, groups budgets only for returned rows, and signals truncation', async () => {
    db.costCentre.findMany.mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => ({
      id: `cc-${index + 1}`, code: `CC-${index + 1}`, areaSqFt: 10, projectId: 'project-1',
    })));
    const response = await listCostCentres(request('http://localhost/api/cost-centres?projectId=project-1'));
    expect(response).toMatchObject({ ok: true, data: expect.any(Array) });
    expect((response as unknown as { data: unknown[] }).data).toHaveLength(100);
    expect((response as unknown as { headers: Headers }).headers.get('x-cost-centre-has-more')).toBe('true');
    expect(db.costCentre.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 101 }));
    expect(db.budget.groupBy).toHaveBeenCalledTimes(2);
    expect(db.budget.groupBy.mock.calls.map(([query]) => query.where.costCentreId.in.length)).toEqual([90, 10]);
    expect(db.budget.groupBy.mock.calls[0][0].where.costCentreId.in).toEqual(
      Array.from({ length: 90 }, (_, index) => `cc-${index + 1}`),
    );
    expect(db.budget.groupBy.mock.calls[1][0].where.costCentreId.in).toEqual(['cc-91', 'cc-92', 'cc-93', 'cc-94', 'cc-95', 'cc-96', 'cc-97', 'cc-98', 'cc-99', 'cc-100']);
    expect(structuredLog).toHaveBeenCalledWith('warn', 'cost_centre.lookup_truncated', expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', limit: 100,
    }));
  });

  it('pages cost centres and calculates budget summaries with bounded D1 aggregates', async () => {
    db.costCentre.findMany.mockResolvedValueOnce([
      { id: 'cc-1', areaSqFt: 10, code: 'CC-1', projectId: 'project-1', budgets: undefined },
      { id: 'cc-2', areaSqFt: 20, code: 'CC-2', projectId: 'project-1', budgets: undefined },
      { id: 'cc-extra', areaSqFt: 30, code: 'CC-3', projectId: 'project-1', budgets: undefined },
    ]);
    db.costCentre.count.mockResolvedValueOnce(7);
    db.costCentre.aggregate.mockResolvedValueOnce({ _sum: { areaSqFt: 210 } });
    db.budget.aggregate.mockResolvedValueOnce({ _sum: { totalAmount: 900, approvedAmount: 600, pendingAmount: 100 } });
    db.budget.groupBy.mockResolvedValueOnce([
      { costCentreId: 'cc-1', _sum: { totalAmount: 500, approvedAmount: 300, pendingAmount: 50 } },
      { costCentreId: 'cc-2', _sum: { totalAmount: 400, approvedAmount: 300, pendingAmount: 50 } },
    ]);

    await expect(listCostCentres(request('http://localhost/api/cost-centres?projectId=project-1&search=East&page=2&pageSize=2'))).resolves.toMatchObject({
      ok: true,
      data: {
        costCentres: [
          expect.objectContaining({ id: 'cc-1', totalBudget: 500, approvedBudget: 300, pendingBudget: 50, ratePerSqFt: 30 }),
          expect.objectContaining({ id: 'cc-2', totalBudget: 400, approvedBudget: 300, pendingBudget: 50, ratePerSqFt: 15 }),
        ],
        pagination: { page: 2, pageSize: 2, total: 7, hasMore: true },
        summary: { totalAreaSqFt: 210, totalBudget: 900, approvedBudget: 600, pendingBudget: 100 },
      },
    });
    const pagedQuery = db.costCentre.findMany.mock.calls.at(-1)?.[0];
    expect(pagedQuery).toMatchObject({
      skip: 2,
      take: 3,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: expect.objectContaining({ project: { select: { id: true, projectCode: true, name: true } } }),
    });
    expect(pagedQuery.select).not.toHaveProperty('budgets');
    expect(db.costCentre.count).toHaveBeenCalledWith({ where: expect.objectContaining({ tenantId: 'tenant-1', projectId: 'project-1' }) });
    expect(db.budget.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['costCentreId'],
      where: { tenantId: 'tenant-1', costCentreId: { in: ['cc-1', 'cc-2'] } },
    }));
  });

  it('chunks paged cost-centre budget aggregation at the safe D1 filter size', async () => {
    db.costCentre.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({
      id: `page-cc-${index + 1}`, areaSqFt: 10, projectId: 'project-1',
    })));
    db.costCentre.count.mockResolvedValueOnce(100);
    db.costCentre.aggregate.mockResolvedValueOnce({ _sum: { areaSqFt: 1000 } });
    db.budget.aggregate.mockResolvedValueOnce({ _sum: { totalAmount: 0, approvedAmount: 0, pendingAmount: 0 } });

    await listCostCentres(request('http://localhost/api/cost-centres?page=1&pageSize=100'));

    expect(db.budget.groupBy).toHaveBeenCalledTimes(2);
    expect(db.budget.groupBy.mock.calls.map(([query]) => query.where.costCentreId.in.length)).toEqual([90, 10]);
  });

  it('handles empty paged summaries, non-Error reads, and atomic creation conflicts', async () => {
    db.costCentre.findMany.mockResolvedValueOnce([]);
    db.costCentre.count.mockResolvedValueOnce(0);
    db.costCentre.aggregate.mockResolvedValueOnce({ _sum: { areaSqFt: null } });
    db.budget.aggregate.mockResolvedValueOnce({ _sum: { totalAmount: null, approvedAmount: null, pendingAmount: null } });
    await expect(listCostCentres(request('http://localhost/api/cost-centres?page=1&pageSize=20'))).resolves.toMatchObject({
      ok: true, data: { costCentres: [], pagination: { total: 0, hasMore: false }, summary: { totalAreaSqFt: 0, totalBudget: 0, approvedBudget: 0, pendingBudget: 0 } },
    });
    expect(db.budget.groupBy).not.toHaveBeenCalled();

    db.costCentre.findMany.mockRejectedValueOnce({ database: 'offline' });
    await expect(listCostCentres(request())).resolves.toMatchObject({ ok: false, status: 500 });
    db.costCentre.findMany.mockRejectedValueOnce(new Error('cost centre read failed'));
    await expect(listCostCentres(request('http://localhost/api/cost-centres?costCentreId=cc-1'))).resolves.toMatchObject({ ok: false, status: 500 });
    expect(structuredLog).toHaveBeenLastCalledWith('error', 'cost_centre.list_read_failed', expect.objectContaining({
      projectId: null, error: { name: 'Error', message: 'cost centre read failed' },
    }));

    await expect(createCostCentre(request('http://localhost/api/cost-centres', []))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    await expect(createCostCentre(request('http://localhost/api/cost-centres', {
      projectId: 'project-1', code: 'CC-BAD', name: 'Invalid area', areaSqFt: -1,
    }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce(null);
    writeBatch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', {
      projectId: 'project-1', code: 'CC-RACE', name: 'Race',
    }))).resolves.toMatchObject({ ok: false, status: 409 });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce(null);
    writeBatch.mockRejectedValueOnce(new Error('Unique constraint failed for project cost-centre code'));
    await expect(createCostCentre(request('http://localhost/api/cost-centres', {
      projectId: 'project-1', code: 'CC-DUP', name: 'Duplicate',
    }))).resolves.toMatchObject({ ok: false, status: 409 });
  });

  it('validates cost centre creation, checks tenant project and duplicate codes, and records the new centre', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', {}))).resolves.toBe(denied);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: '', code: 'CC', name: 'Office' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiCostCentresRoute.projectIDCostCentreCodeAndNameAreMandatory, status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'missing', code: 'CC', name: 'Office' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiCostCentresRoute.projectNotFoundOrInaccessible, status: 404,
    });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce({ id: 'duplicate' });
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'project-1', code: ' CC-1 ', name: 'Office' }))).resolves.toEqual({
      ok: false, error: 'Cost Centre Code CC-1 already exists for this project.', status: 409,
    });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce(null);
    const createdResult = await createCostCentre(request('http://localhost/api/cost-centres', {
      projectId: 'project-1', code: ' CC-2 ', name: ' East Wing ', description: ' Office ', areaSqFt: '125.5', location: ' Pune ', floorZone: ' L2 ',
    }));
    expect(createdResult).toMatchObject({ ok: true, data: {
      tenantId: 'tenant-1', projectId: 'project-1', code: 'CC-2', name: 'East Wing', description: 'Office', areaSqFt: 125.5,
      location: 'Pune', floorZone: 'L2', status: 'ACTIVE', createdBy: 'user-1',
    }, status: 201 });
    const [insertStatement, auditStatement] = writeBatch.mock.calls.at(-1)![0];
    expect(insertStatement.sql).toContain('INSERT INTO "cost_centres"');
    expect(insertStatement.values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'CC-2', 'East Wing', 125.5]));
    expect(auditStatement.sql).toContain('INSERT INTO "audit_logs"');
    const createdId = (createdResult as unknown as { data: { id: string } }).data.id;
    expect(auditStatement.values).toEqual(expect.arrayContaining(['COST_CENTRE', createdId, 'COST_CENTRE_CREATED']));
    expect(db.costCentre.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce(null);
    await createCostCentre(request('http://localhost/api/cost-centres', {
      projectId: 'project-1', code: 'CC-3', name: 'Misc', description: '', areaSqFt: 0, location: '', floorZone: '',
    }));
    const zeroAreaStatement = writeBatch.mock.calls.at(-1)![0][0];
    expect(zeroAreaStatement.values).toEqual(expect.arrayContaining([null, 0, null, null]));

    db.project.findFirst.mockRejectedValueOnce(new Error('create failure'));
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'project-1', code: 'CC', name: 'New' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateCostCentre2, status: 500,
    });
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'project-1', code: 'CC', name: 'New' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateCostCentre2, status: 500,
    });
  });

  it('lists approved BOQs with project/search constraints and derives sourcing summaries from line history', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listApprovedBoqs(request())).resolves.toBe(denied);

    const sourceLine = {
      id: 'line-1', lineNumber: 0, itemCode: 'ITEM-1', standardDescription: '', originalDescription: 'Cable run', specification: '',
      quantity: 2, aiUnitCost: 50, category: { name: 'Electrical' }, uom: { code: 'M' }, uomRaw: 'metre', subcategoryId: 'sub-1',
    };
    const revisions = [
      {
        id: 'rev-1', boqId: 'boq-1', revisionCode: 'R2', approvedAt: new Date('2025-06-01'), approvedBy: { email: 'approver@example.test' },
        _count: { rfqs: 2 },
        costCentre: { code: 'CC-1', name: 'Retail' }, lines: [sourceLine, { ...sourceLine, id: 'line-2', quantity: 1, aiUnitCost: 0 }, {
          ...sourceLine, id: 'line-3', itemCode: null, category: null, uom: null, uomRaw: '', quantity: 0, aiUnitCost: null,
        }],
        rfqs: [{ id: 'rfq-empty', ppos: [] }, { id: 'rfq-linked', ppos: [{ id: 'ppo-1', status: 'ISSUED' }] }],
        boq: { boqCode: '', project: { id: 'project-1', projectCode: 'P-1', name: 'Store', city: '', state: 'MH', location: 'Pune' } },
      },
      {
        id: 'rev-2', boqId: 'boq-2', revisionCode: 'R1', approvedAt: null, approvedBy: null, costCentre: null,
        _count: { rfqs: 0 },
        lines: [], rfqs: [], boq: { boqCode: 'BOQ-2', project: { id: 'project-2', projectCode: 'P-2', name: 'Office', city: '', state: '', location: '' } },
      },
    ];
    db.boqRevision.findMany.mockResolvedValueOnce(revisions);
    rawQuery.mockResolvedValueOnce([
      { boqRevisionId: 'rev-1', categoryId: 'category-electrical', categoryName: 'Electrical', lineCount: 2, totalQty: 3, estimatedValue: 200 },
      { boqRevisionId: 'rev-1', categoryId: null, categoryName: null, lineCount: 1, totalQty: 0, estimatedValue: 0 },
    ]);
    await expect(listApprovedBoqs(request('http://localhost/api/procurement/approved-boqs?projectId=project-1&search=Store'))).resolves.toMatchObject({
      ok: true,
      data: { total: 2, approvedBoqs: [
        expect.objectContaining({
          id: 'rev-1', boqCode: 'BOQ-P-1', costCentre: 'CC-1 - Retail', projectName: 'Store', location: 'MH', approvedBy: 'approver@example.test',
          totalLines: 3, estimatedBenchmarkValue: 200, rfqCount: 2,
          categories: [expect.objectContaining({ category: 'Electrical', lineCount: 2, totalQty: 3, estimatedValue: 200 }), expect.objectContaining({ category: 'General', lineCount: 1 })],
        }),
        expect.objectContaining({ id: 'rev-2', costCentre: undefined, location: '—', approvedBy: 'Project Approver', categories: [], totalLines: 0 }),
      ] },
    });
    expect(db.boqRevision.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', AND: [
        { OR: [
          { status: UI_STRINGS.common.aPPROVED }, { prStatus: 'PR_RELEASED_TO_PROCUREMENT' }, { prStatus: 'PR_APPROVED' },
          { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
        ] },
        { boq: { projectId: 'project-1' } },
        { OR: [
          { revisionCode: { contains: 'Store' } }, { boq: { boqCode: { contains: 'Store' } } },
          { boq: { project: { name: { contains: 'Store' } } } }, { boq: { project: { projectCode: { contains: 'Store' } } } },
        ] },
      ] },
      orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 50,
    }));
    const aggregateQuery = rawQuery.mock.calls.at(-1)?.[0] as { sql: string; values: unknown[] };
    expect(aggregateQuery.sql).toContain('GROUP BY line."boqRevisionId", line."categoryId", category."name"');
    expect(aggregateQuery.sql).not.toContain('GROUP BY line."boqRevisionId", line."categoryId", line."aiUnitCost"');
    expect(aggregateQuery.sql).toContain('SUM(COALESCE(line."quantity", 0) * CASE WHEN line."aiUnitCost" > 0');
    expect(aggregateQuery.sql).toContain('LEFT JOIN "categories"');
    expect(aggregateQuery.values.filter((value) => value === 'tenant-1')).toHaveLength(2);
    expect(aggregateQuery.values).toEqual(expect.arrayContaining(['tenant-1', 'rev-1', 'rev-2']));

    db.boqRevision.findMany.mockResolvedValueOnce([{
      ...revisions[0],
      _count: { rfqs: 2 },
    }]);
    db.boqRevision.count.mockResolvedValueOnce(1);
    rawQuery.mockResolvedValueOnce([
      { boqRevisionId: 'rev-1', categoryId: 'category-electrical', categoryName: 'Electrical', lineCount: 2, totalQty: 3, estimatedValue: 200 },
      { boqRevisionId: 'rev-1', categoryId: null, categoryName: null, lineCount: 1, totalQty: 0, estimatedValue: 0 },
    ]);
    db.boqLine.findMany.mockResolvedValueOnce(revisions[0].lines);
    await expect(listApprovedBoqs(request('http://localhost/api/procurement/approved-boqs?revisionId=rev-1&pageSize=1'))).resolves.toMatchObject({
      ok: true,
      data: {
        approvedBoqs: [expect.objectContaining({
          id: 'rev-1',
          lines: expect.arrayContaining([
            expect.objectContaining({ lineNumber: 'ITEM-1', description: 'Cable run', specification: 'Standard commercial grade', benchmarkRate: 50 }),
            expect.objectContaining({ lineNumber: 'L-1', category: 'General', uom: 'NOS', benchmarkRate: 100 }),
          ]),
          totalLines: 3,
          linePagination: { total: 3, pageSize: 90, hasMore: false, nextCursor: null },
        })],
      },
    });
    expect(rawQuery).toHaveBeenCalledTimes(2);
    expect(db.boqLine.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', boqRevisionId: 'rev-1', isDeleted: false },
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
      take: 91,
      select: expect.objectContaining({
        id: true, lineNumber: true, standardDescription: true, originalDescription: true, quantity: true, aiUnitCost: true,
      }),
    }));

    db.boqRevision.findMany.mockRejectedValueOnce(new Error('boq database error'));
    await expect(listApprovedBoqs(request())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs, status: 500 });
    db.boqRevision.findMany.mockRejectedValueOnce({});
    await expect(listApprovedBoqs(request())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs, status: 500 });
  });

  it('pages approved BOQ detail lines with a bounded selected-field D1 read', async () => {
    type PagedDetailResponse = {
      data: {
        approvedBoqs: Array<{
          totalLines: number;
          estimatedBenchmarkValue: number;
          lines: Array<{ id: string }>;
          linePagination: { total: number; pageSize: number; hasMore: boolean; nextCursor: string | null };
        }>;
      };
    };
    const linePage = [
      { id: 'line-1', lineNumber: '1', itemCode: null, standardDescription: 'Cable', originalDescription: null, specification: null, categoryId: null, subcategoryId: null, uomRaw: null, quantity: 2, aiUnitCost: 10, category: null, uom: null },
      { id: 'line-2', lineNumber: '2', itemCode: null, standardDescription: 'Tray', originalDescription: null, specification: null, categoryId: null, subcategoryId: null, uomRaw: null, quantity: 1, aiUnitCost: 20, category: null, uom: null },
      { id: 'line-3', lineNumber: '3', itemCode: null, standardDescription: 'Pump', originalDescription: null, specification: null, categoryId: null, subcategoryId: null, uomRaw: null, quantity: 1, aiUnitCost: 30, category: null, uom: null },
    ];
    db.boqRevision.findMany.mockResolvedValueOnce([{
      id: 'rev-1', boqId: 'boq-1', revisionCode: 'R1', approvedAt: null, approvedBy: null,
      _count: { rfqs: 0 }, costCentre: null,
      boq: { boqCode: 'BOQ-1', project: { id: 'project-1', projectCode: 'P-1', name: 'Project', city: '', state: '', location: '' } },
    }]);
    db.boqRevision.count.mockResolvedValueOnce(1);
    rawQuery.mockResolvedValueOnce([
      { boqRevisionId: 'rev-1', categoryId: null, categoryName: null, lineCount: 3, totalQty: 4, estimatedValue: 80 },
    ]);
    db.boqLine.findMany.mockResolvedValueOnce(linePage);

    const response = await listApprovedBoqs(request('http://localhost/api/procurement/approved-boqs?revisionId=rev-1&linePageSize=2')) as unknown as PagedDetailResponse;
    const firstPage = response.data.approvedBoqs[0];
    expect(firstPage).toMatchObject({
      totalLines: 3,
      estimatedBenchmarkValue: 80,
      linePagination: { total: 3, pageSize: 2, hasMore: true },
    });
    expect(firstPage.lines.map((line) => line.id)).toEqual(['line-1', 'line-2']);
    const cursor = firstPage.linePagination.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    expect(db.boqLine.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 3 }));

    db.boqLine.findMany.mockResolvedValueOnce([linePage[2]]);
    if (!cursor) throw new Error('Expected approved BOQ line continuation cursor');
    const next = await listApprovedBoqs(request(`http://localhost/api/procurement/approved-boqs?revisionId=rev-1&linePageSize=2&lineCursor=${encodeURIComponent(cursor)}`)) as unknown as PagedDetailResponse;
    expect(next.data.approvedBoqs[0].lines.map((line) => line.id)).toEqual(['line-3']);
    expect(next.data.approvedBoqs[0].linePagination).toEqual({ pageSize: 2, hasMore: false, nextCursor: null });
    expect(rawQuery).toHaveBeenCalledTimes(1);
    expect(db.boqRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', AND: expect.any(Array) }),
      select: { id: true },
    }));
    expect(db.boqLine.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', boqRevisionId: 'rev-1', isDeleted: false, OR: [
        { lineNumber: { gt: '2' } }, { lineNumber: '2', id: { gt: 'line-2' } },
      ] },
      take: 3,
    }));
  });

  it('handles missing and exhausted BOQ cursors, sparse line defaults, and empty revision pages', async () => {
    const cursor = encodeBoqLineCursor({ lineNumber: '1', id: 'line-1' });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(listApprovedBoqs(request(`http://localhost/api/procurement/approved-boqs?revisionId=missing&lineCursor=${cursor}`))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs, status: 404,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'rev-1' });
    db.boqLine.findMany.mockResolvedValueOnce([]);
    await expect(listApprovedBoqs(request(`http://localhost/api/procurement/approved-boqs?revisionId=rev-1&linePageSize=1&lineCursor=${cursor}`))).resolves.toMatchObject({
      ok: true,
      data: { approvedBoqs: [{ lines: [], linePagination: { pageSize: 1, hasMore: false, nextCursor: null } }] },
    });

    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'rev-1' });
    db.boqLine.findMany.mockResolvedValueOnce([{
      id: 'line-fallback', lineNumber: '', itemCode: null, standardDescription: '', originalDescription: '',
      specification: '', category: null, subcategoryId: null, uom: null, uomRaw: null, quantity: null, aiUnitCost: 0,
    }]);
    await expect(listApprovedBoqs(request(`http://localhost/api/procurement/approved-boqs?revisionId=rev-1&linePageSize=1&lineCursor=${cursor}`))).resolves.toMatchObject({
      ok: true,
      data: { approvedBoqs: [{ lines: [expect.objectContaining({
        id: 'line-fallback', lineNumber: 'L-1', specification: 'Standard commercial grade',
        category: 'General', uom: 'NOS', quantity: null, benchmarkRate: 100, benchmarkAmount: 0,
      })] }] },
    });

    db.boqRevision.findMany.mockResolvedValueOnce([]);
    db.boqRevision.count.mockResolvedValueOnce(0);
    await expect(listApprovedBoqs(request())).resolves.toMatchObject({ ok: true, data: { approvedBoqs: [], total: 0 } });
    expect(rawQuery).not.toHaveBeenCalled();
  });

  it('rejects malformed or unscoped approved BOQ line cursors', async () => {
    await expect(listApprovedBoqs(request('http://localhost/api/procurement/approved-boqs?lineCursor=bad'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400,
    });
    expect(db.boqRevision.findMany).not.toHaveBeenCalled();
  });

  it('splits a full approved BOQ page so aggregate queries stay within D1 binding limits', async () => {
    const revisions = Array.from({ length: 100 }, (_, index) => ({
      id: `revision-${index + 1}`, boqId: `boq-${index + 1}`, revisionCode: 'R1', approvedAt: null, approvedBy: null,
      _count: { rfqs: 0 }, costCentre: null,
      boq: { boqCode: `BOQ-${index + 1}`, project: {
        id: `project-${index + 1}`, projectCode: `P-${index + 1}`, name: 'Project', city: '', state: '', location: '',
      } },
    }));
    db.boqRevision.findMany.mockResolvedValueOnce(revisions);
    db.boqRevision.count.mockResolvedValueOnce(100);
    rawQuery.mockResolvedValue([]);

    await expect(listApprovedBoqs(request('http://localhost/api/procurement/approved-boqs?pageSize=100'))).resolves.toMatchObject({
      ok: true, data: { approvedBoqs: expect.arrayContaining([expect.any(Object)]) },
    });
    const bindingCounts = rawQuery.mock.calls.map(([query]) => (query as { values: unknown[] }).values.length);
    expect(bindingCounts).toEqual([100, 4]);
    expect(Math.max(...bindingCounts)).toBeLessThanOrEqual(100);
  });
});
