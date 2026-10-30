import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { POST as createFromLibrary } from '../src/app/api/boq/from-standard-library/route';
import { POST as duplicateBoq } from '../src/app/api/boq/duplicate/route';
import { POST as addBoqToBudget } from '../src/app/api/budgets/add-boq/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    costCentre: { findFirst: jest.fn() },
    boq: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    boqRevision: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    boqLine: { create: jest.fn() },
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    budgetContribution: { create: jest.fn() },
    budgetTransaction: { count: jest.fn(), create: jest.fn() },
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
const context = { tenantId: 'tenant-1', userId: 'user-1', userEmail: 'user@example.test', role: 'CLIENT_ADMIN' };
const post = (body: unknown) => new NextRequest('http://localhost/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('BOQ generation from the standard library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('checks permission, required input, project, and optional cost centre', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{}] }))).resolves.toBe(denied);
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [] }))).resolves.toEqual({ ok: false, error: 'Project ID and a list of selected standard items are required.', status: 400 });
    await expect(createFromLibrary(post({ projectId: 'project-1', items: 'not-an-array' }))).resolves.toEqual({ ok: false, error: 'Project ID and a list of selected standard items are required.', status: 400 });
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(createFromLibrary(post({ projectId: 'missing', items: [{}] }))).resolves.toEqual({ ok: false, error: 'Project not found.', status: 404 });
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(createFromLibrary(post({ projectId: 'project-1', costCentreId: 'bad-cc', items: [{}] }))).resolves.toEqual({ ok: false, error: 'Cost centre not found for this project.', status: 404 });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'bad-cc', projectId: 'project-1', tenantId: 'tenant-1' } });
  });

  it('creates a draft BOQ and maps standard item categories, UOMs, quantities, and costs', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-1' });
    db.boq.count.mockResolvedValueOnce(8);
    db.boq.create.mockResolvedValueOnce({ id: 'boq-1', boqCode: 'BOQ-000009' });
    db.boqRevision.create.mockResolvedValueOnce({ id: 'revision-1', revisionCode: 'R0' });
    db.category.findMany.mockResolvedValueOnce([{ id: 'cat-1', name: 'Electrical' }]);
    db.uomMaster.findMany.mockResolvedValueOnce([{ id: 'uom-1', code: 'MTR' }]);
    db.boqLine.create.mockResolvedValue({ id: 'line' });
    const items = [
      { category: 'electrical', uom: 'mtr', itemCode: 'WIRE-1', standardDescription: 'Cable', detailedSpecification: 'Copper', quantity: '3.5', benchmarkRate: '10', brandMake: 'Acme' },
      { category: 'Unknown', uom: '', standardDescription: 'Other', quantity: 'invalid', benchmarkRate: 0 },
    ];
    await expect(createFromLibrary(post({ projectId: 'project-1', costCentreId: 'cc-1', items }))).resolves.toEqual({
      ok: true, data: { boqId: 'boq-1', revisionId: 'revision-1', boqCode: 'BOQ-000009', revisionCode: 'R0', totalLines: 2, qualityScore: 100 }, status: 201,
    });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'tenant-1', projectId: 'project-1', costCentreId: 'cc-1', boqCode: 'BOQ-000009', status: 'DRAFT', createdBy: 'user-1' }) });
    expect(db.boqRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ boqId: 'boq-1', revisionCode: 'R0', totalLines: 2, validLines: 2, sourceType: 'STANDARD_BOQ' }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      lineNumber: '1', itemCode: 'WIRE-1', categoryId: 'cat-1', uomId: 'uom-1', quantity: 3.5, aiUnitCost: 10, aiTotalCost: 35, brand: 'Acme',
    }) });
    expect(db.boqLine.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      lineNumber: '2', itemCode: 'STD-ITEM-2', categoryId: null, uomId: null, quantity: null, aiUnitCost: null, aiTotalCost: null, brand: null, uomRaw: 'NOS',
    }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BOQ_GENERATED_FROM_STANDARD_LIBRARY', entityId: 'boq-1', projectId: 'project-1' }) });
  });

  it('allows creation without a cost centre and reports generation failures', async () => {
    db.project.findFirst.mockResolvedValueOnce({ id: 'project-1' });
    db.boq.count.mockResolvedValueOnce(0);
    db.boq.create.mockResolvedValueOnce({ id: 'boq-2', boqCode: 'BOQ-000001' });
    db.boqRevision.create.mockResolvedValueOnce({ id: 'revision-2', revisionCode: 'R0' });
    db.category.findMany.mockResolvedValueOnce([]);
    db.uomMaster.findMany.mockResolvedValueOnce([]);
    db.boqLine.create.mockResolvedValueOnce({ id: 'line-1' });
    await createFromLibrary(post({ projectId: 'project-1', items: [{ standardDescription: 'Item' }] }));
    expect(db.boq.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ costCentreId: null }) });

    db.project.findFirst.mockRejectedValueOnce(new Error('BOQ setup failed'));
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{}] }))).resolves.toEqual({ ok: false, error: 'BOQ setup failed', status: 500 });
    db.project.findFirst.mockRejectedValueOnce({});
    await expect(createFromLibrary(post({ projectId: 'project-1', items: [{}] }))).resolves.toEqual({ ok: false, error: 'Standard BOQ generation failed.', status: 500 });
  });
});

