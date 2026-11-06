// src/app/api/procurement/rate-cards/[id]/approve/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { writeRateCardTransitionAtomically } from '@/lib/d1-batch';
import { RATE_CARD_APPROVE_FINANCE_UPDATE_SQL, RATE_CARD_APPROVE_PROJECT_UPDATE_SQL } from '@/lib/d1-batch.constants';
import { parseStoredJsonObject } from '@/lib/rate-card-utils';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '@/lib/rate-card-approval-history.constants';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('RATE_CARD_APPROVE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();

  try {
    const rateCard = await prisma.vendorRateCard.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { items: true, vendor: true, approvals: {
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
        select: { id: true, level: true, approverName: true, action: true, remarks: true, timestamp: true },
      } },
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

      const approvalId = crypto.randomUUID();
      const approvalRemarks = remarks || 'Level 1 Project Approval granted. Routed to Finance Approver.';
      const changed = await writeRateCardTransitionAtomically({
        updateSql: RATE_CARD_APPROVE_PROJECT_UPDATE_SQL,
        updateValues: [approverName, now.toISOString(), now.toISOString(), id, ctx.tenantId, rateCard.status, rateCard.approvalLevel ?? null],
        approvalValues: [approvalId, ctx.tenantId, id, 'LEVEL_1_PROJECT', ctx.userId, approverName, ctx.userEmail || null, 'APPROVED', approvalRemarks, now.toISOString()],
        auditValues: [crypto.randomUUID(), ctx.tenantId, ctx.userId, null, 'VENDOR', rateCard.vendorId,
          'RATE_CARD_LEVEL1_APPROVED', interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.rateCardRateCardNumberApprovedByProjectApproverApproverNameAndRoutedToFinance, { "rateCardNumber": rateCard.rateCardNumber, "approverName": approverName }),
          null, JSON.stringify({ status: 'PENDING_FINANCE_APPROVAL', level: 'LEVEL_2_FINANCE' }), null, null, now.toISOString()],
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

      const approval = {
        id: approvalId, tenantId: ctx.tenantId, rateCardId: id, level: 'LEVEL_1_PROJECT', approverId: ctx.userId,
        approverName, approverEmail: ctx.userEmail || null, action: 'APPROVED', remarks: approvalRemarks, timestamp: now,
      };
      const updated = {
        ...rateCard, status: 'PENDING_FINANCE_APPROVAL', approvalLevel: 'LEVEL_2_FINANCE',
        projectApprovedBy: approverName, projectApprovedAt: now, updatedAt: now,
        approvals: [approval, ...(rateCard.approvals || [])].slice(0, RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE),
      };

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
      const notesObj = parseStoredJsonObject(rateCard.notes);
      if (!notesObj) {
        await writeStructuredLog('error', 'rate_card.workflow_metadata_invalid', {
          operation: 'approve_rate_card', route: '/api/procurement/rate-cards/[id]/approve',
          requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
          rateCardId: id, field: 'notes', durationMs: Date.now() - startedAt,
        });
        return apiError(UI_STRINGS.common.userMessages.failedToApproveRateCard, 500);
      }

      const agreementValue = notesObj.agreement;
      const agreement = agreementValue && typeof agreementValue === 'object' && !Array.isArray(agreementValue)
        ? agreementValue as Record<string, unknown> : null;
      if (agreement?.required && agreement.signatureRequired) {
        const signature = agreement.signature && typeof agreement.signature === 'object' && !Array.isArray(agreement.signature)
          ? agreement.signature as Record<string, unknown> : null;
        const isSigned = signature?.verified === true;
        if (!isSigned) {
          return apiError(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.activationBlockedThisRateCardRequiresAnExecutedBilateralAgreementWithValidDigitalSignatureEvidenceUnsignedAgreementsCannotBeActivatedWithoutVerifiedSignatureEvidence, 400);
        }
      }

      const approvalId = crypto.randomUUID();
      const approvalRemarks = remarks || 'Level 2 Finance Approval granted. Rate Card is now Active.';
      const changed = await writeRateCardTransitionAtomically({
        updateSql: RATE_CARD_APPROVE_FINANCE_UPDATE_SQL,
        updateValues: [approverName, now.toISOString(), approverName, now.toISOString(), now.toISOString(), id, ctx.tenantId, rateCard.status, rateCard.approvalLevel ?? null],
        approvalValues: [approvalId, ctx.tenantId, id, 'LEVEL_2_FINANCE', ctx.userId, approverName, ctx.userEmail || null, 'APPROVED', approvalRemarks, now.toISOString()],
        auditValues: [crypto.randomUUID(), ctx.tenantId, ctx.userId, null, 'VENDOR', rateCard.vendorId,
          'RATE_CARD_LEVEL2_APPROVED', interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.rateCardRateCardNumberApprovedByFinanceApproverApproverNameRateCardIsNowActive, { "rateCardNumber": rateCard.rateCardNumber, "approverName": approverName }),
          null, JSON.stringify({ status: 'APPROVED', level: 'COMPLETED' }), null, null, now.toISOString()],
      });
      if (!changed) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);

      const approval = {
        id: approvalId, tenantId: ctx.tenantId, rateCardId: id, level: 'LEVEL_2_FINANCE', approverId: ctx.userId,
        approverName, approverEmail: ctx.userEmail || null, action: 'APPROVED', remarks: approvalRemarks, timestamp: now,
      };
      const updated = {
        ...rateCard, status: 'APPROVED', approvalLevel: 'COMPLETED',
        financeApprovedBy: approverName, financeApprovedAt: now, approvedBy: approverName, approvedAt: now,
        updatedAt: now, approvals: [approval, ...(rateCard.approvals || [])].slice(0, RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE),
      };

      return apiSuccess({
        rateCard: updated,
        message: UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.level2FinanceApprovalCompletedRateCardIsNowActiveAndApproved,
      });
    } else {
      return apiError(interpolateUiString(UI_STRINGS.appApiProcurementRateCardsIdApproveRoute.rateCardIsNotInAPendingApprovalStateCurrentStatusStatus, { "status": rateCard.status }), 400);
    }
  } catch (error: unknown) {
    await writeStructuredLog('error', 'rate_card.approval_failed', {
      operation: 'approve_rate_card', route: '/api/procurement/rate-cards/[id]/approve',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      role: ctx.role, rateCardId: id, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToApproveRateCard, 500);
  }
}
