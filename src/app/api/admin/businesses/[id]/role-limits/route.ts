// app/api/admin/businesses/[id]/role-limits/route.ts - per-role user limits for one company.
// Administrators read their own company's limits (the invite form shows seat usage); only a
// Super Admin may read any company's limits or change them.
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { canChooseAnyBusiness } from '@/lib/business-name';
import { parseRoleLimits } from '@/lib/company-profile';
import { loadRoleLimitUsage } from '@/lib/tenant-role-limits';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import {
  ADMIN_BUSINESS_ROLE_LIMITS_ROUTE,
  BUSINESS_AUDIT_ENTITY_TYPE,
  BUSINESS_AUDIT_ROLE_LIMITS_ACTION,
  BUSINESS_TOUCH_SQL,
  ROLE_LIMIT_DELETE_SQL,
  ROLE_LIMIT_UPSERT_SQL,
} from '@/lib/business-directory.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';

const MESSAGES = UI_STRINGS.appApiAdminBusinessesRoute;

type RouteParams = { params: Promise<{ id: string }> };

const errorDetails = (error: unknown) => error instanceof Error
  ? { name: error.name, message: error.message.slice(0, 400) }
  : { type: typeof error };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth('USER_CREATE');
  if (!isApiContext(ctx)) return ctx;
  const { id } = await params;
  // Another company's limits stay invisible to everyone except a Super Admin.
  if (!canChooseAnyBusiness(ctx.role) && id !== ctx.tenantId) return apiError(MESSAGES.companyNotFound, 404);

  const startedAt = Date.now();
  try {
    const business = await prisma.tenant.findFirst({ where: { id }, select: { id: true, name: true } });
    if (!business) return apiError(MESSAGES.companyNotFound, 404);
    return apiSuccess({ businessId: business.id, businessName: business.name, roles: await loadRoleLimitUsage(business.id) });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.business_role_limits_read_failed', {
      operation: 'read_role_limits', route: ADMIN_BUSINESS_ROLE_LIMITS_ROUTE,
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      businessId: id, durationMs: Date.now() - startedAt, error: errorDetails(error),
    });
    return apiError(MESSAGES.failedToFetchRoleLimits, 500);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth('USER_EDIT');
  if (!isApiContext(ctx)) return ctx;
  if (!canChooseAnyBusiness(ctx.role)) return apiError(MESSAGES.onlyASuperAdminCanChangeRoleLimits, 403);
  const { id } = await params;

  const body: unknown = await req.json().catch(() => null);
  const parsed = parseRoleLimits(body && typeof body === 'object' ? (body as Record<string, unknown>).limits : body);
  if (!parsed.ok) return apiError(parsed.error);

  const business = await prisma.tenant.findFirst({ where: { id }, select: { id: true, name: true } });
  if (!business) return apiError(MESSAGES.companyNotFound, 404);

  const now = new Date();
  const entries = Object.entries(parsed.value);
  const statements: D1BatchInputStatement[] = [
    ...entries.map(([role, maxUsers]) => (maxUsers === null
      ? { sql: ROLE_LIMIT_DELETE_SQL, values: [id, role] }
      : { sql: ROLE_LIMIT_UPSERT_SQL, values: [crypto.randomUUID(), id, role, maxUsers, now, now, ctx.userId, id] })),
    // The audit row is written only when the company still exists (changes() = 1 after the touch).
    { sql: BUSINESS_TOUCH_SQL, values: [now, id] },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [
        crypto.randomUUID(), ctx.tenantId, ctx.userId, null, BUSINESS_AUDIT_ENTITY_TYPE, id, BUSINESS_AUDIT_ROLE_LIMITS_ACTION,
        interpolateUiString(MESSAGES.roleLimitsUpdatedForCompany, { company: business.name }),
        null, JSON.stringify({ roleLimits: parsed.value }), null, null, now,
      ],
    },
  ];

  const startedAt = Date.now();
  try {
    await writeD1BatchAtomically(statements);
    const roles = await loadRoleLimitUsage(id);
    await writeStructuredLog('info', 'admin.business_role_limits_updated', {
      operation: 'update_role_limits', route: ADMIN_BUSINESS_ROLE_LIMITS_ROUTE,
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      businessId: id, changedRoleCount: entries.length, durationMs: Date.now() - startedAt,
    });
    return apiSuccess({ businessId: id, businessName: business.name, roles });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.business_role_limits_update_failed', {
      operation: 'update_role_limits', route: ADMIN_BUSINESS_ROLE_LIMITS_ROUTE,
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      businessId: id, changedRoleCount: entries.length, durationMs: Date.now() - startedAt, error: errorDetails(error),
    });
    return apiError(MESSAGES.failedToSaveRoleLimits, 500);
  }
}
