import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { notifyNextResponsibleParty } from '../src/lib/notifications';
import { GET as getStandardItems, POST as createStandardItems } from '../src/app/api/boq/standard-library/route';
import { GET as getCategories, POST as createCategory, generateUniqueCategoryCode } from '../src/app/api/masters/categories/route';
import { GET as getAwards, POST as createAward, PUT as reviewAward } from '../src/app/api/procurement/awards/route';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    standardBoqItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    category: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    awardRecommendation: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    vendor: { findFirst: jest.fn() },
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
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', userName: 'Admin', role: 'CLIENT_ADMIN' };
const request = (url: string, body?: unknown) => new NextRequest(url, {
  method: body === undefined ? 'GET' : 'POST',
  ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

describe('standard BOQ library API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('filters active items by sector, project type, category, subcategory, and search', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getStandardItems(request('http://localhost/api/boq/standard-library'))).resolves.toBe(denied);
    const items = [{ id: 'item-1' }];
    db.standardBoqItem.findMany.mockResolvedValueOnce(items);
    await expect(getStandardItems(request('http://localhost/api/boq/standard-library?sector=RETAIL&projectType=STORE&category=Electrical&subcategory=Wiring&search=Cable'))).resolves.toEqual({ ok: true, data: items, status: 200 });
    expect(db.standardBoqItem.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true, sector: 'RETAIL', projectType: 'STORE', category: 'Electrical', subcategory: 'Wiring', OR: [
        { itemCode: { contains: 'Cable' } }, { standardDescription: { contains: 'Cable' } }, { detailedSpecification: { contains: 'Cable' } }, { brandMake: { contains: 'Cable' } },
      ] },
      orderBy: [{ category: 'asc' }, { itemCode: 'asc' }],
    });
    db.standardBoqItem.findMany.mockResolvedValueOnce([]);
    await getStandardItems(request('http://localhost/api/boq/standard-library?sector=ALL&category=ALL'));
    expect(db.standardBoqItem.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true } }));
  });

  it('validates standard item batches before creating rows', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{}]))).resolves.toBe(denied);
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', { items: [] }))).resolves.toEqual({ ok: false, error: 'At least one standard BOQ item is required.', status: 400 });
    db.category.findMany.mockResolvedValue([{ name: 'Electrical' }]);
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ standardDescription: 'Cable', category: 'Electrical', uom: 'M' }]))).resolves.toMatchObject({ ok: false, error: 'Line #1: Item code is required.', status: 400 });
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'C1', category: 'Electrical', uom: 'M' }]))).resolves.toMatchObject({ ok: false, error: 'Line #1 (C1): Standard item description is required.', status: 400 });
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'C1', standardDescription: 'Cable', uom: 'M' }]))).resolves.toMatchObject({ ok: false, error: 'Line #1 (C1): Category is required.', status: 400 });
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'C1', standardDescription: 'Cable', category: 'Unknown', uom: 'M' }]))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('does not exist in Category Master'), status: 400 });
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'C1', standardDescription: 'Cable', category: 'Electrical', uom: '' }]))).resolves.toMatchObject({ ok: false, error: 'Line #1 (C1): UOM is required.', status: 400 });
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [
      { itemCode: 'DUP', standardDescription: 'Cable', category: 'Electrical', uom: 'MTR' },
      { itemCode: ' dup ', standardDescription: 'Cable 2', category: 'Electrical', uom: 'MTR' },
    ]))).resolves.toMatchObject({ ok: false, error: 'Duplicate item code detected within submission: "dup".', status: 409 });
    db.standardBoqItem.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'EXIST', standardDescription: 'Cable', category: 'Electrical', uom: 'MTR' }]))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('already exists in the central Standard BOQ Master'), status: 409 });
  });

  it('normalizes and creates a grouped standard item batch and tolerates audit failures', async () => {
    db.category.findMany.mockResolvedValueOnce([{ name: 'Electrical' }]);
    db.standardBoqItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.standardBoqItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: data.itemCode, ...data }));
    db.auditLog.create.mockRejectedValueOnce(new Error('audit offline'));
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', {
      sector: ' OFFICE ', projectType: ' Retail ', category: ' Electrical ', items: [
        { itemCode: ' C-1 ', standardDescription: ' Cable ', uom: ' mtr ', benchmarkRate: '12.5', costDrivers: { load: 1 } },
        { itemCode: 'C-2', standardDescription: 'Second cable', category: 'Electrical', uom: 'nos', detailedSpecification: '', brandMake: '', benchmarkRate: 0, costDrivers: 'meterage' },
      ],
    }))).resolves.toMatchObject({ ok: true, status: 201, data: { count: 2, items: expect.any(Array) } });
    expect(db.standardBoqItem.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      tenantId: 'tenant-1', itemCode: 'C-1', sector: 'OFFICE', projectType: 'Retail', category: 'Electrical', subcategory: 'General',
      standardDescription: 'Cable', detailedSpecification: 'Cable', uom: 'MTR', brandMake: null, benchmarkRate: 12.5, costDrivers: '{"load":1}', isActive: true,
    }) });
    expect(db.standardBoqItem.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ itemCode: 'C-2', category: 'Electrical', subcategory: 'General', uom: 'NOS', brandMake: null, benchmarkRate: null, costDrivers: 'meterage' }) });
  });

  it('accepts a direct item array and reports storage errors', async () => {
    db.category.findMany.mockResolvedValueOnce([{ name: 'Electrical' }]);
    db.standardBoqItem.findFirst.mockResolvedValueOnce(null);
    db.standardBoqItem.create.mockResolvedValueOnce({ id: 'direct' });
    db.auditLog.create.mockResolvedValueOnce({ id: 'audit' });
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'D1', standardDescription: 'Direct item', category: 'Electrical', uom: 'EA' }]))).resolves.toMatchObject({ ok: true, data: { count: 1 } });
    db.category.findMany.mockRejectedValueOnce(new Error('standard library failed'));
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'D2' }]))).resolves.toEqual({ ok: false, error: 'standard library failed', status: 500 });
    db.category.findMany.mockRejectedValueOnce({});
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'D3' }]))).resolves.toEqual({ ok: false, error: 'Failed to add standard BOQ items.', status: 500 });
  });
});

