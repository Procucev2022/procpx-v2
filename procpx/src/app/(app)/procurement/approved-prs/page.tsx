'use client';
// src/app/(app)/procurement/approved-prs/page.tsx
// Procurement User: Approved PR Queue -> Sourcing & RFQ Creation

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import SpecificationCell from '@/components/ui/SpecificationCell';
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Approved PRs
            </span>
            <FileCheck className="text-blue-600" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{prs.length}</div>
          <div className="mt-1 text-xs text-slate-500">Released to Procurement</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Sanctioned Value
            </span>
            <IndianRupee className="text-emerald-600" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            ₹{(totalValue / 100000).toFixed(2)}L
          </div>
          <div className="mt-1 text-xs text-slate-500">Baseline estimated budget</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ready for Sourcing
            </span>
            <ShoppingBag className="text-amber-600" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{readyToSourceCount}</div>
          <div className="mt-1 text-xs text-slate-500">RFQ not yet initiated</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              In Active Sourcing
            </span>
            <CheckCircle2 className="text-indigo-600" size={18} />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{sourcingActiveCount}</div>
          <div className="mt-1 text-xs text-slate-500">Linked to RFQ Packages</div>
        </Card>
      </div>

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
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">PR Number</th>
                <th className="py-3 px-4">Project & Cost Centre</th>
                <th className="py-3 px-4">BOQ Source</th>
                <th className="py-3 px-4">Lines & Items</th>
                <th className="py-3 px-4 text-right">Sanctioned Value</th>
                <th className="py-3 px-4">Target Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
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
                  return (
                    <tr key={pr.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                        <div>{pr.prNumber}</div>
                        <div className="text-[10px] font-sans text-slate-500 font-normal truncate max-w-[160px]">
                          {pr.title}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900 flex items-center gap-1.5">
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span>{pr.project?.name || 'Project'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Layers size={12} className="text-slate-400 shrink-0" />
                          <span>
                            {pr.costCentre?.code}: {pr.costCentre?.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-700">
                          {pr.boq?.boqCode || 'BOQ'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Rev: {pr.boqRevision?.revisionCode || 'R0'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          <ListChecks size={12} />
                          {pr.lines?.length || 0} items
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-bold text-slate-900">
                          ₹{(pr.totalEstimatedValue || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          ₹{((pr.totalEstimatedValue || 0) / 100000).toFixed(2)} Lakhs
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 text-slate-700 text-[11px]">
                          <Calendar size={12} className="text-slate-400" />
                          {pr.requiredDate
                            ? new Date(pr.requiredDate).toLocaleDateString()
                            : 'Immediate'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={pr.status} />
                        {hasRfq && (
                          <div className="mt-1 text-[10px] text-indigo-700 font-medium">
                            RFQ: {pr.rfqs[0].rfqNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedPr(pr);
                              setShowDetailModal(true);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-sm"
                          >
                            View
                          </button>
                          <Link
                            href={`/procurement/rfqs/new?revisionId=${pr.boqRevisionId}&prId=${pr.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-white bg-blue-700 hover:bg-blue-800 rounded transition-colors shadow-sm"
                          >
                            <span>Start Sourcing</span>
                            <ArrowRight size={12} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* PR Technical / Commercial Detail Modal */}
      {showDetailModal && selectedPr && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Procurement Request Details — ${selectedPr.prNumber}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-5 text-xs text-slate-700">
            {/* Header Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase">Project</span>
                <p className="font-semibold text-slate-900 mt-0.5">{selectedPr.project?.name}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase">Cost Centre</span>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {selectedPr.costCentre?.code}: {selectedPr.costCentre?.name}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase">Sanctioned Value</span>
                <p className="font-mono font-bold text-emerald-700 mt-0.5">
                  ₹{(selectedPr.totalEstimatedValue || 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase">Released Date</span>
                <p className="font-medium text-slate-800 mt-0.5">
                  {selectedPr.releasedAt
                    ? new Date(selectedPr.releasedAt).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-2 uppercase tracking-wider text-[11px]">
                Controlled BOQ Technical Requirements ({selectedPr.lines?.length || 0} Items)
              </h4>
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Item Description</th>
                      <th className="py-2 px-3">Specification</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3">UOM</th>
                      <th className="py-2 px-3 text-right">Est. Rate</th>
                      <th className="py-2 px-3 text-right">Est. Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPr.lines?.map((line: any, idx: number) => (
                      <tr key={line.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{line.itemDescription}</td>
                        <td className="py-2 px-3">
                          <SpecificationCell
                            specification={line.specification}
                            lineNumber={idx + 1}
                            itemDescription={line.itemDescription}
                            lineId={line.boqLineId}
                            maxWidth={180}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 font-medium">
                            {line.category}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">{line.quantity}</td>
                        <td className="py-2 px-3 text-slate-500">{line.uom}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          ₹{(line.estimatedRate || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{(line.estimatedValue || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px]">
              <div className="font-semibold flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={14} className="text-blue-700" />
                <span>Procurement Integrity Baseline</span>
              </div>
              <p>
                As Procurement User, you are sourcing against the approved BOQ revision baseline. Technical descriptions, quantities, and specifications are locked to preserve commercial fidelity.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50"
              >
                Close
              </button>
              <Link
                href={`/procurement/rfqs/new?revisionId=${selectedPr.boqRevisionId}&prId=${selectedPr.id}`}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold shadow-sm"
              >
                <span>Initiate RFQ Sourcing</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
