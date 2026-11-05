/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VendorSourcingDashboard from '../src/components/VendorSourcingDashboard';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('../src/components/RfqChatDrawer', () => ({
  __esModule: true,
  default: ({ rfqId, rfqNumber, onClose }: any) => <aside data-testid="vendor-chat">{rfqId}:{rfqNumber}<button onClick={onClose}>Close Chat</button></aside>,
}));
jest.mock('../src/components/VendorNegotiationWorkspace', () => ({
  __esModule: true,
  default: ({ data, vendorId, vendorName, onBack, onSuccess }: any) => <main data-testid="vendor-negotiation" data-vendor={vendorId} data-name={vendorName}>
    {data.rfqNumber}<button onClick={onSuccess}>Offer Success</button><button onClick={onBack}>Return to Sourcing</button>
  </main>,
}));

const originalFetch = global.fetch;
const originalAlert = global.alert;
const mockFetch = jest.fn();
const dashboardUrl = '/api/procurement/vendors/vendor-1/dashboard';
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

const pendingPpo = {
  id: 'ppo-pending', ppoNumber: 'PPO-101', vendorStatus: 'PENDING', status: 'ISSUED', totalValue: 12000,
  currency: 'INR', createdAt: '2026-01-01', deliveryTerms: 'Within 14 days', paymentTerms: 'Net 30', taxDetails: 'GST',
  project: { name: 'North plant', location: 'Sector 8' }, rfq: { rfqNumber: 'RFQ-101' },
  lines: [
    { id: 'ppo-line-1', lineNumber: 1, itemDescription: 'Cable', specification: '4 core', uom: 'MTR', orderedQuantity: 10, orderedUnitRate: 100, totalOrderValue: 1000 },
    { id: 'ppo-line-2', itemDescription: 'Switch', specification: '', uom: 'EA', orderedQuantity: 2, orderedUnitRate: 500, totalOrderValue: 1000 },
  ],
};

