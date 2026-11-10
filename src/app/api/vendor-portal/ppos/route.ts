// src/app/api/vendor-portal/ppos/route.ts
// Vendor Purchase Orders (PPOs) listing API (strictly isolated to logged-in vendor)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { getListPageWindow } from "@/lib/api-utils";
import type { Prisma } from '@prisma/client';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { MAX_PPO_CREATE_LINES } from '@/lib/d1-batch.constants';
import { VENDOR_PPO_MAX_PAGE_SIZE, VENDOR_PPO_MAX_SEARCH_LENGTH, VENDOR_PPO_PAGE_SIZE } from './route.constants';
import type { VendorPpoLineView, VendorPpoRouteQuery } from '@app-types/app/api/vendor-portal-ppos.types';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR') {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/ppos', method: 'GET' });
  }

  const { searchParams } = new URL(req.url);
  const pageWindow = getListPageWindow(searchParams);
  const query: VendorPpoRouteQuery = {
    ...pageWindow,
    pageSize: Math.min(pageWindow.pageSize || VENDOR_PPO_PAGE_SIZE, VENDOR_PPO_MAX_PAGE_SIZE),
    search: (searchParams.get('search') || '').trim().slice(0, VENDOR_PPO_MAX_SEARCH_LENGTH),
    ppoId: searchParams.get('ppoId'),
  };

  if (query.ppoId) {
    const startedAt = Date.now();
    try {
      const ppo = await prisma.ppo.findFirst({
        where: { id: query.ppoId, tenantId: ctx.tenantId, vendorId },
        include: { lines: {
          orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
          take: MAX_PPO_CREATE_LINES + 1,
        } },
      });
      if (!ppo) return apiError(UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, 404);
      if ((ppo.lines?.length ?? 0) > MAX_PPO_CREATE_LINES) {
        await writeStructuredLog('error', 'vendor_portal.ppo_line_limit_exceeded', {
          operation: 'read_vendor_ppo_detail', route: '/api/vendor-portal/ppos',
          requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
          tenantId: ctx.tenantId, userId: ctx.userId, vendorId, ppoId: query.ppoId,
          observedLineCountAtLeast: ppo.lines.length, maximumLines: MAX_PPO_CREATE_LINES,
          durationMs: Date.now() - startedAt,
        });
        return apiError(UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders, 500);
      }
      const lines: VendorPpoLineView[] = ppo.lines.map((line) => ({
        id: line.id,
        itemDescription: line.itemDescription,
        quantity: line.orderedQuantity,
        uom: line.uom,
        unitRate: line.orderedUnitRate,
        gstPercent: line.orderedAmount > 0 ? Math.round((line.taxAmount / line.orderedAmount) * 10_000) / 100 : 0,
        totalAmount: line.totalOrderValue || line.orderedAmount + line.taxAmount,
      }));
      return apiSuccess({ ppo: { ...ppo, grossTotal: ppo.totalValue, totalAmount: ppo.totalValue, poDate: ppo.issuedAt || ppo.createdAt }, lines });
    } catch (error) {
      await writeStructuredLog('error', 'vendor_portal.ppo_detail_read_failed', {
        operation: 'read_vendor_ppo_details', route: '/api/vendor-portal/ppos', requestId: req.headers.get('x-request-id'),
        tenantId: ctx.tenantId, vendorId, ppoId: query.ppoId, durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
      return apiError(UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders, 500);
    }
  }

  try {
    const where: Prisma.PpoWhereInput = { tenantId: ctx.tenantId, vendorId };
    if (query.search) {
      where.OR = [
        { ppoNumber: { contains: query.search } },
        { project: { name: { contains: query.search } } },
        { rfq: { rfqNumber: { contains: query.search } } },
      ];
    }
    const summaryWhere: Prisma.PpoWhereInput = { tenantId: ctx.tenantId, vendorId };
    const [rows, total, summaryTotal, valueAggregate, pendingCount] = await Promise.all([
      prisma.ppo.findMany({
        where,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          rfq: { select: { id: true, rfqNumber: true, title: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      prisma.ppo.count({ where }),
      prisma.ppo.count({ where: summaryWhere }),
      prisma.ppo.aggregate({ where: summaryWhere, _sum: { totalValue: true } }),
      prisma.ppo.count({ where: { ...summaryWhere, vendorAcceptedAt: null, vendorStatus: { not: 'ACCEPTED' } } }),
    ]);
    const ppos = rows.map(({ _count, ...ppo }) => ({
      ...ppo,
      grossTotal: ppo.totalValue,
      totalAmount: ppo.totalValue,
      poDate: ppo.issuedAt || ppo.createdAt,
      lineCount: _count.lines,
    }));
    return apiSuccess({
      ppos, total, page: query.page, pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize), hasMore: query.page * query.pageSize < total,
      summary: {
        total: summaryTotal,
        totalValue: Number(valueAggregate._sum.totalValue || 0),
        pendingCount,
      },
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor_portal.ppo_list_read_failed', {
      operation: 'list_vendor_ppos', route: '/api/vendor-portal/ppos', requestId: req.headers.get('x-request-id'),
      tenantId: ctx.tenantId, vendorId, page: query.page, pageSize: query.pageSize,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders, 500);
  }
}
