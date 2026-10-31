// src/app/api/procurement/rate-cards/route.ts
// Vendor Rate Card Management & Approved Catalogues
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const vendorId = searchParams.get('vendorId');
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const search = searchParams.get('search') || '';

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { rateCardNumber: { contains: search } },
        { title: { contains: search } },
        { category: { contains: search } },
        { vendor: { name: { contains: search } } },
      ];
    }

    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : 0;

    const findOptions: any = {
      where,
      include: {
        vendor: {
          select: {
            id: true,
            code: true,
            name: true,
            vendorType: true,
            complianceStatus: true,
            qualificationStatus: true,
            performanceScore: true,
          },
        },
        items: true,
        approvals: {
          orderBy: { timestamp: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    };

    if (limit > 0) {
      findOptions.skip = (page - 1) * limit;
      findOptions.take = limit;
    }

    const [rateCards, totalCount] = await Promise.all([
      prisma.vendorRateCard.findMany(findOptions),
      prisma.vendorRateCard.count({ where }),
    ]);

    const now = new Date();
    const formatted = rateCards.map((rc: any) => {
      const isValid = rc.status === 'APPROVED' && rc.validFrom <= now && rc.validTo >= now;
      const isExpired = rc.validTo < now || rc.status === 'EXPIRED';

      const enrichedItems = (rc.items || []).map((it: any) => {
        let meta: any = {};
        if (it.comparisonRef) {
          try {
            meta = JSON.parse(it.comparisonRef);
          } catch {}
        }
        return {
          ...it,
          buyerOffer1: meta.buyerOffer1 !== undefined ? meta.buyerOffer1 : it.rate,
          vendorQuote1: meta.vendorQuote1 !== undefined ? meta.vendorQuote1 : it.proposedRate,
          buyerOffer2: meta.buyerOffer2 !== undefined ? meta.buyerOffer2 : null,
          vendorQuote2: meta.vendorQuote2 !== undefined ? meta.vendorQuote2 : null,
          finalAgreedRate: meta.finalAgreedRate !== undefined ? meta.finalAgreedRate : (rc.status === 'APPROVED' || rc.status === 'FINAL_VENDOR_OFFER_ACCEPTED' ? it.rate : null),
          previousPpoRate: meta.previousPpoRate !== undefined ? meta.previousPpoRate : it.historicalRate,
          referenceQty: meta.referenceQty !== undefined ? meta.referenceQty : (it.minQuantity || 1),
          remarks: meta.remarks || '',
          variance: it.benchmarkRate ? Math.round(((it.rate - it.benchmarkRate) / it.benchmarkRate) * 100) : 0,
        };
      });

      let notesData: any = {};
      if (rc.notes) {
        try { notesData = JSON.parse(rc.notes); } catch {}
      }

      return {
        ...rc,
        isValid,
        isExpired,
        items: enrichedItems,
        itemCount: rc.items.length,
        agreement: notesData.agreement || null,
      };
    });

    return apiSuccess({
      rateCards: formatted,
      total: totalCount,
      page: limit > 0 ? page : 1,
      totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 1,
    });
  } catch (error: any) {
    console.error('Error fetching rate cards:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchRateCards }), 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('RATE_CARD_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      vendorId,
      title,
      category,
      subcategory,
      scope,
      location,
      version = 'v1.0',
      validFrom,
      validTo,
      terms,
      notes,
      justification,
      comparisonNotes,
      items = [],
      status = 'DRAFT',
    } = body;

    if (!vendorId || !title || !category || !validFrom || !validTo) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsRoute.vendorIDTitleCategoryValidFromAndValidToAreRequired, 400);
    }

    const count = await prisma.vendorRateCard.count({ where: { tenantId: ctx.tenantId } });
    const rateCardNumber = `VRC-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const isSubmittingL1 = status === 'PENDING_PROJECT_APPROVAL';
    const isSendingToVendor = status === 'ROUND_1_BUYER_OFFER' || status === 'SENT_TO_VENDOR';
    const effectiveStatus = isSendingToVendor ? 'ROUND_1_BUYER_OFFER' : status;
    const now = new Date();

    const initialNegotiationNotes = {
      currentRound: 1,
      round1: {
        buyerOffer1Date: now.toISOString(),
        buyerOffer1Actor: ctx.userName || ctx.userEmail || 'Category Manager',
      },
    };

    const finalNotes = notes || JSON.stringify(initialNegotiationNotes);

    const rateCard = await prisma.vendorRateCard.create({
      data: {
        tenantId: ctx.tenantId,
        vendorId,
        rateCardNumber,
        title,
        category,
        subcategory: subcategory || null,
        scope: scope || null,
        location: location || 'All India',
        version: typeof version === 'number' ? version : parseInt(String(version).replace(/\D/g, '') || '1', 10),
        status: effectiveStatus,
        approvalLevel: isSubmittingL1 ? 'LEVEL_1_PROJECT' : null,
        submittedBy: (isSubmittingL1 || isSendingToVendor) ? (ctx.userName || ctx.userEmail || 'Category Manager') : null,
        submittedAt: (isSubmittingL1 || isSendingToVendor) ? now : null,
        validFrom: new Date(validFrom),
        validTo: new Date(validTo),
        currency: 'INR',
        terms: terms || null,
        notes: finalNotes,
        justification: justification || null,
        comparisonNotes: comparisonNotes || null,
        approvedBy: effectiveStatus === 'APPROVED' ? ctx.role : null,
        approvedAt: effectiveStatus === 'APPROVED' ? now : null,
        items: {
          create: items.map((it: any) => {
            const initialBuyerRate = Number(it.buyerOffer1 ?? it.rate ?? 0);
            const refQty =
              it.referenceQty !== undefined && it.referenceQty !== null && String(it.referenceQty).trim() !== '' && !isNaN(Number(it.referenceQty))
                ? Number(it.referenceQty)
                : it.qty !== undefined && it.qty !== null && String(it.qty).trim() !== '' && !isNaN(Number(it.qty))
                ? Number(it.qty)
                : it.minQuantity !== undefined && it.minQuantity !== null && String(it.minQuantity).trim() !== '' && !isNaN(Number(it.minQuantity))
                ? Number(it.minQuantity)
                : null;
            const compJson = JSON.stringify({
              buyerOffer1: initialBuyerRate,
              vendorQuote1: it.vendorQuote1 ? Number(it.vendorQuote1) : null,
              previousPpoRate: it.previousPpoRate ? Number(it.previousPpoRate) : (it.historicalRate ? Number(it.historicalRate) : null),
              referenceQty: refQty,
              remarks: it.remarks || '',
            });

            return {
              tenantId: ctx.tenantId,
              itemCode: it.itemCode || null,
              standardBoqItemId: it.standardBoqItemId || null,
              description: it.description,
              specification: it.specification || null,
              category: it.category || category,
              subcategory: it.subcategory || subcategory || null,
              uom: it.uom || 'Nos',
              rate: initialBuyerRate,
              proposedRate: it.proposedRate !== undefined ? Number(it.proposedRate) : initialBuyerRate,
              historicalRate: it.historicalRate !== undefined ? Number(it.historicalRate) : (it.previousPpoRate ? Number(it.previousPpoRate) : null),
              benchmarkRate: it.benchmarkRate !== undefined ? Number(it.benchmarkRate) : null,
              comparisonRef: compJson,
              minQuantity: refQty,
              maxQuantity: it.maxQuantity ? Number(it.maxQuantity) : null,
              location: it.location || location || 'All India',
              isActive: true,
            };
          }),
        },
      },
      include: {
        vendor: true,
        items: true,
        approvals: true,
      },
    });

    if (isSendingToVendor) {
      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          title: UI_STRINGS.appApiProcurementRateCardsRoute.newRateCardOfferReceived,
          message: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsRoute.buyerSubmittedBuyerRCOffer1ForRateCardRateCardNumberCategory, { "rateCardNumber": rateCardNumber, "category": category }),
          type: 'ACTION_REQUIRED',
          entityType: 'RATE_CARD',
          entityId: rateCard.id,
          recordNumber: rateCardNumber,
          targetRole: 'VENDOR',
          link: '/vendor-portal/rate-cards',
        },
      });
    }

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendorId,
      action: isSendingToVendor ? 'RATE_CARD_OFFER_1_SENT' : isSubmittingL1 ? 'RATE_CARD_SUBMITTED' : 'RATE_CARD_CREATED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsRoute.rateCardRateCardNumberVersionValue3ForVendorNameLengthItems, { "rateCardNumber": rateCardNumber, "version": version, "value3": isSendingToVendor ? 'sent to vendor (Buyer RC Offer-1)' : isSubmittingL1 ? 'submitted for Level 1 Project Approval' : 'created as draft', "name": rateCard.vendor.name, "length": items.length }),
      newValue: { rateCardNumber, title, status: effectiveStatus, version },
    });

    return apiSuccess({ rateCard }, 201);
  } catch (error: any) {
    console.error('Error creating rate card:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToCreateRateCard }), 500);
  }
}
