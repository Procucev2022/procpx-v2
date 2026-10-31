/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BoqWorkspacePage from '../src/app/(app)/boq/[revisionId]/page';

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockUseParams = jest.fn(() => ({ revisionId: 'rev-1' }));
let revision: any;
let lines: any[];
let total = 51;
let standardiseResult: { ok: boolean; body: any };
let validateResult: { ok: boolean; body: any };
let submitResult: { ok: boolean; body: any };
let approveResult: { ok: boolean; body: any };
let rejectResult: { ok: boolean; body: any };
let saveResult: { ok: boolean; body: any };
let compareResult: { ok: boolean; body: any };
let newRevisionResult: { ok: boolean; body: any };
let categoriesResponse: any;
let uomsResponse: any;
let linesDataPresent = true;
const mockFetch = jest.fn();

jest.mock('next/navigation', () => ({ useParams: () => mockUseParams() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockToastSuccess, error: mockToastError }) }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle, backHref, backLabel, badge, actions }: any) => <header>
    <h1>{title}</h1><p>{subtitle}</p><a href={backHref}>{backLabel}</a>{badge}{actions}
  </header>,
}));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCardGrid: ({ children }: any) => <div data-testid="summary-grid">{children}</div>,
  SummaryCard: ({ label, value, secondary }: any) => <article><span>{label}</span><strong>{value}</strong><small>{secondary}</small></article>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({ StatusBadge: ({ status }: any) => <span data-testid="status-badge">{status}</span> }));
jest.mock('../src/components/ui/SpecificationCell', () => ({
  __esModule: true,
  default: ({ specification, itemDescription }: any) => <span>{specification || itemDescription || 'No specification'}</span>,
}));
jest.mock('../src/components/ui/EmptyState', () => ({ __esModule: true, default: ({ title }: any) => <div>{title}</div> }));

const originalFetch = global.fetch;
const originalConfirm = window.confirm;
const draftRevision = {
  id: 'rev-1', revisionCode: 'R2', status: 'DRAFT', qualityScore: 72, totalLines: 51,
  validLines: 45, warningLines: 5, errorLines: 0, originalFileName: 'boq.xlsx',
  uploadedAt: '2026-10-01T10:00:00Z', submittedAt: null, approvedAt: null, notes: 'Review quantities',
};
const sampleLines = [
  {
    id: 'line-1', lineNumber: 1, itemCode: 'CAB-1', standardDescription: 'Power Cable', originalDescription: 'Cable',
    specification: 'Copper conductor, XLPE insulated', quantity: 10, uom: { code: 'M' }, uomRaw: 'm',
    category: { name: 'Electrical' }, categoryId: 'cat-1', subcategory: { name: 'Cables' }, subcategoryId: 'sub-1',
    location: 'Zone A', validationStatus: 'WARNING', validationMessages: JSON.stringify([{ level: 'WARNING', message: 'Verify route' }]),
  },
  {
    id: 'line-2', lineNumber: 2, originalDescription: 'Conduit', specification: '', quantity: null,
    uomRaw: '', category: null, subcategory: null, location: '', validationStatus: 'ERROR', validationMessages: '[]',
  },
  {
    id: 'line-3', originalDescription: 'Uncoded line', itemCode: '', quantity: 1,
    validationStatus: 'VALID', validationMessages: JSON.stringify([{ level: 'INFO', message: 'Imported line' }, { level: 'ERROR', message: 'Code required' }]),
  },
];
const compareData = {
  availableRevisions: [
    { id: 'rev-1', revisionCode: 'R2', status: 'DRAFT' },
    { id: 'rev-0', revisionCode: 'R1', status: 'APPROVED' },
  ],
  compareRevision: { id: 'rev-0', revisionCode: 'R1' }, currentRevision: { id: 'rev-1', revisionCode: 'R2' },
  summary: { addedCount: 1, removedCount: 1, modifiedCount: 1, unchangedCount: 4 },
  modified: [{ lineNumber: 1, description: 'Power Cable', diffs: [
    { field: 'quantity', oldVal: 8, newVal: 10 }, { field: 'specification', oldVal: '', newVal: 'Copper cable' },
    { field: 'supplierNote', oldVal: 0, newVal: '' },
  ] }],
  added: [{ lineNumber: 3, description: 'Switchgear', quantity: 1, uom: 'EA', category: 'Electrical' }],
  removed: [{ lineNumber: 4, description: 'Legacy item' }],
};

