/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as XLSX from 'xlsx';
import InitiateRateCardWorkspace from '../src/components/rate-cards/InitiateRateCardWorkspace';
import { reportHandledClientFailure } from '../src/lib/observability/client-reporter';

jest.mock('../src/lib/observability/client-reporter', () => ({
  reportHandledClientFailure: jest.fn(),
}));

jest.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: jest.fn(() => ({})),
    book_new: jest.fn(() => ({})),
    book_append_sheet: jest.fn(),
    json_to_sheet: jest.fn(() => ({})),
    sheet_to_json: jest.fn(() => []),
  },
  read: jest.fn(() => ({ SheetNames: ['Rate_Lines'], Sheets: { Rate_Lines: {} } })),
  writeFile: jest.fn(),
}));

function makeWorkbook(rows: Record<string, unknown>[]) {
  (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValueOnce(rows);
  return new File(['test workbook'], 'rate-lines.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function openRateLines() {
  fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToRateLines, "i", false) }));
  expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.step2RateLines, "", false))).toBeInTheDocument();
}

async function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview, "", false))).toBeInTheDocument();
}

const VENDOR_CRAFTLINE = { id: 'vendor-craftline', name: 'CraftLine Interior', code: 'VND-0003' };
const VENDOR_ZENITH = { id: 'vendor-zenith', name: 'Zenith Electrical', code: 'VND-0004' };
const VENDOR_BLACKLISTED = { id: 'vendor-blocked', name: 'Blocked Vendor', code: 'VND-0099', isBlacklisted: true };
const CATEGORY_CIVIL = { id: 'cat-civil', name: 'Civil & Interior', parentId: null };
const CATEGORY_ELECTRICAL = { id: 'cat-electrical', name: 'Electrical', parentId: null };
const SUBCATEGORY_FLOORING = { id: 'cat-flooring', name: 'Flooring', parentId: 'cat-civil' };
const VENDOR_WITHOUT_ID = { name: 'Unsaved Vendor', code: 'VND-NEW' };
const CATEGORY_WITHOUT_NAME = { id: 'cat-unnamed', parentId: null };

const vendorLabel = (vendor: { name: string; code: string }) =>
  interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.vendorOptionLabel, vendor);

const originalFetch = global.fetch;
const mockFetch = jest.fn();
const reply = (body: unknown) => ({ ok: true, json: async () => body });
function mockMasters(vendors: unknown = { vendors: [VENDOR_CRAFTLINE, VENDOR_ZENITH, VENDOR_BLACKLISTED, VENDOR_WITHOUT_ID] },
  categories: unknown = [CATEGORY_CIVIL, CATEGORY_ELECTRICAL, SUBCATEGORY_FLOORING, CATEGORY_WITHOUT_NAME]) {
  mockFetch.mockImplementation(async (url: string) => (url.startsWith('/api/procurement/vendors') ? reply(vendors) : reply(categories)));
}

async function chooseVendorAndCategory(vendor = VENDOR_CRAFTLINE, category = CATEGORY_CIVIL.name) {
  const vendorSelect = screen.getByRole('combobox', { name: uiStringPattern(UI_STRINGS.common.contractingVendor) });
  await screen.findByRole('option', { name: vendorLabel(vendor) });
  fireEvent.change(vendorSelect, { target: { value: vendor.id } });
  fireEvent.change(screen.getByRole('combobox', { name: uiStringPattern(UI_STRINGS.common.category2) }), { target: { value: category } });
}

