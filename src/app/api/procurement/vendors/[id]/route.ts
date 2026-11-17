// src/app/api/procurement/vendors/[id]/route.ts
// Consolidated Vendor Profile API (Overview, Evaluations, PPO Ratings, Audit)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { hasPermission } from '@/lib/permissions';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import { VENDOR_PROFILE_AUDIT_INSERT_AFTER_UPDATE_SQL, VENDOR_PROFILE_UPDATE_SQL } from './route.constants';

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  return value.code === 'P2002' || (typeof value.message === 'string' && /unique constraint|unique failed/i.test(value.message));
}

function toStoredText(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null || typeof value === 'string') return value;
  return JSON.stringify(value) ?? '';
}


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
      select: {
        id: true,
        code: true,
        name: true,
        vendorType: true,
        onboardingStatus: true,
        qualificationStatus: true,
        qualificationScore: true,
        qualificationDecision: true,
        performanceScore: true,
        contactPerson: true,
        email: true,
        phone: true,
        categories: true,
        operatingLocation: true,
        city: true,
        state: true,
        country: true,
        legalStructure: true,
        gstin: true,
        pan: true,
        website: true,
        address: true,
        experienceYears: true,
        turnoverCrores: true,
        capabilities: true,
        serviceCoverage: true,
        clientReferences: true,
        certifications: true,
        documents: true,
        status: true,
        createdAt: true,
        evaluations: {
          where: { tenantId: ctx.tenantId },
          take: 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            businessProfileScore: true,
            financialStrengthScore: true,
            previousClientsScore: true,
            referencesScore: true,
            technicalCapabilityScore: true,
            complianceRiskScore: true,
            status: true,
            qualificationOutcome: true,
            decisionRemarks: true,
          },
        },
      },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied2, 404, { route: '/api/procurement/vendors/[id]', method: 'GET' });
    }

    // Fetch audit history for this vendor
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityId: id,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return apiSuccess({
      vendor,
      auditLogs,
      currentUserRole: ctx.role,
      isProcurementUser: ctx.role === 'PROCUREMENT_USER',
    });
  } catch (error) {
    await writeStructuredLog('error', 'vendor.profile_read_failed', {
      operation: 'read_vendor_profile',
      route: '/api/procurement/vendors/[id]',
      requestId: req.headers.get('x-request-id') || null,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      vendorId: id,
      error: error instanceof Error
        ? { name: error.name, message: error.message.slice(0, 400) }
        : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchVendorProfile, 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  let originalUpdatedAt: Date | undefined;

  // Authorisation:
  // Internal managers require VENDOR_MANAGE.
  // Vendor users can only edit their own profile (requires VENDOR_PROFILE_EDIT and ctx.vendorId === id).
  const isInternalManager = hasPermission(ctx.role, 'VENDOR_MANAGE');
  const isVendorSelf = ctx.role === 'VENDOR' && hasPermission(ctx.role, 'VENDOR_PROFILE_EDIT') && ctx.vendorId === id;

  if (!isInternalManager && !isVendorSelf) {
    return apiError(UI_STRINGS.common.forbiddenInsufficientPermissions, 403, { route: '/api/procurement/vendors/[id]', method: 'PUT' });
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
      return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied2, 404, { route: '/api/procurement/vendors/[id]', method: 'PUT' });
    }
    originalUpdatedAt = existing.updatedAt;

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

    const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    const updateData = {
      name: name ? name.trim() : existing.name,
      contactPerson: contactPerson !== undefined ? contactPerson : existing.contactPerson,
      email: email ? email.trim() : existing.email,
      phone: phone !== undefined ? phone : existing.phone,
      categories: toStoredText(categories, existing.categories),
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
      capabilities: toStoredText(capabilities, existing.capabilities),
      serviceCoverage: toStoredText(serviceCoverage, existing.serviceCoverage),
      clientReferences: toStoredText(clientReferences, existing.clientReferences),
      certifications: toStoredText(certifications, existing.certifications),
      documents: toStoredText(documents, existing.documents),
      status: status || existing.status,
      updatedAt,
    };
    const description = interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdRoute.vendorProfileNameCodeUpdated, {
      name: updateData.name,
      code: existing.code,
    });
    const batchResults = await writeD1BatchAtomically([
      {
        sql: VENDOR_PROFILE_UPDATE_SQL,
        values: [
          updateData.name, updateData.contactPerson, updateData.email, updateData.phone, updateData.categories,
          updateData.operatingLocation, updateData.city, updateData.state, updateData.country, updateData.legalStructure,
          updateData.gstin, updateData.pan, updateData.website, updateData.address, updateData.experienceYears,
          updateData.turnoverCrores, updateData.capabilities, updateData.serviceCoverage, updateData.clientReferences,
          updateData.certifications, updateData.documents, updateData.status, updatedAt, id, ctx.tenantId, originalUpdatedAt,
        ],
      },
      {
        sql: VENDOR_PROFILE_AUDIT_INSERT_AFTER_UPDATE_SQL,
        values: [
          crypto.randomUUID(), ctx.tenantId, ctx.userId, id, description,
          JSON.stringify({ name: existing.name, contactPerson: existing.contactPerson }),
          JSON.stringify({ name: updateData.name, contactPerson: updateData.contactPerson }), updatedAt,
        ],
      },
    ]);

    if (Number(batchResults[0]?.meta?.changes || 0) !== 1 || Number(batchResults[1]?.meta?.changes || 0) !== 1) {
      throw new Error(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh);
    }
    const updated = (batchResults[0]?.results?.[0] as typeof existing | undefined)
      || { ...existing, ...updateData };

    return apiSuccess({ vendor: updated, message: UI_STRINGS.appApiProcurementVendorsIdRoute.vendorProfileUpdatedSuccessfully });
  } catch (error: unknown) {
    const uniqueConflict = isUniqueConstraintError(error);
    if (uniqueConflict) {
      try {
        await writeStructuredLog('warn', 'vendor.duplicate_name_conflict', {
          operation: 'update_vendor_profile', route: '/api/procurement/vendors/[id]',
          requestId: req.headers?.get('x-request-id') || null,
          tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role, vendorId: id,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 300) } : { type: typeof error },
        });
      } catch {
        // Preserve the conflict response if optional log storage is unavailable.
      }
      return apiError(UI_STRINGS.appApiProcurementVendorsRoute.vendorNameAlreadyExistsForThisTenant, 409);
    }
    if (originalUpdatedAt) {
      try {
        const latest = await prisma.vendor.findFirst({
          where: { id, OR: [{ tenantId: ctx.tenantId }, { vendorType: 'PROCUCEV_VENDOR' }] },
          select: { updatedAt: true },
        });
        if (latest && new Date(latest.updatedAt).getTime() !== originalUpdatedAt.getTime()) {
          try {
            await writeStructuredLog('warn', 'vendor.profile_update_conflict', {
              operation: 'update_vendor_profile',
              route: '/api/procurement/vendors/[id]',
              requestId: req.headers?.get('x-request-id') || null,
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              role: ctx.role,
              vendorId: id,
              durationMs: Date.now() - startedAt,
            });
          } catch {
            // Preserve the conflict response if local log storage is unavailable.
          }
          return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
        }
      } catch {
        // A failed conflict probe does not replace the original update error.
      }
    }
    try {
      await writeStructuredLog('error', 'vendor.profile_update_failed', {
        operation: 'update_vendor_profile',
        route: '/api/procurement/vendors/[id]',
        requestId: req.headers?.get('x-request-id') || null,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: ctx.role,
        vendorId: id,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error
          ? { name: error.name, message: error.message.slice(0, 400) }
          : { type: typeof error },
      });
    } catch {
      // The logger writes to process output before optional local artifact storage.
      // Keep the client response stable if that optional storage also fails.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToUpdateVendorProfile, 500);
  }
}
