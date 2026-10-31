/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorRatingsApprovalsPage from '../src/app/(app)/approvals/vendor-ratings/page';

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockToastSuccess, error: mockToastError }) }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}));
jest.mock('../src/components/ui/Card', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }: { status: string }) => <span data-testid="workflow-status">{status}</span>,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
let ratings: any[] = [];
let queueResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };
let decisionResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };

function rating(id: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id, tenantId: 'tenant-1', vendorId: `vendor-${id}`, ppoId: `ppo-${id}`,
    qualityScore: 4, deliveryScore: 3, commercialComplianceScore: 5, responsivenessScore: 4,
    documentationClosureScore: 3, overallScore: 4.1, comments: 'General improvement notes', status,
    ratedBy: 'user-1', ratedByName: 'Priya Reviewer', ratedAt: '2026-03-01T10:00:00.000Z',
    createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-02T10:00:00.000Z',
    qualityComments: 'Good quality', deliveryComments: 'On time', commercialComments: 'Invoice matches',
    documentationComments: 'Complete pack', responsivenessComments: 'Responsive',
    overallImprovement: 'Continue weekly status updates', approverComments: 'Reviewed',
    decisionHistory: [
      { action: 'SUBMITTED', performedByName: 'Priya', performedByRole: 'PROJECT_USER', timestamp: '2026-03-01T10:00:00Z', comments: 'Submitted assessment' },
      { action: 'RETURNED', performedByName: 'Asha', performedByRole: 'PROJECT_APPROVER', timestamp: '2026-03-02T10:00:00Z' },
    ],
    vendor: { id: `vendor-${id}`, code: `V-${id}`, name: `Vendor ${id}`, vendorType: 'Manufacturer', categories: 'Electrical', performanceScore: 4.3 },
    ppo: {
      id: `ppo-${id}`, ppoNumber: `PPO-${id}`, title: `Package ${id}`, totalValue: 125000, status: 'COMPLETED', completedAt: '2026-02-28',
      project: { id: 'project-1', name: `Project ${id}`, projectCode: 'PRJ-1' },
      costCentre: { id: 'cc-1', name: 'Electrical Works', code: 'CC-01' },
    },
    ...extra,
  };
}

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function setupFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/approvals/vendor-ratings' && init?.method === 'POST') {
      return Promise.resolve(response(decisionResponse.body, decisionResponse.ok));
    }
    return Promise.resolve(response(queueResponse.body, queueResponse.ok));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('vendor performance approval desk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ratings = [
      rating('submitted', 'SUBMITTED', { approverComments: '' }),
      rating('approved', 'APPROVED', { approvedByName: '', approvedAt: null, approverComments: '' }),
      rating('returned', 'RETURNED_FOR_CORRECTION', { returnReason: 'Add handover records' }),
      rating('rejected', 'REJECTED', {
        ratedByName: '', overallImprovement: '', comments: '', approverComments: '', approvedByName: '',
        qualityComments: '', deliveryComments: '', commercialComments: '', documentationComments: '', responsivenessComments: '',
        decisionHistory: [], vendor: { name: 'Rejected Vendor', code: 'V-R', vendorType: 'Supplier' },
        ppo: { ppoNumber: 'PPO-REJECTED', title: 'Rejected package' },
      }),
    ];
    queueResponse = { ok: true, body: { data: { ratings, counts: { pendingCount: 1, approvedCount: 1, returnedCount: 1, totalCount: 5, totalEvaluatedValue: 250000 } } } };
    decisionResponse = { ok: true, body: {} };
    setupFetch();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('shows the loading state and renders queue status, counters, tabs, and search filters', async () => {
    mockFetch.mockReturnValueOnce(new Promise(() => undefined));
    const pending = render(<VendorRatingsApprovalsPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.loadingVendorPerformanceApprovals))).toBeInTheDocument();
    pending.unmount();

    setupFetch();
    render(<VendorRatingsApprovalsPage />);
    expect(await screen.findByText('PPO-submitted')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.pendingApproval, '', true)).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.approvedRatings))).toBeInTheDocument();
    expect(screen.getByText('Vendor submitted')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.toLocaleString2, {"toLocaleString":"2.5L"})))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Approved \(1\)/ }));
    expect(screen.getByText('PPO-approved')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.approved, '', true))).toBeInTheDocument();
    expect(screen.queryByText('PPO-submitted')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppApprovalsVendorRatingsPage.returnedCount, { count: 1 })) }));
    expect(screen.getByText('PPO-returned')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.returned, '', true))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /All Records \(5\)/ }));
    expect(screen.getByText(UI_STRINGS.componentsUiStatusBadge.rejected)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.project, '', true))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.costCentre2, '', true))).toBeInTheDocument();
    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.searchByPPOVendorOrProject));
    fireEvent.change(search, { target: { value: 'ppo-rejected' } });
    expect(screen.getByText('PPO-REJECTED')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'rejected vendor' } });
    expect(screen.getByText('PPO-REJECTED')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'project submitted' } });
    expect(screen.getByText('PPO-submitted')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'missing record' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.noPerformanceRatingRecordsMatchedTheActiveFilterCriteria))).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /All Records \(5\)/ }));
    fireEvent.click(within(screen.getByRole('row', { name: /PPO-REJECTED/ })).getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.viewAssessment) }));
    expect(screen.getByText(/submitted by Project User/)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.toLocaleString2, {"toLocaleString":"0"}))).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.noSpecificQualityObservationsNoted))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.noSpecificDeliveryDelaysOrIssuesRecorded))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.invoicesMatchedAgreedPPORateStructure))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.documentationDeliveredPerContractRequirements))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.communicationWasPromptAndConstructive))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.noExplicitCorrectiveActionsRequested))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.decisionAuditTrail))).not.toBeInTheDocument();
  });

  it('shows complete submitted assessment details and requires comments for return and rejection', async () => {
    render(<VendorRatingsApprovalsPage />);
    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsIdPage.reviewDecide, "", false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.vendorPerformanceAssessmentReview))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.sectionAOrderScopeInformation))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.categoryRatingsIndividualObservations))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.qualityOfGoodsWork30))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.deliveryTime25))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.costCommercial20))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.documentationClosure10))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.responsivenessCoordination15))).toBeInTheDocument();
    expect(screen.getByText('Continue weekly status updates')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.sectionBProjectApproverComments))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.decisionAuditTrail))).toBeInTheDocument();
    expect(screen.getByText(/Submitted assessment/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.returnForCorrection) }));
    expect(screen.getByText('Approver comments are mandatory when returning or rejecting an assessment.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.rejectAssessment) }));
    expect(screen.getByText('Approver comments are mandatory when returning or rejecting an assessment.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Record justification for accepting/), { target: { value: 'Please attach completion certificates.' } });
    decisionResponse = { ok: false, body: { error: 'Return service unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.returnForCorrection) }));
    expect(await screen.findByText('Return service unavailable')).toBeInTheDocument();
    decisionResponse = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.returnForCorrection) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.assessmentReturnedToSubmitterForCorrection, 'PPO-submitted'));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals/vendor-ratings', expect.objectContaining({ method: 'POST' }));
  });

  it('confirms acceptance, handles rejection and request exceptions, and closes review dialogs', async () => {
    render(<VendorRatingsApprovalsPage />);
    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsIdPage.reviewDecide, "", false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.acceptRating) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.confirmPerformanceRatingAcceptance))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.backToReview) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.confirmPerformanceRatingAcceptance))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.acceptRating) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.confirmPublishScore) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.performanceAssessmentAcceptedPublishedToVendorScorecard, 'PPO-submitted'));

    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsIdPage.reviewDecide, "", false) }));
    fireEvent.change(screen.getByPlaceholderText(/Record justification for accepting/), { target: { value: 'Evidence does not support this score.' } });
    decisionResponse = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.rejectAssessment) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.assessmentRejected, 'PPO-submitted'));

    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsIdPage.reviewDecide, "", false) }));
    fireEvent.change(screen.getByPlaceholderText(/Record justification for accepting/), { target: { value: 'Review evidence.' } });
    mockFetch.mockRejectedValueOnce(new Error('decision network down'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.rejectAssessment) }));
    expect(await screen.findByText('decision network down')).toBeInTheDocument();
    decisionResponse = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.rejectAssessment) }));
    expect(await screen.findByText('Failed to record decision.')).toBeInTheDocument();
    mockFetch.mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.rejectAssessment) }));
    expect(await screen.findByText('Network error recording decision.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.closeReview) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.vendorPerformanceAssessmentReview))).not.toBeInTheDocument();
  });

  it('renders approved assessment history and handles queue failures and empty results', async () => {
    render(<VendorRatingsApprovalsPage />);
    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: /Approved \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsIdPage.viewAssessment, "", false) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.approvedByNameOnDate))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.approvedWithNoAdditionalRemarks))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.common.acceptRating) })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.closeReview) }));

    queueResponse = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.allRecords, "", false) }));
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToLoadVendorPerformanceApprovalsQueue));

    queueResponse = { ok: true, body: {} };
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button'));
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/approvals/vendor-ratings'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.pendingApproval, "", false) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppApprovalsVendorRatingsPage.thereAreCurrentlyNoVendorPerformanceRatingsAwaitingProjectApproverReview))).toBeInTheDocument();
    queueResponse = { ok: true, body: { ratings: [], counts: { pendingCount: 0, approvedCount: 0, returnedCount: 0, totalCount: 0, totalEvaluatedValue: 0 } } };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new Error('queue network down'));
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button'));
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(mockToastError).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.networkErrorWhileLoadingApprovalsQueue);
    consoleError.mockRestore();
  });
});
