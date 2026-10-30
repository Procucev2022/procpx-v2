/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorPposPage from '../src/app/(app)/vendor-portal/ppos/page';

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
    expect(screen.getByText('Loading purchase orders...')).toBeInTheDocument();
    await act(async () => resolveRequest(loadResponse()));
    expect(await screen.findByText('PPO-001')).toBeInTheDocument();
    expect(screen.getByText(/Accepted \(/)).toBeInTheDocument();
    expect(screen.getByText('Query Raised')).toBeInTheDocument();
    expect(screen.getAllByText('Awaiting Acceptance')).toHaveLength(2);
    expect(screen.getAllByText('Direct Contract')).toHaveLength(2);
    expect(screen.getAllByText('As agreed')).toHaveLength(3);
    expect(screen.getByText('2 PPOs')).toBeInTheDocument();

    const issueRow = screen.getByText('PPO-002').closest('tr')!;
    fireEvent.click(within(issueRow).getByTitle('Toggle Line Items'));
    expect(screen.getByText('Order Line Items Detail:')).toBeInTheDocument();
    expect(screen.getByText('Steel supports')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
    expect(screen.getByText('Reported Issue:')).toBeInTheDocument();
    fireEvent.click(within(issueRow).getByTitle('Toggle Line Items'));
    expect(screen.queryByText('Order Line Items Detail:')).not.toBeInTheDocument();

    const scroller = document.querySelector('.table-responsive')!;
    fireEvent.wheel(scroller, { shiftKey: true, deltaY: 25 });
    expect((scroller as HTMLElement).scrollLeft).toBe(25);
    fireEvent.wheel(scroller, { shiftKey: false, deltaY: 5 });
    expect((scroller as HTMLElement).scrollLeft).toBe(25);

    const search = screen.getByPlaceholderText('Search PPO #, Project...');
    fireEvent.change(search, { target: { value: 'ppo-001' } });
    expect(screen.getByText('PPO-001')).toBeInTheDocument();
    expect(screen.queryByText('PPO-002')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'south office' } });
    expect(screen.getByText('PPO-002')).toBeInTheDocument();
    expect(screen.queryByText('PPO-001')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'RFQ-202' } });
    expect(screen.getByText('PPO-002')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'does not exist' } });
    expect(screen.getByText('No orders match your search query.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it('shows API and network errors when loading and renders the empty register', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Orders are unavailable' }) });
    const { unmount } = render(<VendorPposPage />);
    expect(await screen.findByText('Orders are unavailable')).toBeInTheDocument();
    unmount();

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('bad json'); } });
    render(<VendorPposPage />);
    expect(await screen.findByText('Failed to load purchase orders')).toBeInTheDocument();
  });

  it('accepts a PPO, sends the signatory and remarks, and reloads the register', async () => {
    render(<VendorPposPage />);
    await screen.findByText('PPO-003');
    const row = screen.getByText('PPO-003').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Accept PPO' }));
    expect(screen.getByText('Formal Acceptance of PPO PPO-003')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm Order Acceptance' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Full name of signing representative'), { target: { value: 'Sam Vendor' } });
    fireEvent.change(screen.getByPlaceholderText('Production kickoff date, acknowledgement note...'), { target: { value: 'Start on Monday' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ ok: true }))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(confirm.closest('form')!);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/ppos/003/vendor-accept', expect.objectContaining({ method: 'POST' })));
    const post = mockFetch.mock.calls.find(([url, init]) => init?.method === 'POST');
    expect(JSON.parse(post![1].body)).toEqual({ acceptedBy: 'Sam Vendor', vendorComments: 'Start on Monday' });
    await waitFor(() => expect(screen.queryByText('Formal Acceptance of PPO PPO-003')).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/ppos');
  });

  it('reports acceptance and issue errors, validates issue remarks, and submits a fulfillment issue', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<VendorPposPage />);
    await screen.findByText('PPO-003');
    const pendingRow = screen.getByText('PPO-003').closest('tr')!;
    fireEvent.click(within(pendingRow).getByRole('button', { name: 'Accept PPO' }));
    fireEvent.change(screen.getByPlaceholderText('Full name of signing representative'), { target: { value: 'Sam Vendor' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ error: 'Terms could not be accepted' }, false))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Order Acceptance' }).closest('form')!);
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Terms could not be accepted'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const issueRow = screen.getByText('PPO-002').closest('tr')!;
    fireEvent.click(within(issueRow).getByRole('button', { name: 'Raise Issue' }));
    const issueField = screen.getByPlaceholderText(/Specify the issue/);
    expect(issueField).toHaveValue('Confirm the delivery date');
    fireEvent.change(issueField, { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Submit Issue to Buyer' }).closest('form')!);
    expect(mockFetch).not.toHaveBeenCalledWith('/api/procurement/ppos/002/vendor-issue', expect.anything());

    fireEvent.change(issueField, { target: { value: 'Please confirm delivery in November' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ error: 'Issue service unavailable' }, false))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(screen.getByRole('button', { name: 'Submit Issue to Buyer' }).closest('form')!);
    await waitFor(() => expect(alertSpy).toHaveBeenLastCalledWith('Issue service unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(issueRow).getByRole('button', { name: 'Raise Issue' }));
    fireEvent.change(screen.getByPlaceholderText(/Specify the issue/), { target: { value: 'Check line 3' } });
    mockFetch.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.resolve(response({ ok: true }))
      : Promise.resolve(loadResponse()));
    fireEvent.submit(screen.getByRole('button', { name: 'Submit Issue to Buyer' }).closest('form')!);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/ppos/002/vendor-issue', expect.objectContaining({ method: 'POST' })));
    const issuePost = mockFetch.mock.calls.filter(([url]) => url === '/api/procurement/ppos/002/vendor-issue').pop();
    expect(JSON.parse(issuePost![1].body)).toEqual({ issueRemarks: 'Check line 3' });
    await waitFor(() => expect(screen.queryByText('Raise Fulfillment Query on PPO-002')).not.toBeInTheDocument());
    alertSpy.mockRestore();
  });
});