const rfqRows = [
  {
    id: 'rfq-101', rfqNumber: 'RFQ-101', title: 'Cable supply', projectPackage: 'North plant package', category: 'Electrical', itemCount: 4,
    clientTenant: 'Buyer Corp', rfqReceivedDate: '2026-01-01T10:00:00Z', submissionDeadline: '2020-01-01',
    permittedCommercial: { latestQuoteTotal: 10000, counterOfferAmount: 9000 }, quotationStatus: 'SUBMITTED',
    buyerDecisionStatus: 'Order Execution', lastActivityDate: '2026-01-03T10:00:00Z', nextResponsibleParty: 'VENDOR', nextAction: 'Review counter',
    unreadMessagesCount: 3, latestRound: { buyerDecision: 'ACCEPTED', buyerDecisionDate: '2026-01-02', buyerDecisionRemarks: 'Approved with conditions' }, latestPpo: pendingPpo,
  },
  {
    id: 'rfq-102', rfqNumber: 'RFQ-102', title: 'Pump package', projectPackage: 'South site', category: 'Mechanical', itemCount: 2,
    clientTenant: 'Buyer Two', rfqReceivedDate: null, submissionDeadline: null,
    permittedCommercial: { latestQuoteTotal: 0, counterOfferAmount: null }, quotationStatus: 'AWAITING_REVISED_QUOTE',
    buyerDecisionStatus: 'PPO Awaited', lastActivityDate: null, nextResponsibleParty: 'BUYER', nextAction: 'Buyer review', unreadMessagesCount: 0,
  },
  {
    id: 'rfq-103', rfqNumber: 'RFQ-103', title: 'Final offer', projectPackage: 'East site', category: 'Civil', itemCount: 1,
    clientTenant: 'Buyer Three', rfqReceivedDate: '2026-03-01', submissionDeadline: '2099-01-01',
    permittedCommercial: { latestQuoteTotal: 5000, counterOfferAmount: 4500 }, quotationStatus: 'AWAITING_REVISED_QUOTE',
    buyerDecisionStatus: 'Final Offer Submitted', lastActivityDate: '2026-03-02', nextResponsibleParty: 'OTHER', nextAction: 'Awaiting buyer', unreadMessagesCount: 1,
    latestRound: { buyerDecision: 'REJECTED', buyerDecisionDate: null, buyerDecisionRemarks: '' },
  },
  { id: 'rfq-104', rfqNumber: 'RFQ-104', title: 'Acceptance', projectPackage: 'West site', category: 'Civil', itemCount: 3, clientTenant: 'Buyer Four', rfqReceivedDate: null, submissionDeadline: '2099-12-31', permittedCommercial: {}, quotationStatus: 'PENDING', buyerDecisionStatus: 'Final Acceptance Pending', lastActivityDate: '2026-03-03', nextResponsibleParty: 'BUYER', nextAction: 'Decision pending' },
  { id: 'rfq-105', rfqNumber: 'RFQ-105', title: 'Vendor sign-off', projectPackage: 'Central site', category: 'Electrical', itemCount: 1, clientTenant: 'Buyer Five', rfqReceivedDate: null, submissionDeadline: null, permittedCommercial: {}, quotationStatus: 'PENDING', buyerDecisionStatus: 'Pending Vendor Acceptance', lastActivityDate: '2026-03-04', nextResponsibleParty: 'VENDOR', nextAction: 'Accept PPO' },
  { id: 'rfq-106', rfqNumber: 'RFQ-106', title: 'Closed event', projectPackage: 'Closed site', category: 'Other', itemCount: 0, clientTenant: 'Buyer Six', rfqReceivedDate: null, submissionDeadline: null, permittedCommercial: {}, quotationStatus: 'PENDING', buyerDecisionStatus: 'Closed', lastActivityDate: '2026-03-05', nextResponsibleParty: 'OTHER', nextAction: 'Closed' },
  { id: 'rfq-107', rfqNumber: 'RFQ-107', title: 'Not accepted', projectPackage: 'Rejected site', category: 'Other', itemCount: 0, clientTenant: 'Buyer Seven', rfqReceivedDate: null, submissionDeadline: null, permittedCommercial: {}, quotationStatus: 'PENDING', buyerDecisionStatus: 'Not Accepted', lastActivityDate: '2026-03-06', nextResponsibleParty: 'OTHER', nextAction: 'Closed' },
  { id: 'rfq-108', rfqNumber: 'RFQ-108', title: 'In progress', projectPackage: 'Hill site', category: 'Mechanical', itemCount: 2, clientTenant: 'Buyer Eight', rfqReceivedDate: null, submissionDeadline: null, permittedCommercial: {}, quotationStatus: 'PENDING', buyerDecisionStatus: 'In Negotiation', lastActivityDate: '2026-03-07', nextResponsibleParty: 'BUYER', nextAction: 'Buyer action', latestPpo: { ...pendingPpo, id: 'ppo-accepted-row', vendorStatus: 'ACCEPTED_BY_VENDOR' } },
];

const ppos = [
  pendingPpo,
  { id: 'ppo-accepted', ppoNumber: 'PPO-102', vendorStatus: 'ACCEPTED_BY_VENDOR', totalValue: 25000, project: {}, createdAt: '2026-01-05', vendorAcceptedBy: 'Jane Vendor', vendorAcceptedVersion: 0, vendorAcceptedAt: null, lines: [] },
  { id: 'ppo-issue', ppoNumber: 'PPO-103', vendorStatus: 'ISSUE_RAISED', totalValue: 8000, status: 'ISSUED', project: {}, createdAt: '2026-01-06', vendorIssueRemarks: 'Clarify delivery', vendorIssueRaisedAt: null, lines: [] },
  { id: 'ppo-confirmed', ppoNumber: 'PPO-104', vendorStatus: 'OTHER', status: 'CONFIRMED', totalValue: 3000, project: {}, createdAt: '2026-01-07', lines: [] },
];

