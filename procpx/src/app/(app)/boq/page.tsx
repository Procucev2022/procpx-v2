'use client';
// app/(app)/boq/page.tsx - BOQ Management & Revisions Hub
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Upload, ClipboardCheck } from 'lucide-react';

interface BoqSummary {
  id: string;
  projectId: string;
  boqCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    projectCode: string;
    name: string;
    sector: string;
    status: string;
  };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    status: string;
    totalLines: number;
    validLines: number;
    errorLines: number;
    warningLines: number;
    qualityScore: number | null;
    submittedAt: string | null;
    approvedAt: string | null;
    createdAt: string;
  }>;
}

const STATUS_FILTERS = ['', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'badge-draft',
    SUBMITTED: 'badge-submitted',
    UNDER_REVIEW: 'badge-review',
    APPROVED: 'badge-approved',
    REJECTED: 'badge-rejected',
  };
  return <span className={`badge ${map[status] || 'badge-draft'}`}>{status.replace('_', ' ')}</span>;
}

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
    <div className="main-content">
      {/* Top Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Bill of Quantities (BOQ)</h1>
          <p className="page-subtitle" style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
            Manage, upload, standardize, and approve project cost sheets and revisions
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/boq/studio?action=new" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            + Create New BOQ
          </Link>
          <Link href="/boq/studio" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            BOQ Studio Workspace
          </Link>
          <Link href="/boq/upload" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={16} /> Upload BOQ
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ background: '#1e293b', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cost Sheets</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: '#f8fafc' }}>{total}</div>
        </div>
        <div className="stat-card" style={{ background: '#1e293b', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Review</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: '#f59e0b' }}>{pendingCount}</div>
        </div>
        <div className="stat-card" style={{ background: '#1e293b', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Approved BOQs</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: '#10b981' }}>{approvedCount}</div>
        </div>
        <div className="stat-card" style={{ background: '#1e293b', padding: 20, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Line Items</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: '#38bdf8' }}>
            {totalLinesCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: 20, padding: 16, background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <input
              type="text"
              placeholder="Search by BOQ name, project code or project name..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="form-input"
              style={{ width: '100%', background: '#0f172a', borderColor: '#334155', color: '#fff', padding: '8px 12px', borderRadius: 6 }}
            />
          </div>
          <div>
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="form-select"
              style={{ background: '#0f172a', borderColor: '#334155', color: '#fff', padding: '8px 12px', borderRadius: 6 }}
            >
              <option value="">All Statuses</option>
              {STATUS_FILTERS.filter(Boolean).map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* BOQ Table */}
      <div className="card" style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Project</th>
                <th style={{ padding: '12px 16px' }}>BOQ Name</th>
                <th style={{ padding: '12px 16px' }}>Latest Rev</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Lines</th>
                <th style={{ padding: '12px 16px' }}>Est. Amount</th>
                <th style={{ padding: '12px 16px' }}>Quality</th>
                <th style={{ padding: '12px 16px' }}>Last Updated</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    Loading BOQ data...
                  </td>
                </tr>
              ) : boqs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                      <ClipboardCheck size={36} color="#94a3b8" strokeWidth={1.5} />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>No BOQs found</div>
                    <div style={{ fontSize: 13, marginBottom: 16 }}>Upload a spreadsheet to initialize your project cost sheet</div>
                    <Link href="/boq/upload" className="btn btn-primary" style={{ padding: '8px 16px' }}>
                      Upload BOQ
                    </Link>
                  </td>
                </tr>
              ) : (
                boqs.map(boq => {
                  const rev = boq.revisions?.[0];
                  const revId = rev?.id;
                  const currentStatus = rev?.status || boq.status;
                  const score = rev?.qualityScore;

                  return (
                    <tr key={boq.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <Link href={`/projects/${boq.project.id}`} style={{ fontWeight: 600, color: '#38bdf8', textDecoration: 'none' }}>
                          {boq.project.projectCode}
                        </Link>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{boq.project.name}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 500, color: '#f8fafc' }}>
                        {boq.boqCode}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontFamily: 'monospace', background: '#0f172a', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                          Rev {rev ? rev.revisionNumber : 1}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={currentStatus} />
                      </td>
                      <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                        {rev ? rev.totalLines : 0} items
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>
                        {rev?.validLines ? `${rev.validLines} valid` : '0 valid'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {score !== null && score !== undefined ? (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: score >= 80 ? 'rgba(16,185,129,0.2)' : score >= 50 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                            color: score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444',
                          }}>
                            {score}%
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>
                        {new Date(boq.updatedAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Link
                            href={`/boq/studio?boqId=${boq.id}`}
                            className="btn btn-primary"
                            style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700 }}
                          >
                            Studio
                          </Link>
                          {revId && (
                            <Link
                              href={`/boq/${revId}`}
                              className="btn btn-secondary"
                              style={{ padding: '5px 10px', fontSize: 11 }}
                            >
                              Grid
                            </Link>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #334155' }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Showing {boqs.length} of {total} records
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Previous
              </button>
              <span style={{ padding: '4px 8px', fontSize: 13, color: '#cbd5e1' }}>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
