import { MAX_BOQ_BATCH_LINES } from '../src/lib/d1-batch.constants';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/boq/estimate-cost/route';
import {
  BOQ_COST_ESTIMATE_AUDIT_INSERT_AFTER_UPDATE_SQL,
  BOQ_COST_ESTIMATE_LINES_UPDATE_JSON_SQL,
  BOQ_COST_ESTIMATE_REVISION_UPDATE_SQL,
} from '../src/app/api/boq/estimate-cost/route.constants';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: { findFirst: jest.fn() },
    boq: { findFirst: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
}));
jest.mock('../src/lib/d1-batch', () => ({ ...jest.requireActual('../src/lib/d1-batch'), writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const batch = writeD1BatchAtomically as jest.Mock;
const log = writeStructuredLog as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', role: 'ADMIN' };
const request = (body: unknown, requestId?: string) => new NextRequest('http://localhost/api/boq/estimate-cost', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(requestId ? { 'x-request-id': requestId } : {}) },
  body: JSON.stringify(body),
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
    id: 'revision-1', tenantId: 'tenant-1', boqId: 'boq-1', updatedAt: new Date('2026-01-01T00:00:00.000Z'), lines,
    boq: {
      projectId: 'project-1', project: { areaSqFt: 500 },
      costCentre: { areaSqFt: 1000 }, areaSqFt: 750, boqCode: 'BOQ-001',
    },
    ...overrides,
  };
}

describe('BOQ estimate cost API', () => {
  let activeLines: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    activeLines = [];
    db.boqRevision.findFirst.mockResolvedValue(revision());
    db.boq.findFirst.mockResolvedValue(null);
    batch.mockImplementation(async (statements: Array<{ values: unknown[] }>) => {
      const updates = JSON.parse(String(statements[0].values[0])) as unknown[];
      return [
        { success: true, meta: { changes: updates.length } },
        { success: true, meta: { changes: 1 } },
        { success: true, meta: { changes: 1 } },
      ];
    });
    log.mockResolvedValue(undefined);
  });

  it('checks access, validates the reference, and resolves the latest revision through its BOQ', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(POST(request({}))).resolves.toBe(denied);
    await expect(POST(request({}))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.bOQRevisionIDOrBOQIDIsRequired,
      status: 400,
    });
    await expect(POST(request({ boqId: 123 }))).resolves.toMatchObject({ ok: false, status: 400 });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-missing-revision', revisions: [] });
    await expect(POST(request({ boqId: 'boq-missing-revision' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.bOQRevisionNotFound,
      status: 404,
    });

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-2', projectId: 'project-2', costCentreId: 'cc-2',
      areaSqFt: 0, project: { areaSqFt: 0 }, costCentre: { areaSqFt: 0 },
      revisions: [revision([], { id: 'revision-2', boqId: 'boq-2', boq: undefined })],
    });
    await expect(POST(request({ boqId: 'boq-2' }))).resolves.toMatchObject({
      ok: true,
      data: { boqRevisionId: 'revision-2', lineCount: 0, areaSqFt: null, costPerSqFt: null },
    });
    expect(db.boq.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'boq-2', tenantId: 'tenant-1' },
      include: expect.objectContaining({ revisions: expect.objectContaining({ take: 1 }) }),
    }));
  });

  it('estimates benchmark and fallback costs while preserving missing or invalid quantities in one atomic batch', async () => {
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
    const result = await POST(request({ boqRevisionId: 'revision-1', lineIds: [] }, 'req-cost-1'));
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
    expect(db.boqRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'revision-1', tenantId: 'tenant-1' },
      include: expect.objectContaining({ lines: expect.objectContaining({
        where: { isDeleted: false },
        take: MAX_BOQ_BATCH_LINES + 1,
        orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
      }) }),
    }));
    expect(batch).toHaveBeenCalledTimes(1);
    const statements = batch.mock.calls[0][0];
    expect(statements.map(({ sql }: { sql: string }) => sql)).toEqual([
      BOQ_COST_ESTIMATE_LINES_UPDATE_JSON_SQL,
      BOQ_COST_ESTIMATE_REVISION_UPDATE_SQL,
      BOQ_COST_ESTIMATE_AUDIT_INSERT_AFTER_UPDATE_SQL,
    ]);
    expect(statements[0].values[1]).toBe('tenant-1');
    expect(statements[0].values[2]).toBe('revision-1');
    expect(JSON.parse(String(statements[0].values[0]))).toHaveLength(10);
    expect(statements[1].values[4]).toBe(10);
    expect(statements[2].values[1]).toBe('tenant-1');
  });

  it('uses tenant-scoped line filters, stable selected IDs, revision fallback, and a zero-area result', async () => {
    db.boqRevision.findFirst.mockResolvedValueOnce(revision([line({ id: 'selected', quantity: 3, standardDescription: 'LED light' })]));
    await expect(POST(request({ boqRevisionId: 'revision-1', lineIds: ['selected', 'selected'] }))).resolves.toMatchObject({
      ok: true, data: { totalEstimatedBenchmarkValue: 6300, areaSqFt: 1000, costPerSqFt: 6.3 },
    });
    expect(db.boqRevision.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'revision-1', tenantId: 'tenant-1' },
      include: expect.objectContaining({ lines: expect.objectContaining({ where: { isDeleted: false, id: { in: ['selected'] } } }) }),
    }));

    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-2', projectId: 'project-2', areaSqFt: 0, project: { areaSqFt: 0 }, costCentre: { areaSqFt: 0 },
      revisions: [revision([line({ id: 'fallback', quantity: 1, standardDescription: 'Paint' })], { id: 'revision-2', boqId: 'boq-2' })],
    });
    await expect(POST(request({ boqId: 'boq-2', lineIds: ['fallback'] }))).resolves.toMatchObject({
      ok: true, data: { boqRevisionId: 'revision-2', areaSqFt: null, costPerSqFt: null },
    });
    expect(db.boq.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'boq-2', tenantId: 'tenant-1' } }));
  });

  it('rejects malformed and oversized line selections before writing, and rejects unbounded revisions', async () => {
    await expect(POST(request({ boqRevisionId: 'revision-1', lineIds: 'line-1' }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(request({ boqRevisionId: 'revision-1', lineIds: [1] }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(POST(request({ boqRevisionId: 'revision-1', lineIds: Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, (_, index) => `line-${index}`) })))
      .resolves.toMatchObject({ ok: false, status: 400 });
    expect(db.boqRevision.findFirst).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();

    db.boqRevision.findFirst.mockResolvedValueOnce(revision(Array.from({ length: MAX_BOQ_BATCH_LINES + 1 }, (_, index) => line({ id: `line-${index}` }))));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toMatchObject({ ok: false, status: 400 });
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns a generic error and logs a stale or partial result guard failure', async () => {
    batch.mockResolvedValueOnce([
      { success: true, meta: { changes: 1 } },
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 0 } },
    ]);
    await expect(POST(request({ boqRevisionId: 'revision-1' }, 'req-conflict'))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.aiCostEstimationFailed,
      status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'boq.cost_estimation_failed', expect.objectContaining({
      operation: 'estimate_boq_costs',
      requestId: 'req-conflict',
      tenantId: 'tenant-1',
      boqRevisionId: 'revision-1',
      error: expect.objectContaining({ name: 'Error' }),
    }));
  });

  it('logs caught query errors safely and preserves the generic response if log storage fails', async () => {
    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('database detail must not reach the client'));
    log.mockRejectedValueOnce(new Error('local log unavailable'));
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toEqual({
      ok: false,
      error: UI_STRINGS.common.userMessages.aiCostEstimationFailed,
      status: 500,
    });
    expect(log).toHaveBeenCalledWith('error', 'boq.cost_estimation_failed', expect.objectContaining({
      error: { name: 'Error', message: 'database detail must not reach the client' },
      requestId: null,
    }));

    db.boqRevision.findFirst.mockRejectedValueOnce('non-error throw');
    log.mockResolvedValueOnce(undefined);
    await expect(POST(request({ boqRevisionId: 'revision-1' }))).resolves.toMatchObject({
      ok: false,
      error: UI_STRINGS.common.userMessages.aiCostEstimationFailed,
      status: 500,
    });
    expect(log).toHaveBeenLastCalledWith('error', 'boq.cost_estimation_failed', expect.objectContaining({ error: { type: 'string' } }));
  });
});
