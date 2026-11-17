/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '../src/app/(app)/dashboard/page';

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => mockToast }));
jest.mock('../src/components/ApprovalChatDrawer', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, entityCode, initialEnquiryMode }: any) => isOpen
    ? <aside data-testid="approval-chat">{entityCode}:{String(initialEnquiryMode)}<button onClick={onClose}>Close chat</button></aside>
    : null,
}));
jest.mock('../src/components/PrDetailModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, pr, userRole }: any) => isOpen
    ? <div role="dialog" aria-label="PR details">{pr.prNumber}:{userRole}<button onClick={onClose}>Close details</button></div>
    : null,
}));
jest.mock('../src/components/ui/BoqDescriptionCell', () => ({
  __esModule: true,
  default: ({ text }: any) => <span>{text || 'No description'}</span>,
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
let dashboardData: any;
const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

function configureFetch() {
  mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve(reply({}));
    return Promise.resolve(reply(dashboardData));
  });
  global.fetch = mockFetch as typeof fetch;
}

const pendingPr = () => ({
  id: 'pr-1', prNumber: 'PR-2026-001', title: 'Electrical switchgear package',
  boq: { boqCode: 'BOQ-01' }, project: { name: 'North Plant', projectCode: 'NP-1' },
  costCentre: { code: 'CC-1', name: 'Electrical' }, categories: ['Electrical'],
  totalEstimatedValue: 5000, requesterName: 'Casey Requester', requesterEmail: 'casey@example.test',
  requestedDate: '2026-10-01', hasEnquiry: true, totalLines: 1,
  lines: [{ lineNumber: 1, description: 'Switchboard', specification: 'IEC rated', category: 'Electrical', quantity: 2, uom: 'EA', estimatedRate: 2500 }],
});

function renderForData(data: any = dashboardData) {
  dashboardData = data;
  configureFetch();
  return render(<DashboardPage />);
}

describe('role-aware dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dashboardData = { role: 'PROJECT_USER' };
    configureFetch();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { global.fetch = originalFetch; });

  it('shows the loading state before the dashboard request settles and an empty result after a request error', async () => {
    mockFetch.mockReturnValueOnce(new Promise(() => undefined));
    const pending = render(<DashboardPage />);
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Loading","toLocaleString":"role dashboard..."})))).toBeInTheDocument();
    pending.unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new Error('dashboard offline'));
    const failed = render(<DashboardPage />);
    await waitFor(() => expect(screen.queryByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Loading","toLocaleString":"role dashboard..."})))).not.toBeInTheDocument());
    expect(failed.container).toBeEmptyDOMElement();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders tenant and audit data for a super administrator with the empty-state fallbacks', async () => {
    renderForData({
      role: 'SUPER_ADMIN', tenants: 2, projects: 8, users: 12,
      tenantList: [
        { id: 'tenant-1', name: 'Buyer A', slug: 'buyer-a', status: 'ACTIVE', projectCount: 5, userCount: 6 },
      ],
      recentLogs: [
        { id: 'log-1', tenant: { name: 'Buyer A' }, action: 'UPDATED', entityType: 'PR', description: 'Changed request', user: { email: 'admin@example.test' }, createdAt: '2026-10-01T10:00:00Z' },
        { id: 'log-2', action: 'LOGIN', entityType: 'SESSION', user: {}, createdAt: '2026-10-02T10:00:00Z' },
      ],
    });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.superAdminPlatformOverview))).toBeInTheDocument();
    expect(screen.getAllByText('Buyer A').length).toBeGreaterThan(0);
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.system)).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.fullAuditTrail) })).toHaveAttribute('href', '/audit');
  });

  it('loads the next bounded tenant page without replacing the first page', async () => {
    const firstPage = {
      role: 'SUPER_ADMIN', tenants: 2, projects: 2, users: 2,
      tenantListPage: 1, tenantListPageSize: 50, tenantListTotalPages: 2,
      tenantList: [{ id: 'tenant-1', name: 'Buyer A', slug: 'buyer-a', status: 'ACTIVE', projectCount: 1, userCount: 1 }],
      recentLogs: [],
    };
    const secondPage = {
      ...firstPage, tenantListPage: 2, tenantListTotalPages: 2,
      tenantList: [{ id: 'tenant-2', name: 'Buyer B', slug: 'buyer-b', status: 'ACTIVE', projectCount: 1, userCount: 1 }],
    };
    mockFetch.mockImplementation((url: string) => Promise.resolve(reply(url.includes('page=2') ? secondPage : firstPage)));
    const page = render(<DashboardPage />);
    expect(await screen.findByText('Buyer A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('Buyer B')).toBeInTheDocument();
    expect(screen.getByText('Buyer A')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/dashboard?page=2&pageSize=50');
    page.unmount();
  });

  it('keeps the tenant register intact and reports a failed later page', async () => {
    const firstPage = {
      role: 'SUPER_ADMIN', tenants: 2, projects: 2, users: 2,
      tenantListPage: 1, tenantListPageSize: 50, tenantListTotalPages: 2,
      tenantList: [{ id: 'tenant-1', name: 'Buyer A', slug: 'buyer-a', status: 'ACTIVE', projectCount: 1, userCount: 1 }],
      recentLogs: [],
    };
    mockFetch.mockImplementation((url: string) => Promise.resolve(reply(
      url.includes('page=2') ? { error: 'Unavailable' } : firstPage,
      !url.includes('page=2'),
      url.includes('page=2') ? 503 : 200,
    )));
    render(<DashboardPage />);
    expect(await screen.findByText('Buyer A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith({
      title: UI_STRINGS.common.error,
      message: UI_STRINGS.common.userMessages.failedToFetchDashboardData,
    }));
    expect(screen.getByText('Buyer A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) })).toBeEnabled();
  });

  it('lets an approver inspect a BOQ, ask a question, chat, approve, and report API errors', async () => {
    dashboardData = { role: 'PROJECT_APPROVER', pending: 1, recentApproved: 3, recentRejected: 1, pendingPrs: [pendingPr()], recentlyApprovedList: [], recentlyRejectedList: [] };
    configureFetch();
    const page = render(<DashboardPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.approvalDashboard))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.clarificationPending))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    expect(screen.getByText('BOQ Details: PR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('IEC rated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Ask","toLocaleString":"Clarification"})) }));
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('PR-2026-001:true');
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.openCommunicationAndChatHistory)));
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('PR-2026-001:false');
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));

    mockFetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.resolve(reply({})) : Promise.resolve(reply(dashboardData)));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.approveBOQAndReleaseToProcurement)));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/approve', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(UI_STRINGS.common.bOQApprovedSuccessfully, 'PR-2026-001', UI_STRINGS.common.userMessages.releasedToProcurement));

    page.unmount();
    dashboardData = { role: 'PROJECT_APPROVER', pendingPrs: [pendingPr()], recentlyApprovedList: [], recentlyRejectedList: [] };
    configureFetch();
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.resolve(reply({ error: 'Approval blocked' }, false, 409)) : Promise.resolve(reply(dashboardData)));
    render(<DashboardPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.approvalDashboard))).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.approveBOQAndReleaseToProcurement)));
    expect(await screen.findByText('Approval blocked')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Approval blocked').parentElement!.parentElement!.querySelector('button')!);
    expect(screen.queryByText('Approval blocked')).not.toBeInTheDocument();
  });

  it('loads additional approver review lines through the tenant-scoped cursor endpoint', async () => {
    const pr = {
      ...pendingPr(),
      lineCount: 26,
      linePagination: { hasMore: true, nextCursor: 'cursor/next', pageSize: 25 },
    };
    dashboardData = { role: 'PROJECT_APPROVER', pendingPrs: [pr], recentlyApprovedList: [], recentlyRejectedList: [] };
    configureFetch();
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(reply({}));
      if (url === '/api/pr/pr-1/lines?cursor=cursor%2Fnext') {
        return Promise.resolve(reply({
          lines: [{ id: 'line-26', lineNumber: '26', itemDescription: 'Final valve', category: 'Pipes', quantity: 1, uom: 'EA' }],
          linePagination: { hasMore: false, nextCursor: null, pageSize: 25 },
        }));
      }
      return Promise.resolve(reply(dashboardData));
    });

    render(<DashboardPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.approvalDashboard));
    fireEvent.click(screen.getByRole('button', {
      name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, { currency: 'Review', toLocaleString: 'BOQ' })),
    }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));

    expect(await screen.findByText('Final valve')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/lines?cursor=cursor%2Fnext');
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) })).not.toBeInTheDocument();
  });

  it('requires a reason for return and rejection and submits both review actions', async () => {
    dashboardData = { role: 'PROJECT_APPROVER', pendingPrs: [pendingPr()], recentlyApprovedList: [], recentlyRejectedList: [] };
    renderForData();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.approvalDashboard));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.revertBOQToProjectUserForCorrection)));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.specificReasonsAndCorrectionInstructionsForProjectUserMandatory)), { target: { value: 'Correct the quantity' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/revert', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body as string)).toEqual({ reason: 'Correct the quantity' });

    mockFetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.resolve(reply({})) : Promise.resolve(reply(dashboardData)));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.rejectBOQWithMandatoryReason)));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.reasonForRejectionMandatory)), { target: { value: 'Missing compliance data' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/reject', expect.objectContaining({ method: 'POST' })));
  });

  it('covers approval review, chat, revert, reject, approve, and status dismissal actions', async () => {
    dashboardData = { role: 'PROJECT_APPROVER', pendingPrs: [pendingPr()], recentlyApprovedList: [], recentlyRejectedList: [] };
    renderForData();
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.approvalDashboard));

    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.sendQueryOrClarificationToSubmitter)));
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('PR-2026-001:true');
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));

    const openReview = () => fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) }));
    openReview();
    const reviewHeading = screen.getByRole('heading', { name: 'BOQ Details: PR-2026-001' });
    fireEvent.click(reviewHeading.closest('.card')!.querySelector('button')!);
    expect(screen.queryByRole('heading', { name: 'BOQ Details: PR-2026-001' })).not.toBeInTheDocument();

    openReview();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Chat","toLocaleString":"with Requester"})) }));
    expect(screen.getByTestId('approval-chat')).toHaveTextContent('PR-2026-001:false');
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));

    openReview();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
    expect(screen.queryByRole('heading', { name: 'BOQ Details: PR-2026-001' })).not.toBeInTheDocument();

    openReview();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Revert","toLocaleString":"for Correction"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.revertBOQForCorrection))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));

    openReview();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"BOQ"})) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.rejectPurchaseRequest))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));

    openReview();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Approve","toLocaleString":"& Release to Procurement"})) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-1/approve', expect.objectContaining({ method: 'POST' })));
    const status = await screen.findByText(uiStringPattern(UI_STRINGS.common.bOQApprovedSuccessfully));
    fireEvent.click(status.parentElement!.parentElement!.querySelector('button')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.bOQApprovedSuccessfully))).not.toBeInTheDocument();
  });

  it('renders procurement and category manager registers with filtering, expansion, category health, and details', async () => {
    const item = {
      id: 'boq-1', boqCode: 'BOQ-2026-1', prNumber: 'PR-2026-1', title: 'HVAC package',
      projectName: 'East Plant', costCentre: 'CC-4 - HVAC', costCentreCode: 'CC-4', category: 'HVAC',
      itemCount: 2, requestedValue: 1200, sourcingStage: 'Negotiation',
      rfqs: [{ id: 'rfq-1', rfqNumber: 'RFQ-1', title: 'Chiller quote', status: 'NEGOTIATION', negotiationStage: 'Round 1', openUrl: '/procurement/rfqs/rfq-1' }],
    };
    const data = {
      role: 'CATEGORY_MANAGER', tenant: { name: 'East Tenant' }, summaryCards: { approvedBoqs: 3, prsReceived: 1, rfqsInProgress: 1, negotiationsPending: 1, awardsPpoPending: 1 },
      boqRegister: [item], categories: [{ id: 'cat-1', name: 'HVAC', children: [{ id: 'sub-1', name: 'Chillers' }] }],
      categoryCount: 1, revisionsWithExceptions: [{ id: 'rev-1', boq: { project: { name: 'East Plant' }, boqCode: 'BOQ-1' }, revisionCode: 'R2', errorLines: 1, warningLines: 2, qualityScore: 70 }],
    };
    renderForData(data);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.categoryManagerSourcingGateway))).toBeInTheDocument();
    expect(screen.queryByText('PR-DEMO-001')).not.toBeInTheDocument();
    expect(screen.getByText('PR-2026-1')).toBeInTheDocument();
    expect(screen.getByText('RFQ-1')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppDashboardPage.searchBOQCodeRFQPackageProjectCostCentre)), { target: { value: 'east plant' } });
    expect(screen.getByText('PR-2026-1')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppDashboardPage.searchBOQCodeRFQPackageProjectCostCentre)), { target: { value: 'not a match' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.noMatchingBOQCommercialBaselinesFound))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.clearAllFilters) }));
    for (const title of [
      'Click to filter Approved BOQs awaiting sourcing',
      'Click to filter RFQs in progress',
      'Click to filter negotiations pending',
      'Click to filter awards and PPOs pending',
    ]) {
      fireEvent.click(screen.getByTitle(title));
      expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.filteredBy, "", false))).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.resetFilter, "", false) }));
    }
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Negotiation' } });
    expect(screen.getByText('PR-2026-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.clearAllFilters) }));
    if (screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.collapseAllBOQs) })) {
      fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.collapseAllBOQs) }));
    }
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.expandAllBOQs) }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.collapseAllBOQs) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.collapseAllBOQs) }));
    expect(screen.queryByText('RFQ-1')).not.toBeInTheDocument();
    screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.expandNestedRFQs)).forEach((button) => fireEvent.click(button));
    expect(screen.getByText('RFQ-1')).toBeInTheDocument();
    screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.collapseNestedRFQs)).forEach((button) => fireEvent.click(button));
    expect(screen.queryByText('RFQ-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.expandAllBOQs) }));
    expect(screen.getByText('RFQ-1')).toBeInTheDocument();
    screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToToggleAssociatedRFQPackages)).forEach((button) => fireEvent.click(button));
    expect(screen.queryByText('RFQ-1')).not.toBeInTheDocument();
    screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToToggleAssociatedRFQPackages)).forEach((button) => fireEvent.click(button));
    expect(screen.getByText('RFQ-1')).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Category","toLocaleString":"Masters & Specification Quality Health"}))));
    expect(screen.getByText('Chillers')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"BOQs","toLocaleString":"Requiring Category Specification Quality Attention"})))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.manageCategoryMasters) }));
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.manageCategoryMasters) })).toHaveAttribute('href', '/masters/categories');
    const categoryViewDetails = screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.viewDetails) }).find((button) =>
      button.closest('tr')?.textContent?.includes('PR-2026-1')
    )!;
    fireEvent.click(categoryViewDetails);
    expect(screen.getByRole('dialog', { name: 'PR details' })).toHaveTextContent('PR-2026-1:CATEGORY_MANAGER');
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  });

  it('builds RFQ creation links from explicit URLs, revision IDs, project IDs, and nested project fallbacks', async () => {
    renderForData({
      role: 'CATEGORY_MANAGER',
      tenant: { name: 'Link Test Tenant' },
      summaryCards: {},
      boqRegister: [
        { id: 'boq-explicit', title: 'Explicit URL', createRfqUrl: '/procurement/rfqs/new?source=dashboard', rfqs: [] },
        { id: 'boq-revision', title: 'Revision URL', boqRevisionId: 'revision-1', projectId: 'project-1', rfqs: [] },
        { id: 'boq-fallback', title: 'Fallback URL', revisionId: 'revision-2', project: { id: 'project-2' }, rfqs: [] },
      ],
      categories: [],
      revisionsWithExceptions: [],
    });

    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.categoryManagerSourcingGateway))).toBeInTheDocument();
    screen.getAllByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToToggleAssociatedRFQPackages)).forEach((button) => fireEvent.click(button));

    const createLinks = screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.createRFQPackage) });
    expect(createLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/procurement/rfqs/new?source=dashboard',
      '/procurement/rfqs/new?revisionId=revision-1&projectId=project-1',
      '/procurement/rfqs/new?revisionId=revision-2&projectId=project-2',
    ]);
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.createFirstRFQPackage) })
      .map((link) => link.getAttribute('href'))).toEqual([
      '/procurement/rfqs/new?source=dashboard',
      '/procurement/rfqs/new?revisionId=revision-1&projectId=project-1',
      '/procurement/rfqs/new?revisionId=revision-2&projectId=project-2',
    ]);
  });

  it('filters procurement BOQs by search, stage, and every summary card and toggles associated RFQs', async () => {
    const procurementRegister = [
      {
        id: 'boq-negotiation', boqCode: 'BOQ-NEG', prNumber: 'PR-NEG', title: 'Cable installation',
        projectName: 'North Plant', costCentre: 'CC-1 - Electrical', category: 'Electrical',
        sourcingStage: 'Negotiation', requestedValue: 4000, itemCount: 2,
        rfqs: [{
          id: 'rfq-neg', rfqNumber: 'RFQ-NEG', description: 'Cable sourcing', packageName: 'Cable package', status: 'NEGOTIATION',
          vendorInvitationProgress: '2 invited', quotationStage: 'Comparison complete', negotiationStage: 'Round 1',
          awardStatus: 'Pending Approval', ppoStatus: 'Ready', lastUpdated: '2026-10-10',
        }],
      },
      {
        id: 'boq-awaiting', boqNumber: 'BOQ-WAIT', title: 'Panel boards', projectName: 'South Plant',
        costCentre: 'CC-2 - Electrical', currentStage: 'Awaiting RFQ', benchmarkTotal: 0, itemCount: 1,
        date: 'invalid date', rfqs: [],
      },
    ];
    renderForData({ role: 'PROCUREMENT_USER', tenant: { name: 'Tenant One' }, boqRegister: procurementRegister });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.procurementWorkspace))).toBeInTheDocument();
    expect(screen.getByText('RFQ-NEG')).toBeInTheDocument();
    expect(screen.getByText('1 Package Linked')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterBOQsAwaitingSourcing)));
    expect(screen.getByText('BOQ-WAIT')).toBeInTheDocument();
    expect(screen.queryByText('BOQ-NEG')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterBOQsAwaitingSourcing)));
    expect(screen.getByText('BOQ-NEG')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterBOQsAwaitingSourcing)));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.resetFilter, "", false) }));

    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterRFQsInProgress)));
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.rFQsInProgress)).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterRFQsInProgress)));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterNegotiationsPending)));
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.negotiationsPending)).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterNegotiationsPending)));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterAwardsAndPPOsPending)));
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.awardsPPOPending)).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToFilterAwardsAndPPOsPending)));

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppDashboardPage.searchBOQBOQDescriptionCostCentreRFQ)), { target: { value: 'rfq-neg' } });
    expect(screen.getByText('BOQ-NEG')).toBeInTheDocument();
    expect(screen.queryByText('BOQ-WAIT')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Negotiation' } });
    expect(screen.getByText('BOQ-NEG')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.clearAllFilters) }));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.collapseRFQs) }));
    expect(screen.queryByText('RFQ-NEG')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.expandAllRFQs) }));
    expect(screen.getByText('RFQ-NEG')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToToggleAssociatedRFQPackages)));
    expect(screen.queryByText('RFQ-NEG')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.clickToToggleAssociatedRFQPackages)));
    expect(screen.getByText('RFQ-NEG')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.hideLinkedRFQs)));
    expect(screen.queryByText('RFQ-NEG')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.viewLinkedRFQs)));
    expect(screen.getByText('RFQ-NEG')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.openRFQ) })).toHaveAttribute('href', '/procurement/rfqs/rfq-neg');
    expect(screen.getByTitle(uiStringPattern(UI_STRINGS.appAppDashboardPage.raiseRFQForThisApprovedBOQ))).toHaveAttribute('href', '/procurement/rfqs/new?boqId=boq-awaiting&boqRevisionId=boq-awaiting');
  });

  it('renders finance, client administrator, viewer, and project-user dashboards', async () => {
    const finance = renderForData({ role: 'FINANCE_USER', totalBudget: 9000, totalProjects: 2, approvedProjects: 1, projects: [{ id: 'p1', projectCode: 'NP-1', name: 'North Plant', costCentre: null, budget: 5000, currency: 'USD', status: 'UNMAPPED', projectOwner: null }] });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.financeCapexControlWorkspace))).toBeInTheDocument();
    expect(screen.getByText('North Plant')).toBeInTheDocument();
    expect(screen.getByText('UNMAPPED')).toBeInTheDocument();
    finance.unmount();

    const client = renderForData({ role: 'CLIENT_ADMIN', totalProjects: 3, activeProjects: 2, pendingApprovals: 1, totalUsers: 5, recentActivity: [{ id: 'a1', action: 'CREATE', entityType: 'PROJECT', description: 'New project', user: {}, createdAt: '2026-01-01' }] });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.clientAdministrationDashboard))).toBeInTheDocument();
    expect(screen.getByText('Tenant Governance: Organization')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.newProject) })).toHaveAttribute('href', '/projects/new');
    client.unmount();

    const viewer = renderForData({ role: 'VIEWER', totalProjects: 51, projectPreviewLimit: 50, projectsHasMore: true, projects: [{ id: 'p2', projectCode: 'P-2', name: 'South Plant', sector: 'RETAIL', status: 'APPROVED', boqs: [] }] });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.projectBOQViewerReadOnly))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.noBOQ))).toBeInTheDocument();
    expect(viewer.container).toHaveTextContent(interpolateUiString(UI_STRINGS.appAppDashboardPage.dashboardViewerProjectPreviewNotice, { "limit": 50 }));
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.allProjects) })).toHaveAttribute('href', '/projects');
    viewer.unmount();

    renderForData({ role: 'PROJECT_USER', pendingActions: [{ id: 'a1', boqCode: 'BOQ-4', title: 'Review draft', status: 'DRAFT', actionText: 'Submit BOQ', link: '/boq/4' }], totalBoqsRaised: 2, totalProposedBudget: 1500, totalApprovedBudget: 1000, recentBoqs: [{ id: 'b1', boqNumber: 'BOQ-5', boqDescription: 'Electrical work', costCentre: 'CC-2', estimatedValue: 400, status: 'APPROVED', lastUpdated: null }] });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.procurementTransactionDashboard))).toBeInTheDocument();
    expect(screen.getByText('Pending Actions Requiring Your Attention (1)')).toBeInTheDocument();
    expect(screen.getByText('Electrical work')).toBeInTheDocument();
  });

  it('covers sparse role data, optional fields, category sourcing stages, and search fallbacks', async () => {
    const superAdmin = renderForData({ role: 'SUPER_ADMIN', tenantList: [], recentLogs: [] });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.superAdminPlatformOverview))).toBeInTheDocument();
    expect(superAdmin.container).toHaveTextContent('Active Tenants0');
    superAdmin.unmount();

    const approver = renderForData({
      role: 'PROJECT_APPROVER', pendingPrs: [], recentlyApprovedList: [], recentlyRejectedList: [],
    });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.approvalQueueIsClear))).toBeInTheDocument();
    approver.unmount();

    const procurement = renderForData({
      role: 'PROCUREMENT_USER', tenant: {}, summaryCards: {}, prRegister: [
        { id: 'search-row', boqCode: 'BOQSEARCH', prNumber: 'PRSEARCH', description: 'DESCRIPTIONSEARCH', projectName: 'PROJECTSEARCH', costCentre: 'CENTRESEARCH', category: 'CATEGORYSEARCH', itemCount: 0, totalLines: 4, costCentreCode: '', boqNumber: 'BOQNUMBER', date: 'invalid-date', sourcingStage: 'Unmapped Stage', rfqs: [{ id: 'r-search', rfqNumber: 'RFQNUMBERSEARCH', description: 'RFQDESCRIPTIONSEARCH', status: 'OTHER', negotiationStage: '—', awardStatus: 'Draft', ppoStatus: '—' }] },
        ...['RFQ Issued', 'Quotations', 'Award', 'PPO', 'Closed / Cancelled'].map((stage, index) => ({
          id: `procurement-stage-${index}`, boqCode: `BOQ-PROCESS-${index}`, title: `Process ${index}`,
          sourcingStage: stage, costCentre: 'CC-PROCESS', date: '2026-10-01', rfqs: [],
        })),
      ],
    });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.procurementWorkspace))).toBeInTheDocument();
    expect(procurement.container.textContent).toContain('BOQSEARCH');
    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppDashboardPage.searchBOQBOQDescriptionCostCentreRFQ));
    fireEvent.change(search, { target: { value: 'rfqdescriptionsearch' } });
    expect(procurement.container.textContent).toContain('BOQSEARCH');
    procurement.unmount();

    const stageNames = [
      'Approved BOQ â€” Awaiting RFQ', 'Approved PR â€” Awaiting RFQ', 'RFQ Preparation',
      'RFQ Issued / Awaiting Quotations', 'RFQ Issued', 'Awaiting Quotations', 'Quotation Comparison',
      'Negotiation', 'Rates Locked', 'Award Pending Approval', 'Award Approved', 'PPO Created',
      'Closed / Cancelled', 'Unmapped Stage',
    ];
    const categoryRows: any[] = stageNames.map((stage, index) => ({
      id: `stage-${index}`, boqCode: `BOQ-STAGE-${index}`, prNumber: index === 4 ? '' : `PR-STAGE-${index}`,
      title: index === 5 ? '' : `Package ${index}`, description: `Description ${index}`, projectName: 'Stage Project',
      costCentre: 'CC-STAGE', category: 'Stage Category', sourcingStage: stage,
      itemCount: index === 0 ? 0 : undefined, totalLines: index === 1 ? 3 : undefined,
      costCentreCode: index === 2 ? 'CC-FALLBACK' : undefined,
      rfqs: index === 3 ? [{
        id: 'rfq-fallback', rfqNumber: 'RFQ-FALLBACK', title: 'RFQ title', description: 'RFQ description',
        status: 'FINAL_RATE_LOCKED', negotiationStage: '—', negotiationRound: 'Round 2',
        nextResponsibleParty: 'VENDOR', awardStatus: 'Award Recommended', ppoStatus: '—',
        packageName: 'Separate package',
      }] : [],
    }));
    const lifecycleStatuses = ['RELEASED', 'VENDOR_RESPONSE_OPEN', 'COMPARISON', 'RESPONSE_CLOSED', 'NEGOTIATION', 'FINAL_RATE_LOCKED', 'OTHER'];
    categoryRows.push(...lifecycleStatuses.map((status, index) => ({
      id: `lifecycle-${index}`, boqCode: `BOQ-LIFECYCLE-${index}`, prNumber: `PR-LIFECYCLE-${index}`,
      title: `Lifecycle ${index}`, description: `Lifecycle description ${index}`, projectName: 'Lifecycle Project',
      costCentre: 'CC-LIFECYCLE', category: 'Lifecycle', sourcingStage: 'Other Lifecycle Stage', itemCount: 1,
      totalLines: undefined, costCentreCode: undefined,
      rfqs: [{
        id: `rfq-lifecycle-${index}`, rfqNumber: `RFQ-LIFECYCLE-${index}`, title: `RFQ lifecycle ${index}`,
        description: `RFQ lifecycle description ${index}`, status,
        negotiationStage: index === 5 ? 'Round 3' : '—', negotiationRound: index === 5 ? 'Round 3' : undefined,
        nextResponsibleParty: index === 0 ? 'BUYER' : index === 1 ? 'UNKNOWN' : undefined,
        awardStatus: index === 0 || index === 6 ? 'Not Prepared' : index === 1 ? 'Approved' : index === 2 ? 'Pending Approval' : 'Draft',
        ppoStatus: index === 6 ? 'READY' : '—', recommendedVendor: index === 1 ? 'Vendor Lifecycle' : undefined,
        packageName: index === 2 ? `RFQ lifecycle description ${index}` : undefined,
        pendingAction: index === 3 ? 'Buyer review' : undefined,
      }],
    })));
    const category = renderForData({
      role: 'CATEGORY_MANAGER', tenant: {}, approvedBoqsCount: 7, activeRfqsCount: 2,
      negotiationsCount: 3, awardsPendingCount: 4, consolidatedRegister: categoryRows,
      categories: [{ id: 'empty-cat', name: 'No children' }], revisionsWithExceptions: [],
    });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.categoryManagerSourcingGateway))).toBeInTheDocument();
    fireEvent.click(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Category","toLocaleString":"Masters & Specification Quality Health"}))));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.noSubcategories))).toBeInTheDocument();
    expect(screen.getByText(/All BOQ revisions meet category taxonomy/)).toBeInTheDocument();
    for (const stage of stageNames) {
      expect(screen.getAllByText(stage).some((element) => element.closest('span')?.classList.contains('badge'))).toBe(true);
    }
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppDashboardPage.expandAllBOQs) }));
    for (const title of [
      'Click to filter Approved BOQs awaiting sourcing',
      'Click to filter RFQs in progress',
      'Click to filter negotiations pending',
      'Click to filter awards and PPOs pending',
    ]) {
      fireEvent.click(screen.getByTitle(title));
      expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.filteredBy, "", false))).toBeInTheDocument();
      fireEvent.click(screen.getByTitle(title));
      expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.filteredBy, "", false))).not.toBeInTheDocument();
    }
    category.unmount();

    const finance = renderForData({ role: 'FINANCE_USER', projects: [{ id: 'p-empty', projectCode: 'P-EMPTY', name: 'Empty Finance Project', budget: 0, currency: '', costCentre: '', projectOwner: '' }] });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.financeCapexControlWorkspace))).toBeInTheDocument();
    expect(screen.getByText('Empty Finance Project').closest('tr')).toHaveTextContent(uiStringPattern(UI_STRINGS.common.iNR));
    finance.unmount();

    const client = renderForData({ role: 'CLIENT_ADMIN', recentActivity: [{ id: 'activity-empty', action: 'VIEW', entityType: 'PROJECT', user: {}, createdAt: '2026-01-01' }] });
    expect(await screen.findByText('Tenant Governance: Organization')).toBeInTheDocument();
    expect(screen.getByText('PROJECT:')).toBeInTheDocument();
    client.unmount();

    const viewer = renderForData({ role: 'VIEWER', projects: [{ id: 'p-revision', projectCode: 'P-REV', name: 'Revision Project', sector: 'INDUSTRIAL', status: 'APPROVED', boqs: [{ revisions: [{ revisionCode: 'R3', totalLines: 8 }] }] }] });
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppDashboardPage.revisionCodeTotalLinesLines, {"revisionCode":"R3","totalLines":"8"})))).toBeInTheDocument();
    viewer.unmount();

    const projectUser = renderForData({ role: 'PROJECT_USER', pendingActions: [], recentBoqs: [
      { id: 'boq-fallback', boqNumber: 'BOQ-FALLBACK', boqDescription: '—', costCentre: '', estimatedValue: 0, lastUpdated: null },
      { id: 'boq-full', boqNumber: 'BOQ-FULL', boqDescription: 'Electrical upgrade', costCentre: 'CC-FULL', estimatedValue: 1000, lastUpdated: '2026-10-10' },
    ] });
    expect(await screen.findByText('BOQ-FALLBACK')).toBeInTheDocument();
    expect(screen.getByText('Electrical upgrade')).toHaveAttribute('title', 'Electrical upgrade');
  });

  it('covers approver sparse records, empty reason guards, and action failure fallbacks', async () => {
    const linePr = {
      id: 'pr-lines', prNumber: '', title: 'Sparse lines package', boq: { boqCode: 'BOQ-SPARSE' },
      project: {}, costCentre: {}, categories: [], totalEstimatedValue: 0, requesterName: '', requestedBy: 'Fallback requester',
      requestedDate: '', createdAt: '2026-10-01', hasEnquiry: false, lines: [{
        lineNumber: 0, description: 'Valve', specification: '', boqLine: { specification: 'Backup specification' },
        category: 'Pipes', quantity: 2, uom: 'EA', estimatedRate: 0, estimatedValue: 0,
      }],
    };
    const emptyLinesPr = {
      id: 'pr-empty-lines', prNumber: '', title: 'Empty lines package',
      boq: {}, project: null, costCentre: null, totalEstimatedValue: 0,
      requestedBy: 'Fallback requester', createdAt: '2026-10-02', totalLines: 5, hasEnquiry: false,
    };
    dashboardData = {
      role: 'PROJECT_APPROVER', pendingPrs: [linePr, emptyLinesPr],
      recentlyApprovedList: [
        { id: 'approved-boq-code', boq: { boqCode: 'BOQ-APPROVED' }, status: 'APPROVED', updatedAt: '2026-10-03' },
        { id: 'approved-pr-number', prNumber: 'PR-APPROVED', status: 'APPROVED', updatedAt: '2026-10-04' },
      ],
    };
    configureFetch();
    const page = render(<DashboardPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppDashboardPage.approvalDashboard))).toBeInTheDocument();
    expect(screen.getAllByText('Fallback requester')).toHaveLength(2);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.standard))).toHaveLength(2);
    expect(screen.getByText('5 line items')).toBeInTheDocument();
    expect(screen.getByText('BOQ-APPROVED')).toBeInTheDocument();
    expect(screen.getByText('PR-APPROVED')).toBeInTheDocument();

    const openReview = () => fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) })[0]);
    const openSparseReview = () => fireEvent.click(
      screen.getByText('Sparse lines package').closest('tr')!.querySelector('button[title="Review complete BOQ details and line items"]')!
    );
    const closeReview = () => {
      const heading = screen.getByRole('heading', { name: uiStringPattern(UI_STRINGS.common.bOQDetails, "", false) });
      fireEvent.click(heading.closest('.card')!.querySelector('button')!);
    };
    openReview();
    expect(screen.getAllByText('Fallback requester').length).toBeGreaterThan(0);
    expect(screen.getByText('Backup specification')).toBeInTheDocument();
    closeReview();

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Review","toLocaleString":"BOQ"})) })[1]);
    expect(screen.getByRole('heading', { name: uiStringPattern(UI_STRINGS.common.bOQDetails, "", false) })).toBeInTheDocument();
    closeReview();

    openReview();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Revert","toLocaleString":"for Correction"})) }));
    const revertInput = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.specificReasonsAndCorrectionInstructionsForProjectUserMandatory));
    fireEvent.submit(revertInput.closest('form')!);
    expect(mockFetch.mock.calls.filter(([url, init]) => String(url) !== '/api/observability/client' && init?.method === 'POST')).toHaveLength(0);
    fireEvent.change(revertInput, { target: { value: 'Fix quantities' } });
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.resolve(reply({}, false, 500)) : Promise.resolve(reply(dashboardData)));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRevertForCorrection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.revertFailed))).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }).at(-1)!);

    openSparseReview();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Reject","toLocaleString":"BOQ"})) }));
    const rejectInput = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.reasonForRejectionMandatory));
    fireEvent.submit(rejectInput.closest('form')!);
    expect(mockFetch.mock.calls.filter(([url, init]) => String(url) !== '/api/observability/client' && init?.method === 'POST')).toHaveLength(1);
    fireEvent.change(rejectInput, { target: { value: 'Reject incomplete package' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.confirmRejection) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.rejectionFailed))).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }).at(-1)!);

    openSparseReview();
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.approveBOQAndReleaseToProcurement)).at(-1)!);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.approvalFailed))).toBeInTheDocument();
    closeReview();
    openSparseReview();
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === 'POST' ? Promise.resolve(reply({})) : Promise.resolve(reply(dashboardData)));
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.approveBOQAndReleaseToProcurement)).at(-1)!);
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(UI_STRINGS.common.bOQApprovedSuccessfully, 'pr-empty-lines', UI_STRINGS.common.userMessages.releasedToProcurement));
    page.unmount();
  });

  it('handles a forbidden dashboard response and session fallback', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(reply({}, false, 403)));
    global.fetch = mockFetch as typeof fetch;
    const page = render(<DashboardPage />);
    await waitFor(() => expect(screen.queryByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Loading","toLocaleString":"role dashboard..."})))).not.toBeInTheDocument());
    expect(page.container).toBeEmptyDOMElement();
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/session');
  });
});
