// src/app/api/procurement/ppos/[id]/vendor-accept/route.ts
// Handles formal Vendor Acceptance of issued Purchase Order (PPO)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('PPO_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id: ppoId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { acceptedBy, vendorComments } = body;

    const ppo = await prisma.ppo.findFirst({
      where: { id: ppoId, tenantId: ctx.tenantId },
      include: {
        vendor: true,
        project: true,
        rfq: true,
        lines: true,
      },
    });

    if (!ppo) {
      return apiError(UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, 404);
    }

    if (ctx.role === 'VENDOR') {
      if (!ctx.vendorId || ctx.vendorId !== ppo.vendorId) {
        return apiError(UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.forbiddenYouCanOnlyAcceptPurchaseOrdersIssuedToYourCompany, 403);
      }
    }

    if (ppo.vendorStatus === 'ACCEPTED_BY_VENDOR') {
      return apiError(UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.thisPurchaseOrderHasAlreadyBeenAccepted, 400);
    }

    const acceptedAt = new Date();
    const signatoryName = acceptedBy || ctx.userName || `${ppo.vendor.name} Authorized Signatory`;

    // Update PPO: record vendor acceptance timestamp, identity, version
    const updated = await prisma.ppo.update({
      where: { id: ppo.id },
      data: {
        status: 'CONFIRMED',
        vendorStatus: 'ACCEPTED_BY_VENDOR',
        vendorAcceptedAt: acceptedAt,
        vendorAcceptedBy: signatoryName,
        vendorAcceptedVersion: 1,
        vendorIssueRemarks: null, // clear any previous issue
      },
      include: {
        vendor: true,
        project: true,
        rfq: true,
        lines: true,
      },
    });

    // Post message to RFQ if linked
    if (ppo.rfqId) {
      await prisma.rfqMessage.create({
        data: {
          tenantId: ctx.tenantId,
          rfqId: ppo.rfqId,
          senderId: ctx.userId,
          senderName: signatoryName,
          senderRole: 'VENDOR',
          message: interpolateUiString(UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.pPOACCEPTEDORDEREXECUTIONVendorNameHasFormallyAcceptedPurchaseOrderPpoNumberTotalToLocaleStringOnToLocaleString2OrderExecutionCommenced, { "name": ppo.vendor.name, "ppoNumber": ppo.ppoNumber, "toLocaleString": ppo.totalValue.toLocaleString(), "toLocaleString2": acceptedAt.toLocaleString() }),
          isVendorSent: true,
          vendorId: ppo.vendorId,
        },
      });
    }

    // Audit log
    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      projectId: ppo.projectId,
      entityType: 'PPO',
      entityId: ppo.id,
      action: 'PPO_VENDOR_ACCEPTED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.purchaseOrderPpoNumberFormallyAcceptedByVendorNameSignatoryNameStatusTransitionedToCONFIRMED, { "ppoNumber": ppo.ppoNumber, "name": ppo.vendor.name, "signatoryName": signatoryName }),
      newValue: {
        vendorStatus: 'ACCEPTED_BY_VENDOR',
        status: 'CONFIRMED',
        acceptedBy: signatoryName,
        acceptedAt,
        vendorComments,
      },
    });

    // Notify buyer & project team
    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_ACCEPTED_BY_VENDOR',
      recordNumber: ppo.ppoNumber,
      entityId: ppo.id,
      actorName: signatoryName,
      details: {
        vendorName: ppo.vendor.name,
        amount: ppo.totalValue,
        acceptedAt,
      },
    });

    return apiSuccess({
      ppo: updated,
      message: interpolateUiString(UI_STRINGS.appApiProcurementPposIdVendorAcceptRoute.purchaseOrderPpoNumberSuccessfullyAcceptedBySignatoryName, { "ppoNumber": ppo.ppoNumber, "signatoryName": signatoryName }),
    });
  } catch (error: any) {
    console.error('Error accepting PPO as vendor:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToAcceptPurchaseOrder2 }), 500);
  }
}
