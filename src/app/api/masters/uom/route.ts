// app/api/masters/uom/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export async function GET(_req: NextRequest) {
  const ctx = await requireAuth('MASTER_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const uoms = await prisma.uomMaster.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    orderBy: [{ category: 'asc' }, { code: 'asc' }],
  });

  return apiSuccess(uoms);
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
