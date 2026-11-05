/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrDetailModal from '../src/components/PrDetailModal';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));
jest.mock('../src/components/ui/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, title, subtitle, children }: any) => isOpen
    ? <section role="dialog" aria-label={title}><h2>{title}</h2><p>{subtitle}</p><button onClick={onClose}>Modal close</button>{children}</section>
    : null,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }: { status: string }) => <span data-testid="pr-status">{status}</span>,
}));
jest.mock('../src/components/ui/SpecificationCell', () => ({
  __esModule: true,
  default: ({ specification }: { specification: string }) => <span data-testid="specification">{specification}</span>,
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
const fullLine = {
  id: 'line-1', lineNumber: '1', itemCode: 'CAB-01', itemDescription: 'Copper cable',
  specification: '4 core copper cable', category: 'Electrical', quantity: 10, uom: 'M', estimatedRate: 200, estimatedValue: 2000,
};

describe('purchase request detail modal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { lines: [] } }) });
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing when closed or when there is no PR', () => {
    const closed = render(<PrDetailModal isOpen={false} onClose={jest.fn()} pr={{ id: 'pr-1' }} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    closed.rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loads demo-looking identifiers from the API and does not invent line items or RFQ actions', async () => {
    render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'PR-DEMO-001', isExample: true, prNumber: 'PR-DEMO-001', requestedValue: 480000, projectName: 'Kundanahalli Fitout' }} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsPrDetailModal.noIndividualLineRecordsMappedCommercialBaselineAmountAppliesToWholePackage))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.gypsumFalseCeiling))).not.toBeInTheDocument();
    expect(screen.queryByText('Modular Workstations & Storage')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: uiStringPattern(UI_STRINGS.componentsPrDetailModal.createRFQForThisPR) })).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/PR-DEMO-001');
  });

  it('uses preloaded specification rows, summary fields, RFQ history, and revision links', () => {
    const pr = {
      id: 'pr-ready', prNumber: 'PR-100', description: 'Electrical package', requestedValue: 0, totalEstimatedValue: 24000,
      sourcingStage: 'RFQ Issued', status: 'PR_APPROVED', projectName: 'North Plant', projectCode: 'NP',
      costCentre: { code: 'CC-1', name: 'Electrical' }, categories: ['Power', 'Lighting'], boq: { boqCode: 'BOQ-1' },
      boqRevision: { revisionCode: 'R3' }, boqRevisionId: 'rev-3', requesterName: 'Asha', requiredDate: '2026-11-01',
      itemCount: 7, lines: [fullLine], rfqs: [{ id: 'rfq-1', rfqNumber: 'RFQ-100', status: 'RELEASED', packageName: 'Electrical sourcing', quotesCount: 3, negotiationStage: 'Round 2', awardStatus: 'Pending Approval' }],
    };
    render(<PrDetailModal isOpen onClose={jest.fn()} pr={pr} userRole="PROCUREMENT_USER" />);
    expect(screen.getByRole('dialog', { name: /PR-100/ })).toBeInTheDocument();
    expect(screen.getByText('Electrical package')).toBeInTheDocument();
    expect(screen.getByText('North Plant')).toBeInTheDocument();
    expect(screen.getByText('CC-1 - Electrical')).toBeInTheDocument();
    expect(screen.getByText(/Power, Lighting/)).toBeInTheDocument();
    expect(screen.getByText('BOQ-1')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsPrDetailModal.approvedRev)).parentElement).toHaveTextContent('R3');
    expect(screen.getAllByText(/24,000/).length).toBeGreaterThan(0);
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('Copper cable')).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsPrDetailModal.associatedRFQSourcingPackages))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsPrDetailModal.value1Quotes))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsIdPage.roundCurrentRound))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.pendingApproval))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsPrDetailModal.viewBOQRevision) })).toHaveAttribute('href', '/boq/rev-3');
    expect(screen.queryByRole('link', { name: uiStringPattern(UI_STRINGS.componentsPrDetailModal.createRFQForThisPR) })).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('hydrates incomplete line data without fabricating missing master data', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ totalEstimatedValue: 9000, lines: [
      { id: 'fetched-1', lineNumber: 0, boqLine: { itemCode: 'BOQ-ITM', standardDescription: 'Valve', specification: 'Steel valve', uom: { code: 'EA' }, aiUnitCost: 300, aiTotalCost: 600 }, quantity: 2 },
      { id: 'fetched-2', itemDescription: 'Fastener', category: '', quantity: null, uom: '', estimatedRate: 0, estimatedValue: 0 },
    ] }) });
    render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-fetch', prNumber: 'PR-FETCH', category: 'Mechanical', estimatedValue: 7000, project: { name: 'Fallback Site', projectCode: 'FS' }, costCentre: 'CC-9', title: 'Valve package' }} />);
    expect(await screen.findByText('Valve')).toBeInTheDocument();
    expect(screen.getByText('BOQ-ITM')).toBeInTheDocument();
    expect(screen.getByText('Steel valve')).toBeInTheDocument();
    expect(screen.getByText('EA')).toBeInTheDocument();
    const fallbackLine = screen.getByRole('row', { name: /BOQ-ITM/ });
    expect(fallbackLine).toHaveTextContent(interpolateUiString(UI_STRINGS.common.currencyAmount, { currency: UI_STRINGS.common.indianRupeeSymbol, amount: 300 }));
    expect(screen.getByText(/600/)).toBeInTheDocument();
    expect(screen.getAllByText('Mechanical').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fastener').length).toBeGreaterThan(0);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.notAvailable)).length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-fetch');
    expect((await screen.findAllByText(/9,000/)).length).toBeGreaterThan(0);
  });

  it('loads additional detail lines while retaining the total count from the raw API response', async () => {
    const firstPageLines = Array.from({ length: 25 }, (_, index) => ({
      id: `line-${index + 1}`,
      lineNumber: String(index + 1),
      itemDescription: `Line ${index + 1}`,
      specification: `Specification ${index + 1}`,
      itemCode: `ITEM-${index + 1}`,
      quantity: 1,
      uom: 'EA',
      estimatedRate: 10,
      estimatedValue: 10,
    }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        id: 'pr-paged', totalLines: 26, lines: firstPageLines, rfqs: [],
        linePagination: { hasMore: true, nextCursor: 'cursor-25', pageSize: 25 },
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        lines: [{ ...fullLine, id: 'line-26', lineNumber: '26', itemDescription: 'Line 26', itemCode: 'ITEM-26' }],
        linePagination: { hasMore: false, nextCursor: null, pageSize: 25 },
      }) });

    render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-paged', prNumber: 'PR-PAGED' }} />);
    expect(await screen.findByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('26')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('Line 26')).toBeInTheDocument();
    expect(mockFetch.mock.calls[1][0]).toBe('/api/pr/pr-paged/lines?cursor=cursor-25');
  });

  it('uses explicit unavailable values for sparse API lines and supports legacy revision links', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { lines: [
        { quantity: 4, estimatedRate: 50, boqLine: { itemCode: 'ALT-1', uomRaw: 'BOX' } },
      ] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) });
    const { rerender } = render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-sparse', prNumber: 'PR-SPARSE', revisionId: 'legacy-rev', status: 'PR_APPROVED' }} />);
    expect(await screen.findByText('ALT-1')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.notAvailable)).length).toBeGreaterThan(0);
    expect(screen.getByText('BOX')).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.common.general))).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsPrDetailModal.viewBOQRevision) })).toHaveAttribute('href', '/boq/legacy-rev');
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsPrDetailModal.createRFQForThisPR) })).toHaveAttribute('href', '/procurement/rfqs/new?prId=pr-sparse');

    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-empty-data', prNumber: 'PR-EMPTY' }} />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsPrDetailModal.noIndividualLineRecordsMappedCommercialBaselineAmountAppliesToWholePackage))).toBeInTheDocument();
  });

  it('falls back to the original PR when API responses or network calls fail', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { rerender } = render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-http-failure', prNumber: 'PR-HTTP', status: 'PR_APPROVED', currentStage: 'Awaiting RFQ', costCentre: 'CC-X', itemCount: 4 }} />);
    expect(await screen.findByRole('dialog', { name: /PR-HTTP/ })).toBeInTheDocument();
    expect(screen.getByText('CC-X')).toBeInTheDocument();
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsPrDetailModal.noIndividualLineRecordsMappedCommercialBaselineAmountAppliesToWholePackage))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsPrDetailModal.createRFQForThisPR) })).toHaveAttribute('href', '/procurement/rfqs/new?prId=pr-http-failure');

    mockFetch.mockRejectedValueOnce(new Error('network unavailable'));
    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-network-failure', prNumber: 'PR-NET', overallStage: 'Negotiation' }} />);
    expect(await screen.findByRole('dialog', { name: /PR-NET/ })).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
  });

  it('fetches demo-prefixed identifiers and shows explicit unavailable metadata', async () => {
    const { rerender } = render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'demo-record', prNumber: 'PR-DEMO-2', totalLines: 2, costCentre: null }} />);
    expect(screen.getByRole('dialog', { name: /PR-DEMO-2/ })).toBeInTheDocument();
    expect((await screen.findAllByText(uiStringPattern(UI_STRINGS.common.notAvailable))).length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/demo-record');

    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ prId: 'PR-DEMO-9', estimatedValue: 0, boqCode: 'BOQ-9', project: { name: 'West Site' }, categories: [] }} />);
    expect(screen.getByText('West Site')).toBeInTheDocument();
    expect(screen.getByText('BOQ-9')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.notAvailable)).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsPrDetailModal.taxonomy))).not.toHaveTextContent(uiStringPattern(UI_STRINGS.common.civilInterior));
    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ prNumber: 'PR-NO-ID', title: 'No identifier record' }} />);
    expect(screen.getByRole('dialog', { name: /PR-NO-ID/ })).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('opens and closes through the modal action', async () => {
    const onClose = jest.fn();
    render(<PrDetailModal isOpen onClose={onClose} pr={{ id: 'demo-close', description: 'Closeable PR', rfqs: [{ id: 'rfq-1', rfqNumber: 'RFQ-1', status: 'RELEASED', description: 'Lighting', vendorInvitationProgress: '2 invited', negotiationStage: '—', awardStatus: 'Not Prepared', openUrl: '/procurement/rfqs/rfq-1' }] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modal close' }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsPrDetailModal.openRFQWorkspace) })).toHaveAttribute('href', '/procurement/rfqs/rfq-1');
    expect(screen.getByText('2 invited')).toBeInTheDocument();
  });
});
