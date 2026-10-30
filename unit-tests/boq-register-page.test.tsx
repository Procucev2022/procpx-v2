/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BoqListPage from '../src/app/(app)/boq/page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => require('react').createElement('a', { ...props, href }, children),
}));

const fetchMock = jest.fn();
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });

describe('BOQ register page', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(response({ data: [], total: 0, totalPages: 1 }));
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('shows the loading and empty states with the create and upload links', async () => {
    let finishRequest!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { finishRequest = resolve; }));
    render(<BoqListPage />);
    expect(screen.getByText('Loading BOQ data...')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/boq?page=1&pageSize=15');
    expect(screen.getByRole('link', { name: /Create New BOQ/ })).toHaveAttribute('href', '/boq/studio?action=new');
    expect(screen.getByRole('link', { name: /BOQ Studio Workspace/ })).toHaveAttribute('href', '/boq/studio');
    expect(screen.getByRole('link', { name: /Upload BOQ/ })).toHaveAttribute('href', '/boq/upload');
    finishRequest(response({ data: [], total: 0, totalPages: 1 }));
    expect(await screen.findByText('No BOQs found')).toBeInTheDocument();
    expect(screen.getByText('Total Cost Sheets').closest('.summary-card')).toHaveTextContent('0');
  });

  it('renders revisions, statuses, quality tiers, metrics, and revision actions', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: [
      {
        id: 'boq-1', projectId: 'project-1', boqCode: 'BOQ-LIGHT', status: 'DRAFT', updatedAt: '2026-10-20T10:00:00Z',
        project: { id: 'project-1', projectCode: 'PRJ-001', name: 'Retail North', sector: 'Retail', status: 'ACTIVE' },
        revisions: [{ id: 'rev-1', revisionNumber: 2, status: 'SUBMITTED', totalLines: 10, validLines: 8, errorLines: 1, warningLines: 1, qualityScore: 90, submittedAt: null, approvedAt: null, createdAt: '2026-10-20T10:00:00Z' }],
      },
      {
        id: 'boq-2', projectId: 'project-2', boqCode: 'BOQ-POWER', status: 'DRAFT', updatedAt: '2026-10-21T10:00:00Z',
        project: { id: 'project-2', projectCode: 'PRJ-002', name: 'Retail South', sector: 'Retail', status: 'ACTIVE' },
        revisions: [{ id: 'rev-2', revisionNumber: 1, status: 'UNDER_REVIEW', totalLines: 5, validLines: 0, errorLines: 5, warningLines: 0, qualityScore: 65, submittedAt: null, approvedAt: null, createdAt: '2026-10-21T10:00:00Z' }],
      },
      {
        id: 'boq-3', projectId: 'project-3', boqCode: 'BOQ-APPROVED', status: 'DRAFT', updatedAt: '2026-10-22T10:00:00Z',
        project: { id: 'project-3', projectCode: 'PRJ-003', name: 'Warehouse', sector: 'Industrial', status: 'ACTIVE' },
        revisions: [{ id: 'rev-3', revisionNumber: 4, status: 'APPROVED', totalLines: 7, validLines: 7, errorLines: 0, warningLines: 0, qualityScore: 35, submittedAt: null, approvedAt: null, createdAt: '2026-10-22T10:00:00Z' }],
      },
      {
        id: 'boq-4', projectId: 'project-4', boqCode: 'BOQ-LEGACY', status: 'APPROVED', updatedAt: '2026-10-23T10:00:00Z',
        project: { id: 'project-4', projectCode: 'PRJ-004', name: 'Legacy record', sector: 'Retail', status: 'ACTIVE' },
        revisions: [],
      },
      {
        id: 'boq-5', projectId: 'project-5', boqCode: 'BOQ-NO-SCORE', status: 'REJECTED', updatedAt: '2026-10-24T10:00:00Z',
        project: { id: 'project-5', projectCode: 'PRJ-005', name: 'No revision', sector: 'Retail', status: 'ACTIVE' },
      },
    ], total: 5, totalPages: 3 }));
    render(<BoqListPage />);

    expect(await screen.findByText('BOQ-LIGHT')).toBeInTheDocument();
    expect(screen.getByText('Pending Review').closest('.summary-card')).toHaveTextContent('2');
    expect(screen.getByText('Approved BOQs').closest('.summary-card')).toHaveTextContent('2');
    expect(screen.getByText('Total Line Items').closest('.summary-card')).toHaveTextContent('22');
    expect(screen.getByText('Rev 2')).toBeInTheDocument();
    expect(screen.getByText('10 items')).toBeInTheDocument();
    expect(screen.getByText('8 valid')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getAllByText('0 valid')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'PRJ-001' })).toHaveAttribute('href', '/projects/project-1');
    expect(screen.getAllByRole('link', { name: 'Grid' })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'Grid' })[0]).toHaveAttribute('href', '/boq/rev-1');
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it('uses nested API payloads and falls back to item counts when totals are missing', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: { data: [
      { id: 'boq-nested', boqCode: 'BOQ-NESTED', status: 'SUBMITTED', updatedAt: '2026-10-22', project: { id: 'p', projectCode: 'P-1', name: 'Project', sector: '', status: '' }, revisions: null },
    ] } }));
    render(<BoqListPage />);
    expect(await screen.findByText('BOQ-NESTED')).toBeInTheDocument();
    expect(screen.getByText('Total Cost Sheets').closest('.summary-card')).toHaveTextContent('1');
    expect(screen.getByText('Pending Review').closest('.summary-card')).toHaveTextContent('1');
    expect(screen.getByText('Approved BOQs').closest('.summary-card')).toHaveTextContent('0');
    expect(screen.getByText('Total Line Items').closest('.summary-card')).toHaveTextContent('0');
    expect(screen.getByText('Rev 1')).toBeInTheDocument();
    expect(screen.getByText('0 items')).toBeInTheDocument();
    expect(screen.getByText('BOQ-NESTED').closest('tr')?.querySelectorAll('td')[6].textContent).not.toBe('');
    expect(screen.queryByRole('link', { name: 'Grid' })).not.toBeInTheDocument();
  });

  it('applies search and status filters, resets pagination, and follows page controls', async () => {
    fetchMock.mockResolvedValue(response({ data: [
      { id: 'boq-page', boqCode: 'BOQ-PAGE', status: 'DRAFT', updatedAt: '2026-10-25', project: { id: 'p', projectCode: 'P', name: 'Project', sector: '', status: '' }, revisions: [{ id: 'rev', revisionNumber: 1, status: 'DRAFT', totalLines: 1, validLines: 1, qualityScore: 49 }] },
    ], total: 31, totalPages: 3 }));
    render(<BoqListPage />);
    expect(await screen.findByText('BOQ-PAGE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/boq?page=2&pageSize=15'));
    fireEvent.click(screen.getByRole('button', { name: /Prev/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/boq?page=1&pageSize=15'));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/boq?page=2&pageSize=15'));
    const search = screen.getByPlaceholderText('Search by BOQ name, project code or project name...');
    fireEvent.change(search, { target: { value: 'north wing' } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/boq?page=1&pageSize=15&search=north+wing'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'APPROVED' } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/boq?page=1&pageSize=15&search=north+wing&status=APPROVED'));
    expect(screen.getByText('49%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prev/ })).toBeDisabled();
  });

  it('falls back for unexpected payloads and logs request failures', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: { data: 'not-an-array' }, total: null, totalPages: null }));
    const view = render(<BoqListPage />);
    expect(await screen.findByText('No BOQs found')).toBeInTheDocument();
    expect(screen.getByText('Total Cost Sheets').closest('.summary-card')).toHaveTextContent('0');
    view.unmount();

    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    render(<BoqListPage />);
    await waitFor(() => expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' })));
    expect(screen.getByText('No BOQs found')).toBeInTheDocument();
    log.mockRestore();
  });
});
