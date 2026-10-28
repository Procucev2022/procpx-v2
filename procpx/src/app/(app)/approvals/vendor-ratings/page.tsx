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
  FileText,
  Clock,
  ShieldCheck,
  Send,
  User,
  CheckSquare,
  MessageSquare,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';

interface VendorRatingItem {
  id: string;
  tenantId: string;
  vendorId: string;
  ppoId: string;
  projectId?: string | null;
  costCentreId?: string | null;
  qualityScore: number;
  deliveryScore: number;
  commercialComplianceScore: number;
  responsivenessScore: number;
  documentationClosureScore: number;
  overallScore: number;
  comments?: string | null;
  status: string;
  ratedBy: string;
  ratedByName?: string;
  ratedAt: string;
  createdAt: string;
  updatedAt: string;
  qualityComments?: string;
  deliveryComments?: string;
  commercialComments?: string;
  documentationComments?: string;
  responsivenessComments?: string;
  overallImprovement?: string;
  approverComments?: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  returnReason?: string | null;
  decisionHistory?: any[];
  vendor?: {
    id: string;
    code: string;
    name: string;
    vendorType: string;
    categories?: string;
    performanceScore?: number | null;
  };
  ppo?: {
    id: string;
    ppoNumber: string;
    title: string;
    totalValue: number;
    status: string;
    completedAt?: string | null;
    project?: { id: string; name: string; projectCode: string } | null;
    costCentre?: { id: string; name: string; code: string } | null;
  };
}

