import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess, isApiContext, requireAuth } from '@/lib/api-utils';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth('BUDGET_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  try {
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
            },
          },
        },
        transactions: {
          select: { id: true, category: true, amount: true, quantity: true, uom: true },
          orderBy: [{ category: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!contribution) return apiError(UI_STRINGS.common.budgetContributionNotFound, 404);
    return apiSuccess(contribution);
  } catch (error) {
    await writeStructuredLog('error', 'budget.contribution_detail_read_failed', {
      operation: 'read_budget_contribution_detail',
      route: '/api/budgets/[id]',
      requestId: req.headers.get('x-request-id') || req.headers.get('cf-ray') || undefined,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      contributionId: id,
      durationMs: Date.now() - startedAt,
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    });
    return apiError(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData, 500);
  }
}
