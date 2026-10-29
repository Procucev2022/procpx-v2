'use client';
// app/(app)/boq/page.tsx - Standardised Enterprise BOQ Register & Hub
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Upload, ClipboardCheck, Plus, Sparkles, Search } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

interface BoqSummary {
  id: string;
  projectId: string;
  boqCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    projectCode: string;
    name: string;
    sector: string;
    status: string;
  };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    status: string;
    totalLines: number;
    validLines: number;
    errorLines: number;
    warningLines: number;
    qualityScore: number | null;
    submittedAt: string | null;
    approvedAt: string | null;
    createdAt: string;
  }>;
}

const STATUS_FILTERS = ['', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

export default function BoqListPage() {
  const [boqs, setBoqs] = useState<BoqSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const fetchBoqs = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (search) p.set('search', search);
      if (status) p.set('status', status);

      const res = await fetch(`/api/boq?${p.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json.data) ? json.data : Array.isArray(json.data?.data) ? json.data.data : [];
        setBoqs(items);
        setTotal(json.total ?? json.data?.total ?? items.length);
        setTotalPages(json.totalPages ?? json.data?.totalPages ?? 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    fetchBoqs();
  }, [fetchBoqs]);

  // Aggregate metrics
  const totalLinesCount = boqs.reduce((acc, b) => {
    const rev = b.revisions?.[0];
    return acc + (rev?.totalLines || 0);
  }, 0);

  const pendingCount = boqs.filter(b => {
    const s = b.revisions?.[0]?.status || b.status;
    return s === 'SUBMITTED' || s === 'UNDER_REVIEW';
  }).length;

  const approvedCount = boqs.filter(b => {
    const s = b.revisions?.[0]?.status || b.status;
    return s === 'APPROVED';
  }).length;

  return (
    <div className="w-full">
      <PageHeader
        title="Bill of Quantities (BOQ)"
        subtitle="Manage, upload, standardise, and approve project cost sheets and revisions"
        breadcrumbs={[
          { label: 'BOQ', href: '/boq' },
          { label: 'Cost Sheets Register' },
        ]}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/boq/studio?action=new"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus size={16} /> Create New BOQ
            </Link>
            <Link
              href="/boq/studio"
              className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles size={14} /> BOQ Studio Workspace
            </Link>
            <Link
              href="/boq/upload"
              className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Upload size={14} /> Upload BOQ
            </Link>
          </div>
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label="Total Cost Sheets"
          value={total}
          secondary="Active Project BOQs"
          accent="default"
        />
        <SummaryCard
          label="Pending Review"
          value={pendingCount}
          secondary="Awaiting Approver Sign-off"
          accent="amber"
        />
        <SummaryCard
          label="Approved BOQs"
          value={approvedCount}
          secondary="Baseline Sourcing Available"
          accent="emerald"
        />
        <SummaryCard
          label="Total Line Items"
          value={totalLinesCount.toLocaleString('en-IN')}
          secondary="Across Active Revisions"
          accent="blue"
        />
      </SummaryCardGrid>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by BOQ name, project code or project name..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9 h-[40px] w-full text-sm bg-white"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="input h-[40px] w-[180px] text-sm bg-white cursor-pointer"
        >
          <option value="">All Statuses</option>
          {STATUS_FILTERS.filter(Boolean).map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* BOQ Table */}
      <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Project</th>
                <th style={{ minWidth: 160 }}>BOQ Name</th>
                <th style={{ width: 110 }}>Latest Rev</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 110, textAlign: 'right' }}>Lines</th>
                <th style={{ width: 120 }}>Validation</th>
                <th style={{ width: 100, textAlign: 'center' }}>Quality</th>
                <th style={{ width: 120 }}>Last Updated</th>
                <th style={{ width: 140, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading BOQ data...</span>
                    </div>
                  </td>
                </tr>
              ) : boqs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8">
                    <EmptyState
                      icon={<ClipboardCheck size={36} className="text-slate-400" />}
                      title="No BOQs found"
                      description="No project cost sheets match your filter criteria. Create or upload a new BOQ."
                      actionText="Upload BOQ"
                      actionHref="/boq/upload"
                    />
                  </td>
                </tr>
              ) : (
                boqs.map(boq => {
                  const rev = boq.revisions?.[0];
                  const revId = rev?.id;
                  const currentStatus = rev?.status || boq.status;
                  const score = rev?.qualityScore;

                  return (
                    <tr key={boq.id} className="hover:bg-slate-50 transition-colors">
                      <td>
                        <Link
                          href={`/projects/${boq.project.id}`}
                          className="font-bold text-[#0f52ba] hover:underline block leading-snug"
                        >
                          {boq.project.projectCode}
                        </Link>
                        <div className="text-xs text-slate-500 truncate max-w-xs">{boq.project.name}</div>
                      </td>
                      <td className="font-semibold text-slate-900">
                        {boq.boqCode}
                      </td>
                      <td>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          Rev {rev ? rev.revisionNumber : 1}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={currentStatus} />
                      </td>
                      <td className="font-mono text-xs text-right text-slate-800">
                        {rev ? rev.totalLines : 0} items
                      </td>
                      <td>
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          {rev?.validLines ? `${rev.validLines} valid` : '0 valid'}
                        </span>
                      </td>
                      <td className="text-center">
                        {score !== null && score !== undefined ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                            score >= 80 ? 'bg-emerald-100 text-emerald-800' : score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {score}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-slate-500 text-xs whitespace-nowrap">
                        {new Date(boq.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="text-center">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <Link
                            href={`/boq/studio?boqId=${boq.id}`}
                            className="btn btn-primary h-7 px-2.5 text-xs font-bold"
                          >
                            Studio
                          </Link>
                          {revId && (
                            <Link
                              href={`/boq/${revId}`}
                              className="btn btn-secondary h-7 px-2.5 text-xs font-semibold"
                            >
                              Grid
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
            <span>
              Showing <strong className="font-semibold text-slate-900">{boqs.length}</strong> of <strong className="font-semibold text-slate-900">{total}</strong> records
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                ‹ Prev
              </button>
              <span className="px-2 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
