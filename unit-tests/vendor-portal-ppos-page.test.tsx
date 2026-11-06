/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorPposPage from '../src/app/(app)/vendor-portal/ppos/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const originalFetch = global.fetch;
const mockFetch = jest.fn();

function ppo(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ppoNumber: `PPO-${id}`,
    vendorStatus: 'PENDING_VENDOR_ACCEPTANCE',
    vendorAcceptedAt: null,
    totalValue: 0,
    grossTotal: 0,
    totalAmount: 0,
    project: null,
    rfq: null,
    poDate: null,
    deliveryDate: null,
    lines: [],
    ...overrides,
  };
}

const orders = [
  ppo('001', {
    vendorStatus: 'ACCEPTED_BY_VENDOR',
    vendorAcceptedAt: '2026-10-01T00:00:00.000Z',
    totalValue: 1_000,
    grossTotal: 1_100,
    project: { name: 'North store' },
    rfq: { rfqNumber: 'RFQ-101' },
    poDate: '2026-09-20T00:00:00.000Z',
    deliveryDate: '2026-12-15T00:00:00.000Z',
    lines: [{ id: 'line-1', itemDescription: 'Cable trays', quantity: 10, uom: 'MTR', unitRate: 100, gstPercent: 18, totalAmount: 1_180 }],
  }),
  ppo('002', {
    vendorStatus: 'ISSUE_RAISED',
    grossTotal: 250,
    totalAmount: 250,
    project: { name: 'South office' },
    rfq: { rfqNumber: 'RFQ-202' },
    vendorIssueRemarks: 'Confirm the delivery date',
    lines: [{ id: 'line-2', itemDescription: 'Steel supports', quantity: 2, uom: 'EA', unitRate: 125, gstPercent: 0, totalAmount: 250 }],
  }),
  ppo('003'),
  ppo('004', { vendorStatus: 'ACCEPTED', vendorAcceptedAt: null, totalAmount: 50 }),
];

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function loadResponse() {
  return response({ ppos: orders });
}

