// app/api/procurement/auctions/[id]/terms-accept/route.ts
// Records vendor acknowledgement and acceptance of auction Terms & Conditions
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { runAuditedD1UpdateAtomically } from '@/lib/audited-update';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    let vendorId: string | null = null;

    if (ctx.role === 'VENDOR') {
      const vendorRecord = await prisma.vendor.findFirst({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { email: ctx.userEmail || '' },
            { id: ctx.vendorId || '' },
            { id: ctx.userId },
          ],
        },
      });
      if (!vendorRecord) {
        return apiError(UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.vendorRecordNotFoundForThisUser, 404, { route: '/api/procurement/auctions/[id]/terms-accept', method: 'POST' });
      }
      vendorId = vendorRecord.id;
    } else {
      const body = await req.json().catch(() => ({}));
      vendorId = body.vendorId;
    }

    if (!vendorId) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.vendorIDIsRequiredToAcceptTerms, 400, { route: '/api/procurement/auctions/[id]/terms-accept', method: 'POST' });
    }

    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { rfq: true },
    });

    if (!auction) {
      return apiError(UI_STRINGS.common.auctionNotFound, 404, { route: '/api/procurement/auctions/[id]/terms-accept', method: 'POST' });
    }

    const participant = await prisma.auctionVendor.findFirst({
      where: {
        auctionId: id,
        vendorId,
        tenantId: ctx.tenantId,
      },
      include: { vendor: true },
    });

    if (!participant) {
      return apiError(UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.vendorIsNotInvitedToThisAuctionEvent, 403, { route: '/api/procurement/auctions/[id]/terms-accept', method: 'POST' });
    }

    const now = new Date();
    await runAuditedD1UpdateAtomically({
      table: 'auctionVendor',
      id: participant.id,
      tenantId: ctx.tenantId,
      data: {
        termsAccepted: true,
        termsAcceptedAt: now,
      },
      route: '/api/procurement/auctions/[id]/terms-accept',
      requestId: req.headers.get('x-request-id'),
      audit: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: auction.rfq.projectId,
        entityType: 'AUCTION',
        entityId: auction.id,
        action: 'AUCTION_TERMS_ACCEPTED',
        description: interpolateUiString(UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.nameAcceptedTermsConditionsForAuctionAuctionNumber, { "name": participant.vendor.name, "auctionNumber": auction.auctionNumber }),
        newValue: {
          vendorId,
          termsAcceptedAt: now.toISOString(),
        },
      },
    });

    return apiSuccess({
      message: UI_STRINGS.appApiProcurementAuctionsIdTermsAcceptRoute.termsConditionsAcceptedYouAreNowEligibleToPlaceBidsInThisAuction,
      termsAcceptedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error('Error accepting auction terms:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToAcceptAuctionTerms }), 500, { route: '/api/procurement/auctions/[id]/terms-accept', method: 'POST', error: error });
  }
}
