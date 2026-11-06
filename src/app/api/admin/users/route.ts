// app/api/admin/users/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess, getListPageWindow } from '@/lib/api-utils';
import bcrypt from 'bcryptjs';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { writeStructuredLog } from '@/lib/observability/server-logger';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('USER_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const { page, pageSize, skip } = getListPageWindow(searchParams);
  const search = (searchParams.get('search') || '').trim().slice(0, 200);

  const where: any = { tenantId: ctx.tenantId };
  if (search) {
    where.OR = [{ name: { contains: search } }, { email: { contains: search } }];
  }

  const startedAt = Date.now();
  try {
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { id: true, email: true, name: true, role: true, status: true, lastLoginAt: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return apiSuccess({ data: users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'admin.user_list_read_failed', {
      operation: 'list_users', route: '/api/admin/users',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      page, pageSize, searchLength: search.length, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiAdminUsersRoute.failedToFetchUsers, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('USER_CREATE');
  if (!isApiContext(ctx)) return ctx;

  const body = await req.json();
  const { email, name, role, password } = body;

  if (!email?.trim()) return apiError(UI_STRINGS.appApiAdminUsersRoute.emailIsRequired);
  if (!name?.trim()) return apiError(UI_STRINGS.appApiAdminUsersRoute.nameIsRequired);
  if (!role) return apiError(UI_STRINGS.appApiAdminUsersRoute.roleIsRequired);
  if (!password || password.length < 8) return apiError(UI_STRINGS.appApiAdminUsersRoute.passwordMustBeAtLeast8Characters);

  const existing = await prisma.user.findFirst({ where: { tenantId: ctx.tenantId, email: email.trim() } });
  if (existing) return apiError(UI_STRINGS.appApiAdminUsersRoute.aUserWithThisEmailAlreadyExists);

  const user = await prisma.user.create({
    data: {
      tenantId: ctx.tenantId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role,
      passwordHash: await bcrypt.hash(password, 12),
      status: 'ACTIVE',
      createdBy: ctx.userId,
    },
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });

  return apiSuccess(user, 201);
}
