// src/app/api/vendor-portal/ppos/route.ts
// Vendor Purchase Orders (PPOs) listing API (strictly isolated to logged-in vendor)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/ppos', method: 'GET' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/ppos', method: 'GET' });
  }

  try {
    const ppos = await prisma.ppo.findMany({
      where: {
        tenantId: ctx.tenantId,
        vendorId,
      },
      include: {
        project: { select: { id: true, name: true, projectCode: true } },
        rfq: { select: { id: true, rfqNumber: true, title: true } },
        lines: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess({ ppos, total: ppos.length });
  } catch (error: any) {
    console.error('Error fetching vendor PPOs:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchPpos }), 500, { route: '/api/vendor-portal/ppos', method: 'GET', error: error });
  }
}
