/** @jest-environment jsdom */
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
    expect(screen.getByText('Loading vendor performance approvals...')).toBeInTheDocument();
    pending.unmount();

    setupFetch();
    render(<VendorRatingsApprovalsPage />);
    expect(await screen.findByText('PPO-submitted')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Approved Ratings')).toBeInTheDocument();
    expect(screen.getByText('Vendor submitted')).toBeInTheDocument();
    expect(screen.getByText('₹2.5L')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Approved \(1\)/ }));
    expect(screen.getByText('PPO-approved')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('PPO-submitted')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Returned \(1\)/ }));
    expect(screen.getByText('PPO-returned')).toBeInTheDocument();
    expect(screen.getByText('Returned')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /All Records \(5\)/ }));
    expect(screen.getByText('REJECTED')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Cost Centre')).toBeInTheDocument();
    const search = screen.getByPlaceholderText('Search by PPO, vendor, or project...');
    fireEvent.change(search, { target: { value: 'ppo-rejected' } });
    expect(screen.getByText('PPO-REJECTED')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'rejected vendor' } });
    expect(screen.getByText('PPO-REJECTED')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'project submitted' } });
    expect(screen.getByText('PPO-submitted')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'missing record' } });
    expect(screen.getByText('No performance rating records matched the active filter criteria.')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /All Records \(5\)/ }));
    fireEvent.click(within(screen.getByRole('row', { name: /PPO-REJECTED/ })).getByRole('button', { name: 'View Assessment' }));
    expect(screen.getByText(/submitted by Project User/)).toBeInTheDocument();
    expect(screen.getAllByText('₹0').length).toBeGreaterThan(0);
    expect(screen.getByText('No specific quality observations noted.')).toBeInTheDocument();
    expect(screen.getByText('No specific delivery delays or issues recorded.')).toBeInTheDocument();
    expect(screen.getByText('Invoices matched agreed PPO rate structure.')).toBeInTheDocument();
    expect(screen.getByText('Documentation delivered per contract requirements.')).toBeInTheDocument();
    expect(screen.getByText('Communication was prompt and constructive.')).toBeInTheDocument();
    expect(screen.getByText('No explicit corrective actions requested.')).toBeInTheDocument();
    expect(screen.queryByText('Decision & Audit Trail')).not.toBeInTheDocument();
  });

  it('shows complete submitted assessment details and requires comments for return and rejection', async () => {
    render(<VendorRatingsApprovalsPage />);
    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/ }));
    expect(screen.getByText('Vendor Performance Assessment Review')).toBeInTheDocument();
    expect(screen.getByText('Section A: Order & Scope Information')).toBeInTheDocument();
    expect(screen.getByText('Category Ratings & Individual Observations')).toBeInTheDocument();
    expect(screen.getByText('Quality of Goods / Work (30%)')).toBeInTheDocument();
    expect(screen.getByText('Delivery & Time (25%)')).toBeInTheDocument();
    expect(screen.getByText('Cost & Commercial (20%)')).toBeInTheDocument();
    expect(screen.getByText('Documentation & Closure (10%)')).toBeInTheDocument();
    expect(screen.getByText('Responsiveness & Coordination (15%)')).toBeInTheDocument();
    expect(screen.getByText('Continue weekly status updates')).toBeInTheDocument();
    expect(screen.getByText('Section B: Project Approver Comments')).toBeInTheDocument();
    expect(screen.getByText('Decision & Audit Trail')).toBeInTheDocument();
    expect(screen.getByText(/Submitted assessment/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Return for Correction' }));
    expect(screen.getByText('Approver comments are mandatory when returning or rejecting an assessment.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject Assessment' }));
    expect(screen.getByText('Approver comments are mandatory when returning or rejecting an assessment.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Record justification for accepting/), { target: { value: 'Please attach completion certificates.' } });
    decisionResponse = { ok: false, body: { error: 'Return service unavailable' } };
    fireEvent.click(screen.getByRole('button', { name: 'Return for Correction' }));
    expect(await screen.findByText('Return service unavailable')).toBeInTheDocument();
    decisionResponse = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Return for Correction' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Assessment returned to submitter for correction.', 'PPO-submitted'));
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals/vendor-ratings', expect.objectContaining({ method: 'POST' }));
  });

  it('confirms acceptance, handles rejection and request exceptions, and closes review dialogs', async () => {
    render(<VendorRatingsApprovalsPage />);
    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept Rating' }));
    expect(screen.getByText('Confirm Performance Rating Acceptance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    expect(screen.queryByText('Confirm Performance Rating Acceptance')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept Rating' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Publish Score' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Performance assessment accepted! Published to vendor scorecard.', 'PPO-submitted'));

    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/ }));
    fireEvent.change(screen.getByPlaceholderText(/Record justification for accepting/), { target: { value: 'Evidence does not support this score.' } });
    decisionResponse = { ok: true, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Reject Assessment' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Assessment rejected.', 'PPO-submitted'));

    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/ }));
    fireEvent.change(screen.getByPlaceholderText(/Record justification for accepting/), { target: { value: 'Review evidence.' } });
    mockFetch.mockRejectedValueOnce(new Error('decision network down'));
    fireEvent.click(screen.getByRole('button', { name: 'Reject Assessment' }));
    expect(await screen.findByText('decision network down')).toBeInTheDocument();
    decisionResponse = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: 'Reject Assessment' }));
    expect(await screen.findByText('Failed to record decision.')).toBeInTheDocument();
    mockFetch.mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Reject Assessment' }));
    expect(await screen.findByText('Network error recording decision.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
    expect(screen.queryByText('Vendor Performance Assessment Review')).not.toBeInTheDocument();
  });

  it('renders approved assessment history and handles queue failures and empty results', async () => {
    render(<VendorRatingsApprovalsPage />);
    await screen.findByText('PPO-submitted');
    fireEvent.click(screen.getByRole('button', { name: /Approved \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /View Assessment/ }));
    expect(screen.getByText(/Approved by Project Approver on N\/A/)).toBeInTheDocument();
    expect(screen.getByText('Approved with no additional remarks.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept Rating' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));

    queueResponse = { ok: false, body: {} };
    fireEvent.click(screen.getByRole('button', { name: /All Records/ }));
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load vendor performance approvals queue.'));

    queueResponse = { ok: true, body: {} };
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button'));
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/approvals/vendor-ratings'));
    fireEvent.click(screen.getByRole('button', { name: /Pending Approval/ }));
    expect(await screen.findByText('There are currently no vendor performance ratings awaiting Project Approver review.')).toBeInTheDocument();
    queueResponse = { ok: true, body: { ratings: [], counts: { pendingCount: 0, approvedCount: 0, returnedCount: 0, totalCount: 0, totalEvaluatedValue: 0 } } };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new Error('queue network down'));
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button'));
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(mockToastError).toHaveBeenCalledWith('Network error while loading approvals queue.');
    consoleError.mockRestore();
  });
});
