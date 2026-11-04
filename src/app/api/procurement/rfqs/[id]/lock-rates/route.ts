// app/api/procurement/rfqs/[id]/lock-rates/route.ts
// Locks Final Negotiated Rates for an RFQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


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
      return apiError(UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.winningVendorIDIsRequiredToLockRates, 400, { route: '/api/procurement/rfqs/[id]/lock-rates', method: 'POST' });
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
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/rfqs/[id]/lock-rates', method: 'POST' });
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFound, 404, { route: '/api/procurement/rfqs/[id]/lock-rates', method: 'POST' });
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
      description: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.finalRatesLockedForRFQRfqNumberWithVendorNameAtToLocaleStringBenchmarkToLocaleString2SavingsRound, { "rfqNumber": rfq.rfqNumber, "name": vendor.name, "toLocaleString": finalAmount.toLocaleString(), "toLocaleString2": benchmark.toLocaleString(), "round": Math.round(savingsPercent) }),
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
      message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdLockRatesRoute.finalCommercialRatesLockedSuccessfullyForName, { "name": vendor.name }),
    });
  } catch (error: any) {
    console.error('Error locking final rates:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToLockFinalRates }), 500, { route: '/api/procurement/rfqs/[id]/lock-rates', method: 'POST', error: error });
  }
}
