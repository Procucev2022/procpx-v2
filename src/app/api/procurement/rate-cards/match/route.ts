// src/app/api/procurement/rate-cards/match/route.ts
// Matches approved vendor rate cards against PR or RFQ line items and compares rates
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('RATE_CARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const prId = searchParams.get('prId');
  const rfqId = searchParams.get('rfqId');

  if (!prId && !rfqId) {
    return apiError(UI_STRINGS.appApiProcurementRateCardsMatchRoute.eitherPrIdOrRfqIdIsRequiredToMatchRateCards, 400);
  }

  try {
    // 1. Fetch lines to compare
    let lines: Array<{
      id: string;
      lineNumber: string;
      itemDescription: string;
      specification: string | null;
      category: string;
      subcategory: string | null;
      uom: string;
      quantity: number;
      aiUnitCost: number;
      aiTotalCost: number;
    }> = [];

    let referenceEntity: any = null;

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        include: {
          project: true,
          costCentre: true,
          lines: {
            include: { boqLine: true },
          },
        },
      });

      if (!pr) return apiError(UI_STRINGS.appApiProcurementRateCardsMatchRoute.procurementRequestNotFound, 404);
      referenceEntity = {
        type: 'PR',
        id: pr.id,
        number: pr.prNumber,
        title: pr.title,
        status: pr.status,
        project: pr.project,
        costCentre: pr.costCentre,
      };

      lines = pr.lines.map((l) => {
        const aiCost = l.boqLine?.aiUnitCost || l.estimatedRate || 100;
        const qty = l.quantity || 1;
        return {
          id: l.id,
          lineNumber: l.lineNumber,
          itemDescription: l.itemDescription,
          specification: l.specification || l.boqLine?.specification || null,
          category: l.category,
          subcategory: l.subcategory || null,
          uom: l.uom,
          quantity: qty,
          aiUnitCost: aiCost,
          aiTotalCost: qty * aiCost,
        };
      });
    } else if (rfqId) {
      const rfq = await prisma.rfq.findFirst({
        where: { id: rfqId, tenantId: ctx.tenantId },
        include: {
          project: true,
          lines: {
            include: { boqLine: true },
          },
        },
      });

      if (!rfq) return apiError(UI_STRINGS.common.rFQNotFound, 404);
      referenceEntity = {
        type: 'RFQ',
        id: rfq.id,
        number: rfq.rfqNumber,
        title: rfq.title,
        status: rfq.status,
        project: rfq.project,
      };

      lines = rfq.lines.map((l) => {
        const aiCost = l.boqLine?.aiUnitCost || l.benchmarkRate || 100;
        const qty = l.quantity || 1;
        return {
          id: l.id,
          lineNumber: l.lineNumber,
          itemDescription: l.description,
          specification: l.specification || l.boqLine?.specification || null,
          category: l.category || 'General',
          subcategory: l.subcategory || null,
          uom: l.uom,
          quantity: qty,
          aiUnitCost: aiCost,
          aiTotalCost: qty * aiCost,
        };
      });
    }

    if (lines.length === 0) {
      return apiSuccess({
        reference: referenceEntity,
        matchedRateCards: [],
        lines: [],
        message: UI_STRINGS.appApiProcurementRateCardsMatchRoute.noLineItemsAvailableToMatchAgainstRateCards,
      });
    }

    // 2. Fetch all rate cards for this tenant
    const rateCards = await prisma.vendorRateCard.findMany({
      where: { tenantId: ctx.tenantId },
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
      },
    });

    // 3. Fetch historical PPO lines for baseline price comparison
    const itemDescriptions = lines.map((l) => l.itemDescription.toLowerCase());
    const historicalPpoLines = await prisma.ppoLine.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['ISSUED', 'COMPLETED', 'PARTIALLY_COMPLETED'] },
      },
      select: {
        itemDescription: true,
        orderedUnitRate: true,
        orderedAmount: true,
        uom: true,
        orderDate: true,
        ppo: {
          select: {
            ppoNumber: true,
            vendor: { select: { name: true } },
          },
        },
      },
      orderBy: { orderDate: 'desc' },
      take: 100,
    });

    const historicalPpoMap = new Map<string, { rate: number; ppoNumber: string; vendor: string; date: string }>();
    for (const h of historicalPpoLines) {
      const key = h.itemDescription.toLowerCase().trim();
      if (!historicalPpoMap.has(key)) {
        historicalPpoMap.set(key, {
          rate: h.orderedUnitRate,
          ppoNumber: h.ppo.ppoNumber,
          vendor: h.ppo.vendor.name,
          date: h.orderDate.toISOString().split('T')[0],
        });
      }
    }

    const now = new Date();
    const baselineBenchmarkTotal = lines.reduce((acc, l) => acc + l.aiTotalCost, 0);

    // 4. For each rate card, evaluate line match and commercial outcome
    const evaluatedRateCards = rateCards.map((rc) => {
      const isDateValid = rc.validFrom <= now && rc.validTo >= now;
      const isStatusApproved = rc.status === 'APPROVED';
      const isVendorCompliant = rc.vendor.complianceStatus === 'COMPLIANT';

      let matchedItemsCount = 0;
      let totalRateCardValue = 0;
      const lineEvaluations: any[] = [];
      const mismatchReasons: string[] = [];

      for (const reqLine of lines) {
        const reqDesc = reqLine.itemDescription.toLowerCase().trim();
        // Look for matching rate card item by description, itemCode, or category match
        const matchingRcItem = rc.items.find((item) => {
          const itemDesc = item.description.toLowerCase().trim();
          return itemDesc.includes(reqDesc) || reqDesc.includes(itemDesc);
        });

        // Historical PPO comparison for this line
        const histPpo = historicalPpoMap.get(reqDesc) || null;

        if (matchingRcItem) {
          matchedItemsCount++;
          const lineRate = matchingRcItem.rate;
          const lineTotal = lineRate * reqLine.quantity;
          totalRateCardValue += lineTotal;
          const variance = reqLine.aiTotalCost - lineTotal;
          const variancePct = reqLine.aiTotalCost > 0 ? (variance / reqLine.aiTotalCost) * 100 : 0;

          // Check UOM mismatch
          let uomMismatch = false;
          if (matchingRcItem.uom.toUpperCase() !== reqLine.uom.toUpperCase()) {
            uomMismatch = true;
            mismatchReasons.push(`Line ${reqLine.lineNumber}: UOM mismatch (${reqLine.uom} required vs ${matchingRcItem.uom} on rate card)`);
          }

          lineEvaluations.push({
            reqLineId: reqLine.id,
            lineNumber: reqLine.lineNumber,
            description: reqLine.itemDescription,
            specification: reqLine.specification,
            uom: reqLine.uom,
            quantity: reqLine.quantity,
            aiUnitCost: reqLine.aiUnitCost,
            aiTotalCost: reqLine.aiTotalCost,
            rateCardRate: lineRate,
            rateCardTotal: lineTotal,
            uomMismatch,
            historicalPpoRate: histPpo?.rate || null,
            historicalPpoNumber: histPpo?.ppoNumber || null,
            historicalPpoDate: histPpo?.date || null,
            varianceVsAi: variance,
            variancePercent: Math.round(variancePct * 10) / 10,
            isMatch: true,
          });
        } else {
          mismatchReasons.push(`Line ${reqLine.lineNumber} (${reqLine.itemDescription}): Not covered in rate card`);
          lineEvaluations.push({
            reqLineId: reqLine.id,
            lineNumber: reqLine.lineNumber,
            description: reqLine.itemDescription,
            specification: reqLine.specification,
            uom: reqLine.uom,
            quantity: reqLine.quantity,
            aiUnitCost: reqLine.aiUnitCost,
            aiTotalCost: reqLine.aiTotalCost,
            rateCardRate: null,
            rateCardTotal: null,
            uomMismatch: false,
            historicalPpoRate: histPpo?.rate || null,
            historicalPpoNumber: histPpo?.ppoNumber || null,
            historicalPpoDate: histPpo?.date || null,
            varianceVsAi: null,
            variancePercent: null,
            isMatch: false,
          });
        }
      }

      const coveragePercent = Math.round((matchedItemsCount / lines.length) * 100);
      const isFullCoverage = matchedItemsCount === lines.length;
      const totalSavings = baselineBenchmarkTotal - totalRateCardValue;
      const savingsPercent = baselineBenchmarkTotal > 0 ? Math.round((totalSavings / baselineBenchmarkTotal) * 1000) / 10 : 0;

      // Validation flags for direct PPO creation eligibility
      const blockReasons: string[] = [];
      if (!isStatusApproved) blockReasons.push(`Rate card is in status '${rc.status}' (Must be APPROVED)`);
      if (!isDateValid) blockReasons.push(`Rate card validity expired or inactive (Valid: ${rc.validFrom.toISOString().split('T')[0]} to ${rc.validTo.toISOString().split('T')[0]})`);
      if (!isVendorCompliant) blockReasons.push(`Vendor compliance status is ${rc.vendor.complianceStatus}`);
      if (!isFullCoverage) blockReasons.push(`Partial item coverage: only ${matchedItemsCount}/${lines.length} items covered (${coveragePercent}%)`);
      if (mismatchReasons.length > 0) blockReasons.push(...mismatchReasons);

      const directPpoEligible = isStatusApproved && isDateValid && isVendorCompliant && isFullCoverage && mismatchReasons.length === 0;

      return {
        rateCardId: rc.id,
        rateCardNumber: rc.rateCardNumber,
        title: rc.title,
        category: rc.category,
        vendor: rc.vendor,
        status: rc.status,
        validFrom: rc.validFrom.toISOString().split('T')[0],
        validTo: rc.validTo.toISOString().split('T')[0],
        isCurrentlyValid: isDateValid,
        coveragePercent,
        matchedItemsCount,
        totalItemsCount: lines.length,
        isFullCoverage,
        baselineBenchmarkTotal,
        rateCardTotalValue: totalRateCardValue,
        totalSavings,
        savingsPercent,
        directPpoEligible,
        blockReasons,
        recommendedAction: directPpoEligible
          ? 'Eligible for Direct PPO creation under approved pre-negotiated corporate terms'
          : `Block direct PPO: ${blockReasons[0] || 'Scope mismatch'}. Route requirement to competitive RFQ.`,
        lines: lineEvaluations,
      };
    });

    // Sort: eligible ones first, then highest coverage, then lowest total value
    evaluatedRateCards.sort((a, b) => {
      if (a.directPpoEligible && !b.directPpoEligible) return -1;
      if (!a.directPpoEligible && b.directPpoEligible) return 1;
      if (b.coveragePercent !== a.coveragePercent) return b.coveragePercent - a.coveragePercent;
      return a.rateCardTotalValue - b.rateCardTotalValue;
    });

    return apiSuccess({
      reference: referenceEntity,
      baselineBenchmarkTotal,
      lines,
      matchedRateCards: evaluatedRateCards,
      eligibleCount: evaluatedRateCards.filter((r) => r.directPpoEligible).length,
    });
  } catch (error: any) {
    console.error('Error matching rate cards:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToMatchRateCards }), 500);
  }
}
