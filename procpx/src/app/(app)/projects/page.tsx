'use client';
// app/(app)/projects/page.tsx - Projects list
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Folder } from 'lucide-react';

const STATUS_OPTIONS = ['', 'DRAFT', 'BOQ_PREPARATION', 'BOQ_REVIEW', 'BOQ_APPROVED', 'CANCELLED'];
const SECTOR_OPTIONS = ['', 'RETAIL', 'HOSPITALITY', 'BANKING', 'INSURANCE', 'OTHER'];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'badge-draft', BOQ_PREPARATION: 'badge-submitted', BOQ_REVIEW: 'badge-review',
    BOQ_APPROVED: 'badge-approved', CANCELLED: 'badge-draft',
  };
  return <span className={`badge ${map[status] || 'badge-draft'}`}>{status.replace(/_/g, ' ')}</span>;
}

function BoqStatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-muted">—</span>;
  const map: Record<string, string> = { DRAFT: 'badge-draft', SUBMITTED: 'badge-submitted', APPROVED: 'badge-approved', REJECTED: 'badge-rejected' };
  return <span className={`badge ${map[status] || 'badge-draft'}`}>{status}</span>;
}

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
    <div className="page-content">
      <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
        <div>
          <div className="page-title">Projects</div>
          <div className="page-subtitle">{total} project{total !== 1 ? 's' : ''} found</div>
        </div>
        {canCreate && <Link href="/projects/new" className="btn btn-primary">+ New Project</Link>}
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <Search size={16} color="#94a3b8" />
            </span>
            <input
              type="text"
              className="form-control search-input"
              placeholder="Search by name, code, city..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="form-control" style={{ width: 160 }} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <select className="form-control" style={{ width: 140 }} value={sector} onChange={e => { setSector(e.target.value); setPage(1); }}>
            {SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s || 'All Sectors'}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" /> Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Folder size={36} color="#94a3b8" strokeWidth={1.5} />
            </div>
            <div className="empty-title">No projects found</div>
            {canCreate && (
              <Link href="/projects/new" className="btn btn-primary" style={{ marginTop: 16 }}>+ Create Project</Link>
            )}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project ID</th>
                  <th>Project Name</th>
                  <th>Sector</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Area (Sq Ft)</th>
                  <th>Status</th>
                  <th>BOQ Status</th>
                  <th>Lines</th>
                  <th>Updated</th>
                  <th className="col-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const latestBoq = p.boqs?.[0];
                  const latestRev = latestBoq?.revisions?.[0];
                  return (
                    <tr key={p.id}>
                      <td><span className="font-mono" style={{ fontSize: 12 }}>{p.projectCode}</span></td>
                      <td>
                        <Link href={`/projects/${p.id}`} style={{ fontWeight: 600, color: 'var(--brand-600)', textDecoration: 'none' }}>
                          {p.name}
                        </Link>
                      </td>
                      <td><span className="badge badge-info">{p.sector}</span></td>
                      <td className="text-muted">{p.projectType?.replace(/_/g, ' ')}</td>
                      <td>{p.city || p.location || '—'}</td>
                      <td>{p.areaSqFt?.toLocaleString() || '—'}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td><BoqStatusBadge status={latestBoq?.status} /></td>
                      <td>{latestRev?.totalLines ?? '—'}</td>
                      <td className="text-muted">{new Date(p.updatedAt).toLocaleDateString()}</td>
                      <td className="col-actions">
                        <Link href={`/projects/${p.id}`} className="btn btn-sm btn-secondary">View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
            <span className="page-info">Page {page} of {totalPages} ({total} records)</span>
            <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
            <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}
