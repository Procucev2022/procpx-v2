import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '../src/lib/project-auth';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { GET as listActualCosts, POST as createActualCost } from '../src/app/api/actual-costs/route';
import { GET as listProjects, POST as createProject } from '../src/app/api/projects/route';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { logEvent, writeStructuredLog } from '../src/lib/observability/server-logger';
import {
  PROJECT_INSERT_IF_CODE_AVAILABLE_SQL,
  PROJECT_NORMALIZED_NAME_EXISTS_SQL,
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
} from '../src/lib/d1-batch.constants';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    actualCostTransaction: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    project: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/project-auth', () => ({
  getUserProjectAccessFilter: jest.fn(),
  isUserAuthorizedForProject: jest.fn(),
}));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
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
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({
  logEvent: jest.fn(),
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const projectAccessFilter = getUserProjectAccessFilter as jest.Mock;
const projectAuthorized = isUserAuthorizedForProject as jest.Mock;
const batchWrite = writeD1BatchAtomically as jest.Mock;
const backgroundLog = logEvent as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Test User', role: 'CLIENT_ADMIN' };
const request = (url: string, body?: unknown) => new NextRequest(url, {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

describe('actual cost API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    projectAccessFilter.mockResolvedValue(null);
    projectAuthorized.mockResolvedValue(true);
    db.actualCostTransaction.count.mockResolvedValue(0);
    db.actualCostTransaction.findFirst.mockResolvedValue(null);
    batchWrite.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  });

  it('lists transactions with any supplied filters and handles an unfiltered query', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listActualCosts(request('http://localhost/api/actual-costs'))).resolves.toBe(denied);
    const rows = [{ id: 'actual-1', totalActualAmount: 11 }];
    db.actualCostTransaction.count.mockResolvedValueOnce(25);
    db.actualCostTransaction.findMany.mockResolvedValueOnce(rows);
    await expect(listActualCosts(request('http://localhost/api/actual-costs?projectId=p1&costCentreId=cc1&boqLineId=bl1&ppoId=ppo1&source=GRN&status=APPROVED&page=2&pageSize=10'))).resolves.toEqual({
      ok: true, data: { data: rows, total: 25, page: 2, pageSize: 10, totalPages: 3 }, status: 200,
    });
    expect(db.actualCostTransaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', projectId: 'p1', costCentreId: 'cc1', boqLineId: 'bl1', ppoId: 'ppo1', source: 'GRN', status: UI_STRINGS.common.aPPROVED },
      orderBy: [{ actualDate: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
      include: expect.objectContaining({ project: expect.any(Object), ppoLine: expect.any(Object), vendor: expect.any(Object) }),
    }));
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]);
    await listActualCosts(request('http://localhost/api/actual-costs'));
    expect(db.actualCostTransaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' }, skip: 0, take: 50 }));

    projectAccessFilter.mockResolvedValueOnce({ OR: [{ projectOwner: 'user-1' }] });
    db.actualCostTransaction.findMany.mockResolvedValueOnce(rows);
    await listActualCosts(request('http://localhost/api/actual-costs'));
    expect(db.actualCostTransaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', project: { is: { OR: [{ projectOwner: 'user-1' }] } } },
      skip: 0,
      take: 50,
    }));
    projectAccessFilter.mockResolvedValueOnce({ OR: [{ projectOwner: 'user-1' }] });
    db.actualCostTransaction.findMany.mockResolvedValueOnce(rows);
    await listActualCosts(request('http://localhost/api/actual-costs?projectId=outside'));
    expect(db.actualCostTransaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', project: { is: { OR: [{ projectOwner: 'user-1' }] } }, projectId: 'outside' },
    }));
    db.actualCostTransaction.findMany.mockRejectedValueOnce(new Error('actual cost query failed'));
    await expect(listActualCosts(request('http://localhost/api/actual-costs?projectId=p1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchActualCostTransactions, status: 500,
    });
    expect(backgroundLog).toHaveBeenCalledWith('error', 'actual_cost.list_failed', expect.objectContaining({
      operation: 'list', route: '/api/actual-costs', tenantId: 'tenant-1', projectId: 'p1',
    }), 'next');
  });

  it('validates actual cost creation and computes amount plus tax from quantity and rate', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createActualCost(request('http://localhost/api/actual-costs', {}))).resolves.toBe(denied);
    await expect(createActualCost(request('http://localhost/api/actual-costs', { projectId: 'p1', category: 'Electrical' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiActualCostsRoute.projectCategoryActualQuantityAndActualUnitRateAreRequired, status: 400,
    });

    db.actualCostTransaction.findFirst.mockResolvedValueOnce({ transactionCode: 'ACT-2025-000003' });
    const response = await createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', costCentreId: 'cc1', category: 'Electrical', subcategory: 'Wiring', actualQuantity: '2', actualUnitRate: '5', taxAmount: '1.5',
      actualDate: '2025-03-02T00:00:00.000Z', source: 'GRN', status: 'APPROVED', completionReference: 'GRN-4', externalReference: 'EXT-1',
      erpDocumentNumber: 'ERP-1', erpDate: '2025-03-01T00:00:00.000Z', documents: [{ name: 'invoice.pdf' }], remarks: 'Received',
      boqId: 'boq-1', boqRevisionId: 'rev-1', boqLineId: 'boq-line-1', prId: 'pr-1', prLineId: 'pr-line-1', rfqId: 'rfq-1', rfqLineId: 'rfq-line-1',
      ppoId: 'ppo-1', vendorId: 'vendor-1',
    }));
    expect(response).toMatchObject({ ok: true, status: 201, data: expect.objectContaining({ transactionCode: 'ACT-2025-000004' }) });
    const statements = batchWrite.mock.calls[0][0];
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toMatch(/FROM\s+input i/);
    expect(statements[0].sql).toContain('"tenantId" = i."tenantId"');
    expect(statements[0].values).toEqual(expect.arrayContaining([
      'tenant-1', 'ACT-2025-000004', 'p1', 'cc1', 'boq-1', 'rev-1', 'boq-line-1', 'pr-1', 'pr-line-1', 'rfq-1', 'rfq-line-1', 'ppo-1', 'vendor-1',
    ]));
    expect(statements[0].values).toEqual(expect.arrayContaining([
      expect.any(String), 'Electrical', 'Wiring', 2, 5, 10, 1.5, 11.5,
    ]));
    expect(statements[1].sql).toContain('WHERE changes() = 1');
    expect(audit).not.toHaveBeenCalled();
    expect((response as unknown as { data: Record<string, unknown> }).data).toEqual(expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'p1', costCentreId: 'cc1', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical,
      actualQuantity: 2, actualUnitRate: 5, actualAmount: 10, taxAmount: 1.5, totalActualAmount: 11.5, actualDate: new Date('2025-03-02T00:00:00.000Z'),
      erpDate: new Date('2025-03-01T00:00:00.000Z'), documents: JSON.stringify([{ name: 'invoice.pdf' }]), createdBy: 'Test User',
    }));
  });

  it('rejects manual actual costs linked to a PPO line so the completion cap cannot be bypassed', async () => {
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, source: 'GRN', ppoLineId: 'ppo-line-1',
    }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiActualCostsRoute.ppoLinkedActualCostsMustUseCompletionWorkflow, status: 400,
    });
  });

  it('accepts explicit amount and optional defaults, rejects invalid references and hides database errors', async () => {
    const response = await createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, actualAmount: '20', documents: 'uploaded-documents',
    }));
    expect(response).toMatchObject({ ok: true, status: 201, data: expect.objectContaining({
      actualAmount: 20, totalActualAmount: 20, taxAmount: 0, source: 'MANUAL_ADJUSTMENT', status: UI_STRINGS.common.aPPROVED, documents: 'uploaded-documents',
      costCentreId: null, subcategory: null, erpDate: null, remarks: null,
    }) });
    batchWrite.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    db.actualCostTransaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(createActualCost(request('http://localhost/api/actual-costs', { projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2 }))).resolves.toMatchObject({
      ok: false, error: UI_STRINGS.appApiActualCostsRoute.actualCostReferencesMustBelongToTheSelectedProject, status: 400,
    });
    batchWrite.mockRejectedValueOnce(new Error('sensitive database detail'));
    await expect(createActualCost(request('http://localhost/api/actual-costs', { projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2 }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateActualCostTransaction, status: 500,
    });
    expect(backgroundLog).toHaveBeenCalledWith('error', 'actual_cost.create_failed', expect.objectContaining({
      operation: 'create', route: '/api/actual-costs', tenantId: 'tenant-1', projectId: 'p1',
    }), 'next');
  });

  it('validates amounts, dates, completion source and project authorization before writing', async () => {
    const malformed = {
      json: jest.fn().mockRejectedValue(new Error('invalid JSON')),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as NextRequest;
    await expect(createActualCost(malformed)).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.appApiActualCostsRoute.invalidActualCostRequest,
    });
    await expect(createActualCost(request('http://localhost/api/actual-costs', []))).resolves.toMatchObject({
      ok: false, status: 400, error: UI_STRINGS.appApiActualCostsRoute.invalidActualCostRequest,
    });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: -1, actualUnitRate: 2,
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 'not-a-number', actualUnitRate: 2,
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, actualAmount: -1,
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, taxAmount: -1,
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, actualDate: 'invalid',
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, erpDate: 'invalid',
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, source: 'PPO_COMPLETION',
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, source: 'UNKNOWN',
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, status: 'UNKNOWN',
    }))).resolves.toMatchObject({ ok: false, status: 400 });
    projectAuthorized.mockResolvedValueOnce(false);
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2,
    }))).resolves.toMatchObject({ ok: false, status: 403 });
    expect(batchWrite).not.toHaveBeenCalled();
  });
});

