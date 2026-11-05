// src/app/api/cost-centres/[id]/route.ts - Cost Centre Details & Updates
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import {
  COST_CENTRE_AUDIT_AFTER_UPDATE_SQL,
  COST_CENTRE_ALLOWED_STATUSES,
  COST_CENTRE_UPDATE_FAILED_EVENT,
  COST_CENTRE_UPDATE_IF_CURRENT_SQL,
  COST_CENTRE_UPDATE_RECOVERED_EVENT,
} from './route.constants';


export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('COST_CENTRE_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  const cc = await prisma.costCentre.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      project: true,
      budgets: true,
      budgetContributions: {
        include: {
          boq: true,
          boqRevision: true,
          approvals: true,
        },
      },
      budgetTransactions: {
        orderBy: { budgetDate: 'desc' },
      },
      prs: {
        include: {
          approvals: true,
          _count: { select: { lines: true } },
        },
      },
      boqs: {
        include: {
          revisions: {
            orderBy: { revisionNumber: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!cc) return apiError(UI_STRINGS.appApiCostCentresIdRoute.costCentreNotFound, 404);

  const totalBudget = cc.budgets.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const approvedBudget = cc.budgets.reduce((sum, b) => sum + (b.approvedAmount || 0), 0);
  const ratePerSqFt = cc.areaSqFt && cc.areaSqFt > 0 ? approvedBudget / cc.areaSqFt : null;

  return apiSuccess({
    ...cc,
    totalBudget,
    approvedBudget,
    ratePerSqFt: ratePerSqFt !== null ? Math.round(ratePerSqFt * 100) / 100 : null,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('COST_CENTRE_EDIT');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;
  const startedAt = Date.now();
  let auditId: string | null = null;
  let expectedUpdatedAt: Date | null = null;
  let updatedAt: Date | null = null;
  let updatedValues: Record<string, unknown> | null = null;
  let oldValue: Record<string, unknown> | null = null;
  try {
    const existing = await prisma.costCentre.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) return apiError(UI_STRINGS.appApiCostCentresIdRoute.costCentreNotFound, 404);

    const parsedBody: unknown = await req.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const body = parsedBody as Record<string, unknown>;
    const requiredTextFields = ['name', 'status'] as const;
    const nullableTextFields = ['description', 'location', 'floorZone'] as const;
    if (requiredTextFields.some((field) => body[field] !== undefined && typeof body[field] !== 'string') ||
        nullableTextFields.some((field) => body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string')) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const rawArea = body.areaSqFt;
    if (rawArea !== undefined && rawArea !== null && typeof rawArea !== 'number' && typeof rawArea !== 'string') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const parsedArea = rawArea === undefined || rawArea === null || rawArea === '' ? null : Number(rawArea);
    if (parsedArea !== null && (!Number.isFinite(parsedArea) || parsedArea < 0)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const name = body.name === undefined ? existing.name : String(body.name).trim();
    if (!name) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    const valueForTextField = (field: 'description' | 'location' | 'floorZone') => {
      if (body[field] === undefined) return existing[field];
      if (body[field] === null) return null;
      return String(body[field]).trim();
    };
    const description = valueForTextField('description');
    const areaSqFt = rawArea === undefined ? existing.areaSqFt : parsedArea === 0 ? null : parsedArea;
    const location = valueForTextField('location');
    const floorZone = valueForTextField('floorZone');
    const status = body.status === undefined ? existing.status : String(body.status).trim().toUpperCase();
    if (body.status !== undefined && !(COST_CENTRE_ALLOWED_STATUSES as readonly string[]).includes(status)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    expectedUpdatedAt = existing.updatedAt instanceof Date ? existing.updatedAt : new Date(String(existing.updatedAt));
    if (!Number.isFinite(expectedUpdatedAt.getTime())) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    updatedAt = new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1));
    oldValue = { ...existing };
    updatedValues = { ...oldValue, name, description, areaSqFt, location, floorZone, status, updatedAt };
    auditId = crypto.randomUUID();
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiCostCentresIdRoute.costCentreUpdatedCodeName,
      { code: existing.code, name },
    );

    const results = await writeD1BatchAtomically([
      {
        sql: COST_CENTRE_UPDATE_IF_CURRENT_SQL,
        values: [name, description, areaSqFt, location, floorZone, status, updatedAt,
          id, ctx.tenantId, expectedUpdatedAt],
      },
      {
        sql: COST_CENTRE_AUDIT_AFTER_UPDATE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, auditDescription, JSON.stringify(oldValue),
          JSON.stringify(updatedValues), req.headers.get('user-agent'), updatedAt, id, ctx.tenantId],
      },
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
      throw new Error(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh);
    }

    return apiSuccess(updatedValues);
  } catch (error: unknown) {
    if (auditId && updatedAt && expectedUpdatedAt && updatedValues && oldValue) {
      try {
        const [current, audit] = await Promise.all([
          prisma.costCentre.findFirst({
            where: { id, tenantId: ctx.tenantId },
          }),
          prisma.auditLog.findFirst({ where: { id: auditId, tenantId: ctx.tenantId }, select: { id: true } }),
        ]);
        const persistedAt = current?.updatedAt instanceof Date ? current.updatedAt : new Date(String(current?.updatedAt || ''));
        if (current && audit && persistedAt.getTime() === updatedAt.getTime()) {
          try {
            await writeStructuredLog('warn', COST_CENTRE_UPDATE_RECOVERED_EVENT, {
              operation: 'update_cost_centre', route: '/api/cost-centres/[id]',
              requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
              userId: ctx.userId, costCentreId: id, durationMs: Date.now() - startedAt,
            });
          } catch {
            // Return the confirmed update if optional local log storage is unavailable.
          }
          return apiSuccess({ ...current, updatedAt: persistedAt });
        }
        if (current && persistedAt.getTime() !== expectedUpdatedAt.getTime()) {
          return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
        }
      } catch {
        // Continue with the generic failure response when D1 cannot confirm the batch result.
      }
    }

    try {
      await writeStructuredLog('error', COST_CENTRE_UPDATE_FAILED_EVENT, {
        operation: 'update_cost_centre', route: '/api/cost-centres/[id]',
        requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
        userId: ctx.userId, role: ctx.role, costCentreId: id, durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Preserve a stable API response when optional log storage fails.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateCostCentre, 500);
  }
}
