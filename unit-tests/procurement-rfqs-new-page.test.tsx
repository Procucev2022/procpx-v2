/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewRfqPage from '../src/app/(app)/procurement/rfqs/new/page';

const mockSearchParams = jest.fn();
const mockPush = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockFetch = jest.fn();
const originalFetch = global.fetch;

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), refresh: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { href, ...props }, children),
}));
jest.mock('../src/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

const boq = (id: string, projectName: string, category = 'Electrical') => ({
  id, projectId: `project-${id}`, projectName, projectCode: `P-${id}`, location: 'Pune', costCentre: 'CC-1 - Electrical',
  approvedRevisionCode: 'R2', approvedAt: '2026-01-01T00:00:00.000Z', approvedBy: 'Procurement Approver',
  totalLines: 3, totalBenchmarkAmount: 35000,
  categories: [{ category, lineCount: 2, benchmarkSubtotal: 30000 }, { category: 'Mechanical', lineCount: 1, benchmarkSubtotal: 5000 }],
  lines: [
    { id: `${id}-line-1`, boqLineId: `${id}-line-1`, lineNumber: '1', description: 'Copper cable', specification: 'Grade A copper', category, uom: 'M', quantity: 10, benchmarkRate: 2000, benchmarkAmount: 20000 },
    { id: `${id}-line-2`, boqLineId: `${id}-line-2`, lineNumber: '2', description: 'Cable tray', specification: 'Galvanized', category, uom: 'M', quantity: 5, benchmarkRate: 2000, benchmarkAmount: 10000 },
    { id: `${id}-line-3`, boqLineId: `${id}-line-3`, lineNumber: '3', description: 'Pump set', specification: 'IS certified', category: 'Mechanical', uom: 'EA', quantity: 1, benchmarkRate: 5000, benchmarkAmount: 5000 },
  ],
});
const vendors = [
  { id: 'v-1', name: 'Alpha Electrical', vendorCode: 'ALPHA', code: 'A-1', email: 'alpha@example.test', contactPerson: 'Asha', vendorType: 'CLIENT_VENDOR', state: 'Maharashtra', city: 'Pune', categories: ['Electrical', 'Cable', 'Safety'], complianceStatus: 'COMPLIANT', qualificationStatus: 'QUALIFIED', performanceScore: 4.7, pposCount: 2, isBlacklisted: false },
  { id: 'v-2', name: 'Beta Engineering', vendorCode: 'BETA', code: 'B-1', email: 'beta@example.test', contactPerson: 'Bharat', vendorType: 'PROCUCEV_VENDOR', state: 'Karnataka', city: 'Bengaluru', categories: '["Electrical","Pipes"]', complianceStatus: 'COMPLIANT', qualificationStatus: 'APPROVED', performanceScore: 4.2, _count: { ppos: 1 }, isBlacklisted: false },
  { id: 'v-3', name: 'Gamma Works', vendorCode: 'GAMMA', code: 'G-1', email: '', contactPerson: '', vendorType: 'CLIENT_VENDOR', state: 'Maharashtra', city: '', categories: 'Electrical, Mechanical', complianceStatus: 'PENDING', qualificationStatus: '', performanceScore: 0, isBlacklisted: false },
  { id: 'v-4', name: 'Delta Blacklisted', vendorCode: 'DELTA', code: 'D-1', email: 'delta@example.test', contactPerson: 'Dee', vendorType: 'CLIENT_VENDOR', state: '', city: '', categories: null, complianceStatus: 'COMPLIANT', isBlacklisted: true },
];
const rateCards = [
  { id: 'rc-1', vendorId: 'v-1', status: 'APPROVED', validTo: null, rateCardNumber: 'RC-1' },
  { id: 'rc-2', vendorId: 'v-2', status: 'APPROVED', validTo: '2099-01-01T00:00:00.000Z', rateCardNumber: 'RC-2' },
  { id: 'rc-expired', vendorId: 'v-3', status: 'APPROVED', validTo: '2000-01-01T00:00:00.000Z', rateCardNumber: 'RC-OLD' },
  { id: 'rc-pending', vendorId: 'v-4', status: 'PENDING', validTo: null, rateCardNumber: 'RC-PENDING' },
];
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });
const defaultBoqs = [boq('rev-1', 'North Plant'), boq('rev-2', 'South Plant', 'Civil')];
const pr = {
  id: 'pr-1', prNumber: 'PR-100', title: 'Cable installation', status: 'PR_APPROVED',
  projectId: 'project-pr', project: { id: 'project-pr', name: 'PR Project', projectCode: 'PRP', city: 'Delhi' },
  boqRevision: { id: 'pr-rev-1', revisionCode: 'R3' }, boq: { boqCode: 'PR-BOQ' }, costCentre: { code: 'CC-2', name: 'Power' },
  lines: [{ id: 'pr-line-1', itemDescription: 'Switchgear', specification: '11KV', category: 'Electrical', uom: 'EA', quantity: 2, estimatedRate: 8000 }],
  rfqs: [],
};

