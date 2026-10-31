'use client';
// app/(app)/projects/page.tsx - Standardised Enterprise Projects Register
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Folder, Plus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { STATUS_OPTIONS, SECTOR_OPTIONS } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sector, setSector] = useState('');
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        const role = d.data?.user?.role || d.user?.role || '';
        setCanCreate(['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'].includes(role));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, status, sector });
    fetch(`/api/projects?${params}`)
      .then(r => r.json())
      .then(d => { setProjects(d.data || []); setTotal(d.total || 0); setLoading(false); });
  }, [page, search, status, sector]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="w-full">
      <PageHeader
        title={UI_STRINGS.common.projects}
        subtitle={interpolateUiString(UI_STRINGS.appAppProjectsPage.totalCapexProjectValue2InPlatformWorkspace, { "total": total, "value2": total !== 1 ? 's' : '' })}
        actions={
          canCreate ? (
            <Link href="/projects/new" className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs">
              <Plus size={16} />{UI_STRINGS.appAppProjectsPage.newProject}</Link>
          ) : undefined
        }
      />

      <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              className="input pl-9 h-[40px] w-full text-sm bg-white"
              placeholder={UI_STRINGS.appAppProjectsPage.searchByNameCodeCity}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="input h-[40px] w-[180px] text-sm bg-white cursor-pointer"
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : UI_STRINGS.common.allStatuses}</option>)}
          </select>
          <select
            className="input h-[40px] w-[160px] text-sm bg-white cursor-pointer"
            value={sector}
            onChange={e => { setSector(e.target.value); setPage(1); }}
          >
            {SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s || UI_STRINGS.common.allSectors}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">{UI_STRINGS.appAppProjectsPage.loadingProjects}</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Folder size={36} className="text-slate-400" />}
              title={UI_STRINGS.appAppProjectsPage.noProjectsFound}
              description={UI_STRINGS.appAppProjectsPage.noProjectsMatchYourSearchOrFilterCriteria}
              actionText={canCreate ? UI_STRINGS.appAppProjectsPage.createProject : undefined}
              actionHref={canCreate ? '/projects/new' : undefined}
            />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>{UI_STRINGS.appAppProjectsPage.projectID}</th>
                  <th style={{ minWidth: 220 }}>{UI_STRINGS.common.projectName}</th>
                  <th style={{ width: 120 }}>{UI_STRINGS.common.sector}</th>
                  <th style={{ width: 140 }}>{UI_STRINGS.common.type}</th>
                  <th style={{ width: 140 }}>{UI_STRINGS.common.location}</th>
                  <th style={{ width: 120, textAlign: 'right' }}>{UI_STRINGS.common.areaSqFt}</th>
                  <th style={{ width: 140 }}>{UI_STRINGS.common.status}</th>
                  <th style={{ width: 140 }}>{UI_STRINGS.appAppProjectsPage.bOQStatus}</th>
                  <th style={{ width: 90, textAlign: 'right' }}>{UI_STRINGS.common.lines3}</th>
                  <th style={{ width: 110 }}>{UI_STRINGS.appAppProjectsPage.updated}</th>
                  <th style={{ width: 90, textAlign: 'center' }}>{UI_STRINGS.common.action}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const latestBoq = p.boqs?.[0];
                  const latestRev = latestBoq?.revisions?.[0];
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td>
                        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {p.projectCode}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-semibold text-slate-900 hover:text-[#0f52ba] transition-colors leading-snug block"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td>
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {p.sector}
                        </span>
                      </td>
                      <td className="text-slate-600 text-xs">{p.projectType?.replace(/_/g, ' ') || UI_STRINGS.common.copy4s9bsz}</td>
                      <td className="text-slate-600 text-xs">{p.city || p.location || UI_STRINGS.common.copy4s9bsz}</td>
                      <td className="font-mono text-slate-800 text-xs text-right font-medium">
                        {p.areaSqFt ? p.areaSqFt.toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.copy4s9bsz}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>
                        {latestBoq?.status ? <StatusBadge status={latestBoq.status} /> : <span className="text-slate-400 text-xs">{UI_STRINGS.common.copy4s9bsz}</span>}
                      </td>
                      <td className="font-mono text-slate-700 text-xs text-right">
                        {latestRev?.totalLines ?? UI_STRINGS.common.copy4s9bsz}
                      </td>
                      <td className="text-slate-500 text-xs whitespace-nowrap">
                        {new Date(p.updatedAt).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="text-center">
                        <Link
                          href={`/projects/${p.id}`}
                          className="inline-flex items-center justify-center h-8 px-3 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-[#0f52ba] transition-colors shadow-2xs"
                        >{UI_STRINGS.common.view}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
            <span>{UI_STRINGS.common.page}<strong className="font-semibold text-slate-900">{page}</strong>{UI_STRINGS.common.of}<strong className="font-semibold text-slate-900">{totalPages}</strong>{UI_STRINGS.common.copy1b3t0c5}{total}{UI_STRINGS.appAppProjectsPage.records}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >{UI_STRINGS.common.copy1cahyqy}</button>
              <button
                type="button"
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
              >{UI_STRINGS.common.prev}</button>
              <button
                type="button"
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                onClick={() => setPage(p => p + 1)}
                disabled={page === totalPages}
              >{UI_STRINGS.common.next}</button>
              <button
                type="button"
                className="h-8 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >{UI_STRINGS.common.copy1gqblui}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

