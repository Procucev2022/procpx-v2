// src/app/api/procurement/vendors/[id]/ppo-ratings/route.ts
// Individual PPO-Level Vendor Performance Rating API with Areas for Improvement & Approver Workflow
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { isUserAuthorizedForProject } from '@/lib/project-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const isProcurementUser = ctx.role === 'PROCUREMENT_USER';

  try {
    // If Procurement User: view approved ratings only per Requirement 4
    const whereClause: any = {
      vendorId: id,
      tenantId: ctx.tenantId,
    };

    if (isProcurementUser) {
      whereClause.status = 'APPROVED';
    }

    const rawRatings = await prisma.ppoVendorRating.findMany({
      where: whereClause,
      include: {
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

    // Resolve user names for ratedBy
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

    // Calculate scorecard summary across APPROVED ratings (or legacy ratings)
    const approvedRatings = ratings.filter((r) => r.status === 'APPROVED');
    const ppoRatingsCount = approvedRatings.length;
    let averageOverall: number | null = null;
    let avgQuality: number | null = null;
    let avgDelivery: number | null = null;
    let avgCommercial: number | null = null;
    let avgResponsiveness: number | null = null;
    let avgDocumentation: number | null = null;

    if (ppoRatingsCount > 0) {
      const sumOverall = approvedRatings.reduce((acc, r) => acc + r.overallScore, 0);
      const sumQuality = approvedRatings.reduce((acc, r) => acc + r.qualityScore, 0);
      const sumDelivery = approvedRatings.reduce((acc, r) => acc + r.deliveryScore, 0);
      const sumCommercial = approvedRatings.reduce((acc, r) => acc + r.commercialComplianceScore, 0);
      const sumResp = approvedRatings.reduce((acc, r) => acc + r.responsivenessScore, 0);
      const sumDocs = approvedRatings.reduce((acc, r) => acc + r.documentationClosureScore, 0);

      averageOverall = Math.round((sumOverall / ppoRatingsCount) * 10) / 10;
      avgQuality = Math.round((sumQuality / ppoRatingsCount) * 10) / 10;
      avgDelivery = Math.round((sumDelivery / ppoRatingsCount) * 10) / 10;
      avgCommercial = Math.round((sumCommercial / ppoRatingsCount) * 10) / 10;
      avgResponsiveness = Math.round((sumResp / ppoRatingsCount) * 10) / 10;
      avgDocumentation = Math.round((sumDocs / ppoRatingsCount) * 10) / 10;
    }

    return apiSuccess({
      ratings,
      summary: {
        ppoRatingsCount,
        averageOverall,
        avgQuality,
        avgDelivery,
        avgCommercial,
        avgResponsiveness,
        avgDocumentation,
      },
      userRole: ctx.role,
      isProcurementUser,
    });
  } catch (error: any) {
    console.error('Error fetching PPO vendor ratings:', error);
    return apiError(error.message || 'Failed to fetch PPO ratings', 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_RATE_PPO');
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role === 'PROCUREMENT_USER') {
    return apiError('Forbidden: Procurement users have read-only access to vendor ratings.', 403);
  }

  const { id } = await params;

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
      return apiError('Vendor not found or access denied.', 404);
    }

    const body = await req.json();
    const {
      ppoId,
      qualityScore = 3, // 1 to 5 (30%)
      deliveryScore = 3, // 1 to 5 (25%)
      commercialComplianceScore = 3, // 1 to 5 (20%)
      responsivenessScore = 3, // 1 to 5 (15%)
      documentationClosureScore = 3, // 1 to 5 (10%)
      comments,
      supportingEvidence,
      qualityComments = '',
      deliveryComments = '',
      commercialComments = '',
      documentationComments = '',
      responsivenessComments = '',
      overallImprovement = '',
      action = 'SUBMIT', // 'SAVE_DRAFT' | 'SUBMIT'
      markPpoCompleted = true,
    } = body;

    if (!ppoId) {
      return apiError('PPO ID is required to record performance evaluation.', 400);
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
      return apiError('PPO not found or does not belong to this vendor.', 404);
    }

    // Business Rule: PPO must be eligible (not DRAFT or CANCELLED)
    if (ppo.status === 'DRAFT' || ppo.status === 'CANCELLED') {
      return apiError(`PPO ${ppo.ppoNumber} is in ${ppo.status} status and is not eligible for performance evaluation.`, 400);
    }

    // Security Rule: Project scope authorization check
    const isAuthorized = await isUserAuthorizedForProject(ctx.userId, ctx.role, ppo.projectId);
    if (!isAuthorized) {
      return apiError('Access denied: You are not authorised to evaluate PPOs for this project.', 403);
    }

    // Check for existing rating for this PPO & enforce immutability
    const existingRating = await prisma.ppoVendorRating.findUnique({
      where: { ppoId },
    });

    if (existingRating) {
      if (existingRating.status === 'APPROVED' || existingRating.status === 'REJECTED') {
        return apiError(`PPO ${ppo.ppoNumber} assessment is in ${existingRating.status} status and is locked against modifications.`, 400);
      }
      if (existingRating.status === 'SUBMITTED') {
        return apiError(`PPO ${ppo.ppoNumber} assessment is currently submitted and under Project Approver review. It cannot be modified until reviewed or returned.`, 400);
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
      if (!overallImprovement && !comments && !qualityComments) {
        return apiError('Please provide feedback or areas for improvement before submitting for Project Approval.', 400);
      }
    }

    // Build criteria details JSON
    let existingCriteria: any = {};
    if (existingRating?.criteriaDetails) {
      try {
        existingCriteria = typeof existingRating.criteriaDetails === 'string' ? JSON.parse(existingRating.criteriaDetails) : existingRating.criteriaDetails;
      } catch {
        existingCriteria = {};
      }
    }

    const history = existingCriteria.history || [];
    history.push({
      action: isDraft ? 'DRAFT_SAVED' : (existingRating?.status === 'RETURNED_FOR_CORRECTION' ? 'RESUBMITTED' : 'SUBMITTED'),
      performedBy: ctx.userId,
      performedByName: ctx.userName || 'Project User',
      performedByRole: ctx.role,
      timestamp: new Date().toISOString(),
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
      notes: comments || overallImprovement || null,
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

    let rating: any;

    if (existingRating) {
      // Update existing draft or returned rating
      rating = await prisma.ppoVendorRating.update({
        where: { id: existingRating.id },
        data: {
          qualityScore: q,
          deliveryScore: d,
          commercialComplianceScore: c,
          responsivenessScore: r,
          documentationClosureScore: doc,
          overallScore,
          comments: comments || overallImprovement || null,
          supportingEvidence: supportingEvidence || null,
          criteriaDetails: JSON.stringify(criteriaDetails),
          status: newStatus,
          ratedBy: ctx.userId,
          ratedAt: new Date(),
        },
      });
    } else {
      // Create new rating
      rating = await prisma.ppoVendorRating.create({
        data: {
          tenantId: ctx.tenantId,
          vendorId: vendor.id,
          ppoId: ppo.id,
          projectId: ppo.projectId,
          costCentreId: ppo.costCentreId,
          qualityScore: q,
          deliveryScore: d,
          commercialComplianceScore: c,
          responsivenessScore: r,
          documentationClosureScore: doc,
          overallScore,
          comments: comments || overallImprovement || null,
          supportingEvidence: supportingEvidence || null,
          criteriaDetails: JSON.stringify(criteriaDetails),
          status: newStatus,
          ratedBy: ctx.userId,
          ratedAt: new Date(),
        },
      });
    }

    // Mark PPO completed if submitted, requested, and not yet marked
    if (!isDraft && markPpoCompleted && ppo.status !== 'COMPLETED') {
      await prisma.ppo.update({
        where: { id: ppo.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    // Create Audit Log
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendor.id,
      action: isDraft ? 'PPO_RATING_DRAFT_SAVED' : 'PPO_RATING_SUBMITTED',
      description: isDraft
        ? `Draft performance assessment saved for PPO ${ppo.ppoNumber} against vendor ${vendor.name} (Score: ${overallScore}/5.0)`
        : `Performance assessment submitted for Project Approval for PPO ${ppo.ppoNumber} against vendor ${vendor.name} (Score: ${overallScore}/5.0)`,
      newValue: {
        ppoNumber: ppo.ppoNumber,
        status: newStatus,
        overallScore,
        ratingId: rating.id,
      },
    });

    // Notify Project Approver if submitted
    if (!isDraft) {
      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          targetRole: 'PROJECT_APPROVER',
          title: `Vendor Performance Review Submitted: ${ppo.ppoNumber}`,
          message: `${ctx.userName || 'Project User'} submitted a ${overallScore}/5.0 performance rating for vendor "${vendor.name}" on PPO ${ppo.ppoNumber}.`,
          type: 'ACTION_REQUIRED',
          entityType: 'PPO',
          entityId: ppo.id,
          recordNumber: ppo.ppoNumber,
          link: `/approvals/vendor-ratings`,
        },
      });
    }

    return apiSuccess({
      rating,
      message: isDraft
        ? `Draft rating for PPO ${ppo.ppoNumber} saved successfully.`
        : `Performance assessment for PPO ${ppo.ppoNumber} submitted for Project Approval.`,
    }, 201);
  } catch (error: any) {
    console.error('Error submitting PPO vendor rating:', error);
    return apiError(error.message || 'Failed to submit PPO rating', 500);
  }
}
