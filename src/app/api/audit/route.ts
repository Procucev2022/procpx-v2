// app/api/audit/route.ts - Audit trail
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AUDIT_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '50');
  const entityType = searchParams.get('entityType') || '';
  const action = searchParams.get('action') || '';
  const projectId = searchParams.get('projectId') || '';

  const where: any = { tenantId: ctx.tenantId };
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (projectId) where.projectId = projectId;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  return apiSuccess({ data: logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}
