// src/app/api/procurement/rate-cards/direct-ppo/route.ts
// Direct PPO Generation from approved, applicable vendor rate cards
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(req: NextRequest) {
  const ctx = await requireAuth('PPO_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      rateCardId,
      prId,
      rfqId,
      deliveryTerms,
      paymentTerms,
      taxDetails,
      remarks,
    } = body;

    if (!rateCardId || (!prId && !rfqId)) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.rateCardIDAndEitherPrIdOrRfqIdAreRequired, 400);
    }

    // 1. Fetch and validate rate card
    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id: rateCardId, tenantId: ctx.tenantId },
      include: {
        vendor: true,
        items: true,
      },
    });

    if (!rateCard) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.vendorRateCardNotFoundOrAccessDenied, 404);
    }

    if (rateCard.status !== 'APPROVED') {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPORateCardIsInStatusStatusMustBeAPPROVED, { "status": rateCard.status }), 400);
    }

    const now = new Date();
    if (rateCard.validFrom > now || rateCard.validTo < now) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPORateCardIsExpiredOrNotYetValidValidityValue1ToValue2RouteRequirementToRegularRFQ, { "value1": rateCard.validFrom.toISOString().split('T')[0], "value2": rateCard.validTo.toISOString().split('T')[0] }),
        400
      );
    }

    if (rateCard.vendor.complianceStatus !== 'COMPLIANT') {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPOVendorComplianceStatusIsComplianceStatus, { "complianceStatus": rateCard.vendor.complianceStatus }), 400);
    }

    // 2. Load PR or RFQ and its lines
    let projectId: string;
    let costCentreId: string | null = null;
    let boqId: string | null = null;
    let boqRevisionId: string | null = null;
    let requirementTitle: string;
    let lines: Array<{
      id: string;
      lineNumber: string;
      description: string;
      specification: string | null;
      category: string;
      subcategory: string | null;
      uom: string;
      quantity: number;
      prLineId: string | null;
      rfqLineId: string | null;
      boqLineId: string | null;
    }> = [];

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        include: { lines: true, project: true, costCentre: true },
      });

      if (!pr) return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.approvedProcurementRequestNotFound, 404);
      if (!['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'].includes(pr.status)) {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPOPRIsInStatusStatusMustBeAPPROVEDOrRELEASED, { "status": pr.status }), 400);
      }

      // Check if duplicate PPO already exists for this PR
      const existingPpo = await prisma.ppo.findFirst({
        where: {
          tenantId: ctx.tenantId,
          prId,
          status: { not: 'CANCELLED' },
        },
      });

      if (existingPpo) {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.duplicatePPOPreventedPurchaseOrderPpoNumberAlreadyExistsForThisPR, { "ppoNumber": existingPpo.ppoNumber }), 409);
      }

      projectId = pr.projectId;
      costCentreId = pr.costCentreId;
      boqId = pr.boqId;
      boqRevisionId = pr.boqRevisionId;
      requirementTitle = pr.title;

      lines = pr.lines.map((l) => ({
        id: l.id,
        lineNumber: l.lineNumber,
        description: l.itemDescription,
        specification: l.specification,
        category: l.category,
        subcategory: l.subcategory,
        uom: l.uom,
        quantity: l.quantity,
        prLineId: l.id,
        rfqLineId: null,
        boqLineId: l.boqLineId,
      }));
    } else {
      const rfq = await prisma.rfq.findFirst({
        where: { id: rfqId, tenantId: ctx.tenantId },
        include: { lines: true, boqRevision: true },
      });

      if (!rfq) return apiError(UI_STRINGS.common.rFQNotFound, 404);

      projectId = rfq.projectId;
      costCentreId = (rfq.boqRevision as any)?.costCentreId || null;
      boqId = rfq.boqRevision?.boqId || null;
      boqRevisionId = rfq.boqRevisionId;
      requirementTitle = rfq.title;

      lines = rfq.lines.map((l) => ({
        id: l.id,
        lineNumber: l.lineNumber,
        description: l.description,
        specification: l.specification,
        category: l.category || 'General',
        subcategory: l.subcategory,
        uom: l.uom,
        quantity: l.quantity,
        prLineId: l.prLineId,
        rfqLineId: l.id,
        boqLineId: l.boqLineId,
      }));
    }

    if (lines.length === 0) {
      return apiError(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.requirementHasNoLinesToSource, 400);
    }

    // 3. Match each line against rate card items
    let totalOrderValue = 0;
    const ppoLinesData: any[] = [];
    const missingLines: string[] = [];

    for (const reqLine of lines) {
      const reqDesc = reqLine.description.toLowerCase().trim();
      const match = rateCard.items.find((it) => {
        const itDesc = it.description.toLowerCase().trim();
        return itDesc.includes(reqDesc) || reqDesc.includes(itDesc);
      });

      if (!match) {
        missingLines.push(reqLine.description);
      } else {
        const unitRate = match.rate;
        const lineTotal = unitRate * reqLine.quantity;
        totalOrderValue += lineTotal;

        ppoLinesData.push({
          tenantId: ctx.tenantId,
          projectId,
          costCentreId,
          boqId,
          boqRevisionId,
          boqLineId: reqLine.boqLineId,
          prLineId: reqLine.prLineId,
          rfqLineId: reqLine.rfqLineId,
          vendorId: rateCard.vendorId,
          lineNumber: `PO-${reqLine.lineNumber}`,
          itemDescription: reqLine.description,
          specification: reqLine.specification || match.specification,
          category: reqLine.category,
          subcategory: reqLine.subcategory,
          uom: reqLine.uom,
          orderedQuantity: reqLine.quantity,
          orderedUnitRate: unitRate,
          orderedAmount: lineTotal,
          totalOrderValue: lineTotal,
          status: 'ISSUED',
        });
      }
    }

    if (missingLines.length > 0) {
      return apiError(
        interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.cannotCreateDirectPPORateCardDoesNotCoverAllItemsLengthItemSMissingEGValue2RouteRequirementToCompetitiveRFQ, { "length": missingLines.length, "value2": missingLines[0] }),
        400
      );
    }

    // 4. Generate next PPO Number
    const count = await prisma.ppo.count({ where: { tenantId: ctx.tenantId } });
    const ppoNumber = `PPO-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    // 5. Create PPO directly from Rate Card
    const ppo = await prisma.ppo.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        costCentreId,
        boqId,
        boqRevisionId,
        rfqId: rfqId || null,
        prId: prId || null,
        rateCardId,
        sourcingType: 'DIRECT_RATE_CARD',
        vendorId: rateCard.vendorId,
        ppoNumber,
        title: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPPORateCardRateCardNumberRequirementTitle, { "rateCardNumber": rateCard.rateCardNumber, "requirementTitle": requirementTitle }),
        totalValue: totalOrderValue,
        currency: 'INR',
        status: 'ISSUED',
        deliveryTerms: deliveryTerms || rateCard.terms || 'Ex-site delivery within 30 days',
        paymentTerms: paymentTerms || rateCard.terms || 'Net 30 days from invoice',
        taxDetails: taxDetails || 'GST 18% as applicable',
        issuedAt: new Date(),
        createdById: ctx.userId,
        lines: {
          create: ppoLinesData,
        },
      },
      include: {
        project: true,
        vendor: true,
        rateCard: true,
        lines: true,
      },
    });

    // 6. If PR exists, record audit log
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId,
      entityType: 'PPO',
      entityId: ppo.id,
      action: 'PPO_CREATED_FROM_RATE_CARD',
      description: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPPOPpoNumberIssuedToNameUnderApprovedRateCardRateCardNumberTotalToLocaleString, { "ppoNumber": ppoNumber, "name": rateCard.vendor.name, "rateCardNumber": rateCard.rateCardNumber, "toLocaleString": totalOrderValue.toLocaleString() }),
      newValue: {
        ppoNumber,
        rateCardNumber: rateCard.rateCardNumber,
        vendorName: rateCard.vendor.name,
        totalValue: totalOrderValue,
        prId,
      },
    });

    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_CREATED',
      recordNumber: ppoNumber,
      entityId: ppo.id,
      actorName: ctx.userName,
      details: {
        vendorName: rateCard.vendor.name,
        amount: totalOrderValue,
      },
    });

    return apiSuccess({
      ppo,
      message: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsDirectPpoRoute.directPPOPpoNumberCreatedSuccessfullyFromApprovedRateCardRateCardNumber, { "ppoNumber": ppoNumber, "rateCardNumber": rateCard.rateCardNumber }),
    }, 201);
  } catch (error: any) {
    console.error('Error creating direct PPO from rate card:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToCreateDirectPpo }), 500);
  }
}
