/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
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
    return Promise.resolve(reply({ auction: currentAuction, bidHistory: { total: currentAuction.bids.length, pageSize: 50, hasMore: false, nextCursor: null }, isObserver: false, serverTime: '2026-04-01T10:00:00Z' }));
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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.synchronisingLiveAuctionTelemetryAndServerClock))).toBeInTheDocument();
    pending.unmount();

    mockFetch.mockResolvedValueOnce(reply({}));
    const missingView = renderRoom();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.auctionNotFound))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.returnToAuctionsWorkspace) })).toHaveAttribute('href', '/procurement/auctions');
    missingView.unmount();

    mockFetch.mockResolvedValueOnce(reply({ error: 'Auction access denied' }, false));
    const deniedView = renderRoom();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.auctionNotFound))).toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: UI_STRINGS.common.error, message: 'Auction access denied' }));
    deniedView.unmount();

    mockFetch.mockRejectedValueOnce(new Error('Auction service offline'));
    const failedView = renderRoom();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.auctionNotFound))).toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: UI_STRINGS.common.error, message: 'Auction service offline' }));
    failedView.unmount();
  });

  it('renders live auction tabs and buyer controls, records actions and submits assisted bids', async () => {
    renderRoom();
    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.cURRENTLOWESTBIDL1))).toBeInTheDocument();
    expect(screen.getByText(/EXTENDED 2X/)).toBeInTheDocument();
    expect(screen.getByText('Safety first')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Supply')).toHaveLength(2);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.tERMSACCEPTED))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.tERMSPENDING))).toBeInTheDocument();

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
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.concludeAuction) }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT' && JSON.parse(init.body as string).action === 'CONCLUDE')).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.concludeAuction) })).toBeEnabled());
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT' && JSON.parse(init.body as string).action === 'CONCLUDE')).toBe(true);
    confirmSpy.mockRestore();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.auctionScopeItemsLength, "", false) }));
    expect(screen.getByText('Copper cable')).toBeInTheDocument();
    expect(screen.getByText('4 core PVC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.documentsTerms) }));
    expect(screen.getByText(/All bids are binding/)).toBeInTheDocument();
    expect(screen.getByText('Terms.pdf')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.documentValue1, {"value1":"2"})))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Refresh","toLocaleString":"Telemetry"})) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/auctions/auction-1?pageSize=50'));
    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.logAssistedVendorBid2) }));
    expect(screen.getByText(/Record a verified phone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.submitValidatedBid) }));
    expect(mockToastError).toHaveBeenCalledWith({ title: UI_STRINGS.common.validation, message: UI_STRINGS.appAppProcurementAuctionsIdPage.pleaseSelectAVendorAndEnterAValidBidAmount });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'v1' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'item-1' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.eG1450000)), { target: { value: '110000' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.submitValidatedBid) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/auctions/auction-1/bid', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body as string);
    expect(payload).toEqual({ vendorId: 'v1', bidAmount: 110000, auctionItemId: 'item-1' });
    expect(mockToastSuccess).toHaveBeenCalledWith({ title: UI_STRINGS.common.userMessages.bidAcceptedRollingExtended, message: 'Bid recorded' });

    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.logAssistedVendorBid2) }));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.eG1450000)), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.eG1450000)), { target: { value: '105000' } });
    bidReply = reply({ extended: false, message: 'Bid accepted without item' });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.submitValidatedBid) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith({ title: UI_STRINGS.common.userMessages.bidAccepted, message: 'Bid accepted without item' }));
    const secondBid = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST').at(-1)?.[1];
    expect(JSON.parse(secondBid.body)).toEqual({ vendorId: 'v1', bidAmount: 105000, auctionItemId: null });

    expect(await screen.findByRole('heading', { name: 'Cable Reverse Auction' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.logAssistedVendorBid2) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.eG1450000)), { target: { value: '100000' } });
    bidReply = reply({ error: 'Minimum bid reduction not met' }, false);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.submitValidatedBid) }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: UI_STRINGS.common.bidRejected, message: 'Minimum bid reduction not met' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
  });

  it('loads older bid pages without discarding the current leaderboard', async () => {
    const olderBid = { id: 'bid-old', bidNumber: 0, vendorName: 'Earlier Supply', itemCode: 'CBL-1', bidAmount: 130000, timestamp: '2026-03-31T10:00:00Z' };
    mockFetch.mockImplementation((url: string) => {
      const isOlderPage = url.includes('beforeId=bid-1');
      return Promise.resolve(reply({
        auction: { ...liveAuction, bids: isOlderPage ? [olderBid] : [liveAuction.bids[0]] },
        bidHistory: isOlderPage
          ? { total: 3, pageSize: 1, hasMore: false, nextCursor: null }
          : { total: 3, pageSize: 1, hasMore: true, nextCursor: { beforeId: 'bid-1', beforeTimestamp: liveAuction.bids[0].timestamp } },
        isObserver: false,
      }));
    });

    renderRoom();
    const loadOlder = await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.loadOlderBids) });
    fireEvent.click(loadOlder);

    expect(await screen.findByText('Earlier Supply')).toBeInTheDocument();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('beforeId=bid-1'))).toBe(true);
    expect(screen.getAllByText('Alpha Supply').length).toBeGreaterThan(0);
  });

  it('covers observer, sealed, paused and completed views and reports failed controls or bids', async () => {
    currentAuction = { ...liveAuction, auctionType: 'SEALED_BID', auctionCategory: 'RFQ_TOTAL_WISE', status: 'PAUSED', currentLeadingBid: null, bids: [], items: [], documents: [] };
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method ? Promise.resolve(actionReply) : Promise.resolve(reply({ auction: currentAuction, isObserver: true })));
    const observerView = renderRoom();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.sealedBidProtocolActive))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.bUYERLIVECONTROLS))).not.toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Encrypted","toLocaleString":"& Confidential"})))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.documentsTerms) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.noExternalAttachmentsUploaded))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.liveBidStreamLength, {"length":"0"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.sealedBidProtocolActive))).toBeInTheDocument();
    observerView.unmount();

    currentAuction = { ...liveAuction, status: 'COMPLETED', auctionType: 'FORWARD_AUCTION', auctionCategory: 'RFQ_TOTAL_WISE', currentLeadingBid: 85000, bids: [], vendors: [], rfq: { ...liveAuction.rfq, boqNumber: '', packageName: 'Package fallback' } };
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve(reply({ error: 'Control denied' }, false));
      return Promise.resolve(reply({ auction: currentAuction, isObserver: false }));
    });
    const view = renderRoom();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.cONCLUDED))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.cURRENTHIGHESTBID))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Generate","toLocaleString":"Award Recommendation"})) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Generate","toLocaleString":"Award Recommendation"})) }));
    expect(mockRouterPush).toHaveBeenCalledWith('/procurement/rfqs/rfq-1');
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.objectContaining({ title: UI_STRINGS.appAppProcurementAuctionsIdPage.awardInitiated }));
    view.unmount();

    currentAuction = { ...liveAuction, status: 'PAUSED', auctionType: 'FORWARD_AUCTION', auctionCategory: 'RFQ_TOTAL_WISE', currentLeadingBid: null, startingPrice: 0, minDecrement: 0, extensionCount: 0, endTime: '', scheduledEndTime: '', bids: [], vendors: [], rfq: { ...liveAuction.rfq, prNumber: '', boqNumber: '', packageName: '' } };
    renderRoom();
    expect(await screen.findByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Resume","toLocaleString":"Bidding"})) })).toBeInTheDocument();
    expect(screen.getByText('Starting at INR 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Resume","toLocaleString":"Bidding"})) }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: UI_STRINGS.appAppProcurementAuctionsIdPage.controlActionFailed, message: 'Control denied' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.liveBidStreamLength, {"length":"0"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAuctionsIdPage.noBidsPlacedYet))).toBeInTheDocument();
  });
});
