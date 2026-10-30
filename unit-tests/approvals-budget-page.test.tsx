/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BudgetApprovalQueuePage from '../src/app/(app)/approvals/budget/page';

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
    boqRevision: { revisionCode: 'R2', lines: [
      { id: 'line-1', lineNumber: 4, standardDescription: 'Cable tray', category: { name: 'Electrical' }, quantity: 5, uomRaw: 'M', aiUnitCost: 400, aiTotalCost: 2000 },
      { id: 'line-2', originalDescription: 'Grounding strip', quantity: 2 },
      { id: 'line-3', quantity: 0, lineNumber: 0 },
    ] },
    project: { name: 'North Plant' }, costCentre: { code: 'CC-01', name: 'Electrical' },
    categories: ['Electrical', 'Power'], submitterName: 'Asha', submitterEmail: 'asha@example.test',
    submittedAt: '2026-01-05', hasEnquiry: true,
    financialImpact: { currentApprovedAmount: 5000, projectedApprovedTotal: 17500 },
    transactions: [
      { id: 'tx-1', category: 'Electrical', amount: 2000, quantity: 5, uom: 'M' },
      { id: 'tx-2', category: 'General', amount: 0, quantity: 0 },
    ],
  },
  {
    id: 'contrib-2', totalEstimatedValue: 600, createdAt: '2026-01-06', categories: [], hasEnquiry: false,
    boqRevision: {}, transactions: [{ id: 'tx-3', category: 'Civil', amount: 1 }],
  },
  { id: 'contrib-3', totalEstimatedValue: 0, createdAt: '2026-01-07', hasEnquiry: false },
];

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/approvals?type=BUDGET') return Promise.resolve(response({ budgetQueue: queue }));
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
    expect(screen.getByText('Clarification Pending')).toBeInTheDocument();
    expect(screen.getByText('Electrical package')).toBeInTheDocument();
    expect(screen.getAllByText('Project User')).toHaveLength(2);
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    expect(screen.getByText(/12,500/)).toBeInTheDocument();

    const firstRow = screen.getByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Review' }));
    expect(screen.getByText('Budget Review: BOQ-01 (R2)')).toBeInTheDocument();
    expect(screen.getByText('Category-wise Allocation Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Cable tray')).toBeInTheDocument();
    expect(screen.getByText('Grounding strip')).toBeInTheDocument();
    expect(screen.getAllByText('NOS')).toHaveLength(2);
    expect(screen.getByText('Current Approved Budget').parentElement).toHaveTextContent('5,000');
    fireEvent.click(screen.getByRole('button', { name: 'Ask Clarification' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('BOQ-01');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Queue' }));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=BUDGET');
    expect(await screen.findByRole('row', { name: /BOQ-01/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('approval-chat')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chat with Submitter' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Chat' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    const sparseRow = screen.getAllByRole('row')[3];
    fireEvent.click(within(sparseRow).getByRole('button', { name: 'Review' }));
    expect(screen.getByText('Budget Review: (R0)')).toBeInTheDocument();
    expect(screen.getAllByText('BOQ Fitout Scope').length).toBeGreaterThan(0);
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(within(sparseRow).getByRole('button', { name: 'Enquire' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
  });

  it('handles direct approval and approval from the review modal', async () => {
    render(<BudgetApprovalQueuePage />);
    await screen.findByText('BOQ-01');
    approveResult = { ok: false, body: {} };
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approval failed')).toBeInTheDocument();

    approveResult = { ok: false, body: { error: 'Budget approval is unavailable' } };
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Budget approval is unavailable')).toBeInTheDocument();

    approveResult = { ok: true, body: {} };
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Budget approved successfully.')).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Budget approved successfully.', undefined, 'Under Finance Approval');
    const banner = screen.getByText('Budget approved successfully.').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(banner).getByRole('button'));
    expect(screen.queryByText('Budget approved successfully.')).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve & Route to Finance' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Budget approved successfully.', 'Electrical', 'Under Finance Approval'));
  });

  it('validates rejection reasons and handles rejection error, success, and cancellation', async () => {
    render(<BudgetApprovalQueuePage />);
    await screen.findByText('BOQ-01');
    const row = screen.getByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    expect(screen.getByText('Reject Budget Contribution')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Rejection' })).toBeDisabled();

    const reason = screen.getByPlaceholderText('Reason for rejection (mandatory)...');
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Confirm Rejection' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Rejection' }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => url === '/api/budgets/reject')).toBe(false);
    fireEvent.change(reason, { target: { value: 'Insufficient supporting documents' } });

    rejectResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Rejection failed')).toBeInTheDocument();
    rejectResult = { ok: false, body: { error: 'Reject service unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Reject service unavailable')).toBeInTheDocument();

    rejectResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Budget contribution rejected with audit notes.')).toBeInTheDocument();
    const successBanner = screen.getByText('Budget contribution rejected with audit notes.').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(successBanner).getByRole('button'));
    expect(screen.queryByText('Budget contribution rejected with audit notes.')).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /BOQ-01/ });
    fireEvent.click(within(screen.getByRole('row', { name: /BOQ-01/ })).getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject Contribution' }));
    expect(screen.getByText('Reject Budget Contribution')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Reject Budget Contribution')).not.toBeInTheDocument();
  });

  it('shows empty, non-success, and failed queue states', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/approvals?type=BUDGET'
      ? Promise.resolve(response({}))
      : Promise.resolve(response({})));
    const { unmount } = render(<BudgetApprovalQueuePage />);
    expect(await screen.findByText('No budget contributions currently awaiting Project Approver approval.')).toBeInTheDocument();
    unmount();

    mockFetch.mockImplementation((url: string) => url === '/api/approvals?type=BUDGET'
      ? Promise.resolve(response({ budgetQueue: queue }, false))
      : Promise.resolve(response({})));
    render(<BudgetApprovalQueuePage />);
    expect(await screen.findByText('No budget contributions currently awaiting Project Approver approval.')).toBeInTheDocument();
    expect(screen.getByText('0 Allocations')).toBeInTheDocument();
  });

  it('logs queue request exceptions and leaves the queue empty', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('project approval queue unavailable'));
    render(<BudgetApprovalQueuePage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByText('No budget contributions currently awaiting Project Approver approval.')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
