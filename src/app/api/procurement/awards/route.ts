// app/api/procurement/awards/route.ts
// Commercial Award Recommendation and Multi-Role Approval Workflow
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('AWARD_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get('rfqId');
  const status = searchParams.get('status');

  try {
    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (rfqId) where.rfqId = rfqId;
    if (status) where.status = status;

    const awards = await prisma.awardRecommendation.findMany({
      where,
      include: {
        rfq: {
          include: {
            project: { select: { id: true, name: true, projectCode: true } },
            boqRevision: { select: { id: true, revisionCode: true } },
          },
        },
        recommendedVendor: true,
        ppos: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess({ awards, total: awards.length });
  } catch (error: any) {
    console.error('Error fetching award recommendations:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchAwards }), 500, { route: '/api/procurement/awards', method: 'GET', error: error });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('AWARD_RECOMMEND');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      rfqId,
      recommendedVendorId,
      originalQuoteAmount,
      finalNegotiatedAmount,
      benchmarkAmount,
      justification,
      technicalStatus = 'COMPLIANT',
      commercialStatus = 'BEST_VALUE',
    } = body;

    if (!rfqId || !recommendedVendorId || !justification) {
      return apiError(UI_STRINGS.appApiProcurementAwardsRoute.rFQIDRecommendedVendorAndJustificationAreRequired, 400, { route: '/api/procurement/awards', method: 'POST' });
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id: rfqId, tenantId: ctx.tenantId },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/awards', method: 'POST' });
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: recommendedVendorId, tenantId: ctx.tenantId },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.appApiProcurementAwardsRoute.recommendedVendorNotFound, 404, { route: '/api/procurement/awards', method: 'POST' });
    }

    const bench = Number(benchmarkAmount) || rfq.estimatedBenchmarkValue || 0;
    const finalVal = Number(finalNegotiatedAmount);
    const origVal = Number(originalQuoteAmount) || finalVal;
    const savings = bench - finalVal;
    const savingsPct = bench > 0 ? (savings / bench) * 100 : 0;

    const award = await prisma.awardRecommendation.create({
      data: {
        tenantId: ctx.tenantId,
        rfqId,
        recommendedVendorId,
        originalQuoteAmount: origVal,
        finalNegotiatedAmount: finalVal,
        benchmarkAmount: bench,
        totalSavingsAmount: savings,
        savingsPercent: Math.round(savingsPct * 100) / 100,
        technicalStatus,
        commercialStatus,
        justification,
        status: 'PENDING_APPROVAL',
        submittedById: ctx.userId,
      },
      include: {
        recommendedVendor: true,
      },
    });

    // Update RFQ status
    await prisma.rfq.update({
      where: { id: rfqId },
      data: { status: 'AWARD_RECOMMENDED' },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'AWARD',
      entityId: award.id,
      action: 'AWARD_RECOMMENDED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendedForNameOnRFQRfqNumberAtToLocaleStringSavingsToLocaleString2Round, { "name": vendor.name, "rfqNumber": rfq.rfqNumber, "toLocaleString": finalVal.toLocaleString(), "toLocaleString2": savings.toLocaleString(), "round": Math.round(savingsPct) }),
      newValue: {
        vendorId: vendor.id,
        vendorName: vendor.name,
        finalNegotiatedAmount: finalVal,
        savings,
        savingsPercent: savingsPct,
      },
    });

    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'AWARD_RECOMMENDED',
      recordNumber: rfq.rfqNumber,
      entityId: award.id,
      actorName: ctx.userName,
      details: {
        vendorName: vendor.name,
        amount: finalVal,
      },
    });

    return apiSuccess({ award, message: UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendationSubmittedForApproval }, 201);
  } catch (error: any) {
    console.error('Error submitting award recommendation:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSubmitAwardRecommendation }), 500, { route: '/api/procurement/awards', method: 'POST', error: error });
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAuth('AWARD_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { awardId, action, remarks } = body;

    if (!awardId || !action) {
      return apiError(UI_STRINGS.appApiProcurementAwardsRoute.awardIDAndActionAPPROVEREJECTAreRequired, 400, { route: '/api/procurement/awards', method: 'PUT' });
    }

    const award = await prisma.awardRecommendation.findFirst({
      where: { id: awardId, tenantId: ctx.tenantId },
      include: { rfq: true, recommendedVendor: true },
    });

    if (!award) {
      return apiError(UI_STRINGS.common.awardRecommendationNotFound, 404, { route: '/api/procurement/awards', method: 'PUT' });
    }

    const isApproved = action === 'APPROVE';
    const updatedStatus = isApproved ? 'APPROVED' : 'REJECTED';

    const updated = await prisma.awardRecommendation.update({
      where: { id: awardId },
      data: {
        status: updatedStatus,
        approvedById: ctx.userId,
        approvedAt: new Date(),
        approvalRemarks: remarks || null,
      },
    });

    // Update RFQ status
    await prisma.rfq.update({
      where: { id: award.rfqId },
      data: { status: isApproved ? 'APPROVED' : 'COMPARISON' },
    });

    const auditAction = isApproved ? 'AWARD_APPROVED' : 'AWARD_REJECTED';
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: award.rfq.projectId,
      entityType: 'AWARD',
      entityId: award.id,
      action: auditAction,
      description: interpolateUiString(UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendationForNameOnRFQRfqNumberWasToLowerCaseByRoleRemarksValue5, { "name": award.recommendedVendor.name, "rfqNumber": award.rfq.rfqNumber, "toLowerCase": updatedStatus.toLowerCase(), "role": ctx.role, "value5": remarks || UI_STRINGS.common.none }),
      newValue: { status: updatedStatus, remarks },
    });

    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: isApproved ? 'AWARD_APPROVED' : 'AWARD_REJECTED',
      recordNumber: award.rfq.rfqNumber,
      entityId: award.id,
      actorName: ctx.userName,
      details: {
        vendorName: award.recommendedVendor?.name,
        amount: award.finalNegotiatedAmount,
      },
    });

    return apiSuccess({
      award: updated,
      message: interpolateUiString(UI_STRINGS.appApiProcurementAwardsRoute.awardRecommendationSuccessfullyToLowerCase, { "toLowerCase": updatedStatus.toLowerCase() }),
    });
  } catch (error: any) {
    console.error('Error reviewing award recommendation:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToReviewAwardRecommendation }), 500, { route: '/api/procurement/awards', method: 'PUT', error: error });
  }
}
