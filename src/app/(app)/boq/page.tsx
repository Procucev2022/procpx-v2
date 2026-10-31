'use client';
// app/(app)/boq/page.tsx - Standardised Enterprise BOQ Register & Hub
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Upload, ClipboardCheck, Plus, Sparkles, Search } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import type { BoqSummary } from "@app-types/app/(app)/boq/page.types";
import { STATUS_FILTERS } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



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
        title={UI_STRINGS.appAppBoqPage.billOfQuantitiesBOQ}
        subtitle={UI_STRINGS.appAppBoqPage.manageUploadStandardiseAndApproveProjectCostSheetsAndRevisions}
        breadcrumbs={[
          { label: UI_STRINGS.common.bOQ, href: '/boq' },
          { label: UI_STRINGS.appAppBoqPage.costSheetsRegister },
        ]}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/boq/studio?action=new"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus size={16} />{UI_STRINGS.appAppBoqPage.createNewBOQ}</Link>
            <Link
              href="/boq/studio"
              className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles size={14} />{UI_STRINGS.appAppBoqPage.bOQStudioWorkspace}</Link>
            <Link
              href="/boq/upload"
              className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Upload size={14} />{UI_STRINGS.common.uploadBOQ}</Link>
          </div>
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label={UI_STRINGS.appAppBoqPage.totalCostSheets}
          value={total}
          secondary={UI_STRINGS.appAppBoqPage.activeProjectBOQs}
          accent="default"
        />
        <SummaryCard
          label={UI_STRINGS.common.pendingReview}
          value={pendingCount}
          secondary={UI_STRINGS.appAppBoqPage.awaitingApproverSignOff}
          accent="amber"
        />
        <SummaryCard
          label={UI_STRINGS.common.approvedBOQs}
          value={approvedCount}
          secondary={UI_STRINGS.appAppBoqPage.baselineSourcingAvailable}
          accent="emerald"
        />
        <SummaryCard
          label={UI_STRINGS.common.totalLineItems}
          value={totalLinesCount.toLocaleString(I18N_CONFIG.defaultLocale)}
          secondary={UI_STRINGS.appAppBoqPage.acrossActiveRevisions}
          accent="blue"
        />
      </SummaryCardGrid>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={UI_STRINGS.appAppBoqPage.searchByBOQNameProjectCodeOrProjectName}
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
          <option value="">{UI_STRINGS.common.allStatuses}</option>
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
                <th style={{ minWidth: 200 }}>{UI_STRINGS.common.project}</th>
                <th style={{ minWidth: 160 }}>{UI_STRINGS.appAppBoqPage.bOQName}</th>
                <th style={{ width: 110 }}>{UI_STRINGS.appAppBoqPage.latestRev}</th>
                <th style={{ width: 140 }}>{UI_STRINGS.common.status}</th>
                <th style={{ width: 110, textAlign: 'right' }}>{UI_STRINGS.common.lines3}</th>
                <th style={{ width: 120 }}>{UI_STRINGS.common.validation}</th>
                <th style={{ width: 100, textAlign: 'center' }}>{UI_STRINGS.appAppBoqPage.quality}</th>
                <th style={{ width: 120 }}>{UI_STRINGS.common.lastUpdated}</th>
                <th style={{ width: 140, textAlign: 'center' }}>{UI_STRINGS.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">{UI_STRINGS.appAppBoqPage.loadingBOQData}</span>
                    </div>
                  </td>
                </tr>
              ) : boqs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8">
                    <EmptyState
                      icon={<ClipboardCheck size={36} className="text-slate-400" />}
                      title={UI_STRINGS.appAppBoqPage.noBOQsFound}
                      description={UI_STRINGS.appAppBoqPage.noProjectCostSheetsMatchYourFilterCriteriaCreateOrUploadANewBOQ}
                      actionText={UI_STRINGS.common.uploadBOQ2}
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
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">{UI_STRINGS.common.rev}{rev ? rev.revisionNumber : 1}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={currentStatus} />
                      </td>
                      <td className="font-mono text-xs text-right text-slate-800">
                        {rev ? rev.totalLines : 0}{UI_STRINGS.common.items3}</td>
                      <td>
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          {rev?.validLines ? interpolateUiString(UI_STRINGS.appAppBoqPage.validLinesValid, { "validLines": rev.validLines }) : UI_STRINGS.appAppBoqPage.copyvxarfd}
                        </span>
                      </td>
                      <td className="text-center">
                        {score !== null && score !== undefined ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                            score >= 80 ? 'bg-emerald-100 text-emerald-800' : score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {score}{UI_STRINGS.common.copy8w4luo}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">{UI_STRINGS.common.copy4s9bsz}</span>
                        )}
                      </td>
                      <td className="text-slate-500 text-xs whitespace-nowrap">
                        {new Date(boq.updatedAt).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="text-center">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <Link
                            href={`/boq/studio?boqId=${boq.id}`}
                            className="btn btn-primary h-7 px-2.5 text-xs font-bold"
                          >{UI_STRINGS.appAppBoqPage.studio}</Link>
                          {revId && (
                            <Link
                              href={`/boq/${revId}`}
                              className="btn btn-secondary h-7 px-2.5 text-xs font-semibold"
                            >{UI_STRINGS.appAppBoqPage.grid}</Link>
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
            <span>{UI_STRINGS.common.showing}<strong className="font-semibold text-slate-900">{boqs.length}</strong>{UI_STRINGS.common.of}<strong className="font-semibold text-slate-900">{total}</strong>{UI_STRINGS.common.records}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >{UI_STRINGS.common.prev}</button>
              <span className="px-2 font-medium">{interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: page, value2: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >{UI_STRINGS.common.next}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
