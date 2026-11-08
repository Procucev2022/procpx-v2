/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VendorRfqWorkspacePage from '../src/app/(app)/vendor-portal/rfqs/[id]/page';
import { reportHandledClientFailure } from '../src/lib/observability/client-reporter';

jest.mock('../src/lib/observability/client-reporter', () => ({
  reportHandledClientFailure: jest.fn(),
}));
const mockToastSuccess = jest.fn();
const mockRouterPush = jest.fn();
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'rfq-vendor-1' }), useRouter: () => ({ push: mockRouterPush }) }));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => ({ success: mockToastSuccess, error: jest.fn() }) }));
jest.mock('../src/components/RfqChatDrawer', () => ({
  __esModule: true,
  default: ({ isOpen, rfqNumber, onClose }: any) => isOpen ? <aside data-testid="rfq-chat">{rfqNumber}<button onClick={onClose}>Close chat</button></aside> : null,
}));

const lineOne = { id: 'line-1', description: 'Copper cable', specification: '4 core PVC', quantity: 10, uom: 'MTR', benchmarkRate: 120 };
const lineTwo = { id: 'line-2', description: 'Control panel', quantity: 2, uom: 'EA', benchmarkRate: 250 };
const baseRfq: any = {
  id: 'rfq-vendor-1', rfqNumber: 'RFQ-2026-001', title: 'Electrical Package', status: 'OPEN',
  submissionDeadline: '2026-12-31', project: { name: 'North Plant', projectCode: 'NP-01' }, tenant: { name: 'Buyer Corp' },
  lines: [lineOne, lineTwo], quotes: [], negotiations: [],
};
const originalFetch = global.fetch;
const mockFetch = jest.fn();
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
let responseRfq: any = baseRfq;
let quoteResponse: any = reply({ quote: { quoteNumber: 'Q-001' } });

function configureFetch() {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve(quoteResponse);
    return Promise.resolve(reply({ rfq: responseRfq }));
  });
  global.fetch = mockFetch as typeof fetch;
}

