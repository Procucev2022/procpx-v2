'use client';
// app/(app)/procurement/rfqs/[id]/page.tsx
// proCPX Consolidated Procurement Workspace: RFQ -> Negotiation -> Awarding -> PPO
import { useEffect, useState, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import SpecificationCell from '@/components/ui/SpecificationCell';
import {
  Send,
  RotateCcw,
  Award,
  FileCheck,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Scale,
  MessageSquare,
  Building2,
  Receipt,
  Users,
  Check,
  Sparkles,
  Clock,
  ExternalLink,
  Plus,
  Percent,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  TrendingDown,
  Tag,
  Eye,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  getInitialDemoRfq,
  getDemoComparison,
  getDemoRateCards,
  buildDemoQuotes,
  buildDemoNegotiations,
  buildDemoAwards,
  DEMO_QUOTES_DATA,
} from '@/lib/procurement-demo-data';
import RfqChatDrawer from '@/components/RfqChatDrawer';
import ProcurementCommercialWorkspace from '@/components/ProcurementCommercialWorkspace';

export default function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (session?.user) {
          setCurrentUserRole((session.user as any).role || '');
          if ((session.user as any).role === 'VENDOR') {
            router.replace(`/vendor-portal/rfqs/${id}`);
          }
        }
      })
      .catch(() => {});
  }, [id, router]);

  const isDemoMode = id === 'RFQ-DEMO-001' || id === 'demo' || searchParams.get('demo') === 'true';
  const [demoStep, setDemoStep] = useState<number>(1);
  const [showDemoGuide, setShowDemoGuide] = useState<boolean>(searchParams.get('guide') === 'true');

  // Normalize initial tab to one of the 3 lifecycle tabs: 'quotes' | 'negotiation' | 'awarding'
  const initialTabParam = searchParams.get('tab') || 'quotes';
  const resolveTab = (t: string): 'quotes' | 'negotiation' | 'awarding' => {
    if (t === 'negotiation' || t === 'negotiations') return 'negotiation';
    if (t === 'award' || t === 'awarding') return 'awarding';
    return 'quotes';
  };

  const [activeTab, setActiveTab] = useState<'quotes' | 'negotiation' | 'awarding'>(resolveTab(initialTabParam));
  const [viewingQuote, setViewingQuote] = useState<any | null>(null);
  const [rfq, setRfq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState<any>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Rate card comparison state
  const [rateCardMatch, setRateCardMatch] = useState<any>(null);
  const [loadingRateCard, setLoadingRateCard] = useState(false);
  const [showRateCardModal, setShowRateCardModal] = useState(false);

  // Filter to only quotations actually received from vendors
  const submittedQuotes = useMemo(() => {
    return (rfq?.quotes || []).filter((q: any) => q.status !== 'WITHDRAWN');
  }, [rfq?.quotes]);

  // Rank vendors only when their submitted quotations are sufficiently comparable
  const quoteRankMap = useMemo(() => {
    const map: Record<string, { rankLabel: string; rankClass: string; isComparable: boolean; rankNumber?: number }> = {};
    const totalLines = rfq?.lines?.length || 0;

    (comparison?.vendors || []).forEach((v: any) => {
      const q = submittedQuotes.find((sq: any) => sq.vendorId === v.vendorId);
      const quotedCount = q?.lines?.filter((l: any) => l.unitRate > 0).length || q?.lines?.length || 0;
      const isComplete = totalLines > 0 && quotedCount >= totalLines;

      if (!isComplete && quotedCount < totalLines) {
        map[v.vendorId] = {
          rankLabel: 'Partially Quoted (Not Comparable for L1)',
          rankClass: 'bg-amber-50 text-amber-800 border-amber-300',
          isComparable: false,
        };
      } else if (v.rank === 1) {
        map[v.vendorId] = {
          rankLabel: 'L1 Lowest Offer',
          rankClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          isComparable: true,
          rankNumber: 1,
        };
      } else if (v.rank === 2) {
        map[v.vendorId] = {
          rankLabel: 'L2 Second Lowest',
          rankClass: 'bg-amber-50 text-amber-800 border-amber-300',
          isComparable: true,
          rankNumber: 2,
        };
      } else {
        map[v.vendorId] = {
          rankLabel: `L${v.rank} Offer`,
          rankClass: 'bg-slate-100 text-slate-700 border-slate-300',
          isComparable: true,
          rankNumber: v.rank,
        };
      }
    });

    return map;
  }, [comparison?.vendors, submittedQuotes, rfq?.lines]);

  // Sub-view inside RFQ tab ('comparison' | 'scope' | 'vendors' | 'quotes' | 'terms')
  const [rfqSubView, setRfqSubView] = useState<'comparison' | 'scope' | 'vendors' | 'quotes' | 'terms'>('comparison');

  // Modals state
  const [showReRfqModal, setShowReRfqModal] = useState(false);
  const [reRfqReason, setReRfqReason] = useState('');

  // 1. Record Quote Modal
  const [showRecordQuoteModal, setShowRecordQuoteModal] = useState(false);
  const [quoteVendorId, setQuoteVendorId] = useState('');
  const [quoteLineRates, setQuoteLineRates] = useState<Record<string, number>>({});
  const [quoteCommercialTerms, setQuoteCommercialTerms] = useState('Payment net 30 days, FOB site delivery');
  const [quoteDeliveryDays, setQuoteDeliveryDays] = useState('30');
  const [quoteValidityDays, setQuoteValidityDays] = useState('60');

  // 2. Negotiation Modal
  const [showNegotiationModal, setShowNegotiationModal] = useState(false);
  const [negLevel, setNegLevel] = useState<'RFQ_LEVEL' | 'LINE_LEVEL'>('RFQ_LEVEL');
  const [negVendorId, setNegVendorId] = useState('');
  const [counterOffer, setCounterOffer] = useState('');
  const [lineCounterRates, setLineCounterRates] = useState<Record<string, number>>({});
  const [negTargetSavings, setNegTargetSavings] = useState('');
  const [negDeadline, setNegDeadline] = useState(new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]);
  const [negNotes, setNegNotes] = useState('');

  // 3. Record Revised Vendor Quote Modal
  const [showRevisedQuoteModal, setShowRevisedQuoteModal] = useState(false);
  const [revisedVendorId, setRevisedVendorId] = useState('');
  const [revisedTotalAmount, setRevisedTotalAmount] = useState('');
  const [revisedLineRates, setRevisedLineRates] = useState<Record<string, number>>({});
  const [revisedRemarks, setRevisedRemarks] = useState('');

  // 4. Award Recommendation Modal
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [awardVendorId, setAwardVendorId] = useState('');
  const [awardJustification, setAwardJustification] = useState('');

  // 5. Award Approval Modal (for Approver)
  const [showApproveAwardModal, setShowApproveAwardModal] = useState(false);
  const [awardApprovalAction, setAwardApprovalAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [awardApprovalRemarks, setAwardApprovalRemarks] = useState('');

  // 6. PPO Creation Modal
  const [showPpoModal, setShowPpoModal] = useState(false);
  const [ppoAwardId, setPpoAwardId] = useState('');
  const [ppoTargetVendor, setPpoTargetVendor] = useState<any | null>(null);
  const [ppoJustification, setPpoJustification] = useState('');
  const [ppoDeliveryTerms, setPpoDeliveryTerms] = useState('Site delivery within 30 days');
  const [ppoPaymentTerms, setPpoPaymentTerms] = useState('30 days net from certified invoice');

  // Specification preview modal
  const [previewSpec, setPreviewSpec] = useState<{ title: string; spec: string } | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      // By default start with zero quotes as required by demonstration specs
      const startZero = searchParams.get('zero') !== 'false';
      const demoData = getInitialDemoRfq(startZero);
      setRfq(demoData);
      setComparison(getDemoComparison(demoData));
      setRateCardMatch(getDemoRateCards());
      setAwardVendorId('v-demo-001');
      setNegVendorId('v-demo-001');
      setQuoteVendorId('v-demo-001');
      setRevisedVendorId('v-demo-001');
      setLoading(false);
      setLoadingCompare(false);
      setLoadingRateCard(false);
      return;
    }
    fetchRfq();
    fetchComparison();
    fetchRateCardMatch();
  }, [id, isDemoMode, searchParams]);

  const handleResetDemo = (startWithZero: boolean = true) => {
    const freshRfq = getInitialDemoRfq(startWithZero);
    setRfq(freshRfq);
    setComparison(getDemoComparison(freshRfq));
    setRateCardMatch(getDemoRateCards());
    setActiveTab('quotes');
    setRfqSubView('comparison');
    setDemoStep(startWithZero ? 1 : 2);
    setMsg(null);
    toast.info({
      title: 'Demonstration Reset',
      message: startWithZero
        ? 'Demonstration reset to 0 received quotes for Kundanahalli Retail Project (CC45).'
        : 'Full end-to-end sample data loaded across RFQ, Negotiation and Awarding.',
    });
  };

  const handleSimulateReceiveAllQuotes = () => {
    if (!rfq) return;
    const demoQuotes = buildDemoQuotes();
    const updatedInvited = rfq.invitedVendors.map((iv: any) => ({
      ...iv,
      submissionStatus: 'SUBMITTED',
    }));
    const updated = {
      ...rfq,
      status: 'COMPARISON',
      quotes: demoQuotes,
      invitedVendors: updatedInvited,
    };
    setRfq(updated);
    setComparison(getDemoComparison(updated));
    setMsg({ text: 'Quotation successfully recorded. (Demonstration Mode)', type: 'success' });
    toast.success({
      title: '[DEMO] Vendor Quotations Recorded',
      message: 'Quotation successfully recorded for all 3 eligible vendors.',
      recordNumber: 'QTE-ACME-001',
      nextStage: 'Quotation Comparison & AI Benchmark',
    });
  };

  const fetchRfq = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/rfqs/${id}`);
      const data = await res.json();
      if (data.rfq) {
        setRfq(data.rfq);
        if (data.rfq.quotes?.length > 0 && !awardVendorId) {
          setAwardVendorId(data.rfq.quotes[0].vendorId);
          setNegVendorId(data.rfq.quotes[0].vendorId);
          setQuoteVendorId(data.rfq.quotes[0].vendorId);
          setRevisedVendorId(data.rfq.quotes[0].vendorId);
        }
      }
    } catch (err) {
      console.error('Failed to load RFQ:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchComparison = async () => {
    setLoadingCompare(true);
    try {
      const res = await fetch(`/api/procurement/rfqs/${id}/compare`);
      const data = await res.json();
      setComparison(data);
      if (data.vendors?.length > 0) {
        // Default to L1 vendor
        const l1 = data.vendors[0];
        setAwardVendorId(l1.vendorId);
        setNegVendorId(l1.vendorId);
      }
    } catch (err) {
      console.error('Failed to load quote comparison:', err);
    } finally {
      setLoadingCompare(false);
    }
  };

  const fetchRateCardMatch = async () => {
    setLoadingRateCard(true);
    try {
      const res = await fetch(`/api/procurement/rate-cards/match?rfqId=${id}`);
      const data = await res.json();
      setRateCardMatch(data);
    } catch (err) {
      console.error('Failed to load rate card matches:', err);
    } finally {
      setLoadingRateCard(false);
    }
  };

  // RFQ Release Action
  const handleReleaseRfq = async () => {
    if (isDemoMode) {
      setActionLoading(true);
      const updated = {
        ...rfq,
        status: 'VENDOR_RESPONSE_OPEN',
        invitedVendors: (rfq.invitedVendors || []).map((iv: any) => ({
          ...iv,
          invitationStatus: 'INVITED',
        })),
      };
      setRfq(updated);
      setMsg({ text: 'RFQ issued successfully. (Demonstration Mode)', type: 'success' });
      toast.success(
        'RFQ issued successfully.',
        rfq.rfqNumber,
        'Awaiting Quotations'
      );
      setActionLoading(false);
      return;
    }
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rfqs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RELEASE' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to release RFQ');
      setMsg({ text: 'RFQ issued successfully.', type: 'success' });
      toast.success(
        'RFQ issued successfully.',
        rfq.rfqNumber,
        'Awaiting Quotations'
      );
      fetchRfq();
      fetchComparison();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Failed to Release RFQ',
        message: err.message || 'An error occurred while releasing the RFQ.',
        recordNumber: rfq?.rfqNumber,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Lock Rates Action
  const handleLockRates = async (vendorId: string, quoteAmount: number) => {
    if (!confirm('Are you sure you want to lock the commercial rates with this vendor?')) return;
    const vendorName = rfq.invitedVendors?.find((iv: any) => iv.vendorId === vendorId)?.vendor?.name || 'Selected Vendor';

    if (isDemoMode) {
      const updated = {
        ...rfq,
        status: 'FINAL_RATE_LOCKED',
        finalLockedAmount: quoteAmount,
        lockedVendorId: vendorId,
      };
      setRfq(updated);
      setComparison(getDemoComparison(updated));
      setMsg({ text: 'Commercial rates successfully locked. Ready for Award Recommendation. (Demonstration Mode)', type: 'success' });
      toast.success({
        title: '[DEMO] Commercial Rates Locked',
        message: `Rates locked at ₹${quoteAmount.toLocaleString()} with ${vendorName}. Prepare award recommendation.`,
        recordNumber: rfq.rfqNumber,
        vendorName,
        nextStage: 'Award Recommendation',
      });
      setActiveTab('awarding');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/procurement/rfqs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOCK_RATE',
          lockedVendorId: vendorId,
          finalRateLockedAmount: quoteAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to lock commercial rates');
      setMsg({ text: 'Commercial rates successfully locked. Ready for Award Recommendation.', type: 'success' });
      toast.success({
        title: 'Commercial Rates Locked',
        message: `Rates locked at ₹${quoteAmount.toLocaleString()} with ${vendorName}. Prepare award recommendation.`,
        recordNumber: rfq.rfqNumber,
        vendorName,
        nextStage: 'Award Recommendation',
      });
      fetchRfq();
      setActiveTab('awarding');
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Rate Lock Failed',
        message: err.message || 'An error occurred while locking commercial rates.',
        recordNumber: rfq?.rfqNumber,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const [rfqChatDrawerOpen, setRfqChatDrawerOpen] = useState(false);

  // Buyer Decision Action (Accept Offer — PPO Awaited / Decline Offer)
  const handleBuyerDecision = async (roundId: string, decision: 'ACCEPTED' | 'REJECTED') => {
    const actionLabel = decision === 'ACCEPTED' ? 'Accept Offer (PPO Awaited)' : 'Decline Offer / Close Negotiation';
    if (!confirm(`Are you sure you want to ${actionLabel}?`)) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/procurement/negotiations/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId,
          decision,
          remarks: decision === 'ACCEPTED' ? 'Commercial offer accepted by procurement authority; formal PPO generation awaited.' : 'Negotiation closed.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record decision');
      toast.success({
        title: decision === 'ACCEPTED' ? 'Offer Accepted — PPO Awaited' : 'Negotiation Closed',
        message: data.statusLabel || `Buyer decision recorded: ${decision}`,
        recordNumber: rfq?.rfqNumber,
      });
      await fetchRfq();
      await fetchComparison();
    } catch (err: any) {
      toast.error({
        title: 'Decision Error',
        message: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Capture / Record Vendor Quote Submission
  const handleRecordQuoteSubmit = async () => {
    if (!quoteVendorId) {
      toast.error({ title: 'Validation Error', message: 'Please select a vendor.' });
      return;
    }
    const vendorName = rfq.invitedVendors?.find((iv: any) => iv.vendorId === quoteVendorId)?.vendor?.name || 'Supplier';

    if (isDemoMode) {
      setActionLoading(true);
      const demoQuoteMatch = DEMO_QUOTES_DATA.find((dq) => dq.vendorId === quoteVendorId);
      const quoteNumber = demoQuoteMatch?.quoteNumber || `QTE-${quoteVendorId.slice(0, 4).toUpperCase()}-001`;

      const linesPayload = rfq.lines.map((l: any, idx: number) => {
        const userRate = Number(quoteLineRates[l.id]);
        const fallbackRate = demoQuoteMatch?.rates.find((r) => r.rfqLineId === l.id)?.rate || l.benchmarkRate;
        const unitRate = userRate > 0 ? userRate : fallbackRate;
        return {
          id: `ql-${quoteVendorId}-${idx}`,
          rfqLineId: l.id,
          unitRate,
          lineTotal: unitRate * l.quantity,
          taxPercent: 18,
        };
      });

      const totalQuoteAmount = linesPayload.reduce((acc: number, line: any) => acc + line.lineTotal, 0);

      const newQuote = {
        id: `quote-${quoteVendorId}-${Date.now()}`,
        quoteNumber,
        quoteVersion: 1,
        vendorId: quoteVendorId,
        totalQuoteAmount,
        status: 'SUBMITTED',
        commercialTerms: quoteCommercialTerms || 'Payment net 30 days, FOB site delivery',
        deliveryLeadTimeDays: Number(quoteDeliveryDays) || 30,
        validityDays: Number(quoteValidityDays) || 60,
        paymentTerms: 'Net 30 days from certified invoice',
        warranty: '12 months warranty',
        freightTerms: 'Included in unit rates',
        submittedAt: new Date().toISOString(),
        lines: linesPayload,
      };

      const existingFiltered = (rfq.quotes || []).filter((q: any) => q.vendorId !== quoteVendorId);
      const updatedQuotes = [...existingFiltered, newQuote];
      const updatedInvited = rfq.invitedVendors.map((iv: any) =>
        iv.vendorId === quoteVendorId ? { ...iv, submissionStatus: 'SUBMITTED' } : iv
      );

      const updatedRfq = {
        ...rfq,
        status: 'COMPARISON',
        quotes: updatedQuotes,
        invitedVendors: updatedInvited,
      };

      setRfq(updatedRfq);
      setComparison(getDemoComparison(updatedRfq));
      setShowRecordQuoteModal(false);
      setActionLoading(false);
      setMsg({ text: 'Quotation successfully recorded. (Demonstration Mode)', type: 'success' });
      toast.success({
        title: '[DEMO] Quotation Recorded',
        message: 'Quotation successfully recorded.',
        recordNumber: quoteNumber,
        vendorName,
        nextStage: 'Quotation Comparison & AI Benchmark',
      });
      return;
    }

    setActionLoading(true);
    try {
      const linesPayload = rfq.lines.map((l: any) => ({
        rfqLineId: l.id,
        unitRate: Number(quoteLineRates[l.id]) || 0,
        taxPercent: 18,
        discountPercent: 0,
      }));

      const res = await fetch('/api/procurement/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: id,
          vendorId: quoteVendorId,
          lines: linesPayload,
          commercialTerms: quoteCommercialTerms,
          deliveryLeadTimeDays: Number(quoteDeliveryDays) || 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to capture vendor quote');
      setShowRecordQuoteModal(false);
      setMsg({ text: `Quotation successfully recorded. (${data.quote.quoteNumber})`, type: 'success' });
      toast.success({
        title: 'Vendor Quotation Recorded',
        message: `Quotation successfully recorded. Quotation ${data.quote.quoteNumber} recorded for ${vendorName}. Total: ₹${(data.quote.totalQuoteAmount || 0).toLocaleString()}.`,
        recordNumber: data.quote.quoteNumber,
        vendorName,
        nextStage: 'Quote Comparison & AI Benchmark',
      });
      fetchRfq();
      fetchComparison();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Quotation Recording Failed',
        message: err.message || 'Failed to record vendor quotation.',
        recordNumber: rfq?.rfqNumber,
        vendorName,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Negotiation Counter-Offer Submission
  const handleNegotiationSubmit = async () => {
    if (!negVendorId) {
      toast.error({ title: 'Validation Error', message: 'Please select a vendor to negotiate with.' });
      return;
    }
    const vendorName = rfq.invitedVendors?.find((iv: any) => iv.vendorId === negVendorId)?.vendor?.name || 'Vendor';

    if (isDemoMode) {
      setActionLoading(true);
      let counterAmount = Number(counterOffer) || 840000;
      if (negLevel === 'LINE_LEVEL') {
        const sum = rfq.lines.reduce((acc: number, l: any) => {
          const rate = Number(lineCounterRates[l.id]) || 0;
          return acc + (rate > 0 ? rate * l.quantity : 0);
        }, 0);
        if (sum > 0) counterAmount = sum;
      }

      const existingNeg = rfq.negotiations?.find((n: any) => n.vendorId === negVendorId);
      const rounds = existingNeg?.rounds || [];
      const newRoundNumber = rounds.length + 1;
      const initialQuoteAmt = rfq.quotes?.find((q: any) => q.vendorId === negVendorId)?.totalQuoteAmount || 880000;

      const newRound = {
        id: `round-${newRoundNumber}`,
        roundNumber: newRoundNumber,
        vendorId: negVendorId,
        vendorName,
        previousQuoteAmount: rounds[rounds.length - 1]?.revisedQuoteAmount || initialQuoteAmt,
        counterOfferAmount: counterAmount,
        revisedQuoteAmount: 0,
        savingsAmount: initialQuoteAmt - counterAmount,
        savingsPercent: Number((((initialQuoteAmt - counterAmount) / initialQuoteAmt) * 100).toFixed(2)),
        status: 'COUNTER_SENT',
        deadline: negDeadline || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        notes: negNotes || (negLevel === 'LINE_LEVEL' ? 'Line-item negotiation counter-offer' : 'Package-level counter-offer of ₹8,40,000 seeking 4.5% volume discount'),
        timestamp: new Date().toISOString(),
      };

      const updatedNegs = [
        {
          id: existingNeg?.id || `neg-demo-${negVendorId}`,
          vendorId: negVendorId,
          status: 'ACTIVE',
          currentRound: newRoundNumber,
          targetSavingsPercent: 4.5,
          bestQuoteAmount: counterAmount,
          rounds: [...rounds, newRound],
        },
      ];

      const updatedRfq = {
        ...rfq,
        status: 'NEGOTIATION',
        negotiations: updatedNegs,
      };

      setRfq(updatedRfq);
      setShowNegotiationModal(false);
      setActionLoading(false);
      setMsg({ text: 'Buyer offer submitted successfully. (Demonstration Mode)', type: 'success' });
      toast.success(
        'Buyer offer submitted successfully.',
        rfq.rfqNumber,
        'Awaiting Vendor Revised Offer'
      );
      return;
    }

    setActionLoading(true);
    try {
      let counterAmount = Number(counterOffer) || 0;
      let lineItemsPayload: any[] | null = null;
      if (negLevel === 'LINE_LEVEL') {
        counterAmount = rfq.lines.reduce((acc: number, l: any) => {
          const rate = Number(lineCounterRates[l.id]) || 0;
          return acc + rate * l.quantity;
        }, 0);
        lineItemsPayload = (rfq.lines || []).map((l: any, idx: number) => {
          const rate = Number(lineCounterRates[l.id]) || 0;
          return {
            rfqLineId: l.id,
            lineNumber: l.lineNumber || idx + 1,
            description: l.description,
            counterRate: rate,
            lineTotal: rate * (Number(l.quantity) || 1),
          };
        });
      } else {
        const previousTotal = rfq.quotes?.find((q: any) => q.vendorId === negVendorId)?.totalQuoteAmount || 1;
        const ratio = counterAmount / (previousTotal || 1);
        lineItemsPayload = (rfq.lines || []).map((l: any, idx: number) => {
          const quoteLine = rfq.quotes?.find((q: any) => q.vendorId === negVendorId)?.lines?.find((ql: any) => ql.rfqLineId === l.id);
          const origRate = Number(quoteLine?.unitRate) || Number(l.benchmarkRate) || 0;
          const rate = Math.round(origRate * ratio);
          return {
            rfqLineId: l.id,
            lineNumber: l.lineNumber || idx + 1,
            description: l.description,
            counterRate: rate,
            lineTotal: rate * (Number(l.quantity) || 1),
          };
        });
      }

      const res = await fetch('/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: id,
          vendorId: negVendorId,
          counterOfferAmount: counterAmount,
          deadline: negDeadline,
          notes: negNotes || (negLevel === 'LINE_LEVEL' ? 'Line-item negotiation counter-offer' : 'Package-level counter-offer'),
          lineItemsJson: lineItemsPayload ? JSON.stringify(lineItemsPayload) : null,
          nextResponsibleParty: 'VENDOR',
          allowSupersede: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit counter-offer');
      setShowNegotiationModal(false);
      setMsg({ text: 'Buyer offer submitted successfully.', type: 'success' });
      toast.success(
        'Buyer offer submitted successfully.',
        rfq.rfqNumber,
        'Awaiting Revised Quotation'
      );
      fetchRfq();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Counter-Offer Failed',
        message: err.message || 'An error occurred while dispatching the counter-offer.',
        recordNumber: rfq?.rfqNumber,
        vendorName,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Record Revised Quote from Vendor (without overwriting previous quotes!)
  const handleRevisedQuoteSubmit = async () => {
    if (!revisedVendorId) return;
    const vendorName = rfq.invitedVendors?.find((iv: any) => iv.vendorId === revisedVendorId)?.vendor?.name || 'Vendor';

    if (isDemoMode) {
      setActionLoading(true);
      const revisedAmt = Number(revisedTotalAmount) || 850000;
      const existingNeg = rfq.negotiations?.find((n: any) => n.vendorId === revisedVendorId) || {
        id: `neg-demo-${revisedVendorId}`,
        vendorId: revisedVendorId,
        status: 'ACTIVE',
        currentRound: 1,
        rounds: [],
      };

      const lastRound = existingNeg.rounds[existingNeg.rounds.length - 1];
      const updatedRound = lastRound
        ? {
            ...lastRound,
            revisedQuoteAmount: revisedAmt,
            status: 'REVISED_SUBMITTED',
            savingsAmount: (lastRound.previousQuoteAmount || 880000) - revisedAmt,
            savingsPercent: Number(((((lastRound.previousQuoteAmount || 880000) - revisedAmt) / (lastRound.previousQuoteAmount || 880000)) * 100).toFixed(2)),
            notes: `${lastRound.notes || ''} | Vendor revised quotation: ${revisedRemarks || 'Agreed to ₹8,50,000 revised package price.'}`,
          }
        : {
            id: 'round-1',
            roundNumber: 1,
            vendorId: revisedVendorId,
            vendorName,
            previousQuoteAmount: 880000,
            counterOfferAmount: 840000,
            revisedQuoteAmount: revisedAmt,
            savingsAmount: 30000,
            savingsPercent: 3.41,
            status: 'REVISED_SUBMITTED',
            deadline: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
            notes: `Vendor revised quotation received: ${revisedRemarks || 'Agreed to ₹8,50,000'}`,
            timestamp: new Date().toISOString(),
          };

      const updatedNegs = [
        {
          ...existingNeg,
          bestQuoteAmount: revisedAmt,
          rounds: lastRound ? [...existingNeg.rounds.slice(0, -1), updatedRound] : [updatedRound],
        },
      ];

      // Add new immutable Quote revision record
      const revisedQuote = {
        id: `quote-${revisedVendorId}-rev2`,
        quoteNumber: `QTE-ACME-001-R1`,
        quoteVersion: 2,
        vendorId: revisedVendorId,
        totalQuoteAmount: revisedAmt,
        status: 'SUBMITTED',
        commercialTerms: `Revised terms: ${revisedRemarks || 'Agreed to ₹8,50,000 commercial fitout total'}`,
        deliveryLeadTimeDays: 25,
        validityDays: 60,
        paymentTerms: 'Net 30 days from certified measurement invoice',
        warranty: '12 months defect liability period',
        freightTerms: 'Included in unit rates',
        submittedAt: new Date().toISOString(),
        lines: rfq.lines.map((l: any) => ({
          id: `ql-${revisedVendorId}-rev-${l.id}`,
          rfqLineId: l.id,
          unitRate: Math.round(revisedAmt / rfq.lines.length),
          lineTotal: Math.round(revisedAmt / rfq.lines.length) * l.quantity,
          taxPercent: 18,
        })),
      };

      const updatedQuotes = [...(rfq.quotes || []), revisedQuote];

      const updatedRfq = {
        ...rfq,
        status: 'FINAL_RATE_LOCKED',
        finalLockedAmount: revisedAmt,
        lockedVendorId: revisedVendorId,
        quotes: updatedQuotes,
        negotiations: updatedNegs,
      };

      setRfq(updatedRfq);
      setComparison(getDemoComparison(updatedRfq));
      setShowRevisedQuoteModal(false);
      setActionLoading(false);
      setMsg({ text: 'Revised quotation successfully received. (Demonstration Mode)', type: 'success' });
      toast.success({
        title: '[DEMO] Revised Quotation Received',
        message: 'Revised quotation successfully received.',
        recordNumber: 'QTE-ACME-001-R1',
        vendorName,
        nextStage: 'Commercial Comparison / Rate Lock',
      });
      return;
    }

    setActionLoading(true);
    try {
      // 1. Log revised quote into negotiation round
      const resNeg = await fetch('/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: id,
          vendorId: revisedVendorId,
          revisedQuoteAmount: Number(revisedTotalAmount) || 0,
          notes: `Vendor revised quotation received: ${revisedRemarks}`,
        }),
      });
      const dataNeg = await resNeg.json();
      if (!resNeg.ok) throw new Error(dataNeg.error || 'Failed to record revised quote in negotiation');

      // 2. Also register a new immutable Quote revision record
      const linesPayload = rfq.lines.map((l: any) => {
        const rate = Number(revisedLineRates[l.id]) || (Number(revisedTotalAmount) / (rfq.lines.length || 1));
        return {
          rfqLineId: l.id,
          unitRate: rate,
          taxPercent: 18,
          discountPercent: 0,
        };
      });

      const resQuote = await fetch('/api/procurement/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: id,
          vendorId: revisedVendorId,
          lines: linesPayload,
          commercialTerms: `Revised terms: ${revisedRemarks}`,
        }),
      });
      const dataQuote = await resQuote.json();
      if (!resQuote.ok) throw new Error(dataQuote.error || 'Failed to capture revised quote lines');

      setShowRevisedQuoteModal(false);
      setMsg({ text: 'Revised quotation successfully received.', type: 'success' });
      toast.success({
        title: 'Revised Quote Recorded',
        message: `Revised quotation successfully received. Revised quotation of ₹${(Number(revisedTotalAmount) || 0).toLocaleString()} recorded for ${vendorName}. Audit trail preserved.`,
        recordNumber: dataQuote.quote?.quoteNumber || rfq.rfqNumber,
        vendorName,
        nextStage: 'Commercial Comparison / Rate Lock',
      });
      fetchRfq();
      fetchComparison();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Revised Quote Failed',
        message: err.message || 'An error occurred while saving the revised quotation.',
        recordNumber: rfq?.rfqNumber,
        vendorName,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Award Recommendation Submission
  const handleAwardSubmit = async () => {
    if (!awardVendorId) {
      toast.error({ title: 'Validation Error', message: 'Please select a vendor.' });
      return;
    }

    const isL1 = comparison?.summary?.lowestVendorId === awardVendorId;
    if (!isL1 && !awardJustification.trim()) {
      toast.error({ title: 'Justification Required', message: 'Documented justification is mandatory when recommending a non-L1 vendor.' });
      return;
    }

    const vendorName = rfq.invitedVendors?.find((iv: any) => iv.vendorId === awardVendorId)?.vendor?.name || 'Selected Vendor';

    if (isDemoMode) {
      setActionLoading(true);
      const finalAmount = rfq.finalLockedAmount || 850000;
      const newAward = {
        id: 'award-demo-001',
        recommendedVendorId: awardVendorId,
        recommendedVendor: {
          id: awardVendorId,
          name: vendorName,
          code: 'VEND-ACME-01',
        },
        finalNegotiatedAmount: finalAmount,
        status: 'PENDING_APPROVAL',
        justification: awardJustification || (isL1 ? 'Recommended L1 lowest compliant offer after Round 1 negotiation. Full technical compliance across all 8 scope items.' : 'Exception award justified based on vendor delivery speed and specialized finish quality.'),
        isNonL1Exception: !isL1,
      };

      const updatedRfq = {
        ...rfq,
        status: 'AWARD_RECOMMENDED',
        awards: [newAward],
      };

      setRfq(updatedRfq);
      setShowAwardModal(false);
      setActionLoading(false);
      setMsg({ text: 'PPO submitted successfully for approval. (Demonstration Mode)', type: 'success' });
      toast.success(
        'PPO submitted successfully for approval.',
        rfq.rfqNumber,
        'Pending Finance Sign-off'
      );
      return;
    }

    setActionLoading(true);
    try {
      const selectedQuote = rfq.quotes.find((q: any) => q.vendorId === awardVendorId);
      const finalAmount = rfq.finalLockedAmount || selectedQuote?.totalQuoteAmount || 0;

      const res = await fetch('/api/procurement/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: id,
          recommendedVendorId: awardVendorId,
          originalQuoteAmount: selectedQuote?.totalQuoteAmount || finalAmount,
          finalNegotiatedAmount: finalAmount,
          benchmarkAmount: rfq.estimatedBenchmarkValue || 0,
          justification: awardJustification || (isL1 ? 'L1 lowest commercial offer with compliant technical specifications' : 'Commercial value justification'),
          commercialStatus: isL1 ? 'BEST_VALUE' : 'EXCEPTION_VALUE',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit award recommendation');
      setShowAwardModal(false);
      setMsg({ text: 'PPO submitted successfully for approval.', type: 'success' });
      toast.success(
        'PPO submitted successfully for approval.',
        rfq.rfqNumber,
        'Pending Finance Sign-off'
      );
      fetchRfq();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Award Submission Failed',
        message: err.message || 'An error occurred while submitting the award recommendation.',
        recordNumber: rfq?.rfqNumber,
        vendorName,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Award Approval Review (Approve or Reject)
  const handleAwardApprovalReview = async () => {
    if (!rfq.awards?.length) return;
    const isApproved = awardApprovalAction === 'APPROVE';
    const vendorName = rfq.awards[0]?.recommendedVendor?.name || 'Vendor';
    const isFinance = currentUserRole === 'FINANCE_APPROVER' || currentUserRole === 'FINANCE_USER';
    const successApprovalMsg = isFinance ? 'PPO approved successfully by Finance.' : 'PPO approved successfully.';

    if (isDemoMode) {
      setActionLoading(true);
      const updatedAward = {
        ...rfq.awards[0],
        status: isApproved ? 'APPROVED' : 'REJECTED',
        approvedBy: 'Finance Approver (Demonstration)',
        approvedAt: new Date().toISOString(),
        approvalRemarks: awardApprovalRemarks || 'Approved after reviewing L1 commercial parity and rate card benchmarks.',
      };

      const updatedRfq = {
        ...rfq,
        status: isApproved ? 'APPROVED' : 'AWARD_RECOMMENDED',
        awards: [updatedAward],
      };

      setRfq(updatedRfq);
      setShowApproveAwardModal(false);
      setActionLoading(false);
      const textMsg = isApproved ? `${successApprovalMsg} (Demonstration Mode)` : 'Award recommendation rejected.';
      setMsg({ text: textMsg, type: isApproved ? 'success' : 'error' });
      toast.success(
        isApproved ? successApprovalMsg : 'Award recommendation rejected.',
        rfq.rfqNumber,
        isApproved ? 'Ready for PPO Issuance' : 'Commercial Review'
      );
      return;
    }

    setActionLoading(true);
    try {
      const awardId = rfq.awards[0].id;
      const res = await fetch('/api/procurement/awards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          awardId,
          action: awardApprovalAction,
          remarks: awardApprovalRemarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to review award recommendation');
      setShowApproveAwardModal(false);
      const successText = isApproved ? successApprovalMsg : 'Award recommendation rejected.';
      setMsg({ text: successText, type: isApproved ? 'success' : 'error' });
      toast.success(
        isApproved ? successApprovalMsg : 'Award recommendation rejected.',
        rfq.rfqNumber,
        isApproved ? 'Ready for PPO Issuance' : 'Commercial Review'
      );
      fetchRfq();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Approval Review Failed',
        message: err.message || 'An error occurred while reviewing the award.',
        recordNumber: rfq?.rfqNumber,
        vendorName,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Open PPO Modal for a specific vendor
  const handleOpenRaisePpoModal = (vendor: any) => {
    setPpoTargetVendor(vendor);
    const isL1 = vendor.rank === 1;
    setPpoJustification(isL1 ? 'Awarded to L1 lowest compliant bidder following competitive evaluation.' : '');
    setPpoDeliveryTerms(rfq.deliveryRequirement || 'Site delivery within 30 days');
    setPpoPaymentTerms(rfq.paymentTerms || '30 days net from certified invoice');
    setShowPpoModal(true);
  };

  // PPO Creation Action
  const handleGeneratePpo = async (awardId?: string) => {
    const targetVendorId =
      ppoTargetVendor?.vendorId ||
      (awardId ? rfq.awards?.find((a: any) => a.id === awardId)?.recommendedVendorId : rfq.awards?.[0]?.recommendedVendorId);

    const vendorName =
      ppoTargetVendor?.vendorName ||
      rfq.invitedVendors?.find((iv: any) => iv.vendorId === targetVendorId)?.vendor?.name ||
      'Selected Vendor';

    const isL1 = ppoTargetVendor ? ppoTargetVendor.rank === 1 : comparison?.vendors?.[0]?.vendorId === targetVendorId;

    // Check if PPO already exists for this vendor
    const existingPpo = (rfq.ppos || []).find((p: any) => p.vendorId === targetVendorId);
    if (existingPpo) {
      toast.warning({
        title: 'Duplicate Prevented',
        message: `Purchase Order ${existingPpo.ppoNumber} already exists for ${vendorName} on this RFQ.`,
        recordNumber: existingPpo.ppoNumber,
      });
      return;
    }

    // Enforce justification if vendor is not L1
    if (!isL1 && (!ppoJustification || !ppoJustification.trim())) {
      toast.error({
        title: 'Justification Required',
        message: 'Documented justification is mandatory when raising PPO for a non-L1 vendor.',
      });
      return;
    }

    if (isDemoMode) {
      setActionLoading(true);
      const ppoNumber = `PPO-DEMO-${Date.now().toString().slice(-4)}`;
      const newPpo = {
        id: `ppo-demo-${Date.now()}`,
        ppoNumber,
        vendorId: targetVendorId || 'v-demo-001',
        vendor: {
          id: targetVendorId || 'v-demo-001',
          name: vendorName,
        },
        totalValue: ppoTargetVendor?.totalQuoteAmount || rfq.awards?.[0]?.finalNegotiatedAmount || 850000,
        status: 'ISSUED',
        deliveryTerms: ppoDeliveryTerms || 'Site delivery within 25 days to Kundanahalli, Bengaluru',
        paymentTerms: ppoPaymentTerms || 'Net 30 days from certified measurement invoice',
        issuedAt: new Date().toISOString(),
      };

      const updatedRfq = {
        ...rfq,
        status: 'AWARDED',
        ppos: [...(rfq.ppos || []), newPpo],
      };

      setRfq(updatedRfq);
      setShowPpoModal(false);
      setActionLoading(false);
      setMsg({ text: `PPO successfully created (${ppoNumber}). (Demonstration Mode)`, type: 'success' });
      toast.success({
        title: '[DEMO] Purchase Order Issued',
        message: 'PPO successfully created.',
        recordNumber: ppoNumber,
        vendorName,
        nextStage: 'PPO Issued / Contract Active',
      });
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/procurement/ppos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: id,
          targetVendorId,
          awardRecommendationId: awardId || undefined,
          justification: ppoJustification,
          deliveryTerms: ppoDeliveryTerms || rfq.deliveryRequirement || 'Site delivery within 30 days',
          paymentTerms: ppoPaymentTerms || rfq.paymentTerms || 'Net 30 days from inspection',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate PPO');
      setShowPpoModal(false);
      setMsg({ text: `PPO successfully created (${data.ppo.ppoNumber}).`, type: 'success' });
      toast.success({
        title: 'Purchase Order (PPO) Issued',
        message: `PPO successfully created. Purchase Order ${data.ppo.ppoNumber} generated for ${vendorName}. Contract active.`,
        recordNumber: data.ppo.ppoNumber,
        vendorName,
        nextStage: 'PPO Issued / Contract Active',
        link: '/procurement/ppos',
      });
      fetchRfq();
      fetchComparison();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'PPO Generation Failed',
        message: err.message || 'An error occurred while issuing the Purchase Order.',
        recordNumber: rfq?.rfqNumber,
        vendorName,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Direct PPO from Rate Card
  const handleDirectRateCardPpo = async (rateCardId: string) => {
    if (!confirm('Create direct Purchase Order (PPO) from this approved rate card?')) return;

    if (isDemoMode) {
      setActionLoading(true);
      const ppoNumber = 'PPO-DEMO-RC-001';
      const newPpo = {
        id: 'ppo-demo-rc-001',
        ppoNumber,
        vendorId: 'v-demo-001',
        vendor: {
          id: 'v-demo-001',
          name: 'Acme Infra Solutions Pvt Ltd',
        },
        totalValue: 855000,
        status: 'ISSUED',
        deliveryTerms: 'FOB Site delivery within 25 days',
        paymentTerms: 'Net 30 days against pre-approved rate card VRC-2026-000001',
        issuedAt: new Date().toISOString(),
      };
      const updatedRfq = {
        ...rfq,
        status: 'AWARDED',
        ppos: [newPpo],
      };
      setRfq(updatedRfq);
      setShowRateCardModal(false);
      setActionLoading(false);
      setMsg({ text: 'PPO successfully created. (Demonstration Mode - Rate Card Sourcing)', type: 'success' });
      toast.success({
        title: '[DEMO] Direct PPO Issued',
        message: 'PPO successfully created.',
        recordNumber: ppoNumber,
        vendorName: 'Acme Infra Solutions Pvt Ltd',
        nextStage: 'PPO Issued / Contract Active',
      });
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/procurement/rate-cards/direct-ppo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateCardId,
          rfqId: id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue direct PPO from rate card');
      setShowRateCardModal(false);
      setMsg({ text: 'PPO successfully created.', type: 'success' });
      toast.success({
        title: 'Direct PPO Created from Rate Card',
        message: `PPO successfully created. Purchase Order ${data.ppo.ppoNumber} issued via pre-approved rate card.`,
        recordNumber: data.ppo.ppoNumber,
        nextStage: 'PPO Issued / Contract Active',
        link: '/procurement/ppos',
      });
      fetchRfq();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: 'Direct PPO Failed',
        message: err.message || 'An error occurred while creating direct PPO from rate card.',
        recordNumber: rfq?.rfqNumber,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Dynamically ranked vendors from valid quotations
  const rankedVendors: any[] = useMemo(() => {
    if (comparison?.vendors?.length > 0) {
      return comparison.vendors;
    }
    if (rfq?.quotes?.length > 0) {
      return [...rfq.quotes]
        .map((q: any) => ({
          vendorId: q.vendorId,
          vendorName: q.vendor?.name || 'Vendor',
          totalQuoteAmount: q.totalQuoteAmount || 0,
        }))
        .filter((v: any) => v.totalQuoteAmount > 0)
        .sort((a: any, b: any) => a.totalQuoteAmount - b.totalQuoteAmount)
        .map((v: any, idx: number) => ({ ...v, rank: idx + 1 }));
    }
    return [];
  }, [comparison, rfq]);

  if (loading) {
    return (
      <div className="page-content">
        <div className="loading-overlay">
          <div className="spinner" /> Loading Procurement Workspace...
        </div>
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="page-content">
        <div className="alert alert-error">RFQ not found or access denied.</div>
        <Link href="/procurement/rfqs" className="btn btn-secondary mt-4">
          ← Back to RFQs Register
        </Link>
      </div>
    );
  }

  // Derived calculations
  const benchmark = rfq.estimatedBenchmarkValue || 0;
  const l1VendorInfo = rankedVendors[0];
  const l2VendorInfo = rankedVendors[1];
  const l3VendorInfo = rankedVendors[2];
  const l1VendorId = l1VendorInfo?.vendorId;

  const lowestQuote = l1VendorInfo?.totalQuoteAmount || 0;
  const savings = benchmark && lowestQuote ? benchmark - lowestQuote : 0;
  const savingsPercent = benchmark && lowestQuote ? Math.round((savings / benchmark) * 1000) / 10 : 0;

  const hasApprovedAward = rfq.awards?.some((a: any) => a.status === 'APPROVED');
  const hasPpo = rfq.ppos?.length > 0;

  return (
    <div className="page-content">
      {/* 1. Consolidated Compact Enterprise Header */}
      <div
        className="card mb-3"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '12px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* Top Line: RFQ Ref, Title, Status & Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="font-mono font-bold"
              style={{
                fontSize: 12,
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '2px 8px',
                borderRadius: 4,
              }}
            >
              {rfq.rfqNumber}
            </span>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              {rfq.title}
            </h1>
            <StatusBadge status={rfq.status} />
          </div>

          {rfq.status === 'DRAFT' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleReleaseRfq}
                disabled={actionLoading || !rfq.invitedVendors?.length}
                className="btn btn-primary btn-sm"
                style={{ fontSize: 12 }}
              >
                <Send size={13} style={{ marginRight: 5 }} /> Release RFQ
              </button>
            </div>
          )}
        </div>

        {/* Bottom Line: Consolidated Metadata Details (Project, Package, Cost Centre, PR Ref, BOQ Rev, Deadline) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 12,
            color: '#475569',
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <div>
            <span className="text-muted" style={{ fontWeight: 600 }}>Project:</span>{' '}
            <span className="font-semibold text-slate-800">{rfq.project?.name} ({rfq.project?.projectCode})</span>
          </div>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div>
            <span className="text-muted" style={{ fontWeight: 600 }}>Package:</span>{' '}
            <span className="font-medium text-slate-800">{rfq.packageName || 'Civil & Commercial Package'}</span>
          </div>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div>
            <span className="text-muted" style={{ fontWeight: 600 }}>Cost Centre:</span>{' '}
            <span className="font-semibold text-slate-800">
              {rfq.pr?.costCentre ? `${rfq.pr.costCentre.code} - ${rfq.pr.costCentre.name}` : rfq.costCentre || 'CC45 - Fitout'}
            </span>
          </div>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div>
            <span className="text-muted" style={{ fontWeight: 600 }}>PR Ref:</span>{' '}
            <span className="font-mono font-bold text-blue-700">{rfq.pr?.prNumber || rfq.prNumber || 'PR-DEMO-001'}</span>
          </div>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div>
            <span className="text-muted" style={{ fontWeight: 600 }}>BOQ:</span>{' '}
            <span className="badge badge-approved" style={{ fontSize: 10, padding: '1px 6px', marginLeft: 4 }}>
              {rfq.boqRevision?.revisionCode || 'BOQ-R1'}
            </span>
          </div>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div>
            <span className="text-muted" style={{ fontWeight: 600 }}>Deadline:</span>{' '}
            <span className="font-medium text-slate-800">
              {rfq.submissionDeadline ? new Date(rfq.submissionDeadline).toLocaleDateString() : 'Open'}
            </span>
          </div>
        </div>
      </div>



      {/* Inline Feedback Banner */}
      {msg && (
        <div
          className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 6,
            background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: msg.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <div style={{ fontSize: 13, fontWeight: 500 }}>{msg.text}</div>
        </div>
      )}

      {/* 2. Three Lifecycle Tabs */}
      <div className="tabs" style={{ marginBottom: 16, display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => setActiveTab('quotes')}
          className={`tab-btn ${activeTab === 'quotes' ? 'active' : ''}`}
          style={{
            fontSize: 13,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'quotes' ? '1px solid #2563eb' : '1px solid #e2e8f0',
            background: activeTab === 'quotes' ? '#eff6ff' : '#ffffff',
            color: activeTab === 'quotes' ? '#1d4ed8' : '#64748b',
            boxShadow: activeTab === 'quotes' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <FileText size={15} color={activeTab === 'quotes' ? '#2563eb' : '#64748b'} />
          <span>1. Quotations Received</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 12,
              background: activeTab === 'quotes' ? '#dbeafe' : '#f1f5f9',
              color: activeTab === 'quotes' ? '#1e40af' : '#475569',
            }}
          >
            {submittedQuotes.length} Quotes
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('negotiation')}
          className={`tab-btn ${activeTab === 'negotiation' ? 'active' : ''}`}
          style={{
            fontSize: 13,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'negotiation' ? '1px solid #2563eb' : '1px solid #e2e8f0',
            background: activeTab === 'negotiation' ? '#eff6ff' : '#ffffff',
            color: activeTab === 'negotiation' ? '#1d4ed8' : '#64748b',
            boxShadow: activeTab === 'negotiation' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <MessageSquare size={15} color={activeTab === 'negotiation' ? '#2563eb' : '#64748b'} />
          <span>2. Negotiation</span>
          {rfq.negotiations?.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 12,
                background: activeTab === 'negotiation' ? '#dbeafe' : '#f1f5f9',
                color: activeTab === 'negotiation' ? '#1e40af' : '#475569',
              }}
            >
              Round {rfq.negotiations[0]?.currentRound || 1}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('awarding')}
          className={`tab-btn ${activeTab === 'awarding' ? 'active' : ''}`}
          style={{
            fontSize: 13,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'awarding' ? '1px solid #2563eb' : '1px solid #e2e8f0',
            background: activeTab === 'awarding' ? '#eff6ff' : '#ffffff',
            color: activeTab === 'awarding' ? '#1d4ed8' : '#64748b',
            boxShadow: activeTab === 'awarding' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <Award size={15} color={activeTab === 'awarding' ? '#2563eb' : '#64748b'} />
          <span>3. Awarding & PPO</span>
          {hasPpo ? (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
              PPO Issued
            </span>
          ) : hasApprovedAward ? (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
              Award Approved
            </span>
          ) : rfq.awards?.length > 0 ? (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
              Pending Approval
            </span>
          ) : null}
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: QUOTATIONS RECEIVED REGISTER & SUMMARY                */}
      {/* ============================================================ */}
      {activeTab === 'quotes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {submittedQuotes.length === 0 ? (
            <Card
              title="Quotation Register"
              subtitle="Enterprise log of all vendor quotation submissions and baseline compliance parameters"
            >
              <div style={{ padding: 40, textAlign: 'center' }}>
                <EmptyState
                  icon={<FileText size={40} color="#94a3b8" />}
                  title="No Quotations Received Yet"
                  description="Awaiting submissions from invited vendors for this RFQ package."
                  actionText={isDemoMode ? "Simulate 3 Received Quotes" : "Record Vendor Quote"}
                  onAction={() => {
                    if (isDemoMode) {
                      handleSimulateReceiveAllQuotes();
                    } else {
                      setQuoteVendorId(rfq.invitedVendors?.[0]?.vendorId || '');
                      setShowRecordQuoteModal(true);
                    }
                  }}
                />
                {isDemoMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuoteVendorId(rfq.invitedVendors?.[0]?.vendorId || 'v-demo-001');
                      setShowRecordQuoteModal(true);
                    }}
                    className="btn btn-secondary btn-sm mt-3"
                  >
                    <Plus size={13} style={{ marginRight: 5 }} /> Record Individual Quote Manually
                  </button>
                )}
              </div>
            </Card>
          ) : (
            <>
              {/* 11-Column Enterprise Quotation Register Table */}
              <Card
                title="Enterprise Quotation Register"
                subtitle="Formal commercial register of all submitted vendor quotations and baseline compliance parameters"
                action={
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuoteVendorId(rfq.invitedVendors?.[0]?.vendorId || '');
                        setShowRecordQuoteModal(true);
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <Plus size={13} style={{ marginRight: 5 }} /> Record New Quote
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('negotiation')}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#2563eb' }}
                    >
                      Open Negotiation Workspace <ArrowRight size={13} style={{ marginLeft: 5 }} />
                    </button>
                  </div>
                }
                noPadding
              >
                <div style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1080 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 180 }}>Vendor Name</th>
                        <th style={{ width: 120 }}>Quote Reference</th>
                        <th style={{ width: 110 }}>RFQ Reference</th>
                        <th style={{ width: 140 }}>Quotation Received Date and Time</th>
                        <th style={{ textAlign: 'right', width: 130 }}>Quoted Total Value</th>
                        <th style={{ textAlign: 'center', width: 110 }}>Number of Items Quoted</th>
                        <th style={{ width: 110 }}>Quote Validity</th>
                        <th style={{ width: 140 }}>Commercial Terms Status</th>
                        <th style={{ width: 140 }}>Technical Compliance Status</th>
                        <th style={{ width: 110 }}>Quotation Status</th>
                        <th style={{ textAlign: 'right', width: 100 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submittedQuotes.map((q: any) => {
                        const vendorName =
                          rfq.invitedVendors?.find((iv: any) => iv.vendorId === q.vendorId)?.vendor?.name ||
                          q.vendor?.name ||
                          'Vendor';
                        const totalLines = rfq.lines?.length || 0;
                        const quotedLinesCount = q.lines?.filter((l: any) => l.unitRate > 0).length || q.lines?.length || 0;
                        const rankInfo = quoteRankMap[q.vendorId];
                        const dateFormatted = q.submittedAt
                          ? new Date(q.submittedAt).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recorded';

                        return (
                          <tr key={q.id}>
                            <td>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{vendorName}</div>
                              {rankInfo && (
                                <div style={{ marginTop: 2 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: '1px 6px',
                                      borderRadius: 3,
                                      display: 'inline-block',
                                      background: rankInfo.rankNumber === 1 ? '#dcfce7' : rankInfo.rankNumber === 2 ? '#fef3c7' : '#f1f5f9',
                                      color: rankInfo.rankNumber === 1 ? '#166534' : rankInfo.rankNumber === 2 ? '#92400e' : '#475569',
                                      border: `1px solid ${rankInfo.rankNumber === 1 ? '#bbf7d0' : rankInfo.rankNumber === 2 ? '#fde68a' : '#e2e8f0'}`,
                                    }}
                                  >
                                    {rankInfo.rankLabel}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td>
                              <span className="font-mono" style={{ fontWeight: 600, color: '#1e40af' }}>
                                {q.quoteNumber || 'QTE-REC-001'}
                              </span>
                            </td>
                            <td>
                              <span className="font-mono text-muted">{rfq.rfqNumber}</span>
                            </td>
                            <td style={{ color: '#475569' }}>{dateFormatted}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              ₹ {(q.totalQuoteAmount || 0).toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: quotedLinesCount >= totalLines ? '#f0fdf4' : '#fffbeb',
                                  color: quotedLinesCount >= totalLines ? '#166534' : '#b45309',
                                  border: `1px solid ${quotedLinesCount >= totalLines ? '#bbf7d0' : '#fde68a'}`,
                                }}
                              >
                                {quotedLinesCount} / {totalLines}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: 11, color: '#334155' }}>
                                {q.validityDays ? `${q.validityDays} Days` : '30 Days'}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: 11, color: '#0f172a' }}>
                                {q.commercialTerms || 'FOB Site Delivery'}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  background: '#dcfce7',
                                  color: '#166534',
                                  border: '1px solid #bbf7d0',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Check size={11} /> Compliant
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                }}
                              >
                                {q.status || 'SUBMITTED'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => setViewingQuote(q)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: 11, padding: '3px 8px' }}
                              >
                                <Eye size={12} style={{ marginRight: 4 }} /> View Quote
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Compact Quotation Summary Cards (1 Card per Submitted Quote) */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  Quotation Summary Overview
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                  {submittedQuotes.map((q: any) => {
                    const vendorName =
                      rfq.invitedVendors?.find((iv: any) => iv.vendorId === q.vendorId)?.vendor?.name ||
                      q.vendor?.name ||
                      'Vendor';
                    const totalLines = rfq.lines?.length || 0;
                    const quotedLinesCount = q.lines?.filter((l: any) => l.unitRate > 0).length || q.lines?.length || 0;
                    const rankInfo = quoteRankMap[q.vendorId];
                    const isL1 = rankInfo?.rankNumber === 1;
                    const isL2 = rankInfo?.rankNumber === 2;

                    return (
                      <div
                        key={q.id}
                        className="card"
                        style={{
                          borderRadius: 8,
                          padding: '16px',
                          border: isL1 ? '2px solid #22c55e' : isL2 ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                          background: isL1 ? '#f0fdf4' : '#ffffff',
                          boxShadow: isL1 ? '0 4px 12px rgba(34, 197, 94, 0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{vendorName}</div>
                            <div className="font-mono text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                              {q.quoteNumber}
                            </div>
                          </div>
                          {rankInfo ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: isL1 ? '#dcfce7' : isL2 ? '#fef3c7' : '#f1f5f9',
                                color: isL1 ? '#166534' : isL2 ? '#92400e' : '#475569',
                                border: `1px solid ${isL1 ? '#86efac' : isL2 ? '#fde68a' : '#cbd5e1'}`,
                              }}
                            >
                              {rankInfo.rankLabel}
                            </span>
                          ) : (
                            <span className="badge badge-info" style={{ fontSize: 10 }}>Submitted</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Quoted Total</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                              ₹ {(q.totalQuoteAmount || 0).toLocaleString()}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Item Coverage</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: quotedLinesCount >= totalLines ? '#166534' : '#b45309' }}>
                              {quotedLinesCount} / {totalLines} Items
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            Validity: {q.validityDays || 30} days
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewingQuote(q)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                          >
                            <Eye size={12} style={{ marginRight: 4 }} /> View Quote
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: NEGOTIATION (PRIMARY COMMERCIAL WORKING AREA)         */}
      {/* ============================================================ */}
      {activeTab === 'negotiation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Main Full-Window Commercial Workspace */}
          <ProcurementCommercialWorkspace
            rfq={rfq}
            comparison={comparison}
            rateCardMatch={rateCardMatch}
            isDemoMode={isDemoMode}
            onRecordQuote={() => setShowRecordQuoteModal(true)}
            onOpenRateCards={() => setShowRateCardModal(true)}
            onReleaseRfq={handleReleaseRfq}
            onNegotiationSubmitted={() => {
              fetchRfq();
              fetchComparison();
            }}
            actionLoading={actionLoading}
          />

          {/* Chronological Negotiation History below Commercial Table */}
          <Card
            title="Chronological Negotiation History"
            subtitle="Prior round counteroffers, vendor responses, concessions, and sequential audit trail"
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: '#eff6ff',
                    color: '#1e40af',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  Turn: {rfq.negotiations?.[0]?.rounds?.[0]?.revisedQuoteAmount && rfq.negotiations?.[0]?.rounds?.[0]?.buyerDecision !== 'ACCEPTED' ? 'Buyer Decision Required (Procurement Turn)' : rfq.negotiations?.[0]?.rounds?.[0]?.buyerDecision === 'ACCEPTED' ? 'Rate Agreed / Accepted' : 'Awaiting Vendor Response (Vendor Turn)'}
                </span>
                <button
                  type="button"
                  onClick={() => setRfqChatDrawerOpen(true)}
                  className="btn btn-secondary btn-sm"
                  title="Open persistent RFQ message and query drawer"
                >
                  <MessageSquare size={14} style={{ marginRight: 5 }} /> Clarifications / Chat
                </button>
              </div>
            }
            noPadding
          >
            {!rfq.negotiations?.length ? (
              <div style={{ padding: 32 }}>
                <EmptyState
                  icon={<MessageSquare size={36} color="#94a3b8" strokeWidth={1.5} />}
                  title="No Negotiation Rounds Logged Yet"
                  description="Use the Buyer Target / Counteroffer Rate inputs in the table above to issue counteroffers and start Round 1."
                  actionText="Issue Counteroffer in Table"
                  onAction={() => {}}
                />
              </div>
            ) : (
              <div style={{ padding: 20 }}>
                {rfq.negotiations.map((neg: any) => (
                  <div key={neg.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Active Negotiation Process</span>
                        <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>
                          (Current Round: {neg.currentRound})
                        </span>
                      </div>
                      <span className="badge badge-approved">{neg.status}</span>
                    </div>

                    <div className="table-wrapper">
                      <table className="table enterprise-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Round</th>
                            <th>Vendor</th>
                            <th style={{ textAlign: 'right' }}>Submitted Quote</th>
                            <th style={{ textAlign: 'right' }}>Procurement Counteroffer</th>
                            <th style={{ textAlign: 'right' }}>Vendor Revised Quote</th>
                            <th>Concession / Savings</th>
                            <th>Status & Buyer Decision</th>
                            <th>Date</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {neg.rounds?.map((r: any) => (
                            <tr key={r.id}>
                              <td>
                                <span className="badge badge-submitted font-mono">Round {r.roundNumber}</span>
                                {r.isFinalOffer && (
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', marginTop: 2 }}>
                                    ★ Final Offer
                                  </div>
                                )}
                              </td>
                              <td style={{ fontWeight: 600 }}>{r.vendor?.name}</td>
                              <td style={{ textAlign: 'right' }}>₹ {r.previousQuoteAmount?.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>
                                {r.counterOfferAmount ? `₹ ${r.counterOfferAmount.toLocaleString()}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: r.revisedQuoteAmount ? '#059669' : '#64748b' }}>
                                {r.revisedQuoteAmount ? `₹ ${r.revisedQuoteAmount.toLocaleString()}` : 'Awaiting Vendor Response'}
                              </td>
                              <td>
                                {r.revisedQuoteAmount && r.savingsPercent !== null && r.savingsPercent !== undefined ? (
                                  <span className="badge badge-approved">
                                    {r.savingsPercent}% (₹ {r.savingsAmount?.toLocaleString()})
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>—</span>
                                )}
                              </td>
                              <td>
                                {r.buyerDecision === 'ACCEPTED' ? (
                                  <span className="badge badge-approved" title={r.buyerDecisionRemarks || 'Accepted'}>
                                    <Sparkles size={11} style={{ display: 'inline', marginRight: 3 }} />
                                    Quote Accepted by Buyer — PPO Awaited
                                  </span>
                                ) : r.buyerDecision === 'REJECTED' ? (
                                  <span className="badge badge-rejected" title={r.buyerDecisionRemarks || 'Closed'}>
                                    Quote Not Accepted / Closed
                                  </span>
                                ) : r.isFinalOffer ? (
                                  <span className="badge badge-submitted">
                                    Final Offer Submitted — Pending Buyer Decision
                                  </span>
                                ) : (
                                  <span className="badge badge-info">{r.status}</span>
                                )}
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                  Turn: {r.revisedQuoteAmount && r.buyerDecision !== 'ACCEPTED' ? 'Buyer Decision Needed' : r.buyerDecision === 'ACCEPTED' ? 'Agreed' : 'Vendor Turn'}
                                </div>
                              </td>
                              <td className="text-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                  {r.revisedQuoteAmount && r.buyerDecision !== 'ACCEPTED' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleBuyerDecision(r.id, 'ACCEPTED')}
                                        className="btn btn-primary btn-sm"
                                        style={{ fontSize: 11, background: '#059669', borderColor: '#059669' }}
                                        title="Accept vendor quote — Transitions to Quote Accepted by Buyer — PPO Awaited"
                                      >
                                        <Check size={11} style={{ marginRight: 3 }} /> Accept (PPO Awaited)
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleBuyerDecision(r.id, 'REJECTED')}
                                        className="btn btn-secondary btn-sm"
                                        style={{ fontSize: 11, color: '#b91c1c' }}
                                        title="Decline this commercial offer"
                                      >
                                        Decline
                                      </button>
                                    </>
                                  )}
                                  {r.revisedQuoteAmount && rfq.status !== 'FINAL_RATE_LOCKED' && r.buyerDecision !== 'ACCEPTED' && (
                                    <button
                                      type="button"
                                      onClick={() => handleLockRates(r.vendorId, r.revisedQuoteAmount)}
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: 11 }}
                                    >
                                      Lock Rate
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: AWARDING & PPO WORKSPACE                              */}
      {/* ============================================================ */}
      {activeTab === 'awarding' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* A. Vendor Ranking Leaderboard */}
          <Card
            title="Commercial Vendor Ranking & Evaluation"
            subtitle="Commercial leaderboard comparing final negotiated offers against AI cost baseline and L1"
            noPadding
          >
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Rank</th>
                    <th>Vendor Name</th>
                    <th>Latest Quote Version</th>
                    <th style={{ textAlign: 'right' }}>Latest Quoted Value</th>
                    <th style={{ textAlign: 'center' }}>Total Versions</th>
                    <th>Negotiation Status</th>
                    <th>Technical Eligibility</th>
                    <th style={{ textAlign: 'right' }}>Variance vs L1</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison?.vendors?.map((v: any) => {
                    const l1Amt = comparison.vendors[0]?.totalQuoteAmount || 0;
                    const diffVsL1 = v.totalQuoteAmount - l1Amt;
                    const diffPct = l1Amt > 0 ? Math.round((diffVsL1 / l1Amt) * 1000) / 10 : 0;
                    const isL1 = v.rank === 1;

                    // Vendor quotes
                    const vQuotes = (rfq.quotes || []).filter((q: any) => q.vendorId === v.vendorId);
                    const sortedQuotes = [...vQuotes].sort((a: any, b: any) => b.quoteVersion - a.quoteVersion);
                    const latestQuote = sortedQuotes[0];
                    const latestVersion = latestQuote?.quoteVersion || 1;
                    const quoteCount = vQuotes.length || 1;

                    // Existing PPO for this vendor
                    const existingPpo = (rfq.ppos || []).find((p: any) => p.vendorId === v.vendorId);

                    // Negotiation status
                    const vRounds = (rfq.negotiations || [])
                      .flatMap((n: any) => n.rounds || [])
                      .filter((r: any) => r.vendorId === v.vendorId);
                    const latestOffer = vRounds.length > 0 ? vRounds[vRounds.length - 1] : null;

                    let negStatus = 'Quote Submitted';
                    if (existingPpo) {
                      negStatus = 'Awarded (PPO Active)';
                    } else if (latestOffer?.buyerDecision === 'ACCEPTED') {
                      negStatus = 'Agreed / Accepted';
                    } else if (vRounds.length > 0) {
                      negStatus = `Round ${vRounds.length} Counteroffer`;
                    }

                    return (
                      <tr key={v.vendorId} style={{ background: isL1 ? '#f0fdf4' : 'transparent' }}>
                        <td>
                          <span className={`badge ${isL1 ? 'badge-approved' : 'badge-draft'}`} style={{ fontWeight: 700 }}>
                            {isL1 ? '★ L1' : `L${v.rank}`}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: isL1 ? '#059669' : '#0f172a' }}>{v.vendorName}</td>
                        <td>
                          <span className="badge badge-submitted font-mono">v{latestVersion}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: isL1 ? '#059669' : '#0f172a' }}>
                          ₹ {v.totalQuoteAmount?.toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="text-muted font-medium">{quoteCount} versions</span>
                        </td>
                        <td>
                          <span className="badge badge-draft">{negStatus}</span>
                        </td>
                        <td><span className="badge badge-approved">COMPLIANT</span></td>
                        <td style={{ textAlign: 'right' }}>
                          {isL1 ? (
                            <span className="badge badge-approved">Lowest Offer</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>
                              +₹ {diffVsL1.toLocaleString()} (+{diffPct}%)
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {existingPpo ? (
                            <span className="badge badge-approved" title={`PPO ${existingPpo.ppoNumber} active`}>
                              <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                              {existingPpo.ppoNumber}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenRaisePpoModal({ ...v, latestVersion, quoteCount })}
                              className={`btn btn-sm ${isL1 ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: 11, padding: '4px 10px' }}
                            >
                              <Award size={13} style={{ marginRight: 4 }} />
                              Raise PPO {isL1 ? '(L1)' : ''}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* B. Award Recommendation Workspace */}
          <Card
            title="Commercial Award Recommendation"
            subtitle="Documented recommendation for project and financial sanction"
            action={
              !rfq.awards?.length && (
                <button
                  type="button"
                  onClick={() => setShowAwardModal(true)}
                  className="btn btn-primary btn-sm"
                >
                  <Award size={14} style={{ marginRight: 6 }} /> Prepare Award Recommendation
                </button>
              )
            }
          >
            {!rfq.awards?.length ? (
              <EmptyState
                icon={<Award size={36} color="#94a3b8" strokeWidth={1.5} />}
                title="No Award Recommendation Created"
                description="Recommend L1 vendor (or non-L1 vendor with required justification) to route for financial approval."
                actionText="Prepare Award Recommendation"
                onAction={() => setShowAwardModal(true)}
              />
            ) : (
              <div>
                {rfq.awards.map((a: any) => {
                  const isApproved = a.status === 'APPROVED';

                  return (
                    <div
                      key={a.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: 20,
                        background: '#f8fafc',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: 16,
                          marginBottom: 16,
                        }}
                      >
                        <div>
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Recommended Vendor</div>
                          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2, color: '#0f172a' }}>
                            {a.recommendedVendor?.name}
                          </div>
                        </div>

                        <div>
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Final Award Amount</div>
                          <div style={{ fontWeight: 800, fontSize: 18, color: '#059669', marginTop: 2 }}>
                            ₹ {a.finalNegotiatedAmount?.toLocaleString()}
                          </div>
                        </div>

                        <div>
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Baseline Savings</div>
                          <div style={{ fontWeight: 600, marginTop: 2 }}>
                            ₹ {a.totalSavingsAmount?.toLocaleString()} ({a.savingsPercent}%)
                          </div>
                        </div>

                        <div>
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Approval Status</div>
                          <div style={{ marginTop: 2 }}>
                            <span className={`badge ${isApproved ? 'badge-approved' : 'badge-review'}`}>
                              {a.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 16 }}>
                        <strong>Documented Commercial Justification:</strong> {a.justification}
                        {a.approvalRemarks && (
                          <div style={{ marginTop: 6, color: '#166534', fontWeight: 500 }}>
                            <strong>Approver Remarks:</strong> {a.approvalRemarks}
                          </div>
                        )}
                      </div>

                      {/* Approver Actions & PPO Generation */}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        {!isApproved && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setAwardApprovalAction('APPROVE');
                                setShowApproveAwardModal(true);
                              }}
                              className="btn btn-sm btn-primary"
                            >
                              Approve Recommendation
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAwardApprovalAction('REJECT');
                                setShowApproveAwardModal(true);
                              }}
                              className="btn btn-sm btn-secondary"
                              style={{ color: '#dc2626' }}
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {isApproved && !rfq.ppos?.length && (
                          <button
                            type="button"
                            onClick={() => {
                              setPpoAwardId(a.id);
                              setShowPpoModal(true);
                            }}
                            className="btn btn-sm btn-primary"
                          >
                            <FileCheck size={14} style={{ marginRight: 6 }} /> Generate Purchase Order (PPO) →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* C. PPO Creation and Record */}
          {rfq.ppos?.length > 0 && (
            <Card
              title="Official Purchase Order (PPO)"
              subtitle="Generated order carrying forward approved award lines, agreed rates, and terms"
              noPadding
            >
              <div className="table-wrapper">
                <table className="table enterprise-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>PPO Number</th>
                      <th>Vendor</th>
                      <th style={{ textAlign: 'right' }}>Total Order Value</th>
                      <th>Delivery Terms</th>
                      <th>Payment Terms</th>
                      <th>Status</th>
                      <th>Issued Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.ppos.map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-mono font-bold text-primary">{p.ppoNumber}</td>
                        <td style={{ fontWeight: 600 }}>{p.vendor?.name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                          ₹ {p.totalValue?.toLocaleString()}
                        </td>
                        <td>{p.deliveryTerms}</td>
                        <td>{p.paymentTerms}</td>
                        <td><span className="badge badge-approved">{p.status}</span></td>
                        <td className="text-muted">
                          {p.issuedAt ? new Date(p.issuedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: RECORD / CAPTURE VENDOR QUOTE                       */}
      {/* ============================================================ */}
      {showRecordQuoteModal && (
        <Modal
          isOpen={showRecordQuoteModal}
          onClose={() => setShowRecordQuoteModal(false)}
          title="Record Vendor Quotation"
          maxWidth="max-w-4xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Select Vendor</label>
              <select
                value={quoteVendorId}
                onChange={(e) => {
                  const vid = e.target.value;
                  setQuoteVendorId(vid);
                  if (isDemoMode && vid) {
                    const match = DEMO_QUOTES_DATA.find((dq) => dq.vendorId === vid);
                    if (match) {
                      const ratesMap: Record<string, number> = {};
                      match.rates.forEach((r) => { ratesMap[r.rfqLineId] = r.rate; });
                      setQuoteLineRates(ratesMap);
                      setQuoteCommercialTerms(match.commercialTerms);
                      setQuoteDeliveryDays(String(match.deliveryDays));
                    }
                  }
                }}
                className="input"
              >
                <option value="">-- Select Vendor --</option>
                {rfq.invitedVendors?.map((iv: any) => (
                  <option key={iv.vendorId} value={iv.vendorId}>
                    {iv.vendor?.name} ({iv.vendor?.code})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>UOM</th>
                    <th style={{ width: 140 }}>Quoted Unit Rate (₹)</th>
                    <th style={{ textAlign: 'right' }}>Line Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.lines?.map((l: any) => {
                    const rate = quoteLineRates[l.id] || 0;
                    const total = rate * l.quantity;

                    return (
                      <tr key={l.id}>
                        <td className="font-mono text-muted">{l.lineNumber}</td>
                        <td>{l.description}</td>
                        <td style={{ fontWeight: 600 }}>{l.quantity}</td>
                        <td>{l.uom}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            placeholder="Unit rate"
                            value={quoteLineRates[l.id] || ''}
                            onChange={(e) =>
                              setQuoteLineRates((prev) => ({
                                ...prev,
                                [l.id]: Number(e.target.value),
                              }))
                            }
                            className="input input-sm"
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ₹ {total.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Commercial Terms</label>
                <input
                  type="text"
                  value={quoteCommercialTerms}
                  onChange={(e) => setQuoteCommercialTerms(e.target.value)}
                  className="input input-sm"
                />
              </div>
              <div>
                <label className="label">Delivery Lead Time (Days)</label>
                <input
                  type="number"
                  value={quoteDeliveryDays}
                  onChange={(e) => setQuoteDeliveryDays(e.target.value)}
                  className="input input-sm"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowRecordQuoteModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordQuoteSubmit}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? 'Saving...' : 'Save & Capture Quote'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: ISSUE NEGOTIATION COUNTER-OFFER                     */}
      {/* ============================================================ */}
      {showNegotiationModal && (
        <Modal
          isOpen={showNegotiationModal}
          onClose={() => setShowNegotiationModal(false)}
          title="Issue Negotiation Counter-Offer"
          maxWidth="max-w-2xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Negotiate With Vendor</label>
              <select
                value={negVendorId}
                onChange={(e) => {
                  const vid = e.target.value;
                  setNegVendorId(vid);
                  if (isDemoMode && vid === 'v-demo-001') {
                    setCounterOffer('840000');
                    setNegNotes('Counter-offer seeking 4.5% volume discount for consolidated CC45 retail package.');
                  }
                }}
                className="input"
              >
                <option value="">-- Select Vendor --</option>
                {comparison?.vendors?.map((v: any) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.vendorName} (Current Quote: ₹ {v.totalQuoteAmount?.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Negotiation Scope Level</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="negLevel"
                    checked={negLevel === 'RFQ_LEVEL'}
                    onChange={() => setNegLevel('RFQ_LEVEL')}
                  />
                  <span>Entire RFQ Package Level</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="negLevel"
                    checked={negLevel === 'LINE_LEVEL'}
                    onChange={() => setNegLevel('LINE_LEVEL')}
                  />
                  <span>Individual Line-Item Level</span>
                </label>
              </div>
            </div>

            {negLevel === 'RFQ_LEVEL' ? (
              <div>
                <label className="label">Target Counter-Offer Total Amount (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 1450000"
                  value={counterOffer}
                  onChange={(e) => setCounterOffer(e.target.value)}
                  className="input"
                />
              </div>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Counter Unit Rate (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.lines?.map((l: any) => (
                      <tr key={l.id}>
                        <td className="font-mono">{l.lineNumber}</td>
                        <td>{l.description}</td>
                        <td>{l.quantity}</td>
                        <td>
                          <input
                            type="number"
                            placeholder="Counter rate"
                            value={lineCounterRates[l.id] || ''}
                            onChange={(e) =>
                              setLineCounterRates((prev) => ({
                                ...prev,
                                [l.id]: Number(e.target.value),
                              }))
                            }
                            className="input input-sm"
                            style={{ width: 120 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Response Deadline</label>
                <input
                  type="date"
                  value={negDeadline}
                  onChange={(e) => setNegDeadline(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Negotiation Notes / Concessions</label>
                <input
                  type="text"
                  placeholder="e.g. Volume discount requested"
                  value={negNotes}
                  onChange={(e) => setNegNotes(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowNegotiationModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNegotiationSubmit}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? 'Issuing...' : 'Issue Counter-Offer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: CAPTURE VENDOR REVISED QUOTE                        */}
      {/* ============================================================ */}
      {showRevisedQuoteModal && (
        <Modal
          isOpen={showRevisedQuoteModal}
          onClose={() => setShowRevisedQuoteModal(false)}
          title="Capture Vendor Revised Quotation"
          maxWidth="max-w-lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Select Vendor</label>
              <select
                value={revisedVendorId}
                onChange={(e) => {
                  const vid = e.target.value;
                  setRevisedVendorId(vid);
                  if (isDemoMode && vid === 'v-demo-001') {
                    setRevisedTotalAmount('850000');
                    setRevisedRemarks('Vendor agreed to revised commercial total of ₹8,50,000 conceding ₹30,000 discount.');
                  }
                }}
                className="input"
              >
                {comparison?.vendors?.map((v: any) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.vendorName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Vendor's Final Revised Amount (₹)</label>
              <input
                type="number"
                placeholder="e.g. 1420000"
                value={revisedTotalAmount}
                onChange={(e) => setRevisedTotalAmount(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Revised Commercial Remarks</label>
              <input
                type="text"
                placeholder="e.g. Conceded 5% additional discount on payment term confirmation"
                value={revisedRemarks}
                onChange={(e) => setRevisedRemarks(e.target.value)}
                className="input"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowRevisedQuoteModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevisedQuoteSubmit}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? 'Recording...' : 'Record Revised Quote'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: AWARD RECOMMENDATION (L1 vs Non-L1 Exception)       */}
      {/* ============================================================ */}
      {showAwardModal && (
        <Modal
          isOpen={showAwardModal}
          onClose={() => setShowAwardModal(false)}
          title="Submit Commercial Award Recommendation"
          maxWidth="max-w-2xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Recommended Vendor</label>
              <select
                value={awardVendorId}
                onChange={(e) => setAwardVendorId(e.target.value)}
                className="input"
              >
                {comparison?.vendors?.map((v: any) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.rank === 1 ? '★ [L1 Lowest Offer] ' : `[Rank ${v.rank}] `}
                    {v.vendorName} — ₹ {v.totalQuoteAmount?.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Non-L1 Exception Alert */}
            {awardVendorId !== l1VendorId && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: 14,
                  color: '#991b1b',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                  <ShieldAlert size={16} /> Non-L1 Vendor Selection Exception
                </div>
                <div style={{ marginTop: 4 }}>
                  Selected vendor is not the lowest commercial offer (L1). A documented justification is mandatory
                  and will be audited by Project Approver and Finance.
                </div>
              </div>
            )}

            <div>
              <label className="label">
                Commercial Justification {awardVendorId !== l1VendorId ? '(MANDATORY FOR NON-L1)' : ''}
              </label>
              <textarea
                rows={4}
                placeholder={
                  awardVendorId === l1VendorId
                    ? 'Recommended L1 vendor with complete compliant technical specifications and lowest commercial total.'
                    : 'Provide detailed justification for non-L1 selection (e.g. delivery timeline, technical superior capability, past performance).'
                }
                value={awardJustification}
                onChange={(e) => setAwardJustification(e.target.value)}
                className="input"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowAwardModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAwardSubmit}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? 'Submitting...' : 'Submit Award Recommendation'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================ */}
      {/* MODAL 5: APPROVE / REJECT AWARD RECOMMENDATION               */}
      {/* ============================================================ */}
      {showApproveAwardModal && (
        <Modal
          isOpen={showApproveAwardModal}
          onClose={() => setShowApproveAwardModal(false)}
          title={`${awardApprovalAction === 'APPROVE' ? 'Approve' : 'Reject'} Commercial Award`}
          maxWidth="max-w-md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Approver Remarks</label>
              <textarea
                rows={3}
                placeholder="Enter approval sanction remarks or reason for rejection"
                value={awardApprovalRemarks}
                onChange={(e) => setAwardApprovalRemarks(e.target.value)}
                className="input"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowApproveAwardModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAwardApprovalReview}
                disabled={actionLoading}
                className={`btn ${awardApprovalAction === 'APPROVE' ? 'btn-primary' : 'btn-danger'}`}
              >
                {actionLoading ? 'Processing...' : `Confirm ${awardApprovalAction === 'APPROVE' ? 'Approval' : 'Rejection'}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================ */}
      {/* MODAL 6: GENERATE & ISSUE PPO (PURCHASE ORDER)               */}
      {/* ============================================================ */}
      {showPpoModal && (
        <Modal
          isOpen={showPpoModal}
          onClose={() => setShowPpoModal(false)}
          title="Raise Purchase Order (PPO)"
          maxWidth="max-w-xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 13, border: '1px solid #e2e8f0' }}>
              <div>
                <strong>Selected Vendor:</strong> {ppoTargetVendor?.vendorName || rfq.awards?.[0]?.recommendedVendor?.name || 'Selected Vendor'}
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>Commercial Rank:</strong>
                <span className={`badge ${ppoTargetVendor?.rank === 1 ? 'badge-approved' : 'badge-draft'}`} style={{ fontWeight: 700 }}>
                  {ppoTargetVendor?.rank === 1 ? '★ L1 Lowest Offer' : `L${ppoTargetVendor?.rank || 2} Offer`}
                </span>
                {ppoTargetVendor?.latestVersion && (
                  <span className="badge badge-submitted font-mono">Quote v{ppoTargetVendor.latestVersion}</span>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>Total Order Value:</strong> ₹ {(ppoTargetVendor?.totalQuoteAmount || rfq.awards?.[0]?.finalNegotiatedAmount || 0).toLocaleString()}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>Scope Lines:</strong> {rfq.lines?.length} line items carried forward
              </div>
            </div>

            {ppoTargetVendor && ppoTargetVendor.rank > 1 && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: 12,
                  color: '#991b1b',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                  <ShieldAlert size={15} /> Non-L1 Vendor Award Notice
                </div>
                <div style={{ marginTop: 3 }}>
                  This vendor is ranked L{ppoTargetVendor.rank} (not lowest compliant offer). A documented justification is mandatory before raising the PPO.
                </div>
              </div>
            )}

            <div>
              <label className="label">
                Commercial Award Justification {ppoTargetVendor?.rank > 1 ? '(MANDATORY FOR NON-L1) *' : '(Optional for L1)'}
              </label>
              <textarea
                rows={3}
                placeholder={
                  ppoTargetVendor?.rank === 1
                    ? 'Awarded to L1 lowest compliant bidder following competitive evaluation.'
                    : 'Enter mandatory justification for awarding to non-L1 vendor (e.g. specialized technical capability, delivery timeline, superior SLA)...'
                }
                value={ppoJustification}
                onChange={(e) => setPpoJustification(e.target.value)}
                className="input input-sm"
              />
            </div>

            <div>
              <label className="label">Delivery Terms</label>
              <input
                type="text"
                value={ppoDeliveryTerms}
                onChange={(e) => setPpoDeliveryTerms(e.target.value)}
                className="input input-sm"
              />
            </div>

            <div>
              <label className="label">Payment Terms</label>
              <input
                type="text"
                value={ppoPaymentTerms}
                onChange={(e) => setPpoPaymentTerms(e.target.value)}
                className="input input-sm"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowPpoModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleGeneratePpo(ppoAwardId)}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? 'Generating...' : 'Issue Purchase Order (PPO)'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================ */}
      {/* MODAL 7: RATE CARD SOURCING COMPARISON & DIRECT PPO          */}
      {/* ============================================================ */}
      {showRateCardModal && (
        <Modal
          isOpen={showRateCardModal}
          onClose={() => setShowRateCardModal(false)}
          title="Approved Vendor Rate Card Sourcing Comparison"
          maxWidth="max-w-5xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: '#475569' }}>
              Compare pre-negotiated corporate rate cards against the current RFQ requirements.
              Direct PPO creation is only permitted when the rate card is approved, currently valid,
              and provides complete item coverage.
            </div>

            {!rateCardMatch?.matchedRateCards?.length ? (
              <EmptyState
                icon={<Tag size={36} color="#94a3b8" strokeWidth={1.5} />}
                title="No Applicable Rate Cards"
                description="No approved rate cards found matching the category or line items of this RFQ package."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {rateCardMatch.matchedRateCards.map((rc: any) => (
                  <div
                    key={rc.rateCardId}
                    style={{
                      border: rc.directPpoEligible ? '2px solid #86efac' : '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: 16,
                      background: rc.directPpoEligible ? '#f0fdf4' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="font-mono font-bold text-primary">{rc.rateCardNumber}</span>
                          <span className="badge badge-draft">{rc.category}</span>
                          <span className={`badge ${rc.directPpoEligible ? 'badge-approved' : 'badge-rejected'}`}>
                            {rc.directPpoEligible ? 'Direct PPO Eligible' : 'Direct PPO Blocked'}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>
                          {rc.vendor?.name} — {rc.title}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Rate Card Total</div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: rc.directPpoEligible ? '#059669' : '#0f172a' }}>
                          ₹ {rc.rateCardTotalValue?.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                          Savings: ₹ {rc.totalSavings?.toLocaleString()} ({rc.savingsPercent}%)
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 12, marginBottom: 12 }}>
                      <div>Validity: <strong>{rc.validFrom} to {rc.validTo}</strong></div>
                      <div>Item Coverage: <strong>{rc.matchedItemsCount}/{rc.totalItemsCount} items ({rc.coveragePercent}%)</strong></div>
                      <div>Vendor Qualification: <strong>{rc.vendor?.qualificationStatus || 'QUALIFIED'}</strong></div>
                      <div>Performance Score: <strong>{rc.vendor?.performanceScore || 88}/100</strong></div>
                    </div>

                    {/* Block reasons if ineligible */}
                    {!rc.directPpoEligible && rc.blockReasons?.length > 0 && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
                        <strong>Blocked from Direct PPO:</strong> {rc.blockReasons[0]}
                        <div style={{ marginTop: 2, fontSize: 11 }}>
                          Requirement must be routed through competitive RFQ sourcing.
                        </div>
                      </div>
                    )}

                    {rc.directPpoEligible && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => handleDirectRateCardPpo(rc.rateCardId)}
                          disabled={actionLoading}
                          className="btn btn-sm btn-primary"
                        >
                          <FileCheck size={14} style={{ marginRight: 6 }} /> Create Direct PPO from Rate Card
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* View Quote Modal */}
      {viewingQuote && (
        <Modal
          isOpen={!!viewingQuote}
          onClose={() => setViewingQuote(null)}
          title={`Quotation Details: ${viewingQuote.quoteNumber || 'Vendor Quote'}`}
          maxWidth="max-w-4xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Quote Header Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                padding: '12px 16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div>
                <span className="text-muted">Vendor:</span>{' '}
                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                  {rfq.invitedVendors?.find((iv: any) => iv.vendorId === viewingQuote.vendorId)?.vendor?.name || viewingQuote.vendor?.name || 'Vendor'}
                </div>
              </div>
              <div>
                <span className="text-muted">Quote Reference:</span>{' '}
                <div className="font-mono font-bold text-blue-700">{viewingQuote.quoteNumber}</div>
              </div>
              <div>
                <span className="text-muted">Quoted Total:</span>{' '}
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                  ₹ {(viewingQuote.totalQuoteAmount || 0).toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-muted">Validity:</span>{' '}
                <div style={{ fontWeight: 600 }}>{viewingQuote.validityDays ? `${viewingQuote.validityDays} Days` : '30 Days'}</div>
              </div>
              <div>
                <span className="text-muted">Delivery Lead Time:</span>{' '}
                <div style={{ fontWeight: 600 }}>{viewingQuote.deliveryLeadTimeDays ? `${viewingQuote.deliveryLeadTimeDays} Days` : '30 Days'}</div>
              </div>
              <div>
                <span className="text-muted">Commercial Terms:</span>{' '}
                <div style={{ fontWeight: 500 }}>{viewingQuote.commercialTerms || 'Standard FOB Site'}</div>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                Quoted Line-Item Breakdown
              </div>
              <div className="table-wrapper" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="table enterprise-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>S.No.</th>
                      <th>Item Description / Specification</th>
                      <th style={{ width: 70 }}>UOM</th>
                      <th style={{ textAlign: 'right', width: 80 }}>Qty</th>
                      <th style={{ textAlign: 'right', width: 120 }}>Quoted Rate (₹)</th>
                      <th style={{ textAlign: 'right', width: 130 }}>Line Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.lines?.map((line: any, idx: number) => {
                      const qLine = viewingQuote.lines?.find((ql: any) => ql.rfqLineId === line.id || ql.rfqLineId === line.boqLineId);
                      const unitRate = qLine?.unitRate || 0;
                      const lineTotal = qLine?.lineTotal || (unitRate * (line.quantity || 1));

                      return (
                        <tr key={line.id}>
                          <td style={{ color: '#64748b' }}>{idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{line.itemTitle || line.description}</div>
                            {line.specification && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{line.specification}</div>
                            )}
                          </td>
                          <td style={{ color: '#475569' }}>{line.uom}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{line.quantity?.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: unitRate > 0 ? '#0f172a' : '#94a3b8' }}>
                            {unitRate > 0 ? `₹ ${unitRate.toLocaleString()}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: lineTotal > 0 ? '#0f172a' : '#94a3b8' }}>
                            {lineTotal > 0 ? `₹ ${lineTotal.toLocaleString()}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                      <td colSpan={5} style={{ textAlign: 'right' }}>Total Quoted Value:</td>
                      <td style={{ textAlign: 'right', color: '#1e40af', fontSize: 13 }}>
                        ₹ {(viewingQuote.totalQuoteAmount || 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setViewingQuote(null)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Specification Preview Modal */}
      {previewSpec && (
        <Modal
          isOpen={!!previewSpec}
          onClose={() => setPreviewSpec(null)}
          title={previewSpec.title}
          maxWidth="max-w-lg"
        >
          <div style={{ padding: 14, background: '#f8fafc', borderRadius: 6, fontSize: 13, color: '#334155' }}>
            <h5 style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>Full Technical Specification</h5>
            <p style={{ lineHeight: 1.6 }}>{previewSpec.spec || 'Standard commercial specification'}</p>
          </div>
        </Modal>
      )}

      {/* Persistent RFQ Clarification & Query Drawer */}
      {rfqChatDrawerOpen && rfq && (
        <RfqChatDrawer
          isOpen={rfqChatDrawerOpen}
          onClose={() => setRfqChatDrawerOpen(false)}
          rfqId={rfq.id}
          rfqNumber={rfq.rfqNumber}
          title={rfq.title}
          isVendorUser={false}
        />
      )}
    </div>
  );
}
