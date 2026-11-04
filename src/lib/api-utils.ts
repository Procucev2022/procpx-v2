// lib/api-utils.ts - API route utilities
import { NextResponse } from 'next/server';
import { auth } from './auth';
import { hasPermission, UserRole, Permission } from './permissions';
import type { ApiContext, ApiErrorDetails } from "@app-types/lib/api-utils.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { logEvent } from './observability/server-logger';

export type { ApiContext };


let currentTestContext: { userId?: string; tenantId?: string } | null = null;

export function setTestAuthContext(ctx: { userId?: string; tenantId?: string } | null) {
  currentTestContext = ctx;
}

export async function requireAuth(permission?: Permission): Promise<ApiContext | NextResponse> {
  // 1. Check test context (used by automated test suites)
  if (currentTestContext?.userId || currentTestContext?.tenantId) {
    const { prisma } = await import('./prisma');
    const user = await prisma.user.findFirst({
      where: currentTestContext.userId ? { id: currentTestContext.userId } : { tenantId: currentTestContext.tenantId! },
      include: { tenant: true },
    });
    if (user) {
      if (permission && !hasPermission(user.role as UserRole, permission)) {
        return NextResponse.json({ error: UI_STRINGS.common.forbiddenInsufficientPermissions }, { status: 403 });
      }
      return {
        userId: user.id,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name || 'Default Tenant',
        role: user.role as UserRole,
        userName: user.name || user.email || 'User',
        userEmail: user.email,
        vendorId: user.vendorId,
      };
    }
  }

  // 2. Check next-auth session
  let session: any = null;
  try {
    session = await auth();
  } catch {
    // outside Next.js request context
  }

  if (!session?.user) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        const { headers } = await import('next/headers');
        const headerList = await headers();
        const testUserId = headerList.get('x-test-user-id');
        const testTenantId = headerList.get('x-test-tenant-id');
        if (testUserId || testTenantId) {
          const { prisma } = await import('./prisma');
          const user = await prisma.user.findFirst({
            where: testUserId ? { id: testUserId } : { tenantId: testTenantId! },
            include: { tenant: true },
          });
          if (user) {
            if (permission && !hasPermission(user.role as UserRole, permission)) {
              return NextResponse.json({ error: UI_STRINGS.common.forbiddenInsufficientPermissions }, { status: 403 });
            }
            return {
              userId: user.id,
              tenantId: user.tenantId,
              tenantName: user.tenant?.name || 'Default Tenant',
              role: user.role as UserRole,
              userName: user.name || user.email || 'User',
              userEmail: user.email,
              vendorId: user.vendorId,
            };
          }
        }
      } catch (err) {
        // ignore when called outside next headers context
      }
    }
    return NextResponse.json({ error: UI_STRINGS.libApiUtils.unauthenticated }, { status: 401 });
  }
  const user = session.user as any;
  if (permission && !hasPermission(user.role as UserRole, permission)) {
    return NextResponse.json({ error: UI_STRINGS.common.forbiddenInsufficientPermissions }, { status: 403 });
  }

  let vendorId = user.vendorId;
  if (!vendorId && (user.role as UserRole) === 'VENDOR') {
    try {
      const { prisma } = await import('./prisma');
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { vendorId: true },
      });
      vendorId = dbUser?.vendorId || null;
    } catch (error) {
      // The vendor portal then shows no vendor data, so record why.
      logEvent('warn', 'auth.vendor_lookup_failed', { userId: user.id, tenantId: user.tenantId, error });
    }
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    tenantName: user.tenantName,
    role: user.role as UserRole,
    userName: user.name || user.email || 'User',
    userEmail: user.email,
    vendorId,
  };
}

export function isApiContext(val: unknown): val is ApiContext {
  return typeof val === 'object' && val !== null && 'userId' in val;
}

/**
 * Builds an error response and records it. Server failures (5xx) are logged as
 * errors with the caught exception; rejected requests (4xx other than 401) are
 * logged as warnings so failing workflows are visible even when the UI recovers.
 */
export function apiError(message: string, status = 400, details: ApiErrorDetails = {}) {
  if (status !== 401) {
    const { event, ...context } = details;
    logEvent(status >= 500 ? 'error' : 'warn', event ?? (status >= 500 ? 'api.request_failed' : 'api.request_rejected'), {
      status,
      responseMessage: message,
      ...context,
    });
  }
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const data = items.slice((page - 1) * pageSize, page * pageSize);
  return { data, total, page, pageSize, totalPages };
}
