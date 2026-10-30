/** @jest-environment jsdom */
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
    boq: { boqCode: 'BOQ-01', title: 'Electrical package' }, category: { name: 'Electrical' }, boqRevision: { revisionCode: 'R2', lines: [
      { id: 'line-1', lineNumber: 4, standardDescription: 'Cable tray', category: { name: 'Electrical' }, quantity: 5, uomRaw: 'M', aiUnitCost: 400, aiTotalCost: 2000 },
      { originalDescription: 'Grounding strip', quantity: 2 },
    ] },
    project: { name: 'North Plant' }, costCentre: { code: 'CC-01', name: 'Electrical' }, categories: ['Electrical', 'Power'],
    projectApproverDecision: { approverName: 'Asha', approvedAt: '2026-01-04' }, submittedAt: '2026-01-05', hasEnquiry: true,
    financialImpact: { currentApprovedAmount: 5000, projectedApprovedTotal: 17500 },
    transactions: [{ id: 'tx-1', category: 'Electrical', amount: 2000, quantity: 5, uom: 'M' }],
  },
  {
    id: 'contrib-2', totalEstimatedValue: 600, createdAt: '2026-01-06', categories: [], hasEnquiry: false,
    boqRevision: {}, transactions: [{ id: 'tx-2', category: 'Civil', amount: 1 }],
  },
  {
    id: 'contrib-3', totalEstimatedValue: 0, createdAt: '2026-01-07', hasEnquiry: false,
  },
];

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function setupFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/approvals?type=FINANCE') return Promise.resolve(response({ financeQueue: queue }));
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
    expect(screen.getByText('Clarification Pending')).toBeInTheDocument();
    expect(screen.getAllByText('BOQ Fitout Scope').length).toBeGreaterThan(0);
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    expect(screen.getByText(/12,500/)).toBeInTheDocument();

    const firstRow = screen.getByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Inspect' }));
    expect(screen.getByText(/Finance Capex Sanction: BOQ-01/)).toBeInTheDocument();
    expect(screen.getByText('Category-wise Allocation Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Cable tray')).toBeInTheDocument();
    expect(screen.getByText('Grounding strip')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ask Clarification' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('BOQ-01');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Queue' }));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=FINANCE');
    expect(await screen.findByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('approval-chat')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Chat' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    const sparseRow = screen.getAllByRole('row')[3];
    fireEvent.click(within(sparseRow).getByRole('button', { name: 'Inspect' }));
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(within(sparseRow).getByRole('button', { name: 'Enquire' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
  });

  it('handles sanction failures and success, including the review modal actions', async () => {
    render(<FinanceBudgetApprovalsPage />);
    await screen.findByText('BOQ-01');
    const firstRow = screen.getByRole('row', { name: /BOQ-01/ });
    approveResult = { ok: false, body: {} };
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Sanction' }));
    expect(await screen.findByText('Finance approval failed')).toBeInTheDocument();

    approveResult = { ok: false, body: { error: 'Budget approval is unavailable' } };
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Sanction' }));
    expect(await screen.findByText('Budget approval is unavailable')).toBeInTheDocument();
    approveResult = { ok: true, body: {} };
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Sanction' }));
    expect(await screen.findByText('Budget approved successfully.')).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Budget approved successfully.', undefined, 'Approved by Finance');

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Inspect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sanction Budget' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Budget approved successfully.', 'Electrical', 'Approved by Finance'));
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Inspect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chat / Notes' }));
    expect(screen.getByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
  });

  it('validates rejection reasons and handles rejection failure and success', async () => {
    render(<FinanceBudgetApprovalsPage />);
    await screen.findByText('BOQ-01');
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Reject' }));
    expect(screen.getByText('Reject Budget Sanction')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Rejection' })).toBeDisabled();

    const reason = screen.getByPlaceholderText('Reason for rejection (mandatory)...');
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Confirm Rejection' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Rejection' }).closest('form')!);
    fireEvent.change(reason, { target: { value: 'Insufficient supporting documents' } });
    rejectResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Finance rejection failed')).toBeInTheDocument();
    rejectResult = { ok: false, body: { error: 'Reject service unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Reject service unavailable')).toBeInTheDocument();

    rejectResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Budget rejected by Finance with audit notes retained.')).toBeInTheDocument();
    const successBanner = screen.getByText('Budget rejected by Finance with audit notes retained.').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(successBanner).getByRole('button'));
    expect(screen.queryByText('Budget rejected by Finance with audit notes retained.')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Inspect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject Contribution' }));
    expect(screen.getByText('Reject Budget Sanction')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Reject Budget Sanction')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Inspect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/Finance Capex Sanction/)).not.toBeInTheDocument();
  });

  it('shows empty and failed queue states', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/approvals?type=FINANCE'
      ? Promise.resolve(response({}))
      : Promise.resolve(response({})));
    const { unmount } = render(<FinanceBudgetApprovalsPage />);
    expect(await screen.findByText('No budget contributions currently awaiting Finance approval.')).toBeInTheDocument();
    unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('finance queue unavailable'));
    render(<FinanceBudgetApprovalsPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByText('No budget contributions currently awaiting Finance approval.')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
