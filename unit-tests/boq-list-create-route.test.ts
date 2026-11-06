import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/boq/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess, getListPageWindow } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { BOQ_CREATE_AUDIT_ACTION, BOQ_DEFAULT_PROJECT_TYPE, BOQ_DEFAULT_SECTOR, BOQ_INITIAL_REVISION_SOURCE_TYPE } from '../src/app/api/boq/route.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boq: { count: jest.fn(), findMany: jest.fn() },
    boqLine: { groupBy: jest.fn() },
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(), isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  getListPageWindow: jest.fn((searchParams: URLSearchParams) => {
    const requestedPage = Number(searchParams.get('page'));
    const requestedSize = Number(searchParams.get('pageSize'));
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(requestedSize) && requestedSize > 0 ? Math.min(requestedSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  }),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const writeBatch = writeD1BatchAtomically as jest.Mock;
const structuredLog = writeStructuredLog as jest.Mock;
const listPageWindow = getListPageWindow as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userEmail: 'buyer@example.com', role: 'PROJECT_USER' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/boq${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/boq', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const createBody = { projectId: 'project-1', costCentreId: 'cc-1', title: 'Electrical', category: 'Electrical', purpose: 'BUDGET' };
const makeSuccessfulBatch = (boqCode = 'BOQ-P1-001') => writeBatch.mockImplementation(async (statements: Array<{ sql: string }>) =>
  statements.map((_, index) => ({ success: true, meta: { changes: 1 }, results: index === 0 ? [{ boqCode }] : [] })));

describe('BOQ list and create API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    listPageWindow.mockImplementation((searchParams: URLSearchParams) => {
      const requestedPage = Number(searchParams.get('page'));
      const requestedSize = Number(searchParams.get('pageSize'));
      const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1_000_000) : 1;
      const pageSize = Number.isSafeInteger(requestedSize) && requestedSize > 0 ? Math.min(requestedSize, 100) : 50;
      return { page, pageSize, skip: (page - 1) * pageSize };
    });
    db.boq.count.mockResolvedValue(0);
    db.boq.findMany.mockResolvedValue([]);
    db.boqLine.groupBy.mockResolvedValue([]);
    db.project.findFirst.mockResolvedValue({ id: 'project-1', projectCode: 'P1', sector: 'RETAIL', projectType: 'Store', areaSqFt: 500 });
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01', areaSqFt: 100, floorZone: 'Ground' });
    writeBatch.mockResolvedValue([]);
  });

  it('authenticates BOQ list and create calls before queries', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(getRequest())).resolves.toBe(denied);
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(postRequest({}))).resolves.toBe(denied);
    expect(db.boq.count).not.toHaveBeenCalled();
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it('filters and bounds the BOQ register and aggregates only active line totals for the page', async () => {
    db.boq.count.mockResolvedValueOnce(51);
    db.boq.findMany.mockResolvedValueOnce([
      { id: 'boq-1', revisions: [{ id: 'r2', revisionCode: 'R2', revisionNumber: 2, status: 'DRAFT', sourceType: 'MANUAL', totalLines: 0, createdAt: new Date() }] },
      { id: 'boq-2', revisions: [{ id: 'r1', revisionCode: 'R1', revisionNumber: 1, status: 'APPROVED', sourceType: 'MANUAL', totalLines: 4, createdAt: new Date() }] },
      { id: 'boq-3', revisions: [] },
    ]);
    db.boqLine.groupBy.mockResolvedValueOnce([
      { boqRevisionId: 'r2', _count: { _all: 2 }, _sum: { aiTotalCost: 20 } },
      { boqRevisionId: 'r1', _count: { _all: 0 }, _sum: { aiTotalCost: null } },
    ]);
    await expect(GET(getRequest('?page=2&pageSize=10&status=DRAFT&projectId=p1&costCentreId=cc1&purpose=PR&search=cable'))).resolves.toMatchObject({
      ok: true, data: {
        total: 51, page: 2, pageSize: 10, totalPages: 6,
        data: [
          { id: 'boq-1', estimatedValue: 20, latestRevision: { id: 'r2', totalLines: 2, sourceType: 'MANUAL' } },
          { id: 'boq-2', estimatedValue: 0, latestRevision: { id: 'r1', totalLines: 0 } },
          { id: 'boq-3', estimatedValue: 0, latestRevision: null },
        ],
      },
    });
    expect(db.boq.count).toHaveBeenCalledWith({ where: {
      tenantId: 'tenant-1', status: 'DRAFT', projectId: 'p1', costCentreId: 'cc1', purpose: 'PR',
      OR: [
        { boqCode: { contains: 'cable' } }, { title: { contains: 'cable' } }, { category: { contains: 'cable' } },
        { project: { name: { contains: 'cable' } } }, { project: { projectCode: { contains: 'cable' } } },
      ],
    } });
    expect(db.boq.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: 10, take: 10,
      include: expect.objectContaining({ revisions: expect.objectContaining({ take: 1, select: expect.not.objectContaining({ lines: expect.anything() }) }) }),
    }));
    expect(db.boqLine.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', boqRevisionId: { in: ['r2', 'r1'] }, isDeleted: false },
      _count: { _all: true }, _sum: { aiTotalCost: true },
    }));
  });

  it('clamps unsafe register paging and skips line aggregation for empty pages', async () => {
    db.boq.findMany.mockResolvedValueOnce([]);
    await expect(GET(getRequest('?page=-20&pageSize=5000'))).resolves.toMatchObject({
      ok: true, data: { page: 1, pageSize: 100, totalPages: 0, data: [] },
    });
    expect(db.boq.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
    expect(db.boqLine.groupBy).not.toHaveBeenCalled();
  });

  it('validates required project, cost centre, title, category, and purpose fields', async () => {
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.projectIsRequired, status: 400 });
    await expect(POST(postRequest({ ...createBody, costCentreId: '' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.costCentreIsRequired, status: 400 });
    await expect(POST(postRequest({ ...createBody, title: '  ' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQTitleNameIsRequired, status: 400 });
    await expect(POST(postRequest({ ...createBody, category: '' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQCategoryIsRequired, status: 400 });
    await expect(POST(postRequest({ ...createBody, category: [] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQCategoryIsRequired, status: 400 });
    await expect(POST(postRequest({ ...createBody, category: ['Electrical', 12] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQCategoryIsRequired, status: 400 });
    await expect(POST(postRequest({ ...createBody, purpose: 'INVALID' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQPurposeBUDGETOrPRIsRequired, status: 400 });
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('checks project and cost-centre tenant ownership before opening a write batch', async () => {
    const body = { ...createBody, purpose: 'PR' };
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(body))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, status: 404 });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(body))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.costCentreDoesNotBelongToTheSelectedProject, status: 400 });
    expect(db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project-1', tenantId: 'tenant-1' } }));
    expect(db.costCentre.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cc-1', projectId: 'project-1', tenantId: 'tenant-1' } }));
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('creates a BUDGET BOQ, revision, and audit record in one batch with inherited project defaults', async () => {
    makeSuccessfulBatch();
    await expect(POST(postRequest({
      ...createBody, title: '  Store Electrical ', category: ['Power', 'Lighting'], scope: '  L1 areas  ',
    }))).resolves.toMatchObject({ ok: true, status: 201, data: {
      success: true, boqId: expect.any(String), revisionId: expect.any(String), boqCode: 'BOQ-P1-001',
      boq: { project: { id: 'project-1' }, costCentre: { id: 'cc-1' }, revisions: [{ revisionCode: 'R0' }] },
    } });
    const statements = writeBatch.mock.calls[0][0];
    expect(statements).toHaveLength(3);
    expect(statements.every((statement: { sql: string; values: unknown[] }) => (statement.sql.match(/\?/g) || []).length === statement.values.length)).toBe(true);
    expect(statements[0].sql).toContain("'BOQ-' || project.\"projectCode\"");
    expect(statements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'project-1', 'cc-1', 'Store Electrical', 'L1 areas', 'Power, Lighting', 'BUDGET']));
    expect(statements[1].values[8]).toBe('BUDGET_DRAFT');
    expect(statements[1].values[9]).toBe('PR_NOT_CREATED');
    expect(JSON.parse(statements[1].values[17] as string)).toEqual({
      sector: 'RETAIL', projectType: 'Store', areaSqFt: 100, floorZone: 'Ground', requiredDate: null, referenceDrawing: null, remarks: null,
    });
    expect(statements[2].values[4]).toBe(BOQ_CREATE_AUDIT_ACTION);
    expect(statements[2].values[5]).toBe(UI_STRINGS.appApiBoqRoute.createdNewBOQBoqCodeValue2ForProjectProjectCodeCostCentreCodePurposePurpose);
    expect(statements[2].sql).toContain("'{{boqCode}}'");
    expect(db.boq.count).not.toHaveBeenCalled();
  });

  it('creates PR-purpose BOQs from explicit optional values and reports audit no-ops as conflicts', async () => {
    makeSuccessfulBatch('BOQ-P1-002');
    await expect(POST(postRequest({
      ...createBody, title: 'Mechanical', category: 'Mechanical', purpose: 'PR', description: 'Detailed scope',
      sector: 'HOSPITALITY', projectType: 'Hotel', areaSqFt: 900, floorZone: 'L2', requiredDate: '2026-12-31',
      referenceDrawing: 'D-10', remarks: 'Urgent',
    }))).resolves.toMatchObject({ ok: true, data: { boqId: expect.any(String), revisionId: expect.any(String), boqCode: 'BOQ-P1-002' } });
    const revisionValues = writeBatch.mock.calls[0][0][1].values;
    expect(revisionValues[8]).toBe('NOT_ADDED_TO_BUDGET');
    expect(revisionValues[9]).toBe('PR_DRAFT');
    expect(JSON.parse(revisionValues[17] as string)).toEqual({
      sector: 'HOSPITALITY', projectType: 'Hotel', areaSqFt: 900, floorZone: 'L2', requiredDate: '2026-12-31', referenceDrawing: 'D-10', remarks: 'Urgent',
    });

    writeBatch.mockResolvedValueOnce([
      { success: true, meta: { changes: 1 }, results: [{ boqCode: 'BOQ-P1-003' }] },
      { success: true, meta: { changes: 1 } }, { success: true, meta: { changes: 0 } },
    ]);
    await expect(POST(postRequest({ ...createBody, purpose: 'PR' }))).resolves.toMatchObject({ status: 409 });
  });

  it('returns stable errors and structured diagnostics for malformed bodies and database failures', async () => {
    const malformed = { json: jest.fn().mockRejectedValue(new Error('sensitive request detail')) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: UI_STRINGS.common.invalidRequestBody, status: 400 });
    db.project.findFirst.mockRejectedValueOnce(new Error('project database details'));
    await expect(POST(postRequest({ ...createBody, purpose: 'PR' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateBoqRecord, status: 500,
    });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.create_failed', expect.objectContaining({
      operation: 'create_boq', projectId: 'project-1', costCentreId: 'cc-1', error: expect.objectContaining({ message: 'project database details' }),
    }));
    db.boq.count.mockRejectedValueOnce(new Error('register database details'));
    await expect(GET(getRequest())).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchBoqs, status: 500 });
    expect(structuredLog).toHaveBeenCalledWith('error', 'boq.register_load_failed', expect.any(Object));
  });

  it('rejects non-object inputs and normalizes numeric and inherited BOQ defaults', async () => {
    await expect(POST(postRequest(null))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest([]))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...createBody, description: 12 }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...createBody, areaSqFt: 'unknown' }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(postRequest({ ...createBody, areaSqFt: -1 }))).resolves.toMatchObject({ ok: false, status: 400 });

    auth.mockResolvedValueOnce({ ...context, userEmail: '' });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', projectCode: 'P1', sector: '', projectType: '', areaSqFt: 500 });
    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-1', code: 'CC01', areaSqFt: null, floorZone: null });
    makeSuccessfulBatch('BOQ-P1-004');
    await expect(POST(postRequest({ ...createBody, areaSqFt: '125.5', scope: ' Scope ' }))).resolves.toMatchObject({
      ok: true, data: { boq: { createdBy: 'user-1' } },
    });
    const notes = JSON.parse(writeBatch.mock.calls.at(-1)?.[0][1].values[17] as string);
    expect(notes).toEqual({
      sector: BOQ_DEFAULT_SECTOR, projectType: BOQ_DEFAULT_PROJECT_TYPE, areaSqFt: 125.5,
      floorZone: null, requiredDate: null, referenceDrawing: null, remarks: null,
    });

    writeBatch.mockResolvedValueOnce([
      { meta: { changes: 1 }, results: [] }, { meta: { changes: 1 } }, { meta: { changes: 1 } },
    ]);
    await expect(POST(postRequest(createBody))).resolves.toMatchObject({ ok: false, status: 409 });
  });

  it('keeps BOQ workflow constants stable', () => {
    expect(BOQ_CREATE_AUDIT_ACTION).toBe('BOQ_CREATED');
    expect(BOQ_INITIAL_REVISION_SOURCE_TYPE).toBe('NOT_YET_SELECTED');
    expect(BOQ_DEFAULT_SECTOR).toBe('RETAIL');
    expect(BOQ_DEFAULT_PROJECT_TYPE).toBe('Standard Fitout');
  });
});
