import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '@/lib/api-utils';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import {
  BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE,
  BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE,
} from '@/lib/budget-contribution-detail.constants';
import {
  decodeBudgetContributionTransactionCursor,
  encodeBudgetContributionTransactionCursor,
} from '@/lib/budget-contribution-detail-pagination';
import { decodeBoqLineCursor, encodeBoqLineCursor } from '@/lib/boq-line-pagination';
import type {
  BudgetContributionDetailRouteContext,
  BudgetContributionTransactionCursor,
} from '@app-types/lib/budget-contribution-detail.types';

export async function GET(req: NextRequest, { params }: BudgetContributionDetailRouteContext) {
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section');
  const cursorValue = searchParams.get('cursor');
  if (section !== null && section !== 'lines' && section !== 'transactions') {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }
  if ((section === null && cursorValue !== null) || (section !== null && cursorValue === null)) {
    return apiError(UI_STRINGS.common.invalidRequestBody, 400);
  }

  try {
    if (section === 'lines' && cursorValue !== null) {
      const cursor = decodeBoqLineCursor(cursorValue);
      if (!cursor) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      const contribution = await prisma.budgetContribution.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, boqRevisionId: true },
      });
      if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);

      const records = await prisma.boqLine.findMany({
        where: {
          tenantId: ctx.tenantId,
          boqRevisionId: contribution.boqRevisionId,
          isDeleted: false,
          OR: [
            { lineNumber: { gt: cursor.lineNumber } },
            { lineNumber: cursor.lineNumber, id: { gt: cursor.id } },
          ],
        },
        orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        take: BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE + 1,
        select: {
          id: true,
          lineNumber: true,
          itemCode: true,
          standardDescription: true,
          originalDescription: true,
          quantity: true,
          uomRaw: true,
          aiUnitCost: true,
          aiTotalCost: true,
          category: { select: { id: true, name: true } },
        },
      });
      const hasMore = records.length > BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE;
      const data = records.slice(0, BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE);
      const lastLine = data[data.length - 1];
      return apiSuccess({
        data,
        hasMore,
        nextCursor: hasMore && lastLine ? encodeBoqLineCursor(lastLine) : null,
      });
    }

    if (section === 'transactions' && cursorValue !== null) {
      const cursor = decodeBudgetContributionTransactionCursor(cursorValue);
      if (!cursor) return apiError(UI_STRINGS.common.invalidRequestBody, 400);
      const contribution = await prisma.budgetContribution.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);

      const records = await prisma.budgetTransaction.findMany({
        where: {
          tenantId: ctx.tenantId,
          contributionId: contribution.id,
          OR: [
            { category: { gt: cursor.category } },
            { category: cursor.category, id: { gt: cursor.id } },
          ],
        },
        orderBy: [{ category: 'asc' }, { id: 'asc' }],
        take: BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE + 1,
        select: { id: true, category: true, amount: true, quantity: true, uom: true },
      });
      const hasMore = records.length > BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE;
      const data = records.slice(0, BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE);
      const lastTransaction = data[data.length - 1];
      const nextTransactionCursor: BudgetContributionTransactionCursor | null = lastTransaction
        ? { id: lastTransaction.id, category: lastTransaction.category }
        : null;
      return apiSuccess({
        data,
        hasMore,
        nextCursor: hasMore && nextTransactionCursor
          ? encodeBudgetContributionTransactionCursor(nextTransactionCursor)
          : null,
      });
    }

    const contribution = await prisma.budgetContribution.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        costCentre: { select: { id: true, code: true, name: true, areaSqFt: true } },
        boq: { select: { id: true, boqCode: true, title: true, description: true } },
        boqRevision: {
          select: {
            id: true,
            revisionNumber: true,
            revisionCode: true,
            lines: {
              where: { tenantId: ctx.tenantId, isDeleted: false },
              select: {
                id: true,
                lineNumber: true,
                itemCode: true,
                standardDescription: true,
                originalDescription: true,
                quantity: true,
                uomRaw: true,
                aiUnitCost: true,
                aiTotalCost: true,
                category: { select: { id: true, name: true } },
              },
              orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
              take: BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE + 1,
            },
          },
        },
        transactions: {
          where: { tenantId: ctx.tenantId },
          select: { id: true, category: true, amount: true, quantity: true, uom: true },
          orderBy: [{ category: 'asc' }, { id: 'asc' }],
          take: BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE + 1,
        },
      },
    });
    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);

    const lineRecords = contribution.boqRevision?.lines || [];
    const transactionRecords = contribution.transactions || [];
    const hasMoreLines = lineRecords.length > BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE;
    const hasMoreTransactions = transactionRecords.length > BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE;
    const lines = lineRecords.slice(0, BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE);
    const transactions = transactionRecords.slice(0, BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE);
    const lastLine = lines[lines.length - 1];
    const lastTransaction = transactions[transactions.length - 1];
    const nextTransactionCursor: BudgetContributionTransactionCursor | null = lastTransaction
      ? { id: lastTransaction.id, category: lastTransaction.category }
      : null;

    return apiSuccess({
      ...contribution,
      boqRevision: contribution.boqRevision ? { ...contribution.boqRevision, lines } : null,
      transactions,
      detailPages: {
        lines: {
          hasMore: hasMoreLines,
          nextCursor: hasMoreLines && lastLine ? encodeBoqLineCursor(lastLine) : null,
        },
        transactions: {
          hasMore: hasMoreTransactions,
          nextCursor: hasMoreTransactions && nextTransactionCursor
            ? encodeBudgetContributionTransactionCursor(nextTransactionCursor)
            : null,
        },
      },
    });
  } catch (error) {
    await writeStructuredLog('error', 'budget.contribution_detail_read_failed', {
      operation: 'read_budget_contribution_detail',
      route: '/api/budgets/[id]',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      contributionId: id,
      ...(section ? { section } : {}),
      durationMs: Date.now() - startedAt,
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    });
    return apiError(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData, 500);
  }
}
