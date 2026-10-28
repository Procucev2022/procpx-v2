'use client';
// src/app/(app)/cost-centres/page.tsx - Enterprise Cost Centres Workspace
import { useState, useEffect } from 'react';
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

export default function CostCentresPage() {
  const [costCentres, setCostCentres] = useState<any[]>([]);
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
    loadData();
  }, [selectedProjectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ccRes, pRes] = await Promise.all([
        fetch(`/api/cost-centres${selectedProjectId ? `?projectId=${selectedProjectId}` : ''}`),
        fetch('/api/projects'),
      ]);
      if (ccRes.ok) {
        const ccData = await ccRes.json();
        setCostCentres(ccData);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProjects(pData.data || pData || []);
        if (pData.data && pData.data.length > 0 && !formProject) {
          setFormProject(pData.data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!canCreate) {
      setError('Insufficient permissions: Only Project Users and Administrators can create cost centres.');
      return;
    }
    if (!formProject || !formCode || !formName) {
      setError('Project, Code, and Name are mandatory.');
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
        throw new Error(err.error || 'Failed to create cost centre');
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

  const filtered = costCentres.filter(cc => {
    if (search) {
      const q = search.toLowerCase();
      return (
        cc.code.toLowerCase().includes(q) ||
        cc.name.toLowerCase().includes(q) ||
        (cc.location && cc.location.toLowerCase().includes(q)) ||
        (cc.floorZone && cc.floorZone.toLowerCase().includes(q)) ||
        (cc.project && cc.project.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalArea = filtered.reduce((s, c) => s + (c.areaSqFt || 0), 0);
  const totalApproved = filtered.reduce((s, c) => s + (c.approvedBudget || 0), 0);
  const totalBudget = filtered.reduce((s, c) => s + (c.totalBudget || 0), 0);
  const avgRatePerSqft = totalArea > 0 ? totalApproved / totalArea : 0;

  return (
    <div className="w-full">
      <PageHeader
        title="Cost Centres"
        subtitle="First-class project commercial containers tracking floor area, square-foot benchmarks, and budget allocations."
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} /> Create Cost Centre
            </button>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label="Cost Centres"
          value={costCentres.length}
          secondary="Active and operational"
          accent="default"
        />
        <SummaryCard
          label="Total Fitout Area"
          value={`${totalArea.toLocaleString('en-IN')} Sqft`}
          secondary={`Across ${filtered.length} functional zones`}
          accent="neutral"
        />
        <SummaryCard
          label="Approved Budget"
          value={`₹ ${(totalApproved / 100000).toFixed(2)} Lakhs`}
          secondary={`Total Allocated: ₹ ${(totalBudget / 100000).toFixed(2)} L`}
          accent="blue"
        />
        <SummaryCard
          label="Average Benchmark"
          value={`₹ ${Math.round(avgRatePerSqft).toLocaleString('en-IN')} / Sqft`}
          secondary="Commercial rate per unit area"
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
            placeholder="Search Cost Centre code, name, zone or location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="input h-[40px] min-w-[260px] text-sm bg-white cursor-pointer"
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.projectCode} — {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Cost Centre Table */}
      <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Code</th>
                <th style={{ minWidth: 200 }}>Cost Centre Name</th>
                <th style={{ minWidth: 180 }}>Project</th>
                <th style={{ width: 120, textAlign: 'right' }}>Area (Sqft)</th>
                <th style={{ width: 160 }}>Location / Zone</th>
                <th style={{ width: 140, textAlign: 'right' }}>Approved Budget</th>
                <th style={{ width: 120, textAlign: 'right' }}>₹ / Sqft</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 140, textAlign: 'center' }}>Quick Actions</th>
              </tr>
            </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  Loading cost centres...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  No cost centres found matching criteria.
                </td>
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
                    <div style={{ fontWeight: 500 }}>{cc.project?.name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{cc.project?.projectCode}</div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#0f172a', fontWeight: 600 }}>
                    {cc.areaSqFt ? `${cc.areaSqFt.toLocaleString('en-IN')} sqft` : '—'}
                  </td>
                  <td style={{ padding: '0 16px', color: '#64748b' }}>
                    <div>{cc.location || '—'}</div>
                    {cc.floorZone && <div style={{ fontSize: 11, color: '#94a3b8' }}>{cc.floorZone}</div>}
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>
                    ₹ {(cc.approvedBudget || 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 600, color: '#047857' }}>
                    {cc.ratePerSqFt ? `₹ ${cc.ratePerSqFt} / sqft` : '—'}
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <StatusBadge status={cc.status} />
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'center' }}>
                    <div className="inline-flex items-center gap-1.5 justify-center">
                      <Link
                        href={`/boq/studio?costCentreId=${cc.id}&projectId=${cc.projectId}`}
                        className="btn btn-secondary btn-sm h-7 px-2.5 text-xs font-semibold"
                        title="Open in BOQ Studio"
                      >
                        <Sparkles size={12} /> BOQ Studio
                      </Link>
                      <Link
                        href={`/budget?costCentreId=${cc.id}&projectId=${cc.projectId}`}
                        className="btn btn-secondary btn-sm h-7 px-2.5 text-xs font-semibold"
                        title="View Budget Ledger"
                      >
                        <Landmark size={12} /> Budget
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>Create New Cost Centre</h3>
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
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Select Project *
                  </label>
                  <select
                    className="select-field"
                    value={formProject}
                    onChange={e => setFormProject(e.target.value)}
                    style={{ width: '100%', height: 38 }}
                    required
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.projectCode} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Code * (e.g. CC-006)
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="CC-006"
                      value={formCode}
                      onChange={e => setFormCode(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Cost Centre Name *
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Signage & Façade"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Area Sqft (for ₹ / Sqft metric)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="input-field"
                      placeholder="e.g. 8500"
                      value={formArea}
                      onChange={e => setFormArea(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Location
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Ground Floor"
                      value={formLocation}
                      onChange={e => setFormLocation(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Floor / Zone
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Zone A - Customer Retail Hall"
                    value={formZone}
                    onChange={e => setFormZone(e.target.value)}
                    style={{ width: '100%', height: 38 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Description
                  </label>
                  <textarea
                    className="input-field"
                    placeholder="Scope description for this cost centre..."
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
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creating}
                  >
                    {creating ? 'Saving...' : 'Save Cost Centre'}
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
