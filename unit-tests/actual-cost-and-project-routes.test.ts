import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { GET as listActualCosts, POST as createActualCost } from '../src/app/api/actual-costs/route';
import { GET as listProjects, POST as createProject } from '../src/app/api/projects/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    actualCostTransaction: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    project: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
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
  });

  it('lists transactions with any supplied filters and handles an unfiltered query', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listActualCosts(request('http://localhost/api/actual-costs'))).resolves.toBe(denied);
    const rows = [{ id: 'actual-1', totalActualAmount: 11 }];
    db.actualCostTransaction.findMany.mockResolvedValueOnce(rows);
    await expect(listActualCosts(request('http://localhost/api/actual-costs?projectId=p1&costCentreId=cc1&boqLineId=bl1&ppoId=ppo1&source=GRN&status=APPROVED'))).resolves.toEqual({ ok: true, data: rows, status: 200 });
    expect(db.actualCostTransaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', projectId: 'p1', costCentreId: 'cc1', boqLineId: 'bl1', ppoId: 'ppo1', source: 'GRN', status: 'APPROVED' },
      orderBy: { actualDate: 'desc' },
      include: expect.objectContaining({ project: expect.any(Object), ppoLine: expect.any(Object), vendor: expect.any(Object) }),
    }));
    db.actualCostTransaction.findMany.mockResolvedValueOnce([]);
    await listActualCosts(request('http://localhost/api/actual-costs'));
    expect(db.actualCostTransaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });

  it('validates actual cost creation and computes amount plus tax from quantity and rate', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createActualCost(request('http://localhost/api/actual-costs', {}))).resolves.toBe(denied);
    await expect(createActualCost(request('http://localhost/api/actual-costs', { projectId: 'p1', category: 'Electrical' }))).resolves.toEqual({
      ok: false, error: 'Project, category, actualQuantity, and actualUnitRate are required', status: 400,
    });

    db.actualCostTransaction.count.mockResolvedValueOnce(3);
    const transaction = { id: 'actual-1', transactionCode: 'ACT-2025-000004' };
    db.actualCostTransaction.create.mockResolvedValueOnce(transaction);
    await expect(createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', costCentreId: 'cc1', category: 'Electrical', subcategory: 'Wiring', actualQuantity: '2', actualUnitRate: '5', taxAmount: '1.5',
      actualDate: '2025-03-02T00:00:00.000Z', source: 'GRN', status: 'APPROVED', completionReference: 'GRN-4', externalReference: 'EXT-1',
      erpDocumentNumber: 'ERP-1', erpDate: '2025-03-01T00:00:00.000Z', documents: [{ name: 'invoice.pdf' }], remarks: 'Received',
      boqId: 'boq-1', boqRevisionId: 'rev-1', boqLineId: 'boq-line-1', prId: 'pr-1', prLineId: 'pr-line-1', rfqId: 'rfq-1', rfqLineId: 'rfq-line-1',
      ppoId: 'ppo-1', ppoLineId: 'ppo-line-1', vendorId: 'vendor-1',
    }))).resolves.toEqual({ ok: true, data: transaction, status: 201 });
    expect(db.actualCostTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', transactionCode: expect.stringMatching(/^ACT-\d{4}-000004$/), projectId: 'p1', costCentreId: 'cc1', category: 'Electrical',
      actualQuantity: 2, actualUnitRate: 5, actualAmount: 10, taxAmount: 1.5, totalActualAmount: 11.5, actualDate: new Date('2025-03-02T00:00:00.000Z'),
      erpDate: new Date('2025-03-01T00:00:00.000Z'), documents: JSON.stringify([{ name: 'invoice.pdf' }]), createdBy: 'Test User',
    }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTUAL_COST_RECORDED', entityId: 'actual-1', projectId: 'p1' }));
  });

  it('accepts explicit amount, defaults optional values, supports string documents, and handles errors', async () => {
    db.actualCostTransaction.count.mockResolvedValueOnce(0);
    db.actualCostTransaction.create.mockResolvedValueOnce({ id: 'actual-2' });
    await createActualCost(request('http://localhost/api/actual-costs', {
      projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2, actualAmount: '20', documents: 'uploaded-documents',
    }));
    expect(db.actualCostTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actualAmount: 20, totalActualAmount: 20, taxAmount: 0, source: 'MANUAL_ADJUSTMENT', status: 'APPROVED', documents: 'uploaded-documents',
      costCentreId: null, subcategory: null, erpDate: null, remarks: null,
    }) });
    db.actualCostTransaction.count.mockRejectedValueOnce(new Error('actual cost unavailable'));
    await expect(createActualCost(request('http://localhost/api/actual-costs', { projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2 }))).resolves.toEqual({ ok: false, error: 'actual cost unavailable', status: 500 });
    db.actualCostTransaction.count.mockRejectedValueOnce({});
    await expect(createActualCost(request('http://localhost/api/actual-costs', { projectId: 'p1', category: 'Civil', actualQuantity: 1, actualUnitRate: 2 }))).resolves.toEqual({ ok: false, error: 'Failed to create actual cost transaction', status: 500 });
  });
});

