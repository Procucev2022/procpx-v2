/** @jest-environment jsdom */
import React, { Suspense } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LiveAuctionRoomPage from '../src/app/(app)/procurement/auctions/[id]/page';

const mockRouterPush = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockToastSuccess, error: mockToastError }) }));

const routeParams = Promise.resolve({ id: 'auction-1' });
const liveAuction = {
  id: 'auction-1', auctionNumber: 'AUC-001', title: 'Cable Reverse Auction', auctionType: 'REVERSE_AUCTION',
  auctionCategory: 'ITEM_WISE', status: 'LIVE', extensionCount: 2, currency: 'INR', currentLeadingBid: 120000,
  startingPrice: 150000, minDecrement: 5000, refreshIntervalSeconds: 10,
  endTime: '2099-06-01T12:00:00.000Z', scheduledEndTime: '2099-06-01T12:00:00.000Z', scrollingText: 'Safety first',
  rfq: { id: 'rfq-1', rfqNumber: 'RFQ-001', prNumber: 'PR-001', boqNumber: 'BOQ-001', packageName: 'North Plant' },
  termsAndConditions: 'All bids are binding.\nMaintain confidentiality.',
  documents: [{ name: 'Terms.pdf', size: '10 KB' }, { size: '' }],
  bids: [
    { id: 'bid-1', bidNumber: 1, vendorName: 'Alpha Supply', itemCode: 'CBL-1', bidAmount: 120000, timestamp: '2026-04-01T10:00:00Z', isLeading: true },
    { id: 'bid-2', bidNumber: 2, vendorName: 'Beta Supply', bidAmount: 0, timestamp: '', isLeading: false },
  ],
  items: [
    { id: 'item-1', itemCode: 'CBL-1', description: 'Copper cable', boqDescription: '4 core PVC', uom: 'MTR', quantity: 10, startPrice: 15000, currentLowestBid: 12000 },
    { id: 'item-2', itemCode: 'CBL-2', description: 'Control cable', uom: 'MTR', quantity: 5, startPrice: 0, currentLowestBid: 0 },
  ],
  vendors: [
    { id: 'v1', vendorId: 'v1', name: 'Alpha Supply', code: 'ALPHA', termsAcceptedAt: '2026-03-01', bidCount: 4, bestRank: 1 },
    { id: 'v2', vendorId: 'v2', name: 'Beta Supply', code: 'BETA', termsAcceptedAt: null, bidCount: 2, bestRank: 2 },
  ],
};
const originalFetch = global.fetch;
const mockFetch = jest.fn();
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
let currentAuction: any = liveAuction;
let actionReply = reply({ message: 'Control applied' });
let bidReply = reply({ extended: true, message: 'Bid recorded' });

function configureFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return Promise.resolve(actionReply);
    if (init?.method === 'POST') return Promise.resolve(bidReply);
    return Promise.resolve(reply({ auction: currentAuction, isObserver: false, serverTime: '2026-04-01T10:00:00Z' }));
  });
  global.fetch = mockFetch as typeof fetch;
}

function renderRoom() {
  return render(<Suspense fallback={<div>Loading route</div>}><LiveAuctionRoomPage params={routeParams} /></Suspense>);
}

