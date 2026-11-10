'use client';
// src/app/(app)/approvals/vendor-ratings/page.tsx - Project Approver Vendor Performance Approvals Desk
import { useState, useEffect } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import {
  Award,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Star,
  Building2,
  Clock,
  ShieldCheck,
  CheckSquare,
  MessageSquare,
  Search,
  RefreshCw,
  ExternalLink,
  X,
} from 'lucide-react';
import type { VendorRatingItem } from "@app-types/app/(app)/approvals/vendor-ratings/page.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function VendorRatingsApprovalsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<VendorRatingItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState({
    pendingCount: 0,
    approvedCount: 0,
    returnedCount: 0,
    totalCount: 0,
    totalEvaluatedValue: 0,
  });

  const [activeTab, setActiveTab] = useState<'ALL' | 'SUBMITTED' | 'APPROVED' | 'RETURNED_FOR_CORRECTION'>('SUBMITTED');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected item for review modal
  const [selectedRating, setSelectedRating] = useState<VendorRatingItem | null>(null);
  const [approverComments, setApproverComments] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  const fetchQueue = async (nextPage = 1, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const res = await fetch(`/api/approvals/vendor-ratings?page=${nextPage}&pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        const rList = data.ratings || data.data?.ratings || [];
        const cMetrics = data.counts || data.data?.counts;
        const pagination = data.pagination || data.data?.pagination;
        setRatings((current) => append ? [...current, ...rList.filter((rating: VendorRatingItem) => !current.some((loaded) => loaded.id === rating.id))] : rList);
        setPage(Number(pagination?.page ?? nextPage));
        setHasMore(Boolean(pagination?.hasMore));
        if (cMetrics) {
          setCounts(cMetrics);
        }
      } else {
        toast.error(UI_STRINGS.common.userMessages.failedToLoadVendorPerformanceApprovalsQueue);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(UI_STRINGS.common.userMessages.networkErrorWhileLoadingApprovalsQueue);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const filteredRatings = ratings.filter((r) => {
    const matchesTab = activeTab === 'ALL' ? true : r.status === activeTab;
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      !query ||
      r.ppo?.ppoNumber?.toLowerCase().includes(query) ||
      r.ppo?.title?.toLowerCase().includes(query) ||
      r.vendor?.name?.toLowerCase().includes(query) ||
      r.ppo?.project?.name?.toLowerCase().includes(query);
    return matchesTab && matchesSearch;
  });

  const handleOpenReview = (rating: VendorRatingItem) => {
    setSelectedRating(rating);
    setApproverComments(rating.approverComments || '');
    setErrorFeedback(null);
    setConfirmAcceptOpen(false);
  };

  const handleDecision = async (action: 'ACCEPT' | 'RETURN' | 'REJECT') => {
    if (!selectedRating) return;

    if ((action === 'RETURN' || action === 'REJECT') && !approverComments.trim()) {
      setErrorFeedback('Approver comments are mandatory when returning or rejecting an assessment.');
      return;
    }

    try {
      setSubmittingDecision(true);
      setErrorFeedback(null);

      const res = await fetch('/api/approvals/vendor-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratingId: selectedRating.id,
          action,
          approverComments: approverComments.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(
          action === 'ACCEPT'
            ? UI_STRINGS.common.userMessages.performanceAssessmentAcceptedPublishedToVendorScorecard
            : (action === 'RETURN'
              ? UI_STRINGS.common.userMessages.assessmentReturnedToSubmitterForCorrection
              : UI_STRINGS.common.userMessages.assessmentRejected),
          selectedRating.ppo?.ppoNumber
        );
        setSelectedRating(null);
        setConfirmAcceptOpen(false);
        fetchQueue();
      } else {
        setErrorFeedback(data.error || 'Failed to record decision.');
      }
    } catch (err: any) {
      setErrorFeedback(err.message || 'Network error recording decision.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={UI_STRINGS.appAppApprovalsVendorRatingsPage.vendorPerformanceApprovals}
        breadcrumbs={[
          { label: UI_STRINGS.common.approvals, href: '/approvals/boq-pr' },
          { label: UI_STRINGS.appAppApprovalsVendorRatingsPage.vendorPerformanceApprovals },
        ]}
        subtitle={UI_STRINGS.appAppApprovalsVendorRatingsPage.reviewPPOLevelVendorPerformanceAssessmentsCategoryRatingsImprovementFeedbackAndPublishedRatings}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/approvals/boq-pr" className="btn btn-secondary text-xs">
              <CheckSquare className="w-3.5 h-3.5" style={{ marginRight: 6 }} />{UI_STRINGS.common.bOQApprovals}</Link>
            <Link href="/approvals/rate-cards" className="btn btn-secondary text-xs">{UI_STRINGS.appAppApprovalsVendorRatingsPage.rateCardApprovals}</Link>
            <button onClick={() => fetchQueue()} className="btn btn-secondary text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppApprovalsVendorRatingsPage.awaitingDecision}</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{counts.pendingCount}</span>
            <span className="text-xs text-amber-600 font-medium">{UI_STRINGS.appAppApprovalsVendorRatingsPage.pendingApprovals}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{UI_STRINGS.common.approvedRatings}</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{counts.approvedCount}</span>
            <span className="text-xs text-emerald-600 font-medium">{UI_STRINGS.appAppApprovalsVendorRatingsPage.publishedToScorecard}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppApprovalsVendorRatingsPage.returnedForEdit}</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{counts.returnedCount}</span>
            <span className="text-xs text-purple-600 font-medium">{UI_STRINGS.appAppApprovalsVendorRatingsPage.awaitingCorrections}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppApprovalsVendorRatingsPage.evaluatedPPOValue}</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-slate-900">{UI_STRINGS.common.copy1g8b5tg}{(counts.totalEvaluatedValue / 100000).toFixed(1)}{UI_STRINGS.common.l}</span>
            <span className="text-xs text-slate-500">{UI_STRINGS.appAppApprovalsVendorRatingsPage.approvedOrders}</span>
          </div>
        </div>
      </div>

      {/* Main Approvals Table Card */}
      <Card noPadding>
        {/* Filters Bar */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('SUBMITTED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'SUBMITTED' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.appAppApprovalsVendorRatingsPage.pendingApproval}{counts.pendingCount}{UI_STRINGS.common.copyc7zu6c}</button>
            <button
              onClick={() => setActiveTab('APPROVED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'APPROVED' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.common.approved2}{counts.approvedCount}{UI_STRINGS.common.copyc7zu6c}</button>
            <button
              onClick={() => setActiveTab('RETURNED_FOR_CORRECTION')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'RETURNED_FOR_CORRECTION' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.appAppApprovalsVendorRatingsPage.returned2}{counts.returnedCount}{UI_STRINGS.common.copyc7zu6c}</button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.appAppApprovalsVendorRatingsPage.allRecords}{counts.totalCount}{UI_STRINGS.common.copyc7zu6c}</button>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={UI_STRINGS.appAppApprovalsVendorRatingsPage.searchByPPOVendorOrProject}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
            />
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            <p className="text-xs font-semibold">{UI_STRINGS.appAppApprovalsVendorRatingsPage.loadingVendorPerformanceApprovals}</p>
          </div>
        ) : filteredRatings.length === 0 ? (
          <div className="p-12 text-center">
            <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-800">{UI_STRINGS.appAppApprovalsVendorRatingsPage.noAssessmentsFound}</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'SUBMITTED'
                ? UI_STRINGS.appAppApprovalsVendorRatingsPage.thereAreCurrentlyNoVendorPerformanceRatingsAwaitingProjectApproverReview
                : UI_STRINGS.appAppApprovalsVendorRatingsPage.noPerformanceRatingRecordsMatchedTheActiveFilterCriteria}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">{UI_STRINGS.common.pPOReference}</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">{UI_STRINGS.common.vendorName}</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">{UI_STRINGS.common.projectCostCentre2}</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-right">{UI_STRINGS.common.pPOValue}</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-center">{UI_STRINGS.appAppApprovalsVendorRatingsPage.weightedScore}</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">{UI_STRINGS.common.submittedBy}</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-center">{UI_STRINGS.common.status}</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-right">{UI_STRINGS.common.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRatings.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-blue-700 block">{item.ppo?.ppoNumber}</span>
                      <span className="text-[11px] text-slate-500 block truncate max-w-xs">{item.ppo?.title}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/procurement/vendors/${item.vendorId}`}
                        className="font-semibold text-slate-900 hover:text-blue-700 flex items-center gap-1"
                      >
                        {item.vendor?.name}
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </Link>
                      <span className="font-mono text-[10px] text-slate-400">{item.vendor?.code}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800 block">{item.ppo?.project?.name || UI_STRINGS.common.project}</span>
                      <span className="text-[11px] text-slate-500">{item.ppo?.costCentre?.name || UI_STRINGS.common.costCentre2}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">{UI_STRINGS.common.copy1g8b5tg}{item.ppo?.totalValue?.toLocaleString() || 0}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-50 text-amber-800 border border-amber-200">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        <span>{item.overallScore}{UI_STRINGS.common.copy6hoc4p}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-slate-800 font-medium block">{item.ratedByName || UI_STRINGS.common.projectUser}</span>
                      <span className="text-[11px] text-slate-500">{new Date(item.ratedAt).toLocaleDateString()}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">{UI_STRINGS.common.pendingApproval}</span>
                      ) : item.status === 'APPROVED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">{UI_STRINGS.common.approved}</span>
                      ) : item.status === 'RETURNED_FOR_CORRECTION' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">{UI_STRINGS.appAppApprovalsVendorRatingsPage.returned}</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenReview(item)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          item.status === 'SUBMITTED'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
                        }`}
                      >
                        {item.status === 'SUBMITTED' ? UI_STRINGS.appAppApprovalsVendorRatingsPage.reviewDecide : UI_STRINGS.appAppApprovalsVendorRatingsPage.viewAssessment}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && hasMore && (
          <div className="flex justify-center border-t border-slate-100 p-4">
            <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => fetchQueue(page + 1, true)}>
              {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
            </button>
          </div>
        )}
      </Card>

      {/* ── MODAL: ASSESSMENT DETAIL & APPROVER DECISION ── */}
      {selectedRating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[92%] max-w-[1050px] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.appAppApprovalsVendorRatingsPage.vendorPerformanceAssessmentReview}</h3>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {selectedRating.ppo?.ppoNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.appAppApprovalsVendorRatingsPage.orderExecutionReviewFor}<strong>{selectedRating.vendor?.name}</strong>{UI_STRINGS.appAppApprovalsVendorRatingsPage.submittedBy}{selectedRating.ratedByName || UI_STRINGS.common.projectUser}{UI_STRINGS.common.copyby08hd}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRating(null)}
                aria-label={UI_STRINGS.appAppApprovalsVendorRatingsPage.closeReview}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5 bg-slate-50/50">
              {errorFeedback && (
                <div className="p-3 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorFeedback}</span>
                </div>
              )}

              {/* Status Header Banner */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.currentWorkflowStage}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={selectedRating.status} />
                    <span className="text-xs text-slate-600">{UI_STRINGS.appAppApprovalsVendorRatingsPage.submittedOn}{new Date(selectedRating.ratedAt).toLocaleString()}{UI_STRINGS.common.by}<strong>{selectedRating.ratedByName}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.weightedResult}</span>
                    <div className="flex items-center justify-end gap-1 font-mono font-bold text-lg text-slate-900 mt-0.5">
                      <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                      <span>{selectedRating.overallScore}</span>
                      <span className="text-xs text-slate-400 font-normal">{UI_STRINGS.common.copybqfq57}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION A: SUBMITTED PERFORMANCE ASSESSMENT */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-blue-50/80 border-b border-blue-100 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{UI_STRINGS.appAppApprovalsVendorRatingsPage.sectionAOrderScopeInformation}</h4>
                  </div>
                  <span className="text-[11px] text-blue-600 font-medium">{UI_STRINGS.appAppApprovalsVendorRatingsPage.pPOCommercialProfile}</span>
                </div>

                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.pPONumberTitle}</span>
                    <strong className="text-slate-900 block font-mono mt-0.5">{selectedRating.ppo?.ppoNumber}</strong>
                    <span className="text-slate-600 truncate block mt-0.5">{selectedRating.ppo?.title}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.vendorClassification}</span>
                    <strong className="text-slate-900 block mt-0.5">{selectedRating.vendor?.name}</strong>
                    <span className="text-slate-500 block">{selectedRating.vendor?.vendorType}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">{UI_STRINGS.common.projectCostCentre}</span>
                    <strong className="text-slate-900 block mt-0.5">{selectedRating.ppo?.project?.name}</strong>
                    <span className="text-slate-500 block">{selectedRating.ppo?.costCentre?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.pPOValueExecuted}</span>
                    <strong className="text-slate-900 block font-mono text-sm mt-0.5">{UI_STRINGS.common.copy1g8b5tg}{selectedRating.ppo?.totalValue?.toLocaleString() || 0}
                    </strong>
                    <span className="text-emerald-600 font-medium block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.orderCompleted}</span>
                  </div>
                </div>
              </div>

              {/* 5 RATING CATEGORIES & SPECIFIC COMMENTS */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{UI_STRINGS.appAppApprovalsVendorRatingsPage.categoryRatingsIndividualObservations}</h4>
                  <span className="text-[11px] text-slate-500">{UI_STRINGS.appAppApprovalsVendorRatingsPage.weightBreakdown3025201510}</span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Category 1: Quality */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">{UI_STRINGS.common.copyefwnq4}</span>
                        <div>
                          <strong className="text-xs text-slate-900">{UI_STRINGS.appAppApprovalsVendorRatingsPage.qualityOfGoodsWork30}</strong>
                          <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.workmanshipMaterialQualitySpecificationsComplianceDefects}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.qualityScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.projectUserComments}</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.qualityComments || UI_STRINGS.appAppApprovalsVendorRatingsPage.noSpecificQualityObservationsNoted}
                      </p>
                    </div>
                  </div>

                  {/* Category 2: Delivery & Time */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">{UI_STRINGS.common.copyf9vgt1}</span>
                        <div>
                          <strong className="text-xs text-slate-900">{UI_STRINGS.appAppApprovalsVendorRatingsPage.deliveryTime25}</strong>
                          <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.deliveryTimelinesDelaysLiquidatedDamagesScheduleAdherence}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.deliveryScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.projectUserComments}</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.deliveryComments || UI_STRINGS.appAppApprovalsVendorRatingsPage.noSpecificDeliveryDelaysOrIssuesRecorded}
                      </p>
                    </div>
                  </div>

                  {/* Category 3: Cost & Commercial */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">{UI_STRINGS.common.copyezvv42}</span>
                        <div>
                          <strong className="text-xs text-slate-900">{UI_STRINGS.appAppApprovalsVendorRatingsPage.costCommercial20}</strong>
                          <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.agreedRatesComplianceCostControlBillingAccuracyCommercialCompliance}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.commercialComplianceScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.projectUserComments}</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.commercialComments || UI_STRINGS.appAppApprovalsVendorRatingsPage.invoicesMatchedAgreedPPORateStructure}
                      </p>
                    </div>
                  </div>

                  {/* Category 4: Documentation */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">{UI_STRINGS.common.copydlxun7}</span>
                        <div>
                          <strong className="text-xs text-slate-900">{UI_STRINGS.appAppApprovalsVendorRatingsPage.documentationClosure10}</strong>
                          <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.invoicesStatutoryDocumentsTestCertificatesHandoverRecords}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.documentationClosureScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.projectUserComments}</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.documentationComments || UI_STRINGS.appAppApprovalsVendorRatingsPage.documentationDeliveredPerContractRequirements}
                      </p>
                    </div>
                  </div>

                  {/* Category 5: Responsiveness */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">{UI_STRINGS.common.copydby8y8}</span>
                        <div>
                          <strong className="text-xs text-slate-900">{UI_STRINGS.appAppApprovalsVendorRatingsPage.responsivenessCoordination15}</strong>
                          <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.siteCommunicationIssueResolutionEscalationCoordination}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.responsivenessScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">{UI_STRINGS.appAppApprovalsVendorRatingsPage.projectUserComments}</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.responsivenessComments || UI_STRINGS.appAppApprovalsVendorRatingsPage.communicationWasPromptAndConstructive}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* OVERALL AREAS FOR IMPROVEMENT */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-amber-50/80 border-b border-amber-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{UI_STRINGS.common.overallAreasForImprovementRecommendations}</h4>
                  </div>
                  <span className="text-[11px] text-amber-800 font-medium">{UI_STRINGS.appAppApprovalsVendorRatingsPage.forwardLookingCorrectiveActions}</span>
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-800 whitespace-pre-wrap bg-amber-50/30 p-3.5 rounded-lg border border-amber-100 font-medium leading-relaxed">
                    {selectedRating.overallImprovement || selectedRating.comments || UI_STRINGS.appAppApprovalsVendorRatingsPage.noExplicitCorrectiveActionsRequested}
                  </p>
                </div>
              </div>

              {/* SECTION B: APPROVER REVIEW COMMENTS */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-100 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-slate-700" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{UI_STRINGS.appAppApprovalsVendorRatingsPage.sectionBProjectApproverComments}</h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {selectedRating.status === 'APPROVED' ? UI_STRINGS.appAppApprovalsVendorRatingsPage.recordedApprovalJustification : UI_STRINGS.appAppApprovalsVendorRatingsPage.approverObservationsRequiredCorrections}
                  </span>
                </div>
                <div className="p-4">
                  {selectedRating.status === 'APPROVED' ? (
                    <div className="bg-emerald-50/50 border border-emerald-200 p-3.5 rounded-lg text-xs">
                      <span className="font-semibold text-emerald-800 block">{interpolateUiString(UI_STRINGS.appAppApprovalsVendorRatingsPage.approvedByNameOnDate, {
                        name: selectedRating.approvedByName || UI_STRINGS.common.projectApprover,
                        date: selectedRating.approvedAt ? new Date(selectedRating.approvedAt).toLocaleString() : UI_STRINGS.appAppApprovalsVendorRatingsPage.nA,
                      })}{UI_STRINGS.common.copyhhsact}</span>
                      <p className="text-slate-800 mt-1 whitespace-pre-wrap">
                        {selectedRating.approverComments || UI_STRINGS.appAppApprovalsVendorRatingsPage.approvedWithNoAdditionalRemarks}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">{UI_STRINGS.appAppApprovalsVendorRatingsPage.approverReviewRemarks}<span className="text-slate-400 font-normal">{UI_STRINGS.appAppApprovalsVendorRatingsPage.requiredIfReturningOrRejecting}</span>
                      </label>
                      <textarea
                        rows={3}
                        value={approverComments}
                        onChange={(e) => setApproverComments(e.target.value)}
                        placeholder={UI_STRINGS.appAppApprovalsVendorRatingsPage.recordJustificationForAcceptingThisAssessmentOrDetailedReasonsCorrectionsRequiredIfReturningToProjectUser}
                        className="w-full text-xs border border-slate-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 font-medium"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Audit / Decision History */}
              {selectedRating.decisionHistory && selectedRating.decisionHistory.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white p-4">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">{UI_STRINGS.appAppApprovalsVendorRatingsPage.decisionAuditTrail}</span>
                  <div className="space-y-2">
                    {selectedRating.decisionHistory.map((h: any, idx: number) => (
                      <div key={idx} className="text-xs flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                        <div>
                          <strong className="text-slate-800">{h.action}</strong>{UI_STRINGS.common.by}{h.performedByName}{UI_STRINGS.common.copy1b3t0c5}{h.performedByRole}{UI_STRINGS.common.copyc7zu6c}{h.comments && <span className="text-slate-500 block text-[11px] mt-0.5">{UI_STRINGS.appAppApprovalsVendorRatingsPage.quot}{h.comments}{UI_STRINGS.appAppApprovalsVendorRatingsPage.quot}</span>}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(h.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer / Decision Buttons */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSelectedRating(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >{UI_STRINGS.common.close}</button>

              {selectedRating.status === 'SUBMITTED' && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => handleDecision('RETURN')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />{UI_STRINGS.appAppApprovalsVendorRatingsPage.returnForCorrection}</button>

                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => handleDecision('REJECT')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />{UI_STRINGS.appAppApprovalsVendorRatingsPage.rejectAssessment}</button>

                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => setConfirmAcceptOpen(true)}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />{UI_STRINGS.common.acceptRating}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Accept */}
      {confirmAcceptOpen && selectedRating && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 text-center animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.appAppApprovalsVendorRatingsPage.confirmPerformanceRatingAcceptance}</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">{UI_STRINGS.appAppApprovalsVendorRatingsPage.areYouSureYouWantToApproveThis}<strong>{selectedRating.overallScore}{UI_STRINGS.appAppApprovalsVendorRatingsPage.copy161iq2v}</strong>{UI_STRINGS.appAppApprovalsVendorRatingsPage.performanceEvaluationFor}{' '}
              <strong>{selectedRating.vendor?.name}</strong>{UI_STRINGS.appAppApprovalsVendorRatingsPage.onOrder}<strong>{selectedRating.ppo?.ppoNumber}</strong>{UI_STRINGS.common.copyg3u9vy}</p>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3 text-left">
              <strong>{UI_STRINGS.appAppApprovalsVendorRatingsPage.notice}</strong>{UI_STRINGS.appAppApprovalsVendorRatingsPage.onceAcceptedThisAssessmentWillBeLockedAgainstEditingAndItsWeightedScoreWillImmediatelyBePublishedToTheVendorAposSScorecardAndPPOHistory}</p>

            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                type="button"
                onClick={() => setConfirmAcceptOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >{UI_STRINGS.common.backToReview}</button>
              <button
                type="button"
                disabled={submittingDecision}
                onClick={() => handleDecision('ACCEPT')}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingDecision ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />{UI_STRINGS.appAppApprovalsVendorRatingsPage.publishing}</>
                ) : (
                  UI_STRINGS.appAppApprovalsVendorRatingsPage.confirmPublishScore
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
