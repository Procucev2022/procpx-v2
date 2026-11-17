import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '@/lib/project-auth';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { ACTUAL_COST_INSERT_IF_VALID_SQL, AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { logEvent } from '@/lib/observability/server-logger';
import { ACTUAL_COST_SOURCES, ACTUAL_COST_STATUSES } from './route.constants';

const MAX_CODE_RETRIES = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function asDate(value: unknown, fallback: Date): Date | null {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function actualCostRecord(input: {
  id: string;
  transactionCode: string;
  tenantId: string;
  userId: string;
  userName: string;
  projectId: string;
  costCentreId: string | null;
  category: string;
  subcategory: string | null;
  boqId: string | null;
  boqRevisionId: string | null;
  boqLineId: string | null;
  prId: string | null;
  prLineId: string | null;
  rfqId: string | null;
  rfqLineId: string | null;
  ppoId: string | null;
  ppoLineId: string | null;
  vendorId: string | null;
  uom: string | null;
  actualQuantity: number;
  actualUnitRate: number;
  actualAmount: number;
  taxAmount: number;
  totalActualAmount: number;
  actualDate: Date;
  source: string;
  status: string;
  completionReference: string | null;
  externalReference: string | null;
  erpDocumentNumber: string | null;
  erpDate: Date | null;
  documents: string | null;
  remarks: string | null;
  createdAt: Date;
}) {
  const { userId, userName, ...record } = input;
  return {
    ...record,
    completionRequestId: null,
    completionFingerprint: null,
    integrationTimestamp: null,
    createdById: userId,
    createdBy: userName,
    updatedAt: record.createdAt,
  };
}

function requestId(req: NextRequest): string | undefined {
  const value = req.headers.get('x-request-id');
  return value && value.length <= 128 ? value : undefined;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('ACTUAL_COST_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const costCentreId = searchParams.get('costCentreId');
  const boqLineId = searchParams.get('boqLineId');
  const ppoId = searchParams.get('ppoId');
  const source = searchParams.get('source');
  const status = searchParams.get('status');
  const { page, pageSize, skip } = getListPageWindow(searchParams);

  try {
    const projectAccessFilter = await getUserProjectAccessFilter(ctx.userId, ctx.role, ctx.tenantId);
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(projectAccessFilter ? { project: { is: projectAccessFilter } } : {}),
    };
    if (projectId) where.projectId = projectId;
    if (costCentreId) where.costCentreId = costCentreId;
    if (boqLineId) where.boqLineId = boqLineId;
    if (ppoId) where.ppoId = ppoId;
    if (source) where.source = source;
    if (status) where.status = status;

    const [total, transactions] = await Promise.all([
      prisma.actualCostTransaction.count({ where }),
      prisma.actualCostTransaction.findMany({
        where,
        orderBy: [{ actualDate: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          costCentre: { select: { id: true, code: true, name: true } },
          boqLine: { select: { id: true, lineNumber: true, originalDescription: true, uomRaw: true } },
          prLine: { select: { id: true, lineNumber: true, itemDescription: true } },
          rfqLine: { select: { id: true, lineNumber: true, description: true } },
          ppo: { select: { id: true, ppoNumber: true, title: true } },
          ppoLine: { select: { id: true, lineNumber: true, itemDescription: true, orderedQuantity: true, orderedUnitRate: true } },
          vendor: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);
    return apiSuccess({ data: transactions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    logEvent('error', 'actual_cost.list_failed', {
      operation: 'list',
      route: '/api/actual-costs',
      requestId: requestId(req),
      tenantId: ctx.tenantId,
      projectId,
      durationMs: Date.now() - startedAt,
      error,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToFetchActualCostTransactions, 500);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = await requireAuth('ACTUAL_COST_CREATE');
  if (!isApiContext(ctx)) return ctx;

  let projectId: string | null = null;
  let createdRecordId: string | undefined;
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch (error) {
      logEvent('warn', 'actual_cost.invalid_request_body', {
        operation: 'create',
        route: '/api/actual-costs',
        requestId: requestId(req),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        error,
      }, 'next');
      return apiError(UI_STRINGS.appApiActualCostsRoute.invalidActualCostRequest, 400);
    }
    if (!isRecord(rawBody)) {
      return apiError(UI_STRINGS.appApiActualCostsRoute.invalidActualCostRequest, 400);
    }
    const body = rawBody;
    projectId = optionalText(body.projectId);
    const category = optionalText(body.category);
    if (!projectId || !category || body.actualQuantity === undefined || body.actualUnitRate === undefined) {
      return apiError(UI_STRINGS.appApiActualCostsRoute.projectCategoryActualQuantityAndActualUnitRateAreRequired, 400);
    }

    const actualQuantity = Number(body.actualQuantity);
    const actualUnitRate = Number(body.actualUnitRate);
    const taxAmount = body.taxAmount === undefined || body.taxAmount === null ? 0 : Number(body.taxAmount);
    const actualAmount = body.actualAmount === undefined || body.actualAmount === null || body.actualAmount === ''
      ? actualQuantity * actualUnitRate
      : Number(body.actualAmount);
    if (![actualQuantity, actualUnitRate, actualAmount, taxAmount].every(Number.isFinite)
      || actualQuantity <= 0 || actualUnitRate < 0 || actualAmount < 0 || taxAmount < 0) {
      return apiError(UI_STRINGS.appApiActualCostsRoute.actualCostNumbersMustBeFiniteAndNonNegative, 400);
    }

    const actualDate = asDate(body.actualDate, new Date());
    const erpDate = body.erpDate === undefined || body.erpDate === null || body.erpDate === ''
      ? null
      : asDate(body.erpDate, new Date());
    if (!actualDate || (body.erpDate !== undefined && body.erpDate !== null && body.erpDate !== '' && !erpDate)) {
      return apiError(UI_STRINGS.appApiActualCostsRoute.actualCostDatesMustBeValid, 400);
    }

    const sourceValue = body.source ?? 'MANUAL_ADJUSTMENT';
    const statusValue = body.status ?? 'APPROVED';
    if (typeof sourceValue !== 'string' || !ACTUAL_COST_SOURCES.includes(sourceValue as (typeof ACTUAL_COST_SOURCES)[number])) {
      return apiError(UI_STRINGS.appApiActualCostsRoute.actualCostSourceIsNotSupported, 400);
    }
    // A PPO line carries a completion counter. Only the completion workflow may move it, so manual entries cannot bypass the cap.
    if (optionalText(body.ppoLineId)) {
      return apiError(UI_STRINGS.appApiActualCostsRoute.ppoLinkedActualCostsMustUseCompletionWorkflow, 400);
    }
    if (sourceValue === 'PO_COMPLETION' || sourceValue === 'PPO_COMPLETION') {
      return apiError(UI_STRINGS.appApiActualCostsRoute.completionActualCostsMustUseTheCompletionWorkflow, 400);
    }
    if (typeof statusValue !== 'string' || !ACTUAL_COST_STATUSES.includes(statusValue as (typeof ACTUAL_COST_STATUSES)[number])) {
      return apiError(UI_STRINGS.appApiActualCostsRoute.actualCostStatusIsNotSupported, 400);
    }

    const authorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, projectId, ctx.tenantId);
    if (!authorized) {
      return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
    }

    const totalActualAmount = actualAmount + taxAmount;
    const createdAt = new Date();
    const userName = ctx.userName || 'System User';
    const transactionId = crypto.randomUUID();
    const year = actualDate.getFullYear();
    const prefix = `ACT-${year}-`;
    const optionalIds = {
      costCentreId: optionalText(body.costCentreId),
      boqId: optionalText(body.boqId),
      boqRevisionId: optionalText(body.boqRevisionId),
      boqLineId: optionalText(body.boqLineId),
      prId: optionalText(body.prId),
      prLineId: optionalText(body.prLineId),
      rfqId: optionalText(body.rfqId),
      rfqLineId: optionalText(body.rfqLineId),
      ppoId: optionalText(body.ppoId),
      ppoLineId: optionalText(body.ppoLineId),
      vendorId: optionalText(body.vendorId),
    };
    const documents = body.documents === undefined || body.documents === null
      ? null
      : typeof body.documents === 'string' ? body.documents : JSON.stringify(body.documents);
    const commonValues = {
      id: transactionId,
      tenantId: ctx.tenantId,
      projectId,
      ...optionalIds,
      category,
      subcategory: optionalText(body.subcategory),
      uom: optionalText(body.uom),
      actualQuantity,
      actualUnitRate,
      actualAmount,
      taxAmount,
      totalActualAmount,
      actualDate,
      source: sourceValue,
      status: statusValue,
      completionReference: optionalText(body.completionReference),
      externalReference: optionalText(body.externalReference),
      erpDocumentNumber: optionalText(body.erpDocumentNumber),
      erpDate,
      documents,
      remarks: optionalText(body.remarks),
      userId: ctx.userId,
      userName,
      createdAt,
    };

    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
      const latest = await prisma.actualCostTransaction.findFirst({
        where: { tenantId: ctx.tenantId, transactionCode: { startsWith: prefix } },
        orderBy: { transactionCode: 'desc' },
        select: { transactionCode: true },
      });
      const latestSuffix = latest?.transactionCode?.startsWith(prefix)
        ? Number(latest.transactionCode.slice(prefix.length)) || 0
        : 0;
      const transactionCode = `${prefix}${String(latestSuffix + 1).padStart(6, '0')}`;
      const data = actualCostRecord({ ...commonValues, transactionCode });
      const description = interpolateUiString(
        UI_STRINGS.appApiActualCostsRoute.actualCostTransactionTransactionCodeRecordedForCategoryAmountToLocaleStringViaSource,
        { transactionCode, category, toLocaleString: actualAmount.toLocaleString(), source: sourceValue },
      );
      const results = await writeD1BatchAtomically([
        {
          sql: ACTUAL_COST_INSERT_IF_VALID_SQL,
          values: [
            data.id, data.tenantId, data.transactionCode, data.projectId, data.costCentreId, data.category, data.subcategory,
            data.boqId, data.boqRevisionId, data.boqLineId, data.prId, data.prLineId, data.rfqId, data.rfqLineId, data.ppoId,
            data.ppoLineId, data.vendorId, data.uom, data.actualQuantity, data.actualUnitRate, data.actualAmount, data.taxAmount,
            data.totalActualAmount, data.actualDate, data.source, data.status, data.completionReference, null, null,
            data.externalReference, data.erpDocumentNumber, data.erpDate, null, data.documents, data.remarks,
            data.createdById, data.createdBy, data.createdAt, data.updatedAt,
          ],
        },
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [
            crypto.randomUUID(), ctx.tenantId, ctx.userId, projectId, 'ACTUAL_COST', transactionId,
            'ACTUAL_COST_RECORDED', description, null,
            JSON.stringify({ transactionCode, category, actualAmount, source: sourceValue }), null, null, createdAt,
          ],
        },
      ]);
      if (Number(results[0]?.meta?.changes || 0) === 1 && Number(results[1]?.meta?.changes || 0) === 1) {
        createdRecordId = transactionId;
        return apiSuccess(data, 201);
      }

      const codeCollision = await prisma.actualCostTransaction.findFirst({
        where: { tenantId: ctx.tenantId, transactionCode },
        select: { id: true },
      });
      if (codeCollision) continue;

      logEvent('warn', 'actual_cost.reference_validation_failed', {
        operation: 'create',
        route: '/api/actual-costs',
        requestId: requestId(req),
        tenantId: ctx.tenantId,
        projectId,
        transactionId,
        durationMs: Date.now() - startedAt,
      }, 'next');
      return apiError(UI_STRINGS.appApiActualCostsRoute.actualCostReferencesMustBelongToTheSelectedProject, 400);
    }

    return apiError(UI_STRINGS.appApiActualCostsRoute.actualCostCodeConflictRetryTheRequest, 409);
  } catch (error) {
    logEvent('error', 'actual_cost.create_failed', {
      operation: 'create',
      route: '/api/actual-costs',
      requestId: requestId(req),
      tenantId: ctx.tenantId,
      projectId,
      recordId: createdRecordId,
      durationMs: Date.now() - startedAt,
      error,
    }, 'next');
    return apiError(UI_STRINGS.common.userMessages.failedToCreateActualCostTransaction, 500);
  }
}
