/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApprovedBoqsPage from '../src/app/(app)/procurement/approved-boqs/page';
import ApprovedPrsPage from '../src/app/(app)/procurement/approved-prs/page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    require('react').createElement('a', { ...props, href }, children),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../src/components/PrDetailModal', () => ({
  __esModule: true,
  default: ({ pr, onClose }: { pr: { prNumber: string }; onClose: () => void }) => (
    <div role="dialog" aria-label="PR details">
      <span>{pr.prNumber}</span>
      <button type="button" onClick={onClose}>Close PR details</button>
    </div>
  ),
}));

describe('approved BOQ and PR queues', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('loads approved BOQs, filters search, renders categories, and toggles scope inspection', async () => {
    let finishRequest!: (value: unknown) => void;
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(resolve => { finishRequest = resolve; }));
    render(<ApprovedBoqsPage />);
    expect(screen.getByText('Loading approved commercial baselines...')).toBeInTheDocument();
    await act(async () => finishRequest({ ok: true, json: async () => ({ approvedBoqs: [] }) }));
    expect(screen.getByText('No Approved BOQs Found')).toBeInTheDocument();
    cleanup();

    const boq = {
      id: 'revision-1', projectId: 'project-1', projectName: 'Store fitout', projectCode: 'P-1', location: 'Pune',
      approvedRevisionCode: 'R2', approvedAt: '2025-06-01T00:00:00Z', approvedBy: 'Approver',
      categories: [{ category: 'Electrical', lineCount: 1 }], totalLines: 1, estimatedBenchmarkValue: 1200, rfqCount: 1,
      lines: [{ id: 'line-1', lineNumber: 1, description: 'Cable installation', category: 'Electrical', uom: 'M', quantity: 8, benchmarkRate: 100, benchmarkAmount: 800 }],
    };
    const fallbackBoq = {
      id: 'revision-2', projectId: 'project-2', projectName: 'Office', projectCode: 'P-2', location: '',
      approvedRevisionCode: 'R1', approvedAt: null, approvedBy: 'Approver', categories: [], totalLines: 0,
      estimatedBenchmarkValue: 0, rfqCount: 0, lines: [],
    };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ approvedBoqs: [boq, fallbackBoq] }) });
    render(<ApprovedBoqsPage />);
    expect(await screen.findByText('Store fitout')).toBeInTheDocument();
    expect(screen.getByText('Electrical (1)')).toBeInTheDocument();
    expect(screen.getByText('1 RFQs')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Create RFQ/ })[0]).toHaveAttribute('href', '/procurement/rfqs/new?revisionId=revision-1&projectId=project-1');

    fireEvent.click(screen.getAllByRole('button', { name: 'Inspect Scope' })[0]);
    expect(screen.getByText('Baseline Scope Inspection: Store fitout (R2)')).toBeInTheDocument();
    expect(screen.getByText('Cable installation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Package into RFQ/ })).toHaveAttribute('href', '/procurement/rfqs/new?revisionId=revision-1&projectId=project-1');
    fireEvent.click(screen.getByRole('button', { name: 'Hide Scope' }));
    expect(screen.queryByText('Baseline Scope Inspection: Store fitout (R2)')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Inspect Scope' })[1]);
    expect(screen.getByText('Baseline Scope Inspection: Office (R1)')).toBeInTheDocument();
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ approvedBoqs: [] }) });
    render(<ApprovedBoqsPage />);
    fireEvent.change(screen.getByPlaceholderText('Search project name, project code, or revision...'), { target: { value: 'Office & Retail' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/procurement/approved-boqs?search=Office%20%26%20Retail'));
    cleanup();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('service unavailable'));
    render(<ApprovedBoqsPage />);
    expect(await screen.findByText('No Approved BOQs Found')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('summarizes released PRs, supports both API shapes, search, refresh, and details', async () => {
    const prs = [
      {
        id: 'pr-1', prNumber: 'PR-001', title: 'Electrical package', status: 'PR_RELEASED_TO_PROCUREMENT', totalEstimatedValue: 150000,
        lines: [{ id: 'line-1' }], costCentre: { code: 'CC-01' }, rfqs: [{ id: 'rfq-1' }],
      },
      {
        id: 'pr-2', prNumber: 'PR-002', title: '', status: 'PR_RELEASED_TO_PROCUREMENT', totalEstimatedValue: null,
        lines: [], costCentre: null, rfqs: [],
      },
      {
        id: 'pr-3', prNumber: 'PR-003', title: 'Civil package', status: 'PR_RELEASED_TO_PROCUREMENT', totalEstimatedValue: 1000,
        costCentre: { code: 'CC-03' }, rfqs: [{ id: 'rfq-1' }, { id: 'rfq-2' }],
      },
    ];
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => prs });
    render(<ApprovedPrsPage />);
    expect(await screen.findByText('PR-001')).toBeInTheDocument();
    expect(screen.getByText('Procurement Package')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getAllByText('0 items')).toHaveLength(2);
    expect(screen.getAllByText('In Sourcing')).toHaveLength(2);
    expect(screen.getAllByText('Ready for Sourcing')).toHaveLength(2);
    expect(screen.getByText('1 RFQ')).toBeInTheDocument();
    expect(screen.getByText('2 RFQs')).toBeInTheDocument();
    expect(screen.getByText('CC-01')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 released procurement packages')).toBeInTheDocument();
    expect(screen.getByText('Total Sanctioned Value')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('PR-001')[0]);
    expect(screen.getByRole('dialog', { name: 'PR details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close PR details' }));
    expect(screen.queryByRole('dialog', { name: 'PR details' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'View Details' })[0]);
    expect(screen.getByRole('dialog', { name: 'PR details' })).toBeInTheDocument();
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ data: [], total: 0 }) });
    render(<ApprovedPrsPage />);
    expect(await screen.findByText('No approved procurement requests found')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search by PR #, Project, Cost Centre...'), { target: { value: 'PR-00' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/procurement/approved-prs?search=PR-00'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<ApprovedPrsPage />);
    expect(await screen.findByText('No approved procurement requests found')).toBeInTheDocument();
    cleanup();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    render(<ApprovedPrsPage />);
    expect(await screen.findByText('No approved procurement requests found')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Failed to load approved PRs', expect.any(Error));
    consoleError.mockRestore();
  });
});
