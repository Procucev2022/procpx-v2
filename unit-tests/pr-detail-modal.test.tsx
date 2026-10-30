/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrDetailModal from '../src/components/PrDetailModal';

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

  it('loads canonical demo line items and keeps the create RFQ action available', async () => {
    render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'PR-DEMO-001', isExample: true, prNumber: 'PR-DEMO-001', requestedValue: 480000, projectName: 'Kundanahalli Fitout' }} />);
    expect(await screen.findByText('Gypsum False Ceiling')).toBeInTheDocument();
    expect(screen.getByText('Modular Workstations & Storage')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Procurement Request Details/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create RFQ for this PR/ })).toHaveAttribute('href', '/procurement/rfqs/new?prId=PR-DEMO-001');
    expect(mockFetch).not.toHaveBeenCalled();
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
    expect(screen.getByText('Approved Rev:').parentElement).toHaveTextContent('R3');
    expect(screen.getAllByText(/24,000/).length).toBeGreaterThan(0);
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('Copper cable')).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
    expect(screen.getByText(/Associated RFQ Sourcing Packages/)).toBeInTheDocument();
    expect(screen.getByText('3 quotes')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View BOQ Revision' })).toHaveAttribute('href', '/boq/rev-3');
    expect(screen.queryByRole('link', { name: /Create RFQ for this PR/ })).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('hydrates incomplete line data and applies line-level fallbacks', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { totalEstimatedValue: 9000, lines: [
      { id: 'fetched-1', lineNumber: 0, boqLine: { itemCode: 'BOQ-ITM', standardDescription: 'Valve', specification: 'Steel valve', uom: { code: 'EA' }, aiUnitCost: 300, aiTotalCost: 600 }, quantity: 2 },
      { id: 'fetched-2', itemDescription: 'Fastener', category: '', quantity: null, uom: '', estimatedRate: 0, estimatedValue: 0 },
    ] } }) });
    render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-fetch', prNumber: 'PR-FETCH', category: 'Mechanical', estimatedValue: 7000, project: { name: 'Fallback Site', projectCode: 'FS' }, costCentre: 'CC-9', title: 'Valve package' }} />);
    expect(await screen.findByText('Valve')).toBeInTheDocument();
    expect(screen.getByText('BOQ-ITM')).toBeInTheDocument();
    expect(screen.getByText('Steel valve')).toBeInTheDocument();
    expect(screen.getByText('EA')).toBeInTheDocument();
    expect(screen.getByText(/300/)).toBeInTheDocument();
    expect(screen.getByText(/600/)).toBeInTheDocument();
    expect(screen.getAllByText('Mechanical').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fastener').length).toBeGreaterThan(0);
    expect(screen.getByText('NOS')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/pr/pr-fetch');
    expect((await screen.findAllByText(/9,000/)).length).toBeGreaterThan(0);
  });

  it('uses sparse API line fallbacks and supports legacy revision links', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { lines: [
        { quantity: 4, estimatedRate: 50, boqLine: { itemCode: 'ALT-1', uomRaw: 'BOX' } },
      ] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) });
    const { rerender } = render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-sparse', prNumber: 'PR-SPARSE', revisionId: 'legacy-rev' }} />);
    expect((await screen.findAllByText('Line Item')).length).toBeGreaterThan(0);
    expect(screen.getByText('ALT-1')).toBeInTheDocument();
    expect(screen.getByText('BOX')).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'View BOQ Revision' })).toHaveAttribute('href', '/boq/legacy-rev');
    expect(screen.getByRole('link', { name: /Create RFQ for this PR/ })).toHaveAttribute('href', '/procurement/rfqs/new?prId=pr-sparse');

    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-empty-data', prNumber: 'PR-EMPTY' }} />);
    expect(await screen.findByText('No individual line records mapped. Commercial baseline amount applies to whole package.')).toBeInTheDocument();
  });

  it('falls back to the original PR when API responses or network calls fail', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { rerender } = render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-http-failure', prNumber: 'PR-HTTP', currentStage: 'Awaiting RFQ', costCentre: 'CC-X', itemCount: 4 }} />);
    expect(await screen.findByRole('dialog', { name: /PR-HTTP/ })).toBeInTheDocument();
    expect(screen.getByText('CC-X')).toBeInTheDocument();
    expect(await screen.findByText('No individual line records mapped. Commercial baseline amount applies to whole package.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create RFQ for this PR/ })).toHaveAttribute('href', '/procurement/rfqs/new?prId=pr-http-failure');

    mockFetch.mockRejectedValueOnce(new Error('network unavailable'));
    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'pr-network-failure', prNumber: 'PR-NET', overallStage: 'Negotiation' }} />);
    expect(await screen.findByRole('dialog', { name: /PR-NET/ })).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
  });

  it('skips fetch for demo identifiers, absent identifiers, and keeps fallback metadata', async () => {
    const { rerender } = render(<PrDetailModal isOpen onClose={jest.fn()} pr={{ id: 'demo-record', prNumber: 'PR-DEMO-2', totalLines: 2, costCentre: null }} />);
    expect(screen.getByRole('dialog', { name: /PR-DEMO-2/ })).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText(/Civil & Interior/)).toBeInTheDocument();
    expect(screen.getAllByText('Project').length).toBeGreaterThan(0);
    expect(screen.getByText('R0')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();

    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ prId: 'PR-DEMO-9', estimatedValue: 0, boqCode: 'BOQ-9', project: { name: 'West Site' }, categories: [] }} />);
    expect(screen.getByText('West Site')).toBeInTheDocument();
    expect(screen.getByText('BOQ-9')).toBeInTheDocument();
    expect(screen.getByText('Procurement Commercial Package')).toBeInTheDocument();
    expect(screen.getByText('Immediate Requirement')).toBeInTheDocument();
    expect(screen.getByText(/Taxonomy:/)).not.toHaveTextContent('Civil & Interior');
    rerender(<PrDetailModal isOpen onClose={jest.fn()} pr={{ prNumber: 'PR-NO-ID', title: 'No identifier record' }} />);
    expect(screen.getByRole('dialog', { name: /PR-NO-ID/ })).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('opens and closes through the modal action', async () => {
    const onClose = jest.fn();
    render(<PrDetailModal isOpen onClose={onClose} pr={{ id: 'demo-close', description: 'Closeable PR', rfqs: [{ id: 'rfq-1', rfqNumber: 'RFQ-1', status: 'RELEASED', description: 'Lighting', vendorInvitationProgress: '2 invited', negotiationStage: '—', awardStatus: 'Not Prepared', openUrl: '/procurement/rfqs/rfq-1' }] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modal close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Open RFQ Workspace' })).toHaveAttribute('href', '/procurement/rfqs/rfq-1');
    expect(screen.getByText('2 invited')).toBeInTheDocument();
  });
});
