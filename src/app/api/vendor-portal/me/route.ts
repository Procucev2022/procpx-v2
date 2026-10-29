// src/app/api/vendor-portal/me/route.ts
// Vendor Self-Service Company Profile API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function GET() {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError('Forbidden: Vendor Portal is accessible only to mapped vendor accounts', 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError('Vendor record not associated with this user account', 404);
  }

  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!vendor) {
      return apiError('Vendor profile not found', 404);
    }

    return apiSuccess({ vendor });
  } catch (error: any) {
    console.error('Error fetching vendor profile:', error);
    return apiError(error.message || 'Failed to fetch vendor profile', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAuth();
  if (!isApiContext(ctx)) return ctx;

  if (ctx.role !== 'VENDOR' && !ctx.vendorId) {
    return apiError('Forbidden: Vendor Portal is accessible only to mapped vendor accounts', 403);
  }

  const vendorId = ctx.vendorId;
  if (!vendorId) {
    return apiError('Vendor record not associated with this user account', 404);
  }

  try {
    const body = await req.json();

    // Verify vendor exists under this tenant
    const existing = await prisma.vendor.findFirst({
      where: { id: vendorId, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return apiError('Vendor profile not found', 404);
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
      description: `Vendor profile self-updated by ${ctx.userName || ctx.userEmail}`,
    });

    return apiSuccess({ vendor: updated, message: 'Company profile updated successfully' });
  } catch (error: any) {
    console.error('Error updating vendor profile:', error);
    return apiError(error.message || 'Failed to update company profile', 500);
  }
}
