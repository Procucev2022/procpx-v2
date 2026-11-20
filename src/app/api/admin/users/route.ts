// app/api/admin/users/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess, getListPageWindow } from '@/lib/api-utils';
import { hashPassword } from '@/lib/password';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from '@/lib/i18n';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import { canChooseAnyBusiness } from '@/lib/business-name';
import { checkRoleCapacity } from '@/lib/tenant-role-limits';
import {
  ADMIN_USERS_ROUTE,
  ASSIGNABLE_USER_ROLES,
  NEW_USER_STATUS,
  USER_AUDIT_CREATE_ACTION,
  USER_AUDIT_ENTITY_TYPE,
  USER_INSERT_IF_EMAIL_AVAILABLE_SQL,
} from './route.constants';
import type { CreateUserRequestBody } from '@app-types/app/api/admin/users/route.types';
import type { D1BatchInputStatement } from '@app-types/lib/d1-batch.types';

const errorDetails = (error: unknown) => error instanceof Error
  ? { name: error.name, message: error.message.slice(0, 400) }
  : { type: typeof error };

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('USER_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  const search = (searchParams.get('search') || '').trim().slice(0, 200);

  // A Super Admin manages users across businesses; every other administrator only sees
  // the users of their own business.
  const where: Record<string, unknown> = canChooseAnyBusiness(ctx.role) ? {} : { tenantId: ctx.tenantId };
  if (search) {
    where.OR = [{ name: { contains: search } }, { email: { contains: search } }];
  }

  const startedAt = Date.now();
  try {
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, role: true, status: true, lastLoginAt: true, createdAt: true,
          tenant: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return apiSuccess({ data: users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.user_list_read_failed', {
      operation: 'list_users', route: ADMIN_USERS_ROUTE,
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      page, pageSize, searchLength: search.length, durationMs: Date.now() - startedAt,
      error: errorDetails(error),
    });
    return apiError(UI_STRINGS.appApiAdminUsersRoute.failedToFetchUsers, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('USER_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const body = (await req.json()) as CreateUserRequestBody;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const requestedBusinessId = typeof body.businessId === 'string' ? body.businessId.trim() : '';
  const isSuperAdmin = canChooseAnyBusiness(ctx.role);

  if (!email) return apiError(UI_STRINGS.appApiAdminUsersRoute.emailIsRequired);
  if (!name) return apiError(UI_STRINGS.appApiAdminUsersRoute.nameIsRequired);
  if (!role) return apiError(UI_STRINGS.appApiAdminUsersRoute.roleIsRequired);
  if (!ASSIGNABLE_USER_ROLES.includes(role)) return apiError(UI_STRINGS.appApiAdminUsersRoute.roleIsInvalid);
  if (password.length < 8) return apiError(UI_STRINGS.appApiAdminUsersRoute.passwordMustBeAtLeast8Characters);

  // A Super Admin must pick the company from the dropdown. Every other administrator always
  // adds users to their own company; naming any other company is outside their authority.
  if (isSuperAdmin && !requestedBusinessId) return apiError(UI_STRINGS.appApiAdminUsersRoute.companyIsRequired);
  if (!isSuperAdmin && requestedBusinessId && requestedBusinessId !== ctx.tenantId) {
    return apiError(UI_STRINGS.appApiAdminUsersRoute.youCanOnlyAddUsersToYourOwnBusiness, 403);
  }
  const targetId = isSuperAdmin ? requestedBusinessId : ctx.tenantId;
  const target = await prisma.tenant.findFirst({ where: { id: targetId }, select: { id: true, name: true } });
  if (!target) return apiError(UI_STRINGS.appApiAdminUsersRoute.companyNotFound, 404);

  // Sign-in rejects an email that belongs to accounts in more than one business, so an
  // email may only ever exist once across all businesses.
  const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (existing) return apiError(UI_STRINGS.appApiAdminUsersRoute.aUserWithThisEmailAlreadyExists);

  const capacity = await checkRoleCapacity(target.id, role);
  if (!capacity.allowed) {
    return apiError(interpolateUiString(UI_STRINGS.appApiAdminUsersRoute.roleLimitReachedForCompany, {
      company: target.name, count: capacity.activeUsers, role, max: capacity.maxUsers,
    }), 409);
  }

  const now = new Date();
  const userId = crypto.randomUUID();
  const statements: D1BatchInputStatement[] = [
    {
      sql: USER_INSERT_IF_EMAIL_AVAILABLE_SQL,
      values: [
        userId, target.id, email, name, await hashPassword(password), role, NEW_USER_STATUS, now, now, ctx.userId,
        target.id, email, target.id, role,
      ],
    },
    {
      sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
      values: [
        crypto.randomUUID(), target.id, ctx.userId, null, USER_AUDIT_ENTITY_TYPE, userId, USER_AUDIT_CREATE_ACTION,
        interpolateUiString(UI_STRINGS.appApiAdminUsersRoute.userEmailCreatedInBusinessCompanyAsRole, { email, company: target.name, role }),
        null, JSON.stringify({ email, role, status: NEW_USER_STATUS, businessId: target.id }), null, null, now,
      ],
    },
  ];

  const startedAt = Date.now();
  let results;
  try {
    results = await writeD1BatchAtomically(statements);
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.user_create_failed', {
      operation: 'create_user', route: ADMIN_USERS_ROUTE,
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      targetBusinessId: target.id, role, durationMs: Date.now() - startedAt,
      error: errorDetails(error),
    });
    return apiError(UI_STRINGS.appApiAdminUsersRoute.failedToCreateUser, 500);
  }

  if (Number(results[0]?.meta?.changes || 0) !== 1) {
    // Another request took the email or filled the role's last seat between the checks and the write.
    return apiError(UI_STRINGS.appApiAdminUsersRoute.emailOrRoleLimitChangedPleaseRefreshAndTryAgain, 409);
  }

  await writeStructuredLog('info', 'admin.user_created', {
    operation: 'create_user', route: ADMIN_USERS_ROUTE,
    requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
    createdUserId: userId, targetBusinessId: target.id, role,
    durationMs: Date.now() - startedAt,
  });

  return apiSuccess({
    id: userId, email, name, role, status: NEW_USER_STATUS, createdAt: now,
    tenant: { id: target.id, name: target.name },
  }, 201);
}
