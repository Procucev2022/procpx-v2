'use client';
// app/(app)/procurement/ppos/page.tsx
// Enterprise Procurement Purchase Orders (PPO) & Vendor Performance Rating Register
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  Receipt,
  ArrowRight,
  IndianRupee,
  Clock,
  CheckCircle2,
  Star,
  Award,
  RotateCcw,
  Send,
  Eye,
  Search,
  X,
  FileText,
  Building2,
  Save,
  AlertCircle,
  BarChart3,
  Landmark,
  Database,
  Info,
  SquarePen,
  ChevronDown,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


function getPpoStatusBadgeStyle(status: string): { bg: string; color: string; border: string } {
  switch (status) {
    case 'ISSUED':
      return { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' };
    case 'CONFIRMED':
      return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
    case 'COMPLETED':
      return { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' };
    case 'PARTIALLY_COMPLETED':
      return { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' };
    case 'DRAFT':
    default:
      return { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' };
  }
}

function getRatingBadgeStyle(status?: string | null): { bg: string; color: string; border: string; label: string } {
  switch (status) {
    case 'APPROVED':
      return { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', label: UI_STRINGS.common.approved };
    case 'SUBMITTED':
      return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: UI_STRINGS.common.underReview };
    case 'RETURNED_FOR_CORRECTION':
      return { bg: '#FAF5FF', color: '#7E22CE', border: '#E9D5FF', label: UI_STRINGS.common.returnedForCorrection };
    case 'DRAFT':
      return { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A', label: UI_STRINGS.common.draft };
    default:
      return { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0', label: UI_STRINGS.appAppProcurementPposPage.unrated };
  }
}

export default function PposDeskPage() {
  const toast = useToast();
  const [ppos, setPpos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPpos, setTotalPpos] = useState(0);
  const [committedPpoValue, setCommittedPpoValue] = useState<number | null>(null);
  const [ratingCounts, setRatingCounts] = useState<Record<string, number> | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [isProcurementUser, setIsProcurementUser] = useState(false);

  // Filters
  const [activeTab, setActiveTab] = useState<'ALL' | 'NEEDS_ACTION' | 'DRAFT' | 'SUBMITTED' | 'APPROVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Rating Modal State (Project User)
  const [selectedPpoForRating, setSelectedPpoForRating] = useState<any | null>(null);
  const [ratingForm, setRatingForm] = useState({
    qualityScore: 4,
    deliveryScore: 4,
    commercialComplianceScore: 4,
    responsivenessScore: 4,
    documentationClosureScore: 4,
    qualityComments: '',
    deliveryComments: '',
    commercialComments: '',
    responsivenessComments: '',
    documentationComments: '',
    overallImprovement: '',
  });
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  // View Rating Modal State
  const [viewRatingPpo, setViewRatingPpo] = useState<any | null>(null);

  useEffect(() => {
    fetchPpos();
  }, []);

  const fetchPpos = async (requestedPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/procurement/ppos?page=${requestedPage}&pageSize=50`);
      const data = await res.json();
      if (data.ppos) {
        setPpos((previous) => append ? [...previous, ...data.ppos] : data.ppos);
        setPage(data.page ?? requestedPage);
        setTotalPages(data.totalPages ?? 1);
        setTotalPpos(data.total ?? data.ppos.length);
        setCommittedPpoValue(typeof data.totalCommittedValue === 'number' ? data.totalCommittedValue : null);
        setRatingCounts(data.ratingCounts && typeof data.ratingCounts === 'object' ? data.ratingCounts : null);
      }
      if (data.currentUserRole) setCurrentUserRole(data.currentUserRole);
      if (typeof data.isProcurementUser === 'boolean') {
        setIsProcurementUser(data.isProcurementUser);
      } else if (data.currentUserRole === 'PROCUREMENT_USER') {
        setIsProcurementUser(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const isProjectUser = currentUserRole === 'PROJECT_USER' || currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'CLIENT_ADMIN';

  // Live weighted overall score calculation
  const calculatedOverallScore = useMemo(() => {
    const q = Number(ratingForm.qualityScore) || 3;
    const d = Number(ratingForm.deliveryScore) || 3;
    const c = Number(ratingForm.commercialComplianceScore) || 3;
    const r = Number(ratingForm.responsivenessScore) || 3;
    const doc = Number(ratingForm.documentationClosureScore) || 3;
    const weighted = (q * 0.30) + (d * 0.25) + (c * 0.20) + (r * 0.15) + (doc * 0.10);
    return Math.round(weighted * 10) / 10;
  }, [ratingForm]);

  // Open Rating Modal (Prefill if draft / returned)
  const handleOpenRatingModal = (ppo: any) => {
    setSelectedPpoForRating(ppo);
    setRatingError(null);
    const existing = ppo.vendorRating;
    if (existing) {
      setRatingForm({
        qualityScore: existing.qualityScore || 4,
        deliveryScore: existing.deliveryScore || 4,
        commercialComplianceScore: existing.commercialComplianceScore || 4,
        responsivenessScore: existing.responsivenessScore || 4,
        documentationClosureScore: existing.documentationClosureScore || 4,
        qualityComments: existing.qualityComments || '',
        deliveryComments: existing.deliveryComments || '',
        commercialComments: existing.commercialComments || '',
        responsivenessComments: existing.responsivenessComments || '',
        documentationComments: existing.documentationComments || '',
        overallImprovement: existing.overallImprovement || existing.comments || '',
      });
    } else {
      setRatingForm({
        qualityScore: 4,
        deliveryScore: 4,
        commercialComplianceScore: 4,
        responsivenessScore: 4,
        documentationClosureScore: 4,
        qualityComments: '',
        deliveryComments: '',
        commercialComments: '',
        responsivenessComments: '',
        documentationComments: '',
        overallImprovement: '',
      });
    }
  };

  // Save Draft or Submit
  const handleSaveOrSubmitRating = async (action: 'DRAFT' | 'SUBMIT') => {
    if (!selectedPpoForRating) return;
    const vendorId = selectedPpoForRating.vendorId || selectedPpoForRating.vendor?.id;
    if (!vendorId) {
      setRatingError(UI_STRINGS.appAppProcurementPposPage.targetVendorIDNotFoundForThisPPO);
      return;
    }

    if (action === 'SUBMIT') {
      if (
        !ratingForm.overallImprovement.trim() &&
        !ratingForm.qualityComments.trim() &&
        !ratingForm.deliveryComments.trim()
      ) {
        setRatingError(UI_STRINGS.common.pleaseProvideFeedbackOrAreasForImprovementBeforeSubmittingForProjectApproval);
        return;
      }
    }

    setSubmittingRating(true);
    setRatingError(null);

    try {
      const payload = {
        ppoId: selectedPpoForRating.id,
        action: action === 'DRAFT' ? 'SAVE_DRAFT' : 'SUBMIT',
        qualityScore: Number(ratingForm.qualityScore),
        deliveryScore: Number(ratingForm.deliveryScore),
        commercialComplianceScore: Number(ratingForm.commercialComplianceScore),
        responsivenessScore: Number(ratingForm.responsivenessScore),
        documentationClosureScore: Number(ratingForm.documentationClosureScore),
        qualityComments: ratingForm.qualityComments.trim(),
        deliveryComments: ratingForm.deliveryComments.trim(),
        commercialComments: ratingForm.commercialComments.trim(),
        responsivenessComments: ratingForm.responsivenessComments.trim(),
        documentationComments: ratingForm.documentationComments.trim(),
        overallImprovement: ratingForm.overallImprovement.trim(),
      };

      const res = await fetch(`/api/procurement/vendors/${vendorId}/ppo-ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setRatingError(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToRecordPerformanceAssessment }));
        return;
      }

      toast.success(
        action === 'DRAFT'
          ? interpolateUiString(UI_STRINGS.common.userMessages.performanceRatingDraftSavedFor, { "ppoNumber": selectedPpoForRating.ppoNumber })
          : interpolateUiString(UI_STRINGS.common.userMessages.assessmentSubmittedForProjectApprovalFor, { "ppoNumber": selectedPpoForRating.ppoNumber })
      );

      setSelectedPpoForRating(null);
      await fetchPpos();
    } catch (err: any) {
      console.error(err);
      setRatingError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.networkErrorSubmittingRating }));
    } finally {
      setSubmittingRating(false);
    }
  };

  // Metrics for Project User
  const metrics = useMemo(() => {
    const total = totalPpos || ppos.length;
    const counts = ratingCounts || ppos.reduce<Record<string, number>>((result, ppo) => {
      const status = ppo.vendorRating?.status;
      if (status) result[status] = (result[status] || 0) + 1;
      return result;
    }, {});
    const ratedCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const unratedCount = Math.max(0, total - ratedCount);
    const draftsCount = counts.DRAFT || 0;
    const returnedCount = counts.RETURNED_FOR_CORRECTION || 0;
    const submittedCount = counts.SUBMITTED || 0;
    const approvedCount = counts.APPROVED || 0;

    return {
      total,
      unratedCount,
      draftsCount,
      returnedCount,
      submittedCount,
      approvedCount,
      needsActionCount: unratedCount + returnedCount,
      totalCommittedValue: Math.round(committedPpoValue ?? ppos.reduce((acc, p) => acc + (p.totalValue || p.totalAmount || 0), 0)),
    };
  }, [ppos, totalPpos, committedPpoValue, ratingCounts]);

  // Filtered List
  const filteredPpos = useMemo(() => {
    return ppos.filter((p) => {
      const ratingStatus = p.vendorRating?.status;

      // Tab filter
      if (activeTab === 'NEEDS_ACTION') {
        if (ratingStatus && ratingStatus !== 'RETURNED_FOR_CORRECTION') return false;
      } else if (activeTab === 'DRAFT') {
        if (ratingStatus !== 'DRAFT') return false;
      } else if (activeTab === 'SUBMITTED') {
        if (ratingStatus !== 'SUBMITTED') return false;
      } else if (activeTab === 'APPROVED') {
        if (ratingStatus !== 'APPROVED') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPpo = p.ppoNumber?.toLowerCase().includes(q);
        const matchesProject = p.project?.name?.toLowerCase().includes(q) || p.project?.projectCode?.toLowerCase().includes(q);
        const matchesVendor = p.vendor?.name?.toLowerCase().includes(q);
        const matchesRfq = p.rfq?.rfqNumber?.toLowerCase().includes(q);
        return matchesPpo || matchesProject || matchesVendor || matchesRfq;
      }

      return true;
    });
  }, [ppos, activeTab, searchQuery]);

  return (
    <div>
      <PageHeader
        breadcrumbs={
          isProjectUser
            ? [
                { label: UI_STRINGS.appAppProcurementPposPage.vendorPerformance },
                { label: UI_STRINGS.common.pPOPerformance },
              ]
            : [
                { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
                { label: UI_STRINGS.appAppProcurementPposPage.pPOsOrders },
              ]
        }
        title={isProjectUser ? UI_STRINGS.appAppProcurementPposPage.pPOVendorPerformanceRating : UI_STRINGS.appAppProcurementPposPage.procurementPurchaseOrdersPPO}
        description={
          isProjectUser
            ? UI_STRINGS.appAppProcurementPposPage.projectLevelEvaluationOfCommercialOrdersExecutionQualityAcross5StandardRubrics
            : UI_STRINGS.appAppProcurementPposPage.controlledCommercialOrdersInheritedDirectlyFromApprovedBaselinesNegotiatedRates
        }
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {isProjectUser ? (
              <Link href="/budget" className="btn btn-secondary">{UI_STRINGS.common.projectBudget}</Link>
            ) : (
              <Link href="/procurement/rfqs" className="btn btn-secondary">{UI_STRINGS.common.activeRFQsRegister}</Link>
            )}
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="mb-6">
        {isProjectUser ? (
          <SummaryCardGrid columns={5}>
            <SummaryCard
              label={UI_STRINGS.appAppProcurementPposPage.totalInScopePPOs}
              value={metrics.total}
              secondary={UI_STRINGS.appAppProcurementPposPage.ordersInAssignedProjects}
              icon={<Receipt size={16} />}
              accent="default"
            />
            <SummaryCard
              label={UI_STRINGS.appAppProcurementPposPage.needsAction}
              value={metrics.needsActionCount}
              secondary={interpolateUiString(UI_STRINGS.appAppProcurementPposPage.unratedCountUnratedReturnedCountReturned, { "unratedCount": metrics.unratedCount, "returnedCount": metrics.returnedCount })}
              icon={<AlertCircle size={16} />}
              accent="amber"
            />
            <SummaryCard
              label={UI_STRINGS.appAppProcurementPposPage.draftsSaved}
              value={metrics.draftsCount}
              secondary={UI_STRINGS.appAppProcurementPposPage.workInProgressRatings}
              icon={<Clock size={16} />}
              accent="blue"
            />
            <SummaryCard
              label={UI_STRINGS.common.underReview}
              value={metrics.submittedCount}
              secondary={UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover}
              icon={<Send size={16} />}
              accent="blue"
            />
            <SummaryCard
              label={UI_STRINGS.common.approvedRatings}
              value={metrics.approvedCount}
              secondary={UI_STRINGS.appAppProcurementPposPage.publishedToVendorScorecard}
              icon={<CheckCircle2 size={16} />}
              accent="emerald"
            />
          </SummaryCardGrid>
        ) : (
          <SummaryCardGrid columns={4}>
            <SummaryCard
              label={UI_STRINGS.appAppProcurementPposPage.totalIssuedPPOs}
              value={ppos.length}
              secondary={UI_STRINGS.appAppProcurementPposPage.postAwardCommercialPurchaseOrders}
              icon={<Receipt size={16} />}
              accent="default"
            />
            <SummaryCard
              label={UI_STRINGS.common.totalOrderValue}
              value={`₹ ${metrics.totalCommittedValue.toLocaleString(I18N_CONFIG.defaultLocale)}`}
              secondary={UI_STRINGS.appAppProcurementPposPage.totalCommittedCapex}
              icon={<IndianRupee size={16} />}
              accent="emerald"
            />
            <SummaryCard
              label={UI_STRINGS.appAppProcurementPposPage.confirmedByVendors}
              value={ppos.filter((p) => p.status === 'CONFIRMED' || p.status === 'COMPLETED').length}
              secondary={UI_STRINGS.appAppProcurementPposPage.supplierAcknowledgedScheduled}
              icon={<CheckCircle2 size={16} />}
              accent="blue"
            />
            <SummaryCard
              label={UI_STRINGS.appAppProcurementPposPage.awaitingConfirmation}
              value={ppos.filter((p) => p.status === 'ISSUED' || p.status === 'DRAFT').length}
              secondary={UI_STRINGS.appAppProcurementPposPage.awaitingVendorAcceptance}
              icon={<Clock size={16} />}
              accent="amber"
            />
          </SummaryCardGrid>
        )}
      </div>

      {/* Project User Tabs & Search Controls */}
      {isProjectUser && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'ALL' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.appAppProcurementPposPage.allOrders}{metrics.total}{UI_STRINGS.common.copyc7zu6c}</button>
            <button
              type="button"
              onClick={() => setActiveTab('NEEDS_ACTION')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'NEEDS_ACTION' ? 'bg-white text-amber-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.appAppProcurementPposPage.actionRequired}{metrics.needsActionCount}{UI_STRINGS.common.copyc7zu6c}</button>
            <button
              type="button"
              onClick={() => setActiveTab('DRAFT')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'DRAFT' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.appAppProcurementPposPage.drafts}{metrics.draftsCount}{UI_STRINGS.common.copyc7zu6c}</button>
            <button
              type="button"
              onClick={() => setActiveTab('SUBMITTED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'SUBMITTED' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.appAppProcurementPposPage.underReview}{metrics.submittedCount}{UI_STRINGS.common.copyc7zu6c}</button>
            <button
              type="button"
              onClick={() => setActiveTab('APPROVED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'APPROVED' ? 'bg-white text-emerald-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >{UI_STRINGS.common.approved2}{metrics.approvedCount}{UI_STRINGS.common.copyc7zu6c}</button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={UI_STRINGS.appAppProcurementPposPage.searchPPOVendorOrProject}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Main Register Table */}
      <Card
        title={
          isProjectUser
            ? interpolateUiString(UI_STRINGS.appAppProcurementPposPage.pPOVendorPerformanceRegisterLength, { "length": filteredPpos.length })
            : interpolateUiString(UI_STRINGS.appAppProcurementPposPage.issuedProcurementOrdersLength, { "length": ppos.length })
        }
        subtitle={
          isProjectUser
            ? UI_STRINGS.appAppProcurementPposPage.executionRatingsEvaluateDeliveryAdherenceCommercialComplianceAndQualityOnA15Scale
            : UI_STRINGS.appAppProcurementPposPage.commercialPurchaseOrdersGeneratedFromApprovedL1AwardsAndValidatedVendorNegotiations
        }
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13 }}>{UI_STRINGS.appAppProcurementPposPage.loadingPPOs}</div>
          </div>
        ) : filteredPpos.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<FileCheck size={36} strokeWidth={1.5} color="#94a3b8" />}
              title={UI_STRINGS.appAppProcurementPposPage.noPPORecordsMatchingThisFilter}
              description={
                isProjectUser
                  ? UI_STRINGS.appAppProcurementPposPage.allPurchaseOrdersInYourAssignedProjectsAreAccountedFor
                  : UI_STRINGS.appAppProcurementPposPage.onceAnAwardRecommendationIsApprovedAPPOCanBeGeneratedAndIssued
              }
              actionText={isProjectUser ? UI_STRINGS.appAppProcurementPposPage.resetFilters : UI_STRINGS.common.viewActiveRFQs}
              actionHref={isProjectUser ? undefined : '/procurement/rfqs'}
              onAction={isProjectUser ? () => { setActiveTab('ALL'); setSearchQuery(''); } : undefined}
            />
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1540 }}>
              <thead>
                <tr>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copy1yra1o}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copyazegob}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copy1hf47eh}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 170, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copyugnnm6}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 170, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copy19pmbz0}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 150, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copynz3uf2}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copy1buoj01}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 120, textAlign: 'center', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copy93dyo8}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 180, textAlign: 'center', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copy9xneg1}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 180, textAlign: 'right', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementPposPage.copye4im6p}</th>
                </tr>
              </thead>
              <tbody>
                {filteredPpos.map((p) => {
                  const ppoNo = p.ppoNumber;
                  const rfqRef = p.rfq?.rfqNumber || '—';
                  const boqNo = p.rfq?.boqRevision?.boq?.boqCode || (p.project?.projectCode ? `BOQ-${p.project.projectCode}` : 'BOQ-000001');
                  const projectName = p.project?.name || 'Project';
                  const vendorName = p.vendor?.name || 'Assigned Vendor';
                  const packageTrade = p.rfq?.packageName || p.title || 'Civil & Interior Package';
                  const awardedValue = p.totalValue || p.totalAmount || 0;
                  const statusStyle = getPpoStatusBadgeStyle(p.status);
                  const rating = p.vendorRating;
                  const ratingBadge = getRatingBadgeStyle(rating?.status);

                  return (
                    <tr key={p.id}>
                      {/* 1. PPO No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#D97706', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {ppoNo}
                      </td>

                      {/* 2. Reference RFQ */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#2563EB', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {p.rfqId ? (
                          <Link href={`/procurement/rfqs/${p.rfqId}`} style={{ color: '#2563EB', textDecoration: 'none' }}>
                            {rfqRef}
                          </Link>
                        ) : (
                          rfqRef
                        )}
                      </td>

                      {/* 3. BOQ No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1E40AF', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {boqNo}
                      </td>

                      {/* 4. Project */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        <div>{projectName}</div>
                        <div className="font-mono text-muted" style={{ fontSize: 11 }}>
                          {p.project?.projectCode}
                        </div>
                      </td>

                      {/* 5. Vendor */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        <div>{vendorName}</div>
                        {p.vendor?.code && (
                          <div className="font-mono text-muted" style={{ fontSize: 11 }}>
                            {p.vendor.code}
                          </div>
                        )}
                      </td>

                      {/* 6. Package / Trade */}
                      <td style={{ padding: '9px 12px', color: '#334155', whiteSpace: 'nowrap' }}>
                        {packageTrade}
                      </td>

                      {/* 7. Awarded Value */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'right', color: '#059669', whiteSpace: 'nowrap' }}>{UI_STRINGS.common.copy1g8b5tg}{awardedValue.toLocaleString()}
                      </td>

                      {/* 8. PPO Status */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                            border: `1px solid ${statusStyle.border}`,
                          }}
                        >
                          {p.status}
                        </span>
                      </td>

                      {/* 9. Performance Rating Status */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              backgroundColor: ratingBadge.bg,
                              color: ratingBadge.color,
                              border: `1px solid ${ratingBadge.border}`,
                            }}
                          >
                            {rating?.status === 'APPROVED' && <Star size={11} className="fill-emerald-600 text-emerald-600" />}
                            {rating?.status === 'DRAFT' && <Clock size={11} />}
                            {rating?.status === 'RETURNED_FOR_CORRECTION' && <RotateCcw size={11} />}
                            {ratingBadge.label}
                          </span>
                          {rating?.overallScore && (
                            <span className="font-mono font-bold text-slate-800 text-xs">{UI_STRINGS.common.copychzfvb}{rating.overallScore}{UI_STRINGS.appAppProcurementPposPage.copyfaz6h4}</span>
                          )}
                        </div>
                      </td>

                      {/* 10. Actions */}
                      <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div className="flex items-center justify-end gap-1.5">
                          {isProjectUser && (
                            <>
                              {!rating && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRatingModal(p)}
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: 11, padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  <Star size={11} />{UI_STRINGS.appAppProcurementPposPage.ratePPO}</button>
                              )}

                              {rating?.status === 'DRAFT' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRatingModal(p)}
                                  className="btn btn-sm"
                                  style={{
                                    fontSize: 11,
                                    padding: '4px 9px',
                                    backgroundColor: '#FEF3C7',
                                    color: '#92400E',
                                    border: '1px solid #FDE68A',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontWeight: 700,
                                  }}
                                >
                                  <Clock size={11} />{UI_STRINGS.appAppProcurementPposPage.resumeDraft}</button>
                              )}

                              {rating?.status === 'RETURNED_FOR_CORRECTION' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRatingModal(p)}
                                  className="btn btn-sm"
                                  style={{
                                    fontSize: 11,
                                    padding: '4px 9px',
                                    backgroundColor: '#FAF5FF',
                                    color: '#7E22CE',
                                    border: '1px solid #E9D5FF',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontWeight: 700,
                                  }}
                                >
                                  <RotateCcw size={11} />{UI_STRINGS.appAppProcurementPposPage.reviseRating}</button>
                              )}

                              {(rating?.status === 'SUBMITTED' || rating?.status === 'APPROVED') && (
                                <button
                                  type="button"
                                  onClick={() => setViewRatingPpo(p)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  <Eye size={11} />{UI_STRINGS.appAppProcurementPposPage.viewRating}</button>
                              )}
                            </>
                          )}

                          {isProcurementUser && rating?.status === 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() => setViewRatingPpo(p)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Eye size={11} />{UI_STRINGS.appAppProcurementPposPage.viewRating}</button>
                          )}

                          <Link
                            href={p.rfqId ? `/procurement/rfqs/${p.rfqId}?tab=awarding` : '/vendor-portal/ppos'}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11, padding: '4px 9px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >{UI_STRINGS.appAppProcurementPposPage.order}<ArrowRight size={11} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {page < totalPages && (
        <div className="flex justify-center py-4">
          <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => void fetchPpos(page + 1, true)}>
            {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
          </button>
          <span className="sr-only">{interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: page, value2: totalPages })}</span>
        </div>
      )}

      {/* ── MODAL 1: RATE / EDIT COMPLETED PPO (PROJECT USER) ── */}
      {selectedPpoForRating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[1360px] max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 my-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-start justify-between shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">{UI_STRINGS.appAppProcurementPposPage.ratePPOPerformance}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.common.copyjcbnww}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPpoForRating(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label={UI_STRINGS.common.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Returned for Correction Alert Banner */}
              {selectedPpoForRating.vendorRating?.status === 'RETURNED_FOR_CORRECTION' && (
                <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-start gap-2.5 shadow-sm">
                  <RotateCcw className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-purple-950">{UI_STRINGS.appAppProcurementPposPage.returnedByProjectApproverForCorrection}</div>
                    <div className="mt-1 text-purple-800">
                      <strong>{UI_STRINGS.appAppProcurementPposPage.approverFeedback}</strong> {selectedPpoForRating.vendorRating?.returnReason || UI_STRINGS.appAppProcurementPposPage.pleaseReviewScoresAndCategoryCommentsAndResubmit}
                    </div>
                  </div>
                </div>
              )}

              {/* PPO Summary Card */}
              <div className="border border-slate-200 rounded-xl bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-center shrink-0 text-slate-500">
                      <FileText className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-500">{UI_STRINGS.common.pPONumber}</div>
                      <div className="text-sm font-bold text-slate-900 font-mono truncate">{selectedPpoForRating.ppoNumber}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:pl-4 pt-3 sm:pt-0">
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-center shrink-0 text-slate-500">
                      <Building2 className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-500">{UI_STRINGS.common.vendor}</div>
                      <div className="text-sm font-bold text-slate-900 truncate" title={selectedPpoForRating.vendor?.name}>
                        {selectedPpoForRating.vendor?.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:pl-4 pt-3 sm:pt-0">
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-center shrink-0 text-slate-500">
                      <Landmark className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-500">{UI_STRINGS.common.project}</div>
                      <div className="text-sm font-bold text-slate-900 truncate" title={selectedPpoForRating.project?.name}>
                        {selectedPpoForRating.project?.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:pl-4 pt-3 sm:pt-0">
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-center shrink-0 text-slate-500">
                      <Database className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-500">{UI_STRINGS.common.orderValue}</div>
                      <div className="text-sm font-bold text-emerald-600 font-mono">{UI_STRINGS.common.copy1g8b5tg}{(selectedPpoForRating.totalValue || selectedPpoForRating.totalAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Computed Overall Performance Rating Banner */}
              <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{UI_STRINGS.appAppProcurementPposPage.computedOverallPerformanceRating}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.appAppProcurementPposPage.weightedAccordingToApprovedCompanyPolicy10To50}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="w-7 h-7 text-amber-400 fill-amber-400 shrink-0" />
                  <span className="text-3xl font-extrabold text-[#1e3a8a] tracking-tight">{Number(calculatedOverallScore).toFixed(1)}</span>
                  <span className="text-base font-semibold text-slate-500">{UI_STRINGS.common.copybqfq57}</span>
                </div>
              </div>

              {ratingError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 shadow-sm">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{ratingError}</span>
                </div>
              )}

              {/* Performance Evaluation Criteria Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{UI_STRINGS.appAppProcurementPposPage.performanceEvaluation1To5Stars}</h4>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>{UI_STRINGS.appAppProcurementPposPage.pleaseRateEachCriterionBasedOnActualExecutionPerformanceOfThisPPO}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-700 tracking-wider">
                        <th className="py-3 px-3 text-center border-r border-slate-200 w-12">{UI_STRINGS.common.copyak280i}</th>
                        <th className="py-3 px-4 border-r border-slate-200 min-w-[280px]">{UI_STRINGS.appAppProcurementPposPage.evaluationCriteria}</th>
                        <th className="py-3 px-3 text-center border-r border-slate-200 w-24">{UI_STRINGS.appAppProcurementPposPage.weight}</th>
                        <th className="py-3 px-3 text-center border-r border-slate-200 w-36">{UI_STRINGS.appAppProcurementPposPage.yourRating1To5}</th>
                        <th className="py-3 px-4 min-w-[340px]">{UI_STRINGS.appAppProcurementPposPage.observationsComments}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {/* Row 1: Quality */}
                      <tr>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700 border-r border-slate-200 align-middle">{UI_STRINGS.common.copyefwnq4}</td>
                        <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                          <div className="font-bold text-slate-900 text-xs">{UI_STRINGS.appAppProcurementPposPage.qualityOfGoodsWorkmanship}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{UI_STRINGS.appAppProcurementPposPage.materialQualityWorkmanshipSpecificationsDefectsAndTestCertificates}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200/60 rounded">{UI_STRINGS.appAppProcurementPposPage.copymu73xl}</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <div className="relative inline-block w-28">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                              value={ratingForm.qualityScore}
                              onChange={(e) => setRatingForm({ ...ratingForm, qualityScore: Number(e.target.value) })}
                              className="w-full appearance-none pl-8 pr-7 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                            >
                              <option value={5}>{UI_STRINGS.appAppProcurementPposPage.copy131sox2}</option>
                              <option value={4}>{UI_STRINGS.appAppProcurementPposPage.copy1ii4svd}</option>
                              <option value={3}>{UI_STRINGS.appAppProcurementPposPage.copy1k6d3bg}</option>
                              <option value={2}>{UI_STRINGS.appAppProcurementPposPage.copy3o2tsf}</option>
                              <option value={1}>{UI_STRINGS.appAppProcurementPposPage.copyz9fvn6}</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <textarea
                            rows={2}
                            placeholder={UI_STRINGS.appAppProcurementPposPage.observationsOnMaterialsFinishesDefectsAndTestCertificates}
                            value={ratingForm.qualityComments}
                            onChange={(e) => setRatingForm({ ...ratingForm, qualityComments: e.target.value })}
                            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
                          />
                        </td>
                      </tr>

                      {/* Row 2: Delivery */}
                      <tr>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700 border-r border-slate-200 align-middle">{UI_STRINGS.common.copyf9vgt1}</td>
                        <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                          <div className="font-bold text-slate-900 text-xs">{UI_STRINGS.appAppProcurementPposPage.deliveryScheduleAdherence}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{UI_STRINGS.appAppProcurementPposPage.deliveryMilestoneComplianceLeadTimeManagementDelaysOrExpediteResponsiveness}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200/60 rounded">{UI_STRINGS.appAppProcurementPposPage.copy7g96cf}</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <div className="relative inline-block w-28">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                              value={ratingForm.deliveryScore}
                              onChange={(e) => setRatingForm({ ...ratingForm, deliveryScore: Number(e.target.value) })}
                              className="w-full appearance-none pl-8 pr-7 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                            >
                              <option value={5}>{UI_STRINGS.appAppProcurementPposPage.copy131sox2}</option>
                              <option value={4}>{UI_STRINGS.appAppProcurementPposPage.copy1ii4svd}</option>
                              <option value={3}>{UI_STRINGS.appAppProcurementPposPage.copy1k6d3bg}</option>
                              <option value={2}>{UI_STRINGS.appAppProcurementPposPage.copy3o2tsf}</option>
                              <option value={1}>{UI_STRINGS.appAppProcurementPposPage.copyz9fvn6}</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <textarea
                            rows={2}
                            placeholder={UI_STRINGS.appAppProcurementPposPage.observationsOnMilestoneComplianceLeadTimesAndDelays}
                            value={ratingForm.deliveryComments}
                            onChange={(e) => setRatingForm({ ...ratingForm, deliveryComments: e.target.value })}
                            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
                          />
                        </td>
                      </tr>

                      {/* Row 3: Cost & Commercial */}
                      <tr>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700 border-r border-slate-200 align-middle">{UI_STRINGS.common.copyezvv42}</td>
                        <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                          <div className="font-bold text-slate-900 text-xs">{UI_STRINGS.appAppProcurementPposPage.costCommercialCompliance}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{UI_STRINGS.appAppProcurementPposPage.billingAccuracyInvoiceSubmissionTimelinessAbsenceOfDisputedVariationClaims}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200/60 rounded">{UI_STRINGS.appAppProcurementPposPage.copy1lepepa}</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <div className="relative inline-block w-28">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                              value={ratingForm.commercialComplianceScore}
                              onChange={(e) => setRatingForm({ ...ratingForm, commercialComplianceScore: Number(e.target.value) })}
                              className="w-full appearance-none pl-8 pr-7 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                            >
                              <option value={5}>{UI_STRINGS.appAppProcurementPposPage.copy131sox2}</option>
                              <option value={4}>{UI_STRINGS.appAppProcurementPposPage.copy1ii4svd}</option>
                              <option value={3}>{UI_STRINGS.appAppProcurementPposPage.copy1k6d3bg}</option>
                              <option value={2}>{UI_STRINGS.appAppProcurementPposPage.copy3o2tsf}</option>
                              <option value={1}>{UI_STRINGS.appAppProcurementPposPage.copyz9fvn6}</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <textarea
                            rows={2}
                            placeholder={UI_STRINGS.appAppProcurementPposPage.observationsOnBillingAccuracyInvoicesAndVariationClaims}
                            value={ratingForm.commercialComments}
                            onChange={(e) => setRatingForm({ ...ratingForm, commercialComments: e.target.value })}
                            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
                          />
                        </td>
                      </tr>

                      {/* Row 4: Responsiveness */}
                      <tr>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700 border-r border-slate-200 align-middle">{UI_STRINGS.common.copydlxun7}</td>
                        <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                          <div className="font-bold text-slate-900 text-xs">{UI_STRINGS.appAppProcurementPposPage.responsivenessSiteCoordination}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{UI_STRINGS.appAppProcurementPposPage.supervisionOnSiteIssueResolutionAgilityProactiveCommunicationAndCoordination}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200/60 rounded">{UI_STRINGS.appAppProcurementPposPage.copy1sf41re}</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <div className="relative inline-block w-28">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                              value={ratingForm.responsivenessScore}
                              onChange={(e) => setRatingForm({ ...ratingForm, responsivenessScore: Number(e.target.value) })}
                              className="w-full appearance-none pl-8 pr-7 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                            >
                              <option value={5}>{UI_STRINGS.appAppProcurementPposPage.copy131sox2}</option>
                              <option value={4}>{UI_STRINGS.appAppProcurementPposPage.copy1ii4svd}</option>
                              <option value={3}>{UI_STRINGS.appAppProcurementPposPage.copy1k6d3bg}</option>
                              <option value={2}>{UI_STRINGS.appAppProcurementPposPage.copy3o2tsf}</option>
                              <option value={1}>{UI_STRINGS.appAppProcurementPposPage.copyz9fvn6}</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <textarea
                            rows={2}
                            placeholder={UI_STRINGS.appAppProcurementPposPage.observationsOnSupervisionIssueResolutionAndCommunication}
                            value={ratingForm.responsivenessComments}
                            onChange={(e) => setRatingForm({ ...ratingForm, responsivenessComments: e.target.value })}
                            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
                          />
                        </td>
                      </tr>

                      {/* Row 5: Documentation */}
                      <tr>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700 border-r border-slate-200 align-middle">{UI_STRINGS.common.copydby8y8}</td>
                        <td className="py-3.5 px-4 border-r border-slate-200 align-middle">
                          <div className="font-bold text-slate-900 text-xs">{UI_STRINGS.appAppProcurementPposPage.documentationCommercialClosure}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{UI_STRINGS.appAppProcurementPposPage.handoverCertificatesWarrantyCardsAsBuiltDrawingsStatutoryClearanceSubmission}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200/60 rounded">{UI_STRINGS.appAppProcurementPposPage.copynd2j77}</span>
                        </td>
                        <td className="py-3.5 px-3 text-center border-r border-slate-200 align-middle">
                          <div className="relative inline-block w-28">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                              value={ratingForm.documentationClosureScore}
                              onChange={(e) => setRatingForm({ ...ratingForm, documentationClosureScore: Number(e.target.value) })}
                              className="w-full appearance-none pl-8 pr-7 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                            >
                              <option value={5}>{UI_STRINGS.appAppProcurementPposPage.copy131sox2}</option>
                              <option value={4}>{UI_STRINGS.appAppProcurementPposPage.copy1ii4svd}</option>
                              <option value={3}>{UI_STRINGS.appAppProcurementPposPage.copy1k6d3bg}</option>
                              <option value={2}>{UI_STRINGS.appAppProcurementPposPage.copy3o2tsf}</option>
                              <option value={1}>{UI_STRINGS.appAppProcurementPposPage.copyz9fvn6}</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <textarea
                            rows={2}
                            placeholder={UI_STRINGS.appAppProcurementPposPage.observationsOnHandoverCertificatesWarrantiesAndAsBuiltDocuments}
                            value={ratingForm.documentationComments}
                            onChange={(e) => setRatingForm({ ...ratingForm, documentationComments: e.target.value })}
                            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Overall Areas for Improvement & Recommendations */}
              <div className="border border-slate-200 rounded-xl bg-white p-4 shadow-sm space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <SquarePen className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{UI_STRINGS.common.overallAreasForImprovementRecommendations}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">{UI_STRINGS.appAppProcurementPposPage.summarizeKeyStrengthsRecurringBottlenecksSpecificCorrectiveActionsExpectedFromTheVendorAndRecommendationsForFutureOrders}</p>
                  </div>
                </div>
                <textarea
                  rows={3}
                  placeholder={UI_STRINGS.appAppProcurementPposPage.summarizeRecurringIssuesCorrectiveActionsAndRecommendationsForFutureOrders}
                  value={ratingForm.overallImprovement}
                  onChange={(e) => setRatingForm({ ...ratingForm, overallImprovement: e.target.value })}
                  className="w-full text-xs p-3 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSelectedPpoForRating(null)}
                className="px-5 py-2 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >{UI_STRINGS.common.cancel}</button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={submittingRating}
                  onClick={() => handleSaveOrSubmitRating('DRAFT')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4 text-slate-600" />
                  <span>{submittingRating ? UI_STRINGS.common.saving : UI_STRINGS.common.saveDraft}</span>
                </button>

                <button
                  type="button"
                  disabled={submittingRating}
                  onClick={() => handleSaveOrSubmitRating('SUBMIT')}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{submittingRating ? UI_STRINGS.common.submitting : UI_STRINGS.common.submitForProjectApproval}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: VIEW RATING DETAIL MODAL ── */}
      {viewRatingPpo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 my-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-blue-600" />{UI_STRINGS.common.pPOPerformanceAssessmentDetail}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.appAppProcurementPposPage.order2}{viewRatingPpo.ppoNumber}{UI_STRINGS.appAppProcurementPposPage.vendor}{viewRatingPpo.vendor?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewRatingPpo(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Score card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">{UI_STRINGS.appAppProcurementPposPage.overallRatingScore}</div>
                  <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                    {viewRatingPpo.vendorRating?.overallScore || UI_STRINGS.common.copy4s9bsz} <span className="text-xs font-normal text-slate-500">{UI_STRINGS.common.copybqfq57}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">{UI_STRINGS.common.status}</div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      ...getRatingBadgeStyle(viewRatingPpo.vendorRating?.status),
                    }}
                  >
                    {getRatingBadgeStyle(viewRatingPpo.vendorRating?.status).label}
                  </span>
                </div>
              </div>

              {/* Rubric Breakdown */}
              <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white text-xs">
                <div className="font-bold text-slate-800 pb-1 border-b border-slate-100">{UI_STRINGS.appAppProcurementPposPage.criteriaScoreBreakdown}</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-500">{UI_STRINGS.appAppProcurementPposPage.quality30}</span>{' '}
                    <strong className="font-mono">{viewRatingPpo.vendorRating?.qualityScore}{UI_STRINGS.common.copy1oc1xgf}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{UI_STRINGS.appAppProcurementPposPage.delivery25}</span>{' '}
                    <strong className="font-mono">{viewRatingPpo.vendorRating?.deliveryScore}{UI_STRINGS.common.copy1oc1xgf}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{UI_STRINGS.appAppProcurementPposPage.commercial20}</span>{' '}
                    <strong className="font-mono">{viewRatingPpo.vendorRating?.commercialComplianceScore}{UI_STRINGS.common.copy1oc1xgf}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{UI_STRINGS.appAppProcurementPposPage.responsiveness15}</span>{' '}
                    <strong className="font-mono">{viewRatingPpo.vendorRating?.responsivenessScore}{UI_STRINGS.common.copy1oc1xgf}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">{UI_STRINGS.appAppProcurementPposPage.documentation10}</span>{' '}
                    <strong className="font-mono">{viewRatingPpo.vendorRating?.documentationClosureScore}{UI_STRINGS.common.copy1oc1xgf}</strong>
                  </div>
                </div>
              </div>

              {/* Comments & Improvement */}
              {viewRatingPpo.vendorRating?.overallImprovement && (
                <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-blue-950">{UI_STRINGS.appAppProcurementPposPage.overallAreasForImprovementRecommendations}</div>
                  <div className="text-slate-700">{viewRatingPpo.vendorRating.overallImprovement}</div>
                </div>
              )}

              {/* Approver comments if approved or returned */}
              {viewRatingPpo.vendorRating?.approverComments && (
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-slate-900">{UI_STRINGS.appAppProcurementPposPage.projectApproverComments}</div>
                  <div className="text-slate-700">{viewRatingPpo.vendorRating.approverComments}</div>
                  {viewRatingPpo.vendorRating.approvedByName && (
                    <div className="text-[11px] text-slate-500 pt-1">{interpolateUiString(UI_STRINGS.appAppApprovalsVendorRatingsPage.approvedByNameOnDate, {
                      name: viewRatingPpo.vendorRating.approvedByName,
                      date: new Date(viewRatingPpo.vendorRating.approvedAt).toLocaleDateString(),
                    })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewRatingPpo(null)}
                className="btn btn-secondary text-xs"
              >{UI_STRINGS.common.close}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
