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
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e40af' }}>
              <Layers size={20} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Cost Centres</h1>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            First-class project commercial containers tracking floor area, square-foot benchmarks, and budget allocations.
          </p>
        </div>
        {canCreate && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} /> Create Cost Centre
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: '16px 20px', background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            Cost Centres
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{costCentres.length}</div>
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={13} /> Active and operational
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            Total Fitout Area
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
            {totalArea.toLocaleString('en-IN')} <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Sqft</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Across {filtered.length} functional zones
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            Approved Budget
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>
            ₹ {(totalApproved / 100000).toFixed(2)} <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Lakhs</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Total Allocated: ₹ {(totalBudget / 100000).toFixed(2)} L
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            Average Benchmark
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
            ₹ {Math.round(avgRatePerSqft).toLocaleString('en-IN')} <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>/ Sqft</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Commercial rate per unit area
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search Cost Centre code, name, zone or location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 38, height: 40, width: '100%' }}
          />
        </div>

        <select
          className="select-field"
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
          style={{ height: 40, minWidth: 260 }}
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
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Code</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Cost Centre Name</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Project</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Area (Sqft)</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Location / Zone</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>Approved Budget</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>₹ / Sqft</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>Quick Actions</th>
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
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: cc.status === 'ACTIVE' ? '#ecfdf5' : '#f1f5f9',
                        color: cc.status === 'ACTIVE' ? '#047857' : '#64748b',
                      }}
                    >
                      <CheckCircle2 size={11} /> {cc.status}
                    </span>
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <Link
                        href={`/boq/studio?costCentreId=${cc.id}&projectId=${cc.projectId}`}
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        title="Open in BOQ Studio"
                      >
                        <Sparkles size={12} /> BOQ Studio
                      </Link>
                      <Link
                        href={`/budget?costCentreId=${cc.id}&projectId=${cc.projectId}`}
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
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
