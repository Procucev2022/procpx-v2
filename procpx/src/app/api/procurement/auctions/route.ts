// app/api/procurement/auctions/route.ts
// Reverse E-Auction and Sealed Bid creation & monitoring API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AUCTION_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const type = searchParams.get('type');

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;
    if (type) where.auctionType = type;

    const auctions = await prisma.auction.findMany({
      where,
      include: {
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            packageName: true,
            project: { select: { id: true, name: true, projectCode: true } },
          },
        },
        bids: {
          include: {
            vendor: { select: { id: true, name: true, code: true } },
          },
          orderBy: { timestamp: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess({ auctions, total: auctions.length });
  } catch (error: any) {
    console.error('Error fetching auctions:', error);
    return apiError(error.message || 'Failed to fetch auctions', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('AUCTION_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      rfqId,
      title,
      auctionType = 'REVERSE_AUCTION',
      startingPrice,
      minDecrement = 5000,
      startTime,
      endTime,
      autoExtensionMinutes = 5,
      bidVisibility = 'RANK_ONLY',
    } = body;

    if (!rfqId || !title || !startingPrice) {
      return apiError('RFQ ID, Title, and Starting Price are required', 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
    });

    if (!rfq) {
      return apiError('RFQ not found or access denied', 404);
    }

    const count = await prisma.auction.count({ where: { tenantId: ctx.tenantId } });
    const prefix = auctionType === 'SEALED_BID' ? 'SLD' : 'AUC';
    const auctionNumber = `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const now = new Date();
    const start = startTime ? new Date(startTime) : now;
    const end = endTime ? new Date(endTime) : new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours default

    const auction = await prisma.auction.create({
      data: {
        tenantId: ctx.tenantId,
        rfqId,
        auctionNumber,
        auctionType,
        title,
        startingPrice: Number(startingPrice),
        minDecrement: Number(minDecrement),
        currentLowestBid: Number(startingPrice),
        startTime: start,
        endTime: end,
        autoExtensionMinutes: Number(autoExtensionMinutes),
        bidVisibility,
        status: start <= now ? 'LIVE' : 'SCHEDULED',
      },
      include: {
        rfq: true,
      },
    });

    const auditAction = auctionType === 'SEALED_BID' ? 'SEALED_BID_CREATED' : 'AUCTION_CREATED';
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'AUCTION',
      entityId: auction.id,
      action: auditAction,
      description: `${auctionType === 'SEALED_BID' ? 'Sealed Bid' : 'Reverse E-Auction'} ${auctionNumber} created for RFQ ${rfq.rfqNumber} (Starting: ₹ ${Number(startingPrice).toLocaleString()}, Min Decrement: ₹ ${Number(minDecrement).toLocaleString()})`,
      newValue: {
        auctionNumber,
        auctionType,
        startingPrice,
        minDecrement,
        bidVisibility,
      },
    });

    return apiSuccess({ auction, message: `${auctionType} created successfully` }, 201);
  } catch (error: any) {
    console.error('Error creating auction:', error);
    return apiError(error.message || 'Failed to create auction event', 500);
  }
}
