/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';
import { useSearchParams } from 'next/navigation';
import RfqsListPage from '../src/app/(app)/procurement/rfqs/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
      React.createElement('a', { href, ...props }, children),
  };
});

jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }));

const searchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;
const originalFetch = global.fetch;
const mockFetch = jest.fn();

function rfq(id: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    rfqNumber: `RFQ-${id}`,
    title: `Package ${id}`,
    status,
    ...extra,
  };
}

describe('RFQ sourcing register page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParams.mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>);
    mockFetch.mockResolvedValue({ json: async () => ({ rfqs: [] }) });
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders workflow stages and uses a clear empty value when reference data is missing', async () => {
    const rows = [
      rfq('ppo-list', 'DRAFT', { ppos: [{}] }),
      rfq('ppo-flag', 'PPO_ISSUED'),
      rfq('ppo-progress', 'PPO_IN_PROGRESS'),
      rfq('awarded', 'AWARDED'),
      rfq('award-approved', 'AWARD_APPROVED'),
      rfq('award-record', 'DRAFT', { awards: [{ status: 'APPROVED' }] }),
      rfq('recommended', 'AWARD_RECOMMENDED'),
      rfq('pending', 'AWARD_PENDING'),
      rfq('pending-record', 'DRAFT', { awards: [{ status: 'PENDING_APPROVAL' }] }),
      rfq('negotiation', 'NEGOTIATION'),
      rfq('rate-locked', 'FINAL_RATE_LOCKED'),
      rfq('negotiation-record', 'DRAFT', { negotiations: [{}] }),
      rfq('comparison', 'COMPARISON'),
      rfq('response-closed', 'RESPONSE_CLOSED'),
      rfq('quotes-count', 'DRAFT', { quotesCount: 1 }),
      rfq('quote-record', 'DRAFT', { quotes: [{}] }),
      rfq('released', 'RELEASED'),
      rfq('vendor-open', 'VENDOR_RESPONSE_OPEN'),
      rfq('awaiting', 'AWAITING_QUOTES'),
      rfq('draft', 'DRAFT', {
        project: { name: 'North project', projectCode: 'NP', location: 'Pune' },
        location: 'Mumbai',
        packageName: 'Electrical package',
        costCentre: 'CC-1',
        boqCode: 'BOQ-1',
        boqRevision: { revisionCode: 'R2', boq: { boqCode: 'BOQ-R' } },
        totalBoqValue: 5000,
        totalLines: 4,
        releasedAt: '2026-01-02T00:00:00.000Z',
        invitedVendorsCount: 3,
        quotesCount: 2,
        isReRfq: true,
      }),
      rfq('fallbacks', 'UNKNOWN', {
        project: { city: 'Delhi', projectCode: 'DP' },
        title: 'Fallback trade',
        estimatedBenchmarkValue: 1200,
        invitedVendors: [{}, {}],
        createdAt: '2026-01-03T00:00:00.000Z',
      }),
    ];
    mockFetch.mockResolvedValue({ json: async () => ({ rfqs: rows }) });

    render(<RfqsListPage />);

    expect(await screen.findAllByText('PPO in Progress')).toHaveLength(3);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsIdPage.awardApproved))).toHaveLength(3);
    expect(screen.getAllByText('Award Pending Approval')).toHaveLength(3);
    expect(screen.getAllByText('Negotiation in Progress')).toHaveLength(3);
    expect(screen.getAllByText('Quote Comparison')).toHaveLength(5);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.userMessages.awaitingQuotations))).toHaveLength(3);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.draft, '', true))).toHaveLength(1);
    expect(screen.getByText('Electrical package')).toBeInTheDocument();
    expect(screen.getByText('CC-1')).toBeInTheDocument();
    expect(screen.getByText('BOQ-1')).toBeInTheDocument();
    expect(document.body).toHaveTextContent(interpolateUiString(UI_STRINGS.common.currencyAmount, { currency: UI_STRINGS.common.indianRupeeSymbol, amount: '5,000' }));
    expect(screen.getByText('2 Vendors')).toBeInTheDocument();
    expect(screen.getByText('Fallback trade')).toBeInTheDocument();
    expect(screen.queryByText('BOQ-R1')).not.toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.india))).not.toBeInTheDocument();
    expect(screen.queryByText('CC45 - Fitout')).not.toBeInTheDocument();
    expect(screen.queryByText('Civil & Interior Package')).not.toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.notAvailable)).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsPage.rERFQ))).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsPage.allSourcingPackages))).toBeInTheDocument();
  });

  it('uses the query filter, sends active and search filters, and narrows re-RFQs', async () => {
    searchParams.mockReturnValue(new URLSearchParams('filter=active') as ReturnType<typeof useSearchParams>);
    mockFetch.mockResolvedValue({
      json: async () => ({ rfqs: [
        rfq('marked', 'DRAFT', { isReRfq: true }),
        rfq('named', 'DRAFT', { title: 'Re-RFQ package' }),
        rfq('ordinary', 'DRAFT'),
      ] }),
    });

    render(<RfqsListPage />);
    await screen.findByText('RFQ-marked');
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/rfqs?search=&page=1&pageSize=50&status=active');

    fireEvent.change(screen.getByPlaceholderText(/Search by RFQ number/), { target: { value: 'pump & motor' } });
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/procurement/rfqs?search=pump%20%26%20motor&page=1&pageSize=50&status=active',
    ));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsPage.reRFQs) }));
    expect(await screen.findByText('RFQ-marked')).toBeInTheDocument();
    expect(screen.getByText('RFQ-named')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-ordinary')).not.toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/procurement/rfqs?search=pump%20%26%20motor&page=1&pageSize=50'));
  });

  it('builds a status filter for non-default tabs and handles missing rows and request errors', async () => {
    mockFetch.mockResolvedValue({ json: async () => ({}) });
    const { unmount } = render(<RfqsListPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.common.noRFQsFound));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsPage.underComparison) }));
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/procurement/rfqs?search=&page=1&pageSize=50&status=COMPARISON'));
    await screen.findByText(uiStringPattern(UI_STRINGS.common.noRFQsFound));

    const error = new Error('network unavailable');
    mockFetch.mockRejectedValueOnce(error);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.drafts) }));
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(error));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.noRFQsFound))).toBeInTheDocument();
    consoleError.mockRestore();
    unmount();
  });

  it('appends later RFQ pages and keeps server totals and stage aggregates', async () => {
    mockFetch.mockImplementation((url: string) => {
      const pageTwo = url.includes('page=2');
      const rows = pageTwo ? [rfq('two', 'DRAFT')] : [rfq('one', 'DRAFT')];
      return Promise.resolve({ json: async () => ({
        rfqs: rows, total: 51, page: pageTwo ? 2 : 1, pageSize: 50, totalPages: 2, statusCounts: { DRAFT: 51 },
      }) });
    });
    render(<RfqsListPage />);
    expect(await screen.findByText('RFQ-one')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('RFQ-two')).toBeInTheDocument();
    expect(screen.getByText('RFQ-one')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenLastCalledWith('/api/procurement/rfqs?search=&page=2&pageSize=50');
  });
});
