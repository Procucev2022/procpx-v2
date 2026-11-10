/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';
import { I18N_CONFIG } from '@/lib/i18n.constants';

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProjectBudgetPage from '../src/app/(app)/budget/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import type { BudgetCategoriesResponse, BudgetCategory } from '@app-types/app/api/budgets/categories.types';


const mockToastSuccess = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockSearchValue = new URLSearchParams('projectId=p1&costCentreId=cc1');
let projectsResponse: any = { data: [
  { id: 'p1', projectCode: 'P-01', name: 'North Plant' },
  { id: 'p2', projectCode: 'P-02', name: 'South Plant' },
] };
let roleResponse: any = { user: { role: 'PROJECT_APPROVER' } };
let budgetByProject: Record<string, any> = {};
let categoriesByCostCentre: Record<string, BudgetCategoriesResponse> = {};
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
const categories: BudgetCategory[] = [
  { category: 'Electrical', budget: 35000, approvedBudget: 30000, pendingBudget: 5000, ratePerSqFt: 30, actualRatePerSqFt: 12, balanceRatePerSqFt: 18, actual: 12000, balance: 18000, status: 'UNDER_PROJECT_APPROVAL', txCount: 2 },
  { category: 'Civil', budget: 20000, approvedBudget: 20000, pendingBudget: 0, ratePerSqFt: null, actualRatePerSqFt: null, balanceRatePerSqFt: null, actual: 0, balance: 20000, status: 'PENDING FINANCE APPROVAL', txCount: 1 },
  { category: 'Power', budget: 12000, approvedBudget: 10000, pendingBudget: 2000, ratePerSqFt: 10, actualRatePerSqFt: 3, balanceRatePerSqFt: 7, actual: 3000, balance: 7000, status: 'APPROVED', txCount: 2 },
  { category: 'Rejected', budget: 0, approvedBudget: 0, pendingBudget: 0, ratePerSqFt: 0, actualRatePerSqFt: 0, balanceRatePerSqFt: 0, actual: 0, balance: 0, status: 'REJECTED', txCount: 1 },
  { category: 'Partial', budget: 6, approvedBudget: 5, pendingBudget: 1, ratePerSqFt: 0, actualRatePerSqFt: 0, balanceRatePerSqFt: 0, actual: 1, balance: 4, status: 'PARTIALLY APPROVED', txCount: 2 },
  { category: 'Other', budget: 1, approvedBudget: 1, pendingBudget: 0, ratePerSqFt: 0, actualRatePerSqFt: 0, balanceRatePerSqFt: 1, actual: 0, balance: 1, status: 'ON_HOLD', txCount: 1 },
];
const mainBudget = {
  costCentrePagination: { page: 1, pageSize: 50, total: 2, hasMore: false },
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
  costCentrePagination: { page: 1, pageSize: 50, total: 1, hasMore: false },
  costCentres: [{ id: 'cc3', code: 'CC-03', name: 'Utilities', areaSqFt: 500, totalBudget: 20000, approvedBudget: 18000, pendingBudget: 2000, actual: 7000, categories: [], contributions: [] }],
};

