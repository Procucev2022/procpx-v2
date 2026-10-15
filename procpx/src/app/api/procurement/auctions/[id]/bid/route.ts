// app/api/procurement/auctions/[id]/bid/route.ts
// Handles real-time decrement bidding in Reverse E-Auction & Sealed Bid
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const body = await req.json();
    const { vendorId, bidAmount } = body;

    if (!vendorId || !bidAmount) {
      return apiError('Vendor ID and Bid Amount are required', 400);
    }

    const auction = await prisma.auction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rfq: true,
        bids: { orderBy: { bidAmount: 'asc' } },
      },
    });

    if (!auction) {
      return apiError('Auction not found or access denied', 404);
    }

    if (auction.status === 'CLOSED' || auction.status === 'CANCELLED') {
      return apiError(`Cannot place bid. Auction is ${auction.status}`, 400);
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) {
      return apiError('Vendor not found', 404);
    }

    const numericBid = Number(bidAmount);
    const currentLowest = auction.currentLowestBid || auction.startingPrice;

    // Enforce decrement validation for reverse auction
    if (auction.auctionType === 'REVERSE_AUCTION') {
      const maxAllowedBid = currentLowest - auction.minDecrement;
      if (numericBid > maxAllowedBid) {
        return apiError(
          `Bid ₹ ${numericBid.toLocaleString()} must be at least ₹ ${auction.minDecrement.toLocaleString()} lower than current lowest bid (Max allowed: ₹ ${maxAllowedBid.toLocaleString()})`,
          400
        );
      }
    }

    const bidCount = auction.bids.length + 1;

    // Create bid record
    const bid = await prisma.auctionBid.create({
      data: {
        tenantId: ctx.tenantId,
        auctionId: id,
        vendorId,
        bidNumber: bidCount,
        bidAmount: numericBid,
        rank: 1, // New lowest bid becomes Rank 1
        timestamp: new Date(),
      },
      include: {
        vendor: true,
      },
    });

    // Update auction current lowest and winning vendor
    await prisma.auction.update({
      where: { id },
      data: {
        currentLowestBid: numericBid,
        currentWinningVendorId: vendorId,
        status: 'LIVE',
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: auction.rfq.projectId,
      entityType: 'AUCTION',
      entityId: auction.id,
      action: 'AUCTION_BID_SUBMITTED',
      description: `Bid #${bidCount} of ₹ ${numericBid.toLocaleString()} submitted by ${vendor.name} in auction ${auction.auctionNumber}`,
      newValue: {
        bidNumber: bidCount,
        bidAmount: numericBid,
        vendorId,
        vendorName: vendor.name,
      },
    });

    return apiSuccess({
      bid,
      currentLowestBid: numericBid,
      message: `Bid of ₹ ${numericBid.toLocaleString()} submitted successfully`,
    }, 201);
  } catch (error: any) {
    console.error('Error submitting auction bid:', error);
    return apiError(error.message || 'Failed to submit bid', 500);
  }
}
