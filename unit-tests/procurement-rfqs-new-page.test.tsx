/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewRfqPage from '../src/app/(app)/procurement/rfqs/new/page';
import { reportClientEvent, reportHandledClientFailure } from '../src/lib/observability/client-reporter';

const mockSearchParams = jest.fn();
const mockPush = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockFetch = jest.fn();
const originalFetch = global.fetch;

function stripBoqLines<T extends { lines?: unknown }>(boq: T): Omit<T, 'lines'> {
  return Object.fromEntries(Object.entries(boq).filter(([key]) => key !== 'lines')) as Omit<T, 'lines'>;
}

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
jest.mock('../src/lib/observability/client-reporter', () => ({
  reportClientEvent: jest.fn(),
  reportHandledClientFailure: jest.fn(),
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
  { id: 'v-5', name: 'Omega Plumbing', vendorCode: 'OMEGA', code: 'O-1', email: 'omega@example.test', contactPerson: 'Omar', vendorType: 'PROCUCEV_VENDOR', state: 'Karnataka', city: 'Bengaluru', categories: ['Plumbing'], complianceStatus: 'COMPLIANT', qualificationStatus: 'QUALIFIED', performanceScore: 4.1, pposCount: 1, isBlacklisted: false },
];
const rateCards = [
  { id: 'rc-1', vendorId: 'v-1', status: 'APPROVED', validTo: null, rateCardNumber: 'RC-1' },
  { id: 'rc-2', vendorId: 'v-2', status: 'APPROVED', validTo: '2099-01-01T00:00:00.000Z', rateCardNumber: 'RC-2' },
  { id: 'rc-expired', vendorId: 'v-3', status: 'APPROVED', validTo: '2000-01-01T00:00:00.000Z', rateCardNumber: 'RC-OLD' },
  { id: 'rc-pending', vendorId: 'v-4', status: 'PENDING', validTo: null, rateCardNumber: 'RC-PENDING' },
];
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });
const defaultBoqs = [boq('rev-1', 'North Plant'), boq('rev-2', 'South Plant', 'Civil')];
const defaultBoqSummaries = defaultBoqs.map(stripBoqLines);
const pr = {
  id: 'pr-1', prNumber: 'PR-100', title: 'Cable installation', status: 'PR_APPROVED',
  projectId: 'project-pr', project: { id: 'project-pr', name: 'PR Project', projectCode: 'PRP', city: 'Delhi' },
  boqRevision: { id: 'pr-rev-1', revisionCode: 'R3' }, boq: { boqCode: 'PR-BOQ' }, costCentre: { code: 'CC-2', name: 'Power' },
  lines: [{ id: 'pr-line-1', itemDescription: 'Switchgear', specification: '11KV', category: 'Electrical', uom: 'EA', quantity: 2, estimatedRate: 8000 }],
  rfqs: [],
};

