/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorRateCardsPage from '../src/app/(app)/vendor-portal/rate-cards/page';

jest.mock('../src/components/VendorNegotiationWorkspace', () => ({
  __esModule: true,
  default: (props: any) => <section data-testid="vendor-negotiation-workspace"><span>{props.data.rateCardNumber}</span><button onClick={props.onBack}>Return to list</button><button onClick={props.onSuccess}>Reload after success</button></section>,
}));

jest.mock('../src/components/ui/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }: any) => <span data-testid="status-badge">{status}</span>,
}));

const flush = async () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

const response = (data: any, ok = true) => ({ ok, json: async () => data });

const rateCards = [
  {
    id: 'r1', rateCardNumber: 'RC-ROUND-1', status: 'ROUND_1_BUYER_OFFER', category: 'Civil', scope: 'Concrete',
    location: 'Pune', validFrom: '2026-10-01', validTo: '2027-09-30', terms: 'Net 30', version: 2,
    items: [
      { id: 'r1-a', description: 'Cement', specification: 'OPC 53', itemCode: 'CEM-1', uom: 'BAG', referenceQty: 5, buyerOffer1: 400, vendorQuote1: null, proposedRate: 390, rate: 380 },
      { id: 'r1-b', description: 'Sand', itemCode: 'SAND-1', uom: 'CUM', minQuantity: 2, buyerOffer1: 800, vendorQuote1: 0, proposedRate: 0, rate: 0 },
    ],
  },
  {
    id: 'r2', rateCardNumber: 'RC-ROUND-2', status: 'ROUND_2_BUYER_OFFER', category: 'Electrical',
    validFrom: '2026-11-01', validTo: '2027-10-31', items: [
      { id: 'r2-a', description: 'Cable', specification: '', itemCode: 'CAB-1', uom: 'M', referenceQty: 10, buyerOffer1: 20, buyerOffer2: 18, vendorQuote1: 22, vendorQuote2: null, proposedRate: 21, rate: 19 },
    ],
  },
  {
    id: 'cm', rateCardNumber: 'RC-CM', status: 'CATEGORY_MANAGER_ACCEPTED', category: 'HVAC',
    validFrom: '2026-01-01', validTo: '2026-12-31', items: [{ id: 'cm-a', description: 'Filter', itemCode: 'FLT-1', uom: 'EA', qty: 1, buyerOffer1: null, rate: 5, vendorQuote1: 4, vendorQuote2: 3, buyerOffer2: 4, finalAgreedRate: 3 }],
  },
  {
    id: 'approved', rateCardNumber: 'RC-APPROVED', status: 'APPROVED', category: 'Furniture',
    validFrom: '2026-01-01', validTo: '2026-12-31', items: [{ id: 'a-1', description: 'Chair', itemCode: 'CHR-1', uom: 'EA', rate: 100, vendorQuote1: null, vendorQuote2: null, buyerOffer2: null, finalAgreedRate: null }],
  },
  {
    id: 'draft', rateCardNumber: 'RC-DRAFT', status: 'DRAFT', category: 'General', scope: '', location: '',
    validFrom: '2026-01-01', validTo: '2026-12-31', items: [{ id: 'd-1', description: 'Unpriced line', itemCode: 'D-1', uom: 'EA', rate: 0 }],
  },
  {
    id: 'locked', rateCardNumber: 'RC-LOCKED', status: 'ROUND_2_VENDOR_QUOTE', category: 'Civil',
    validFrom: '2026-01-01', validTo: '2026-12-31', items: [{ id: 'l-1', description: 'Locked line', itemCode: 'L-1', uom: 'EA', buyerOffer1: 6, vendorQuote1: 7, buyerOffer2: 5, vendorQuote2: 5, finalAgreedRate: 5 }],
  },
];