describe('project listing and creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    batchWrite.mockReset().mockImplementation(async (statements: Array<{ values: unknown[] }>) => [
      { results: [{ id: statements[0].values[0], projectCode: statements[0].values[2] }], meta: { changes: 1 } },
      { meta: { changes: 1 } },
    ]);
  });

  it('paginates projects with search, status, and sector constraints', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listProjects(request('http://localhost/api/projects'))).resolves.toBe(denied);
    db.project.count.mockResolvedValueOnce(25);
    db.project.findMany.mockResolvedValueOnce([{ id: 'project-1' }]);
    await expect(listProjects(request('http://localhost/api/projects?page=2&pageSize=5&search=Retail&status=ACTIVE&sector=RETAIL'))).resolves.toEqual({
      ok: true, data: { data: [{ id: 'project-1' }], total: 25, page: 2, pageSize: 5, totalPages: 5 }, status: 200,
    });
    expect(db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', OR: [{ name: { contains: UI_STRINGS.appAppBoqStudioPage.retail } }, { projectCode: { contains: UI_STRINGS.appAppBoqStudioPage.retail } }, { city: { contains: UI_STRINGS.appAppBoqStudioPage.retail } }], status: UI_STRINGS.common.aCTIVE, sector: 'RETAIL' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 5, take: 5, include: expect.objectContaining({ boqs: expect.any(Object), _count: { select: { team: true } } }),
    }));
    db.project.count.mockRejectedValueOnce(new Error('project read unavailable'));
    await expect(listProjects(request('http://localhost/api/projects'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchProjects, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'project.register_read_failed', expect.objectContaining({
      operation: 'list_projects', tenantId: 'tenant-1', pageSize: 50,
    }), 'application');

    db.project.count.mockRejectedValueOnce({});
    await expect(listProjects(new NextRequest('http://localhost/api/projects', { headers: { 'cf-ray': 'projects-list-ray' } }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToFetchProjects, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenLastCalledWith('error', 'project.register_read_failed', expect.objectContaining({
      requestId: 'projects-list-ray', error: { type: 'object' },
    }), 'application');
  });

  it('validates project details before generating a new code', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toBe(denied);
    await expect(createProject(request('http://localhost/api/projects', { name: '  ', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNameIsRequired, status: 400 });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.sectorIsRequired, status: 400 });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectTypeIsRequired, status: 400 });
  });

  it('generates the next unused project code and stores normalized project fields', async () => {
    db.project.findFirst.mockResolvedValueOnce({ projectCode: 'CPX-P-000007' });
    batchWrite.mockImplementationOnce(async (statements: Array<{ values: unknown[] }>) => [
      { results: [{ id: statements[0].values[0], projectCode: statements[0].values[2] }], meta: { changes: 1 } },
      { meta: { changes: 1 } },
    ]);
    await expect(createProject(request('http://localhost/api/projects', {
      name: ' Retail Store ', description: ' Details ', sector: 'RETAIL', projectType: 'STORE', location: ' Pune ', address: ' Road 1 ', city: ' Pune ', state: ' MH ', country: '',
      areaSqFt: '1200.5', costCentre: ' CC-1 ', projectOwner: ' Owner ', budget: '50000', currency: '', businessUnit: ' BU ', numberOfFloors: '2', numberOfUnits: '12',
      startDate: '2025-01-01T00:00:00.000Z', targetCompletion: '2025-12-31T00:00:00.000Z',
    }))).resolves.toMatchObject({ ok: true, status: 201, data: expect.objectContaining({
      id: expect.any(String), tenantId: 'tenant-1', projectCode: 'CPX-P-000008', name: 'Retail Store', description: UI_STRINGS.appAppBoqStudioPage.details, location: 'Pune', address: 'Road 1', city: 'Pune', state: 'MH',
      country: UI_STRINGS.common.india, areaSqFt: 1200.5, costCentre: 'CC-1', projectOwner: UI_STRINGS.appAppDashboardPage.owner, budget: 50000, currency: UI_STRINGS.common.iNR, businessUnit: 'BU', numberOfFloors: 2, numberOfUnits: 12,
      status: 'DRAFT', createdBy: 'user-1',
    }) });
    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', projectCode: { startsWith: 'CPX-P-' } },
      orderBy: { projectCode: 'desc' }, select: { projectCode: true },
    });
    const statements = batchWrite.mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(3);
    expect(statements[0].sql).toBe(PROJECT_INSERT_IF_CODE_AVAILABLE_SQL);
    expect(statements[1].sql).toBe(AUDIT_LOG_INSERT_AFTER_CHANGE_SQL);
    expect(statements[2].sql).toBe(PROJECT_NORMALIZED_NAME_EXISTS_SQL);
    expect(statements[2].values).toEqual(['tenant-1', 'Retail Store']);
    expect(statements[0].values).toEqual(expect.arrayContaining(['CPX-P-000008', 'Retail Store', 'Pune', 'MH', 1200.5, 50000]));
    expect(statements[1].values).toEqual(expect.arrayContaining(['PROJECT', 'CREATE']));
    expect(statements[1].values[5]).toBe(statements[0].values[0]);
    expect(db.project.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('retries code collisions and returns conflict after the retry limit', async () => {
    db.project.findFirst.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ projectCode: 'CPX-P-000001' })
      .mockResolvedValueOnce({ projectCode: 'CPX-P-000002' });
    batchWrite.mockResolvedValueOnce([{ results: [], meta: { changes: 0 } }, { meta: { changes: 0 } }])
      .mockResolvedValueOnce([{ results: [], meta: { changes: 0 } }, { meta: { changes: 0 } }])
      .mockImplementationOnce(async (statements: Array<{ values: unknown[] }>) => [
        { results: [{ id: statements[0].values[0], projectCode: statements[0].values[2] }], meta: { changes: 1 } },
        { meta: { changes: 1 } },
      ]);
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toMatchObject({ ok: true, status: 201, data: { projectCode: 'CPX-P-000003' } });
    expect(batchWrite).toHaveBeenCalledTimes(3);

    db.project.findFirst.mockReset().mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ projectCode: 'CPX-P-000001' })
      .mockResolvedValueOnce({ projectCode: 'CPX-P-000002' });
    batchWrite.mockReset()
      .mockResolvedValueOnce([{ results: [], meta: { changes: 0 } }, { meta: { changes: 0 } }])
      .mockResolvedValueOnce([{ results: [], meta: { changes: 0 } }, { meta: { changes: 0 } }])
      .mockResolvedValueOnce([{ results: [], meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(createProject(request('http://localhost/api/projects', { name: 'Conflict', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProjectsRoute.aProjectWithThisProjectCodeAlreadyExistsPleaseRetry, status: 409 });
  });

  it('returns a normalized-name conflict when the atomic project insert finds an existing tenant project', async () => {
    db.project.findFirst.mockResolvedValueOnce(null);
    batchWrite.mockResolvedValueOnce([
      { results: [], meta: { changes: 0 } },
      { meta: { changes: 0 } },
      { results: [{ id: 'existing-project' }], meta: { changes: 0 } },
    ]);

    await expect(createProject(request('http://localhost/api/projects', {
      name: ' project ', sector: 'RETAIL', projectType: 'STORE',
    }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.appApiProjectsRoute.aProjectWithThisNameAlreadyExistsForThisTenant,
      status: 409,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('warn', 'project.duplicate_name_conflict', expect.objectContaining({
      operation: 'create_project', duplicateProjectId: 'existing-project', tenantId: 'tenant-1',
    }), 'application');
  });

  it('handles malformed optional project values and unexpected errors', async () => {
    db.project.findFirst.mockResolvedValueOnce(null);
    batchWrite.mockImplementationOnce(async (statements: Array<{ values: unknown[] }>) => [
      { results: [{ id: statements[0].values[0], projectCode: statements[0].values[2] }], meta: { changes: 1 } },
      { meta: { changes: 1 } },
    ]);
    await createProject(request('http://localhost/api/projects', {
      name: 'Project', sector: 'RETAIL', projectType: 'STORE', description: '', areaSqFt: 'bad', budget: 'bad', numberOfFloors: 'bad', numberOfUnits: 'bad', startDate: '', targetCompletion: '',
    }));
    expect(batchWrite.mock.calls[0][0][0].values).toEqual(expect.arrayContaining([null, null, null, null, null, null]));

    db.project.findFirst.mockRejectedValueOnce(new Error('project database failure'));
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateProject, status: 500 });
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateProject, status: 500 });

    db.project.findFirst.mockResolvedValueOnce({ projectCode: 'legacy-code' });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateProject, status: 500 });
    db.project.findFirst.mockResolvedValueOnce({ projectCode: 'CPX-P-999999' });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateProject, status: 500 });
  });
});
