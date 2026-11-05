// app/api/masters/uom/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from '@/lib/i18n';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { MAX_ACTIVE_UOM_RESULTS } from './route.constants';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('MASTER_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  try {
    const uoms = await prisma.uomMaster.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: [{ category: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      take: MAX_ACTIVE_UOM_RESULTS + 1,
    });
    if (uoms.length > MAX_ACTIVE_UOM_RESULTS) {
      await writeStructuredLog('warn', 'masters.uom_result_limit_exceeded', {
        operation: 'list_active_uoms', route: '/api/masters/uom',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId,
        userId: ctx.userId, resultCountAtLeast: uoms.length, maxItems: MAX_ACTIVE_UOM_RESULTS,
        durationMs: Date.now() - startedAt,
      });
      return apiError(interpolateUiString(UI_STRINGS.appApiMastersUomRoute.activeUomListExceedsMaximumSize, {
        maxItems: MAX_ACTIVE_UOM_RESULTS,
      }), 413);
    }

    return apiSuccess(uoms);
  } catch (error: unknown) {
    await writeStructuredLog('error', 'masters.uom_list_failed', {
      operation: 'list_active_uoms', route: '/api/masters/uom',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.appApiMastersUomRoute.activeUomListReadFailed, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('MASTER_EDIT');
  if (!isApiContext(ctx)) return ctx;

  const body = await req.json();
  const { code, name, aliases, category } = body;
  if (!code?.trim()) return apiError(UI_STRINGS.appApiMastersUomRoute.uOMCodeIsRequired);
  if (!name?.trim()) return apiError(UI_STRINGS.appApiMastersUomRoute.uOMNameIsRequired);

  const uom = await prisma.uomMaster.create({
    data: {
      tenantId: ctx.tenantId,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      aliases: aliases ? JSON.stringify(aliases) : null,
      category: category || 'OTHER',
    },
  });

  return apiSuccess(uom, 201);
}
