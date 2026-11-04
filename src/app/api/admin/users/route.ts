// app/api/admin/users/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { hashPassword } from '@/lib/password';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('USER_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  const search = searchParams.get('search') || '';

  const where: any = { tenantId: ctx.tenantId };
  if (search) {
    where.OR = [{ name: { contains: search } }, { email: { contains: search } }];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true, role: true, status: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return apiSuccess({ data: users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
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
      passwordHash: await hashPassword(password),
      status: 'ACTIVE',
      createdBy: ctx.userId,
    },
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });

  return apiSuccess(user, 201);
}
