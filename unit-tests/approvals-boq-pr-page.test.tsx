/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.pendingQueue))).toBeInTheDocument();
    expect(screen.getByText('2 BOQs')).toBeInTheDocument();
    expect(screen.getAllByText(/12,500/).length).toBeGreaterThan(0);
    expect(screen.getByText('1 Inquiries')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.clarificationPending))).toBeInTheDocument();
    expect(screen.getByText('General package')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.standard))).toBeInTheDocument();
    expect(screen.getByText('Mira')).toBeInTheDocument();
    expect(screen.getByText('BOQ-01')).toBeInTheDocument();

    const row = screen.getByRole('row', { name: /PR-001/ });
    fireEvent.click(within(row).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    expect(screen.getByText('BOQ Details: PR-001')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.sourceBOQ)).parentElement).toHaveTextContent('BOQ-01 (R2)');
    expect(screen.getByText('Cable tray')).toBeInTheDocument();
    expect(screen.getByText('Hot dip galvanized')).toBeInTheDocument();
    expect(screen.getByText('Copper strip')).toBeInTheDocument();
    expect(screen.getByText(/4,000/)).toBeInTheDocument();
    expect(screen.getByText(/750/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Ask","toLocaleString":"Clarification"})) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('PR-001');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Queue' }));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals?type=PR');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('approval-chat')).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /PR-001/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Chat"})) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Message"})) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    expect(screen.getByText('BOQ Details: PR-002')).toBeInTheDocument();
    expect(screen.getByText('(R0)')).toBeInTheDocument();
    expect(screen.getAllByText('Other item').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/50/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Chat","toLocaleString":"with Requester"})) }));
    expect(await screen.findByTestId('approval-chat')).toHaveAttribute('data-mode', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));

    await screen.findByRole('row', { name: /PR-002/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Revert","toLocaleString":"for Correction"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.revertBOQForCorrection))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.revertBOQForCorrection))).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('row', { name: /PR-002/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
    expect(screen.queryByText('BOQ Details: PR-002')).not.toBeInTheDocument();
  });

  it('approves from the queue and review modal with errors and status dismissal', async () => {
    render(<BoqPrApprovalPage />);
    await screen.findByText('PR-001');
    approveResult = { ok: false, body: {} };
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.approvalFailed))).toBeInTheDocument();

    approveResult = { ok: false, body: { error: 'Approval service unavailable' } };
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) }));
    expect(await screen.findByText('Approval service unavailable')).toBeInTheDocument();
    const errorBanner = screen.getByText('Approval service unavailable').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(errorBanner).getByRole('button'));

    approveResult = { ok: true, body: {} };
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQApprovedSuccessfully))).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.bOQApprovedSuccessfully, 'pr-1', UI_STRINGS.common.userMessages.releasedToCategoryManager);
    const status = screen.getByText(uiStringPattern(UI_STRINGS.common.bOQApprovedSuccessfully)).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(status).getByRole('button'));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.bOQApprovedSuccessfully))).not.toBeInTheDocument();

    await screen.findByRole('row', { name: /PR-001/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"& Release to Procurement"})) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.bOQApprovedSuccessfully, 'PR-001', UI_STRINGS.common.userMessages.releasedToCategoryManager));
  });

  it('validates and submits revert requests, covering API error and success paths', async () => {
    render(<BoqPrApprovalPage />);
    await screen.findByText('PR-001');
    const row = screen.getByRole('row', { name: /PR-001/ });
    fireEvent.click(within(row).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Revert"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.revertBOQForCorrection))).toBeInTheDocument();
    const reason = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.specificReasonsAndCorrectionInstructionsForProjectUserMandatory));
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/revert'))).toBe(false);
    fireEvent.change(reason, { target: { value: 'Please correct the quantity.' } });

    revertResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.revertFailed))).toBeInTheDocument();
    revertResult = { ok: false, body: { error: 'Revert API unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) }));
    expect(await screen.findByText('Revert API unavailable')).toBeInTheDocument();

    revertResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) }));
    expect(await screen.findByText(/BOQ successfully returned to Project User/)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/revert', expect.objectContaining({ body: JSON.stringify({ reason: 'Please correct the quantity.' }) }));
    const message = screen.getByText(/BOQ successfully returned to Project User/).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(message).getByRole('button'));
    expect(screen.queryByText(/BOQ successfully returned to Project User/)).not.toBeInTheDocument();
  });

  it('validates and submits rejection requests, including errors and modal cancellation', async () => {
    render(<BoqPrApprovalPage />);
    await screen.findByText('PR-001');
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.rejectPurchaseRequest))).toBeInTheDocument();
    const reason = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.reasonForRejectionMandatory));
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/reject'))).toBe(false);
    fireEvent.change(reason, { target: { value: 'Missing approval evidence' } });

    rejectResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.rejectionFailed))).toBeInTheDocument();
    rejectResult = { ok: false, body: { error: 'Reject API unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText('Reject API unavailable')).toBeInTheDocument();
    rejectResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQRejectedAndReturnedToRequesterWithFeedbackRemarks))).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/reject', expect.objectContaining({ body: JSON.stringify({ reason: 'Missing approval evidence' }) }));

    await screen.findByRole('row', { name: /PR-001/ });
    fireEvent.click(within(screen.getByRole('row', { name: /PR-001/ })).getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"BOQ"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.rejectPurchaseRequest))).not.toBeInTheDocument();
  });

  it('shows loading, empty and non-success queues and logs request failures', async () => {
    mockFetch.mockReturnValueOnce(new Promise(() => undefined));
    const loadingView = render(<BoqPrApprovalPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsBoqPrPage.loadingBOQApprovalsQueue))).toBeInTheDocument();
    loadingView.unmount();

    queueBody = {};
    const emptyView = render(<BoqPrApprovalPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsBoqPrPage.noBOQsAwaitingProjectApproverDecision))).toBeInTheDocument();
    emptyView.unmount();

    queueBody = { prQueue: [primaryPr] };
    queueOk = false;
    const nonSuccessView = render(<BoqPrApprovalPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsBoqPrPage.noBOQsAwaitingProjectApproverDecision))).toBeInTheDocument();
    nonSuccessView.unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('approval service offline'));
    render(<BoqPrApprovalPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsBoqPrPage.noBOQsAwaitingProjectApproverDecision))).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
