import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { decodeNegotiationHistoryCursor, paginateNegotiationHistory } from '@/lib/negotiation-history';
import { NEGOTIATION_HISTORY_PAGE_SIZE } from '@/lib/negotiation-history.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id: rfqId } = await params;
  const startedAt = Date.now();
  let vendorId: string | null = null;
  const searchParams = new URL(req.url).searchParams;
  const requestedVendorId = searchParams.get('vendorId');

  if (ctx.role === 'VENDOR') {
    vendorId = ctx.vendorId || null;
    if (!vendorId) return apiError(UI_STRINGS.common.forbiddenUnmappedVendorAccount, 403);
  } else if (!hasPermission(ctx.role, 'NEGOTIATION_VIEW')) {
    return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403);
  }

  if (requestedVendorId !== null) {
    const normalizedVendorId = requestedVendorId.trim();
    if (!normalizedVendorId || normalizedVendorId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(normalizedVendorId)) {
      return apiError(UI_STRINGS.common.userMessages.invalidNegotiationHistoryVendor, 400);
    }
    if (ctx.role === 'VENDOR' && normalizedVendorId !== vendorId) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdRoute.forbiddenYouAreNotInvitedToThisRFQ, 403);
    }
    vendorId = normalizedVendorId;
  }

  const rawCursor = searchParams.get('cursor');
  const cursor = rawCursor === null ? null : decodeNegotiationHistoryCursor(rawCursor);
  if (rawCursor !== null && !cursor) {
    return apiError(UI_STRINGS.common.userMessages.invalidNegotiationHistoryCursor, 400);
  }

  try {
    if (vendorId) {
      const invitation = await prisma.rfqVendor.findFirst({
        where: { rfqId, tenantId: ctx.tenantId, vendorId },
        select: { id: true },
      });
      if (!invitation) {
        return apiError(UI_STRINGS.appApiProcurementRfqsIdRoute.forbiddenYouAreNotInvitedToThisRFQ, 403);
      }
    }

    const negotiation = await prisma.negotiation.findFirst({
      where: { rfqId, tenantId: ctx.tenantId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true, currentRound: true },
    });
    if (!negotiation) {
      return apiSuccess({ rounds: [], nextCursor: null, hasMore: false, pageSize: NEGOTIATION_HISTORY_PAGE_SIZE });
    }

    const rounds = await prisma.negotiationRound.findMany({
      where: {
        tenantId: ctx.tenantId,
        negotiationId: negotiation.id,
        ...(vendorId ? { vendorId } : {}),
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NEGOTIATION_HISTORY_PAGE_SIZE + 1,
      select: {
        id: true,
        vendorId: true,
        roundNumber: true,
        deadline: true,
        targetPrice: true,
        previousQuoteAmount: true,
        counterOfferAmount: true,
        revisedQuoteAmount: true,
        savingsAmount: true,
        savingsPercent: true,
        status: true,
        notes: true,
        isFinalOffer: true,
        buyerDecision: true,
        buyerDecisionDate: true,
        buyerDecisionRemarks: true,
        nextResponsibleParty: true,
        lineItemsJson: true,
        submittedByVendor: true,
        createdAt: true,
        vendor: { select: { id: true, name: true, code: true } },
      },
    });
    const page = paginateNegotiationHistory(rounds);

    return apiSuccess({ negotiation, ...page });
  } catch (error: unknown) {
    try {
      await writeStructuredLog('error', 'procurement.rfq_negotiation_history_failed', {
        operation: 'read_rfq_negotiation_history', route: `/api/procurement/rfqs/${rfqId}/negotiation-history`,
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
        tenantId: ctx.tenantId, userId: ctx.userId, vendorId: vendorId || undefined, rfqId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      }, 'application');
    } catch (loggingError: unknown) {
      console.error('procurement.rfq_negotiation_history_log_failed', {
        operation: 'read_rfq_negotiation_history', route: `/api/procurement/rfqs/${rfqId}/negotiation-history`,
        tenantId: ctx.tenantId, userId: ctx.userId, vendorId: vendorId || undefined, rfqId,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
        loggingError: loggingError instanceof Error ? { name: loggingError.name } : { type: typeof loggingError },
      });
    }
    return apiError(UI_STRINGS.common.userMessages.failedToFetchNegotiationHistory, 500);
  }
}
