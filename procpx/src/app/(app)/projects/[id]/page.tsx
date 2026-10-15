'use client';
// app/(app)/projects/[id]/page.tsx - Project detail
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil,
  Upload,
  MapPin,
  Maximize2,
  Briefcase,
  ClipboardCheck,
  Users,
  FileText,
  Folder,
  Activity,
} from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'badge-draft', BOQ_PREPARATION: 'badge-submitted', BOQ_REVIEW: 'badge-review',
    BOQ_APPROVED: 'badge-approved', CANCELLED: 'badge-draft', SUBMITTED: 'badge-submitted',
    APPROVED: 'badge-approved', REJECTED: 'badge-rejected',
  };
  return <span className={`badge ${map[status] || 'badge-draft'}`}>{status.replace(/_/g, ' ')}</span>;
}

function QualityScore({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-muted">—</span>;
  const cls = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
  const color = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="quality-score">
      <div className="quality-bar"><div className="quality-fill" style={{ width: `${score}%`, background: color }} /></div>
      <span className="quality-label" style={{ color }}>{score}%</span>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(d => { setProject(d); setLoading(false); });
  }, [id]);

  if (loading) return <div className="page-content"><div className="loading-overlay"><div className="spinner" /> Loading project...</div></div>;
  if (!project || project.error) return <div className="page-content"><div className="alert alert-error">Project not found or access denied.</div></div>;

  const latestBoq = project.boqs?.[0];
  const latestRevision = latestBoq?.revisions?.[0];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="top-header" style={{ margin: '-24px -24px 0', padding: '0 24px' }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
            <Link href="/projects" style={{ color: '#6b7280', textDecoration: 'none' }}>Projects</Link> /
          </div>
          <div className="page-title">{project.name}</div>
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${id}/edit`} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Pencil size={14} /> Edit
          </Link>
          {latestBoq ? (
            <Link href={`/boq/${latestRevision?.id || latestBoq.id}`} className="btn btn-primary">Open BOQ</Link>
          ) : (
            <Link href={`/boq/upload?projectId=${id}`} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Upload size={14} /> Upload BOQ
            </Link>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--surface-border)', marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="font-mono" style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{project.projectCode}</span>
          <StatusBadge status={project.status} />
          <span className="badge badge-info">{project.sector}</span>
        </div>
        {project.city && (
          <span className="text-muted" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={13} /> {project.city}{project.state ? `, ${project.state}` : ''}
          </span>
        )}
        {project.areaSqFt && (
          <span className="text-muted" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Maximize2 size={13} /> {project.areaSqFt.toLocaleString()} Sq Ft
          </span>
        )}
        {project.costCentre && (
          <span className="text-muted" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Briefcase size={13} /> {project.costCentre}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs mb-4">
        {['overview', 'boq', 'team', 'documents', 'activity'].map(tab => (
          <div key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </div>
        ))}
        {['benchmark', 'rfqs', 'quotes', 'ppo'].map(tab => (
          <div key={tab} className="tab" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)} <span style={{ fontSize: 9, background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>Soon</span>
          </div>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="form-grid">
          <div className="card">
            <div className="card-header"><span className="card-title">Project Details</span></div>
            <div className="card-body">
              {[
                ['Project Code', project.projectCode],
                ['Sector', project.sector],
                ['Type', project.projectType?.replace(/_/g, ' ')],
                ['City', project.city],
                ['State', project.state],
                ['Country', project.country],
                ['Area', project.areaSqFt ? `${project.areaSqFt.toLocaleString()} Sq Ft` : '—'],
                ['Cost Centre', project.costCentre],
                ['Project Owner', project.projectOwner],
                ['Budget', project.budget ? `${project.currency} ${project.budget.toLocaleString()}` : '—'],
                ['Business Unit', project.businessUnit],
                ['Created', new Date(project.createdAt).toLocaleDateString()],
              ].map(([label, value]) => value ? (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
                </div>
              ) : null)}
            </div>
          </div>
          <div>
            {/* BOQ Summary */}
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">BOQ Summary</span>
                {latestRevision && <Link href={`/boq/${latestRevision.id}`} className="btn btn-sm btn-secondary">Open BOQ</Link>}
              </div>
              <div className="card-body">
                {!latestBoq ? (
                  <div className="empty-state" style={{ padding: 24 }}>
                    <div className="empty-state-icon">
                      <ClipboardCheck size={36} color="#94a3b8" strokeWidth={1.5} />
                    </div>
                    <div className="empty-title">No BOQ yet</div>
                    <Link href={`/boq/upload?projectId=${id}`} className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Upload BOQ</Link>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="text-muted">Status</span>
                      <StatusBadge status={latestBoq.status} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="text-muted">Revision</span>
                      <span className="font-mono">{latestRevision?.revisionCode || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="text-muted">Total Lines</span>
                      <span style={{ fontWeight: 600 }}>{latestRevision?.totalLines || 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="text-muted">Quality Score</span>
                      <div style={{ width: 150 }}><QualityScore score={latestRevision?.qualityScore} /></div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Revisions */}
            {latestBoq?.revisions?.length > 0 && (
              <div className="card">
                <div className="card-header"><span className="card-title">BOQ Revisions</span></div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>Rev</th><th>Status</th><th>Lines</th><th>Score</th><th></th></tr></thead>
                    <tbody>
                      {latestBoq.revisions.map((rev: any) => (
                        <tr key={rev.id}>
                          <td><span className="badge badge-info font-mono">{rev.revisionCode}</span></td>
                          <td><StatusBadge status={rev.status} /></td>
                          <td>{rev.totalLines}</td>
                          <td><QualityScore score={rev.qualityScore} /></td>
                          <td><Link href={`/boq/${rev.id}`} className="btn btn-sm btn-ghost">Open →</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOQ Tab */}
      {activeTab === 'boq' && (
        <div>
          {!latestRevision ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <ClipboardCheck size={36} color="#94a3b8" strokeWidth={1.5} />
                </div>
                <div className="empty-title">No BOQ uploaded yet</div>
                <Link href={`/boq/upload?projectId=${id}`} className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={14} /> Upload BOQ
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex gap-3" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
              <Link href={`/boq/${latestRevision.id}`} className="btn btn-primary">Open BOQ Workspace →</Link>
              <Link href={`/boq/upload?projectId=${id}&boqId=${latestBoq.id}`} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Upload size={14} /> Upload New Revision
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Project Team</span></div>
          {!project.team?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">No team members assigned</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Email</th><th>System Role</th><th>Project Role</th><th>Assigned</th></tr></thead>
                <tbody>
                  {project.team?.map((t: any) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.user?.name}</td>
                      <td className="text-muted">{t.user?.email}</td>
                      <td><span className="badge badge-info">{t.user?.role}</span></td>
                      <td>{t.projectRole}</td>
                      <td className="text-muted">{new Date(t.assignedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} /> Project Document Repository ({project.documents?.length || 0})
            </span>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                const name = prompt('Enter document name:');
                if (!name) return;
                const category = prompt('Category (ORIGINAL_BOQ, DRAWING, SPECIFICATION, OTHER):', 'SPECIFICATION') || 'OTHER';
                fetch(`/api/projects/${id}/documents`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name, category, fileSize: 102400, fileType: 'application/pdf' }),
                }).then(() => {
                  fetch(`/api/projects/${id}`).then(r => r.json()).then(d => setProject(d));
                });
              }}
            >
              + Upload Document
            </button>
          </div>
          {!project.documents?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Folder size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">No documents uploaded yet</div>
              <div className="empty-desc">Upload architectural drawings, specifications, or original BOQ spreadsheets.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>File Size</th>
                    <th>Uploaded By</th>
                    <th>Uploaded Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {project.documents.map((doc: any) => (
                    <tr key={doc.id}>
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                          <FileText size={14} color="#64748b" />
                        </span>
                        {doc.name}
                      </td>
                      <td>
                        <span className={`badge ${doc.category === 'ORIGINAL_BOQ' ? 'badge-submitted' : doc.category === 'DRAWING' ? 'badge-info' : 'badge-draft'}`}>
                          {doc.category || 'OTHER'}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{doc.fileType?.split('/').pop() || doc.fileType}</td>
                      <td>
                        {doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : '—'}
                      </td>
                      <td className="text-muted">{doc.uploadedBy?.slice(0, 8) || 'System'}</td>
                      <td className="text-muted">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                      <td>
                        <span className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }} onClick={() => alert(`Document file stored at: ${doc.filePath}`)}>
                          View Path ↗
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} /> Audit Activity
            </span>
          </div>
          {!project.auditLogs?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Activity size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">No activity yet</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Action</th><th>Description</th><th>User</th><th>Time</th></tr></thead>
                <tbody>
                  {project.auditLogs?.map((log: any) => (
                    <tr key={log.id}>
                      <td><span className="badge badge-info">{log.action}</span></td>
                      <td>{log.description}</td>
                      <td>{log.user?.name || log.user?.email || '—'}</td>
                      <td className="text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
