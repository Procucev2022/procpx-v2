import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError, getListPageWindow } from '@/lib/api-utils';
import { dispatchPreparedWorkflowNotification, notifyNextResponsibleParty } from '@/lib/notifications';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import { writeD1BatchAtomically } from '@/lib/d1-batch';
import {
  AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
  BUDGET_APPROVAL_MESSAGE_INSERT_SQL,
  PR_APPROVAL_MESSAGE_INSERT_SQL,
} from '@/lib/d1-batch.constants';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { prepareNotificationOutbox } from '@/lib/notification-outbox';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const prId = searchParams.get('prId');
  const contributionId = searchParams.get('contributionId');
  const beforeId = searchParams.get('beforeId');
  const beforeTimestampRaw = searchParams.get('beforeTimestamp');
  const pageSize = getListPageWindow(searchParams).pageSize;
  if (!prId && !contributionId) {
    return apiError(UI_STRINGS.appApiApprovalsMessagesRoute.eitherPrIdOrContributionIdMustBeProvided, 400);
  }
  if (Boolean(beforeId) !== Boolean(beforeTimestampRaw)) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  const beforeTimestamp = beforeTimestampRaw ? new Date(beforeTimestampRaw) : null;
  if (beforeTimestampRaw && (!beforeTimestamp || Number.isNaN(beforeTimestamp.getTime()))) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }

  try {
    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        select: { id: true, prNumber: true, requestedBy: true },
      });
      if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
      const cursorWhere = beforeTimestamp && beforeId ? {
        OR: [
          { timestamp: { lt: beforeTimestamp } },
          { timestamp: beforeTimestamp, id: { lt: beforeId } },
        ],
      } : {};
      const [approvals, total] = await Promise.all([
        prisma.pRApproval.findMany({
          where: { prId, tenantId: ctx.tenantId, ...cursorWhere },
          take: pageSize + 1,
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        }),
        prisma.pRApproval.count({ where: { prId, tenantId: ctx.tenantId } }),
      ]);
      const hasMore = approvals.length > pageSize;
      const pageApprovals = (hasMore ? approvals.slice(0, pageSize) : approvals).reverse();
      const userKeys = Array.from(new Set([pr.requestedBy, ...pageApprovals.map((approval) => approval.approverId)].filter(Boolean)));
      const users = userKeys.length ? await prisma.user.findMany({
        where: { tenantId: ctx.tenantId, OR: [{ id: { in: userKeys } }, { email: { in: userKeys } }] },
        select: { id: true, name: true, role: true, email: true },
      }) : [];
      const userMap = new Map<string, { name: string; role: string; email: string }>();
      for (const user of users) {
        const entry = { name: user.name, role: user.role, email: user.email };
        userMap.set(user.id, entry);
        userMap.set(user.email, entry);
      }
      const messages = pageApprovals.map((approval) => {
        const sender = userMap.get(approval.approverId);
        return {
          id: approval.id, senderId: approval.approverId, senderName: sender?.name || approval.approverId,
          senderRole: sender?.role || 'PROJECT_APPROVER', senderEmail: sender?.email || '',
          type: approval.status, content: approval.remarks || '', timestamp: approval.timestamp,
        };
      });
      return apiSuccess({
        entityId: prId, entityType: 'PR', prNumber: pr.prNumber,
        requester: userMap.get(pr.requestedBy)?.name || pr.requestedBy, messages, total,
        hasMore,
        nextCursor: hasMore && pageApprovals.length ? {
          id: pageApprovals[0].id,
          timestamp: new Date(pageApprovals[0].timestamp).toISOString(),
        } : null,
      });
    }

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId!, tenantId: ctx.tenantId },
      select: { id: true, submittedBy: true, costCentre: { select: { code: true } } },
    });
    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    const cursorWhere = beforeTimestamp && beforeId ? {
      OR: [
        { timestamp: { lt: beforeTimestamp } },
        { timestamp: beforeTimestamp, id: { lt: beforeId } },
      ],
    } : {};
    const [approvals, total] = await Promise.all([
      prisma.budgetApproval.findMany({
        where: { contributionId: contributionId!, tenantId: ctx.tenantId, ...cursorWhere },
        take: pageSize + 1,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      }),
      prisma.budgetApproval.count({ where: { contributionId: contributionId!, tenantId: ctx.tenantId } }),
    ]);
    const hasMore = approvals.length > pageSize;
    const pageApprovals = (hasMore ? approvals.slice(0, pageSize) : approvals).reverse();
    const userKeys = Array.from(new Set([contribution.submittedBy || '', ...pageApprovals.map((approval) => approval.approverId)].filter(Boolean)));
    const users = userKeys.length ? await prisma.user.findMany({
      where: { tenantId: ctx.tenantId, OR: [{ id: { in: userKeys } }, { email: { in: userKeys } }] },
      select: { id: true, name: true, role: true, email: true },
    }) : [];
    const userMap = new Map<string, { name: string; role: string; email: string }>();
    for (const user of users) {
      const entry = { name: user.name, role: user.role, email: user.email };
      userMap.set(user.id, entry);
      userMap.set(user.email, entry);
    }
    const messages = pageApprovals.map((approval) => {
      const sender = userMap.get(approval.approverId);
      return {
        id: approval.id, senderId: approval.approverId, senderName: sender?.name || approval.approverId,
        senderRole: sender?.role || approval.approvalLevel || 'APPROVER', senderEmail: sender?.email || '',
        type: approval.status, content: approval.reason || '', timestamp: approval.timestamp,
      };
    });
    return apiSuccess({
      entityId: contributionId, entityType: 'BUDGET',
      submitter: userMap.get(contribution.submittedBy || '')?.name || contribution.submittedBy,
      messages, total, hasMore,
      nextCursor: hasMore && pageApprovals.length ? {
        id: pageApprovals[0].id,
        timestamp: new Date(pageApprovals[0].timestamp).toISOString(),
      } : null,
    });
  } catch (error) {
    await writeStructuredLog('error', 'approvals.messages_read_failed', {
      operation: 'read_approval_messages', route: '/api/approvals/messages',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      prId, contributionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToFetchMessages, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const startedAt = Date.now();
  let prId: string | undefined;
  let contributionId: string | undefined;
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    prId = typeof body.prId === 'string' ? body.prId : undefined;
    contributionId = typeof body.contributionId === 'string' ? body.contributionId : undefined;
    const text = typeof body.message === 'string' ? body.message.trim() : '';
    if (!text) return apiError(UI_STRINGS.appApiApprovalsMessagesRoute.messageContentCannotBeEmpty, 400);
    if (!prId && !contributionId) {
      return apiError(UI_STRINGS.appApiApprovalsMessagesRoute.eitherPrIdOrContributionIdMustBeProvided, 400);
    }
    const messageType = body.type === 'ENQUIRY' ? 'ENQUIRY' : 'MESSAGE';
    const now = new Date();
    const messageId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const senderName = ctx.userName || UI_STRINGS.common.user;

    if (prId) {
      const pr = await prisma.procurementRequest.findFirst({
        where: { id: prId, tenantId: ctx.tenantId },
        select: { id: true, prNumber: true, projectId: true },
      });
      if (!pr) return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
      const description = interpolateUiString(UI_STRINGS.appApiApprovalsMessagesRoute.value1OnPRPrNumberText, {
        value1: messageType === 'ENQUIRY' ? 'Clarification requested' : 'Communication message', prNumber: pr.prNumber, text,
      });
      const notificationPayload = await notifyNextResponsibleParty({
        tenantId: ctx.tenantId, event: 'ENQUIRY_SENT', recordNumber: pr.prNumber, entityId: pr.id,
        actorName: ctx.userName || ctx.role, details: { link: `/pr/${pr.id}` },
      }, { prepareOnly: true });
      const preparedNotification = notificationPayload
        ? prepareNotificationOutbox(notificationPayload, now, auditId)
        : null;
      const results = await writeD1BatchAtomically([
        { sql: PR_APPROVAL_MESSAGE_INSERT_SQL, values: [messageId, ctx.tenantId, prId, ctx.userId, messageType, text, now] },
        {
          sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
          values: [auditId, ctx.tenantId, ctx.userId, pr.projectId, 'PR', prId,
            messageType === 'ENQUIRY' ? 'PR_ENQUIRY_SENT' : 'PR_MESSAGE_SENT', description, null,
            JSON.stringify({ messageId, status: messageType }), null, null, now],
        },
        ...(preparedNotification ? [preparedNotification.statement] : []),
      ]);
      if (Number(results[0]?.meta?.changes || 0) !== 1
        || (preparedNotification && Number(results[2]?.meta?.changes || 0) !== 1)) {
        return apiError(UI_STRINGS.common.procurementRequestNotFound, 404);
      }
      if (preparedNotification) {
        await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
          tenantId: ctx.tenantId, entityType: 'RFQ', entityId: pr.id, route: '/api/approvals/messages',
        });
      }
      return apiSuccess({ success: true, message: {
        id: messageId, senderId: ctx.userId, senderName, senderRole: ctx.role,
        type: messageType, content: text, timestamp: now,
      } }, 201);
    }

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id: contributionId!, tenantId: ctx.tenantId },
      select: { id: true, projectId: true, costCentre: { select: { code: true } } },
    });
    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    const description = interpolateUiString(UI_STRINGS.appApiApprovalsMessagesRoute.value1OnBudgetContributionCodeText, {
      value1: messageType === 'ENQUIRY' ? 'Clarification requested' : 'Communication message', code: contribution.costCentre.code, text,
    });
    const notificationPayload = await notifyNextResponsibleParty({
      tenantId: ctx.tenantId, event: 'ENQUIRY_SENT', recordNumber: contribution.costCentre.code,
      entityId: contribution.id, actorName: ctx.userName || ctx.role, details: { link: '/budgets' },
    }, { prepareOnly: true });
    const preparedNotification = notificationPayload
      ? prepareNotificationOutbox(notificationPayload, now, auditId)
      : null;
    const results = await writeD1BatchAtomically([
      {
        sql: BUDGET_APPROVAL_MESSAGE_INSERT_SQL,
        values: [messageId, ctx.tenantId, contributionId, ctx.role, ctx.userId, messageType, text, now],
      },
      {
        sql: AUDIT_LOG_INSERT_AFTER_CHANGE_SQL,
        values: [auditId, ctx.tenantId, ctx.userId, contribution.projectId, 'BUDGET_CONTRIBUTION', contributionId,
          messageType === 'ENQUIRY' ? 'BUDGET_ENQUIRY_SENT' : 'BUDGET_MESSAGE_SENT', description, null,
          JSON.stringify({ messageId, status: messageType }), null, null, now],
      },
      ...(preparedNotification ? [preparedNotification.statement] : []),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1
      || (preparedNotification && Number(results[2]?.meta?.changes || 0) !== 1)) {
      return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    }
    if (preparedNotification) {
      await dispatchPreparedWorkflowNotification(preparedNotification.id, now, {
        tenantId: ctx.tenantId, entityType: 'RFQ', entityId: contribution.id, route: '/api/approvals/messages',
      });
    }
    return apiSuccess({ success: true, message: {
      id: messageId, senderId: ctx.userId, senderName, senderRole: ctx.role,
      type: messageType, content: text, timestamp: now,
    } }, 201);
  } catch (error) {
    await writeStructuredLog('error', 'approvals.message_send_failed', {
      operation: 'send_approval_message', route: '/api/approvals/messages',
      requestId: req.headers.get('x-request-id'), tenantId: ctx.tenantId, userId: ctx.userId,
      prId, contributionId, durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { type: typeof error },
    });
    return apiError(UI_STRINGS.common.userMessages.failedToSendMessage2, 500);
  }
}
