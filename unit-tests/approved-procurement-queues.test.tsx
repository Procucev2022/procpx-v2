/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApprovedBoqsPage from '../src/app/(app)/procurement/approved-boqs/page';
import ApprovedPrsPage from '../src/app/(app)/procurement/approved-prs/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";

function stripBoqLines<T extends { lines?: unknown }>(boq: T): Omit<T, 'lines'> {
  return Object.fromEntries(Object.entries(boq).filter(([key]) => key !== 'lines')) as Omit<T, 'lines'>;
}


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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.loadingApprovedCommercialBaselines))).toBeInTheDocument();
    await act(async () => finishRequest({ ok: true, json: async () => ({ approvedBoqs: [] }) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.noApprovedBOQsFound))).toBeInTheDocument();
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
    const summaryBoqs = [boq, fallbackBoq].map(stripBoqLines);
    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => ({
      ok: true,
      json: async () => ({ approvedBoqs: String(input).includes('revisionId=') ? [boq, fallbackBoq] : summaryBoqs }),
    }));
    render(<ApprovedBoqsPage />);
    expect(await screen.findByText('Store fitout')).toBeInTheDocument();
    expect(screen.getByText('Electrical (1)')).toBeInTheDocument();
    expect(screen.getByText('1 RFQs')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.none))).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.createRFQ) })[0]).toHaveAttribute('href', '/procurement/rfqs/new?revisionId=revision-1&projectId=project-1');

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.inspectScope) })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.baselineScopeInspectionProjectNameApprovedRevisionCode))).toBeInTheDocument();
    expect(await screen.findByText('Cable installation')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith('/api/procurement/approved-boqs?revisionId=revision-1&pageSize=1');
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.packageIntoRFQ) })).toHaveAttribute('href', '/procurement/rfqs/new?revisionId=revision-1&projectId=project-1');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.hideScope) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.baselineScopeInspectionProjectNameApprovedRevisionCode))).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.inspectScope) })[1]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.baselineScopeInspectionProjectNameApprovedRevisionCode))).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/procurement/approved-boqs?revisionId=revision-2&pageSize=1'));
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ approvedBoqs: [] }) });
    render(<ApprovedBoqsPage />);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.searchProjectNameProjectCodeOrRevision)), { target: { value: 'Office & Retail' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/procurement/approved-boqs?search=Office+%26+Retail&page=1&pageSize=25'));
    cleanup();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('service unavailable'));
    render(<ApprovedBoqsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.noApprovedBOQsFound))).toBeInTheDocument();
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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.procurementPackage))).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getAllByText('0 items')).toHaveLength(2);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.inSourcing))).toHaveLength(2);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.readyForSourcing))).toHaveLength(2);
    expect(screen.getByText('1 RFQ')).toBeInTheDocument();
    expect(screen.getByText('2 RFQs')).toBeInTheDocument();
    expect(screen.getByText('CC-01')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 released procurement packages')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.totalSanctionedValue))).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('PR-001')[0]);
    expect(screen.getByRole('dialog', { name: 'PR details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close PR details' }));
    expect(screen.queryByRole('dialog', { name: 'PR details' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.viewDetails) })[0]);
    expect(screen.getByRole('dialog', { name: 'PR details' })).toBeInTheDocument();
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ data: [], total: 0 }) });
    render(<ApprovedPrsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.noApprovedProcurementRequestsFound))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.searchByPRProjectCostCentre)), { target: { value: 'PR-00' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/procurement/approved-prs?search=PR-00&page=1&pageSize=50'));
    const callsBeforeRefresh = (global.fetch as jest.Mock).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(callsBeforeRefresh + 1));
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<ApprovedPrsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.noApprovedProcurementRequestsFound))).toBeInTheDocument();
    cleanup();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    render(<ApprovedPrsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.noApprovedProcurementRequestsFound))).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Failed to load approved PRs', expect.any(Error));
    consoleError.mockRestore();
  });

  it('appends approved BOQ pages and reports an invalid scope response', async () => {
    const summary = (id: string, projectName: string) => ({
      id, projectId: `project-${id}`, projectName, projectCode: id, location: '', approvedRevisionCode: 'R1',
      approvedAt: null, approvedBy: 'Approver', categories: [], totalLines: 0, estimatedBenchmarkValue: 0, rfqCount: 0,
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ approvedBoqs: [summary('one', 'First')], total: 26, hasMore: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ approvedBoqs: [summary('two', 'Second')], total: 26, hasMore: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ approvedBoqs: [{ id: 'one', lines: null }] }) });
    render(<ApprovedBoqsPage />);

    expect(await screen.findByText('First')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/procurement/approved-boqs?search=&page=2&pageSize=25');

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementApprovedBoqsPage.inspectScope) })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
  });

  it('uses approved PR summary fallbacks and appends a second register page', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        data: [{ id: 'pr-page-1', prNumber: 'PR-PAGE-1', title: 'First page', totalEstimatedValue: 20, lines: [{ id: 'l1' }], rfqs: [{ id: 'r1' }] }],
        total: 26, hasMore: true,
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        data: [{ id: 'pr-page-2', prNumber: 'PR-PAGE-2', title: 'Second page', totalEstimatedValue: 30, lines: [], rfqs: [] }],
        total: 26, totalEstimatedValue: 50, sourcingActiveCount: 1, hasMore: false,
      }) });
    render(<ApprovedPrsPage />);

    expect(await screen.findByText('PR-PAGE-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('PR-PAGE-2')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/procurement/approved-prs?search=&page=2&pageSize=50');
  });
});
