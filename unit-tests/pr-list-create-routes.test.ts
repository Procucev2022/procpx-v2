import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/pr/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    procurementRequest: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    pRLine: { create: jest.fn() },
    boq: { update: jest.fn() },
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
        id: 'line-2', aiTotalCost: 0, aiUnitCost: 5, quantity: 0,
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
    db.boqRevision.findFirst.mockResolvedValue(revision());
    db.costCentre.findFirst.mockResolvedValue({ id: 'cc-1', code: 'CC01', name: 'North Wing' });
    db.procurementRequest.count.mockResolvedValue(4);
    db.procurementRequest.create.mockResolvedValue({ id: 'pr-1', prNumber: 'PR-2026-000005' });
    db.pRLine.create.mockResolvedValue({ id: 'pr-line' });
    db.boqRevision.update.mockResolvedValue({ id: 'revision-1' });
    db.boq.update.mockResolvedValue({ id: 'boq-1' });
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
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

  it('applies tenant and query filters and derives unique or fallback categories', async () => {
    db.procurementRequest.findMany.mockResolvedValueOnce([
      { id: 'pr-1', lines: [{ category: 'Electrical' }, { category: 'Electrical' }, { category: null }], boq: { category: 'Fallback' } },
      { id: 'pr-2', lines: [], boq: { category: 'Civil' } },
      { id: 'pr-3', lines: [], boq: { category: null } },
    ]);
    await expect(GET(getRequest('?projectId=p-1&costCentreId=cc-1&status=APPROVED&search=wire'))).resolves.toMatchObject({
      ok: true, data: [
        { id: 'pr-1', categories: ['Electrical'] },
        { id: 'pr-2', categories: ['Civil'] },
        { id: 'pr-3', categories: ['Standard'] },
      ],
    });
    expect(db.procurementRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1', projectId: 'p-1', costCentreId: 'cc-1', status: UI_STRINGS.common.aPPROVED,
        OR: [
          { prNumber: { contains: 'wire' } }, { title: { contains: 'wire' } }, { requestedBy: { contains: 'wire' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    }));
    db.procurementRequest.findMany.mockResolvedValueOnce([{ id: 'pr-empty', lines: [] }]);
    await expect(GET(getRequest())).resolves.toMatchObject({ ok: true, data: [{ id: 'pr-empty', categories: ['Standard'] }] });
    expect(db.procurementRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });

  it('validates mandatory revision and cost-centre references and selected lines', async () => {
    await expect(POST(postRequest({}))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionIDAndCostCentreIDAreMandatory, status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ boqRevisionId: 'missing', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.bOQRevisionNotFound, status: 404 });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'wrong-cc' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.costCentreNotFoundForThisProject, status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce(revision({ lines: [] }));
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce(revision());
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: ['missing-line'] }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.noValidBOQLinesAvailableToGeneratePR, status: 400,
    });
  });

  it('creates and auto-submits a PR from selected BOQ lines, copying traceable line details', async () => {
    const result = await POST(postRequest({
      boqRevisionId: 'revision-1', costCentreId: 'cc-1', projectId: 'project-override', title: '  Urgent cabling ',
      requiredDate: '2026-12-01', selectedLineIds: ['line-1', 'line-2'], autoSubmit: true,
    }));
    expect(result).toMatchObject({ ok: true, status: 201, data: {
      prId: 'pr-1', prNumber: 'PR-2026-000005', totalEstimatedValue: 35, totalLines: 2, status: 'PR_PENDING_PROJECT_APPROVAL',
    } });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'cc-1', projectId: 'project-override', tenantId: 'tenant-1' } });
    expect(db.procurementRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', projectId: 'project-override', prNumber: expect.stringMatching(/^PR-\d{4}-000005$/),
      costCentreId: 'cc-1', boqId: 'boq-1', boqRevisionId: 'revision-1', title: 'Urgent cabling',
      totalEstimatedValue: 35, totalLines: 2, status: 'PR_PENDING_PROJECT_APPROVAL', requestedBy: 'user-1', requiredDate: new Date('2026-12-01'),
    }) });
    expect(db.pRLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      prId: 'pr-1', boqLineId: 'line-1', lineNumber: UI_STRINGS.common.copyefwnq4, itemDescription: 'Copper wire', specification: '2 core',
      category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, subcategory: 'Cable', uom: 'MTR', quantity: 3, estimatedRate: 10, estimatedValue: 30,
      drawingReference: 'D-1', costCentre: 'CC01 North Wing',
    }) });
    expect(db.pRLine.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      boqLineId: 'line-2', lineNumber: UI_STRINGS.common.copyf9vgt1, itemDescription: 'Panel', category: UI_STRINGS.common.general, subcategory: null,
      uom: UI_STRINGS.common.nOS, quantity: 1, estimatedRate: 5, estimatedValue: 5, drawingReference: null,
    }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { costCentreId: 'cc-1', prStatus: 'PR_PENDING_PROJECT_APPROVAL' } });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-1' }, data: { costCentreId: 'cc-1', purpose: 'BOTH' } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityType: 'PR', entityId: 'pr-1', action: 'PR_CREATED' }) });
  });

  it('creates a draft PR using revision defaults when optional request values are absent', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(revision({
      boq: { projectId: 'project-1', boqCode: 'BOQ-000001', purpose: 'PR' },
      lines: [{ id: 'line-3', aiTotalCost: null, aiUnitCost: null, quantity: null, originalDescription: 'Pump' }],
    }));
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', selectedLineIds: [] }))).resolves.toMatchObject({
      ok: true, data: { totalEstimatedValue: 0, totalLines: 1, status: 'PR_DRAFT' },
    });
    expect(db.procurementRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      projectId: 'project-1', title: 'PR for North Wing (BOQ-000001 R2)', requiredDate: null, status: 'PR_DRAFT',
    }) });
    expect(db.pRLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      itemDescription: 'Pump', specification: undefined, quantity: 1, estimatedRate: 0, estimatedValue: 0,
    }) });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-1' }, data: { costCentreId: 'cc-1', purpose: 'PR' } });
  });

  it('returns clear errors for malformed requests and failed persistence', async () => {
    const badJson = { json: jest.fn().mockRejectedValue(new Error('invalid PR body')) } as unknown as NextRequest;
    await expect(POST(badJson)).resolves.toEqual({ ok: false, error: 'invalid PR body', status: 500 });
    const unknownFailure = { json: jest.fn().mockRejectedValue({}) } as unknown as NextRequest;
    await expect(POST(unknownFailure)).resolves.toEqual({ ok: false, error: 'Failed to create Procurement Request.', status: 500 });
    db.procurementRequest.create.mockRejectedValueOnce(new Error('database write failed'));
    await expect(POST(postRequest({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({
      ok: false, error: 'database write failed', status: 500,
    });
  });
});