describe('vendor portal rate cards page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/vendor-portal/rate-cards');
    global.fetch = jest.fn().mockResolvedValue(response({ rateCards }));
  });

  it('loads persisted cards, submits quote rounds and acceptance through the API, search and refresh', async () => {
    const fetchMock = jest.fn().mockImplementation((requestUrl, init) => {
      if (init?.method === 'POST') return Promise.resolve(response({ ok: true }));
      const search = new URL(String(requestUrl), 'http://localhost').searchParams.get('search')?.toLowerCase() || '';
      const filtered = search ? rateCards.filter((card) => `${card.rateCardNumber} ${card.category} ${card.scope || ''}`.toLowerCase().includes(search)) : rateCards;
      return Promise.resolve(response({ rateCards: filtered, total: filtered.length, hasMore: false }));
    });
    global.fetch = fetchMock;
    const { container } = render(<VendorRateCardsPage />);
    await flush();
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.loadingRateCards))).not.toBeInTheDocument());

    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.loadingRateCards))).not.toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.vendorRateCardsCommercialNegotiation))).toBeInTheDocument();
    expect(screen.queryByTestId('section-five')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-seven')).not.toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.round1ResponseRequired))).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.quote1))[0]).toHaveValue(390);
    expect(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.provideCommercialOrDeliveryRemarks))).toBeInTheDocument();

    const roundOneInputs = screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.quote1));
    fireEvent.change(roundOneInputs[0], { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"Vendor RC Quote-1"})) }));
    expect(screen.getByText(/valid rate greater than zero/)).toBeInTheDocument();

    fireEvent.change(roundOneInputs[0], { target: { value: '395' } });
    fireEvent.change(roundOneInputs[1], { target: { value: '825' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.provideCommercialOrDeliveryRemarks)), { target: { value: 'Delivery within 30 days' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"Vendor RC Quote-1"})) }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(screen.getByText(/Vendor RC Quote-1 submitted successfully/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      rateCardId: 'r1', action: 'SUBMIT_VENDOR_QUOTE_1', remarks: 'Delivery within 30 days',
      items: [{ id: 'r1-a', proposedRate: 395 }, { id: 'r1-b', proposedRate: 825 }],
    });

    const card = (id: string) => screen.getByText(id).closest('.card') as HTMLElement;
    fireEvent.click(card('RC-ROUND-2').firstElementChild as HTMLElement);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.round2ResponseRequired))).toBeInTheDocument();
    const roundTwoInput = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.quote2));
    expect(roundTwoInput).toHaveValue(22);
    fireEvent.change(roundTwoInput, { target: { value: '17' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"Vendor RC Quote-2"})) }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(screen.getByText(/Vendor RC Quote-2 submitted successfully/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).action).toBe('SUBMIT_VENDOR_QUOTE_2');

    fireEvent.click(card('RC-CM').firstElementChild as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.acceptFinalRateCardAgreement) }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText(/formally accepted/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[5][1].body).action).toBe('VENDOR_ACCEPT');

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.searchCategoryRateCardNo)), { target: { value: 'electrical' } });
    await waitFor(() => expect(screen.getByText('RC-ROUND-2')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('RC-ROUND-1')).not.toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.searchCategoryRateCardNo)), { target: { value: 'no match' } });
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.noRateCardsMatchYourSearch))).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.searchCategoryRateCardNo)), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await flush();
    expect(screen.getAllByTestId('status-badge')[0]).toHaveTextContent('ROUND_1_BUYER_OFFER');
    expect(container.querySelectorAll('.card')).toHaveLength(6);
  });

  it('shows empty and load errors, server submission errors, locked values, and fallback copy', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({ rateCards: [] }));
    const { rerender } = render(<VendorRateCardsPage />);
    await flush();
    await waitFor(() => expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.loadingRateCards))).not.toBeInTheDocument());
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.youDoNotHaveAnyRateCardsEstablishedAtThisTime))).toBeInTheDocument();

    global.fetch = jest.fn().mockResolvedValue(response({ rateCards: [{
      id: 'no-lines', rateCardNumber: 'RC-NO-LINES', status: 'DRAFT', category: 'General', items: [],
    }] }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await flush();
    expect(screen.getByText('RC-NO-LINES').closest('.card')).toHaveTextContent(uiStringPattern(UI_STRINGS.appAppBudgetPage.copyepw9f3));

    global.fetch = jest.fn().mockResolvedValue(response({}));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await flush();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.youDoNotHaveAnyRateCardsEstablishedAtThisTime))).toBeInTheDocument();

    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error('bad json'); } });
    rerender(<VendorRateCardsPage />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await flush();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadRateCards))).toBeInTheDocument();

    const submitFailure = jest.fn().mockImplementation((_url, init) => init?.method === 'POST'
      ? Promise.resolve(response({}, false))
      : Promise.resolve(response({ rateCards: [rateCards[0], rateCards[3], rateCards[4], rateCards[5]] })));
    global.fetch = submitFailure;
    rerender(<VendorRateCardsPage />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await flush();
    expect(screen.getByText('RC-APPROVED')).toBeInTheDocument();
    const approvedCard = screen.getByText('RC-APPROVED').closest('.card') as HTMLElement;
    fireEvent.click(approvedCard.firstElementChild as HTMLElement);
    expect(within(approvedCard).getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.standardBOQScope, "", false))).toBeInTheDocument();
    expect(within(approvedCard).getByText(uiStringPattern(UI_STRINGS.common.allIndia, "", false))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.loading, "", false))).not.toBeInTheDocument();
    const lockedCard = screen.getByText('RC-LOCKED').closest('.card') as HTMLElement;
    fireEvent.click(lockedCard.firstElementChild as HTMLElement);
    expect(screen.getByText('Locked line')).toBeInTheDocument();
    expect(screen.queryByText(/No rate cards/)).not.toBeInTheDocument();

    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.searchCategoryRateCardNo));
    jest.useFakeTimers();
    try {
      fireEvent.change(search, { target: { value: 'RC-ROUND-1' } });
      fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.quote1))[0], { target: { value: '395' } });
      fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.quote1))[1], { target: { value: '825' } });
      fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, {"currency":"Submit","toLocaleString":"Vendor RC Quote-1"})) }));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      const submissionError = uiStringPattern(interpolateUiString(UI_STRINGS.appAppVendorPortalRateCardsPage.failedToSubmitQuoteRoundNumber, {"roundNumber":"1"}));
      expect(screen.getByText(submissionError)).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(250);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      });
      expect(screen.getByText(submissionError)).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.searchCategoryRateCardNo)), { target: { value: '' } });
    global.fetch = jest.fn().mockImplementation((_url, init) => init?.method === 'POST'
      ? Promise.resolve(response({}, false))
      : Promise.resolve(response({ rateCards: [rateCards[2]] })));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.refresh2) }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.acceptFinalRateCardAgreement) }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToAcceptRateCard))).toBeInTheDocument();
  });

  it('appends another rate-card page and validates missing quote values', async () => {
    const firstPageCard = { ...rateCards[0], items: [{ id: 'blank-r1', description: 'Round one blank quote', itemCode: '', specification: '', uom: 'EA' }] };
    const secondPageCard = {
      id: 'round2-blank', rateCardNumber: 'RC-ROUND-2-BLANK', status: 'ROUND_2_BUYER_OFFER', category: 'General',
      items: [{ id: 'blank-r2', description: 'Round two blank quote', itemCode: '', specification: '', uom: 'EA', buyerOffer1: 100 }],
    };
    global.fetch = jest.fn((requestUrl: string | URL | Request) => {
      const page = new URL(String(requestUrl), 'http://localhost').searchParams.get('page');
      return Promise.resolve(page === '2'
        ? response({ rateCards: [secondPageCard], total: 2, hasMore: false })
        : response({ rateCards: [firstPageCard], total: 2, hasMore: true }));
    }) as unknown as typeof fetch;

    render(<VendorRateCardsPage />);
    await flush();
    const quoteOne = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.quote1));
    expect(quoteOne).toHaveValue(null);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.copy4s9bsz)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.loadMoreRateCards) }));
    await flush();
    expect(screen.getByText('RC-ROUND-2-BLANK')).toBeInTheDocument();
    const roundTwoCard = screen.getByText('RC-ROUND-2-BLANK').closest('.card') as HTMLElement;
    fireEvent.click(roundTwoCard.firstElementChild as HTMLElement);
    const quoteTwo = within(roundTwoCard).getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRateCardsPage.quote2));
    expect(quoteTwo).toHaveValue(null);
    fireEvent.click(within(roundTwoCard).getByRole('button', {
      name: uiStringPattern(interpolateUiString(UI_STRINGS.common.currencyToLocaleString, { currency: 'Submit', toLocaleString: 'Vendor RC Quote-2' })),
    }));
    expect(screen.getByText(/valid rate greater than zero/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('enters the full-window negotiation view from a URL id or case-insensitive rate card number', async () => {
    window.history.replaceState({}, '', '/vendor-portal/rate-cards?negotiate=rc-round-2');
    render(<VendorRateCardsPage />);
    await flush();
    await waitFor(() => expect(screen.getByTestId('vendor-negotiation-workspace')).toBeInTheDocument());
    expect(screen.getByTestId('vendor-negotiation-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('vendor-negotiation-workspace')).toHaveTextContent('RC-ROUND-2');
    fireEvent.click(screen.getByRole('button', { name: 'Reload after success' }));
    await flush();
    expect(screen.getByTestId('vendor-negotiation-workspace')).toBeInTheDocument();
    window.history.replaceState({}, '', '/vendor-portal/rate-cards');
    fireEvent.click(screen.getByRole('button', { name: 'Return to list' }));
    await flush();
    expect(screen.getByText('RC-ROUND-1')).toBeInTheDocument();
  });
});
