/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import AuctionsHubPage from '../src/app/(app)/procurement/auctions/page';

const mockSearchParams = jest.fn();
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const fetchMock = jest.fn();
const originalFetch = global.fetch;

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { href, ...props }, children),
}));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCardGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SummaryCard: ({ label, value }: { label: string; value: React.ReactNode }) => <div><span>{label}</span><strong>{value}</strong></div>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));
jest.mock('../src/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({ title, description, actionText, onAction }: { title: string; description: string; actionText?: string; onAction?: () => void }) => (
    <section><h3>{title}</h3><p>{description}</p>{actionText && <button onClick={onAction}>{actionText}</button>}</section>
  ),
}));
jest.mock('../src/components/ui/Toast', () => ({
  useToast: () => ({ error: mockToastError, success: mockToastSuccess }),
}));

const searchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });
const vendor = (vendorId: string, name: string, hasSubmittedQuote = true) => ({
  vendorId, name, code: `${vendorId}-CODE`, hasSubmittedQuote, quoteAmount: 12500,
});
const rfq = {
  id: 'rfq-1', rfqNumber: 'RFQ-100', title: 'Electrical package', packageName: 'Cable Package',
  prNumber: 'PR-100', boqNumber: 'BOQ-100', lowestQuotedAmount: 25000,
  quotedVendors: [vendor('v-1', 'Vendor One'), vendor('v-2', 'Vendor Two')],
  lines: [{ id: 'line-1', itemCode: 'CAB-1', description: 'Copper cable', boqDescription: 'Grade A', category: 'Electrical', subCategory: 'Cable', uom: 'M', quantity: 25, estimatedRate: 1000 }],
};
const auctions = [
  {
    id: 'live-1', auctionNumber: 'AUC-001', title: 'Live cable auction', prNumber: 'PR-100', boqNumber: 'BOQ-100',
    rfqId: 'rfq-1', rfqNumber: 'RFQ-100', auctionType: 'REVERSE_AUCTION', auctionCategory: 'ITEM_WISE',
    startTime: '2026-11-01T10:00:00.000Z', scheduledEndTime: '2026-11-01T12:00:00.000Z', extensionCount: 2,
    invitedVendorsCount: 3, status: 'LIVE', currentLeadingBid: 12500, startingPrice: 30000, currency: 'INR',
  },
  {
    id: 'draft-1', auctionNumber: 'AUC-002', title: 'Draft pumps', prNumber: null, costCentre: 'CC-2',
    rfqId: 'rfq-2', rfqNumber: 'RFQ-200', auctionType: 'FORWARD_AUCTION', auctionCategory: 'RFQ_TOTAL_WISE',
    startTime: 'bad-date', scheduledEndTime: '', endTime: '', invitedVendorsCount: 0, status: 'DRAFT', currentLeadingBid: null,
    startingPrice: 0, currency: 'USD',
  },
  {
    id: 'sealed-1', auctionNumber: 'AUC-003', title: 'Closed disposal', prNumber: 'PR-300', costCentre: null,
    rfqId: 'rfq-3', rfqNumber: 'RFQ-300', auctionType: 'SEALED_BID', auctionCategory: 'RFQ_TOTAL_WISE',
    startTime: '', scheduledEndTime: '2026-11-02T12:00:00.000Z', extensionCount: 0, invitedVendorsCount: 4,
    status: 'COMPLETED', currentLeadingBid: 0, startingPrice: 5000, currency: 'INR',
  },
];

function configureFetch(opts: { role?: string; auctionRows?: unknown[]; rfqs?: unknown[]; projectUsers?: unknown[] } = {}) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/session') return response({ user: { role: opts.role ?? 'PROCUREMENT_USER' } });
    if (url.startsWith('/api/procurement/auctions?')) return response({
      auctions: opts.auctionRows ?? auctions,
      kpis: { total: 3, live: 1, upcoming: 1, draft: 1, completed: 1, pending: 1 },
    });
    if (url === '/api/procurement/auctions/rfq-options') return response({ rfqs: opts.rfqs ?? [rfq], projectUsers: opts.projectUsers ?? [{ id: 'observer-1', name: 'Asha', role: 'PROJECT_MANAGER' }] });
    if (url === '/api/procurement/auctions' && init?.method === 'POST') return response({ message: 'Saved', auction: { auctionNumber: 'AUC-NEW' } });
    return response({});
  });
}

