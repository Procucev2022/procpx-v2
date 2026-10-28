'use client';
// app/(app)/projects/new/page.tsx - Standardised Create Project Workspace
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';

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
    <div className="w-full max-w-5xl mx-auto">
      <PageHeader
        title="Create New Project"
        subtitle="Project ID will be auto-generated in standard format (CPX-P-XXXXXX)"
        backHref="/projects"
        backLabel="Back to Projects"
      />

      {currentUserRole && !canCreate && (
        <div className="p-3.5 mb-6 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center gap-2.5">
          <ShieldAlert size={18} className="text-amber-600 shrink-0" />
          <span>
            <strong>Read-Only Notice:</strong> Your current role (<code>{currentUserRole}</code>) has read-only access to projects. Only Project Users and Administrators can create projects.
          </span>
        </div>
      )}

      {error && (
        <div className="p-3.5 mb-6 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center gap-2.5">
          <AlertTriangle size={18} className="text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Information */}
        <FormSection
          sectionNumber="1"
          title="Basic Information"
          subtitle="Define core project identifiers, industry sector, and operational scope"
        >
          <div className="space-y-4">
            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">
                Project Name <span className="text-rose-600 font-bold">*</span>
              </label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Premium Retail Store – Bengaluru Flagship"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-field">
                <label className="form-label text-xs font-semibold text-slate-700">
                  Sector <span className="text-rose-600 font-bold">*</span>
                </label>
                <select
                  className="input h-[40px] text-sm w-full cursor-pointer"
                  value={form.sector}
                  onChange={e => update('sector', e.target.value)}
                  required
                >
                  <option value="">Select Sector</option>
                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label text-xs font-semibold text-slate-700">
                  Project Type <span className="text-rose-600 font-bold">*</span>
                </label>
                <select
                  className="input h-[40px] text-sm w-full cursor-pointer"
                  value={form.projectType}
                  onChange={e => update('projectType', e.target.value)}
                  required
                >
                  <option value="">Select Type</option>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">
                Project Description / Scope Summary
              </label>
              <textarea
                className="input h-auto min-h-[90px] py-2 text-sm w-full"
                value={form.description}
                onChange={e => update('description', e.target.value)}
                placeholder="Brief description of the Capex scope, key milestones, and business objectives..."
                rows={3}
              />
            </div>
          </div>
        </FormSection>

        {/* Section 2: Location */}
        <FormSection
          sectionNumber="2"
          title="Location & Site Address"
          subtitle="Geographic parameters for regional cost centre alignment and delivery logistics"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">City</label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.city}
                onChange={e => update('city', e.target.value)}
                placeholder="Bengaluru"
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">State / Region</label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.state}
                onChange={e => update('state', e.target.value)}
                placeholder="Karnataka"
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Country</label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.country}
                onChange={e => update('country', e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Location / Commercial Area</label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.location}
                onChange={e => update('location', e.target.value)}
                placeholder="e.g. Koramangala 5th Block"
              />
            </div>

            <div className="form-field md:col-span-2">
              <label className="form-label text-xs font-semibold text-slate-700">Full Site Address</label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.address}
                onChange={e => update('address', e.target.value)}
                placeholder="Plot / Unit number, Street, Landmark, Pin code"
              />
            </div>
          </div>
        </FormSection>

        {/* Section 3: Commercial & Project Details */}
        <FormSection
          sectionNumber="3"
          title="Commercial & Technical Specifications"
          subtitle="Fitout floor area, Cost Centre mapping, initial budget, and physical layout"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Area (Sq Ft)</label>
              <input
                className="input h-[40px] text-sm w-full font-mono"
                type="number"
                value={form.areaSqFt}
                onChange={e => update('areaSqFt', e.target.value)}
                placeholder="25000"
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Cost Centre Code</label>
              <input
                className="input h-[40px] text-sm w-full font-mono"
                value={form.costCentre}
                onChange={e => update('costCentre', e.target.value)}
                placeholder="RET-BLR-001"
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Project Owner</label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.projectOwner}
                onChange={e => update('projectOwner', e.target.value)}
                placeholder="Name or Functional Lead"
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Budget (Est.)</label>
              <input
                className="input h-[40px] text-sm w-full font-mono"
                type="number"
                value={form.budget}
                onChange={e => update('budget', e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Currency</label>
              <select
                className="input h-[40px] text-sm w-full cursor-pointer font-mono"
                value={form.currency}
                onChange={e => update('currency', e.target.value)}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Business Unit</label>
              <input
                className="input h-[40px] text-sm w-full"
                value={form.businessUnit}
                onChange={e => update('businessUnit', e.target.value)}
                placeholder="e.g. Retail Operations"
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Number of Floors</label>
              <input
                className="input h-[40px] text-sm w-full font-mono"
                type="number"
                value={form.numberOfFloors}
                onChange={e => update('numberOfFloors', e.target.value)}
                placeholder="1"
              />
            </div>

            <div className="form-field md:col-span-2">
              <label className="form-label text-xs font-semibold text-slate-700">Number of Units / Outlets</label>
              <input
                className="input h-[40px] text-sm w-full font-mono"
                type="number"
                value={form.numberOfUnits}
                onChange={e => update('numberOfUnits', e.target.value)}
                placeholder="1"
              />
            </div>
          </div>
        </FormSection>

        {/* Section 4: Timeline */}
        <FormSection
          sectionNumber="4"
          title="Project Timeline"
          subtitle="Target start and completion schedule for procurement planning"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Project Start Date</label>
              <input
                className="input h-[40px] text-sm w-full cursor-pointer"
                type="date"
                value={form.startDate}
                onChange={e => update('startDate', e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-label text-xs font-semibold text-slate-700">Target Completion Date</label>
              <input
                className="input h-[40px] text-sm w-full cursor-pointer"
                type="date"
                value={form.targetCompletion}
                onChange={e => update('targetCompletion', e.target.value)}
              />
            </div>
          </div>
        </FormSection>

        {/* Actions bar */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <Link
            href="/projects"
            className="btn btn-secondary h-[42px] px-5 text-sm font-semibold inline-flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary h-[42px] px-6 text-sm font-bold inline-flex items-center gap-2 shadow-xs"
            disabled={loading || Boolean(currentUserRole && !canCreate)}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Creating Project...</span>
              </>
            ) : (
              'Create Project'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