describe('category master API and category code generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.category.findMany.mockReset();
    db.category.findFirst.mockReset();
    db.category.findUnique.mockReset();
    db.category.create.mockReset();
    db.auditLog.create.mockReset();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('returns flat active categories or only the active top-level tree', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getCategories(request('http://localhost/api/masters/categories'))).resolves.toBe(denied);
    db.category.findMany.mockResolvedValueOnce([{ id: 'parent' }, { id: 'child' }]);
    await getCategories(request('http://localhost/api/masters/categories?flat=true'));
    expect(db.category.findMany).toHaveBeenLastCalledWith({ where: { tenantId: 'tenant-1', isActive: true }, include: { parent: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    db.category.findMany.mockResolvedValueOnce([{ id: 'parent', parentId: null }, { id: 'child', parentId: 'parent' }]);
    await expect(getCategories(request('http://localhost/api/masters/categories'))).resolves.toEqual({ ok: true, data: [{ id: 'parent', parentId: null }], status: 200 });
    expect(db.category.findMany).toHaveBeenLastCalledWith({ where: { tenantId: 'tenant-1', isActive: true }, include: { parent: true, children: { where: { isActive: true }, orderBy: { name: 'asc' } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  });

  it('generates codes from category words, parent prefixes, and available sequences', async () => {
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Civil and Interior Works')).resolves.toBe('CIW01');
    db.category.findMany.mockResolvedValueOnce([{ code: 'OFFU01' }]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Office of Furniture')).resolves.toBe('OFFU02');
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(generateUniqueCategoryCode('tenant-1', 'and')).resolves.toBe('CAT01');
    db.category.findUnique.mockResolvedValueOnce({ code: 'CIV' });
    db.category.findFirst.mockResolvedValueOnce(null);
    await expect(generateUniqueCategoryCode('tenant-1', 'Floor Tiles', 'parent-1')).resolves.toBe('CIV-FT');
    db.category.findUnique.mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Tile', 'parent-1')).resolves.toBe('TIL01');
  });

  it('validates category creation, parent access, and duplicates', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Electrical' }))).resolves.toBe(denied);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: '  ' }))).resolves.toEqual({ ok: false, error: 'Category name is required.', status: 400 });
    db.category.findFirst.mockResolvedValueOnce(null);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Flooring', parentId: 'missing' }))).resolves.toEqual({ ok: false, error: 'Selected parent category does not exist.', status: 404 });
    db.category.findFirst.mockResolvedValueOnce({ id: 'parent' }).mockResolvedValueOnce({ id: 'existing' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Flooring', parentId: 'parent' }))).resolves.toEqual({ ok: false, error: 'Subcategory "Flooring" already exists under the selected parent category.', status: 409 });
    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing', name: 'Existing' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Electrical', code: 'ELEC' }))).resolves.toEqual({ ok: false, error: 'Category code "ELEC" is already in use by "Existing".', status: 409 });
    db.category.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Electrical' }))).resolves.toEqual({ ok: false, error: 'Category "Electrical" already exists.', status: 409 });
  });

  it('creates a top-level category and subcategory with generated or normalized codes', async () => {
    db.category.findFirst.mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    db.category.create.mockResolvedValueOnce({ id: 'category-1', name: 'Office Furniture', code: 'OFFU01' });
    db.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: ' Office Furniture ' }))).resolves.toEqual({ ok: true, data: { id: 'category-1', name: 'Office Furniture', code: 'OFFU01' }, status: 201 });
    expect(db.category.create).toHaveBeenLastCalledWith({
      data: { tenantId: 'tenant-1', name: 'Office Furniture', parentId: null, code: 'OFFU01', level: 1, isActive: true },
      include: { parent: true, children: true },
    });

    db.category.findFirst.mockResolvedValueOnce({ id: 'parent', code: 'CIV' }).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.category.create.mockResolvedValueOnce({ id: 'subcategory-1', name: 'Floor Tiles', code: 'CIV-FT' });
    db.auditLog.create.mockResolvedValueOnce({ id: 'audit' });
    await createCategory(request('http://localhost/api/masters/categories', { name: 'Floor Tiles', parentId: ' parent ' }));
    expect(db.category.create).toHaveBeenLastCalledWith({ data: { tenantId: 'tenant-1', name: 'Floor Tiles', parentId: 'parent', code: 'CIV-FT', level: 2, isActive: true }, include: { parent: true, children: true } });

    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.category.create.mockResolvedValueOnce({ id: 'category-2' });
    await createCategory(request('http://localhost/api/masters/categories', { name: 'Mechanical Equipment', code: ' mech ' }));
    expect(db.category.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ code: 'MECH', level: 1 }), include: { parent: true, children: true } });
  });

  it('returns creation errors and category code collision suffixes', async () => {
    db.category.findFirst.mockRejectedValueOnce(new Error('category failed'));
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting' }))).resolves.toEqual({ ok: false, error: 'category failed', status: 500 });
    db.category.findFirst.mockRejectedValueOnce({});
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting' }))).resolves.toEqual({ ok: false, error: 'Failed to create category.', status: 500 });
    db.category.findUnique.mockResolvedValueOnce({ code: 'CIV' });
    db.category.findFirst.mockResolvedValueOnce({ id: 'base' }).mockResolvedValueOnce({ id: 'first' }).mockResolvedValueOnce(null);
    await expect(generateUniqueCategoryCode('tenant-1', 'Floor Tile', 'parent-1')).resolves.toBe('CIV-FT02');
  });
});

