// app/api/procurement/rfqs/[id]/compare/route.ts
// Comprehensive Line-Level and Package-Level Quote Comparison Matrix with AI Cost, Historical PPO, and Rate Card Baselines
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL } from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import {
  RFQ_COMPARE_LINE_PAGE_SIZE,
  RFQ_COMPARE_FALLBACK_MATCH_CHUNK_SIZE,
  RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT,
  RFQ_COMPARE_RATE_CARD_DESCRIPTION_CHUNK_SIZE,
  RFQ_COMPARE_STATUS_UPDATE_SQL,
} from './route.constants';
import type {
  RfqCompareFallbackBoqLine,
  RfqCompareRateCardRow,
  RfqLatestCompareNegotiationRoundRow,
  RfqLatestCompareQuoteRow,
} from '@app-types/app/api/procurement/rfqs/compare.types';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const ctx = await requireAuth('QUOTE_COMPARE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        project: { select: { id: true, name: true, projectCode: true } },
        boqRevision: {
          select: {
            id: true,
            revisionCode: true,
          },
        },
        pr: {
          select: {
            id: true,
            prNumber: true,
            title: true,
            status: true,
            costCentre: { select: { id: true, code: true, name: true } },
          },
        },
        negotiations: {
          select: {
            id: true,
            status: true,
            currentRound: true,
          },
        },
        awards: {
          select: {
            id: true, recommendedVendorId: true, originalQuoteAmount: true, finalNegotiatedAmount: true,
            benchmarkAmount: true, totalSavingsAmount: true, savingsPercent: true, justification: true,
            status: true, submittedAt: true, approvedAt: true, approvalRemarks: true,
            recommendedVendor: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/rfqs/[id]/compare', method: 'GET' });
    }

    const lineWhere = { tenantId: ctx.tenantId, rfqId: id };
    const totalLineCount = await prisma.rfqLine.count({ where: lineWhere });
    const totalLinePages = Math.max(1, Math.ceil(totalLineCount / RFQ_COMPARE_LINE_PAGE_SIZE));
    const requestedLinePage = Number(req.nextUrl.searchParams.get('page'));
    const linePage = Number.isSafeInteger(requestedLinePage) && requestedLinePage > 0
      ? Math.min(requestedLinePage, totalLinePages)
      : 1;
    const linePageOffset = (linePage - 1) * RFQ_COMPARE_LINE_PAGE_SIZE;
    const comparisonSourceLines = await prisma.rfqLine.findMany({
      where: lineWhere,
      skip: linePageOffset,
      take: RFQ_COMPARE_LINE_PAGE_SIZE,
      select: {
        id: true,
        lineNumber: true,
        description: true,
        specification: true,
        category: true,
        subcategory: true,
        uom: true,
        quantity: true,
        benchmarkRate: true,
        boqLineId: true,
        boqLine: {
          select: {
            id: true, itemCode: true, standardDescription: true, originalDescription: true, specification: true,
            category: { select: { name: true } }, subcategory: { select: { name: true } }, uom: { select: { code: true } },
            costSource: true, costDate: true, aiUnitCost: true, location: true, drawingReference: true,
            brand: true, model: true, material: true, grade: true, remarks: true,
          },
        },
        prLine: {
          select: {
            estimatedRate: true,
            boqLine: {
              select: {
                id: true, itemCode: true, standardDescription: true, originalDescription: true, specification: true,
                category: { select: { name: true } }, subcategory: { select: { name: true } }, uom: { select: { code: true } },
                costSource: true, costDate: true, aiUnitCost: true, location: true, drawingReference: true,
                brand: true, model: true, material: true, grade: true, remarks: true,
              },
            },
          },
        },
      },
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
    });
    const comparisonLineIds = comparisonSourceLines.length > 0
      ? comparisonSourceLines.map((line) => line.id)
      : ['__empty_rfq_comparison_page__'];

    const needsRevisionBoqFallback = comparisonSourceLines.some((line) => !line.boqLine && !line.prLine?.boqLine);
    const fallbackSourceLines = rfq.boqRevision?.id && needsRevisionBoqFallback
      ? comparisonSourceLines.filter((line) => !line.boqLine && !line.prLine?.boqLine)
      : [];
    const fallbackBoqLineById = new Map<string, RfqCompareFallbackBoqLine>();
    for (let offset = 0; offset < fallbackSourceLines.length; offset += RFQ_COMPARE_FALLBACK_MATCH_CHUNK_SIZE) {
      const fallbackChunk = fallbackSourceLines.slice(offset, offset + RFQ_COMPARE_FALLBACK_MATCH_CHUNK_SIZE);
      const ids = [...new Set(fallbackChunk.map((line) => line.boqLineId).filter((value): value is string => Boolean(value)))];
      const lineNumbers = [...new Set(fallbackChunk.flatMap((line) => [
        line.lineNumber,
        String(line.lineNumber).replace(/^RFQ-L|^PR-L|^L-/, ''),
      ]))];
      const descriptions = [...new Set(fallbackChunk.map((line) => line.description.trim()).filter(Boolean))];
      const candidateFilters: Prisma.BoqLineWhereInput[] = [];
      if (ids.length > 0) candidateFilters.push({ id: { in: ids } });
      if (lineNumbers.length > 0) candidateFilters.push({ lineNumber: { in: lineNumbers } });
      for (const description of descriptions) {
        candidateFilters.push({ standardDescription: { contains: description } });
        candidateFilters.push({ originalDescription: { contains: description } });
      }
      const fallbackCandidates = await prisma.boqLine.findMany({
        where: {
          tenantId: ctx.tenantId,
          boqRevisionId: rfq.boqRevision?.id,
          OR: candidateFilters,
        },
        select: {
          id: true,
          lineNumber: true,
          itemCode: true,
          standardDescription: true,
          originalDescription: true,
          specification: true,
          category: { select: { name: true } },
          subcategory: { select: { name: true } },
          uom: { select: { code: true } },
          costSource: true,
          costDate: true,
          aiUnitCost: true,
          location: true,
          drawingReference: true,
          brand: true,
          model: true,
          material: true,
          grade: true,
          remarks: true,
        },
        orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        take: RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT + 1,
      });
      if (fallbackCandidates.length > RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT) {
        await writeStructuredLog('warn', 'procurement.rfq_compare_fallback_candidates_exceeded', {
          operation: 'compare_rfq_quotes', route: '/api/procurement/rfqs/[id]/compare',
          requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
          rfqId: rfq.id, revisionId: rfq.boqRevision?.id, linePage,
          candidateCountAtLeast: fallbackCandidates.length, maxCandidates: RFQ_COMPARE_FALLBACK_BOQ_CANDIDATE_LIMIT,
        });
        return apiError(UI_STRINGS.common.userMessages.failedToCompareQuotes, 500);
      }
      for (const fallbackCandidate of fallbackCandidates) fallbackBoqLineById.set(fallbackCandidate.id, fallbackCandidate);
    }
    const fallbackBoqLines = [...fallbackBoqLineById.values()];

    // 1. Read only each vendor's latest quote and its line rows; version history is not used by this screen.
    const latestQuoteRows = await prisma.$queryRaw<RfqLatestCompareQuoteRow[]>(Prisma.sql`
      WITH latest_quotes AS (
        SELECT quote."tenantId", quote."rfqId", quote."vendorId",
          COUNT(*) AS "versionCount", MAX(quote."quoteVersion") AS "latestVersion"
        FROM "quotes" AS quote
        WHERE quote."tenantId" = ${ctx.tenantId} AND quote."rfqId" = ${id}
        GROUP BY quote."tenantId", quote."rfqId", quote."vendorId"
      ), latest_quote_line_summaries AS (
        SELECT latest."tenantId", latest."id" AS "quoteId",
          COUNT(DISTINCT CASE WHEN quoteLine."unitRate" > 0 THEN quoteLine."rfqLineId" END) AS "quotedCount"
        FROM latest_quotes AS summary
        INNER JOIN "quotes" AS latest
          ON latest."tenantId" = summary."tenantId" AND latest."rfqId" = summary."rfqId"
            AND latest."vendorId" = summary."vendorId" AND latest."quoteVersion" = summary."latestVersion"
        LEFT JOIN "quote_lines" AS quoteLine
          ON quoteLine."tenantId" = latest."tenantId" AND quoteLine."quoteId" = latest."id"
        GROUP BY latest."tenantId", latest."id"
      )
      SELECT latest."id" AS "quoteId", latest."vendorId", latest."quoteNumber", latest."quoteVersion",
        summary."versionCount", COALESCE(lineSummary."quotedCount", 0) AS "quotedCount",
        latest."totalQuoteAmount", latest."submittedAt", latest."status",
        latest."commercialTerms", latest."paymentTermsOffered", latest."deliveryLeadTimeDays",
        vendor."name" AS "vendorName", vendor."code" AS "vendorCode", vendor."vendorType",
        vendor."qualificationStatus", vendor."complianceStatus", vendor."performanceScore",
        quoteLine."id" AS "quoteLineId", quoteLine."rfqLineId", quoteLine."unitRate", quoteLine."lineTotal",
        quoteLine."discountPercent", quoteLine."taxPercent"
      FROM latest_quotes AS summary
      INNER JOIN "quotes" AS latest
        ON latest."tenantId" = summary."tenantId" AND latest."rfqId" = summary."rfqId"
          AND latest."vendorId" = summary."vendorId" AND latest."quoteVersion" = summary."latestVersion"
      LEFT JOIN "vendors" AS vendor
        ON vendor."id" = latest."vendorId" AND vendor."tenantId" = latest."tenantId"
      LEFT JOIN latest_quote_line_summaries AS lineSummary
        ON lineSummary."tenantId" = latest."tenantId" AND lineSummary."quoteId" = latest."id"
      LEFT JOIN "quote_lines" AS quoteLine
        ON quoteLine."quoteId" = latest."id" AND quoteLine."tenantId" = latest."tenantId"
          AND quoteLine."rfqLineId" IN (${Prisma.join(comparisonLineIds)})
    `);
    const latestQuotesById = new Map<string, {
      id: string;
      vendorId: string;
      quoteNumber: string;
      quoteVersion: number;
      versionCount: number;
      quotedCount: number;
      totalQuoteAmount: number;
      submittedAt: string | Date;
      status: string;
      commercialTerms: string | null;
      paymentTermsOffered: string | null;
      deliveryLeadTimeDays: number | null;
      vendor: {
        id: string;
        name: string;
        code: string;
        vendorType: string | null;
        qualificationStatus: string | null;
        complianceStatus: string | null;
        performanceScore: number | null;
      };
      lines: Array<{
        id: string;
        rfqLineId: string;
        unitRate: number;
        lineTotal: number;
        discountPercent: number;
        taxPercent: number;
      }>;
    }>();
    for (const row of latestQuoteRows) {
      let quote = latestQuotesById.get(row.quoteId);
      if (!quote) {
        quote = {
          id: row.quoteId,
          vendorId: row.vendorId,
          quoteNumber: row.quoteNumber,
          quoteVersion: Number(row.quoteVersion),
          versionCount: Number(row.versionCount),
          quotedCount: Number(row.quotedCount || 0),
          totalQuoteAmount: Number(row.totalQuoteAmount),
          submittedAt: row.submittedAt,
          status: row.status,
          commercialTerms: row.commercialTerms,
          paymentTermsOffered: row.paymentTermsOffered,
          deliveryLeadTimeDays: row.deliveryLeadTimeDays,
          vendor: {
            id: row.vendorId,
            name: row.vendorName || '',
            code: row.vendorCode || '',
            vendorType: row.vendorType,
            qualificationStatus: row.qualificationStatus,
            complianceStatus: row.complianceStatus,
            performanceScore: row.performanceScore,
          },
          lines: [],
        };
        latestQuotesById.set(row.quoteId, quote);
      }
      if (row.quoteLineId && row.rfqLineId) {
        quote.lines.push({
          id: row.quoteLineId,
          rfqLineId: row.rfqLineId,
          unitRate: Number(row.unitRate || 0),
          lineTotal: Number(row.lineTotal || 0),
          discountPercent: Number(row.discountPercent || 0),
          taxPercent: Number(row.taxPercent || 0),
        });
      }
    }
    const evaluatedQuotes = [...latestQuotesById.values()];

    const latestNegotiationRoundRows = rfq.negotiations.length > 0
      ? await prisma.$queryRaw<RfqLatestCompareNegotiationRoundRow[]>(Prisma.sql`
        WITH negotiation_round_summaries AS (
          SELECT rounds."tenantId", rounds."negotiationId", rounds."vendorId",
            MAX(rounds."roundNumber") AS "latestRoundNumber",
            COUNT(*) AS "totalRoundCount",
            SUM(CASE WHEN rounds."status" <> 'SUPERSEDED' AND (
              rounds."counterOfferAmount" IS NOT NULL OR
              (rounds."revisedQuoteAmount" IS NULL AND rounds."nextResponsibleParty" = 'VENDOR')
            ) THEN 1 ELSE 0 END) AS "activeBuyerOfferCount"
          FROM "negotiation_rounds" AS rounds
          INNER JOIN "negotiations" AS negotiation
            ON negotiation."id" = rounds."negotiationId" AND negotiation."tenantId" = rounds."tenantId"
          WHERE rounds."tenantId" = ${ctx.tenantId} AND negotiation."rfqId" = ${id}
          GROUP BY rounds."tenantId", rounds."negotiationId", rounds."vendorId"
        )
        SELECT rounds."vendorId", rounds."roundNumber", rounds."lineItemsJson", rounds."counterOfferAmount",
          rounds."revisedQuoteAmount", rounds."status", rounds."nextResponsibleParty", rounds."buyerDecision",
          summary."totalRoundCount", summary."activeBuyerOfferCount",
          submitted."id" AS "submittedRoundId", submitted."roundNumber" AS "submittedRoundNumber",
          submitted."revisedQuoteAmount" AS "submittedRevisedQuoteAmount", submitted."status" AS "submittedStatus",
          submitted."nextResponsibleParty" AS "submittedNextResponsibleParty", submitted."buyerDecision" AS "submittedBuyerDecision",
          pending."id" AS "pendingRoundId", pending."roundNumber" AS "pendingRoundNumber",
          pending."counterOfferAmount" AS "pendingCounterOfferAmount", pending."revisedQuoteAmount" AS "pendingRevisedQuoteAmount",
          pending."status" AS "pendingStatus", pending."nextResponsibleParty" AS "pendingNextResponsibleParty",
          pending."buyerDecision" AS "pendingBuyerDecision"
        FROM negotiation_round_summaries AS summary
        INNER JOIN "negotiation_rounds" AS rounds
          ON rounds."tenantId" = summary."tenantId" AND rounds."negotiationId" = summary."negotiationId"
            AND rounds."vendorId" = summary."vendorId" AND rounds."roundNumber" = summary."latestRoundNumber"
        LEFT JOIN "negotiation_rounds" AS submitted
          ON submitted."id" = (
            SELECT candidate."id" FROM "negotiation_rounds" AS candidate
            WHERE candidate."tenantId" = summary."tenantId" AND candidate."negotiationId" = summary."negotiationId"
              AND candidate."vendorId" = summary."vendorId" AND candidate."revisedQuoteAmount" > 0
              AND candidate."status" IN ('REVISED_SUBMITTED', 'FINAL_OFFER_SUBMITTED')
              AND (candidate."nextResponsibleParty" = 'BUYER' OR candidate."buyerDecision" IS NOT NULL)
            ORDER BY candidate."roundNumber" DESC LIMIT 1
          )
        LEFT JOIN "negotiation_rounds" AS pending
          ON pending."id" = (
            SELECT candidate."id" FROM "negotiation_rounds" AS candidate
            WHERE candidate."tenantId" = summary."tenantId" AND candidate."negotiationId" = summary."negotiationId"
              AND candidate."vendorId" = summary."vendorId" AND candidate."status" <> 'SUPERSEDED'
              AND candidate."counterOfferAmount" > 0
              AND (candidate."revisedQuoteAmount" IS NULL OR candidate."revisedQuoteAmount" = 0
                OR candidate."nextResponsibleParty" = 'VENDOR')
            ORDER BY candidate."roundNumber" DESC LIMIT 1
          )
        ORDER BY rounds."vendorId" ASC
      `)
      : [];
    const latestNegotiationRoundByVendor = new Map(
      latestNegotiationRoundRows.map((round) => [round.vendorId, round])
    );
    const negotiationSummaries = latestNegotiationRoundRows.map((round) => ({
      vendorId: round.vendorId,
      totalRoundCount: Number(round.totalRoundCount),
      activeBuyerOfferCount: Number(round.activeBuyerOfferCount),
      submittedRevisionRound: round.submittedRoundId ? {
        id: round.submittedRoundId,
        roundNumber: round.submittedRoundNumber,
        revisedQuoteAmount: round.submittedRevisedQuoteAmount,
        status: round.submittedStatus,
        nextResponsibleParty: round.submittedNextResponsibleParty,
        buyerDecision: round.submittedBuyerDecision,
      } : null,
      pendingBuyerOffer: round.pendingRoundId ? {
        id: round.pendingRoundId,
        roundNumber: round.pendingRoundNumber,
        counterOfferAmount: round.pendingCounterOfferAmount,
        revisedQuoteAmount: round.pendingRevisedQuoteAmount,
        status: round.pendingStatus,
        nextResponsibleParty: round.pendingNextResponsibleParty,
        buyerDecision: round.pendingBuyerDecision,
      } : null,
    }));

    // 2. Fetch historical PPO lines for baseline price comparison
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
          ppoNumber: h.ppo?.ppoNumber || 'PPO',
          vendor: h.ppo?.vendor?.name || 'Vendor',
          date: h.orderDate.toISOString().split('T')[0],
        });
      }
    }

    // 3. Fetch active approved rate cards in the tenant
    const now = new Date();
    const rateCardDescriptions = [...new Set(comparisonSourceLines.map((line) => line.description.toLowerCase().trim()).filter(Boolean))];
    const descriptionChunks: string[][] = [];
    for (let offset = 0; offset < rateCardDescriptions.length; offset += RFQ_COMPARE_RATE_CARD_DESCRIPTION_CHUNK_SIZE) {
      descriptionChunks.push(rateCardDescriptions.slice(offset, offset + RFQ_COMPARE_RATE_CARD_DESCRIPTION_CHUNK_SIZE));
    }
    const [approvedRateCardsCount, rateCardRowsByChunk] = await Promise.all([
      prisma.vendorRateCard.count({
        where: { tenantId: ctx.tenantId, status: 'APPROVED', validFrom: { lte: now }, validTo: { gte: now } },
      }),
      Promise.all(descriptionChunks.map((descriptions) => prisma.$queryRaw<RfqCompareRateCardRow[]>(Prisma.sql`
        SELECT item."description" AS "description", item."rate" AS "rate",
          card."rateCardNumber" AS "rateCardNumber", card."version" AS "version", card."status" AS "status",
          card."validFrom" AS "validFrom", card."validTo" AS "validTo", card."vendorId" AS "vendorId",
          vendor."name" AS "vendorName"
        FROM "vendor_rate_card_items" item
        INNER JOIN "vendor_rate_cards" card ON card."id" = item."rateCardId" AND card."tenantId" = item."tenantId"
        INNER JOIN "vendors" vendor ON vendor."id" = card."vendorId" AND vendor."tenantId" = card."tenantId"
        WHERE item."tenantId" = ${ctx.tenantId} AND item."isActive" = 1
          AND card."status" = 'APPROVED' AND card."validFrom" <= ${now} AND card."validTo" >= ${now}
          AND lower(trim(item."description")) IN (${Prisma.join(descriptions)})
        ORDER BY card."vendorId" ASC, lower(trim(item."description")) ASC,
          card."version" DESC, card."validFrom" DESC, card."updatedAt" DESC, card."id" DESC, item."id" ASC
      `))),
    ]);
    const approvedRateCards = rateCardRowsByChunk.flat();

    const rateCardItemsMap = new Map<string, { rate: number; rateCardNumber: string; vendorName: string; validTo: string }>();
    const vendorRateCardMap = new Map<string, { rate: number; rateCardNumber: string; version: string; validity: string; status: string }>();
    for (const item of approvedRateCards) {
      const key = item.description.toLowerCase().trim();
      const validFrom = new Date(item.validFrom);
      const validTo = new Date(item.validTo);
      if (!rateCardItemsMap.has(key)) {
        rateCardItemsMap.set(key, {
          rate: item.rate,
          rateCardNumber: item.rateCardNumber,
          vendorName: item.vendorName,
          validTo: validTo.toISOString().split('T')[0],
        });
      }
      const vendorKey = `${item.vendorId}___${key}`;
      if (!vendorRateCardMap.has(vendorKey)) {
        vendorRateCardMap.set(vendorKey, {
          rate: item.rate,
          rateCardNumber: item.rateCardNumber,
          version: `v${item.version}.0`,
          validity: `${validFrom.toISOString().split('T')[0]} to ${validTo.toISOString().split('T')[0]}`,
          status: item.status,
        });
      }
    }

    // 4. Vendors participating in comparison
    const vendors = evaluatedQuotes.map((q) => {
      const totalRfqLines = totalLineCount;
      const quotedCount = q.quotedCount;
      const completenessPercent = totalRfqLines > 0 ? Math.round((quotedCount / totalRfqLines) * 100) : 0;
      const missingLineCount = totalRfqLines - quotedCount;

      return {
        vendorId: q.vendor.id,
        vendorName: q.vendor.name,
        vendorCode: q.vendor.code,
        vendorType: q.vendor.vendorType || 'CLIENT_VENDOR',
        qualificationStatus: q.vendor.qualificationStatus || 'NOT_EVALUATED',
        complianceStatus: q.vendor.complianceStatus,
        performanceScore: q.vendor.performanceScore,
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        quoteVersion: q.quoteVersion,
        versionCount: q.versionCount,
        totalQuoteAmount: q.totalQuoteAmount,
        commercialTerms: q.commercialTerms,
        paymentTermsOffered: q.paymentTermsOffered,
        deliveryLeadTimeDays: q.deliveryLeadTimeDays,
        submittedAt: q.submittedAt,
        completenessPercent,
        quotedCount,
        missingLineCount,
        isComplete: missingLineCount === 0,
      };
    });

    // 5. Line-level comparison matrix
    const benchmarkTotals = await prisma.$queryRaw<Array<{ totalAiBenchmark: number | string }>>(Prisma.sql`
      SELECT COALESCE(SUM(
        COALESCE(NULLIF(boqLine."aiUnitCost", 0), NULLIF(rfqLine."benchmarkRate", 0), NULLIF(prLine."estimatedRate", 0))
        * rfqLine."quantity"
      ), 0) AS "totalAiBenchmark"
      FROM "rfq_lines" AS rfqLine
      LEFT JOIN "boq_lines" AS boqLine
        ON boqLine."id" = rfqLine."boqLineId" AND boqLine."tenantId" = rfqLine."tenantId"
      LEFT JOIN "pr_lines" AS prLine
        ON prLine."id" = rfqLine."prLineId" AND prLine."tenantId" = rfqLine."tenantId"
      WHERE rfqLine."tenantId" = ${ctx.tenantId} AND rfqLine."rfqId" = ${id}
    `);
    const totalAiBenchmark = Number(benchmarkTotals[0]?.totalAiBenchmark || 0);
    const invalidNegotiationRounds = new Set<string>();

    const lineComparison = comparisonSourceLines.map((rfqLine) => {
      // AI Estimated Unit Cost
      const aiCost = rfqLine.boqLine?.aiUnitCost || rfqLine.benchmarkRate || rfqLine.prLine?.estimatedRate || null;
      const aiTotal = aiCost !== null ? aiCost * rfqLine.quantity : null;
      const aiSource = rfqLine.boqLine?.costSource || (aiCost ? 'AI Costing Engine / Baseline Benchmark' : null);
      const aiDate = rfqLine.boqLine?.costDate ? rfqLine.boqLine.costDate.toISOString().split('T')[0] : null;

      // Historical PPO comparison
      const reqDesc = rfqLine.description.toLowerCase().trim();
      const histPpo = historicalPpoMap.get(reqDesc) || null;

      // Rate Card comparison (General)
      const rcItem = rateCardItemsMap.get(reqDesc) || null;

      const vendorQuotes: Record<string, any> = {};
      let lowestRate = Infinity;
      let lowestVendorId = '';
      let lowestVendorName = '';

      for (const q of evaluatedQuotes) {
        const matchingLine = q.lines.find((ql) => ql.rfqLineId === rfqLine.id);
        const rate = matchingLine ? matchingLine.unitRate : 0;
        const amount = matchingLine ? matchingLine.lineTotal : rate * rfqLine.quantity;
        const quoted = rate > 0;

        const varianceVsAi = (aiCost !== null && rate > 0) ? (aiCost - rate) * rfqLine.quantity : null;

        // Vendor-specific Rate Card
        const vendorRc = vendorRateCardMap.get(`${q.vendorId}___${reqDesc}`);

        const latestRound = latestNegotiationRoundByVendor.get(q.vendorId);

        // 3. Our Offer Rate (persisted buyer counteroffer for this line/round)
        let ourOfferRate: number | null = null;
        if (latestRound?.lineItemsJson) {
          try {
            const items = typeof latestRound.lineItemsJson === 'string' ? JSON.parse(latestRound.lineItemsJson) : latestRound.lineItemsJson;
            if (Array.isArray(items)) {
              const matchItem = items.find((it: any) => (it.rfqLineId || it.id) === rfqLine.id);
              if (matchItem?.counterRate !== undefined && matchItem?.counterRate !== null) {
                ourOfferRate = Number(matchItem.counterRate);
              }
            } else {
              invalidNegotiationRounds.add(`${q.vendorId}:${latestRound.roundNumber || 1}`);
            }
          } catch {
            invalidNegotiationRounds.add(`${q.vendorId}:${latestRound.roundNumber || 1}`);
          }
        }
        if (ourOfferRate === null && latestRound?.counterOfferAmount && q.totalQuoteAmount > 0) {
          ourOfferRate = Math.round(rate * (latestRound.counterOfferAmount / q.totalQuoteAmount));
        }

        // 4. Final negotiated RFQ rate - must only reflect a genuine submitted vendor revision
        let finalNegotiatedRate: number | null = null;
        const isRevisionSubmitted = Boolean(
          latestRound &&
          latestRound.revisedQuoteAmount !== null &&
          latestRound.revisedQuoteAmount > 0 &&
          (latestRound.status === 'REVISED_SUBMITTED' || latestRound.status === 'FINAL_OFFER_SUBMITTED') &&
          (latestRound.nextResponsibleParty === 'BUYER' || latestRound.buyerDecision !== null)
        );

        if (isRevisionSubmitted && latestRound) {
          if (latestRound.lineItemsJson) {
            try {
              const items = typeof latestRound.lineItemsJson === 'string' ? JSON.parse(latestRound.lineItemsJson) : latestRound.lineItemsJson;
              if (Array.isArray(items)) {
                const matchItem = items.find((it: any) => (it.rfqLineId || it.id) === rfqLine.id);
                if (matchItem?.revisedRate !== undefined && matchItem?.revisedRate !== null) {
                  finalNegotiatedRate = Number(matchItem.revisedRate);
                }
            } else {
              invalidNegotiationRounds.add(`${q.vendorId}:${latestRound.roundNumber || 1}`);
            }
            } catch {
              invalidNegotiationRounds.add(`${q.vendorId}:${latestRound.roundNumber || 1}`);
            }
          }
          if (finalNegotiatedRate === null && latestRound.revisedQuoteAmount && q.totalQuoteAmount > 0) {
            finalNegotiatedRate = Math.round(rate * (latestRound.revisedQuoteAmount / q.totalQuoteAmount));
          }
        }

        vendorQuotes[q.vendorId] = {
          rate, // 2. Vendor's current RFQ quoted unit price
          amount,
          discount: matchingLine?.discountPercent || 0,
          tax: matchingLine?.taxPercent || 18,
          quoted,
          varianceVsAi,
          // 1. Applicable approved Rate Card unit price for this vendor
          vendorRateCardRate: vendorRc?.rate || null,
          vendorRateCardNumber: vendorRc?.rateCardNumber || null,
          vendorRateCardVersion: vendorRc?.version || null,
          vendorRateCardValidity: vendorRc?.validity || null,
          // 3. Our Offer Rate
          ourOfferRate,
          // 4. Final negotiated RFQ rate
          finalNegotiatedRate,
        };

        if (quoted) {
          if (rate < lowestRate) {
            lowestRate = rate;
            lowestVendorId = q.vendorId;
            lowestVendorName = q.vendor.name;
          }
        }
      }

      const varianceVsAi = (aiCost !== null && lowestRate !== Infinity) ? (aiCost * rfqLine.quantity) - (lowestRate * rfqLine.quantity) : 0;
      const variancePercent = (aiTotal && aiTotal > 0 && lowestRate !== Infinity) ? (varianceVsAi / aiTotal) * 100 : 0;

      const sourceBoq =
        rfqLine.boqLine ||
        rfqLine.prLine?.boqLine ||
        fallbackBoqLines.find((b) =>
          b.id === rfqLine.boqLineId ||
          b.lineNumber === rfqLine.lineNumber ||
          b.lineNumber === String(rfqLine.lineNumber).replace(/^RFQ-L|^PR-L|^L-/, '') ||
          (b.standardDescription && b.standardDescription.toLowerCase() === (rfqLine.description || '').toLowerCase()) ||
          (b.originalDescription && b.originalDescription.toLowerCase() === (rfqLine.description || '').toLowerCase())
        );

      const itemCode = sourceBoq?.itemCode || null;
      const itemDescription = rfqLine.description || sourceBoq?.standardDescription || sourceBoq?.originalDescription || 'Line item';
      
      // BOQ Description: The source BOQ-specific description.
      // Do not copy Item Description into BOQ Description. If blank or identical to itemDescription, show null ("—").
      const rawBoqDesc = (sourceBoq?.originalDescription && sourceBoq.originalDescription.trim() !== itemDescription.trim())
        ? sourceBoq.originalDescription.trim()
        : null;
      const boqDescription = (rawBoqDesc && rawBoqDesc.trim() !== '') ? rawBoqDesc.trim() : null;

      return {
        id: rfqLine.id,
        lineNumber: rfqLine.lineNumber,
        itemCode,
        description: rfqLine.description,
        itemDescription,
        boqDescription,
        fullBoqDescription: sourceBoq?.originalDescription || null,
        specification: rfqLine.specification || sourceBoq?.specification || null,
        category: (sourceBoq as any)?.category?.name || rfqLine.category || 'General',
        subcategory: (sourceBoq as any)?.subcategory?.name || rfqLine.subcategory || null,
        location: (sourceBoq as any)?.location || null,
        drawingReference: (sourceBoq as any)?.drawingReference || null,
        brand: (sourceBoq as any)?.brand || null,
        model: (sourceBoq as any)?.model || null,
        material: (sourceBoq as any)?.material || null,
        grade: (sourceBoq as any)?.grade || null,
        remarks: (sourceBoq as any)?.remarks || null,
        uom: rfqLine.uom,
        quantity: rfqLine.quantity,
        aiUnitCost: aiCost,
        aiTotalCost: aiTotal,
        aiCostStatus: aiCost !== null ? 'AVAILABLE' : 'NOT_AVAILABLE',
        aiCostSource: aiSource,
        aiCostDate: aiDate,
        historicalPpoRate: histPpo?.rate || null,
        historicalPpoNumber: histPpo?.ppoNumber || null,
        historicalPpoVendor: histPpo?.vendor || null,
        historicalPpoDate: histPpo?.date || null,
        rateCardRate: rcItem?.rate || null,
        rateCardNumber: rcItem?.rateCardNumber || null,
        rateCardVendor: rcItem?.vendorName || null,
        rateCardValidity: rcItem?.validTo || null,
        vendorQuotes,
        lowestCompliantVendorId: lowestRate !== Infinity ? lowestVendorId : null,
        lowestCompliantVendorName: lowestRate !== Infinity ? lowestVendorName : '—',
        lowestRate: lowestRate === Infinity ? 0 : lowestRate,
        lowestLineTotal: lowestRate === Infinity ? 0 : lowestRate * rfqLine.quantity,
        varianceVsAi,
        variancePercent: Math.round(variancePercent * 10) / 10,
        commercialStatus: varianceVsAi >= 0 ? 'FAVORABLE' : 'UNFAVORABLE',
      };
    });

    // 6. Package-level comparison & dynamic rankings with tie handling
    const comparableVendors = vendors.filter((v) => v.isComplete && v.totalQuoteAmount > 0);
    const nonComparableVendors = vendors.filter((v) => !v.isComplete || v.totalQuoteAmount <= 0);

    comparableVendors.sort((a, b) => a.totalQuoteAmount - b.totalQuoteAmount);

    // Dynamic ranking with proper tie handling (e.g. 1, 1, 3)
    let currentRank = 1;
    const rankedComparableVendors = comparableVendors.map((v, idx) => {
      if (idx > 0 && v.totalQuoteAmount > comparableVendors[idx - 1].totalQuoteAmount) {
        currentRank = idx + 1;
      }
      return {
        ...v,
        rank: currentRank,
        rankLabel: `L${currentRank}`,
        isRankable: true,
      };
    });

    const unrankedVendors = nonComparableVendors.map((v) => ({
      ...v,
      rank: null,
      rankLabel: 'Partially Quoted / Incomplete',
      isRankable: false,
    }));

    const allRankedVendors = [...rankedComparableVendors, ...unrankedVendors];
    const lowestQuote = rankedComparableVendors[0] || null;
    const lowestQuoteTotal = lowestQuote ? lowestQuote.totalQuoteAmount : 0;
    const benchmarkTotal = totalAiBenchmark > 0 ? totalAiBenchmark : (rfq.estimatedBenchmarkValue || 0);
    const totalSavings = benchmarkTotal - lowestQuoteTotal;
    const savingsPercent = benchmarkTotal > 0 ? (totalSavings / benchmarkTotal) * 100 : 0;

    // Check if active negotiation exists for this RFQ
    const activeNegotiation = rfq.negotiations.find((n) => n.status === 'ACTIVE') || rfq.negotiations[0] || null;

    const comparisonDescription = interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdCompareRoute.evaluatedLengthVendorQuotesForRFQRfqNumberL1Value3ToLocaleString, { "length": evaluatedQuotes.length, "rfqNumber": rfq.rfqNumber, "value3": lowestQuote?.vendorName || UI_STRINGS.common.none, "toLocaleString": lowestQuoteTotal.toLocaleString() });
    let responseStatus = rfq.status;
    if (rfq.status === 'VENDOR_RESPONSE_OPEN' || rfq.status === 'RELEASED') {
      const transitionedAt = new Date();
      const results = await writeD1BatchAtomically([
        { sql: RFQ_COMPARE_STATUS_UPDATE_SQL, values: [transitionedAt, id, ctx.tenantId, rfq.status] },
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [crypto.randomUUID(), ctx.tenantId, ctx.userId, rfq.projectId, 'RFQ', rfq.id,
            'QUOTE_COMPARED', comparisonDescription, JSON.stringify({ status: rfq.status }),
            JSON.stringify({ status: 'COMPARISON', evaluatedQuotes: evaluatedQuotes.length }), null, null, transitionedAt],
        },
      ]);
      if (Number(results[0]?.meta?.changes || 0) === 1 && Number(results[1]?.meta?.changes || 0) === 1) {
        responseStatus = 'COMPARISON';
      }
    } else {
      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        projectId: rfq.projectId,
        entityType: 'RFQ',
        entityId: rfq.id,
        action: 'QUOTE_COMPARED',
        description: comparisonDescription,
        requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
        route: '/api/procurement/rfqs/[id]/compare',
      });
    }

    if (invalidNegotiationRounds.size > 0) {
      await writeStructuredLog('warn', 'procurement.negotiation_line_items_invalid', {
        operation: 'compare_rfq_quotes', route: '/api/procurement/rfqs/[id]/compare',
        requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
        rfqId: rfq.id, invalidRoundCount: invalidNegotiationRounds.size,
        negotiationRoundIds: [...invalidNegotiationRounds].slice(0, 20),
      });
    }

    return apiSuccess({
      rfq: {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        title: rfq.title,
        status: responseStatus,
        project: rfq.project,
        boqRevision: rfq.boqRevision ? { id: rfq.boqRevision.id, revisionCode: rfq.boqRevision.revisionCode } : null,
        pr: rfq.pr,
        submissionDeadline: rfq.submissionDeadline,
        commercialValidityDays: rfq.commercialValidityDays,
        paymentTerms: rfq.paymentTerms,
        deliveryRequirement: rfq.deliveryRequirement,
      },
      vendors: allRankedVendors,
      lines: lineComparison,
      pagination: {
        page: linePage,
        pageSize: RFQ_COMPARE_LINE_PAGE_SIZE,
        totalItems: totalLineCount,
        totalPages: totalLinePages,
        hasPreviousPage: linePage > 1,
        hasNextPage: linePage < totalLinePages,
      },
      activeNegotiation,
      negotiationSummaries,
      awards: rfq.awards,
      summary: {
        packageTotal: benchmarkTotal,
        benchmarkTotal,
        lowestQuoteTotal,
        lowestVendor: lowestQuote ? lowestQuote.vendorName : '—',
        lowestVendorId: lowestQuote ? lowestQuote.vendorId : null,
        savings: totalSavings,
        savingsPercent: Math.round(savingsPercent * 100) / 100,
        isFavorable: totalSavings >= 0,
        hasApprovedRateCards: approvedRateCardsCount > 0,
        approvedRateCardsCount,
      },
    });
  } catch (error: any) {
    await writeStructuredLog('error', 'procurement.rfq_quote_comparison_failed', {
      operation: 'compare_rfq_quotes', route: `/api/procurement/rfqs/${id}/compare`,
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId, userId: ctx.userId, rfqId: id,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    }, 'application');
    return apiError(UI_STRINGS.common.userMessages.failedToCompareQuotes, 500);
  }
}
