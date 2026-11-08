'use client';
// src/app/(app)/approvals/rate-cards/page.tsx
// Two-Level Rate Card Approval Queue (Level 1: Project Approver -> Level 2: Finance Approver)
import { useState, useEffect, useRef, useCallback } from 'react';
import { reportHandledClientFailure } from '@/lib/observability/client-reporter';
import Link from 'next/link';
import {
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Building2,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Check,
  Send,
  Eye,
  Layers,
  Scale,
  Sparkles,
  History,
  ShieldCheck,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import Section6ApproverView from '@/components/rate-cards/Section6ApproverView';
import Section7FinalisedDetails from '@/components/rate-cards/Section7FinalisedDetails';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { DEFAULT_RATE_CARD_LIST_PAGE_SIZE } from '@/app/api/procurement/rate-cards/route.constants';
import { RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE } from '@/lib/rate-card-approval-history.constants';
import { encodeRateCardApprovalCursor } from '@/lib/rate-card-approval-history';
import type { RateCardPageRecord } from '@app-types/app/(app)/procurement/rate-cards/page.types';
import type {
  RateCardApprovalHistoryMetadata,
  RateCardApprovalHistoryUiCard,
  RateCardApprovalHistoryUiEntry,
} from '@app-types/lib/rate-card-approval-history.types';


export default function RateCardApprovalsPage() {
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreRateCards, setLoadingMoreRateCards] = useState(false);
  const rateCardPageRef = useRef(1);
  const [hasMoreRateCards, setHasMoreRateCards] = useState(false);
  const [rateCardSummary, setRateCardSummary] = useState({ level1Pending: 0, level2Pending: 0 });
  const [activeQueueTab, setActiveQueueTab] = useState<'ALL_PENDING' | 'LEVEL_1' | 'LEVEL_2' | 'CONCLUDED'>('ALL_PENDING');

  // Review Modal state
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [approvalDetailsLoading, setApprovalDetailsLoading] = useState(false);
  const [loadingOlderApprovalHistory, setLoadingOlderApprovalHistory] = useState(false);
  const [approvalHistoryError, setApprovalHistoryError] = useState<string | null>(null);
  const reviewRequestSequence = useRef(0);

  // Return & Reject modals
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Message / Clarification
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Feedback alerts
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [userRole, setUserRole] = useState<'PROJECT_APPROVER' | 'FINANCE_APPROVER'>('PROJECT_APPROVER');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        const role = res?.user?.role || res?.data?.user?.role;
        if (role && (role.toUpperCase().includes('FINANCE') || role === 'FINANCE_HEAD' || role === 'FINANCE_USER')) {
          setUserRole('FINANCE_APPROVER');
        }
      })
      .catch((error: unknown) => reportHandledClientFailure(error, {
        operation: 'load_rate_card_approval_role', route: '/api/auth/session',
      }));
  }, []);

  const fetchRateCards = useCallback(async (append = false) => {
    const page = append ? rateCardPageRef.current + 1 : 1;
    if (append) setLoadingMoreRateCards(true);
    else setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(DEFAULT_RATE_CARD_LIST_PAGE_SIZE), queue: activeQueueTab });
      const res = await fetch(`/api/procurement/rate-cards?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToFetchRateCards);
      const incoming: RateCardPageRecord[] = Array.isArray(data.rateCards) ? data.rateCards : [];
      setRateCards((current) => {
        if (!append) return incoming;
        const byId = new Map(current.map((rateCard) => [rateCard.id, rateCard]));
        incoming.forEach((rateCard) => byId.set(rateCard.id, rateCard));
        return Array.from(byId.values());
      });
      rateCardPageRef.current = page;
      setHasMoreRateCards(Boolean(data.hasMore));
      if (data.summary) setRateCardSummary(data.summary);
    } catch (err) {
      console.error('Error fetching rate cards:', err);
    } finally {
      if (append) setLoadingMoreRateCards(false);
      else setLoading(false);
    }
  }, [activeQueueTab]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) void fetchRateCards();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fetchRateCards]);

  const handleOpenReview = async (rc: any) => {
    const sequence = ++reviewRequestSequence.current;
    setSelectedCard(rc);
    setShowReviewModal(true);
    setApprovalDetailsLoading(true);
    setActionReason('');
    setMessageText('');
    try {
      const response = await fetch(`/api/procurement/rate-cards/${rc.id}`);
      const data = await response.json();
      if (!response.ok || !data.rateCard) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToFetchRateCard);
      if (sequence === reviewRequestSequence.current) setSelectedCard(data.rateCard);
    } catch (error) {
      if (sequence === reviewRequestSequence.current) {
        setShowReviewModal(false);
        setMsg({
          text: error instanceof Error ? error.message : UI_STRINGS.common.userMessages.failedToFetchRateCard,
          type: 'error',
        });
      }
    } finally {
      if (sequence === reviewRequestSequence.current) setApprovalDetailsLoading(false);
    }
  };

  const handleLoadOlderApprovalHistory = async () => {
    if (!selectedCard || !selectedCard.approvalHistory?.nextCursor || loadingOlderApprovalHistory) return;
    const cardId = selectedCard.id;
    setLoadingOlderApprovalHistory(true);
    setApprovalHistoryError(null);
    try {
      const cursor = encodeURIComponent(selectedCard.approvalHistory.nextCursor);
      const response = await fetch(`/api/procurement/rate-cards/${cardId}/message?cursor=${cursor}`);
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.approvals) || !data.approvalHistory) {
        throw new Error(UI_STRINGS.appAppApprovalsRateCardsPage.failedToLoadOlderApprovalHistory);
      }
      const olderApprovals = data.approvals as RateCardApprovalHistoryUiEntry[];
      const approvalHistory = data.approvalHistory as RateCardApprovalHistoryMetadata;
      setSelectedCard((current: RateCardApprovalHistoryUiCard | null) => {
        if (!current || current.id !== cardId) return current;
        const seenIds = new Set((current.approvals || []).map((approval) => approval.id));
        const uniqueOlderApprovals = olderApprovals.filter((approval) => !seenIds.has(approval.id));
        return {
          ...current,
          approvals: [...(current.approvals || []), ...uniqueOlderApprovals],
          approvalHistory,
        };
      });
    } catch {
      setApprovalHistoryError(UI_STRINGS.appAppApprovalsRateCardsPage.failedToLoadOlderApprovalHistory);
    } finally {
      setLoadingOlderApprovalHistory(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedCard) return;
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: actionReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || UI_STRINGS.appAppApprovalsRateCardsPage.failedToApproveRateCard);

      setMsg({ text: data.message || UI_STRINGS.appAppApprovalsRateCardsPage.rateCardApprovedSuccessfully, type: 'success' });
      setShowReviewModal(false);
      fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReturnForCorrection = async () => {
    if (!selectedCard) return;
    if (!actionReason.trim()) {
      setMsg({ text: UI_STRINGS.appAppApprovalsRateCardsPage.remarksReasonForReturnIsMandatory, type: 'error' });
      return;
    }
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToReturnRateCard }));

      setMsg({ text: interpolateUiString(UI_STRINGS.common.value1, { "value1": data.message || 'Rate Card returned for correction with remarks recorded.' }), type: 'success' });
      setShowReturnModal(false);
      setShowReviewModal(false);
      fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCard) return;
    if (!actionReason.trim()) {
      setMsg({ text: UI_STRINGS.common.rejectionReasonRemarksIsMandatory, type: 'error' });
      return;
    }
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToRejectRateCard }));

      setMsg({ text: interpolateUiString(UI_STRINGS.common.value1, { "value1": data.message || 'Rate Card rejected with reason recorded.' }), type: 'success' });
      setShowRejectModal(false);
      setShowReviewModal(false);
      fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedCard || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToSendMessage }));

      // Update local card approvals
      setSelectedCard((current: RateCardApprovalHistoryUiCard | null) => {
        if (!current || current.id !== selectedCard.id) return current;
        const mergedApprovals = [data.approvalEntry, ...(current.approvals || [])];
        const approvals = mergedApprovals.slice(0, RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE);
        const hasMore = Boolean(current.approvalHistory?.hasMore) || mergedApprovals.length > RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE;
        const lastVisibleApproval = approvals[approvals.length - 1];
        return {
          ...current,
          approvals,
          approvalHistory: {
            hasMore,
            nextCursor: hasMore && lastVisibleApproval ? encodeRateCardApprovalCursor(lastVisibleApproval) : null,
            pageSize: RATE_CARD_APPROVAL_HISTORY_PAGE_SIZE,
          },
        };
      });
      setMessageText('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Filter queue items
  const filteredQueue = rateCards.filter((rc) => {
    if (activeQueueTab === 'ALL_PENDING') {
      return rc.status === 'PENDING_PROJECT_APPROVAL' || rc.status === 'PENDING_FINANCE_APPROVAL';
    }
    if (activeQueueTab === 'LEVEL_1') {
      return rc.status === 'PENDING_PROJECT_APPROVAL';
    }
    if (activeQueueTab === 'LEVEL_2') {
      return rc.status === 'PENDING_FINANCE_APPROVAL';
    }
    if (activeQueueTab === 'CONCLUDED') {
      return rc.status === 'APPROVED' || rc.status === 'RETURNED_FOR_CORRECTION' || rc.status === 'REJECTED';
    }
    return true;
  });

  const level1Count = rateCardSummary.level1Pending;
  const level2Count = rateCardSummary.level2Pending;
  const totalPending = level1Count + level2Count;

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      <PageHeader
        title={UI_STRINGS.appAppApprovalsRateCardsPage.rateCardApprovalsQueue}
        subtitle={UI_STRINGS.appAppApprovalsRateCardsPage.mandatoryTwoLevelGovernanceLevel1ProjectApproverLevel2FinanceApproverActiveRateCard}
        breadcrumbs={[
          { label: UI_STRINGS.appAppApprovalsRateCardsPage.home, href: '/dashboard' },
          { label: UI_STRINGS.common.approvals, href: '/approvals' },
          { label: UI_STRINGS.appAppApprovalsRateCardsPage.rateCards },
        ]}
        badge={
          <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={13} /> {totalPending}{UI_STRINGS.appAppApprovalsRateCardsPage.pendingApproval}</span>
        }
        actions={
          <Link href="/procurement/rate-cards" className="btn btn-secondary btn-sm">{UI_STRINGS.appAppApprovalsRateCardsPage.rateCardRegister}</Link>
        }
      />

      {msg && (
        <div
          className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}
          style={{
            padding: '12px 16px',
            borderRadius: 6,
            background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${msg.type === 'success' ? '#86efac' : '#fca5a5'}`,
            marginBottom: 20,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Stepper info banner */}
      <div
        className="card mb-4"
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          padding: '14px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                background: '#2563eb',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >{UI_STRINGS.common.copyefwnq4}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a' }}>{UI_STRINGS.common.level1ProjectApproverReview}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.validatesItemDescriptionsStandardBOQTaxonomyOperationalScopeAndUnitRates}</div>
            </div>
          </div>

          <div style={{ fontSize: 18, color: '#94a3b8' }}>{UI_STRINGS.common.copy15ynnjp}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                background: '#7c3aed',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >{UI_STRINGS.common.copyf9vgt1}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.level2FinanceApproverReview}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.verifiesCommercialTermsPaymentMilestonesVolumeDiscountsAndMarketParity}</div>
            </div>
          </div>

          <div style={{ fontSize: 18, color: '#94a3b8' }}>{UI_STRINGS.common.copy15ynnjp}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                background: '#10b981',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >{UI_STRINGS.appAppApprovalsRateCardsPage.copy660pgi}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>{UI_STRINGS.common.activeRateCard}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.activeInRFQComparisonEligibleForDirectRateCardPPOs}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── APPROVED SECTION 6: RATE CARD APPROVAL (PROJECT & FINANCE APPROVER VIEW) ── */}
      <div style={{ marginBottom: 24 }}>
        <Section6ApproverView
          role={userRole}
          rateCardId="RC-2026-0006"
          vendorName="Ramakrishna Interiors"
          category="Interior Works"
          vendorAcceptanceDate="24 Oct 2026"
          projectApproved={userRole === 'FINANCE_APPROVER'}
          onApproveProject={(comments) => {
            setMsg({ text: UI_STRINGS.appAppApprovalsRateCardsPage.level1ProjectApprovalCompletedRoutedToLevel2FinanceApprover, type: 'success' });
          }}
          onApproveFinance={(comments) => {
            setMsg({ text: UI_STRINGS.appAppApprovalsRateCardsPage.level2FinanceApprovalCompletedRateCardRC20260006IsNowActive, type: 'success' });
          }}
          onReject={(comments) => {
            setMsg({ text: UI_STRINGS.appAppApprovalsRateCardsPage.rateCardRejectedWithRemarks, type: 'error' });
          }}
        />
      </div>

      {/* ── APPROVED SECTION 7: FINALISED RATE CARD DETAILS (READ ONLY) ── */}
      <div style={{ marginBottom: 24 }}>
        <Section7FinalisedDetails
          rateCardId="RC-2026-0006"
          vendorName="Ramakrishna Interiors"
          category="Interior Works"
        />
      </div>

      {/* Tabs */}
      <Card noPadding>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
          {[
            { key: 'ALL_PENDING', label: interpolateUiString(UI_STRINGS.appAppApprovalsRateCardsPage.allPendingTotalPending, { "totalPending": totalPending }) },
            { key: 'LEVEL_1', label: interpolateUiString(UI_STRINGS.appAppApprovalsRateCardsPage.level1ProjectApproverQueueLevel1Count, { "level1Count": level1Count }) },
            { key: 'LEVEL_2', label: interpolateUiString(UI_STRINGS.appAppApprovalsRateCardsPage.level2FinanceApproverQueueLevel2Count, { "level2Count": level2Count }) },
            { key: 'CONCLUDED', label: UI_STRINGS.appAppApprovalsRateCardsPage.historyConcluded },
          ].map((tab: any) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveQueueTab(tab.key)}
              className={`btn btn-sm ${activeQueueTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Requests Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            className="table enterprise-table"
            style={{ width: '100%', minWidth: 1070, fontSize: 12, tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: 175 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 75 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: 175, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.common.rateCardRef}</th>
                <th style={{ width: 180, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.common.vendor}</th>
                <th style={{ width: 200, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.categoryScope}</th>
                <th style={{ width: 75, textAlign: 'right', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.common.items4}</th>
                <th style={{ width: 160, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.submittedByDate}</th>
                <th style={{ width: 160, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.approvalStage}</th>
                <th style={{ width: 120, textAlign: 'center', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.loadingApprovalsQueue}</td>
                </tr>
              ) : filteredQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.noRateCardsCurrentlyAwaitingApprovalInThisQueue}</td>
                </tr>
              ) : (
                filteredQueue.map((rc) => (
                  <tr key={rc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ width: 175, overflow: 'hidden' }}>
                      <div className="font-mono font-bold text-primary" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.rateCardNumber}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{UI_STRINGS.common.version}{rc.version || UI_STRINGS.common.v10}
                      </div>
                    </td>

                    <td style={{ width: 180, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.vendor?.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        {rc.vendor?.code}{UI_STRINGS.common.copyko5tj9}{rc.vendor?.complianceStatus}
                      </div>
                    </td>

                    <td style={{ width: 200, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.category}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.scope || UI_STRINGS.appAppApprovalsRateCardsPage.supplyInstall}{UI_STRINGS.common.copyko5tj9}{rc.location || UI_STRINGS.common.allIndia}
                      </div>
                    </td>

                    <td style={{ width: 75, textAlign: 'right', fontWeight: 600 }}>
                      {rc.itemCount || rc.items?.length || 0}
                    </td>

                    <td style={{ width: 160, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.submittedBy || UI_STRINGS.common.categoryManager}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        {rc.submittedAt ? new Date(rc.submittedAt).toLocaleString() : new Date(rc.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    <td style={{ width: 160 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <StatusBadge status={rc.status} />
                        {rc.status === 'PENDING_PROJECT_APPROVAL' && (
                          <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.awaitingLevel1Review}</span>
                        )}
                        {rc.status === 'PENDING_FINANCE_APPROVAL' && (
                          <span style={{ fontSize: 10, color: '#6d28d9', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.projectApprovedAwaitingFinance}</span>
                        )}
                      </div>
                    </td>

                    <td style={{ width: 120, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenReview(rc)}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: 11, height: 32, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Eye size={13} />
                        <span>{UI_STRINGS.common.review}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {hasMoreRateCards && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12, borderTop: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => { void fetchRateCards(true); }}
              disabled={loadingMoreRateCards}
              className="btn btn-secondary btn-sm"
            >{loadingMoreRateCards ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}</button>
          </div>
        )}
      </Card>

      {/* ============================================================ */}
      {/* COMPLETE APPROVAL REVIEW MODAL (Requirement 7)               */}
      {/* ============================================================ */}
      {showReviewModal && selectedCard && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div
            className="modal-content"
            style={{
              position: 'relative',
              background: '#ffffff',
              borderRadius: 8,
              width: '100%',
              maxWidth: 1100,
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            {approvalDetailsLoading && (
              <div role="status" style={{ position: 'absolute', inset: '58px 0 0', zIndex: 5, background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 13 }}>
                {UI_STRINGS.common.loading}
              </div>
            )}
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="font-mono font-bold text-primary" style={{ fontSize: 16 }}>
                    {selectedCard.rateCardNumber}
                  </span>
                  <span className="badge badge-info">{selectedCard.version || UI_STRINGS.common.v10}</span>
                  <StatusBadge status={selectedCard.status} />
                  {selectedCard.status === 'PENDING_PROJECT_APPROVAL' && (
                    <span className="badge badge-submitted">{UI_STRINGS.appAppApprovalsRateCardsPage.level1ProjectApproverQueue}</span>
                  )}
                  {selectedCard.status === 'PENDING_FINANCE_APPROVAL' && (
                    <span className="badge badge-approved" style={{ background: '#ede9fe', color: '#5b21b6' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.level2FinanceApproverQueue}</span>
                  )}
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 0', color: '#0f172a' }}>
                  {selectedCard.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { reviewRequestSequence.current += 1; setShowReviewModal(false); setApprovalDetailsLoading(false); }}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#64748b', cursor: 'pointer' }}
              >{UI_STRINGS.common.copy4i33ao}</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Submission & Approver Receipt Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, background: '#f1f5f9', padding: 14, borderRadius: 6, fontSize: 12 }}>
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.vendorDetails}</span>
                  <div style={{ fontWeight: 700 }}>{selectedCard.vendor?.name}</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>{UI_STRINGS.common.code2}{selectedCard.vendor?.code}{UI_STRINGS.common.copy17xhom3}{selectedCard.vendor?.complianceStatus}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.submissionInfo}</span>
                  <div style={{ fontWeight: 600 }}>{selectedCard.submittedBy || UI_STRINGS.common.categoryManager}</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.submitted}{selectedCard.submittedAt ? new Date(selectedCard.submittedAt).toLocaleString() : UI_STRINGS.common.copy4s9bsz}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.scopeValidity}</span>
                  <div style={{ fontWeight: 600 }}>{selectedCard.category}{UI_STRINGS.common.copy1b3t0c5}{selectedCard.scope}{UI_STRINGS.common.copyc7zu6c}</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.valid}{new Date(selectedCard.validFrom).toLocaleDateString()}{UI_STRINGS.common.copyq9aflv}{new Date(selectedCard.validTo).toLocaleDateString()}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.projectApproval}</span>
                  <div style={{ fontWeight: 600 }}>
                    {selectedCard.projectApprovedBy ? interpolateUiString(UI_STRINGS.appAppApprovalsRateCardsPage.projectApprovedBy, { "projectApprovedBy": selectedCard.projectApprovedBy }) : UI_STRINGS.appAppApprovalsRateCardsPage.pendingL1SignOff}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    {selectedCard.projectApprovedAt ? new Date(selectedCard.projectApprovedAt).toLocaleDateString() : UI_STRINGS.appAppApprovalsRateCardsPage.awaiting}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.formalAgreementStatus}</span>
                  {selectedCard.agreement && selectedCard.agreement.type !== 'NONE' ? (
                    <div>
                      <div style={{ fontWeight: 600, color: selectedCard.agreement.signature?.verified ? '#047857' : '#b45309' }}>
                        {selectedCard.agreement.signature?.verified
                          ? interpolateUiString(UI_STRINGS.appAppApprovalsRateCardsPage.signedBySignedBy, { "signedBy": selectedCard.agreement.signature.signedBy })
                          : UI_STRINGS.appAppApprovalsRateCardsPage.awaitingMandatorySignature}
                      </div>
                      <div style={{ fontSize: 11, color: '#475569' }}>
                        {selectedCard.agreement.documentTitle || UI_STRINGS.appAppApprovalsRateCardsPage.masterRateAgreement}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 600, color: '#475569' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.directSchedule}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.noFormalAgreementRequired}</div>
                    </div>
                  )}
                </div>
                {approvalHistoryError && (
                  <div role="alert" style={{ color: '#b91c1c', fontSize: 11, marginTop: 6 }}>
                    {approvalHistoryError}
                  </div>
                )}
                {selectedCard.approvalHistory?.hasMore && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { void handleLoadOlderApprovalHistory(); }}
                    disabled={loadingOlderApprovalHistory}
                    style={{ alignSelf: 'flex-start', marginTop: 8 }}
                  >
                    {loadingOlderApprovalHistory
                      ? UI_STRINGS.appAppApprovalsRateCardsPage.loadingOlderApprovalHistory
                      : UI_STRINGS.appAppApprovalsRateCardsPage.loadOlderApprovalHistory}
                  </button>
                )}
              </div>

              {/* Complete Item-wise Comparison Table (Requirement 7) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Scale size={15} color="#2563eb" />{UI_STRINGS.appAppApprovalsRateCardsPage.itemWiseCommercialComparisonMatrix}{selectedCard.items?.length || 0}{UI_STRINGS.common.items2}</h4>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.ratesBenchmarkedAgainstStandardBOQLibraryAndHistoricalProcurementRecords}</span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                  <table
                    className="table enterprise-table"
                    style={{ width: '100%', minWidth: 965, fontSize: 11, tableLayout: 'fixed' }}
                  >
                    <colgroup>
                      <col style={{ width: 50 }} />
                      <col style={{ width: 220 }} />
                      <col style={{ width: 65 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 125 }} />
                      <col style={{ width: 125 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 160 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                        <th style={{ width: 220, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.common.itemDescription}</th>
                        <th style={{ width: 65, textAlign: 'center' }}>{UI_STRINGS.common.uOM}</th>
                        <th style={{ width: 120, textAlign: 'right', background: '#ecfdf5', color: '#166534', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.proposedRate}</th>
                        <th style={{ width: 125, textAlign: 'right', background: '#eff6ff', color: '#1e40af', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.common.benchmarkRate}</th>
                        <th style={{ width: 125, textAlign: 'right', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.historicalPPORate}</th>
                        <th style={{ width: 100, textAlign: 'right' }}>{UI_STRINGS.common.variance}</th>
                        <th style={{ width: 160, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.comparisonReference}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCard.items?.map((it: any, i: number) => {
                        const diff = it.benchmarkRate ? it.benchmarkRate - it.rate : 0;
                        const diffPercent = it.benchmarkRate ? Math.round((diff / it.benchmarkRate) * 100) : 0;

                        return (
                          <tr key={it.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ width: 50 }} className="text-muted">{i + 1}</td>
                            <td style={{ width: 220, overflow: 'hidden' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.description}</div>
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {it.specification || UI_STRINGS.appAppApprovalsRateCardsPage.standardSpecificationCompliant}
                              </div>
                            </td>
                            <td style={{ width: 65, textAlign: 'center' }}><span className="badge badge-draft">{it.uom}</span></td>
                            <td style={{ width: 120, textAlign: 'right', background: '#ecfdf5', fontWeight: 700, color: '#047857', whiteSpace: 'nowrap' }}>{UI_STRINGS.common.copy1g8b5tg}{it.rate?.toLocaleString()}
                            </td>
                            <td style={{ width: 125, textAlign: 'right', background: '#eff6ff', fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>
                              {it.benchmarkRate ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.benchmarkRate?.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                            </td>
                            <td style={{ width: 125, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {it.historicalRate ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.historicalRate?.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                            </td>
                            <td style={{ width: 100, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {it.benchmarkRate ? (
                                <span className={`badge ${diff >= 0 ? 'badge-approved' : 'badge-rejected'}`} style={{ fontSize: 10 }}>
                                  {diff >= 0 ? interpolateUiString(UI_STRINGS.appAppApprovalsRateCardsPage.diffPercent, { "diffPercent": diffPercent }) : interpolateUiString(UI_STRINGS.appAppApprovalsRateCardsPage.abs, { "abs": Math.abs(diffPercent) })}
                                </span>
                              ) : (
                                <span className="text-muted">{UI_STRINGS.common.copy4s9bsz}</span>
                              )}
                            </td>
                            <td style={{ width: 160, fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {it.comparisonRef || UI_STRINGS.appAppApprovalsRateCardsPage.categoryManagerBaselineValidation}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Commercial Terms & Justification */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.commercialTermsValidity}</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    {selectedCard.terms || UI_STRINGS.appAppApprovalsRateCardsPage.standard30DaysPaymentTermsFromInvoiceCertification}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>{UI_STRINGS.appAppApprovalsRateCardsPage.supportingJustification}</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    {selectedCard.justification || UI_STRINGS.appAppApprovalsRateCardsPage.ratesNegotiatedBasedOnVolumeCommitmentAndCategoryHistoricalBenchmarks}
                  </div>
                </div>
              </div>

              {/* Conversation & Clarification Thread */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 14, background: '#ffffff' }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={14} color="#2563eb" />{UI_STRINGS.appAppApprovalsRateCardsPage.conversationClarificationThread}</h4>

                {/* Message input */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder={UI_STRINGS.appAppApprovalsRateCardsPage.askClarificationOrEnterEnquiryRemarks}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="input input-sm"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    className="btn btn-secondary btn-sm"
                    disabled={sendingMessage || !messageText.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Send size={12} />{UI_STRINGS.appAppApprovalsRateCardsPage.postMessage}</button>
                </div>

                {/* Messages / Approvals History */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {!selectedCard.approvals?.length ? (
                    <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.noMessagesOrPreviousDecisionsRecordedYet}</div>
                  ) : (
                    selectedCard.approvals.map((app: any) => (
                      <div
                        key={app.id}
                        style={{
                          background: app.action === 'CLARIFICATION_MESSAGE' ? '#eff6ff' : '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 4,
                          padding: '6px 10px',
                          fontSize: 11,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{app.approverName}</span>
                          <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 9 }}>{app.action}</span>
                          <div style={{ color: '#334155', marginTop: 2 }}>{app.remarks}</div>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>
                          {new Date(app.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.requiresRemarksIfReturningForCorrectionOrRejecting}</div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowReturnModal(true)}
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#b45309', borderColor: '#fde68a', background: '#fef3c7' }}
                  disabled={processing}
                >
                  <RotateCcw size={13} style={{ marginRight: 4 }} />{UI_STRINGS.appAppApprovalsRateCardsPage.returnForCorrection}</button>

                <button
                  type="button"
                  onClick={() => setShowRejectModal(true)}
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#b91c1c', borderColor: '#fca5a5', background: '#fee2e2' }}
                  disabled={processing}
                >
                  <XCircle size={13} style={{ marginRight: 4 }} />{UI_STRINGS.appAppApprovalsRateCardsPage.rejectRateCard}</button>

                <button
                  type="button"
                  onClick={handleApprove}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#16a34a', borderColor: '#15803d', fontWeight: 600 }}
                  disabled={processing}
                >
                  <CheckCircle2 size={13} style={{ marginRight: 4 }} />
                  {selectedCard.status === 'PENDING_PROJECT_APPROVAL'
                    ? UI_STRINGS.appAppApprovalsRateCardsPage.approveLevel1ForwardToFinance
                    : UI_STRINGS.appAppApprovalsRateCardsPage.approveLevel2ActivateRateCard}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return for Correction Modal */}
      {showReturnModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
          <div className="modal-content" style={{ background: '#ffffff', borderRadius: 8, width: 480, padding: 20 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#92400e' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.returnRateCardForCorrection}</h4>
            <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 12px' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.specifyTheRequiredModificationsOrClarificationsTheCategoryManagerWillBeNotifiedToReviseAndResubmit}</p>
            <textarea
              rows={4}
              placeholder={UI_STRINGS.appAppApprovalsRateCardsPage.mandatoryRemarksForCorrection}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="input input-sm"
              style={{ width: '100%', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="btn btn-secondary btn-sm"
                disabled={processing}
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                onClick={handleReturnForCorrection}
                className="btn btn-primary btn-sm"
                style={{ background: '#d97706', borderColor: '#b45309' }}
                disabled={processing || !actionReason.trim()}
              >{UI_STRINGS.appAppApprovalsRateCardsPage.confirmReturnForCorrection}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
          <div className="modal-content" style={{ background: '#ffffff', borderRadius: 8, width: 480, padding: 20 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#b91c1c' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.rejectRateCard2}</h4>
            <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 12px' }}>{UI_STRINGS.appAppApprovalsRateCardsPage.enterTheMandatoryRejectionReasonThisDecisionWillBeLoggedPermanentlyInTheAuditHistory}</p>
            <textarea
              rows={4}
              placeholder={UI_STRINGS.appAppApprovalsRateCardsPage.mandatoryRejectionReason}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="input input-sm"
              style={{ width: '100%', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="btn btn-secondary btn-sm"
                disabled={processing}
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                onClick={handleReject}
                className="btn btn-primary btn-sm"
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                disabled={processing || !actionReason.trim()}
              >{UI_STRINGS.common.confirmRejection}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