describe('vendor portal RFQ detail workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    responseRfq = baseRfq;
    quoteResponse = reply({ quote: { quoteNumber: 'Q-001' } });
    configureFetch();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { global.fetch = originalFetch; });

  it('loads line items, saves and restores a local draft, resets it and submits a quotation', async () => {
    localStorage.setItem('procpx_quote_draft_rfq-vendor-1', JSON.stringify({
      lineQuotes: { 'line-1': { unitRate: '99', gstPercent: '5', leadTimeDays: '7', technicalCompliance: 'PARTIAL_COMPLIANCE', remarks: 'Drafted' } },
      commercialNotes: 'Saved terms', validUntil: '2026-11-30', savedAt: '10:30 AM',
    }));
    render(<VendorRfqWorkspacePage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.loadingRFQWorkspace))).toBeInTheDocument();
    expect(await screen.findByText('RFQ-2026-001 — Electrical Package')).toBeInTheDocument();
    expect(screen.getByText(/Project: North Plant/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('99')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Saved terms')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.draftSavedLocallyAtNow))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.awaitingQuote))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.clarificationChat) }));
    expect(screen.getByTestId('rfq-chat')).toHaveTextContent('RFQ-2026-001');
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(screen.queryByTestId('rfq-chat')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.refresh2)));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/rfqs/rfq-vendor-1'));
    expect(await screen.findByText('RFQ-2026-001 — Electrical Package')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) }));
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.draftSavedLocallyAt, "", false)).length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('procpx_quote_draft_rfq-vendor-1')!).lineQuotes['line-1'].unitRate).toBe('99');

    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.common.copywwhtor))[0], { target: { value: '100' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.common.copywwhtor))[1], { target: { value: '200' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '12' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'EXCEPTION' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.days))[0], { target: { value: '5' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.eG30DaysCreditFromInvoiceSubmission))[0], { target: { value: 'Net 45' } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-12-15' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.totalOfferAmount, "", false))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.submit1stQuote) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/rfqs/rfq-vendor-1', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body as string);
    expect(payload).toMatchObject({
      validUntil: '2026-12-15', commercialNotes: 'Net 45', technicalCompliance: 'COMPLIANT',
      lines: [
        { rfqLineId: 'line-1', unitRate: 100, gstPercent: 12, leadTimeDays: 5, technicalCompliance: 'EXCEPTION' },
        { rfqLineId: 'line-2', unitRate: 200, gstPercent: 18, leadTimeDays: 14, technicalCompliance: 'COMPLIANT' },
      ],
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(UI_STRINGS.appAppVendorPortalRfqsIdPage.quoteSubmittedSuccessfully, 'RFQ-2026-001', UI_STRINGS.common.userMessages.awaitingBuyerEvaluation);
  });

  it('shows buyer counters, accepts counter rates and handles failed revisions and storage errors', async () => {
    const existingQuote = {
      id: 'quote-1', quoteNumber: 'Q-001', quoteVersion: 2, totalQuoteAmount: 2600,
      submittedAt: '2026-10-01T12:00:00Z', commercialNotes: 'Original terms', validUntil: '2026-12-01',
      lines: [{ rfqLineId: 'line-1', unitRate: 200, lineTotal: 2360, gstPercent: 18, leadTimeDays: 12, technicalCompliance: 'COMPLIANT', remarks: 'Original' }],
    };
    const round = {
      id: 'round-1', status: 'COUNTEROFFER_SENT', counterOfferAmount: 1800, previousQuoteAmount: 2600,
      revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR', createdAt: '2026-10-02T12:00:00Z',
      deadline: '2026-12-10', notes: 'Please sharpen the pricing',
      lineItemsJson: JSON.stringify([{ rfqLineId: 'line-1', counterRate: 150, lineTotal: 1500 }]),
    };
    responseRfq = { ...baseRfq, status: 'UNDER_NEGOTIATION', quotes: [existingQuote], negotiations: [{ id: 'neg-1', rounds: [round] }] };
    render(<VendorRfqWorkspacePage />);
    expect(await screen.findByText(/Buyer Counteroffer Received/)).toBeInTheDocument();
    expect(screen.getByText('Please sharpen the pricing')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.awaitingYourResponse)).length).toBeGreaterThan(0);
    expect(screen.getByText('Submitted Quotation Summary — Q-001 (Version 2)')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.categoryManagerCounterofferHistoryBuyerOffers14))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.acceptCounterofferRates) }));
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancel Revision/ }));
    expect(screen.getByText('Submitted Quotation Summary — Q-001 (Version 2)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enter Revised Quote/ }));
    expect(screen.getByRole('button', { name: /Cancel Revision/ })).toBeInTheDocument();

    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied'); });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveDraft) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.failedToSaveDraftLocallyInBrowserStorage))).toBeInTheDocument();

    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.common.copywwhtor))[0], { target: { value: '145' } });
    quoteResponse = reply({ error: 'Quotation window closed' }, false);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.submitQuoteVersionValue1, {"value1":"3"})) }));
    expect(await screen.findByText('Quotation window closed')).toBeInTheDocument();
  });

  it('shows initial load errors and safely ignores malformed stored data and reset storage failures', async () => {
    mockFetch.mockResolvedValueOnce(reply({ error: 'RFQ unavailable' }, false));
    const failedView = render(<VendorRfqWorkspacePage />);
    expect(await screen.findByText('RFQ unavailable')).toBeInTheDocument();
    failedView.unmount();

    localStorage.setItem('procpx_quote_draft_rfq-vendor-1', '{bad json');
    responseRfq = { ...baseRfq, project: null, tenant: null, submissionDeadline: null, lines: [] };
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const view = render(<VendorRfqWorkspacePage />);
    expect(await screen.findByText(/Project: Enterprise Project/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.open))).toBeInTheDocument();
    expect(screen.getByText('0 Items')).toBeInTheDocument();
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'restore_vendor_quote_draft',
        fallback: 'use_quote_values_from_rfq',
      }),
    );
    view.unmount();
  });

  it('covers sparse quote data, terminal negotiation rounds, and malformed negotiation payloads', async () => {
    responseRfq = {
      ...baseRfq,
      project: { name: '' },
      tenant: { name: '' },
      submissionDeadline: null,
      lines: [
        { ...lineOne, description: '', itemDescription: 'Fallback cable', quantity: 0 },
        { ...lineTwo, description: 'Unquoted panel' },
      ],
      quotes: [{
        id: 'quote-sparse', quoteNumber: 'Q-SPARSE', quoteVersion: 5, totalAmount: 75,
        submittedAt: null, createdAt: '2026-10-01T12:00:00Z', submittedBy: '',
        totalBaseAmount: null, taxAmount: undefined, totalQuoteAmount: null,
        commercialTerms: '', validUntil: null,
        lines: [{ rfqLineId: 'line-1', unitRate: 0, lineTotal: 0, gstPercent: null, leadTimeDays: 0, technicalCompliance: 'COMPLIANT', remarks: '' }],
      }],
      negotiations: [
        { rounds: null },
        { rounds: [
          {
            id: 'round-superseded', status: 'SUPERSEDED', counterOfferAmount: 700,
            previousQuoteAmount: 0, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR',
            createdAt: '2026-10-01T10:00:00Z', notes: '', deadline: null,
            lineItemsJson: '{malformed',
          },
          {
            id: 'round-addressed', status: '', counterOfferAmount: null,
            previousQuoteAmount: null, revisedQuoteAmount: 0, nextResponsibleParty: 'BUYER',
            buyerDecision: null, createdAt: '2026-10-02T10:00:00Z', notes: '',
            lineItemsJson: '{malformed',
          },
          {
            id: 'round-active', status: 'COUNTEROFFER_SENT', counterOfferAmount: 500,
            previousQuoteAmount: null, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR',
            createdAt: '2026-10-03T10:00:00Z', notes: '', lineItemsJson: '{malformed',
          },
        ] },
      ],
    };
    const view = render(<VendorRfqWorkspacePage />);
    expect(await screen.findByRole('heading', { level: 2, name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.submittedQuotationSummary, "", false) })).toHaveTextContent('Q-SPARSE');
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      expect.objectContaining({
        operation: 'parse_vendor_buyer_counter_offer_lines',
        field: 'lineItemsJson',
        recordId: 'rfq-vendor-1',
      }),
    );
    expect(screen.getByText('Fallback cable')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.max5QuoteVersionsReached))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.addressed))).toBeInTheDocument();
    expect(screen.getByText(/Submitted by: Vendor/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.open))).toBeInTheDocument();
    expect(screen.getByText(/₹75/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Revised Quote (v6)' }));
    expect(screen.getByText('Fallback cable')).toBeInTheDocument();
    view.unmount();
  });

  it('handles buyer revision submissions, counter-rate fallbacks, and quote cleanup failures', async () => {
    responseRfq = {
      ...baseRfq,
      lines: [
        { ...lineOne, benchmarkRate: 0 },
        { ...lineTwo, quantity: 0, benchmarkRate: undefined },
      ],
      quotes: [{
        id: 'quote-4', quoteNumber: 'Q-004', quoteVersion: 4, totalQuoteAmount: 500,
        createdAt: '2026-10-01T12:00:00Z', submittedAt: null, lines: [],
      }],
      negotiations: [{ rounds: [
        {
          id: 'round-bad-json', status: 'COUNTEROFFER_SENT', counterOfferAmount: 400,
          previousQuoteAmount: null, revisedQuoteAmount: null, nextResponsibleParty: 'VENDOR',
          createdAt: '2026-10-02T12:00:00Z', lineItemsJson: [
            { id: 'line-1', counterRate: 0 },
            { lineId: 'line-2', counterRate: 110, lineTotal: 220 },
            { rfqLineId: 'unknown', lineTotal: 10 },
          ], notes: null, deadline: null,
        },
        {
          id: 'round-revised', status: 'FINAL_OFFER_SUBMITTED', counterOfferAmount: null,
          previousQuoteAmount: 500, revisedQuoteAmount: 450, nextResponsibleParty: 'BUYER',
          buyerDecision: null, createdAt: '2026-10-01T12:00:00Z', notes: 'Vendor revised',
          lineItemsJson: [
            { id: 'line-1', counterRate: 0 },
            { lineId: 'line-2', counterRate: 110, lineTotal: 220 },
            { rfqLineId: 'unknown', lineTotal: 10 },
          ],
        },
      ] }],
    };
    render(<VendorRfqWorkspacePage />);
    expect(await screen.findByText(/Buyer Counteroffer Received/)).toBeInTheDocument();
    expect(screen.getByText(/Submit Revised Quote \(v5\)/)).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.buyerCounterRate, "", false))).toHaveLength(2);
    expect(screen.getAllByText(/Buyer Offer 1/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.acceptCounterofferRates) }));
    expect(screen.getAllByDisplayValue('40000')).toHaveLength(1);
    expect(screen.getByDisplayValue('110')).toBeInTheDocument();

    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.common.copywwhtor))[0], { target: { value: '90' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.common.copywwhtor))[1], { target: { value: '80' } });
    fireEvent.change(screen.getAllByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.days))[0], { target: { value: '' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '0' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.eG30DaysCreditFromInvoiceSubmission)), { target: { value: '' } });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage denied'); });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.submitQuoteVersionValue1, {"value1":"5"})) }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/vendor-portal/rfqs/rfq-vendor-1', expect.objectContaining({ method: 'POST' })));
    expect(reportHandledClientFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'clear_submitted_quote_draft',
        recordId: 'rfq-vendor-1',
        fallback: 'quotation_succeeded_but_local_draft_remains',
      }),
    );
    const payload = JSON.parse(mockFetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body as string);
    expect(payload.validUntil).toBeNull();
    expect(payload.commercialNotes).toBeNull();
    expect(payload.lines[0]).toMatchObject({ unitRate: 90, gstPercent: 0, leadTimeDays: null, technicalCompliance: 'COMPLIANT' });
    expect(payload.lines[1]).toMatchObject({ unitRate: 80, gstPercent: 18, leadTimeDays: 14 });
  });

  it('uses buyer revision state and handles empty initial values and quote submission JSON errors', async () => {
    responseRfq = {
      ...baseRfq,
      lines: [{ ...lineOne, quantity: 0 }],
      quotes: [{ id: 'quote-1', quoteNumber: 'Q-001', quoteVersion: 1, totalAmount: 0, createdAt: '2026-10-01T12:00:00Z', lines: [] }],
      negotiations: [{ rounds: [{
        id: 'revision-submitted', status: 'FINAL_OFFER_SUBMITTED', counterOfferAmount: 90,
        previousQuoteAmount: 100, revisedQuoteAmount: 80, nextResponsibleParty: 'VENDOR',
        buyerDecision: 'PENDING', createdAt: '2026-10-02T12:00:00Z', notes: null,
        lineItemsJson: [{ rfqLineId: 'line-1', counterRate: 70 }],
      }] }],
    };
    render(<VendorRfqWorkspacePage />);
    expect(await screen.findByRole('heading', { level: 2, name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.submittedQuotationSummary, "", false) })).toHaveTextContent('Q-001');
    expect(screen.getAllByText(uiStringPattern(interpolateUiString(UI_STRINGS.common.toLocaleString2, {"toLocaleString":"0"}), '', true)).length).toBeGreaterThan(0);
    expect(screen.getByText('FINAL OFFER SUBMITTED')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Revised Quote (v2)' }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.cancelRevisionReturnToSummary) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppVendorPortalRfqsIdPage.acceptCounterofferRates) }));
    expect(screen.getByDisplayValue('70')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.copywwhtor)), { target: { value: '25' } });
    quoteResponse = { ok: false, json: async () => { throw new Error('invalid response'); } };
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.submitQuoteVersionValue1, {"value1":"2"})) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToSubmitQuotation))).toBeInTheDocument();
  });

  it('uses a generic load error when an unsuccessful RFQ response has invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('invalid response'); } });
    render(<VendorRfqWorkspacePage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadRfqWorkspace))).toBeInTheDocument();
  });
});
