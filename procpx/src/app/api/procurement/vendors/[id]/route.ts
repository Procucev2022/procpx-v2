// src/app/api/procurement/vendors/[id]/route.ts
// Consolidated Vendor Profile API (Overview, Evaluations, PPO Ratings, Audit)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_VIEW');
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
      include: {
        evaluations: {
          orderBy: { createdAt: 'desc' },
        },
        ppoRatings: {
          include: {
            ppo: {
              select: {
                id: true,
                ppoNumber: true,
                title: true,
                totalValue: true,
                status: true,
                completedAt: true,
                project: {
                  select: { id: true, name: true, projectCode: true },
                },
                costCentre: {
                  select: { id: true, name: true, code: true },
                },
              },
            },
          },
          orderBy: { ratedAt: 'desc' },
        },
        ppos: {
          select: {
            id: true,
            ppoNumber: true,
            title: true,
            totalValue: true,
            status: true,
            issuedAt: true,
            completedAt: true,
            project: { select: { id: true, name: true, projectCode: true } },
            costCentre: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!vendor) {
      return apiError('Vendor not found or access denied.', 404);
    }

    // Identify eligible completed PPOs for performance evaluation
    // (PPOs with status COMPLETED or ISSUED that have not yet been rated)
    const ratedPpoIds = new Set(vendor.ppoRatings.map(r => r.ppoId));
    const eligiblePposToRate = vendor.ppos.filter(p => !ratedPpoIds.has(p.id));

    // Calculate aggregated PPO performance metrics
    const ratings = vendor.ppoRatings;
    const ppoRatingsCount = ratings.length;
    let averagePpoRating: number | null = null;
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
      const sumResponsiveness = ratings.reduce((acc, r) => acc + r.responsivenessScore, 0);
      const sumDocumentation = ratings.reduce((acc, r) => acc + r.documentationClosureScore, 0);

      averagePpoRating = Math.round((sumOverall / ppoRatingsCount) * 10) / 10;
      avgQuality = Math.round((sumQuality / ppoRatingsCount) * 10) / 10;
      avgDelivery = Math.round((sumDelivery / ppoRatingsCount) * 10) / 10;
      avgCommercial = Math.round((sumCommercial / ppoRatingsCount) * 10) / 10;
      avgResponsiveness = Math.round((sumResponsiveness / ppoRatingsCount) * 10) / 10;
      avgDocumentation = Math.round((sumDocumentation / ppoRatingsCount) * 10) / 10;
    }

    // Fetch audit history for this vendor
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityId: id,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return apiSuccess({
      vendor,
      eligiblePposToRate,
      performanceSummary: {
        ppoRatingsCount,
        averagePpoRating,
        avgQuality,
        avgDelivery,
        avgCommercial,
        avgResponsiveness,
        avgDocumentation,
        mostRecentRating: ratings[0] || null,
      },
      auditLogs,
    });
  } catch (error: any) {
    console.error('Error fetching vendor profile:', error);
    return apiError(error.message || 'Failed to fetch vendor profile', 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  // Authorisation:
  // Internal managers require VENDOR_MANAGE.
  // Vendor users can only edit their own profile (requires VENDOR_PROFILE_EDIT and ctx.vendorId === id).
  const isInternalManager = hasPermission(ctx.role, 'VENDOR_MANAGE');
  const isVendorSelf = ctx.role === 'VENDOR' && hasPermission(ctx.role, 'VENDOR_PROFILE_EDIT') && ctx.vendorId === id;

  if (!isInternalManager && !isVendorSelf) {
    return apiError('Forbidden: insufficient permissions', 403);
  }

  try {
    const existing = await prisma.vendor.findFirst({
      where: {
        id,
        OR: [
          { tenantId: ctx.tenantId },
          { vendorType: 'PROCUCEV_VENDOR' },
        ],
      },
    });

    if (!existing) {
      return apiError('Vendor not found or access denied.', 404);
    }

    const body = await req.json();
    const {
      name,
      contactPerson,
      email,
      phone,
      categories,
      operatingLocation,
      city,
      state,
      country,
      legalStructure,
      gstin,
      pan,
      website,
      address,
      experienceYears,
      turnoverCrores,
      capabilities,
      serviceCoverage,
      clientReferences,
      certifications,
      documents,
      status,
    } = body;

    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        name: name ? name.trim() : existing.name,
        contactPerson: contactPerson !== undefined ? contactPerson : existing.contactPerson,
        email: email ? email.trim() : existing.email,
        phone: phone !== undefined ? phone : existing.phone,
        categories: categories !== undefined ? categories : existing.categories,
        operatingLocation: operatingLocation !== undefined ? operatingLocation : existing.operatingLocation,
        city: city !== undefined ? city : existing.city,
        state: state !== undefined ? state : existing.state,
        country: country !== undefined ? country : existing.country,
        legalStructure: legalStructure !== undefined ? legalStructure : existing.legalStructure,
        gstin: gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : existing.gstin,
        pan: pan !== undefined ? (pan ? pan.trim().toUpperCase() : null) : existing.pan,
        website: website !== undefined ? website : existing.website,
        address: address !== undefined ? address : existing.address,
        experienceYears: experienceYears !== undefined ? (experienceYears ? Number(experienceYears) : null) : existing.experienceYears,
        turnoverCrores: turnoverCrores !== undefined ? (turnoverCrores ? Number(turnoverCrores) : null) : existing.turnoverCrores,
        capabilities: capabilities !== undefined ? (typeof capabilities === 'string' ? capabilities : JSON.stringify(capabilities)) : existing.capabilities,
        serviceCoverage: serviceCoverage !== undefined ? (typeof serviceCoverage === 'string' ? serviceCoverage : JSON.stringify(serviceCoverage)) : existing.serviceCoverage,
        clientReferences: clientReferences !== undefined ? (typeof clientReferences === 'string' ? clientReferences : JSON.stringify(clientReferences)) : existing.clientReferences,
        certifications: certifications !== undefined ? certifications : existing.certifications,
        documents: documents !== undefined ? (typeof documents === 'string' ? documents : JSON.stringify(documents)) : existing.documents,
        status: status || existing.status,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: id,
      action: 'VENDOR_UPDATED',
      description: `Vendor profile ${updated.name} (${updated.code}) updated`,
      oldValue: { name: existing.name, contactPerson: existing.contactPerson },
      newValue: { name: updated.name, contactPerson: updated.contactPerson },
    });

    return apiSuccess({ vendor: updated, message: 'Vendor profile updated successfully.' });
  } catch (error: any) {
    console.error('Error updating vendor profile:', error);
    return apiError(error.message || 'Failed to update vendor profile', 500);
  }
}
