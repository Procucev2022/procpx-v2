// src/app/api/approvals/messages/route.ts - Approval Communication & Enquiries API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const prId = searchParams.get('prId');
  const contributionId = searchParams.get('contributionId');

  if (!prId && !contributionId) {
    return apiError(UI_STRINGS.appApiApprovalsMessagesRoute.eitherPrIdOrContributionIdMustBeProvided, 400, { route: '/api/approvals/messages', method: 'GET' });
  }

  try {
    // Fetch users for resolving sender identities
    const users = await prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, role: true, email: true },
    });
    const userMap = new Map<string, { name: string; role: string; email: string }>();
    for (const u of users) {
      userMap.set(u.id, { name: u.name, role: u.role, email: u.email });
      userMap.set(u.email, { name: u.name, role: u.role, email: u.email });
    }

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        select: { id: true, prNumber: true, requestedBy: true, createdAt: true },
      });
      if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404, { route: '/api/approvals/messages', method: 'GET' });

      const approvals = await prisma.pRApproval.findMany({
        where: { prId, tenantId: ctx.tenantId },
        orderBy: { timestamp: 'asc' },
      });

      const messages = approvals.map(a => {
        const sender = userMap.get(a.approverId);
        return {
          id: a.id,
          senderId: a.approverId,
          senderName: sender?.name || a.approverId,
          senderRole: sender?.role || 'PROJECT_APPROVER',
          senderEmail: sender?.email || '',
          type: a.status, // ENQUIRY, MESSAGE, APPROVED, REJECTED
          content: a.remarks || '',
          timestamp: a.timestamp,
        };
      });

      return apiSuccess({
        entityId: prId,
        entityType: 'PR',
        prNumber: pr.prNumber,
        requester: userMap.get(pr.requestedBy)?.name || pr.requestedBy,
        messages,
        total: messages.length,
      });
    }

    if (contributionId) {
      const contribution = await prisma.budgetContribution.findFirst({
        where: { id: contributionId, tenantId: ctx.tenantId },
        select: { id: true, submittedBy: true, costCentreId: true, createdAt: true },
      });
      if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404, { route: '/api/approvals/messages', method: 'GET' });

      const approvals = await prisma.budgetApproval.findMany({
        where: { contributionId, tenantId: ctx.tenantId },
        orderBy: { timestamp: 'asc' },
      });

      const messages = approvals.map(a => {
        const sender = userMap.get(a.approverId);
        return {
          id: a.id,
          senderId: a.approverId,
          senderName: sender?.name || a.approverId,
          senderRole: sender?.role || a.approvalLevel || 'APPROVER',
          senderEmail: sender?.email || '',
          type: a.status, // ENQUIRY, MESSAGE, APPROVED, REJECTED
          content: a.reason || '',
          timestamp: a.timestamp,
        };
      });

      return apiSuccess({
        entityId: contributionId,
        entityType: 'BUDGET',
        submitter: userMap.get(contribution.submittedBy || '')?.name || contribution.submittedBy,
        messages,
        total: messages.length,
      });
    }
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToFetchMessages }), 500, { route: '/api/approvals/messages', method: 'GET', error: err });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { prId, contributionId, message, type = 'MESSAGE' } = body;

    if (!message || !message.trim()) {
      return apiError(UI_STRINGS.appApiApprovalsMessagesRoute.messageContentCannotBeEmpty, 400, { route: '/api/approvals/messages', method: 'POST' });
    }

    if (!prId && !contributionId) {
      return apiError(UI_STRINGS.appApiApprovalsMessagesRoute.eitherPrIdOrContributionIdMustBeProvided, 400, { route: '/api/approvals/messages', method: 'POST' });
    }

    const messageType = type === 'ENQUIRY' ? 'ENQUIRY' : 'MESSAGE';
    const text = message.trim();

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        include: { costCentre: true },
      });
      if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404, { route: '/api/approvals/messages', method: 'POST' });

      const created = await prisma.pRApproval.create({
        data: {
          tenantId: ctx.tenantId,
          prId,
          approverId: ctx.userId,
          status: messageType,
          remarks: text,
          timestamp: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId: pr.projectId,
          entityType: 'PR',
          entityId: prId,
          action: messageType === 'ENQUIRY' ? 'PR_ENQUIRY_SENT' : 'PR_MESSAGE_SENT',
          description: interpolateUiString(UI_STRINGS.appApiApprovalsMessagesRoute.value1OnPRPrNumberText, { "value1": messageType === 'ENQUIRY' ? 'Clarification requested' : 'Communication message', "prNumber": pr.prNumber, "text": text }),
        },
      });

      await notifyNextResponsibleParty({
        tenantId: ctx.tenantId,
        event: 'ENQUIRY_SENT',
        recordNumber: pr.prNumber,
        entityId: pr.id,
        actorName: ctx.userName || ctx.role,
        details: {
          link: `/pr/${pr.id}`,
        },
      });

      return apiSuccess({
        success: true,
        message: {
          id: created.id,
          senderId: ctx.userId,
          senderName: ctx.userName || 'User',
          senderRole: ctx.role,
          type: created.status,
          content: created.remarks,
          timestamp: created.timestamp,
        },
      }, 201);
    }

    if (contributionId) {
      const contribution = await prisma.budgetContribution.findFirst({
        where: { id: contributionId, tenantId: ctx.tenantId },
        include: { costCentre: true },
      });
      if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404, { route: '/api/approvals/messages', method: 'POST' });

      const created = await prisma.budgetApproval.create({
        data: {
          tenantId: ctx.tenantId,
          contributionId,
          approvalLevel: ctx.role,
          approverId: ctx.userId,
          status: messageType,
          reason: text,
          timestamp: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          projectId: contribution.projectId,
          entityType: 'BUDGET_CONTRIBUTION',
          entityId: contributionId,
          action: messageType === 'ENQUIRY' ? 'BUDGET_ENQUIRY_SENT' : 'BUDGET_MESSAGE_SENT',
          description: interpolateUiString(UI_STRINGS.appApiApprovalsMessagesRoute.value1OnBudgetContributionCodeText, { "value1": messageType === 'ENQUIRY' ? 'Clarification requested' : 'Communication message', "code": contribution.costCentre.code, "text": text }),
        },
      });

      await notifyNextResponsibleParty({
        tenantId: ctx.tenantId,
        event: 'ENQUIRY_SENT',
        recordNumber: contribution.costCentre.code,
        entityId: contribution.id,
        actorName: ctx.userName || ctx.role,
        details: {
          link: `/budgets`,
        },
      });

      return apiSuccess({
        success: true,
        message: {
          id: created.id,
          senderId: ctx.userId,
          senderName: ctx.userName || 'User',
          senderRole: ctx.role,
          type: created.status,
          content: created.reason,
          timestamp: created.timestamp,
        },
      }, 201);
    }
  } catch (err: any) {
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToSendMessage2 }), 500, { route: '/api/approvals/messages', method: 'POST', error: err });
  }
}
