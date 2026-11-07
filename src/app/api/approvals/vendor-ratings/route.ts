// src/app/api/approvals/vendor-ratings/route.ts
// Project Approver Queue & Decision API for Vendor Performance Ratings
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '@/lib/project-auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  NOTIFICATION_INSERT_AFTER_AUDIT_SQL,
  PPO_MARK_COMPLETED_AFTER_AUDIT_SQL,
  VENDOR_PERFORMANCE_SCORE_UPDATE_AFTER_AUDIT_SQL,
  VENDOR_RATING_DECISION_UPDATE_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { VENDOR_RATING_DEFAULT_PAGE_SIZE, VENDOR_RATING_MAX_PAGE_SIZE } from './route.constants';


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('VENDOR_RATE_PPO_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status') || 'ALL'; // ALL, SUBMITTED, APPROVED, RETURNED_FOR_CORRECTION
  const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const requestedPageSize = Number.parseInt(searchParams.get('pageSize') || String(VENDOR_RATING_DEFAULT_PAGE_SIZE), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, VENDOR_RATING_MAX_PAGE_SIZE)
    : VENDOR_RATING_DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  try {
    const whereClause: any = {
      tenantId: ctx.tenantId,
    };

    if (statusFilter !== 'ALL') {
      whereClause.status = statusFilter;
    }

    // Scope approval queue by user's authorized projects
    const projectAccessFilter = await getUserProjectAccessFilter(ctx.userId, ctx.role, ctx.tenantId);
    if (projectAccessFilter) {
      whereClause.ppo = { is: { project: { is: projectAccessFilter } } };
    }

    const rawRatings = await prisma.ppoVendorRating.findMany({
      where: whereClause,
      skip,
      take: pageSize + 1,
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
      orderBy: [{ ratedAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = rawRatings.length > pageSize;
    const pageRatings = rawRatings.slice(0, pageSize);
    // Resolve submitters
    const userIds = Array.from(new Set(pageRatings.map((r) => r.ratedBy).filter(Boolean)));
    const users = userIds.length > 0 ? await prisma.user.findMany({
      where: { tenantId: ctx.tenantId, id: { in: userIds } },
      select: { id: true, name: true, role: true, email: true },
    }) : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const ratings = pageRatings.map((r) => {
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
    if (projectAccessFilter) {
      allWhereClause.ppo = { is: { project: { is: projectAccessFilter } } };
    }

    const [statusCounts, approvedValue] = await Promise.all([
      prisma.ppoVendorRating.groupBy({
        by: ['status'],
        where: allWhereClause,
        _count: { _all: true },
      }),
      prisma.ppo.aggregate({
        where: {
          tenantId: ctx.tenantId,
          vendorRating: { is: { tenantId: ctx.tenantId, status: 'APPROVED' } },
          ...(projectAccessFilter ? { project: { is: projectAccessFilter } } : {}),
        },
        _sum: { totalValue: true },
      }),
    ]);
    const countByStatus = new Map(statusCounts.map((entry) => [entry.status, Number(entry._count._all || 0)]));
    const totalCount = statusCounts.reduce((sum, entry) => sum + Number(entry._count._all || 0), 0);

    return apiSuccess({
      ratings,
      counts: {
        pendingCount: countByStatus.get('SUBMITTED') || 0,
        approvedCount: countByStatus.get('APPROVED') || 0,
        returnedCount: countByStatus.get('RETURNED_FOR_CORRECTION') || 0,
        totalCount,
        totalEvaluatedValue: Number(approvedValue._sum.totalValue || 0),
      },
      pagination: { page, pageSize, hasMore },
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor_rating.approval_queue_read_failed', {
      operation: 'list_vendor_rating_approvals',
      route: '/api/approvals/vendor-ratings',
      requestId: req.headers.get('x-request-id') || null,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      statusFilter,
      page,
      pageSize,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchApprovalsQueue, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('VENDOR_RATE_PPO_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const startedAt = Date.now();
  let ratingId: string | undefined;
  try {
    const body = await req.json();
    ratingId = typeof body?.ratingId === 'string' ? body.ratingId : undefined;
    const action = body?.action;
    const approverComments = typeof body?.approverComments === 'string' ? body.approverComments.trim() : '';

    if (!ratingId) return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingIDIsRequired, 400);
    if (!['ACCEPT', 'RETURN', 'REJECT'].includes(action)) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.invalidDecisionActionMustBeACCEPTRETURNOrREJECT, 400, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }

    const rating = await prisma.ppoVendorRating.findFirst({
      where: { id: ratingId, tenantId: ctx.tenantId },
      include: { ppo: true, vendor: true },
    });
    if (!rating) return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingRecordNotFoundOrAccessDenied, 404);

    const isAuthorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, rating.projectId || rating.ppo?.projectId, ctx.tenantId);
    if (!isAuthorized) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.accessDeniedYouAreNotAuthorisedToReviewAssessmentsForThisProject, 403, { route: '/api/approvals/vendor-ratings', method: 'POST' });
    }
    if (rating.status !== 'SUBMITTED') {
      return apiError(interpolateUiString(
        UI_STRINGS.appApiApprovalsVendorRatingsRoute.cannotRecordDecisionOnAssessmentInStatusStatusOnlySubmittedAssessmentsCanBeReviewed,
        { status: rating.status },
      ), 400);
    }
    if ((action === 'RETURN' || action === 'REJECT') && !approverComments) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.approverReviewCommentsAreMandatoryWhenRejectingOrReturningAnAssessmentForCorrection, 400);
    }

    let criteria: Record<string, any> = {};
    if (rating.criteriaDetails) {
      try {
        const parsed = typeof rating.criteriaDetails === 'string' ? JSON.parse(rating.criteriaDetails) : rating.criteriaDetails;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) criteria = parsed;
      } catch {
        criteria = {};
      }
    }
    const now = new Date();
    const timestamp = now.toISOString();
    const approverName = ctx.userName || UI_STRINGS.common.projectApprover;
    const history = Array.isArray(criteria.history) ? criteria.history : [];
    let newStatus: string;
    let auditAction: string;
    let notificationTitle: string;
    let notificationMessage: string;
    let notificationType: string;
    let responseMessage: string;

    if (action === 'ACCEPT') {
      newStatus = 'APPROVED';
      auditAction = 'PPO_RATING_APPROVED';
      notificationTitle = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.performanceAssessmentApprovedNotificationTitle, { ppoNumber: rating.ppo.ppoNumber });
      notificationMessage = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.performanceAssessmentApprovedNotificationMessage, {
        approverName, overallScore: rating.overallScore, vendorName: rating.vendor.name, ppoNumber: rating.ppo.ppoNumber,
      });
      notificationType = 'SUCCESS';
      responseMessage = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.assessmentApprovedPpoMessage, { ppoNumber: rating.ppo.ppoNumber });
      criteria.approvedBy = ctx.userId;
      criteria.approvedByName = approverName;
      criteria.approvedAt = timestamp;
      criteria.approverComments = approverComments;
    } else if (action === 'RETURN') {
      newStatus = 'RETURNED_FOR_CORRECTION';
      auditAction = 'PPO_RATING_RETURNED_FOR_CORRECTION';
      notificationTitle = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.performanceAssessmentReturnedNotificationTitle, { ppoNumber: rating.ppo.ppoNumber });
      notificationMessage = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.performanceAssessmentReturnedNotificationMessage, {
        approverName, ppoNumber: rating.ppo.ppoNumber, comments: approverComments,
      });
      notificationType = 'WARNING';
      responseMessage = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.assessmentReturnedPpoMessage, { ppoNumber: rating.ppo.ppoNumber });
      criteria.returnReason = approverComments;
      criteria.returnedBy = ctx.userId;
      criteria.returnedByName = approverName;
      criteria.returnedAt = timestamp;
      criteria.approverComments = approverComments;
    } else {
      newStatus = 'REJECTED';
      auditAction = 'PPO_RATING_REJECTED';
      notificationTitle = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.performanceAssessmentRejectedNotificationTitle, { ppoNumber: rating.ppo.ppoNumber });
      notificationMessage = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.performanceAssessmentRejectedNotificationMessage, {
        approverName, ppoNumber: rating.ppo.ppoNumber, comments: approverComments,
      });
      notificationType = 'INFO';
      responseMessage = interpolateUiString(UI_STRINGS.appApiApprovalsVendorRatingsRoute.assessmentRejectedPpoMessage, { ppoNumber: rating.ppo.ppoNumber });
      criteria.rejectionReason = approverComments;
      criteria.rejectedBy = ctx.userId;
      criteria.rejectedByName = approverName;
      criteria.rejectedAt = timestamp;
      criteria.approverComments = approverComments;
    }

    history.push({
      action: newStatus,
      performedBy: ctx.userId,
      performedByName: approverName,
      performedByRole: ctx.role,
      timestamp,
      comments: approverComments || null,
    });
    criteria.history = history;

    const auditId = crypto.randomUUID();
    const description = interpolateUiString(
      UI_STRINGS.appApiApprovalsVendorRatingsRoute.pPOPpoNumberPerformanceRatingOverallScore50DecisionRecordedNewStatusByApproverNameCommentsValue5,
      { ppoNumber: rating.ppo.ppoNumber, overallScore: rating.overallScore, newStatus, approverName,
        value5: approverComments || UI_STRINGS.common.none },
    );
    const batch = [
      {
        sql: VENDOR_RATING_DECISION_UPDATE_SQL,
        values: [newStatus, JSON.stringify(criteria), now, rating.id, ctx.tenantId, ctx.tenantId, ctx.tenantId],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, rating.projectId, 'VENDOR', rating.vendorId, auditAction,
          description, JSON.stringify({ status: rating.status }), JSON.stringify({ ppoNumber: rating.ppo.ppoNumber,
            action, status: newStatus, overallScore: rating.overallScore, approverComments: approverComments || null }),
          null, null, now],
      },
    ];
    if (action === 'ACCEPT') {
      batch.push({
        sql: VENDOR_PERFORMANCE_SCORE_UPDATE_AFTER_AUDIT_SQL,
        values: [ctx.tenantId, rating.vendorId, now, rating.vendorId, ctx.tenantId, auditId, ctx.tenantId],
      });
      if (rating.ppo.status !== 'COMPLETED') {
        batch.push({
          sql: PPO_MARK_COMPLETED_AFTER_AUDIT_SQL,
          values: [now, now, rating.ppoId, ctx.tenantId, auditId, ctx.tenantId],
        });
      }
    }
    if (rating.ratedBy) {
      batch.push({
        sql: NOTIFICATION_INSERT_AFTER_AUDIT_SQL,
        values: [crypto.randomUUID(), ctx.tenantId, rating.ratedBy, notificationTitle, notificationMessage,
          notificationType, 'PPO', rating.ppoId, rating.ppo.ppoNumber, `/procurement/vendors/${rating.vendorId}`,
          auditId, ctx.tenantId, rating.ratedBy, ctx.tenantId],
      });
    }

    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return apiError(UI_STRINGS.appApiApprovalsVendorRatingsRoute.ratingChangedPleaseRefresh, 409);
    }
    return apiSuccess({
      rating: { ...rating, status: newStatus, criteriaDetails: JSON.stringify(criteria), updatedAt: now },
      message: responseMessage,
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor_rating.decision_failed', {
      operation: 'record_vendor_rating_decision', route: '/api/approvals/vendor-ratings',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId, ratingId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToRecordApproverDecision, 500);
  }
}
