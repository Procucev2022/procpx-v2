/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BoqPrApprovalPage from '../src/app/(app)/approvals/boq-pr/page';

const mockToastSuccess = jest.fn();
const mockFetch = jest.fn();
let queueBody: any = { prQueue: [] };
let queueOk = true;
let approveResult: { ok: boolean; body: any } = { ok: true, body: {} };
let revertResult: { ok: boolean; body: any } = { ok: true, body: {} };
let rejectResult: { ok: boolean; body: any } = { ok: true, body: {} };

jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockToastSuccess }) }));
jest.mock('../src/components/ApprovalChatDrawer', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, entityCode, initialEnquiryMode, onMessageSent }: any) => isOpen
    ? <section data-testid="approval-chat" data-mode={String(initialEnquiryMode)}>
      <span>{entityCode}</span>
      <button onClick={onMessageSent}>Refresh Queue</button>
      <button onClick={onClose}>Close Chat</button>
    </section>
    : null,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
jest.mock('../src/components/ui/PageHeader', () => ({
  PageHeader: ({ title, subtitle, actions, badge }: any) => <header><h1>{title}</h1><p>{subtitle}</p>{badge}{actions}</header>,
}));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCardGrid: ({ children }: any) => <div data-testid="summary-grid">{children}</div>,
  SummaryCard: ({ label, value, secondary }: any) => <article><span>{label}</span><strong>{value}</strong><small>{secondary}</small></article>,
}));
jest.mock('../src/components/ui/BoqDescriptionCell', () => ({
  __esModule: true,
  default: ({ text, itemDescription }: any) => <span>{text || itemDescription || 'No BOQ specification'}</span>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({ StatusBadge: ({ status }: any) => <span>{status}</span> }));

const originalFetch = global.fetch;
const primaryPr = {
  id: 'pr-1', prNumber: 'PR-001', title: 'Electrical package', totalLines: 2,
  totalEstimatedValue: 12500, totalQuantity: 12, requesterName: 'Asha Rao', requesterEmail: 'asha@example.test',
  requestedDate: '2026-10-20', hasEnquiry: true, categories: ['Electrical', 'Power'],
  boq: { boqCode: 'BOQ-01' }, boqRevision: { revisionCode: 'R2' },
  project: { name: 'North Plant', projectCode: 'NP-1' }, costCentre: { code: 'CC-01', name: 'Electrical' },
  lines: [
    { id: 'line-1', lineNumber: 3, itemDescription: 'Cable tray', specification: 'Hot dip galvanized', category: 'Electrical', quantity: 10, uom: 'M', estimatedRate: 400, estimatedValue: 4000 },
    { id: 'line-2', itemDescription: 'Grounding strip', boqLine: { specification: 'Copper strip' }, category: 'Power', quantity: 5, uom: 'M', estimatedRate: 150 },
  ],
};
const sparsePr = {
  id: 'pr-2', prNumber: 'PR-002', title: 'General package', requestedBy: 'Mira', createdAt: '2026-10-21',
  categories: [], hasEnquiry: false, totalEstimatedValue: 0, lines: [
    { id: 'line-3', itemDescription: 'Other item', quantity: 2, estimatedRate: 25 },
  ],
};

function response(body: any, ok = true) {
  return { ok, json: async () => body };
}

function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/approvals?type=PR') return Promise.resolve(response(queueBody, queueOk));
    if (url === '/api/pr/pr-1/approve' || url === '/api/pr/pr-2/approve') return Promise.resolve(response(approveResult.body, approveResult.ok));
    if (url.endsWith('/revert')) return Promise.resolve(response(revertResult.body, revertResult.ok));
    if (url.endsWith('/reject')) return Promise.resolve(response(rejectResult.body, rejectResult.ok));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('BOQ and PR approval workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queueBody = { prQueue: [primaryPr, sparsePr] };
    queueOk = true;
    approveResult = { ok: true, body: {} };
    revertResult = { ok: true, body: {} };
    rejectResult = { ok: true, body: {} };
    setupFetch();
  });

  afterAll(() => { global.fetch = originalFetch; });

  it('loads queue summaries, reviews BOQ lines, opens enquiry/chat, and renders optional data fallbacks', async () => {
    render(<BoqPrApprovalPage />);
    expect(await screen.findByText('PR-001')).toBeInTheDocument();
    expect(screen.getByText('Pending Queue')).toBeInTheDocument();
    expect(screen.getByText('2 BOQs')).toBeInTheDocument();
    expect(screen.getAllByText(/12,500/).length).toBeGreaterThan(0);
    expect(screen.getByText('1 Inquiries')).toBeInTheDocument();
    expect(screen.getByText('Clarification Pending')).toBeInTheDocument();
    expect(screen.getByText('General package')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Mira')).toBeInTheDocument();
    expect(screen.getByText('BOQ-01')).toBeInTheDocument();

    const row = screen.getByRole('row', { name: /PR-001/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Review BOQ' }));
    expect(screen.getByText('BOQ Details: PR-001')).toBeInTheDocument();
    expect(screen.getByText('Source BOQ').parentElement).toHaveTextContent('BOQ-01 (R2)');
    expect(screen.getByText('Cable tray')).toBeInTheDocument();
    expect(screen.getByText('Hot dip galvanized')).toBeInTheDocument();
    expect(screen.getByText('Copper strip')).toBeInTheDocument();
    expect(screen.getByText(/4,000/)).toBeInTheDocument();
    expect(screen.getByText(/750/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ask Clarification' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('PR-001');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Queue' }));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=PR');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('approval-chat')).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /PR-001/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: 'Chat' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: 'Message' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: 'Review BOQ' }));
    expect(screen.getByText('BOQ Details: PR-002')).toBeInTheDocument();
    expect(screen.getByText('(R0)')).toBeInTheDocument();
    expect(screen.getAllByText('Other item').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/50/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Chat with Requester' }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    await screen.findByRole('row', { name: /PR-002/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: 'Review BOQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revert for Correction' }));
    expect(screen.getByText('Revert BOQ for Correction')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Revert BOQ for Correction')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: 'Review BOQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('BOQ Details: PR-002')).not.toBeInTheDocument();
  });

  it('approves from the queue and review modal with errors and status dismissal', async () => {
    render(<BoqPrApprovalPage />);
    await screen.findByText('PR-001');
    approveResult = { ok: false, body: {} };
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approval failed')).toBeInTheDocument();

    approveResult = { ok: false, body: { error: 'Approval service unavailable' } };
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approval service unavailable')).toBeInTheDocument();
    const errorBanner = screen.getByText('Approval service unavailable').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(errorBanner).getByRole('button'));

    approveResult = { ok: true, body: {} };
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('BOQ approved successfully.')).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('BOQ approved successfully.', 'pr-1', 'Released to Category Manager');
    const status = screen.getByText('BOQ approved successfully.').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(status).getByRole('button'));
    expect(screen.queryByText('BOQ approved successfully.')).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /PR-001/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: 'Review BOQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve & Release to Procurement' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('BOQ approved successfully.', 'PR-001', 'Released to Category Manager'));
  });

  it('validates and submits revert requests, covering API error and success paths', async () => {
    render(<BoqPrApprovalPage />);
    await screen.findByText('PR-001');
    const row = screen.getByRole('row', { name: /PR-001/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Revert' }));
    expect(screen.getByText('Revert BOQ for Correction')).toBeInTheDocument();
    const reason = screen.getByPlaceholderText('Specific reasons and correction instructions for Project User (mandatory)...');
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Confirm Revert for Correction' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Revert for Correction' }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/revert'))).toBe(false);
    fireEvent.change(reason, { target: { value: 'Please correct the quantity.' } });

    revertResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Revert for Correction' }));
    expect(await screen.findByText('Revert failed')).toBeInTheDocument();
    revertResult = { ok: false, body: { error: 'Revert API unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Revert for Correction' }));
    expect(await screen.findByText('Revert API unavailable')).toBeInTheDocument();

    revertResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Revert for Correction' }));
    expect(await screen.findByText(/BOQ successfully returned to Project User/)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/revert', expect.objectContaining({ body: JSON.stringify({ reason: 'Please correct the quantity.' }) }));
    const message = screen.getByText(/BOQ successfully returned to Project User/).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(message).getByRole('button'));
    expect(screen.queryByText(/BOQ successfully returned to Project User/)).not.toBeInTheDocument();
  });

  it('validates and submits rejection requests, including errors and modal cancellation', async () => {
    render(<BoqPrApprovalPage />);
    await screen.findByText('PR-001');
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: 'Reject' }));
    expect(screen.getByText('Reject Purchase Request')).toBeInTheDocument();
    const reason = screen.getByPlaceholderText('Reason for rejection (mandatory)...');
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Confirm Rejection' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Rejection' }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/reject'))).toBe(false);
    fireEvent.change(reason, { target: { value: 'Missing approval evidence' } });

    rejectResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Rejection failed')).toBeInTheDocument();
    rejectResult = { ok: false, body: { error: 'Reject API unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Reject API unavailable')).toBeInTheDocument();
    rejectResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('BOQ rejected and returned to requester with feedback remarks.')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/reject', expect.objectContaining({ body: JSON.stringify({ reason: 'Missing approval evidence' }) }));

    await screen.findByRole('row', { name: /PR-001/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: 'Review BOQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject BOQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Reject Purchase Request')).not.toBeInTheDocument();
  });

  it('shows loading, empty and non-success queues and logs request failures', async () => {
    mockFetch.mockReturnValueOnce(new Promise(() => undefined));
    const loadingView = render(<BoqPrApprovalPage />);
    expect(screen.getByText('Loading BOQ approvals queue...')).toBeInTheDocument();
    loadingView.unmount();

    queueBody = {};
    const emptyView = render(<BoqPrApprovalPage />);
    expect(await screen.findByText('No BOQs awaiting Project Approver decision.')).toBeInTheDocument();
    emptyView.unmount();

    queueBody = { prQueue: [primaryPr] };
    queueOk = false;
    const nonSuccessView = render(<BoqPrApprovalPage />);
    expect(await screen.findByText('No BOQs awaiting Project Approver decision.')).toBeInTheDocument();
    nonSuccessView.unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('approval service offline'));
    render(<BoqPrApprovalPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByText('No BOQs awaiting Project Approver decision.')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
