'use client';
// src/app/(app)/pr/page.tsx - Procurement Requests (My PRs) Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Send,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export default function MyPrsPage() {
  const toast = useToast();
  const [prs, setPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatPr, setChatPr] = useState<any | null>(null);

  useEffect(() => {
    void loadPrs(1, false);
  }, [statusFilter, search]);

  const prRequestSequence = useRef(0);
  const submittingPrIds = useRef<Set<string>>(new Set());

  const loadPrs = async (requestedPage = 1, append = false) => {
    const sequence = ++prRequestSequence.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(requestedPage), pageSize: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/pr?${params.toString()}`);
      if (sequence !== prRequestSequence.current) return;
      if (res.ok) {
        const payload = await res.json();
        const data = Array.isArray(payload) ? payload : payload.data;
        if (Array.isArray(data)) {
          const allRows = append ? [...prs, ...data] : data;
          const fallbackStatusCounts = allRows.reduce<Record<string, number>>((counts, pr) => {
            counts[pr.status] = (counts[pr.status] || 0) + 1;
            return counts;
          }, {});
          setPrs((previous) => append ? [...previous, ...data] : data);
          setPage(payload.page ?? requestedPage);
          setTotalPages(payload.totalPages ?? 1);
          setTotalCount(payload.total ?? data.length);
          setStatusCounts(payload.statusCounts ?? fallbackStatusCounts);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (sequence === prRequestSequence.current && append) setLoadingMore(false);
      else if (sequence === prRequestSequence.current) setLoading(false);
    }
  };

  const handleSubmit = async (prId: string) => {
    if (submittingPrIds.current.has(prId)) return;
    submittingPrIds.current.add(prId);
    try {
      const res = await fetch(`/api/pr/${prId}/submit`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSubmitPr }));
      }
      toast.success(UI_STRINGS.appAppPrPage.pRSubmittedSuccessfully, prId, UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover);
      setStatusMessage(UI_STRINGS.appAppPrPage.pRSubmittedSuccessfully);
      loadPrs();
    } catch (err: any) {
      toast.error(err.message || UI_STRINGS.common.userMessages.errorSubmittingPr);
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": err.message }));
    } finally {
      submittingPrIds.current.delete(prId);
    }
  };

  const filtered = prs.filter(pr => {
    if (search) {
      const q = search.toLowerCase();
      return (
        pr.prNumber.toLowerCase().includes(q) ||
        pr.title.toLowerCase().includes(q) ||
        (pr.project?.name && pr.project.name.toLowerCase().includes(q)) ||
        (pr.costCentre?.name && pr.costCentre.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate stats
  const releasedCount = statusCounts.PR_RELEASED_TO_PROCUREMENT || 0;
  const pendingCount = statusCounts.PR_PENDING_PROJECT_APPROVAL || 0;
  const draftOrReturnedCount = (statusCounts.PR_DRAFT || 0) + (statusCounts.PR_RETURNED_FOR_CORRECTION || 0);

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <PageHeader
        title={UI_STRINGS.appAppPrPage.procurementRequests}
        subtitle={UI_STRINGS.appAppPrPage.commercialPRsAndProjectBOQsSubmittedForValidationAndReleasedToSourcing}
        actions={
          <div className="flex gap-2">
            <Link href="/pr/new" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{UI_STRINGS.appAppPrPage.createPR}</Link>
            <Link href="/boq/studio" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} />{UI_STRINGS.common.bOQStudio}</Link>
          </div>
        }
      />

      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>{UI_STRINGS.common.copy4i33ao}</button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="mb-6">
        <SummaryCardGrid columns={4}>
          <SummaryCard
            label={UI_STRINGS.appAppPrPage.totalPRs}
            value={totalCount}
            secondary={UI_STRINGS.appAppPrPage.allProcurementRequests}
            icon={<FileSpreadsheet size={16} />}
            accent="default"
          />
          <SummaryCard
            label={UI_STRINGS.appAppPrPage.releasedToSourcing}
            value={releasedCount}
            secondary={UI_STRINGS.appAppPrPage.availableForRFQs}
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
          <SummaryCard
            label={UI_STRINGS.common.pendingApproval}
            value={pendingCount}
            secondary={UI_STRINGS.appAppPrPage.withProjectApprover}
            icon={<Clock size={16} />}
            accent="amber"
          />
          <SummaryCard
            label={UI_STRINGS.appAppPrPage.draftCorrections}
            value={draftOrReturnedCount}
            secondary={UI_STRINGS.appAppPrPage.requiresAction}
            icon={<RotateCcw size={16} />}
            accent="slate"
          />
        </SummaryCardGrid>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 flex gap-3 items-center flex-wrap">
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
          <input
            type="text"
            className="form-control"
            placeholder={UI_STRINGS.appAppPrPage.searchPRNumberTitleProjectOrCostCentre}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ paddingLeft: 38, height: 40, width: '100%' }}
          />
        </div>

        <select
          className="form-control"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 40, width: 220 }}
        >
          <option value="">{UI_STRINGS.common.allStatuses}</option>
          <option value="PR_DRAFT">{UI_STRINGS.common.draft}</option>
          <option value="PR_PENDING_PROJECT_APPROVAL">{UI_STRINGS.common.pendingApproval}</option>
          <option value="PR_RETURNED_FOR_CORRECTION">{UI_STRINGS.common.returnedForCorrection}</option>
          <option value="PR_APPROVED">{UI_STRINGS.appAppPrPage.projectApproved}</option>
          <option value="PR_RELEASED_TO_PROCUREMENT">{UI_STRINGS.common.releasedToProcurement}</option>
          <option value="PR_REJECTED">{UI_STRINGS.common.rejected}</option>
        </select>
      </div>

      {/* PR Register Table - adhering to Rule 9 */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, minWidth: 1000 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 140 }}>{UI_STRINGS.common.pRNumber}</th>
                <th style={{ padding: '0 16px', fontWeight: 600, minWidth: 220 }}>{UI_STRINGS.appAppPrPage.packageDescription}</th>
                <th style={{ padding: '0 16px', fontWeight: 600, minWidth: 160 }}>{UI_STRINGS.common.projectCostCentre}</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 90, textAlign: 'center' }}>{UI_STRINGS.common.items4}</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 140, textAlign: 'right' }}>{UI_STRINGS.common.pRAmount}</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 150, textAlign: 'center' }}>{UI_STRINGS.common.approvalStatus}</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 180, textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />{UI_STRINGS.appAppPrPage.loadingProcurementRequests}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center' }}>
                    <EmptyState
                      icon={<FileSpreadsheet size={36} />}
                      title={UI_STRINGS.appAppPrPage.noPRsFound}
                      description={search || statusFilter ? UI_STRINGS.appAppPrPage.tryClearingFiltersToFindMoreRecords : UI_STRINGS.appAppPrPage.createAPROrDeriveOneFromABOQInBOQStudio}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map(pr => {
                  return (
                    <tr key={pr.id} style={{ borderBottom: '1px solid #f1f5f9', height: 54 }}>
                      <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                        <div className="font-mono text-sm">{pr.prNumber}</div>
                        {pr.boq?.boqCode && (
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{UI_STRINGS.common.bOQ2}{pr.boq.boqCode}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0 16px', fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pr.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                          {(pr.categories || []).join(', ') || UI_STRINGS.appAppPrPage.generalCapex}
                          {pr.remainingCategoryCount > 0 && (
                            <span style={{ marginLeft: 4 }}>{interpolateUiString(UI_STRINGS.common.additionalCategoryCount, { count: pr.remainingCategoryCount })}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0 16px', color: '#334155' }}>
                        <div style={{ fontWeight: 500 }}>{pr.project?.name || UI_STRINGS.common.copy4s9bsz}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {pr.costCentre?.code || pr.project?.projectCode || ''}
                        </div>
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'center' }}>
                        <span className="badge badge-info font-mono" style={{ fontSize: 12 }}>
                          {pr.totalLines || 0}
                        </span>
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#047857', fontSize: 13 }}>{UI_STRINGS.common.copy1g8b5tg}{(pr.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'center' }}>
                        <StatusBadge status={pr.status} />
                        {pr.rejectionReason && (pr.status === 'PR_RETURNED_FOR_CORRECTION' || pr.status === 'PR_REJECTED') && (
                          <div style={{ marginTop: 4, fontSize: 10, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 4px' }}>
                            <strong>{UI_STRINGS.common.note}</strong> {pr.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {(pr.status === 'PR_DRAFT' || pr.status === 'PR_RETURNED_FOR_CORRECTION') && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                              onClick={() => handleSubmit(pr.id)}
                              title={pr.status === 'PR_RETURNED_FOR_CORRECTION' ? UI_STRINGS.appAppPrPage.resubmitCorrectedPRForApproval : UI_STRINGS.appAppPrPage.submitPRForProjectApproverReview}
                            >
                              <Send size={12} /> {pr.status === 'PR_RETURNED_FOR_CORRECTION' ? UI_STRINGS.appAppPrPage.resubmit : UI_STRINGS.common.submit}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 32, padding: '0 8px', fontSize: 12, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
                            onClick={() => {
                              setChatPr(pr);
                              setChatDrawerOpen(true);
                            }}
                            title={UI_STRINGS.appAppPrPage.openMessagesAndCommunicationHistoryWithApprover}
                          >
                            <MessageSquare size={12} />{UI_STRINGS.common.chat}</button>
                          <Link
                            href={`/boq/studio?boqId=${pr.boqId}&projectId=${pr.projectId}&costCentreId=${pr.costCentreId}`}
                            className="btn btn-secondary btn-sm"
                            style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                          >{UI_STRINGS.appAppPrPage.details}</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {page < totalPages && (
        <div className="flex justify-center py-4">
          <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => void loadPrs(page + 1, true)}>
            {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
          </button>
          <span className="sr-only">{interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: page, value2: totalPages })}</span>
        </div>
      )}

      {/* CHAT / COMMUNICATION DRAWER */}
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
          initialEnquiryMode={false}
          onMessageSent={loadPrs}
        />
      )}
    </div>
  );
}
