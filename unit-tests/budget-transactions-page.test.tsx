/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BudgetTransactionsPage from '../src/app/(app)/budget/transactions/page';

jest.mock('next/link', () => {
  const React = require('react');
  return { __esModule: true, default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', { href, ...props }, children) };
});

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

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
    if (url.startsWith('/api/budgets')) return Promise.resolve(response({ transactions, costCentres }));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('budget transaction ledger page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(screen.getByText(/Approver: Asha/)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting Project Approver/)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting Finance Approver/)).toBeInTheDocument();
    expect(screen.getByText(/Missing approval/)).toBeInTheDocument();
    expect(screen.getAllByText('System').length).toBeGreaterThan(0);

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

    const search = screen.getByPlaceholderText('Search Tx ID, BOQ Number, description...');
    for (const [term, code] of [['TX-100', 'TX-100'], ['BOQ-3', 'TX-300'], ['foundation', 'TX-200'], ['screen-ref', 'TX-400'], ['Mechanical', 'TX-300'], ['Groundworks', 'TX-200']]) {
      fireEvent.change(search, { target: { value: term } });
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: 'not found' } });
    expect(screen.getByText('No Transactions Found')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });

    fireEvent.change(selects[0], { target: { value: 'project-1' } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/budgets?projectId=project-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/budgets?projectId=project-1'));
  });

  it('validates, reports failures, cancels, and successfully reverses an approved transaction', async () => {
    render(<BudgetTransactionsPage />);
    await screen.findByText('TX-100');
    fireEvent.click(within(screen.getByRole('row', { name: /TX-100/ })).getByRole('button', { name: 'Reverse' }));
    expect(screen.getByText('Reverse Budget Transaction')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Reversal' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Reversal' }).closest('form')!);
    expect(screen.getByText('Reverse Budget Transaction')).toBeInTheDocument();

    const reason = screen.getByPlaceholderText('e.g., BOQ revision scope correction, de-scoped item...');
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Confirm Reversal' })).toBeDisabled();
    fireEvent.change(reason, { target: { value: '  Corrected BOQ  ' } });
    reverseResponse = { body: { error: 'Reversal permission denied' }, ok: false };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reversal' }));
    expect(await screen.findByText('Reversal permission denied')).toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body)).toEqual({
      transactionId: 'tx-1', reversalReason: 'Corrected BOQ',
    });

    reverseResponse = { body: {}, ok: true };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reversal' }));
    expect(await screen.findByText('Transaction TX-100 reversed successfully!')).toBeInTheDocument();
    expect(screen.queryByText('Reverse Budget Transaction')).not.toBeInTheDocument();
    const successBanner = screen.getByText('Transaction TX-100 reversed successfully!').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(successBanner).getByRole('button'));
    expect(screen.queryByText('Transaction TX-100 reversed successfully!')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('row', { name: /TX-100/ })).getByRole('button', { name: 'Reverse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Reverse Budget Transaction')).not.toBeInTheDocument();
  });

  it('shows empty results when project and budget requests fail or return no transactions', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.reject(new Error('projects unavailable'))
      : url === '/api/budgets'
        ? Promise.resolve(response({ transactions: [], costCentres: [] }))
        : Promise.resolve(response({})));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<BudgetTransactionsPage />);
    expect(await screen.findByText('No Transactions Found')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('accepts bare project lists and absent budget arrays', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response(projects))
      : Promise.resolve(response({})));
    render(<BudgetTransactionsPage />);
    expect(await screen.findByText('No Transactions Found')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /NP-01/ })).toBeInTheDocument();
  });
});
