/** @jest-environment jsdom */

import { UI_STRINGS } from '@/lib/ui-strings.constants';

import { uiStringPattern, interpolateUiString } from '@/lib/i18n';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProcurementCommercialWorkspace from '../src/components/ProcurementCommercialWorkspace';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

jest.mock('../src/components/ui/Toast', () => ({
  useToast: () => mockToast,
}));

jest.mock('../src/components/ui/BoqDescriptionCell', () => ({
  __esModule: true,
  default: ({ text }: { text: string | null }) => <span>{text || 'No BOQ description'}</span>,
}));

const baseRfq = () => ({
  id: 'rfq-1',
  rfqNumber: 'RFQ-2026-001',
  estimatedBenchmarkValue: 1000,
  paymentTerms: 'Net 45',
  deliveryRequirement: 'Deliver within 20 days',
  commercialValidityDays: 30,
  lines: [
    {
      id: 'line-1', lineNumber: 1, itemCode: 'CEM-01', description: 'Cement supply',
      specification: '53 grade cement', quantity: 2, uom: 'BAG', benchmarkRate: 100,
      boqLine: {
        originalDescription: 'Supply cement to the north site', specification: '53 grade cement',
        category: { name: 'Materials' }, subcategory: { name: 'Cement' }, location: 'North site',
        brand: 'BuildCo', model: 'C53', material: 'Portland', grade: '53', standard: 'IS-269',
        remarks: 'Keep dry', drawingReference: 'DR-100', costSource: 'AI estimate',
      },
    },
    {
      id: 'line-2', lineNumber: 2, itemCode: 'SAND-02', description: 'Washed sand',
      quantity: 3, uom: 'M3', benchmarkRate: 50,
    },
  ],
  invitedVendors: [
    { vendorId: 'v1', vendor: { name: 'Alpha Materials', code: 'A-01' } },
    { vendorId: 'v2', vendor: { name: 'Beta Supply', code: 'B-02' } },
    { vendorId: 'v3', vendor: { name: 'No Quote Co', code: '' } },
  ],
  quotes: [
    {
      id: 'q1', vendorId: 'v1', quoteVersion: 1, totalQuoteAmount: 500,
      lines: [
        { rfqLineId: 'line-1', unitRate: 90 },
        { rfqLineId: 'line-2', unitRate: 120 },
      ],
    },
    {
      id: 'q2', vendorId: 'v2', quoteVersion: 1, totalQuoteAmount: 450,
      lines: [{ rfqLineId: 'line-1', unitRate: 110 }],
    },
  ],
  negotiations: [{ rounds: [
    { id: 'r1', vendorId: 'v1', roundNumber: 1, counterOfferAmount: 470, revisedQuoteAmount: null, status: 'PENDING', nextResponsibleParty: 'VENDOR', notes: 'Awaiting reply' },
    { id: 'r2', vendorId: 'v1', roundNumber: 2, counterOfferAmount: 460, revisedQuoteAmount: null, status: 'SUPERSEDED', nextResponsibleParty: 'VENDOR', notes: 'Replaced' },
    { id: 'r3', vendorId: 'v1', roundNumber: 3, counterOfferAmount: 455, revisedQuoteAmount: 440, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'BUYER', notes: 'Updated quote' },
  ] }],
  boqRevision: { lines: [] },
});

const baseComparison = () => ({
  summary: { totalBenchmark: 1000 },
  lines: [
    {
      id: 'line-1', lineNumber: 1, itemCode: 'CEM-01', itemDescription: 'Cement supply',
      boqDescription: 'Supply cement to the north site', aiUnitCost: 100, lowestCompliantVendorId: 'v1',
      vendorQuotes: {
        v1: { quoted: true, rate: 90, amount: 180 },
        v2: { quoted: true, rate: 110, amount: 220 },
      },
      boqLine: { fullBoqDescription: 'Full cement scope', specification: '53 grade cement' },
    },
    {
      id: 'line-2', lineNumber: 2, itemCode: 'SAND-02', itemDescription: 'Washed sand',
      boqDescription: null, aiUnitCost: 50, lowestCompliantVendorId: 'v1',
      vendorQuotes: { v1: { quoted: true, rate: 120, amount: 360 } },
    },
  ],
});