describe('BOQ duplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('validates access and source BOQ before cloning', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toBe(denied);
    await expect(duplicateBoq(post({}))).resolves.toEqual({ ok: false, error: 'boqId is required', status: 400 });
    db.boq.findFirst.mockResolvedValueOnce(null);
    await expect(duplicateBoq(post({ boqId: 'missing' }))).resolves.toEqual({ ok: false, error: 'Source BOQ not found', status: 404 });
  });

  it('duplicates a BOQ, its latest revision and lines, with a fresh draft identity', async () => {
    const line = {
      lineNumber: '1', itemCode: 'ITEM-1', originalDescription: 'Original', standardDescription: 'Standard', specification: 'Spec',
      categoryId: 'cat-1', subcategoryId: 'sub-1', uomId: 'uom-1', uomRaw: 'NOS', quantity: 3, location: 'East', drawingReference: 'D1',
      brand: 'Acme', model: 'M1', material: 'Steel', grade: 'A', aiSuggestedDescription: 'AI', aiSuggestedSpec: 'AI spec', aiConfidence: 0.9,
      aiUnitCost: 100, aiTotalCost: 300, costConfidence: 0.8, costSource: 'Catalogue', costMethod: 'Benchmark', remarks: 'Keep',
    };
    db.boq.findFirst.mockResolvedValueOnce({
      id: 'boq-1', boqCode: 'SOURCE', projectId: 'project-1', costCentreId: 'cc-1', title: null, category: 'Electrical', scope: 'Wiring', purpose: 'PR',
      project: { projectCode: 'P-1' }, revisions: [{ sourceType: null, notes: null, validLines: 1, lines: [line] }],
    });
    db.boq.count.mockResolvedValueOnce(2);
    const createdBoq = { id: 'boq-2', boqCode: 'BOQ-P-1-003', title: 'SOURCE (Copy)' };
    db.boq.create.mockResolvedValueOnce(createdBoq);
    db.boqRevision.create.mockResolvedValueOnce({ id: 'revision-2', revisionCode: 'R0' });
    db.boqLine.create.mockResolvedValueOnce({ id: 'line-copy' });
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-2', totalLines: 1 });

    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toEqual({
      ok: true, data: { success: true, boq: createdBoq, boqId: 'boq-2', boqCode: 'BOQ-P-1-003', message: 'BOQ successfully duplicated as BOQ-P-1-003' }, status: 201,
    });
    expect(db.boq.create).toHaveBeenCalledWith({ data: expect.objectContaining({ boqCode: 'BOQ-P-1-003', title: 'SOURCE (Copy)', purpose: 'PR', createdBy: 'user@example.test', status: 'DRAFT' }) });
    expect(db.boqRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ revisionCode: 'R0', budgetStatus: 'NOT_ADDED_TO_BUDGET', prStatus: 'PR_DRAFT', sourceType: 'MANUAL', notes: null }) });
    expect(db.boqLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({ boqRevisionId: 'revision-2', lineNumber: '1', itemCode: 'ITEM-1', aiTotalCost: 300, remarks: 'Keep' }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-2' }, data: { totalLines: 1, validLines: 1 } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BOQ_DUPLICATED', entityId: 'boq-2' }) });
  });

  it('creates a blank copy when the source has no revisions and tolerates audit failures', async () => {
    db.boq.findFirst.mockResolvedValueOnce({ id: 'boq-1', boqCode: 'SOURCE', projectId: 'project-1', costCentreId: null, title: 'Title', purpose: 'BUDGET', project: { projectCode: 'P-1' }, revisions: [] });
    db.boq.count.mockResolvedValueOnce(0);
    db.boq.create.mockResolvedValueOnce({ id: 'boq-2', boqCode: 'BOQ-P-1-001' });
    db.boqRevision.create.mockResolvedValueOnce({ id: 'revision-2' });
    db.auditLog.create.mockRejectedValueOnce(new Error('audit offline'));
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toMatchObject({ ok: true, status: 201 });
    expect(db.boqRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ budgetStatus: 'BUDGET_DRAFT', prStatus: 'PR_NOT_CREATED', sourceType: 'MANUAL' }) });
    expect(db.boqRevision.update).not.toHaveBeenCalled();
    expect(db.boqLine.create).not.toHaveBeenCalled();
    db.boq.findFirst.mockRejectedValueOnce(new Error('duplicate failed'));
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: 'duplicate failed', status: 500 });
    db.boq.findFirst.mockRejectedValueOnce({});
    await expect(duplicateBoq(post({ boqId: 'boq-1' }))).resolves.toEqual({ ok: false, error: 'Failed to duplicate BOQ', status: 500 });
  });
});

