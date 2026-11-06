import {
  ACTUAL_COST_SUMMARY_STATUSES,
  BUDGET_APPROVED_STATUS,
  BUDGET_PENDING_STATUSES,
} from '../src/app/api/budgets/route.constants';

describe('budget summary constants', () => {
  it('keeps pending and actual summary status sets explicit and stable', () => {
    expect(BUDGET_PENDING_STATUSES).toEqual([
      'UNDER_APPROVAL', 'PENDING_PROJECT_APPROVAL', 'PENDING_FINANCE_APPROVAL',
    ]);
    expect(BUDGET_APPROVED_STATUS).toBe('APPROVED');
    expect(ACTUAL_COST_SUMMARY_STATUSES).toEqual(['APPROVED', 'VERIFIED']);
  });
});
