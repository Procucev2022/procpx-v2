/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FinanceBudgetApprovalsPage from '../src/app/(app)/finance/budget-approvals/page';

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
    id: 'contrib-1', amount: 12500, totalEstimatedValue: 12500, acceptedEstimatedValue: 12000,
    boq: { boqCode: 'BOQ-01', title: 'Electrical package' }, category: { name: 'Electrical' }, boqRevision: { revisionCode: 'R2' },
    project: { name: 'North Plant' }, costCentre: { code: 'CC-01', name: 'Electrical' }, categories: ['Electrical', 'Power'],
    projectApproverDecision: { approverName: 'Asha', approvedAt: '2026-01-04' }, submittedAt: '2026-01-05', hasEnquiry: true,
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
      { originalDescription: 'Grounding strip', quantity: 2 },
    ] },
    transactions: [{ id: 'tx-1', category: 'Electrical', amount: 2000, quantity: 5, uom: 'M' }],
  },
  'contrib-2': { boqRevision: {}, transactions: [{ id: 'tx-2', category: 'Civil', amount: 1 }] },
};

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function setupFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/approvals?type=FINANCE')) return Promise.resolve(response({ financeQueue: queue }));
    if (url.startsWith('/api/budgets/contrib-')) return Promise.resolve(response(contributionDetails[url.split('/').at(-1) || ''] || {}));
    if (url === '/api/budgets/finance-approve') return Promise.resolve(response(approveResult.body, approveResult.ok));
    if (url === '/api/budgets/finance-reject') return Promise.resolve(response(rejectResult.body, rejectResult.ok));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('finance budget approval workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    approveResult = { ok: true, body: {} };
    rejectResult = { ok: true, body: {} };
    setupFetch();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('loads the queue, inspects BOQ details, and opens enquiry or chat drawers', async () => {
    render(<FinanceBudgetApprovalsPage />);
    expect(await screen.findByText('BOQ-01')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.clarificationPending))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.bOQFitoutScope)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.general)).length).toBeGreaterThan(0);
    expect(screen.getByText(/12,500/)).toBeInTheDocument();

    const firstRow = screen.getByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(firstRow).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Inspect"})) }));
    expect(screen.getByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.financeCapexSanctionBoqCodeRevisionCode) })).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.categoryWiseAllocationBreakdown))).toBeInTheDocument();
    expect(await screen.findByText('Cable tray')).toBeInTheDocument();
    expect(await screen.findByText('Grounding strip')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Ask","toLocaleString":"Clarification"})) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('BOQ-01');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Queue' }));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=FINANCE&page=1&pageSize=25');
    expect(await screen.findByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('approval-chat')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Chat"})) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    const sparseRow = screen.getAllByRole('row')[3];
    fireEvent.click(within(sparseRow).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Inspect"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.verified))).toBeInTheDocument();
    expect((await screen.findAllByText(uiStringPattern(UI_STRINGS.common.general))).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
    fireEvent.click(within(sparseRow).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Enquire"})) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
  });

  it('handles sanction failures and success, including the review modal actions', async () => {
    render(<FinanceBudgetApprovalsPage />);
    await screen.findByText('BOQ-01');
    const firstRow = screen.getByRole('row', { name: /BOQ-01/ });
    approveResult = { ok: false, body: {} };
    fireEvent.click(within(firstRow).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Sanction"})) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.financeApprovalFailed))).toBeInTheDocument();

    approveResult = { ok: false, body: { error: 'Budget approval is unavailable' } };
    fireEvent.click(within(firstRow).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Sanction"})) }));
    expect(await screen.findByText('Budget approval is unavailable')).toBeInTheDocument();
    approveResult = { ok: true, body: {} };
    fireEvent.click(within(firstRow).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Sanction"})) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.budgetApprovedSuccessfully))).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.budgetApprovedSuccessfully, undefined, UI_STRINGS.common.userMessages.approvedByFinance);

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Inspect"})) }));
    expect(await screen.findByText('Cable tray')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Sanction","toLocaleString":"Budget"})) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.budgetApprovedSuccessfully, UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical, UI_STRINGS.common.userMessages.approvedByFinance));
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Inspect"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Chat","toLocaleString":"/ Notes"})) }));
    expect(screen.getByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
  });

  it('validates rejection reasons and handles rejection failure and success', async () => {
    render(<FinanceBudgetApprovalsPage />);
    await screen.findByText('BOQ-01');
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.rejectBudgetSanction))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();

    const reason = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.reasonForRejectionMandatory));
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }).closest('form')!);
    fireEvent.change(reason, { target: { value: 'Insufficient supporting documents' } });
    rejectResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.financeRejectionFailed))).toBeInTheDocument();
    rejectResult = { ok: false, body: { error: 'Reject service unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText('Reject service unavailable')).toBeInTheDocument();

    rejectResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.budgetRejectedByFinanceWithAuditNotesRetained))).toBeInTheDocument();
    const successBanner = screen.getByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.budgetRejectedByFinanceWithAuditNotesRetained)).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(successBanner).getByRole('button'));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.budgetRejectedByFinanceWithAuditNotesRetained))).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Inspect"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"Contribution"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.rejectBudgetSanction))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.rejectBudgetSanction))).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Inspect"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.financeCapexSanction, "", false))).not.toBeInTheDocument();
  });

  it('shows empty and failed queue states', async () => {
    mockFetch.mockImplementation((url: string) => url.startsWith('/api/approvals?type=FINANCE')
      ? Promise.resolve(response({}))
      : Promise.resolve(response({})));
    const { unmount } = render(<FinanceBudgetApprovalsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.noBudgetContributionsCurrentlyAwaitingFinanceApproval))).toBeInTheDocument();
    unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('finance queue unavailable'));
    render(<FinanceBudgetApprovalsPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.noBudgetContributionsCurrentlyAwaitingFinanceApproval))).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('loads additional finance approval queue pages without replacing the first page', async () => {
    const secondPageItem = { ...queue[0], id: 'finance-4', boq: { boqCode: 'BOQ-04', title: 'Mechanical package' } };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('page=1')) return Promise.resolve(response({ financeQueue: [queue[0]], pagination: { page: 1, queues: { finance: { total: 2, totalPages: 2 } } }, totals: { financePendingAmount: 25100 } }));
      if (url.includes('page=2')) return Promise.resolve(response({ financeQueue: [secondPageItem], pagination: { page: 2, queues: { finance: { total: 2, totalPages: 2 } } }, totals: { financePendingAmount: 25100 } }));
      return Promise.resolve(response({}));
    });
    render(<FinanceBudgetApprovalsPage />);
    expect(await screen.findByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByRole('row', { name: /BOQ-04/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=FINANCE&page=2&pageSize=25');
  });
});
