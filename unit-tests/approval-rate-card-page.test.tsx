/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RateCardApprovalsPage from '../src/app/(app)/approvals/rate-cards/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/link', () => ({ __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
jest.mock('../src/components/rate-cards/Section6ApproverView', () => ({
  __esModule: true,
  default: ({ role, onApproveProject, onApproveFinance, onReject }: any) => <section data-testid="section-six" data-role={role}>
    <button onClick={() => onApproveProject('project')}>Project approval</button>
    <button onClick={() => onApproveFinance('finance')}>Finance approval</button>
    <button onClick={() => onReject('no')}>Section reject</button>
  </section>,
}));
jest.mock('../src/components/rate-cards/Section7FinalisedDetails', () => ({ __esModule: true, default: () => <section data-testid="section-seven" /> }));

const cardOne = {
  id: 'rc-1', rateCardNumber: 'RC-1', version: 2, vendor: { name: 'Vendor One', code: 'V1', complianceStatus: 'Verified' },
  category: 'Electrical', scope: 'North Campus', location: 'Delhi', status: 'PENDING_PROJECT_APPROVAL',
  submittedBy: 'Alice', submittedAt: '2026-04-01T10:00:00Z', createdAt: '2026-03-01',
  validFrom: '2026-04-01', validTo: '2027-04-01', projectApprovedBy: 'Project Owner', projectApprovedAt: '2026-04-02',
  agreement: { type: 'MASTER', documentTitle: 'Supply Agreement', signature: { verified: true, signedBy: 'Vendor Signatory' } },
  items: [
    { id: 'i1', description: 'Copper Cable', specification: '4 core', uom: 'MTR', rate: 110, benchmarkRate: 100, historicalRate: 95, comparisonRef: 'PPO-1' },
    { id: 'i2', description: 'Control Panel', uom: 'EA', rate: 100, benchmarkRate: 0, historicalRate: 0 },
    { description: 'Cable Tray', uom: 'MTR', rate: 90, benchmarkRate: 100, historicalRate: 0 },
  ], terms: 'Net 45', justification: 'Volume discount',
  approvals: [{ id: 'a1', action: 'CLARIFICATION_MESSAGE', approverName: 'Finance Reviewer', remarks: UI_STRINGS.common.notAvailable, timestamp: '2026-04-02T10:00:00Z' }],
};
const cardTwo = {
  id: 'rc-2', rateCardNumber: 'RC-2', version: 0, vendor: {}, category: 'Civil', status: 'PENDING_FINANCE_APPROVAL',
  createdAt: '2026-03-02', validFrom: '2026-05-01', validTo: '2027-05-01', items: [], approvals: [],
  agreement: { type: 'MASTER', documentTitle: '', signature: { verified: false } },
};
const cardHistory = {
  id: 'rc-3', rateCardNumber: 'RC-3', vendor: { name: 'Old Vendor' }, category: 'Plumbing', status: 'APPROVED',
  createdAt: '2026-02-02', validFrom: '2026-01-01', validTo: '2026-12-31', items: [],
};
const rows = [cardOne, cardTwo, cardHistory];
const originalFetch = global.fetch;
const originalAlert = global.alert;
const mockFetch = jest.fn();
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });

function setupFetch(overrides: Record<string, (url: string, init?: RequestInit) => any> = {}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return Promise.resolve(reply({ user: { role: 'FINANCE_HEAD' } }));
    if (url === '/api/procurement/rate-cards' || url.startsWith('/api/procurement/rate-cards?')) return Promise.resolve(reply({ rateCards: rows.map((row) => {
      return { ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'approvals')), itemCount: row.items?.length || 0 };
    }), summary: { level1Pending: 1, level2Pending: 1 } }));
    const handler = Object.entries(overrides).find(([path]) => url === path || url.startsWith(path))?.[1];
    if (handler) return Promise.resolve(handler(url, init));
    if (/^\/api\/procurement\/rate-cards\/rc-[^/]+$/.test(url)) {
      const card = rows.find((row) => row.id === url.split('/').at(-1));
      return Promise.resolve(reply({ rateCard: card }));
    }
    if (url.endsWith('/message')) return Promise.resolve(reply({ approvalEntry: { id: 'a2', action: 'CLARIFICATION_MESSAGE', approverName: 'Finance Reviewer', remarks: 'Posted message', timestamp: '2026-04-03T10:00:00Z' } }));
    return Promise.resolve(reply({ message: 'Saved' }));
  });
  global.fetch = mockFetch as typeof fetch;
}

function openReview(id: string) {
  const row = screen.getByText(id).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.review) }));
}

async function invokeDisabledClick(element: HTMLElement) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactProps$'))!;
  await act(async () => { await (element as any)[key].onClick(); });
}

