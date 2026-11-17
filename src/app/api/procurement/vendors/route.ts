// src/app/api/procurement/vendors/route.ts
// Enterprise Vendor Management API (Directory & Immediate Onboarding)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { runAuditedD1UpdateAtomically } from '@/lib/audited-update';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { getListPageWindow } from '@/lib/api-utils';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { VENDOR_DIRECTORY_MAX_SEARCH_LENGTH } from './route.constants';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  VENDOR_CREATE_AUDIT_INSERT_AFTER_CHANGE_SQL,
  VENDOR_INSERT_NEXT_CODE_SQL,
  VENDOR_NORMALIZED_NAME_EXISTS_SQL,
} from '@/lib/d1-batch.constants';
import type { Prisma } from '@prisma/client';
import { readByD1FilterChunks } from '@/lib/d1-query';

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  return value.code === 'P2002' || (typeof value.message === 'string' && /unique constraint|unique failed/i.test(value.message));
}

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
  const search = (searchParams.get('search') || '').trim().slice(0, VENDOR_DIRECTORY_MAX_SEARCH_LENGTH);
  const pageWindow = getListPageWindow(searchParams);
  const pageSize = pageWindow.pageSize;

  try {
    // Tenant Isolation:
    // Client Vendors belong exclusively to this tenant.
    // Procucev Vendors are sourced through the shared vendor network and accessible to eligible clients.
    const where: Prisma.VendorWhereInput = {
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

    const andConditions: Prisma.VendorWhereInput[] = [];

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

    const vendorScopeWhere: Prisma.VendorWhereInput = {
      OR: [
        { tenantId: ctx.tenantId },
        { vendorType: 'PROCUCEV_VENDOR' },
      ],
    };

    const [vendorRows, total, groupedCounts] = await Promise.all([
      prisma.vendor.findMany({
        where,
        skip: pageWindow.skip,
        take: pageSize + 1,
        select: {
          id: true,
          code: true,
          name: true,
          contactPerson: true,
          phone: true,
          city: true,
          state: true,
          categories: true,
          vendorType: true,
          onboardingStatus: true,
          qualificationStatus: true,
          qualificationScore: true,
          gstin: true,
          operatingLocation: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }, { id: 'desc' }],
      }),
      prisma.vendor.count({ where }),
      prisma.vendor.groupBy({
        by: ['vendorType', 'qualificationStatus'],
        where: vendorScopeWhere,
        _count: { _all: true },
      }),
    ]);
    const hasMore = vendorRows.length > pageSize;
    const vendors = hasMore ? vendorRows.slice(0, pageSize) : vendorRows;
    const pageVendorIds = vendors.map((vendor) => vendor.id);
    const approvedRatingAggregates = pageVendorIds.length > 0
      ? await readByD1FilterChunks(pageVendorIds, (chunk) => prisma.ppoVendorRating.groupBy({
          by: ['vendorId'],
          where: {
            tenantId: ctx.tenantId,
            status: 'APPROVED',
            vendorId: { in: chunk },
          },
          _count: { _all: true },
          _avg: { overallScore: true },
        }))
      : [];
    const ratingSummaryByVendor = new Map(approvedRatingAggregates.map((rating) => [
      rating.vendorId,
      {
        count: Number(rating._count._all || 0),
        average: rating._avg.overallScore,
      },
    ]));

    // Keep only bounded rating summaries in memory; the rating history remains in D1.
    const enrichedVendors = vendors.map(v => {
      const ratingSummary = ratingSummaryByVendor.get(v.id);
      const ppoRatingsCount = ratingSummary?.count || 0;
      const averagePpoRating = ratingSummary?.average == null
        ? null
        : Math.round(ratingSummary.average * 10) / 10;

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

    const counts = groupedCounts.reduce((summary, group) => {
      const count = Number(group._count._all || 0);
      summary.total += count;
      if (group.vendorType === 'PROCUCEV_VENDOR') summary.procucevVendorsCount += count;
      else summary.clientVendorsCount += count;
      if (group.qualificationStatus === 'QUALIFIED') summary.qualifiedCount += count;
      if (group.qualificationStatus === 'PENDING_REVIEW' || group.qualificationStatus === 'EVALUATION_IN_PROGRESS') {
        summary.pendingReviewCount += count;
      }
      if (group.qualificationStatus === 'NOT_EVALUATED' || !group.qualificationStatus) summary.notEvaluatedCount += count;
      return summary;
    }, {
      total: 0,
      clientVendorsCount: 0,
      procucevVendorsCount: 0,
      qualifiedCount: 0,
      pendingReviewCount: 0,
      notEvaluatedCount: 0,
    });

    return apiSuccess({
      vendors: enrichedVendors,
      counts,
      total,
      pagination: { page: pageWindow.page, pageSize, hasMore },
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor.directory_read_failed', {
      operation: 'list_vendors',
      route: '/api/procurement/vendors',
      requestId: req.headers.get('x-request-id') || null,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      page: pageWindow.page,
      pageSize,
      searchLength: search.length,
      vendorType,
      qualificationStatus,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchVendors, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('VENDOR_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  let vendorId: string | null = null;
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
    vendorId = typeof body.id === 'string' ? body.id : null;

    // Validate Step 1 Mandatory Fields
    if (!name || name.trim() === '') {
      return apiError(UI_STRINGS.appApiProcurementVendorsRoute.vendorLegalBusinessNameIsRequired, 400, { route: '/api/procurement/vendors', method: 'POST' });
    }
    if (!vendorType || !['CLIENT_VENDOR', 'PROCUCEV_VENDOR'].includes(vendorType)) {
      return apiError(UI_STRINGS.appApiProcurementVendorsRoute.vendorTypeMustBeEitherClientVendorOrProcucevVendor, 400, { route: '/api/procurement/vendors', method: 'POST' });
    }
    if (!contactPerson || contactPerson.trim() === '') {
      return apiError(UI_STRINGS.appApiProcurementVendorsRoute.primaryContactNameIsRequired, 400, { route: '/api/procurement/vendors', method: 'POST' });
    }
    if ((!email || email.trim() === '') && (!phone || phone.trim() === '')) {
      return apiError(UI_STRINGS.appApiProcurementVendorsRoute.primaryMobileNumberOrEmailIsRequired, 400, { route: '/api/procurement/vendors', method: 'POST' });
    }
    if (!category || category.trim() === '') {
      return apiError(UI_STRINGS.appApiProcurementVendorsRoute.primaryProductServiceCategoryIsRequired, 400, { route: '/api/procurement/vendors', method: 'POST' });
    }
    if (!operatingLocation && !city) {
      return apiError(UI_STRINGS.appApiProcurementVendorsRoute.operatingLocationIsRequired, 400, { route: '/api/procurement/vendors', method: 'POST' });
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
      const updateData = {
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
      };
      const updated = await runAuditedD1UpdateAtomically({
        table: 'vendor',
        id: existingVendor.id,
        tenantId: ctx.tenantId,
        data: updateData,
        route: '/api/procurement/vendors',
        requestId: req.headers.get('x-request-id'),
        audit: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          entityType: 'VENDOR',
          entityId: existingVendor.id,
          action: 'VENDOR_UPDATED',
          description: interpolateUiString(UI_STRINGS.appApiProcurementVendorsRoute.vendorNameCodeOnboardingUpdatedStatusOnboardingStatus, { "name": updateData.name, "code": existingVendor.code, "onboardingStatus": onboardingStatus }),
          newValue: {
            name: updateData.name,
            code: existingVendor.code,
            onboardingStatus: updateData.onboardingStatus,
          },
        },
      });
      vendorId = updated.id;

      return apiSuccess({ vendor: updated, message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsRoute.vendorCodeOnboardingUpdatedSuccessfully, { "code": updated.code }) }, 200);
    }

    // Allocate the next code, create the vendor, and write its audit event in
    // one D1 batch. This avoids a tenant-wide code scan and the race between a
    // separate code check, insert, and audit write.
    vendorId = crypto.randomUUID();
    const createdAt = new Date();
    const descriptionTemplate = interpolateUiString(
      UI_STRINGS.appApiProcurementVendorsRoute.vendorNameCodeOnboardedAsValue3StatusOnboardingStatus,
      {
        name: '__D1_VENDOR_NAME__',
        code: '__D1_VENDOR_CODE__',
        value3: '__D1_VENDOR_TYPE__',
        onboardingStatus: '__D1_VENDOR_ONBOARDING_STATUS__',
      },
    );
    let insertedVendor: { id?: string; code?: string; name?: string } | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const batchResults = await writeD1BatchAtomically([
        {
          sql: VENDOR_INSERT_NEXT_CODE_SQL,
          values: [
            ctx.tenantId, vendorId, ctx.tenantId, name.trim(), vendorType, contactPerson.trim(), email ? email.trim() : null,
            phone ? phone.trim() : null, category.trim(), operatingLocation ? operatingLocation.trim() : `${city || ''}, ${state || ''}`.trim(),
            city ? city.trim() : (operatingLocation ? operatingLocation.split(',')[0].trim() : null), state ? state.trim() : null,
            country || 'India', legalStructure || null, gstin ? gstin.trim().toUpperCase() : null,
            pan ? pan.trim().toUpperCase() : null, website ? website.trim() : null, address ? address.trim() : null,
            experienceYears ? Number(experienceYears) : 3, turnoverCrores ? Number(turnoverCrores) : null,
            capabilities ? (typeof capabilities === 'string' ? capabilities : JSON.stringify(capabilities)) : null,
            serviceCoverage ? (typeof serviceCoverage === 'string' ? serviceCoverage : JSON.stringify(serviceCoverage)) : null,
            clientReferences ? (typeof clientReferences === 'string' ? clientReferences : JSON.stringify(clientReferences)) : null,
            certifications ? (typeof certifications === 'string' ? certifications : JSON.stringify(certifications)) : null,
            onboardingStatus, 'NOT_EVALUATED', 'COMPLIANT', 'PENDING', 'ACTIVE', createdAt, createdAt, ctx.tenantId,
          ],
        },
        {
          sql: VENDOR_CREATE_AUDIT_INSERT_AFTER_CHANGE_SQL,
          values: [vendorId, ctx.tenantId, crypto.randomUUID(), ctx.tenantId, ctx.userId, descriptionTemplate, createdAt],
        },
        {
          sql: VENDOR_NORMALIZED_NAME_EXISTS_SQL,
          values: [ctx.tenantId, name.trim()],
        },
      ]);
      insertedVendor = batchResults[0]?.results?.[0] as { id?: string; code?: string; name?: string } | undefined;
      const insertChanges = Number(batchResults[0]?.meta?.changes || 0);
      const auditChanges = Number(batchResults[1]?.meta?.changes || 0);
      if (insertChanges === 1 && auditChanges === 1
        && insertedVendor?.id === vendorId && insertedVendor.code) break;
      if (insertChanges !== 0 || auditChanges !== 0) {
        throw new Error(UI_STRINGS.appApiProcurementVendorsRoute.vendorAndAuditWriteDidNotCommitAsExpected);
      }

      const duplicateName = batchResults[2]?.results?.[0] as { id?: string } | undefined;
      if (duplicateName?.id) {
        try {
          await writeStructuredLog('warn', 'vendor.duplicate_name_conflict', {
            operation: 'create_vendor', route: '/api/procurement/vendors',
            requestId: req.headers.get('x-request-id') || null,
            tenantId: ctx.tenantId, userId: ctx.userId, duplicateVendorId: duplicateName.id,
          });
        } catch {
          // Keep the conflict response stable if optional log storage is unavailable.
        }
        return apiError(UI_STRINGS.appApiProcurementVendorsRoute.vendorNameAlreadyExistsForThisTenant, 409);
      }

      if (attempt === 2) {
        throw new Error(UI_STRINGS.appApiProcurementVendorsRoute.vendorAndAuditWriteDidNotCommitAsExpected);
      }
    }
    if (!insertedVendor?.code) throw new Error(UI_STRINGS.appApiProcurementVendorsRoute.vendorAndAuditWriteDidNotCommitAsExpected);

    // Prisma gives the API its normal typed row shape. If the follow-up read is
    // temporarily unavailable, use the row returned by the committed insert
    // so the client does not retry a vendor that was already created.
    let vendor: typeof insertedVendor = insertedVendor;
    try {
      const persistedVendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
      if (persistedVendor) vendor = persistedVendor;
    } catch (readError) {
      try {
        await writeStructuredLog('warn', 'vendor.created_read_fallback', {
          operation: 'read_created_vendor',
          route: '/api/procurement/vendors',
          requestId: req.headers.get('x-request-id') || null,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          vendorId,
          error: readError instanceof Error
            ? { name: readError.name, message: readError.message.slice(0, 300) }
            : { type: typeof readError },
        });
      } catch {
        // The D1 commit succeeded; a logging sink failure must not prompt the client to retry it.
      }
    }

    return apiSuccess({ vendor, message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsRoute.vendorCodeOnboardedSuccessfully, { "code": insertedVendor.code }) }, 201);
  } catch (error) {
    const uniqueConflict = isUniqueConstraintError(error);
    try {
      await writeStructuredLog(uniqueConflict ? 'warn' : 'error', uniqueConflict ? 'vendor.duplicate_name_conflict' : 'vendor.onboarding_failed', {
        operation: 'create_or_update_vendor',
        route: '/api/procurement/vendors',
        requestId: req.headers.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        vendorId,
        error: error instanceof Error
          ? { name: error.name, message: error.message.slice(0, 400) }
          : { type: typeof error },
      });
    } catch {
      // Preserve the database outcome if optional log storage is unavailable.
    }
    if (uniqueConflict) return apiError(UI_STRINGS.appApiProcurementVendorsRoute.vendorNameAlreadyExistsForThisTenant, 409);
    return apiError(UI_STRINGS.common.userMessages.failedToOnboardVendor, 500);
  }
}
