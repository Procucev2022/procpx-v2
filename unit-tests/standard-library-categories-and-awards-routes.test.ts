import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { requireAuth, isApiContext } from '../src/lib/api-utils';
import { createAuditLog } from '../src/lib/audit';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { GET as getStandardItems, POST as createStandardItems } from '../src/app/api/boq/standard-library/route';
import { GET as getCategories, POST as createCategory, generateUniqueCategoryCode } from '../src/app/api/masters/categories/route';
import { GET as getAwards, POST as createAward, PUT as reviewAward } from '../src/app/api/procurement/awards/route';
import { writeD1BatchAtomically } from '../src/lib/d1-batch';
import { CATEGORY_INSERT_IF_VALID_SQL } from '../src/lib/d1-batch.constants';
import { writeStructuredLog } from '../src/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    standardBoqItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
    category: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    awardRecommendation: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    rfq: { findFirst: jest.fn(), update: jest.fn() },
    rfqVendor: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../src/lib/api-utils', () => ({
  requireAuth: jest.fn(),
  isApiContext: jest.fn(),
  apiSuccess: jest.fn((data: unknown, status = 200) => ({ ok: true, data, status })),
  apiError: jest.fn((error: string, status = 400) => ({ ok: false, error, status })),
  getListPageWindow: (params: URLSearchParams) => {
    const rawPage = Number(params.get('page'));
    const rawSize = Number(params.get('pageSize'));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
    const pageSize = Number.isSafeInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, 100) : 50;
    return { page, pageSize, skip: (page - 1) * pageSize };
  },
}));
jest.mock('../src/lib/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/lib/notifications', () => ({ notifyNextResponsibleParty: jest.fn(), dispatchPreparedWorkflowNotification: jest.fn() }));
jest.mock('../src/lib/d1-batch', () => ({ writeD1BatchAtomically: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const auth = requireAuth as jest.Mock;
const isContext = isApiContext as unknown as jest.Mock;
const audit = createAuditLog as jest.Mock;
const notify = notifyNextResponsibleParty as jest.Mock;
const dispatchNotification = dispatchPreparedWorkflowNotification as jest.Mock;
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
    db.standardBoqItem.count.mockResolvedValue(0);
    db.awardRecommendation.count.mockResolvedValue(0);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValue([]);
    notify.mockReset().mockImplementation(async (_input: unknown, options?: { prepareOnly?: boolean }) => options?.prepareOnly ? {
      tenantId: 'tenant-1', targetRole: 'FINANCE_USER', title: 'Award update', message: 'Award workflow updated',
      type: 'ACTION_REQUIRED', entityType: 'AWARD', entityId: 'award-1', recordNumber: 'RFQ-1',
    } : undefined);
    dispatchNotification.mockReset().mockResolvedValue(undefined);
  });

  it('filters active items by sector, project type, category, subcategory, and search', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(getStandardItems(request('http://localhost/api/boq/standard-library'))).resolves.toBe(denied);
    const items = [{ id: 'item-1' }];
    db.standardBoqItem.findMany.mockResolvedValueOnce(items);
    db.standardBoqItem.count.mockResolvedValueOnce(1);
    await expect(getStandardItems(request('http://localhost/api/boq/standard-library?sector=RETAIL&projectType=STORE&category=Electrical&subcategory=Wiring&search=Cable'))).resolves.toEqual({
      ok: true,
      data: { items, total: 1, page: 1, pageSize: 50, hasMore: false },
      status: 200,
    });
    expect(db.standardBoqItem.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true, sector: 'RETAIL', projectType: 'STORE', category: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, subcategory: 'Wiring', OR: [
        { itemCode: { contains: 'Cable' } }, { standardDescription: { contains: 'Cable' } }, { detailedSpecification: { contains: 'Cable' } }, { brandMake: { contains: 'Cable' } },
      ] },
      orderBy: [{ category: 'asc' }, { itemCode: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 50,
    });
    db.standardBoqItem.findMany.mockResolvedValueOnce([]);
    db.standardBoqItem.count.mockResolvedValueOnce(0);
    await getStandardItems(request('http://localhost/api/boq/standard-library?sector=ALL&category=ALL'));
    expect(db.standardBoqItem.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true } }));
  });

  it('validates standard item batches before creating rows', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{}]))).resolves.toBe(denied);
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', { items: [] }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiBoqStandardLibraryRoute.atLeastOneStandardBOQItemIsRequired, status: 400 });
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
    db.standardBoqItem.findMany.mockResolvedValueOnce([{ itemCode: 'EXIST' }]);
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'EXIST', standardDescription: 'Cable', category: 'Electrical', uom: 'MTR' }]))).resolves.toMatchObject({ ok: false, error: expect.stringContaining('already exists in the central Standard BOQ Master'), status: 409 });
  });

  it('normalizes and persists a grouped standard item batch with its audit event atomically', async () => {
    db.category.findMany.mockResolvedValueOnce([{ name: 'Electrical' }]);
    db.standardBoqItem.findMany.mockResolvedValueOnce([]);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce(Array.from({ length: 3 }, () => ({ meta: { changes: 1 } })));
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', {
      sector: ' OFFICE ', projectType: ' Retail ', category: ' Electrical ', items: [
        { itemCode: ' C-1 ', standardDescription: ' Cable ', uom: ' mtr ', benchmarkRate: '12.5', costDrivers: { load: 1 } },
        { itemCode: 'C-2', standardDescription: 'Second cable', category: 'Electrical', uom: 'nos', detailedSpecification: '', brandMake: '', benchmarkRate: 0, costDrivers: 'meterage' },
      ],
    }))).resolves.toMatchObject({ ok: true, status: 201, data: { count: 2, items: expect.any(Array) } });
    const batch = (writeD1BatchAtomically as jest.Mock).mock.calls.at(-1)?.[0];
    expect(batch).toHaveLength(3);
    expect(batch.slice(0, 2).map((statement: { values: unknown[] }) => statement.values)).toEqual([
      expect.arrayContaining(['tenant-1', 'C-1', 'OFFICE', UI_STRINGS.appAppBoqStudioPage.retail, UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, UI_STRINGS.common.general, 'Cable', 'Cable', 'MTR', null, 12.5, '{"load":1}']),
      expect.arrayContaining(['tenant-1', 'C-2', 'OFFICE', UI_STRINGS.appAppBoqStudioPage.retail, UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, UI_STRINGS.common.general, 'Second cable', 'Second cable', UI_STRINGS.common.nOS, null, null, 'meterage']),
    ]);
    expect(batch[2].sql).toContain('audit_logs');
    expect(db.standardBoqItem.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('accepts a direct item array and reports storage errors', async () => {
    db.category.findMany.mockResolvedValueOnce([{ name: 'Electrical' }]);
    db.standardBoqItem.findMany.mockResolvedValueOnce([]);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce(Array.from({ length: 2 }, () => ({ meta: { changes: 1 } })));
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'D1', standardDescription: 'Direct item', category: 'Electrical', uom: 'EA' }]))).resolves.toMatchObject({ ok: true, data: { count: 1 } });
    db.category.findMany.mockRejectedValueOnce(new Error('standard library failed'));
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'D2' }]))).resolves.toMatchObject({ ok: false, error: UI_STRINGS.common.userMessages.failedToAddStandardBoqItems, status: 500 });
    db.category.findMany.mockRejectedValueOnce({});
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [{ itemCode: 'D3' }]))).resolves.toMatchObject({ ok: false, error: UI_STRINGS.common.userMessages.failedToAddStandardBoqItems, status: 500 });
  });

  it('rejects oversized imports before reads and fails the whole create when the atomic batch fails', async () => {
    const tooManyItems = Array.from({ length: 201 }, (_, index) => ({ itemCode: `STD-${index}` }));
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', tooManyItems))).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('at most 200 items'),
      status: 400,
    });
    expect(db.category.findMany).not.toHaveBeenCalled();

    db.category.findMany.mockResolvedValueOnce([{ name: 'Electrical' }]);
    db.standardBoqItem.findMany.mockResolvedValueOnce([]);
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('D1 unavailable'));
    await expect(createStandardItems(request('http://localhost/api/boq/standard-library', [
      { itemCode: 'STD-ATOMIC', standardDescription: 'Atomic item', category: 'Electrical', uom: 'EA' },
    ]))).resolves.toMatchObject({
      ok: false,
      error: UI_STRINGS.common.userMessages.failedToAddStandardBoqItems,
      status: 500,
    });
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
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
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
    expect(db.category.findMany).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-1', isActive: true }, include: { parent: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], take: 1001,
    });
    const parent = { id: 'parent', name: 'Parent', parentId: null, parent: null };
    const child = { id: 'child', name: 'Child', parentId: 'parent', parent };
    db.category.findMany.mockResolvedValueOnce([parent, child]);
    await expect(getCategories(request('http://localhost/api/masters/categories'))).resolves.toEqual({
      ok: true, data: [{ ...parent, children: [{ id: 'child', name: 'Child', parentId: 'parent' }] }], status: 200,
    });
    expect(db.category.findMany).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-1', isActive: true }, include: { parent: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], take: 1001,
    });
    db.category.findMany.mockRejectedValueOnce(new Error('categories unavailable'));
    await expect(getCategories(request('http://localhost/api/masters/categories'))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.failedToFetchCategories, status: 500,
    });
  });

  it('rejects and logs category catalogs that exceed the bounded result window', async () => {
    db.category.findMany.mockResolvedValueOnce(Array.from({ length: 1001 }, (_, index) => ({
      id: `category-${index}`, name: `Category ${index}`, parentId: null,
    })));
    await expect(getCategories(request('http://localhost/api/masters/categories'))).resolves.toEqual({
      ok: false,
      error: 'The active category list exceeds the supported limit of 1000 items.',
      status: 413,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('warn', 'masters.categories_result_limit_exceeded', expect.objectContaining({
      operation: 'read_categories', tenantId: 'tenant-1', resultCountAtLeast: 1001, maxItems: 1000,
    }));
  });

  it('generates codes from category words, parent prefixes, and available sequences', async () => {
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Civil and Interior Works')).resolves.toBe('CIW01');
    db.category.findMany.mockResolvedValueOnce([{ code: 'OFFU01' }]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Office of Furniture')).resolves.toBe('OFFU02');
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(generateUniqueCategoryCode('tenant-1', 'and')).resolves.toBe('CAT01');
    db.category.findFirst.mockResolvedValueOnce({ code: 'CIV' });
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Floor Tiles', 'parent-1')).resolves.toBe('CIV-FT');
    db.category.findFirst.mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Tile', 'parent-1')).resolves.toBe('TIL01');
  });

  it('bounds category-code prefix reads and fails safely when legacy codes exceed the window', async () => {
    db.category.findMany.mockResolvedValueOnce(Array.from({ length: 10_000 }, (_, index) => ({
      code: `ABC${String(index + 1).padStart(2, '0')}`,
    })));
    await expect(generateUniqueCategoryCode('tenant-1', 'Abc')).rejects.toThrow('CATEGORY_CODE_LOOKUP_LIMIT_EXCEEDED');
    expect(db.category.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', code: { startsWith: 'ABC' } },
      select: { code: true }, take: 10_000,
    });
  });

  it('validates category creation, parent access, and duplicates', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Electrical' }))).resolves.toBe(denied);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: '  ' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.categoryNameIsRequired, status: 400 });
    db.category.findFirst.mockResolvedValueOnce(null);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Flooring', parentId: 'missing' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiMastersCategoriesRoute.selectedParentCategoryDoesNotExist, status: 404 });
    db.category.findFirst.mockResolvedValueOnce({ id: 'parent', code: 'P' }).mockResolvedValueOnce({ id: 'existing' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Flooring', parentId: 'parent' }))).resolves.toEqual({ ok: false, error: 'Subcategory "Flooring" already exists under the selected parent category.', status: 409 });
    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ name: 'Existing' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Electrical', code: 'ELEC' }))).resolves.toEqual({ ok: false, error: 'Category code "ELEC" is already in use by "Existing".', status: 409 });
    db.category.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Electrical' }))).resolves.toEqual({ ok: false, error: 'Category "Electrical" already exists.', status: 409 });
  });

  it('creates categories with an atomic audit and normalized code values', async () => {
    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: ' Office Furniture ' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { tenantId: 'tenant-1', name: 'Office Furniture', code: 'OFFU01', parentId: null, level: 1, isActive: true },
    });
    const statements = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toBe(CATEGORY_INSERT_IF_VALID_SQL);
    expect(statements[0].sql.match(/\?/g)).toHaveLength(statements[0].values.length);
    expect(statements[0].values).toEqual(expect.arrayContaining(['tenant-1', 'Office Furniture', 'OFFU01', null, 1]));
    expect(statements[1].values).toContain('CATEGORY');
    expect(statements[1].values).toContain('CREATE');
    expect(db.category.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();

    db.category.findFirst.mockResolvedValueOnce({ id: 'parent', code: 'CIV' }).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Floor Tiles', parentId: ' parent ' }))).resolves.toMatchObject({
      ok: true, status: 201, data: { name: 'Floor Tiles', parentId: 'parent', code: 'CIV-FT', level: 2, parent: { id: 'parent', code: 'CIV' } },
    });

    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await createCategory(request('http://localhost/api/masters/categories', { name: 'Mechanical Equipment', code: ' mech ' }));
    const manualCodeBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[2][0] as Array<{ sql: string; values: unknown[] }>;
    expect(manualCodeBatch[0].values).toEqual(expect.arrayContaining(['Mechanical Equipment', 'MECH']));
  });

  it('returns safe creation errors, handles insert races, and generates suffixes in one lookup', async () => {
    db.category.findFirst.mockRejectedValueOnce(new Error('category failed'));
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToCreateCategory, status: 500 });
    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('UNIQUE constraint failed: categories.tenantId, categories.code'));
    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ name: 'Occupied' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting', code: 'LIGHT' }))).resolves.toMatchObject({ ok: false, status: 409 });

    db.category.findFirst.mockResolvedValueOnce({ code: 'CIV' });
    db.category.findMany.mockResolvedValueOnce([{ code: 'CIV-FT' }, { code: 'CIV-FT01' }]);
    await expect(generateUniqueCategoryCode('tenant-1', 'Floor Tile', 'parent-1')).resolves.toBe('CIV-FT02');
    expect(db.category.findMany).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-1', code: { startsWith: 'CIV-FT' } }, select: { code: true }, take: 10_000,
    });
  });

  it('distinguishes stale-parent and duplicate-name races after the atomic insert', async () => {
    db.category.findFirst
      .mockResolvedValueOnce({ id: 'parent', code: 'CIV' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Floor Tiles', parentId: 'parent' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiMastersCategoriesRoute.selectedParentCategoryDoesNotExist, status: 404,
    });

    db.category.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting' }))).resolves.toEqual({
      ok: false, error: 'Category "Lighting" already exists.', status: 409,
    });
  });

  it('resolves unique-constraint races and logs unclassified storage failures safely', async () => {
    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    (writeD1BatchAtomically as jest.Mock).mockRejectedValueOnce(new Error('UNIQUE constraint failed: categories.tenantId, categories.name'));
    db.category.findFirst.mockResolvedValueOnce({ id: 'concurrent-category' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting', code: 'LIGHT' }))).resolves.toEqual({
      ok: false, error: 'Category "Lighting" already exists.', status: 409,
    });

    db.category.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    (writeD1BatchAtomically as jest.Mock).mockReset().mockRejectedValueOnce({ code: 'D1_UNAVAILABLE' });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting', code: 'LIGHT' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.userMessages.failedToCreateCategory, status: 500,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'masters.category_create_failed', expect.objectContaining({
      categoryName: 'Lighting', error: { type: 'object' },
    }));
  });

  it('rejects malformed category values and fails closed when a code range is exhausted', async () => {
    const malformed = { json: jest.fn().mockRejectedValue(new Error('bad JSON')) } as unknown as NextRequest;
    await expect(createCategory(malformed)).resolves.toMatchObject({ ok: false, status: 400, error: UI_STRINGS.common.invalidRequestBody });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting', code: 12 }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting', parentId: 12 }))).resolves.toMatchObject({ ok: false, status: 400 });

    db.category.findFirst.mockReset().mockResolvedValueOnce(null);
    db.category.findMany.mockReset().mockResolvedValueOnce(Array.from({ length: 10_000 }, (_, index) => ({ code: `LIGHT${index}` })));
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.appApiMastersCategoriesRoute.categoryCodeLookupExceedsLimit, status: 503,
    });
    expect(writeStructuredLog).toHaveBeenCalledWith('error', 'masters.category_code_lookup_limit_exceeded', expect.objectContaining({
      categoryName: 'Lighting', maxItems: 9_999,
    }));

    db.category.findMany.mockResolvedValueOnce(Array.from({ length: 9998 }, (_, index) => ({ code: `ABC${String(index + 1).padStart(2, '0')}` })));
    await expect(generateUniqueCategoryCode('tenant-1', 'Abc')).resolves.toMatch(/^ABC-[A-F0-9]{8}$/);

    db.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.category.findMany.mockResolvedValueOnce([]);
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    await expect(createCategory(request('http://localhost/api/masters/categories', { name: 'Lighting' }))).resolves.toMatchObject({
      ok: false, status: 409,
    });
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
    db.awardRecommendation.count.mockResolvedValueOnce(11);
    await expect(getAwards(request('http://localhost/api/procurement/awards?rfqId=rfq-1&status=APPROVED&page=3&pageSize=5'))).resolves.toEqual({ ok: true, data: {
      awards: [{ id: 'award-1' }], total: 11, page: 3, pageSize: 5, totalPages: 3,
    }, status: 200 });
    expect(db.awardRecommendation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', rfqId: 'rfq-1', status: UI_STRINGS.common.aPPROVED },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 10, take: 5,
      include: expect.not.objectContaining({ ppos: expect.anything() }),
    }));
    db.awardRecommendation.findMany.mockRejectedValueOnce(new Error('award listing failed'));
    await expect(getAwards(request('http://localhost/api/procurement/awards'))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToFetchAwards, status: 500 });
  });

  it('validates and submits an award recommendation with calculated savings', async () => {
    const denied = { status: 403 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(createAward(request('http://localhost/api/procurement/awards', {}))).resolves.toBe(denied);
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAwardsRoute.rFQIDRecommendedVendorAndJustificationAreRequired, status: 400 });
    db.rfq.findFirst.mockResolvedValueOnce(null);
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', justification: 'Best' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.rFQNotFoundOrAccessDenied, status: 404 });
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-1', status: 'COMPARISON', estimatedBenchmarkValue: 1000 });
    db.vendor.findFirst.mockResolvedValueOnce(null);
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', justification: 'Best' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAwardsRoute.recommendedVendorNotFound, status: 404 });

    const rfq = { id: 'rfq-1', rfqNumber: 'RFQ-1', projectId: 'project-1', status: 'FINAL_RATE_LOCKED', estimatedBenchmarkValue: 1000 };
    const vendor = { id: 'vendor-1', name: 'Acme' };
    db.rfq.findFirst.mockResolvedValueOnce(rfq);
    db.vendor.findFirst.mockResolvedValueOnce(vendor);
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invitation-1' });
    await expect(createAward(request('http://localhost/api/procurement/awards', {
      rfqId: 'rfq-1', recommendedVendorId: 'vendor-1', originalQuoteAmount: 0, finalNegotiatedAmount: '900', justification: 'Best value',
    }))).resolves.toMatchObject({ ok: true, data: { award: {
      id: expect.any(String), tenantId: 'tenant-1', originalQuoteAmount: 0, finalNegotiatedAmount: 900,
      benchmarkAmount: 1000, totalSavingsAmount: 100, savingsPercent: 10, technicalStatus: 'COMPLIANT',
      commercialStatus: 'BEST_VALUE', status: 'PENDING_APPROVAL', recommendedVendor: vendor,
    }, message: UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendationSubmittedForApproval }, status: 201 });
    expect(db.rfqVendor.findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', rfqId: 'rfq-1', vendorId: 'vendor-1' }, select: { id: true } });
    const submitBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ sql: string; values: unknown[] }>;
    expect(submitBatch).toHaveLength(4);
    for (const statement of submitBatch) expect(statement.sql.match(/\?/g)?.length || 0).toBe(statement.values.length);
    expect(submitBatch[0].values).toContain(0);
    expect(submitBatch[1].sql).toContain('AWARD_RECOMMENDED');
    expect(db.awardRecommendation.create).not.toHaveBeenCalled();
    expect(db.rfq.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'AWARD_RECOMMENDED' }), { prepareOnly: true });
  });

  it('keeps an award recommendation successful when immediate notification delivery is deferred', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-alert', rfqNumber: 'RFQ-ALERT', projectId: 'project-1', status: 'COMPARISON', estimatedBenchmarkValue: 100 });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-alert', name: 'Acme' });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invitation-alert' });
    dispatchNotification.mockResolvedValueOnce(undefined);
    await expect(createAward(request('http://localhost/api/procurement/awards', {
      rfqId: 'rfq-alert', recommendedVendorId: 'vendor-alert', finalNegotiatedAmount: 90, justification: 'Best value',
    }))).resolves.toMatchObject({ ok: true, status: 201 });

    db.awardRecommendation.findFirst.mockResolvedValueOnce({
      id: 'award-alert', tenantId: 'tenant-1', status: 'PENDING_APPROVAL', rfqId: 'rfq-alert', finalNegotiatedAmount: 90,
      rfq: { id: 'rfq-alert', projectId: 'project-1', rfqNumber: 'RFQ-ALERT' }, recommendedVendor: { name: 'Acme' },
    });
    dispatchNotification.mockResolvedValueOnce(undefined);
    await expect(reviewAward(request('http://localhost/api/procurement/awards', { awardId: 'award-alert', action: 'APPROVE' }))).resolves.toMatchObject({ ok: true });
  });

  it('supports benchmark overrides, zero benchmark savings, and recommendation errors', async () => {
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-2', rfqNumber: 'RFQ-2', projectId: 'project-2', status: 'COMPARISON', estimatedBenchmarkValue: 0 });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-2', name: 'Vendor' });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invitation-2' });
    await createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-2', recommendedVendorId: 'vendor-2', originalQuoteAmount: '110', finalNegotiatedAmount: '100', benchmarkAmount: '90', justification: 'Override' }));
    const overrideBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[0][0] as Array<{ values: unknown[] }>;
    expect(overrideBatch[0].values).toEqual(expect.arrayContaining([110, 100, 90, -10, -11.11]));
    (writeD1BatchAtomically as jest.Mock).mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    db.rfq.findFirst.mockResolvedValueOnce({ id: 'rfq-3', status: 'COMPARISON' });
    db.vendor.findFirst.mockResolvedValueOnce({ id: 'vendor-3', name: 'Vendor' });
    db.rfqVendor.findFirst.mockResolvedValueOnce({ id: 'invitation-3' });
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-3', recommendedVendorId: 'vendor-3', finalNegotiatedAmount: 100, justification: 'Best' }))).resolves.toEqual({
      ok: false, error: UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, status: 409,
    });
    db.rfq.findFirst.mockRejectedValueOnce(new Error('award submit failed'));
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'v', justification: 'x' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitAwardRecommendation, status: 500 });
    db.rfq.findFirst.mockRejectedValueOnce({});
    await expect(createAward(request('http://localhost/api/procurement/awards', { rfqId: 'rfq-1', recommendedVendorId: 'v', justification: 'x' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToSubmitAwardRecommendation, status: 500 });
  });

  it('validates award approvals and applies approve or reject decisions', async () => {
    const denied = { status: 401 };
    auth.mockResolvedValueOnce(denied);
    isContext.mockReturnValueOnce(false);
    await expect(reviewAward(request('http://localhost/api/procurement/awards', {}))).resolves.toBe(denied);
    await expect(reviewAward(request('http://localhost/api/procurement/awards', {}))).resolves.toEqual({ ok: false, error: UI_STRINGS.appApiProcurementAwardsRoute.awardIDAndActionAPPROVEREJECTAreRequired, status: 400 });
    db.awardRecommendation.findFirst.mockResolvedValueOnce(null);
    await expect(reviewAward(request('http://localhost/api/procurement/awards', { awardId: 'missing', action: 'APPROVE' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.awardRecommendationNotFound, status: 404 });
    const award = { id: 'award-1', tenantId: 'tenant-1', status: 'PENDING_APPROVAL', rfqId: 'rfq-1', finalNegotiatedAmount: 900, rfq: { projectId: 'project-1', rfqNumber: 'RFQ-1' }, recommendedVendor: { name: 'Acme' } };
    for (const [action, status, rfqStatus] of [['APPROVE', 'APPROVED', 'APPROVED'], ['REJECT', 'REJECTED', 'COMPARISON']]) {
      db.awardRecommendation.findFirst.mockResolvedValueOnce(award);
      const result = await reviewAward(request('http://localhost/api/procurement/awards', { awardId: 'award-1', action, ...(action === 'APPROVE' ? { remarks: 'Approved' } : {}) }));
      expect(result).toMatchObject({ ok: true, data: { award: { status }, message: `Award recommendation successfully ${status.toLowerCase()}` } });
      const decisionBatch = (writeD1BatchAtomically as jest.Mock).mock.calls[(writeD1BatchAtomically as jest.Mock).mock.calls.length - 1][0] as Array<{ sql: string; values: unknown[] }>;
      expect(decisionBatch).toHaveLength(4);
      expect(decisionBatch[0].values).toContain(status);
      expect(decisionBatch[2].values).toContain(rfqStatus);
    }
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'AWARD_APPROVED' }), { prepareOnly: true });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'AWARD_REJECTED' }), { prepareOnly: true });
    db.awardRecommendation.findFirst.mockRejectedValueOnce(new Error('award review failed'));
    await expect(reviewAward(request('http://localhost/api/procurement/awards', { awardId: 'award-1', action: 'REJECT' }))).resolves.toEqual({ ok: false, error: UI_STRINGS.common.userMessages.failedToReviewAwardRecommendation, status: 500 });
  });
});
