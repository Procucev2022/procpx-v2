import {
  BUDGET_CONTRIBUTION_DETAIL_CURSOR_MAX_LENGTH,
  BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE,
  BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE,
} from '../src/lib/budget-contribution-detail.constants';
import {
  decodeBudgetContributionTransactionCursor,
  encodeBudgetContributionTransactionCursor,
  fetchBudgetContributionDetailPage,
} from '../src/lib/budget-contribution-detail-pagination';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

const fakeResponse = (payload: unknown, ok = true) => ({
  ok,
  json: async () => payload,
}) as Response;

describe('budget contribution detail pagination', () => {
  it('keeps detail response windows and cursors bounded', () => {
    expect(BUDGET_CONTRIBUTION_DETAIL_LINE_PAGE_SIZE).toBe(50);
    expect(BUDGET_CONTRIBUTION_DETAIL_TRANSACTION_PAGE_SIZE).toBe(25);
    expect(BUDGET_CONTRIBUTION_DETAIL_CURSOR_MAX_LENGTH).toBe(512);
  });

  it('round trips transaction cursors with category ordering', () => {
    const cursor = { category: 'Câble / Power', id: 'transaction-1' };
    expect(decodeBudgetContributionTransactionCursor(encodeBudgetContributionTransactionCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    '%7B',
    encodeURIComponent(JSON.stringify([])),
    encodeURIComponent(JSON.stringify({ category: 'Electrical', id: 'bad/id' })),
    encodeURIComponent(JSON.stringify({ category: 'x'.repeat(121), id: 'transaction-1' })),
    encodeURIComponent(JSON.stringify({ category: 'bad\u0001category', id: 'transaction-1' })),
  ])('rejects malformed or unsafe transaction cursors', (cursor) => {
    expect(decodeBudgetContributionTransactionCursor(cursor)).toBeNull();
  });

  it('rejects an oversized cursor before parsing it', () => {
    expect(decodeBudgetContributionTransactionCursor('x'.repeat(BUDGET_CONTRIBUTION_DETAIL_CURSOR_MAX_LENGTH + 1))).toBeNull();
  });

  it('fetches and validates a continuation page', async () => {
    const cursor = encodeBudgetContributionTransactionCursor({ category: 'Electrical', id: 'transaction-25' });
    const fetchPage = jest.fn().mockResolvedValue(fakeResponse({
      data: [{ id: 'transaction-26', category: 'Electrical' }],
      hasMore: false,
      nextCursor: null,
    }));

    await expect(fetchBudgetContributionDetailPage('contribution/1', 'transactions', cursor, fetchPage))
      .resolves.toEqual({ data: [{ id: 'transaction-26', category: 'Electrical' }], hasMore: false, nextCursor: null });
    expect(fetchPage).toHaveBeenCalledWith(
      '/api/budgets/contribution%2F1?section=transactions&cursor=' + encodeURIComponent(cursor),
    );
  });

  it('maps a failed continuation response to safe application copy', async () => {
    await expect(fetchBudgetContributionDetailPage('contribution-1', 'lines', 'cursor', async () => fakeResponse({}, false)))
      .rejects.toThrow(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData);
  });

  it.each([
    null,
    {},
    { data: {}, hasMore: false, nextCursor: null },
    { data: [], hasMore: 'false', nextCursor: null },
    { data: [], hasMore: false },
    { data: [], hasMore: false, nextCursor: 1 },
  ])('rejects an invalid continuation payload', async (payload) => {
    await expect(fetchBudgetContributionDetailPage(
      'contribution-1',
      'lines',
      'cursor',
      async () => fakeResponse(payload),
    )).rejects.toThrow(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData);
  });
});
