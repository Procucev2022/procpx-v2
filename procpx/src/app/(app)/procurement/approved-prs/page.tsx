'use client';
// src/app/(app)/procurement/approved-prs/page.tsx
// Procurement User: Approved PR Queue -> Sourcing & RFQ Creation

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import PrDetailModal from '@/components/PrDetailModal';
import {
  FileCheck,
  Search,
  Building2,
  Layers,
  Calendar,
  IndianRupee,
  ArrowRight,
  ExternalLink,
  Tag,
  CheckCircle2,
  RefreshCw,
  ShoppingBag,
  ListChecks,
  Eye,
} from 'lucide-react';

export default function ApprovedPrsPage() {
  const router = useRouter();
  const [prs, setPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPr, setSelectedPr] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchPrs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/approved-prs?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || []);
      setPrs(list);
    } catch (err) {
      console.error('Failed to load approved PRs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrs();
  }, [search]);

  const totalValue = prs.reduce((acc, p) => acc + (p.totalEstimatedValue || 0), 0);
  const sourcingActiveCount = prs.filter((p) => p.rfqs && p.rfqs.length > 0).length;
  const readyToSourceCount = prs.length - sourcingActiveCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approved Procurement Requests"
        subtitle="Sanctioned PRs released by Project Approver, ready for market sourcing and RFQ creation"
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/approved-prs' },
          { label: 'Approved PRs' },
        ]}
        actions={
          <button
            onClick={fetchPrs}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label="Total Approved PRs"
          value={prs.length}
          secondary="Released to Procurement"
          icon={<FileCheck size={16} />}
          accent="default"
        />
        <SummaryCard
          label="Total Sanctioned Value"
          value={`₹${(totalValue / 100000).toFixed(2)}L`}
          secondary="Baseline estimated budget"
          icon={<IndianRupee size={16} />}
          accent="emerald"
        />
        <SummaryCard
          label="Ready for Sourcing"
          value={readyToSourceCount}
          secondary="RFQ not yet initiated"
          icon={<ShoppingBag size={16} />}
          accent="amber"
        />
        <SummaryCard
          label="In Active Sourcing"
          value={sourcingActiveCount}
          secondary="Linked to RFQ Packages"
          icon={<CheckCircle2 size={16} />}
          accent="blue"
        />
      </SummaryCardGrid>

      {/* Main Table Card */}
      <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by PR #, Project, Cost Centre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white shadow-sm"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing {prs.length} released procurement packages
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4" style={{ width: 140 }}>PR Number</th>
                <th className="py-3 px-4">Package Description</th>
                <th className="py-3 px-4 text-center" style={{ width: 85 }}>Items</th>
                <th className="py-3 px-4" style={{ width: 95 }}>Cost Centre</th>
                <th className="py-3 px-4 text-right" style={{ width: 130 }}>PR Amount</th>
                <th className="py-3 px-4" style={{ width: 110 }}>Approval Status</th>
                <th className="py-3 px-4" style={{ width: 140 }}>Procurement Stage</th>
                <th className="py-3 px-4 text-center" style={{ width: 90 }}>RFQ Count</th>
                <th className="py-3 px-4 text-right" style={{ width: 115 }}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <FileCheck size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-medium">No approved procurement requests found</p>
                    <p className="text-[11px] mt-0.5">
                      PRs approved by Project Approver will appear here automatically for sourcing
                    </p>
                  </td>
                </tr>
              ) : (
                prs.map((pr) => {
                  const hasRfq = pr.rfqs && pr.rfqs.length > 0;
                  const itemCount = pr.lines?.length || 0;
                  const costCentreCode = pr.costCentre?.code || '—';

                  return (
                    <tr key={pr.id} className="hover:bg-slate-50/75 transition-colors">
                      {/* 1. PR Number */}
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => {
                            setSelectedPr(pr);
                            setShowDetailModal(true);
                          }}
                          title="Click to view details"
                        >
                          {pr.prNumber}
                        </span>
                      </td>

                      {/* 2. Short Package/PR Description */}
                      <td className="py-3 px-4" style={{ maxWidth: 260 }}>
                        <div
                          className="font-semibold text-slate-900 truncate"
                          title={pr.title || 'Procurement Package'}
                        >
                          {pr.title || 'Procurement Package'}
                        </div>
                      </td>

                      {/* 3. Item Count */}
                      <td className="py-3 px-4 text-center">
                        <span className="text-slate-600 font-medium text-xs">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </span>
                      </td>

                      {/* 4. Cost Centre Code */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {costCentreCode}
                        </span>
                      </td>

                      {/* 5. PR Amount */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-bold text-slate-900">
                          ₹{(pr.totalEstimatedValue || 0).toLocaleString('en-IN')}
                        </div>
                      </td>

                      {/* 6. PR Approval Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={pr.status} />
                      </td>

                      {/* 7. Current Procurement Stage */}
                      <td className="py-3 px-4">
                        <span className={`badge ${hasRfq ? 'badge-info' : 'badge-draft'}`} style={{ fontSize: 11 }}>
                          {hasRfq ? 'In Sourcing' : 'Ready for Sourcing'}
                        </span>
                      </td>

                      {/* 8. RFQ Count */}
                      <td className="py-3 px-4 text-center">
                        <span className={`badge ${hasRfq ? 'badge-info' : 'badge-draft'}`}>
                          {pr.rfqs?.length || 0} {(pr.rfqs?.length || 0) === 1 ? 'RFQ' : 'RFQs'}
                        </span>
                      </td>

                      {/* 9. One View Details Action */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPr(pr);
                            setShowDetailModal(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-sm inline-flex items-center gap-1.5"
                        >
                          <Eye size={12} />
                          <span>View Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Standardised Reusable PR Detail Modal */}
      {showDetailModal && selectedPr && (
        <PrDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPr(null);
          }}
          pr={selectedPr}
          userRole="PROCUREMENT_USER"
        />
      )}
    </div>
  );
}