const response = (body: any, ok = true) => ({ ok, json: async () => body });
function setupFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/boq/rev-1/lines') && init?.method === 'PUT') return Promise.resolve(response(saveResult.body, saveResult.ok));
    if (url.startsWith('/api/boq/rev-1/lines')) return Promise.resolve(response({ data: linesDataPresent ? lines : undefined, total, revision }));
    if (url === '/api/masters/categories') return Promise.resolve(response(categoriesResponse));
    if (url === '/api/masters/uom') return Promise.resolve(response(uomsResponse));
    if (url.endsWith('/standardise')) return Promise.resolve(response(standardiseResult.body, standardiseResult.ok));
    if (url.endsWith('/validate')) return Promise.resolve(response(validateResult.body, validateResult.ok));
    if (url.endsWith('/submit')) return Promise.resolve(response(submitResult.body, submitResult.ok));
    if (url.endsWith('/approve')) return Promise.resolve(response(approveResult.body, approveResult.ok));
    if (url.endsWith('/reject')) return Promise.resolve(response(rejectResult.body, rejectResult.ok));
    if (url.includes('/compare')) return Promise.resolve(response(compareResult.body, compareResult.ok));
    if (url.endsWith('/new-revision')) return Promise.resolve(response(newRevisionResult.body, newRevisionResult.ok));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('BOQ revision workspace page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ revisionId: 'rev-1' });
    revision = { ...draftRevision };
    lines = [...sampleLines];
    total = 51;
    standardiseResult = { ok: true, body: { message: 'Descriptions standardised', qualityScore: 88 } };
    validateResult = { ok: true, body: { qualityScore: 92, errorLines: 0, warningLines: 2 } };
    submitResult = { ok: true, body: { revisionCode: 'R2' } };
    approveResult = { ok: true, body: {} };
    rejectResult = { ok: true, body: {} };
    saveResult = { ok: true, body: {} };
    compareResult = { ok: true, body: compareData };
    newRevisionResult = { ok: true, body: { revisionId: 'rev-3' } };
    categoriesResponse = [{ id: 'cat-1', name: 'Electrical', children: [{ id: 'sub-1', name: 'Cables' }] }, { id: 'cat-2', name: 'General' }];
    uomsResponse = [{ id: 'uom-1', code: 'M', name: 'Meter' }, { id: 'uom-2', code: 'EA', name: 'Each' }];
    linesDataPresent = true;
    window.confirm = jest.fn(() => true);
    setupFetch();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
  });

  it('loads draft lines, searches and filters, paginates, and renders quality and comparison tabs', async () => {
    render(<BoqWorkspacePage />);
    expect(await screen.findByText('Power Cable')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppBoqRevisionIdPage.bOQWorkspaceRevisionCode, {"revisionCode":"R2"})))).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('Copper conductor, XLPE insulated')).toBeInTheDocument();
    expect(screen.getByText(/Verify route/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"for Approval"})) })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to BOQ Register' })).toHaveAttribute('href', '/boq');
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, {"value1":"1","value2":"2"})))).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.searchDescriptionsLineNumbers)), { target: { value: 'cable' } });
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('search=cable'))).toBe(true));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ERROR' } });
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('validationStatus=ERROR'))).toBe(true));
    fireEvent.click(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, {"value1":"1","value2":"2"}))).parentElement!.querySelectorAll('button')[2]);
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true));
    fireEvent.click(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, {"value1":"2","value2":"2"}))).parentElement!.querySelectorAll('button')[1]);
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('page=1'))).toBe(true));
    fireEvent.click(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, {"value1":"1","value2":"2"}))).parentElement!.querySelectorAll('button')[3]);
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true));
    fireEvent.click(screen.getByText('BOQ Lines (51)'));

    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.qualitySummary)));
    expect(screen.getByText('72 / 100')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.revisionMetadata))).toBeInTheDocument();
    expect(screen.getByText('boq.xlsx')).toBeInTheDocument();
    expect(screen.getByText('Review quantities')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Revision Comparison/));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/boq/rev-1/compare'));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.linesAdded))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.modifiedLineItems))).toBeInTheDocument();
    expect(screen.getByText('Switchgear')).toBeInTheDocument();
    expect(screen.getByText('Copper cable')).toBeInTheDocument();
    const compareSelect = screen.getByRole('combobox');
    fireEvent.change(compareSelect, { target: { value: 'rev-0' } });
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('targetRevisionId=rev-0'))).toBe(true));
    fireEvent.click(screen.getByText('BOQ Lines (51)'));
  });

  it('edits line fields and saves successfully or displays save errors', async () => {
    render(<BoqWorkspacePage />);
    expect(await screen.findByText('Power Cable')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    expect(screen.getByText(/Edit BOQ Line/)).toBeInTheDocument();
    const modal = document.querySelector('.modal') as HTMLElement;
    fireEvent.click(modal.parentElement!);
    expect(screen.queryByText(/Edit BOQ Line/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    const reopenedModal = document.querySelector('.modal') as HTMLElement;
    fireEvent.change(reopenedModal.querySelector('input')!, { target: { value: 'Revised Power Cable' } });
    fireEvent.change(reopenedModal.querySelector('textarea')!, { target: { value: 'XLPE armoured cable' } });
    const selects = within(reopenedModal).getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'cat-1' } });
    expect(within(reopenedModal).getByRole('option', { name: 'Cables' })).toBeInTheDocument();
    fireEvent.change(selects[1], { target: { value: 'sub-1' } });
    fireEvent.change(selects[0], { target: { value: 'cat-2' } });
    expect(within(reopenedModal).queryByRole('option', { name: 'Cables' })).not.toBeInTheDocument();
    fireEvent.change(selects[0], { target: { value: 'cat-1' } });
    fireEvent.change(selects[1], { target: { value: 'sub-1' } });
    fireEvent.change(selects[2], { target: { value: 'uom-1' } });
    fireEvent.change(within(reopenedModal).getByRole('spinbutton'), { target: { value: '25' } });
    const modalInputs = reopenedModal.querySelectorAll('input');
    fireEvent.change(modalInputs[2], { target: { value: 'Zone B' } });
    fireEvent.change(modalInputs[3], { target: { value: 'DWG-3' } });
    fireEvent.change(modalInputs[4], { target: { value: 'Handle with care' } });
    fireEvent.click(within(reopenedModal).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveChanges) }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    expect(screen.queryByText(/Edit BOQ Line/)).not.toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'PUT')![1].body as string)).toMatchObject({
      lineId: 'line-1', updates: { standardDescription: 'Revised Power Cable', specification: 'XLPE armoured cable', categoryId: 'cat-1', subcategoryId: 'sub-1', uomId: 'uom-1', location: 'Zone B', drawingReference: 'DWG-3', remarks: 'Handle with care' },
    });

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[1]);
    const fallbackModal = document.querySelector('.modal') as HTMLElement;
    expect(within(fallbackModal).getAllByRole('combobox')[0]).toHaveValue('');
    fireEvent.change(within(fallbackModal).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }).parentElement!.parentElement!.querySelectorAll('select')[0], { target: { value: 'cat-2' } });
    fireEvent.click(within(fallbackModal).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    saveResult = { ok: false, body: { error: 'Save failed due to a conflict' } };
    fireEvent.click(within(document.querySelector('.modal') as HTMLElement).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveChanges) }));
    expect(await screen.findByText('Save failed due to a conflict')).toBeInTheDocument();
    fireEvent.click(document.querySelector('.modal-header .btn-icon')!);
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    fireEvent.click(within(document.querySelector('.modal') as HTMLElement).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
  });

  it('runs standardisation and validation, then submits with confirmation and handles result errors', async () => {
    render(<BoqWorkspacePage />);
    expect(await screen.findByText('Power Cable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Standardise"})) }));
    expect(await screen.findByText(/Descriptions standardised \(Score: 88%\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.validate) }));
    expect(await screen.findByText(/Quality Score is 92%, 0 errors, 2 warnings/)).toBeInTheDocument();

    standardiseResult = { ok: false, body: { error: 'Standardisation unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.value1, {"value1":"Standardise"})) }));
    expect(await screen.findByText('Standardisation unavailable')).toBeInTheDocument();
    validateResult = { ok: false, body: { error: 'Validation service unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.validate) }));
    expect(await screen.findByText('Validation service unavailable')).toBeInTheDocument();

    revision.errorLines = 0;
    window.confirm = jest.fn(() => false);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"for Approval"})) }));
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/submit'))).toBe(false);
    window.confirm = jest.fn(() => true);
    submitResult = { ok: false, body: { error: 'Submit blocked' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"for Approval"})) }));
    expect(window.confirm).toHaveBeenCalledWith('Submit this BOQ for approval?');
    expect(await screen.findByText('Submit blocked')).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith('Submit blocked');

    submitResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"for Approval"})) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQSubmittedSuccessfully))).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.bOQSubmittedSuccessfully, 'R2', UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover);
    fireEvent.click(document.querySelector('.alert .btn-ghost')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.bOQSubmittedSuccessfully))).not.toBeInTheDocument();
  });

  it('approves and rejects submitted revisions with confirmation and mandatory reason', async () => {
    revision = { ...draftRevision, status: 'SUBMITTED', errorLines: 2, qualityScore: 48 };
    render(<BoqWorkspacePage />);
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"BOQ"})))).toBeInTheDocument();
    expect(screen.getByText('48%')).toBeInTheDocument();
    window.confirm = jest.fn(() => false);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"BOQ"})) }));
    expect(window.confirm).toHaveBeenCalledWith('Approve this BOQ? This action will make it an immutable commercial baseline.');
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/approve'))).toBe(false);

    window.confirm = jest.fn(() => true);
    approveResult = { ok: false, body: { error: 'Approval rejected by policy' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"BOQ"})) }));
    expect(await screen.findByText('Approval rejected by policy')).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith('Approval rejected by policy');
    approveResult = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"BOQ"})) }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToApproveBoq));
    approveResult = { ok: false, body: { error: 'Approval rejected by policy' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"BOQ"})) }));
    expect(await screen.findByText('Approval rejected by policy')).toBeInTheDocument();
    approveResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"BOQ"})) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQApprovedSuccessfully))).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.bOQApprovedSuccessfully);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"BOQ"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.rejectBOQRevision))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();
    fireEvent.click(document.querySelector('.modal-footer .btn-danger')!);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/reject'))).toBe(false);
    fireEvent.click(document.querySelector('.modal-header .btn-icon')!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"BOQ"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"BOQ"})) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.specifyTechnicalDiscrepanciesOrCorrectionsRequired)), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.specifyTechnicalDiscrepanciesOrCorrectionsRequired)), { target: { value: 'Update quantities' } });
    rejectResult = { ok: false, body: { error: 'Rejection failed' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.rejectionFailed))).toBeInTheDocument();
    rejectResult = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"BOQ"})) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.bOQRejectedWithMandatoryReason))).toBeInTheDocument();
    const rejectCall = mockFetch.mock.calls.find(([url, init]) => String(url).endsWith('/reject') && init?.method === 'POST');
    expect(JSON.parse(rejectCall![1].body as string)).toEqual({ reason: 'Update quantities' });
  });

  it('shows rejected and approved banners, creates revisions, and renders empty comparison and line states', async () => {
    revision = { ...draftRevision, status: 'REJECTED', rejectionReason: 'Incorrect quantities', qualityScore: 40, totalLines: 0, validLines: 0, warningLines: 0, errorLines: 0, originalFileName: null, uploadedAt: null, submittedAt: null, approvedAt: null, notes: null };
    total = 0;
    lines = [];
    linesDataPresent = false;
    categoriesResponse = null;
    uomsResponse = undefined;
    compareResult = { ok: true, body: {
      availableRevisions: [{ id: 'rev-1', revisionCode: 'R2', status: 'REJECTED' }],
      summary: { addedCount: 0, removedCount: 0, modifiedCount: 0, unchangedCount: 0 },
      modified: [], added: [], removed: [],
      currentRevision: { revisionCode: 'R2' }, compareRevision: { revisionCode: 'R1' },
    } };
    const rejectedView = render(<BoqWorkspacePage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.noBOQLinesFound))).toBeInTheDocument();
    expect(screen.getByText('Incorrect quantities')).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.qualitySummary)));
    expect(screen.getByText('40%')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Revision Comparison/));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.revisionsAreIdentical))).toBeInTheDocument();
    rejectedView.unmount();

    revision = { ...draftRevision, status: 'APPROVED', qualityScore: 88 };
    const approvedView = render(<BoqWorkspacePage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.immutableCommercialBaseline))).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.qualitySummary)));
    expect(screen.getByText('88 / 100')).toBeInTheDocument();
    window.confirm = jest.fn(() => false);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.createNewRevision) }));
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/new-revision'))).toBe(false);
    window.confirm = jest.fn(() => true);
    newRevisionResult = { ok: false, body: { error: 'Revision creation unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.createNewRevision) }));
    expect(await screen.findByText('Revision creation unavailable')).toBeInTheDocument();
    newRevisionResult = { ok: true, body: { revisionId: 'rev-3' } };
    const navigationError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.createNewRevision) }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/new-revision'))).toBe(true));
    navigationError.mockRestore();
    approvedView.unmount();

    revision = { ...draftRevision, qualityScore: null };
    render(<BoqWorkspacePage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQWorkspace))).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqRevisionIdPage.qualitySummary)));
    expect(screen.getByText('0 / 100')).toBeInTheDocument();
  });
});
