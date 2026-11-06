'use client';
// app/(app)/procurement/rfqs/[id]/page.tsx
// proCPX Consolidated Procurement Workspace: RFQ -> Negotiation -> Awarding -> PPO
import { useEffect, useState, useMemo, use, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { I18N_CONFIG } from '@/lib/i18n.constants';
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
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { RateCardMatchResponse } from '@app-types/app/(app)/procurement/rfqs/[id]/page.types';


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
  const negotiationHistoryRequestedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState<any>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Rate card comparison state
  const [rateCardMatch, setRateCardMatch] = useState<RateCardMatchResponse | null>(null);
  const [loadingRateCard, setLoadingRateCard] = useState(false);
  const [loadingMoreRateCardMatches, setLoadingMoreRateCardMatches] = useState(false);
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
    negotiationHistoryRequestedRef.current = activeTab !== 'quotes';
    fetchRfq(activeTab !== 'quotes');
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
    setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.quotationSuccessfullyRecordedDemonstrationMode, type: 'success' });
    toast.success({
      title: UI_STRINGS.appAppProcurementRfqsIdPage.dEMOVendorQuotationsRecorded,
      message: UI_STRINGS.appAppProcurementRfqsIdPage.quotationSuccessfullyRecordedForAll3EligibleVendors,
      recordNumber: 'QTE-ACME-001',
      nextStage: UI_STRINGS.common.userMessages.quotationComparisonAiBenchmark,
    });
  };

  const fetchRfq = async (
    includeNegotiationHistory = negotiationHistoryRequestedRef.current,
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true);
    try {
      const historyQuery = includeNegotiationHistory ? '?includeNegotiationHistory=true' : '';
      const res = await fetch(`/api/procurement/rfqs/${id}${historyQuery}`);
      const data = await res.json();
      if (data.rfq) {
        if (includeNegotiationHistory) {
          negotiationHistoryRequestedRef.current = true;
        }
        setRfq(data.rfq);
        if (data.rfq.quotes?.length > 0 && !awardVendorId) {
          setAwardVendorId(data.rfq.quotes[0].vendorId);
          setQuoteVendorId(data.rfq.quotes[0].vendorId);
        }
      } else if (includeNegotiationHistory) {
        negotiationHistoryRequestedRef.current = false;
      }
    } catch (err) {
      if (includeNegotiationHistory) negotiationHistoryRequestedRef.current = false;
      console.error('Failed to load RFQ:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const changeActiveTab = (tab: 'quotes' | 'negotiation' | 'awarding') => {
    setActiveTab(tab);
    if (tab !== 'quotes' && !negotiationHistoryRequestedRef.current && !isDemoMode) {
      negotiationHistoryRequestedRef.current = true;
      void fetchRfq(true, false);
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

  const fetchRateCardMatch = async (page = 1, append = false) => {
    if (append) setLoadingMoreRateCardMatches(true);
    else setLoadingRateCard(true);
    try {
      const query = new URLSearchParams({ rfqId: id, page: String(page) });
      const res = await fetch(`/api/procurement/rate-cards/match?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToMatchRateCards);
      const responseData = data as RateCardMatchResponse;
      setRateCardMatch((current) => {
        if (!append || !current) return responseData;
        const existing = new Set((current.matchedRateCards || []).map((card) => card.rateCardId));
        return {
          ...responseData,
          matchedRateCards: [
            ...(current.matchedRateCards || []),
            ...(responseData.matchedRateCards || []).filter((card) => !existing.has(card.rateCardId)),
          ],
          eligibleCount: Number(current.eligibleCount || 0) + Number(responseData.eligibleCount || 0),
        };
      });
    } catch (err) {
      console.error('Failed to load rate card matches:', err);
      setMsg({
        text: err instanceof Error ? err.message : UI_STRINGS.common.userMessages.failedToMatchRateCards,
        type: 'error',
      });
    } finally {
      if (append) setLoadingMoreRateCardMatches(false);
      else setLoadingRateCard(false);
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
      setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.rFQIssuedSuccessfullyDemonstrationMode, type: 'success' });
      toast.success(
        UI_STRINGS.appAppProcurementRfqsIdPage.rFQIssuedSuccessfully,
        rfq.rfqNumber,
        UI_STRINGS.common.userMessages.awaitingQuotations
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
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToReleaseRfq }));
      setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.rFQIssuedSuccessfully, type: 'success' });
      toast.success(
        UI_STRINGS.appAppProcurementRfqsIdPage.rFQIssuedSuccessfully,
        rfq.rfqNumber,
        UI_STRINGS.common.userMessages.awaitingQuotations
      );
      fetchRfq();
      fetchComparison();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.failedToReleaseRFQ,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anErrorOccurredWhileReleasingTheRfq }),
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
      toast.error({ title: UI_STRINGS.appAppProcurementRfqsIdPage.validationError, message: UI_STRINGS.appAppProcurementRfqsIdPage.pleaseSelectAVendor });
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
      setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.quotationSuccessfullyRecordedDemonstrationMode, type: 'success' });
      toast.success({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.dEMOQuotationRecorded,
        message: UI_STRINGS.appAppProcurementRfqsIdPage.quotationSuccessfullyRecorded,
        recordNumber: quoteNumber,
        vendorName,
        nextStage: UI_STRINGS.common.userMessages.quotationComparisonAiBenchmark,
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
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToCaptureVendorQuote }));
      setShowRecordQuoteModal(false);
      setMsg({ text: interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.quotationSuccessfullyRecordedQuoteNumber, { "quoteNumber": data.quote.quoteNumber }), type: 'success' });
      toast.success({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.vendorQuotationRecorded,
        message: interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.quotationSuccessfullyRecordedQuotationQuoteNumberRecordedForVendorNameTotalToLocaleString, { "quoteNumber": data.quote.quoteNumber, "vendorName": vendorName, "toLocaleString": (data.quote.totalQuoteAmount || 0).toLocaleString() }),
        recordNumber: data.quote.quoteNumber,
        vendorName,
        nextStage: UI_STRINGS.common.userMessages.quoteComparisonAiBenchmark,
      });
      fetchRfq();
      fetchComparison();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.quotationRecordingFailed,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToRecordVendorQuotation }),
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
      toast.error({ title: UI_STRINGS.appAppProcurementRfqsIdPage.validationError, message: UI_STRINGS.appAppProcurementRfqsIdPage.pleaseSelectAVendor });
      return;
    }

    const isL1 = comparison?.summary?.lowestVendorId === awardVendorId;
    if (!isL1 && !awardJustification.trim()) {
      toast.error({ title: UI_STRINGS.appAppProcurementRfqsIdPage.justificationRequired, message: UI_STRINGS.appAppProcurementRfqsIdPage.documentedJustificationIsMandatoryWhenRecommendingANonL1Vendor });
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
      setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.pPOSubmittedSuccessfullyForApprovalDemonstrationMode, type: 'success' });
      toast.success(
        UI_STRINGS.appAppProcurementRfqsIdPage.pPOSubmittedSuccessfullyForApproval,
        rfq.rfqNumber,
        UI_STRINGS.common.userMessages.pendingFinanceSignOff
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
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToSubmitAwardRecommendation }));
      setShowAwardModal(false);
      setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.pPOSubmittedSuccessfullyForApproval, type: 'success' });
      toast.success(
        UI_STRINGS.appAppProcurementRfqsIdPage.pPOSubmittedSuccessfullyForApproval,
        rfq.rfqNumber,
        UI_STRINGS.common.userMessages.pendingFinanceSignOff
      );
      fetchRfq();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.awardSubmissionFailed,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anErrorOccurredWhileSubmittingTheAwardRecommendation }),
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
    const successApprovalMsg = isFinance
      ? UI_STRINGS.appAppProcurementRfqsIdPage.pPOApprovedSuccessfullyByFinance
      : UI_STRINGS.appAppProcurementRfqsIdPage.pPOApprovedSuccessfully;

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
        isApproved ? successApprovalMsg : UI_STRINGS.common.userMessages.awardRecommendationRejected,
        rfq.rfqNumber,
        isApproved ? UI_STRINGS.common.userMessages.readyForPpoIssuance : UI_STRINGS.common.userMessages.commercialReview
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
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToReviewAwardRecommendation }));
      setShowApproveAwardModal(false);
      const successText = isApproved ? successApprovalMsg : 'Award recommendation rejected.';
      setMsg({ text: successText, type: isApproved ? 'success' : 'error' });
      toast.success(
        isApproved ? successApprovalMsg : UI_STRINGS.common.userMessages.awardRecommendationRejected,
        rfq.rfqNumber,
        isApproved ? UI_STRINGS.common.userMessages.readyForPpoIssuance : UI_STRINGS.common.userMessages.commercialReview
      );
      fetchRfq();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.approvalReviewFailed,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anErrorOccurredWhileReviewingTheAward }),
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
        title: UI_STRINGS.appAppProcurementRfqsIdPage.duplicatePrevented,
        message: interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.purchaseOrderPpoNumberAlreadyExistsForVendorNameOnThisRFQ, { "ppoNumber": existingPpo.ppoNumber, "vendorName": vendorName }),
        recordNumber: existingPpo.ppoNumber,
      });
      return;
    }

    // Enforce justification if vendor is not L1
    if (!isL1 && (!ppoJustification || !ppoJustification.trim())) {
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.justificationRequired,
        message: UI_STRINGS.appAppProcurementRfqsIdPage.documentedJustificationIsMandatoryWhenRaisingPPOForANonL1Vendor,
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
      setMsg({ text: interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreatedPpoNumberDemonstrationMode, { "ppoNumber": ppoNumber }), type: 'success' });
      toast.success({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.dEMOPurchaseOrderIssued,
        message: UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreated,
        recordNumber: ppoNumber,
        vendorName,
        nextStage: UI_STRINGS.common.userMessages.ppoIssuedContractActive,
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
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToGeneratePpo }));
      setShowPpoModal(false);
      setMsg({ text: interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreatedPpoNumber, { "ppoNumber": data.ppo.ppoNumber }), type: 'success' });
      toast.success({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.purchaseOrderPPOIssued,
        message: interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreatedPurchaseOrderPpoNumberGeneratedForVendorNameContractActive, { "ppoNumber": data.ppo.ppoNumber, "vendorName": vendorName }),
        recordNumber: data.ppo.ppoNumber,
        vendorName,
        nextStage: UI_STRINGS.common.userMessages.ppoIssuedContractActive,
        link: '/procurement/ppos',
      });
      fetchRfq();
      fetchComparison();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.pPOGenerationFailed,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anErrorOccurredWhileIssuingThePurchaseOrder }),
        recordNumber: rfq?.rfqNumber,
        vendorName,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Direct PPO from Rate Card
  const handleDirectRateCardPpo = async (rateCardId: string) => {
    if (!confirm(UI_STRINGS.appAppProcurementRfqsIdPage.createDirectPurchaseOrderPPOFromThisApprovedRateCard)) return;

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
      setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreatedDemonstrationModeRateCardSourcing, type: 'success' });
      toast.success({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.dEMODirectPPOIssued,
        message: UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreated,
        recordNumber: ppoNumber,
        vendorName: 'Acme Infra Solutions Pvt Ltd',
        nextStage: UI_STRINGS.common.userMessages.ppoIssuedContractActive,
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
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToIssueDirectPpoFromRateCard }));
      setShowRateCardModal(false);
      setMsg({ text: UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreated, type: 'success' });
      toast.success({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.directPPOCreatedFromRateCard,
        message: interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.pPOSuccessfullyCreatedPurchaseOrderPpoNumberIssuedViaPreApprovedRateCard, { "ppoNumber": data.ppo.ppoNumber }),
        recordNumber: data.ppo.ppoNumber,
        nextStage: UI_STRINGS.common.userMessages.ppoIssuedContractActive,
        link: '/procurement/ppos',
      });
      fetchRfq();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsIdPage.directPPOFailed,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anErrorOccurredWhileCreatingDirectPpoFromRateCard }),
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
          <div className="spinner" />{UI_STRINGS.appAppProcurementRfqsIdPage.loadingProcurementWorkspace}</div>
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="page-content">
        <div className="alert alert-error">{UI_STRINGS.appAppProcurementRfqsIdPage.rFQNotFoundOrAccessDenied}</div>
        <Link href="/procurement/rfqs" className="btn btn-secondary mt-4">{UI_STRINGS.appAppProcurementRfqsIdPage.backToRFQsRegister}</Link>
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
                <Send size={13} style={{ marginRight: 5 }} />{UI_STRINGS.appAppProcurementRfqsIdPage.releaseRFQ}</button>
            )}
            <button
              type="button"
              onClick={() => setRfqChatDrawerOpen(true)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12 }}
              title={UI_STRINGS.appAppProcurementRfqsIdPage.openPersistentRFQMessageAndQueryDrawer}
            >
              <MessageSquare size={13} style={{ marginRight: 5 }} />{UI_STRINGS.appAppProcurementRfqsIdPage.clarificationsChat}</button>
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
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.common.project}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }} title={rfq.project?.name}>
                {rfq.project?.name || UI_STRINGS.common.project}
              </div>
            </div>
          </div>

          {/* Category */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #0d9488', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <Layers size={18} color="#0d9488" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.common.category2}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }} title={interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.category?.name || rfq.packageName })}>
                {rfq.category?.name || rfq.categoryName || rfq.packageName || UI_STRINGS.appAppProcurementRfqsIdPage.civilCommercial}
              </div>
            </div>
          </div>

          {/* RFQ Date */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ea580c', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <Calendar size={18} color="#ea580c" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.rFQDate}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                {rfq.createdAt && !isNaN(new Date(rfq.createdAt).getTime())
                  ? new Date(rfq.createdAt).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
                  : UI_STRINGS.appAppProcurementRfqsIdPage.copyqwrkgb}
              </div>
            </div>
          </div>

          {/* Total Line Items */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #123B7A', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <FileSpreadsheet size={18} color="#123B7A" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.common.totalLineItems}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>
                {rfq.lines?.length || 0}
              </div>
            </div>
          </div>

          {/* Vendors Invited */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #2563eb', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <Users size={18} color="#2563eb" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.vendorsInvited}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>
                {rfq.invitedVendors?.length || 0}
              </div>
            </div>
          </div>

          {/* Quotes Received */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #0d9488', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <FileCheck size={18} color="#0d9488" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quotesReceived}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', fontFamily: 'monospace', marginTop: 2 }}>
                {submittedQuotes.length}
              </div>
            </div>
          </div>

          {/* Negotiation Round */}
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ea580c', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <MessageSquare size={18} color="#ea580c" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.negotiationRound}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                {rfq.negotiations?.[0]?.currentRound ? interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.roundCurrentRound, { "currentRound": rfq.negotiations[0].currentRound }) : UI_STRINGS.appAppProcurementRfqsIdPage.round1}
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
          onClick={() => changeActiveTab('quotes')}
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
          <span>{UI_STRINGS.appAppProcurementRfqsIdPage.copy1v8aisw}</span>
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
            {submittedQuotes.length}{UI_STRINGS.appAppProcurementRfqsIdPage.quotes}</span>
        </button>

        <button
          type="button"
          onClick={() => changeActiveTab('negotiation')}
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
          <span>{UI_STRINGS.appAppProcurementRfqsIdPage.copylkr9nk}</span>
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
            >{UI_STRINGS.common.round}{rfq.negotiations[0]?.currentRound || 1}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => changeActiveTab('awarding')}
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
          <span>{UI_STRINGS.appAppProcurementRfqsIdPage.copyfg2yyg}</span>
          {hasPpo ? (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.pPOIssued}</span>
          ) : hasApprovedAward ? (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.awardApproved}</span>
          ) : rfq.awards?.length > 0 ? (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>{UI_STRINGS.common.pendingApproval}</span>
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
              title={UI_STRINGS.appAppProcurementRfqsIdPage.quotationRegister}
              subtitle={UI_STRINGS.appAppProcurementRfqsIdPage.enterpriseLogOfAllVendorQuotationSubmissionsAndBaselineComplianceParameters}
            >
              <div style={{ padding: 40, textAlign: 'center' }}>
                <EmptyState
                  icon={<FileText size={40} color="#94a3b8" />}
                  title={UI_STRINGS.appAppProcurementRfqsIdPage.noQuotationsReceivedYet}
                  description={UI_STRINGS.appAppProcurementRfqsIdPage.awaitingSubmissionsFromInvitedVendorsForThisRFQPackage}
                  actionText={isDemoMode ? UI_STRINGS.appAppProcurementRfqsIdPage.simulate3ReceivedQuotes : UI_STRINGS.appAppProcurementRfqsIdPage.recordVendorQuote}
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
                    <Plus size={13} style={{ marginRight: 5 }} />{UI_STRINGS.appAppProcurementRfqsIdPage.recordIndividualQuoteManually}</button>
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
                >{UI_STRINGS.appAppProcurementRfqsIdPage.enterpriseQuotationRegister}</h2>
              }
              subtitle={UI_STRINGS.appAppProcurementRfqsIdPage.formalCommercialRegisterOfAllSubmittedVendorQuotationsAndBaselineComplianceParameters}
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
                    <Plus size={13} />{UI_STRINGS.appAppProcurementRfqsIdPage.recordNewQuote}</button>
                  <button
                    type="button"
                    onClick={() => changeActiveTab('negotiation')}
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
                  >{UI_STRINGS.common.openNegotiationWorkspace}<ArrowRight size={13} />
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
                    <Gavel size={13} />{UI_STRINGS.appAppProcurementRfqsIdPage.initiateEAuction}</Link>
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
                      <th style={{ width: 220, minWidth: 200, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.vendorName}</th>
                      <th style={{ width: 140, minWidth: 130, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quoteReference}</th>
                      <th style={{ width: 130, minWidth: 120, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.rFQReference}</th>
                      <th style={{ width: 170, minWidth: 160, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quotationReceivedDateAndTime}</th>
                      <th style={{ width: 150, minWidth: 140, textAlign: 'right', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quotedTotalValue}</th>
                      <th style={{ width: 120, minWidth: 110, textAlign: 'center', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.numberOfItemsQuoted}</th>
                      <th style={{ width: 120, minWidth: 110, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quoteValidity}</th>
                      <th style={{ width: 180, minWidth: 160, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.commercialTermsStatus}</th>
                      <th style={{ width: 150, minWidth: 140, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.technicalComplianceStatus}</th>
                      <th style={{ width: 130, minWidth: 120, textAlign: 'left', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quotationStatus}</th>
                      <th style={{ width: 120, minWidth: 110, textAlign: 'center', border: '1px solid #cbd5e1', background: '#f8fafc', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.actions}</th>
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
                              {q.quoteNumber || UI_STRINGS.appAppProcurementRfqsIdPage.qTEREC001}
                            </span>
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px' }}>
                            <span className="font-mono text-muted" style={{ fontSize: 12 }}>{rfq.rfqNumber}</span>
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#475569', fontSize: 12 }}>
                            {dateFormatted}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{UI_STRINGS.common.copy1g8b5tg}{(q.totalQuoteAmount || 0).toLocaleString()}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', textAlign: 'center', color: '#1e293b', fontWeight: 600, fontSize: 13 }}>
                            {quotedLinesCount}{UI_STRINGS.common.copy3ml01c}{totalLines}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#334155', fontSize: 13 }}>
                            {q.validityDays ? interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.validityDaysDays, { "validityDays": q.validityDays }) : UI_STRINGS.appAppProcurementRfqsIdPage.copy1xeupjt}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#0f172a', fontSize: 12 }}>
                            {q.commercialTerms || UI_STRINGS.appAppProcurementRfqsIdPage.fOBSiteDelivery}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '10px 14px', color: '#0f172a', fontSize: 13, fontWeight: 500 }}>{UI_STRINGS.common.compliant}</td>
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
                              {q.status || UI_STRINGS.common.sUBMITTED}
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
                              <Eye size={13} />{UI_STRINGS.appAppProcurementRfqsIdPage.viewQuote}</button>
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
            title={UI_STRINGS.appAppProcurementRfqsIdPage.commercialVendorRankingEvaluation}
            subtitle={UI_STRINGS.appAppProcurementRfqsIdPage.commercialLeaderboardComparingFinalNegotiatedOffersAgainstAICostBaselineAndL1}
            noPadding
          >
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1450, width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 70, minWidth: 70, border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.common.rank}</th>
                    <th style={{ minWidth: 170, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.common.vendorName}</th>
                    <th style={{ minWidth: 140, textAlign: 'right', border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.latestQuotedValue}</th>
                    <th style={{ minWidth: 100, textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.totalVersions}</th>
                    <th style={{ minWidth: 140, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.common.negotiationStatus}</th>
                    <th style={{ minWidth: 125, textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.technicalEligibility}</th>
                    <th style={{ minWidth: 140, textAlign: 'right', border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.varianceVsL1}</th>
                    <th style={{ minWidth: 160, maxWidth: 210, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.common.deliverySchedule}</th>
                    <th style={{ minWidth: 175, maxWidth: 230, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.common.paymentTerms}</th>
                    <th style={{ minWidth: 160, maxWidth: 210, border: '1px solid #B8C9DC', padding: '8px 12px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.warrantyPeriod}</th>
                    <th style={{ minWidth: 125, textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 10px', background: '#f8fafc', color: '#1e293b', fontWeight: 700 }}>{UI_STRINGS.common.action}</th>
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
                    const quoteCount = Number(latestQuote?.versionCount || vQuotes.length || 1);

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
                            {isL1 ? UI_STRINGS.common.l1 : interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.lRank, { "rank": v.rank })}
                          </span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', fontWeight: 600, color: isL1 ? '#059669' : '#0f172a', background: '#ffffff' }}>
                          {v.vendorName}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right', fontWeight: 700, color: isL1 ? '#059669' : '#0f172a', background: '#ffffff' }}>{UI_STRINGS.common.copy1g8b5tg}{v.totalQuoteAmount?.toLocaleString()}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center', background: '#ffffff' }}>
                          <span className="text-muted font-medium">{quoteCount}{UI_STRINGS.appAppProcurementRfqsIdPage.versions}</span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', background: '#ffffff' }}>
                          <span className="badge badge-draft">{negStatus}</span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center', background: '#ffffff' }}>
                          <span className="badge badge-approved">{UI_STRINGS.common.cOMPLIANT}</span>
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right', background: '#ffffff' }}>
                          {isL1 ? (
                            <span className="badge badge-approved">{UI_STRINGS.appAppProcurementRfqsIdPage.lowestOffer}</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>{UI_STRINGS.common.copy148wag9}{diffVsL1.toLocaleString()}{UI_STRINGS.appAppProcurementRfqsIdPage.copy8x1qbe}{diffPct}{UI_STRINGS.common.copy1y4e1t7}</span>
                          )}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '6px 10px', verticalAlign: 'middle', maxWidth: 210, background: '#ffffff' }}>
                          <BoqDescriptionCell
                            text={deliveryScheduleVal}
                            title={UI_STRINGS.common.deliverySchedule}
                            contextLabel={v.vendorName}
                            emptyPlaceholder={UI_STRINGS.common.notSpecified}
                            maxWidth={200}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '6px 10px', verticalAlign: 'middle', maxWidth: 230, background: '#ffffff' }}>
                          <BoqDescriptionCell
                            text={paymentTermsVal}
                            title={UI_STRINGS.common.paymentTerms}
                            contextLabel={v.vendorName}
                            emptyPlaceholder={UI_STRINGS.common.notSpecified}
                            maxWidth={220}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '6px 10px', verticalAlign: 'middle', maxWidth: 210, background: '#ffffff' }}>
                          <BoqDescriptionCell
                            text={warrantyVal}
                            title={UI_STRINGS.appAppProcurementRfqsIdPage.warrantyPeriod}
                            contextLabel={v.vendorName}
                            emptyPlaceholder={UI_STRINGS.common.notSpecified}
                            maxWidth={200}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center', background: '#ffffff' }}>
                          {existingPpo ? (
                            <span className="badge badge-approved" title={interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.pPOPpoNumberActive, { "ppoNumber": existingPpo.ppoNumber })}>
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
                              <Award size={13} style={{ marginRight: 4 }} />{isL1 ? UI_STRINGS.appAppProcurementRfqsIdPage.raisePPOL1 : UI_STRINGS.appAppProcurementRfqsIdPage.raisePPO}
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
            title={UI_STRINGS.appAppProcurementRfqsIdPage.commercialAwardRecommendation}
            subtitle={UI_STRINGS.appAppProcurementRfqsIdPage.documentedRecommendationForProjectAndFinancialSanction}
            action={
              !rfq.awards?.length && (
                <button
                  type="button"
                  onClick={() => setShowAwardModal(true)}
                  className="btn btn-primary btn-sm"
                >
                  <Award size={14} style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementRfqsIdPage.prepareAwardRecommendation}</button>
              )
            }
          >
            {!rfq.awards?.length ? (
              <EmptyState
                icon={<Award size={36} color="#94a3b8" strokeWidth={1.5} />}
                title={UI_STRINGS.appAppProcurementRfqsIdPage.noAwardRecommendationCreated}
                description={UI_STRINGS.appAppProcurementRfqsIdPage.recommendL1VendorOrNonL1VendorWithRequiredJustificationToRouteForFinancialApproval}
                actionText={UI_STRINGS.appAppProcurementRfqsIdPage.prepareAwardRecommendation2}
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
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.recommendedVendor}</div>
                          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2, color: '#0f172a' }}>
                            {a.recommendedVendor?.name}
                          </div>
                        </div>

                        <div>
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.finalAwardAmount}</div>
                          <div style={{ fontWeight: 800, fontSize: 18, color: '#059669', marginTop: 2 }}>{UI_STRINGS.common.copy1g8b5tg}{a.finalNegotiatedAmount?.toLocaleString()}
                          </div>
                        </div>

                        <div>
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.baselineSavings}</div>
                          <div style={{ fontWeight: 600, marginTop: 2 }}>{UI_STRINGS.common.copy1g8b5tg}{a.totalSavingsAmount?.toLocaleString()}{UI_STRINGS.common.copy1b3t0c5}{a.savingsPercent}{UI_STRINGS.common.copy1y4e1t7}</div>
                        </div>

                        <div>
                          <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.approvalStatus}</div>
                          <div style={{ marginTop: 2 }}>
                            <span className={`badge ${isApproved ? 'badge-approved' : 'badge-review'}`}>
                              {a.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 16 }}>
                        <strong>{UI_STRINGS.appAppProcurementRfqsIdPage.documentedCommercialJustification}</strong> {a.justification}
                        {a.approvalRemarks && (
                          <div style={{ marginTop: 6, color: '#166534', fontWeight: 500 }}>
                            <strong>{UI_STRINGS.appAppProcurementRfqsIdPage.approverRemarks2}</strong> {a.approvalRemarks}
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
                            >{UI_STRINGS.appAppProcurementRfqsIdPage.approveRecommendation}</button>
                            <button
                              type="button"
                              onClick={() => {
                                setAwardApprovalAction('REJECT');
                                setShowApproveAwardModal(true);
                              }}
                              className="btn btn-sm btn-secondary"
                              style={{ color: '#dc2626' }}
                            >{UI_STRINGS.common.reject2}</button>
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
                            <FileCheck size={14} style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementRfqsIdPage.generatePurchaseOrderPPO}</button>
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
              title={UI_STRINGS.appAppProcurementRfqsIdPage.officialPurchaseOrderPPO}
              subtitle={UI_STRINGS.appAppProcurementRfqsIdPage.generatedOrderCarryingForwardApprovedAwardLinesAgreedRatesAndTerms}
              noPadding
            >
              <div className="table-wrapper">
                <table className="table enterprise-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>{UI_STRINGS.common.pPONumber}</th>
                      <th>{UI_STRINGS.common.vendor}</th>
                      <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.totalOrderValue}</th>
                      <th>{UI_STRINGS.appAppProcurementRfqsIdPage.deliveryTerms}</th>
                      <th>{UI_STRINGS.common.paymentTerms}</th>
                      <th>{UI_STRINGS.common.status}</th>
                      <th>{UI_STRINGS.appAppProcurementRfqsIdPage.issuedDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.ppos.map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-mono font-bold text-primary">{p.ppoNumber}</td>
                        <td style={{ fontWeight: 600 }}>{p.vendor?.name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>{UI_STRINGS.common.copy1g8b5tg}{p.totalValue?.toLocaleString()}
                        </td>
                        <td>{p.deliveryTerms}</td>
                        <td>{p.paymentTerms}</td>
                        <td><span className="badge badge-approved">{p.status}</span></td>
                        <td className="text-muted">
                          {p.issuedAt ? new Date(p.issuedAt).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}
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
          title={UI_STRINGS.appAppProcurementRfqsIdPage.recordVendorQuotation}
          maxWidth="max-w-4xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">{UI_STRINGS.appAppProcurementRfqsIdPage.selectVendor2}</label>
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
                <option value="">{UI_STRINGS.appAppProcurementRfqsIdPage.selectVendor}</option>
                {rfq.invitedVendors?.map((iv: any) => (
                  <option key={iv.vendorId} value={iv.vendorId}>
                    {iv.vendor?.name}{UI_STRINGS.common.copy1b3t0c5}{iv.vendor?.code}{UI_STRINGS.common.copyc7zu6c}</option>
                ))}
              </select>
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>{UI_STRINGS.common.sNo2}</th>
                    <th>{UI_STRINGS.common.itemDescription}</th>
                    <th>{UI_STRINGS.common.quantity}</th>
                    <th>{UI_STRINGS.common.uOM}</th>
                    <th style={{ width: 140 }}>{UI_STRINGS.common.quotedUnitRate}</th>
                    <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.lineTotal}</th>
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
                            placeholder={UI_STRINGS.appAppProcurementRfqsIdPage.unitRate}
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
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{UI_STRINGS.common.copy1g8b5tg}{total.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">{UI_STRINGS.common.commercialTerms}</label>
                <input
                  type="text"
                  value={quoteCommercialTerms}
                  onChange={(e) => setQuoteCommercialTerms(e.target.value)}
                  className="input input-sm"
                />
              </div>
              <div>
                <label className="label">{UI_STRINGS.appAppProcurementRfqsIdPage.deliveryLeadTimeDays}</label>
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
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                onClick={handleRecordQuoteSubmit}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? UI_STRINGS.common.saving : UI_STRINGS.appAppProcurementRfqsIdPage.saveCaptureQuote}
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
          title={UI_STRINGS.appAppProcurementRfqsIdPage.submitCommercialAwardRecommendation}
          maxWidth="max-w-2xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">{UI_STRINGS.common.recommendedVendor}</label>
              <select
                value={awardVendorId}
                onChange={(e) => setAwardVendorId(e.target.value)}
                className="input"
              >
                {comparison?.vendors?.map((v: any) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.rank === 1 ? UI_STRINGS.appAppProcurementRfqsIdPage.l1LowestOffer2 : interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.rankRank, { "rank": v.rank })}
                    {v.vendorName}{UI_STRINGS.appAppProcurementRfqsIdPage.copyk4r9d6}{v.totalQuoteAmount?.toLocaleString()}
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
                  <ShieldAlert size={16} />{UI_STRINGS.appAppProcurementRfqsIdPage.nonL1VendorSelectionException}</div>
                <div style={{ marginTop: 4 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.selectedVendorIsNotTheLowestCommercialOfferL1ADocumentedJustificationIsMandatoryAndWillBeAuditedByProjectApproverAndFinance}</div>
              </div>
            )}

            <div>
              <label className="label">{UI_STRINGS.appAppProcurementRfqsIdPage.commercialJustification}{awardVendorId !== l1VendorId ? UI_STRINGS.appAppProcurementRfqsIdPage.mANDATORYFORNONL1 : ''}
              </label>
              <textarea
                rows={4}
                placeholder={
                  awardVendorId === l1VendorId
                    ? UI_STRINGS.appAppProcurementRfqsIdPage.recommendedL1VendorWithCompleteCompliantTechnicalSpecificationsAndLowestCommercialTotal
                    : UI_STRINGS.appAppProcurementRfqsIdPage.provideDetailedJustificationForNonL1SelectionEGDeliveryTimelineTechnicalSuperiorCapabilityPastPerformance
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
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                onClick={handleAwardSubmit}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? UI_STRINGS.common.submitting : UI_STRINGS.appAppProcurementRfqsIdPage.submitAwardRecommendation}
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
          title={interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.value1CommercialAward, { "value1": awardApprovalAction === 'APPROVE' ? 'Approve' : 'Reject' })}
          maxWidth="max-w-md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">{UI_STRINGS.appAppProcurementRfqsIdPage.approverRemarks}</label>
              <textarea
                rows={3}
                placeholder={UI_STRINGS.appAppProcurementRfqsIdPage.enterApprovalSanctionRemarksOrReasonForRejection}
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
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                onClick={handleAwardApprovalReview}
                disabled={actionLoading}
                className={`btn ${awardApprovalAction === 'APPROVE' ? 'btn-primary' : 'btn-danger'}`}
              >
                {actionLoading ? UI_STRINGS.appAppProcurementRfqsIdPage.processing : interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.confirmValue1, { "value1": awardApprovalAction === 'APPROVE' ? 'Approval' : 'Rejection' })}
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
          title={UI_STRINGS.appAppProcurementRfqsIdPage.raisePurchaseOrderPPO}
          maxWidth="max-w-xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 13, border: '1px solid #e2e8f0' }}>
              <div>
                <strong>{UI_STRINGS.appAppProcurementRfqsIdPage.selectedVendor2}</strong> {ppoTargetVendor?.vendorName || rfq.awards?.[0]?.recommendedVendor?.name || UI_STRINGS.appAppProcurementRfqsIdPage.selectedVendor}
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>{UI_STRINGS.appAppProcurementRfqsIdPage.commercialRank}</strong>
                <span className={`badge ${ppoTargetVendor?.rank === 1 ? 'badge-approved' : 'badge-draft'}`} style={{ fontWeight: 700 }}>
                  {ppoTargetVendor?.rank === 1 ? UI_STRINGS.appAppProcurementRfqsIdPage.l1LowestOffer : interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.lValue1Offer, { "value1": ppoTargetVendor?.rank || 2 })}
                </span>
                {ppoTargetVendor?.latestVersion && (
                  <span className="badge badge-submitted font-mono">{UI_STRINGS.appAppProcurementRfqsIdPage.quoteV}{ppoTargetVendor.latestVersion}</span>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>{UI_STRINGS.common.totalOrderValue2}</strong>{UI_STRINGS.common.copy1qkmf2u}{(ppoTargetVendor?.totalQuoteAmount || rfq.awards?.[0]?.finalNegotiatedAmount || 0).toLocaleString()}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>{UI_STRINGS.appAppProcurementRfqsIdPage.scopeLines}</strong> {rfq.lines?.length}{UI_STRINGS.appAppProcurementRfqsIdPage.lineItemsCarriedForward}</div>
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
                  <ShieldAlert size={15} />{UI_STRINGS.appAppProcurementRfqsIdPage.nonL1VendorAwardNotice}</div>
                <div style={{ marginTop: 3 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.thisVendorIsRankedL}{ppoTargetVendor.rank}{UI_STRINGS.appAppProcurementRfqsIdPage.notLowestCompliantOfferADocumentedJustificationIsMandatoryBeforeRaisingThePPO}</div>
              </div>
            )}

            <div>
              <label className="label">{UI_STRINGS.appAppProcurementRfqsIdPage.commercialAwardJustification}{ppoTargetVendor?.rank > 1 ? UI_STRINGS.appAppProcurementRfqsIdPage.mANDATORYFORNONL12 : UI_STRINGS.appAppProcurementRfqsIdPage.optionalForL1}
              </label>
              <textarea
                rows={3}
                placeholder={
                  ppoTargetVendor?.rank === 1
                    ? UI_STRINGS.appAppProcurementRfqsIdPage.awardedToL1LowestCompliantBidderFollowingCompetitiveEvaluation
                    : UI_STRINGS.appAppProcurementRfqsIdPage.enterMandatoryJustificationForAwardingToNonL1VendorEGSpecializedTechnicalCapabilityDeliveryTimelineSuperiorSLA
                }
                value={ppoJustification}
                onChange={(e) => setPpoJustification(e.target.value)}
                className="input input-sm"
              />
            </div>

            <div>
              <label className="label">{UI_STRINGS.appAppProcurementRfqsIdPage.deliveryTerms}</label>
              <input
                type="text"
                value={ppoDeliveryTerms}
                onChange={(e) => setPpoDeliveryTerms(e.target.value)}
                className="input input-sm"
              />
            </div>

            <div>
              <label className="label">{UI_STRINGS.common.paymentTerms}</label>
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
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                onClick={() => handleGeneratePpo(ppoAwardId)}
                disabled={actionLoading}
                className="btn btn-primary"
              >
                {actionLoading ? UI_STRINGS.appAppProcurementRfqsIdPage.generating : UI_STRINGS.appAppProcurementRfqsIdPage.issuePurchaseOrderPPO}
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
          title={UI_STRINGS.appAppProcurementRfqsIdPage.approvedVendorRateCardSourcingComparison}
          maxWidth="max-w-5xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: '#475569' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.comparePreNegotiatedCorporateRateCardsAgainstTheCurrentRFQRequirementsDirectPPOCreationIsOnlyPermittedWhenTheRateCardIsApprovedCurrentlyValidAndProvidesCompleteItemCoverage}</div>

            {loadingRateCard ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>{UI_STRINGS.common.loading}</div>
            ) : !rateCardMatch?.matchedRateCards?.length ? (
              <EmptyState
                icon={<Tag size={36} color="#94a3b8" strokeWidth={1.5} />}
                title={UI_STRINGS.appAppProcurementRfqsIdPage.noApplicableRateCards}
                description={UI_STRINGS.appAppProcurementRfqsIdPage.noApprovedRateCardsFoundMatchingTheCategoryOrLineItemsOfThisRFQPackage}
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
                            {rc.directPpoEligible ? UI_STRINGS.appAppProcurementRfqsIdPage.directPPOEligible : UI_STRINGS.appAppProcurementRfqsIdPage.directPPOBlocked}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>
                          {rc.vendor?.name}{UI_STRINGS.common.copyq9aflv}{rc.title}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.rateCardTotal}</div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: rc.directPpoEligible ? '#059669' : '#0f172a' }}>{UI_STRINGS.common.copy1g8b5tg}{rc.rateCardTotalValue?.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{UI_STRINGS.common.savings}{rc.totalSavings?.toLocaleString()}{UI_STRINGS.common.copy1b3t0c5}{rc.savingsPercent}{UI_STRINGS.common.copy1y4e1t7}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 12, marginBottom: 12 }}>
                      <div>{UI_STRINGS.appAppProcurementRfqsIdPage.validity2}<strong>{rc.validFrom}{UI_STRINGS.appAppProcurementRfqsIdPage.to}{rc.validTo}</strong></div>
                      <div>{UI_STRINGS.appAppProcurementRfqsIdPage.itemCoverage}<strong>{rc.matchedItemsCount}{UI_STRINGS.common.copybo0mse}{rc.totalItemsCount}{UI_STRINGS.appAppProcurementRfqsIdPage.items}{rc.coveragePercent}{UI_STRINGS.common.copy1y4e1t7}</strong></div>
                      <div>{UI_STRINGS.appAppProcurementRfqsIdPage.vendorQualification}<strong>{rc.vendor?.qualificationStatus || UI_STRINGS.common.qUALIFIED}</strong></div>
                      <div>{UI_STRINGS.appAppProcurementRfqsIdPage.performanceScore}<strong>{rc.vendor?.performanceScore ?? UI_STRINGS.common.notAvailable}{rc.vendor?.performanceScore === null || rc.vendor?.performanceScore === undefined ? '' : UI_STRINGS.appAppProcurementRfqsIdPage.copy1gy72o5}</strong></div>
                    </div>

                    {/* Block reasons if ineligible */}
                    {!rc.directPpoEligible && rc.blockReasons?.length > 0 && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
                        <strong>{UI_STRINGS.appAppProcurementRfqsIdPage.blockedFromDirectPPO}</strong> {rc.blockReasons[0]}
                        <div style={{ marginTop: 2, fontSize: 11 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.requirementMustBeRoutedThroughCompetitiveRFQSourcing}</div>
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
                          <FileCheck size={14} style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementRfqsIdPage.createDirectPPOFromRateCard}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {rateCardMatch?.hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loadingMoreRateCardMatches}
                  onClick={() => void fetchRateCardMatch(Number(rateCardMatch.page || 1) + 1, true)}
                >
                  {loadingMoreRateCardMatches ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
                </button>
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
          title={interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.quotationDetailsValue1, { "value1": viewingQuote.quoteNumber || 'Vendor Quote' })}
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
                <span className="text-muted">{UI_STRINGS.common.vendor2}</span>{' '}
                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                  {rfq.invitedVendors?.find((iv: any) => iv.vendorId === viewingQuote.vendorId)?.vendor?.name || viewingQuote.vendor?.name || UI_STRINGS.common.vendor}
                </div>
              </div>
              <div>
                <span className="text-muted">{UI_STRINGS.appAppProcurementRfqsIdPage.quoteReference2}</span>{' '}
                <div className="font-mono font-bold text-blue-700">{viewingQuote.quoteNumber}</div>
              </div>
              <div>
                <span className="text-muted">{UI_STRINGS.appAppProcurementRfqsIdPage.quotedTotal}</span>{' '}
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{UI_STRINGS.common.copy1g8b5tg}{(viewingQuote.totalQuoteAmount || 0).toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-muted">{UI_STRINGS.appAppProcurementRfqsIdPage.validity}</span>{' '}
                <div style={{ fontWeight: 600 }}>{viewingQuote.validityDays ? interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.validityDaysDays, { "validityDays": viewingQuote.validityDays }) : UI_STRINGS.appAppProcurementRfqsIdPage.copy1xeupjt}</div>
              </div>
              <div>
                <span className="text-muted">{UI_STRINGS.appAppProcurementRfqsIdPage.deliveryLeadTime}</span>{' '}
                <div style={{ fontWeight: 600 }}>{viewingQuote.deliveryLeadTimeDays ? interpolateUiString(UI_STRINGS.appAppProcurementRfqsIdPage.deliveryLeadTimeDaysDays, { "deliveryLeadTimeDays": viewingQuote.deliveryLeadTimeDays }) : UI_STRINGS.appAppProcurementRfqsIdPage.copy1xeupjt}</div>
              </div>
              <div>
                <span className="text-muted">{UI_STRINGS.appAppProcurementRfqsIdPage.commercialTerms}</span>{' '}
                <div style={{ fontWeight: 500 }}>{viewingQuote.commercialTerms || UI_STRINGS.appAppProcurementRfqsIdPage.standardFOBSite}</div>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quotedLineItemBreakdown}</div>
              <div className="table-wrapper" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="table enterprise-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                      <th>{UI_STRINGS.common.itemDescription}</th>
                      <th style={{ width: 70 }}>{UI_STRINGS.common.uOM}</th>
                      <th style={{ textAlign: 'right', width: 80 }}>{UI_STRINGS.common.quantity}</th>
                      <th style={{ textAlign: 'right', width: 120 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.quotedRate}</th>
                      <th style={{ textAlign: 'right', width: 130 }}>{UI_STRINGS.common.lineTotal}</th>
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
                            {unitRate > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": unitRate.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: lineTotal > 0 ? '#0f172a' : '#94a3b8' }}>
                            {lineTotal > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": lineTotal.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                      <td colSpan={5} style={{ textAlign: 'right' }}>{UI_STRINGS.appAppProcurementRfqsIdPage.totalQuotedValue}</td>
                      <td style={{ textAlign: 'right', color: '#1e40af', fontSize: 13 }}>{UI_STRINGS.common.copy1g8b5tg}{(viewingQuote.totalQuoteAmount || 0).toLocaleString()}
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
              >{UI_STRINGS.common.close}</button>
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
          <div style={{ fontSize: 13, fontWeight: 600 }}>{UI_STRINGS.appAppProcurementRfqsIdPage.loadingRFQWorkspace}</div>
        </div>
      }
    >
      <RfqDetailContent {...props} />
    </Suspense>
  );
}
