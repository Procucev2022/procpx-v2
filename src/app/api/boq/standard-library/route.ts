// src/app/api/boq/standard-library/route.ts - Standard BOQ Library API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('STANDARD_BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
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

  const items = await prisma.standardBoqItem.findMany({
    where,
    orderBy: [{ category: 'asc' }, { itemCode: 'asc' }],
  });

  return apiSuccess(items);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('STANDARD_BOQ_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();

    // Determine whether body is single item or array of items
    let rawItems: any[] = [];
    if (Array.isArray(body)) {
      rawItems = body;
    } else if (Array.isArray(body.items)) {
      // Inherit group-level sector, projectType, category if provided on parent object
      rawItems = body.items.map((it: any) => ({
        sector: it.sector || body.sector || 'RETAIL',
        projectType: it.projectType || body.projectType || 'Store Fitout',
        category: it.category || body.category,
        subcategory: it.subcategory || body.subcategory || 'General',
        ...it,
      }));
    } else {
      rawItems = [body];
    }

    if (rawItems.length === 0) {
      return apiError(UI_STRINGS.appApiBoqStandardLibraryRoute.atLeastOneStandardBOQItemIsRequired, 400);
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

      const itemCode = it.itemCode?.trim();
      const standardDescription = it.standardDescription?.trim();
      const category = it.category?.trim();
      const uom = it.uom?.trim()?.toUpperCase();

      if (!itemCode) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeIsRequired, { "itemNum": itemNum }), 400);
      }
      if (!standardDescription) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeStandardItemDescriptionIsRequired, { "itemNum": itemNum, "itemCode": itemCode }), 400);
      }
      if (!category) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeCategoryIsRequired, { "itemNum": itemNum, "itemCode": itemCode }), 400);
      }
      if (!validCatNames.has(category.toLowerCase())) {
        return apiError(
          interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeCategoryCategoryDoesNotExistInCategoryMasterCategoriesMustBeCreatedViaCategoryCreationFirst, { "itemNum": itemNum, "itemCode": itemCode, "category": category }),
          400
        );
      }
      if (!uom) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.lineItemNumItemCodeUOMIsRequired, { "itemNum": itemNum, "itemCode": itemCode }), 400);
      }

      // Check duplicate within the incoming batch
      if (seenCodes.has(itemCode.toLowerCase())) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.duplicateItemCodeDetectedWithinSubmissionItemCode, { "itemCode": itemCode }), 409);
      }
      seenCodes.add(itemCode.toLowerCase());

      // Check duplicate in database
      const existingInDb = await prisma.standardBoqItem.findFirst({
        where: {
          tenantId: ctx.tenantId,
          itemCode: { equals: itemCode },
        },
      });

      if (existingInDb) {
        return apiError(interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.itemCodeItemCodeAlreadyExistsInTheCentralStandardBOQMaster, { "itemCode": itemCode }), 409);
      }

      sanitizedItems.push({
        tenantId: ctx.tenantId,
        itemCode,
        sector: it.sector?.trim() || 'RETAIL',
        projectType: it.projectType?.trim() || 'Store Fitout',
        category,
        subcategory: it.subcategory?.trim() || 'General',
        standardDescription,
        detailedSpecification: it.detailedSpecification?.trim() || standardDescription,
        uom,
        brandMake: it.brandMake?.trim() || null,
        benchmarkRate: it.benchmarkRate ? parseFloat(it.benchmarkRate) : null,
        costDrivers: it.costDrivers ? (typeof it.costDrivers === 'string' ? it.costDrivers : JSON.stringify(it.costDrivers)) : null,
        isActive: true,
      });
    }

    // Save items to central Standard BOQ Master
    const createdItems: any[] = [];
    for (const itemData of sanitizedItems) {
      const created = await prisma.standardBoqItem.create({
        data: itemData,
      });
      createdItems.push(created);
    }

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          entityType: 'BOQ' as any,
          entityId: createdItems[0]?.id || 'STANDARD_BOQ',
          action: 'CREATE',
          description: interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.createdLengthStandardBOQLineItemsInCentralStandardBOQMasterSectorSectorCategoryCategory, { "length": createdItems.length, "sector": sanitizedItems[0]?.sector, "category": sanitizedItems[0]?.category }),
          newValue: JSON.stringify({ count: createdItems.length, codes: sanitizedItems.map(s => s.itemCode) }),
        },
      });
    } catch {
      // Non-fatal
    }

    return apiSuccess(
      {
        message: interpolateUiString(UI_STRINGS.appApiBoqStandardLibraryRoute.successfullyCreatedLengthStandardBOQLineItems, { "length": createdItems.length }),
        count: createdItems.length,
        items: createdItems,
      },
      201
    );
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToAddStandardBoqItems }), 500);
  }
}