export default function VendorRatingsApprovalsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<VendorRatingItem[]>([]);
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

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/approvals/vendor-ratings');
      if (res.ok) {
        const data = await res.json();
        const rList = data.ratings || data.data?.ratings || [];
        const cMetrics = data.counts || data.data?.counts;
        setRatings(rList);
        if (cMetrics) {
          setCounts(cMetrics);
        }
      } else {
        toast.error('Failed to load vendor performance approvals queue.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Network error while loading approvals queue.');
    } finally {
      setLoading(false);
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
            ? 'Performance assessment accepted! Published to vendor scorecard.'
            : (action === 'RETURN'
              ? 'Assessment returned to submitter for correction.'
              : 'Assessment rejected.'),
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
        title="Vendor Performance Approvals"
        breadcrumbs={[
          { label: 'Approvals', href: '/approvals/boq-pr' },
          { label: 'Vendor Performance Approvals' },
        ]}
        subtitle="Review PPO-level vendor performance assessments, category ratings, improvement feedback, and published ratings."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/approvals/boq-pr" className="btn btn-secondary text-xs">
              <CheckSquare className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
              BOQ Approvals
            </Link>
            <Link href="/approvals/rate-cards" className="btn btn-secondary text-xs">
              Rate Card Approvals
            </Link>
            <button onClick={fetchQueue} className="btn btn-secondary text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Awaiting Decision</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{counts.pendingCount}</span>
            <span className="text-xs text-amber-600 font-medium">Pending Approvals</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved Ratings</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{counts.approvedCount}</span>
            <span className="text-xs text-emerald-600 font-medium">Published to Scorecard</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Returned for Edit</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{counts.returnedCount}</span>
            <span className="text-xs text-purple-600 font-medium">Awaiting Corrections</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Evaluated PPO Value</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-slate-900">
              ₹{(counts.totalEvaluatedValue / 100000).toFixed(1)}L
            </span>
            <span className="text-xs text-slate-500">Approved orders</span>
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
            >
              Pending Approval ({counts.pendingCount})
            </button>
            <button
              onClick={() => setActiveTab('APPROVED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'APPROVED' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approved ({counts.approvedCount})
            </button>
            <button
              onClick={() => setActiveTab('RETURNED_FOR_CORRECTION')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'RETURNED_FOR_CORRECTION' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Returned ({counts.returnedCount})
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Records ({counts.totalCount})
            </button>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by PPO, vendor, or project..."
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
            <p className="text-xs font-semibold">Loading vendor performance approvals...</p>
          </div>
        ) : filteredRatings.length === 0 ? (
          <div className="p-12 text-center">
            <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-800">No Assessments Found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'SUBMITTED'
                ? 'There are currently no vendor performance ratings awaiting Project Approver review.'
                : 'No performance rating records matched the active filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">PPO Reference</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">Vendor Name</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">Project / Cost Centre</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-right">PPO Value</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-center">Weighted Score</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">Submitted By</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-center">Status</th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-right">Action</th>
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
                      <span className="font-medium text-slate-800 block">{item.ppo?.project?.name || 'Project'}</span>
                      <span className="text-[11px] text-slate-500">{item.ppo?.costCentre?.name || 'Cost Centre'}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      ₹{item.ppo?.totalValue?.toLocaleString() || 0}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-50 text-amber-800 border border-amber-200">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        <span>{item.overallScore} / 5.0</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-slate-800 font-medium block">{item.ratedByName || 'Project User'}</span>
                      <span className="text-[11px] text-slate-500">{new Date(item.ratedAt).toLocaleDateString()}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Pending Approval
                        </span>
                      ) : item.status === 'APPROVED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Approved
                        </span>
                      ) : item.status === 'RETURNED_FOR_CORRECTION' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          Returned
                        </span>
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
                        {item.status === 'SUBMITTED' ? 'Review & Decide →' : 'View Assessment'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                    <h3 className="text-base font-bold text-slate-900">
                      Vendor Performance Assessment Review
                    </h3>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {selectedRating.ppo?.ppoNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Order execution review for <strong>{selectedRating.vendor?.name}</strong> submitted by {selectedRating.ratedByName || 'Project User'}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRating(null)}
                aria-label="Close review"
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
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Current Workflow Stage</span>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={selectedRating.status} />
                    <span className="text-xs text-slate-600">
                      Submitted on {new Date(selectedRating.ratedAt).toLocaleString()} by <strong>{selectedRating.ratedByName}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Weighted Result</span>
                    <div className="flex items-center justify-end gap-1 font-mono font-bold text-lg text-slate-900 mt-0.5">
                      <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                      <span>{selectedRating.overallScore}</span>
                      <span className="text-xs text-slate-400 font-normal">/ 5.0</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION A: SUBMITTED PERFORMANCE ASSESSMENT */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-blue-50/80 border-b border-blue-100 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Section A: Order & Scope Information
                    </h4>
                  </div>
                  <span className="text-[11px] text-blue-600 font-medium">PPO Commercial Profile</span>
                </div>

                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">PPO Number & Title</span>
                    <strong className="text-slate-900 block font-mono mt-0.5">{selectedRating.ppo?.ppoNumber}</strong>
                    <span className="text-slate-600 truncate block mt-0.5">{selectedRating.ppo?.title}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">Vendor & Classification</span>
                    <strong className="text-slate-900 block mt-0.5">{selectedRating.vendor?.name}</strong>
                    <span className="text-slate-500 block">{selectedRating.vendor?.vendorType}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">Project & Cost Centre</span>
                    <strong className="text-slate-900 block mt-0.5">{selectedRating.ppo?.project?.name}</strong>
                    <span className="text-slate-500 block">{selectedRating.ppo?.costCentre?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">PPO Value (Executed)</span>
                    <strong className="text-slate-900 block font-mono text-sm mt-0.5">
                      ₹{selectedRating.ppo?.totalValue?.toLocaleString() || 0}
                    </strong>
                    <span className="text-emerald-600 font-medium block">Order Completed</span>
                  </div>
                </div>
              </div>

              {/* 5 RATING CATEGORIES & SPECIFIC COMMENTS */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Category Ratings & Individual Observations
                  </h4>
                  <span className="text-[11px] text-slate-500">Weight breakdown: 30% / 25% / 20% / 15% / 10%</span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Category 1: Quality */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">1</span>
                        <div>
                          <strong className="text-xs text-slate-900">Quality of Goods / Work (30%)</strong>
                          <span className="text-[11px] text-slate-500 block">Workmanship, material quality, specifications compliance, defects</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.qualityScore} / 5</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">Project User Comments:</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.qualityComments || 'No specific quality observations noted.'}
                      </p>
                    </div>
                  </div>

                  {/* Category 2: Delivery & Time */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">2</span>
                        <div>
                          <strong className="text-xs text-slate-900">Delivery & Time (25%)</strong>
                          <span className="text-[11px] text-slate-500 block">Delivery timelines, delays, liquidated damages, schedule adherence</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.deliveryScore} / 5</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">Project User Comments:</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.deliveryComments || 'No specific delivery delays or issues recorded.'}
                      </p>
                    </div>
                  </div>

                  {/* Category 3: Cost & Commercial */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">3</span>
                        <div>
                          <strong className="text-xs text-slate-900">Cost & Commercial (20%)</strong>
                          <span className="text-[11px] text-slate-500 block">Agreed rates compliance, cost control, billing accuracy, commercial compliance</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.commercialComplianceScore} / 5</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">Project User Comments:</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.commercialComments || 'Invoices matched agreed PPO rate structure.'}
                      </p>
                    </div>
                  </div>

                  {/* Category 4: Documentation */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">4</span>
                        <div>
                          <strong className="text-xs text-slate-900">Documentation & Closure (10%)</strong>
                          <span className="text-[11px] text-slate-500 block">Invoices, statutory documents, test certificates, handover records</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.documentationClosureScore} / 5</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">Project User Comments:</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.documentationComments || 'Documentation delivered per contract requirements.'}
                      </p>
                    </div>
                  </div>

                  {/* Category 5: Responsiveness */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">5</span>
                        <div>
                          <strong className="text-xs text-slate-900">Responsiveness & Coordination (15%)</strong>
                          <span className="text-[11px] text-slate-500 block">Site communication, issue resolution, escalation coordination</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{selectedRating.responsivenessScore} / 5</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-semibold text-slate-500 block">Project User Comments:</span>
                      <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap bg-white p-2.5 rounded border border-slate-200">
                        {selectedRating.responsivenessComments || 'Communication was prompt and constructive.'}
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
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Overall Areas for Improvement & Recommendations
                    </h4>
                  </div>
                  <span className="text-[11px] text-amber-800 font-medium">Forward-looking corrective actions</span>
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-800 whitespace-pre-wrap bg-amber-50/30 p-3.5 rounded-lg border border-amber-100 font-medium leading-relaxed">
                    {selectedRating.overallImprovement || selectedRating.comments || 'No explicit corrective actions requested.'}
                  </p>
                </div>
              </div>

              {/* SECTION B: APPROVER REVIEW COMMENTS */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-100 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-slate-700" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Section B: Project Approver Comments
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {selectedRating.status === 'APPROVED' ? 'Recorded Approval Justification' : 'Approver Observations / Required Corrections'}
                  </span>
                </div>
                <div className="p-4">
                  {selectedRating.status === 'APPROVED' ? (
                    <div className="bg-emerald-50/50 border border-emerald-200 p-3.5 rounded-lg text-xs">
                      <span className="font-semibold text-emerald-800 block">
                        Approved by {selectedRating.approvedByName || 'Project Approver'} on {selectedRating.approvedAt ? new Date(selectedRating.approvedAt).toLocaleString() : 'N/A'}:
                      </span>
                      <p className="text-slate-800 mt-1 whitespace-pre-wrap">
                        {selectedRating.approverComments || 'Approved with no additional remarks.'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Approver Review Remarks <span className="text-slate-400 font-normal">(Required if returning or rejecting)</span>
                      </label>
                      <textarea
                        rows={3}
                        value={approverComments}
                        onChange={(e) => setApproverComments(e.target.value)}
                        placeholder="Record justification for accepting this assessment, or detailed reasons/corrections required if returning to Project User..."
                        className="w-full text-xs border border-slate-300 rounded-lg p-3 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 font-medium"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Audit / Decision History */}
              {selectedRating.decisionHistory && selectedRating.decisionHistory.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white p-4">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                    Decision & Audit Trail
                  </span>
                  <div className="space-y-2">
                    {selectedRating.decisionHistory.map((h: any, idx: number) => (
                      <div key={idx} className="text-xs flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                        <div>
                          <strong className="text-slate-800">{h.action}</strong> by {h.performedByName} ({h.performedByRole})
                          {h.comments && <span className="text-slate-500 block text-[11px] mt-0.5">&quot;{h.comments}&quot;</span>}
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
              >
                Close
              </button>

              {selectedRating.status === 'SUBMITTED' && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => handleDecision('RETURN')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Return for Correction
                  </button>

                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => handleDecision('REJECT')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject Assessment
                  </button>

                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => setConfirmAcceptOpen(true)}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Accept Rating
                  </button>
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
            <h3 className="text-base font-bold text-slate-900">Confirm Performance Rating Acceptance</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to approve this <strong>{selectedRating.overallScore}/5.0</strong> performance evaluation for{' '}
              <strong>{selectedRating.vendor?.name}</strong> on order <strong>{selectedRating.ppo?.ppoNumber}</strong>?
            </p>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3 text-left">
              <strong>Notice:</strong> Once accepted, this assessment will be locked against editing, and its weighted score will immediately be published to the vendor&apos;s scorecard and PPO history.
            </p>

            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                type="button"
                onClick={() => setConfirmAcceptOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Back to Review
              </button>
              <button
                type="button"
                disabled={submittingDecision}
                onClick={() => handleDecision('ACCEPT')}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingDecision ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  'Confirm & Publish Score'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
