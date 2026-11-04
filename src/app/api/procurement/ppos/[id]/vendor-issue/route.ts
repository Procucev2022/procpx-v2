// src/app/api/procurement/ppos/[id]/vendor-issue/route.ts
// Handles Vendor Raising Clarification / Issue on Issued Purchase Order without false acceptance
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
    const body = await req.json();
    const { issueRemarks, raisedBy } = body;

    if (!issueRemarks || !issueRemarks.trim()) {
      return apiError(UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.issueClarificationDescriptionIsRequired, 400, { route: '/api/procurement/ppos/[id]/vendor-issue', method: 'POST' });
    }

    const ppo = await prisma.ppo.findFirst({
      where: { id: ppoId, tenantId: ctx.tenantId },
      include: {
        vendor: true,
        project: true,
        rfq: true,
      },
    });

    if (!ppo) {
      return apiError(UI_STRINGS.common.purchaseOrderNotFoundOrAccessDenied, 404, { route: '/api/procurement/ppos/[id]/vendor-issue', method: 'POST' });
    }

    if (ctx.role === 'VENDOR') {
      if (!ctx.vendorId || ctx.vendorId !== ppo.vendorId) {
        return apiError(UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.forbiddenYouCanOnlyRaiseIssuesOnPurchaseOrdersIssuedToYourCompany, 403, { route: '/api/procurement/ppos/[id]/vendor-issue', method: 'POST' });
      }
    }

    const raisedAt = new Date();
    const reporterName = raisedBy || ctx.userName || `${ppo.vendor.name} Representative`;

    // Update PPO: record issue remarks and status WITHOUT false acceptance
    const updated = await prisma.ppo.update({
      where: { id: ppo.id },
      data: {
        vendorStatus: 'ISSUE_RAISED',
        vendorIssueRemarks: issueRemarks.trim(),
        vendorIssueRaisedAt: raisedAt,
        // status remains ISSUED or DRAFT, NOT CONFIRMED
      },
      include: {
        vendor: true,
        project: true,
        rfq: true,
        lines: true,
      },
    });

    // Post clarification to RFQ if linked
    if (ppo.rfqId) {
      await prisma.rfqMessage.create({
        data: {
          tenantId: ctx.tenantId,
          rfqId: ppo.rfqId,
          senderId: ctx.userId,
          senderName: reporterName,
          senderRole: 'VENDOR',
          message: interpolateUiString(UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.pPOCLARIFICATIONISSUERAISEDVendorNameRaisedAnIssueOnPPOPpoNumberTrimPPOAcceptanceIsHeldPendingResolution, { "name": ppo.vendor.name, "ppoNumber": ppo.ppoNumber, "trim": issueRemarks.trim() }),
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
      action: 'PPO_VENDOR_ISSUE_RAISED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.clarificationIssueRaisedOnPurchaseOrderPpoNumberByVendorNameTrim, { "ppoNumber": ppo.ppoNumber, "name": ppo.vendor.name, "trim": issueRemarks.trim() }),
      newValue: {
        vendorStatus: 'ISSUE_RAISED',
        issueRemarks: issueRemarks.trim(),
        raisedBy: reporterName,
        raisedAt,
      },
    });

    // Notify buyer
    await notifyNextResponsibleParty({
      tenantId: ctx.tenantId,
      event: 'PPO_ISSUE_RAISED',
      recordNumber: ppo.ppoNumber,
      entityId: ppo.id,
      actorName: reporterName,
      details: {
        vendorName: ppo.vendor.name,
        issueRemarks: issueRemarks.trim(),
        amount: ppo.totalValue,
      },
    });

    return apiSuccess({
      ppo: updated,
      message: UI_STRINGS.appApiProcurementPposIdVendorIssueRoute.issueSuccessfullyLoggedAndRoutedToTheProcurementTeamForReview,
    });
  } catch (error: any) {
    console.error('Error raising issue on PPO:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSubmitIssueOnPurchaseOrder }), 500, { route: '/api/procurement/ppos/[id]/vendor-issue', method: 'POST', error: error });
  }
}
