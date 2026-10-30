/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as XLSX from 'xlsx';
import StandardBoqCreationPage from '../src/app/(app)/masters/standard-boq/page';

const originalFetch = global.fetch;
const fetchMock = jest.fn();
let userRole = 'CATEGORY_MANAGER';
let standardItems: any[];
let categories: any[];
let postResponse: any;

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
jest.mock('../src/components/ui/PageHeader', () => ({ __esModule: true, default: ({ title, subtitle, actions }: any) => <header><h1>{title}</h1><p>{subtitle}</p>{actions}</header> }));
jest.mock('../src/components/ui/SummaryCard', () => ({ SummaryCardGrid: ({ children }: any) => <div>{children}</div>, SummaryCard: ({ label, value }: any) => <div><span>{label}</span><strong>{value}</strong></div> }));

const items = [
  { id: 'item-1', itemCode: 'STD-EXIST', sector: 'RETAIL', projectType: 'Store Fitout', category: 'Electrical', subcategory: 'Wiring', standardDescription: 'Copper cable', detailedSpecification: 'FRLS copper cable', uom: 'MTR', brandMake: 'North', benchmarkRate: 25, isActive: true, createdAt: '2026-10-01' },
  { id: 'item-2', itemCode: 'STD-ZERO', sector: 'OFFICE', projectType: 'Office', category: 'Civil', subcategory: 'Flooring', standardDescription: 'Floor tile', detailedSpecification: '', uom: 'SQFT', brandMake: null, benchmarkRate: 0, isActive: false, createdAt: '2026-10-02' },
];

function response(body: unknown, ok = true) { return { ok, json: async () => body }; }

function configureFetch() {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve(postResponse);
    if (url === '/api/auth/me') return Promise.resolve(response({ data: { user: { role: userRole } } }));
    if (url === '/api/masters/categories') return Promise.resolve(response({ data: categories }));
    return Promise.resolve(response({ data: standardItems }));
  });
  global.fetch = fetchMock as typeof fetch;
}

async function chooseWorkbook(rows: Record<string, unknown>[], fileName = 'standard-items.xlsx') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Items');
  const fileBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const file = new File([fileBytes], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(
    screen.queryByText(fileName) || screen.queryByText('Spreadsheet contains no data rows.') || screen.queryByText(/Failed to parse Excel file/),
  ).toBeTruthy());
}

