/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RfqDetailPage from '../src/app/(app)/procurement/rfqs/[id]/page';

const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn() };
const mockSearchParams = jest.fn();
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    <a href={href as string} {...props}>{children}</a>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams(),
}));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => mockToast }));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));
jest.mock('../src/components/ui/Card', () => ({
  __esModule: true,
  default: ({ title, subtitle, action, children }: any) => <section><h2>{title}</h2><p>{subtitle}</p>{action}{children}</section>,
}));
jest.mock('../src/components/ui/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, title, children, onClose }: any) => isOpen ? <div role="dialog" aria-label={title}><button onClick={onClose}>Close modal</button>{children}</div> : null,
}));
jest.mock('../src/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({ title, description, actionText, onAction }: any) => <div><h3>{title}</h3><p>{description}</p>{actionText && <button onClick={onAction}>{actionText}</button>}</div>,
}));
jest.mock('../src/components/ui/SpecificationCell', () => ({ __esModule: true, default: ({ text }: any) => <span>{text || '—'}</span> }));
jest.mock('../src/components/ui/BoqDescriptionCell', () => ({ __esModule: true, default: ({ text }: any) => <span>{text || '—'}</span> }));
jest.mock('../src/components/RfqChatDrawer', () => ({ __esModule: true, default: ({ isOpen, rfqNumber, onClose }: any) => isOpen ? <aside>{rfqNumber}<button onClick={onClose}>Close chat</button></aside> : null }));
jest.mock('../src/components/ProcurementCommercialWorkspace', () => ({
  __esModule: true,
  default: ({ rfq, onRecordQuote, onOpenRateCards, onReleaseRfq, onNegotiationSubmitted }: any) => <div data-testid="commercial-workspace">{rfq.rfqNumber}<button onClick={onRecordQuote}>Record quote from workspace</button><button onClick={onOpenRateCards}>Open rate cards</button><button onClick={onReleaseRfq}>Release RFQ from workspace</button><button onClick={onNegotiationSubmitted}>Refresh after negotiation</button></div>,
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();
const paramsFor = (query = '') => new URLSearchParams(query);
const renderRfq = (id = 'RFQ-DEMO-001') => {
  const params = Object.assign(Promise.resolve({ id }), { status: 'fulfilled', value: { id } });
  return render(<RfqDetailPage params={params} />);
};

describe('RFQ detail lifecycle page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParams.mockReturnValue(paramsFor());
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch as typeof fetch;
    window.confirm = jest.fn(() => true);
  });

  afterAll(() => { global.fetch = originalFetch; });

  it('loads the zero quote demo, resets it with full sample data, and opens the chat drawer', async () => {
    renderRfq();
    expect(await screen.findByText('RFQ-DEMO-001')).toBeInTheDocument();
    expect(screen.getByText('No Quotations Received Yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate 3 Received Quotes' }));
    expect(await screen.findByText('Enterprise Quotation Register')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2\. Negotiation/ }));
    fireEvent.click(screen.getByRole('button', { name: '3. Awarding & PPO' }));
    fireEvent.click(screen.getByRole('button', { name: /Clarifications \/ Chat/ }));
    expect(screen.getByText('Close chat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
  });

  it('uses the non-demo endpoints and renders a missing-RFQ fallback', async () => {
    mockSearchParams.mockReturnValue(paramsFor('tab=negotiations'));
    renderRfq('rfq-missing');
    expect(await screen.findByText('RFQ not found or access denied.')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/rfqs/rfq-missing');
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/rfqs/rfq-missing/compare');
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/rate-cards/match?rfqId=rfq-missing');
    expect(screen.getByRole('link', { name: /Back to RFQs Register/ })).toHaveAttribute('href', '/procurement/rfqs');
  });

  it('redirects vendor users to the vendor portal', async () => {
    mockFetch.mockImplementation(async (url: string) => url === '/api/auth/session'
      ? { ok: true, json: async () => ({ user: { role: 'VENDOR' } }) }
      : { ok: true, json: async () => ({ rfq: null }) });
    renderRfq('rfq-vendor');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/vendor-portal/rfqs/rfq-vendor'));
  });

  it('records a manual demonstration quote and creates a direct rate-card PPO', async () => {
    renderRfq();
    expect(await screen.findByText('No Quotations Received Yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record Individual Quote Manually' }));
    const quoteModal = screen.getByRole('dialog', { name: 'Record Vendor Quotation' });
    fireEvent.click(within(quoteModal).getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record Individual Quote Manually' }));
    const reopenedQuoteModal = screen.getByRole('dialog', { name: 'Record Vendor Quotation' });
    fireEvent.change(within(reopenedQuoteModal).getByText('Commercial Terms').parentElement!.querySelector('input')!, { target: { value: '' } });
    fireEvent.change(within(reopenedQuoteModal).getByText('Delivery Lead Time (Days)').parentElement!.querySelector('input')!, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Capture Quote' }));
    expect(await screen.findByText(/Quotation successfully recorded/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2. Negotiation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record quote from workspace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh after negotiation' }));
    await waitFor(() => expect(screen.getByTestId('commercial-workspace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open rate cards' }));
    expect(await screen.findByRole('dialog', { name: 'Approved Vendor Rate Card Sourcing Comparison' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open rate cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Direct PPO from Rate Card' }));
    expect(await screen.findByText(/PPO successfully created/)).toBeInTheDocument();
  });

  it('submits and approves a demonstration award and generates its PPO', async () => {
    renderRfq();
    expect(await screen.findByText('No Quotations Received Yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate 3 Received Quotes' }));
    fireEvent.click(screen.getByRole('button', { name: '3. Awarding & PPO' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Prepare Award Recommendation' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Prepare Award Recommendation' })[1]);
    const awardDialog = screen.getByRole('dialog', { name: 'Submit Commercial Award Recommendation' });
    fireEvent.change(within(awardDialog).getByRole('combobox'), { target: { value: 'v-demo-002' } });
    fireEvent.click(within(awardDialog).getByRole('button', { name: 'Submit Award Recommendation' }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    fireEvent.change(within(awardDialog).getByRole('combobox'), { target: { value: 'v-demo-001' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Competitive L1 offer with complete scope.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Award Recommendation' }));
    expect(await screen.findByText(/PPO submitted successfully for approval/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve Recommendation' }));
    fireEvent.change(screen.getByPlaceholderText('Enter approval sanction remarks or reason for rejection'), { target: { value: 'Approved for release.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Approval' }));
    expect(await screen.findByText(/PPO approved successfully/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Generate Purchase Order \(PPO\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate Purchase Order \(PPO\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Issue Purchase Order (PPO)' }));
    expect(await screen.findByText(/PPO successfully created/)).toBeInTheDocument();
  });

  it('opens quote details, records another vendor quote, and validates a non-L1 PPO', async () => {
    renderRfq();
    expect(await screen.findByText('No Quotations Received Yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate 3 Received Quotes' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'View Quote' })[0]);
    const quoteDialog = screen.getByRole('dialog', { name: /Quotation Details/ });
    fireEvent.click(within(quoteDialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'View Quote' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));

    fireEvent.click(screen.getByRole('button', { name: 'Record New Quote' }));
    const quoteModal = screen.getByRole('dialog', { name: 'Record Vendor Quotation' });
    fireEvent.change(within(quoteModal).getByRole('combobox'), { target: { value: 'v-demo-002' } });
    within(quoteModal).getAllByRole('spinbutton').forEach((input) => fireEvent.change(input, { target: { value: '42' } }));
    within(quoteModal).getAllByRole('textbox').forEach((input) => fireEvent.change(input, { target: { value: 'Revised commercial terms' } }));
    fireEvent.click(within(quoteModal).getByRole('button', { name: 'Save & Capture Quote' }));
    expect(await screen.findByText(/Quotation successfully recorded/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Negotiation Workspace' }));
    expect(screen.getByTestId('commercial-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3. Awarding & PPO' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Prepare Award Recommendation' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Prepare Award Recommendation' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    const raiseButtons = screen.getAllByRole('button', { name: /Raise PPO/ });
    fireEvent.click(raiseButtons[raiseButtons.length - 1]);
    const ppoDialog = screen.getByRole('dialog', { name: 'Raise Purchase Order (PPO)' });
    fireEvent.click(within(ppoDialog).getByRole('button', { name: 'Issue Purchase Order (PPO)' }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    fireEvent.change(within(ppoDialog).getByPlaceholderText(/mandatory justification/), { target: { value: 'Specialized compliant delivery scope.' } });
    fireEvent.change(within(ppoDialog).getAllByRole('textbox')[1], { target: { value: 'Deliver within 10 days' } });
    fireEvent.change(within(ppoDialog).getAllByRole('textbox')[2], { target: { value: 'Net 45' } });
    fireEvent.click(within(ppoDialog).getByRole('button', { name: 'Issue Purchase Order (PPO)' }));
    expect(await screen.findByText(/PPO successfully created/)).toBeInTheDocument();
  });

  it('runs the live RFQ lifecycle through server retries, finance approval, PPOs, and rate-card fallbacks', async () => {
    const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
    let liveRfq: any = {
      id: 'rfq-live',
      rfqNumber: 'RFQ-LIVE-1',
      title: 'Live cable package',
      status: 'DRAFT',
      createdAt: 'not-a-date',
      project: { name: 'North Store' },
      categoryName: 'Electrical',
      packageName: 'Cable package',
      estimatedBenchmarkValue: 300,
      finalLockedAmount: 210,
      deliveryRequirement: '',
      paymentTerms: '',
      lines: [
        { id: 'live-line-1', lineNumber: 1, description: 'Power cable', specification: 'FRLS', quantity: 2, uom: 'MTR', benchmarkRate: 100 },
        { id: 'live-line-2', lineNumber: 2, description: 'Control cable', quantity: 0, uom: 'MTR', benchmarkRate: 50 },
      ],
      invitedVendors: [
        { vendorId: 'v-live-1', vendor: { name: 'Live Vendor One', code: 'LV1' } },
        { vendorId: 'v-live-2', vendor: { name: 'Live Vendor Two', code: 'LV2' } },
      ],
      quotes: [],
      negotiations: [{ currentRound: 2, rounds: [{ vendorId: 'v-live-2', buyerDecision: 'COUNTERED' }] }],
      awards: [],
      ppos: [],
    };
    const comparison = {
      summary: { lowestVendorId: 'v-live-1' },
      vendors: [
        { vendorId: 'v-live-1', vendorName: 'Live Vendor One', rank: 1, totalQuoteAmount: 180, deliverySchedule: '10 days', paymentTerms: 'Net 15', warranty: '1 year' },
        { vendorId: 'v-live-2', vendorName: 'Live Vendor Two', rank: 2, totalQuoteAmount: 240, deliveryLeadTimeDays: 12, paymentTermsOffered: 'Net 45', warrantyTerms: '2 years' },
      ],
    };
    const matchedRateCards = [
      {
        rateCardId: 'rate-card-live',
        title: 'Approved Cable Rates',
        directPpoEligible: true,
        rateCardTotalValue: 180,
        totalSavings: 120,
        savingsPercent: 40,
        vendor: { name: 'Rate Card Vendor', qualificationStatus: '', performanceScore: 0 },
      },
      {
        rateCardId: 'rate-card-blocked',
        title: 'Incomplete Rate Card',
        directPpoEligible: false,
        blockReasons: ['Coverage is incomplete'],
        vendor: { name: 'Blocked Vendor' },
      },
    ];
    let releaseFails = true;
    let quoteFails = true;
    let awardFails = true;
    let approvalFails = true;
    let ppoFails = true;
    let rateCardFails = true;

    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/session') return reply({ user: { role: 'FINANCE_APPROVER' } });
      if (url === '/api/procurement/rfqs/rfq-live/compare') return reply(comparison);
      if (url === '/api/procurement/rate-cards/match?rfqId=rfq-live') return reply({ matchedRateCards });
      if (url === '/api/procurement/rfqs/rfq-live' && init?.method === 'PUT') {
        if (releaseFails) {
          releaseFails = false;
          return reply({}, false);
        }
        liveRfq = { ...liveRfq, status: 'VENDOR_RESPONSE_OPEN' };
        return reply({});
      }
      if (url === '/api/procurement/rfqs/rfq-live') return reply({ rfq: liveRfq });
      if (url === '/api/procurement/quotes' && init?.method === 'POST') {
        if (quoteFails) {
          quoteFails = false;
          return reply({}, false);
        }
        const quote = {
          id: 'quote-live-1',
          quoteNumber: 'QTE-LIVE-001',
          vendorId: 'v-live-1',
          totalQuoteAmount: 180,
          status: '',
          validityDays: 0,
          deliveryLeadTimeDays: 0,
          commercialTerms: '',
          lines: [
            { rfqLineId: 'live-line-1', unitRate: 90, lineTotal: 0 },
            { rfqLineId: 'unmatched-line', unitRate: 0, lineTotal: 0 },
          ],
        };
        liveRfq = { ...liveRfq, status: 'COMPARISON', quotes: [...liveRfq.quotes, quote] };
        return reply({ quote });
      }
      if (url === '/api/procurement/awards' && init?.method === 'POST') {
        if (awardFails) {
          awardFails = false;
          return reply({}, false);
        }
        const body = JSON.parse(String(init.body));
        const vendor = comparison.vendors.find((candidate) => candidate.vendorId === body.recommendedVendorId)!;
        liveRfq = {
          ...liveRfq,
          awards: [{ id: 'award-live-1', recommendedVendorId: vendor.vendorId, recommendedVendor: { name: vendor.vendorName }, finalNegotiatedAmount: 210, status: 'PENDING_APPROVAL', justification: body.justification }],
        };
        return reply({ award: liveRfq.awards[0] });
      }
      if (url === '/api/procurement/awards' && init?.method === 'PUT') {
        if (approvalFails) {
          approvalFails = false;
          return reply({}, false);
        }
        const body = JSON.parse(String(init.body));
        liveRfq = { ...liveRfq, awards: liveRfq.awards.map((award: any) => ({ ...award, status: body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', approvalRemarks: body.remarks })) };
        return reply({ award: liveRfq.awards[0] });
      }
      if (url === '/api/procurement/ppos' && init?.method === 'POST') {
        if (ppoFails) {
          ppoFails = false;
          return reply({}, false);
        }
        const body = JSON.parse(String(init.body));
        const vendorId = body.targetVendorId || 'v-live-2';
        const vendor = comparison.vendors.find((candidate) => candidate.vendorId === vendorId)!;
        const ppoIndex = liveRfq.ppos.length + 1;
        const ppo = { id: `ppo-live-${ppoIndex}`, ppoNumber: `PPO-LIVE-${String(ppoIndex).padStart(3, '0')}`, vendor: { name: vendor.vendorName }, vendorId, totalValue: 210, status: 'ISSUED', deliveryTerms: 'Deliver to site', paymentTerms: 'Net 30', issuedAt: '2026-10-30' };
        liveRfq = { ...liveRfq, ppos: [...liveRfq.ppos, ppo] };
        return reply({ ppo });
      }
      if (url === '/api/procurement/rate-cards/direct-ppo' && init?.method === 'POST') {
        if (rateCardFails) {
          rateCardFails = false;
          return reply({}, false);
        }
        const ppo = { id: 'ppo-rate-card', ppoNumber: 'PPO-RATE-001', vendor: { name: 'Rate Card Vendor' }, vendorId: 'v-rate', totalValue: 180, status: 'ISSUED', deliveryTerms: 'Rate card terms', paymentTerms: 'Rate card payment terms' };
        liveRfq = { ...liveRfq, ppos: [...liveRfq.ppos, ppo] };
        return reply({ ppo });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderRfq('rfq-live');
    expect(await screen.findByText('No Quotations Received Yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Release RFQ' }));
    expect(await screen.findByText('Failed to release RFQ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Release RFQ' }));
    expect(await screen.findByText('RFQ issued successfully.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record Vendor Quote' }));
    const quoteDialog = screen.getByRole('dialog', { name: 'Record Vendor Quotation' });
    fireEvent.change(within(quoteDialog).getAllByPlaceholderText('Unit rate')[0], { target: { value: '90' } });
    fireEvent.change(within(quoteDialog).getByText('Delivery Lead Time (Days)').parentElement!.querySelector('input')!, { target: { value: '' } });
    fireEvent.click(within(quoteDialog).getByRole('button', { name: 'Save & Capture Quote' }));
    expect(await screen.findByText('Failed to capture vendor quote')).toBeInTheDocument();
    fireEvent.click(within(quoteDialog).getByRole('button', { name: 'Save & Capture Quote' }));
    expect(await screen.findByText(/Quotation successfully recorded/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'View Quote' }));
    const details = screen.getByRole('dialog', { name: /Quotation Details/ });
    expect(within(details).getAllByText('30 Days').length).toBeGreaterThan(0);
    expect(within(details).getByText('Standard FOB Site')).toBeInTheDocument();
    fireEvent.click(within(details).getByRole('button', { name: 'Close modal' }));

    fireEvent.click(screen.getByRole('button', { name: '3. Awarding & PPO' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Prepare Award Recommendation' })[0]);
    const awardDialog = screen.getByRole('dialog', { name: 'Submit Commercial Award Recommendation' });
    fireEvent.change(within(awardDialog).getByRole('combobox'), { target: { value: '' } });
    fireEvent.click(within(awardDialog).getByRole('button', { name: 'Submit Award Recommendation' }));
    expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Validation Error', message: 'Please select a vendor.' }));
    fireEvent.change(within(awardDialog).getByRole('combobox'), { target: { value: 'v-live-1' } });
    fireEvent.click(within(awardDialog).getByRole('button', { name: 'Submit Award Recommendation' }));
    expect(await screen.findByText('Failed to submit award recommendation')).toBeInTheDocument();
    fireEvent.change(within(awardDialog).getByRole('combobox'), { target: { value: 'v-live-2' } });
    fireEvent.click(within(awardDialog).getByRole('button', { name: 'Submit Award Recommendation' }));
    expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Justification Required' }));
    fireEvent.change(within(awardDialog).getByRole('textbox'), { target: { value: 'Superior delivery and service coverage.' } });
    fireEvent.click(within(awardDialog).getByRole('button', { name: 'Submit Award Recommendation' }));
    expect(await screen.findByText('PPO submitted successfully for approval.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve Recommendation' }));
    const approvalDialog = screen.getByRole('dialog', { name: 'Approve Commercial Award' });
    fireEvent.change(within(approvalDialog).getByPlaceholderText('Enter approval sanction remarks or reason for rejection'), { target: { value: 'Finance approved the non-L1 exception.' } });
    fireEvent.click(within(approvalDialog).getByRole('button', { name: 'Confirm Approval' }));
    expect(await screen.findByText('Failed to review award recommendation')).toBeInTheDocument();
    fireEvent.click(within(approvalDialog).getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const rejectionDialog = screen.getByRole('dialog', { name: 'Reject Commercial Award' });
    fireEvent.click(within(rejectionDialog).getByRole('button', { name: 'Confirm Rejection' }));
    expect(await screen.findByText('Award recommendation rejected.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve Recommendation' }));
    const finalApprovalDialog = screen.getByRole('dialog', { name: 'Approve Commercial Award' });
    fireEvent.click(within(finalApprovalDialog).getByRole('button', { name: 'Confirm Approval' }));
    expect(await screen.findByText('PPO approved successfully by Finance.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate Purchase Order \(PPO\)/ }));
    const ppoDialog = screen.getByRole('dialog', { name: 'Raise Purchase Order (PPO)' });
    fireEvent.click(within(ppoDialog).getByRole('button', { name: 'Issue Purchase Order (PPO)' }));
    expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Justification Required' }));
    fireEvent.change(within(ppoDialog).getByPlaceholderText(/Enter mandatory justification/), { target: { value: 'Specialist delivery team is required.' } });
    fireEvent.change(within(ppoDialog).getAllByRole('textbox')[1], { target: { value: '' } });
    fireEvent.change(within(ppoDialog).getAllByRole('textbox')[2], { target: { value: '' } });
    fireEvent.click(within(ppoDialog).getByRole('button', { name: 'Issue Purchase Order (PPO)' }));
    expect(await screen.findByText('Failed to generate PPO')).toBeInTheDocument();
    fireEvent.click(within(ppoDialog).getByRole('button', { name: 'Issue Purchase Order (PPO)' }));
    expect(await screen.findByText(/PPO successfully created \(PPO-LIVE-001\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Raise PPO (L1)' }));
    const l1PpoDialog = screen.getByRole('dialog', { name: 'Raise Purchase Order (PPO)' });
    fireEvent.click(within(l1PpoDialog).getByRole('button', { name: 'Issue Purchase Order (PPO)' }));
    expect(await screen.findByText(/PPO successfully created \(PPO-LIVE-002\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /2\. Negotiation/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open rate cards' }));
    const rateCardDialog = screen.getByRole('dialog', { name: 'Approved Vendor Rate Card Sourcing Comparison' });
    expect(within(rateCardDialog).getByText('Coverage is incomplete')).toBeInTheDocument();
    expect(within(rateCardDialog).getAllByText('88/100').length).toBeGreaterThan(0);
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    fireEvent.click(within(rateCardDialog).getByRole('button', { name: 'Create Direct PPO from Rate Card' }));
    fireEvent.click(within(rateCardDialog).getByRole('button', { name: 'Create Direct PPO from Rate Card' }));
    expect(await screen.findByText('Failed to issue direct PPO from rate card')).toBeInTheDocument();
    fireEvent.click(within(rateCardDialog).getByRole('button', { name: 'Create Direct PPO from Rate Card' }));
    expect(await screen.findByText(/^PPO successfully created\.$/)).toBeInTheDocument();
  });

  it('uses sparse RFQ fallbacks when comparison and rate-card services fail', async () => {
    mockSearchParams.mockReturnValue(paramsFor('tab=award'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sparseRfq = {
      id: 'rfq-sparse',
      rfqNumber: 'RFQ-SPARSE-1',
      title: 'Sparse package',
      status: 'OPEN',
      categoryName: '',
      packageName: '',
      createdAt: 'invalid-date',
      estimatedBenchmarkValue: 0,
      lines: [],
      invitedVendors: [],
      quotes: [
        { id: 'quote-fallback', vendorId: 'external-1', vendor: { name: 'Fallback Supplier' }, totalQuoteAmount: 0, lines: undefined, validityDays: 0, deliveryLeadTimeDays: 0, commercialTerms: '', status: '' },
        { id: 'quote-generic', vendorId: 'external-2', totalQuoteAmount: 0, lines: [], validityDays: 0, deliveryLeadTimeDays: 0, commercialTerms: '' },
      ],
      negotiations: [{ currentRound: 0, rounds: [] }],
      awards: [],
      ppos: [],
    };
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/auth/session') return { ok: true, json: async () => ({ user: {} }) };
      if (url === '/api/procurement/rfqs/rfq-sparse') return { ok: true, json: async () => ({ rfq: sparseRfq }) };
      if (url === '/api/procurement/rfqs/rfq-sparse/compare') throw new Error('Comparison unavailable');
      if (url === '/api/procurement/rate-cards/match?rfqId=rfq-sparse') throw new Error('Rate cards unavailable');
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderRfq('rfq-sparse');
    expect(await screen.findByRole('heading', { name: 'Sparse package' })).toBeInTheDocument();
    expect(screen.getByText('Commercial Award Recommendation')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith('Failed to load quote comparison:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Failed to load rate card matches:', expect.any(Error));

    fireEvent.click(screen.getByRole('button', { name: /1\. Quotations Received/ }));
    expect(screen.getByText('Civil & Commercial')).toBeInTheDocument();
    expect(screen.getAllByText('Recorded').length).toBeGreaterThan(0);
    expect(screen.getAllByText('QTE-REC-001').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'View Quote' })[0]);
    const fallbackDetails = screen.getByRole('dialog', { name: 'Quotation Details: Vendor Quote' });
    expect(within(fallbackDetails).getByText('Fallback Supplier')).toBeInTheDocument();
    expect(within(fallbackDetails).getByText('Standard FOB Site')).toBeInTheDocument();
    fireEvent.click(within(fallbackDetails).getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'View Quote' })[1]);
    const genericDetails = screen.getByRole('dialog', { name: 'Quotation Details: Vendor Quote' });
    expect(within(genericDetails).getByText('Vendor')).toBeInTheDocument();
    fireEvent.click(within(genericDetails).getByRole('button', { name: 'Close modal' }));

    fireEvent.click(screen.getByRole('button', { name: 'Record New Quote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & Capture Quote' }));
    expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Validation Error', message: 'Please select a vendor.' }));
    fireEvent.click(screen.getByRole('button', { name: /2\. Negotiation/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open rate cards' }));
    expect(screen.getByText('No Applicable Rate Cards')).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('renders sparse comparison defaults and handles a blank transport error', async () => {
    mockSearchParams.mockReturnValue(paramsFor('tab=award'));
    const sparseRfq = {
      id: 'rfq-fallback',
      rfqNumber: 'RFQ-FALLBACK-1',
      title: 'Fallback package',
      status: 'DRAFT',
      createdAt: null,
      categoryName: '',
      packageName: '',
      estimatedBenchmarkValue: 0,
      finalLockedAmount: 0,
      deliveryRequirement: '',
      paymentTerms: '',
      lines: [{ id: 'fallback-line', description: '', quantity: 0, uom: '', benchmarkRate: 0 }],
      invitedVendors: [{ vendorId: 'fallback-vendor', vendor: {} }],
      quotes: [{ id: 'fallback-quote', vendorId: 'fallback-vendor', status: 'SUBMITTED', totalQuoteAmount: 0, lines: [{ unitRate: 0 }], validityDays: 0, deliveryLeadTimeDays: 0, commercialTerms: '' }],
      negotiations: [{ currentRound: 1, rounds: [{ vendorId: 'fallback-vendor', buyerDecision: 'ACCEPTED' }] }],
      awards: [{ id: 'fallback-award', recommendedVendorId: 'fallback-vendor', recommendedVendor: {}, finalNegotiatedAmount: 0, totalSavingsAmount: 0, savingsPercent: 0, status: 'PENDING_APPROVAL' }],
      ppos: [],
    };
    const comparison = { vendors: [{ vendorId: 'fallback-vendor', rank: 1, totalQuoteAmount: 0 }] };
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/session') return { ok: false, json: async () => ({}) };
      if (url === '/api/procurement/rfqs/rfq-fallback' && init?.method === 'PUT') throw new Error('');
      if (url === '/api/procurement/rfqs/rfq-fallback') return { ok: true, json: async () => ({ rfq: sparseRfq }) };
      if (url === '/api/procurement/rfqs/rfq-fallback/compare') return { ok: true, json: async () => comparison };
      if (url === '/api/procurement/rate-cards/match?rfqId=rfq-fallback') return { ok: true, json: async () => ({ matchedRateCards: [] }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderRfq('rfq-fallback');
    expect(await screen.findByRole('heading', { name: 'Fallback package' })).toBeInTheDocument();
    expect(screen.getByText('Civil & Commercial')).toBeInTheDocument();
    expect(screen.getByText('13 Oct 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Release RFQ' }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'An error occurred while releasing the RFQ.' })));

    fireEvent.click(await screen.findByRole('button', { name: 'Raise PPO (L1)' }));
    const ppoDialog = screen.getByRole('dialog', { name: 'Raise Purchase Order (PPO)' });
    expect(within(ppoDialog).getByText('Selected Vendor', { exact: true })).toBeInTheDocument();
    expect(within(ppoDialog).getByText(/Total Order Value:/).parentElement).toHaveTextContent('0');
  });

  it('releases a draft RFQ through the server action', async () => {
    const draft = {
      id: 'rfq-draft', rfqNumber: 'RFQ-DRAFT-1', title: 'Draft package', status: 'DRAFT',
      lines: [{ id: 'line-1', lineNumber: 1, description: 'Cable', quantity: 2, uom: 'MTR' }],
      invitedVendors: [{ vendorId: 'vendor-1', vendor: { name: 'Vendor One', code: 'V1' } }],
      quotes: [], negotiations: [], awards: [], ppos: [], estimatedBenchmarkValue: 100,
    };
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/session') return { ok: true, json: async () => ({ user: { role: 'BUYER' } }) };
      if (url === '/api/procurement/rfqs/rfq-draft' && init?.method === 'PUT') return { ok: true, json: async () => ({}) };
      if (url === '/api/procurement/rfqs/rfq-draft') return { ok: true, json: async () => ({ rfq: draft }) };
      if (url === '/api/procurement/rfqs/rfq-draft/compare') return { ok: true, json: async () => ({ vendors: [], lines: [] }) };
      if (url === '/api/procurement/rate-cards/match?rfqId=rfq-draft') return { ok: true, json: async () => ({ matchedRateCards: [] }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderRfq('rfq-draft');
    expect(await screen.findByRole('button', { name: 'Release RFQ' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Release RFQ' }));
    expect(await screen.findByText('RFQ issued successfully.')).toBeInTheDocument();
  });
});
