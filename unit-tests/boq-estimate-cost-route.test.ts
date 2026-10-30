import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/estimate-cost/route';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn(), update: jest.fn() },
    boq: { findFirst: jest.fn() },
    boqLine: { update: jest.fn() },
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
const request = (body: unknown) => new NextRequest('http://localhost/api/boq/estimate-cost', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

function line(overrides: Record<string, any> = {}) {
  return {
    id: 'line-1', lineNumber: '1', standardDescription: 'Copper cable', originalDescription: 'Cable',
    quantity: 2, category: { name: 'Electrical' }, uom: { code: 'MTR' }, uomRaw: 'PCS',
    ...overrides,
  };
}

function revision(lines: any[] = [line()], overrides: Record<string, any> = {}) {
  return {
    id: 'revision-1', boqId: 'boq-1', lines,
    boq: {
      projectId: 'project-1', project: { areaSqFt: 500 },
      costCentre: { areaSqFt: 1000 }, areaSqFt: 750, boqCode: 'BOQ-001',
    },
    ...overrides,
  };
}

describe('BOQ estimate cost API', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    activeLines = [];
    db.boqRevision.findFirst.mockReset().mockResolvedValue(revision());
    db.boq.findFirst.mockReset().mockResolvedValue(null);
    db.boqRevision.update.mockReset().mockResolvedValue({ id: 'revision-1' });
    db.boqLine.update.mockReset().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
      const source = activeLines.find((item) => item.id === where.id) || {};
      return { ...source, ...data };
    });
    db.auditLog.create.mockReset().mockResolvedValue({ id: 'audit-1' });
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  let activeLines: any[] = [];

  it('checks access, requires a reference, and resolves a revision through its BOQ when needed', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({}),)).resolves.toBe(denied);
    await expect(POST(request({}))).resolves.toEqual({ ok: false, error: 'BOQ Revision ID or BOQ ID is required.', status: 400 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-missing-revision', revisions: [] });
    await expect(POST(request({ boqId: 'boq-missing-revision' }))).resolves.toEqual({ ok: false, error: 'BOQ Revision not found.', status: 404 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-2', projectId: 'project-2', costCentreId: 'cc-2',
      areaSqFt: 0, project: { areaSqFt: 0 }, costCentre: { areaSqFt: 0 },
      revisions: [{ id: 'revision-2', boqId: 'boq-2', lines: [], revisionCode: 'R2' }],
    });
    await expect(POST(request({ boqId: 'boq-2' }))).resolves.toMatchObject({ ok: true, data: { boqRevisionId: 'revision-2', lineCount: 0 } });
  });

  it('estimates benchmark and category fallback costs while preserving missing or invalid quantities', async () => {
    activeLines = [
      line({ id: 'cable', lineNumber: '1', standardDescription: 'Copper cable', quantity: 2 }),
      line({ id: 'electrical', lineNumber: '2', standardDescription: 'Uncatalogued device', quantity: 2, category: { name: 'Electrical works' }, uom: {}, uomRaw: 'PCS' }),
      line({ id: 'civil', lineNumber: '3', standardDescription: 'Uncatalogued finish', quantity: 2, category: { name: 'Interior finishes' } }),
      line({ id: 'material', lineNumber: '4', standardDescription: 'Uncatalogued supply', quantity: 1, category: { name: 'Material' } }),
      line({ id: 'other', lineNumber: '5', standardDescription: '', originalDescription: 'Uncatalogued item', quantity: undefined, category: null, uom: null, uomRaw: '' }),
      line({ id: 'zero', lineNumber: '6', standardDescription: 'Panel board', quantity: 0, category: null }),
      line({ id: 'invalid', lineNumber: '7', standardDescription: 'Uncatalogued item', quantity: 'bad', category: { name: 'Unknown' } }),
      line({ id: 'unknown-unit', lineNumber: '8', standardDescription: 'Uncatalogued item', quantity: 1, category: { name: 'Unknown' }, uom: null, uomRaw: '' }),
      line({ id: 'interior', lineNumber: '9', standardDescription: 'Reception counter', quantity: 1, category: null }),
      line({ id: 'blank', lineNumber: '10', standardDescription: '', originalDescription: '', quantity: 1, category: null }),
    ];
    db.boqRevision.findFirst.mockResolvedValueOnce(revision(activeLines));
    const result = await POST(request({ boqRevisionId: 'revision-1', lineIds: [] }));
    expect(result).toMatchObject({ ok: true, data: {
      boqRevisionId: 'revision-1', totalEstimatedBenchmarkValue: 25190, costPerSqFt: 25.19, areaSqFt: 1000, lineCount: 10,
      categoryBreakdown: { Material: 110, Electrical: 490, Civil: 290, Interior: 24000, Other: 300 },
      lines: [
        { id: 'cable', aiUnitCost: 65, aiTotalCost: 130, confidence: 'High', uom: 'MTR', status: 'COST GENERATED' },
        { id: 'electrical', aiUnitCost: 180, aiTotalCost: 360, confidence: 'Medium', uom: 'PCS', status: 'COST GENERATED' },
        { id: 'civil', aiUnitCost: 145, aiTotalCost: 290, status: 'COST GENERATED' },
        { id: 'material', aiUnitCost: 110, aiTotalCost: 110, status: 'COST GENERATED' },
        { id: 'other', aiUnitCost: 150, aiTotalCost: null, quantity: null, uom: 'NOS', status: 'QUANTITY REQUIRED' },
        { id: 'zero', aiUnitCost: 18500, aiTotalCost: null, quantity: null, status: 'QUANTITY REQUIRED' },
        { id: 'invalid', aiUnitCost: 150, aiTotalCost: null, status: 'QUANTITY REQUIRED' },
        { id: 'unknown-unit', aiUnitCost: 150, aiTotalCost: 150, uom: 'NOS', status: 'COST GENERATED' },
        { id: 'interior', aiUnitCost: 24000, aiTotalCost: 24000, status: 'COST GENERATED' },
        { id: 'blank', aiUnitCost: 150, aiTotalCost: 150, description: '', status: 'COST GENERATED' },
      ],
      unestimatedItems: [
        { id: 'other', reason: 'Quantity is pending input.' },
        { id: 'zero', reason: 'Quantity must be greater than zero.' },
        { id: 'invalid', reason: 'Quantity is pending input.' },
      ],
    } });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { preparationStatus: 'AI_COST_GENERATED' } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'AI_COST_GENERATED', entityId: 'revision-1' }) });
  });

  it('uses line filters, revision fallback, cost-centre area, and a zero-area result', async () => {
    activeLines = [line({ id: 'selected', quantity: 3, standardDescription: 'LED light' })];
    db.boqRevision.findFirst.mockResolvedValueOnce(revision(activeLines));
    await expect(POST(request({ boqRevisionId: 'revision-1', lineIds: ['selected'] }))).resolves.toMatchObject({
      ok: true, data: { totalEstimatedBenchmarkValue: 6300, areaSqFt: 1000, costPerSqFt: 6.3 },
    });
    expect(db.boqRevision.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'revision-1', tenantId: 'tenant-1' },
      include: { lines: { where: { isDeleted: false, id: { in: ['selected'] } }, include: { category: true, subcategory: true, uom: true } },
        boq: { include: { project: true, costCentre: true } } },
    }));

    activeLines = [line({ id: 'fallback', quantity: 1, standardDescription: 'Paint' })];
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-2', projectId: 'project-2', areaSqFt: 0, project: { areaSqFt: 0 }, costCentre: { areaSqFt: 0 },
      revisions: [{ id: 'revision-2', boqId: 'boq-2', revisionCode: 'R2', lines: activeLines }],
    });
    await expect(POST(request({ boqId: 'boq-2', lineIds: ['fallback'] }))).resolves.toMatchObject({
      ok: true, data: { boqRevisionId: 'revision-2', areaSqFt: null, costPerSqFt: null },
    });
    expect(db.boq.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'boq-2', tenantId: 'tenant-1' } }));
  });

  it('returns controlled errors for missing revisions and failed estimate operations', async () => {
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('estimate query failed'));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: 'estimate query failed', status: 500 });
    db.boqRevision.findFirst.mockRejectedValueOnce({});
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({ ok: false, error: 'AI cost estimation failed.', status: 500 });
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});
