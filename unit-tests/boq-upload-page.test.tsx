/** @jest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BoqUploadPage from '../src/app/(app)/boq/upload/page';

const mockSearchParam = jest.fn();
const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockSearchParam }),
  useRouter: () => ({ push: mockRouterPush }),
}));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, backHref }: { title: string; backHref: string }) => <header><h1>{title}</h1><a href={backHref}>Back</a></header>,
}));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCardGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SummaryCard: ({ label, value }: { label: string; value: React.ReactNode }) => <div><span>{label}</span><strong>{value}</strong></div>,
}));

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });
const allColumns = [
  'S.No.', 'Code', 'Category', 'Sub-category', 'Item Desc', 'BOQ Desc', 'Unit', 'Nos.',
  'Location', 'Drawing Reference', 'Brand', 'Model', 'Material', 'Grade', 'Remarks', 'Unused',
];
const uploadBody = {
  revisionId: 'revision-1', fileName: 'baseline.csv', sheets: ['BOQ', 'Alternates'], columns: allColumns,
  previewRows: [
    { a: 'Line 1', b: 'Cable', c: 'MATERIAL', d: 'Electrical', e: 'Copper cable', f: '4C x 25mm', g: 'm', h: '50', i: 'Roof', j: 'D-101' },
    { a: 'Line 2', b: 'Tray', c: 'MATERIAL', d: 'Electrical', e: 'Cable tray', f: 'GI tray', g: 'm', h: '10', i: 'Roof', j: 'D-102' },
  ],
};
let uploadResponse: ReturnType<typeof response>;
let importResponse: ReturnType<typeof response>;

function file(name = 'baseline.csv') {
  return new File(['Description,Unit,Qty\nCable,m,5'], name, { type: 'text/csv' });
}

function configureFetch() {
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/boq/upload') return Promise.resolve(uploadResponse);
    if (url === '/api/boq/import') return Promise.resolve(importResponse);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function uploadFile(target = file()) {
  fireEvent.change(document.querySelector<HTMLInputElement>('#file-input')!, { target: { files: [target] } });
}

describe('BOQ upload wizard page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockSearchParam.mockImplementation((key: string) => ({ projectId: 'project-1', boqId: 'boq-1' }[key] ?? null));
    uploadResponse = response(uploadBody);
    importResponse = response({ imported: 2, valid: 2, warnings: 0, errors: 0, qualityScore: 90 });
    configureFetch();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('requires a project before accepting files and links back to the BOQ register', async () => {
    mockSearchParam.mockReturnValue(null);
    render(<BoqUploadPage />);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/boq');
    uploadFile();
    expect(await screen.findByText('Project ID is missing. Please navigate from a project.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows upload errors and the generic message when the server omits one', async () => {
    uploadResponse = response({ error: 'Unsupported workbook' }, false);
    render(<BoqUploadPage />);
    uploadFile();
    expect(await screen.findByText('Unsupported workbook')).toBeInTheDocument();
    expect(screen.getByText('Step 1: Upload BOQ File')).toBeInTheDocument();

    uploadResponse = response({}, false);
    uploadFile(file('retry.csv'));
    expect(await screen.findByText('BOQ upload failed. Please verify the file format.')).toBeInTheDocument();
  });

  it('handles drag states and imports the uploaded workbook with auto-mapped columns', async () => {
    const inputClick = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    render(<BoqUploadPage />);
    const dropzone = document.querySelector<HTMLInputElement>('#file-input')!.parentElement!;
    fireEvent.click(dropzone);
    expect(inputClick).toHaveBeenCalled();
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.getAttribute('style')).toContain('brand-600');
    fireEvent.dragLeave(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();

    uploadFile();
    await screen.findByText('Step 2: Map Columns');
    const uploadCall = fetchMock.mock.calls.find(([url]) => url === '/api/boq/upload');
    const form = uploadCall?.[1].body as FormData;
    expect(form.get('projectId')).toBe('project-1');
    expect(form.get('boqId')).toBe('boq-1');
    expect(form.get('file')).toBeInstanceOf(File);
    expect(screen.getByText('Preview (first 5 rows)')).toBeInTheDocument();
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(16);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Alternates' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Code' } });
    fireEvent.click(screen.getByRole('button', { name: /Import BOQ/ }));
    expect(await screen.findByText('BOQ Imported Successfully')).toBeInTheDocument();
    expect(screen.getByText('Total Lines')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    const importCall = fetchMock.mock.calls.find(([url]) => url === '/api/boq/import');
    expect(JSON.parse(importCall?.[1].body)).toEqual({
      revisionId: 'revision-1', sheetName: 'Alternates',
      columnMapping: expect.objectContaining({ description: 'Item Desc', uom: 'Unit', quantity: 'Nos.' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Open BOQ Workspace/ }));
    expect(mockRouterPush).toHaveBeenCalledWith('/boq/revision-1');
  });

  it('shows the loading state during uploads and handles dropped files without BOQ identifiers', async () => {
    mockSearchParam.mockImplementation((key: string) => key === 'projectId' ? 'project-2' : null);
    let finishUpload!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishUpload = resolve; }));
    render(<BoqUploadPage />);
    fireEvent.change(document.querySelector<HTMLInputElement>('#file-input')!, { target: { files: [file('loading.csv')] } });
    expect(screen.getByText('Uploading and analysing file...')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/boq/upload', expect.objectContaining({ method: 'POST' })));
    await act(async () => finishUpload(response({ ...uploadBody, sheets: [] })));
    expect(await screen.findByText('Step 2: Map Columns')).toBeInTheDocument();
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('boqId')).toBeNull();
    expect(screen.queryByText('Sheet to Import')).not.toBeInTheDocument();
  });

  it('validates required column mappings and returns to mapping after import failure', async () => {
    uploadResponse = response({
      revisionId: 'revision-2', fileName: 'partial.csv', sheets: ['Only'], columns: ['Name', 'Unit', 'Qty'],
      previewRows: [],
    });
    importResponse = response({ error: 'Rows contain invalid quantities' }, false);
    render(<BoqUploadPage />);
    uploadFile(file('partial.csv'));
    await screen.findByText('Step 2: Map Columns');
    expect(screen.queryByText('Preview (first 5 rows)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Import BOQ/ }));
    expect(await screen.findByText('Column mapping is incomplete. Please map Description, UOM and Quantity.')).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[4], { target: { value: 'Name' } });
    fireEvent.change(screen.getAllByRole('combobox')[6], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Import BOQ/ }));
    expect(await screen.findByText('Column mapping is incomplete. Please map UOM.')).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[6], { target: { value: 'Unit' } });
    fireEvent.change(screen.getAllByRole('combobox')[7], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Import BOQ/ }));
    expect(await screen.findByText('Column mapping is incomplete. Please map Quantity.')).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[7], { target: { value: 'Qty' } });
    fireEvent.click(screen.getByRole('button', { name: /Import BOQ/ }));
    expect(await screen.findByText('Rows contain invalid quantities')).toBeInTheDocument();
    expect(screen.getByText('Step 2: Map Columns')).toBeInTheDocument();
  });
});
