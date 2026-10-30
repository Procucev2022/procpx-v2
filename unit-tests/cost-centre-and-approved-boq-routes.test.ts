import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { POST as createCostCentre, GET as listCostCentres } from '../src/app/api/cost-centres/route';
import { GET as listApprovedBoqs } from '../src/app/api/procurement/approved-boqs/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    costCentre: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    project: { findFirst: jest.fn() },
    boqRevision: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
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
      orderBy: { code: 'asc' },
    }));

    db.costCentre.findMany.mockResolvedValueOnce([]);
    await listCostCentres(request());
    expect(db.costCentre.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });

  it('validates cost centre creation, checks tenant project and duplicate codes, and records the new centre', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', {}))).resolves.toBe(denied);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: '', code: 'CC', name: 'Office' }))).resolves.toEqual({
      ok: false, error: 'Project ID, Cost Centre Code, and Name are mandatory.', status: 400,
    });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'missing', code: 'CC', name: 'Office' }))).resolves.toEqual({
      ok: false, error: 'Project not found or inaccessible.', status: 404,
    });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce({ id: 'duplicate' });
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'project-1', code: ' CC-1 ', name: 'Office' }))).resolves.toEqual({
      ok: false, error: 'Cost Centre Code  CC-1  already exists for this project.', status: 409,
    });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce(null);
    const created = { id: 'cc-2', code: 'CC-2', name: 'East Wing', areaSqFt: 125.5 };
    db.costCentre.create.mockResolvedValueOnce(created);
    await expect(createCostCentre(request('http://localhost/api/cost-centres', {
      projectId: 'project-1', code: ' CC-2 ', name: ' East Wing ', description: ' Office ', areaSqFt: '125.5', location: ' Pune ', floorZone: ' L2 ',
    }))).resolves.toEqual({ ok: true, data: created, status: 201 });
    expect(db.costCentre.create).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', projectId: 'project-1', code: 'CC-2', name: 'East Wing', description: 'Office', areaSqFt: 125.5,
      location: 'Pune', floorZone: 'L2', createdBy: 'user-1',
    } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'COST_CENTRE_CREATED', entityId: 'cc-2' }) });

    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findUnique.mockResolvedValueOnce(null);
    db.costCentre.create.mockResolvedValueOnce({ id: 'cc-3', code: 'CC-3', name: 'Misc' });
    await createCostCentre(request('http://localhost/api/cost-centres', {
      projectId: 'project-1', code: 'CC-3', name: 'Misc', description: '', areaSqFt: 0, location: '', floorZone: '',
    }));
    expect(db.costCentre.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ description: null, areaSqFt: null, location: null, floorZone: null }) });

    db.project.findFirst.mockRejectedValueOnce(new Error('create failure'));
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'project-1', code: 'CC', name: 'New' }))).resolves.toEqual({
      ok: false, error: 'create failure', status: 500,
    });
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(createCostCentre(request('http://localhost/api/cost-centres', { projectId: 'project-1', code: 'CC', name: 'New' }))).resolves.toEqual({
      ok: false, error: 'Failed to create cost centre.', status: 500,
    });
  });

  it('lists approved BOQs with project/search constraints and derives sourcing summaries from line history', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(listApprovedBoqs(request())).resolves.toBe(denied);

    const sourceLine = {
      id: 'line-1', lineNumber: 0, itemCode: 'ITEM-1', standardDescription: '', originalDescription: 'Cable run', specification: '',
      quantity: 2, benchmarkRate: 50, category: { name: 'Electrical' }, uom: { code: 'M' }, uomRaw: 'metre', subcategoryId: 'sub-1',
    };
    const revisions = [
      {
        id: 'rev-1', boqId: 'boq-1', revisionCode: 'R2', approvedAt: new Date('2025-06-01'), approvedBy: { email: 'approver@example.test' },
        costCentre: { code: 'CC-1', name: 'Retail' }, lines: [sourceLine, { ...sourceLine, id: 'line-2', quantity: 1, benchmarkRate: 0 }, {
          ...sourceLine, id: 'line-3', itemCode: null, category: null, uom: null, uomRaw: '', quantity: 0, benchmarkRate: null,
        }],
        rfqs: [{ id: 'rfq-empty', ppos: [] }, { id: 'rfq-linked', ppos: [{ id: 'ppo-1', status: 'ISSUED' }] }],
        boq: { boqCode: '', project: { id: 'project-1', projectCode: 'P-1', name: 'Store', city: '', state: 'MH', location: 'Pune' } },
      },
      {
        id: 'rev-2', boqId: 'boq-2', revisionCode: 'R1', approvedAt: null, approvedBy: null, costCentre: null,
        lines: [], rfqs: [], boq: { boqCode: 'BOQ-2', project: { id: 'project-2', projectCode: 'P-2', name: 'Office', city: '', state: '', location: '' } },
      },
    ];
    db.boqRevision.findMany.mockResolvedValueOnce(revisions);
    await expect(listApprovedBoqs(request('http://localhost/api/procurement/approved-boqs?projectId=project-1&search=Store'))).resolves.toMatchObject({
      ok: true,
      data: { total: 2, approvedBoqs: [
        expect.objectContaining({
          id: 'rev-1', boqCode: 'BOQ-P-1', costCentre: 'CC-1 - Retail', projectName: 'Store', location: 'MH', approvedBy: 'approver@example.test',
          totalLines: 3, estimatedBenchmarkValue: 200, rfqCount: 2, linkedPpo: { id: 'ppo-1', status: 'ISSUED' },
          categories: [expect.objectContaining({ category: 'Electrical', lineCount: 2, totalQty: 3, estimatedValue: 200 }), expect.objectContaining({ category: 'General', lineCount: 1 })],
          lines: expect.arrayContaining([
            expect.objectContaining({ lineNumber: 'ITEM-1', description: 'Cable run', specification: 'Standard commercial grade', benchmarkRate: 50 }),
            expect.objectContaining({ lineNumber: 'L-1', category: 'General', uom: 'NOS', benchmarkRate: 100 }),
          ]),
        }),
        expect.objectContaining({ id: 'rev-2', costCentre: undefined, location: '—', approvedBy: 'Project Approver', linkedPpo: null, categories: [], lines: [] }),
      ] },
    });
    expect(db.boqRevision.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', AND: [
        { OR: [
          { status: 'APPROVED' }, { prStatus: 'PR_RELEASED_TO_PROCUREMENT' }, { prStatus: 'PR_APPROVED' },
          { prs: { some: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'] } } } },
        ] },
        { boq: { projectId: 'project-1' } },
        { OR: [
          { revisionCode: { contains: 'Store' } }, { boq: { boqCode: { contains: 'Store' } } },
          { boq: { project: { name: { contains: 'Store' } } } }, { boq: { project: { projectCode: { contains: 'Store' } } } },
        ] },
      ] },
    }));

    db.boqRevision.findMany.mockRejectedValueOnce(new Error('boq database error'));
    await expect(listApprovedBoqs(request())).resolves.toEqual({ ok: false, error: 'boq database error', status: 500 });
    db.boqRevision.findMany.mockRejectedValueOnce({});
    await expect(listApprovedBoqs(request())).resolves.toEqual({ ok: false, error: 'Failed to fetch approved BOQs', status: 500 });
  });
});
