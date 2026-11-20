// lib/api-utils.ts - API route utilities
import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from './auth';
import { hasPermission, UserRole, Permission } from './permissions';
import type { ApiContext, ApiErrorDetails, AuthenticatedSessionUser, ListPageWindow } from "@app-types/lib/api-utils.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { logEvent } from './observability/server-logger';
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_NUMBER, MAX_LIST_PAGE_SIZE } from './api-utils.constants';

export type { ApiContext };

const staticCatalogMessages = new Set<string>();

function collectStaticCatalogMessages(value: unknown): void {
  if (typeof value === 'string') {
    if (!value.includes('{{')) staticCatalogMessages.add(value);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const child of Object.values(value)) collectStaticCatalogMessages(child);
}

collectStaticCatalogMessages(UI_STRINGS);

function publicErrorMessage(message: string): string {
  return staticCatalogMessages.has(message)
    ? message
    : UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred;
}


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
      include: { tenant: { select: { name: true } } },
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
  let session: Session | null = null;
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
            include: { tenant: { select: { name: true } } },
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
              userEmail: user.email || undefined,
              vendorId: user.vendorId,
            };
          }
        }
      } catch {
        // ignore when called outside next headers context
      }
    }
    return NextResponse.json({ error: UI_STRINGS.libApiUtils.unauthenticated }, { status: 401 });
  }
  const user = session.user as unknown as AuthenticatedSessionUser;
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
    tenantName: user.tenantName || 'Default Tenant',
    role: user.role as UserRole,
    userName: user.name || user.email || 'User',
    userEmail: user.email || undefined,
    vendorId,
  };
}

export function isApiContext(val: unknown): val is ApiContext {
  return typeof val === 'object' && val !== null && 'userId' in val;
}

/**
 * Builds an error response and records it. Server failures (5xx) are logged as
 * errors and only expose static catalog messages to the client; rejected
 * requests (4xx other than 401) are logged as warnings so failing workflows are
 * visible even when the UI recovers.
 */
export function apiError(message: string, status = 400, details: ApiErrorDetails = {}) {
  const safeMessage = status >= 500 ? publicErrorMessage(message) : message;
  if (status !== 401) {
    const { event, ...context } = details;
    logEvent(status >= 500 ? 'error' : 'warn', event ?? (status >= 500 ? 'http.api_error_response' : 'api.request_rejected'), {
      operation: 'api_error_response',
      status,
      publicError: safeMessage,
      ...(status >= 500 ? { error: message } : {}),
      ...context,
    });
  }
  return NextResponse.json({ error: safeMessage }, { status });
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

export function getListPageWindow(searchParams: URLSearchParams): ListPageWindow {
  const rawPage = Number(searchParams.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0
    ? Math.min(rawPage, MAX_LIST_PAGE_NUMBER)
    : 1;
  const rawPageSize = Number(searchParams.get('pageSize'));
  const pageSize = Number.isSafeInteger(rawPageSize) && rawPageSize > 0
    ? Math.min(rawPageSize, MAX_LIST_PAGE_SIZE)
    : DEFAULT_LIST_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize };
}
