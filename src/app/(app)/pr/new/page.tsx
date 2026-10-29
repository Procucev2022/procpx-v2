'use client';
// src/app/(app)/pr/new/page.tsx - Create Procurement Request from BOQ Baseline
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Send,
  Building2,
  FileSpreadsheet,
  Calendar,
  MapPin,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Layers,
  AlertCircle,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';

export default function CreatePrPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [costCentres, setCostCentres] = useState<any[]>([]);
  const [boqs, setBoqs] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCostCentreId, setSelectedCostCentreId] = useState('');
  const [selectedBoqId, setSelectedBoqId] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadCostCentres(selectedProjectId);
      loadBoqs(selectedProjectId);
    } else {
      setCostCentres([]);
      setBoqs([]);
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const pData = await res.json();
        const list = pData.data || pData || [];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProjectId(list[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadCostCentres = async (pId: string) => {
    try {
      const res = await fetch(`/api/cost-centres?projectId=${pId}`);
      if (res.ok) {
        const cc = await res.json();
        setCostCentres(cc);
        if (cc.length > 0) setSelectedCostCentreId(cc[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadBoqs = async (pId: string) => {
    try {
      const res = await fetch(`/api/boq?projectId=${pId}`);
      if (res.ok) {
        const b = await res.json();
        const list = b.data || b || [];
        setBoqs(list);
        if (list.length > 0) setSelectedBoqId(list[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !selectedBoqId) {
      setError('Please select a project and source BOQ.');
      return;
    }
    setCreating(true);
    setError('');

    try {
      const selectedBoq = boqs.find(b => b.id === selectedBoqId);
      const revisionId = selectedBoq?.revisions?.[0]?.id;

      const res = await fetch('/api/pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          costCentreId: selectedCostCentreId || null,
          boqId: selectedBoqId,
          revisionId: revisionId || null,
          title: prTitle.trim() || (selectedBoq ? `${selectedBoq.title || 'Procurement Package'} PR` : 'Commercial PR'),
          requiredDate: requiredDate || null,
          deliveryLocation: deliveryLocation.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create PR');
      }

      await res.json();
      router.push('/pr');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <PageHeader
        title="Create Procurement Request"
        subtitle="Derive a new Procurement Request directly from a validated BOQ source baseline"
        backHref="/pr"
        backLabel="← Back to PR Register"
      />

      {/* BOQ Studio Callout */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex justify-between items-center">
        <div>
          <div className="font-semibold text-sm text-slate-900">
            Need to prepare or modify standard line items first?
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Use BOQ Studio to download standard BOQ, refine specifications with AI, and estimate costs.
          </div>
        </div>
        <Link href="/boq/studio" className="btn btn-secondary btn-sm flex items-center gap-2">
          <Sparkles size={14} className="text-blue-600" />
          Launch BOQ Studio
        </Link>
      </div>

      {error && (
        <div className="alert alert-error mb-6 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* PR Form */}
      <form onSubmit={handleCreatePr}>
        <FormSection
          title="Project & Cost Centre Baseline"
          subtitle="Select the commercial project and cost allocation code for this package"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Project <span className="required">*</span></label>
              <select
                className="form-control"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                required
              >
                <option value="">Select Project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Cost Centre</label>
              <select
                className="form-control"
                value={selectedCostCentreId}
                onChange={e => setSelectedCostCentreId(e.target.value)}
              >
                <option value="">Select Cost Centre...</option>
                {costCentres.map(cc => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code || cc.costCentreCode} — {cc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection
          title="BOQ Specification Source"
          subtitle="Link to the approved or draft BOQ containing the line items"
        >
          <div className="form-group">
            <label className="form-label">Source BOQ Baseline <span className="required">*</span></label>
            <select
              className="form-control"
              value={selectedBoqId}
              onChange={e => setSelectedBoqId(e.target.value)}
              required
            >
              <option value="">Select Source BOQ...</option>
              {boqs.map(b => (
                <option key={b.id} value={b.id}>
                  {b.boqCode} — {b.title || 'BOQ Baseline'} ({b.status})
                </option>
              ))}
            </select>
            {boqs.length === 0 && selectedProjectId && (
              <p className="text-xs text-amber-600 mt-2">
                No BOQs found for this project.{' '}
                <Link href={`/boq/studio?projectId=${selectedProjectId}`} className="text-blue-600 underline">
                  Create a BOQ in Studio
                </Link>{' '}
                first.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">PR Title / Subject</label>
            <input
              type="text"
              className="form-control"
              value={prTitle}
              onChange={e => setPrTitle(e.target.value)}
              placeholder="e.g. Electrical & Civil Fitout Procurement"
            />
          </div>
        </FormSection>

        <FormSection
          title="Delivery & Procurement Schedule"
          subtitle="Specify site fulfillment timelines and destination store"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Required By Date</label>
              <input
                type="date"
                className="form-control"
                value={requiredDate}
                onChange={e => setRequiredDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Delivery Location</label>
              <input
                type="text"
                className="form-control"
                value={deliveryLocation}
                onChange={e => setDeliveryLocation(e.target.value)}
                placeholder="e.g. Site Store - Unit 402"
              />
            </div>
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 mt-6">
          <Link href="/pr" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={creating || !selectedBoqId}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Send size={15} />
            {creating ? 'Creating PR...' : 'Create Procurement Request'}
          </button>
        </div>
      </form>
    </div>
  );
}