describe('standard BOQ master page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRole = 'CATEGORY_MANAGER';
    standardItems = items;
    categories = [{ id: 'cat-1', name: 'Electrical' }, { id: 'cat-2', name: 'Civil' }];
    postResponse = response({ data: { count: 1 } });
    configureFetch();
  });
  afterAll(() => { global.fetch = originalFetch; });

  it('loads and filters the master, refreshes categories, and exposes administrator actions', async () => {
    render(<StandardBoqCreationPage />);
    expect(screen.getByText('Loading Standard BOQ Items...')).toBeInTheDocument();
    expect(await screen.findByText('STD-EXIST')).toBeInTheDocument();
    expect(screen.getByText('Copper cable')).toBeInTheDocument();
    expect(screen.queryByText('No standard BOQ items found matching your filters.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search by code, description, specification...'), { target: { value: 'frls' } });
    expect(screen.getByText('STD-EXIST')).toBeInTheDocument();
    expect(screen.queryByText('STD-ZERO')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search by code, description, specification...'), { target: { value: 'missing' } });
    expect(await screen.findByText('No standard BOQ items found matching your filters.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search by code, description, specification...'), { target: { value: '' } });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'RETAIL' } });
    fireEvent.change(selects[1], { target: { value: 'Electrical' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('sector=RETAIL')));
    fireEvent.change(screen.getByPlaceholderText('Search by code, description, specification...'), { target: { value: 'Cable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('search=Cable')));

    fireEvent.click(screen.getByRole('button', { name: 'Download Excel Template' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Create Standard BOQ Items' }));
    expect(screen.getByText('Create Standard BOQ Master Items')).toBeInTheDocument();
    const modalClose = [...document.querySelectorAll('button')].find(button => button.querySelector('svg.lucide-x'))!;
    fireEvent.click(modalClose);
  });

  it('validates editable rows and submits a normalized multi-line standard BOQ', async () => {
    render(<StandardBoqCreationPage />);
    await screen.findByText('STD-EXIST');
    fireEvent.click(screen.getByRole('button', { name: '+ Create Standard BOQ Items' }));
    await waitFor(() => expect(screen.getAllByRole('combobox')[3]).toHaveValue('Electrical'));
    fireEvent.change(screen.getByPlaceholderText('STD-CIV-001'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText(/Item Code is required/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('STD-CIV-001'), { target: { value: 'STD-NEW-1' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText(/Description is required/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. Vitrified Floor Tile 600x600'), { target: { value: 'New tile' } });
    fireEvent.change(screen.getByPlaceholderText('Detailed technical spec...'), { target: { value: '' } });
    fireEvent.change(screen.getAllByRole('combobox')[3], { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText('Please select a Category.')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[3], { target: { value: 'Electrical' } });
    fireEvent.change(screen.getAllByRole('combobox')[4], { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText(/UOM is required/)).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[4], { target: { value: 'MTR' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Add Another Standard Item' }));
    const codes = screen.getAllByPlaceholderText('STD-CIV-001');
    fireEvent.change(codes[1], { target: { value: 'std-new-1' } });
    fireEvent.change(screen.getAllByPlaceholderText('e.g. Vitrified Floor Tile 600x600')[1], { target: { value: 'Duplicate tile' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 2 Items to Master' }).closest('form')!);
    expect(await screen.findByText(/Duplicate item code in table/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Remove row')[1]);
    fireEvent.change(screen.getByPlaceholderText('STD-CIV-001'), { target: { value: 'STD-NEW-1' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Vitrified Floor Tile 600x600'), { target: { value: 'New tile' } });
    fireEvent.change(screen.getByPlaceholderText('Detailed technical spec...'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '12.50' } });
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'OFFICE' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Store Fitout'), { target: { value: 'Office Fitout' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Flooring, Wiring'), { target: { value: 'Flooring' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/boq/standard-library', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body as string);
    expect(payload).toMatchObject({ sector: 'OFFICE', projectType: 'Office Fitout', category: 'Electrical', subcategory: 'Flooring', items: [{ itemCode: 'STD-NEW-1', standardDescription: 'New tile', detailedSpecification: 'New tile', uom: 'MTR', benchmarkRate: 12.5 }] });
    expect(await screen.findByText(/Successfully created 1 standard BOQ items/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '' }).find(button => button.querySelector('svg'))!);
  });

  it('reports existing codes, server errors, and network failures on standard item creation', async () => {
    render(<StandardBoqCreationPage />);
    await screen.findByText('STD-EXIST');
    fireEvent.click(screen.getByRole('button', { name: '+ Create Standard BOQ Items' }));
    fireEvent.change(screen.getByPlaceholderText('STD-CIV-001'), { target: { value: 'std-exist' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Vitrified Floor Tile 600x600'), { target: { value: 'Duplicate existing' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText(/already exists in the central Standard BOQ Master/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('STD-CIV-001'), { target: { value: 'STD-NEW' } });
    postResponse = response({ error: 'Master unavailable' }, false);
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText('Master unavailable')).toBeInTheDocument();
    postResponse = response({}, false);
    fireEvent.change(screen.getByPlaceholderText('e.g. Flooring, Wiring'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText('Failed to save standard BOQ items.')).toBeInTheDocument();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.reject(new Error('offline')) : Promise.resolve(response({ data: standardItems })));
    fireEvent.submit(screen.getByRole('button', { name: 'Save 1 Item to Master' }).closest('form')!);
    expect(await screen.findByText('offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('imports a spreadsheet, validates and repairs rows, and reports import failures', async () => {
    render(<StandardBoqCreationPage />);
    await screen.findByText('STD-EXIST');
    fireEvent.click(screen.getByRole('button', { name: 'Upload Excel' }));
    expect(screen.getByText('Upload Standard BOQ Items (Excel Import)')).toBeInTheDocument();
    await chooseWorkbook([
      { 'Item Code *': 'STD-IMPORT-1', 'Category *': 'Electrical', 'Item Description *': 'Cable set', 'UOM *': 'mtr', Rate: '40', 'Brand / Make': 'Local' },
      { 'Item Code *': 'STD-IMPORT-1', 'Category *': 'Unknown', 'Item Description *': '', 'UOM *': '', Rate: 'bad' },
      { 'Item Code *': 'STD-EXIST', 'Category *': 'Electrical', 'Item Description *': 'Existing', 'UOM *': 'NOS' },
      { Code: 'STD-CODE-ALIAS', Category: 'Electrical', Description: 'Alias cable', Unit: 'EA' },
      { 'Item Code': 'STD-ITEM-ALIAS', Category: 'Civil', Description: 'Alias tile', Unit: 'SQFT' },
      { 'Item Code *': '', 'Category *': '', 'Item Description *': '', 'UOM *': '', Rate: 'bad' },
    ]);
    expect(screen.getByText('Errors to Correct')).toBeInTheDocument();
    expect(screen.getByText(/Duplicate item code/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Valid Only/ }));
    const validRow = screen.getByDisplayValue('STD-IMPORT-1').closest('tr')!;
    fireEvent.change(within(validRow).getByPlaceholderText('Sub-category'), { target: { value: '' } });
    fireEvent.change(within(validRow).getByPlaceholderText('BOQ Description'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Errors Only/ }));
    const errorRow = () => screen.getAllByText('Err')[0].closest('tr')!;
    fireEvent.change(within(errorRow()).getAllByRole('textbox')[0], { target: { value: 'STD-REPAIRED' } });
    fireEvent.change(within(errorRow()).getAllByRole('combobox')[0], { target: { value: 'Electrical' } });
    fireEvent.change(within(errorRow()).getAllByRole('textbox')[1], { target: { value: '' } });
    fireEvent.change(within(errorRow()).getAllByRole('textbox')[2], { target: { value: 'Repaired item' } });
    fireEvent.change(within(errorRow()).getAllByRole('textbox')[3], { target: { value: '' } });
    fireEvent.change(within(errorRow()).getAllByRole('combobox')[1], { target: { value: 'MTR' } });
    fireEvent.change(within(errorRow()).getAllByRole('textbox')[4], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /All Rows/ }));
    expect(screen.getAllByText('Ready to import').length).toBeGreaterThan(0);
    postResponse = response({ error: 'Import service unavailable' }, false);
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));
    expect(await screen.findByText('Import service unavailable')).toBeInTheDocument();
    postResponse = response({}, false);
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));
    expect(await screen.findByText('Failed to import standard BOQ items.')).toBeInTheDocument();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.reject(new Error('import offline')) : Promise.resolve(response({ data: standardItems })));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));
    expect(await screen.findByText('import offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Different File' }));
    postResponse = response({ data: { count: 2 } });
    configureFetch();
    await chooseWorkbook([
      { 'Item Code *': 'STD-IMPORT-2', 'Category *': 'Electrical', 'Item Description *': 'Cable joint', 'UOM *': 'EA', Rate: '10' },
    ], 'successful-import.xlsx');
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));
    expect(await screen.findByText(/Successfully imported 1 standard BOQ items/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload Excel' }));
    await chooseWorkbook([
      { 'Item Code *': 'STD-CANCEL-IMPORT', 'Category *': 'Electrical', 'Item Description *': 'Cancel import', 'UOM *': 'EA' },
    ], 'cancel-import.xlsx');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('shows restricted role, ignores unavailable API data, and handles empty or unreadable spreadsheets', async () => {
    userRole = 'PROJECT_USER';
    fetchMock.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: userRole } }))
      : url === '/api/masters/categories'
        ? Promise.resolve(response([]))
        : Promise.resolve(response([])));
    const readOnlyView = render(<StandardBoqCreationPage />);
    expect(screen.getByText(/Read-Only Master View/)).toBeInTheDocument();
    expect(await screen.findByText('No standard BOQ items found matching your filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Admin Only/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Upload Excel' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel Template' }));
    readOnlyView.unmount();

    userRole = 'CATEGORY_MANAGER';
    fetchMock.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: userRole } }))
      : url === '/api/masters/categories'
        ? Promise.resolve(response({ data: categories }))
        : Promise.resolve(response({ data: [] })));
    const { unmount } = render(<StandardBoqCreationPage />);
    await screen.findByRole('button', { name: 'Upload Excel' });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Excel' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = jest.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Excel File' }));
    expect(clickSpy).toHaveBeenCalled();
    await chooseWorkbook([]);
    expect(screen.getByText('Spreadsheet contains no data rows.')).toBeInTheDocument();
    const bad = new File(['not an xlsx workbook'], 'invalid.xlsx');
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [bad] } });
    expect(await screen.findByText(/Spreadsheet contains no data rows|Failed to parse Excel file/)).toBeInTheDocument();
    const uploadClose = [...document.querySelectorAll('button')].find(button => button.querySelector('svg.lucide-x'))!;
    fireEvent.click(uploadClose);
    unmount();
  });

  it('reports a failed master load while ignoring category and role lookup network errors', async () => {
    fetchMock.mockImplementation((url: string) => Promise.reject(new Error(`${url} offline`)));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<StandardBoqCreationPage />);
    expect(await screen.findByText('Failed to load standard BOQ items.')).toBeInTheDocument();
    expect(screen.getByText(/Read-Only Master View/)).toBeInTheDocument();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('supports legacy empty API payloads and safe empty-category row editing', async () => {
    fetchMock.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({}))
      : Promise.resolve(response(null)));
    const legacy = render(<StandardBoqCreationPage />);
    expect(await screen.findByText(/Read-Only Master View/)).toBeInTheDocument();
    expect(await screen.findByText('No standard BOQ items found matching your filters.')).toBeInTheDocument();
    legacy.unmount();

    userRole = 'CATEGORY_MANAGER';
    fetchMock.mockImplementation((url: string) => url === '/api/auth/me'
      ? Promise.resolve(response({ user: { role: userRole } }))
      : url === '/api/masters/categories'
        ? Promise.resolve(response([]))
        : Promise.resolve(response([])));
    render(<StandardBoqCreationPage />);
    await screen.findByRole('button', { name: '+ Create Standard BOQ Items' });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Standard BOQ Items' }));
    const codeFields = screen.getAllByPlaceholderText('STD-CIV-001');
    expect(codeFields[0]).toHaveValue('STD-CIV-001');
    fireEvent.click(screen.getByRole('button', { name: '+ Add Another Standard Item' }));
    expect(screen.getAllByPlaceholderText('STD-CIV-001')[1]).toHaveValue('STD-CIV-002');
    fireEvent.click(screen.getAllByTitle('Remove row')[1]);
    const onlyRemove = screen.getByTitle('Remove row');
    onlyRemove.removeAttribute('disabled');
    fireEvent.click(onlyRemove);
    expect(screen.getByText('1 standard item ready to save.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });
});
