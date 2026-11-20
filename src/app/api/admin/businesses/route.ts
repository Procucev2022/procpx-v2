// app/api/admin/businesses/route.ts - companies (tenants) the caller may link users to, and
// Super Admin company creation with profile details and per-role user limits.
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { loadBusinessDirectory } from '@/lib/business-directory';
import { businessNameKey, canChooseAnyBusiness, toBusinessSlug } from '@/lib/business-name';
import { parseCompanyProfile, parseRoleLimits } from '@/lib/company-profile';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import {
  ADMIN_BUSINESSES_ROUTE,
  BUSINESS_AUDIT_CREATE_ACTION,
  BUSINESS_AUDIT_ENTITY_TYPE,
  BUSINESS_INSERT_IF_AVAILABLE_SQL,
  BUSINESS_STATUS_ACTIVE,
  ROLE_LIMIT_UPSERT_SQL,
} from '@/lib/business-directory.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';

const MESSAGES = UI_STRINGS.appApiAdminBusinessesRoute;

const errorDetails = (error: unknown) => error instanceof Error
  ? { name: error.name, message: error.message.slice(0, 400) }
  : { type: typeof error };

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('USER_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  try {
    return apiSuccess(await loadBusinessDirectory(ctx));
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.business_directory_read_failed', {
      operation: 'list_businesses', route: ADMIN_BUSINESSES_ROUTE,
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      durationMs: Date.now() - startedAt,
      error: errorDetails(error),
    });
    return apiError(MESSAGES.failedToFetchBusinesses, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('USER_CREATE');
  if (!isApiContext(ctx)) return ctx;
  if (!canChooseAnyBusiness(ctx.role)) return apiError(MESSAGES.onlyASuperAdminCanCreateCompanies, 403);

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError(MESSAGES.invalidCompanyRequest);
  const input = body as Record<string, unknown>;

  const parsedProfile = parseCompanyProfile(input);
  if (!parsedProfile.ok) return apiError(parsedProfile.error);
  const parsedLimits = parseRoleLimits(input.roleLimits);
  if (!parsedLimits.ok) return apiError(parsedLimits.error);
  const profile = parsedProfile.value;

  // The company list is small, so compare case-insensitively here (matching the D1 insert
  // guard) and give a specific message instead of the generic race-condition one.
  const companies = await prisma.tenant.findMany({ select: { name: true, gstNumber: true } });
  if (companies.some((tenant) => businessNameKey(tenant.name) === businessNameKey(profile.name))) {
    return apiError(MESSAGES.aCompanyWithThisNameAlreadyExists, 409);
  }
  if (companies.some((tenant) => (tenant.gstNumber || '').toUpperCase() === profile.gstNumber)) {
    return apiError(MESSAGES.aCompanyWithThisGstNumberAlreadyExists, 409);
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const slug = toBusinessSlug(profile.name, id);
  const limitEntries = Object.entries(parsedLimits.value).filter((entry): entry is [string, number] => entry[1] !== null);
  const statements: D1BatchInputStatement[] = [
    {
      sql: BUSINESS_INSERT_IF_AVAILABLE_SQL,
      values: [
        id, profile.name, slug, BUSINESS_STATUS_ACTIVE, profile.gstNumber, profile.address, profile.pincode,
        profile.panNumber, profile.industry, profile.contactPersonName, profile.contactPhone, now, now,
        profile.name, slug, profile.gstNumber,
      ],
    },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [
        crypto.randomUUID(), id, ctx.userId, null, BUSINESS_AUDIT_ENTITY_TYPE, id, BUSINESS_AUDIT_CREATE_ACTION,
        interpolateUiString(MESSAGES.companyCompanyCreated, { company: profile.name }),
        null, JSON.stringify({ ...profile, slug, status: BUSINESS_STATUS_ACTIVE, roleLimits: Object.fromEntries(limitEntries) }),
        null, null, now,
      ],
    },
    ...limitEntries.map(([role, maxUsers]) => ({
      sql: ROLE_LIMIT_UPSERT_SQL,
      values: [crypto.randomUUID(), id, role, maxUsers, now, now, ctx.userId, id],
    })),
  ];

  const startedAt = Date.now();
  let results;
  try {
    results = await writeD1BatchAtomically(statements);
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.business_create_failed', {
      operation: 'create_business', route: ADMIN_BUSINESSES_ROUTE,
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      businessId: id, roleLimitCount: limitEntries.length, durationMs: Date.now() - startedAt,
      error: errorDetails(error),
    });
    return apiError(MESSAGES.failedToCreateCompany, 500);
  }

  if (Number(results[0]?.meta?.changes || 0) !== 1) {
    return apiError(MESSAGES.companyWasJustTakenPleaseRefreshAndTryAgain, 409);
  }

  await writeStructuredLog('info', 'admin.business_created', {
    operation: 'create_business', route: ADMIN_BUSINESSES_ROUTE,
    requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
    businessId: id, roleLimitCount: limitEntries.length, durationMs: Date.now() - startedAt,
  });

  return apiSuccess({ id, ...profile }, 201);
}
