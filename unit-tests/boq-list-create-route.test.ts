import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/boq/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boq: { count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boqRevision: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(), isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const errorResponse = apiError as jest.Mock;
const successResponse = apiSuccess as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userEmail: 'buyer@example.com', role: 'PROJECT_USER' };
const getRequest = (query = '') => new NextRequest(`http://localhost/api/boq${query}`);
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/boq', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('BOQ list and create API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    errorResponse.mockImplementation((error: string, status = 400) => ({ ok: false, error, status }));
    successResponse.mockImplementation((data: unknown, status = 200) => ({ ok: true, data, status }));
    db.boq.count.mockResolvedValue(0);
    db.boq.findMany.mockResolvedValue([]);
    db.project.findFirst.mockResolvedValue({ id: 'project-1', projectCode: 'P1', sector: 'RETAIL', projectType: 'Store', areaSqFt: 500 });
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01', areaSqFt: 100, floorZone: 'Ground' });
    db.boq.create.mockResolvedValue({ id: 'boq-1', boqCode: 'BOQ-P1-001', title: 'Electrical BOQ' });
    db.boqRevision.create.mockResolvedValue({ id: 'revision-0', revisionCode: 'R0' });
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
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

  it('filters and paginates BOQs and computes latest revision totals and fallbacks', async () => {
    db.boq.count.mockResolvedValueOnce(51);
    db.boq.findMany.mockResolvedValueOnce([
      { id: 'boq-1', revisions: [{
        id: 'r2', revisionCode: 'R2', revisionNumber: 2, status: 'DRAFT', sourceType: 'MANUAL', totalLines: 0,
        lines: [{ aiTotalCost: 20 }, { aiTotalCost: null }],
      }] },
      { id: 'boq-2', revisions: [{ id: 'r1', revisionCode: 'R1', revisionNumber: 1, status: 'APPROVED', totalLines: 4, lines: [{ aiTotalCost: 0 }] }] },
      { id: 'boq-3', revisions: [] },
    ]);
    await expect(GET(getRequest('?page=2&pageSize=10&status=DRAFT&projectId=p1&costCentreId=cc1&purpose=PR&search=cable'))).resolves.toMatchObject({
      ok: true, data: {
        total: 51, page: 2, pageSize: 10, totalPages: 6,
        data: [
          { id: 'boq-1', estimatedValue: 20, latestRevision: { id: 'r2', totalLines: 2, sourceType: 'MANUAL' } },
          { id: 'boq-2', estimatedValue: 0, latestRevision: { id: 'r1', totalLines: 4 } },
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
    expect(db.boq.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object), skip: 10, take: 10 }));
  });

  it('returns default BOQ paging when no list filters or revisions exist', async () => {
    db.boq.count.mockResolvedValueOnce(0);
    db.boq.findMany.mockResolvedValueOnce([{ id: 'empty', revisions: [] }]);
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: true, data: { total: 0, page: 1, pageSize: 50, totalPages: 0, data: [{ id: 'empty', estimatedValue: 0, latestRevision: null }] } });
    expect(db.boq.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' }, skip: 0, take: 50 }));
  });

  it('validates required project, cost centre, title, category, and purpose fields', async () => {
    const base = { projectId: 'project-1', costCentreId: 'cc-1', title: 'Electrical', category: 'Electrical', purpose: 'BUDGET' };
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.projectIsRequired, status: 400 });
    await expect(POST(postRequest({ ...base, costCentreId: '' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.costCentreIsRequired, status: 400 });
    await expect(POST(postRequest({ ...base, title: '  ' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQTitleNameIsRequired, status: 400 });
    await expect(POST(postRequest({ ...base, category: '' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQCategoryIsRequired, status: 400 });
    await expect(POST(postRequest({ ...base, category: [] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQCategoryIsRequired, status: 400 });
    await expect(POST(postRequest({ ...base, purpose: 'INVALID' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.bOQPurposeBUDGETOrPRIsRequired, status: 400 });
  });

  it('checks project and cost-centre tenancy and ownership before creating records', async () => {
    const body = { projectId: 'project-1', costCentreId: 'cc-1', title: 'Electrical', category: 'Electrical', purpose: 'PR' };
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(body))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, status: 404 });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest(body))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqRoute.costCentreDoesNotBelongToTheSelectedProject, status: 400 });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'cc-1', projectId: 'project-1', tenantId: 'tenant-1' } });
    expect(db.boq.create).not.toHaveBeenCalled();
  });

  it('creates a BUDGET BOQ, its R0 revision and an audit record using inherited project defaults', async () => {
    await expect(POST(postRequest({
      projectId: 'project-1', costCentreId: 'cc-1', title: '  Store Electrical ', category: ['Power', 'Lighting'], purpose: 'BUDGET', scope: '  L1 areas  ',
    }))).resolves.toMatchObject({ ok: true, status: 201, data: {
      success: true, boqId: 'boq-1', revisionId: 'revision-0', boqCode: 'BOQ-P1-001',
      boq: { project: { id: 'project-1' }, costCentre: { id: 'cc-1' }, revisions: [{ id: 'revision-0' }] },
    } });
    expect(db.boq.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', boqCode: { startsWith: 'BOQ-P1-' } }, select: { boqCode: true } });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-1', boqCode: 'BOQ-P1-001', title: 'Store Electrical',
      description: 'L1 areas', category: 'Power, Lighting', scope: 'L1 areas', purpose: UI_STRINGS.componentsSidebar.bUDGET, status: 'DRAFT', createdBy: 'buyer@example.com',
    }) });
    expect(db.boqRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', boqId: 'boq-1', costCentreId: 'cc-1', revisionNumber: 0, revisionCode: UI_STRINGS.common.r0,
      budgetStatus: 'BUDGET_DRAFT', prStatus: 'PR_NOT_CREATED', createdById: 'user-1',
      notes: JSON.stringify({ sector: 'RETAIL', projectType: 'Store', areaSqFt: 100, floorZone: 'Ground', requiredDate: null, referenceDrawing: null, remarks: null }),
    }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityType: UI_STRINGS.common.bOQ, entityId: 'boq-1', action: 'BOQ_CREATED' }) });
  });

  it('creates PR-purpose BOQs from explicit optional values and survives audit logging failures', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    db.auditLog.create.mockRejectedValueOnce(new Error('audit store unavailable'));
    await expect(POST(postRequest({
      projectId: 'project-1', costCentreId: 'cc-1', title: 'Mechanical', category: 'Mechanical', purpose: 'PR',
      description: 'Detailed scope', sector: 'HOSPITALITY', projectType: 'Hotel', areaSqFt: 900, floorZone: 'L2',
      requiredDate: '2026-12-31', referenceDrawing: 'D-10', remarks: 'Urgent',
    }))).resolves.toMatchObject({ ok: true, data: { boqId: 'boq-1', revisionId: 'revision-0' } });
    expect(db.boqRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      budgetStatus: 'NOT_ADDED_TO_BUDGET', prStatus: 'PR_DRAFT',
      notes: JSON.stringify({ sector: 'HOSPITALITY', projectType: 'Hotel', areaSqFt: 900, floorZone: 'L2', requiredDate: '2026-12-31', referenceDrawing: 'D-10', remarks: 'Urgent' }),
    }) });
    expect(warning).toHaveBeenCalledWith('Audit log write error:', expect.any(Error));
    warning.mockRestore();
  });

  it('returns a specific or generic create error for malformed JSON and database failures', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const malformed = { json: jest.fn().mockRejectedValue(new Error('invalid BOQ body')) } as unknown as NextRequest;
    await expect(POST(malformed)).resolves.toEqual({ ok: false, error: 'invalid BOQ body', status: 500 });
    const generic = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(generic)).resolves.toEqual({ ok: false, error: 'Failed to create BOQ record', status: 500 });
    db.project.findFirst.mockRejectedValueOnce(new Error('project DB error'));
    await expect(POST(postRequest({ projectId: 'project-1', costCentreId: 'cc-1', title: 'BOQ', category: 'C', purpose: 'PR' }))).resolves.toEqual({
      ok: false, error: 'project DB error', status: 500,
    });
    expect(errorLog).toHaveBeenCalledWith('Create BOQ error:', expect.any(Error));
    errorLog.mockRestore();
  });

  it('uses BOQ fallback metadata when all optional source values are absent', async () => {
    db.boq.findMany.mockResolvedValueOnce([{ id: 'boq-empty-revision', revisions: [{ id: 'r0', totalLines: 0 }] }]);
    await expect(GET(getRequest())).resolves.toMatchObject({
      ok: true,
      data: { data: [{ latestRevision: { totalLines: 0 } }] },
    });

    auth.mockResolvedValueOnce({ ...context, userEmail: '' });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1', projectCode: 'P1' });
    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-1', code: 'CC01' });
    db.boq.create.mockResolvedValueOnce({ id: 'boq-2', boqCode: 'BOQ-P1-002' });
    await expect(POST(postRequest({
      projectId: 'project-1', costCentreId: 'cc-1', title: 'Mechanical', category: 'Mechanical', purpose: 'PR',
    }))).resolves.toMatchObject({ ok: true, status: 201 });

    expect(db.boq.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      description: null, scope: null, createdBy: 'user-1',
    }) });
    expect(db.boqRevision.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      notes: JSON.stringify({
        sector: 'RETAIL', projectType: 'Standard Fitout', areaSqFt: null, floorZone: null,
        requiredDate: null, referenceDrawing: null, remarks: null,
      }),
    }) });
    expect(db.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      description: expect.stringContaining('(Untitled)'),
    }) });
  });
});
