'use client';
// app/(app)/procurement/rfqs/[id]/page.tsx
// proCPX Consolidated Procurement Workspace: RFQ -> Negotiation -> Awarding -> PPO
import { useEffect, useState, useMemo, use, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import SpecificationCell from '@/components/ui/SpecificationCell';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
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
  FileSpreadsheet,
  Gavel,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  getInitialDemoRfq,
  getDemoComparison,
  getDemoRateCards,
  buildDemoQuotes,
  DEMO_QUOTES_DATA,
} from '@/lib/procurement-demo-data';
import RfqChatDrawer from '@/components/RfqChatDrawer';
import ProcurementCommercialWorkspace from '@/components/ProcurementCommercialWorkspace';

function RfqDetailContent({ params }: { params: Promise<{ id: string }> }) {
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

  // Modals state

  // 1. Record Quote Modal
  const [showRecordQuoteModal, setShowRecordQuoteModal] = useState(false);
  const [quoteVendorId, setQuoteVendorId] = useState('');
  const [quoteLineRates, setQuoteLineRates] = useState<Record<string, number>>({});
  const [quoteCommercialTerms, setQuoteCommercialTerms] = useState('Payment net 30 days, FOB site delivery');
  const [quoteDeliveryDays, setQuoteDeliveryDays] = useState('30');
  const [quoteValidityDays, setQuoteValidityDays] = useState('60');

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

  useEffect(() => {
    if (isDemoMode) {
      // By default start with zero quotes as required by demonstration specs
      const startZero = searchParams.get('zero') !== 'false';
      const demoData = getInitialDemoRfq(startZero);
      setRfq(demoData);
      setComparison(getDemoComparison(demoData));
      setRateCardMatch(getDemoRateCards());
      setAwardVendorId('v-demo-001');
      setQuoteVendorId('v-demo-001');
      setLoading(false);
      setLoadingCompare(false);
      setLoadingRateCard(false);
      return;
    }
    fetchRfq();
    fetchComparison();
    fetchRateCardMatch();
  }, [id, isDemoMode, searchParams]);

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
          setQuoteVendorId(data.rfq.quotes[0].vendorId);
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

  const [rfqChatDrawerOpen, setRfqChatDrawerOpen] = useState(false);

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
      {/* 1. RFQ Header with Metadata & Compact Cards */}
      <div
        className="card mb-3"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '12px 18px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        {/* Top Line: RFQ Ref, Title, Status & Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="font-mono font-bold"
              style={{
                fontSize: 12,
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '3px 12px',
                borderRadius: 9999,
              }}
            >
              {rfq.rfqNumber}
            </span>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              {rfq.title}
            </h1>
            <StatusBadge status={rfq.status} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {rfq.status === 'DRAFT' && (
              <button
                type="button"
                onClick={handleReleaseRfq}
                disabled={actionLoading || !rfq.invitedVendors?.length}
                className="btn btn-primary btn-sm"
                style={{ fontSize: 12 }}
              >
                <Send size={13} style={{ marginRight: 5 }} /> Release RFQ
              </button>
            )}
            <button
              type="button"
              onClick={() => setRfqChatDrawerOpen(true)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12 }}
              title="Open persistent RFQ message and query drawer"
            >
              <MessageSquare size={13} style={{ marginRight: 5 }} /> Clarifications / Chat
            </button>
          </div>
        </div>

        {/* Compact Metadata Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            paddingTop: 10,
            borderTop: '1px solid #f1f5f9',
          }}
        >
          {/* Project */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #2563eb', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <FileText size={18} color="#2563eb" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>Project</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }} title={rfq.project?.name}>
                {rfq.project?.name || 'Project'}
              </div>
            </div>
          </div>

          {/* Category */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #0d9488', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <Layers size={18} color="#0d9488" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>Category</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }} title={rfq.category?.name || rfq.packageName}>
                {rfq.category?.name || rfq.categoryName || rfq.packageName || 'Civil & Commercial'}
              </div>
            </div>
          </div>

          {/* RFQ Date */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ea580c', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <Calendar size={18} color="#ea580c" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>RFQ Date</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                {rfq.createdAt && !isNaN(new Date(rfq.createdAt).getTime())
                  ? new Date(rfq.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '13 Oct 2026'}
              </div>
            </div>
          </div>

          {/* Total Line Items */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #123B7A', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <FileSpreadsheet size={18} color="#123B7A" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>Total Line Items</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>
                {rfq.lines?.length || 0}
              </div>
            </div>
          </div>

          {/* Vendors Invited */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #2563eb', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <Users size={18} color="#2563eb" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>Vendors Invited</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>
                {rfq.invitedVendors?.length || 0}
              </div>
            </div>
          </div>

          {/* Quotes Received */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #0d9488', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <FileCheck size={18} color="#0d9488" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>Quotes Received</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', fontFamily: 'monospace', marginTop: 2 }}>
                {submittedQuotes.length}
              </div>
            </div>
          </div>

          {/* Negotiation Round */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ea580c', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <MessageSquare size={18} color="#ea580c" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>Negotiation Round</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                {rfq.negotiations?.[0]?.currentRound ? `Round ${rfq.negotiations[0].currentRound}` : 'Round 1'}
              </div>
            </div>
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
            fontWeight: activeTab === 'quotes' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'quotes' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
            background: '#ffffff',
            color: activeTab === 'quotes' ? '#0f172a' : '#475569',
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
            fontWeight: activeTab === 'negotiation' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'negotiation' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
            background: '#ffffff',
            color: activeTab === 'negotiation' ? '#0f172a' : '#475569',
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
            fontWeight: activeTab === 'awarding' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'awarding' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
            background: '#ffffff',
            color: activeTab === 'awarding' ? '#0f172a' : '#475569',
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
            <Card
              title={
                <h2
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: '#0f172a',
                    letterSpacing: '-0.3px',
                    margin: 0,
                    lineHeight: 1.25,
                  }}
                >
                  Enterprise Quotation Register
                </h2>
              }
              subtitle="Formal commercial register of all submitted vendor quotations and baseline compliance parameters"
              action={
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuoteVendorId(rfq.invitedVendors?.[0]?.vendorId || '');
                      setShowRecordQuoteModal(true);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{
                      background: '#ffffff',
                      borderColor: '#cbd5e1',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Plus size={13} /> Record New Quote
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('negotiation')}
                    className="btn btn-secondary btn-sm"
                    style={{
                      background: '#ffffff',
                      borderColor: '#cbd5e1',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    Open Negotiation Workspace <ArrowRight size={13} />
                  </button>
                  <Link
                    href={`/procurement/auctions?create=true&rfqId=${rfq.id}`}
                    className="btn btn-primary btn-sm"
                    style={{
                      fontWeight: 600,
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Gavel size={13} /> Initiate E-Auction
                  </Link>
                </div>
              }
              noPadding
            >
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table
                  className="table enterprise-table"
                  style={{
                    width: '100%',
                    minWidth: 1540,
                    borderCollapse: 'collapse',
                    margin: 0,
                  }}
                >
                  <thead>
                    <tr style={{ height: 44 }}>
                      <th style={{ width: 220, minWidth: 200, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Vendor Name
                      </th>
                      <th style={{ width: 140, minWidth: 130, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Quote Reference
                      </th>
                      <th style={{ width: 130, minWidth: 120, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        RFQ Reference
                      </th>
                      <th style={{ width: 170, minWidth: 160, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Quotation Received Date and Time
                      </th>
                      <th style={{ width: 150, minWidth: 140, textAlign: 'right', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Quoted Total Value
                      </th>
                      <th style={{ width: 120, minWidth: 110, textAlign: 'center', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Number of Items Quoted
                      </th>
                      <th style={{ width: 120, minWidth: 110, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Quote Validity
                      </th>
                      <th style={{ width: 180, minWidth: 160, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Commercial Terms Status
                      </th>
                      <th style={{ width: 150, minWidth: 140, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Technical Compliance Status
                      </th>
                      <th style={{ width: 130, minWidth: 120, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Quotation Status
                      </th>
                      <th style={{ width: 120, minWidth: 110, textAlign: 'center', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        Actions
                      </th>
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
                        <tr key={q.id} style={{ height: 48 }}>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{vendorName}</div>
                            {rankInfo && (
                              <div style={{ marginTop: 3 }}>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    display: 'inline-block',
                                    background: rankInfo.rankNumber === 1 ? '#dcfce7' : rankInfo.rankNumber === 2 ? '#fef3c7' : '#f1f5f9',
                                    color: rankInfo.rankNumber === 1 ? '#166534' : rankInfo.rankNumber === 2 ? '#92400e' : '#475569',
                                    border: `1px solid ${rankInfo.rankNumber === 1 ? '#bbf7d0' : rankInfo.rankNumber === 2 ? '#fde68a' : '#cbd5e1'}`,
                                  }}
                                >
                                  {rankInfo.rankLabel}
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px' }}>
                            <span className="font-mono" style={{ fontWeight: 600, color: '#1e40af', fontSize: 13 }}>
                              {q.quoteNumber || 'QTE-REC-001'}
                            </span>
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px' }}>
                            <span className="font-mono text-muted" style={{ fontSize: 12 }}>{rfq.rfqNumber}</span>
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#475569', fontSize: 12 }}>
                            {dateFormatted}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                            ₹ {(q.totalQuoteAmount || 0).toLocaleString()}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', textAlign: 'center', color: '#1e293b', fontWeight: 600, fontSize: 13 }}>
                            {quotedLinesCount} / {totalLines}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#334155', fontSize: 13 }}>
                            {q.validityDays ? `${q.validityDays} Days` : '30 Days'}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#0f172a', fontSize: 12 }}>
                            {q.commercialTerms || 'FOB Site Delivery'}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#0f172a', fontSize: 13, fontWeight: 500 }}>
                            Compliant
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                display: 'inline-block',
                              }}
                            >
                              {q.status || 'SUBMITTED'}
                            </span>
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setViewingQuote(q)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: 12,
                                padding: '4px 10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                              }}
                            >
                              <Eye size={13} /> View Quote
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
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
              <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1450, width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 70, minWidth: 70, border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Rank</th>
                    <th style={{ minWidth: 170, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Vendor Name</th>
                    <th style={{ minWidth: 140, textAlign: 'right', border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Latest Quoted Value</th>
                    <th style={{ minWidth: 100, textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Total Versions</th>
                    <th style={{ minWidth: 140, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Negotiation Status</th>
                    <th style={{ minWidth: 125, textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Technical Eligibility</th>
                    <th style={{ minWidth: 140, textAlign: 'right', border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Variance vs L1</th>
                    <th style={{ minWidth: 160, maxWidth: 210, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Delivery Schedule</th>
                    <th style={{ minWidth: 175, maxWidth: 230, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Payment Terms</th>
                    <th style={{ minWidth: 160, maxWidth: 210, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Warranty Period</th>
                    <th style={{ minWidth: 125, textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>Action</th>
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

                    // Commercial terms resolution from latest applicable submitted quote or negotiated terms
                    const deliveryScheduleVal =
                      latestQuote?.deliverySchedule ||
                      (latestQuote?.deliveryLeadTimeDays != null
                        ? typeof latestQuote.deliveryLeadTimeDays === 'number'
                          ? `${latestQuote.deliveryLeadTimeDays} Days`
                          : latestQuote.deliveryLeadTimeDays
                        : null) ||
                      (latestQuote?.deliveryDays != null
                        ? typeof latestQuote.deliveryDays === 'number'
                          ? `${latestQuote.deliveryDays} Days`
                          : latestQuote.deliveryDays
                        : null) ||
                      v.deliverySchedule ||
                      (v.deliveryLeadTimeDays != null
                        ? typeof v.deliveryLeadTimeDays === 'number'
                          ? `${v.deliveryLeadTimeDays} Days`
                          : v.deliveryLeadTimeDays
                        : null) ||
                      (v.deliveryDays != null
                        ? typeof v.deliveryDays === 'number'
                          ? `${v.deliveryDays} Days`
                          : v.deliveryDays
                        : null) ||
                      null;

                    const paymentTermsVal =
                      latestQuote?.paymentTerms ||
                      latestQuote?.paymentTermsOffered ||
                      v.paymentTerms ||
                      v.paymentTermsOffered ||
                      null;

                    const warrantyVal =
                      latestQuote?.warrantyPeriod ||
                      latestQuote?.warranty ||
                      latestQuote?.warrantyTerms ||
                      v.warrantyPeriod ||
                      v.warranty ||
                      v.warrantyTerms ||
                      null;

                    return (
                      <tr key={v.vendorId} style={{ background: '#ffffff' }}>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 10px', verticalAlign: 'middle', background: '#ffffff' }}>
                          <span className={`badge ${isL1 ? 'badge-approved' : 'badge-draft'}`} style={{ fontWeight: 700 }}>
                            {isL1 ? '★ L1' : `L${v.rank}`}
                          </span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', fontWeight: 600, color: isL1 ? '#059669' : '#0f172a', background: '#ffffff' }}>
                          {v.vendorName}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right', fontWeight: 700, color: isL1 ? '#059669' : '#0f172a', background: '#ffffff' }}>
                          ₹ {v.totalQuoteAmount?.toLocaleString()}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center', background: '#ffffff' }}>
                          <span className="text-muted font-medium">{quoteCount} versions</span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', background: '#ffffff' }}>
                          <span className="badge badge-draft">{negStatus}</span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center', background: '#ffffff' }}>
                          <span className="badge badge-approved">COMPLIANT</span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right', background: '#ffffff' }}>
                          {isL1 ? (
                            <span className="badge badge-approved">Lowest Offer</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>
                              +₹ {diffVsL1.toLocaleString()} (+{diffPct}%)
                            </span>
                          )}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '6px 10px', verticalAlign: 'middle', maxWidth: 210, background: '#ffffff' }}>
                          <BoqDescriptionCell
                            text={deliveryScheduleVal}
                            title="Delivery Schedule"
                            contextLabel={v.vendorName}
                            emptyPlaceholder="Not specified"
                            maxWidth={200}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '6px 10px', verticalAlign: 'middle', maxWidth: 230, background: '#ffffff' }}>
                          <BoqDescriptionCell
                            text={paymentTermsVal}
                            title="Payment Terms"
                            contextLabel={v.vendorName}
                            emptyPlaceholder="Not specified"
                            maxWidth={220}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '6px 10px', verticalAlign: 'middle', maxWidth: 210, background: '#ffffff' }}>
                          <BoqDescriptionCell
                            text={warrantyVal}
                            title="Warranty Period"
                            contextLabel={v.vendorName}
                            emptyPlaceholder="Not specified"
                            maxWidth={200}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center', background: '#ffffff' }}>
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
                    <th>S.No.</th>
                    <th>Item Description</th>
                    <th>Quantity</th>
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
                      <th>Item Description</th>
                      <th style={{ width: 70 }}>UOM</th>
                      <th style={{ textAlign: 'right', width: 80 }}>Quantity</th>
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

export default function RfqDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Loading RFQ Workspace...</div>
        </div>
      }
    >
      <RfqDetailContent {...props} />
    </Suspense>
  );
}
