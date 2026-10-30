/** @jest-environment jsdom */
import React, { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VendorAuctionBiddingRoomPage from '../src/app/(app)/vendor-portal/auctions/[id]/page';

const mockPush = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();

jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle, actions }: any) => <header><h1>{title}</h1><p>{subtitle}</p>{actions}</header>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({ __esModule: true, default: ({ status }: any) => <span>{status}</span> }));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockSuccess, error: mockError }) }));

const ok = (body: any) => ({ ok: true, json: async () => body });
const fail = (body: any = {}) => ({ ok: false, json: async () => body });
const params = Object.assign(Promise.resolve({ id: 'auction-1' }), {
  status: 'fulfilled',
  value: { id: 'auction-1' },
});
const reverseAuction = {
  id: 'auction-1', auctionNumber: 'AUC-1', title: 'Reverse auction', status: 'LIVE',
  auctionType: 'REVERSE_AUCTION', auctionCategory: 'ITEM_WISE', currency: 'INR',
  scheduledEndTime: new Date(Date.now() + 3_600_000).toISOString(), endTime: '',
  currentLowestBid: 20000, currentLeadingBid: 19950, startingPrice: 25000, minDecrement: 500, hasMinBidReduction: true,
  hasBidLimit: true, maxBidsPerParticipant: 4, extensionCount: 2, refreshIntervalSeconds: 3600,
  scrollingText: 'Submit final offers before closing',
  termsAndConditions: 'All bids are binding.',
  items: [{ id: 'item-1', itemCode: 'CAB-1', description: 'Cable', quantity: 10, uom: 'M' }],
  bids: [
    { id: 'bid-1', bidAmount: 20000, bidNumber: 1, timestamp: '2026-10-29T10:00:00Z', rank: 1 },
    { id: 'bid-2', bidAmount: 21000, bidNumber: 2, timestamp: 'bad-date', rank: 2 },
    { id: 'bid-3', bidAmount: 22000, bidNumber: 3, timestamp: '2026-10-29T09:00:00Z', rank: 0 },
  ],
};

const flush = async () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

const renderRoom = () => render(<Suspense fallback={<div>Loading route parameters</div>}><VendorAuctionBiddingRoomPage params={params} /></Suspense>);

