/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorNegotiationWorkspace from '../src/components/VendorNegotiationWorkspace';
import { reportHandledClientFailure } from '../src/lib/observability/client-reporter';
import { UI_STRINGS } from "@/lib/ui-strings.constants";

jest.mock('../src/lib/observability/client-reporter', () => ({
  reportHandledClientFailure: jest.fn(),
}));

jest.mock('../src/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() }),
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

const rfq = {
  id: 'rfq-1', rfqNumber: 'RFQ-001', title: 'Electrical package',
  project: { name: 'North Plant', projectCode: 'NP-1' }, projectPackage: 'Electrical works', nextResponsibleParty: 'VENDOR',
  packageName: 'Package E', clientTenant: 'Buyer Corp', rfqReceivedDate: '2026-01-02T08:15:00Z',
  submissionDeadline: '2026-02-01', status: 'NEGOTIATION',
  lines: [
    { id: 'line-1', lineNumber: 1, description: 'Copper cable', specification: '4 core cable', category: 'Electrical', uom: 'MTR', quantity: 2 },
    { id: 'line-2', description: 'Switch', specification: '', category: '', uom: 'EA', quantity: 1 },
  ],
  quotes: [
    { id: 'q2', quoteVersion: 2, totalQuoteAmount: 1200, lines: [{ rfqLineId: 'line-1', unitRate: 550 }] },
    { id: 'q1', quoteVersion: 0, totalQuoteAmount: 1000, vendorId: 'vendor-1', lines: [{ rfqLineId: 'line-1', unitRate: 500 }, { lineId: 'line-2', unitRate: 0 }] },
  ],
  invitedVendors: [{ vendorId: 'invited-vendor' }],
  negotiations: [],
};

const submittedRfq = {
  ...rfq,
  nextResponsibleParty: 'BUYER',
  quotes: [
    rfq.quotes[0],
    { ...rfq.quotes[1], lines: [...rfq.quotes[1].lines, { lineId: 'line-2', unitRate: 500 }] },
  ],
  negotiations: [{ rounds: [{
    id: 'round-2', roundNumber: 0, lineItemsJson: JSON.stringify([{ rfqLineId: 'line-1', revisedRate: 450, counterRate: 440 }]),
    previousQuoteAmount: 1000, revisedQuoteAmount: 930, counterOfferAmount: 915,
    targetPrice: 900, status: 'FINAL_OFFER_SUBMITTED', nextResponsibleParty: 'BUYER', buyerDecision: null,
    notes: 'Best and final', deadline: '2026-03-01', createdAt: '2026-02-02T11:20:00Z', isFinalOffer: true,
  }] }],
};

function configureFetch(detail: unknown = { rfq }, session: unknown = { user: { role: 'VENDOR' } }) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/auth/session') return Promise.resolve(response(session));
    if (url === '/api/vendor-portal/rfqs/rfq-1') return Promise.resolve(response(detail));
    return Promise.resolve(response({}));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('vendor commercial negotiation workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    configureFetch();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('validates incomplete RFQ offers, saves and resets drafts, then submits a final offer', async () => {
    const onBack = jest.fn();
    const onSuccess = jest.fn();
    window.confirm = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<VendorNegotiationWorkspace mode="RFQ" data={rfq} vendorId="vendor-1" vendorName="Vendor One" isBuyer={false} onBack={onBack} onSuccess={onSuccess} />);

    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.commercialNegotiationWorkspace))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.awaitingQuote))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.pendingRateEntry))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitRevisedNegotiationOffer) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.pleaseEnterAValidProposedRateGreaterThanZeroForAllLengthLineItems))).toBeInTheDocument();

    const rateInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(rateInputs[0], { target: { value: '450' } });
    fireEvent.change(rateInputs[1], { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText(/State any payment milestone assumptions/), { target: { value: 'Net 30 days' } });
    fireEvent.click(screen.getByLabelText(/Declare as Binding Best & Final Offer/));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.copy3l4h8e, '', false))).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.draftSavedLocallyAt, '', false))).toBeInTheDocument();
    expect(localStorage.getItem('procpx_neg_draft_rfq_rfq-1')).toContain(UI_STRINGS.componentsVendorSourcingDashboard.net30Days);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reset) }));
    expect(window.confirm).toHaveBeenLastCalledWith(UI_STRINGS.componentsVendorNegotiationWorkspace.areYouSureYouWantToClearYourEnteredDraftRates);
    expect(rateInputs[0]).toHaveValue(450);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reset) }));
    expect(localStorage.getItem('procpx_neg_draft_rfq_rfq-1')).toBeNull();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.enteredRatesCleared))).toBeInTheDocument();

    const updatedInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(updatedInputs[0], { target: { value: '450' } });
    fireEvent.change(updatedInputs[1], { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText(/State any payment milestone assumptions/), { target: { value: 'Final commercial offer' } });
    const removeSubmittedDraft = jest.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => { throw new Error('storage denied'); });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitBindingFinalOffer) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/negotiations/submit-offer', expect.objectContaining({ method: 'POST' })));
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'clear_submitted_negotiation_draft',
        recordId: 'rfq-1',
        fallback: 'submission_succeeded_but_local_draft_remains',
      }),
    );
    removeSubmittedDraft.mockRestore();
    const post = mockFetch.mock.calls.find(([url]) => url === '/api/procurement/negotiations/submit-offer')?.[1];
    expect(JSON.parse(post.body)).toEqual(expect.objectContaining({
      rfqId: 'rfq-1', vendorId: 'vendor-1', revisedQuoteAmount: 1400, isFinalOffer: true,
      notes: 'Final commercial offer', submittedByVendor: 'Vendor One',
    }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.offerSubmittedSuccessfully))).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });

  it('refreshes buyer RFQs through the tenant-scoped procurement detail API', async () => {
    configureFetch({ rfq: submittedRfq }, { user: { role: 'PROCUREMENT_MANAGER' } });
    render(<VendorNegotiationWorkspace mode="RFQ" data={submittedRfq} isBuyer onBack={jest.fn()} />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/procurement/rfqs/rfq-1?includeNegotiationHistory=true',
    ));
    expect(mockFetch).not.toHaveBeenCalledWith('/api/vendor-portal/rfqs/rfq-1');
  });

  it('restores local drafts, handles buyer counters and malformed rounds, and refreshes current RFQ data', async () => {
    localStorage.setItem('procpx_neg_draft_rfq_rfq-1', JSON.stringify({ rates: { 'line-1': 440, 'line-2': 470 }, notes: 'Saved note', isFinalOffer: false, savedAt: '09:15' }));
    const dataWithCounter = {
      ...rfq,
      negotiations: [{ rounds: [
        { id: 'bad', roundNumber: 1, lineItemsJson: '{bad json', revisedQuoteAmount: null, counterOfferAmount: null },
        { id: 'counter', roundNumber: 2, lineItemsJson: JSON.stringify([{ lineId: 'line-1', counterRate: 420 }]), previousQuoteAmount: 1000, counterOfferAmount: 850, targetPrice: 800, status: 'ROUND_ACTIVE', nextResponsibleParty: 'VENDOR', notes: 'Please improve', deadline: 'invalid-date', createdAt: 'invalid-date' },
        { id: 'latest', roundNumber: 3, lineItemsJson: [{ id: 'line-2', revisedRate: 475, counterRate: 470 }], previousQuoteAmount: 900, counterOfferAmount: 800, targetPrice: 750, revisedQuoteAmount: null, status: 'ROUND_ACTIVE', nextResponsibleParty: 'VENDOR', notes: 'Latest round context', createdAt: null },
      ] }],
    };
    configureFetch({ rfq: dataWithCounter });
    render(<VendorNegotiationWorkspace mode="RFQ" data={dataWithCounter} vendorName="Vendor One" isBuyer={false} onBack={jest.fn()} />);
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      expect.objectContaining({
        operation: 'parse_negotiation_round_line_items',
        roundId: 'bad',
        field: 'lineItemsJson',
      }),
    );
    expect(await screen.findByText(/Buyer Counteroffer Received/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.actionRequiredSubmitRevisedOffer))).toBeInTheDocument();
    expect(screen.getByText(/Latest round context/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.draftSavedAt, '', false))).toBeInTheDocument();
    expect((document.querySelectorAll('input[type="number"]')[0] as HTMLInputElement).value).toBe('440');
    expect((document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement).value).toBe('470');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.buyerCounterofferRate, '', false))).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Refresh latest negotiation rounds/));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/rfqs/rfq-1'));
  });

  it('shows buyer and submitted revision read-only states, including binding offer details', async () => {
    configureFetch({ rfq: submittedRfq });
    const vendorView = render(<VendorNegotiationWorkspace mode="RFQ" data={submittedRfq} isBuyer={false} onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.vendorRevisionSubmitted))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.readOnly, '', false))).toBeInTheDocument();
    expect(screen.getByText(/Binding Best & Final Offer/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(uiStringPattern(UI_STRINGS.common.copywwhtor))).not.toBeInTheDocument();
    vendorView.unmount();

    configureFetch({ rfq: submittedRfq }, { user: { role: 'PROCUREMENT_USER' } });
    render(<VendorNegotiationWorkspace mode="RFQ" data={submittedRfq} isBuyer onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.vendorRevisionSubmittedRound, '', false))).toBeInTheDocument();
    expect(await screen.findByText(/Buyer Counteroffer Dispatched/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.buyerRemarks))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit Revised/ })).not.toBeInTheDocument();
  });

  it('edits and submits rate-card proposals and displays server errors', async () => {
    const rateCard = {
      id: 'rate-card-1', rateCardNumber: 'RC-001', category: 'Electrical', subcategory: 'Building', scope: 'Regional scope',
      items: [
        { id: 'rc-line-1', description: 'Cable', specification: '4 core', uom: 'MTR', rate: 100, proposedRate: 110, benchmarkRate: 120, location: 'North' },
        { id: 'rc-line-2', description: 'Switch', uom: 'EA', rate: 50, historicalRate: 55 },
        { id: 'rc-line-3', description: 'Socket', uom: 'EA' },
      ],
    };
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/session') return Promise.resolve(response({ user: { role: 'VENDOR' } }));
      if (url === '/api/vendor-portal/rate-cards') return Promise.resolve(response({ error: 'Rate card is closed.' }, false));
      return Promise.resolve(response({}));
    });
    render(<VendorNegotiationWorkspace mode="RATE_CARD" data={rateCard} isBuyer={false} onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.masterRateCardNegotiation))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.allLocations)).length).toBeGreaterThan(0);
    const inputs = document.querySelectorAll('input[type="number"]');
    expect((inputs[0] as HTMLInputElement).value).toBe('110');
    fireEvent.change(inputs[0], { target: { value: '115' } });
    fireEvent.change(inputs[1], { target: { value: '' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.proposedAverage))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/State any payment milestone assumptions/), { target: { value: 'Annual review' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitProposedRateCardRevisions) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.pleaseEnterAValidProposedRateGreaterThanZeroForAllLengthLineItems))).toBeInTheDocument();
    fireEvent.change(inputs[1], { target: { value: '60' } });
    fireEvent.change(inputs[2], { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitProposedRateCardRevisions) }));
    expect(await screen.findByText('Rate card is closed.')).toBeInTheDocument();
    const post = mockFetch.mock.calls.find(([url]) => url === '/api/vendor-portal/rate-cards')?.[1];
    expect(JSON.parse(post.body)).toEqual({ rateCardId: 'rate-card-1', items: [{ id: 'rc-line-1', proposedRate: 115 }, { id: 'rc-line-2', proposedRate: 60 }, { id: 'rc-line-3', proposedRate: 70 }], remarks: 'Annual review' });
  });

  it('handles failed storage recovery, failed refresh, and network submission errors', async () => {
    localStorage.setItem('procpx_neg_draft_rfq_rfq-1', 'invalid json');
    let detailCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/session') return Promise.resolve(response({ user: { role: 'VENDOR' } }));
      if (url === '/api/vendor-portal/rfqs/rfq-1') {
        detailCalls += 1;
        return detailCalls === 1 ? Promise.resolve(response({ rfq })) : Promise.reject(new Error('refresh failed'));
      }
      if (url === '/api/procurement/negotiations/submit-offer') return Promise.reject(new Error('connection lost'));
      return Promise.resolve(response({}));
    });
    global.fetch = mockFetch as typeof fetch;
    render(<VendorNegotiationWorkspace mode="RFQ" data={rfq} vendorId="vendor-1" isBuyer={false} onBack={jest.fn()} />);
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      expect.objectContaining({
        operation: 'restore_negotiation_draft',
        fallback: 'use_initial_rate_and_note_values',
      }),
    );
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.commercialNegotiationWorkspace))).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Refresh latest negotiation rounds/));
    await waitFor(() => expect(detailCalls).toBe(2));
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'refresh_negotiation_rfq',
        route: '/api/vendor-portal/rfqs/:id',
        recordId: 'rfq-1',
        fallback: 'continue_with_initial_rfq_data',
      }),
    );
    const inputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(inputs[0], { target: { value: '10' } });
    fireEvent.change(inputs[1], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitRevisedNegotiationOffer) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/negotiations/submit-offer', expect.anything()));
    expect(await screen.findByText('connection lost')).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'submit_negotiation_offer',
        fallback: 'show_submission_error',
      }),
    );

    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = jest.fn(() => { throw new Error('blocked'); });
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) })[0]);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.failedToSaveDraftLocallyInBrowserStorage))).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'persist_negotiation_draft',
        fallback: 'show_draft_save_error',
      }),
    );
    Storage.prototype.setItem = originalSetItem;
  });

  it('uses the session role and RFQ fallback values for empty buyer queues and vendor responses', async () => {
    const emptyRfq = {
      id: 'rfq-empty', rfqNumber: 'RFQ-EMPTY', title: 'Empty scope', projectPackage: '',
      project: {}, packageName: '', tenant: {}, clientTenant: '', rfqReceivedDate: null,
      submissionDeadline: null, nextResponsibleParty: null, buyerDecisionStatus: '', negotiationStatus: '',
      lines: [], quotes: null, negotiations: [{ rounds: null }],
      rounds: [{ id: 'buyer-counter', roundNumber: 0, lineItemsJson: [], previousQuoteAmount: 500, counterOfferAmount: 450, targetPrice: 440, revisedQuoteAmount: null, status: 'ROUND_ACTIVE', nextResponsibleParty: 'VENDOR', notes: '', createdAt: null }],
    };
    configureFetch({}, { user: { role: 'PROJECT_APPROVER' } });
    const buyerView = render(<VendorNegotiationWorkspace mode="RFQ" data={emptyRfq} isBuyer onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.commercialNegotiationWorkspace))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.generalProject, '', true))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.mainPackage))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.enterpriseClient))).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.actionDueForParty, { party: 'VENDOR' }))).toBeInTheDocument();
    expect(screen.getByText(/Buyer Counteroffer Dispatched/)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.awaitingVendorResponse)).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.noRemarksProvidedByVendorForThisRound))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit Revised Negotiation/ })).not.toBeInTheDocument();
    expect(screen.getByText('Total Scope: 0 Line Items')).toBeInTheDocument();
    buyerView.unmount();

    configureFetch({}, {});
    render(<VendorNegotiationWorkspace mode="RFQ" data={{ ...emptyRfq, rounds: [] }} onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.commercialNegotiationWorkspace))).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.cancelReturn) })).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.actionDueForParty, { party: 'VENDOR' }))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.lengthLineItemsUnderNegotiation))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitRevisedNegotiationOffer) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/negotiations/submit-offer', expect.anything()));
    const emptyPost = mockFetch.mock.calls.find(([url]) => url === '/api/procurement/negotiations/submit-offer')?.[1];
    expect(JSON.parse(emptyPost.body)).toEqual(expect.objectContaining({ revisedQuoteAmount: 0, lineItems: [] }));
  });

  it('keeps draft recovery resilient to storage errors and refresh responses without an RFQ', async () => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = jest.fn(() => { throw new Error('storage blocked'); });
    render(<VendorNegotiationWorkspace mode="RFQ" data={{ ...rfq, project: null, projectPackage: '', packageName: '', clientTenant: '', tenant: null, rfqReceivedDate: Symbol('invalid-date'), submissionDeadline: null, nextResponsibleParty: 'OTHER', lines: [], quotes: [], negotiations: [] }} isBuyer={false} onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.generalProject, '', true))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.mainPackage))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.enterpriseClient))).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.actionDueForParty, { party: 'OTHER' }))).toHaveClass('badge-draft');
    Storage.prototype.getItem = originalGetItem;

    fireEvent.click(screen.getByTitle(/Refresh latest negotiation rounds/));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/rfqs/rfq-1'));
  });

  it('shows a buyer counter without an original total, clears blank vendor rates, and contains reset storage errors', async () => {
    const counterRfq = {
      ...rfq,
      quotes: [],
      negotiations: [{ rounds: [{
        id: 'counter-only', roundNumber: 0, lineItemsJson: [{ lineId: 'line-1', revisedRate: 0 }],
        previousQuoteAmount: null, counterOfferAmount: 700, targetPrice: 0, revisedQuoteAmount: null,
        status: 'ROUND_ACTIVE', nextResponsibleParty: 'VENDOR', notes: 'Counter with no baseline', createdAt: Symbol('invalid-date'),
      }] }],
    };
    configureFetch({ rfq: counterRfq });
    window.confirm = jest.fn().mockReturnValue(true);
    render(<VendorNegotiationWorkspace mode="RFQ" data={counterRfq} isBuyer={false} onBack={jest.fn()} />);
    expect(await screen.findByText(/Buyer Counteroffer Received/)).toBeInTheDocument();
    expect(screen.getByText(/Counter with no baseline/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.lengthLineItemsUnderNegotiation))).toBeInTheDocument();
    const rates = document.querySelectorAll('input[type="number"]');
    fireEvent.change(rates[0], { target: { value: '0' } });
    fireEvent.change(rates[0], { target: { value: '' } });
    expect((rates[0] as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reset) }));
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => { throw new Error('storage blocked'); });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reset) }));
    expect(removeItem).toHaveBeenCalledWith('procpx_neg_draft_rfq_rfq-1');
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'reset_negotiation_draft',
        fallback: 'preserve_current_rates_and_notes',
      }),
    );
    removeItem.mockRestore();
  });

  it('uses quote vendor fallback and reports generic errors, then succeeds for an empty rate card without callbacks', async () => {
    const noLineRfq = { ...rfq, lines: null, quotes: [{ vendorId: 'quote-fallback' }], invitedVendors: [] };
    configureFetch({ rfq: noLineRfq });
    const rfqView = render(<VendorNegotiationWorkspace mode="RFQ" data={noLineRfq} onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.commercialNegotiationWorkspace))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitRevisedNegotiationOffer) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/negotiations/submit-offer', expect.anything()));
    const rfqPost = mockFetch.mock.calls.find(([url]) => url === '/api/procurement/negotiations/submit-offer')?.[1];
    expect(JSON.parse(rfqPost.body).vendorId).toBe('quote-fallback');
    rfqView.unmount();

    const view = render(<VendorNegotiationWorkspace mode="RATE_CARD" data={{
      id: 'empty-rate-card', rateCardNumber: 'RC-EMPTY', category: 'Civil', validFrom: 'invalid', validTo: null,
      items: undefined, subcategory: '', scope: '', location: '', status: '', approvalLevel: '',
    }} isBuyer={false} onBack={jest.fn()} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.masterRateCardNegotiation))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.standardScope))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.panIndia))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.aPPROVED))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT))).toBeInTheDocument();
    expect(screen.getByText('Total Scope: 0 Line Items')).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/0\s*\/ unit/);

    let postCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/session') return Promise.resolve(response({}, false));
      if (url === '/api/vendor-portal/rate-cards') {
        postCalls += 1;
        return Promise.resolve(response({}, postCalls > 1));
      }
      return Promise.resolve(response({}));
    });
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => { throw new Error('storage blocked'); });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitProposedRateCardRevisions) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitProposedRateCardRevisions) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.offerSubmittedSuccessfully))).toBeInTheDocument();
    expect(removeItem).toHaveBeenCalledWith('procpx_neg_draft_rc_empty-rate-card');
    removeItem.mockRestore();
    mockFetch.mockImplementationOnce(() => Promise.reject({}));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.submitProposedRateCardRevisions) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.anErrorOccurredDuringSubmissionPleaseTryAgain))).toBeInTheDocument();
    view.unmount();
  });
});
