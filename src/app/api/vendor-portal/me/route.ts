// src/app/api/vendor-portal/me/route.ts
// Vendor Self-Service Company Profile API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET() {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/me', method: 'GET' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/me', method: 'GET' });
  }

  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.appApiVendorPortalMeRoute.vendorProfileNotFound, 404, { route: '/api/vendor-portal/me', method: 'GET' });
    }

    return apiSuccess({ vendor });
  } catch (error: any) {
    console.error('Error fetching vendor profile:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToFetchVendorProfile }), 500, { route: '/api/vendor-portal/me', method: 'GET', error: error });
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError(UI_STRINGS.common.forbiddenVendorPortalIsAccessibleOnlyToMappedVendorAccounts, 403, { route: '/api/vendor-portal/me', method: 'PATCH' });
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError(UI_STRINGS.common.vendorRecordNotAssociatedWithThisUserAccount, 404, { route: '/api/vendor-portal/me', method: 'PATCH' });
  }

  try {
    const body = await req.json();

    // Verify vendor exists under this tenant
    const existing = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return apiError(UI_STRINGS.appApiVendorPortalMeRoute.vendorProfileNotFound, 404, { route: '/api/vendor-portal/me', method: 'PATCH' });
    }

    // Permitted self-service updates only (no tampering with qualificationScore, qualificationDecision, status, etc.)
    const allowedFields = [
      'contactPerson',
      'phone',
      'website',
      'address',
      'city',
      'state',
      'country',
      'operatingLocation',
      'capabilities',
      'serviceCoverage',
      'clientReferences',
      'certifications',
      'documents',
      'gstin',
      'pan',
      'legalStructure',
      'experienceYears',
      'turnoverCrores',
    ];

    const updateData: Record<string, any> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        if (key === 'experienceYears' || key === 'turnoverCrores') {
          updateData[key] = body[key] === null || body[key] === '' ? null : Number(body[key]);
        } else {
          updateData[key] = body[key];
        }
      }
    }

    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: updateData,
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendorId,
      action: 'VENDOR_PROFILE_SELF_UPDATED',
      description: interpolateUiString(UI_STRINGS.appApiVendorPortalMeRoute.vendorProfileSelfUpdatedByValue1, { "value1": ctx.userName || ctx.userEmail }),
    });

    return apiSuccess({ vendor: updated, message: UI_STRINGS.appApiVendorPortalMeRoute.companyProfileUpdatedSuccessfully });
  } catch (error: any) {
    console.error('Error updating vendor profile:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToUpdateCompanyProfile }), 500, { route: '/api/vendor-portal/me', method: 'PATCH', error: error });
  }
}
