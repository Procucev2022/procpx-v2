'use client';
// src/app/(app)/cost-centres/page.tsx - Enterprise Cost Centres Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Layers,
  Plus,
  Search,
  Building2,
  PieChart,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Landmark,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { CostCentrePagePagination, CostCentrePageRow, CostCentrePageSummary } from '@app-types/app/api/cost-centres.types';


export default function CostCentresPage() {
  const [costCentres, setCostCentres] = useState<CostCentrePageRow[]>([]);
  const [pagination, setPagination] = useState<CostCentrePagePagination>({ page: 1, pageSize: 50, total: 0, hasMore: false });
  const [summary, setSummary] = useState<CostCentrePageSummary>({ totalAreaSqFt: 0, totalBudget: 0, approvedBudget: 0, pendingBudget: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSequence = useRef(0);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formProject, setFormProject] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formDesc, setFormDesc] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        const role = d.data?.user?.role || d.user?.role || '';
        setCanCreate(['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'].includes(role));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void loadData(); }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [selectedProjectId, search]);

  const loadData = async (page = 1, append = false) => {
    const sequence = ++loadSequence.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError('');
      setCostCentres([]);
    }
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (selectedProjectId) query.set('projectId', selectedProjectId);
      if (search.trim()) query.set('search', search.trim());
      const ccRes = await fetch(`/api/cost-centres?${query.toString()}`);
      if (!ccRes.ok) throw new Error(UI_STRINGS.common.userMessages.failedToFetchCostCentres);
      const ccData = await ccRes.json();
      if (sequence !== loadSequence.current) return;
      const payload = ccData.data || ccData;
      const rows: CostCentrePageRow[] = Array.isArray(payload) ? payload : payload.costCentres || [];
      setCostCentres((current) => {
        if (!append) return rows;
        const existingIds = new Set(current.map((costCentre) => costCentre.id));
        return [...current, ...rows.filter((costCentre) => !existingIds.has(costCentre.id))];
      });
      setPagination(payload.pagination || { page, pageSize: rows.length, total: rows.length, hasMore: false });
      if (payload.summary) {
        setSummary(payload.summary);
      } else if (!append) {
        setSummary({
          totalAreaSqFt: rows.reduce((total, row) => total + (row.areaSqFt || 0), 0),
          totalBudget: rows.reduce((total, row) => total + (row.totalBudget || 0), 0),
          approvedBudget: rows.reduce((total, row) => total + (row.approvedBudget || 0), 0),
          pendingBudget: rows.reduce((total, row) => total + (row.pendingBudget || 0), 0),
        });
      }
      if (page === 1 && projects.length === 0) {
        const pRes = await fetch('/api/projects');
        if (pRes.ok) {
          const pData = await pRes.json();
          setProjects(pData.data || pData || []);
          if (pData.data && pData.data.length > 0 && !formProject) {
            setFormProject(pData.data[0].id);
          }
        }
      }
    } catch (e) {
      if (sequence === loadSequence.current && e instanceof Error) {
        console.error('Failed to load cost centre register', e);
        setError(e.message);
      }
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const loadMoreCostCentres = () => {
    if (!loading && !loadingMore && pagination.hasMore) void loadData(pagination.page + 1, true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!canCreate) {
      setError(UI_STRINGS.appAppCostCentresPage.insufficientPermissionsOnlyProjectUsersAndAdministratorsCanCreateCostCentres);
      return;
    }
    if (!formProject || !formCode || !formName) {
      setError(UI_STRINGS.appAppCostCentresPage.projectCodeAndNameAreMandatory);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/cost-centres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: formProject,
          code: formCode,
          name: formName,
          areaSqFt: formArea ? parseFloat(formArea) : null,
          location: formLocation,
          floorZone: formZone,
          description: formDesc,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToCreateCostCentre }));
      }
      setModalOpen(false);
      setFormCode('');
      setFormName('');
      setFormArea('');
      setFormLocation('');
      setFormZone('');
      setFormDesc('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const filtered = costCentres;
  const totalArea = summary.totalAreaSqFt;
  const totalApproved = summary.approvedBudget;
  const totalBudget = summary.totalBudget;
  const avgRatePerSqft = totalArea > 0 ? totalApproved / totalArea : 0;

  return (
    <div className="w-full">
      <PageHeader
        title={UI_STRINGS.appAppCostCentresPage.costCentres}
        subtitle={UI_STRINGS.appAppCostCentresPage.firstClassProjectCommercialContainersTrackingFloorAreaSquareFootBenchmarksAndBudgetAllocations}
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} />{UI_STRINGS.appAppCostCentresPage.createCostCentre}</button>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label={UI_STRINGS.appAppCostCentresPage.costCentres}
          value={pagination.total}
          secondary={UI_STRINGS.appAppCostCentresPage.activeAndOperational}
          accent="default"
        />
        <SummaryCard
          label={UI_STRINGS.appAppCostCentresPage.totalFitoutArea}
          value={`${totalArea.toLocaleString(I18N_CONFIG.defaultLocale)} Sqft`}
          secondary={interpolateUiString(UI_STRINGS.appAppCostCentresPage.acrossLengthFunctionalZones, { "length": pagination.total })}
          accent="neutral"
        />
        <SummaryCard
          label={UI_STRINGS.common.approvedBudget}
          value={`₹ ${(totalApproved / 100000).toFixed(2)} Lakhs`}
          secondary={interpolateUiString(UI_STRINGS.appAppCostCentresPage.totalAllocatedToFixedL, { "toFixed": (totalBudget / 100000).toFixed(2) })}
          accent="blue"
        />
        <SummaryCard
          label={UI_STRINGS.appAppCostCentresPage.averageBenchmark}
          value={`₹ ${Math.round(avgRatePerSqft).toLocaleString(I18N_CONFIG.defaultLocale)} / Sqft`}
          secondary={UI_STRINGS.appAppCostCentresPage.commercialRatePerUnitArea}
          accent="emerald"
        />
      </SummaryCardGrid>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            className="input pl-9 h-[40px] w-full text-sm bg-white"
            placeholder={UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="input h-[40px] min-w-[260px] text-sm bg-white cursor-pointer"
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
        >
          <option value="">{UI_STRINGS.common.allProjects}</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.projectCode}{UI_STRINGS.common.copyq9aflv}{p.name}
            </option>
          ))}
        </select>
      </div>

      {error && !modalOpen && (
        <div role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Cost Centre Table */}
      <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>{UI_STRINGS.common.code}</th>
                <th style={{ minWidth: 200 }}>{UI_STRINGS.appAppCostCentresPage.costCentreName}</th>
                <th style={{ minWidth: 180 }}>{UI_STRINGS.common.project}</th>
                <th style={{ width: 120, textAlign: 'right' }}>{UI_STRINGS.appAppCostCentresPage.areaSqft}</th>
                <th style={{ width: 160 }}>{UI_STRINGS.appAppCostCentresPage.locationZone}</th>
                <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.common.approvedBudget}</th>
                <th style={{ width: 120, textAlign: 'right' }}>{UI_STRINGS.common.sqft}</th>
                <th style={{ width: 110 }}>{UI_STRINGS.common.status}</th>
                <th style={{ width: 140, textAlign: 'center' }}>{UI_STRINGS.appAppCostCentresPage.quickActions}</th>
              </tr>
            </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppCostCentresPage.loadingCostCentres}</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppCostCentresPage.noCostCentresFoundMatchingCriteria}</td>
              </tr>
            ) : (
              filtered.map(cc => (
                <tr key={cc.id} style={{ borderBottom: '1px solid #f1f5f9', height: 52 }}>
                  <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                    {cc.code}
                  </td>
                  <td style={{ padding: '0 16px', fontWeight: 600, color: '#0f172a' }}>
                    <div>{cc.name}</div>
                    {cc.description && <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{cc.description}</div>}
                  </td>
                  <td style={{ padding: '0 16px', color: '#334155' }}>
                    <div style={{ fontWeight: 500 }}>{cc.project?.name || UI_STRINGS.common.copy4s9bsz}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{cc.project?.projectCode}</div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#0f172a', fontWeight: 600 }}>
                    {cc.areaSqFt ? interpolateUiString(UI_STRINGS.appAppCostCentresPage.toLocaleStringSqft, { "toLocaleString": cc.areaSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                  </td>
                  <td style={{ padding: '0 16px', color: '#64748b' }}>
                    <div>{cc.location || UI_STRINGS.common.copy4s9bsz}</div>
                    {cc.floorZone && <div style={{ fontSize: 11, color: '#94a3b8' }}>{cc.floorZone}</div>}
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{UI_STRINGS.common.copy1g8b5tg}{(cc.approvedBudget || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 600, color: '#047857' }}>
                    {cc.ratePerSqFt ? interpolateUiString(UI_STRINGS.appAppCostCentresPage.ratePerSqFtSqft, { "ratePerSqFt": cc.ratePerSqFt }) : UI_STRINGS.common.copy4s9bsz}
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <StatusBadge status={cc.status} />
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'center' }}>
                    <div className="inline-flex items-center gap-1.5 justify-center">
                      <Link
                        href={`/boq/studio?costCentreId=${cc.id}&projectId=${cc.projectId}`}
                        className="btn btn-secondary btn-sm h-7 px-2.5 text-xs font-semibold"
                        title={UI_STRINGS.appAppCostCentresPage.openInBOQStudio}
                      >
                        <Sparkles size={12} />{UI_STRINGS.common.bOQStudio}</Link>
                      <Link
                        href={`/budget?costCentreId=${cc.id}&projectId=${cc.projectId}`}
                        className="btn btn-secondary btn-sm h-7 px-2.5 text-xs font-semibold"
                        title={UI_STRINGS.appAppCostCentresPage.viewBudgetLedger}
                      >
                        <Landmark size={12} />{UI_STRINGS.appAppCostCentresPage.budget}</Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-600">
            {interpolateUiString(UI_STRINGS.appAppCostCentresPage.showingCostCentreCountOfTotal, {
              loaded: costCentres.length,
              total: pagination.total,
            })}
          </span>
          {pagination.hasMore && (
            <button
              type="button"
              onClick={loadMoreCostCentres}
              disabled={loading || loadingMore}
              className="btn btn-secondary text-xs"
            >
              {loadingMore
                ? UI_STRINGS.appAppCostCentresPage.loadingMoreCostCentres
                : UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres}
            </button>
          )}
        </div>
      )}
    </div>

      {/* Modal: Create Cost Centre */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            className="card"
            style={{
              background: '#ffffff',
              borderRadius: 8,
              width: 540,
              maxWidth: '90vw',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={18} color="#1e40af" />
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppCostCentresPage.createNewCostCentre}</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppCostCentresPage.selectProject}</label>
                  <select
                    className="select-field"
                    value={formProject}
                    onChange={e => setFormProject(e.target.value)}
                    style={{ width: '100%', height: 38 }}
                    required
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.projectCode}{UI_STRINGS.common.copyq9aflv}{p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppCostCentresPage.codeEGCC006}</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={UI_STRINGS.appAppCostCentresPage.cC006}
                      value={formCode}
                      onChange={e => setFormCode(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppCostCentresPage.costCentreName2}</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={UI_STRINGS.appAppCostCentresPage.eGSignageFacAde}
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppCostCentresPage.areaSqftForSqftMetric}</label>
                    <input
                      type="number"
                      step="any"
                      className="input-field"
                      placeholder={UI_STRINGS.appAppCostCentresPage.eG8500}
                      value={formArea}
                      onChange={e => setFormArea(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.location}</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={UI_STRINGS.appAppCostCentresPage.eGGroundFloor}
                      value={formLocation}
                      onChange={e => setFormLocation(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppCostCentresPage.floorZone}</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={UI_STRINGS.appAppCostCentresPage.eGZoneACustomerRetailHall}
                    value={formZone}
                    onChange={e => setFormZone(e.target.value)}
                    style={{ width: '100%', height: 38 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.description}</label>
                  <textarea
                    className="input-field"
                    placeholder={UI_STRINGS.appAppCostCentresPage.scopeDescriptionForThisCostCentre}
                    rows={2}
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setModalOpen(false)}
                    disabled={creating}
                  >{UI_STRINGS.common.cancel}</button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creating}
                  >
                    {creating ? UI_STRINGS.common.saving : UI_STRINGS.appAppCostCentresPage.saveCostCentre}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