const rateCards = [{ id: 'rc-1', rateCardNumber: 'RC-1', version: 2, title: 'Electrical annual rates', scope: '', category: 'Electrical', validFrom: '2026-01-01', validTo: '2026-12-31', items: [{ id: 'i1' }], status: 'ACTIVE' }];
const dashboard = { counts: { newRfqs: 1, quotesDueSoon: 2, quotesSubmitted: 3, negotiationsAwaitingVendor: 4, finalOffersAwaitingBuyer: 5, quotesAcceptedPpoAwaited: 6, pposAwaitingAcceptance: 7, acceptedPpos: 8 }, rfqRegister: rfqRows, ppos, rateCards };
const detailedRfq = { ...rfqRows[0], id: 'rfq-101', rfqNumber: 'RFQ-101', lines: [{ id: 'line-1', description: 'Cable' }], negotiations: [{ id: 'neg-1', rounds: [{ id: 'round-1' }] }] };

function configureFetch(body: unknown = dashboard, ok = true) {
  mockFetch.mockImplementation((url: string) => {
    if (url === dashboardUrl) return Promise.resolve(response(body, ok));
    if (url === '/api/procurement/rfqs/rfq-101?includeNegotiationHistory=true') return Promise.resolve(response({ rfq: detailedRfq }));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('vendor sourcing dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureFetch();
    global.alert = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    global.alert = originalAlert;
  });

  it('renders KPIs, RFQ states, PPO states, rate cards, decision/chat/negotiation actions', async () => {
    render(<VendorSourcingDashboard vendorId="vendor-1" vendorName="Vendor One" vendorCode="V-1" />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.vendorSourcingOrderFulfillmentPipeline))).toBeInTheDocument();
    expect(screen.getByText('8', { selector: '.text-2xl' })).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.noRFQsFoundForThisVendor))).not.toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.pendingQuote)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.awaitingRevisedQuote)).length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/Counter:.*9,000/);
    expect(screen.getByText('Order Execution')).toHaveClass('badge-approved');
    expect(screen.getByText('PPO Awaited')).toHaveClass('badge-approved');
    expect(screen.getByText('Final Offer Submitted')).toHaveClass('badge-submitted');
    expect(screen.getByText('Final Acceptance Pending')).toHaveClass('badge-info');
    expect(screen.getByText('Pending Vendor Acceptance')).toHaveClass('badge-submitted');
    expect(screen.getAllByText('Closed').find((element) => element.classList.contains('badge'))).toHaveClass('badge-rejected');
    expect(screen.getByText('Not Accepted')).toHaveClass('badge-rejected');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.inNegotiation))).toHaveClass('badge badge-draft');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.acceptedPPOAwaited))).toBeInTheDocument();
    expect(screen.getByText(/Issue Raised/)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.acceptedByVendorSignatory)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Clarify delivery/)).toBeInTheDocument();
    expect(screen.getByText('RC-1 (v2)')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.standardScope))).toBeInTheDocument();
    expect(screen.getByText('1 items')).toBeInTheDocument();

    const register = document.querySelector('.table-responsive') as HTMLDivElement;
    fireEvent.wheel(register, { shiftKey: true, deltaY: 30 });
    expect(register.scrollLeft).toBe(30);
    fireEvent.wheel(register, { shiftKey: false, deltaY: 10 });

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.openRFQClarificationQueries))[0]);
    expect(screen.getByTestId('vendor-chat')).toHaveTextContent('rfq-101:RFQ-101');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(screen.queryByTestId('vendor-chat')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.viewBuyerDecisionDetails))[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.buyerDecisionRecord))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.approved))).toBeInTheDocument();
    fireEvent.click(document.querySelector('.modal-close')!);
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.viewBuyerDecisionDetails))[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.reviewAndAcceptPurchaseOrder))[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.acceptPurchaseOrderPPO))).toBeInTheDocument();
    fireEvent.click(document.querySelector('.modal-close')!);

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.openCommercialNegotiationWorkspace))[0]);
    await screen.findByTestId('vendor-negotiation');
    expect(screen.getByTestId('vendor-negotiation')).toHaveAttribute('data-vendor', 'vendor-1');
    fireEvent.click(screen.getByRole('button', { name: 'Offer Success' }));
    await screen.findByTestId('vendor-negotiation');
    fireEvent.click(screen.getByRole('button', { name: 'Return to Sourcing' }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.vendorSourcingOrderFulfillmentPipeline))).toBeInTheDocument();
  });

  it('loads the next page for each dashboard section and opens negotiation with full RFQ detail', async () => {
    const paginatedDashboard = {
      ...dashboard,
      pagination: {
        rfqs: { page: 1, pageSize: 25, total: 26, hasMore: true },
        ppos: { page: 1, pageSize: 25, total: 26, hasMore: true },
        rateCards: { page: 1, pageSize: 25, total: 26, hasMore: true },
      },
    };
    configureFetch(paginatedDashboard);
    mockFetch.mockImplementation((url: string) => {
      if (url === dashboardUrl) return Promise.resolve(response(paginatedDashboard));
      if (url === `${dashboardUrl}?section=rfqs&rfqPage=2&pageSize=25`) {
        return Promise.resolve(response({ rfqRegister: [{ ...rfqRows[0], id: 'rfq-109', rfqNumber: 'RFQ-109' }], pagination: { rfqs: { page: 2, pageSize: 25, total: 26, hasMore: false } } }));
      }
      if (url === `${dashboardUrl}?section=ppos&ppoPage=2&pageSize=25`) {
        return Promise.resolve(response({ ppos: [{ ...ppos[0], id: 'ppo-105', ppoNumber: 'PPO-105' }], pagination: { ppos: { page: 2, pageSize: 25, total: 26, hasMore: false } } }));
      }
      if (url === `${dashboardUrl}?section=rateCards&rateCardPage=2&pageSize=25`) {
        return Promise.resolve(response({ rateCards: [{ ...rateCards[0], id: 'rc-2', rateCardNumber: 'RC-2' }], pagination: { rateCards: { page: 2, pageSize: 25, total: 26, hasMore: false } } }));
      }
      if (url === '/api/procurement/rfqs/rfq-101?includeNegotiationHistory=true') return Promise.resolve(response({ rfq: detailedRfq }));
      return Promise.resolve(response({}));
    });

    render(<VendorSourcingDashboard vendorId="vendor-1" vendorName="Vendor One" vendorCode="V-1" />);
    await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.vendorSourcingOrderFulfillmentPipeline));
    const loadMoreButtons = screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) });
    expect(loadMoreButtons).toHaveLength(3);
    fireEvent.click(loadMoreButtons[0]);
    fireEvent.click(loadMoreButtons[1]);
    fireEvent.click(loadMoreButtons[2]);
    expect(await screen.findByText('RFQ-109')).toBeInTheDocument();
    expect(await screen.findByText('PPO-105')).toBeInTheDocument();
    expect(await screen.findByText('RC-2 (v2)')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(`${dashboardUrl}?section=rfqs&rfqPage=2&pageSize=25`);
    expect(mockFetch).toHaveBeenCalledWith(`${dashboardUrl}?section=ppos&ppoPage=2&pageSize=25`);
    expect(mockFetch).toHaveBeenCalledWith(`${dashboardUrl}?section=rateCards&rateCardPage=2&pageSize=25`);

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.openCommercialNegotiationWorkspace))[0]);
    expect(await screen.findByTestId('vendor-negotiation')).toHaveTextContent('RFQ-101');
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/rfqs/rfq-101?includeNegotiationHistory=true');
  });

  it('accepts a PPO and raises a clarification issue with persisted form details', async () => {
    render(<VendorSourcingDashboard vendorId="vendor-1" vendorName="Vendor One" vendorCode="V-1" />);
    await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.vendorSourcingOrderFulfillmentPipeline));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.acceptPPOConfirmOrder) })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.acceptPurchaseOrderPPO))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.buyerClient))).toHaveTextContent('North plant');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.deliveryTerms))).toHaveTextContent('Within 14 days');
    const acceptButton = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.formallyAcceptPPO) });
    expect(acceptButton).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('Vendor One Authorized Signatory'), { target: { value: 'Jane Authorized' } });
    fireEvent.change(screen.getByPlaceholderText(/Order acknowledged/), { target: { value: 'Order accepted' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(acceptButton.closest('form')!);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/ppos/ppo-pending/vendor-accept', expect.objectContaining({ method: 'POST' })));
    const acceptPayload = mockFetch.mock.calls.find(([url]) => url === '/api/procurement/ppos/ppo-pending/vendor-accept')?.[1];
    expect(JSON.parse(acceptPayload.body)).toEqual({ acceptedBy: 'Jane Authorized', vendorComments: 'Order accepted' });
    expect(await screen.findByText(/PPO-101 formally accepted/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.click(screen.getAllByRole('button', { name: /Request Clarification/ })[0]);
    fireEvent.click(document.querySelector('.modal-close')!);
    fireEvent.click(screen.getAllByRole('button', { name: /Request Clarification/ })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.reportClarificationIssueOnPPO))).toBeInTheDocument();
    const issueSubmit = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submitIssueToBuyer) });
    expect(issueSubmit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Specify the discrepancy/), { target: { value: 'Confirm shipment window' } });
    expect(issueSubmit).toBeEnabled();
    fireEvent.submit(issueSubmit.closest('form')!);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/ppos/ppo-pending/vendor-issue', expect.objectContaining({ method: 'POST' })));
    const issuePayload = mockFetch.mock.calls.find(([url]) => url === '/api/procurement/ppos/ppo-pending/vendor-issue')?.[1];
    expect(JSON.parse(issuePayload.body)).toEqual({ issueRemarks: 'Confirm shipment window', raisedBy: 'Jane Authorized' });
    expect(global.alert).toHaveBeenCalledWith(UI_STRINGS.componentsVendorSourcingDashboard.issueRecordedAndRoutedToBuyerWithoutAcceptingPPO);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(dashboardUrl));
  });

  it('shows loading, error and empty dashboard states, then reports accept and issue API errors', async () => {
    mockFetch.mockImplementation((url: string) => url === dashboardUrl ? new Promise(() => undefined) : Promise.resolve(response({})));
    const pending = render(<VendorSourcingDashboard vendorId="vendor-1" vendorName="Vendor One" vendorCode="V-1" />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.loadingPersistentVendorDashboardSourcingRecords))).toBeInTheDocument();
    pending.unmount();

    configureFetch({ error: 'Dashboard unavailable' }, false);
    render(<VendorSourcingDashboard vendorId="vendor-1" vendorName="Vendor One" vendorCode="V-1" />);
    expect(await screen.findByText('Dashboard unavailable')).toBeInTheDocument();

    configureFetch({});
    const emptyView = render(<VendorSourcingDashboard vendorId="vendor-1" vendorName="Vendor One" vendorCode="V-1" />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.noRFQsFoundForThisVendor))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.noPurchaseOrdersIssuedYet))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.noRateCardsRegisteredForThisVendor))).toBeInTheDocument();
    emptyView.unmount();

    configureFetch();
    const view = render(<VendorSourcingDashboard vendorId="vendor-1" vendorName="Vendor One" vendorCode="V-1" />);
    await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.vendorSourcingOrderFulfillmentPipeline));
    const accept = screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.acceptPPOConfirmOrder) })[0];
    fireEvent.click(accept);
    fireEvent.click(screen.getByRole('checkbox'));
    mockFetch.mockImplementation((url: string) => {
      if (url === dashboardUrl) return Promise.resolve(response(dashboard));
      if (url === '/api/procurement/ppos/ppo-pending/vendor-accept') return Promise.resolve(response({ error: 'Acceptance rejected' }, false));
      if (url === '/api/procurement/ppos/ppo-pending/vendor-issue') return Promise.resolve(response({ error: 'Issue rejected' }, false));
      return Promise.resolve(response({}));
    });
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorSourcingDashboard.formallyAcceptPPO) }).closest('form')!);
    await waitFor(() => expect(global.alert).toHaveBeenCalledWith('Error accepting PPO: Acceptance rejected'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.click(screen.getAllByRole('button', { name: /Request Clarification/ })[0]);
    fireEvent.change(screen.getByPlaceholderText(/Specify the discrepancy/), { target: { value: 'Clarify scope' } });
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submitIssueToBuyer) }).closest('form')!);
    await waitFor(() => expect(global.alert).toHaveBeenCalledWith('Error: Issue rejected'));
    view.unmount();
  });
});
