// app/api/projects/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess, getListPageWindow } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { PROJECT_CODE_MAX_SEQUENCE, PROJECT_CODE_PATTERN, PROJECT_CODE_PREFIX, PROJECT_SEARCH_MAX_LENGTH } from './route.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  PROJECT_INSERT_IF_CODE_AVAILABLE_SQL,
  PROJECT_NORMALIZED_NAME_EXISTS_SQL,
} from '@/lib/d1-batch.constants';


// Generate next project code strictly matching CPX-P-XXXXXX format
async function nextProjectCode(tenantId: string): Promise<string> {
  const latest = await prisma.project.findFirst({
    where: { tenantId, projectCode: { startsWith: PROJECT_CODE_PREFIX } },
    orderBy: { projectCode: 'desc' },
    select: { projectCode: true },
  });
  if (!latest) return `${PROJECT_CODE_PREFIX}000001`;
  const match = latest.projectCode.match(PROJECT_CODE_PATTERN);
  if (!match) throw new Error();
  const nextNumber = Number(match[1]) + 1;
  if (nextNumber > PROJECT_CODE_MAX_SEQUENCE) throw new Error();
  return `${PROJECT_CODE_PREFIX}${String(nextNumber).padStart(6, '0')}`;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('PROJECT_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();

  const { searchParams } = new URL(req.url);
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  const search = (searchParams.get('search') || '').trim().slice(0, PROJECT_SEARCH_MAX_LENGTH);
  const status = searchParams.get('status') || '';
  const sector = searchParams.get('sector') || '';

  const where: any = { tenantId: ctx.tenantId };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { projectCode: { contains: search } },
      { city: { contains: search } },
    ];
  }
  if (status) where.status = status;
  if (sector) where.sector = sector;

  try {
    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          boqs: {
            select: { id: true, status: true, revisions: { select: { id: true, totalLines: true, status: true }, orderBy: { revisionNumber: 'desc' }, take: 1 } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: { select: { team: true } },
        },
      }),
    ]);

    return apiSuccess({ data: projects, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    await writeStructuredLog('error', 'project.register_read_failed', {
      operation: 'list_projects', route: '/api/projects',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, userId: ctx.userId, page, pageSize,
      status: status || undefined, sector: sector || undefined, searchLength: search.length,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchProjects, 500);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let tenantId: string | undefined;
  let userId: string | undefined;
  let projectCode: string | undefined;
  try {
    const ctx = await requireAuth('PROJECT_CREATE');
    if (!isApiContext(ctx)) return ctx;
    tenantId = ctx.tenantId;
    userId = ctx.userId;

    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    const body = parsed as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const sector = typeof body.sector === 'string' ? body.sector.trim() : '';
    const projectType = typeof body.projectType === 'string' ? body.projectType.trim() : '';

    if (!name) return apiError(UI_STRINGS.common.projectNameIsRequired);
    if (!sector) return apiError(UI_STRINGS.common.sectorIsRequired);
    if (!projectType) return apiError(UI_STRINGS.common.projectTypeIsRequired);

    const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
    const optionalNumber = (value: unknown) => {
      if (value === undefined || value === null || value === '') return null;
      const parsedValue = typeof value === 'number' ? value : Number.parseFloat(String(value));
      return Number.isFinite(parsedValue) ? parsedValue : null;
    };
    const optionalInteger = (value: unknown) => {
      if (value === undefined || value === null || value === '') return null;
      const parsedValue = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
      return Number.isSafeInteger(parsedValue) ? parsedValue : null;
    };
    const parseDate = (value: unknown) => {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value !== 'string') return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    const areaSqFt = optionalNumber(body.areaSqFt);
    const budget = optionalNumber(body.budget);
    const numberOfFloors = optionalInteger(body.numberOfFloors);
    const numberOfUnits = optionalInteger(body.numberOfUnits);
    const startDate = parseDate(body.startDate);
    const targetCompletion = parseDate(body.targetCompletion);
    if (startDate === undefined || targetCompletion === undefined) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      projectCode = await nextProjectCode(ctx.tenantId);
      const projectId = crypto.randomUUID();
      const createdAt = new Date();
      const project = {
        id: projectId,
        tenantId: ctx.tenantId,
        projectCode,
        name,
        description: optionalText(body.description),
        sector,
        projectType,
        location: optionalText(body.location),
        address: optionalText(body.address),
        city: optionalText(body.city),
        state: optionalText(body.state),
        country: optionalText(body.country) || 'India',
        areaSqFt,
        costCentre: optionalText(body.costCentre),
        projectOwner: optionalText(body.projectOwner),
        budget,
        currency: optionalText(body.currency) || 'INR',
        businessUnit: optionalText(body.businessUnit),
        numberOfFloors,
        numberOfUnits,
        startDate,
        targetCompletion,
        status: 'DRAFT',
        createdAt,
        updatedAt: createdAt,
        createdBy: ctx.userId,
        updatedBy: null,
      };
      const auditId = crypto.randomUUID();
      const description = interpolateUiString(UI_STRINGS.appApiProjectsRoute.projectProjectCodeCreatedTrim, {
        projectCode, trim: name,
      });
      const results = await writeD1BatchAtomically([
        {
          sql: PROJECT_INSERT_IF_CODE_AVAILABLE_SQL,
          values: [
            project.id, project.tenantId, project.projectCode, project.name, project.description, project.sector,
            project.projectType, project.location, project.address, project.city, project.state, project.country,
            project.areaSqFt, project.costCentre, project.projectOwner, project.budget, project.currency, project.businessUnit,
            project.numberOfFloors, project.numberOfUnits, project.startDate?.toISOString() || null,
            project.targetCompletion?.toISOString() || null, createdAt.toISOString(), createdAt.toISOString(), project.createdBy,
          ],
        },
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [auditId, ctx.tenantId, ctx.userId, project.id, 'PROJECT', project.id, 'CREATE', description, null,
            JSON.stringify({ projectCode, name, sector, projectType }), null, null, createdAt.toISOString()],
        },
        {
          sql: PROJECT_NORMALIZED_NAME_EXISTS_SQL,
          values: [ctx.tenantId, project.name],
        },
      ]);
      const inserted = results[0]?.results?.[0] as { id?: string; projectCode?: string } | undefined;
      if (inserted?.id === projectId && inserted.projectCode === projectCode) return apiSuccess(project, 201);
      const duplicateName = results[2]?.results?.[0] as { id?: string } | undefined;
      if (duplicateName?.id) {
        try {
          await writeStructuredLog('warn', 'project.duplicate_name_conflict', {
            operation: 'create_project', route: '/api/projects',
            requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
            tenantId: ctx.tenantId, userId: ctx.userId, duplicateProjectId: duplicateName.id,
          }, 'application');
        } catch {
          // Keep the conflict response stable if optional log storage is unavailable.
        }
        return apiError(UI_STRINGS.appApiProjectsRoute.aProjectWithThisNameAlreadyExistsForThisTenant, 409);
      }
    }
    return apiError(UI_STRINGS.appApiProjectsRoute.aProjectWithThisProjectCodeAlreadyExistsPleaseRetry, 409);
  } catch (error: unknown) {
    await writeStructuredLog('error', 'project.creation_failed', {
      operation: 'create_project', route: '/api/projects',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId, userId, projectCode, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToCreateProject, 500);
  }
}