function renderPage(params = new URLSearchParams()) {
  mockSearchParams.mockReturnValue(params as ReturnType<typeof useSearchParams>);
  return render(<AuctionsHubPage />);
}

function wizard() {
  return screen.getByText('Configure & Schedule E-Auction Event').closest('div[style*="max-width: 1060px"]') as HTMLElement;
}

function nextStep() {
  fireEvent.click(screen.getByRole('button', { name: /Next Step/ }));
}

describe('procurement auctions workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureFetch();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('renders auction statuses, formatting fallbacks, KPIs, search, category/type filters, and tabs', async () => {
    const format = jest.spyOn(Date.prototype, 'toLocaleString').mockImplementationOnce(() => { throw new Error('formatter unavailable'); });
    renderPage();
    expect(await screen.findByText('AUC-001')).toBeInTheDocument();
    expect(screen.getByText('AUC-002')).toBeInTheDocument();
    expect(screen.getByText('AUC-003')).toBeInTheDocument();
    expect(screen.getByText(/Invalid Date IST/)).toBeInTheDocument();
    expect(format).toHaveBeenCalled();
    expect(screen.getByText('Leading: INR 12,500')).toBeInTheDocument();
    expect(screen.getByText('Ceiling: USD 0')).toBeInTheDocument();
    expect(screen.getByText('Extended (2x)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Monitor Live/ })).toHaveAttribute('href', '/procurement/auctions/live-1');
    expect(screen.getByRole('link', { name: 'Edit Draft' })).toHaveAttribute('href', '/procurement/auctions/draft-1');
    expect(screen.getByRole('link', { name: 'View Details' })).toHaveAttribute('href', '/procurement/auctions/sealed-1');
    expect(screen.getByText('Live Auctions')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search by Auction #, Title, RFQ, PR...'), { target: { value: 'pr-100' } });
    expect(screen.getByText('AUC-001')).toBeInTheDocument();
    expect(screen.queryByText('AUC-002')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search by Auction #, Title, RFQ, PR...'), { target: { value: '  ' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'ITEM_WISE' } });
    expect(screen.getByText('AUC-001')).toBeInTheDocument();
    expect(screen.queryByText('AUC-002')).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'SEALED_BID' } });
    expect(screen.queryByText('AUC-001')).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'ALL' } });
    expect(screen.getByText('AUC-003')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search by Auction #, Title, RFQ, PR...'), { target: { value: 'no match' } });
    expect(screen.getByText('No Auctions Matching Filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Live Bidding/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/procurement/auctions?tab=LIVE'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/procurement/auctions?tab=LIVE'));
  });

  it('shows observer access, empty state, and reports auction-load errors while swallowing session and RFQ-option errors', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/session') throw new Error('session offline');
      if (url === '/api/procurement/auctions/rfq-options') throw new Error('options offline');
      if (url.startsWith('/api/procurement/auctions?')) throw new Error('register offline');
      return response({ user: { role: 'PROJECT_MANAGER' } });
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = renderPage();
    await screen.findByText('No Auctions Matching Filters');
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith({ title: 'Error', message: 'Failed to load auction events' }));
    expect(error).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.queryByText(/Observer Access/)).not.toBeInTheDocument();
    first.unmount();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/session') return response({ user: { role: 'PROJECT_MANAGER' } });
      if (url === '/api/procurement/auctions/rfq-options') throw new Error('options offline');
      if (url.startsWith('/api/procurement/auctions?')) return response({ auctions: [], kpis: {} });
      return response({});
    });
    renderPage();
    expect(await screen.findByText(/Observer Access \(PROJECT_MANAGER\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create E-Auction/ })).not.toBeInTheDocument();
    expect(screen.getByText('Schedule a new Reverse Auction, Forward Auction, or Sealed Bid from any active RFQ package.')).toBeInTheDocument();
  });

  it('opens from the create query, validates required fields, saves a draft, and handles failed JSON responses', async () => {
    renderPage(new URLSearchParams('create=true'));
    const panel = await screen.findByText('Configure & Schedule E-Auction Event');
    expect(panel).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
    expect(mockToastError).toHaveBeenCalledWith({ title: 'Validation', message: 'Please select an RFQ package.' });

    await screen.findByRole('option', { name: /RFQ-100/ });
    fireEvent.change(screen.getByDisplayValue('-- Choose Approved RFQ --'), { target: { value: 'rfq-1' } });
    fireEvent.change(screen.getByPlaceholderText(/Reverse Auction/), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
    expect(mockToastError).toHaveBeenLastCalledWith({ title: 'Validation', message: 'Please enter an Auction Name.' });

    fireEvent.change(screen.getByPlaceholderText(/Reverse Auction/), { target: { value: 'Cable supply auction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith({ title: 'Draft Saved', message: 'Saved' }));
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/procurement/auctions' && (init as RequestInit)?.method === 'POST');
    expect(JSON.parse((createCall?.[1] as RequestInit).body as string)).toEqual(expect.objectContaining({
      rfqId: 'rfq-1', title: 'Cable supply auction', isDraft: true, startingPrice: 25000,
      invitedVendorIds: ['v-1', 'v-2'], items: [expect.objectContaining({ rfqLineId: 'line-1', startPrice: 1000 })],
    }));

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/auth/session') return response({ user: { role: 'PROCUREMENT_USER' } });
      if (String(input).startsWith('/api/procurement/auctions?')) return response({ auctions: [], kpis: {} });
      if (String(input) === '/api/procurement/auctions/rfq-options') return response({ rfqs: [rfq], projectUsers: [] });
      if (String(input) === '/api/procurement/auctions' && init?.method === 'POST') return { ok: true, json: jest.fn().mockRejectedValue(new Error('bad response')) };
      return response({});
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create E-Auction' }));
    await screen.findByText('Configure & Schedule E-Auction Event');
    fireEvent.change(screen.getByDisplayValue('-- Choose Approved RFQ --'), { target: { value: 'rfq-1' } });
    fireEvent.change(screen.getByPlaceholderText(/Reverse Auction/), { target: { value: 'Second auction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
    await waitFor(() => expect(mockToastError).toHaveBeenLastCalledWith({ title: 'Auction Creation Failed', message: 'bad response' }));
  });

  it('supports RFQ deep links, all six wizard steps, schedule presets, rules, vendor compliance, item review, and sealed-bid scheduling', async () => {
    renderPage(new URLSearchParams('rfqId=rfq-1'));
    const dialogTitle = await screen.findByText('Configure & Schedule E-Auction Event');
    const modal = wizard();
    expect(dialogTitle).toBeInTheDocument();
    await waitFor(() => expect(within(modal).getByText(/PR-100/)).toBeInTheDocument());
    fireEvent.change(within(modal).getByPlaceholderText(/Reverse Auction/), { target: { value: 'Sealed cable event' } });
    fireEvent.click(within(modal).getByText('Item Wise'));
    fireEvent.click(within(modal).getByText('Sealed Bid'));
    const modalSelects = modal.querySelectorAll('select');
    expect(modalSelects[1]).toHaveValue('INR');
    fireEvent.change(modalSelects[1], { target: { value: 'USD' } });

    nextStep();
    expect(within(modal).getByText(/Time Zone Authority/)).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Next 1 Hour' }));
    expect(modal.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBeTruthy();
    fireEvent.click(within(modal).getByRole('button', { name: /Tomorrow 10:00 AM/ }));
    nextStep();

    expect(within(modal).getByText('Confidential (Disabled)')).toBeInTheDocument();
    fireEvent.click(within(modal).getByLabelText('Single Unit Rate'));
    const radio = (name: string, index: number) => modal.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)[index];
    fireEvent.click(radio('hasStartPrice', 1));
    fireEvent.click(radio('hasMinBidReduction', 1));
    fireEvent.click(radio('hasAutoExtension', 1));
    fireEvent.click(radio('hasBidLimit', 0));
    expect(modal.querySelector('input[name="hasBidLimit"]:checked')).toBe(radio('hasBidLimit', 0));
    fireEvent.click(radio('inviteProjectUser', 0));
    await waitFor(() => expect(modal.querySelectorAll('select')).toHaveLength(1));
    const observerSelect = modal.querySelector('select')!;
    fireEvent.change(observerSelect, { target: { value: 'observer-1' } });
    expect(within(modal).getByText('Asha (PROJECT_MANAGER)')).toBeInTheDocument();
    nextStep();

    expect(within(modal).getByText(/Invite Eligible Quoted Vendors/)).toBeInTheDocument();
    fireEvent.click(within(modal).getAllByText('Vendor One')[0]);
    expect(within(modal).getByPlaceholderText(/State technical/)).toBeInTheDocument();
    nextStep();
    expect(within(modal).getByText('RFQ Scope Items (1)')).toBeInTheDocument();
    expect(within(modal).getByText('Copper cable')).toBeInTheDocument();
    nextStep();
    expect(within(modal).getByText('Executive Summary & Pre-Schedule Verification')).toBeInTheDocument();
    expect(within(modal).getByText(/Sealed cable event/)).toBeInTheDocument();
    fireEvent.change(modal.querySelector('textarea')!, { target: { value: 'Reviewed by buyer' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm & Schedule Auction' }));
    expect(mockToastError).toHaveBeenLastCalledWith({
      title: 'Mandatory Policy Requirement',
      message: 'Please provide justification comments for excluding quoted vendors.',
    });
    expect(within(modal).getByText(/Step 4 of 6/)).toBeInTheDocument();
    fireEvent.change(within(modal).getByPlaceholderText(/State technical/), { target: { value: 'Vendor did not meet compliance.' } });
    nextStep();
    nextStep();
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm & Schedule Auction' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenLastCalledWith({ title: 'Auction Scheduled', message: 'Saved' }));
    const calls = fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/procurement/auctions' && (init as RequestInit)?.method === 'POST');
    const payload = JSON.parse((calls[calls.length - 1][1] as RequestInit).body as string);
    expect(payload).toEqual(expect.objectContaining({
      isDraft: false, auctionType: 'SEALED_BID', auctionCategory: 'ITEM_WISE', currency: 'USD',
      hasLeadingPrice: false, maxBidsPerParticipant: 1, inviteProjectUser: true, projectUserId: 'observer-1',
      invitedVendorIds: ['v-2'], nonInvitedJustification: 'Vendor did not meet compliance.',
      hasStartPrice: false, startingPrice: null, hasMinBidReduction: false, minDecrement: 0,
      hasAutoExtension: false, termsAndConditions: 'Reviewed by buyer',
    }));
  });

  it('requires invitees and valid scheduling for published events and supports cancellation and wizard reset', async () => {
    renderPage(new URLSearchParams('create=true'));
    const modal = wizard();
    await screen.findByText('Configure & Schedule E-Auction Event');
    await screen.findByRole('option', { name: /RFQ-100/ });
    fireEvent.change(within(modal).getByDisplayValue('-- Choose Approved RFQ --'), { target: { value: 'rfq-1' } });
    await waitFor(() => expect((within(modal).getByPlaceholderText(/Reverse Auction/) as HTMLInputElement).value).toContain('Cable Package'));
    fireEvent.change(within(modal).getByPlaceholderText(/Reverse Auction/), { target: { value: 'Validation auction' } });
    for (let i = 0; i < 3; i++) nextStep();
    expect(await within(modal).findAllByText('Vendor One')).toHaveLength(2);
    fireEvent.click(within(modal).getByRole('button', { name: 'Clear Selection' }));
    for (let i = 0; i < 2; i++) nextStep();
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm & Schedule Auction' }));
    expect(mockToastError).toHaveBeenLastCalledWith({ title: 'Validation', message: 'Please invite at least one vendor.' });
    expect(within(modal).getByText(/Step 4 of 6/)).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole('button', { name: 'Invite All' }));
    fireEvent.click(within(modal).getByRole('button', { name: /Scheduling & IST/ }));
    fireEvent.change(modal.querySelectorAll<HTMLInputElement>('input[type="time"]')[1], { target: { value: '09:00' } });
    fireEvent.click(within(modal).getByRole('button', { name: '6. Review & Schedule' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm & Schedule Auction' }));
    expect(mockToastError).toHaveBeenLastCalledWith({ title: 'Invalid Schedule', message: 'Auction End Time must be later than Start Time.' });
    expect(within(modal).getByText(/Step 2 of 6/)).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Configure & Schedule E-Auction Event')).not.toBeInTheDocument();
  });

  it('covers editable auction rules, both schedule modes, vendor shuttle controls, review navigation, and modal close', async () => {
    renderPage(new URLSearchParams('create=true'));
    const modal = wizard();
    await screen.findByRole('option', { name: /RFQ-100/ });
    fireEvent.change(within(modal).getByDisplayValue('-- Choose Approved RFQ --'), { target: { value: 'rfq-1' } });
    fireEvent.click(within(modal).getByText('RFQ Total Wise'));
    fireEvent.click(within(modal).getByText('Reverse Auction'));
    fireEvent.click(within(modal).getByText('Forward Auction'));
    fireEvent.change(modal.querySelector('input[type="number"]')!, { target: { value: '30' } });
    fireEvent.change(within(modal).getByPlaceholderText(/Critical:/), { target: { value: 'Buyer notice' } });
    nextStep();

    const dates = modal.querySelectorAll<HTMLInputElement>('input[type="date"]');
    const times = modal.querySelectorAll<HTMLInputElement>('input[type="time"]');
    fireEvent.change(dates[0], { target: { value: '2027-01-01' } });
    fireEvent.change(times[0], { target: { value: '10:15' } });
    fireEvent.change(dates[1], { target: { value: '2027-01-01' } });
    fireEvent.change(times[1], { target: { value: '12:00' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Next 2 Hours' }));
    nextStep();

    const group = (name: string) => modal.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
    fireEvent.click(group('quantityType')[1]);
    fireEvent.click(group('quantityType')[0]);
    fireEvent.click(group('hasStartPrice')[1]);
    fireEvent.click(group('hasStartPrice')[0]);
    const startPrice = within(modal).getByPlaceholderText(/1500000/);
    fireEvent.change(startPrice, { target: { value: '' } });
    fireEvent.change(startPrice, { target: { value: '45000' } });
    fireEvent.click(group('hasLeadingPrice')[1]);
    fireEvent.click(group('hasLeadingPrice')[0]);
    fireEvent.click(group('hasMinBidReduction')[1]);
    fireEvent.click(group('hasMinBidReduction')[0]);
    const minDelta = within(modal).getByPlaceholderText('e.g. 5000');
    fireEvent.change(minDelta, { target: { value: '' } });
    fireEvent.change(minDelta, { target: { value: '2500' } });
    fireEvent.click(group('hasAutoExtension')[1]);
    fireEvent.click(group('hasAutoExtension')[0]);
    const extension = modal.querySelector<HTMLInputElement>('input[min="1"][max="30"]')!;
    fireEvent.change(extension, { target: { value: '7' } });
    fireEvent.click(group('hasBidLimit')[0]);
    const maxBids = modal.querySelector<HTMLInputElement>('input[min="1"][max="100"]')!;
    fireEvent.change(maxBids, { target: { value: '3' } });
    fireEvent.click(group('hasBidLimit')[1]);
    fireEvent.click(group('inviteProjectUser')[0]);
    const observer = modal.querySelector('select')!;
    fireEvent.change(observer, { target: { value: 'observer-1' } });
    fireEvent.click(group('inviteProjectUser')[1]);
    nextStep();

    fireEvent.click(within(modal).getAllByText('Vendor One')[0]);
    fireEvent.click(within(modal).getAllByText('Vendor Two')[0]);
    expect(within(modal).getByText('No vendors invited yet. Please select at least one vendor.')).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Invite All' }));
    fireEvent.click(within(modal).getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(within(modal).getByRole('button', { name: 'Invite All' }));
    nextStep();
    const itemPrice = within(modal).getByPlaceholderText('0.00');
    fireEvent.change(itemPrice, { target: { value: '1100' } });
    fireEvent.change(itemPrice, { target: { value: '' } });
    nextStep();
    expect(within(modal).getByText('Executive Summary & Pre-Schedule Verification')).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Back' }));
    expect(within(modal).getByText('RFQ Scope Items (1)')).toBeInTheDocument();
    fireEvent.click(within(modal).getAllByRole('button')[0]);
    expect(screen.queryByText('Configure & Schedule E-Auction Event')).not.toBeInTheDocument();
  });

  it('offers the create action from an empty manager register', async () => {
    configureFetch({ auctionRows: [] });
    renderPage();
    await screen.findByText('No Auctions Matching Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Create New E-Auction' }));
    expect(await screen.findByText('Configure & Schedule E-Auction Event')).toBeInTheDocument();
  });
});