describe('rate card approvals queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetch();
    global.alert = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    global.alert = originalAlert;
  });

  it('loads role-aware queues, filters the tabs and reviews commercial details and messages', async () => {
    render(<RateCardApprovalsPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.loadingApprovalsQueue))).toBeInTheDocument();
    expect(await screen.findByText('RC-1')).toBeInTheDocument();
    expect(within(screen.getByText('RC-1').closest('tr')!).getByText(String(cardOne.items.length))).toBeInTheDocument();
    expect(screen.getByTestId('section-six')).toHaveAttribute('data-role', 'FINANCE_APPROVER');
    expect(screen.getByText('2 Pending Approval')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.awaitingLevel1Review))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.projectApprovedAwaitingFinance))).toBeInTheDocument();
    expect(screen.getByTestId('section-seven')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Project approval' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.projectApproval))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finance approval' }));
    expect(screen.getByText(/Level 2 Finance Approval completed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Section reject' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.rateCardRejectedWithRemarks))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.level1ProjectApproverQueueLevel1Count) }));
    expect(await screen.findByText('RC-1')).toBeInTheDocument();
    expect(screen.queryByText('RC-2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.level2FinanceApproverQueueLevel2Count) }));
    expect(await screen.findByText('RC-2')).toBeInTheDocument();
    expect(screen.queryByText('RC-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.historyConcluded) }));
    expect(await screen.findByText('RC-3')).toBeInTheDocument();
    expect(screen.queryByText('RC-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.allPendingTotalPending) }));
    expect(await screen.findByText('RC-1')).toBeInTheDocument();

    openReview('RC-1');
    expect(document.querySelector('.modal-content')).toBeInTheDocument();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.notAvailable))).toBeInTheDocument();
    expect(screen.getByText(/Signed by Vendor Signatory/)).toBeInTheDocument();
    expect(screen.getByText('Copper Cable')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.standardSpecificationCompliant))).toHaveLength(2);
    expect(screen.getByText('Net 45')).toBeInTheDocument();
    expect(screen.getByText('Volume discount')).toBeInTheDocument();
    expect(screen.getAllByText(UI_STRINGS.common.copy4s9bsz).length).toBeGreaterThan(0);

    const messageInput = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.askClarificationOrEnterEnquiryRemarks));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.postMessage) })).toBeDisabled();
    fireEvent.change(messageInput, { target: { value: '  Please attach the updated sheet  ' } });
    fireEvent.keyDown(messageInput, { key: 'Tab' });
    fireEvent.keyDown(messageInput, { key: 'Enter' });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/rate-cards/rc-1/message', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(mockFetch.mock.calls.find(([url]) => url.endsWith('/message'))[1].body)).toEqual({ message: 'Please attach the updated sheet' });
    expect(await screen.findByText('Posted message')).toBeInTheDocument();
    fireEvent.click(document.querySelector('.modal-content button')!);
  });

  it('handles approval, return and rejection success and failure flows with required remarks', async () => {
    const handlers: Record<string, (url: string, init?: RequestInit) => any> = {
      '/api/procurement/rate-cards/rc-1/approve': () => reply({}),
      '/api/procurement/rate-cards/rc-2/approve': () => reply({}, false),
      '/api/procurement/rate-cards/rc-1/revert': () => reply({ error: 'Return failed' }, false),
      '/api/procurement/rate-cards/rc-2/revert': () => reply({}),
      '/api/procurement/rate-cards/rc-1/reject': () => reply({ error: 'Rejection failed' }, false),
      '/api/procurement/rate-cards/rc-2/reject': () => reply({}),
      '/api/procurement/rate-cards/rc-1/message': () => reply({ error: 'Message failed' }, false),
    };
    setupFetch(handlers);
    render(<RateCardApprovalsPage />);
    await screen.findByText('RC-1');

    openReview('RC-1');
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.approveLevel1ForwardToFinance) }).at(-1)!);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.rateCardApprovedSuccessfully))).toBeInTheDocument();

    openReview('RC-2');
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.approveLevel2ActivateRateCard) }).at(-1)!);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.failedToApproveRateCard))).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.approveLevel2ActivateRateCard) }).at(-1)).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.returnForCorrection) }));
    const returnButton = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.confirmReturnForCorrection) });
    expect(returnButton).toBeDisabled();
    await invokeDisabledClick(returnButton);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.remarksReasonForReturnIsMandatory))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.mandatoryRemarksForCorrection)), { target: { value: '  Fix tax terms  ' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.confirmReturnForCorrection) }));
    expect(await screen.findByText('Rate Card returned for correction with remarks recorded.')).toBeInTheDocument();

    openReview('RC-2');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.rejectRateCard2) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.mandatoryRejectionReason)), { target: { value: '  Duplicate schedule  ' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText('Rate Card rejected with reason recorded.')).toBeInTheDocument();

    openReview('RC-1');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.rejectRateCard2) }));
    const rejectButton = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) });
    expect(rejectButton).toBeDisabled();
    await invokeDisabledClick(rejectButton);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.rejectionReasonRemarksIsMandatory))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.mandatoryRejectionReason)), { target: { value: 'Incomplete files' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.rejectionFailed))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.returnForCorrection) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.mandatoryRemarksForCorrection)), { target: { value: 'Update delivery window' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.confirmReturnForCorrection) }));
    expect(await screen.findByText('Return failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.askClarificationOrEnterEnquiryRemarks)), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.postMessage) }));
    await waitFor(() => expect(global.alert).toHaveBeenCalledWith('Message failed'));
  });

  it('renders an empty queue and tolerates missing rate-card data or failed requests', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve(reply({ data: { user: { role: 'PROJECT_APPROVER' } } }));
      return Promise.resolve(reply({}));
    });
    const emptyView = render(<RateCardApprovalsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.noRateCardsCurrentlyAwaitingApprovalInThisQueue))).toBeInTheDocument();
    expect(screen.getByTestId('section-six')).toHaveAttribute('data-role', 'PROJECT_APPROVER');
    emptyView.unmount();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementation((url: string) => url === '/api/auth/me' ? Promise.resolve(reply({})) : Promise.reject(new Error('Network unavailable')));
    render(<RateCardApprovalsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.noRateCardsCurrentlyAwaitingApprovalInThisQueue))).toBeInTheDocument();
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Error fetching rate cards:', expect.any(Error)));
    errorSpy.mockRestore();
  });
});
