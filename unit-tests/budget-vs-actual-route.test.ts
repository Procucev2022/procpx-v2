import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/financial/budget-vs-actual/route';
import { prisma } from '../src/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '../src/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    budgetTransaction: { findMany: jest.fn() },
    ppoLine: { findMany: jest.fn() },
    actualCostTransaction: { findMany: jest.fn() },
    boqLine: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
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
      where: { id: 'foreign-project', tenantId: 'tenant-1' }, include: { costCentres: true },
    });
  });

  it('builds filtered budget, commitment, actual, variance, cost centre, and category reports', async () => {
    const result = await GET(request('?projectId=project-1&costCentreId=cc-1&category=Electrical'));
    expect(result).toMatchObject({ ok: true, data: {
      project: { id: 'project-1', projectCode: 'P-1', name: 'Main project' },
      kpis: { totalBudget: 1200, totalCommitted: 800, totalActual: 1250, totalRemaining: -50, totalBudgetVariance: -50 },
    } });
    expect(db.budgetTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', projectId: 'project-1', status: { in: [UI_STRINGS.common.aPPROVED, 'PROJECT_APPROVED', 'BUDGET_APPROVED'] },
      costCentreId: 'cc-1', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical,
    } }));
    expect(db.ppoLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', projectId: 'project-1', status: { not: 'CANCELLED' }, costCentreId: 'cc-1', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical,
    } }));
    expect(db.actualCostTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', projectId: 'project-1', status: { in: [UI_STRINGS.common.aPPROVED, 'VERIFIED'] }, costCentreId: 'cc-1', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical,
    } }));
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', isDeleted: false, revision: { boq: { projectId: 'project-1' }, costCentreId: 'cc-1' },
    } }));

    const data = (result as any).data;
    expect(data.lineReports[0]).toMatchObject({
      boqLineId: 'line-1', itemCode: 'CAB-1', specification: '4C x 25mm', category: 'Electrical',
      budgetQuantity: 10, budgetRate: 100, budgetAmount: 1000, committedQuantity: 8,
      committedRate: 100, committedAmount: 800, actualQuantity: 12, actualRate: 100, actualAmount: 1200,
      budgetVariance: -200, status: 'OVER_BUDGET', posCount: 1, actualTransactionsCount: 1,
    });
    expect(data.lineReports[1]).toMatchObject({
      itemCode: '2', specification: 'Labour', category: 'General', subcategory: '', uom: 'NOS',
      boqCode: 'BOQ', revisionCode: 'R0', budgetQuantity: 2, budgetAmount: 200,
      actualQuantity: 1, actualAmount: 50, status: 'WITHIN_BUDGET',
    });
    expect(data.lineReports[2]).toMatchObject({ category: 'Electrical', budgetQuantity: 0, budgetAmount: 0, status: 'ON_TRACK' });
    expect(data.costCentresSummary[0]).toMatchObject({ id: 'cc-1', budgetAmount: 1000, actualAmount: 1200, costPerSqFtBudget: 10, costPerSqFtActual: 12 });
    expect(data.costCentresSummary[1]).toMatchObject({ id: 'cc-2', areaSqFt: 0, costPerSqFtBudget: 0, costPerSqFtActual: 0 });
    expect(data.categoriesSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, budgetAmount: 1000, actualAmount: 1200 }),
      expect.objectContaining({ category: UI_STRINGS.common.general, budgetAmount: 200, actualAmount: 50 }),
    ]));
    expect(successResult).toHaveBeenCalledWith(expect.objectContaining({ lineReports: expect.any(Array) }));
  });

  it('handles empty datasets and unfiltered project queries', async () => {
    db.budgetTransaction.findMany.mockResolvedValue([]);
    db.ppoLine.findMany.mockResolvedValue([]);
    db.actualCostTransaction.findMany.mockResolvedValue([]);
    db.boqLine.findMany.mockResolvedValue([]);
    const result = await GET(request('?projectId=project-1'));
    expect(result).toMatchObject({ ok: true, data: { kpis: {
      totalBudget: 0, totalCommitted: 0, totalActual: 0, totalRemaining: 0, totalVariancePercent: 0,
    }, lineReports: [], categoriesSummary: [] } });
    expect(db.budgetTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', projectId: 'project-1', status: { in: [UI_STRINGS.common.aPPROVED, 'PROJECT_APPROVED', 'BUDGET_APPROVED'] },
    } }));
    expect(db.boqLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'tenant-1', isDeleted: false, revision: { boq: { projectId: 'project-1' } },
    } }));
  });

  it('returns a server error if one of the project cost queries fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.actualCostTransaction.findMany.mockRejectedValueOnce(new Error('actual cost query failed'));
    await expect(GET(request('?projectId=project-1'))).resolves.toEqual({ ok: false, error: 'actual cost query failed', status: 500 });
    expect(errorResult).toHaveBeenCalledWith('actual cost query failed', 500);
  });
});
