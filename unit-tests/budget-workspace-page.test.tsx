/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProjectBudgetPage from '../src/app/(app)/budget/page';

const mockToastSuccess = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockSearchValue = new URLSearchParams('projectId=p1&costCentreId=cc1');
let projectsResponse: any = { data: [
  { id: 'p1', projectCode: 'P-01', name: 'North Plant' },
  { id: 'p2', projectCode: 'P-02', name: 'South Plant' },
] };
let roleResponse: any = { user: { role: 'PROJECT_APPROVER' } };
let budgetByProject: Record<string, any> = {};
let approveResponse: { ok: boolean; body: any } = { ok: true, body: {} };
let rejectResponse: { ok: boolean; body: any } = { ok: true, body: {} };
const mockFetch = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => mockSearchValue.get(key) }),
  useRouter: () => mockRouter,
}));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockToastSuccess }) }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle, actions }: any) => <header><h1>{title}</h1><p>{subtitle}</p>{actions}</header>,
}));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCardGrid: ({ children }: any) => <div data-testid="summary-grid">{children}</div>,
  SummaryCard: ({ label, value, secondary }: any) => <article><span>{label}</span><strong>{value}</strong><small>{secondary}</small></article>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({ StatusBadge: ({ status }: any) => <span data-testid="status-badge">{status}</span> }));
jest.mock('../src/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({ title, description }: any) => <section><h2>{title}</h2><p>{description}</p></section>,
}));

const originalFetch = global.fetch;
const categories = [
  { category: 'Electrical', approvedBudget: 30000, pendingBudget: 5000, ratePerSqFt: 30, actual: 12000, balance: 18000, status: 'UNDER_PROJECT_APPROVAL' },
  { category: 'Civil', approvedBudget: 20000, pendingBudget: 0, ratePerSqFt: null, actual: 0, balance: 20000, status: 'PENDING FINANCE APPROVAL' },
  { category: 'Power', approvedBudget: 10000, pendingBudget: 2000, ratePerSqFt: 10, actual: 3000, balance: 7000, status: 'APPROVED' },
  { category: 'Rejected', approvedBudget: 0, pendingBudget: 0, ratePerSqFt: 0, actual: 0, balance: 0, status: 'REJECTED' },
  { category: 'Partial', approvedBudget: 5, pendingBudget: 1, ratePerSqFt: 0, actual: 1, balance: 4, status: 'PARTIALLY APPROVED' },
  { category: 'Other', approvedBudget: 1, pendingBudget: 0, ratePerSqFt: 0, actual: 0, balance: 1, status: 'ON_HOLD' },
];
const mainBudget = {
  costCentres: [
    {
      id: 'cc1', code: 'CC-01', name: 'Civil Works', areaSqFt: 1000,
      totalBudget: 100000, approvedBudget: 60000, pendingBudget: 10000, actual: 20000,
      balance: null, budgetStatus: 'ACTIVE', categories,
      contributions: [
        { id: 'contrib-1', status: 'UNDER_APPROVAL', totalEstimatedValue: 15000 },
        { id: 'contrib-2', status: 'PENDING_PROJECT_APPROVAL', totalEstimatedValue: 8000 },
        { id: 'contrib-3', status: 'PENDING_FINANCE_APPROVAL', totalEstimatedValue: 5000 },
        { id: 'contrib-done', status: 'APPROVED', totalEstimatedValue: 1000 },
      ],
    },
    { id: 'cc2', code: 'CC-02', name: 'Procurement', areaSqFt: 0, totalBudget: 0, approvedBudget: 0, pendingBudget: 0, actual: 0, categories: [], contributions: [] },
  ],
};
const secondProjectBudget = {
  costCentres: [{ id: 'cc3', code: 'CC-03', name: 'Utilities', areaSqFt: 500, totalBudget: 20000, approvedBudget: 18000, pendingBudget: 2000, actual: 7000, categories: [], contributions: [] }],
};

