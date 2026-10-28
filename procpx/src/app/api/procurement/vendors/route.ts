// src/app/api/procurement/vendors/route.ts
// Enterprise Vendor Management API (Directory & Immediate Onboarding)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('VENDOR_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const vendorType = searchParams.get('vendorType'); // CLIENT_VENDOR | PROCUCEV_VENDOR | ALL
  const qualificationStatus = searchParams.get('qualificationStatus');
  const onboardingStatus = searchParams.get('onboardingStatus');
  const category = searchParams.get('category');
  const region = searchParams.get('region');
  const status = searchParams.get('status');
  const search = searchParams.get('search') || '';

  try {
    // Tenant Isolation:
    // Client Vendors belong exclusively to this tenant.
    // Procucev Vendors are sourced through the shared vendor network and accessible to eligible clients.
    const where: any = {
      OR: [
        { tenantId: ctx.tenantId },
        { vendorType: 'PROCUCEV_VENDOR' },
      ],
    };

    if (vendorType && vendorType !== 'ALL') {
      where.vendorType = vendorType;
      // If asking specifically for Client Vendors, restrict strictly to current tenant
      if (vendorType === 'CLIENT_VENDOR') {
        where.tenantId = ctx.tenantId;
        delete where.OR;
      }
    }

    if (qualificationStatus && qualificationStatus !== 'ALL') {
      where.qualificationStatus = qualificationStatus;
    }

    if (onboardingStatus && onboardingStatus !== 'ALL') {
      where.onboardingStatus = onboardingStatus;
    }

    if (category && category !== 'ALL') {
      where.categories = { contains: category };
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    const andConditions: any[] = [];

    if (region && region !== 'ALL') {
      andConditions.push({
        OR: [
          { operatingLocation: { contains: region } },
          { city: { contains: region } },
          { state: { contains: region } },
        ],
      });
    }

    if (search.trim()) {
      const q = search.trim();
      andConditions.push({
        OR: [
          { name: { contains: q } },
          { code: { contains: q } },
          { categories: { contains: q } },
          { city: { contains: q } },
          { contactPerson: { contains: q } },
          { gstin: { contains: q } },
          { operatingLocation: { contains: q } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const vendors = await prisma.vendor.findMany({
      where,
      include: {
        _count: {
          select: {
            ppos: true,
            evaluations: true,
            ppoRatings: true,
          },
        },
        ppoRatings: {
          where: { status: 'APPROVED' },
          select: {
            overallScore: true,
            qualityScore: true,
            deliveryScore: true,
            commercialComplianceScore: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });

    // Compute vendor performance metrics and counts
    const enrichedVendors = vendors.map(v => {
      const ratings = v.ppoRatings || [];
      const ppoRatingsCount = ratings.length;
      let averagePpoRating: number | null = null;
      if (ppoRatingsCount > 0) {
        const sum = ratings.reduce((acc, r) => acc + r.overallScore, 0);
        averagePpoRating = Math.round((sum / ppoRatingsCount) * 10) / 10;
      }

      let parsedCategories: string[] = [];
      if (Array.isArray(v.categories)) {
        parsedCategories = v.categories;
      } else if (typeof v.categories === 'string' && v.categories.trim()) {
        try {
          const parsed = JSON.parse(v.categories);
          parsedCategories = Array.isArray(parsed) ? parsed : [v.categories];
        } catch {
          parsedCategories = v.categories.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      return {
        ...v,
        categories: parsedCategories,
        rawCategories: v.categories,
        ppoRatingsCount,
        averagePpoRating,
      };
    });

    // Aggregate counts for directory tabs
    const allTenantVendors = await prisma.vendor.findMany({
      where: {
        OR: [
          { tenantId: ctx.tenantId },
          { vendorType: 'PROCUCEV_VENDOR' },
        ],
      },
      select: {
        id: true,
        vendorType: true,
        qualificationStatus: true,
      },
    });

    const counts = {
      total: allTenantVendors.length,
      clientVendorsCount: allTenantVendors.filter(v => v.vendorType !== 'PROCUCEV_VENDOR').length,
      procucevVendorsCount: allTenantVendors.filter(v => v.vendorType === 'PROCUCEV_VENDOR').length,
      qualifiedCount: allTenantVendors.filter(v => v.qualificationStatus === 'QUALIFIED').length,
      pendingReviewCount: allTenantVendors.filter(v => v.qualificationStatus === 'PENDING_REVIEW' || v.qualificationStatus === 'EVALUATION_IN_PROGRESS').length,
      notEvaluatedCount: allTenantVendors.filter(v => v.qualificationStatus === 'NOT_EVALUATED' || !v.qualificationStatus).length,
    };

    return apiSuccess({ vendors: enrichedVendors, counts, total: enrichedVendors.length });
  } catch (error: any) {
    console.error('Error fetching vendors:', error);
    return apiError(error.message || 'Failed to fetch vendors', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('VENDOR_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const {
      name,
      vendorType = 'CLIENT_VENDOR', // CLIENT_VENDOR | PROCUCEV_VENDOR
      contactPerson,
      email,
      phone,
      category,
      operatingLocation,
      city,
      state,
      country = 'India',
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
      isDraft = false,
    } = body;

    // Validate Step 1 Mandatory Fields
    if (!name || name.trim() === '') {
      return apiError('Vendor Legal / Business Name is required.', 400);
    }
    if (!vendorType || !['CLIENT_VENDOR', 'PROCUCEV_VENDOR'].includes(vendorType)) {
      return apiError('Vendor Type must be either Client Vendor or Procucev Vendor.', 400);
    }
    if (!contactPerson || contactPerson.trim() === '') {
      return apiError('Primary Contact Name is required.', 400);
    }
    if ((!email || email.trim() === '') && (!phone || phone.trim() === '')) {
      return apiError('Primary Mobile Number or Email is required.', 400);
    }
    if (!category || category.trim() === '') {
      return apiError('Primary Product / Service Category is required.', 400);
    }
    if (!operatingLocation && !city) {
      return apiError('Operating Location is required.', 400);
    }

    // Check if an existing vendor record was supplied to update rather than creating a duplicate
    const existingVendor = body.id
      ? await prisma.vendor.findFirst({
          where: {
            id: body.id,
            OR: [
              { tenantId: ctx.tenantId },
              { vendorType: 'PROCUCEV_VENDOR' },
            ],
          },
        })
      : null;

    // Determine Onboarding Status:
    // If user explicitly chose draft or left key business profile fields incomplete -> 'PROFILE_INCOMPLETE' or 'DRAFT'
    // Basic onboarding is NEVER treated as qualification (qualificationStatus defaults to 'NOT_EVALUATED').
    const hasBusinessProfile = !!(legalStructure || gstin || pan || address);
    const onboardingStatus = isDraft
      ? 'DRAFT'
      : hasBusinessProfile
        ? 'ONBOARDED'
        : 'PROFILE_INCOMPLETE';

    if (existingVendor) {
      const updated = await prisma.vendor.update({
        where: { id: existingVendor.id },
        data: {
          name: name ? name.trim() : existingVendor.name,
          vendorType: vendorType || existingVendor.vendorType,
          contactPerson: contactPerson ? contactPerson.trim() : existingVendor.contactPerson,
          email: email ? email.trim() : existingVendor.email,
          phone: phone !== undefined ? (phone ? phone.trim() : null) : existingVendor.phone,
          categories: category ? category.trim() : existingVendor.categories,
          operatingLocation: operatingLocation ? operatingLocation.trim() : existingVendor.operatingLocation,
          city: city ? city.trim() : (operatingLocation ? operatingLocation.split(',')[0].trim() : existingVendor.city),
          state: state !== undefined ? (state ? state.trim() : null) : existingVendor.state,
          country: country || existingVendor.country || 'India',
          legalStructure: legalStructure || existingVendor.legalStructure,
          gstin: gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : existingVendor.gstin,
          pan: pan !== undefined ? (pan ? pan.trim().toUpperCase() : null) : existingVendor.pan,
          website: website !== undefined ? (website ? website.trim() : null) : existingVendor.website,
          address: address !== undefined ? (address ? address.trim() : null) : existingVendor.address,
          experienceYears: experienceYears !== undefined ? (experienceYears ? Number(experienceYears) : null) : existingVendor.experienceYears,
          turnoverCrores: turnoverCrores !== undefined ? (turnoverCrores ? Number(turnoverCrores) : null) : existingVendor.turnoverCrores,
          capabilities: capabilities !== undefined ? (typeof capabilities === 'string' ? capabilities : JSON.stringify(capabilities)) : existingVendor.capabilities,
          serviceCoverage: serviceCoverage !== undefined ? (typeof serviceCoverage === 'string' ? serviceCoverage : JSON.stringify(serviceCoverage)) : existingVendor.serviceCoverage,
          clientReferences: clientReferences !== undefined ? (typeof clientReferences === 'string' ? clientReferences : JSON.stringify(clientReferences)) : existingVendor.clientReferences,
          certifications: certifications !== undefined ? certifications : existingVendor.certifications,
          onboardingStatus,
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: updated.id,
        action: 'VENDOR_UPDATED',
        description: `Vendor ${updated.name} (${updated.code}) onboarding updated (Status: ${onboardingStatus})`,
        newValue: {
          name: updated.name,
          code: updated.code,
          onboardingStatus: updated.onboardingStatus,
        },
      });

      return apiSuccess({ vendor: updated, message: `Vendor ${updated.code} onboarding updated successfully.` }, 200);
    }

    // Generate unique Vendor Code (VND-XXXX) with collision check
    const existingCodes = await prisma.vendor.findMany({
      where: { tenantId: ctx.tenantId, code: { startsWith: 'VND-' } },
      select: { code: true },
    });
    let maxVndNum = 0;
    for (const v of existingCodes) {
      if (v.code) {
        const match = v.code.match(/^VND-(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxVndNum) maxVndNum = n;
        }
      }
    }
    let nextVndNum = maxVndNum + 1;
    let code = `VND-${String(nextVndNum).padStart(4, '0')}`;
    while (await prisma.vendor.findFirst({ where: { tenantId: ctx.tenantId, code }, select: { id: true } })) {
      nextVndNum++;
      code = `VND-${String(nextVndNum).padStart(4, '0')}`;
    }

    const vendor = await prisma.vendor.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        name: name.trim(),
        vendorType,
        contactPerson: contactPerson.trim(),
        email: email ? email.trim() : `contact@${code.toLowerCase()}.in`,
        phone: phone ? phone.trim() : null,
        categories: category.trim(),
        operatingLocation: operatingLocation ? operatingLocation.trim() : `${city || ''}, ${state || ''}`.trim(),
        city: city ? city.trim() : (operatingLocation ? operatingLocation.split(',')[0].trim() : null),
        state: state ? state.trim() : null,
        country: country || 'India',
        legalStructure: legalStructure || null,
        gstin: gstin ? gstin.trim().toUpperCase() : null,
        pan: pan ? pan.trim().toUpperCase() : null,
        website: website ? website.trim() : null,
        address: address ? address.trim() : null,
        experienceYears: experienceYears ? Number(experienceYears) : 3,
        turnoverCrores: turnoverCrores ? Number(turnoverCrores) : null,
        capabilities: capabilities ? (typeof capabilities === 'string' ? capabilities : JSON.stringify(capabilities)) : null,
        serviceCoverage: serviceCoverage ? (typeof serviceCoverage === 'string' ? serviceCoverage : JSON.stringify(serviceCoverage)) : null,
        clientReferences: clientReferences ? (typeof clientReferences === 'string' ? clientReferences : JSON.stringify(clientReferences)) : null,
        certifications: certifications || null,
        onboardingStatus,
        qualificationStatus: 'NOT_EVALUATED',
        complianceStatus: 'COMPLIANT',
        empanelmentStatus: 'PENDING',
        status: 'ACTIVE',
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendor.id,
      action: 'VENDOR_CREATED',
      description: `Vendor ${vendor.name} (${vendor.code}) onboarded as ${vendor.vendorType === 'CLIENT_VENDOR' ? 'Client Vendor' : 'Procucev Vendor'} (Status: ${onboardingStatus})`,
      newValue: {
        name: vendor.name,
        code: vendor.code,
        vendorType: vendor.vendorType,
        onboardingStatus: vendor.onboardingStatus,
        qualificationStatus: vendor.qualificationStatus,
      },
    });

    return apiSuccess({ vendor, message: `Vendor ${vendor.code} onboarded successfully.` }, 201);
  } catch (error: any) {
    console.error('Error creating vendor:', error);
    return apiError(error.message || 'Failed to onboard vendor', 500);
  }
}
