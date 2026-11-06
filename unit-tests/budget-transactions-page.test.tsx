/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BudgetTransactionsPage from '../src/app/(app)/budget/transactions/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/link', () => {
  const React = require('react');
  return { __esModule: true, default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', { href, ...props }, children) };
});

let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockSearchParams }));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
let reverseResponse: { body: unknown; ok: boolean } = { body: { success: true }, ok: true };
const projects = [{ id: 'project-1', name: 'North Plant', projectCode: 'NP-01' }];
const costCentres = [
  { id: 'cc-1', name: 'Electrical', code: 'CC-01' },
  { id: 'cc-2', name: 'Groundworks', code: 'CC-02' },
];
const transactions = [
  {
    id: 'tx-1', transactionCode: 'TX-100', status: 'APPROVED', category: 'Electrical', isReversal: false,
    costCentreId: 'cc-1', costCentreCode: 'CC-01', costCentreName: 'Electrical', projectName: 'North Plant',
    boqNumber: 'BOQ-1', boqRevision: 'R2', boqLineReference: 'Line 4', description: 'Cable trays', reference: 'ref-1',
    amount: 12500, budgetDate: '2026-01-02', submitterName: 'Mira', approverName: 'Asha', approvedAt: '2026-01-03',
  },
  {
    id: 'tx-2', transactionCode: 'TX-200', status: 'UNDER_APPROVAL', category: 'Civil', isReversal: false,
    costCentreId: 'cc-2', costCentreCode: 'CC-02', costCentreName: 'Groundworks', projectName: 'North Plant',
    boqNumber: '—', description: 'Foundation', reference: 'foundation-ref', amount: 8000, createdByName: 'Ravi',
  },
  {
    id: 'tx-3', transactionCode: 'TX-300', status: 'PENDING_FINANCE_APPROVAL', category: 'Mechanical', isReversal: false,
    costCentreId: 'cc-1', costCentreCode: 'CC-01', costCentreName: 'Electrical', projectName: 'North Plant',
    boqNumber: 'BOQ-3', description: '', reference: 'mechanical-ref', amount: -200, createdBy: 'user-1234567890',
  },
  {
    id: 'tx-4', transactionCode: 'TX-400', status: 'REJECTED', category: 'Safety', isReversal: false,
    costCentreId: 'cc-1', costCentreCode: 'CC-01', costCentreName: 'Electrical', projectName: 'North Plant',
    description: 'Safety screens', reference: 'screen-ref', amount: 0, rejectionReason: 'Missing approval',
  },
  {
    id: 'tx-5', transactionCode: 'TX-500', status: 'REVERSED', category: 'Electrical', isReversal: true,
    costCentreId: 'cc-1', costCentreCode: 'CC-01', costCentreName: 'Electrical', projectName: 'North Plant',
    amount: -50, reference: 'reverse-ref',
  },
  {
    id: 'tx-6', transactionCode: 'TX-600', status: 'PROJECT_APPROVED', category: 'Civil', isReversal: false,
    costCentreId: 'cc-2', costCentreCode: 'CC-02', costCentreName: 'Groundworks', projectName: 'North Plant',
    description: 'Temporary fencing', amount: 50,
  },
  {
    id: 'tx-7', transactionCode: 'TX-700', status: 'DRAFT', category: 'Other', isReversal: false,
    costCentreId: 'cc-2', costCentreCode: 'CC-02', costCentreName: 'Groundworks', projectName: 'North Plant',
    description: 'Unsubmitted', amount: 75,
  },
];

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function setupFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/projects') return Promise.resolve(response({ data: projects }));
    if (url === '/api/budgets/reverse') return Promise.resolve(response(reverseResponse.body, reverseResponse.ok));
    if (url.startsWith('/api/budgets/transactions')) return Promise.resolve(response({
      transactions, costCentres, categories: ['Electrical', 'Civil', 'Mechanical', 'Safety', 'Other'],
      pagination: { total: transactions.length, page: 1, pageSize: 50, totalPages: 1 },
    }));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('budget transaction ledger page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    reverseResponse = { body: { success: true }, ok: true };
    setupFetch();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders the ledger, applies every filter and searches all transaction fields', async () => {
    render(<BudgetTransactionsPage />);
    expect(await screen.findByText('TX-100')).toBeInTheDocument();
    expect(screen.getByText('Line 4')).toBeInTheDocument();
    expect(document.body).toHaveTextContent(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.approver));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppFinanceBudgetApprovalsPage.awaitingFinance))).toBeInTheDocument();
    expect(screen.getByText(/Missing approval/)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.system)).length).toBeGreaterThan(0);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'cc-2' } });
    expect(screen.queryByText('TX-100')).not.toBeInTheDocument();
    fireEvent.change(selects[1], { target: { value: '' } });
    fireEvent.change(selects[2], { target: { value: 'Mechanical' } });
    expect(screen.getByText('TX-300')).toBeInTheDocument();
    fireEvent.change(selects[2], { target: { value: '' } });
    fireEvent.change(selects[3], { target: { value: 'REVERSAL' } });
    expect(screen.getByText('TX-500')).toBeInTheDocument();
    expect(screen.queryByText('TX-100')).not.toBeInTheDocument();
    fireEvent.change(selects[3], { target: { value: 'ALLOCATION' } });
    expect(screen.queryByText('TX-500')).not.toBeInTheDocument();
    fireEvent.change(selects[3], { target: { value: '' } });

    fireEvent.change(selects[4], { target: { value: 'UNDER_APPROVAL' } });
    expect(screen.getByText('TX-200')).toBeInTheDocument();
    fireEvent.change(selects[4], { target: { value: 'PENDING_FINANCE_APPROVAL' } });
    expect(screen.getByText('TX-300')).toBeInTheDocument();
    expect(screen.getByText('TX-600')).toBeInTheDocument();
    for (const [status, code] of [['APPROVED', 'TX-100'], ['REJECTED', 'TX-400'], ['REVERSED', 'TX-500']]) {
      fireEvent.change(selects[4], { target: { value: status } });
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    fireEvent.change(selects[4], { target: { value: '' } });

    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.searchTxIDBOQNumberDescription));
    for (const [term, code] of [['TX-100', 'TX-100'], ['BOQ-3', 'TX-300'], ['foundation', 'TX-200'], ['screen-ref', 'TX-400'], ['Mechanical', 'TX-300'], ['Groundworks', 'TX-200']]) {
      fireEvent.change(search, { target: { value: term } });
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: 'not found' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.noTransactionsFound))).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });

    fireEvent.change(selects[0], { target: { value: 'project-1' } });
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/api/budgets/transactions?') && String(url).includes('projectId=project-1'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await waitFor(() => expect(mockFetch.mock.calls.filter(([url]) => String(url).includes('/api/budgets/transactions?') && String(url).includes('projectId=project-1')).length).toBeGreaterThan(1));
  });

  it('loads the next server page and appends rows without replacing the first page', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/projects') return Promise.resolve(response({ data: projects }));
      if (url.startsWith('/api/budgets/transactions')) {
        const page = Number(new URL(url, 'http://localhost').searchParams.get('page'));
        return Promise.resolve(response({ transactions: page === 1 ? [transactions[0]] : [transactions[1]], costCentres,
          categories: ['Electrical', 'Civil'], pagination: { total: 2, page, pageSize: 1, totalPages: 2 } }));
      }
      return Promise.resolve(response({}));
    });
    render(<BudgetTransactionsPage />);
    expect(await screen.findByText('TX-100')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('TX-200')).toBeInTheDocument();
    expect(screen.getByText('TX-100')).toBeInTheDocument();
  });

  it('loads more cost-centre filter options without reloading transaction rows', async () => {
    const extraCostCentre = { id: 'cc-3', projectId: 'project-1', code: 'CC-03', name: 'Finishes' };
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/projects') return Promise.resolve(response({ data: projects }));
      const params = new URL(url, 'http://localhost').searchParams;
      if (params.get('onlyCostCentres') === 'true') {
        return Promise.resolve(response({
          costCentres: [extraCostCentre],
          costCentrePagination: { total: 3, page: 2, pageSize: 2, hasMore: false },
        }));
      }
      return Promise.resolve(response({
        transactions: [transactions[0]], costCentres: costCentres.slice(0, 2), categories: ['Electrical'],
        costCentrePagination: { total: 3, page: 1, pageSize: 2, hasMore: true },
        pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
      }));
    });

    render(<BudgetTransactionsPage />);
    expect(await screen.findByText('TX-100')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) }));

    expect(await screen.findByRole('option', { name: /CC-03/ })).toBeInTheDocument();
    const optionRequest = mockFetch.mock.calls.find(([url]) => String(url).includes('onlyCostCentres=true'));
    expect(optionRequest).toBeDefined();
    expect(new URL(String(optionRequest?.[0]), 'http://localhost').searchParams.get('costCentrePage')).toBe('2');
    expect(screen.getByText('TX-100')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) })).not.toBeInTheDocument();
  });

  it('recovers from a failed cost-centre page and accepts a response without pagination metadata', async () => {
    let optionRequestCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/projects') return Promise.resolve(response({ data: projects }));
      const params = new URL(url, 'http://localhost').searchParams;
      if (params.get('onlyCostCentres') === 'true') {
        optionRequestCount += 1;
        return Promise.resolve(optionRequestCount === 1
          ? response({ error: 'temporary failure' }, false)
          : response({}));
      }
      return Promise.resolve(response({
        transactions: [transactions[0]], costCentres: costCentres.slice(0, 2), categories: ['Electrical'],
        costCentrePagination: { total: 3, page: 1, pageSize: 2, hasMore: true },
        pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
      }));
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<BudgetTransactionsPage />);
    expect(await screen.findByText('TX-100')).toBeInTheDocument();
    const loadMore = () => screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) });
    fireEvent.click(loadMore());
    await waitFor(() => expect(loadMore()).toBeEnabled());
    expect(consoleError).toHaveBeenCalled();

    fireEvent.click(loadMore());
    await waitFor(() => expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) })).not.toBeInTheDocument());
    expect(screen.getByText('TX-100')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('ignores cost-centre options that arrive after a ledger refresh supersedes the request', async () => {
    let resolveOptions!: (value: ReturnType<typeof response>) => void;
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/projects') return Promise.resolve(response({ data: projects }));
      const params = new URL(url, 'http://localhost').searchParams;
      if (params.get('onlyCostCentres') === 'true') {
        return new Promise((resolve) => { resolveOptions = resolve; });
      }
      return Promise.resolve(response({
        transactions: [transactions[0]], costCentres: costCentres.slice(0, 2), categories: ['Electrical'],
        costCentrePagination: { total: 3, page: 1, pageSize: 2, hasMore: true },
        pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
      }));
    });

    render(<BudgetTransactionsPage />);
    expect(await screen.findByText('TX-100')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await waitFor(() => expect(mockFetch.mock.calls.filter(([url]) => String(url).startsWith('/api/budgets/transactions?')).length).toBeGreaterThan(1));
    resolveOptions(response({
      costCentres: [{ id: 'cc-late', projectId: 'project-1', code: 'CC-99', name: 'Stale option' }],
      costCentrePagination: { total: 4, page: 2, pageSize: 2, hasMore: false },
    }));
    await waitFor(() => expect(screen.queryByRole('option', { name: /CC-99/ })).not.toBeInTheDocument());
    expect(screen.getByText('TX-100')).toBeInTheDocument();
  });

  it('loads a valid project deep link and handles a rejected transaction request', async () => {
    mockSearchParams = new URLSearchParams('projectId=project-1');
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response({ data: projects }))
      : Promise.reject(new Error('ledger unavailable')));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<BudgetTransactionsPage />);

    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.noTransactionsFound))).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('project-1');
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('projectId=project-1'))).toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('validates, reports failures, cancels, and successfully reverses an approved transaction', async () => {
    render(<BudgetTransactionsPage />);
    await screen.findByText('TX-100');
    fireEvent.click(within(screen.getByRole('row', { name: /TX-100/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reverse) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.reverseBudgetTransaction))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.confirmReversal) })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.confirmReversal) }).closest('form')!);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.reverseBudgetTransaction))).toBeInTheDocument();

    const reason = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.eGBOQRevisionScopeCorrectionDeScopedItem));
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.confirmReversal) })).toBeDisabled();
    fireEvent.change(reason, { target: { value: '  Corrected BOQ  ' } });
    reverseResponse = { body: { error: 'Reversal permission denied' }, ok: false };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.confirmReversal) }));
    expect(await screen.findByText('Reversal permission denied')).toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body)).toEqual({
      transactionId: 'tx-1', reversalReason: 'Corrected BOQ',
    });

    reverseResponse = { body: {}, ok: true };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.confirmReversal) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.transactionTransactionCodeReversedSuccessfully))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.reverseBudgetTransaction))).not.toBeInTheDocument();
    const successBanner = screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.transactionTransactionCodeReversedSuccessfully)).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(successBanner).getByRole('button'));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.transactionTransactionCodeReversedSuccessfully))).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /TX-100/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reverse) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.reverseBudgetTransaction))).not.toBeInTheDocument();
  });

  it('shows empty results when project and budget requests fail or return no transactions', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.reject(new Error('projects unavailable'))
      : url.startsWith('/api/budgets/transactions')
        ? Promise.resolve(response({ transactions: [], costCentres: [], categories: [], pagination: { total: 0, page: 1, pageSize: 50, totalPages: 0 } }))
        : Promise.resolve(response({})));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<BudgetTransactionsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.noTransactionsFound))).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('accepts bare project lists and absent budget arrays', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response(projects))
      : Promise.resolve(response({})));
    render(<BudgetTransactionsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetTransactionsPage.noTransactionsFound))).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /NP-01/ })).toBeInTheDocument();
  });
});