const renderWorkspace = (overrides: Partial<React.ComponentProps<typeof ProcurementCommercialWorkspace>> = {}) => {
  const props = {
    rfq: baseRfq(),
    comparison: baseComparison(),
    rateCardMatch: null,
    isDemoMode: false,
    onRecordQuote: jest.fn(),
    onOpenRateCards: jest.fn(),
    onNegotiationSubmitted: jest.fn(),
    ...overrides,
  };
  return { ...render(<ProcurementCommercialWorkspace {...props} />), props };
};

describe('ProcurementCommercialWorkspace', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('renders quote comparison statuses, rankings, commercial terms, and opens each negotiation history state', () => {
    renderWorkspace();

    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.completeQuote, '', true))).toBeInTheDocument();
    expect(screen.getByText('Partial Quote (1/2 items)')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.noQuote, '', true))).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Materials').length).toBeGreaterThan(0);
    expect(screen.getByText('Net 45')).toBeInTheDocument();
    expect(screen.getByText('Deliver within 20 days')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsIdPage.copy1xeupjt))).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.viewSequentialNegotiationAuditHistoryForThisSupplier)));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.negotiationHistoryAuditTrail))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sUPERSEDED))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.rEVISED))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.awaitingResponse))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.viewSequentialNegotiationAuditHistoryForThisSupplier)));
    const historyHeader = screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.negotiationHistoryAuditTrail)).parentElement!.parentElement!;
    fireEvent.click(historyHeader.querySelector('button')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.negotiationHistoryAuditTrail))).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.commercialTermsVendorConditions)));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.expandTerms, "", false) })).toBeInTheDocument();
    expect(screen.queryByText('Net 45')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.expandTerms, "", false) }));
    expect(screen.getByText('Net 45')).toBeInTheDocument();
  });

  it('ranks tied complete vendor offers and handles a final buyer-reviewed quote', () => {
    const rfq = baseRfq();
    rfq.estimatedBenchmarkValue = 100;
    rfq.quotes = [
      ...rfq.quotes,
      { id: 'q-v2-revised', vendorId: 'v2', quoteVersion: 2, totalQuoteAmount: 510, lines: [
        { rfqLineId: 'line-1', unitRate: 120 }, { rfqLineId: 'line-2', unitRate: 90 },
      ] },
      { id: 'q-v3-initial', vendorId: 'v3', quoteVersion: 1, totalQuoteAmount: 510, lines: [
        { rfqLineId: 'line-1', unitRate: 125 }, { rfqLineId: 'line-2', unitRate: 85 },
      ] },
    ] as any;
    rfq.negotiations = [{ rounds: [
      ...rfq.negotiations[0].rounds,
      { id: 'r-final', vendorId: 'v1', roundNumber: 4, counterOfferAmount: null, revisedQuoteAmount: 430, status: 'FINAL_OFFER_SUBMITTED', nextResponsibleParty: 'VENDOR', buyerDecision: 'REVIEWED' },
      { id: 'r-pending-review', vendorId: 'v1', roundNumber: 5, counterOfferAmount: null, revisedQuoteAmount: 420, status: 'REVISED_SUBMITTED', nextResponsibleParty: 'VENDOR', buyerDecision: null },
    ] }] as any;

    const comparison = baseComparison();
    comparison.lines[0].vendorQuotes.v1.rate = 120;
    comparison.lines[0].vendorQuotes.v1.amount = 240;
    renderWorkspace({ rfq, comparison });
    expect(screen.getAllByText('#2')).toHaveLength(2);
    expect(screen.getByText(/▲ 330%/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails))[0]);
    fireEvent.change(screen.getAllByRole('spinbutton').at(-1)!, { target: { value: '120' } });
    const savingsRow = screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.savingsVsAIBenchmark)).closest('tr');
    expect(savingsRow).toHaveTextContent(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.copy134eyoj));
  });

  it('edits and saves line counteroffers, opens item details, and handles confirmed reset', () => {
    const { container } = renderWorkspace();

    const lineRateInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(lineRateInputs[0], { target: { value: '75' } });
    expect(screen.getByText(/1 line modified/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveAsDraft) }));
    expect(localStorage.getItem('procpx_cm_counteroffer_draft_rfq-1')).toContain('"line-1":75');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.draftSavedAt, "", false))).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails))[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.section1ItemDetails))).toBeInTheDocument();
    expect(screen.getAllByText('Supply cement to the north site').length).toBeGreaterThan(0);
    expect(screen.getAllByText('53 grade cement').length).toBeGreaterThan(0);
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getByText('Keep dry')).toBeInTheDocument();
    const targetRate = screen.getAllByRole('spinbutton').at(-1)!;
    fireEvent.change(targetRate, { target: { value: '80.25' } });
    fireEvent.keyDown(targetRate, { key: 'Enter', code: 'Enter', charCode: 13 });
    expect(mockToast.success).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.buyerOfferRateAppliedToThisItem);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails))[0]);
    const drawerBackdrop = Array.from(container.querySelectorAll('div')).find((element) =>
      element.className.includes('backdrop-blur-2xs')
    );
    fireEvent.click(drawerBackdrop!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.section1ItemDetails, "", false))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reset) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.resetCounterofferRates))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.cancel) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.resetCounterofferRates))).not.toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(80.25);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.reset) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.confirmReset) }));
    expect(localStorage.getItem('procpx_cm_counteroffer_draft_rfq-1')).toBeNull();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.resetCounterofferRates))).not.toBeInTheDocument();
  });

  it('supports select all, batch discounts, the detail drawer, and draft input validation', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.copypr3sba) }));
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.selectAllLines)));
    expect(screen.getByText('2 of 2 lines selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.copypr3sba) }));
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(86);
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.selectAllLines)));
    expect(screen.queryByText('2 of 2 lines selected')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails))[0]);
    const drawer = screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.section4CostAnalysis)).closest('div.fixed');
    expect(drawer).toBeTruthy();
    const rate = screen.getAllByRole('spinbutton').at(-1)!;
    fireEvent.change(rate, { target: { value: '-1' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.applyOfferToItem) })).toBeDisabled();
    fireEvent.change(rate, { target: { value: '0' } });
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.saveToDraft) })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.saveToDraft) }));
    expect(screen.getByText(/Draft rate saved for this item/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.closeDrawer)));
  });

  it('reports storage failures when saving a draft rate from the detail drawer', () => {
    renderWorkspace();
    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails))[0]);
    const rate = screen.getAllByRole('spinbutton').at(-1)!;
    fireEvent.change(rate, { target: { value: '82' } });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.saveToDraft) }));

    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToSaveDraftRatePleaseRetry);
    setItem.mockRestore();
  });

  it('calculates a missing vendor line amount from the quoted rate and quantity', () => {
    const comparison = baseComparison();
    comparison.lines[0].vendorQuotes.v1.amount = 0;
    renderWorkspace({ comparison });

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails))[0]);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.lineAmount, '', true))).toBeInTheDocument();
    expect(screen.getAllByText(/180/).length).toBeGreaterThan(0);
  });

  it('toggles individual line selection and applies the remaining batch discount options', () => {
    const { container } = renderWorkspace();
    const lineCheckboxes = Array.from(container.querySelectorAll('tbody input[type="checkbox"]')) as HTMLInputElement[];
    expect(lineCheckboxes).toHaveLength(2);

    fireEvent.click(lineCheckboxes[0]);
    expect(screen.getByText('1 of 2 lines selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.copyomz2jg) }));
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(87);

    fireEvent.click(lineCheckboxes[1]);
    expect(screen.getByText('2 of 2 lines selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.copyxbwjl8) }));
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(81);
    expect(screen.getAllByRole('spinbutton')[1]).toHaveValue(108);

    fireEvent.click(lineCheckboxes[0]);
    fireEvent.click(lineCheckboxes[1]);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.linesSelected, "", false))).not.toBeInTheDocument();
  });

  it('supports vendor selection toggles and closes the offer menu after an outside click', () => {
    const { container } = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOfferToVendors) }));

    const menu = container.querySelector('#send-offer-dropdown-menu') as HTMLElement;
    const checkboxes = within(menu).getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([true, true, true]);

    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).not.toBeChecked();
    fireEvent.click(checkboxes[0]);
    expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([true, true, true]);

    fireEvent.mouseDown(document.body);
    expect(container.querySelector('#send-offer-dropdown-menu')).not.toBeInTheDocument();
  });

  it('renders the empty comparison and detail fallbacks when optional RFQ data is absent', () => {
    const sparseRfq = {
      id: 'rfq-sparse',
      rfqNumber: 'RFQ-SPARSE',
      estimatedBenchmarkValue: 0,
      paymentTerms: '',
      deliveryRequirement: '',
      commercialValidityDays: 0,
      lines: [{ id: 'line-sparse', description: 'Unclassified item', quantity: 0, uom: '', benchmarkRate: 0 }],
      invitedVendors: [{ vendorId: 'v-sparse' }],
      quotes: undefined,
      negotiations: [],
      boqRevision: { lines: [] },
    };
    const { container } = renderWorkspace({ rfq: sparseRfq, comparison: null });

    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.vendor)).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.copydnd1iv))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.siteDeliveryCompletionWithin45DaysFromWorkOrderIssuance))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.copy1vaqoda))).toHaveLength(2);
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails)));
    expect(screen.getAllByText('No BOQ description').length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.aIBaseline, "", false)).closest('span')).toHaveTextContent('0 / Unit');

    fireEvent.click(container.querySelector('tbody input[type="checkbox"]')!);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.copypr3sba) }));
    expect(screen.getByText('1 of 1 lines selected')).toBeInTheDocument();

    const drawerBackdrop = Array.from(container.querySelectorAll('div')).find((element) =>
      element.className.includes('backdrop-blur-2xs')
    );
    fireEvent.click(drawerBackdrop!);
  });

  it('preserves a zero benchmark when both RFQ and comparison totals are zero', () => {
    const rfq = baseRfq();
    rfq.estimatedBenchmarkValue = 0;
    const comparison = baseComparison();
    comparison.summary.totalBenchmark = 0;

    const { container } = renderWorkspace({ rfq, comparison });

    expect(container.firstElementChild).toHaveClass('w-full', 'flex', 'flex-col');
  });

  it('tolerates missing RFQ collections and updates the default vendor after comparison data arrives', async () => {
    const sparseRfq = {
      id: 'rfq-empty', rfqNumber: 'RFQ-EMPTY', lines: undefined,
      invitedVendors: [{ vendorId: 'v-empty' }],
      quotes: [{ id: 'v2-only', vendorId: 'v-empty', quoteVersion: 2, totalQuoteAmount: 12, lines: [] }],
      negotiations: [{}], boqRevision: undefined,
    };
    const { props, rerender } = renderWorkspace({ rfq: sparseRfq as any, comparison: null });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.vendorComparisonTotalQuoteAmount))).toBeInTheDocument();

    rerender(<ProcurementCommercialWorkspace {...props} comparison={{ vendors: [{ vendorId: 'v-empty' }], lines: [] }} />);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.vendor)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.vendorComparisonTotalQuoteAmount))).toBeInTheDocument());
  });

  it('uses comparison metadata when an RFQ line has only a partial BOQ link', () => {
    const rfq = baseRfq();
    rfq.lines = [{
      id: 'line-compare', lineNumber: 7, itemCode: '', description: 'Comparison-backed item', specification: 'Comparison specification',
      quantity: 2, uom: 'EA', benchmarkRate: 0, boqLine: {},
    }] as any;
    const comparison = {
      summary: { totalBenchmark: 0 },
      lines: [{
        id: 'line-compare', lineNumber: 7, itemCode: 'CMP-07', itemDescription: 'Comparison-backed item',
        boqDescription: 'Comparison source scope', aiUnitCost: 75, fullBoqDescription: 'Comparison full scope',
        specification: 'Comparison specification', category: 'Comparison category', subcategory: 'Comparison subcategory',
        location: 'Comparison location', brand: 'Comparison brand', model: 'Comparison model',
        material: 'Comparison material', grade: 'Comparison grade', standard: 'Comparison standard',
        remarks: 'Comparison remarks', drawingReference: 'Comparison drawing', aiCostSource: 'Comparison estimate',
        vendorQuotes: { v1: { quoted: true, rate: 70, amount: 140 } },
      }],
    };
    renderWorkspace({ rfq, comparison });
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails)));

    expect(screen.getByText('Comparison full scope')).toBeInTheDocument();
    expect(screen.getByText('Comparison specification')).toBeInTheDocument();
    expect(screen.getByText('Comparison category')).toBeInTheDocument();
    expect(screen.getByText(/Comparison category.*Comparison subcategory/)).toBeInTheDocument();
    expect(screen.getByText('Comparison location')).toBeInTheDocument();
    expect(screen.getByText('Comparison brand')).toBeInTheDocument();
    expect(screen.getByText(/Comparison model.*Comparison material.*Comparison grade/)).toBeInTheDocument();
    expect(screen.getByText('Comparison standard')).toBeInTheDocument();
    expect(screen.getByText('Comparison remarks')).toBeInTheDocument();
    expect(screen.getByText('Comparison drawing')).toBeInTheDocument();
  });

  it('rejects a vendor selection after every previously eligible vendor becomes ineligible', async () => {
    const { props, rerender } = renderWorkspace();
    const ineligibleRounds = ['v1', 'v2'].flatMap((vendorId) =>
      [1, 2, 3, 4].map((roundNumber) => ({
        id: `${vendorId}-round-${roundNumber}`,
        vendorId,
        roundNumber,
        counterOfferAmount: 400,
        revisedQuoteAmount: null,
        status: 'PENDING',
        nextResponsibleParty: 'VENDOR',
        buyerDecision: null,
      }))
    );
    const updatedRfq = { ...props.rfq, negotiations: [{ rounds: ineligibleRounds }] };
    rerender(<ProcurementCommercialWorkspace {...props} rfq={updatedRfq} />);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOfferToVendors) }));
    expect(screen.getByText('Select All Vendors (0)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOffer, '', true) }));
    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.selectedVendorsAreNotEligibleToReceiveCounteroffers);
  });

  it('dispatches offers and reports per-vendor success and failure results', async () => {
    const { props } = renderWorkspace();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: { dispatchedCount: 1, failedCount: 1 },
        results: [
          { vendorName: 'Alpha Materials', status: 'DISPATCHED', roundNumber: 2, counterOfferAmount: 500, isSuperseding: true },
          { vendorName: 'Beta Supply', status: 'FAILED', reason: 'Vendor no longer eligible' },
        ],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOfferToVendors) }));
    expect(screen.getByText('Select All Vendors (2)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOffer, '', true) }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(request).toMatchObject({ rfqId: 'rfq-1', vendorIds: ['v1', 'v2'], nextResponsibleParty: 'VENDOR' });
    expect(JSON.parse(request.lineItemsJson)).toHaveLength(2);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.dispatchBreakdown))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.componentsProcurementCommercialWorkspace.offerDispatchCompletedDispatchedCountSucceededValue2, {"dispatchedCount":"1","value2":", 1 failed"})))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.lengthEligible, {"length":"Vendor no longer"})))).toBeInTheDocument();
    expect(props.onNegotiationSubmitted).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.dismiss) })[0]);
    expect(screen.queryByText(uiStringPattern(interpolateUiString(UI_STRINGS.componentsProcurementCommercialWorkspace.offerDispatchCompletedDispatchedCountSucceededValue2, {"dispatchedCount":"1","value2":", 1 failed"})))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.dismiss) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.dispatchBreakdown))).not.toBeInTheDocument();
  });

  it('handles partial-success API responses and dispatch failure details without a callback', async () => {
    const partialSuccess = renderWorkspace({ onNegotiationSubmitted: undefined });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        dispatched: [{ vendorName: 'Alpha Materials', status: 'DISPATCHED', roundNumber: 2 }],
        failed: [],
        results: [],
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOfferToVendors) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOffer, '', true) }));
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.componentsProcurementCommercialWorkspace.offerDispatchCompletedDispatchedCountSucceededValue2, {"dispatchedCount":"1","value2":""})))).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalledWith(
      UI_STRINGS.common.userMessages.buyerOfferDispatchedToOneVendor,
      'RFQ-2026-001',
      UI_STRINGS.common.userMessages.awaitingVendorRevisedOffer
    );

    partialSuccess.unmount();

    renderWorkspace();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: { dispatchedCount: 0, failedCount: 2 },
        failed: [{ vendorName: 'Alpha Materials', reason: 'Vendor response window closed' }],
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOfferToVendors) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOffer, '', true) }));
    expect(await screen.findByText(uiStringPattern(interpolateUiString(UI_STRINGS.componentsProcurementCommercialWorkspace.offerDispatchFailedValue1, {"value1":"Vendor response window closed"})))).toBeInTheDocument();
  });

  it('validates entered rates and reports rejected dispatch requests without losing entered rates', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOfferToVendors) }));
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '-2' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOffer, '', true) }));
    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.invalidCounterofferRateEnteredRatesMustBePositiveNumbers);

    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '80' } });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Service unavailable'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOffer, '', true) }));
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(80);
    expect(mockToast.error).toHaveBeenCalledWith('Service unavailable');
  });

  it('uses the demo dispatch path and restores saved drafts while ignoring corrupt browser data', async () => {
    jest.useFakeTimers();
    const onNegotiationSubmitted = jest.fn();
    const rfq = baseRfq();
    localStorage.setItem('procpx_cm_counteroffer_draft_rfq-1', JSON.stringify({
      rates: { 'line-1': 70 }, notes: 'saved note', deadline: '2026-11-10', timestamp: '10:15',
    }));
    const view = renderWorkspace({ rfq, isDemoMode: true, onNegotiationSubmitted });
    expect(screen.getByText('Draft saved at 10:15')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOfferToVendors) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.sendOffer, '', true) }));
    await act(async () => { jest.advanceTimersByTime(600); });
    await waitFor(() => expect(onNegotiationSubmitted).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Buyer offer dispatched successfully to/)).toBeInTheDocument();
    view.unmount();
    jest.useRealTimers();

    localStorage.setItem('procpx_cm_counteroffer_draft_rfq-1', '{bad json');
    renderWorkspace();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsVendorNegotiationWorkspace.draftSavedAt, "", false))).not.toBeInTheDocument();
  });

  it('reports draft storage failures and opens history for a vendor without negotiation rounds', () => {
    const rfq = baseRfq();
    rfq.negotiations = [];
    const { container } = renderWorkspace({ rfq });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full'); });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.saveAsDraft) }));
    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToSaveDraftRates);

    fireEvent.click(screen.getAllByTitle(uiStringPattern(UI_STRINGS.common.clickToViewDetails))[0]);
    const detailRate = screen.getAllByRole('spinbutton').at(-1)!;
    fireEvent.change(detailRate, { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.applyOfferToItem) }));
    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToSaveDraftRatePleaseRetry);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.saveToDraft) }));
    expect(mockToast.error).toHaveBeenCalledWith(UI_STRINGS.common.userMessages.failedToSaveDraftRatePleaseRetry);
    fireEvent.click(screen.getByTitle(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.closeDrawer)));
    setItem.mockRestore();

    const vendorNames = screen.getAllByText('No Quote Co');
    fireEvent.click(vendorNames[0]);
    expect(container.querySelector('table')).toBeInTheDocument();
  });
});
