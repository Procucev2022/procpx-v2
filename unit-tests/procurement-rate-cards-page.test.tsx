/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RateCardManagementPage from '../src/app/(app)/procurement/rate-cards/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/components/rate-cards/HomeWorkspace', () => ({
  __esModule: true,
  default: (props: any) => (
    <section data-testid="home-workspace">
      <output data-testid="cards-data">{JSON.stringify(props.cards)}</output>
      <output data-testid="active-summary-tab">{props.activeSummaryTab}</output>
      <button onClick={() => props.onTabChange('finalised')}>Show finalised</button>
      <button onClick={() => props.onTabChange('in_progress')}>Show in progress</button>
      <button onClick={() => props.onSearchChange('paint')}>Search cards</button>
      <button onClick={() => props.onCategoryFilterChange('Civil')}>Filter category</button>
      <button onClick={() => props.onVendorFilterChange('Vendor')}>Filter vendor</button>
      <button onClick={() => props.onStatusFilterChange('Active')}>Filter status</button>
      <button onClick={props.onClearFilters}>Clear filters</button>
      <button onClick={props.onInitiateClick}>Open initiation</button>
      <button onClick={() => props.onNegotiateClick('RC-2026-0006')}>Open negotiation</button>
      <button onClick={() => props.onBuyerAcceptClick('RC-2026-0006')}>Open buyer acceptance</button>
      <button onClick={() => props.onDetailsClick('RC-2026-0006')}>Open details</button>
    </section>
  ),
}));

jest.mock('../src/components/rate-cards/InitiateRateCardWorkspace', () => ({
  __esModule: true,
  default: (props: any) => (
    <section data-testid="initiate-workspace">
      <button onClick={props.onBack}>Cancel initiation</button>
      <button onClick={() => props.onSubmit({
        vendorId: 'vendor-1', title: 'Created rate card', category: 'Civil', subcategory: 'Concrete', scope: 'Supply',
        location: 'Pune', effectiveFrom: '2026-11-01', validUntil: '2027-10-31', commercialTerms: 'Net 30', status: '',
        items: [{ itemCode: 'C-1', description: 'Cement', specification: 'OPC', category: 'Civil', subcategory: 'Cement', uom: 'BAG', targetRate: 400, previousPpoRate: 390, aiRate: 410, qty: 2 }],
      })}>Submit valid initiation</button>
      <button onClick={() => props.onSubmit({ title: 'Reviewed rate card', items: [], status: 'ROUND_2_NEGOTIATION' })}>Submit reviewed initiation</button>
    </section>
  ),
}));

jest.mock('../src/components/rate-cards/NegotiationWorkspace', () => ({
  __esModule: true,
  default: (props: any) => (
    <section data-testid="negotiation-workspace">
      <button onClick={() => props.onItemsChange(props.items.map((item: any) => ({ ...item, currentBuyerOffer: item.buyerTargetRate })))}>Change items</button>
      <button onClick={props.onReset}>Reset offer</button>
      <button onClick={props.onSaveDraft}>Save offer</button>
      <button onClick={props.onSendOffer}>Send offer</button>
      <button onClick={props.onAcceptQuoteClick}>Accept quote</button>
      <button onClick={props.onBack}>Back from negotiation</button>
    </section>
  ),
}));

jest.mock('../src/components/rate-cards/BuyerAcceptanceWorkspace', () => ({
  __esModule: true,
  default: (props: any) => (
    <section data-testid="buyer-acceptance-workspace">
      <button onClick={() => props.onAccept('Approved after review', { required: true, documentTitle: 'Master Agreement' })}>Accept with agreement</button>
      <button onClick={() => props.onAccept('Direct schedule', { required: false, type: 'NONE' })}>Accept direct schedule</button>
      <button onClick={props.onCancel}>Cancel buyer acceptance</button>
    </section>
  ),
}));

jest.mock('../src/components/rate-cards/Section7FinalisedDetails', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid="finalised-details">{props.rateCardId}:{props.rateCard?.rateCardNumber || 'none'}</div>,
}));

jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: (props: any) => <header><h1>{props.title}</h1>{props.onBack && <button onClick={props.onBack}>{props.backLabel}</button>}</header>,
}));

jest.mock('../src/components/ui/WorkflowStageNav', () => ({
  __esModule: true,
  default: ({ stages }: any) => <nav>{stages.map((stage: any) => <button key={stage.id} data-status={stage.status} onClick={stage.onClick}>{stage.label}</button>)}</nav>,
}));

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const response = (rateCards: any[] = [], ok = true) => ({ ok, json: async () => ({ rateCards }) });