describe('vendor portal auction detail page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue(ok({ auction: reverseAuction, currentVendorParticipation: null }));
  });

  it('accepts terms and submits a reverse item bid, including validation and quick decrement', async () => {
    let accepted = false;
    global.fetch = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(_url).endsWith('/terms-accept')) {
        accepted = true;
        return ok({ message: 'Terms recorded' });
      }
      if (init?.method === 'POST' && String(_url).endsWith('/bid')) return ok({ extended: true, message: 'Bid accepted' });
      return ok({
        auction: reverseAuction,
        currentVendorParticipation: { termsAcceptedAt: accepted ? '2026-10-29' : null, bidCount: 2, lastBidAmount: 20500, bestRank: 1 },
      });
    });

    renderRoom();
    await flush();
    expect(await screen.findByText('Auction Terms & Conditions Acknowledgement')).toBeInTheDocument();
    expect(screen.getByText('All bids are binding.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /I Accept the Terms/ }));
    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith({ title: 'Terms Accepted', message: 'Terms recorded' }));
    expect(screen.queryByText('Auction Terms & Conditions Acknowledgement')).not.toBeInTheDocument();
    expect(screen.getByText('Submit final offers before closing')).toBeInTheDocument();
    expect(screen.getByText(/EXTENDED 2X/)).toBeInTheDocument();
    expect(screen.getByText(/less than or equal to/)).toHaveTextContent('INR 19,500');
    expect(screen.getByText(/Bids Submitted:/)).toHaveTextContent('2');
    expect(screen.getByText(/My Last Bid:/)).toHaveTextContent('INR 20,500');
    expect(screen.getByText(/Current Rank:/)).toHaveTextContent('L1');
    expect(screen.getByText(/Invalid Date/)).toBeInTheDocument();
    expect(screen.getByText('INR 19,950')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Submit Bid/ }));
    expect(mockError).toHaveBeenCalledWith({ title: 'Validation', message: 'Please enter a valid bid amount.' });
    const decrementPreset = screen.getAllByRole('button').find((button) => button.textContent?.includes('5,000') && !button.textContent.includes('50,000'));
    expect(decrementPreset).toBeDefined();
    fireEvent.click(decrementPreset!);
    expect(screen.getByPlaceholderText('Enter amount...')).toHaveValue(15000);
    const largerDecrement = screen.getAllByRole('button').find((button) => button.textContent?.includes('25,000'));
    fireEvent.click(largerDecrement!);
    expect(screen.getByPlaceholderText('Enter amount...')).toHaveValue(15000);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'item-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Bid/ }));
    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith({ title: 'Bid Placed & Extension Triggered!', message: 'Bid accepted' }));
    expect((global.fetch as jest.Mock).mock.calls.some(([, init]) => init?.method === 'POST' && String(init.body).includes('item-1'))).toBe(true);
    expect(screen.getByPlaceholderText('Enter amount...')).toHaveValue(null);
    expect(screen.getByRole('link', { name: /Exit Room/ })).toHaveAttribute('href', '/vendor-portal/auctions');
  });

  it('handles term rejection, term acceptance failure, and inaccessible auctions', async () => {
    global.fetch = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return fail({ error: 'Terms service unavailable' });
      return ok({ auction: reverseAuction, currentVendorParticipation: { termsAcceptedAt: null, bidCount: 0 } });
    });
    const { unmount } = renderRoom();
    await flush();
    expect(await screen.findByText('Auction Terms & Conditions Acknowledgement')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Decline & Exit' }));
    expect(mockPush).toHaveBeenCalledWith('/vendor-portal/auctions');
    fireEvent.click(screen.getByRole('button', { name: /I Accept the Terms/ }));
    await waitFor(() => expect(mockError).toHaveBeenCalledWith({ title: 'Error', message: 'Terms service unavailable' }));
    unmount();

    global.fetch = jest.fn().mockResolvedValue(ok({}));
    renderRoom();
    await flush();
    expect(await screen.findByText('Auction not accessible')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to My Auctions' })).toHaveAttribute('href', '/vendor-portal/auctions');
  });

  it('shows sealed bid confidentiality, confirms once, and displays already submitted sealed bids', async () => {
    const sealed = {
      ...reverseAuction, auctionType: 'SEALED_BID', auctionCategory: 'RFQ_TOTAL', currentLowestBid: null,
      startingPrice: 9000, hasMinBidReduction: false, bids: [], termsAndConditions: '',
    };
    global.fetch = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? ok({ extended: false, message: 'Sealed bid secured' })
      : ok({ auction: sealed, currentVendorParticipation: { termsAcceptedAt: '2026-10-28', bidCount: 0 } }));
    const view = renderRoom();
    await flush();
    expect(await screen.findByText('Confidential Sealed Bid')).toBeInTheDocument();
    expect(screen.getByText(/Competitor bids and prices are strictly confidential/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Select Auction Scope Item/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Enter amount...'), { target: { value: '8750' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock Sealed Bid' }));
    expect(screen.getByText('Confirm Final Sealed Bid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Confirm Final Sealed Bid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lock Sealed Bid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Submit Sealed Bid' }));
    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith({ title: 'Bid Accepted', message: 'Sealed bid secured' }));
    view.unmount();

    global.fetch = jest.fn().mockResolvedValue(ok({
      auction: sealed,
      currentVendorParticipation: { termsAcceptedAt: '2026-10-28', bidCount: 1, lastBidAmount: 8750 },
    }));
    renderRoom();
    await flush();
    expect(await screen.findByText('Sealed Bid Submitted & Secured')).toBeInTheDocument();
    expect(screen.getAllByText('INR 8,750').length).toBeGreaterThan(0);
  });

  it('renders a closed forward auction and reports bid and refresh errors', async () => {
    const closed = {
      ...reverseAuction, status: 'CLOSED', auctionType: 'FORWARD_AUCTION', auctionCategory: 'TOTAL',
      currentLowestBid: 0, startingPrice: 1000, hasMinBidReduction: false, scheduledEndTime: '2020-01-01', endTime: '2020-01-01',
      bids: [], scrollingText: '', termsAndConditions: '',
    };
    global.fetch = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? fail({})
      : ok({ auction: closed, currentVendorParticipation: { termsAcceptedAt: '2026-10-28', bidCount: 0 } }));
    renderRoom();
    await flush();
    expect(await screen.findByText('CONCLUDED')).toBeInTheDocument();
    expect(screen.getByText('Bidding is currently CLOSED')).toBeInTheDocument();
    expect(screen.getByText('You have not submitted any bids yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh Telemetry' })).toBeInTheDocument();

    global.fetch = jest.fn().mockRejectedValue(new Error('telemetry offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Telemetry' }));
    await waitFor(() => expect(mockError).toHaveBeenCalledWith({ title: 'Error', message: 'telemetry offline' }));
  });

  it('calculates forward bids, handles the default bid rejection message, and formats dates', async () => {
    const forward = {
      ...reverseAuction, auctionType: 'FORWARD_AUCTION', auctionCategory: 'TOTAL', currentLeadingBid: null,
      currentLowestBid: 0, startingPrice: 1000, hasMinBidReduction: false, scheduledEndTime: '', endTime: '',
      bids: [{ id: 'rank-zero', bidAmount: 1000, bidNumber: 1, timestamp: '2026-10-29T10:00:00Z', rank: null }],
      scrollingText: '',
    };
    global.fetch = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? fail({})
      : ok({ auction: forward, currentVendorParticipation: { termsAcceptedAt: '2026-10-28', bidCount: 0, bestRank: 2 } }));
    renderRoom();
    await flush();
    expect(await screen.findByText(/greater than or equal to INR 1,001/)).toBeInTheDocument();
    expect(screen.getByText('Starting at INR 1,000')).toBeInTheDocument();
    expect(screen.getByText(/Current Rank:/)).toHaveTextContent('L2');
    fireEvent.change(screen.getByPlaceholderText('Enter amount...'), { target: { value: '' } });
    expect(screen.getByPlaceholderText('Enter amount...')).toHaveValue(null);
    fireEvent.change(screen.getByPlaceholderText('Enter amount...'), { target: { value: '1100' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Bid/ }));
    await waitFor(() => expect(mockError).toHaveBeenCalledWith({ title: 'Bid Rejected', message: 'Bid submission rejected' }));
  });

  it('renders a paused zero-price auction with its fallback end time and no qualifying next bid', async () => {
    const paused = {
      ...reverseAuction, status: 'PAUSED', auctionType: 'OTHER', auctionCategory: 'TOTAL',
      currentLowestBid: 0, currentLeadingBid: null, startingPrice: 0, extensionCount: 0,
      scheduledEndTime: '', endTime: new Date(Date.now() + 120_000).toISOString(), bids: [],
      scrollingText: '', termsAndConditions: '',
    };
    global.fetch = jest.fn().mockResolvedValue(ok({
      auction: paused,
      currentVendorParticipation: { termsAcceptedAt: '2026-10-28', bidCount: 0 },
    }));
    renderRoom();
    await flush();
    expect(await screen.findByText('PAUSED')).toBeInTheDocument();
    expect(screen.queryByText('(EXTENDED 0X)')).not.toBeInTheDocument();
    expect(screen.getByText(/Starting at INR 0/)).toBeInTheDocument();
    expect(screen.queryByText(/Next qualifying bid/)).not.toBeInTheDocument();
    expect(screen.getByText(/Scheduled End:/)).toHaveTextContent('IST');
  });
});
