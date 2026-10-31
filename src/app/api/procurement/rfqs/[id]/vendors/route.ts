// app/api/procurement/rfqs/[id]/vendors/route.ts
// Invites vendors to an RFQ
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_INVITE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const { vendorIds = [] } = await req.json();

    if (!vendorIds.length) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.atLeastOneVendorIDIsRequired, 400);
    }

    const rfq = await prisma.rfq.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!rfq) {
      return apiError(UI_STRINGS.common.rFQNotFoundOrAccessDenied, 404);
    }

    // Verify vendors belong to this tenant and are not blacklisted
    const eligibleVendors = await prisma.vendor.findMany({
      where: {
        id: { in: vendorIds },
        tenantId: ctx.tenantId,
        isBlacklisted: false,
      },
    });

    if (eligibleVendors.length === 0) {
      return apiError(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.noneOfTheSelectedVendorsAreEligibleOrActive, 400);
    }

    // Create RFQ vendor invitations
    const invitationRecords = await prisma.$transaction(
      eligibleVendors.map((v) =>
        prisma.rfqVendor.upsert({
          where: {
            rfqId_vendorId: {
              rfqId: id,
              vendorId: v.id,
            },
          },
          update: {
            invitationStatus: rfq.status === 'DRAFT' ? 'PENDING' : 'INVITED',
          },
          create: {
            tenantId: ctx.tenantId,
            rfqId: id,
            vendorId: v.id,
            invitationStatus: rfq.status === 'DRAFT' ? 'PENDING' : 'INVITED',
            submissionStatus: 'PENDING',
          },
        })
      )
    );

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: rfq.projectId,
      entityType: 'RFQ',
      entityId: rfq.id,
      action: 'VENDOR_INVITED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.invitedLengthVendorsToRFQRfqNumberJoin, { "length": eligibleVendors.length, "rfqNumber": rfq.rfqNumber, "join": eligibleVendors.map((v) => v.name).join(', ') }),
      newValue: { vendorIds: eligibleVendors.map((v) => v.id) },
    });

    return apiSuccess({
      invited: invitationRecords.length,
      vendors: eligibleVendors,
      message: interpolateUiString(UI_STRINGS.appApiProcurementRfqsIdVendorsRoute.successfullyInvitedLengthVendors, { "length": eligibleVendors.length }),
    });
  } catch (error: any) {
    console.error('Error inviting vendors to RFQ:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToInviteVendors }), 500);
  }
}
