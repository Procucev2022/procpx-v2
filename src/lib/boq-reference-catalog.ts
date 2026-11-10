import { prisma } from '@/lib/prisma';
import { interpolateUiString } from '@/lib/i18n';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { logEvent } from '@/lib/observability/server-logger';
import {
  BOQ_REFERENCE_CATALOG_LIMIT_EXCEEDED_EVENT,
  MAX_ACTIVE_BOQ_CATEGORY_REFERENCES,
  MAX_ACTIVE_BOQ_UOM_REFERENCES,
} from './boq-reference-catalog.constants';
import type {
  BoqReferenceCatalogContext,
  BoqReferenceCatalogResult,
  BoqReferenceCatalogSelection,
} from '@app-types/lib/boq-reference-catalog.types';

export async function loadActiveBoqReferenceCatalog(
  context: BoqReferenceCatalogContext,
  selection: BoqReferenceCatalogSelection = { categories: true, uoms: true },
): Promise<BoqReferenceCatalogResult> {
  const startedAt = Date.now();
  const [categories, uoms] = await Promise.all([
    selection.categories
      ? prisma.category.findMany({
        where: { tenantId: context.tenantId, isActive: true },
        select: { id: true, name: true, parentId: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES + 1,
      })
      : Promise.resolve([]),
    selection.uoms
      ? prisma.uomMaster.findMany({
        where: { tenantId: context.tenantId, isActive: true },
        select: { id: true, code: true, aliases: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        take: MAX_ACTIVE_BOQ_UOM_REFERENCES + 1,
      })
      : Promise.resolve([]),
  ]);

  if (categories.length > MAX_ACTIVE_BOQ_CATEGORY_REFERENCES) {
    logEvent('warn', BOQ_REFERENCE_CATALOG_LIMIT_EXCEEDED_EVENT, {
      operation: 'load_active_category_references', route: context.route,
      ...(requestId(context.requestId) ? { requestId: requestId(context.requestId) } : {}),
      tenantId: context.tenantId, userId: context.userId, catalog: 'category',
      resultCountAtLeast: categories.length, maxItems: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES,
      durationMs: Date.now() - startedAt, status: 'rejected',
    });
    return {
      ok: false,
      kind: 'category',
      message: interpolateUiString(UI_STRINGS.appApiMastersCategoriesRoute.activeCategoryListExceedsMaximumSize, {
        maxItems: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES,
      }),
      resultCountAtLeast: categories.length,
      maxItems: MAX_ACTIVE_BOQ_CATEGORY_REFERENCES,
    };
  }

  if (uoms.length > MAX_ACTIVE_BOQ_UOM_REFERENCES) {
    logEvent('warn', BOQ_REFERENCE_CATALOG_LIMIT_EXCEEDED_EVENT, {
      operation: 'load_active_uom_references', route: context.route,
      ...(requestId(context.requestId) ? { requestId: requestId(context.requestId) } : {}),
      tenantId: context.tenantId, userId: context.userId, catalog: 'uom',
      resultCountAtLeast: uoms.length, maxItems: MAX_ACTIVE_BOQ_UOM_REFERENCES,
      durationMs: Date.now() - startedAt, status: 'rejected',
    });
    return {
      ok: false,
      kind: 'uom',
      message: interpolateUiString(UI_STRINGS.appApiMastersUomRoute.activeUomListExceedsMaximumSize, {
        maxItems: MAX_ACTIVE_BOQ_UOM_REFERENCES,
      }),
      resultCountAtLeast: uoms.length,
      maxItems: MAX_ACTIVE_BOQ_UOM_REFERENCES,
    };
  }

  return { ok: true, categories, uoms };
}

function requestId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().slice(0, 128);
  return normalized || undefined;
}
