// app/api/procurement/rfqs/[id]/lock-rates/route.ts
// Locks Final Negotiated Rates for an RFQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('FINAL_RATE_LOCK');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { vendorId, finalCommercialValue, remarks } = body;

    if (!vendorId) {
      return apiError('Winning vendor ID is required to lock rates', 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        quotes: {
          where: { vendorId },
          orderBy: { quoteVersion: 'desc' },
          take: 1,
        },
      },
    });

    if (!rfq) {
      return apiError('RFQ not found or access denied', 404);
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) {
      return apiError('Vendor not found', 404);
    }

    const benchmark = rfq.estimatedBenchmarkValue || 0;
    const finalAmount = finalCommercialValue ? Number(finalCommercialValue) : (rfq.quotes[0]?.totalQuoteAmount || 0);
    const savings = benchmark - finalAmount;
    const savingsPercent = benchmark > 0 ? (savings / benchmark) * 100 : 0;

    const updated = await prisma.rfq.update({
      where: { id },
      data: {
        status: 'FINAL_RATE_LOCKED',
        finalLockedAt: new Date(),
        finalLockedById: ctx.userId,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'RFQ',
      entityId: rfq.id,
      action: 'FINAL_RATE_LOCKED',
      description: `Final rates locked for RFQ ${rfq.rfqNumber} with vendor ${vendor.name} at ₹ ${finalAmount.toLocaleString()} (Benchmark: ₹ ${benchmark.toLocaleString()}, Savings: ${Math.round(savingsPercent)}%)`,
      newValue: {
        vendorId,
        vendorName: vendor.name,
        finalCommercialValue: finalAmount,
        benchmarkValue: benchmark,
        savings,
        savingsPercent,
        remarks,
      },
    });

    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'FINAL_RATES_LOCKED',
      recordNumber: rfq.rfqNumber,
      entityId: rfq.id,
      actorName: ctx.userName,
      details: {
        vendorName: vendor.name,
        amount: finalAmount,
      },
    });

    return apiSuccess({
      rfq: updated,
      finalVendor: vendor,
      finalCommercialValue: finalAmount,
      savings,
      savingsPercent: Math.round(savingsPercent * 100) / 100,
      message: `Final commercial rates locked successfully for ${vendor.name}`,
    });
  } catch (error: any) {
    console.error('Error locking final rates:', error);
    return apiError(error.message || 'Failed to lock final rates', 500);
  }
}
