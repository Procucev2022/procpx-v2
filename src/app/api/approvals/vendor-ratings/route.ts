// src/app/api/approvals/vendor-ratings/route.ts
// Project Approver Queue & Decision API for Vendor Performance Ratings
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { isUserAuthorizedForProject, getUserAuthorizedProjectIds } from '@/lib/project-auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('VENDOR_RATE_PPO_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status') || 'ALL'; // ALL, SUBMITTED, APPROVED, RETURNED_FOR_CORRECTION

  try {
    const whereClause: any = {
      tenantId: ctx.tenantId,
    };

    if (statusFilter !== 'ALL') {
      whereClause.status = statusFilter;
    }

    // Scope approval queue by user's authorized projects
    const authorizedProjectIds = await getUserAuthorizedProjectIds(ctx.userId, ctx.role);
    if (authorizedProjectIds !== null) {
      whereClause.OR = [
        { projectId: { in: authorizedProjectIds } },
        { projectId: null },
        { ppo: { projectId: { in: authorizedProjectIds } } },
      ];
    }

    const rawRatings = await prisma.ppoVendorRating.findMany({
      where: whereClause,
      include: {
        vendor: {
          select: {
            id: true,
            code: true,
            name: true,
            vendorType: true,
            categories: true,
            performanceScore: true,
          },
        },
        ppo: {
          select: {
            id: true,
            ppoNumber: true,
            title: true,
            totalValue: true,
            status: true,
            completedAt: true,
            project: { select: { id: true, name: true, projectCode: true } },
            costCentre: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { ratedAt: 'desc' },
    });

    // Resolve submitters
    const userIds = Array.from(new Set(rawRatings.map((r) => r.ratedBy).filter(Boolean)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const ratings = rawRatings.map((r) => {
      let parsedCriteria: any = {};
      if (r.criteriaDetails) {
        try {
          parsedCriteria = typeof r.criteriaDetails === 'string' ? JSON.parse(r.criteriaDetails) : r.criteriaDetails;
        } catch {
          parsedCriteria = {};
        }
      }

      return {
        ...r,
        ratedByName: userMap.get(r.ratedBy) || r.ratedBy,
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
      };
    });

    // KPI Metrics scoped by project permissions
    const allWhereClause: any = { tenantId: ctx.tenantId };
    if (authorizedProjectIds !== null) {
      allWhereClause.OR = [
        { projectId: { in: authorizedProjectIds } },
        { projectId: null },
        { ppo: { projectId: { in: authorizedProjectIds } } },
      ];
    }

    const allTenantRatings = await prisma.ppoVendorRating.findMany({
      where: allWhereClause,
      include: { ppo: { select: { totalValue: true } } },
    });

    const pendingCount = allTenantRatings.filter((r) => r.status === 'SUBMITTED').length;
    const approvedCount = allTenantRatings.filter((r) => r.status === 'APPROVED').length;
    const returnedCount = allTenantRatings.filter((r) => r.status === 'RETURNED_FOR_CORRECTION').length;
    const totalEvaluatedValue = allTenantRatings
      .filter((r) => r.status === 'APPROVED')
      .reduce((sum, r) => sum + (r.ppo?.totalValue || 0), 0);

    return apiSuccess({
      ratings,
      counts: {
        pendingCount,
        approvedCount,
        returnedCount,
        totalCount: allTenantRatings.length,
        totalEvaluatedValue,
      },
    });
  } catch (error: any) {
    console.error('Error fetching vendor ratings approval queue:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchApprovalsQueue }), 500, { route: '/api/approvals/vendor-ratings', method: 'GET', error: error });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('VENDOR_RATE_PPO_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { ratingId, action, approverComments = '' } = body;

    if (!ratingId) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingIDIsRequired, 400, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }

    if (!['ACCEPT', 'RETURN', 'REJECT'].includes(action)) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.invalidDecisionActionMustBeACCEPTRETURNOrREJECT, 400, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }

    const rating = await prisma.ppoVendorRating.findFirst({
      where: {
        id: ratingId,
        tenantId: ctx.tenantId,
      },
      include: {
        ppo: true,
        vendor: true,
      },
    });

    if (!rating) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingRecordNotFoundOrAccessDenied, 404, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }

    // Security Rule: Validate approver project scope
    const isAuthorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, rating.projectId || rating.ppo?.projectId);
    if (!isAuthorized) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.accessDeniedYouAreNotAuthorisedToReviewAssessmentsForThisProject, 403, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }

    // Business Rule: Only SUBMITTED ratings can be reviewed/decided
    if (rating.status !== 'SUBMITTED') {
      return apiError(interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.cannotRecordDecisionOnAssessmentInStatusStatusOnlySubmittedAssessmentsCanBeReviewed, { "status": rating.status }), 400, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }

    // Require approver comments for Return or Reject per Requirement 2
    if ((action === 'RETURN' || action === 'REJECT') && !approverComments?.trim()) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.approverReviewCommentsAreMandatoryWhenRejectingOrReturningAnAssessmentForCorrection, 400, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }

    let existingCriteria: any = {};
    if (rating.criteriaDetails) {
      try {
        existingCriteria = typeof rating.criteriaDetails === 'string' ? JSON.parse(rating.criteriaDetails) : rating.criteriaDetails;
      } catch {
        existingCriteria = {};
      }
    }

    const history = existingCriteria.history || [];
    const timestamp = new Date().toISOString();

    let newStatus = '';
    let notificationTitle = '';
    let notificationMessage = '';
    let auditAction = '';
    const approverName = ctx.userName || 'Project Approver';

    if (action === 'ACCEPT') {
      newStatus = 'APPROVED';
      auditAction = 'PPO_RATING_APPROVED';
      notificationTitle = `Performance Assessment Approved: ${rating.ppo.ppoNumber}`;
      notificationMessage = `${approverName} approved the performance rating (${rating.overallScore}/5.0) for vendor "${rating.vendor.name}" on PPO ${rating.ppo.ppoNumber}.`;

      existingCriteria.approvedBy = ctx.userId;
      existingCriteria.approvedByName = approverName;
      existingCriteria.approvedAt = timestamp;
      existingCriteria.approverComments = approverComments.trim();
    } else if (action === 'RETURN') {
      newStatus = 'RETURNED_FOR_CORRECTION';
      auditAction = 'PPO_RATING_RETURNED_FOR_CORRECTION';
      notificationTitle = `Rating Returned for Correction: ${rating.ppo.ppoNumber}`;
      notificationMessage = `${approverName} returned the assessment for PPO ${rating.ppo.ppoNumber} for correction: "${approverComments.trim()}"`;

      existingCriteria.returnReason = approverComments.trim();
      existingCriteria.returnedBy = ctx.userId;
      existingCriteria.returnedByName = approverName;
      existingCriteria.returnedAt = timestamp;
      existingCriteria.approverComments = approverComments.trim();
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      auditAction = 'PPO_RATING_REJECTED';
      notificationTitle = `Rating Rejected: ${rating.ppo.ppoNumber}`;
      notificationMessage = `${approverName} rejected the rating for PPO ${rating.ppo.ppoNumber}: "${approverComments.trim()}"`;

      existingCriteria.rejectionReason = approverComments.trim();
      existingCriteria.rejectedBy = ctx.userId;
      existingCriteria.rejectedByName = approverName;
      existingCriteria.rejectedAt = timestamp;
      existingCriteria.approverComments = approverComments.trim();
    }

    history.push({
      action: action === 'ACCEPT' ? 'APPROVED' : (action === 'RETURN' ? 'RETURNED_FOR_CORRECTION' : 'REJECTED'),
      performedBy: ctx.userId,
      performedByName: approverName,
      performedByRole: ctx.role,
      timestamp,
      comments: approverComments.trim() || null,
    });

    existingCriteria.history = history;

    // Update the rating
    const updatedRating = await prisma.ppoVendorRating.update({
      where: { id: rating.id },
      data: {
        status: newStatus,
        criteriaDetails: JSON.stringify(existingCriteria),
        updatedAt: new Date(),
      },
    });

    // If accepted: publish score and recalculate vendor profile performance score
    if (action === 'ACCEPT') {
      const allApprovedRatings = await prisma.ppoVendorRating.findMany({
        where: {
          vendorId: rating.vendorId,
          status: 'APPROVED',
        },
        select: { overallScore: true },
      });

      const avgScore = allApprovedRatings.length > 0
        ? Math.round((allApprovedRatings.reduce((sum, r) => sum + r.overallScore, 0) / allApprovedRatings.length) * 10) / 10
        : rating.overallScore;

      // Update vendor profile summary performance score
      await prisma.vendor.update({
        where: { id: rating.vendorId },
        data: {
          performanceScore: Math.round(avgScore * 20),
        },
      });

      // Ensure PPO is marked COMPLETED
      if (rating.ppo.status !== 'COMPLETED') {
        await prisma.ppo.update({
          where: { id: rating.ppoId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
    }

    // Create Audit Log
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: rating.vendorId,
      action: auditAction,
      description: interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.pPOPpoNumberPerformanceRatingOverallScore50DecisionRecordedNewStatusByApproverNameCommentsValue5, { "ppoNumber": rating.ppo.ppoNumber, "overallScore": rating.overallScore, "newStatus": newStatus, "approverName": approverName, "value5": approverComments.trim() || UI_STRINGS.common.none }),
      newValue: {
        ppoNumber: rating.ppo.ppoNumber,
        action,
        status: newStatus,
        overallScore: rating.overallScore,
        approverComments: approverComments.trim() || null,
      },
    });

    // Notify Submitter
    if (rating.ratedBy) {
      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          userId: rating.ratedBy,
          title: notificationTitle,
          message: notificationMessage,
          type: action === 'ACCEPT' ? 'SUCCESS' : (action === 'RETURN' ? 'WARNING' : 'INFO'),
          entityType: 'PPO',
          entityId: rating.ppoId,
          recordNumber: rating.ppo.ppoNumber,
          link: `/procurement/vendors/${rating.vendorId}`,
        },
      });
    }

    return apiSuccess({
      rating: updatedRating,
      message: action === 'ACCEPT'
        ? `Assessment for PPO ${rating.ppo.ppoNumber} has been accepted and approved score published.`
        : (action === 'RETURN'
          ? `Assessment for PPO ${rating.ppo.ppoNumber} returned to submitter for correction.`
          : `Assessment for PPO ${rating.ppo.ppoNumber} has been rejected.`),
    });
  } catch (error: any) {
    console.error('Error recording approver decision:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToRecordApproverDecision }), 500, { route: '/api/approvals/vendor-ratings', method: 'POST', error: error });
  }
}
