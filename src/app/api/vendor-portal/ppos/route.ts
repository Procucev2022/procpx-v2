// src/app/api/vendor-portal/ppos/route.ts
// Vendor Purchase Orders (PPOs) listing API (strictly isolated to logged-in vendor)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError('Forbidden: Vendor Portal is accessible only to mapped vendor accounts', 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError('Vendor record not associated with this user account', 404);
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
    return apiError(error.message || 'Failed to fetch PPOs', 500);
  }
}
