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
      <button onClick={props.onLoadMore}>Load rate card page</button>
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
      <output data-testid="negotiation-items">{JSON.stringify(props.items)}</output>
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
const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });
const workflowRateCard = {
  id: 'workflow', rateCardNumber: 'RC-2026-0006', status: 'ROUND_1_VENDOR_QUOTE', title: 'Persisted electrical card', category: 'Electrical',
  vendor: { id: 'vendor-1', name: 'Persisted Vendor', code: 'V-1' }, updatedAt: '2026-10-22T00:00:00.000Z', items: [
    { id: 'line-1', itemCode: 'C-1', description: 'Cable', specification: '4 core', uom: 'MTR', rate: 100, proposedRate: 115, benchmarkRate: 120, minQuantity: 10, comparisonRef: JSON.stringify({ buyerOffer1: 100, vendorQuote1: 115, referenceQty: 10 }) },
  ],
};

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
    global.fetch = jest.fn((url: string | URL | Request) => String(url).includes('/api/procurement/rate-cards/workflow')
      ? Promise.resolve(jsonResponse({ rateCard: workflowRateCard }))
      : Promise.resolve(response(rateCards))) as unknown as typeof fetch;
    render(<RateCardManagementPage />);
    await flushEffects();

    const cards = JSON.parse(screen.getByTestId('cards-data').textContent || '[]');
    expect(cards).toHaveLength(8);
    expect(cards.map((card: any) => card.currentStage)).toEqual([
      UI_STRINGS.common.approved, 'Round 1 Offer', 'Buyer Accepted', UI_STRINGS.common.pendingApproval, UI_STRINGS.common.approved, 'UNDER REVIEW', 'DRAFT', 'Round 2 Negotiation',
    ]);
    expect(cards[0]).toMatchObject({ vendor: 'Alpha', vendorCode: 'A1', validFrom: expect.any(String), latestBuyerOffer: expect.any(String) });
    expect(cards[5].latestBuyerOffer).toMatch(/0/);
    expect(cards[6]).toMatchObject({ vendor: '', vendorCode: '', scope: '' });

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
    await flushEffects();
    expect(screen.getByTestId('negotiation-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back from negotiation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open buyer acceptance' }));
    await flushEffects();
    expect(screen.getByTestId('buyer-acceptance-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel buyer acceptance' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.homeWorkspace) }));
    fireEvent.click(screen.getByRole('button', { name: 'Open buyer acceptance' }));
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.homeWorkspace) }));
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    await flushEffects();
    expect(screen.getByTestId('finalised-details')).toBeInTheDocument();
    expect(screen.getByTestId('finalised-details')).toHaveTextContent('RC-2026-0006:RC-2026-0006');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Rate Cards' }));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.initiateRateCard) }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel initiation' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.itemNegotiation) }));
    if (screen.queryByRole('button', { name: 'Back from negotiation' })) fireEvent.click(screen.getByRole('button', { name: 'Back from negotiation' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.buyerAcceptance) }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel buyer acceptance' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRateCardsPage.finalisedDetails) }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Rate Cards' }));
  });

  it('persists offer drafts, submits negotiations, and accepts vendor offers using rate-card APIs', async () => {
    let workflowStatus = 'ROUND_1_VENDOR_QUOTE';
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/procurement/rate-cards?')) return Promise.resolve(response([{ ...workflowRateCard, status: workflowStatus }]));
      if (url === '/api/procurement/rate-cards/workflow' && !init) return Promise.resolve(jsonResponse({ rateCard: { ...workflowRateCard, status: workflowStatus } }));
      if (url === '/api/procurement/rate-cards' && init?.method === 'POST') return Promise.resolve(jsonResponse({ rateCard: { ...workflowRateCard, status: 'ROUND_1_BUYER_OFFER' } }, true));
      if (url === '/api/procurement/rate-cards/workflow' && init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body));
        if (payload.action === 'SAVE_BUYER_OFFER_2_DRAFT') return Promise.resolve(jsonResponse({ rateCard: { ...workflowRateCard, status: workflowStatus } }));
        if (payload.action === 'SUBMIT_BUYER_OFFER_2') workflowStatus = 'ROUND_2_BUYER_OFFER';
        if (payload.action === 'ACCEPT_FINAL_VENDOR_OFFER') workflowStatus = 'FINAL_VENDOR_OFFER_ACCEPTED';
        if (payload.action === 'CATEGORY_MANAGER_ACCEPT') workflowStatus = 'CATEGORY_MANAGER_ACCEPTED';
        return Promise.resolve(jsonResponse({ rateCard: { ...workflowRateCard, status: workflowStatus }, message: 'Buyer offer submitted' }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<RateCardManagementPage />);
    await flushEffects();

    fireEvent.click(screen.getByRole('button', { name: 'Open initiation' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit valid initiation' }));
      await Promise.resolve();
    });
    expect(screen.getByText(/Created rate card.*published to vendor/)).toBeInTheDocument();
    expect(screen.getByTestId('active-summary-tab')).toHaveTextContent('in_progress');
    expect(JSON.parse(screen.getByTestId('cards-data').textContent || '[]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open negotiation' }));
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: 'Change items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save offer' }));
    await flushEffects();
    expect(fetchMock).toHaveBeenCalledWith('/api/procurement/rate-cards/workflow', expect.objectContaining({ method: 'PUT' }));
    expect(fetchMock.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body)).action)).toContain('SAVE_BUYER_OFFER_2_DRAFT');
    fireEvent.click(screen.getByRole('button', { name: 'Reset offer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    await flushEffects();
    expect(screen.getByText('Buyer offer submitted')).toBeInTheDocument();
    expect(screen.getByTestId('home-workspace')).toBeInTheDocument();
    workflowStatus = 'ROUND_2_VENDOR_QUOTE';

    fireEvent.click(screen.getByRole('button', { name: 'Open buyer acceptance' }));
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: 'Accept with agreement' }));
    await flushEffects();
    expect(screen.getByText(/Master Agreement.*sent to vendor/)).toBeInTheDocument();
    const actions = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([, init]) => JSON.parse(String(init?.body)).action);
    expect(actions).toEqual(['SAVE_BUYER_OFFER_2_DRAFT', 'SUBMIT_BUYER_OFFER_2', 'ACCEPT_FINAL_VENDOR_OFFER', 'CATEGORY_MANAGER_ACCEPT']);
    const draftCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT' && JSON.parse(String(init?.body)).action === 'SAVE_BUYER_OFFER_2_DRAFT');
    const draftPayload = JSON.parse(String(draftCall?.[1]?.body));
    expect(draftPayload.items).toEqual([{ id: 'line-1', buyerOffer2: 100 }]);
  });

  it('does not report rate-card creation as successful when the API rejects it', async () => {
    global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse({ error: 'Vendor is unavailable' }, false));
      return Promise.resolve(response());
    }) as unknown as typeof fetch;
    render(<RateCardManagementPage />);
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: 'Open initiation' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit valid initiation' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Vendor is unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Created rate card.*published to vendor/)).not.toBeInTheDocument();
  });

  it.each([
    ['initiate', 'initiate-workspace'],
    ['negotiate', 'negotiation-workspace'],
    ['buyer-acceptance', 'buyer-acceptance-workspace'],
    ['details', 'finalised-details'],
    ['unknown', 'home-workspace'],
  ])('routes initial URL view=%s to %s only when the persisted rate-card id is present', async (view, testId) => {
    const query = ['negotiate', 'buyer-acceptance', 'details'].includes(view) ? '&id=workflow' : '';
    window.history.replaceState({}, '', `/procurement/rate-cards?view=${view}${query}`);
    global.fetch = jest.fn((url: string | URL | Request) => String(url).includes('/api/procurement/rate-cards/workflow')
      ? Promise.resolve(jsonResponse({ rateCard: workflowRateCard }))
      : Promise.resolve(response([workflowRateCard]))) as unknown as typeof fetch;
    render(<RateCardManagementPage />);
    await flushEffects();
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('shows no invented cards for an empty response and handles fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    render(<RateCardManagementPage />);
    await flushEffects();
    expect(JSON.parse(screen.getByTestId('cards-data').textContent || '[]')).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('Error fetching rate cards:', expect.any(Error));
  });

  it('appends rate-card pages and derives negotiation values from direct, stored, and invalid metadata', async () => {
    const listCard = { ...workflowRateCard, status: 'ROUND_1_VENDOR_QUOTE' };
    const detailCard = {
      ...workflowRateCard,
      items: [
        { id: 'direct', itemCode: 'D-1', description: 'Direct item', specification: 'Spec', uom: 'EA', referenceQty: 2,
          buyerOffer1: 11, vendorQuote2: 15, buyerOffer2: 12, rate: 10, comparisonRef: null },
        { id: 'stored', referenceQty: null, minQuantity: '3', benchmarkRate: 6, rate: 5, proposedRate: 4,
          comparisonRef: JSON.stringify({ buyerOffer1: 7, vendorQuote2: 9, vendorQuote1: 8, buyerOffer2: 10 }) },
        { id: 'invalid', referenceQty: 0, minQuantity: 'bad', buyerOffer1: 'bad', vendorQuote1: 'bad', buyerOffer2: 'bad',
          comparisonRef: '{bad json' },
        { id: 'array', rate: 5, comparisonRef: '[]' },
      ],
    };
    const fetchMock = jest.fn((url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/api/procurement/rate-cards/workflow')) return Promise.resolve(jsonResponse({ rateCard: detailCard }));
      if (requestUrl.includes('page=2')) return Promise.resolve(jsonResponse({ rateCards: [listCard], hasMore: false }));
      return Promise.resolve(jsonResponse({ rateCards: [], hasMore: true, summary: { finalised: 0, inProgress: 1 } }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<RateCardManagementPage />);
    await flushEffects();
    fireEvent.click(screen.getByRole('button', { name: 'Load rate card page' }));
    await flushEffects();
    expect(screen.getByTestId('cards-data')).toHaveTextContent('RC-2026-0006');

    fireEvent.click(screen.getByRole('button', { name: 'Open negotiation' }));
    await flushEffects();
    const items = JSON.parse(screen.getByTestId('negotiation-items').textContent || '[]');
    expect(items).toEqual([
      expect.objectContaining({ id: 'direct', qty: 2, buyerTargetRate: 11, latestVendorQuote: 15, currentBuyerOffer: 12, proposedAmount: 24 }),
      expect.objectContaining({ id: 'stored', qty: 3, buyerTargetRate: 7, latestVendorQuote: 9, currentBuyerOffer: 10, proposedAmount: 30 }),
      expect.objectContaining({ id: 'invalid', qty: 1, buyerTargetRate: 0, latestVendorQuote: 0, currentBuyerOffer: 0 }),
      expect.objectContaining({ id: 'array', qty: 1, buyerTargetRate: 5, latestVendorQuote: 5, currentBuyerOffer: 5 }),
    ]);
  });
});
