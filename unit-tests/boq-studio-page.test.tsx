/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import { encodeBoqLineCursor } from '../src/lib/boq-line-pagination';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BoqStudioPage from '../src/app/(app)/boq/studio/page';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn() };
const mockSearchParams = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, useSearchParams: () => mockSearchParams() }));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => mockToast }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, actions }: any) => <header><h1>{title}</h1>{actions}</header>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({ __esModule: true, default: ({ status }: any) => <span>{status}</span> }));
jest.mock('../src/components/ui/SpecificationCell', () => ({ __esModule: true, default: ({ text }: any) => <span>{text || '—'}</span> }));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
let queryParams: Record<string, string> = {};
const project = { id: 'project-1', name: 'North Store', projectCode: 'NS', sector: 'RETAIL', projectType: 'Retail Store Fitout', areaSqFt: 12000 };
const costCentre = { id: 'cc-1', code: 'CC-1', name: 'Retail Floor', areaSqFt: 9000, projectId: 'project-1', project };
const boq = { id: 'boq-1', boqCode: 'BOQ-1', title: 'North Store BOQ', category: 'Civil & Interior', purpose: 'BUDGET', status: 'DRAFT', projectId: 'project-1', costCentreId: 'cc-1', description: 'Fitout scope', costCentre, project };
const revision = { id: 'revision-1', revisionCode: 'R1', status: 'DRAFT' };
const lines = [
  { id: 'line-1', lineNumber: '1', originalDescription: 'Tile works', standardDescription: 'Vitrified tiles', specification: '600x600 matt', category: 'Civil & Interior', quantity: 20, uom: 'SQFT', aiUnitCost: 125, aiTotalCost: 2500, aiSuggestedDescription: 'AI tile suggestion' },
  { id: 'line-2', lineNumber: '2', originalDescription: 'Cable works', standardDescription: 'Copper cable', specification: 'FRLS', category: 'Electrical', quantity: 10, uom: 'MTR', aiUnitCost: 60, aiTotalCost: 600 },
];