describe('rate card initiation workspace', () => {
  const onBack = jest.fn();
  const onSubmit = jest.fn();

  afterAll(() => { global.fetch = originalFetch; });

  beforeEach(() => {
    localStorage.clear();
    onBack.mockReset();
    onSubmit.mockReset();
    mockFetch.mockReset();
    mockMasters();
    global.fetch = mockFetch as typeof fetch;
    (reportHandledClientFailure as jest.Mock).mockClear();
    (XLSX.read as jest.Mock).mockReset().mockReturnValue({ SheetNames: ['Rate_Lines'], Sheets: { Rate_Lines: {} } });
    (XLSX.utils.sheet_to_json as jest.Mock).mockReset().mockReturnValue([]);
    (XLSX.writeFile as jest.Mock).mockReset();
  });

  it('recovers the saved form, edits a line, adds/removes rows, downloads a template, and reviews a draft', async () => {
    const savedItem = {
      id: 'saved', itemCode: 'SAVE-1', category: 'Civil', subcategory: 'General',
      description: 'Saved line', specification: 'Saved specification', uom: 'EA', qty: 3,
      aiRate: null, aiCost: null, previousPpoRate: null, previousPpoAmount: null, targetRate: 10, targetAmount: 30,
    };
    localStorage.setItem('procpx_rate_card_initiate_draft', JSON.stringify({
      form: { title: 'Recovered card', vendor: 'Saved vendor', vendorId: 'saved-vendor', category: 'Civil', subcategory: '', location: '', effectiveFrom: '', validUntil: '', scope: '', commercialTerms: '' },
      items: [savedItem],
    }));
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);

    expect(screen.getByDisplayValue('Recovered card')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGRetailStoreInteriorWorksFY202627)), { target: { value: 'Recovered card' } });
    await chooseVendorAndCategory(VENDOR_ZENITH, CATEGORY_ELECTRICAL.name);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGRetailTurnkeyFitouts)), { target: { value: 'Retail' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGAllIndiaOrRegionalHubs)), { target: { value: 'West' } });
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: '2026-01-01' } });
    fireEvent.change(dates[1], { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.detailedScopeOfSupplyAndExecution)), { target: { value: 'Retail interiors' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.pricingTermsTaxesPaymentConditionsEscalationClauses)), { target: { value: 'Net 30' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await openRateLines();
    expect(await screen.findByText('SAVE-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.copy1dqkxxq, "", false) }));
    expect(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGRetailStoreInteriorWorksFY202627))).toHaveValue('Recovered card');
    await openRateLines();
    expect(screen.getByText('1 items')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /SAVE-1/ });
    const numericInputs = within(row).getAllByRole('spinbutton');
    fireEvent.change(numericInputs[0], { target: { value: '-4' } });
    fireEvent.change(numericInputs[1], { target: { value: '12.5' } });
    expect(numericInputs[0]).toHaveValue(0);
    expect(numericInputs[1]).toHaveValue(12.5);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.addItemLine) }));
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(await screen.findByText(/Added new line/)).toBeInTheDocument();
    const toast = screen.getByText(/Added new line/).parentElement?.parentElement;
    fireEvent.click(toast?.querySelector('button') as HTMLButtonElement);
    const deleteButtons = screen.getAllByTitle(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.deleteItemLine));
    fireEvent.click(deleteButtons[1]);
    expect(screen.getByText('1 items')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.deleteItemLine)));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.atLeastOneRateLineIsRequired))).toBeInTheDocument();
    const errorToast = screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.atLeastOneRateLineIsRequired)).parentElement?.parentElement;
    fireEvent.click(errorToast?.querySelector('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.addItemLine) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.downloadExcelTemplate) }));
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.templateDownloadedFilename, "", false))).toBeInTheDocument();
    (XLSX.writeFile as jest.Mock).mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.downloadExcelTemplate) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.failedToGenerateExcelDownload))).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'export_rate_card_template',
        fallback: 'show_template_download_error',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToReviewInitiate) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.step3ReviewInitiate))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.initialTargetBaseline, "", false))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveAsDraft) }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recovered card', status: 'DRAFT', items: expect.any(Array) }));
    expect(localStorage.getItem('procpx_rate_card_initiate_draft')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousRateLines) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToReviewInitiate) }));
    const initiate = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.initiateRateCardSendToVendor, "", false) });
    expect(initiate).toBeEnabled();
    fireEvent.click(initiate);
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
      title: 'Recovered card', status: 'ROUND_1_BUYER_OFFER',
      vendorId: VENDOR_ZENITH.id, vendor: vendorLabel(VENDOR_ZENITH), category: CATEGORY_ELECTRICAL.name,
    }));
  });

  it('validates required details and line rules before enabling initiation', async () => {
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGRetailStoreInteriorWorksFY202627)), { target: { value: '   ' } });
    await openRateLines();
    const firstRow = screen.getByRole('row', { name: /INT-001/ });
    fireEvent.change(within(firstRow).getAllByRole('spinbutton')[1], { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToReviewInitiate) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.step3ReviewInitiate))).toBeInTheDocument();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText(/item\(s\) have invalid target rate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.initiateRateCardSendToVendor, "", false) })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousRateLines) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.step2RateLines, "", false))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousBasicDetails) }));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGRetailStoreInteriorWorksFY202627)), { target: { value: 'Valid rate card' } });
    await chooseVendorAndCategory();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToRateLines, "", false) }));
    const first = screen.getByRole('row', { name: /INT-001/ });
    fireEvent.change(within(first).getAllByRole('spinbutton')[1], { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToReviewInitiate) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.validationPassedReadyToInitiate))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.initiateRateCardSendToVendor, "", false) }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Valid rate card', status: 'ROUND_1_BUYER_OFFER', vendorId: VENDOR_CRAFTLINE.id, category: CATEGORY_CIVIL.name,
    }));
  });

  it('lists only the tenant vendors and top-level master categories loaded from the server', async () => {
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    expect(screen.getByRole('option', { name: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.loadingVendors })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: vendorLabel(VENDOR_CRAFTLINE) })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: vendorLabel(VENDOR_ZENITH) })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: vendorLabel(VENDOR_BLACKLISTED) })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: CATEGORY_CIVIL.name })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: SUBCATEGORY_FLOORING.name })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.selectVendor })).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors?status=ACTIVE&pageSize=100');
    expect(mockFetch).toHaveBeenCalledWith('/api/masters/categories');

    const vendorSelect = screen.getByRole('combobox', { name: uiStringPattern(UI_STRINGS.common.contractingVendor) });
    fireEvent.change(vendorSelect, { target: { value: VENDOR_ZENITH.id } });
    expect(vendorSelect).toHaveValue(VENDOR_ZENITH.id);
    fireEvent.change(vendorSelect, { target: { value: '' } });
    expect(vendorSelect).toHaveValue('');
  });

  it('defaults the validity window to one year from today', () => {
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    const [from, until] = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    const start = new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    expect(from.value).toBe(start.toISOString().split('T')[0]);
    expect(until.value).toBe(end.toISOString().split('T')[0]);
  });

  it('keeps a restored vendor and category that are no longer in the master lists', async () => {
    localStorage.setItem('procpx_rate_card_initiate_draft', JSON.stringify({
      form: { title: 'Old draft', vendor: 'Retired Vendor (VND-0042)', vendorId: 'vendor-retired', category: 'Retired Category', subcategory: '', location: '', effectiveFrom: '2026-01-01', validUntil: '2026-12-31', scope: '', commercialTerms: '' },
      items: [],
    }));
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    await screen.findByRole('option', { name: vendorLabel(VENDOR_CRAFTLINE) });
    expect(screen.getByRole('combobox', { name: uiStringPattern(UI_STRINGS.common.contractingVendor) })).toHaveValue('vendor-retired');
    expect(screen.getByRole('option', { name: 'Retired Vendor (VND-0042)' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: uiStringPattern(UI_STRINGS.common.category2) })).toHaveValue('Retired Category');
  });

  it('shows the vendor id for a restored vendor without a stored label', async () => {
    localStorage.setItem('procpx_rate_card_initiate_draft', JSON.stringify({
      form: { title: 'Id only', vendor: '', vendorId: 'vendor-id-only', category: '', subcategory: '', location: '', effectiveFrom: '', validUntil: '', scope: '', commercialTerms: '' },
      items: [],
    }));
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    expect(await screen.findByRole('option', { name: 'vendor-id-only' })).toBeInTheDocument();
  });

  it('falls back to empty lists for unexpected master responses', async () => {
    mockMasters({ vendors: 'not-a-list' }, { error: 'unavailable' });
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    expect(await screen.findByRole('option', { name: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.selectVendor })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: uiStringPattern(UI_STRINGS.common.contractingVendor) })[0].querySelectorAll('option')).toHaveLength(1);
  });

  it('reports a failed master load and still lets the user continue', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    expect(await screen.findByRole('option', { name: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.selectVendor })).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'load_rate_card_vendor_and_category_masters', fallback: 'keep_selected_vendor_and_category' }),
    );
  });

  it('ignores master responses that arrive after the workspace closes', async () => {
    let releaseVendors: (value: unknown) => void = () => undefined;
    mockFetch.mockImplementation((url: string) => (url.startsWith('/api/procurement/vendors')
      ? new Promise((resolve) => { releaseVendors = resolve; })
      : Promise.resolve(reply([CATEGORY_CIVIL]))));
    const { unmount } = render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    unmount();
    releaseVendors(reply({ vendors: [VENDOR_CRAFTLINE] }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('option', { name: vendorLabel(VENDOR_CRAFTLINE) })).not.toBeInTheDocument();
  });

  it('previews workbook changes, flags invalid and missing rows, and applies valid updates', async () => {
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    await openRateLines();
    await uploadFile(makeWorkbook([
      { 'Item Code': 'INT-001', 'Target Rate': '145' },
      { 'Item Code': 'INT-001', 'Target Rate': '150' },
      { 'Item Code': 'UNKNOWN', 'Target Rate': '0' },
      { 'Item Code': 'INT-002', 'Target Rate': '0' },
      { 'Item Code': '', 'Target Rate': '10' },
    ]));
    expect(screen.getByText(/not in workbook/)).toBeInTheDocument();
    expect(document.querySelector('[title*="Duplicate Item Code"]')).toBeInTheDocument();
    expect(document.querySelector('[title*="must be greater than zero"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges) })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview, "", false))).not.toBeInTheDocument();

    await uploadFile(makeWorkbook([
      { 'Item Code': 'INT-001', 'Target Rate': '150' },
      { 'Item Code': 'INT-002', 'Target Rate': '100' },
    ]));
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.copyf9vgt1), { selector: 'span' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges) })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges) }));
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview, "", false))).not.toBeInTheDocument());
    expect(await screen.findByText(/Updated \d+ rate line\(s\) from Excel/)).toBeInTheDocument();
  });

  it('handles empty sheets and parse errors without changing draft lines', async () => {
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    await openRateLines();
    await uploadFile(makeWorkbook([]));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.workbookContainsNoDataRows))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges) })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));

    const read = XLSX.read as jest.Mock;
    read.mockImplementationOnce(() => { throw new Error('bad workbook'); });
    await uploadFile(new File(['broken'], 'broken.xlsx'));
    expect(read).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.failedToParseFileMessage, {"message":"bad workbook"})))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
  });

  it('uses fallback workbook headers and sheets and previews positive, negative, and unchanged rates', async () => {
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    await openRateLines();
    (XLSX.read as jest.Mock).mockReturnValueOnce({ SheetNames: ['Rates'], Sheets: { Rates: {} } });
    await uploadFile(makeWorkbook([
      { itemCode: 'INT-001', 'Target Rate per Unit': '125' },
      { ItemCode: 'INT-002', 'Target Rate per Unit (₹)': '90' },
      { 'ITEM CODE': 'INT-003', 'Target Rate per Unit (₹) [EDITABLE]': '350' },
      { 'Item Code': 'INT-004', 'Target Rate (₹)': '460' },
      { 'Item Code': 'INT-005', 'TARGET RATE': '80' },
    ]));

    expect(screen.getByText(/\+5\.00/)).toBeInTheDocument();
    expect(screen.getByText(/-5\.00/)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.unchanged)).length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges) })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges) }));
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview, "", false))).not.toBeInTheDocument());
    expect(await screen.findByText(/Updated 3 rate line\(s\) from Excel/)).toBeInTheDocument();
  });

  it('opens and closes the upload picker and preview, and reports missing or non-numeric rates', async () => {
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    await openRateLines();
    const uploadButton = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.uploadCompletedExcel, "i", false) });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = jest.spyOn(fileInput, 'click');
    fireEvent.click(uploadButton);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview, "", false))).not.toBeInTheDocument();

    await uploadFile(makeWorkbook([
      { 'Item Code': 'INT-001' },
      { 'Item Code': 'INT-002', 'Target Rate': 'not a number' },
      { 'Item Code': 'INT-003', 'Target Rate': '200' },
    ]));
    expect(document.querySelector('[title*="Target Rate must be a valid number"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges) })).toBeDisabled();

    const previewTitle = screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview, "", false));
    const modalHeader = previewTitle.parentElement?.parentElement;
    fireEvent.click(modalHeader?.querySelector('button') as HTMLButtonElement);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview, "", false))).not.toBeInTheDocument();
  });

  it('recalculates optional benchmarks, exports blank references, and falls back for an unknown vendor option', async () => {
    const item = {
      id: 'reference', itemCode: 'REF-1', category: 'Civil', subcategory: 'General',
      description: 'Reference line', specification: 'Reference spec', uom: 'EA', qty: 2,
      aiRate: 3, aiCost: 6, previousPpoRate: 4, previousPpoAmount: 8, targetRate: 5, targetAmount: 10,
    };
    localStorage.setItem('procpx_rate_card_initiate_draft', JSON.stringify({
      form: { title: 'Reference card', vendor: 'Saved vendor', vendorId: 'saved-vendor', category: 'Civil', subcategory: 'General', location: 'West', effectiveFrom: '2026-01-01', validUntil: '2026-12-31', scope: 'Scope', commercialTerms: 'Terms' },
      items: [item, {
        ...item, id: 'optional', itemCode: 'REF-2', qty: null, aiRate: null, aiCost: null,
        previousPpoRate: null, previousPpoAmount: null, targetRate: 8, targetAmount: 0,
      }],
    }));
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    const vendor = screen.getAllByRole('combobox')[0];
    const unknownVendor = document.createElement('option');
    unknownVendor.value = 'Unknown vendor';
    unknownVendor.textContent = 'Unknown vendor';
    vendor.appendChild(unknownVendor);
    fireEvent.change(vendor, { target: { value: 'Unknown vendor' } });
    expect(vendor).toHaveValue('Unknown vendor');
    await openRateLines();

    const row = screen.getByRole('row', { name: /REF-1/ });
    const quantity = within(row).getAllByRole('spinbutton')[0];
    fireEvent.change(quantity, { target: { value: '' } });
    expect(quantity).toHaveValue(null);
    fireEvent.change(quantity, { target: { value: '4' } });
    expect(quantity).toHaveValue(4);
    expect(within(row).getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.toLocaleString, { toLocaleString: '20' })))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.downloadExcelTemplate) }));
    const exportedRows = (XLSX.utils.aoa_to_sheet as jest.Mock).mock.calls.at(-1)?.[0];
    expect(exportedRows[2]).toContain('Not Available');
    expect(exportedRows[2]).toContain('Not Generated');
  });

  it('recovers from corrupt saved data and keeps running when storage writes fail', async () => {
    localStorage.setItem('procpx_rate_card_initiate_draft', '{broken json');
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage disabled');
    });
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    expect(screen.getByDisplayValue(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.retailStoreInteriorWorksFY202627))).toBeInTheDocument();
    await openRateLines();
    expect(screen.getByText('5 items')).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      expect.objectContaining({
        operation: 'restore_rate_card_initiation_draft',
        fallback: 'use_initial_form_and_rate_lines',
      }),
    );
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'persist_rate_card_initiation_draft',
        fallback: 'keep_current_form_in_memory',
      }),
    );
    setItem.mockRestore();
  });

  it('reports all required-field and duplicate-code validation errors for a restored draft', async () => {
    const duplicateItems = [
      { id: 'dup-1', itemCode: 'DUP', category: 'Civil', subcategory: '', description: 'One', specification: 'Spec', uom: 'EA', qty: null, aiRate: null, aiCost: null, previousPpoRate: null, previousPpoAmount: null, targetRate: 10, targetAmount: 0 },
      { id: 'dup-2', itemCode: ' dup ', category: 'Civil', subcategory: '', description: 'Two', specification: 'Spec', uom: 'EA', qty: null, aiRate: null, aiCost: null, previousPpoRate: null, previousPpoAmount: null, targetRate: 20, targetAmount: 0 },
    ];
    localStorage.setItem('procpx_rate_card_initiate_draft', JSON.stringify({
      form: { title: ' ', vendor: '', vendorId: '', category: ' ', subcategory: '', location: '', effectiveFrom: '', validUntil: '', scope: '', commercialTerms: '' },
      items: duplicateItems,
    }));
    render(<InitiateRateCardWorkspace onBack={onBack} onSubmit={onSubmit} />);
    await openRateLines();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToReviewInitiate) }));
    expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Vendor is required.')).toBeInTheDocument();
    expect(screen.getByText('Category is required.')).toBeInTheDocument();
    expect(screen.getByText('Effective From date is required.')).toBeInTheDocument();
    expect(screen.getByText('Valid Until date is required.')).toBeInTheDocument();
    expect(screen.getByText('Duplicate item codes: dup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.initiateRateCardSendToVendor, "", false) })).toBeDisabled();
  });
});
