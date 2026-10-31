// src/app/api/procurement/rate-cards/[id]/approve/route.ts
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
  const ctx = await requireAuth('RATE_CARD_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const rateCard = await prisma.vendorRateCard.findUnique({
      where: { id },
      include: { items: true, vendor: true },
    });

    if (!rateCard || rateCard.tenantId !== ctx.tenantId) {
      return apiError(UI_STRINGS.common.rateCardNotFound, 404);
    }

    let remarks = '';
    try {
      const body = await req.json();
      if (body.remarks) remarks = body.remarks;
    } catch {
      // no body
    }

    const now = new Date();
    const approverName = ctx.userName || ctx.userEmail || ctx.role;

    // Determine current level and role authorisation
    if (rateCard.status === 'PENDING_PROJECT_APPROVAL' || rateCard.approvalLevel === 'LEVEL_1_PROJECT') {
      // Level 1: Project Approver
      const allowedRoles = ['PROJECT_APPROVER', 'SUPER_ADMIN', 'CLIENT_ADMIN'];
      if (!allowedRoles.includes(ctx.role)) {
        return apiError(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.forbiddenOnlyProjectApproversOrAdminsCanPerformLevel1Approval, 403);
      }

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'PENDING_FINANCE_APPROVAL',
          approvalLevel: 'LEVEL_2_FINANCE',
          projectApprovedBy: approverName,
          projectApprovedAt: now,
          approvals: {
            create: {
              tenantId: ctx.tenantId,
              level: 'LEVEL_1_PROJECT',
              approverId: ctx.userId,
              approverName,
              approverEmail: ctx.userEmail || null,
              action: 'APPROVED',
              remarks: remarks || 'Level 1 Project Approval granted. Routed to Finance Approver.',
              timestamp: now,
            },
          },
        },
        include: {
          vendor: true,
          items: true,
          approvals: {
            orderBy: { timestamp: 'desc' },
          },
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: rateCard.vendorId,
        action: 'RATE_CARD_LEVEL1_APPROVED',
        description: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.rateCardRateCardNumberApprovedByProjectApproverApproverNameAndRoutedToFinance, { "rateCardNumber": rateCard.rateCardNumber, "approverName": approverName }),
        newValue: { status: 'PENDING_FINANCE_APPROVAL', level: 'LEVEL_2_FINANCE' },
      });

      return apiSuccess({
        rateCard: updated,
        message: UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.level1ProjectApprovalCompletedRequestForwardedToFinanceApprover,
      });
    } else if (rateCard.status === 'PENDING_FINANCE_APPROVAL' || rateCard.approvalLevel === 'LEVEL_2_FINANCE') {
      // Level 2: Finance Approver
      const allowedRoles = ['FINANCE_APPROVER', 'FINANCE_USER', 'SUPER_ADMIN', 'CLIENT_ADMIN'];
      if (!allowedRoles.includes(ctx.role)) {
        return apiError(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.forbiddenOnlyFinanceApproversOrAdminsCanPerformLevel2Approval, 403);
      }

      // Requirement 5: Enforce that an agreement awaiting mandatory signatures cannot be activated
      let notesObj: any = {};
      if (rateCard.notes) {
        try { notesObj = JSON.parse(rateCard.notes); } catch {}
      }

      if (notesObj.agreement && notesObj.agreement.required && notesObj.agreement.signatureRequired) {
        const isSigned = !!(notesObj.agreement.signature && notesObj.agreement.signature.verified);
        if (!isSigned) {
          return apiError(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.activationBlockedThisRateCardRequiresAnExecutedBilateralAgreementWithValidDigitalSignatureEvidenceUnsignedAgreementsCannotBeActivatedWithoutVerifiedSignatureEvidence, 400);
        }
      }

      const updated = await prisma.vendorRateCard.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvalLevel: 'COMPLETED',
          financeApprovedBy: approverName,
          financeApprovedAt: now,
          approvedBy: approverName,
          approvedAt: now,
          approvals: {
            create: {
              tenantId: ctx.tenantId,
              level: 'LEVEL_2_FINANCE',
              approverId: ctx.userId,
              approverName,
              approverEmail: ctx.userEmail || null,
              action: 'APPROVED',
              remarks: remarks || 'Level 2 Finance Approval granted. Rate Card is now Active.',
              timestamp: now,
            },
          },
        },
        include: {
          vendor: true,
          items: true,
          approvals: {
            orderBy: { timestamp: 'desc' },
          },
        },
      });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entityType: 'VENDOR',
        entityId: rateCard.vendorId,
        action: 'RATE_CARD_LEVEL2_APPROVED',
        description: interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.rateCardRateCardNumberApprovedByFinanceApproverApproverNameRateCardIsNowActive, { "rateCardNumber": rateCard.rateCardNumber, "approverName": approverName }),
        newValue: { status: 'APPROVED', level: 'COMPLETED' },
      });

      return apiSuccess({
        rateCard: updated,
        message: UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.level2FinanceApprovalCompletedRateCardIsNowActiveAndApproved,
      });
    } else {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.rateCardIsNotInAPendingApprovalStateCurrentStatusStatus, { "status": rateCard.status }), 400);
    }
  } catch (error: any) {
    console.error('Error approving rate card:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToApproveRateCard }), 500);
  }
}