function configureFetch(overrides: Record<string, unknown> = {}) {
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/procurement/approved-boqs') return response(overrides.boqs ?? { approvedBoqs: defaultBoqs });
    if (url === '/api/procurement/vendors') return response(overrides.vendors ?? { vendors });
    if (url === '/api/procurement/rate-cards') return response(overrides.rateCards ?? { rateCards });
    if (url === '/api/pr/pr-1') return response(overrides.pr ?? pr, overrides.prOk !== false);
    if (url === '/api/procurement/approved-prs') return response(overrides.approvedPrs ?? [pr]);
    if (url === '/api/procurement/rate-cards/match?prId=pr-1') return response(overrides.rateCardMatch ?? { matches: [{ id: 'match-1', rateCardNumber: 'RC-MATCH' }] });
    if (url === '/api/procurement/rfqs' && init?.method === 'POST') {
      if (overrides.createResponse instanceof Error) throw overrides.createResponse;
      return (overrides.createResponse as ReturnType<typeof response>) ?? response({ rfq: { id: 'rfq-new', rfqNumber: 'RFQ-NEW' } });
    }
    return response({});
  });
}

function renderPage(query = '') {
  mockSearchParams.mockReturnValue(new URLSearchParams(query));
  return render(<NewRfqPage />);
}

function continueTo(step: number) {
  fireEvent.click(screen.getByRole('button', { name: `Continue to Step ${step}` }));
}

function selectLineCheckbox(rowText: string, checked: boolean) {
  const row = screen.getByText(rowText).closest('tr') as HTMLTableRowElement;
  fireEvent.click(within(row).getByRole('checkbox'), { target: { checked } });
}

