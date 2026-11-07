// app/api/procurement/rfqs/[id]/vendors/route.ts
// Invites vendors to an RFQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { MAX_RFQ_VENDOR_INVITE_COUNT } from '@/lib/d1-batch.constants';
import { writeRfqVendorInvitationsAtomically } from '@/lib/d1-batch';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { readByD1FilterChunks } from '@/lib/d1-query';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_INVITE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const body = await req.json() as { vendorIds?: unknown } | null;
    const vendorIds = Array.isArray(body?.vendorIds)
      ? [...new Set(body.vendorIds.filter((vendorId): vendorId is string => typeof vendorId === 'string').map((vendorId) => vendorId.trim()).filter(Boolean))]
      : [];

    if (!vendorIds.length) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.atLeastOneVendorIDIsRequired, 400, { route: '/api/procurement/rfqs/[id]/vendors', method: 'POST' });
    }

    if (vendorIds.length > MAX_RFQ_VENDOR_INVITE_COUNT) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.maximumVendorInviteBatchLimit, 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404, { route: '/api/procurement/rfqs/[id]/vendors', method: 'POST' });
    }

    // Verify vendors belong to this tenant and are not blacklisted
    const eligibleVendors = await readByD1FilterChunks(vendorIds, (vendorIdChunk) => prisma.vendor.findMany({
      where: {
        id: { in: vendorIdChunk },
        tenantId: ctx.tenantId,
        isBlacklisted: false,
      },
    }));

    if (eligibleVendors.length === 0) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.noneOfTheSelectedVendorsAreEligibleOrActive, 400, { route: '/api/procurement/rfqs/[id]/vendors', method: 'POST' });
    }

    // Create RFQ vendor invitations
    const invitationStatus = rfq.status === 'DRAFT' ? 'PENDING' : 'INVITED';
    const description = interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.invitedLengthVendorsToRFQRfqNumberJoin, { "length": eligibleVendors.length, "rfqNumber": rfq.rfqNumber, "join": eligibleVendors.map((v) => v.name).join(', ') });
    const invitedCount = await writeRfqVendorInvitationsAtomically({
      tenantId: ctx.tenantId,
      rfqId: id,
      vendorIds: eligibleVendors.map((vendor) => vendor.id),
      invitationStatus,
      audit: {
        userId: ctx.userId,
        projectId: rfq.projectId,
        description,
      },
      createdAt: new Date(),
    });

    return apiSuccess({
      invited: invitedCount,
      vendors: eligibleVendors,
      message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.successfullyInvitedLengthVendors, { "length": eligibleVendors.length }),
    });
  } catch (error: unknown) {
    await writeStructuredLog('error', 'procurement.rfq_vendor_invites_failed', {
      operation: 'invite_vendors',
      route: '/api/procurement/rfqs/[id]/vendors',
      requestId: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      rfqId: id,
      durationMs: Date.now() - startedAt,
      error,
    }, 'application');
    return apiError(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.failedToInviteVendors, 500);
  }
}