describe('vendor purchase orders page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(loadResponse());
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('loads and searches orders, expands line details, and handles the refresh and empty states', async () => {
    let resolveRequest!: (value: ReturnType<typeof response>) => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<VendorPposPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.loadingPurchaseOrders))).toBeInTheDocument();
    await act(async () => resolveRequest(loadResponse()));
    expect(await screen.findByText('PPO-001')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.accepted))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.queryRaised))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.awaitingAcceptance))).toHaveLength(2);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.directContract))).toHaveLength(2);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.asAgreed))).toHaveLength(3);
    expect(screen.getByText('2 PPOs')).toBeInTheDocument();

    const issueRow = screen.getByText('PPO-002').closest('tr')!;
    fireEvent.click(within(issueRow).getByTitle(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.toggleLineItems)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.orderLineItemsDetail))).toBeInTheDocument();
    expect(screen.getByText('Steel supports')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.copy1rannvv))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.reportedIssue))).toBeInTheDocument();
    fireEvent.click(within(issueRow).getByTitle(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.toggleLineItems)));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.orderLineItemsDetail))).not.toBeInTheDocument();

    const scroller = document.querySelector('.table-responsive')!;
    fireEvent.wheel(scroller, { shiftKey: true, deltaY: 25 });
    expect((scroller as HTMLElement).scrollLeft).toBe(25);
    fireEvent.wheel(scroller, { shiftKey: false, deltaY: 5 });
    expect((scroller as HTMLElement).scrollLeft).toBe(25);

    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.searchPPOProject));
    fireEvent.change(search, { target: { value: 'ppo-001' } });
    expect(screen.getByText('PPO-001')).toBeInTheDocument();
    expect(screen.queryByText('PPO-002')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'south office' } });
    expect(screen.getByText('PPO-002')).toBeInTheDocument();
    expect(screen.queryByText('PPO-001')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'RFQ-202' } });
    expect(screen.getByText('PPO-002')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'does not exist' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.noOrdersMatchYourSearchQuery))).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    const callsBeforeRefresh = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(callsBeforeRefresh + 1));
  });

  it('shows API and network errors when loading and renders the empty register', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Orders are unavailable' }) });
    const { unmount } = render(<VendorPposPage />);
    expect(await screen.findByText('Orders are unavailable')).toBeInTheDocument();
    unmount();

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('bad json'); } });
    render(<VendorPposPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders))).toBeInTheDocument();
  });

  it('accepts a PPO, sends the signatory and remarks, and reloads the register', async () => {
    render(<VendorPposPage />);
    await screen.findByText('PPO-003');
    const row = screen.getByText('PPO-003').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.acceptPPO) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.formalAcceptanceOfPPO))).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.confirmOrderAcceptance) });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.fullNameOfSigningRepresentative)), { target: { value: 'Sam Vendor' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.productionKickoffDateAcknowledgementNote)), { target: { value: 'Start on Monday' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ ok: true }))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(confirm.closest('form')!);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/ppos/003/vendor-accept', expect.objectContaining({ method: 'POST' })));
    const post = mockFetch.mock.calls.find(([url, init]) => init?.method === 'POST');
    expect(JSON.parse(post![1].body)).toEqual({ acceptedBy: 'Sam Vendor', vendorComments: 'Start on Monday' });
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.formalAcceptanceOfPPO))).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/ppos?page=1&pageSize=50&search=');
  });

  it('loads vendor-owned line details only when expanded and appends bounded register pages', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ ppos: [ppo('005', { lineCount: 1 })], total: 2, hasMore: true }))
      .mockResolvedValueOnce(response({ lines: [{ id: 'line-5', itemDescription: 'Copper busbar', quantity: 4, uom: 'M', unitRate: 20, gstPercent: 18, totalAmount: 94.4 }] }))
      .mockResolvedValueOnce(response({ ppos: [ppo('006')], total: 2, hasMore: false }));
    render(<VendorPposPage />);
    const firstRowTitle = uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.toggleLineItems);
    const firstOrder = await screen.findByText('PPO-005');
    fireEvent.click(within(firstOrder.closest('tr')!).getByTitle(firstRowTitle));
    expect(await screen.findByText('Copper busbar')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/vendor-portal/ppos?ppoId=005');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('PPO-006')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenNthCalledWith(3, '/api/vendor-portal/ppos?page=2&pageSize=50&search=');
  });

  it('reports acceptance and issue errors, validates issue remarks, and submits a fulfillment issue', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<VendorPposPage />);
    await screen.findByText('PPO-003');
    const pendingRow = screen.getByText('PPO-003').closest('tr')!;
    fireEvent.click(within(pendingRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.acceptPPO) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.fullNameOfSigningRepresentative)), { target: { value: 'Sam Vendor' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ error: 'Terms could not be accepted' }, false))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.confirmOrderAcceptance) }).closest('form')!);
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Terms could not be accepted'));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    const issueRow = screen.getByText('PPO-002').closest('tr')!;
    fireEvent.click(within(issueRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.raiseIssue) }));
    const issueField = screen.getByPlaceholderText(/Specify the issue/);
    expect(issueField).toHaveValue('Confirm the delivery date');
    fireEvent.change(issueField, { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submitIssueToBuyer) }).closest('form')!);
    expect(mockFetch).not.toHaveBeenCalledWith('/api/procurement/ppos/002/vendor-issue', expect.anything());

    fireEvent.change(issueField, { target: { value: 'Please confirm delivery in November' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ error: 'Issue service unavailable' }, false))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submitIssueToBuyer) }).closest('form')!);
    await waitFor(() => expect(alertSpy).toHaveBeenLastCalledWith('Issue service unavailable'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));

    fireEvent.click(within(issueRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.raiseIssue) }));
    fireEvent.change(screen.getByPlaceholderText(/Specify the issue/), { target: { value: 'Check line 3' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ ok: true }))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submitIssueToBuyer) }).closest('form')!);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/ppos/002/vendor-issue', expect.objectContaining({ method: 'POST' })));
    const issuePost = mockFetch.mock.calls.filter(([url]) => url === '/api/procurement/ppos/002/vendor-issue').pop();
    expect(JSON.parse(issuePost![1].body)).toEqual({ issueRemarks: 'Check line 3' });
    await waitFor(() => expect(screen.queryByText('Raise Fulfillment Query on PPO-002')).not.toBeInTheDocument());
    alertSpy.mockRestore();
  });

  it('uses safe fallbacks for non-Error failures in register, detail, acceptance, and issue requests', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce({});
    const first = render(<VendorPposPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders))).toBeInTheDocument();
    first.unmount();

    mockFetch.mockResolvedValueOnce(response({ ppos: [ppo('fallback', { lineCount: 1 })] }));
    const detail = render(<VendorPposPage />);
    const fallbackRow = await screen.findByText('PPO-fallback');
    mockFetch.mockRejectedValueOnce({});
    fireEvent.click(within(fallbackRow.closest('tr')!).getByTitle(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.toggleLineItems)));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders))).toBeInTheDocument();

    detail.unmount();
    mockFetch.mockResolvedValueOnce(response({ ppos: [
      ppo('actions'), ppo('002', { vendorStatus: 'ISSUE_RAISED', vendorIssueRemarks: '' }),
    ] }));
    render(<VendorPposPage />);
    const actionRow = (await screen.findByText('PPO-actions')).closest('tr')!;
    fireEvent.click(within(actionRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.acceptPPO) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.fullNameOfSigningRepresentative)), { target: { value: 'Sam Vendor' } });
    mockFetch.mockRejectedValueOnce({});
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.confirmOrderAcceptance) }).closest('form')!);
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to accept purchase order')));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));

    const issueRow = screen.getByText('PPO-002').closest('tr')!;
    fireEvent.click(within(issueRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalPposPage.raiseIssue) }));
    fireEvent.change(screen.getByPlaceholderText(/Specify the issue/), { target: { value: 'Delivery date clarification' } });
    mockFetch.mockRejectedValueOnce({});
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submitIssueToBuyer) }).closest('form')!);
    await waitFor(() => expect(alertSpy).toHaveBeenLastCalledWith(expect.stringContaining('Failed to report fulfillment issue')));
    alertSpy.mockRestore();
  });
});
