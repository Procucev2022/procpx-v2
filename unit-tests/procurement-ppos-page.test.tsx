/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PposDeskPage from '../src/app/(app)/procurement/ppos/page';

const toastSuccess = jest.fn();
const originalFetch = global.fetch;
const fetchMock = jest.fn();
let responseData: any;
let postResponse: any;

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: toastSuccess, error: jest.fn() }) }));
jest.mock('../src/components/ui/PageHeader', () => ({ __esModule: true, default: ({ title, description, actions }: any) => <header><h1>{title}</h1><p>{description}</p>{actions}</header> }));
jest.mock('../src/components/ui/Card', () => ({ __esModule: true, default: ({ title, subtitle, children }: any) => <section><h2>{title}</h2><p>{subtitle}</p>{children}</section> }));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCardGrid: ({ children }: any) => <div>{children}</div>,
  SummaryCard: ({ label, value, secondary }: any) => <div><span>{label}</span><strong>{value}</strong><small>{secondary}</small></div>,
}));
jest.mock('../src/components/ui/EmptyState', () => ({ __esModule: true, default: ({ title, description, actionText, onAction }: any) => <div><strong>{title}</strong><p>{description}</p>{actionText && <button onClick={onAction}>{actionText}</button>}</div> }));

function order(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    ppoNumber: `PPO-${id}`,
    status: 'ISSUED',
    ppoDate: '2026-09-01T00:00:00.000Z',
    totalValue: 1_000,
    vendorId: 'vendor-1',
    vendor: { id: 'vendor-1', name: 'North Supply', code: 'NS-01' },
    project: { name: 'North Plant', projectCode: 'NP-01' },
    rfqId: 'rfq-1',
    rfq: { rfqNumber: 'RFQ-100', packageName: 'Cable package', boqRevision: { boq: { boqCode: 'BOQ-100' } } },
    vendorRating: null,
    ...overrides,
  };
}

const rating = (status: string, overrides: Record<string, any> = {}) => ({
  status,
  qualityScore: 4,
  deliveryScore: 4,
  commercialComplianceScore: 4,
  responsivenessScore: 4,
  documentationClosureScore: 4,
  overallScore: 4.1,
  qualityComments: 'Good quality',
  deliveryComments: 'On schedule',
  commercialComments: 'Accurate bills',
  responsivenessComments: 'Responsive',
  documentationComments: 'Complete',
  overallImprovement: 'Continue current standards',
  approverComments: 'Approved after review',
  approvedByName: 'Alex Approver',
  approvedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const allOrders = [
  order('000', { vendorId: null, vendor: { name: 'No vendor id' }, rfqId: null, rfq: null }),
  order('001'),
  order('002', { status: 'CONFIRMED', totalValue: 0, totalAmount: 800, vendorRating: rating('DRAFT', {
    qualityScore: 0, deliveryScore: 0, commercialComplianceScore: 0, responsivenessScore: 0, documentationClosureScore: 0,
    qualityComments: '', deliveryComments: '', commercialComments: '', responsivenessComments: '', documentationComments: '',
    overallImprovement: '', comments: '',
  }) }),
  order('003', { status: 'COMPLETED', vendorRating: rating('RETURNED_FOR_CORRECTION', { returnReason: '' }) }),
  order('004', { status: 'PARTIALLY_COMPLETED', vendorRating: rating('SUBMITTED', { overallScore: 0, overallImprovement: '' }) }),
  order('005', { status: 'DRAFT', rfqId: null, rfq: null, project: null, vendor: null, vendorId: null, totalValue: 0, totalAmount: 0, vendorRating: rating('APPROVED') }),
  order('006', { status: 'OTHER', rfqId: null, rfq: null, project: null, vendor: null, vendorId: null, vendorRating: rating('APPROVED', { overallScore: null, overallImprovement: '', approverComments: '', approvedByName: null }) }),
];

function apiReply(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function setApi(data = responseData) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve(postResponse);
    return Promise.resolve(apiReply(data));
  });
  global.fetch = fetchMock as typeof fetch;
}