describe('add BOQ to budget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('validates permission, revision, and target cost centre', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(addBoqToBudget(post({ boqRevisionId: 'rev', costCentreId: 'cc' }))).resolves.toBe(denied);
    await expect(addBoqToBudget(post({ boqRevisionId: 'rev' }))).resolves.toEqual({ ok: false, error: 'BOQ Revision ID and Cost Centre ID are mandatory.', status: 400 });
    db.boqRevision.findFirst.mockResolvedValueOnce(null);
    await expect(addBoqToBudget(post({ boqRevisionId: 'missing', costCentreId: 'cc' }))).resolves.toEqual({ ok: false, error: 'BOQ Revision not found.', status: 404 });
    db.boqRevision.findFirst.mockResolvedValueOnce({ id: 'rev', boq: { projectId: 'project-1' }, lines: [] });
    db.costCentre.findFirst.mockResolvedValueOnce(null);
    await expect(addBoqToBudget(post({ boqRevisionId: 'rev', costCentreId: 'cc' }))).resolves.toEqual({ ok: false, error: 'Cost centre not found for this project.', status: 404 });
  });

  it('creates pending category contributions and preserves PR status while adding budget', async () => {
    const revision = {
      id: 'revision-1', boqId: 'boq-1', revisionNumber: 2,
      boq: { projectId: 'project-1', boqCode: 'BOQ-1', purpose: 'PR' },
      lines: [
        { aiTotalCost: 30, aiUnitCost: 10, quantity: 3, category: { name: 'Electrical' } },
        { aiTotalCost: 0, aiUnitCost: 10, quantity: 2, category: { name: 'Electrical' } },
        { aiTotalCost: null, aiUnitCost: 5, quantity: 0, category: null },
        { aiTotalCost: null, aiUnitCost: 2, quantity: -1, category: { name: 'Credit' } },
      ],
    };
    const costCentre = { id: 'cc-1', code: 'CC-1', name: 'Ground Floor', areaSqFt: 1000 };
    db.boqRevision.findFirst.mockResolvedValueOnce(revision);
    db.costCentre.findFirst.mockResolvedValueOnce(costCentre);
    db.budgetContribution.create.mockResolvedValueOnce({ id: 'contribution-1' });
    db.budgetTransaction.count.mockResolvedValueOnce(4);
    db.budgetTransaction.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);

    await expect(addBoqToBudget(post({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', autoSubmit: true }))).resolves.toMatchObject({
      ok: true, status: 201, data: { contributionId: 'contribution-1', costCentre, totalEstimatedValue: 53, status: 'PENDING_PROJECT_APPROVAL', categoriesCount: 3 },
    });
    expect(db.costCentre.findFirst).toHaveBeenCalledWith({ where: { id: 'cc-1', projectId: 'project-1', tenantId: 'tenant-1' } });
    expect(db.budgetContribution.create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: 'project-1', totalEstimatedValue: 53, acceptedEstimatedValue: 53, status: 'PENDING_PROJECT_APPROVAL', submittedBy: 'user-1' }) });
    expect(db.budgetTransaction.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ transactionCode: 'BTX-000005', category: 'Electrical', amount: 50, quantity: 5, rate: 10, status: 'PENDING_PROJECT_APPROVAL' }) });
    expect(db.budgetTransaction.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ category: 'General', amount: 5, quantity: 1, rate: 5 }) });
    expect(db.budgetTransaction.create).toHaveBeenNthCalledWith(3, { data: expect.objectContaining({ category: 'Credit', amount: -2, quantity: -1, rate: null }) });
    expect(db.boqRevision.update).toHaveBeenCalledWith({ where: { id: 'revision-1' }, data: { costCentreId: 'cc-1', budgetStatus: 'BUDGET_PENDING_PROJECT_APPROVAL' } });
    expect(db.boq.update).toHaveBeenCalledWith({ where: { id: 'boq-1' }, data: { costCentreId: 'cc-1', purpose: 'BOTH' } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BOQ_ADDED_TO_BUDGET', entityId: 'contribution-1', projectId: 'project-1' }) });
  });

  it('creates a draft contribution with a project override and handles write failures', async () => {
    const revision = { id: 'revision-1', boqId: 'boq-1', revisionNumber: 0, boq: { projectId: 'old-project', boqCode: 'BOQ-1', purpose: 'BUDGET' }, lines: [] };
    db.boqRevision.findFirst.mockResolvedValueOnce(revision);
    db.costCentre.findFirst.mockResolvedValueOnce({ id: 'cc-1', code: 'CC-1', name: 'Office' });
    db.budgetContribution.create.mockResolvedValueOnce({ id: 'contribution-2' });
    db.budgetTransaction.count.mockResolvedValueOnce(0);
    db.boqRevision.update.mockResolvedValueOnce({ id: 'revision-1' });
    db.boq.update.mockResolvedValueOnce({ id: 'boq-1' });
    await expect(addBoqToBudget(post({ boqRevisionId: 'revision-1', costCentreId: 'cc-1', projectId: 'new-project', autoSubmit: false }))).resolves.toMatchObject({
      ok: true, data: { totalEstimatedValue: 0, status: 'DRAFT', transactions: [], categoriesCount: 0 },
    });
    expect(db.costCentre.findFirst).toHaveBeenLastCalledWith({ where: { id: 'cc-1', projectId: 'new-project', tenantId: 'tenant-1' } });
    expect(db.budgetContribution.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ projectId: 'new-project', submittedAt: null, submittedBy: null, status: 'DRAFT' }) });
    expect(db.boq.update).toHaveBeenLastCalledWith({ where: { id: 'boq-1' }, data: { costCentreId: 'cc-1', purpose: 'BUDGET' } });

    db.boqRevision.findFirst.mockRejectedValueOnce(new Error('budget write failed'));
    await expect(addBoqToBudget(post({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: 'budget write failed', status: 500 });
    db.boqRevision.findFirst.mockRejectedValueOnce({});
    await expect(addBoqToBudget(post({ boqRevisionId: 'revision-1', costCentreId: 'cc-1' }))).resolves.toEqual({ ok: false, error: 'Failed to add BOQ to budget.', status: 500 });
  });
});
