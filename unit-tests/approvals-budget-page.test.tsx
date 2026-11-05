/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BudgetApprovalQueuePage from '../src/app/(app)/approvals/budget/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const mockToastSuccess = jest.fn();
let approveResult: { ok: boolean; body: unknown } = { ok: true, body: {} };
let rejectResult: { ok: boolean; body: unknown } = { ok: true, body: {} };

jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockToastSuccess }) }));
jest.mock('../src/components/ApprovalChatDrawer', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, entityCode, initialEnquiryMode, onMessageSent }: any) => isOpen
    ? <div data-testid="approval-chat" data-mode={String(initialEnquiryMode)}>
      <span>{entityCode}</span>
      <button onClick={onMessageSent}>Refresh Queue</button>
      <button onClick={onClose}>Close Chat</button>
    </div>
    : null,
}));
jest.mock('next/link', () => {
  const React = require('react');
  return { __esModule: true, default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', { href, ...props }, children) };
});

const originalFetch = global.fetch;
const mockFetch = jest.fn();
const queue = [
  {
    id: 'contrib-1', totalEstimatedValue: 12500,
    boq: { boqCode: 'BOQ-01', title: 'Electrical package' },
    category: { name: 'Electrical' },
    boqRevision: { revisionCode: 'R2' },
    project: { name: 'North Plant' }, costCentre: { code: 'CC-01', name: 'Electrical' },
    categories: ['Electrical', 'Power'], remainingCategoryCount: 3, submitterName: 'Asha', submitterEmail: 'asha@example.test',
    submittedAt: '2026-01-05', hasEnquiry: true,
    financialImpact: { currentApprovedAmount: 5000, projectedApprovedTotal: 17500 },
  },
  {
    id: 'contrib-2', totalEstimatedValue: 600, createdAt: '2026-01-06', categories: [], hasEnquiry: false,
    boqRevision: {},
  },
  { id: 'contrib-3', totalEstimatedValue: 0, createdAt: '2026-01-07', hasEnquiry: false },
];
const contributionDetails: Record<string, unknown> = {
  'contrib-1': {
    boqRevision: { revisionCode: 'R2', lines: [
      { id: 'line-1', lineNumber: 4, standardDescription: 'Cable tray', category: { name: 'Electrical' }, quantity: 5, uomRaw: 'M', aiUnitCost: 400, aiTotalCost: 2000 },
      { id: 'line-2', originalDescription: 'Grounding strip', quantity: 2 },
      { id: 'line-3', quantity: 0, lineNumber: 0 },
    ] },
    transactions: [
      { id: 'tx-1', category: 'Electrical', amount: 2000, quantity: 5, uom: 'M' },
      { id: 'tx-2', category: 'General', amount: 0, quantity: 0 },
    ],
  },
  'contrib-2': { boqRevision: {}, transactions: [{ id: 'tx-3', category: 'Civil', amount: 1 }] },
};

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url.startsWith('/api/approvals?type=BUDGET')) return Promise.resolve(response({ budgetQueue: queue }));
    if (url.startsWith('/api/budgets/contrib-')) return Promise.resolve(response(contributionDetails[url.split('/').at(-1) || ''] || {}));
    if (url === '/api/budgets/approve') return Promise.resolve(response(approveResult.body, approveResult.ok));
    if (url === '/api/budgets/reject') return Promise.resolve(response(rejectResult.body, rejectResult.ok));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('project budget approval workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    approveResult = { ok: true, body: {} };
    rejectResult = { ok: true, body: {} };
    setupFetch();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('loads queue summaries, reviews BOQ details, and opens enquiry or chat drawers', async () => {
    render(<BudgetApprovalQueuePage />);
    expect(await screen.findByText('BOQ-01')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.clarificationPending))).toBeInTheDocument();
    expect(screen.getByText('Electrical package')).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.common.additionalCategoryCount, { count: 3 }))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.projectUser))).toHaveLength(2);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.general)).length).toBeGreaterThan(0);
    expect(screen.getByText(/12,500/)).toBeInTheDocument();

    const firstRow = screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1];
    fireEvent.click(within(firstRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.review) }));
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppApprovalsBudgetPage.budgetReviewTitleWithCode, { boqCode: 'BOQ-01', revisionCode: 'R2' }))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.categoryWiseAllocationBreakdown))).toBeInTheDocument();
    expect(await screen.findByText('Cable tray')).toBeInTheDocument();
    expect(await screen.findByText('Grounding strip')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.nOS))).toHaveLength(2);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsBudgetPage.currentApprovedBudget)).parentElement).toHaveTextContent('5,000');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.askClarification) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('BOQ-01');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Queue' }));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=BUDGET&page=1&pageSize=25');
    expect(await screen.findByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('approval-chat')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1]).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.review) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsBudgetPage.chatWithSubmitter) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    fireEvent.click(within(screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1]).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.chat) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    const sparseRow = screen.getAllByRole('row')[3];
    fireEvent.click(within(sparseRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.review) }));
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppApprovalsBudgetPage.budgetReviewTitleWithoutCode, { revisionCode: UI_STRINGS.common.r0 }))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.bOQFitoutScope)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(uiStringPattern(UI_STRINGS.common.general))).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
    fireEvent.click(within(sparseRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.enquire) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
  });

  it('handles direct approval and approval from the review modal', async () => {
    render(<BudgetApprovalQueuePage />);
    await screen.findByText('BOQ-01');
    approveResult = { ok: false, body: {} };
    fireEvent.click(within(screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1]).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.approvalFailed))).toBeInTheDocument();

    approveResult = { ok: false, body: { error: 'Budget approval is unavailable' } };
    fireEvent.click(within(screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1]).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) }));
    expect(await screen.findByText('Budget approval is unavailable')).toBeInTheDocument();

    approveResult = { ok: true, body: {} };
    fireEvent.click(within(screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1]).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.budgetApprovedSuccessfully))).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.budgetApprovedSuccessfully, undefined, UI_STRINGS.common.underFinanceApproval);
    const banner = screen.getByText(uiStringPattern(UI_STRINGS.common.budgetApprovedSuccessfully)).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(banner).getByRole('button'));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.budgetApprovedSuccessfully))).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1]).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.review) }));
    expect(await screen.findByText('Cable tray')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsBudgetPage.approveRouteToFinance) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.budgetApprovedSuccessfully, UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, UI_STRINGS.common.underFinanceApproval));
  });

  it('validates rejection reasons and handles rejection error, success, and cancellation', async () => {
    render(<BudgetApprovalQueuePage />);
    await screen.findByText('BOQ-01');
    const row = screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1];
    fireEvent.click(within(row).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.rejectBudgetContribution))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();

    const reason = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.reasonForRejectionMandatory));
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => url === '/api/budgets/reject')).toBe(false);
    fireEvent.change(reason, { target: { value: 'Insufficient supporting documents' } });

    rejectResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.rejectionFailed))).toBeInTheDocument();
    rejectResult = { ok: false, body: { error: 'Reject service unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText('Reject service unavailable')).toBeInTheDocument();

    rejectResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.budgetContributionRejectedWithAuditNotes))).toBeInTheDocument();
    const successBanner = screen.getByText(uiStringPattern(UI_STRINGS.common.budgetContributionRejectedWithAuditNotes)).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(successBanner).getByRole('button'));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.budgetContributionRejectedWithAuditNotes))).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(screen.getAllByRole('row', { name: uiStringPattern(UI_STRINGS.common.bOQ) })[1]).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.review) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.rejectContribution) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.rejectBudgetContribution))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.rejectBudgetContribution))).not.toBeInTheDocument();
  });

  it('shows empty, non-success, and failed queue states', async () => {
    mockFetch.mockImplementation((url: string) => url.startsWith('/api/approvals?type=BUDGET')
      ? Promise.resolve(response({}))
      : Promise.resolve(response({})));
    const { unmount } = render(<BudgetApprovalQueuePage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsBudgetPage.noBudgetContributionsCurrentlyAwaitingProjectApproverApproval))).toBeInTheDocument();
    unmount();

    mockFetch.mockImplementation((url: string) => url.startsWith('/api/approvals?type=BUDGET')
      ? Promise.resolve(response({ budgetQueue: queue }, false))
      : Promise.resolve(response({})));
    render(<BudgetApprovalQueuePage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsBudgetPage.noBudgetContributionsCurrentlyAwaitingProjectApproverApproval))).toBeInTheDocument();
    expect(screen.getByText('0 Allocations')).toBeInTheDocument();
  });

  it('loads additional approval queue pages without replacing the first page', async () => {
    const secondPageItem = { ...queue[0], id: 'contrib-4', boq: { boqCode: 'BOQ-04', title: 'Mechanical package' } };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('page=1')) return Promise.resolve(response({ budgetQueue: [queue[0]], pagination: { page: 1, queues: { budget: { total: 2, totalPages: 2 } } }, totals: { budgetPendingAmount: 25100 } }));
      if (url.includes('page=2')) return Promise.resolve(response({ budgetQueue: [secondPageItem], pagination: { page: 2, queues: { budget: { total: 2, totalPages: 2 } } }, totals: { budgetPendingAmount: 25100 } }));
      return Promise.resolve(response({}));
    });
    render(<BudgetApprovalQueuePage />);
    expect(await screen.findByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByRole('row', { name: /BOQ-04/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=BUDGET&page=2&pageSize=25');
  });

  it('logs queue request exceptions and leaves the queue empty', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('project approval queue unavailable'));
    render(<BudgetApprovalQueuePage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsBudgetPage.noBudgetContributionsCurrentlyAwaitingProjectApproverApproval))).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