describe('procurement PPO performance register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    responseData = { ppos: allOrders, currentUserRole: 'PROJECT_USER', isProcurementUser: false };
    postResponse = apiReply({ ok: true });
    setApi();
  });
  afterAll(() => { global.fetch = originalFetch; });

  it('renders the project register, searches all references, and filters every rating tab', async () => {
    render(<PposDeskPage />);
    expect(await screen.findByText('PPO-001')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PPO Vendor Performance Rating' })).toBeInTheDocument();
    expect(screen.getAllByText('(4.1/5)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.getByText('Returned for Correction')).toBeInTheDocument();
    expect(screen.getAllByText('Under Review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unrated').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Action Required/ }));
    expect(screen.getByText('PPO-001')).toBeInTheDocument();
    expect(screen.getByText('PPO-003')).toBeInTheDocument();
    expect(screen.queryByText('PPO-002')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Drafts/ }));
    expect(screen.getByText('PPO-002')).toBeInTheDocument();
    expect(screen.queryByText('PPO-001')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByText('PPO-002').closest('tr')!).getByRole('button', { name: 'Resume Draft' }));
    expect(screen.getByPlaceholderText('Observations on materials, finishes, defects and test certificates...')).toHaveValue('');
    expect(screen.getAllByRole('combobox')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Under Review/ }));
    expect(screen.getByText('PPO-004')).toBeInTheDocument();
    fireEvent.click(within(screen.getByText('PPO-004').closest('tr')!).getByRole('button', { name: 'View Rating' }));
    expect(screen.getByText('PPO Performance Assessment Detail')).toBeInTheDocument();
    const detailModal = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(within(detailModal).getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Approved/ }));
    expect(screen.getByText('PPO-005')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /All Orders/ }));
    const search = screen.getByPlaceholderText('Search PPO, Vendor, or Project...');
    fireEvent.change(search, { target: { value: 'North Supply' } });
    expect(screen.getByText('PPO-001')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'NP-01' } });
    expect(screen.getByText('PPO-001')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'RFQ-100' } });
    expect(screen.getByText('PPO-001')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'not found' } });
    expect(screen.getByText('No PPO records matching this filter.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }));
    expect(screen.getByText('PPO-001')).toBeInTheDocument();
  });

  it('opens new and returned ratings, validates submission, saves a draft, and submits feedback', async () => {
    render(<PposDeskPage />);
    await screen.findByText('PPO-001');
    const unratedRow = screen.getByText('PPO-000').closest('tr')!;
    fireEvent.click(within(unratedRow).getByRole('button', { name: 'Rate PPO' }));
    expect(screen.getByText('Computed Overall Performance Rating')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Target vendor ID not found for this PPO.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const returnedRow = screen.getByText('PPO-003').closest('tr')!;
    fireEvent.click(within(returnedRow).getByRole('button', { name: 'Revise Rating' }));
    expect(screen.getByText('Returned by Project Approver for Correction')).toBeInTheDocument();
    expect(screen.getByText('Please review scores and category comments and resubmit.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const editRow = screen.getByText('PPO-001').closest('tr')!;
    fireEvent.click(within(editRow).getByRole('button', { name: 'Rate PPO' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Project Approval' }));
    expect(await screen.findByText(/Please provide feedback or areas for improvement/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Summarize recurring issues, corrective actions, and recommendations for future orders...'), { target: { value: 'Keep delivery lead times stable' } });
    screen.getAllByRole('combobox').forEach((select) => fireEvent.change(select, { target: { value: '5' } }));
    fireEvent.change(screen.getByPlaceholderText('Observations on milestone compliance, lead times and delays...'), { target: { value: 'Delivered on time' } });
    fireEvent.change(screen.getByPlaceholderText('Observations on billing accuracy, invoices and variation claims...'), { target: { value: 'Invoices accurate' } });
    fireEvent.change(screen.getByPlaceholderText('Observations on supervision, issue resolution and communication...'), { target: { value: 'Fast response' } });
    fireEvent.change(screen.getByPlaceholderText('Observations on handover certificates, warranties and as-built documents...'), { target: { value: 'Documents complete' } });
    expect(screen.getByText('5.0')).toBeInTheDocument();

    postResponse = apiReply({});
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/procurement/vendors/vendor-1/ppo-ratings', expect.objectContaining({ method: 'POST' })));
    const draftPayload = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body as string);
    expect(draftPayload).toMatchObject({ ppoId: '001', action: 'SAVE_DRAFT', qualityScore: 5, overallImprovement: 'Keep delivery lead times stable' });
    expect(toastSuccess).toHaveBeenCalledWith('Performance rating draft saved for PPO-001.');
    await waitFor(() => expect(screen.queryByText('Rate PPO Performance')).not.toBeInTheDocument());

    fireEvent.click(within(screen.getByText('PPO-001').closest('tr')!).getByRole('button', { name: 'Rate PPO' }));
    fireEvent.change(screen.getByPlaceholderText('Observations on materials, finishes, defects and test certificates...'), { target: { value: 'Materials passed inspection' } });
    postResponse = apiReply({});
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Project Approval' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenLastCalledWith('Assessment submitted for Project Approval for PPO-001!'));
    const submitPayload = JSON.parse(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').pop()![1].body as string);
    expect(submitPayload).toMatchObject({ action: 'SUBMIT', qualityComments: 'Materials passed inspection' });
  });

  it('shows procurement order summaries and rating details with optional approver information', async () => {
    responseData = { ppos: allOrders, currentUserRole: 'PROCUREMENT_USER' };
    setApi();
    render(<PposDeskPage />);
    expect(await screen.findByRole('heading', { name: 'Procurement Purchase Orders (PPO)' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search PPO, Vendor, or Project...')).not.toBeInTheDocument();
    await screen.findByText('PPO-005');
    const row = screen.getByText('PPO-005').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'View Rating' }));
    expect(screen.getByText('PPO Performance Assessment Detail')).toBeInTheDocument();
    expect(screen.getByText('Approved after review')).toBeInTheDocument();
    expect(screen.getByText(/Approved by Alex Approver/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(within(screen.getByText('PPO-006').closest('tr')!).getByRole('button', { name: 'View Rating' }));
    expect(screen.queryByText('Overall Areas for Improvement & Recommendations:')).not.toBeInTheDocument();
    expect(screen.queryByText('Project Approver Comments:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  });

  it('handles missing rating APIs, failed responses, missing error text, and network exceptions', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    responseData = { currentUserRole: 'PROJECT_USER', isProcurementUser: true };
    setApi();
    const missingData = render(<PposDeskPage />);
    expect(await screen.findByText('No PPO records matching this filter.')).toBeInTheDocument();
    missingData.unmount();

    fetchMock.mockRejectedValueOnce(new Error('PPO service unavailable'));
    render(<PposDeskPage />);
    await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'PPO service unavailable' })));
    expect(screen.getByText('No PPO records matching this filter.')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('reports server and network errors while saving ratings', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    responseData = { ppos: [order('009')], currentUserRole: 'PROJECT_USER', isProcurementUser: false };
    setApi();
    render(<PposDeskPage />);
    await screen.findByText('PPO-009');
    fireEvent.click(within(screen.getByText('PPO-009').closest('tr')!).getByRole('button', { name: 'Rate PPO' }));
    fireEvent.change(screen.getByPlaceholderText('Observations on materials, finishes, defects and test certificates...'), { target: { value: 'Reviewed' } });
    postResponse = apiReply({ error: 'Rating service rejected the draft' }, false);
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Rating service rejected the draft')).toBeInTheDocument();

    postResponse = apiReply({}, false);
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Failed to record performance assessment.')).toBeInTheDocument();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST'
      ? Promise.reject(new Error('network offline'))
      : Promise.resolve(apiReply(responseData)));
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('network offline')).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'network offline' }));
    consoleSpy.mockRestore();
  });
});