const response = (body: any, ok = true) => ({ ok, json: async () => body });
function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
    if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
    if (url.startsWith('/api/budgets?projectId=')) {
      const projectId = url.split('=')[1];
      return Promise.resolve(response(budgetByProject[projectId] ?? mainBudget));
    }
    if (url === '/api/budgets/approve') return Promise.resolve(response(approveResponse.body, approveResponse.ok));
    if (url === '/api/budgets/reject') return Promise.resolve(response(rejectResponse.body, rejectResponse.ok));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('project budget workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchValue = new URLSearchParams('projectId=p1&costCentreId=cc1');
    projectsResponse = { data: [
      { id: 'p1', projectCode: 'P-01', name: 'North Plant' },
      { id: 'p2', projectCode: 'P-02', name: 'South Plant' },
    ] };
    roleResponse = { user: { role: 'PROJECT_APPROVER' } };
    budgetByProject = { p1: mainBudget, p2: secondProjectBudget };
    approveResponse = { ok: true, body: {} };
    rejectResponse = { ok: true, body: {} };
    setupFetch();
  });

  afterAll(() => { global.fetch = originalFetch; });

  it('loads project and cost centre from URL and renders budget metrics, categories and approval queue', async () => {
    render(<ProjectBudgetPage />);
    expect(await screen.findByText('3 Budget Contributions Under Approval for Civil Works')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('p1'));
    expect(screen.getByText('Area:').parentElement).toHaveTextContent('1,000 Sqft');
    expect(screen.getByText('Total Budget Allocation')).toBeInTheDocument();
    expect(screen.getByText('Actual Spend')).toBeInTheDocument();
    expect(screen.getByText('Available Balance')).toBeInTheDocument();
    expect(screen.getByText('Cost Per Sqft')).toBeInTheDocument();
    expect(screen.getByText('3 Budget Contributions Under Approval for Civil Works')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Approve Budget/ })).toHaveLength(3);
    expect(screen.getByText('Under Project Approval')).toBeInTheDocument();
    expect(screen.getByText('Under Finance Approval')).toBeInTheDocument();
    expect(screen.getByText('Partially Approved')).toBeInTheDocument();
    expect(screen.getByText('ON HOLD')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute('href', '/budget/transactions');
    expect(screen.getByRole('link', { name: 'Budget vs Actual' })).toHaveAttribute('href', '/budget/vs-actual');

    fireEvent.click(screen.getByRole('button', { name: /CC-02/ }));
    await waitFor(() => expect(window.location.search).toContain('costCentreId=cc2'));
    expect(screen.getByText('No Category Budget Allocated')).toBeInTheDocument();
    expect(screen.getByText('Area not configured')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open BOQ Studio' })).toHaveAttribute('href', '/boq/studio?projectId=p1&costCentreId=cc2');
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('handles budget approval errors and success and dismisses the result banner', async () => {
    render(<ProjectBudgetPage />);
    await screen.findByText('CATEGORY-WISE BUDGET');
    await screen.findAllByRole('button', { name: /Approve Budget/ });
    approveResponse = { ok: false, body: {} };
    fireEvent.click(screen.getAllByRole('button', { name: /Approve Budget/ })[0]);
    expect(await screen.findByText('Approval failed')).toBeInTheDocument();

    approveResponse = { ok: false, body: { error: 'Budget API unavailable' } };
    fireEvent.click(screen.getAllByRole('button', { name: /Approve Budget/ })[0]);
    expect(await screen.findByText('Budget API unavailable')).toBeInTheDocument();
    const error = screen.getByText('Budget API unavailable').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(error).getByRole('button'));
    expect(screen.queryByText('Budget API unavailable')).not.toBeInTheDocument();

    approveResponse = { ok: true, body: {} };
    fireEvent.click(screen.getAllByRole('button', { name: /Approve Budget/ })[0]);
    expect(await screen.findByText('Budget approved successfully.')).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Budget approved successfully.', 'North Plant', 'Approved');
    const status = screen.getByText('Budget approved successfully.').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(status).getByRole('button'));
    expect(screen.queryByText('Budget approved successfully.')).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets/approve', expect.objectContaining({ body: JSON.stringify({
      contributionId: 'contrib-1', remarks: 'Approved by Project Approver from Project Budget',
    }) }));
  });

  it('validates and rejects contributions, handling failure, success and cancellation', async () => {
    render(<ProjectBudgetPage />);
    await screen.findByText('CATEGORY-WISE BUDGET');
    await screen.findAllByRole('button', { name: 'Reject' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    expect(screen.getByText('Reject Budget Contribution')).toBeInTheDocument();
    const reason = screen.getByPlaceholderText('Specify reason for budget rejection...');
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Confirm Rejection' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Rejection' }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => url === '/api/budgets/reject')).toBe(false);
    fireEvent.change(reason, { target: { value: 'Missing backup documents' } });

    rejectResponse = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Rejection failed')).toBeInTheDocument();
    rejectResponse = { ok: false, body: { error: 'Reject API unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Reject API unavailable')).toBeInTheDocument();

    rejectResponse = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Budget contribution rejected with audit notes.')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets/reject', expect.objectContaining({ body: JSON.stringify({
      contributionId: 'contrib-1', reason: 'Missing backup documents',
    }) }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Reject Budget Contribution')).not.toBeInTheDocument();
  });

  it('switches projects, loads empty categories and hides approval controls for non-approvers', async () => {
    roleResponse = { user: { role: 'VIEWER' } };
    render(<ProjectBudgetPage />);
    await screen.findByText('CATEGORY-WISE BUDGET');
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('p1'));
    await screen.findByText('Electrical');
    expect(screen.queryAllByRole('button', { name: /Approve Budget/ })).toHaveLength(0);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'p2' } });
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('p2'));
    await waitFor(() => expect(screen.getAllByRole('combobox')[1]).toHaveValue('cc3'));
    expect(screen.getByText('No Category Budget Allocated')).toBeInTheDocument();
    expect(window.location.search).toContain('projectId=p2');
    expect(window.location.search).not.toContain('costCentreId');
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets?projectId=p2');
  });

  it('renders empty project and budget error states and handles failed requests', async () => {
    projectsResponse = { data: [] };
    roleResponse = {};
    const emptyProjects = render(<ProjectBudgetPage />);
    expect(await screen.findByText('Loading category budget metrics...')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[1]).toBeDisabled();
    emptyProjects.unmount();

    global.fetch = jest.fn().mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response([{ id: 'p1', projectCode: 'P-01', name: 'North Plant' }]))
      : url === '/api/auth/me'
        ? Promise.resolve(response({ user: { role: 'CLIENT_ADMIN' } }))
        : Promise.resolve(response({}, false)));
    render(<ProjectBudgetPage />);
    expect(await screen.findByText('Failed to load project budget data.')).toBeInTheDocument();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockImplementation((url: string) => url === '/api/projects'
      ? Promise.reject(new Error('project list offline'))
      : url === '/api/auth/me'
        ? Promise.reject(new Error('session unavailable'))
        : Promise.reject(new Error('budget endpoint offline')));
    render(<ProjectBudgetPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    consoleError.mockRestore();
  });
});
