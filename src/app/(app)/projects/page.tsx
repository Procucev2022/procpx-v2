'use client';
// app/(app)/projects/page.tsx - Standardised Enterprise Projects Register
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { reportHandledClientFailure } from '@/lib/observability/client-reporter';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Folder, Plus, FolderPlus, X, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { PROJECTS_PAGE_SIZE, SECTORS, PROJECT_TYPES, CURRENCIES, INITIAL_PROJECT_FORM } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { ProjectFormState } from '@app-types/app/(app)/projects/page.types';



export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<ProjectFormState>(INITIAL_PROJECT_FORM);
  const pageSize = PROJECTS_PAGE_SIZE;

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        const role = d.data?.user?.role || d.user?.role || '';
        setCanCreate(['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'].includes(role));
      })
      .catch((error: unknown) => reportHandledClientFailure(error, {
        operation: 'load_project_creation_permission', route: '/api/auth/me',
      }));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    fetch(`/api/projects?${params}`)
      .then(r => r.json())
      .then(d => { setProjects(d.data || []); setTotal(d.total || 0); setLoading(false); });
  }, [page, pageSize]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen && !submitting) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, submitting]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError(UI_STRINGS.common.projectNameIsRequired);
      return;
    }
    if (!form.sector) {
      setFormError(UI_STRINGS.common.sectorIsRequired);
      return;
    }
    if (!form.projectType) {
      setFormError(UI_STRINGS.common.projectTypeIsRequired);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      let data: { error?: string } | null = null;
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        // Fallback for empty body
      }
      if (!res.ok) {
        setFormError(
          interpolateUiString(UI_STRINGS.common.value1, {
            value1: data?.error || interpolateUiString(UI_STRINGS.common.userMessages.failedToCreateProjectHttpPleaseCheckDetailsAndRetry, { status: res.status }),
          })
        );
        return;
      }
      setModalOpen(false);
      setForm(INITIAL_PROJECT_FORM);
      load();
    } catch (err: unknown) {
      reportHandledClientFailure(err, { operation: 'create_project_modal', route: '/api/projects' });
      const errorMessage = err instanceof Error ? err.message : UI_STRINGS.common.userMessages.aNetworkErrorOccurredWhileConnectingToTheServerPleaseTryAgain;
      setFormError(
        interpolateUiString(UI_STRINGS.common.value1, {
          value1: errorMessage,
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="w-full">
      <PageHeader
        title={UI_STRINGS.common.projects}
        subtitle={interpolateUiString(UI_STRINGS.appAppProjectsPage.totalCapexProjectValue2InPlatformWorkspace, { "total": total, "value2": total !== 1 ? 's' : '' })}
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => {
                setForm(INITIAL_PROJECT_FORM);
                setFormError('');
                setModalOpen(true);
              }}
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus size={16} />{UI_STRINGS.appAppProjectsPage.newProject}
            </button>
          ) : undefined
        }
      />

      <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
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
              onAction={canCreate ? () => {
                setForm(INITIAL_PROJECT_FORM);
                setFormError('');
                setModalOpen(true);
              } : undefined}
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

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-modal-title"
          style={{ zIndex: 1000 }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 md:p-6 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setModalOpen(false);
            }
          }}
        >
          <div
            className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                  <FolderPlus size={20} />
                </div>
                <div>
                  <h2 id="create-project-modal-title" className="text-lg font-bold text-slate-900">
                    {UI_STRINGS.appAppProjectsNewPage.createNewProject}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {UI_STRINGS.appAppProjectsNewPage.projectIDWillBeAutoGeneratedInStandardFormatCPXPXXXXXX}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
                aria-label={UI_STRINGS.common.closeDialog}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form Scrollable Content */}
            <form onSubmit={handleCreateProject} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-5 sm:p-6 md:p-8 space-y-6 bg-slate-50/60 flex-1">
                {formError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2.5">
                    <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Section 1: Basic Information */}
                <div
                  className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)' }}
                >
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', marginBottom: '18px' }}>
                    <span className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {1}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{UI_STRINGS.common.basicInformation}</h3>
                      <p className="text-xs text-slate-500">{UI_STRINGS.appAppProjectsNewPage.defineCoreProjectIdentifiersIndustrySectorAndOperationalScope}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px' }}>
                    <div className="form-field col-span-2" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {UI_STRINGS.common.projectName}
                        <span className="text-rose-600 font-bold ml-0.5">{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.name}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.eGPremiumRetailStoreBengaluruFlagship}
                        required
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {UI_STRINGS.common.sector}
                        <span className="text-rose-600 font-bold ml-0.5">{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <select
                        name="sector"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box', cursor: 'pointer' }}
                        value={form.sector}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">{UI_STRINGS.appAppProjectsNewPage.selectSector}</option>
                        {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {UI_STRINGS.appAppProjectsNewPage.projectType}
                        <span className="text-rose-600 font-bold ml-0.5">{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <select
                        name="projectType"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box', cursor: 'pointer' }}
                        value={form.projectType}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">{UI_STRINGS.appAppProjectsNewPage.selectType}</option>
                        {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>

                    <div className="form-field col-span-2" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">
                        {UI_STRINGS.appAppProjectsNewPage.projectDescriptionScopeSummary}
                      </label>
                      <textarea
                        name="description"
                        className="input h-[84px] py-2.5 text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                        style={{ minHeight: '84px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '10px 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box', resize: 'none' }}
                        value={form.description}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.briefDescriptionOfTheCapexScopeKeyMilestonesAndBusinessObjectives}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Location & Site Address */}
                <div
                  className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)' }}
                >
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', marginBottom: '18px' }}>
                    <span className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {2}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{UI_STRINGS.appAppProjectsNewPage.locationSiteAddress}</h3>
                      <p className="text-xs text-slate-500">{UI_STRINGS.appAppProjectsNewPage.geographicParametersForRegionalCostCentreAlignmentAndDeliveryLogistics}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px' }}>
                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.common.city}</label>
                      <input
                        type="text"
                        name="city"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.city}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.common.bengaluru}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.common.stateRegion}</label>
                      <input
                        type="text"
                        name="state"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.state}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.karnataka}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.country}</label>
                      <input
                        type="text"
                        name="country"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.country}
                        onChange={handleInputChange}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.locationCommercialArea}</label>
                      <input
                        type="text"
                        name="location"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.location}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.eGKoramangala5thBlock}
                      />
                    </div>

                    <div className="form-field col-span-2" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.fullSiteAddress}</label>
                      <input
                        type="text"
                        name="address"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.address}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.plotUnitNumberStreetLandmarkPinCode}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Commercial & Technical Specifications */}
                <div
                  className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)' }}
                >
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', marginBottom: '18px' }}>
                    <span className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {3}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{UI_STRINGS.appAppProjectsNewPage.commercialTechnicalSpecifications}</h3>
                      <p className="text-xs text-slate-500">{UI_STRINGS.appAppProjectsNewPage.fitoutFloorAreaCostCentreMappingInitialBudgetAndPhysicalLayout}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px' }}>
                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.common.areaSqFt}</label>
                      <input
                        type="number"
                        name="areaSqFt"
                        className="input h-[40px] text-sm w-full font-mono bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.areaSqFt}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.copyvka61c}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.costCentreCode}</label>
                      <input
                        type="text"
                        name="costCentre"
                        className="input h-[40px] text-sm w-full font-mono bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.costCentre}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.rETBLR001}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.projectOwner}</label>
                      <input
                        type="text"
                        name="projectOwner"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.projectOwner}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.nameOrFunctionalLead}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.budgetEst}</label>
                      <input
                        type="number"
                        name="budget"
                        className="input h-[40px] text-sm w-full font-mono bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.budget}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.common.copywwhtor}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.common.currency}</label>
                      <select
                        name="currency"
                        className="input h-[40px] text-sm w-full font-mono bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box', cursor: 'pointer' }}
                        value={form.currency}
                        onChange={handleInputChange}
                      >
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.businessUnit}</label>
                      <input
                        type="text"
                        name="businessUnit"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.businessUnit}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.appAppProjectsNewPage.eGRetailOperations}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.numberOfFloors}</label>
                      <input
                        type="number"
                        name="numberOfFloors"
                        className="input h-[40px] text-sm w-full font-mono bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.numberOfFloors}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.common.copyefwnq4}
                      />
                    </div>

                    <div className="form-field col-span-2" style={{ gridColumn: 'span 2', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.numberOfUnitsOutlets}</label>
                      <input
                        type="number"
                        name="numberOfUnits"
                        className="input h-[40px] text-sm w-full font-mono bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.numberOfUnits}
                        onChange={handleInputChange}
                        placeholder={UI_STRINGS.common.copyefwnq4}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 4: Project Timeline */}
                <div
                  className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4"
                  style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)' }}
                >
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', marginBottom: '18px' }}>
                    <span className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {4}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{UI_STRINGS.appAppProjectsNewPage.projectTimeline}</h3>
                      <p className="text-xs text-slate-500">{UI_STRINGS.appAppProjectsNewPage.targetStartAndCompletionScheduleForProcurementPlanning}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px' }}>
                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.projectStartDate}</label>
                      <input
                        type="date"
                        name="startDate"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.startDate}
                        onChange={handleInputChange}
                      />
                    </div>

                    <div className="form-field" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="form-label text-xs font-semibold text-slate-700">{UI_STRINGS.appAppProjectsNewPage.targetCompletionDate}</label>
                      <input
                        type="date"
                        name="targetCompletion"
                        className="input h-[40px] text-sm w-full bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 14px', backgroundColor: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
                        value={form.targetCompletion}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-end gap-4 shrink-0"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px', padding: '16px 24px', backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0' }}
              >
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="btn btn-secondary border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 h-[40px] px-5 text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#334155', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {UI_STRINGS.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary h-[40px] px-6 text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  style={{ height: '40px', padding: '0 24px', borderRadius: '8px', border: 'none', backgroundColor: '#1e40af', color: '#ffffff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.05)' }}
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{UI_STRINGS.appAppProjectsNewPage.creatingProject}</span>
                    </>
                  ) : (
                    <span>{UI_STRINGS.appAppProjectsNewPage.createProject}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

