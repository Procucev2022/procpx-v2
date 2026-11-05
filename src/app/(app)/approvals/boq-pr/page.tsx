'use client';
// src/app/(app)/approvals/boq-pr/page.tsx - PR Approvals Workspace for Project Approver
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  FileText,
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
  Send,
  Loader2,
  CheckSquare,
  RotateCcw,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCardGrid, SummaryCard } from '@/components/ui/SummaryCard';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export default function BoqPrApprovalPage() {
  const toast = useToast();
  const [queue, setQueue] = useState<any[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [totalPendingValue, setTotalPendingValue] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPr, setSelectedPr] = useState<any | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const reviewRequestSequence = useRef(0);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Chat / Enquiry Drawer state
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatPr, setChatPr] = useState<any | null>(null);
  const [isEnquiryMode, setIsEnquiryMode] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/approvals?type=PR&page=${nextPage}&pageSize=25`);
      if (res.ok) {
        const data = await res.json();
        const items = data.prQueue || [];
        setQueue((current) => append ? [...current, ...items] : items);
        setQueueTotal(Number(data.pagination?.queues?.pr?.total ?? items.length));
        setTotalPendingValue(Number(data.totals?.prPendingAmount ?? items.reduce((sum: number, item: { totalEstimatedValue?: number | null }) => sum + Number(item.totalEstimatedValue || 0), 0)));
        setPage(Number(data.pagination?.page ?? nextPage));
        setTotalPages(Number(data.pagination?.queues?.pr?.totalPages ?? 1));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadPrReview = async (pr: { id: string }) => {
    const sequence = ++reviewRequestSequence.current;
    setSelectedPr(pr);
    setReviewModalOpen(true);
    setReviewLoading(true);
    setReviewError('');
    try {
      const response = await fetch(`/api/pr/${pr.id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || UI_STRINGS.common.userMessages.failedToFetchProcurementRequests);
      if (sequence !== reviewRequestSequence.current) return;
      const detail = body.data ?? body;
      setSelectedPr({ ...pr, ...detail });
    } catch (error) {
      if (sequence === reviewRequestSequence.current) {
        console.error('Failed to load purchase request review details', error);
        setReviewError(UI_STRINGS.common.userMessages.failedToFetchProcurementRequests);
      }
    } finally {
      if (sequence === reviewRequestSequence.current) setReviewLoading(false);
    }
  };

  const handleApprove = async (prId: string) => {
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch(`/api/pr/${prId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: 'Technical requirement and quantity verified.' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.approvalFailed }));
      }
      toast.success(UI_STRINGS.common.bOQApprovedSuccessfully, selectedPr?.prNumber || prId, UI_STRINGS.common.userMessages.releasedToCategoryManager);
      setStatusMessage(UI_STRINGS.common.bOQApprovedSuccessfully);
      setReviewModalOpen(false);
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRevert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPr || !revertReason.trim()) return;
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch(`/api/pr/${selectedPr.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revertReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.revertFailed }));
      }
      setRevertModalOpen(false);
      setRevertReason('');
      setSelectedPr(null);
      setStatusMessage(UI_STRINGS.common.bOQSuccessfullyReturnedToProjectUserForCorrection);
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPr || !rejectReason.trim()) return;
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch(`/api/pr/${selectedPr.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.rejectionFailed }));
      }
      setRejectModalOpen(false);
      setRejectReason('');
      setSelectedPr(null);
      setStatusMessage(UI_STRINGS.common.bOQRejectedAndReturnedToRequesterWithFeedbackRemarks);
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const openEnquiry = (pr: any) => {
    setChatPr(pr);
    setIsEnquiryMode(true);
    setChatDrawerOpen(true);
  };

  const openChat = (pr: any) => {
    setChatPr(pr);
    setIsEnquiryMode(false);
    setChatDrawerOpen(true);
  };

  const pendingClarifications = queue.filter(item => item.hasEnquiry).length;

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <PageHeader
        title={UI_STRINGS.common.bOQApprovals}
        subtitle={UI_STRINGS.appAppApprovalsBoqPrPage.commercialBOQsAwaitingProjectApproverDecisionIndependentOfBudgetApprovalWorkflow}
        badge={<span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{UI_STRINGS.common.projectApprover}</span>}
        actions={
          <Link href="/approvals/budget" className="btn btn-secondary" style={{ height: 40, display: 'inline-flex', alignItems: 'center' }}>{UI_STRINGS.appAppApprovalsBoqPrPage.switchToBudgetApprovals}</Link>
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={3} className="mb-6">
        <SummaryCard
          label={UI_STRINGS.common.pendingQueue}
          value={loading ? '—' : `${queueTotal} BOQs`}
          secondary={UI_STRINGS.common.awaitingProjectApproverSignOff}
          icon={<Clock size={16} />}
          accent="amber"
        />
        <SummaryCard
          label={UI_STRINGS.appAppApprovalsBoqPrPage.totalValueUnderReview}
          value={loading ? '—' : `₹ ${totalPendingValue.toLocaleString(I18N_CONFIG.defaultLocale)}`}
          secondary={UI_STRINGS.appAppApprovalsBoqPrPage.aggregateEstimatedCommitment}
          icon={<FileSpreadsheet size={16} />}
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

      {/* BOQ Table */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.bOQCodeID}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.appAppApprovalsBoqPrPage.bOQNameDescription}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.project}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.costCentre2}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.category2}</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>{UI_STRINGS.common.amount}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.requester}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.bOQDate}</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.status}</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppApprovalsBoqPrPage.loadingBOQApprovalsQueue}</td>
              </tr>
            ) : queue.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppApprovalsBoqPrPage.noBOQsAwaitingProjectApproverDecision}</td>
              </tr>
            ) : (
              queue.map(pr => (
                <tr key={pr.id} style={{ borderBottom: '1px solid #f1f5f9', height: 56 }}>
                  <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                    <div>{pr.prNumber}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{pr.boq?.boqCode || ''}</div>
                  </td>
                  <td style={{ padding: '0 16px', fontWeight: 600, color: '#0f172a' }}>
                    <div>{pr.title}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{pr.totalLines || 0}{UI_STRINGS.common.lineItems}</div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#334155' }}>
                    <div style={{ fontWeight: 500 }}>{pr.project?.name || UI_STRINGS.common.copy4s9bsz}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{pr.project?.projectCode}</div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#0f172a' }}>
                    <div style={{ fontWeight: 600 }}>{pr.costCentre?.code}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{pr.costCentre?.name}</div>
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155', fontWeight: 500 }}>
                      {(pr.categories || []).join(', ') || UI_STRINGS.common.standard}
                      {pr.remainingCategoryCount > 0 && (
                        <span style={{ marginLeft: 4 }}>{interpolateUiString(UI_STRINGS.common.additionalCategoryCount, { count: pr.remainingCategoryCount })}</span>
                      )}
                    </span>
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{(pr.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ padding: '0 16px', color: '#334155' }}>
                    <div style={{ fontWeight: 600 }}>{pr.requesterName || pr.requestedBy}</div>
                    {pr.requesterEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{pr.requesterEmail}</div>}
                  </td>
                  <td style={{ padding: '0 16px', color: '#64748b', fontSize: 12 }}>
                    {new Date(pr.requestedDate || pr.createdAt).toLocaleDateString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <span className="badge badge-warning" style={{ fontSize: 11, padding: '3px 8px' }}>{UI_STRINGS.common.underReview}</span>
                    {pr.hasEnquiry && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>{UI_STRINGS.common.clarificationPending}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        title={UI_STRINGS.common.reviewCompleteBOQDetailsAndLineItems}
                        onClick={() => { void loadPrReview(pr); }}
                      >
                        <Eye size={12} />{UI_STRINGS.common.reviewBOQ}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                        title={UI_STRINGS.common.sendQueryOrClarificationToSubmitter}
                        onClick={() => openEnquiry(pr)}
                      >
                        <HelpCircle size={12} />{UI_STRINGS.common.message}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
                        title={UI_STRINGS.common.openCommunicationAndChatHistory}
                        onClick={() => openChat(pr)}
                      >
                        <MessageSquare size={12} />{UI_STRINGS.common.chat}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                        title={UI_STRINGS.common.revertBOQToProjectUserForCorrection}
                        onClick={() => {
                          setSelectedPr(pr);
                          setRevertModalOpen(true);
                        }}
                        disabled={processing}
                      >
                        <RotateCcw size={12} />{UI_STRINGS.common.revert}</button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ height: 28, padding: '0 10px', fontSize: 11, background: '#047857', borderColor: '#047857' }}
                        onClick={() => handleApprove(pr.id)}
                        disabled={processing}
                        title={UI_STRINGS.common.approveBOQAndReleaseToCategoryManager}
                      >
                        <CheckCircle2 size={12} />{UI_STRINGS.common.approve}</button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                        onClick={() => {
                          setSelectedPr(pr);
                          setRejectModalOpen(true);
                        }}
                        disabled={processing}
                        title={UI_STRINGS.common.rejectBOQWithMandatoryReason}
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

      {/* REVIEW PR MODAL */}
      {reviewModalOpen && selectedPr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 780, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.common.bOQDetails}{selectedPr.prNumber}
                </h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedPr.title}{UI_STRINGS.common.costCentre}{selectedPr.costCentre?.code}{UI_STRINGS.common.copy1b3t0c5}{selectedPr.costCentre?.name}{UI_STRINGS.common.copyc7zu6c}</div>
              </div>
              <button type="button" onClick={() => { reviewRequestSequence.current += 1; setReviewModalOpen(false); setReviewLoading(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            {/* PR Metadata Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.sourceBOQ}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{selectedPr.boq?.boqCode}{UI_STRINGS.common.copy1b3t0c5}{selectedPr.boqRevision?.revisionCode || UI_STRINGS.common.r0}{UI_STRINGS.common.copyc7zu6c}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.requester}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{selectedPr.requesterName || selectedPr.requestedBy}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.totalLineItems}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{selectedPr.totalLines ?? selectedPr.lines?.length ?? 0}{UI_STRINGS.common.lines}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.requestedValue}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copytfdhmk}{(selectedPr.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}</div>
              </div>
            </div>

            {/* Line items table */}
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 16 }}>
              <table className="table" style={{ width: '100%', fontSize: 12 }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr style={{ height: 36, borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0 10px', width: 45 }}>{UI_STRINGS.common.sNo2}</th>
                    <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.bOQDescription}</th>
                    <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.category2}</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                    <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.uOM}</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.rate}</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewLoading ? (
                    <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center' }}>{UI_STRINGS.common.loading}</td></tr>
                  ) : reviewError ? (
                    <tr><td colSpan={8} role="alert" style={{ padding: 20, textAlign: 'center' }}>{reviewError}</td></tr>
                  ) : (selectedPr.lines || []).map((line: any, idx: number) => (
                    <tr key={line.id || idx} style={{ borderBottom: '1px solid #f1f5f9', height: 40 }}>
                      <td style={{ padding: '0 10px', color: '#64748b' }}>{line.lineNumber || idx + 1}</td>
                      <td style={{ padding: '0 10px', fontWeight: 600, color: '#0f172a' }}>{line.itemDescription}</td>
                      <td style={{ padding: '0 10px', color: '#64748b', maxWidth: 220 }}>
                        <BoqDescriptionCell
                          text={line.specification || line.boqLine?.specification}
                          itemDescription={line.itemDescription}
                          lineNumber={line.lineNumber || idx + 1}
                          maxWidth={210}
                          clampLines={2}
                        />
                      </td>
                      <td style={{ padding: '0 10px', color: '#475569' }}>{line.category}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 600 }}>{line.quantity}</td>
                      <td style={{ padding: '0 10px', color: '#64748b' }}>{line.uom}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right' }}>{(line.estimatedRate || 0).toLocaleString(I18N_CONFIG.defaultLocale)}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{(line.estimatedValue || (line.quantity * (line.estimatedRate || 0))).toLocaleString(I18N_CONFIG.defaultLocale)}
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
                    setReviewModalOpen(false);
                    openEnquiry(selectedPr);
                  }}
                >
                  <HelpCircle size={13} />{UI_STRINGS.common.askClarification}</button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setReviewModalOpen(false);
                    openChat(selectedPr);
                  }}
                >
                  <MessageSquare size={13} />{UI_STRINGS.common.chatWithRequester}</button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReviewModalOpen(false)}
                >{UI_STRINGS.common.close}</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                  onClick={() => {
                    setReviewModalOpen(false);
                    setRevertModalOpen(true);
                  }}
                  disabled={processing}
                >
                  <RotateCcw size={14} />{UI_STRINGS.common.revertForCorrection}</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                  onClick={() => {
                    setReviewModalOpen(false);
                    setRejectModalOpen(true);
                  }}
                  disabled={processing}
                >
                  <XCircle size={14} />{UI_STRINGS.common.rejectBOQ}</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#047857', borderColor: '#047857' }}
                  onClick={() => handleApprove(selectedPr.id)}
                  disabled={processing}
                >
                  <CheckCircle2 size={14} />{UI_STRINGS.common.approveReleaseToProcurement}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVERT MODAL */}
      {revertModalOpen && selectedPr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#b45309' }}>
              <RotateCcw size={20} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.common.revertBOQForCorrection}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>{UI_STRINGS.common.specifyTheCorrectionInstructionsFor}<strong>{selectedPr.prNumber}</strong>{UI_STRINGS.common.copy1b3t0c5}{selectedPr.title}{UI_STRINGS.common.theBOQWillBeReturnedToTheSubmittingProjectUserWithTheseFeedbackRemarks}</p>

            <form onSubmit={handleRevert}>
              <textarea
                value={revertReason}
                onChange={e => setRevertReason(e.target.value)}
                placeholder={UI_STRINGS.common.specificReasonsAndCorrectionInstructionsForProjectUserMandatory}
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
                    setRevertModalOpen(false);
                    setRevertReason('');
                  }}
                  disabled={processing}
                >{UI_STRINGS.common.cancel}</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#b45309', borderColor: '#b45309' }}
                  disabled={processing || !revertReason.trim()}
                >
                  {processing ? UI_STRINGS.common.reverting : UI_STRINGS.common.confirmRevertForCorrection}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && selectedPr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>{UI_STRINGS.common.rejectPurchaseRequest}</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>{UI_STRINGS.common.pleaseStateTheSpecificReasonForRejecting}<strong>{selectedPr.prNumber}</strong>{UI_STRINGS.common.theRequestWillBeReturnedToTheRequesterWithTheseFeedbackRemarks}</p>

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
      {chatPr && (
        <ApprovalChatDrawer
          isOpen={chatDrawerOpen}
          onClose={() => {
            setChatDrawerOpen(false);
            setChatPr(null);
          }}
          entityType="PR"
          entityId={chatPr.id}
          entityCode={chatPr.prNumber}
          title={chatPr.title}
          costCentre={chatPr.costCentre?.code}
          category={(chatPr.categories || []).join(', ')}
          amount={chatPr.totalEstimatedValue}
          initialEnquiryMode={isEnquiryMode}
          onMessageSent={loadQueue}
        />
      )}
    </div>
  );
}
