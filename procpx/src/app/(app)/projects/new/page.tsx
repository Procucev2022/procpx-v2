'use client';
// app/(app)/projects/new/page.tsx - Create project
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

const SECTORS = ['RETAIL', 'HOSPITALITY', 'BANKING', 'INSURANCE', 'OTHER'];
const PROJECT_TYPES = ['NEW_BUILD', 'RENOVATION', 'REFURBISHMENT', 'EXPANSION', 'REPLACEMENT', 'FIT_OUT', 'MAINTENANCE_CAPEX', 'OTHER'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [form, setForm] = useState({
    name: '', description: '', sector: '', projectType: '',
    location: '', address: '', city: '', state: '', country: 'India',
    areaSqFt: '', costCentre: '', projectOwner: '',
    budget: '', currency: 'INR', businessUnit: '',
    numberOfFloors: '', numberOfUnits: '',
    startDate: '', targetCompletion: '',
  });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        const role = d.data?.user?.role || d.user?.role || '';
        setCurrentUserRole(role);
      })
      .catch(() => {});
  }, []);

  const canCreate = !currentUserRole || ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'].includes(currentUserRole);

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (currentUserRole && !canCreate) {
      return setError('Forbidden: Your role does not have permission to create projects.');
    }
    if (!form.name.trim()) return setError('Project name is required.');
    if (!form.sector) return setError('Sector is required.');
    if (!form.projectType) return setError('Project type is required.');

    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Fallback if response is empty or non-JSON
      }
      if (!res.ok) {
        setError(data?.error || `Failed to create project (HTTP ${res.status}). Please check details and retry.`);
        return;
      }
      if (data?.id) {
        router.push(`/projects/${data.id}`);
      } else {
        router.push('/projects');
      }
    } catch (err: any) {
      console.error('[Create Project Network Error]:', err);
      setError(err?.message || 'A network error occurred while connecting to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content">
      <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
        <div>
          <div className="page-title">Create New Project</div>
          <div className="page-subtitle">Project ID will be auto-generated (CPX-P-XXXXXX)</div>
        </div>
        <Link href="/projects" className="btn btn-secondary">Cancel</Link>
      </div>

      {currentUserRole && !canCreate && (
        <div className="alert alert-warning mb-4" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e' }}>
          <ShieldAlert size={18} color="#d97706" />
          <span>
            <strong>Read-Only Notice:</strong> Your current role (<code>{currentUserRole}</code>) has read-only access to projects. Only Project Users and Administrators can create projects.
          </span>
        </div>
      )}

      {error && (
        <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Basic Information</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Project Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Premium Retail Store – Bengaluru" required />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Sector <span className="required">*</span></label>
                <select className="form-control" value={form.sector} onChange={e => update('sector', e.target.value)} required>
                  <option value="">Select Sector</option>
                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Project Type <span className="required">*</span></label>
                <select className="form-control" value={form.projectType} onChange={e => update('projectType', e.target.value)} required>
                  <option value="">Select Type</option>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Project Description</label>
              <textarea className="form-control" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Brief description of the project scope..." rows={3} />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Location</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-control" value={form.city} onChange={e => update('city', e.target.value)} placeholder="Bengaluru" />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input className="form-control" value={form.state} onChange={e => update('state', e.target.value)} placeholder="Karnataka" />
              </div>
              <div className="form-group">
                <label className="form-label">Country</label>
                <input className="form-control" value={form.country} onChange={e => update('country', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Location / Area</label>
                <input className="form-control" value={form.location} onChange={e => update('location', e.target.value)} placeholder="Koramangala" />
              </div>
              <div className="form-group col-span-2">
                <label className="form-label">Address</label>
                <input className="form-control" value={form.address} onChange={e => update('address', e.target.value)} placeholder="Full site address" />
              </div>
            </div>
          </div>
        </div>

        {/* Project Details */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Project Details</span></div>
          <div className="card-body">
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">Area (Sq Ft)</label>
                <input className="form-control" type="number" value={form.areaSqFt} onChange={e => update('areaSqFt', e.target.value)} placeholder="25000" />
              </div>
              <div className="form-group">
                <label className="form-label">Cost Centre</label>
                <input className="form-control" value={form.costCentre} onChange={e => update('costCentre', e.target.value)} placeholder="RET-BLR-001" />
              </div>
              <div className="form-group">
                <label className="form-label">Project Owner</label>
                <input className="form-control" value={form.projectOwner} onChange={e => update('projectOwner', e.target.value)} placeholder="Name or Team" />
              </div>
              <div className="form-group">
                <label className="form-label">Budget</label>
                <input className="form-control" type="number" value={form.budget} onChange={e => update('budget', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select className="form-control" value={form.currency} onChange={e => update('currency', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Business Unit</label>
                <input className="form-control" value={form.businessUnit} onChange={e => update('businessUnit', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Number of Floors</label>
                <input className="form-control" type="number" value={form.numberOfFloors} onChange={e => update('numberOfFloors', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Number of Units / Outlets</label>
                <input className="form-control" type="number" value={form.numberOfUnits} onChange={e => update('numberOfUnits', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="card mb-6">
          <div className="card-header"><span className="card-title">Timeline</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Project Start Date</label>
                <input className="form-control" type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Target Completion Date</label>
                <input className="form-control" type="date" value={form.targetCompletion} onChange={e => update('targetCompletion', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3" style={{ justifyContent: 'flex-end' }}>
          <Link href="/projects" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading || Boolean(currentUserRole && !canCreate)}>
            {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Creating...</> : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
