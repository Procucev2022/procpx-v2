import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/financial/budget-vs-actual/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '../src/lib/observability/server-logger';


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    project: { findFirst: jest.fn() },
  budgetTransaction: { findMany: jest.fn(), groupBy: jest.fn() },
  ppoLine: { findMany: jest.fn(), groupBy: jest.fn() },
  actualCostTransaction: { findMany: jest.fn(), groupBy: jest.fn() },
    boqLine: { findMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  getListPageWindow: jest.fn((searchParams: URLSearchParams) => {
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.max(1, Number(searchParams.get('pageSize')) || 50);
    return { page, pageSize, skip: (page - 1) * pageSize };
  }),
}));
jest.mock('../src/lib/observability/server-logger', () => ({
  writeStructuredLog: jest.fn().mockResolvedValue(undefined),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const rawQuery = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const successResult = apiSuccess as jest.Mock;
const errorResult = apiError as jest.Mock;
const context = { tenantId: 'tenant-1' };

function request(query = '') {
  return { url: `http://localhost/api/financial/budget-vs-actual${query}` } as NextRequest;
}

describe('budget versus actual report route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
    db.project.findFirst.mockResolvedValue({
      id: 'project-1', projectCode: 'P-1', name: 'Main project',
      costCentres: [
        { id: 'cc-1', code: 'CC-1', name: 'Electrical', areaSqFt: 100 },
        { id: 'cc-2', code: 'CC-2', name: 'Storage', areaSqFt: 0 },
      ],
    });
    rawQuery.mockResolvedValue([
      { costCentreId: 'cc-1', category: 'Electrical', budgetAmount: 1000, committedAmount: 800, actualAmount: 1200 },
      { costCentreId: null, category: 'General', budgetAmount: 200, committedAmount: 0, actualAmount: 50 },
      { costCentreId: null, category: 'Electrical', budgetAmount: 0, committedAmount: 0, actualAmount: 0 },
    ]);
    db.boqLine.count.mockResolvedValue(3);
    db.budgetTransaction.findMany.mockResolvedValue([
      { boqLineId: 'line-1', quantity: 5, amount: 500 },
      { boqLineId: 'line-1', quantity: 5, amount: 500 },
      { boqLineId: null, quantity: 10, amount: 1000 },
    ]);
    db.ppoLine.findMany.mockResolvedValue([
      { id: 'ppo-line-1', boqLineId: 'line-1', orderedQuantity: 8, orderedAmount: 800 },
      { id: 'ppo-line-unlinked', boqLineId: null, orderedQuantity: 100, orderedAmount: 10000 },
    ]);
    db.actualCostTransaction.findMany.mockResolvedValue([
      { boqLineId: 'line-1', actualQuantity: 12, actualAmount: 1200 },
      { boqLineId: 'line-2', actualQuantity: 1, actualAmount: 50 },
      { boqLineId: null, actualQuantity: 99, actualAmount: 9999 },
    ]);
    db.boqLine.findMany.mockResolvedValue([
      {
        id: 'line-1', lineNumber: '1', itemCode: 'CAB-1', originalDescription: 'Copper cable',
        specification: null, aiSuggestedSpec: '4C x 25mm', category: { name: 'Electrical' }, subcategoryId: 'power',
        uomRaw: 'm', quantity: 10, aiUnitCost: 90, aiTotalCost: 900,
        revision: { revisionCode: 'R1', boq: { boqCode: 'BOQ-1' }, costCentre: { id: 'cc-1', code: 'CC-1', name: 'Electrical', areaSqFt: 100 } },
      },
      {
        id: 'line-2', lineNumber: '2', itemCode: null, originalDescription: 'Installation',
        specification: 'Labour', aiSuggestedSpec: 'Fallback spec', category: null, subcategoryId: null,
        uomRaw: '', quantity: 2, aiUnitCost: 100, aiTotalCost: 200,
        revision: { revisionCode: null, boq: null, costCentre: null },
      },
      {
        id: 'line-3', lineNumber: '3', originalDescription: 'Unpriced item',
        specification: null, aiSuggestedSpec: null, category: { name: 'Electrical' }, subcategoryId: null,
        uomRaw: null, quantity: 0, aiUnitCost: 0, aiTotalCost: 0, revision: null,
      },
    ]);
    db.budgetTransaction.groupBy.mockResolvedValue([
      { boqLineId: 'line-1', _sum: { amount: 1000, quantity: 10 }, _count: { _all: 2 } },
    ]);
    db.ppoLine.groupBy.mockResolvedValue([
      { boqLineId: 'line-1', _sum: { orderedQuantity: 8, orderedAmount: 800 }, _count: { _all: 1 } },
    ]);
    db.actualCostTransaction.groupBy.mockResolvedValue([
      { boqLineId: 'line-1', _sum: { actualQuantity: 12, actualAmount: 1200 }, _count: { _all: 1 } },
      { boqLineId: 'line-2', _sum: { actualQuantity: 1, actualAmount: 50 }, _count: { _all: 1 } },
    ]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('requires an authorized project and returns a tenant-scoped not-found response', async () => {
    const denied = { ok: false, status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(GET(request('?projectId=project-1'))).resolves.toBe(denied);
    await expect(GET(request())).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiFinancialBudgetVsActualRoute.projectIdIsRequired, status: 400 });
    expect(db.project.findFirst).not.toHaveBeenCalled();

    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(GET(request('?projectId=foreign-project'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.projectNotFound, status: 404 });
    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-project', tenantId: 'tenant-1' },
      select: expect.objectContaining({ costCentres: expect.objectContaining({ select: { id: true, code: true, name: true, areaSqFt: true } }) }),
    });
  });

  it('builds filtered budget, commitment, actual, variance, cost centre, and category reports', async () => {
    rawQuery.mockResolvedValueOnce([
      { costCentreId: 'cc-1', category: 'Electrical', budgetAmount: 1000, committedAmount: 800, actualAmount: 1200 },
    ]);
    db.boqLine.count.mockResolvedValueOnce(1);
    db.boqLine.findMany.mockResolvedValueOnce([{
        id: 'line-1', lineNumber: '1', itemCode: 'CAB-1', originalDescription: 'Copper cable',
        specification: null, aiSuggestedSpec: '4C x 25mm', category: { name: 'Electrical' }, subcategoryId: 'power',
        uomRaw: 'm', quantity: 10, aiUnitCost: 90, aiTotalCost: 900,
        revision: { revisionCode: 'R1', boq: { boqCode: 'BOQ-1' }, costCentre: { id: 'cc-1', code: 'CC-1', name: 'Electrical', areaSqFt: 100 } },
    }]);
    const result = await GET(request('?projectId=project-1&costCentreId=cc-1&category=Electrical'));
    expect(result).toMatchObject({ ok: true, data: {
      project: { id: 'project-1', projectCode: 'P-1', name: 'Main project' },
      kpis: { totalBudget: 1000, totalCommitted: 800, totalActual: 1200, totalRemaining: -200, totalBudgetVariance: -200 },
    } });
    expect(db.budgetTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', projectId: 'project-1', status: { in: [UI_STRINGS.common.aPPROVED, 'PROJECT_APPROVED', 'BUDGET_APPROVED', 'UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL'] },
      costCentreId: 'cc-1', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, boqLineId: { in: ['line-1'] },
    } }));
    expect(db.ppoLine.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', projectId: 'project-1', status: { not: 'CANCELLED' }, costCentreId: 'cc-1', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, boqLineId: { in: ['line-1'] },
    } }));
    expect(db.actualCostTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', projectId: 'project-1', status: { in: [UI_STRINGS.common.aPPROVED, 'VERIFIED'] }, costCentreId: 'cc-1', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, boqLineId: { in: ['line-1'] },
    } }));
    const summaryQuery = rawQuery.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(summaryQuery.sql).toContain('revision."costCentreId" = ?');
    expect(summaryQuery.sql).toContain('category."name" = ?');
    expect(summaryQuery.values).toEqual(expect.arrayContaining([
      'tenant-1', 'project-1', 'cc-1', UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical,
    ]));
    expect(db.budgetTransaction.findMany).not.toHaveBeenCalled();
    expect(db.ppoLine.findMany).not.toHaveBeenCalled();
    expect(db.actualCostTransaction.findMany).not.toHaveBeenCalled();
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', isDeleted: false, revision: { boq: { projectId: 'project-1' }, costCentreId: 'cc-1' },
      category: { is: { name: 'Electrical' } },
    } }));

    const data = (result as any).data;
    expect(data.lineReports[0]).toMatchObject({
      boqLineId: 'line-1', itemCode: 'CAB-1', specification: '4C x 25mm', category: 'Electrical',
      budgetQuantity: 10, budgetRate: 100, budgetAmount: 1000, committedQuantity: 8,
      committedRate: 100, committedAmount: 800, actualQuantity: 12, actualRate: 100, actualAmount: 1200,
      budgetVariance: -200, status: 'OVER_BUDGET', posCount: 1, actualTransactionsCount: 1,
    });
    expect(data.lineReports).toHaveLength(1);
    expect(data.costCentresSummary[0]).toMatchObject({ id: 'cc-1', budgetAmount: 1000, actualAmount: 1200, costPerSqFtBudget: 10, costPerSqFtActual: 12 });
    expect(data.costCentresSummary[1]).toMatchObject({ id: 'cc-2', areaSqFt: 0, costPerSqFtBudget: 0, costPerSqFtActual: 0 });
    expect(data.categoriesSummary).toEqual([
      expect.objectContaining({ category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, budgetAmount: 1000, actualAmount: 1200 }),
    ]);
    expect(data.lineReportsPagination).toEqual({ page: 1, pageSize: 50, total: 1, totalPages: 1, hasMore: false });
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ lineReports: expect.any(Array) }));
  });

  it('applies the General category filter to BOQ lines without a category and to financial aggregates', async () => {
    rawQuery.mockResolvedValueOnce([
      { costCentreId: null, category: UI_STRINGS.common.general, budgetAmount: 200, committedAmount: 0, actualAmount: 50 },
    ]);
    db.boqLine.count.mockResolvedValueOnce(1);
    db.boqLine.findMany.mockResolvedValueOnce([{
        id: 'line-2', lineNumber: '2', itemCode: null, originalDescription: 'Installation',
        specification: 'Labour', aiSuggestedSpec: 'Fallback spec', category: null,
        subcategoryId: null, uomRaw: '', quantity: 2, aiUnitCost: 100, aiTotalCost: 200,
        revision: { revisionCode: null, boq: null, costCentre: null },
    }]);
    db.budgetTransaction.groupBy.mockResolvedValueOnce([]);
    db.ppoLine.groupBy.mockResolvedValueOnce([]);
    db.actualCostTransaction.groupBy.mockResolvedValueOnce([
      { boqLineId: 'line-2', _sum: { actualQuantity: 1, actualAmount: 50 }, _count: { _all: 1 } },
    ]);

    const result = await GET(request(`?projectId=project-1&category=${encodeURIComponent(UI_STRINGS.common.general)}`));
    expect(db.boqLine.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({
      OR: [{ categoryId: null }, { category: { is: { name: UI_STRINGS.common.general } } }],
    }) }));
    const generalQuery = rawQuery.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(generalQuery.sql).toContain('(line."categoryId" IS NULL OR category."name" = ?)');
    expect(generalQuery.values).toContain(UI_STRINGS.common.general);
    expect(result).toMatchObject({ ok: true, data: {
      kpis: { totalBudget: 200, totalActual: 50 },
      categoriesSummary: [expect.objectContaining({ category: UI_STRINGS.common.general, budgetAmount: 200, actualAmount: 50 })],
      lineReports: [expect.objectContaining({ boqLineId: 'line-2', category: UI_STRINGS.common.general })],
    } });
  });

  it('pages line details while keeping the full project aggregate totals', async () => {
    rawQuery.mockResolvedValueOnce([
      { costCentreId: 'cc-1', category: 'Electrical', budgetAmount: 1000, committedAmount: 800, actualAmount: 1200 },
      { costCentreId: null, category: UI_STRINGS.common.general, budgetAmount: 200, committedAmount: 0, actualAmount: 50 },
      { costCentreId: null, category: 'Electrical', budgetAmount: 0, committedAmount: 0, actualAmount: 0 },
    ]);
    db.boqLine.count.mockResolvedValueOnce(3);
    db.boqLine.findMany.mockResolvedValueOnce([{
        id: 'line-2', lineNumber: '2', itemCode: null, originalDescription: 'Installation', specification: 'Labour',
        aiSuggestedSpec: 'Fallback spec', category: null, subcategoryId: null, uomRaw: '', quantity: 2, aiUnitCost: 100, aiTotalCost: 200,
        revision: { revisionCode: 'R1', boq: { boqCode: 'BOQ-1' }, costCentre: null },
    }]);

    const result = await GET(request('?projectId=project-1&page=2&pageSize=1'));
    expect(result).toMatchObject({ ok: true, data: {
      kpis: { totalBudget: 1200, totalCommitted: 800, totalActual: 1250 },
      lineReports: [expect.objectContaining({ boqLineId: 'line-2', budgetAmount: 200 })],
      lineReportsPagination: { page: 2, pageSize: 1, total: 3, totalPages: 3, hasMore: true },
    } });
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 1 }));
    expect(db.budgetTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ boqLineId: { in: ['line-2'] } }) }));
    expect(db.ppoLine.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ boqLineId: { in: ['line-2'] } }) }));
    expect(db.actualCostTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ boqLineId: { in: ['line-2'] } }) }));
    expect(db.budgetTransaction.findMany).not.toHaveBeenCalled();
    expect(db.ppoLine.findMany).not.toHaveBeenCalled();
    expect(db.actualCostTransaction.findMany).not.toHaveBeenCalled();
  });

  it('chunks the three line-detail aggregates when a report page contains 100 lines', async () => {
    db.boqLine.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({
      id: `line-${index + 1}`, lineNumber: String(index + 1), quantity: 1, aiUnitCost: 1, aiTotalCost: 1,
      category: null, revision: null,
    })));

    await GET(request('?projectId=project-1&pageSize=100'));

    for (const model of [db.budgetTransaction, db.ppoLine, db.actualCostTransaction]) {
      expect(model.groupBy).toHaveBeenCalledTimes(2);
      expect(model.groupBy.mock.calls.map(([query]) => query.where.boqLineId.in.length)).toEqual([90, 10]);
    }
  });

  it('handles empty datasets and unfiltered project queries', async () => {
    db.budgetTransaction.findMany.mockResolvedValue([]);
    db.ppoLine.findMany.mockResolvedValue([]);
    db.actualCostTransaction.findMany.mockResolvedValue([]);
    db.boqLine.findMany.mockResolvedValue([]);
    rawQuery.mockResolvedValueOnce([]);
    db.boqLine.count.mockResolvedValueOnce(0);
    const result = await GET(request('?projectId=project-1'));
    expect(result).toMatchObject({ ok: true, data: { kpis: {
      totalBudget: 0, totalCommitted: 0, totalActual: 0, totalRemaining: 0, totalVariancePercent: 0,
    }, lineReports: [], categoriesSummary: [] } });
    expect(db.budgetTransaction.groupBy).not.toHaveBeenCalled();
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', isDeleted: false, revision: { boq: { projectId: 'project-1' } },
    } }));
  });

  it('defaults sparse line and aggregate values without loading unmatched transaction history', async () => {
    rawQuery.mockResolvedValueOnce([
      { costCentreId: 'cc-1', category: null, budgetAmount: null, committedAmount: null, actualAmount: null },
      { costCentreId: null, category: UI_STRINGS.common.general, budgetAmount: 0, committedAmount: 0, actualAmount: 0 },
    ]);
    db.boqLine.count.mockResolvedValueOnce(1);
    db.boqLine.findMany.mockResolvedValueOnce([{
      id: 'sparse-line', lineNumber: '1', quantity: 0, aiUnitCost: null, aiTotalCost: null,
      category: null, revision: null,
    }]);
    db.budgetTransaction.groupBy.mockResolvedValueOnce([{
      boqLineId: 'unmatched-budget-line', _sum: { amount: null, quantity: null }, _count: { _all: 0 },
    }]);
    db.ppoLine.groupBy.mockResolvedValueOnce([{
      boqLineId: 'unmatched-ppo-line', _sum: { orderedAmount: null, orderedQuantity: null }, _count: { _all: 0 },
    }]);
    db.actualCostTransaction.groupBy.mockResolvedValueOnce([{
      boqLineId: 'unmatched-actual-line', _sum: { actualAmount: null, actualQuantity: null }, _count: { _all: 0 },
    }]);

    const result = await GET(request('?projectId=project-1'));
    expect(result).toMatchObject({ ok: true, data: {
      kpis: { totalBudget: 0, totalCommitted: 0, totalActual: 0 },
      lineReports: [expect.objectContaining({
        boqLineId: 'sparse-line', category: UI_STRINGS.common.general,
        budgetQuantity: 0, budgetRate: 0, budgetAmount: 0,
        committedQuantity: 0, committedAmount: 0,
        actualQuantity: 0, actualRate: 0, actualAmount: 0,
        posCount: 0, actualTransactionsCount: 0,
      })],
      categoriesSummary: [expect.objectContaining({ category: UI_STRINGS.common.general, budgetAmount: 0 })],
    } });
  });

  it('returns a server error if one of the project cost queries fails', async () => {
    const failure = new Error('actual cost query failed');
    db.actualCostTransaction.groupBy.mockRejectedValueOnce(failure);
    await expect(GET(request('?projectId=project-1'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToGenerateBudgetVsActualAnalysis, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'financial.budget_vs_actual.failed', expect.objectContaining({
      operation: 'read_budget_vs_actual', route: '/api/financial/budget-vs-actual', tenantId: 'tenant-1',
      projectId: 'project-1', error: failure,
    }));
    expect(errorResult).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToGenerateBudgetVsActualAnalysis, 500);
  });
});