function configureFetch(overrides: Record<string, unknown> = {}) {
  const detailOkSequence = Array.isArray(overrides.boqDetailsOkSequence)
    ? [...overrides.boqDetailsOkSequence]
    : [];
  const detailBoqSequence = Array.isArray(overrides.boqDetailsSequence)
    ? [...overrides.boqDetailsSequence]
    : [];
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/procurement/approved-boqs')) {
      if (url.includes('revisionId=')) {
        const detailOk = detailOkSequence.length > 0 ? detailOkSequence.shift() !== false : overrides.boqDetailsOk !== false;
        const detailResponse = detailBoqSequence.length > 0
          ? detailBoqSequence.shift()
          : overrides.boqDetails ?? { approvedBoqs: defaultBoqs };
        return response(detailResponse, detailOk);
      }
      if (url.includes('page=')) return response(overrides.moreBoqs ?? { approvedBoqs: [], page: 2, hasMore: false }, overrides.moreBoqsOk !== false);
      return response(overrides.boqs ?? { approvedBoqs: defaultBoqSummaries });
    }
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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.initializingRFQControlWizard))).toBeInTheDocument();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary))).toBeInTheDocument();
    expect(screen.getByText('North Plant')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rev-2' } });
    expect(screen.getByText('South Plant')).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/approved-boqs?revisionId=rev-2&pageSize=1&linePageSize=90'));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    continueTo(2);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.sCOPEPACKAGEDEFINITION))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Mechanical' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.scopedItems)).parentElement).toHaveTextContent('1 / 3');
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.packageTrade, "", false)), { target: { value: '' } });
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    const categoryDraft = mockFetch.mock.calls
      .filter(([url, init]) => String(url) === '/api/procurement/rfqs' && (init as RequestInit)?.method === 'POST')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string))[0];
    expect(categoryDraft).toEqual(expect.objectContaining({ packageType: 'CATEGORY', categoryName: 'Mechanical', packageName: 'Commercial Package' }));
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.packageTrade, "", false)), { target: { value: 'Switchgear' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.selectIndividualLines, "", false) }));
    const pumpRow = screen.getByText('Pump set').closest('tr') as HTMLTableRowElement;
    fireEvent.click(within(pumpRow).getByRole('checkbox'));
    fireEvent.click(within(pumpRow).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.excluded) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.deselectAll) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.commercialTechnical, "", false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.step2AtLeastOneBoqLineItemMustBeIncludedInRfqScope))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.selectIndividualLines, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.selectAll, "", false) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.filterItemsByDescription)), { target: { value: 'pump' } });
    expect(screen.getByText('Pump set')).toBeInTheDocument();
    expect(screen.queryByText('Copper cable')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.filterItemsByDescription)), { target: { value: '' } });
    fireEvent.change(within(screen.getByText('Pump set').closest('tr') as HTMLTableRowElement).getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.optionalLineNote)), { target: { value: 'Confirm site measurements' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.rFQTitle, "", false)), { target: { value: 'North Plant electrical package' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.packageTrade, "", false)), { target: { value: 'Switchgear' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.expectedCompletionDate, "", false)), { target: { value: '2027-03-31' } });

    continueTo(3);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.cOMMERCIALTECHNICALCONDITIONS))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.submissionDeadline, "", false)), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.clarificationDeadline, "", false)), { target: { value: '2026-02-05' } });
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.continueToStep, {"step":"4"})) }));
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.submissionDeadline, "", false)), { target: { value: '2026-02-10' } });

    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.commercialValidityDays, "", false)), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.paymentTerms, "", false)), { target: { value: '45 days' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.deliveryScheduleRequirement, "", false)), { target: { value: 'Ship within 60 days' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.taxesAndGST, "", false)), { target: { value: 'GST inclusive' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.freightInsuranceIncoterms, "", false)), { target: { value: 'Delivered duty paid' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.warrantyDefectLiability, "", false)), { target: { value: '24 months' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.performanceSecurity)), { target: { value: '10% PBG' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.liquidatedDamages)), { target: { value: '1% weekly' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.priceBasis, "", false)), { target: { value: 'Variable with Material Index escalation' } });
    fireEvent.change(screen.getByLabelText(/Technical Specifications/), { target: { value: 'IS certified only' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.commercialRequirementsGeneralTerms, "", false)), { target: { value: 'Includes unloading' } });
    fireEvent.change(screen.getByPlaceholderText(/Add document requirement/), { target: { value: 'ISO 9001' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Add"})) }));
    expect(screen.getByText('ISO 9001')).toBeInTheDocument();
    const panDocument = screen.getByText('PAN Card').closest('span') as HTMLElement;
    fireEvent.click(within(panDocument).getByRole('button'));
    expect(screen.queryByText('PAN Card')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Add document requirement/), { target: { value: 'Safety Plan' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Add document requirement/), { key: 'Enter', code: 'Enter' });
    expect(screen.getByText('Safety Plan')).toBeInTheDocument();
    continueTo(4);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.vENDORSELECTIONINVITATION))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.allEligibleVendors, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.clearSelection) }));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.inviteVendor) })[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.rateCardVendors, "", false) }));
    expect(screen.getByText('Gamma Works')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.previouslyWorkedWith, "", false) }));
    expect(screen.getByText('Alpha Electrical')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.searchNameCodeContact)), { target: { value: 'beta@example.test' } });
    expect(screen.getByText('Beta Engineering')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.searchNameCodeContact)), { target: { value: '' } });
    const filters = screen.getAllByRole('combobox');
    fireEvent.change(filters[0], { target: { value: 'Karnataka' } });
    fireEvent.change(filters[1], { target: { value: 'Bengaluru' } });
    fireEvent.change(filters[2], { target: { value: 'Electrical' } });
    fireEvent.change(filters[3], { target: { value: 'PROCUCEV_VENDOR' } });
    expect(screen.getByText('Beta Engineering')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.showOnlyRateCardVendors)));
    expect(screen.getByText('Beta Engineering')).toBeInTheDocument();
    expect(screen.queryByText('Delta Blacklisted')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.showOnlyRateCardVendors)));
    expect(screen.queryByText('Omega Plumbing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.showOnlyRateCardVendors)));
    fireEvent.change(filters[0], { target: { value: '' } });
    fireEvent.change(filters[1], { target: { value: '' } });
    fireEvent.change(filters[2], { target: { value: '' } });
    fireEvent.change(filters[3], { target: { value: 'ALL' } });
    fireEvent.click(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.showOnlyRateCardVendors)));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.selectAllCompliant, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.clearSelection) }));
    const betaRow = screen.getByText('Beta Engineering').closest('tr') as HTMLTableRowElement;
    fireEvent.click(within(betaRow).getByRole('checkbox'));
    continueTo(5);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.fINALREVIEWRELEASETOMARKET))).toBeInTheDocument();
    expect(screen.getByText('North Plant electrical package')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Edit","toLocaleString":"Step 1"})) }));
    const stepper = within(screen.getByRole('navigation', { name: uiStringPattern(UI_STRINGS.componentsUiStepper.rFQCreationSteps) }));
    fireEvent.click(stepper.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reviewRelease, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Edit","toLocaleString":"Step 2"})) }));
    fireEvent.click(stepper.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reviewRelease, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Edit","toLocaleString":"Step 3"})) }));
    fireEvent.click(stepper.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reviewRelease, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Edit","toLocaleString":"Step 4"})) }));
    fireEvent.click(stepper.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reviewRelease, "", false) }));
    fireEvent.click(stepper.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reviewRelease, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Step 4' }));
    fireEvent.click(stepper.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reviewRelease, "", false) }));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[1]);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenLastCalledWith('RFQ draft saved successfully.', 'RFQ-NEW', 'Draft'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.releaseRFQToVendors, "", false) }));
    expect(screen.getByRole('dialog')).toHaveTextContent(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.confirmRFQReleaseToMarket));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.releaseRFQToVendors, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.confirmReleaseRFQ) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.appAppProcurementRfqsIdPage.rFQIssuedSuccessfully, 'RFQ-NEW', UI_STRINGS.common.userMessages.awaitingQuotations));
    expect(mockPush).toHaveBeenCalledWith('/procurement/rfqs/rfq-new');
    const posts = mockFetch.mock.calls.filter(([url, init]) => String(url) === '/api/procurement/rfqs' && (init as RequestInit)?.method === 'POST');
    const post = posts[posts.length - 1];
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual(expect.objectContaining({
      projectId: 'project-rev-2', boqRevisionId: 'rev-2', packageType: 'SELECTED_LINES', selectedLineIds: expect.any(Array),
      vendorIds: ['v-2'], action: 'RELEASE_RFQ', technicalRequirements: 'IS certified only', priceBasis: 'Variable with Material Index escalation',
    }));
  });

  it('loads approved BOQ lines in cursor pages and keeps full revision summaries', async () => {
    const revision = defaultBoqs[0];
    const firstDetailPage = {
      ...revision,
      lines: revision.lines.slice(0, 2),
      linePagination: { pageSize: 2, hasMore: true, nextCursor: 'cursor-page-two' },
    };
    const secondDetailPage = {
      ...revision,
      lines: revision.lines.slice(2),
      linePagination: { pageSize: 2, hasMore: false, nextCursor: null },
    };
    configureFetch({ boqDetailsSequence: [
      { approvedBoqs: [firstDetailPage] },
      { approvedBoqs: [secondDetailPage] },
    ] });

    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    expect(screen.getByText('Copper cable')).toBeInTheDocument();
    expect(screen.queryByText('Pump set')).not.toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.scopedItems)).parentElement).toHaveTextContent('3 / 3');

    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.common.loadMore }));
    expect(await screen.findByText('Pump set')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenLastCalledWith(expect.stringContaining('lineCursor=cursor-page-two'));
    expect(screen.queryByRole('button', { name: UI_STRINGS.common.loadMore })).not.toBeInTheDocument();
  });

  it('preserves BOQ scope summaries and ignores a continuation request without a cursor', async () => {
    const revision = {
      ...defaultBoqs[0],
      estimatedBenchmarkValue: 35000,
      categories: [
        { category: 'Electrical', lineCount: 2, totalQty: 15, estimatedValue: 30000 },
        { category: 'Mechanical', lineCount: 1, totalQty: 1, estimatedValue: 5000 },
      ],
    };
    const firstPage = {
      ...revision,
      totalLines: undefined,
      lines: revision.lines.slice(0, 1),
      linePagination: { pageSize: 1, hasMore: true, nextCursor: null },
    };
    configureFetch({
      boqs: { approvedBoqs: [stripBoqLines(revision)] },
      boqDetailsSequence: [{ approvedBoqs: [firstPage] }],
    });
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.scopedItems)).parentElement).toHaveTextContent('1 / 1');
    const benchmarkSummary = screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.benchmarkBudget)).parentElement?.textContent || '';
    expect(benchmarkSummary.replace(/\D/g, '')).toContain('35000');

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.selectIndividualLines, '', false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.scopedItems)).parentElement).toHaveTextContent('1 / 1');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.deselectAll) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.scopedItems)).parentElement).toHaveTextContent('0 / 1');

    const callsBeforeGuard = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.common.loadMore }));
    expect(mockFetch).toHaveBeenCalledTimes(callsBeforeGuard);
  });

  it('reports failed and malformed approved BOQ continuation pages', async () => {
    const revision = defaultBoqs[0];
    const firstPage = {
      ...revision,
      lines: revision.lines.slice(0, 1),
      linePagination: { pageSize: 1, hasMore: true, nextCursor: 'cursor-page-two' },
    };
    configureFetch({
      boqs: { approvedBoqs: [stripBoqLines(revision)] },
      boqDetailsSequence: [{ approvedBoqs: [firstPage] }],
      boqDetailsOkSequence: [true, false],
    });
    const failedRequest = renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.common.loadMore }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs))).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      event: 'procurement.approved_boq_detail_page_failed', operation: 'load_detail_lines', revisionId: revision.id,
    }));
    failedRequest.unmount();

    configureFetch({
      boqs: { approvedBoqs: [stripBoqLines(revision)] },
      boqDetailsSequence: [
        { approvedBoqs: [firstPage] },
        { approvedBoqs: [{ ...revision, lines: null, linePagination: { pageSize: 1, hasMore: false, nextCursor: null } }] },
      ],
    });
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.common.loadMore }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs))).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      event: 'procurement.approved_boq_detail_page_failed', operation: 'load_detail_lines', revisionId: revision.id,
    }));
  });

  it('reports malformed vendor category JSON while keeping CSV category fallback quiet', async () => {
    configureFetch({
      vendors: {
        vendors: [
          ...vendors,
          { ...vendors[2], id: 'v-malformed-json', categories: '[\"Electrical\"' },
          { ...vendors[2], id: 'v-wrong-shape', categories: '{\"category\":\"Electrical\"}' },
        ],
      },
    });
    renderPage();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary))).toBeInTheDocument();
    continueTo(2);
    continueTo(3);
    continueTo(4);
    expect(await screen.findByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.searchNameCodeContact))).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.searchNameCodeContact)),
      { target: { value: 'no-match' } },
    );
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      expect.objectContaining({
        operation: 'parse_vendor_categories',
        field: 'categories',
        fallback: 'comma_delimited_categories',
      }),
    );
    expect(reportClientEvent).toHaveBeenCalledWith(
      'warn',
      'browser.vendor_categories_shape_invalid',
      expect.objectContaining({
        operation: 'parse_vendor_categories',
        field: 'categories',
        fallback: 'comma_delimited_categories',
      }),
    );
    expect(jest.mocked(reportClientEvent).mock.calls.every(([level, event]) =>
      level === 'warn' && event === 'browser.vendor_categories_shape_invalid',
    )).toBe(true);
  });

  it('reports missing baselines, empty scope, invalid timeline, empty vendor selection, and save failures', async () => {
    configureFetch({ boqs: { approvedBoqs: [] } });
    const noBoq = renderPage();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.createRequestForQuotation))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.continueToStep, {"step":"2"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.step1SelectAndVerifyApprovedCommercialBaseline))).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.selectApprovedBoqBaselineInStep1))).toBeInTheDocument();
    noBoq.unmount();

    configureFetch();
    const mounted = renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.selectIndividualLines, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.deselectAll) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.commercialTechnical, "", false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.step2AtLeastOneBoqLineItemMustBeIncludedInRfqScope))).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.atLeastOneBoqLineMustBeIncludedInRfqScopeInStep2))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.entireApprovedBOQ, "", false) }));
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.rFQTitle, "", false)), { target: { value: '  ' } });
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.rfqTitleIsRequired))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.commercialTechnical, "", false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.step2RfqTitleIsRequired))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.rFQTitle, "", false)), { target: { value: 'Valid package' } });
    continueTo(3);
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.submissionDeadline, "", false)), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.clarificationDeadline, "", false)), { target: { value: '2026-01-02' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.continueToStep, {"step":"4"})) }));
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    expect(screen.getAllByText('Submission deadline must be later than the clarification deadline.').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.submissionDeadline, "", false)), { target: { value: '2026-01-03' } });
    continueTo(4);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.clearSelection) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reviewRelease, "", false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.step4InviteAtLeastOneQualifiedVendorBeforeFinalReview))).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.rfqDraftSavedSuccessfully, 'RFQ-NEW', UI_STRINGS.common.draft));
    mounted.unmount();

    configureFetch({ createResponse: new Error('network failure') });
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.objectContaining({ title: UI_STRINGS.appAppProcurementRfqsNewPage.rFQCreationFailed, message: 'network failure' })));
  });

  it('hydrates a source PR, resolves fallback PR lookup and rate matches, and blocks duplicate or incomplete PRs', async () => {
    const fallback = { ...pr, rfqs: [{ id: 'rfq-active', rfqNumber: 'RFQ-ACTIVE', status: 'RELEASED' }] };
    configureFetch({ prOk: false, approvedPrs: [fallback], rateCardMatch: { matches: [{ id: 'match-2', rateCardNumber: 'RC-PR' }] } });
    const duplicate = renderPage('prId=pr-1');
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.approvedPRBaselinePrNumber, {"prNumber":"PR-100"})))).toBeInTheDocument();
    expect(screen.getByText(/Active Sourcing Event Already Exists/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.openActiveRFQ, "", false) })).toHaveAttribute('href', '/procurement/rfqs/rfq-active');
    expect(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[1]).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.activeRfqRfqNumberAlreadyExistsForPrDuplicateSourcingPrevented, {"rfqNumber":"RFQ-ACTIVE"})))).toBeInTheDocument();
    duplicate.unmount();

    configureFetch({ pr: { ...pr, lines: [] } });
    const empty = renderPage('prId=pr-1');
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.approvedPrPrNumberHasNoApprovedLineItemsAvailableForSourcing, {"prNumber":"PR-100"})))).toBeInTheDocument();
    empty.unmount();

    configureFetch({ pr: {}, prOk: true, approvedPrs: [] });
    const direct = renderPage('prId=pr-1');
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.unableToLoadProcurementRequestPrIdNotFoundOrAccessRestricted, {"prId":"pr-1"})))).toBeInTheDocument();
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
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.approvedPRBaselinePrNumber, {"prNumber":"PR-SPARSE"})))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.bengaluru))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.generalWorks))).toBeInTheDocument();
    expect(screen.getByText('R1 (APPROVED) (IMMUTABLE)')).toBeInTheDocument();
    continueTo(2);
    expect(screen.getByText('General supply')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.standardSpecification)).length).toBeGreaterThan(0);
    sparse.unmount();

    configureFetch({});
    const revision = renderPage('revisionId=missing-revision');
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary))).toBeInTheDocument();
    expect(screen.getByText('North Plant')).toBeInTheDocument();
    revision.unmount();

    mockFetch.mockRejectedValue(new Error('initial data unavailable'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.createRequestForQuotation))).toBeInTheDocument();
    await waitFor(() => expect(error).toHaveBeenCalledWith('Error initializing RFQ wizard data:', expect.any(Error)));
  });

  it('reports unavailable or incomplete details for an approved BOQ summary', async () => {
    configureFetch({ boqs: { approvedBoqs: defaultBoqSummaries }, boqDetailsOk: false });
    const unavailable = renderPage();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs))).toBeInTheDocument();
    unavailable.unmount();

    configureFetch({ boqs: { approvedBoqs: defaultBoqSummaries }, boqDetails: { approvedBoqs: [] } });
    const missing = renderPage();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs))).toBeInTheDocument();
    missing.unmount();

    configureFetch({ boqs: { approvedBoqs: defaultBoqSummaries }, boqDetails: { approvedBoqs: [{ ...defaultBoqs[0], lines: null }] } });
    renderPage();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs))).toBeInTheDocument();
  });

  it('appends the next approved BOQ page and reports pagination failures', async () => {
    configureFetch({
      boqs: { approvedBoqs: defaultBoqSummaries, page: 1, hasMore: true },
      moreBoqs: { approvedBoqs: [stripBoqLines(boq('rev-3', 'West Plant'))], page: 2, hasMore: false },
    });
    const paginated = renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    const loadMore = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) });
    fireEvent.click(loadMore);
    expect(await screen.findByRole('option', { name: /West Plant/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) })).not.toBeInTheDocument();
    paginated.unmount();

    configureFetch({ boqs: { approvedBoqs: defaultBoqSummaries, hasMore: true }, moreBoqsOk: false });
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs))).toBeInTheDocument();
  });

  it('recovers from a BOQ selection detail failure and toggles every line from the header checkbox', async () => {
    configureFetch({ boqDetailsOkSequence: [true, false] });
    const selection = renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rev-2' } });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs))).toBeInTheDocument();
    selection.unmount();

    configureFetch();
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    expect(headerCheckbox).toBeChecked();
    fireEvent.click(headerCheckbox);
    await waitFor(() => expect(headerCheckbox).not.toBeChecked());
    fireEvent.click(headerCheckbox);
    await waitFor(() => expect(headerCheckbox).toBeChecked());
  });

  it('shows the empty state when no applicable active rate cards exist', async () => {
    configureFetch({ rateCards: { rateCards: [] } });
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    continueTo(3);
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.common.submissionDeadline, '', false)), { target: { value: '2027-02-10' } });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.clarificationDeadline, '', false)), { target: { value: '2027-02-01' } });
    continueTo(4);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.noActiveRateCardsAreCurrentlyRegisteredForThisPackageCategory))).toBeInTheDocument();
  });

  it('filters vendors by region and city while showing mismatch results', async () => {
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    continueTo(2);
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.rFQTitle, "", false)), { target: { value: 'Regional package' } });
    continueTo(3);
    continueTo(4);

    const filters = screen.getAllByRole('combobox');
    fireEvent.change(filters[0], { target: { value: 'Karnataka' } });
    expect(filters[0]).toHaveValue('Karnataka');
    expect(screen.queryByText('Alpha Electrical')).not.toBeInTheDocument();
    expect(screen.getByText('Omega Plumbing')).toBeInTheDocument();

    fireEvent.change(filters[0], { target: { value: 'Maharashtra' } });
    fireEvent.change(filters[1], { target: { value: 'Pune' } });
    expect(filters[1]).toHaveValue('Pune');
    expect(screen.getByText('Alpha Electrical')).toBeInTheDocument();
    expect(screen.queryByText('Gamma Works')).not.toBeInTheDocument();
  });

  it('uses the server error fallback when a save response is unsuccessful and omits the error text', async () => {
    configureFetch({ createResponse: response({}, false) });
    renderPage();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.objectContaining({
    title: UI_STRINGS.appAppProcurementRfqsNewPage.rFQCreationFailed, message: UI_STRINGS.common.userMessages.failedToCreateRfq,
    })));
  });
});
