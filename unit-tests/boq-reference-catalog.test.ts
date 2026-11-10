import { prisma } from '../src/lib/prisma';
import { logEvent } from '../src/lib/observability/server-logger';
import { loadActiveBoqReferenceCatalog } from '../src/lib/boq-reference-catalog';
import {
  BOQ_REFERENCE_CATALOG_LIMIT_EXCEEDED_EVENT,
  MAX_ACTIVE_BOQ_CATEGORY_REFERENCES,
  MAX_ACTIVE_BOQ_UOM_REFERENCES,
} from '../src/lib/boq-reference-catalog.constants';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    category: { findMany: jest.fn() },
    uomMaster: { findMany: jest.fn() },
  },
}));
jest.mock('../src/lib/observability/server-logger', () => ({ logEvent: jest.fn() }));

const categoryFindMany = prisma.category.findMany as jest.Mock;
const uomFindMany = prisma.uomMaster.findMany as jest.Mock;
const structuredEvent = logEvent as jest.Mock;
const context = { tenantId: 'tenant-1', userId: 'user-1', route: '/api/boq/manual' };

describe('loadActiveBoqReferenceCatalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    categoryFindMany.mockResolvedValue([]);
    uomFindMany.mockResolvedValue([]);
  });

  it('loads active category and UOM references in stable order with bounded selects', async () => {
    const categories = [{ id: 'category-1', name: 'Civil', parentId: null }];
    const uoms = [{ id: 'uom-1', code: 'EA', aliases: 'each' }];
    categoryFindMany.mockResolvedValueOnce(categories);
    uomFindMany.mockResolvedValueOnce(uoms);

    await expect(loadActiveBoqReferenceCatalog(context)).resolves.toEqual({
      ok: true, categories, uoms,
    });
    expect(categoryFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true },
      select: { id: true, name: true, parentId: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES + 1,
    });
    expect(uomFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true },
      select: { id: true, code: true, aliases: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: MAX_ACTIVE_BOQ_UOM_REFERENCES + 1,
    });
    expect(structuredEvent).not.toHaveBeenCalled();
  });

  it('only queries the selected reference catalogs', async () => {
    await expect(loadActiveBoqReferenceCatalog(context, { categories: true, uoms: false })).resolves.toEqual({
      ok: true, categories: [], uoms: [],
    });
    expect(categoryFindMany).toHaveBeenCalledTimes(1);
    expect(uomFindMany).not.toHaveBeenCalled();

    categoryFindMany.mockClear();
    await expect(loadActiveBoqReferenceCatalog(context, { categories: false, uoms: true })).resolves.toEqual({
      ok: true, categories: [], uoms: [],
    });
    expect(categoryFindMany).not.toHaveBeenCalled();
    expect(uomFindMany).toHaveBeenCalledTimes(1);

    categoryFindMany.mockClear();
    uomFindMany.mockClear();
    await expect(loadActiveBoqReferenceCatalog(context, { categories: false, uoms: false })).resolves.toEqual({
      ok: true, categories: [], uoms: [],
    });
    expect(categoryFindMany).not.toHaveBeenCalled();
    expect(uomFindMany).not.toHaveBeenCalled();
  });

  it('fails closed and logs when the active category reference limit is exceeded', async () => {
    categoryFindMany.mockResolvedValueOnce(Array.from({ length: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES + 1 }, (_, index) => ({
      id: `category-${index}`, name: `Category ${index}`, parentId: null,
    })));

    const result = await loadActiveBoqReferenceCatalog({ ...context, requestId: '   ' }, { categories: true, uoms: false });

    expect(result).toEqual({
      ok: false,
      kind: 'category',
      message: UI_STRINGS.appApiMastersCategoriesRoute.activeCategoryListExceedsMaximumSize
        .replace('{{maxItems}}', String(MAX_ACTIVE_BOQ_CATEGORY_REFERENCES)),
      resultCountAtLeast: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES + 1,
      maxItems: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES,
    });
    expect(structuredEvent).toHaveBeenCalledWith('warn', BOQ_REFERENCE_CATALOG_LIMIT_EXCEEDED_EVENT, expect.objectContaining({
      operation: 'load_active_category_references', route: context.route,
      tenantId: context.tenantId, userId: context.userId, catalog: 'category',
      resultCountAtLeast: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES + 1,
      maxItems: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES, status: 'rejected', durationMs: expect.any(Number),
    }));
    expect(structuredEvent.mock.calls[0][2]).not.toHaveProperty('requestId');
  });

  it('fails closed and logs a normalized request ID when the active UOM limit is exceeded', async () => {
    uomFindMany.mockResolvedValueOnce(Array.from({ length: MAX_ACTIVE_BOQ_UOM_REFERENCES + 1 }, (_, index) => ({
      id: `uom-${index}`, code: `UOM-${index}`, aliases: null,
    })));

    const result = await loadActiveBoqReferenceCatalog({ ...context, requestId: '  request-123  ' }, { categories: false, uoms: true });

    expect(result).toEqual({
      ok: false,
      kind: 'uom',
      message: UI_STRINGS.appApiMastersUomRoute.activeUomListExceedsMaximumSize
        .replace('{{maxItems}}', String(MAX_ACTIVE_BOQ_UOM_REFERENCES)),
      resultCountAtLeast: MAX_ACTIVE_BOQ_UOM_REFERENCES + 1,
      maxItems: MAX_ACTIVE_BOQ_UOM_REFERENCES,
    });
    expect(structuredEvent).toHaveBeenCalledWith('warn', BOQ_REFERENCE_CATALOG_LIMIT_EXCEEDED_EVENT, expect.objectContaining({
      operation: 'load_active_uom_references', route: context.route, requestId: 'request-123',
      tenantId: context.tenantId, userId: context.userId, catalog: 'uom',
      resultCountAtLeast: MAX_ACTIVE_BOQ_UOM_REFERENCES + 1,
      maxItems: MAX_ACTIVE_BOQ_UOM_REFERENCES, status: 'rejected', durationMs: expect.any(Number),
    }));
  });
});