describe('procurement rate cards page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/procurement/rate-cards');
    window.scrollTo = jest.fn();
    jest.spyOn(globalThis, 'setTimeout').mockImplementation((() => 0) as any);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue(response());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads persisted cards, derives display fields, filters, and opens workflow workspaces', async () => {
    const rateCards = [
      { id: 'approved', rateCardNumber: 'RC-A', status: 'APPROVED', validFrom: '2026-10-01', validTo: '2027-09-30', updatedAt: '2026-10-22', vendor: { name: 'Alpha', code: 'A1' }, category: 'Civil', scope: 'Concrete', items: [{ buyerOffer2: 0, buyerOffer1: 5, referenceQty: 2, vendorQuote2: 0, vendorQuote1: 8 }] },
      { id: 'round1', rateCardNumber: 'RC-B', status: 'ROUND_1_BUYER_OFFER', items: [] },
      { id: 'buyer', rateCardNumber: 'RC-C', status: 'BUYER_ACCEPTED', itemCount: 2 },
      { id: 'pending', rateCardNumber: 'RC-D', status: 'PENDING_APPROVAL' },
      { id: 'approved-2', rateCardNumber: 'RC-E', status: 'APPROVED' },
      { id: 'custom', rateCardNumber: 'RC-F', status: 'UNDER_REVIEW', items: [{ buyerOffer1: 0, rate: 0, vendorQuote1: 0, proposedRate: 0, qty: 0 }] },
      { id: 'missing', rateCardNumber: 'RC-G' },
      { id: 'workflow', rateCardNumber: 'RC-2026-0006', status: 'ROUND_2_NEGOTIATION', validFrom: null, validTo: null },
    ];
    global.fetch = jest.fn().mockResolvedValue(response(rateCards));
    render(<RateCardManagementPage />);
    await flushEffects();

    const cards = JSON.parse(screen.getByTestId('cards-data').textContent || '[]');
    expect(cards).toHaveLength(8);
    expect(cards.map((card: any) => card.currentStage)).toEqual([
      UI_STRINGS.common.approved, 'Round 1 Offer', 'Buyer Accepted', UI_STRINGS.common.pendingApproval, UI_STRINGS.common.approved, 'UNDER REVIEW', UI_STRINGS.common.inProgress, UI_STRINGS.common.inProgress,
    ]);
    expect(cards[0]).toMatchObject({ vendor: 'Alpha', vendorCode: 'A1', validFrom: expect.any(String), latestBuyerOffer: expect.any(String) });
    expect(cards[5].latestBuyerOffer).toMatch(/4,83,000/);
    expect(cards[6]).toMatchObject({ vendor: 'Ramakrishna Interiors', vendorCode: 'VND-0006', scope: 'General commercial rate schedule' });

    fireEvent.click(screen.getByRole('button', { name: 'Search cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filter category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filter vendor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filter status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show finalised' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show in progress' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open initiation' }));
    expect(screen.getByTestId('initiate-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel initiation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open negotiation' }));
    expect(screen.getByTestId('negotiation-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back from negotiation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open buyer acceptance' }));
    expect(screen.getByTestId('buyer-acceptance-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel buyer acceptance' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.homeWorkspace) }));
    fireEvent.click(screen.getByRole('button', { name: 'Open buyer acceptance' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.homeWorkspace) }));
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    expect(screen.getByTestId('finalised-details')).toHaveTextContent('RC-2026-0006:RC-2026-0006');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Rate Cards' }));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.initiateRateCard) }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel initiation' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.itemNegotiation) }));
    fireEvent.click(screen.getByRole('button', { name: 'Back from negotiation' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.buyerAcceptance) }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel buyer acceptance' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.finalisedDetails) }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Rate Cards' }));
  });

  it('handles initiation outcomes, negotiation actions, and both buyer acceptance paths', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([], true))
      .mockResolvedValueOnce(response([], false))
      .mockRejectedValueOnce(new Error('offline'));
    global.fetch = fetchMock;
    render(<RateCardManagementPage />);
    await flushEffects();

    fireEvent.click(screen.getByRole('button', { name: 'Open initiation' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit valid initiation' }));
      await Promise.resolve();
    });
    expect(screen.getByText(/Created rate card.*published to vendor/)).toBeInTheDocument();
    expect(screen.getByTestId('active-summary-tab')).toHaveTextContent('in_progress');
    expect(JSON.parse(screen.getByTestId('cards-data').textContent || '[]')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: 'Open initiation' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit reviewed initiation' }));
      await Promise.resolve();
    });
    expect(screen.getByText(/Reviewed rate card.*reviewed target values/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open initiation' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit valid initiation' }));
      await Promise.resolve();
    });
    expect(screen.getByText(/Created rate card.*published to vendor/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open negotiation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset offer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save offer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.round2CounterOfferSuccessfullySentToRamakrishnaInteriors))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept quote' }));

    fireEvent.click(screen.getByRole('button', { name: 'Accept with agreement' }));
    expect(screen.getByText(/Master Agreement.*sent to vendor/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open buyer acceptance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept direct schedule' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.noFormalAgreementRequired))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open buyer acceptance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel buyer acceptance' }));
    expect(screen.getByTestId('negotiation-workspace')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).items[0]).toMatchObject({ rate: 400, benchmarkRate: 410, referenceQty: 2 });
  });

  it.each([
    ['initiate', 'initiate-workspace'],
    ['negotiate', 'negotiation-workspace'],
    ['buyer-acceptance', 'buyer-acceptance-workspace'],
    ['details', 'finalised-details'],
    ['unknown', 'home-workspace'],
  ])('routes initial URL view=%s to %s', async (view, testId) => {
    window.history.replaceState({}, '', `/procurement/rate-cards?view=${view}`);
    render(<RateCardManagementPage />);
    await flushEffects();
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('keeps the empty fallback list on an empty response and handles fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    render(<RateCardManagementPage />);
    await flushEffects();
    expect(JSON.parse(screen.getByTestId('cards-data').textContent || '[]')).toHaveLength(6);
    expect(console.error).toHaveBeenCalledWith('Error fetching rate cards:', expect.any(Error));
  });
});