describe('live auction room', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(React, 'use').mockReturnValue({ id: 'auction-1' } as any);
    currentAuction = liveAuction;
    actionReply = reply({ message: 'Control applied' });
    bidReply = reply({ extended: true, message: 'Bid recorded' });
    configureFetch();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { global.fetch = originalFetch; });

  it('shows loading and not-found states and reports fetch errors', async () => {
    mockFetch.mockReturnValueOnce(new Promise(() => undefined));
    const pending = renderRoom();
    expect(screen.getByText('Synchronising live auction telemetry and server clock...')).toBeInTheDocument();
    pending.unmount();

    mockFetch.mockResolvedValueOnce(reply({}));
    const missingView = renderRoom();
    expect(await screen.findByText('Auction not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to Auctions Workspace' })).toHaveAttribute('href', '/procurement/auctions');
    missingView.unmount();

    mockFetch.mockResolvedValueOnce(reply({ error: 'Auction access denied' }, false));
    const deniedView = renderRoom();
    expect(await screen.findByText('Auction not found')).toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: 'Error', message: 'Auction access denied' }));
    deniedView.unmount();

    mockFetch.mockRejectedValueOnce(new Error('Auction service offline'));
    const failedView = renderRoom();
    expect(await screen.findByText('Auction not found')).toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: 'Error', message: 'Auction service offline' }));
    failedView.unmount();
  });

  it('renders live auction tabs and buyer controls, records actions and submits assisted bids', async () => {
    renderRoom();
    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    expect(screen.getByText('CURRENT LOWEST BID (L1)')).toBeInTheDocument();
    expect(screen.getByText(/EXTENDED 2X/)).toBeInTheDocument();
    expect(screen.getByText('Safety first')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Supply')).toHaveLength(2);
    expect(screen.getByText('TERMS ACCEPTED')).toBeInTheDocument();
    expect(screen.getByText('TERMS PENDING')).toBeInTheDocument();

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const runControl = async (label: string, action: string) => {
      const button = screen.getByRole('button', { name: label });
      fireEvent.click(button);
      await waitFor(() => expect(mockFetch.mock.calls.some(([url, init]) => url === '/api/procurement/auctions/auction-1' && init?.method === 'PUT' && JSON.parse(init.body as string).action === action)).toBe(true));
      await waitFor(() => expect(button).toBeEnabled());
    };
    await runControl('Pause Bidding', 'PAUSE');
    await runControl('+3m Rolling Extension', 'EXTEND');
    await runControl('+5m Rolling Extension', 'EXTEND');
    fireEvent.click(screen.getByRole('button', { name: 'Conclude Auction' }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT' && JSON.parse(init.body as string).action === 'CONCLUDE')).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Conclude Auction' })).toBeEnabled());
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT' && JSON.parse(init.body as string).action === 'CONCLUDE')).toBe(true);
    confirmSpy.mockRestore();

    fireEvent.click(screen.getByRole('button', { name: /Auction Scope Items/ }));
    expect(screen.getByText('Copper cable')).toBeInTheDocument();
    expect(screen.getByText('4 core PVC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Documents & Terms' }));
    expect(screen.getByText(/All bids are binding/)).toBeInTheDocument();
    expect(screen.getByText('Terms.pdf')).toBeInTheDocument();
    expect(screen.getByText('Document_2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Telemetry' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/auctions/auction-1'));
    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log Assisted Vendor Bid' }));
    expect(screen.getByText(/Record a verified phone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Validated Bid' }));
    expect(mockToastError).toHaveBeenCalledWith({ title: 'Validation', message: 'Please select a vendor and enter a valid bid amount.' });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'v1' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'item-1' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1450000'), { target: { value: '110000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Validated Bid' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/auctions/auction-1/bid', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body as string);
    expect(payload).toEqual({ vendorId: 'v1', bidAmount: 110000, auctionItemId: 'item-1' });
    expect(mockToastSuccess).toHaveBeenCalledWith({ title: 'Bid Accepted & Rolling Extended!', message: 'Bid recorded' });

    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log Assisted Vendor Bid' }));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1450000'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1450000'), { target: { value: '105000' } });
    bidReply = reply({ extended: false, message: 'Bid accepted without item' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Validated Bid' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith({ title: 'Bid Accepted', message: 'Bid accepted without item' }));
    const secondBid = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').at(-1)?.[1];
    expect(JSON.parse(secondBid.body)).toEqual({ vendorId: 'v1', bidAmount: 105000, auctionItemId: null });

    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log Assisted Vendor Bid' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. 1450000'), { target: { value: '100000' } });
    bidReply = reply({ error: 'Minimum bid reduction not met' }, false);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Validated Bid' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: 'Bid Rejected', message: 'Minimum bid reduction not met' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('covers observer, sealed, paused and completed views and reports failed controls or bids', async () => {
    currentAuction = { ...liveAuction, auctionType: 'SEALED_BID', auctionCategory: 'RFQ_TOTAL_WISE', status: 'PAUSED', currentLeadingBid: null, bids: [], items: [], documents: [] };
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method ? Promise.resolve(actionReply) : Promise.resolve(reply({ auction: currentAuction, isObserver: true })));
    const observerView = renderRoom();
    expect(await screen.findByText('Sealed Bid Protocol Active')).toBeInTheDocument();
    expect(screen.queryByText('BUYER LIVE CONTROLS:')).not.toBeInTheDocument();
    expect(screen.getByText('Encrypted & Confidential')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Documents & Terms' }));
    expect(screen.getByText('No external attachments uploaded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Live Bid Stream (0)' }));
    expect(screen.getByText('Sealed Bid Protocol Active')).toBeInTheDocument();
    observerView.unmount();

    currentAuction = { ...liveAuction, status: 'COMPLETED', auctionType: 'FORWARD_AUCTION', auctionCategory: 'RFQ_TOTAL_WISE', currentLeadingBid: 85000, bids: [], vendors: [], rfq: { ...liveAuction.rfq, boqNumber: '', packageName: 'Package fallback' } };
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve(reply({ error: 'Control denied' }, false));
      return Promise.resolve(reply({ auction: currentAuction, isObserver: false }));
    });
    const view = renderRoom();
    expect(await screen.findByText('CONCLUDED')).toBeInTheDocument();
    expect(screen.getByText('CURRENT HIGHEST BID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Award Recommendation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Award Recommendation' }));
    expect(mockRouterPush).toHaveBeenCalledWith('/procurement/rfqs/rfq-1');
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.objectContaining({ title: 'Award Initiated' }));
    view.unmount();

    currentAuction = { ...liveAuction, status: 'PAUSED', auctionType: 'FORWARD_AUCTION', auctionCategory: 'RFQ_TOTAL_WISE', currentLeadingBid: null, startingPrice: 0, minDecrement: 0, extensionCount: 0, endTime: '', scheduledEndTime: '', bids: [], vendors: [], rfq: { ...liveAuction.rfq, prNumber: '', boqNumber: '', packageName: '' } };
    renderRoom();
    expect(await screen.findByRole('button', { name: 'Resume Bidding' })).toBeInTheDocument();
    expect(screen.getByText('Starting at INR 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume Bidding' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: 'Control Action Failed', message: 'Control denied' }));
    fireEvent.click(screen.getByRole('button', { name: 'Live Bid Stream (0)' }));
    expect(screen.getByText('No Bids Placed Yet')).toBeInTheDocument();
  });
});
