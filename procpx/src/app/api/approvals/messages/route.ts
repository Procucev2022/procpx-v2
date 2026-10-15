// src/app/api/approvals/messages/route.ts - Approval Communication & Enquiries API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { notifyNextResponsibleParty } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const prId = searchParams.get('prId');
  const contributionId = searchParams.get('contributionId');

  if (!prId && !contributionId) {
    return apiError('Either prId or contributionId must be provided.', 400);
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
      if (!pr) return apiError('Procurement Request not found.', 404);

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
      if (!contribution) return apiError('Budget contribution not found.', 404);

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
    return apiError(err.message || 'Failed to fetch messages.', 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { prId, contributionId, message, type = 'MESSAGE' } = body;

    if (!message || !message.trim()) {
      return apiError('Message content cannot be empty.', 400);
    }

    if (!prId && !contributionId) {
      return apiError('Either prId or contributionId must be provided.', 400);
    }

    const messageType = type === 'ENQUIRY' ? 'ENQUIRY' : 'MESSAGE';
    const text = message.trim();

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        include: { costCentre: true },
      });
      if (!pr) return apiError('Procurement Request not found.', 404);

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
          description: `${messageType === 'ENQUIRY' ? 'Clarification requested' : 'Communication message'} on PR ${pr.prNumber}: "${text}"`,
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
      if (!contribution) return apiError('Budget contribution not found.', 404);

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
          description: `${messageType === 'ENQUIRY' ? 'Clarification requested' : 'Communication message'} on Budget Contribution (${contribution.costCentre.code}): "${text}"`,
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
    return apiError(err.message || 'Failed to send message.', 500);
  }
}
