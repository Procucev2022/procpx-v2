// app/api/procurement/auctions/[id]/terms-accept/route.ts
// Records vendor acknowledgement and acceptance of auction Terms & Conditions
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

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
        return apiError('Vendor record not found for this user', 404);
      }
      vendorId = vendorRecord.id;
    } else {
      const body = await req.json().catch(() => ({}));
      vendorId = body.vendorId;
    }

    if (!vendorId) {
      return apiError('Vendor ID is required to accept terms', 400);
    }

    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { rfq: true },
    });

    if (!auction) {
      return apiError('Auction not found', 404);
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
      return apiError('Vendor is not invited to this auction event', 403);
    }

    const now = new Date();
    await prisma.auctionVendor.update({
      where: { id: participant.id },
      data: {
        termsAccepted: true,
        termsAcceptedAt: now,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: auction.rfq.projectId,
      entityType: 'AUCTION',
      entityId: auction.id,
      action: 'AUCTION_TERMS_ACCEPTED',
      description: `${participant.vendor.name} accepted Terms & Conditions for auction ${auction.auctionNumber}`,
      newValue: {
        vendorId,
        termsAcceptedAt: now.toISOString(),
      },
    });

    return apiSuccess({
      message: 'Terms & Conditions accepted. You are now eligible to place bids in this auction.',
      termsAcceptedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error('Error accepting auction terms:', error);
    return apiError(error.message || 'Failed to accept auction terms', 500);
  }
}
