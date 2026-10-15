// src/app/api/procurement/vendors/[id]/ppo-ratings/route.ts
// Individual PPO-Level Vendor Performance Rating API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const ratings = await prisma.ppoVendorRating.findMany({
      where: {
        vendorId: id,
        tenantId: ctx.tenantId,
      },
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

    const ppoRatingsCount = ratings.length;
    let averageOverall: number | null = null;
    let avgQuality: number | null = null;
    let avgDelivery: number | null = null;
    let avgCommercial: number | null = null;
    let avgResponsiveness: number | null = null;
    let avgDocumentation: number | null = null;

    if (ppoRatingsCount > 0) {
      const sumOverall = ratings.reduce((acc, r) => acc + r.overallScore, 0);
      const sumQuality = ratings.reduce((acc, r) => acc + r.qualityScore, 0);
      const sumDelivery = ratings.reduce((acc, r) => acc + r.deliveryScore, 0);
      const sumCommercial = ratings.reduce((acc, r) => acc + r.commercialComplianceScore, 0);
      const sumResp = ratings.reduce((acc, r) => acc + r.responsivenessScore, 0);
      const sumDocs = ratings.reduce((acc, r) => acc + r.documentationClosureScore, 0);

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
      qualityScore, // 1 to 5 (30%)
      deliveryScore, // 1 to 5 (25%)
      commercialComplianceScore, // 1 to 5 (20%)
      responsivenessScore, // 1 to 5 (15%)
      documentationClosureScore, // 1 to 5 (10%)
      comments,
      supportingEvidence,
      criteriaDetails,
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
    });

    if (!ppo) {
      return apiError('PPO not found or does not belong to this vendor.', 404);
    }

    // Check for existing rating to prevent duplicate ratings without explicit revision
    const existingRating = await prisma.ppoVendorRating.findUnique({
      where: { ppoId },
    });

    if (existingRating) {
      return apiError(`PPO ${ppo.ppoNumber} has already been rated with score ${existingRating.overallScore}/5.0. Duplicate ratings are prohibited.`, 400);
    }

    // Validate scores (each 1 to 5)
    const q = Math.min(5, Math.max(1, Number(qualityScore) || 3));
    const d = Math.min(5, Math.max(1, Number(deliveryScore) || 3));
    const c = Math.min(5, Math.max(1, Number(commercialComplianceScore) || 3));
    const r = Math.min(5, Math.max(1, Number(responsivenessScore) || 3));
    const doc = Math.min(5, Math.max(1, Number(documentationClosureScore) || 3));

    // Weighted Overall Score: Quality 30%, Delivery 25%, Commercial 20%, Responsiveness 15%, Documentation 10%
    const overallScore = Math.round(
      ((q * 0.30) + (d * 0.25) + (c * 0.20) + (r * 0.15) + (doc * 0.10)) * 10
    ) / 10;

    // Create the PPO Vendor Performance Rating
    const rating = await prisma.ppoVendorRating.create({
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
        comments: comments || null,
        supportingEvidence: supportingEvidence || null,
        criteriaDetails: criteriaDetails ? (typeof criteriaDetails === 'string' ? criteriaDetails : JSON.stringify(criteriaDetails)) : null,
        status: 'SUBMITTED',
        ratedBy: ctx.userId,
        ratedAt: new Date(),
      },
    });

    // Mark PPO completed if requested and not yet marked
    if (markPpoCompleted && ppo.status !== 'COMPLETED') {
      await prisma.ppo.update({
        where: { id: ppo.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    // Recalculate vendor's average performance score in the database
    const allRatings = await prisma.ppoVendorRating.findMany({
      where: { vendorId: vendor.id },
      select: { overallScore: true },
    });
    const avgScore = allRatings.length > 0
      ? Math.round((allRatings.reduce((acc, cur) => acc + cur.overallScore, 0) / allRatings.length) * 10) / 10
      : overallScore;

    // Convert 1-5 rating into percentage (e.g. 4.0 / 5.0 -> 80%) for the vendor performance score field
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        performanceScore: Math.round(avgScore * 20),
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendor.id,
      action: 'PPO_VENDOR_RATED',
      description: `Performance evaluation recorded for PPO ${ppo.ppoNumber} against vendor ${vendor.name} (Overall: ${overallScore}/5.0, Quality: ${q}/5, Delivery: ${d}/5, Commercial: ${c}/5)`,
      newValue: {
        ppoNumber: ppo.ppoNumber,
        overallScore,
        ratingId: rating.id,
      },
    });

    return apiSuccess({
      rating,
      message: `Performance evaluation recorded for PPO ${ppo.ppoNumber} with score ${overallScore}/5.0.`,
    }, 201);
  } catch (error: any) {
    console.error('Error submitting PPO vendor rating:', error);
    return apiError(error.message || 'Failed to submit PPO rating', 500);
  }
}
