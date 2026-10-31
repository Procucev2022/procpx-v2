/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VendorAuctionsPage from '../src/app/(app)/vendor-portal/auctions/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const mockToastError = jest.fn();
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({ __esModule: true, default: ({ status }: { status: string }) => <span>{status}</span> }));
jest.mock('../src/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({ title, description }: { title: string; description: string }) => <div><h3>{title}</h3><p>{description}</p></div>,
}));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ error: mockToastError }) }));

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const liveAuction = {
  id: 'live-1', auctionNumber: 'AUC-001', title: 'Electrical cable supply', rfqNumber: 'RFQ-001', status: 'LIVE',
  auctionType: 'REVERSE_AUCTION', auctionCategory: 'ITEM_WISE', startTime: 'invalid-start', scheduledEndTime: '', endTime: '',
  currentLowestBid: 12500, currency: 'INR', bids: [{ id: 'bid-1' }],
};
const auctions = [
  liveAuction,
  { id: 'extended-1', auctionNumber: 'AUC-002', title: 'Extended auction', rfqNumber: 'RFQ-002', status: 'EXTENDED',
    auctionType: 'FORWARD_AUCTION', auctionCategory: 'TOTAL', startTime: '', scheduledEndTime: '', endTime: '', currentLowestBid: 0, bids: [] },
  { id: 'scheduled-1', auctionNumber: 'AUC-003', title: 'Scheduled event', rfqNumber: 'RFQ-003', status: 'SCHEDULED',
    auctionType: 'SEALED_BID', auctionCategory: 'ITEM_WISE', startTime: '2026-11-01T10:00:00.000Z', scheduledEndTime: '2026-11-01T12:00:00.000Z', bids: [] },
  { id: 'closed-1', auctionNumber: 'AUC-004', title: 'Closed event', rfqNumber: 'RFQ-004', status: 'CLOSED', bids: [] },
  { id: 'completed-1', auctionNumber: 'AUC-005', title: 'Completed event', rfqNumber: 'RFQ-005', status: 'COMPLETED', bids: [{ id: 'bid-2' }] },
  { id: 'rfq-search', auctionNumber: '', title: '', rfqNumber: 'RFQ-ONLY-MATCH', status: 'SCHEDULED', bids: [{ id: 'bid-3' }] },
];
const response = (body: unknown) => ({ json: jest.fn().mockResolvedValue(body) });

describe('vendor portal auctions page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(response({ auctions }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('shows loading while the first request is pending', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    const loading = render(<VendorAuctionsPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.loadingInvitedAuctions))).toBeInTheDocument();
    loading.unmount();
  });

  it('shows empty results, refreshes without replacing data, and reports fetch errors', async () => {
    fetchMock.mockResolvedValueOnce(response({ auctions: [] }));
    render(<VendorAuctionsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.noAuctionsInThisTab))).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response({}));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refreshTelemetry) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.noAuctionsInThisTab))).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refreshTelemetry) }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: UI_STRINGS.common.error, message: UI_STRINGS.appAppVendorPortalAuctionsPage.failedToLoadInvitedAuctions }));
  });

  it('filters auction tabs, searches auction/title/RFQ identifiers, and renders auction details', async () => {
    const dateFormat = jest.spyOn(Date.prototype, 'toLocaleString').mockImplementationOnce(() => { throw new Error('date formatter failed'); });
    render(<VendorAuctionsPage />);
    expect(await screen.findByText('AUC-001')).toBeInTheDocument();
    expect(screen.getByText('AUC-002')).toBeInTheDocument();
    expect(screen.queryByText('AUC-003')).not.toBeInTheDocument();
    expect(screen.getByText('invalid-start')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.currentLeading))).toBeInTheDocument();
    expect(dateFormat).toHaveBeenCalled();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.reverse))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.forward))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.itemWise))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.rFQTotalWise))).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.enterBiddingRoom) })[0]).toHaveAttribute('href', '/vendor-portal/auctions/live-1');

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.upcomingScheduled) }));
    expect(screen.getByText('AUC-003')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.sealedBid))).toHaveLength(2);
    expect(screen.queryByText('AUC-001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.myPlacedBids) }));
    expect(screen.getByText('AUC-005')).toBeInTheDocument();
    expect(screen.queryByText('AUC-002')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.completedResults) }));
    expect(screen.getByText('AUC-004')).toBeInTheDocument();
    expect(screen.getByText('AUC-005')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.allInvitations) }));
    expect(screen.getByText('AUC-001')).toBeInTheDocument();
    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalAuctionsPage.searchByAuctionTitleRFQ));
    fireEvent.change(search, { target: { value: 'auc-001' } });
    expect(screen.getByText('AUC-001')).toBeInTheDocument();
    expect(screen.queryByText('AUC-002')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'electrical cable' } });
    expect(screen.getByText('AUC-001')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'rfq-only-match' } });
    expect(screen.getByText('RFQ-ONLY-MATCH')).toBeInTheDocument();
    expect(screen.queryByText('AUC-001')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: '   ' } });
    expect(screen.getByText('AUC-001')).toBeInTheDocument();
    expect(screen.getByText('AUC-005')).toBeInTheDocument();
  });
});
