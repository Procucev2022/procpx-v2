// app/api/procurement/ppos/route.ts
// Purchase / Procurement Order (PPO) Generation from locked commercial baseline
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';

import { hasPermission } from '@/lib/permissions';
import { getUserAuthorizedProjectIds } from '@/lib/project-auth';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (!hasPermission(ctx.role, 'PPO_VIEW') && !hasPermission(ctx.role, 'VENDOR_RATE_PPO')) {
    return apiError('Forbidden: insufficient permissions', 403);
  }

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const projectId = searchParams.get('projectId');

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;
    if (projectId) where.projectId = projectId;

    // Scope by user's assigned projects for project users / approvers
    const authorizedProjectIds = await getUserAuthorizedProjectIds(ctx.userId, ctx.role);
    if (authorizedProjectIds !== null) {
      where.projectId = { in: authorizedProjectIds };
    }

    const ppos = await prisma.ppo.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, projectCode: true, location: true } },
        costCentre: { select: { id: true, name: true, code: true } },
        vendor: true,
        vendorRating: true,
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            packageName: true,
            lines: true,
            boqRevision: {
              select: {
                id: true,
                revisionCode: true,
                boq: {
                  select: {
                    id: true,
                    boqCode: true,
                  },
                },
              },
            },
          },
        },
        awardRecommendation: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const isProcurementUser = ctx.role === 'PROCUREMENT_USER';

    // Parse ratings and enforce Procurement User read-only restriction for unapproved ratings
    const pposWithParsedRatings = ppos.map((p) => {
      let rating = p.vendorRating;
      if (rating && isProcurementUser && rating.status !== 'APPROVED') {
        rating = null;
      }
      let parsedCriteria: any = {};
      if (rating?.criteriaDetails) {
        try {
          parsedCriteria = typeof rating.criteriaDetails === 'string'
            ? JSON.parse(rating.criteriaDetails)
            : rating.criteriaDetails;
        } catch {
          parsedCriteria = {};
        }
      }
      return {
        ...p,
        vendorRating: rating
          ? {
              ...rating,
              criteriaDetailsParsed: parsedCriteria,
              qualityComments: parsedCriteria.qualityComments || '',
              deliveryComments: parsedCriteria.deliveryComments || '',
              commercialComments: parsedCriteria.commercialComments || '',
              documentationComments: parsedCriteria.documentationComments || '',
              responsivenessComments: parsedCriteria.responsivenessComments || '',
              overallImprovement: parsedCriteria.overallImprovement || '',
              approverComments: parsedCriteria.approverComments || '',
              approvedBy: parsedCriteria.approvedBy || null,
              approvedByName: parsedCriteria.approvedByName || null,
              approvedAt: parsedCriteria.approvedAt || null,
              returnReason: parsedCriteria.returnReason || null,
              decisionHistory: parsedCriteria.history || [],
            }
          : null,
      };
    });

    return apiSuccess({
      ppos: pposWithParsedRatings,
      total: pposWithParsedRatings.length,
      currentUserRole: ctx.role,
      isProcurementUser,
    });
  } catch (error: any) {
    console.error('Error fetching PPOs:', error);
    return apiError(error.message || 'Failed to fetch PPOs', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('PPO_CREATE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      rfqId,
      awardRecommendationId,
      targetVendorId,
      justification,
      deliveryTerms,
      paymentTerms,
      taxDetails,
      action = 'ISSUE_PPO',
    } = body;

    if (!rfqId) {
      return apiError('RFQ ID is required to generate PPO', 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
      include: {
        project: true,
        boqRevision: true,
        lines: true,
        quotes: {
          orderBy: [{ quoteVersion: 'desc' }, { createdAt: 'desc' }],
          include: { lines: true, vendor: true },
        },
        awards: {
          where: { status: 'APPROVED' },
          include: { recommendedVendor: true },
          take: 1,
        },
      },
    });

    if (!rfq) {
      return apiError('RFQ not found or access denied', 404);
    }

    // Evaluate latest quote per vendor to determine ranking and award details
    const latestQuoteMap = new Map<string, typeof rfq.quotes[0]>();
    for (const q of rfq.quotes) {
      if (!latestQuoteMap.has(q.vendorId)) {
        latestQuoteMap.set(q.vendorId, q);
      }
    }
    const allLatestQuotes = Array.from(latestQuoteMap.values());
    allLatestQuotes.sort((a, b) => a.totalQuoteAmount - b.totalQuoteAmount);

    let vendorId = targetVendorId;
    let selectedQuote = vendorId ? latestQuoteMap.get(vendorId) : null;

    if (awardRecommendationId) {
      const award = await prisma.awardRecommendation.findFirst({
        where: { id: awardRecommendationId, tenantId: ctx.tenantId },
        include: { recommendedVendor: true },
      });
      if (!award) return apiError('Award recommendation not found', 404);
      vendorId = award.recommendedVendorId;
      selectedQuote = latestQuoteMap.get(vendorId) || null;
    } else if (!vendorId && rfq.awards.length > 0) {
      vendorId = rfq.awards[0].recommendedVendorId;
      selectedQuote = latestQuoteMap.get(vendorId) || null;
    } else if (!vendorId && allLatestQuotes.length > 0) {
      // Default to L1
      selectedQuote = allLatestQuotes[0];
      vendorId = selectedQuote.vendorId;
    }

    if (!vendorId || !selectedQuote) {
      return apiError('Cannot generate PPO: No valid quotation found for the selected vendor', 400);
    }

    // Determine ranking at award time
    const vendorRankIndex = allLatestQuotes.findIndex((q) => q.vendorId === vendorId);
    const rankAtAward = vendorRankIndex >= 0 ? vendorRankIndex + 1 : 1;
    const isL1 = rankAtAward === 1;

    // Rule: If the selected vendor is not L1, require a mandatory justification note before submission
    if (!isL1 && (!justification || !justification.trim())) {
      return apiError(
        `Vendor ${selectedQuote.vendor.name} is ranked L${rankAtAward}. A mandatory commercial justification is required when awarding / raising PPO for a non-L1 vendor.`,
        400
      );
    }

    // Rule: Prevent duplicate PPO creation for the same RFQ and vendor
    const existingPpo = await prisma.ppo.findFirst({
      where: {
        tenantId: ctx.tenantId,
        rfqId,
        vendorId,
        status: { not: 'CANCELLED' },
      },
    });

    if (existingPpo) {
      return apiError(
        `An active Purchase Order (${existingPpo.ppoNumber}) has already been raised for ${selectedQuote.vendor.name} on this RFQ.`,
        409
      );
    }

    const vendorName = selectedQuote.vendor.name;
    const totalValue = selectedQuote.totalQuoteAmount;
    const quoteVersion = selectedQuote.quoteVersion;

    // Generate PPO Number
    const count = await prisma.ppo.count({ where: { tenantId: ctx.tenantId } });
    const ppoNumber = `PPO-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
    const isIssued = action === 'ISSUE_PPO';
    const initialStatus = isIssued ? 'ISSUED' : 'DRAFT';

    // Map line item rates from the selected quote version
    const quoteRateMap = new Map<string, { rate: number; lineTotal: number }>();
    selectedQuote.lines.forEach((ql) => {
      quoteRateMap.set(ql.rfqLineId, { rate: ql.unitRate, lineTotal: ql.lineTotal });
    });

    const ppoLinesData = rfq.lines.map((l, idx) => {
      const qLine = quoteRateMap.get(l.id);
      const unitRate = qLine ? qLine.rate : (l.benchmarkRate || 100);
      const orderedAmount = qLine ? qLine.lineTotal : (l.quantity || 1) * unitRate;

      return {
        tenantId: ctx.tenantId,
        projectId: rfq.projectId,
        costCentreId: l.costCentreId || (rfq.boqRevision as any)?.costCentreId || null,
        boqId: rfq.boqRevision?.boqId || null,
        boqRevisionId: rfq.boqRevisionId || null,
        boqLineId: l.boqLineId || null,
        prLineId: l.prLineId || null,
        rfqLineId: l.id,
        vendorId,
        lineNumber: `PO-${l.lineNumber || idx + 1}`,
        itemDescription: l.description,
        specification: l.specification,
        category: l.category,
        subcategory: l.subcategory,
        uom: l.uom,
        orderedQuantity: l.quantity,
        orderedUnitRate: unitRate,
        orderedAmount,
        totalOrderValue: orderedAmount,
        status: initialStatus,
      };
    });

    const ppo = await prisma.$transaction(async (tx) => {
      // Create or update award recommendation if not already linked
      let awardId = awardRecommendationId || rfq.awards[0]?.id;
      if (!awardId) {
        const newAward = await tx.awardRecommendation.create({
          data: {
            tenantId: ctx.tenantId,
            rfqId,
            recommendedVendorId: vendorId,
            originalQuoteAmount: totalValue,
            finalNegotiatedAmount: totalValue,
            benchmarkAmount: rfq.estimatedBenchmarkValue || totalValue,
            totalSavingsAmount: Math.max(0, (rfq.estimatedBenchmarkValue || totalValue) - totalValue),
            savingsPercent: (rfq.estimatedBenchmarkValue || totalValue) > 0
              ? Math.max(0, (((rfq.estimatedBenchmarkValue || totalValue) - totalValue) / (rfq.estimatedBenchmarkValue || totalValue)) * 100)
              : 0,
            technicalStatus: 'COMPLIANT',
            commercialStatus: isL1 ? 'L1_LOWEST_BIDDER' : `L${rankAtAward}_JUSTIFIED`,
            justification: justification || (isL1 ? 'Awarded to L1 Lowest Compliant Bidder' : `Awarded to L${rankAtAward} with justification`),
            status: 'APPROVED',
            submittedById: ctx.userId,
            approvedById: ctx.userId,
            approvedAt: new Date(),
          },
        });
        awardId = newAward.id;
      }

      const createdPpo = await tx.ppo.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: rfq.projectId,
          costCentreId: (rfq.boqRevision as any)?.costCentreId || null,
          boqId: rfq.boqRevision?.boqId || null,
          boqRevisionId: rfq.boqRevisionId || null,
          rfqId,
          vendorId,
          awardRecommendationId: awardId,
          ppoNumber,
          title: `Purchase Order: ${rfq.title} (${vendorName} - Quote v${quoteVersion})`,
          totalValue,
          currency: 'INR',
          status: initialStatus,
          deliveryTerms: deliveryTerms || rfq.deliveryRequirement || 'Ex-site delivery within 30 days',
          paymentTerms: paymentTerms || rfq.paymentTerms || '30 days upon delivery and inspection',
          taxDetails: taxDetails || rfq.taxTerms || 'GST 18% as applicable',
          issuedAt: isIssued ? new Date() : null,
          createdById: ctx.userId,
          lines: {
            create: ppoLinesData,
          },
        },
        include: {
          project: true,
          vendor: true,
          rfq: true,
          lines: true,
        },
      });

      // Update RFQ status to AWARDED
      await tx.rfq.update({
        where: { id: rfqId },
        data: { status: 'AWARDED' },
      });

      return createdPpo;
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'PPO',
      entityId: ppo.id,
      action: 'PPO_CREATED',
      description: `Purchase Order ${ppoNumber} raised for ${vendorName} (Rank: L${rankAtAward}, Quote v${quoteVersion}, ₹${totalValue.toLocaleString('en-IN')}) on RFQ ${rfq.rfqNumber}`,
      newValue: {
        ppoNumber,
        vendorId,
        totalValue,
        quoteVersion,
        rankAtAward,
        justification: justification || (isL1 ? 'L1 lowest offer' : 'Approved non-L1'),
      },
    });

    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_CREATED',
      recordNumber: ppoNumber,
      entityId: ppo.id,
      actorName: ctx.userName,
      details: {
        vendorName,
        amount: totalValue,
      },
    });

    return apiSuccess({
      ppo,
      message: `PPO ${ppoNumber} raised successfully for ${vendorName} (Quote v${quoteVersion})`,
      ppoNumber,
    }, 201);
  } catch (error: any) {
    console.error('Error generating PPO:', error);
    return apiError(error.message || 'Failed to generate PPO', 500);
  }
}
