/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuotesHubPage from '../src/app/(app)/procurement/quotes/page';
import NegotiationsHubPage from '../src/app/(app)/procurement/negotiations/page';
import AwardsDeskPage from '../src/app/(app)/procurement/awards/page';
import ProjectsPage from '../src/app/(app)/projects/page';

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    require('react').createElement('a', { ...props, href }, children),
}));
jest.mock('../src/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

describe('procurement register pages', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads and renders quote rows, handles empty payloads and request failures', async () => {
    let finishRequest!: (value: unknown) => void;
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(resolve => { finishRequest = resolve; }));
    const view = render(<QuotesHubPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementQuotesPage.loadingQuotes))).toBeInTheDocument();
    await act(async () => finishRequest({ ok: true, json: async () => ({ quotes: [] }) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementQuotesPage.noQuotesSubmittedYet))).toBeInTheDocument();
    view.unmount();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ quotes: [{
      id: 'quote-1', quoteNumber: 'QT-001', vendor: { name: 'Acme' }, rfqId: 'rfq-1', rfq: { rfqNumber: 'RFQ-001' },
      quoteVersion: 2, totalBaseAmount: 1000, taxAmount: 180, totalQuoteAmount: 1180, commercialTerms: '',
      createdAt: '2025-01-01T00:00:00.000Z',
    }] }) });
    render(<QuotesHubPage />);
    expect(await screen.findByText('QT-001')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementQuotesPage.standardCommercialTerms))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProcurementQuotesPage.compareInRFQ, "", false) })).toHaveAttribute('href', '/procurement/rfqs/rfq-1?tab=compare');

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    render(<QuotesHubPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementQuotesPage.noQuotesSubmittedYet))).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('summarizes active and concluded negotiations and handles empty or unavailable results', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ negotiations: [
      {
        id: 'neg-1', rfqId: 'rfq-1', rfq: { rfqNumber: 'RFQ-001', project: { name: 'Retail fitout' } },
        currentRound: 2, rounds: [{ id: 'round-1' }], bestQuoteAmount: 0, status: 'IN_PROGRESS', updatedAt: '2025-02-01T00:00:00Z',
      },
      {
        id: 'neg-2', rfqId: 'rfq-2', rfq: { rfqNumber: 'RFQ-002', project: { name: 'Hotel' } },
        currentRound: 4, rounds: [], bestQuoteAmount: 5000, status: 'CONCLUDED', updatedAt: '2025-02-02T00:00:00Z',
      },
      {
        id: 'neg-3', rfqId: 'rfq-3', rfq: { rfqNumber: 'RFQ-003', project: { name: 'Office' } },
        currentRound: 1, rounds: null, bestQuoteAmount: null, status: 'FINAL_RATE_LOCKED', updatedAt: '2025-02-03T00:00:00Z',
      },
    ] }) });
    render(<NegotiationsHubPage />);
    expect(await screen.findByText('RFQ-001')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementNegotiationsPage.totalNegotiations))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementNegotiationsPage.inActiveRounds))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementNegotiationsPage.ratesConcludedLocked))).toBeInTheDocument();
    expect(screen.getByText('1 rounds')).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.common.negotiate, "", false) })[0]).toHaveAttribute('href', '/procurement/rfqs/rfq-1?tab=negotiation');
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<NegotiationsHubPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementNegotiationsPage.noNegotiationsActive))).toBeInTheDocument();
    cleanup();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));
    render(<NegotiationsHubPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementNegotiationsPage.noNegotiationsActive))).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('reviews finance awards, refreshes the register, and reports request errors', async () => {
    let finishList!: (value: unknown) => void;
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(resolve => { finishList = resolve; }));
    const view = render(<AwardsDeskPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.loadingAwardRecommendations))).toBeInTheDocument();
    await act(async () => finishList({ ok: true, json: async () => ({ awards: [] }) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.noAwardRecommendationsYet))).toBeInTheDocument();
    view.unmount();
    (global.fetch as jest.Mock).mockClear();

    const award = {
      id: 'award-1', rfqId: 'rfq-1', rfq: { rfqNumber: 'RFQ-001', project: { name: 'Store', projectCode: 'P-1' } },
      recommendedVendor: { name: 'Acme' }, finalNegotiatedAmount: 1000, benchmarkAmount: 1200, savingsPercent: 16.7,
      totalSavingsAmount: 200, status: 'AWARD_RECOMMENDED', createdAt: '2025-03-01T00:00:00Z',
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ awards: [award] }) });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const activeView = render(<AwardsDeskPage />);
    expect(await screen.findByText('RFQ-001')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) });
    fireEvent.click(approve);
    expect(approve).toBeDisabled();
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(
      UI_STRINGS.appAppProcurementRfqsIdPage.pPOApprovedSuccessfullyByFinance, 'RFQ-001', UI_STRINGS.common.userMessages.readyForPpoIssuance,
    ));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenLastCalledWith('/api/procurement/awards?page=1&pageSize=50');
    activeView.unmount();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ awards: [{ ...award, status: 'APPROVED' }] }) });
    render(<AwardsDeskPage />);
    expect(await screen.findByText('RFQ-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.approve) })).not.toBeInTheDocument();
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ awards: [award] }) });
    render(<AwardsDeskPage />);
    const reject = await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Finance service unavailable' }) });
    fireEvent.click(reject);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.objectContaining({
    title: UI_STRINGS.appAppProcurementAwardsPage.awardReviewFailed, message: 'Finance service unavailable', recordNumber: 'RFQ-001',
    })));
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ awards: [award] }) });
    render(<AwardsDeskPage />);
    const rejectAgain = await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) });
    (global.fetch as jest.Mock).mockRejectedValueOnce({});
    fireEvent.click(rejectAgain);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.objectContaining({
      message: UI_STRINGS.common.userMessages.anErrorOccurredWhileReviewingTheAwardRecommendation,
    })));
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ awards: [award] }) });
    render(<AwardsDeskPage />);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.objectContaining({
      message: UI_STRINGS.common.userMessages.failedToReviewAwardRecommendation,
    })));
    cleanup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ awards: [award] }) });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<AwardsDeskPage />);
    fireEvent.click(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.common.reject2) }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(
      UI_STRINGS.common.userMessages.awardRecommendationRejected, 'RFQ-001', UI_STRINGS.common.userMessages.commercialReview,
    ));
    cleanup();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('load failed'));
    render(<AwardsDeskPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProcurementAwardsPage.noAwardRecommendationsYet))).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('loads later quote, negotiation, and award pages without dropping earlier records', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 51, page: 1, quotes: [{
        id: 'quote-first', quoteNumber: 'QT-FIRST', vendor: { name: 'Acme' }, rfqId: 'rfq-1', rfq: { rfqNumber: 'RFQ-001' },
        quoteVersion: 1, totalBaseAmount: 10, taxAmount: 0, totalQuoteAmount: 10, createdAt: '2025-01-01T00:00:00Z',
      }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 51, page: 2, quotes: [{
        id: 'quote-second', quoteNumber: 'QT-SECOND', vendor: { name: 'Beta' }, rfqId: 'rfq-2', rfq: { rfqNumber: 'RFQ-002' },
        quoteVersion: 1, totalBaseAmount: 20, taxAmount: 0, totalQuoteAmount: 20, createdAt: '2025-01-02T00:00:00Z',
      }] }) });
    const quotesView = render(<QuotesHubPage />);
    expect(await screen.findByText('QT-FIRST')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.common.loadMore }));
    expect(await screen.findByText('QT-SECOND')).toBeInTheDocument();
    expect(screen.getByText('QT-FIRST')).toBeInTheDocument();
    quotesView.unmount();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 51, page: 1, statusCounts: { ACTIVE: 51 }, negotiations: [{
        id: 'neg-first', rfqId: 'rfq-1', rfq: { rfqNumber: 'RFQ-001', project: { name: 'Store' } },
        currentRound: 1, _count: { rounds: 1 }, status: 'ACTIVE', updatedAt: '2025-02-01T00:00:00Z',
      }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 51, page: 2, statusCounts: { ACTIVE: 51 }, negotiations: [{
        id: 'neg-second', rfqId: 'rfq-2', rfq: { rfqNumber: 'RFQ-002', project: { name: 'Office' } },
        currentRound: 2, _count: { rounds: 2 }, status: 'ACTIVE', updatedAt: '2025-02-02T00:00:00Z',
      }] }) });
    const negotiationsView = render(<NegotiationsHubPage />);
    expect(await screen.findByText('RFQ-001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.common.loadMore }));
    expect(await screen.findByText('RFQ-002')).toBeInTheDocument();
    expect(screen.getByText('RFQ-001')).toBeInTheDocument();
    negotiationsView.unmount();

    const award = {
      id: 'award-first', rfqId: 'rfq-1', rfq: { rfqNumber: 'RFQ-001', project: { name: 'Store' } },
      recommendedVendor: { name: 'Acme' }, finalNegotiatedAmount: 1000, benchmarkAmount: 1200,
      savingsPercent: 16.7, totalSavingsAmount: 200, status: 'APPROVED', createdAt: '2025-03-01T00:00:00Z',
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 51, page: 1, awards: [award] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 51, page: 2, awards: [{ ...award, id: 'award-second', rfqId: 'rfq-2', rfq: { rfqNumber: 'RFQ-002', project: { name: 'Office' } } }] }) });
    render(<AwardsDeskPage />);
    expect(await screen.findByText('RFQ-001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: UI_STRINGS.common.loadMore }));
    expect(await screen.findByText('RFQ-002')).toBeInTheDocument();
    expect(screen.getByText('RFQ-001')).toBeInTheDocument();
  });

  it('filters and paginates projects, resolves role variants, and displays project detail fallbacks', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => ({ data: { user: { role: 'CLIENT_ADMIN' } } }) })
      .mockResolvedValueOnce({ json: async () => ({ data: [{
        id: 'project-1', projectCode: 'P-1', name: 'Retail Store', sector: 'RETAIL', projectType: 'NEW_BUILD',
        city: '', location: 'Pune', areaSqFt: 2500, status: 'ACTIVE',
        boqs: [{ status: 'APPROVED', revisions: [{ totalLines: 12 }] }], updatedAt: '2025-04-01T00:00:00Z',
      }], total: 41 }) });
    (global.fetch as jest.Mock).mockResolvedValue({ json: async () => ({ data: [], total: 41 }) });
    const projectsView = render(<ProjectsPage />);
    expect(await screen.findByText('Retail Store')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"New","toLocaleString":"Project"})) })).toHaveAttribute('href', '/projects/new');
    expect(screen.getByText('NEW BUILD')).toBeInTheDocument();
    expect(screen.getByText('Pune')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.next, "", false) }));
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('page=2')));
    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('page=1')));
    fireEvent.click(screen.getAllByRole('button')[2]);
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('page=2')));
    fireEvent.click(screen.getAllByRole('button')[1]);
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('page=1')));
    fireEvent.click(screen.getAllByRole('button')[2]);
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('page=2')));
    fireEvent.click(screen.getAllByRole('button')[3]);
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('page=3')));
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppProjectsPage.searchByNameCodeCity)), { target: { value: 'Hotel' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('page=1')));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'DRAFT' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('status=DRAFT')));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'RETAIL' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('sector=RETAIL')));
    projectsView.unmount();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => ({ user: { role: 'VIEWER' } }) })
      .mockResolvedValueOnce({ json: async () => ({ total: 1 }) });
    render(<ProjectsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProjectsPage.noProjectsFound))).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"New","toLocaleString":"Project"})) })).not.toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProjectsPage.totalCapexProjectValue2InPlatformWorkspace, {"total":"1","value2":""})))).toBeInTheDocument();
    cleanup();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ json: async () => ({}) })
      .mockResolvedValueOnce({ json: async () => ({ data: [], total: 0 }) });
    render(<ProjectsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProjectsPage.noProjectsFound))).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"New","toLocaleString":"Project"})) })).not.toBeInTheDocument();
    cleanup();

    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('profile unavailable'))
      .mockResolvedValueOnce({ json: async () => ({ data: [{
        id: 'project-2', projectCode: 'P-2', name: 'Office', sector: 'OTHER', projectType: '', city: '', location: '',
        areaSqFt: 0, status: 'DRAFT', boqs: [], updatedAt: '2025-05-01T00:00:00Z',
      }], total: 0 }) });
    render(<ProjectsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqStudioPage.office))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.copy4s9bsz)).length).toBeGreaterThan(0);
  });
});