const response = (body: any, ok = true) => ({ ok, json: async () => body });
function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
    if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
    if (url.startsWith('/api/budgets/categories?')) {
      const costCentreId = new URL(url, 'http://localhost').searchParams.get('costCentreId') || '';
      return Promise.resolve(response(categoriesByCostCentre[costCentreId] || {
        categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false },
      }));
    }
    if (url.startsWith('/api/budgets?projectId=')) {
      const params = new URL(url, 'http://localhost').searchParams;
      const projectId = params.get('projectId') || '';
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
    categoriesByCostCentre = {
      cc1: { categories, categoryPagination: { page: 1, pageSize: 50, total: categories.length, hasMore: false } },
      cc2: { categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false } },
      cc3: { categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false } },
    };
    approveResponse = { ok: true, body: {} };
    rejectResponse = { ok: true, body: {} };
    setupFetch();
  });

  afterAll(() => { global.fetch = originalFetch; });

  it('loads project and cost centre from URL and renders budget metrics, categories and approval queue', async () => {
    render(<ProjectBudgetPage />);
    expect(await screen.findByText('3 Budget Contributions Under Approval for Civil Works')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('p1'));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.area, '', false)).parentElement).toHaveTextContent(uiStringPattern(UI_STRINGS.common.toLocaleStringSqft, '', false));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.totalBudgetAllocation))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.actualSpend))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.availableBalance))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.costPerSqft))).toBeInTheDocument();
    expect(screen.getByText('3 Budget Contributions Under Approval for Civil Works')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetPage.approveBudget, '', false) })).toHaveLength(3);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.underProjectApproval))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.underFinanceApproval))).toBeInTheDocument();
    expect(screen.getByText('Partially Approved')).toBeInTheDocument();
    expect(screen.getByText('ON HOLD')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.ledger) })).toHaveAttribute('href', '/budget/transactions');
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.budgetVsActual) })).toHaveAttribute('href', '/budget/vs-actual');

    fireEvent.click(screen.getByRole('button', { name: /CC-02/ }));
    await waitFor(() => expect(window.location.search).toContain('costCentreId=cc2'));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.noCategoryBudgetAllocated))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.areaNotConfigured))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.openBOQStudio) })).toHaveAttribute('href', '/boq/studio?projectId=p1&costCentreId=cc2');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.notSpecified))).toBeInTheDocument();
  });

  it('handles budget approval errors and success and dismisses the result banner', async () => {
    render(<ProjectBudgetPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.cATEGORYWISEBUDGET));
    await screen.findAllByRole('button', { name: /Approve Budget/ });
    approveResponse = { ok: false, body: {} };
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetPage.approveBudget, '', false) })[0]);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.approvalFailed))).toBeInTheDocument();

    approveResponse = { ok: false, body: { error: 'Budget API unavailable' } };
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetPage.approveBudget, '', false) })[0]);
    expect(await screen.findByText('Budget API unavailable')).toBeInTheDocument();
    const error = screen.getByText('Budget API unavailable').parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(error).getByRole('button'));
    expect(screen.queryByText('Budget API unavailable')).not.toBeInTheDocument();

    approveResponse = { ok: true, body: {} };
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetPage.approveBudget) })[0]);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.budgetApprovedSuccessfully))).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.budgetApprovedSuccessfully, 'North Plant', UI_STRINGS.common.approved);
    const status = screen.getByText(uiStringPattern(UI_STRINGS.common.budgetApprovedSuccessfully)).parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(status).getByRole('button'));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.budgetApprovedSuccessfully))).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets/approve', expect.objectContaining({ body: JSON.stringify({
      contributionId: 'contrib-1', remarks: 'Approved by Project Approver from Project Budget',
    }) }));
  });

  it('validates and rejects contributions, handling failure, success and cancellation', async () => {
    render(<ProjectBudgetPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.cATEGORYWISEBUDGET));
    await screen.findAllByRole('button', { name: 'Reject' });
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.rejectBudgetContribution))).toBeInTheDocument();
    const reason = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppBudgetPage.specifyReasonForBudgetRejection));
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }).closest('form')!);
    expect(mockFetch.mock.calls.some(([url]) => url === '/api/budgets/reject')).toBe(false);
    fireEvent.change(reason, { target: { value: 'Missing backup documents' } });

    rejectResponse = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.rejectionFailed))).toBeInTheDocument();
    rejectResponse = { ok: false, body: { error: 'Reject API unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText('Reject API unavailable')).toBeInTheDocument();

    rejectResponse = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.budgetContributionRejectedWithAuditNotes))).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets/reject', expect.objectContaining({ body: JSON.stringify({
      contributionId: 'contrib-1', reason: 'Missing backup documents',
    }) }));
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) })[0]);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.rejectBudgetContribution))).not.toBeInTheDocument();
  });

  it('switches projects, loads empty categories and hides approval controls for non-approvers', async () => {
    roleResponse = { user: { role: 'VIEWER' } };
    render(<ProjectBudgetPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.cATEGORYWISEBUDGET));
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('p1'));
    await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical));
    expect(screen.queryAllByRole('button', { name: /Approve Budget/ })).toHaveLength(0);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'p2' } });
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('p2'));
    await waitFor(() => expect(screen.getAllByRole('combobox')[1]).toHaveValue('cc3'));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.noCategoryBudgetAllocated))).toBeInTheDocument();
    expect(window.location.search).toContain('projectId=p2');
    expect(window.location.search).not.toContain('costCentreId');
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets?projectId=p2&page=1&pageSize=50');
  });

  it('loads additional cost centres without replacing the current selection', async () => {
    const firstPage = {
      ...mainBudget,
      costCentres: [mainBudget.costCentres[0]],
      costCentrePagination: { page: 1, pageSize: 1, total: 2, hasMore: true },
    };
    const secondPage = {
      costCentres: [{ id: 'cc2', code: 'CC-02', name: 'Procurement', areaSqFt: 0, totalBudget: 0, approvedBudget: 0, pendingBudget: 0, actual: 0, categories: [], contributions: [] }],
      costCentrePagination: { page: 2, pageSize: 1, total: 2, hasMore: false },
    };
    budgetByProject.p1 = firstPage;
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/budgets?projectId=p1&page=2')) return Promise.resolve(response(secondPage));
      if (url.startsWith('/api/budgets?projectId=p1')) return Promise.resolve(response(firstPage));
      if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
      if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
      return Promise.resolve(response({}));
    });

    render(<ProjectBudgetPage />);
    await screen.findByRole('option', { name: /CC-01/ });
    const loadMore = await screen.findByRole('button', {
      name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres, '', false),
    });
    fireEvent.click(loadMore);

    await screen.findByRole('option', { name: /CC-02/ });
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('cc1');
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets?projectId=p1&page=2&pageSize=1');
    expect(screen.queryByRole('button', {
      name: uiStringPattern(UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres, '', false),
    })).not.toBeInTheDocument();
  });

  it('pages categories for the selected cost centre and shows the exact total', async () => {
    categoriesByCostCentre.cc1 = {
      categories: [categories[0]],
      categoryPagination: { page: 1, pageSize: 0, total: 2, hasMore: true },
    };
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/budgets/categories?') && url.includes('page=2')) {
        return Promise.resolve(response({
          categories: [categories[1]],
          categoryPagination: { page: 2, pageSize: 50, total: 2, hasMore: false },
        }));
      }
      if (url.startsWith('/api/budgets/categories?')) return Promise.resolve(response(categoriesByCostCentre.cc1));
      if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
      if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
      if (url.startsWith('/api/budgets?')) return Promise.resolve(response(mainBudget));
      return Promise.resolve(response({}));
    });

    render(<ProjectBudgetPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical));
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppBudgetPage.showingCategoriesOfTotal, { shown: 1, total: 2 })))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetPage.loadMoreCategories) }));
    await screen.findByText(categories[1].category);
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets/categories?projectId=p1&costCentreId=cc1&page=2&pageSize=50');
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetPage.loadMoreCategories) })).not.toBeInTheDocument();
  });

  it('ignores an older category response after the selected cost centre changes', async () => {
    let resolveOldCategories: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/budgets/categories?') && url.includes('costCentreId=cc1')) {
        return new Promise((resolve) => { resolveOldCategories = resolve; });
      }
      if (url.startsWith('/api/budgets/categories?')) return Promise.resolve(response({
        categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false },
      }));
      if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
      if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
      if (url.startsWith('/api/budgets?')) return Promise.resolve(response(mainBudget));
      return Promise.resolve(response({}));
    });

    render(<ProjectBudgetPage />);
    await waitFor(() => expect(resolveOldCategories).toBeDefined());
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'cc2' } });
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.noCategoryBudgetAllocated));
    resolveOldCategories?.(response({
      categories: [categories[0]], categoryPagination: { page: 1, pageSize: 50, total: 1, hasMore: false },
    }));
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical))).not.toBeInTheDocument());
    expect(window.location.search).toContain('costCentreId=cc2');
  });

  it('ignores an older category failure after the selected cost centre changes', async () => {
    let resolveOldCategories: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/budgets/categories?') && url.includes('costCentreId=cc1')) {
        return new Promise((resolve) => { resolveOldCategories = resolve; });
      }
      if (url.startsWith('/api/budgets/categories?')) return Promise.resolve(response({
        categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false },
      }));
      if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
      if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
      if (url.startsWith('/api/budgets?')) return Promise.resolve(response(mainBudget));
      return Promise.resolve(response({}));
    });

    render(<ProjectBudgetPage />);
    await waitFor(() => expect(resolveOldCategories).toBeDefined());
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'cc2' } });
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.noCategoryBudgetAllocated));
    resolveOldCategories?.(response({}, false));
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData))).not.toBeInTheDocument());
    expect(window.location.search).toContain('costCentreId=cc2');
  });

  it('shows category load failures while preserving the selected scope', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/budgets/categories?')) return Promise.resolve(response({}, false));
      if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
      if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
      if (url.startsWith('/api/budgets?')) return Promise.resolve(response(mainBudget));
      return Promise.resolve(response({}));
    });

    render(<ProjectBudgetPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData))).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/budgets/categories?projectId=p1&costCentreId=cc1&page=1&pageSize=50');
  });

  it('retains loaded categories and exposes an error when loading the next category page fails', async () => {
    categoriesByCostCentre.cc1 = {
      categories: [categories[0]],
      categoryPagination: { page: 1, pageSize: 1, total: 2, hasMore: true },
    };
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/budgets/categories?') && url.includes('page=2')) return Promise.resolve(response({}, false));
      if (url.startsWith('/api/budgets/categories?')) return Promise.resolve(response(categoriesByCostCentre.cc1));
      if (url === '/api/projects') return Promise.resolve(response(projectsResponse));
      if (url === '/api/auth/me') return Promise.resolve(response(roleResponse));
      if (url.startsWith('/api/budgets?')) return Promise.resolve(response(mainBudget));
      return Promise.resolve(response({}));
    });

    render(<ProjectBudgetPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBudgetPage.loadMoreCategories) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical))).toBeInTheDocument();
  });

  it('derives cost per sqft from the total budget before any approval and labels a single pending contribution', async () => {
    budgetByProject = { ...budgetByProject, p1: { ...mainBudget, costCentres: [{
      id: 'cc1', code: 'CC-01', name: 'Civil Works', areaSqFt: 400, totalBudget: 8000, approvedBudget: 0, pendingBudget: 8000, actual: 0,
      categories: [], contributions: [{ id: 'contrib-9', status: 'PENDING_PROJECT_APPROVAL', totalEstimatedValue: 8000 }],
    }] } };
    render(<ProjectBudgetPage />);
    expect(await screen.findByText('1 Budget Contribution Under Approval for Civil Works')).toBeInTheDocument();
    const costPerSqftCard = screen.getByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.costPerSqft)).closest('article');
    // 8000 total budget / 400 sqft = 20 per sqft while nothing is approved yet.
    expect(costPerSqftCard?.textContent).toContain((20).toLocaleString(I18N_CONFIG.defaultLocale));
  });

  it('handles projects with no cost centres and reports rejected budget summary reads', async () => {
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response([{ id: 'p1', projectCode: 'P-01', name: 'North Plant' }]))
      : url === '/api/auth/me'
        ? Promise.resolve(response(roleResponse))
        : url.startsWith('/api/budgets?')
          ? Promise.resolve(response({ costCentres: [], costCentrePagination: { page: 1, pageSize: 50, total: 0, hasMore: false } }))
          : Promise.resolve(response({ categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false } })));
    const emptyCostCentres = render(<ProjectBudgetPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.noCategoryBudgetAllocated));
    expect(mockFetch.mock.calls.some(([url]) => String(url).startsWith('/api/budgets/categories?'))).toBe(false);
    emptyCostCentres.unmount();

    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response([{ id: 'p1', projectCode: 'P-01', name: 'North Plant' }]))
      : url === '/api/auth/me'
        ? Promise.resolve(response(roleResponse))
        : url.startsWith('/api/budgets?')
          ? Promise.reject(new Error(''))
          : Promise.resolve(response({ categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false } })));
    render(<ProjectBudgetPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.errorLoadingBudgetData))).toBeInTheDocument();
  });

  it('renders empty project and budget error states and handles failed requests', async () => {
    projectsResponse = { data: [] };
    roleResponse = {};
    const emptyProjects = render(<ProjectBudgetPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.noCategoryBudgetAllocated))).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[1]).toBeDisabled();
    emptyProjects.unmount();

    global.fetch = jest.fn().mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response([{ id: 'p1', projectCode: 'P-01', name: 'North Plant' }]))
      : url === '/api/auth/me'
        ? Promise.resolve(response({ user: { role: 'CLIENT_ADMIN' } }))
        : Promise.resolve(response({}, false)));
    render(<ProjectBudgetPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData))).toBeInTheDocument();

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
