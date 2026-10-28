'use client';
// app/(app)/boq/[revisionId]/page.tsx - BOQ Workspace
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Wand2,
  Check,
  Send,
  AlertCircle,
  CheckCircle2,
  XCircle,
  X,
  Lock,
  GitCompare,
  Search,
  ClipboardCheck,
  Pencil,
  Info,
  ExternalLink,
} from 'lucide-react';
import SpecificationCell from '@/components/ui/SpecificationCell';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { FileSpreadsheet, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react';

function QualityBar({ score }: { score?: number | null }) {
  if (score == null) return null;
  const color = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="quality-score" style={{ width: 180 }}>
      <div className="quality-bar"><div className="quality-fill" style={{ width: `${score}%`, background: color }} /></div>
      <span className="quality-label" style={{ color }}>{score}%</span>
    </div>
  );
}

export default function BoqWorkspacePage() {
  const toast = useToast();
  const { revisionId } = useParams<{ revisionId: string }>();
  const [revision, setRevision] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [editingLine, setEditingLine] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ isError: boolean; text: string } | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [activeTab, setActiveTab] = useState<'lines' | 'summary' | 'compare'>('lines');
  const [compareData, setCompareData] = useState<any>(null);
  const [compareTargetId, setCompareTargetId] = useState('');
  const [loadingCompare, setLoadingCompare] = useState(false);
  const pageSize = 50;

  const loadLines = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, validationStatus: filterStatus });
    fetch(`/api/boq/${revisionId}/lines?${params}`)
      .then(r => r.json())
      .then(d => {
        setLines(d.data || []);
        setTotal(d.total || 0);
        setRevision(d.revision);
        setLoading(false);
      });
  }, [revisionId, page, search, filterStatus]);

  useEffect(() => { loadLines(); }, [loadLines]);
  useEffect(() => {
    fetch('/api/masters/categories').then(r => r.json()).then(d => setCategories(d || []));
    fetch('/api/masters/uom').then(r => r.json()).then(d => setUoms(d || []));
  }, []);

  const loadCompare = useCallback(async (targetId?: string) => {
    setLoadingCompare(true);
    const url = targetId
      ? `/api/boq/${revisionId}/compare?targetRevisionId=${targetId}`
      : `/api/boq/${revisionId}/compare`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setCompareData(data);
      if (!compareTargetId && data.compareRevision?.id) {
        setCompareTargetId(data.compareRevision.id);
      }
    }
    setLoadingCompare(false);
  }, [revisionId, compareTargetId]);

  useEffect(() => {
    if (activeTab === 'compare') {
      loadCompare(compareTargetId || undefined);
    }
  }, [activeTab, compareTargetId, loadCompare]);

  const isEditable = revision?.status === 'DRAFT';
  const isSubmitted = revision?.status === 'SUBMITTED';
  const isApproved = revision?.status === 'APPROVED';

  const saveEdit = async () => {
    if (!editingLine) return;
    setSaving(true);
    const res = await fetch(`/api/boq/${revisionId}/lines`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId: editingLine.id, updates: editingLine }),
    });
    setSaving(false);
    if (res.ok) { setEditingLine(null); loadLines(); }
    else {
      const d = await res.json();
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const standardiseBoq = async () => {
    setActionMsg({ isError: false, text: 'Standardising descriptions and UOMs against enterprise catalog...' });
    const res = await fetch(`/api/boq/${revisionId}/standardise`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      setActionMsg({ isError: false, text: `${d.message} (Score: ${d.qualityScore}%)` });
      loadLines();
    } else {
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const validateBoq = async () => {
    setActionMsg({ isError: false, text: 'Running full line-level validation checks...' });
    const res = await fetch(`/api/boq/${revisionId}/validate`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      setActionMsg({ isError: false, text: `Validation updated: Quality Score is ${d.qualityScore}%, ${d.errorLines} errors, ${d.warningLines} warnings.` });
      loadLines();
    } else {
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const submitBoq = async () => {
    if (!confirm('Submit this BOQ for approval?')) return;
    const res = await fetch(`/api/boq/${revisionId}/submit`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      toast.success('BOQ submitted successfully.', d.revisionCode || revision?.revisionCode, 'Awaiting Project Approver');
      setActionMsg({ isError: false, text: 'BOQ submitted successfully.' });
      loadLines();
    } else {
      toast.error(d.error || 'Failed to submit BOQ');
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const approveBoq = async () => {
    if (!confirm('Approve this BOQ? This action will make it an immutable commercial baseline.')) return;
    const res = await fetch(`/api/boq/${revisionId}/approve`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      toast.success('BOQ approved successfully.');
      setActionMsg({ isError: false, text: 'BOQ approved successfully.' });
      loadLines();
    } else {
      toast.error(d.error || 'Failed to approve BOQ');
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const rejectBoq = async () => {
    if (!rejectReason.trim()) return;
    const res = await fetch(`/api/boq/${revisionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason }),
    });
    const d = await res.json();
    setShowRejectModal(false);
    if (res.ok) { setActionMsg({ isError: false, text: 'BOQ rejected with mandatory reason.' }); loadLines(); }
    else setActionMsg({ isError: true, text: d.error });
  };

  const newRevision = async () => {
    if (!confirm('Create a new draft revision from this approved BOQ?')) return;
    const res = await fetch(`/api/boq/${revisionId}/new-revision`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) { window.location.href = `/boq/${d.revisionId}`; }
    else setActionMsg({ isError: true, text: d.error });
  };

  const getSubcategories = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    return cat?.children || [];
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="page-content">
      {/* Header */}
      <PageHeader
        title={revision?.revisionCode ? `BOQ Workspace — ${revision.revisionCode}` : 'BOQ Workspace'}
        subtitle="Manage BOQ lines, validate specifications, run automated standardisation, and submit for approval"
        backHref="/boq"
        backLabel="← Back to BOQ Register"
        badge={revision ? <StatusBadge status={revision.status} /> : undefined}
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            {revision && <QualityBar score={revision.qualityScore} />}
            {isEditable && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={standardiseBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Wand2 size={14} /> Standardise
                </button>
                <button className="btn btn-secondary btn-sm" onClick={validateBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} /> Validate
                </button>
                {revision?.errorLines === 0 ? (
                  <button className="btn btn-primary btn-sm" onClick={submitBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Send size={14} /> Submit for Approval
                  </button>
                ) : (
                  <button className="btn btn-secondary btn-sm" disabled title="Fix validation errors before submitting" style={{ opacity: 0.6, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} /> {revision?.errorLines} Errors Block Submit
                  </button>
                )}
              </>
            )}
            {isSubmitted && (
              <>
                <button className="btn btn-primary btn-sm" onClick={approveBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} /> Approve BOQ
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setShowRejectModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <XCircle size={14} /> Reject BOQ
                </button>
              </>
            )}
            {isApproved && (
              <button className="btn btn-primary btn-sm" onClick={newRevision}>+ Create New Revision</button>
            )}
          </div>
        }
      />

      {actionMsg && (
        <div className={`alert ${actionMsg.isError ? 'alert-error' : 'alert-success'} mb-4`} style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {actionMsg.isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{actionMsg.text}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setActionMsg(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Rejection reason banner */}
      {revision?.status === 'REJECTED' && revision?.rejectionReason && (
        <div className="alert alert-error mb-4" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={18} />
          <span><strong>Revision Rejected:</strong> {revision.rejectionReason}</span>
        </div>
      )}

      {/* Approved lock banner */}
      {isApproved && (
        <div className="alert alert-success mb-4" style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Lock size={20} style={{ color: '#166534', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Immutable Commercial Baseline:</strong> This BOQ revision has been formally approved and locked.
            <div style={{ fontSize: 12, marginTop: 2 }}>
              Modifications are prohibited on this revision. Use <strong>&quot;+ Create New Revision&quot;</strong> to start a new branch.
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats */}
      {revision && (
        <div className="mb-6">
          <SummaryCardGrid columns={4}>
            <SummaryCard
              label="Total Lines"
              value={revision.totalLines || 0}
              secondary="Total items in BOQ"
              icon={<FileSpreadsheet size={16} />}
              accent="default"
            />
            <SummaryCard
              label="Valid Lines"
              value={revision.validLines || 0}
              secondary="Passed validation rules"
              icon={<CheckCircle size={16} />}
              accent="emerald"
            />
            <SummaryCard
              label="Warnings"
              value={revision.warningLines || 0}
              secondary="Non-blocking notices"
              icon={<AlertTriangle size={16} />}
              accent="amber"
            />
            <SummaryCard
              label="Errors"
              value={revision.errorLines || 0}
              secondary="Blocking issues"
              icon={<AlertOctagon size={16} />}
              accent="rose"
            />
          </SummaryCardGrid>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs mb-4">
        <div className={`tab ${activeTab === 'lines' ? 'active' : ''}`} onClick={() => setActiveTab('lines')}>BOQ Lines ({total})</div>
        <div className={`tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>Quality & Summary</div>
        <div className={`tab ${activeTab === 'compare' ? 'active' : ''}`} onClick={() => setActiveTab('compare')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <GitCompare size={14} /> Revision Comparison / Diff
        </div>
      </div>

      {/* ── TAB 1: BOQ Lines Grid ──────────────────────────────── */}
      {activeTab === 'lines' && (
        <div className="card">
          <div className="filter-bar">
            <div className="search-input-wrapper">
              <span className="search-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <Search size={16} color="#94a3b8" />
              </span>
              <input className="form-control search-input" placeholder="Search descriptions, line numbers..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="form-control" style={{ width: 160 }} value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="">All Statuses</option>
              <option value="VALID">Valid</option>
              <option value="WARNING">Warning</option>
              <option value="ERROR">Error</option>
            </select>
            <span className="text-muted text-sm">{total} lines</span>
          </div>

          {loading ? (
            <div className="loading-overlay"><div className="spinner" /> Loading BOQ lines...</div>
          ) : lines.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ClipboardCheck size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">No BOQ lines found</div>
            </div>
          ) : (
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table enterprise-table" style={{ width: '100%', minWidth: 1200 }}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>S.No.</th>
                    <th style={{ width: 110 }}>Item Code</th>
                    <th style={{ minWidth: 240 }}>Item Description</th>
                    <th style={{ minWidth: 160 }}>BOQ Description</th>
                    <th style={{ width: 80, textAlign: 'center' }}>UOM</th>
                    <th style={{ width: 90, textAlign: 'right' }}>Quantity</th>
                    <th style={{ minWidth: 120 }}>Category</th>
                    <th style={{ minWidth: 120 }}>Sub-category</th>
                    <th style={{ width: 100 }}>Location</th>
                    <th style={{ width: 130, textAlign: 'center' }}>Status & Rules</th>
                    <th style={{ width: 90, textAlign: 'center' }} className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.id} style={{ background: line.validationStatus === 'ERROR' ? '#fff8f8' : line.validationStatus === 'WARNING' ? '#fffbeb' : undefined }}>
                      <td><span className="font-mono text-muted">{(page - 1) * pageSize + idx + 1}</span></td>
                      <td>
                        <span className="font-mono font-bold text-xs" style={{ color: '#1e40af' }}>
                          {line.itemCode || line.lineNumber || '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{line.standardDescription || line.originalDescription}</div>
                        {line.standardDescription && line.standardDescription !== line.originalDescription && (
                          <div style={{ fontSize: 11, color: '#4338ca', marginTop: 2 }}>
                            <strong>Original:</strong> {line.originalDescription}
                          </div>
                        )}
                      </td>
                      <td>
                        <SpecificationCell
                          specification={line.specification}
                          lineNumber={line.lineNumber}
                          itemDescription={line.standardDescription || line.originalDescription}
                          lineId={line.id}
                          maxWidth={200}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="font-mono font-bold" style={{ color: line.uom?.code ? '#059669' : '#d97706' }}>
                          {line.uom?.code || line.uomRaw || '—'}
                        </span>
                        {line.uomRaw && line.uom?.code && line.uomRaw.toUpperCase() !== line.uom.code && (
                          <span style={{ fontSize: 10, color: '#6b7280', display: 'block' }}>raw: {line.uomRaw}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{line.quantity !== null && line.quantity !== undefined ? line.quantity.toLocaleString() : '—'}</td>
                      <td>{line.category?.name || <span className="text-muted">—</span>}</td>
                      <td>{line.subcategory?.name || <span className="text-muted">—</span>}</td>
                      <td className="text-muted">{line.location || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <StatusBadge status={line.validationStatus} />
                        {line.validationMessages && (
                          <div style={{ marginTop: 4, textAlign: 'left' }}>
                            {JSON.parse(line.validationMessages).map((m: any, i: number) => (
                              <div key={i} style={{ color: m.level === 'ERROR' ? '#dc2626' : m.level === 'WARNING' ? '#d97706' : '#2563eb', fontSize: 11, lineHeight: 1.2 }}>
                                • {m.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="col-actions">
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                          <a
                            href={`/boq/line/${line.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-ghost"
                            title="Open Complete Line Item in a Separate View"
                            style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 6px', color: '#0284c7' }}
                          >
                            <ExternalLink size={13} />
                          </a>
                          {isEditable && (
                            <button className="btn btn-sm btn-ghost" onClick={() => setEditingLine({ ...line })} title="Edit Line" style={{ padding: '4px 6px' }}>
                              <Pencil size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
              <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Quality & Summary ───────────────────────────── */}
      {activeTab === 'summary' && (
        <div className="form-grid">
          <div className="card">
            <div className="card-header"><span className="card-title">BOQ Quality Score & Health</span></div>
            <div className="card-body">
              <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid #f1f5f9', marginBottom: 16 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: (revision?.qualityScore ?? 0) >= 80 ? '#059669' : '#d97706' }}>
                  {revision?.qualityScore ?? 0} / 100
                </div>
                <div className="text-muted text-sm">Enterprise Quality Index</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Error Lines (Submission Blockers)</span>
                  <span className="badge badge-error">{revision?.errorLines || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Warning Lines</span>
                  <span className="badge badge-warning">{revision?.warningLines || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Valid / Standardised Lines</span>
                  <span className="badge badge-valid">{revision?.validLines || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Parsed Lines</span>
                  <span style={{ fontWeight: 600 }}>{revision?.totalLines || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Revision Metadata</span></div>
            <div className="card-body">
              {revision && [
                ['Revision Code', revision.revisionCode],
                ['Status', <StatusBadge key="s" status={revision.status} />],
                ['Original File', revision.originalFileName || 'Direct Input / Branch'],
                ['Uploaded At', revision.uploadedAt ? new Date(revision.uploadedAt).toLocaleString() : '—'],
                ['Submitted At', revision.submittedAt ? new Date(revision.submittedAt).toLocaleString() : '—'],
                ['Approved At', revision.approvedAt ? new Date(revision.approvedAt).toLocaleString() : '—'],
                ['Notes', revision.notes || '—'],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span className="text-muted text-sm">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Compare Revisions ───────────────────────────── */}
      {activeTab === 'compare' && (
        <div className="card">
          <div className="card-header flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 12 }}>
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <GitCompare size={18} /> Compare Revision {revision?.revisionCode} with Another Revision
            </span>
            {compareData?.availableRevisions?.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Compare against:</span>
                <select
                  className="form-control"
                  style={{ width: 140 }}
                  value={compareTargetId}
                  onChange={e => { setCompareTargetId(e.target.value); loadCompare(e.target.value); }}
                >
                  {compareData.availableRevisions.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.revisionCode} ({r.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loadingCompare ? (
            <div className="loading-overlay"><div className="spinner" /> Computing revision diff...</div>
          ) : !compareData ? (
            <div className="empty-state"><div className="empty-title">Select revisions to compare</div></div>
          ) : (
            <div className="card-body">
              {/* Diff summary badges */}
              <div className="kpi-grid mb-6">
                <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
                  <div className="kpi-label">Lines Added</div>
                  <div className="kpi-value" style={{ color: '#059669' }}>{compareData.summary?.addedCount || 0}</div>
                </div>
                <div className="kpi-card" style={{ borderLeft: '3px solid #dc2626' }}>
                  <div className="kpi-label">Lines Removed</div>
                  <div className="kpi-value" style={{ color: '#dc2626' }}>{compareData.summary?.removedCount || 0}</div>
                </div>
                <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
                  <div className="kpi-label">Lines Modified</div>
                  <div className="kpi-value" style={{ color: '#d97706' }}>{compareData.summary?.modifiedCount || 0}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Lines Unchanged</div>
                  <div className="kpi-value">{compareData.summary?.unchangedCount || 0}</div>
                </div>
              </div>

              {/* Modified Lines Table */}
              {compareData.modified?.length > 0 && (
                <div className="mb-6">
                  <h4 style={{ fontWeight: 700, marginBottom: 8 }}>Modified Line Items</h4>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>S.No.</th>
                          <th>Item Description</th>
                          <th>Field</th>
                          <th>Previous ({compareData.compareRevision?.revisionCode})</th>
                          <th>Current ({compareData.currentRevision?.revisionCode})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareData.modified.map((item: any) => (
                          item.diffs.map((d: any, idx: number) => (
                            <tr key={`${item.lineNumber}-${idx}`}>
                              {idx === 0 && <td rowSpan={item.diffs.length} className="font-mono font-bold">{item.lineNumber}</td>}
                              {idx === 0 && <td rowSpan={item.diffs.length}>{item.description}</td>}
                              <td><span className="badge badge-info">{d.field}</span></td>
                              <td style={{ color: '#dc2626' }}>{String(d.oldVal || '—')}</td>
                              <td style={{ color: '#059669', fontWeight: 600 }}>{String(d.newVal || '—')}</td>
                            </tr>
                          ))
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Added Lines Table */}
              {compareData.added?.length > 0 && (
                <div className="mb-6">
                  <h4 style={{ fontWeight: 700, marginBottom: 8, color: '#059669' }}>+ Added Line Items</h4>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead><tr><th>S.No.</th><th>Item Description</th><th>Quantity</th><th>UOM</th><th>Category</th></tr></thead>
                      <tbody>
                        {compareData.added.map((l: any) => (
                          <tr key={l.lineNumber} style={{ background: '#f0fdf4' }}>
                            <td className="font-mono font-bold">{l.lineNumber}</td>
                            <td>{l.description}</td>
                            <td>{l.quantity}</td>
                            <td>{l.uom}</td>
                            <td>{l.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {compareData.modified?.length === 0 && compareData.added?.length === 0 && compareData.removed?.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <CheckCircle2 size={36} color="#059669" strokeWidth={1.5} />
                  </div>
                  <div className="empty-title">Revisions Are Identical</div>
                  <div className="empty-desc">No line differences detected between {compareData.currentRevision?.revisionCode} and {compareData.compareRevision?.revisionCode}.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Line Modal */}
      {editingLine && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingLine(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">Edit BOQ Line — Line {editingLine.lineNumber}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditingLine(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={16} />
                <div>
                  <strong>Original (Source Document):</strong> {editingLine.originalDescription}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Standard Description <span className="required">*</span></label>
                <input className="form-control" value={editingLine.standardDescription || ''} onChange={e => setEditingLine((l: any) => ({ ...l, standardDescription: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Specification</label>
                <textarea className="form-control" value={editingLine.specification || ''} onChange={e => setEditingLine((l: any) => ({ ...l, specification: e.target.value }))} rows={2} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-control" value={editingLine.categoryId || ''} onChange={e => setEditingLine((l: any) => ({ ...l, categoryId: e.target.value, subcategoryId: '' }))}>
                    <option value="">— Select Category —</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subcategory</label>
                  <select className="form-control" value={editingLine.subcategoryId || ''} onChange={e => setEditingLine((l: any) => ({ ...l, subcategoryId: e.target.value }))}>
                    <option value="">— Select Subcategory —</option>
                    {getSubcategories(editingLine.categoryId || '').map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">UOM <span className="required">*</span></label>
                  <select className="form-control" value={editingLine.uomId || ''} onChange={e => setEditingLine((l: any) => ({ ...l, uomId: e.target.value }))}>
                    <option value="">— Select UOM —</option>
                    {uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity <span className="required">*</span></label>
                  <input type="number" className="form-control" value={editingLine.quantity !== null && editingLine.quantity !== undefined ? editingLine.quantity : ''} onChange={e => setEditingLine((l: any) => ({ ...l, quantity: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-control" value={editingLine.location || ''} onChange={e => setEditingLine((l: any) => ({ ...l, location: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Drawing Reference</label>
                  <input className="form-control" value={editingLine.drawingReference || ''} onChange={e => setEditingLine((l: any) => ({ ...l, drawingReference: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Remarks</label>
                <input className="form-control" value={editingLine.remarks || ''} onChange={e => setEditingLine((l: any) => ({ ...l, remarks: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingLine(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title">Reject BOQ Revision</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRejectModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-muted mb-4">Rejection reason is mandatory. It will be recorded in the audit trail and displayed to the project user.</p>
              <div className="form-group">
                <label className="form-label">Rejection Reason <span className="required">*</span></label>
                <textarea className="form-control" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} placeholder="Specify technical discrepancies or corrections required..." autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={rejectBoq} disabled={!rejectReason.trim()}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
