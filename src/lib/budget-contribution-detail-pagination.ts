import { BUDGET_CONTRIBUTION_DETAIL_CURSOR_MAX_LENGTH } from './budget-contribution-detail.constants';
import { UI_STRINGS } from './ui-strings.constants';
import type {
  BudgetContributionDetailPage,
  BudgetContributionDetailSection,
  BudgetContributionTransactionCursor,
} from '@app-types/lib/budget-contribution-detail.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCursorId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

export function encodeBudgetContributionTransactionCursor(cursor: BudgetContributionTransactionCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodeBudgetContributionTransactionCursor(value: string): BudgetContributionTransactionCursor | null {
  if (!value || value.length > BUDGET_CONTRIBUTION_DETAIL_CURSOR_MAX_LENGTH) return null;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!isRecord(parsed) || typeof parsed.category !== 'string' || parsed.category.length > 120
      || /[\u0000-\u001f]/.test(parsed.category) || !isCursorId(parsed.id)) return null;
    return { category: parsed.category, id: parsed.id };
  } catch {
    return null;
  }
}

export async function fetchBudgetContributionDetailPage<T>(
  contributionId: string,
  section: BudgetContributionDetailSection,
  cursor: string,
  fetchPage: typeof fetch = fetch,
): Promise<BudgetContributionDetailPage<T>> {
  const query = new URLSearchParams({ section, cursor });
  const response = await fetchPage('/api/budgets/' + encodeURIComponent(contributionId) + '?' + query.toString());
  if (!response.ok) throw new Error(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.data) || typeof payload.hasMore !== 'boolean'
    || !(payload.nextCursor === null || typeof payload.nextCursor === 'string')) {
    throw new Error(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData);
  }
  return {
    data: payload.data as T[],
    hasMore: payload.hasMore,
    nextCursor: payload.nextCursor,
  };
}