describe('project listing and creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
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
      where: { tenantId: 'tenant-1', OR: [{ name: { contains: 'Retail' } }, { projectCode: { contains: 'Retail' } }, { city: { contains: 'Retail' } }], status: 'ACTIVE', sector: 'RETAIL' },
      orderBy: { createdAt: 'desc' }, skip: 5, take: 5, include: expect.objectContaining({ boqs: expect.any(Object), _count: { select: { team: true } } }),
    }));
  });

  it('validates project details before generating a new code', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toBe(denied);
    await expect(createProject(request('http://localhost/api/projects', { name: '  ', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: 'Project name is required.', status: 400 });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: 'Sector is required.', status: 400 });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL' }))).resolves.toEqual({ ok: false, error: 'Project type is required.', status: 400 });
  });

  it('generates the next unused project code and stores normalized project fields', async () => {
    db.project.findMany.mockResolvedValueOnce([{ projectCode: 'CPX-P-000007' }, { projectCode: 'INVALID' }, { projectCode: 'CPX-P-000006-extra' }]);
    db.project.findFirst.mockResolvedValueOnce({ id: 'collision' }).mockResolvedValueOnce(null);
    const created = { id: 'project-1', projectCode: 'CPX-P-000009', name: 'Retail Store' };
    db.project.create.mockResolvedValueOnce(created);
    await expect(createProject(request('http://localhost/api/projects', {
      name: ' Retail Store ', description: ' Details ', sector: 'RETAIL', projectType: 'STORE', location: ' Pune ', address: ' Road 1 ', city: ' Pune ', state: ' MH ', country: '',
      areaSqFt: '1200.5', costCentre: ' CC-1 ', projectOwner: ' Owner ', budget: '50000', currency: '', businessUnit: ' BU ', numberOfFloors: '2', numberOfUnits: '12',
      startDate: '2025-01-01T00:00:00.000Z', targetCompletion: '2025-12-31T00:00:00.000Z',
    }))).resolves.toEqual({ ok: true, data: created, status: 201 });
    expect(db.project.findFirst).toHaveBeenNthCalledWith(1, { where: { tenantId: 'tenant-1', projectCode: 'CPX-P-000008' }, select: { id: true } });
    expect(db.project.findFirst).toHaveBeenNthCalledWith(2, { where: { tenantId: 'tenant-1', projectCode: 'CPX-P-000009' }, select: { id: true } });
    expect(db.project.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectCode: 'CPX-P-000009', name: 'Retail Store', description: 'Details', location: 'Pune', address: 'Road 1', city: 'Pune', state: 'MH',
      country: 'India', areaSqFt: 1200.5, costCentre: 'CC-1', projectOwner: 'Owner', budget: 50000, currency: 'INR', businessUnit: 'BU', numberOfFloors: 2, numberOfUnits: 12,
      status: 'DRAFT', createdBy: 'user-1',
    }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityId: 'project-1', newValue: { projectCode: 'CPX-P-000009', name: 'Retail Store', sector: 'RETAIL', projectType: 'STORE' } }));
  });

  it('retries code collisions and returns conflict after the retry limit', async () => {
    db.project.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ projectCode: 'CPX-P-000001' }])
      .mockResolvedValueOnce([{ projectCode: 'CPX-P-000001' }, { projectCode: 'CPX-P-000002' }]);
    db.project.findFirst.mockResolvedValue(null);
    db.project.create.mockRejectedValueOnce({ code: 'P2002' }).mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({ id: 'project-2', projectCode: 'CPX-P-000003' });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(db.project.create.mock.calls.map(([call]) => call.data.projectCode)).toEqual(['CPX-P-000001', 'CPX-P-000002', 'CPX-P-000003']);

    db.project.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.project.findFirst.mockResolvedValue(null);
    db.project.create.mockRejectedValueOnce({ code: 'P2002' }).mockRejectedValueOnce({ code: 'P2002' }).mockRejectedValueOnce({ code: 'P2002' });
    await expect(createProject(request('http://localhost/api/projects', { name: 'Conflict', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: 'A project with this project code already exists. Please retry.', status: 409 });
  });

  it('handles malformed optional project values and unexpected errors', async () => {
    db.project.findMany.mockResolvedValueOnce([]);
    db.project.findFirst.mockResolvedValueOnce(null);
    db.project.create.mockResolvedValueOnce({ id: 'project-2' });
    await createProject(request('http://localhost/api/projects', {
      name: 'Project', sector: 'RETAIL', projectType: 'STORE', description: '', areaSqFt: 'bad', budget: 'bad', numberOfFloors: 'bad', numberOfUnits: 'bad', startDate: '', targetCompletion: '',
    }));
    expect(db.project.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ description: null, areaSqFt: null, budget: null, numberOfFloors: null, numberOfUnits: null, startDate: null, targetCompletion: null }) });

    db.project.findMany.mockRejectedValueOnce(new Error('project database failure'));
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: 'project database failure', status: 500 });
    db.project.findMany.mockRejectedValueOnce({});
    await expect(createProject(request('http://localhost/api/projects', { name: 'Project', sector: 'RETAIL', projectType: 'STORE' }))).resolves.toEqual({ ok: false, error: 'Failed to create project.', status: 500 });
  });
});
