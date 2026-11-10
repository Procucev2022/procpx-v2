import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  BOQ_CREATE_AUDIT_INSERT_AFTER_REVISION_SQL,
  BOQ_INSERT_NEXT_CODE_SQL,
  BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
} from '@/lib/d1-batch.constants';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';
import type { BoqCreateRequest } from '@app-types/app/api/boq/route.types';
import { BOQ_CREATE_AUDIT_ACTION, BOQ_DEFAULT_PROJECT_TYPE, BOQ_DEFAULT_SECTOR, BOQ_INITIAL_REVISION_SOURCE_TYPE } from './route.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { readByD1FilterChunks } from '@/lib/d1-query';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(req.url);
    const { page, pageSize, skip } = getListPageWindow(searchParams);
    const status = searchParams.get('status') || '';
    const projectId = searchParams.get('projectId') || '';
    const costCentreId = searchParams.get('costCentreId') || '';
    const purpose = searchParams.get('purpose') || '';
    const search = searchParams.get('search') || '';
    const where: Prisma.BoqWhereInput = { tenantId: ctx.tenantId };

    if (status) where.status = status;
    if (projectId) where.projectId = projectId;
    if (costCentreId) where.costCentreId = costCentreId;
    if (purpose) where.purpose = purpose;
    if (search) {
      where.OR = [
        { boqCode: { contains: search } },
        { title: { contains: search } },
        { category: { contains: search } },
        { project: { name: { contains: search } } },
        { project: { projectCode: { contains: search } } },
      ];
    }

    const [total, boqs] = await Promise.all([
      prisma.boq.count({ where }),
      prisma.boq.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          project: { select: { id: true, projectCode: true, name: true, sector: true, projectType: true, status: true, areaSqFt: true } },
          costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
          revisions: {
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            select: { id: true, revisionCode: true, revisionNumber: true, status: true, sourceType: true, totalLines: true, createdAt: true },
          },
        },
      }),
    ]);

    const revisionIds = boqs.flatMap((boq) => boq.revisions[0] ? [boq.revisions[0].id] : []);
    const costGroups = revisionIds.length > 0
      ? await readByD1FilterChunks(revisionIds, (chunk) => prisma.boqLine.groupBy({
        by: ['boqRevisionId'],
        where: { tenantId: ctx.tenantId, boqRevisionId: { in: chunk }, isDeleted: false },
        _count: { _all: true },
        _sum: { aiTotalCost: true },
      }))
      : [];
    const estimatedValues = new Map(costGroups.map((group) => [group.boqRevisionId, Number(group._sum.aiTotalCost || 0)]));
    const lineCounts = new Map(costGroups.map((group) => [group.boqRevisionId, Number(group._count._all || 0)]));
    const formattedBoqs = boqs.map((boq) => {
      const latestRevision = boq.revisions[0];
      return {
        ...boq,
        estimatedValue: latestRevision ? estimatedValues.get(latestRevision.id) || 0 : 0,
        revisions: boq.revisions.map((revision) => ({ ...revision, totalLines: lineCounts.get(revision.id) || 0 })),
        latestRevision: latestRevision ? { ...latestRevision, totalLines: lineCounts.get(latestRevision.id) || 0 } : null,
      };
    });

    return apiSuccess({
      data: formattedBoqs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    await writeStructuredLog('error', 'boq.register_load_failed', {
      operation: 'list_boq_register', route: '/api/boq',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchBoqs, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_CREATE');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let projectId: string | undefined;
  let costCentreId: string | undefined;

  try {
    let body: BoqCreateRequest;
    try {
      const parsed: unknown = await req.json();
      if (!isRecord(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      body = parsed as BoqCreateRequest;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    projectId = optionalString(body.projectId) || undefined;
    costCentreId = optionalString(body.costCentreId) || undefined;
    const title = optionalString(body.title);
    const purpose = optionalString(body.purpose);
    const categoryInput = body.category;
    if (!projectId) return apiError(UI_STRINGS.appApiBoqRoute.projectIsRequired, 400);
    if (!costCentreId) return apiError(UI_STRINGS.appApiBoqRoute.costCentreIsRequired, 400);
    if (!title) return apiError(UI_STRINGS.appApiBoqRoute.bOQTitleNameIsRequired, 400);
    if ((!Array.isArray(categoryInput) && !optionalString(categoryInput))
      || (Array.isArray(categoryInput) && (categoryInput.length === 0 || categoryInput.some((value) => typeof value !== 'string' || !value.trim())))) {
      return apiError(UI_STRINGS.appApiBoqRoute.bOQCategoryIsRequired, 400);
    }
    if (!purpose || !['BUDGET', 'PR'].includes(purpose)) {
      return apiError(UI_STRINGS.appApiBoqRoute.bOQPurposeBUDGETOrPRIsRequired, 400, { route: '/api/boq', method: 'POST' });
    }
    if ([body.description, body.scope, body.sector, body.projectType, body.floorZone, body.requiredDate, body.referenceDrawing, body.remarks]
      .some((value) => value !== undefined && value !== null && typeof value !== 'string')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const providedArea = optionalNumber(body.areaSqFt);
    if (body.areaSqFt !== undefined && body.areaSqFt !== null && (providedArea === null || providedArea < 0)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const [project, costCentre] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, tenantId: ctx.tenantId },
        select: { id: true, projectCode: true, name: true, sector: true, projectType: true, areaSqFt: true },
      }),
      prisma.costCentre.findFirst({
        where: { id: costCentreId, projectId, tenantId: ctx.tenantId },
        select: { id: true, code: true, areaSqFt: true, floorZone: true },
      }),
    ]);
    if (!project) return apiError(UI_STRINGS.appApiBoqRoute.projectNotFoundOrAccessible, 404);
    if (!costCentre) return apiError(UI_STRINGS.appApiBoqRoute.costCentreDoesNotBelongToTheSelectedProject, 400);

    const category = Array.isArray(categoryInput) ? categoryInput.map((value) => String(value).trim()).join(', ') : String(categoryInput).trim();
    const description = optionalString(body.description) || optionalString(body.scope);
    const scope = optionalString(body.scope);
    const areaSqFt = providedArea ?? costCentre.areaSqFt ?? project.areaSqFt ?? null;
    const notes = JSON.stringify({
      sector: optionalString(body.sector) || project.sector || BOQ_DEFAULT_SECTOR,
      projectType: optionalString(body.projectType) || project.projectType || BOQ_DEFAULT_PROJECT_TYPE,
      areaSqFt,
      floorZone: optionalString(body.floorZone) || costCentre.floorZone || null,
      requiredDate: optionalString(body.requiredDate),
      referenceDrawing: optionalString(body.referenceDrawing),
      remarks: optionalString(body.remarks),
    });
    const boqId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const now = new Date();
    const createdBy = ctx.userEmail || ctx.userId;
    const boqRevision = {
      id: revisionId, tenantId: ctx.tenantId, boqId, costCentreId, revisionNumber: 0, revisionCode: 'R0',
      status: 'DRAFT', preparationStatus: 'DRAFT', budgetStatus: purpose === 'BUDGET' ? 'BUDGET_DRAFT' : 'NOT_ADDED_TO_BUDGET',
      prStatus: purpose === 'PR' ? 'PR_DRAFT' : 'PR_NOT_CREATED', sourceType: BOQ_INITIAL_REVISION_SOURCE_TYPE,
      notes, createdById: ctx.userId, createdAt: now, updatedAt: now,
    };
    const statements: D1BatchInputStatement[] = [
      {
        sql: BOQ_INSERT_NEXT_CODE_SQL,
        values: [boqId, ctx.tenantId, projectId, costCentreId, title, description, category, scope, 'DRAFT', purpose, createdBy, now, now],
      },
      {
        sql: BOQ_REVISION_INSERT_AFTER_HEADER_SQL,
        values: [revisionId, ctx.tenantId, boqId, costCentreId, 0, 'R0', 'DRAFT', 'DRAFT', boqRevision.budgetStatus,
          boqRevision.prStatus, BOQ_INITIAL_REVISION_SOURCE_TYPE, null, null, 0, 0, ctx.userId, null, notes, now, now,
          boqId, ctx.tenantId, projectId],
      },
      {
        sql: BOQ_CREATE_AUDIT_INSERT_AFTER_REVISION_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, projectId, BOQ_CREATE_AUDIT_ACTION,
          UI_STRINGS.appApiBoqRoute.createdNewBOQBoqCodeValue2ForProjectProjectCodeCostCentreCodePurposePurpose,
          null, JSON.stringify({ projectId, costCentreId, category, purpose, createdAt: now.toISOString() }), null,
          req.headers.get('user-agent'), now, boqId, ctx.tenantId, projectId, costCentreId, revisionId, ctx.tenantId],
      },
    ];
    const results = await writeD1BatchAtomically(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1
      || Number(results[2]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }

    const boqCode = String(results[0]?.results?.[0]?.boqCode || '');
    if (!boqCode) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    const boq = {
      id: boqId, tenantId: ctx.tenantId, projectId, costCentreId, boqCode, title, description, category, scope,
      purpose, status: 'DRAFT', createdAt: now, updatedAt: now, createdBy,
      project, costCentre, latestRevision: boqRevision, revisions: [boqRevision],
    };
    return apiSuccess({ success: true, boq, boqId, revisionId, boqCode }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'boq.create_failed', {
      operation: 'create_boq', route: '/api/boq',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      projectId, costCentreId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToCreateBoqRecord, 500);
  }
}