function response(body: unknown, ok = true) { return { ok, json: async () => body, blob: async () => new Blob(['template']) }; }
function setupFetch() {
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/masters/categories') return response({ data: [{ name: 'Custom Finish' }] });
    if (url === '/api/projects') return response({ data: [project] });
    if (url === '/api/boq' && init?.method === 'POST') return response({ boq: { ...boq, latestRevision: revision } });
    if (url === '/api/boq') return response({ data: [boq] });
    if (url.startsWith('/api/cost-centres?')) return response([costCentre]);
    if (url === '/api/boq/manual') return response({});
    if (url === '/api/boq/boq-1') return response({ boq, revision, lines });
    if (url === '/api/boq/estimate-cost') return response({ totalEstimatedBenchmarkValue: 3100, categoryBreakdown: { Electrical: 600 }, unestimatedItems: [] });
    if (url === '/api/boq/revision-1/validate') return response({ qualityScore: 96 });
    if (url === '/api/boq/add-to-budget') return response({ transactionCode: 'BTX-1' });
    if (url === '/api/boq/create-pr') return response({ prNumber: 'PR-1' });
    if (url === '/api/boq/duplicate') return response({ boqCode: 'BOQ-2' });
    if (url === '/api/boq/refine-ai') return response({ lines: [{ aiSuggestedDescription: 'Refined cable', aiSuggestedSpec: 'FRLS copper', aiReason: 'Clearer scope', aiConfidence: 0.95 }] });
    if (url === '/api/boq/standard/upload-validate') return response({ validLines: [{ description: 'Standard line', quantity: 1 }] });
    if (url === '/api/boq/standard/generate') return response({});
    if (url.startsWith('/api/boq/standard/download?')) return response({});
    if (url === '/api/boq/upload-template') return response({});
    if (url === '/api/boq/drawing-extract' && init?.body instanceof FormData) return response({ drawingNumber: 'DWG-1', fileName: 'plan.pdf', items: [{ description: 'Floor tiles', specification: 'Ceramic', quantity: 3, quantityType: 'EXPLICIT' }], totalDetected: 1 });
    if (url === '/api/boq/drawing-extract') return response({ boqId: 'boq-1', boqCode: 'BOQ-1', revisionCode: 'R2', totalLines: 2 });
    if (url === '/api/boq/revision-1/lines') return response({ lines });
    if (url === '/api/boq/revision-1/lines?lineId=line-1') return response({});
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('BOQ studio page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    Element.prototype.scrollIntoView = jest.fn();
    queryParams = { projectId: 'project-1' };
    mockSearchParams.mockReturnValue({ get: (key: string) => queryParams[key] ?? null });
    setupFetch();
    global.fetch = mockFetch as typeof fetch;
    window.URL.createObjectURL = jest.fn(() => 'blob:boq-template');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterAll(() => { global.fetch = originalFetch; });

  it('loads project masters, configures categories and creates a manual BOQ', async () => {
    render(<BoqStudioPage />);
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQCreationStudio) })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /CC-1/ })).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQWORKSPACEISCURRENTLYEMPTY))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Civil & Interior, Electrical/ }));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.searchCategories)), { target: { value: 'Custom' } });
    expect(screen.getByText('Custom Finish')).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.all)));
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.common.clear)));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'HOSPITALITY' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sAVETARGETPARAMETERS) }));
    expect(mockToast.info).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.targetParametersConfiguredForNewBoqCreation);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cREATEMANUALBOQ) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/boq/manual', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText(/Manual BOQ BOQ-1 updated with 2 lines/)).toBeInTheDocument();
    expect((await screen.findAllByText('North Store BOQ')).length).toBeGreaterThan(0);
    expect(screen.getByText('Vitrified tiles')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.toggleProjectAreaAndScopeDetails)));
    expect(screen.getAllByText('Fitout scope').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editBOQ) }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveChanges, "", false) })).toBeInTheDocument();
  });

  it('loads BOQ detail continuation pages when the bounded preview is incomplete', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    const previewLines = Array.from({ length: 100 }, (_, index) => ({
      ...lines[0],
      id: `line-${index + 1}`,
      lineNumber: String(index + 1),
    }));
    const previewCursor = encodeBoqLineCursor({ id: 'line-100', lineNumber: '100' });
    const continuationUrl = `/api/boq/revision-1/lines?${new URLSearchParams({ cursor: previewCursor, pageSize: '100' })}`;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/boq/boq-1' && init?.method !== 'PATCH') return response({ boq, revision, lines: previewLines, totalLines: 101, linesTruncated: true, nextCursor: previewCursor });
      if (url === continuationUrl) return response({ data: [{ ...lines[1], id: 'line-101', lineNumber: '101' }], nextCursor: null, total: 101 });
      if (url === '/api/masters/categories') return response({ data: [] });
      if (url === '/api/projects') return response({ data: [project] });
      if (url === '/api/boq') return response({ data: [boq] });
      if (url.startsWith('/api/cost-centres?')) return response([costCentre]);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BoqStudioPage />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(continuationUrl));
    expect(await screen.findByText('Copper cable')).toBeInTheDocument();
  });

  it('loads project cost centres in stable pages and supports a bounded search', async () => {
    const laterCentre = { ...costCentre, id: 'cc-2', code: 'CC-2', name: 'Operations' };
    const searchedCentre = { ...costCentre, id: 'cc-3', code: 'CC-3', name: 'Warehouse' };
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/masters/categories') return response({ data: [] });
      if (url === '/api/projects') return response({ data: [project] });
      if (url === '/api/boq' && init?.method !== 'POST') return response({ data: [] });
      if (url.startsWith('/api/cost-centres?')) {
        const query = new URL(`http://localhost${url}`).searchParams;
        if (query.get('search')) return response({ costCentres: [searchedCentre], pagination: { page: 1, total: 1, hasMore: false } });
        if (query.get('page') === '2') return response({ costCentres: [laterCentre], pagination: { page: 2, total: 101, hasMore: false } });
        return response({ costCentres: [costCentre], pagination: { page: 1, total: 101, hasMore: true } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    render(<BoqStudioPage />);
    expect(await screen.findByRole('option', { name: /CC-1/ })).toBeInTheDocument();
    expect(await screen.findByText(/Showing 1 of 101 cost centres/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) }));
    expect(await screen.findByRole('option', { name: /CC-2/ })).toBeInTheDocument();

    const searchLabel = uiStringPattern(UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation);
    fireEvent.change(screen.getByPlaceholderText(searchLabel), { target: { value: 'Warehouse' } });
    fireEvent.click(screen.getByRole('button', { name: searchLabel }));
    expect(await screen.findByRole('option', { name: /CC-3/ })).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=Warehouse'));
  });

  it('runs the active BOQ estimate, validation, edit, line, budget and submission actions', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    window.confirm = jest.fn(() => true);
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/boq/boq-1' && init?.method !== 'PATCH') return response({ boq: { ...boq, category: '' }, revision, lines });
      if (url === '/api/boq/add-to-budget') return response({});
      if (url === '/api/boq/create-pr') return response({});
      return defaultFetch(url, init);
    });
    render(<BoqStudioPage />);
    expect(await screen.findByText('Vitrified tiles')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.generateAICost) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aICostGeneratedSuccessfullyToLocaleString, "", false))).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.viewLineItemCostBreakdown))[0]);
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.viewLineItemCostBreakdown))[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.validate) }));
    expect(await screen.findByText(/BOQ validation complete/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aCCEPT) })[0]);
    expect(await screen.findByText(/Accepted AI suggestion for line 1/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.rEJECT) })[0]);
    expect(await screen.findByText(/Retained original description for line 1/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aISupportToRefineThisLineSBOQDescription))[0]);
    expect(await screen.findByText(/Proposed description ready for line 1/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.eDIT) })[0]);
    const aiEditHeader = screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editLineItem, "", false)).parentElement!;
    fireEvent.click(aiEditHeader.querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.discard) }));
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aISupportToRefineThisLineSBOQDescription))[0]);
    expect(await screen.findByText(/Proposed description ready for line 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.applyDescription) }));
    expect(await screen.findByText(/Applied refined BOQ Description for line 1/)).toBeInTheDocument();
    const refineDefaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => url === '/api/boq/refine-ai'
      ? response({ lines: [{ aiSuggestedDescription: 'Fallback refined cable' }] })
      : refineDefaultFetch(url, init));
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aISupportToRefineThisLineSBOQDescription))[1]);
    expect(await screen.findByText(/Proposed description ready for line 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.showCategoryDistribution) }));
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical)).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.searchLineItems)), { target: { value: 'cable' } });
    expect(screen.queryByText('Vitrified tiles')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.searchLineItems)), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editBOQ) }));
    const editableRow = screen.getByDisplayValue('Vitrified tiles').closest('tr')!;
    Array.from(editableRow.querySelectorAll<HTMLInputElement>('input')).forEach((input, index) => {
      fireEvent.change(input, { target: { value: input.type === 'number' ? '21' : `updated-${index}` } });
    });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveChanges) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQUpdatedSuccessfully, "", false))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Add","toLocaleString":"Line"})) })[0]);
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.addNewBOQLine)).parentElement!.querySelector('button')!);
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Add","toLocaleString":"Line"})) })[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Add","toLocaleString":"Line"})) })[0]);
    const addLineForm = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aDDLINE) }).closest('form')!;
    Array.from(addLineForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')).forEach((field) => {
      const value = field instanceof HTMLSelectElement ? field.options[1]?.value || '' : field.type === 'number' ? '2' : 'New line detail';
      fireEvent.change(field, { target: { value } });
    });
    const addNumberFields = addLineForm.querySelectorAll<HTMLInputElement>('input[type="number"]');
    fireEvent.change(addNumberFields[addNumberFields.length - 1], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aDDLINE) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.lineItemAddedSuccessfully, "", false))).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editLineItem, "", false)).parentElement!.querySelector('button')!);
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    const editLineForm = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sAVECHANGES) }).closest('form')!;
    Array.from(editLineForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')).forEach((field) => {
      const value = field instanceof HTMLSelectElement ? field.options[1]?.value || '' : field.type === 'number' ? '3' : 'Updated line detail';
      fireEvent.change(field, { target: { value } });
    });
    const editNumberFields = editLineForm.querySelectorAll<HTMLInputElement>('input[type="number"]');
    fireEvent.change(editNumberFields[editNumberFields.length - 1], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sAVECHANGES) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.lineItemUpdatedSuccessfully, "", false))).toBeInTheDocument();
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    const deleteButtons = screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.deleteLine));
    fireEvent.click(deleteButtons[0]);
    expect(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.deleteLine))).toHaveLength(deleteButtons.length);
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.deleteLine))[0]);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.lineItemDeleted))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.addToBudget) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.confirmBudgetContribution)).parentElement?.parentElement?.textContent).toContain('Standard');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.addToBudget) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aDDTOBUDGET) }));
    expect(await screen.findByText(/Budget Contribution BTX-000001 recorded/)).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[4], { target: { value: 'PR' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.submitBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.submitBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sUBMITBOQ) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQSubmittedSuccessfully))).toBeInTheDocument();
  });

  it('covers existing template, standard upload/download and drawing review flows', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    render(<BoqStudioPage />);
    expect(await screen.findByText('Vitrified tiles')).toBeInTheDocument();

    const xlsx = new File(['Description,Qty'], 'boq.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('input[type="file"]')[0], { target: { files: [xlsx] } });
    expect(await screen.findByText(/BOQ uploaded successfully/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.dOWNLOADSTANDARDBOQ) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.standardBOQDownloadedSuccessfully, "", false))).toBeInTheDocument();
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1], { target: { files: [xlsx] } });
    expect(await screen.findByText(/Standard BOQ uploaded successfully/)).toBeInTheDocument();

    fireEvent.change(document.querySelector<HTMLInputElement>('#drawing-file-input')!, { target: { files: [new File(['drawing'], 'plan.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/Review Extracted BOQ Items/)).toBeInTheDocument();
    fireEvent.click(document.querySelector('div[style*="z-index: 1100"] > div > div > button')!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.reviewExtractedItems, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cancelReUpload) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.reviewExtractedItems, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Add","toLocaleString":"Item"})) }));
    const reviewRow = screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.markRef)).closest('table')!.querySelector('tbody tr')!;
    const reviewFields = Array.from(reviewRow.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'));
    fireEvent.change(reviewFields[0], { target: { value: 'D-02' } });
    fireEvent.change(reviewFields[1], { target: { value: 'Updated floor tiles' } });
    fireEvent.change(reviewFields[2], { target: { value: 'Porcelain finish' } });
    fireEvent.change(reviewFields[3], { target: { value: reviewFields[3] instanceof HTMLSelectElement ? reviewFields[3].options[0].value : '' } });
    fireEvent.change(reviewFields[4], { target: { value: 'Lobby' } });
    fireEvent.change(reviewFields[5], { target: { value: 'mtr' } });
    const reviewQuantities = screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.enterQty2));
    fireEvent.change(reviewQuantities[0], { target: { value: '' } });
    fireEvent.change(reviewQuantities[0], { target: { value: '4' } });
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.removeLine))[1]);
    fireEvent.click(screen.getByRole('button', { name: /Generate Draft BOQ/ }));
    expect(await screen.findByText(/Draft BOQ BOQ-1 .*generated from drawing/)).toBeInTheDocument();
  });

  it('reviews upload warnings and filters, refreshes, and opens existing BOQs', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/projects') return response({ data: [project] });
      if (url === '/api/masters/categories') return response({ data: [{ name: 'Custom Finish' }] });
      if (url === '/api/boq/upload-template') return response({
        totalLines: 2, validLines: 1, warningLines: 1,
        exceptions: [{ rowNumber: 4, description: 'Cable works', issue: 'Missing category', action: 'Mapped to Other' }],
      });
      return defaultFetch(url, init);
    });
    render(<BoqStudioPage />);
    expect(await screen.findByText('Vitrified tiles')).toBeInTheDocument();

    const xlsx = new File(['Description,Qty'], 'warning-boq.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('input[type="file"]')[0], { target: { files: [xlsx] } });
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.reviewWarnings) }));
    const warningHeading = screen.getByText('Import Warnings Review (1)');
    expect(screen.getByText('Missing category')).toBeInTheDocument();
    fireEvent.click(warningHeading.parentElement!.parentElement!.querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.reviewWarnings) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.closeReview) }));

    const filter = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.filterByCodeTitleCategory));
    fireEvent.change(filter, { target: { value: 'does-not-match' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.noBOQsFound))).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: 'BOQ-1' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.oPEN) }));
    expect(await screen.findByText('Copper cable')).toBeInTheDocument();
  });

  it('shows the complete existing BOQ list and navigates to its register', async () => {
    const recentBoqs = [boq, ...[2, 3, 4].map((index) => ({ ...boq, id: `boq-${index}`, boqCode: `BOQ-${index}`, title: `Package ${index}` }))];
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/boq' && init?.method !== 'POST') return response({ data: recentBoqs });
      return defaultFetch(url, init);
    });
    render(<BoqStudioPage />);
    fireEvent.click(await screen.findByRole('button', { name: /View All \(4\)/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/boq');
  });

  it('routes incomplete quantities from budget and PR confirmation into edit mode', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    const incompleteLines = [{ ...lines[0], quantity: null }, { ...lines[1], quantity: 0 }];
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/boq/boq-1') return response({ boq, revision, lines: incompleteLines });
      return defaultFetch(url, init);
    });
    render(<BoqStudioPage />);
    expect(await screen.findByText('Vitrified tiles')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.addToBudget) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.pendingQuantityCountBOQLineValue2RequireQuantityBeforeThisBOQCanBeAddedToBudget))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editQuantities) }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.exitEditMode) })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Add","toLocaleString":"Line"})) })[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));

    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQPurpose)).parentElement!.querySelector('select')!, { target: { value: 'PR' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.exitEditMode) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.submitBOQ) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.quantityRequiredForPendingQuantityCountItemValue2BeforeBOQSubmission))).toBeInTheDocument();
  });

  it('supports resetting the studio, creating method options, and editing all drawing review fields', async () => {
    queryParams = { projectId: 'project-1' };
    render(<BoqStudioPage />);
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQCreationStudio) })).toBeInTheDocument();

    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.project)).parentElement!.querySelector('select')!, { target: { value: 'project-1' } });
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.costCentre)).parentElement!.querySelector('select')!, { target: { value: 'cc-1' } });
    const sectorSelects = screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sectorProjectType)).parentElement!.querySelectorAll('select');
    fireEvent.change(sectorSelects[0], { target: { value: 'OFFICE' } });
    fireEvent.change(sectorSelects[1], { target: { value: 'Office Fitout' } });
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.areaSqft)).parentElement!.querySelector('input')!, { target: { value: '5000' } });
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQTitleName)).parentElement!.parentElement!.querySelector('input')!, { target: { value: 'Office refresh' } });
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.common.bOQDescription)).parentElement!.parentElement!.querySelector('textarea')!, { target: { value: 'Interior refresh package' } });
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQPurpose)).parentElement!.querySelector('select')!, { target: { value: 'PR' } });

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqPage.createNewBOQ, 'i') }));
    expect(screen.getByText(/Ready to create a new BOQ/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Ready to create a new BOQ/).parentElement!.parentElement!.querySelector('button')!);
    expect(screen.queryByText(/Ready to create a new BOQ/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copy1w28e12)).closest('div')!.parentElement!.parentElement!);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.dOWNLOADSTANDARDBOQ) })).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copyqn96kp)).closest('div')!.parentElement!.parentElement!);
    expect(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.drawingRefEGDWGA101))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.drawingRefEGDWGA101)), { target: { value: 'PLAN-2' } });
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copyuytobr)).closest('div')!.parentElement!.parentElement!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.dOWNLOADSIMPLEBOQTEMPLATE, "", false) }));
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copy1ev40o2)).closest('div')!.parentElement!.parentElement!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.uPLOADEXISTINGBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.uPLOADCOMPLETEDBOQ) }));
    fireEvent.click(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.drawingRefEGDWGA101)));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.configureLinesCount) }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cREATEMANUALBOQ) })).toBeInTheDocument();
  });

  it('restores an active BOQ from fallback response envelopes and handles sparse master data', async () => {
    queryParams = {};
    localStorage.setItem('procpx_active_boq_id', 'boq-1');
    const recoveredProject = { ...project, id: 'project-2', name: 'West Hub', areaSqFt: 0 };
    const recoveredBoq = { ...boq, title: '', projectId: 'project-2', costCentreId: 'cc-45', status: 'APPROVED' };
    const recoveredLines = [
      { id: 'material', lineNumber: '1', originalDescription: 'Material item', category: 'Materials', quantity: 0, aiUnitCost: 25, aiTotalCost: null },
      { id: 'interior', lineNumber: '2', originalDescription: 'Interior item', category: { name: 'Interior' }, quantity: 2, aiUnitCost: 10, aiTotalCost: 20 },
      { id: 'other', lineNumber: '3', originalDescription: 'Unclassified item', category: 'Miscellaneous', quantity: 1, aiUnitCost: 5, aiTotalCost: 5 },
    ];
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/masters/categories') return response({ data: [] });
      if (url === '/api/projects') return response([recoveredProject]);
      if (url === '/api/boq' && init?.method !== 'POST') return response([recoveredBoq]);
      if (url.startsWith('/api/cost-centres?projectId=project-2')) return response([
        { ...costCentre, id: 'cc-45', code: 'CC45', projectId: 'project-2', areaSqFt: 0 },
        { ...costCentre, id: 'cc-second', code: 'CC-SECOND', projectId: 'project-2' },
      ]);
      if (url === '/api/boq/boq-1') return response({ data: { boq: recoveredBoq, revision, lines: recoveredLines } });
      return defaultFetch(url, init);
    });

    render(<BoqStudioPage />);

    expect(await screen.findAllByText('Material item')).toHaveLength(2);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editBOQ) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editBOQ) }));
    expect(screen.getByText(/Approved BOQ revisions are locked/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.toggleProjectAreaAndScopeDetails)));
    expect(screen.getByText('West Hub')).toBeInTheDocument();
  });

  it('renders a sparse active BOQ with quantity, cost breakdown, metadata, and editor fallbacks', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    const sparseBoq = { id: 'boq-1', boqCode: 'BOQ-SPARSE', title: '', projectId: 'project-1', costCentreId: 'cc-missing', purpose: 'PR', status: '', category: '' };
    const sparseLines = [
      { id: 'line-empty', lineNumber: null, originalDescription: 'Bare item', standardDescription: '', specification: '', quantity: null, uomRaw: '', aiUnitCost: null, aiTotalCost: null, category: null, validationStatus: 'QUANTITY_REQUIRED' },
      { id: 'line-zero', originalDescription: 'Zero quantity item', standardDescription: '', specification: '', quantity: 0, uomRaw: '', aiUnitCost: 0, aiTotalCost: null, category: 'Unclassified', validationStatus: 'ERROR' },
      { id: 'line-zero-cost', lineNumber: 3, originalDescription: 'Priced item without quantity', standardDescription: 'Priced item', specification: 'Commercial', quantity: 0, uomRaw: 'EA', aiUnitCost: 10, aiTotalCost: null, category: 'Material' },
      { id: 'line-material', lineNumber: 4, originalDescription: 'Pipe works', standardDescription: 'Steel pipe', specification: 'Heavy duty', quantity: 2, uom: { code: 'MTR' }, aiUnitCost: 25, aiTotalCost: null, category: { name: 'Material' } },
      { id: 'line-civil', lineNumber: 5, originalDescription: 'Floor works', standardDescription: 'Floor tiles', specification: 'Porcelain', quantity: 1, uomRaw: 'SQFT', aiUnitCost: 20, aiTotalCost: 20, category: 'Civil', validationStatus: 'COST GENERATED' },
      { id: 'line-electrical', lineNumber: 6, originalDescription: 'Cable works', standardDescription: 'Power cable', specification: 'FRLS', quantity: 1, uomRaw: 'MTR', aiUnitCost: 10, aiTotalCost: 10, category: 'Electrical' },
      { id: 'line-blank-description', originalDescription: '', standardDescription: '', specification: '', quantity: 1, uomRaw: 'EA', aiUnitCost: 5, aiTotalCost: 5, category: '' },
      { lineNumber: null, standardDescription: '', specification: '', quantity: null, uomRaw: '', aiUnitCost: 15, aiTotalCost: null, category: null },
    ];
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/projects') return response([]);
      if (url === '/api/masters/categories') return response([]);
      if (url === '/api/boq' && init?.method !== 'POST') return response({ data: [sparseBoq] });
      if (url.startsWith('/api/cost-centres?projectId=project-1')) return response([]);
      if (url === '/api/boq/boq-1') return response({ data: { boq: sparseBoq, revision: { id: 'revision-1', revisionCode: '' }, lines: sparseLines } });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BoqStudioPage />);
    expect(await screen.findAllByText('BOQ-SPARSE')).toHaveLength(4);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.standard)).length).toBeGreaterThan(0);
    expect(screen.getByText(UI_STRINGS.componentsUiStatusBadge.draft)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.enterQty)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Zero quantity item')[0].closest('tr')?.textContent).toContain('0 (');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sPECIFICATIONREQUIRED))).toBeInTheDocument();
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.areaSqft)).parentElement!.querySelector('input')!, { target: { value: '' } });

    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.toggleProjectAreaAndScopeDetails)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.project, '', true))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQSubmissionProcurement))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.areaRequired))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.validationErrorLinesValidationIssues, "", false))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.submitBOQ) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.quantityRequiredForPendingQuantityCountItemValue2BeforeBOQSubmission))).toBeInTheDocument();
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQPurpose)).parentElement!.querySelector('select')!, { target: { value: 'BUDGET' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.addToBudget) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.pendingQuantityCountBOQLineValue2RequireQuantityBeforeThisBOQCanBeAddedToBudget))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.showCategoryDistribution) }));
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppBoqUploadPageConstants.material)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.viewLineItemCostBreakdown))[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aICostBreakdown, "", false))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.quantityRequired)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.viewLineItemCostBreakdown))[0]);
    const breakdownButtons = screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.viewLineItemCostBreakdown));
    fireEvent.click(breakdownButtons[breakdownButtons.length - 1]);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aICostBreakdown, "", false)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editLineItem, "", false))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.standardDescription)).parentElement!.querySelector('input')).toHaveValue('Bare item');
    const editorDescriptionLabel = screen.getAllByText(uiStringPattern(UI_STRINGS.common.bOQDescription)).find((node) => node.tagName === 'LABEL' && node.parentElement?.querySelector('textarea'))!;
    expect(editorDescriptionLabel.parentElement!.querySelector('textarea')).toHaveValue('');
    expect(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.enterQty))).toHaveValue(null);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.enterQty)), { target: { value: '' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.uOM2)).parentElement!.querySelector('input')).toHaveValue('NOS');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[6]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.standardDescription)).parentElement!.querySelector('input')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));

    const boqSearch = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.filterByCodeTitleCategory));
    fireEvent.change(boqSearch, { target: { value: 'no-matching-record' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.noBOQsFound))).toBeInTheDocument();
    fireEvent.change(boqSearch, { target: { value: 'boq-sparse' } });
    expect(screen.getAllByText('BOQ-SPARSE').length).toBeGreaterThan(0);
  });

  it('creates an empty BOQ from raw master responses and exercises safe action defaults', async () => {
    queryParams = {};
    const edgeProject = { ...project, id: 'project-edge', name: 'West Hub', sector: 'UNKNOWN', projectType: '', areaSqFt: 0 };
    const edgeBoq = { ...boq, id: 'boq-edge', boqCode: 'BOQ-EDGE', title: '', category: '', projectId: 'project-edge', costCentreId: '', project: edgeProject, costCentre: null };
    const edgeLines = [
      { id: 'edge-unestimated', lineNumber: 1, originalDescription: 'Unestimated line', standardDescription: 'Unestimated line', quantity: 1, uomRaw: 'EA', aiUnitCost: null, aiTotalCost: null, category: 'Other' },
      { id: 'edge-estimated', lineNumber: 2, originalDescription: 'Estimated line', standardDescription: 'Estimated line', quantity: 1, uomRaw: 'EA', aiUnitCost: 10, aiTotalCost: 10, category: 'Other' },
    ];
    let detailLoads = 0;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/masters/categories') return response([]);
      if (url === '/api/projects') return response([edgeProject]);
      if (url === '/api/boq' && init?.method === 'POST') return response({ boq: { ...edgeBoq, latestRevision: revision } });
      if (url === '/api/boq') return response([]);
      if (url.startsWith('/api/cost-centres?')) throw new Error('Cost centres unavailable');
      if (url === '/api/boq/manual') return response({});
      if (url === '/api/boq/boq-edge' && init?.method === 'PATCH') return response({});
      if (url === '/api/boq/boq-edge') {
        detailLoads += 1;
        return response({ boq: edgeBoq, revision, lines: detailLoads === 1 ? [] : edgeLines });
      }
      if (url === '/api/boq/estimate-cost') return response({ data: { categoryBreakdown: { Other: 0 }, totalCost: 0, unestimatedItems: [] } });
      if (url === '/api/boq/add-to-budget') return response({ alreadySubmitted: true });
      if (url === '/api/boq/create-pr') return response({});
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BoqStudioPage />);
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQCreationStudio) })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copy1slme3c)), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cREATEMANUALBOQ) }));
    expect(await screen.findByText(/Manual BOQ BOQ-EDGE updated with 2 lines/)).toBeInTheDocument();
    const createRequest = mockFetch.mock.calls.find(([url, init]) => url === '/api/boq' && (init as RequestInit)?.method === 'POST');
    expect(JSON.parse(String(createRequest?.[1]?.body))).toEqual(expect.objectContaining({ projectId: 'project-edge', areaSqFt: 10000 }));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sAVETARGETPARAMETERS) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.targetParametersSavedSuccessfully))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.generateAICost) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aICostGeneratedSuccessfullyToLocaleString, "", false))).toBeInTheDocument();
    const estimateRequest = mockFetch.mock.calls.find(([url]) => url === '/api/boq/estimate-cost');
    expect(JSON.parse(String(estimateRequest?.[1]?.body))).toEqual(expect.objectContaining({ lineIds: ['edge-unestimated'] }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.addToBudget) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.confirmBudgetContribution))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.confirmBudgetContribution)).parentElement?.parentElement?.textContent).toContain('Standard');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aDDTOBUDGET) }));
    expect(await screen.findByText(/is already recorded with status Under Approval/)).toBeInTheDocument();

    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQPurpose)).parentElement!.querySelector('select')!, { target: { value: 'PR' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.submitBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sUBMITBOQ) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQSubmittedSuccessfully))).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalledWith(UI_STRINGS.common.bOQSubmittedSuccessfully, 'BOQ-EDGE', UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover);
    errorSpy.mockRestore();
  });

  it('surfaces API failures across BOQ, import, edit, cost, and submission actions', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    window.confirm = jest.fn(() => true);
    let refineFails = true;
    let parameterTransportFails = false;
    let lineTransportFails = false;
    let deleteTransportFails = false;
    let blankSubmissionTransportFails = false;
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/boq/boq-1' && init?.method === 'PATCH') {
        if (parameterTransportFails) throw new Error('');
        return response({}, false);
      }
      if (url === '/api/boq/refine-ai') return refineFails ? response({}, false) : defaultFetch(url, init);
      if (url === '/api/boq/estimate-cost') return response({ error: 'Estimate rejected' }, false);
      if (url === '/api/boq/revision-1/validate') return response({ error: 'Validation rejected' }, false);
      if (url.startsWith('/api/boq/revision-1/lines?') && init?.method === 'DELETE' && deleteTransportFails) throw new Error('Delete transport failed');
      if (url === '/api/boq/revision-1/lines' && init?.method === 'PUT' && lineTransportFails) throw new Error('Line transport failed');
      if (url === '/api/boq/revision-1/lines' && ['PUT', 'POST'].includes(init?.method || '')) return response({}, false);
      if (url === '/api/boq/add-to-budget') return response({}, false);
      if (url === '/api/boq/create-pr') {
        if (blankSubmissionTransportFails) {
          blankSubmissionTransportFails = false;
          throw new Error('');
        }
        return response({}, false);
      }
      if (url === '/api/boq/upload-template' && init?.method === 'POST') return response({}, false);
      if (url === '/api/boq/standard/upload-validate') return response({}, false);
      if (url.startsWith('/api/boq/standard/download?')) return response({ error: 'Download rejected' }, false);
      if (url === '/api/boq/drawing-extract') return response({}, false);
      if (url === '/api/boq/manual') return response({}, false);
      return defaultFetch(url, init);
    });
    render(<BoqStudioPage />);
    expect(await screen.findByText('Vitrified tiles')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sAVETARGETPARAMETERS) }));
    expect(await screen.findByText(/Error saving parameters: Failed to save parameters/)).toBeInTheDocument();
    parameterTransportFails = true;
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sAVETARGETPARAMETERS) }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.errorSavingParameters));
    parameterTransportFails = false;
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.generateAICost) }));
    expect(await screen.findByText(/Cost Generation Error: AI Cost Estimation failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.validate) }));
    expect(await screen.findByText(/Validation Error: Validation failed/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aISupportToRefineThisLineSBOQDescription))[0]);
    expect(await screen.findByText(/AI Refine Error: Failed to refine line description/)).toBeInTheDocument();
    refineFails = false;
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aISupportToRefineThisLineSBOQDescription))[0]);
    expect(await screen.findByText(/Proposed description ready/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.applyDescription) }));
    expect(await screen.findByText(/Error: Failed to apply description/)).toBeInTheDocument();
    lineTransportFails = true;
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aCCEPT) })[0]);
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.errorMessage, {"message":"Line transport failed"})))).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.rEJECT) })[0]);
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.errorMessage, {"message":"Line transport failed"})))).toBeInTheDocument();
    lineTransportFails = false;

    deleteTransportFails = true;
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.deleteLine))[0]);
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.errorMessage, {"message":"Delete transport failed"})))).toBeInTheDocument();
    deleteTransportFails = false;

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.editBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveChanges) }));
    expect(await screen.findByText(/Error: Failed to save changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.exitEditMode) }));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Add","toLocaleString":"Line"})) })[0]);
    const addForm = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aDDLINE) }).closest('form')!;
    Array.from(addForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')).forEach((field) => {
      fireEvent.change(field, { target: { value: field instanceof HTMLSelectElement ? field.options[1]?.value || 'Civil & Interior' : field.type === 'number' ? '1' : 'Error-path item' } });
    });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aDDLINE) }));
    expect(await screen.findByText(/Error: Failed to add line/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) })[0]);

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.editLine))[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sAVECHANGES) }));
    expect(await screen.findByText(/Error: Failed to save changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cANCEL) }));

    const xlsx = new File(['description'], 'error.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('input[type="file"]')[0], { target: { files: [xlsx] } });
    expect(await screen.findByText(/Upload Error: Failed to upload existing BOQ/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.dOWNLOADSTANDARDBOQ) }));
    expect(await screen.findByText(/Download Error: Failed to generate standard BOQ download/)).toBeInTheDocument();
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1], { target: { files: [xlsx] } });
    expect(await screen.findByText(/Upload Error: Failed to validate uploaded file/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copyqn96kp)).closest('div')!.parentElement!.parentElement!);
    fireEvent.change(document.querySelector<HTMLInputElement>('#drawing-file-input')!, { target: { files: [new File(['drawing'], 'plan.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/Drawing Extraction Error: Drawing extraction failed/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copyuytobr)).closest('div')!.parentElement!.parentElement!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.cREATEMANUALBOQ) }));
    expect(await screen.findByText(/Error: Failed to save manual lines/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.addToBudget) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.aDDTOBUDGET) }));
    expect(await screen.findByText(/Error adding to budget: Failed to add to budget/)).toBeInTheDocument();
    fireEvent.change(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQPurpose)).parentElement!.querySelector('select')!, { target: { value: 'PR' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.submitBOQ) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sUBMITBOQ) }));
    expect(await screen.findByText(/Error submitting BOQ: Failed to submit BOQ/)).toBeInTheDocument();
    blankSubmissionTransportFails = true;
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.sUBMITBOQ) }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.errorSubmittingBoq));
  });

  it('falls back to the template parser and reports standard BOQ quantity warnings', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    let pendingQuantities = false;
    let noFallbackRows = false;
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/boq/standard/upload-validate') {
        return pendingQuantities
          ? response({ validLines: [{ description: 'Imported cable', quantity: null }], pendingQuantityCount: 1, validQuantityCount: 0, validRows: 1, issues: [{ rowNumber: 2, issue: 'Quantity required' }] })
          : response(noFallbackRows ? {} : { validLines: [], pendingQuantityCount: 0, validRows: 0, issues: [] });
      }
      if (url === '/api/boq/standard/generate') return response({ totalLines: 1, warningLines: 1 });
      if (url === '/api/boq/upload-template' && init?.method === 'POST') {
        return response(noFallbackRows ? {} : { totalLines: 2, validLines: 2, warningLines: 1, exceptions: [{ rowNumber: 3, issue: 'Missing unit' }] });
      }
      return defaultFetch(url, init);
    });
    render(<BoqStudioPage />);
    expect(await screen.findByText('Vitrified tiles')).toBeInTheDocument();
    const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    const workbook = new File(['description'], 'standard.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(input, { target: { files: [workbook] } });
    expect(await screen.findByText(/BOQ uploaded successfully.*2 line items imported/)).toBeInTheDocument();

    pendingQuantities = true;
    fireEvent.change(input, { target: { files: [workbook] } });
    expect(await screen.findByText(/1 items require quantity/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.reviewWarnings) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.quantityRequired))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.closeReview) }));
    pendingQuantities = false;
    noFallbackRows = true;
    fireEvent.change(input, { target: { files: [workbook] } });
    expect(await screen.findByText(/does not contain any recognizable item rows/)).toBeInTheDocument();
  });

  it('validates drawing review rows and handles draft generation failure before retry', async () => {
    queryParams = { projectId: 'project-1', boqId: 'boq-1' };
    let generationFails = true;
    const defaultFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/projects') return response([]);
      if (url === '/api/boq/drawing-extract' && typeof init?.body !== 'string') {
        return response({ drawingNumber: '', fileName: 'plan.pdf', parserUsed: 'NATIVE_PDF_SCHEDULE', providerMessage: 'Local schedule parser completed.', items: [{ description: 'Extracted floor', specification: 'Tile finish', quantity: 2 }], totalDetected: 1 });
      }
      if (url === '/api/boq/drawing-extract' && typeof init?.body === 'string') {
        return generationFails ? response({}, false) : response({ boqId: 'boq-1', boqCode: 'BOQ-1', revisionCode: 'R2', totalLines: 1 });
      }
      return defaultFetch(url, init);
    });
    render(<BoqStudioPage />);
    expect(await screen.findByText('Vitrified tiles')).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copyqn96kp)).closest('div')!.parentElement!.parentElement!);
    fireEvent.change(document.querySelector<HTMLInputElement>('#drawing-file-input')!, { target: { files: [new File(['drawing'], 'plan.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => url === '/api/boq/drawing-extract')).toBe(true));
    expect(await screen.findByText(/Review Extracted BOQ Items/)).toBeInTheDocument();

    const descriptionInput = screen.getByDisplayValue('Extracted floor');
    const quantityInput = descriptionInput.closest('tr')!.querySelector<HTMLInputElement>('input[type="number"]')!;
    fireEvent.change(quantityInput, { target: { value: '' } });
    fireEvent.change(descriptionInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Draft BOQ/ }));
    expect(mockToast.error).toHaveBeenCalledWith(interpolateUiString(UI_STRINGS.common.userMessages.lineIsMissingAnItemDescription, {"lineNumber":"1"}));

    fireEvent.change(descriptionInput, { target: { value: 'Restored floor description' } });
    fireEvent.change(quantityInput, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Draft BOQ/ }));
    expect(await screen.findByText(/Error generating BOQ: Failed to generate Draft BOQ/)).toBeInTheDocument();
    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.boqGenerationFailedPleaseTryAgain);

    generationFails = false;
    fireEvent.click(screen.getByRole('button', { name: /Generate Draft BOQ/ }));
    expect(await screen.findByText(/Draft BOQ BOQ-1 .*generated from drawing/)).toBeInTheDocument();
  });

  it('requires a project for drawing extraction and handles BOQ refresh failures', async () => {
    queryParams = {};
    let refreshFails = false;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/projects' || url === '/api/masters/categories') return response([]);
      if (url === '/api/boq') return refreshFails ? Promise.reject(new Error('Refresh unavailable')) : response([]);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BoqStudioPage />);
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQCreationStudio) })).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.copyqn96kp)).closest('div')!.parentElement!.parentElement!);
    fireEvent.change(document.querySelector<HTMLInputElement>('#drawing-file-input')!, { target: { files: [new File(['drawing'], 'unassigned.pdf', { type: 'application/pdf' })] } });
    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.pleaseSelectOrConfigureATargetProjectFirst);
    expect(mockFetch).not.toHaveBeenCalledWith('/api/boq/drawing-extract', expect.anything());

    refreshFails = true;
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh, "", false) }));
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(expect.any(Error)));
    errorSpy.mockRestore();
  });

  it('keeps the studio mounted when initial project loading fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/projects') throw new Error('Projects unavailable');
      if (url === '/api/boq' || url === '/api/masters/categories') return response([]);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BoqStudioPage />);
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.bOQCreationStudio) })).toBeInTheDocument();
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Error loading initial data:', expect.any(Error)));
    errorSpy.mockRestore();
  });
});
