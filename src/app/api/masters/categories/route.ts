import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  CATEGORY_INSERT_IF_VALID_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import { generateUniqueCategoryCode } from './category-code';
import {
  CATEGORY_CODE_LOOKUP_LIMIT_ERROR,
  MAX_ACTIVE_CATEGORY_RESULTS,
  MAX_CATEGORY_CODE_LOOKUP_RESULTS,
} from './route.constants';

function categoryNameConflict(name: string, hasParent: boolean) {
  return apiError(
    hasParent
      ? interpolateUiString(UI_STRINGS.appApiMastersCategoriesRoute.subcategoryNormalizedNameAlreadyExistsUnderTheSelectedParentCategory, { normalizedName: name })
      : interpolateUiString(UI_STRINGS.appApiMastersCategoriesRoute.categoryNormalizedNameAlreadyExists, { normalizedName: name }),
    409,
  );
}

function categoryCodeConflict(code: string, existingName = '') {
  return apiError(
    interpolateUiString(UI_STRINGS.appApiMastersCategoriesRoute.categoryCodeFinalCodeIsAlreadyInUseByName, {
      finalCode: code,
      name: existingName || UI_STRINGS.appAppApprovalsVendorRatingsPage.nA,
    }),
    409,
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return /unique constraint|unique failed|P2002/i.test(message);
}

async function logCategoryFailure(
  level: 'error' | 'warn',
  event: string,
  req: NextRequest,
  tenantId: string,
  startedAt: number,
  context: Record<string, unknown>,
  error?: unknown,
) {
  await writeStructuredLog(level, event, {
    operation: 'create_category',
    route: '/api/masters/categories',
    requestId: req.headers.get('x-request-id'),
    tenantId,
    durationMs: Date.now() - startedAt,
    ...context,
    ...(error === undefined ? {} : {
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 500) }
        : { type: typeof error },
    }),
  });
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('MASTER_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const flat = searchParams.get('flat') === 'true';

  try {
    const all = await prisma.category.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      include: { parent: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: MAX_ACTIVE_CATEGORY_RESULTS + 1,
    });
    if (all.length > MAX_ACTIVE_CATEGORY_RESULTS) {
      await writeStructuredLog('warn', 'masters.categories_result_limit_exceeded', {
        operation: 'read_categories', route: '/api/masters/categories',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId,
        userId: ctx.userId, resultCountAtLeast: all.length, maxItems: MAX_ACTIVE_CATEGORY_RESULTS,
        durationMs: Date.now() - startedAt,
      });
      return apiError(interpolateUiString(UI_STRINGS.appApiMastersCategoriesRoute.activeCategoryListExceedsMaximumSize, {
        maxItems: MAX_ACTIVE_CATEGORY_RESULTS,
      }), 413);
    }
    if (flat) return apiSuccess(all);

    const categories = all
      .filter((category) => !category.parentId)
      .map((category) => ({ ...category, children: [] as Array<Record<string, unknown>> }));
    const rootsById = new Map(categories.map((category) => [category.id, category]));
    for (const category of all) {
      if (!category.parentId) continue;
      const root = rootsById.get(category.parentId);
      if (!root) continue;
      const child = { ...category };
      Reflect.deleteProperty(child, 'parent');
      root.children.push(child);
    }
    for (const category of categories) {
      category.children.sort((left, right) => {
        const nameOrder = String(left.name || '').localeCompare(String(right.name || ''));
        return nameOrder || String(left.id || '').localeCompare(String(right.id || ''));
      });
    }
    return apiSuccess(categories);
  } catch (error) {
    await writeStructuredLog('error', 'masters.categories_read_failed', {
      operation: 'read_categories',
      route: '/api/masters/categories',
      requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 500) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.failedToFetchCategories, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('MASTER_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let normalizedName: string | undefined;
  let targetParentId: string | null = null;
  let finalCode: string | null = null;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const payload = body as Record<string, unknown>;
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      return apiError(UI_STRINGS.common.categoryNameIsRequired, 400);
    }
    if (payload.code !== undefined && payload.code !== null && typeof payload.code !== 'string') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (payload.parentId !== undefined && payload.parentId !== null && typeof payload.parentId !== 'string') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    normalizedName = payload.name.trim();
    const normalizedCode = typeof payload.code === 'string' && payload.code.trim()
      ? payload.code.trim().toUpperCase()
      : null;
    targetParentId = typeof payload.parentId === 'string' ? payload.parentId.trim() || null : null;

    let parentCategory: { id: string; code: string | null } | null = null;
    if (targetParentId) {
      parentCategory = await prisma.category.findFirst({
        where: { id: targetParentId, tenantId: ctx.tenantId, isActive: true },
        select: { id: true, code: true },
      });
      if (!parentCategory) {
        return apiError(UI_STRINGS.appApiMastersCategoriesRoute.selectedParentCategoryDoesNotExist, 404, { route: '/api/masters/categories', method: 'POST' });
      }
    }

    const existingName = await prisma.category.findFirst({
      where: { tenantId: ctx.tenantId, name: normalizedName, parentId: targetParentId },
      select: { id: true },
    });
    if (existingName) return categoryNameConflict(normalizedName, Boolean(targetParentId));

    finalCode = normalizedCode || await generateUniqueCategoryCode(
      ctx.tenantId,
      normalizedName,
      targetParentId,
      parentCategory?.code,
    );
    const existingCode = await prisma.category.findFirst({
      where: { tenantId: ctx.tenantId, code: finalCode },
      select: { name: true },
    });
    if (existingCode) return categoryCodeConflict(finalCode, existingCode.name);

    const now = new Date();
    const categoryId = crypto.randomUUID();
    const categoryType = targetParentId ? 'subcategory' : 'category';
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiMastersCategoriesRoute.createdValue1NormalizedNameCodeValue3,
      {
        value1: categoryType,
        normalizedName,
        value3: finalCode,
      },
    );
    const statements: D1BatchInputStatement[] = [
      {
        sql: CATEGORY_INSERT_IF_VALID_SQL,
        values: [
          categoryId, ctx.tenantId, normalizedName, finalCode, targetParentId,
          targetParentId ? 2 : 1, now, now, targetParentId, targetParentId,
          ctx.tenantId, ctx.tenantId, normalizedName, targetParentId,
        ],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, ctx.userId, null, 'CATEGORY', categoryId, 'CREATE',
          auditDescription, null, JSON.stringify({ name: normalizedName, code: finalCode, parentId: targetParentId }),
          null, null, now,
        ],
      },
    ];
    const results = await writeD1BatchAtomically(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      const parentStillAvailable = !targetParentId || await prisma.category.findFirst({
        where: { id: targetParentId, tenantId: ctx.tenantId, isActive: true },
        select: { id: true },
      });
      if (!parentStillAvailable) {
        return apiError(UI_STRINGS.appApiMastersCategoriesRoute.selectedParentCategoryDoesNotExist, 404);
      }
      return categoryNameConflict(normalizedName, Boolean(targetParentId));
    }

    return apiSuccess({
      id: categoryId,
      tenantId: ctx.tenantId,
      name: normalizedName,
      code: finalCode,
      parentId: targetParentId,
      level: targetParentId ? 2 : 1,
      isActive: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      parent: parentCategory,
      children: [],
    }, 201);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === CATEGORY_CODE_LOOKUP_LIMIT_ERROR) {
      await logCategoryFailure('error', 'masters.category_code_lookup_limit_exceeded', req, ctx.tenantId, startedAt, {
        categoryName: normalizedName,
        maxItems: MAX_CATEGORY_CODE_LOOKUP_RESULTS,
      }, error);
      return apiError(UI_STRINGS.appApiMastersCategoriesRoute.categoryCodeLookupExceedsLimit, 503);
    }
    if (isUniqueConstraintError(error) && finalCode) {
      try {
        const duplicateName = normalizedName
          ? await prisma.category.findFirst({
              where: { tenantId: ctx.tenantId, name: normalizedName, parentId: targetParentId },
              select: { id: true },
            })
          : null;
        if (duplicateName && normalizedName) return categoryNameConflict(normalizedName, Boolean(targetParentId));
        const duplicateCode = await prisma.category.findFirst({
          where: { tenantId: ctx.tenantId, code: finalCode },
          select: { name: true },
        });
        if (duplicateCode) return categoryCodeConflict(finalCode, duplicateCode.name);
      } catch {
        // The original constraint error remains the useful diagnostic if conflict lookup also fails.
      }
      await logCategoryFailure('warn', 'masters.category_create_conflict', req, ctx.tenantId, startedAt, {
        categoryName: normalizedName,
        categoryCode: finalCode,
        parentId: targetParentId,
      }, error);
      return categoryCodeConflict(finalCode);
    }

    await logCategoryFailure('error', 'masters.category_create_failed', req, ctx.tenantId, startedAt, {
      categoryName: normalizedName,
      parentId: targetParentId,
    }, error);
    return apiError(UI_STRINGS.common.userMessages.failedToCreateCategory, 500);
  }
}
