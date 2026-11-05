// src/app/api/cost-centres/route.ts - Cost Centre Management API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { COST_CENTRE_INSERT_IF_PROJECT_EXISTS_SQL, COST_CENTRE_LOOKUP_MAX_OPTIONS, COST_CENTRE_SEARCH_MAX_LENGTH } from './route.constants';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import type { Prisma } from '@prisma/client';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('COST_CENTRE_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId')?.trim() || '';
  const costCentreId = searchParams.get('costCentreId')?.trim() || '';
  const search = (searchParams.get('search') || '').trim().slice(0, COST_CENTRE_SEARCH_MAX_LENGTH);

  const where: Prisma.CostCentreWhereInput = {
    tenantId: ctx.tenantId,
  };

  if (projectId) where.projectId = projectId;
  if (costCentreId) where.id = costCentreId;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { location: { contains: search } },
      { floorZone: { contains: search } },
    ];
  }

  const startedAt = Date.now();
  try {
    if (searchParams.has('page') || searchParams.has('pageSize')) {
      const pageWindow = getListPageWindow(searchParams);
      const budgetWhere: Prisma.BudgetWhereInput = {
        tenantId: ctx.tenantId,
        costCentre: { is: where },
      };
      const [rows, total, areaAggregate, budgetAggregate] = await Promise.all([
        prisma.costCentre.findMany({
          where,
          skip: pageWindow.skip,
          take: pageWindow.pageSize + 1,
          select: {
            id: true,
            projectId: true,
            code: true,
            name: true,
            description: true,
            areaSqFt: true,
            location: true,
            floorZone: true,
            status: true,
            project: { select: { id: true, projectCode: true, name: true } },
          },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
        }),
        prisma.costCentre.count({ where }),
        prisma.costCentre.aggregate({ where, _sum: { areaSqFt: true } }),
        prisma.budget.aggregate({
          where: budgetWhere,
          _sum: { totalAmount: true, approvedAmount: true, pendingAmount: true },
        }),
      ]);
      const hasMore = rows.length > pageWindow.pageSize;
      const costCentres = hasMore ? rows.slice(0, pageWindow.pageSize) : rows;
      const budgetGroups = costCentres.length > 0
        ? await prisma.budget.groupBy({
            by: ['costCentreId'],
            where: { tenantId: ctx.tenantId, costCentreId: { in: costCentres.map(({ id }) => id) } },
            _sum: { totalAmount: true, approvedAmount: true, pendingAmount: true },
          })
        : [];
      const budgetByCostCentre = new Map(budgetGroups.map((group) => [group.costCentreId, group._sum]));

      return apiSuccess({
        costCentres: costCentres.map((costCentre) => {
          const budgets = budgetByCostCentre.get(costCentre.id);
          const totalBudget = budgets?.totalAmount || 0;
          const approvedBudget = budgets?.approvedAmount || 0;
          const pendingBudget = budgets?.pendingAmount || 0;
          const ratePerSqFt = costCentre.areaSqFt && costCentre.areaSqFt > 0 ? approvedBudget / costCentre.areaSqFt : null;
          return {
            ...costCentre,
            totalBudget,
            approvedBudget,
            pendingBudget,
            ratePerSqFt: ratePerSqFt === null ? null : Math.round(ratePerSqFt * 100) / 100,
          };
        }),
        pagination: { page: pageWindow.page, pageSize: pageWindow.pageSize, total, hasMore },
        summary: {
          totalAreaSqFt: areaAggregate._sum.areaSqFt || 0,
          totalBudget: budgetAggregate._sum.totalAmount || 0,
          approvedBudget: budgetAggregate._sum.approvedAmount || 0,
          pendingBudget: budgetAggregate._sum.pendingAmount || 0,
        },
      });
    }

    // Project-scoped form dropdowns keep their array contract, but budget history
    // is reduced in D1 and never expanded into every option response.
    const lookupRows = await prisma.costCentre.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: COST_CENTRE_LOOKUP_MAX_OPTIONS + 1,
      select: {
        id: true, tenantId: true, projectId: true, code: true, name: true, description: true,
        areaSqFt: true, location: true, floorZone: true, status: true,
        project: { select: { id: true, projectCode: true, name: true, areaSqFt: true } },
      },
    });
    const hasMore = lookupRows.length > COST_CENTRE_LOOKUP_MAX_OPTIONS;
    const costCentres = hasMore ? lookupRows.slice(0, COST_CENTRE_LOOKUP_MAX_OPTIONS) : lookupRows;
    const budgetGroups = costCentres.length > 0
      ? await prisma.budget.groupBy({
          by: ['costCentreId'],
          where: { tenantId: ctx.tenantId, costCentreId: { in: costCentres.map(({ id }) => id) } },
          _sum: { totalAmount: true, approvedAmount: true, pendingAmount: true },
        })
      : [];

    if (hasMore) {
      await writeStructuredLog('warn', 'cost_centre.lookup_truncated', {
        operation: 'load_cost_centre_lookup', route: '/api/cost-centres',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId,
        userId: ctx.userId, projectId: projectId || null, searchLength: search.length,
        limit: COST_CENTRE_LOOKUP_MAX_OPTIONS,
      });
    }
    const budgetByCostCentre = new Map(budgetGroups.map((group) => [group.costCentreId, group._sum]));
    const enriched = costCentres.map((costCentre) => {
      const budget = budgetByCostCentre.get(costCentre.id);
      const totalBudget = budget?.totalAmount || 0;
      const approvedBudget = budget?.approvedAmount || 0;
      const pendingBudget = budget?.pendingAmount || 0;
      const ratePerSqFt = costCentre.areaSqFt && costCentre.areaSqFt > 0 ? approvedBudget / costCentre.areaSqFt : null;
      return { ...costCentre, totalBudget, approvedBudget, pendingBudget, ratePerSqFt: ratePerSqFt === null ? null : Math.round(ratePerSqFt * 100) / 100 };
    });
    const response = apiSuccess(enriched);
    response.headers.set('x-cost-centre-has-more', String(hasMore));
    response.headers.set('x-cost-centre-limit', String(COST_CENTRE_LOOKUP_MAX_OPTIONS));
    return response;
  } catch (error) {
    await writeStructuredLog('error', 'cost_centre.list_read_failed', {
      operation: 'list_cost_centres',
      route: '/api/cost-centres',
      requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: projectId || null,
      searchLength: search.length,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchCostCentres, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('COST_CENTRE_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let projectId: string | null = null;
  let costCentreCode: string | null = null;
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const payload = body as Record<string, unknown>;
    const { projectId: rawProjectId, code, name, description, areaSqFt, location, floorZone } = payload;

    if (typeof rawProjectId !== 'string' || !rawProjectId.trim() || typeof code !== 'string' || !code.trim() || typeof name !== 'string' || !name.trim()) {
      return apiError(UI_STRINGS.appApiCostCentresRoute.projectIDCostCentreCodeAndNameAreMandatory, 400);
    }
    const normalizedProjectId = rawProjectId.trim();
    const normalizedCode = code.trim();
    const normalizedName = name.trim();
    projectId = normalizedProjectId;
    costCentreCode = normalizedCode;
    const parsedArea = areaSqFt === null || areaSqFt === undefined || areaSqFt === '' ? null : Number(areaSqFt);
    if (parsedArea !== null && (!Number.isFinite(parsedArea) || parsedArea < 0)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    // Verify project belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: normalizedProjectId, tenantId: ctx.tenantId },
    });
    if (!project) {
      return apiError(UI_STRINGS.appApiCostCentresRoute.projectNotFoundOrInaccessible, 404);
    }

    // Check duplicate code within project
    const existing = await prisma.costCentre.findUnique({
      where: {
        tenantId_projectId_code: {
          tenantId: ctx.tenantId,
          projectId: normalizedProjectId,
          code: normalizedCode,
        },
      },
    });
    if (existing) {
      return apiError(interpolateUiString(UI_STRINGS.appApiCostCentresRoute.costCentreCodeCodeAlreadyExistsForThisProject, { "code": normalizedCode }), 409);
    }

    const now = new Date();
    const costCentre = {
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      projectId: normalizedProjectId,
      code: normalizedCode,
      name: normalizedName,
      description: typeof description === 'string' ? description.trim() || null : null,
      areaSqFt: parsedArea,
      location: typeof location === 'string' ? location.trim() || null : null,
      floorZone: typeof floorZone === 'string' ? floorZone.trim() || null : null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.userId,
    };
    const descriptionText = interpolateUiString(UI_STRINGS.appApiCostCentresRoute.costCentreCreatedCodeNameValue3Sqft, {
      code: costCentre.code,
      name: costCentre.name,
      value3: costCentre.areaSqFt || 0,
    });
    const results = await writeD1BatchAtomically([
      {
        sql: COST_CENTRE_INSERT_IF_PROJECT_EXISTS_SQL,
        values: [
          costCentre.id, costCentre.tenantId, costCentre.projectId, costCentre.code, costCentre.name, costCentre.description,
          costCentre.areaSqFt, costCentre.location, costCentre.floorZone, costCentre.status, now, now, costCentre.createdBy,
          normalizedProjectId, ctx.tenantId,
        ],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, ctx.userId, normalizedProjectId, 'COST_CENTRE', costCentre.id,
          'COST_CENTRE_CREATED', descriptionText, null, JSON.stringify(costCentre), null, null, now,
        ],
      },
    ]);
    const inserted = Number(results[0]?.meta?.changes || 0) === 1;
    const audited = Number(results[1]?.meta?.changes || 0) === 1;
    if (!inserted || !audited) {
      await writeStructuredLog('warn', 'cost_centre.creation_precondition_failed', {
        operation: 'create_cost_centre',
        route: '/api/cost-centres',
        requestId: req.headers.get('x-request-id'),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: normalizedProjectId,
        costCentreCode: normalizedCode,
        insertChanges: Number(results[0]?.meta?.changes || 0),
        auditChanges: Number(results[1]?.meta?.changes || 0),
      });
      return apiError(UI_STRINGS.common.userMessages.failedToCreateCostCentre2, 409);
    }
    return apiSuccess(costCentre, 201);
  } catch (error) {
    const uniqueConflict = error instanceof Error && /unique constraint|unique failed|P2002/i.test(error.message);
    await writeStructuredLog(uniqueConflict ? 'warn' : 'error', uniqueConflict ? 'cost_centre.duplicate_code_conflict' : 'cost_centre.creation_failed', {
      operation: 'create_cost_centre',
      route: '/api/cost-centres',
      requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId,
      costCentreCode,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    if (uniqueConflict && costCentreCode) {
      return apiError(interpolateUiString(UI_STRINGS.appApiCostCentresRoute.costCentreCodeCodeAlreadyExistsForThisProject, { code: costCentreCode }), 409);
    }
    return apiError(UI_STRINGS.common.userMessages.failedToCreateCostCentre2, 500);
  }
}
