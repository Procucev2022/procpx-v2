// src/app/api/procurement/vendors/[id]/ppo-ratings/route.ts
// Individual PPO-Level Vendor Performance Rating API with Areas for Improvement & Approver Workflow
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { isUserAuthorizedForProject } from '@/lib/project-auth';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { readByD1FilterChunks } from '@/lib/d1-query';
import { logEvent, writeStructuredLog } from '@/lib/observability/server-logger';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, PPO_MARK_COMPLETED_AFTER_AUDIT_SQL, PPO_VENDOR_RATING_UPSERT_IF_ELIGIBLE_SQL } from '@/lib/d1-batch.constants';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';
import { dispatchPreparedWorkflowNotification } from '@/lib/notifications';
import { MAX_VENDOR_RATING_EVIDENCE_LENGTH, MAX_VENDOR_RATING_TEXT_LENGTH } from './route.constants';


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const isProcurementUser = ctx.role === 'PROCUREMENT_USER';
  const pageWindow = getListPageWindow(new URL(req.url).searchParams);
  const pageSize = pageWindow.pageSize;

  try {
    // If Procurement User: view approved ratings only per Requirement 4
    const whereClause: any = {
      vendorId: id,
      tenantId: ctx.tenantId,
    };

    if (isProcurementUser) {
      whereClause.status = 'APPROVED';
    }

    const [ratingRows, statusGroups, ppoStatusGroups] = await Promise.all([
      prisma.ppoVendorRating.findMany({
        where: whereClause,
        skip: pageWindow.skip,
        take: pageSize + 1,
        select: {
          id: true,
          tenantId: true,
          vendorId: true,
          ppoId: true,
          projectId: true,
          costCentreId: true,
          qualityScore: true,
          deliveryScore: true,
          commercialComplianceScore: true,
          responsivenessScore: true,
          documentationClosureScore: true,
          overallScore: true,
          criteriaDetails: true,
          comments: true,
          supportingEvidence: true,
          status: true,
          ratedBy: true,
          ratedAt: true,
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
      }),
      prisma.ppoVendorRating.groupBy({
        by: ['status'],
        where: { vendorId: id, tenantId: ctx.tenantId },
        _count: { _all: true },
        _avg: {
          overallScore: true,
          qualityScore: true,
          deliveryScore: true,
          commercialComplianceScore: true,
          responsivenessScore: true,
          documentationClosureScore: true,
        },
      }),
      prisma.ppo.groupBy({
        by: ['status'],
        where: { tenantId: ctx.tenantId, vendorId: id },
        _count: { _all: true },
      }),
    ]);
    const hasMore = ratingRows.length > pageSize;
    const rawRatings = hasMore ? ratingRows.slice(0, pageSize) : ratingRows;

    // Resolve user names for ratedBy
    const userIds = Array.from(new Set(rawRatings.map((r) => r.ratedBy).filter(Boolean)));
    const users = userIds.length > 0
      ? await readByD1FilterChunks(userIds, (chunk) => prisma.user.findMany({
          where: { tenantId: ctx.tenantId, id: { in: chunk } },
          select: { id: true, name: true },
        }))
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    let malformedCriteriaCount = 0;
    let sampleMalformedRatingId: string | null = null;
    const ratings = rawRatings.map((r) => {
      let parsedCriteria: Record<string, unknown> = {};
      if (r.criteriaDetails !== null && r.criteriaDetails !== undefined) {
        let malformed = false;
        try {
          const parsed: unknown = typeof r.criteriaDetails === 'string' ? JSON.parse(r.criteriaDetails) : r.criteriaDetails;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) parsedCriteria = parsed as Record<string, unknown>;
          else malformed = true;
        } catch {
          malformed = true;
        }
        if (malformed) {
          malformedCriteriaCount += 1;
          sampleMalformedRatingId ??= r.id;
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
    if (malformedCriteriaCount > 0) {
      logEvent('warn', 'vendor_rating.criteria_details_invalid', {
        operation: 'list_vendor_ratings', route: '/api/procurement/vendors/[id]/ppo-ratings',
        requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId, userId: ctx.userId,
        vendorId: id, fieldName: 'criteriaDetails', invalidCount: malformedCriteriaCount,
        sampleRatingId: sampleMalformedRatingId, fallback: 'empty_object',
      });
    }

    const approvedAggregate = statusGroups.find((group) => group.status === 'APPROVED');
    const average = (value: number | null | undefined) => value == null ? null : Math.round(value * 10) / 10;
    const ppoRatingsCount = Number(approvedAggregate?._count._all || 0);
    const ppoCount = ppoStatusGroups.reduce((sum, group) => sum + Number(group._count._all || 0), 0);
    const completedPpoCount = ppoStatusGroups
      .filter((group) => group.status === 'COMPLETED' || group.status === 'ACCEPTED')
      .reduce((sum, group) => sum + Number(group._count._all || 0), 0);
    const totalRatingCount = isProcurementUser
      ? ppoRatingsCount
      : statusGroups.reduce((sum, group) => sum + Number(group._count._all || 0), 0);

    return apiSuccess({
      ratings,
      summary: {
        ppoRatingsCount,
        averagePpoRating: average(approvedAggregate?._avg.overallScore),
        averageOverall: average(approvedAggregate?._avg.overallScore),
        avgQuality: average(approvedAggregate?._avg.qualityScore),
        avgDelivery: average(approvedAggregate?._avg.deliveryScore),
        avgCommercial: average(approvedAggregate?._avg.commercialComplianceScore),
        avgResponsiveness: average(approvedAggregate?._avg.responsivenessScore),
        avgDocumentation: average(approvedAggregate?._avg.documentationClosureScore),
        ppoCount,
        completedPpoCount,
      },
      userRole: ctx.role,
      isProcurementUser,
      pagination: { page: pageWindow.page, pageSize, total: totalRatingCount, hasMore },
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor.rating_history_read_failed', {
      operation: 'list_vendor_ratings',
      route: '/api/procurement/vendors/[id]/ppo-ratings',
      requestId: req.headers.get('x-request-id') || null,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      vendorId: id,
      page: pageWindow.page,
      pageSize,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchPpoRatings, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_RATE_PPO');
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role === 'PROCUREMENT_USER') {
    return apiError(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.forbiddenProcurementUsersHaveReadOnlyAccessToVendorRatings, 403, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
  }

  const { id } = await params;
  let ratingPpoId: string | null = null;
  const startedAt = Date.now();

  try {
    const vendor = await prisma.vendor.findFirst({
      where: {
        id,
        OR: [
          { tenantId: ctx.tenantId },
          { vendorType: 'PROCUCEV_VENDOR' },
        ],
      },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied2, 404, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
    }

    const bodyValue: unknown = await req.json();
    if (!bodyValue || typeof bodyValue !== 'object' || Array.isArray(bodyValue)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const body = bodyValue as Record<string, unknown>;
    const ppoId = typeof body.ppoId === 'string' ? body.ppoId : '';
    const qualityScore = body.qualityScore ?? 3;
    const deliveryScore = body.deliveryScore ?? 3;
    const commercialComplianceScore = body.commercialComplianceScore ?? 3;
    const responsivenessScore = body.responsivenessScore ?? 3;
    const documentationClosureScore = body.documentationClosureScore ?? 3;
    const comments = typeof body.comments === 'string' ? body.comments.trim() : '';
    const qualityComments = typeof body.qualityComments === 'string' ? body.qualityComments : '';
    const deliveryComments = typeof body.deliveryComments === 'string' ? body.deliveryComments : '';
    const commercialComments = typeof body.commercialComments === 'string' ? body.commercialComments : '';
    const documentationComments = typeof body.documentationComments === 'string' ? body.documentationComments : '';
    const responsivenessComments = typeof body.responsivenessComments === 'string' ? body.responsivenessComments : '';
    const overallImprovement = typeof body.overallImprovement === 'string' ? body.overallImprovement : '';
    const action = body.action === undefined ? 'SUBMIT' : body.action;
    const markPpoCompleted = body.markPpoCompleted === undefined ? true : body.markPpoCompleted;
    const evidenceValue = body.supportingEvidence;
    const supportingEvidence = typeof evidenceValue === 'string'
      ? evidenceValue
      : evidenceValue === undefined || evidenceValue === null ? null : JSON.stringify(evidenceValue);
    ratingPpoId = ppoId || null;

    if (action !== 'SUBMIT' && action !== 'SAVE_DRAFT') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (typeof markPpoCompleted !== 'boolean') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if ([comments, qualityComments, deliveryComments, commercialComments, documentationComments,
      responsivenessComments, overallImprovement].some((value) => value.length > MAX_VENDOR_RATING_TEXT_LENGTH)
      || (supportingEvidence && supportingEvidence.length > MAX_VENDOR_RATING_EVIDENCE_LENGTH)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    if (!ppoId) {
      return apiError(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPOIDIsRequiredToRecordPerformanceEvaluation, 400, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
    }

    const ppo = await prisma.ppo.findFirst({
      where: {
        id: ppoId,
        tenantId: ctx.tenantId,
        vendorId: vendor.id,
      },
      include: {
        project: { select: { id: true, name: true, projectCode: true } },
        costCentre: { select: { id: true, name: true, code: true } },
      },
    });

    if (!ppo) {
      return apiError(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPONotFoundOrDoesNotBelongToThisVendor, 404, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
    }

    // Business Rule: PPO must be eligible (not DRAFT or CANCELLED)
    if (ppo.status === 'DRAFT' || ppo.status === 'CANCELLED') {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPOPpoNumberIsInStatusStatusAndIsNotEligibleForPerformanceEvaluation, { "ppoNumber": ppo.ppoNumber, "status": ppo.status }), 400, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
    }

    // Security Rule: Project scope authorization check
    const isAuthorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, ppo.projectId, ctx.tenantId);
    if (!isAuthorized) {
      return apiError(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.accessDeniedYouAreNotAuthorisedToEvaluatePPOsForThisProject, 403, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
    }

    // Check for existing rating for this PPO & enforce immutability
    const existingRating = await prisma.ppoVendorRating.findFirst({
      where: { ppoId, tenantId: ctx.tenantId, vendorId: vendor.id },
    });

    if (existingRating) {
      if (existingRating.status === 'APPROVED' || existingRating.status === 'REJECTED') {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPOPpoNumberAssessmentIsInStatusStatusAndIsLockedAgainstModifications, { "ppoNumber": ppo.ppoNumber, "status": existingRating.status }), 400, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
      }
      if (existingRating.status === 'SUBMITTED') {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPOPpoNumberAssessmentIsCurrentlySubmittedAndUnderProjectApproverReviewItCannotBeModifiedUntilReviewedOrReturned, { "ppoNumber": ppo.ppoNumber }), 400, { route: '/api/procurement/vendors/[id]/ppo-ratings', method: 'POST' });
      }
      if (existingRating.status !== 'DRAFT' && existingRating.status !== 'RETURNED_FOR_CORRECTION') {
        return apiError(interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.pPOPpoNumberAssessmentIsInStatusStatusAndIsLockedAgainstModifications, { "ppoNumber": ppo.ppoNumber, "status": existingRating.status }), 400);
      }
    }

    // Validate scores (each 1 to 5)
    const q = Math.min(5, Math.max(1, Number(qualityScore) || 3));
    const d = Math.min(5, Math.max(1, Number(deliveryScore) || 3));
    const c = Math.min(5, Math.max(1, Number(commercialComplianceScore) || 3));
    const r = Math.min(5, Math.max(1, Number(responsivenessScore) || 3));
    const doc = Math.min(5, Math.max(1, Number(documentationClosureScore) || 3));

    // Weighted Overall Score calculation: Quality 30%, Delivery 25%, Commercial 20%, Responsiveness 15%, Documentation 10%
    const overallScore = Math.round(
      ((q * 0.30) + (d * 0.25) + (c * 0.20) + (r * 0.15) + (doc * 0.10)) * 10
    ) / 10;

    // Validate requirements for submission
    const isDraft = action === 'SAVE_DRAFT';
    const newStatus = isDraft ? 'DRAFT' : 'SUBMITTED';

    if (!isDraft) {
      if (!overallImprovement.trim() && !comments && !qualityComments.trim()) {
        return apiError(UI_STRINGS.common.pleaseProvideFeedbackOrAreasForImprovementBeforeSubmittingForProjectApproval, 400);
      }
    }

    // Build criteria details JSON
    let existingCriteria: any = {};
    let malformedExistingCriteria = false;
    if (existingRating?.criteriaDetails !== null && existingRating?.criteriaDetails !== undefined) {
      try {
        const parsed: unknown = typeof existingRating.criteriaDetails === 'string'
          ? JSON.parse(existingRating.criteriaDetails)
          : existingRating.criteriaDetails;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existingCriteria = parsed;
        else malformedExistingCriteria = true;
      } catch {
        malformedExistingCriteria = true;
      }
    }
    if (malformedExistingCriteria) {
      logEvent('warn', 'vendor_rating.criteria_details_invalid', {
        operation: 'submit_vendor_rating', route: '/api/procurement/vendors/[id]/ppo-ratings',
        requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId, userId: ctx.userId,
        vendorId: vendor.id, ppoId: ppo.id, ratingId: existingRating?.id,
        fieldName: 'criteriaDetails', fallback: 'empty_object',
      });
    }

    const history = Array.isArray(existingCriteria.history) ? existingCriteria.history : [];
    const now = new Date();
    history.push({
      action: isDraft ? 'DRAFT_SAVED' : (existingRating?.status === 'RETURNED_FOR_CORRECTION' ? 'RESUBMITTED' : 'SUBMITTED'),
      performedBy: ctx.userId,
      performedByName: ctx.userName || 'Project User',
      performedByRole: ctx.role,
      timestamp: now.toISOString(),
      overallScore,
      qualityScore: q,
      deliveryScore: d,
      commercialComplianceScore: c,
      responsivenessScore: r,
      documentationClosureScore: doc,
      qualityComments: qualityComments.trim(),
      deliveryComments: deliveryComments.trim(),
      commercialComments: commercialComments.trim(),
      documentationComments: documentationComments.trim(),
      responsivenessComments: responsivenessComments.trim(),
      overallImprovement: overallImprovement.trim(),
      notes: comments || overallImprovement.trim() || null,
    });

    const criteriaDetails = {
      ...existingCriteria,
      qualityComments: qualityComments.trim(),
      deliveryComments: deliveryComments.trim(),
      commercialComments: commercialComments.trim(),
      documentationComments: documentationComments.trim(),
      responsivenessComments: responsivenessComments.trim(),
      overallImprovement: overallImprovement.trim(),
      history,
    };

    const ratingId = existingRating?.id || crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const ratingValues = [ratingId, ctx.tenantId, vendor.id, ppo.id, ppo.projectId, ppo.costCentreId,
      q, d, c, r, doc, overallScore, JSON.stringify(criteriaDetails), comments || overallImprovement.trim() || null,
      supportingEvidence, newStatus, ctx.userId, now, existingRating?.createdAt || now, now,
      ppo.id, ctx.tenantId, vendor.id];
    const auditAction = isDraft ? 'PPO_RATING_DRAFT_SAVED' : 'PPO_RATING_SUBMITTED';
    const auditDescription = isDraft
      ? `Draft performance assessment saved for PPO ${ppo.ppoNumber} against vendor ${vendor.name} (Score: ${overallScore}/5.0)`
      : `Performance assessment submitted for Project Approval for PPO ${ppo.ppoNumber} against vendor ${vendor.name} (Score: ${overallScore}/5.0)`;
    const notification = !isDraft ? {
      tenantId: ctx.tenantId,
      userId: null,
      targetRole: 'PROJECT_APPROVER',
      title: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.vendorPerformanceReviewSubmittedPpoNumber, { "ppoNumber": ppo.ppoNumber }),
      message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdPpoRatingsRoute.value1SubmittedAOverallScore50PerformanceRatingForVendorNameOnPPOPpoNumber, { "value1": ctx.userName || UI_STRINGS.common.projectUser, "overallScore": overallScore, "name": vendor.name, "ppoNumber": ppo.ppoNumber }),
      type: 'ACTION_REQUIRED' as const,
      entityType: 'PPO' as const,
      entityId: ppo.id,
      recordNumber: ppo.ppoNumber,
      link: '/approvals/vendor-ratings',
    } : null;
    const preparedNotification = notification ? prepareNotificationOutbox(notification, now, auditId) : null;
    const batch = [
      { sql: PPO_VENDOR_RATING_UPSERT_IF_ELIGIBLE_SQL, values: ratingValues },
      { sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL, values: [auditId, ctx.tenantId, ctx.userId, ppo.projectId,
        'VENDOR', vendor.id, auditAction, auditDescription, null,
        JSON.stringify({ ppoNumber: ppo.ppoNumber, status: newStatus, overallScore, ratingId }), null, null, now] },
      ...(!isDraft && markPpoCompleted && ppo.status !== 'COMPLETED' ? [{
        sql: PPO_MARK_COMPLETED_AFTER_AUDIT_SQL,
        values: [now, now, ppo.id, ctx.tenantId, auditId, ctx.tenantId],
      }] : []),
      ...(preparedNotification ? [preparedNotification.statement] : []),
    ];
    const results = await writeD1BatchAtomically(batch);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1
      || (preparedNotification && Number(results[results.length - 1]?.meta?.changes || 0) !== 1)) {
      return apiError(UI_STRINGS.common.userMessages.failedToSubmitPpoRating, 409);
    }
    const rating = results[0]?.results?.[0] || { id: ratingId, status: newStatus };
    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'PPO', entityId: ppo.id, route: '/api/procurement/vendors/[id]/ppo-ratings',
      });
    }

    return apiSuccess({
      rating,
      message: isDraft
        ? `Draft rating for PPO ${ppo.ppoNumber} saved successfully.`
        : `Performance assessment for PPO ${ppo.ppoNumber} submitted for Project Approval.`,
    }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'vendor.rating_submission_failed', {
      operation: 'submit_vendor_rating',
      route: '/api/procurement/vendors/[id]/ppo-ratings',
      requestId: req.headers.get('x-request-id') || null,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      vendorId: id,
      ppoId: ratingPpoId,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
      durationMs: Date.now() - startedAt,
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitPpoRating, 500);
  }
}
