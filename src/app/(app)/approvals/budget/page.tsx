'use client';
// src/app/(app)/approvals/budget/page.tsx - Budget Approvals Workspace for Project Approver
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Landmark,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  X,
  Eye,
  MessageSquare,
  HelpCircle,
  PieChart,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCardGrid, SummaryCard } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export default function BudgetApprovalQueuePage() {
  const toast = useToast();
  const [queue, setQueue] = useState<any[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [totalProposedValue, setTotalProposedValue] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedContrib, setSelectedContrib] = useState<any | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const reviewRequestSequence = useRef(0);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Chat / Enquiry Drawer state
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatContrib, setChatContrib] = useState<any | null>(null);
  const [isEnquiryMode, setIsEnquiryMode] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/approvals?type=BUDGET&page=${nextPage}&pageSize=25`);
      if (res.ok) {
        const data = await res.json();
        const items = data.budgetQueue || [];
        setQueue((current) => append ? [...current, ...items] : items);
        setQueueTotal(Number(data.pagination?.queues?.budget?.total ?? items.length));
        setTotalProposedValue(Number(data.totals?.budgetPendingAmount ?? items.reduce((sum: number, item: { totalEstimatedValue?: number | null }) => sum + Number(item.totalEstimatedValue || 0), 0)));
        setPage(Number(data.pagination?.page ?? nextPage));
        setTotalPages(Number(data.pagination?.queues?.budget?.totalPages ?? 1));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadContributionReview = async <T extends { id: string },>(contribution: T) => {
    const sequence = ++reviewRequestSequence.current;
    setSelectedContrib(contribution);
    setReviewModalOpen(true);
    setReviewLoading(true);
    setReviewError('');
    try {
      const response = await fetch(`/api/budgets/${contribution.id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData);
      if (sequence !== reviewRequestSequence.current) return;
      const detail = body.data ?? body;
      setSelectedContrib({ ...contribution, ...detail });
    } catch (error) {
      if (sequence === reviewRequestSequence.current) {
        console.error('Failed to load budget contribution review details', error);
        setReviewError(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData);
      }
    } finally {
      if (sequence === reviewRequestSequence.current) setReviewLoading(false);
    }
  };

  const closeReview = () => {
    reviewRequestSequence.current += 1;
    setReviewModalOpen(false);
    setReviewLoading(false);
  };

  const handleApprove = async (contribId: string) => {
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch('/api/budgets/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributionId: contribId, remarks: 'Technical scope and estimates approved at Project stage.' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.approvalFailed }));
      }
      toast.success(UI_STRINGS.common.budgetApprovedSuccessfully, selectedContrib?.category?.name || selectedContrib?.categories?.[0], UI_STRINGS.common.underFinanceApproval);
      setStatusMessage(UI_STRINGS.common.budgetApprovedSuccessfully);
      closeReview();
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContrib || !rejectReason.trim()) return;
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch('/api/budgets/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributionId: selectedContrib.id, reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.rejectionFailed }));
      }
      setRejectModalOpen(false);
      setRejectReason('');
      setSelectedContrib(null);
      setStatusMessage(UI_STRINGS.common.budgetContributionRejectedWithAuditNotes);
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const openEnquiry = (item: any) => {
    setChatContrib(item);
    setIsEnquiryMode(true);
    setChatDrawerOpen(true);
  };

  const openChat = (item: any) => {
    setChatContrib(item);
    setIsEnquiryMode(false);
    setChatDrawerOpen(true);
  };

  const pendingClarifications = queue.filter(item => item.hasEnquiry).length;

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <PageHeader
        title={UI_STRINGS.appAppApprovalsBudgetPage.budgetApprovals}
        subtitle={UI_STRINGS.appAppApprovalsBudgetPage.reviewCategoryWiseBudgetContributionsAwaitingProjectApproverApprovalProjectApprovalAdvancesContributionsToFinanceApproval}
        badge={<span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{UI_STRINGS.common.projectApprover}</span>}
        actions={
          <Link href="/approvals/boq-pr" className="btn btn-secondary" style={{ height: 40, display: 'inline-flex', alignItems: 'center' }}>{UI_STRINGS.appAppApprovalsBudgetPage.switchToPRApprovals}</Link>
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={3} className="mb-6">
        <SummaryCard
          label={UI_STRINGS.common.pendingQueue}
          value={loading ? '—' : `${queueTotal} Allocations`}
          secondary={UI_STRINGS.common.awaitingProjectApproverSignOff}
          icon={<Clock size={16} />}
          accent="amber"
        />
        <SummaryCard
          label={UI_STRINGS.appAppApprovalsBudgetPage.proposedContributionTotal}
          value={loading ? '—' : `₹ ${totalProposedValue.toLocaleString(I18N_CONFIG.defaultLocale)}`}
          secondary={UI_STRINGS.appAppApprovalsBudgetPage.toBeRoutedToFinanceApproval}
          icon={<Landmark size={16} />}
          accent="emerald"
        />
        <SummaryCard
          label={UI_STRINGS.common.clarificationsActive}
          value={loading ? '—' : `${pendingClarifications} Inquiries`}
          secondary={UI_STRINGS.common.queriesPendingResolution}
          icon={<HelpCircle size={16} />}
          accent="blue"
        />
      </SummaryCardGrid>

      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>{UI_STRINGS.common.copy4i33ao}</button>
        </div>
      )}

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>{UI_STRINGS.common.copy4i33ao}</button>
        </div>
      )}

      {/* Queue Table */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.bOQNumber}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.bOQDescription}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.costCentre2}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.category2}</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>{UI_STRINGS.common.proposedAmount}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.submittedBy}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.submissionDate}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.status}</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppApprovalsBudgetPage.loadingBudgetApprovalsQueue}</td>
              </tr>
            ) : queue.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppApprovalsBudgetPage.noBudgetContributionsCurrentlyAwaitingProjectApproverApproval}</td>
              </tr>
            ) : (
              queue.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', height: 56 }}>
                  <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                    <div>{item.boq?.boqCode || UI_STRINGS.common.copy4s9bsz}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{item.boqRevision?.revisionCode || UI_STRINGS.common.r0}</div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#0f172a', maxWidth: 200 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.boq?.title || UI_STRINGS.common.bOQFitoutScope}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {item.project?.name}
                    </div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#0f172a' }}>
                    <div style={{ fontWeight: 600 }}>{item.costCentre?.code}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{item.costCentre?.name}</div>
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155', fontWeight: 500 }}>
                      {(item.categories || []).join(', ') || UI_STRINGS.common.general}
                      {item.remainingCategoryCount > 0 && (
                        <span style={{ marginLeft: 4 }}>{interpolateUiString(UI_STRINGS.common.additionalCategoryCount, { count: item.remainingCategoryCount })}</span>
                      )}
                    </span>
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{(item.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ padding: '0 16px', color: '#334155' }}>
                    <div style={{ fontWeight: 600 }}>{item.submitterName || UI_STRINGS.common.projectUser}</div>
                    {item.submitterEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{item.submitterEmail}</div>}
                  </td>
                  <td style={{ padding: '0 16px', color: '#64748b' }}>
                    {new Date(item.submittedAt || item.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <span className="badge badge-warning" style={{ fontSize: 11, padding: '3px 8px' }}>{UI_STRINGS.common.underProjectApproval}</span>
                    {item.hasEnquiry && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>{UI_STRINGS.common.clarificationPending}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        title={UI_STRINGS.appAppApprovalsBudgetPage.reviewBOQLineItemsAndCostCentreBudgetImpact}
                        onClick={() => { void loadContributionReview(item); }}
                      >
                        <Eye size={12} />{UI_STRINGS.appAppApprovalsBudgetPage.review}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                        title={UI_STRINGS.appAppApprovalsBudgetPage.requestClarificationFromSubmitter}
                        onClick={() => openEnquiry(item)}
                      >
                        <HelpCircle size={12} />{UI_STRINGS.common.enquire}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        title={UI_STRINGS.common.openCommunicationHistory}
                        onClick={() => openChat(item)}
                      >
                        <MessageSquare size={12} />{UI_STRINGS.common.chat}</button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ height: 28, padding: '0 10px', fontSize: 11, background: '#047857', borderColor: '#047857' }}
                        onClick={() => handleApprove(item.id)}
                        disabled={processing}
                      >
                        <CheckCircle2 size={12} />{UI_STRINGS.common.approve}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#dc2626' }}
                        onClick={() => {
                          setSelectedContrib(item);
                          setRejectModalOpen(true);
                        }}
                        disabled={processing}
                      >
                        <XCircle size={12} />{UI_STRINGS.common.reject}</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {page < totalPages && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px 0' }}>
          <span style={{ color: '#64748b', fontSize: 12 }}>{interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: String(page), value2: String(totalPages) })}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={loadingMore} onClick={() => loadQueue(page + 1, true)}>
            {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
          </button>
        </div>
      )}

      {/* REVIEW BUDGET CONTRIBUTION MODAL */}
      {reviewModalOpen && selectedContrib && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 800, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>{selectedContrib.boq?.boqCode
                  ? interpolateUiString(UI_STRINGS.appAppApprovalsBudgetPage.budgetReviewTitleWithCode, { boqCode: selectedContrib.boq.boqCode, revisionCode: selectedContrib.boqRevision?.revisionCode || UI_STRINGS.common.r0 })
                  : interpolateUiString(UI_STRINGS.appAppApprovalsBudgetPage.budgetReviewTitleWithoutCode, { revisionCode: selectedContrib.boqRevision?.revisionCode || UI_STRINGS.common.r0 })}</h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedContrib.project?.name}{UI_STRINGS.common.costCentre}{selectedContrib.costCentre?.code}{UI_STRINGS.common.copy1b3t0c5}{selectedContrib.costCentre?.name}{UI_STRINGS.common.copyc7zu6c}</div>
              </div>
              <button type="button" onClick={closeReview} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            {/* Cost Centre Budget Financial Impact Box */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{UI_STRINGS.appAppApprovalsBudgetPage.currentApprovedBudget}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.common.copy1g8b5tg}{(selectedContrib.financialImpact?.currentApprovedAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppApprovalsBudgetPage.existingSanction}</div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
                <div style={{ fontSize: 11, color: '#d97706', marginBottom: 2 }}>{UI_STRINGS.common.proposedContribution}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#d97706' }}>{UI_STRINGS.common.copy1ryoj2d}{(selectedContrib.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppApprovalsBudgetPage.awaitingApprovals}</div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
                <div style={{ fontSize: 11, color: '#047857', marginBottom: 2 }}>{UI_STRINGS.appAppApprovalsBudgetPage.projectedApprovedTotal}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{(selectedContrib.financialImpact?.projectedApprovedTotal || selectedContrib.totalEstimatedValue).toLocaleString(I18N_CONFIG.defaultLocale)}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppApprovalsBudgetPage.postFinanceSanction}</div>
              </div>
            </div>

            {/* Category Contributions */}
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: '0 0 8px 0' }}>{UI_STRINGS.common.categoryWiseAllocationBreakdown}</h4>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(selectedContrib.transactions || []).map((tx: any) => (
                  <div key={tx.id} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{tx.category}{UI_STRINGS.common.copy13emybb}</span>
                    <span style={{ color: '#047857', fontWeight: 700 }}>{UI_STRINGS.common.copytfdhmk}{(tx.amount || 0).toLocaleString(I18N_CONFIG.defaultLocale)}</span>
                    {tx.quantity && <span style={{ color: '#64748b' }}>{UI_STRINGS.common.copy1b3t0c5}{tx.quantity} {tx.uom}{UI_STRINGS.common.copyc7zu6c}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Line items detail table */}
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 16 }}>
              <table className="table" style={{ width: '100%', fontSize: 12 }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr style={{ height: 36, borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0 10px', width: 45 }}>{UI_STRINGS.common.sNo2}</th>
                    <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.category2}</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                    <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.uOM}</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.rate}</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.total}</th>
                  </tr>
                </thead>
                <tbody>
                {reviewLoading ? (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center' }}>{UI_STRINGS.common.loading}</td></tr>
                ) : reviewError ? (
                  <tr><td colSpan={7} role="alert" style={{ padding: 20, textAlign: 'center' }}>{reviewError}</td></tr>
                ) : (selectedContrib.boqRevision?.lines || []).map((line: any, idx: number) => (
                    <tr key={line.id || idx} style={{ borderBottom: '1px solid #f1f5f9', height: 38 }}>
                      <td style={{ padding: '0 10px', color: '#64748b' }}>{line.lineNumber || idx + 1}</td>
                      <td style={{ padding: '0 10px', fontWeight: 600, color: '#0f172a' }}>
                        {line.standardDescription || line.originalDescription}
                      </td>
                      <td style={{ padding: '0 10px', color: '#475569' }}>{line.category?.name || UI_STRINGS.common.general}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 600 }}>{line.quantity}</td>
                      <td style={{ padding: '0 10px', color: '#64748b' }}>{line.uomRaw || UI_STRINGS.common.nOS}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right' }}>{(line.aiUnitCost || 0).toLocaleString(I18N_CONFIG.defaultLocale)}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{(line.aiTotalCost || (line.quantity * (line.aiUnitCost || 0))).toLocaleString(I18N_CONFIG.defaultLocale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                  onClick={() => {
                    closeReview();
                    openEnquiry(selectedContrib);
                  }}
                >
                  <HelpCircle size={13} />{UI_STRINGS.common.askClarification}</button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    closeReview();
                    openChat(selectedContrib);
                  }}
                >
                  <MessageSquare size={13} />{UI_STRINGS.appAppApprovalsBudgetPage.chatWithSubmitter}</button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeReview}
                >{UI_STRINGS.common.close}</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: '#dc2626' }}
                  onClick={() => {
                    closeReview();
                    setRejectModalOpen(true);
                  }}
                >
                  <XCircle size={14} />{UI_STRINGS.common.rejectContribution}</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#047857', borderColor: '#047857' }}
                  onClick={() => handleApprove(selectedContrib.id)}
                  disabled={processing || reviewLoading || Boolean(reviewError)}
                >
                  <CheckCircle2 size={14} />{UI_STRINGS.appAppApprovalsBudgetPage.approveRouteToFinance}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && selectedContrib && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>{UI_STRINGS.common.rejectBudgetContribution}</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>{UI_STRINGS.appAppApprovalsBudgetPage.pleaseStateTheSpecificReasonForRejectingTheBudgetContributionFor}<strong>{selectedContrib.boq?.boqCode}</strong>{UI_STRINGS.appAppApprovalsBudgetPage.againstCostCentre}<strong>{selectedContrib.costCentre?.code}</strong>{UI_STRINGS.common.copyby08hd}</p>

            <form onSubmit={handleReject}>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder={UI_STRINGS.common.reasonForRejectionMandatory}
                rows={4}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  marginBottom: 16,
                  outline: 'none',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRejectModalOpen(false);
                    setRejectReason('');
                  }}
                  disabled={processing}
                >{UI_STRINGS.common.cancel}</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#dc2626', borderColor: '#dc2626' }}
                  disabled={processing || !rejectReason.trim()}
                >
                  {processing ? UI_STRINGS.common.rejecting : UI_STRINGS.common.confirmRejection}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHAT / ENQUIRY DRAWER */}
      {chatContrib && (
        <ApprovalChatDrawer
          isOpen={chatDrawerOpen}
          onClose={() => {
            setChatDrawerOpen(false);
            setChatContrib(null);
          }}
          entityType="BUDGET"
          entityId={chatContrib.id}
          entityCode={chatContrib.boq?.boqCode}
          title={chatContrib.boq?.title}
          costCentre={chatContrib.costCentre?.code}
          category={(chatContrib.categories || []).join(', ')}
          amount={chatContrib.totalEstimatedValue}
          initialEnquiryMode={isEnquiryMode}
          onMessageSent={loadQueue}
        />
      )}
    </div>
  );
}