describe('new procurement RFQ workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureFetch();
    global.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('loads and switches approved baselines, defines line scopes, validates dates, and releases the RFQ', async () => {
    renderPage();
    expect(screen.getByText('Initializing RFQ Control Wizard')).toBeInTheDocument();
    expect(await screen.findByText('Baseline Verification Summary')).toBeInTheDocument();
    expect(screen.getByText('North Plant')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rev-2' } });
    expect(screen.getByText('South Plant')).toBeInTheDocument();

    continueTo(2);
    expect(screen.getByText('SCOPE & PACKAGE DEFINITION')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Mechanical' } });
    expect(screen.getByText('Scoped Items:').parentElement).toHaveTextContent('1 / 3');
    fireEvent.change(screen.getByLabelText(/Package \/ Trade/), { target: { value: '' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    const categoryDraft = mockFetch.mock.calls
      .filter(([url, init]) => String(url) === '/api/procurement/rfqs' && (init as RequestInit)?.method === 'POST')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string))[0];
    expect(categoryDraft).toEqual(expect.objectContaining({ packageType: 'CATEGORY', categoryName: 'Mechanical', packageName: 'Commercial Package' }));
    fireEvent.change(screen.getByLabelText(/Package \/ Trade/), { target: { value: 'Switchgear' } });
    fireEvent.click(screen.getByRole('button', { name: /Select Individual Lines/ }));
    const pumpRow = screen.getByText('Pump set').closest('tr') as HTMLTableRowElement;
    fireEvent.click(within(pumpRow).getByRole('checkbox'));
    fireEvent.click(within(pumpRow).getByRole('button', { name: 'Excluded' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
    fireEvent.click(screen.getByRole('button', { name: /Commercial & Technical/ }));
    expect(screen.getByText('Step 2: At least one BOQ line item must be included in the RFQ scope.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Select Individual Lines/ }));
    fireEvent.click(screen.getByRole('button', { name: /Select All/ }));
    fireEvent.change(screen.getByPlaceholderText('Filter items by description...'), { target: { value: 'pump' } });
    expect(screen.getByText('Pump set')).toBeInTheDocument();
    expect(screen.queryByText('Copper cable')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Filter items by description...'), { target: { value: '' } });
    fireEvent.change(within(screen.getByText('Pump set').closest('tr') as HTMLTableRowElement).getByPlaceholderText('Optional line note...'), { target: { value: 'Confirm site measurements' } });
    fireEvent.change(screen.getByLabelText(/RFQ Title/), { target: { value: 'North Plant electrical package' } });
    fireEvent.change(screen.getByLabelText(/Package \/ Trade/), { target: { value: 'Switchgear' } });
    fireEvent.change(screen.getByLabelText(/Expected Completion Date/), { target: { value: '2027-03-31' } });

    continueTo(3);
    expect(screen.getByText('COMMERCIAL & TECHNICAL CONDITIONS')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Submission Deadline/), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/Clarification Deadline/), { target: { value: '2026-02-05' } });
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 4' }));
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Submission Deadline/), { target: { value: '2026-02-10' } });

    fireEvent.change(screen.getByLabelText(/Commercial Validity \(Days\)/), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText(/Payment Terms/), { target: { value: '45 days' } });
    fireEvent.change(screen.getByLabelText(/Delivery Schedule \/ Requirement/), { target: { value: 'Ship within 60 days' } });
    fireEvent.change(screen.getByLabelText(/Taxes and GST/), { target: { value: 'GST inclusive' } });
    fireEvent.change(screen.getByLabelText(/Freight & Insurance \(Incoterms\)/), { target: { value: 'Delivered duty paid' } });
    fireEvent.change(screen.getByLabelText(/Warranty \/ Defect Liability/), { target: { value: '24 months' } });
    fireEvent.change(screen.getByLabelText('Performance Security'), { target: { value: '10% PBG' } });
    fireEvent.change(screen.getByLabelText('Liquidated Damages'), { target: { value: '1% weekly' } });
    fireEvent.change(screen.getByLabelText(/Price Basis/), { target: { value: 'Variable with Material Index escalation' } });
    fireEvent.change(screen.getByLabelText(/Technical Specifications/), { target: { value: 'IS certified only' } });
    fireEvent.change(screen.getByLabelText(/Commercial Requirements & General Terms/), { target: { value: 'Includes unloading' } });
    fireEvent.change(screen.getByPlaceholderText(/Add document requirement/), { target: { value: 'ISO 9001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('ISO 9001')).toBeInTheDocument();
    const panDocument = screen.getByText('PAN Card').closest('span') as HTMLElement;
    fireEvent.click(within(panDocument).getByRole('button'));
    expect(screen.queryByText('PAN Card')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Add document requirement/), { target: { value: 'Safety Plan' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Add document requirement/), { key: 'Enter', code: 'Enter' });
    expect(screen.getByText('Safety Plan')).toBeInTheDocument();
    continueTo(4);

    expect(screen.getByText('VENDOR SELECTION & INVITATION')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /All Eligible Vendors/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Invite Vendor' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Rate Card Vendors/ }));
    expect(screen.getByText('Gamma Works')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Previously Worked With/ }));
    expect(screen.getByText('Alpha Electrical')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search name, code, contact...'), { target: { value: 'beta@example.test' } });
    expect(screen.getByText('Beta Engineering')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search name, code, contact...'), { target: { value: '' } });
    const filters = screen.getAllByRole('combobox');
    fireEvent.change(filters[0], { target: { value: 'Karnataka' } });
    fireEvent.change(filters[1], { target: { value: 'Bengaluru' } });
    fireEvent.change(filters[2], { target: { value: 'Electrical' } });
    fireEvent.change(filters[3], { target: { value: 'PROCUCEV_VENDOR' } });
    expect(screen.getByText('Beta Engineering')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show Only Rate Card Vendors'));
    expect(screen.getByText('Beta Engineering')).toBeInTheDocument();
    expect(screen.queryByText('Delta Blacklisted')).not.toBeInTheDocument();
    fireEvent.change(filters[0], { target: { value: '' } });
    fireEvent.change(filters[1], { target: { value: '' } });
    fireEvent.change(filters[2], { target: { value: '' } });
    fireEvent.change(filters[3], { target: { value: 'ALL' } });
    fireEvent.click(screen.getByLabelText('Show Only Rate Card Vendors'));
    fireEvent.click(screen.getByRole('button', { name: /Select All Compliant/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
    const betaRow = screen.getByText('Beta Engineering').closest('tr') as HTMLTableRowElement;
    fireEvent.click(within(betaRow).getByRole('checkbox'));
    continueTo(5);
    expect(screen.getByText('FINAL REVIEW & RELEASE TO MARKET')).toBeInTheDocument();
    expect(screen.getByText('North Plant electrical package')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Step 1' }));
    const stepper = within(screen.getByRole('navigation', { name: 'RFQ Creation Steps' }));
    fireEvent.click(stepper.getByRole('button', { name: /Review & Release/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Step 2' }));
    fireEvent.click(stepper.getByRole('button', { name: /Review & Release/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Step 3' }));
    fireEvent.click(stepper.getByRole('button', { name: /Review & Release/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Step 4' }));
    fireEvent.click(stepper.getByRole('button', { name: /Review & Release/ }));
    fireEvent.click(stepper.getByRole('button', { name: /Review & Release/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Step 4' }));
    fireEvent.click(stepper.getByRole('button', { name: /Review & Release/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[1]);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenLastCalledWith('RFQ draft saved successfully.', 'RFQ-NEW', 'Draft'));
    fireEvent.click(screen.getByRole('button', { name: /Release RFQ to Vendors/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Confirm RFQ Release to Market');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Release RFQ to Vendors/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Release RFQ' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('RFQ issued successfully.', 'RFQ-NEW', 'Awaiting Quotations'));
    expect(mockPush).toHaveBeenCalledWith('/procurement/rfqs/rfq-new');
    const posts = mockFetch.mock.calls.filter(([url, init]) => String(url) === '/api/procurement/rfqs' && (init as RequestInit)?.method === 'POST');
    const post = posts[posts.length - 1];
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual(expect.objectContaining({
      projectId: 'project-rev-2', boqRevisionId: 'rev-2', packageType: 'SELECTED_LINES', selectedLineIds: expect.any(Array),
      vendorIds: ['v-2'], action: 'RELEASE_RFQ', technicalRequirements: 'IS certified only', priceBasis: 'Variable with Material Index escalation',
    }));
  });

  it('reports missing baselines, empty scope, invalid timeline, empty vendor selection, and save failures', async () => {
    configureFetch({ boqs: { approvedBoqs: [] } });
    const noBoq = renderPage();
    expect(await screen.findByText('Create Request for Quotation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 2' }));
    expect(screen.getByText('Step 1: Please select and verify an Approved Commercial Baseline.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    expect(screen.getByText('Please select an Approved BOQ Baseline in Step 1.')).toBeInTheDocument();
    noBoq.unmount();

    configureFetch();
    const mounted = renderPage();
    await screen.findByText('Baseline Verification Summary');
    continueTo(2);
    fireEvent.click(screen.getByRole('button', { name: /Select Individual Lines/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
    fireEvent.click(screen.getByRole('button', { name: /Commercial & Technical/ }));
    expect(screen.getByText('Step 2: At least one BOQ line item must be included in the RFQ scope.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    expect(screen.getByText('At least one BOQ line must be included in the RFQ scope in Step 2.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Entire Approved BOQ/ }));
    fireEvent.change(screen.getByLabelText(/RFQ Title/), { target: { value: '  ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    expect(screen.getByText('RFQ Title is required.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Commercial & Technical/ }));
    expect(screen.getByText('Step 2: RFQ Title is required.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/RFQ Title/), { target: { value: 'Valid package' } });
    continueTo(3);
    fireEvent.change(screen.getByLabelText(/Submission Deadline/), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText(/Clarification Deadline/), { target: { value: '2026-01-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 4' }));
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Submission Deadline/), { target: { value: '2026-01-03' } });
    continueTo(4);
    fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
    fireEvent.click(screen.getByRole('button', { name: /Review & Release/ }));
    expect(screen.getByText('Step 4: Please invite at least 1 qualified vendor before proceeding to final review.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('RFQ draft saved successfully.', 'RFQ-NEW', 'Draft'));
    mounted.unmount();

    configureFetch({ createResponse: new Error('network failure') });
    renderPage();
    await screen.findByText('Baseline Verification Summary');
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.objectContaining({ title: 'RFQ Creation Failed', message: 'network failure' })));
  });

  it('hydrates a source PR, resolves fallback PR lookup and rate matches, and blocks duplicate or incomplete PRs', async () => {
    const fallback = { ...pr, rfqs: [{ id: 'rfq-active', rfqNumber: 'RFQ-ACTIVE', status: 'RELEASED' }] };
    configureFetch({ prOk: false, approvedPrs: [fallback], rateCardMatch: { matches: [{ id: 'match-2', rateCardNumber: 'RC-PR' }] } });
    const duplicate = renderPage('prId=pr-1');
    expect(await screen.findByText('Approved PR Baseline: PR-100')).toBeInTheDocument();
    expect(screen.getByText(/Active Sourcing Event Already Exists/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Active RFQ/ })).toHaveAttribute('href', '/procurement/rfqs/rfq-active');
    expect(screen.getAllByRole('button', { name: 'Save Draft' })[1]).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    expect(screen.getByText('An active RFQ (RFQ-ACTIVE) already exists for this PR. Duplicate sourcing is prevented.')).toBeInTheDocument();
    duplicate.unmount();

    configureFetch({ pr: { ...pr, lines: [] } });
    const empty = renderPage('prId=pr-1');
    expect(await screen.findByText('Approved PR (PR-100) has no approved line items available for sourcing.')).toBeInTheDocument();
    empty.unmount();

    configureFetch({ pr: {}, prOk: true, approvedPrs: [] });
    const direct = renderPage('prId=pr-1');
    expect(await screen.findByText('Unable to load Procurement Request (pr-1). The PR was not found or access is restricted.')).toBeInTheDocument();
    direct.unmount();
  });

  it('uses sparse direct PR data defaults and handles revision misses, unavailable lookup data, and rejected saves', async () => {
    const sparsePr = {
      id: 'pr-1', prNumber: 'PR-SPARSE', title: '', lines: [
        { id: 'sparse-line-1', itemDescription: 'General supply', quantity: 2, estimatedRate: 0, estimatedValue: 0, category: null, specification: '', lineNumber: '' },
        { id: 'sparse-line-2', itemDescription: 'Pipe fitting', quantity: 1, estimatedRate: 100, category: 'Plumbing' },
      ], rfqs: [],
    };
    configureFetch({
      pr: { data: sparsePr },
      vendors: {},
      rateCards: {},
      rateCardMatch: {},
    });
    const sparse = renderPage('prId=pr-1');
    expect(await screen.findByText('Approved PR Baseline: PR-SPARSE')).toBeInTheDocument();
    expect(screen.getByText('Bengaluru')).toBeInTheDocument();
    expect(screen.getByText('General Works')).toBeInTheDocument();
    expect(screen.getByText('R1 (APPROVED) (IMMUTABLE)')).toBeInTheDocument();
    continueTo(2);
    expect(screen.getByText('General supply')).toBeInTheDocument();
    expect(screen.getAllByText('Standard specification').length).toBeGreaterThan(0);
    sparse.unmount();

    configureFetch({});
    const revision = renderPage('revisionId=missing-revision');
    expect(await screen.findByText('Baseline Verification Summary')).toBeInTheDocument();
    expect(screen.getByText('North Plant')).toBeInTheDocument();
    revision.unmount();

    mockFetch.mockRejectedValue(new Error('initial data unavailable'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage();
    expect(await screen.findByText('Create Request for Quotation')).toBeInTheDocument();
    await waitFor(() => expect(error).toHaveBeenCalledWith('Error initializing RFQ wizard data:', expect.any(Error)));
  });

  it('uses the server error fallback when a save response is unsuccessful and omits the error text', async () => {
    configureFetch({ createResponse: response({}, false) });
    renderPage();
    await screen.findByText('Baseline Verification Summary');
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Draft' })[0]);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.objectContaining({
      title: 'RFQ Creation Failed', message: 'Failed to create RFQ',
    })));
  });
});