describe('commercial award workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue(context);
    isContext.mockReturnValue(true);
  });

  it('lists awards with RFQ and status filters and handles query failures', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getAwards(request('http://localhost/api/procurement/awards'))).resolves.toBe(denied);
    db.awardRecommendation.findMany.mockResolvedValueOnce([{ id: 'award-1' }]);
    await expect(getAwards(request('http://localhost/api/procurement/awards?rfqId=rfq-1&status=APPROVED'))).resolves.toEqual({ ok: true, data: { awards: [{ id: 'award-1' }], total: 1 }, status: 200 });
    expect(db.awardRecommendation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', rfqId: 'rfq-1', status: 'APPROVED' }, orderBy: { createdAt: 'desc' } }));
    db.awardRecommendation.findMany.mockRejectedValueOnce(new Error('award listing failed'));
    await expect(getAwards(request('http://localhost/api/procurement/awards'))).resolves.toEqual({ ok: false, error: 'award listing failed', status: 500 });
  });

  it('validates and submits an award recommendation with calculated savings', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createAward(request('http://localhost/api/procurement/awards', {}))).resolves.toBe(denied);
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: 'RFQ ID, Recommended Vendor, and Justification are required', status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', justification: 'Best' }))).resolves.toEqual({ ok: false, error: 'RFQ not found or access denied', status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', estimatedBenchmarkValue: 1000 });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', justification: 'Best' }))).resolves.toEqual({ ok: false, error: 'Recommended Vendor not found', status: 404 });

    const rfq = { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', estimatedBenchmarkValue: 1000 };
    const vendor = { id: 'vendor-1', name: 'Acme' };
    db.rfq.findFirst.mockResolvedValueOnce(rfq);
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    const award = { id: 'award-1' };
    db.awardRecommendation.create.mockResolvedValueOnce(award);
    await expect(createAward(request('http://localhost/api/procurement/awards', {
      rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', originalQuoteAmount: 0, finalNegotiatedAmount: '900', justification: 'Best value',
    }))).resolves.toEqual({ ok: true, data: { award, message: 'Award recommendation submitted for approval' }, status: 201 });
    expect(db.awardRecommendation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: 'tenant-1', originalQuoteAmount: 900, finalNegotiatedAmount: 900, benchmarkAmount: 1000, totalSavingsAmount: 100,
      savingsPercent: 10, technicalStatus: 'COMPLIANT', commercialStatus: 'BEST_VALUE', status: 'PENDING_APPROVAL',
    }), include: { recommendedVendor: true } });
    expect(db.rfq.update).toHaveBeenCalledWith({ where: { id: 'rfq-1' }, data: { status: 'AWARD_RECOMMENDED' } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'AWARD_RECOMMENDED', entityId: 'award-1' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'AWARD_RECOMMENDED', entityId: 'award-1' }));
  });

  it('supports benchmark overrides, zero benchmark savings, and recommendation errors', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-2', rfqNumber: 'RFQ-2', projectId: 'project-2', estimatedBenchmarkValue: 0 });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-2', name: 'Vendor' });
    db.awardRecommendation.create.mockResolvedValueOnce({ id: 'award-2' });
    await createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-2', recommendedVendorId: 'vendor-2', originalQuoteAmount: '110', finalNegotiatedAmount: '100', benchmarkAmount: '90', justification: 'Override' }));
    expect(db.awardRecommendation.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ originalQuoteAmount: 110, benchmarkAmount: 90, totalSavingsAmount: -10, savingsPercent: -11.11, technicalStatus: 'COMPLIANT', commercialStatus: 'BEST_VALUE' }), include: { recommendedVendor: true } });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('award submit failed'));
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'v', justification: 'x' }))).resolves.toEqual({ ok: false, error: 'award submit failed', status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'v', justification: 'x' }))).resolves.toEqual({ ok: false, error: 'Failed to submit award recommendation', status: 500 });
  });

  it('validates award approvals and applies approve or reject decisions', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(reviewAward(request('http://localhost/api/procurement/awards', {}))).resolves.toBe(denied);
    await expect(reviewAward(request('http://localhost/api/procurement/awards', {}))).resolves.toEqual({ ok: false, error: 'Award ID and Action (APPROVE / REJECT) are required', status: 400 });
    db.awardRecommendation.findFirst.mockResolvedValueOnce(null);
    await expect(reviewAward(request('http://localhost/api/procurement/awards', { awardId: 'missing', action: 'APPROVE' }))).resolves.toEqual({ ok: false, error: 'Award recommendation not found', status: 404 });
    const award = { id: 'award-1', rfqId: 'rfq-1', finalNegotiatedAmount: 900, rfq: { projectId: 'project-1', rfqNumber: 'RFQ-1' }, recommendedVendor: { name: 'Acme' } };
    for (const [action, status, rfqStatus] of [['APPROVE', 'APPROVED', 'APPROVED'], ['REJECT', 'REJECTED', 'COMPARISON']]) {
      db.awardRecommendation.findFirst.mockResolvedValueOnce(award);
      db.awardRecommendation.update.mockResolvedValueOnce({ id: 'award-1', status });
      const result = await reviewAward(request('http://localhost/api/procurement/awards', { awardId: 'award-1', action, ...(action === 'APPROVE' ? { remarks: 'Approved' } : {}) }));
      expect(result).toMatchObject({ ok: true, data: { award: { status }, message: `Award recommendation successfully ${status.toLowerCase()}` } });
      expect(db.rfq.update).toHaveBeenLastCalledWith({ where: { id: 'rfq-1' }, data: { status: rfqStatus } });
    }
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'AWARD_APPROVED' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'AWARD_REJECTED' }));
    db.awardRecommendation.findFirst.mockRejectedValueOnce(new Error('award review failed'));
    await expect(reviewAward(request('http://localhost/api/procurement/awards', { awardId: 'award-1', action: 'REJECT' }))).resolves.toEqual({ ok: false, error: 'award review failed', status: 500 });
  });
});
