/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorRfqsPage from '../src/app/(app)/vendor-portal/rfqs/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

jest.mock('../src/components/RfqChatDrawer', () => ({
  __esModule: true,
  default: ({ rfqId, rfqNumber, onClose }: any) => <aside data-testid="rfq-chat">{rfqId}:{rfqNumber}<button onClick={onClose}>Close Chat</button></aside>,
}));

jest.mock('../src/components/VendorNegotiationWorkspace', () => ({
  __esModule: true,
  default: ({ data, vendorId, vendorName, onBack, onSuccess }: any) => <main data-testid="negotiation-workspace" data-vendor={vendorId} data-name={String(vendorName || '')}>
    {data.rfqNumber}<button onClick={onSuccess}>Negotiation Success</button><button onClick={onBack}>Back to RFQs</button>
  </main>,
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
const rows = [
  {
    id: 'pending-1', rfqNumber: 'RFQ-PENDING', title: 'Cable package', project: { name: 'North plant', projectCode: 'NP' },
    clientTenant: 'Acme', rfqReceivedDate: '2026-01-01T10:05:00.000Z', submissionDeadline: '2020-01-01',
    lastActivityDate: null, quoteStatus: 'PENDING', buyerDecisionStatus: 'Under Evaluation', nextResponsibleParty: 'VENDOR',
  },
  {
    id: 'neg-1', rfqNumber: 'RFQ-NEG', title: 'Pump package', project: { name: 'South plant' }, tenant: { name: 'Buyer Co' },
    rfqReceivedDate: 'invalid-date', submissionDeadline: '2099-01-01', lastActivityDate: '2026-02-02T12:04:00.000Z',
    quotes: [{ id: 'quote-1', totalQuoteAmount: 15000, quoteVersion: 2, submittedAt: '2026-02-02' }], lines: [{ id: 'line-1' }], negotiations: [{ rounds: [{}] }],
    quoteStatus: 'SUBMITTED', buyerDecisionStatus: 'Counter-Offer Awaited', nextResponsibleParty: 'BUYER',
    latestRound: { counterOfferAmount: 14000, revisedQuoteAmount: 0, nextResponsibleParty: 'VENDOR', roundNumber: 3 },
  },
  {
    id: 'awarded-1', rfqNumber: 'RFQ-AWARD', title: 'PPO package', project: { name: 'East plant' }, clientTenant: 'Buyer Two',
    rfqReceivedDate: null, submissionDeadline: null, lastActivityDate: '2026-02-03',
    latestQuote: { totalQuoteAmount: 18000, quoteVersion: 1 }, ppos: [{ id: 'ppo-1' }], negotiations: [],
    quoteStatus: 'ACCEPTED', buyerDecisionStatus: 'Order Execution', nextResponsibleParty: 'OTHER',
  },
  { id: 'rejected-1', rfqNumber: 'RFQ-REJECT', title: 'Rejected package', project: { name: 'West plant' }, quotes: [{}], quoteStatus: 'REJECTED', buyerDecisionStatus: 'Closed' },
  { id: 'accept-1', rfqNumber: 'RFQ-ACCEPT', title: 'Accepted package', project: { name: 'Central plant' }, quotes: [{}], buyerDecisionStatus: 'PPO Awaited' },
  { id: 'offer-1', rfqNumber: 'RFQ-OFFER', title: 'Final offer package', project: { name: 'Hill plant' }, quotes: [{}], buyerDecisionStatus: 'Final Offer Pending Acceptance' },
  { id: 'negotiating-2', rfqNumber: 'RFQ-NEG2', title: 'Negotiation package', project: { name: 'Lake plant' }, quotes: [{}], negotiations: [{ rounds: [{}] }], buyerDecisionStatus: 'In Negotiation' },
  { id: 'default-1', rfqNumber: 'RFQ-DEFAULT', title: 'Default package', project: {}, buyerDecisionStatus: 'Other decision' },
];

const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

function configureFetch(rfqResponse = response({ rfqs: rows }), sessionResponse = response({ user: { name: 'Vendor rep', vendorId: 'vendor-1' } })) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/auth/session') return Promise.resolve(sessionResponse);
    if (url === '/api/vendor-portal/rfqs') return Promise.resolve(rfqResponse);
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('vendor portal RFQ register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/vendor-portal/rfqs');
    configureFetch();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('shows loading, renders RFQ records and status variants, and opens chat and negotiation', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/vendor-portal/rfqs'
      ? new Promise(() => undefined)
      : Promise.resolve(response({ user: { name: 'Vendor rep', vendorId: 'vendor-1' } })));
    const pending = render(<VendorRfqsPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.loadingInvitedRFQs))).toBeInTheDocument();
    pending.unmount();

    configureFetch();
    render(<VendorRfqsPage />);
    expect(await screen.findByText('RFQ-PENDING')).toBeInTheDocument();
    expect(screen.getByText('RFQ-NEG')).toBeInTheDocument();
    expect(screen.getByText('RFQ-AWARD')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.generalProject))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.enterpriseClient)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.mainPackage)).length).toBeGreaterThan(0);
    expect(screen.getByText('Buyer Co')).toBeInTheDocument();
    expect(screen.getByText('Buyer Offer: ₹14,000 (R3)')).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.common.currencyAmount, { currency: UI_STRINGS.common.indianRupeeSymbol, amount: '15,000' }))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.awaitingQuote)).length).toBeGreaterThan(0);
    expect(screen.getByText('Closed')).toHaveClass('badge-rejected');
    expect(screen.getByText('Order Execution')).toHaveClass('badge-approved');
    expect(screen.getByText('PPO Awaited')).toHaveClass('badge-approved');
    expect(screen.getByText('Final Offer Pending Acceptance')).toHaveClass('badge-submitted');
    expect(screen.getByText('Counter-Offer Awaited')).toHaveClass('badge-submitted');
    expect(within(screen.getByRole('row', { name: /RFQ-NEG2/ })).getByText(uiStringPattern(UI_STRINGS.common.inNegotiation))).toHaveClass('badge-info');

    const table = document.querySelector('.table-responsive') as HTMLDivElement;
    Object.defineProperty(table, 'scrollBy', { configurable: true, value: jest.fn() });
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.scrollTableLeft)));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.scrollTableRightToActions)));
    expect(table.scrollBy).toHaveBeenCalledTimes(2);
    fireEvent.wheel(table, { shiftKey: true, deltaY: 45 });
    expect(table.scrollLeft).toBe(45);
    fireEvent.wheel(table, { shiftKey: false, deltaY: 15 });

    const negRow = screen.getByRole('row', { name: /RFQ-NEG Pump package/ });
    fireEvent.click(negRow.querySelector('button[title="Technical & Commercial Clarification Chat"]')!);
    expect(screen.getByTestId('rfq-chat')).toHaveTextContent('neg-1:RFQ-NEG');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('rfq-chat')).not.toBeInTheDocument();

    fireEvent.click(negRow.querySelector('button[title="Open Commercial Negotiation Workspace"]')!);
    expect(screen.getByTestId('negotiation-workspace')).toHaveAttribute('data-vendor', 'vendor-1');
    expect(screen.getByTestId('negotiation-workspace')).toHaveAttribute('data-name', 'Vendor rep');
    fireEvent.click(screen.getByRole('button', { name: 'Negotiation Success' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/rfqs'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to RFQs' }));
    expect(await screen.findByText('RFQ-PENDING')).toBeInTheDocument();
  });

  it('filters by tabs and each searchable RFQ field', async () => {
    render(<VendorRfqsPage />);
    await screen.findByText('RFQ-PENDING');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.pendingQuote) }));
    expect(screen.getByText('RFQ-PENDING')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-NEG')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.inNegotiation) }));
    expect(screen.getByText('RFQ-NEG')).toBeInTheDocument();
    expect(screen.getByText('RFQ-NEG2')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-AWARD')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.pPOAwarded) }));
    expect(screen.getByText('RFQ-AWARD')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-NEG')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.allInvitedLength) }));
    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.searchRFQClientProject));
    fireEvent.change(search, { target: { value: 'rfq-pending' } });
    expect(screen.getByText('RFQ-PENDING')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-NEG')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'pump package' } });
    expect(screen.getByText('RFQ-NEG')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'north plant' } });
    expect(screen.getByText('RFQ-PENDING')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'buyer two' } });
    expect(screen.getByText('RFQ-AWARD')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'not found' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.noRFQsMatchYourSearchFilter))).toBeInTheDocument();
  });

  it('opens a negotiation from the URL by id or case-insensitive RFQ number and falls back to invited vendor details', async () => {
    window.history.replaceState({}, '', '/vendor-portal/rfqs?negotiate=RFQ-NEG');
    configureFetch(response({ rfqs: [{ ...rows[1], invitedVendors: [{ vendorId: 'invited-vendor' }], quotes: [] }] }), response({}));
    const view = render(<VendorRfqsPage />);
    expect(await screen.findByTestId('negotiation-workspace')).toHaveAttribute('data-vendor', 'invited-vendor');
    expect(screen.getByTestId('negotiation-workspace')).toHaveAttribute('data-name', '');
    fireEvent.click(screen.getByRole('button', { name: 'Back to RFQs' }));
    expect(await screen.findByText('RFQ-NEG')).toBeInTheDocument();
    view.unmount();

    window.history.replaceState({}, '', '/vendor-portal/rfqs?negotiate=neg-1');
    configureFetch(response({ rfqs: [{ ...rows[1], invitedVendors: [], quotes: [{ vendorId: 'quote-vendor' }] }] }), response({}));
    render(<VendorRfqsPage />);
    expect(await screen.findByTestId('negotiation-workspace')).toHaveAttribute('data-vendor', 'quote-vendor');
  });

  it('handles empty lists, refresh, API errors, and session request failure', async () => {
    configureFetch(response({ rfqs: [] }));
    const first = render(<VendorRfqsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsPage.youHaveNotBeenInvitedToAnyRFQsAtThisTime))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    first.unmount();

    configureFetch(response({}, false));
    render(<VendorRfqsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadRfqs))).toBeInTheDocument();

    mockFetch.mockImplementation((url: string) => url === '/api/auth/session'
      ? Promise.reject(new Error('session failed'))
      : Promise.resolve({ ok: false, json: async () => { throw new Error('body parse failed'); } }));
    render(<VendorRfqsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadRfqs))).toBeInTheDocument();

    mockFetch.mockImplementation((url: string) => url === '/api/auth/session'
      ? Promise.resolve(response({}))
      : Promise.reject(new Error('network down')));
    render(<VendorRfqsPage />);
    expect(await screen.findByText('network down')).toBeInTheDocument();
  });
});
