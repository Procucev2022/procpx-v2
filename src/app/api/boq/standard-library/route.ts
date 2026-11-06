// src/app/api/boq/standard-library/route.ts - Standard BOQ Library API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import {
  DEFAULT_STANDARD_BOQ_PAGE_SIZE,
  MAX_STANDARD_BOQ_ITEM_CODE_LENGTH,
  MAX_STANDARD_BOQ_ITEM_COST_DRIVERS_LENGTH,
  MAX_STANDARD_BOQ_ITEM_DESCRIPTION_LENGTH,
  MAX_STANDARD_BOQ_ITEM_NAME_LENGTH,
  MAX_STANDARD_BOQ_ITEM_SPECIFICATION_LENGTH,
  MAX_STANDARD_BOQ_IMPORT_ITEMS,
  MAX_STANDARD_BOQ_PAGE_SIZE,
  STANDARD_BOQ_EXISTING_CODE_LOOKUP_CHUNK_SIZE,
  STANDARD_BOQ_AUDIT_INSERT_SQL,
  STANDARD_BOQ_ITEM_INSERT_SQL,
} from './route.constants';

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('STANDARD_BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const { page } = getListPageWindow(searchParams);
  const requestedPageSize = Number(searchParams.get('pageSize'));
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, MAX_STANDARD_BOQ_PAGE_SIZE)
    : DEFAULT_STANDARD_BOQ_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const sector = searchParams.get('sector') || '';
  const projectType = searchParams.get('projectType') || '';
  const category = searchParams.get('category') || '';
  const subcategory = searchParams.get('subcategory') || '';
  const search = searchParams.get('search') || '';

  const where: any = {
    tenantId: ctx.tenantId,
    isActive: true,
  };

  if (sector && sector !== 'ALL') where.sector = sector;
  if (projectType) where.projectType = projectType;
  if (category && category !== 'ALL') where.category = category;
  if (subcategory) where.subcategory = subcategory;
  if (search) {
    where.OR = [
      { itemCode: { contains: search } },
      { standardDescription: { contains: search } },
      { detailedSpecification: { contains: search } },
      { brandMake: { contains: search } },
    ];
  }

  const startedAt = Date.now();
  try {
    const [items, total] = await Promise.all([
      prisma.standardBoqItem.findMany({
        where,
        orderBy: [{ category: 'asc' }, { itemCode: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.standardBoqItem.count({ where }),
    ]);
    return apiSuccess({ items, total, page, pageSize, hasMore: skip + items.length < total });
  } catch (error) {
    await writeStructuredLog('error', 'standard_boq.library_read_failed', {
      operation: 'list_standard_boq_items', route: '/api/boq/standard-library',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      page, pageSize, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiBoqStandardLibraryRoute.failedToFetchStandardBOQItems, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('STANDARD_BOQ_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body: unknown = await req.json();
    if (!isRecord(body) && !Array.isArray(body)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);

    // Determine whether body is single item or array of items
    let rawItems: any[] = [];
    if (Array.isArray(body)) {
      rawItems = body;
    } else if (Array.isArray(body.items)) {
      // Inherit group-level sector, projectType, category if provided on parent object
      rawItems = body.items.map((item: unknown) => isRecord(item) ? ({
        sector: item.sector || body.sector || 'RETAIL',
        projectType: item.projectType || body.projectType || 'Store Fitout',
        category: item.category || body.category,
        subcategory: item.subcategory || body.subcategory || 'General',
        ...item,
      }) : item);
    } else {
      rawItems = [body];
    }

    if (rawItems.length === 0) {
      return apiError(UI_STRINGS.appApiBoqStandardLibraryRoute.atLeastOneStandardBOQItemIsRequired, 400, { route: '/api/boq/standard-library', method: 'POST' });
    }
    if (rawItems.length > MAX_STANDARD_BOQ_IMPORT_ITEMS) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.standardBoqImportExceedsMaximumItemCount, {
        maxItems: MAX_STANDARD_BOQ_IMPORT_ITEMS,
      }), 400);
    }

    // Validate all items before saving
    const existingCategories = await prisma.category.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { name: true },
    });
    const validCatNames = new Set(existingCategories.map(c => c.name.toLowerCase()));

    const seenCodes = new Set<string>();
    const sanitizedItems: any[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      const itemNum = i + 1;

      if (!isRecord(it)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      const itemCode = typeof it.itemCode === 'string' ? it.itemCode.trim() : '';
      const standardDescription = typeof it.standardDescription === 'string' ? it.standardDescription.trim() : '';
      const category = typeof it.category === 'string' ? it.category.trim() : '';
      const uom = typeof it.uom === 'string' ? it.uom.trim().toUpperCase() : '';
      const sector = typeof it.sector === 'string' ? it.sector.trim() || 'RETAIL' : 'RETAIL';
      const projectType = typeof it.projectType === 'string' ? it.projectType.trim() || 'Store Fitout' : 'Store Fitout';
      const subcategory = typeof it.subcategory === 'string' ? it.subcategory.trim() || 'General' : 'General';
      const detailedSpecification = typeof it.detailedSpecification === 'string' ? it.detailedSpecification.trim() || standardDescription : standardDescription;
      const brandMake = typeof it.brandMake === 'string' ? it.brandMake.trim() || null : null;
      const benchmarkRate = it.benchmarkRate !== undefined && it.benchmarkRate !== null && it.benchmarkRate !== ''
        ? Number(it.benchmarkRate)
        : null;
      const costDrivers = it.costDrivers ? (typeof it.costDrivers === 'string' ? it.costDrivers : JSON.stringify(it.costDrivers)) : null;

      if (itemCode.length > MAX_STANDARD_BOQ_ITEM_CODE_LENGTH
        || category.length > MAX_STANDARD_BOQ_ITEM_NAME_LENGTH
        || uom.length > MAX_STANDARD_BOQ_ITEM_NAME_LENGTH
        || sector.length > MAX_STANDARD_BOQ_ITEM_NAME_LENGTH
        || projectType.length > MAX_STANDARD_BOQ_ITEM_NAME_LENGTH
        || subcategory.length > MAX_STANDARD_BOQ_ITEM_NAME_LENGTH
        || standardDescription.length > MAX_STANDARD_BOQ_ITEM_DESCRIPTION_LENGTH
        || detailedSpecification.length > MAX_STANDARD_BOQ_ITEM_SPECIFICATION_LENGTH
        || (brandMake && brandMake.length > MAX_STANDARD_BOQ_ITEM_NAME_LENGTH)
        || (costDrivers && costDrivers.length > MAX_STANDARD_BOQ_ITEM_COST_DRIVERS_LENGTH)
        || (benchmarkRate !== null && (!Number.isFinite(benchmarkRate) || benchmarkRate < 0))) {
        return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      }

      if (!itemCode) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeIsRequired, { "itemNum": itemNum }), 400, { route: '/api/boq/standard-library', method: 'POST' });
      }
      if (!standardDescription) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeStandardItemDescriptionIsRequired, { "itemNum": itemNum, "itemCode": itemCode }), 400, { route: '/api/boq/standard-library', method: 'POST' });
      }
      if (!category) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeCategoryIsRequired, { "itemNum": itemNum, "itemCode": itemCode }), 400, { route: '/api/boq/standard-library', method: 'POST' });
      }
      if (!validCatNames.has(category.toLowerCase())) {
        return apiError(
          interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeCategoryCategoryDoesNotExistInCategoryMasterCategoriesMustBeCreatedViaCategoryCreationFirst, { "itemNum": itemNum, "itemCode": itemCode, "category": category }),
          400, { route: '/api/boq/standard-library', method: 'POST' });
      }
      if (!uom) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeUOMIsRequired, { "itemNum": itemNum, "itemCode": itemCode }), 400, { route: '/api/boq/standard-library', method: 'POST' });
      }

      // Check duplicate within the incoming batch
      if (seenCodes.has(itemCode.toLowerCase())) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.duplicateItemCodeDetectedWithinSubmissionItemCode, { "itemCode": itemCode }), 409, { route: '/api/boq/standard-library', method: 'POST' });
      }
      seenCodes.add(itemCode.toLowerCase());

      sanitizedItems.push({
        tenantId: ctx.tenantId,
        itemCode,
        sector,
        projectType,
        category,
        subcategory,
        standardDescription,
        detailedSpecification,
        uom,
        brandMake,
        benchmarkRate,
        costDrivers,
        isActive: true,
      });
    }

    const existingItems: Array<{ itemCode: string }> = [];
    for (let offset = 0; offset < sanitizedItems.length; offset += STANDARD_BOQ_EXISTING_CODE_LOOKUP_CHUNK_SIZE) {
      const codeChunk = sanitizedItems.slice(offset, offset + STANDARD_BOQ_EXISTING_CODE_LOOKUP_CHUNK_SIZE);
      existingItems.push(...await prisma.standardBoqItem.findMany({
        where: { tenantId: ctx.tenantId, itemCode: { in: codeChunk.map((item) => item.itemCode) } },
        select: { itemCode: true },
      }));
    }
    const existingCodes = new Set(existingItems.map((item) => item.itemCode.toLowerCase()));
    const conflictingCode = sanitizedItems.find((item) => existingCodes.has(item.itemCode.toLowerCase()));
    if (conflictingCode) {
      return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.itemCodeItemCodeAlreadyExistsInTheCentralStandardBOQMaster, {
        itemCode: conflictingCode.itemCode,
      }), 409);
    }

    const createdAt = new Date();
    const createdItems = sanitizedItems.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      benchmarkEligibility: true,
      aiRefinementEligibility: true,
      createdAt,
      updatedAt: createdAt,
    }));
    const auditDescription = interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.createdLengthStandardBOQLineItemsInCentralStandardBOQMasterSectorSectorCategoryCategory, {
      length: createdItems.length,
      sector: sanitizedItems[0]?.sector,
      category: sanitizedItems[0]?.category,
    });
    const statements: D1BatchInputStatement[] = createdItems.map((item) => ({
      sql: STANDARD_BOQ_ITEM_INSERT_SQL,
      values: [
        item.id, item.tenantId, item.itemCode, item.sector, item.projectType, item.category,
        item.subcategory, item.standardDescription, item.detailedSpecification, item.uom,
        item.brandMake, item.benchmarkRate, item.costDrivers, createdAt, createdAt,
      ],
    }));
    statements.push({
      sql: STANDARD_BOQ_AUDIT_INSERT_SQL,
      values: [
        crypto.randomUUID(), ctx.tenantId, ctx.userId, createdItems[0].id, auditDescription,
        JSON.stringify({ count: createdItems.length, codes: sanitizedItems.map((item) => item.itemCode) }), createdAt,
      ],
    });
    const results = await writeD1BatchAtomically(statements);
    if (results.length !== statements.length || results.some((result) => Number(result.meta?.changes || 0) !== 1)) {
      throw new Error(UI_STRINGS.common.userMessages.failedToAddStandardBoqItems);
    }

    return apiSuccess(
      {
        message: interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.successfullyCreatedLengthStandardBOQLineItems, { "length": createdItems.length }),
        count: createdItems.length,
        items: createdItems,
      },
      201
    );
  } catch (error: unknown) {
    const isUniqueConflict = error instanceof Error && /unique constraint|unique failed|P2002/i.test(error.message);
    await writeStructuredLog(isUniqueConflict ? 'warn' : 'error', 'standard_boq.bulk_create_failed', {
      operation: 'create_standard_boq_items', route: '/api/boq/standard-library',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    if (isUniqueConflict) return apiError(UI_STRINGS.appApiBoqStandardLibraryRoute.duplicateStandardBoqCodesFoundBeforeSaving, 409);
    return apiError(UI_STRINGS.common.userMessages.failedToAddStandardBoqItems, 500);
  }
}
