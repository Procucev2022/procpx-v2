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
} from 'lucide-react';

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
          boqRevisionId: revisionId,
          title: prTitle || `PR for ${selectedBoq?.boqCode || 'BOQ'}`,
          requiredDate: requiredDate || null,
          deliveryLocation: deliveryLocation || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create PR');
      }

      const created = await res.json();
      router.push('/pr');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>Procurement Requests</span>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>Create PR</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Create Procurement Request (PR)
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>
          Derive a new Procurement Request directly from a validated BOQ source baseline.
        </p>
      </div>

      {/* BOQ Studio Callout */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
            Need to prepare or modify standard line items first?
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Use BOQ Studio to download standard BOQ, refine specifications with AI, and estimate costs.
          </div>
        </div>
        <Link href="/boq/studio" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} color="#2563eb" />
          Launch BOQ Studio
        </Link>
      </div>

      {/* PR Form Card */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 28 }}>
        <form onSubmit={handleCreatePr}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Project *
              </label>
              <select
                className="select-field"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                required
                style={{ width: '100%', height: 40 }}
              >
                <option value="">Select Project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Cost Centre
              </label>
              <select
                className="select-field"
                value={selectedCostCentreId}
                onChange={e => setSelectedCostCentreId(e.target.value)}
                style={{ width: '100%', height: 40 }}
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

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Source BOQ Baseline *
            </label>
            <select
              className="select-field"
              value={selectedBoqId}
              onChange={e => setSelectedBoqId(e.target.value)}
              required
              style={{ width: '100%', height: 40 }}
            >
              <option value="">Select Source BOQ...</option>
              {boqs.map(b => (
                <option key={b.id} value={b.id}>
                  {b.boqCode} — {b.title || 'BOQ Baseline'} ({b.status})
                </option>
              ))}
            </select>
            {boqs.length === 0 && selectedProjectId && (
              <div style={{ fontSize: 12, color: '#d97706', marginTop: 6 }}>
                No BOQs found for this project. <Link href={`/boq/studio?projectId=${selectedProjectId}`} style={{ color: '#2563eb', textDecoration: 'underline' }}>Create a BOQ in Studio</Link> first.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              PR Title / Subject
            </label>
            <input
              type="text"
              className="input-field"
              value={prTitle}
              onChange={e => setPrTitle(e.target.value)}
              placeholder="e.g. Electrical & Civil Fitout Procurement"
              style={{ width: '100%', height: 40 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Required By Date
              </label>
              <input
                type="date"
                className="input-field"
                value={requiredDate}
                onChange={e => setRequiredDate(e.target.value)}
                style={{ width: '100%', height: 40 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Delivery Location
              </label>
              <input
                type="text"
                className="input-field"
                value={deliveryLocation}
                onChange={e => setDeliveryLocation(e.target.value)}
                placeholder="e.g. Site Store - Unit 402"
                style={{ width: '100%', height: 40 }}
              />
            </div>
          </div>

          {error && (
            <div style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 18 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Link href="/pr" className="btn btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={creating || !selectedBoqId}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', fontWeight: 600 }}
            >
              <Send size={15} />
              {creating ? 'Creating PR...' : 'Create Procurement Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
