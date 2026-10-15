'use client';
// app/(app)/dashboard/page.tsx - Role-aware dashboard
import { useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import {
  Building2,
  ShieldCheck,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  FileText,
  Scale,
  Handshake,
  Award,
  Briefcase,
  Folder,
  AlertTriangle,
  Users,
  Lock,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowRight,
  Eye,
  MessageSquare,
  HelpCircle,
  RotateCcw,
  XCircle,
  X,
  CheckSquare,
  Layers,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    DRAFT: 'badge-draft',
    SUBMITTED: 'badge-submitted',
    APPROVED: 'badge-approved',
    REJECTED: 'badge-rejected',
    UNDER_REVIEW: 'badge-review',
    BOQ_REVIEW: 'badge-review',
    BOQ_PREPARATION: 'badge-submitted',
    BOQ_APPROVED: 'badge-approved',
    CANCELLED: 'badge-draft',
  };
  return <span className={`badge ${cls[status] || 'badge-draft'}`}>{status?.replace(/_/g, ' ')}</span>;
}

export default function DashboardPage() {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [activeCardFilter, setActiveCardFilter] = useState<string | null>(null);
  const [expandedPrs, setExpandedPrs] = useState<Record<string, boolean>>({});
  const [showCategoryGovernance, setShowCategoryGovernance] = useState(false);

  // PROJECT_APPROVER actions state
  const [approverSelectedPr, setApproverSelectedPr] = useState<any | null>(null);
  const [approverReviewModalOpen, setApproverReviewModalOpen] = useState(false);
  const [approverRevertModalOpen, setApproverRevertModalOpen] = useState(false);
  const [approverRevertReason, setApproverRevertReason] = useState('');
  const [approverRejectModalOpen, setApproverRejectModalOpen] = useState(false);
  const [approverRejectReason, setApproverRejectReason] = useState('');
  const [approverProcessing, setApproverProcessing] = useState(false);
  const [approverStatusMessage, setApproverStatusMessage] = useState('');
  const [approverActionError, setApproverActionError] = useState('');
  const [approverChatDrawerOpen, setApproverChatDrawerOpen] = useState(false);
  const [approverChatPr, setApproverChatPr] = useState<any | null>(null);
  const [approverIsEnquiryMode, setApproverIsEnquiryMode] = useState(false);

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const d = await res.json();
        if (d.role === 'VENDOR') {
          window.location.href = '/vendor-portal/dashboard';
          return;
        }
        setData(d);
        if ((d.role === 'PROCUREMENT_USER' || d.role === 'CATEGORY_MANAGER') && (d.boqRegister || d.prRegister)) {
          const list = d.boqRegister || d.prRegister;
          const initialExpanded: Record<string, boolean> = {};
          list.forEach((item: any) => {
            if (item.rfqs && item.rfqs.length > 0) {
              initialExpanded[item.id] = true;
            }
          });
          setExpandedPrs(initialExpanded);
        }
      } else if (res.status === 403) {
        const sRes = await fetch('/api/auth/session').catch(() => null);
        const sData = await sRes?.json().catch(() => null);
        if (sData?.user?.role === 'VENDOR') {
          window.location.href = '/vendor-portal/dashboard';
          return;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleApproverApprove = async (prId: string) => {
    setApproverProcessing(true);
    setApproverActionError('');
    try {
      const res = await fetch(`/api/pr/${prId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: 'Technical requirement and quantity verified.' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Approval failed');
      }
      toast.success('BOQ approved successfully.', approverSelectedPr?.prNumber || prId, 'Released to Category Manager');
      setApproverStatusMessage('BOQ approved successfully.');
      setApproverReviewModalOpen(false);
      loadDashboard();
    } catch (err: any) {
      setApproverActionError(err.message);
    } finally {
      setApproverProcessing(false);
    }
  };

  const handleApproverRevert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approverSelectedPr || !approverRevertReason.trim()) return;
    setApproverProcessing(true);
    setApproverActionError('');
    try {
      const res = await fetch(`/api/pr/${approverSelectedPr.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: approverRevertReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Revert failed');
      }
      setApproverRevertModalOpen(false);
      setApproverRevertReason('');
      setApproverSelectedPr(null);
      setApproverStatusMessage('✓ BOQ successfully returned to Project User for correction.');
      loadDashboard();
    } catch (err: any) {
      setApproverActionError(err.message);
    } finally {
      setApproverProcessing(false);
    }
  };

  const handleApproverReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approverSelectedPr || !approverRejectReason.trim()) return;
    setApproverProcessing(true);
    setApproverActionError('');
    try {
      const res = await fetch(`/api/pr/${approverSelectedPr.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: approverRejectReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Rejection failed');
      }
      setApproverRejectModalOpen(false);
      setApproverRejectReason('');
      setApproverSelectedPr(null);
      setApproverStatusMessage('BOQ rejected and returned to requester with feedback remarks.');
      loadDashboard();
    } catch (err: any) {
      setApproverActionError(err.message);
    } finally {
      setApproverProcessing(false);
    }
  };

  const openApproverEnquiry = (pr: any) => {
    setApproverChatPr(pr);
    setApproverIsEnquiryMode(true);
    setApproverChatDrawerOpen(true);
  };

  const openApproverChat = (pr: any) => {
    setApproverChatPr(pr);
    setApproverIsEnquiryMode(false);
    setApproverChatDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="page-content">
        <div className="loading-overlay"><div className="spinner" /> Loading role dashboard...</div>
      </div>
    );
  }
  if (!data) return null;

  // ============================================================
  // 1. SUPER_ADMIN VIEW
  // ============================================================
  if (data.role === 'SUPER_ADMIN') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">Super Admin Platform Overview</div>
            <div className="page-subtitle">Cross-Tenant Infrastructure & Platform Security</div>
          </div>
          <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>Role: SUPER_ADMIN</span>
        </div>

        <div className="kpi-grid mb-6">
          <div className="kpi-card" style={{ borderLeft: '3px solid #6366f1' }}>
            <div className="kpi-label">Active Tenants</div>
            <div className="kpi-value" style={{ color: '#6366f1' }}>{data.tenants ?? 0}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Platform Projects</div>
            <div className="kpi-value">{data.projects ?? 0}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Users</div>
            <div className="kpi-value">{data.users ?? 0}</div>
          </div>
        </div>

        {/* Tenant Breakdown */}
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} /> Enterprise Tenant Isolation Matrix
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant Name</th>
                  <th>Tenant Slug</th>
                  <th>Status</th>
                  <th>Projects</th>
                  <th>Users</th>
                  <th>Isolation Boundary</th>
                </tr>
              </thead>
              <tbody>
                {data.tenantList?.map((t: any) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="font-mono text-muted">{t.slug}</td>
                    <td><span className="badge badge-approved">{t.status}</span></td>
                    <td style={{ fontWeight: 600 }}>{t.projectCount}</td>
                    <td>{t.userCount}</td>
                    <td><span className="badge badge-info">Strict SQLite Row-Level FK</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Platform Audit Logs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} /> Global Audit Activity
            </span>
            <Link href="/audit" className="btn btn-sm btn-secondary">Full Audit Trail</Link>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>User</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLogs?.map((log: any) => (
                  <tr key={log.id}>
                    <td><span className="badge badge-draft">{log.tenant?.name || 'System'}</span></td>
                    <td><span className="badge badge-info">{log.action}</span></td>
                    <td>{log.entityType}: <span className="text-muted">{log.description?.slice(0, 50)}</span></td>
                    <td>{log.user?.name || log.user?.email || 'System'}</td>
                    <td className="text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 2. PROJECT_APPROVER VIEW
  // ============================================================
  if (data.role === 'PROJECT_APPROVER') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">Approval Dashboard</div>
            <div className="page-subtitle">Capex BOQ Approval Queue & Compliance Checks</div>
          </div>
          <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>Role: PROJECT_APPROVER</span>
        </div>

        {approverStatusMessage && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} />
              <span>{approverStatusMessage}</span>
            </div>
            <button type="button" onClick={() => setApproverStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>✕</button>
          </div>
        )}

        {approverActionError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>{approverActionError}</span>
            </div>
            <button type="button" onClick={() => setApproverActionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>✕</button>
          </div>
        )}

        <div className="kpi-grid mb-6">
          <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
            <div className="kpi-label">BOQs Awaiting Approval</div>
            <div className="kpi-value" style={{ color: '#d97706' }}>{data.pending ?? 0}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
            <div className="kpi-label">Approved BOQs</div>
            <div className="kpi-value" style={{ color: '#059669' }}>{data.recentApproved ?? 0}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #dc2626' }}>
            <div className="kpi-label">Rejected / Returned BOQs</div>
            <div className="kpi-value" style={{ color: '#dc2626' }}>{data.recentRejected ?? 0}</div>
          </div>
        </div>

        <div className="card mb-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ClipboardCheck size={18} /> BOQs Awaiting Approval Queue
            </span>
            <Link href="/approvals/boq-pr" className="btn btn-sm btn-secondary">
              View All in BOQ Approvals →
            </Link>
          </div>
          {!data.pendingPrs?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <CheckCircle2 size={36} color="#059669" strokeWidth={1.5} />
              </div>
              <div className="empty-title">Approval Queue is Clear</div>
              <div className="empty-desc">No BOQ submissions pending your approval right now.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>BOQ Code / ID</th>
                    <th>BOQ Name / Lines</th>
                    <th>Project</th>
                    <th>Cost Centre</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Requester</th>
                    <th>BOQ Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingPrs?.map((pr: any) => (
                    <tr key={pr.id}>
                      <td style={{ fontWeight: 700, color: '#1e40af' }}>
                        <div>{pr.prNumber}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{pr.boq?.boqCode || ''}</div>
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        <div>{pr.title}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{pr.lines?.length || pr.totalLines || 0} line items</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{pr.project?.name || '—'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{pr.project?.projectCode}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{pr.costCentre?.code}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{pr.costCentre?.name}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155', fontWeight: 500 }}>
                          {(pr.categories || []).join(', ') || 'Standard'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                        ₹ {(pr.totalEstimatedValue || 0).toLocaleString('en-IN')}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{pr.requesterName || pr.requestedBy}</div>
                        {pr.requesterEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{pr.requesterEmail}</div>}
                      </td>
                      <td className="text-muted" style={{ fontSize: 12 }}>
                        {new Date(pr.requestedDate || pr.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td>
                        <span className="badge badge-warning" style={{ fontSize: 11, padding: '3px 8px' }}>
                          Under Review
                        </span>
                        {pr.hasEnquiry && (
                          <div style={{ marginTop: 2 }}>
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                              Clarification Pending
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                            title="Review complete BOQ details and line items"
                            onClick={() => {
                              setApproverSelectedPr(pr);
                              setApproverReviewModalOpen(true);
                            }}
                          >
                            <Eye size={12} /> Review BOQ
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                            title="Send query or clarification to submitter"
                            onClick={() => openApproverEnquiry(pr)}
                          >
                            <HelpCircle size={12} /> Message
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
                            title="Open communication and chat history"
                            onClick={() => openApproverChat(pr)}
                          >
                            <MessageSquare size={12} /> Chat
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                            title="Revert BOQ to Project User for correction"
                            onClick={() => {
                              setApproverSelectedPr(pr);
                              setApproverRevertModalOpen(true);
                            }}
                            disabled={approverProcessing}
                          >
                            <RotateCcw size={12} /> Revert
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ height: 28, padding: '0 10px', fontSize: 11, background: '#047857', borderColor: '#047857' }}
                            onClick={() => handleApproverApprove(pr.id)}
                            disabled={approverProcessing}
                            title="Approve BOQ and release to Category Manager"
                          >
                            <CheckCircle2 size={12} /> Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                            onClick={() => {
                              setApproverSelectedPr(pr);
                              setApproverRejectModalOpen(true);
                            }}
                            disabled={approverProcessing}
                            title="Reject BOQ with mandatory reason"
                          >
                            <XCircle size={12} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recently Actioned Revisions / BOQs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} /> Recently Actioned BOQs
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>BOQ / PR Number</th>
                  <th>Project</th>
                  <th>Cost Centre</th>
                  <th>Status</th>
                  <th>Action Date</th>
                </tr>
              </thead>
              <tbody>
                {[...(data.recentlyApprovedList || []), ...(data.recentlyRejectedList || [])].map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{r.prNumber || r.boq?.boqCode}</td>
                    <td>{r.project?.name}</td>
                    <td>{r.costCentre?.code}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-muted">{new Date(r.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* REVIEW PR MODAL */}
        {approverReviewModalOpen && approverSelectedPr && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 780, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    BOQ Details: {approverSelectedPr.prNumber}
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {approverSelectedPr.title} • Cost Centre: {approverSelectedPr.costCentre?.code} ({approverSelectedPr.costCentre?.name})
                  </div>
                </div>
                <button type="button" onClick={() => setApproverReviewModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                  <X size={18} />
                </button>
              </div>

              {/* PR Metadata Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Source BOQ</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{approverSelectedPr.boq?.boqCode} ({approverSelectedPr.boqRevision?.revisionCode || 'R0'})</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Requester</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{approverSelectedPr.requesterName || approverSelectedPr.requestedBy}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Total Line Items</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{approverSelectedPr.lines?.length || 0} Lines</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Requested Value</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>₹ {(approverSelectedPr.totalEstimatedValue || 0).toLocaleString('en-IN')}</div>
                </div>
              </div>

              {/* Line items table */}
              <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 16 }}>
                <table className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr style={{ height: 36, borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0 10px', width: 40 }}>#</th>
                      <th style={{ padding: '0 10px' }}>Item Description</th>
                      <th style={{ padding: '0 10px' }}>BOQ Description</th>
                      <th style={{ padding: '0 10px' }}>Category</th>
                      <th style={{ padding: '0 10px', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '0 10px' }}>UOM</th>
                      <th style={{ padding: '0 10px', textAlign: 'right' }}>Rate (₹)</th>
                      <th style={{ padding: '0 10px', textAlign: 'right' }}>Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(approverSelectedPr.lines || []).map((line: any, idx: number) => (
                      <tr key={line.id || idx} style={{ borderBottom: '1px solid #f1f5f9', height: 40 }}>
                        <td style={{ padding: '0 10px', color: '#64748b' }}>{line.lineNumber || idx + 1}</td>
                        <td style={{ padding: '0 10px', fontWeight: 600, color: '#0f172a' }}>{line.itemDescription}</td>
                        <td style={{ padding: '0 10px', color: '#64748b' }}>{line.specification || line.boqLine?.specification || '—'}</td>
                        <td style={{ padding: '0 10px', color: '#475569' }}>{line.category}</td>
                        <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 600 }}>{line.quantity}</td>
                        <td style={{ padding: '0 10px', color: '#64748b' }}>{line.uom}</td>
                        <td style={{ padding: '0 10px', textAlign: 'right' }}>{(line.estimatedRate || 0).toLocaleString('en-IN')}</td>
                        <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                          ₹ {(line.estimatedValue || (line.quantity * (line.estimatedRate || 0))).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      openApproverEnquiry(approverSelectedPr);
                    }}
                  >
                    <HelpCircle size={13} /> Ask Clarification
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      openApproverChat(approverSelectedPr);
                    }}
                  >
                    <MessageSquare size={13} /> Chat with Requester
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setApproverReviewModalOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      setApproverRevertModalOpen(true);
                    }}
                    disabled={approverProcessing}
                  >
                    <RotateCcw size={14} /> Revert for Correction
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      setApproverRejectModalOpen(true);
                    }}
                    disabled={approverProcessing}
                  >
                    <XCircle size={14} /> Reject BOQ
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ background: '#047857', borderColor: '#047857' }}
                    onClick={() => handleApproverApprove(approverSelectedPr.id)}
                    disabled={approverProcessing}
                  >
                    <CheckCircle2 size={14} /> Approve & Release to Procurement
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REVERT MODAL */}
        {approverRevertModalOpen && approverSelectedPr && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#b45309' }}>
                <RotateCcw size={20} />
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Revert BOQ for Correction
                </h3>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>
                Specify the correction instructions for <strong>{approverSelectedPr.prNumber}</strong> ({approverSelectedPr.title}). The BOQ will be returned to the submitting Project User with these feedback remarks.
              </p>

              <form onSubmit={handleApproverRevert}>
                <textarea
                  value={approverRevertReason}
                  onChange={e => setApproverRevertReason(e.target.value)}
                  placeholder="Specific reasons and correction instructions for Project User (mandatory)..."
                  rows={4}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    marginBottom: 16,
                    outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setApproverRevertModalOpen(false);
                      setApproverRevertReason('');
                    }}
                    disabled={approverProcessing}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: '#b45309', borderColor: '#b45309' }}
                    disabled={approverProcessing || !approverRevertReason.trim()}
                  >
                    {approverProcessing ? 'Reverting...' : 'Confirm Revert for Correction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* REJECT MODAL */}
        {approverRejectModalOpen && approverSelectedPr && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>
                Reject Purchase Request
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>
                Please state the specific reason for rejecting <strong>{approverSelectedPr.prNumber}</strong>. The request will be returned to the requester with these feedback remarks.
              </p>

              <form onSubmit={handleApproverReject}>
                <textarea
                  value={approverRejectReason}
                  onChange={e => setApproverRejectReason(e.target.value)}
                  placeholder="Reason for rejection (mandatory)..."
                  rows={4}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    marginBottom: 16,
                    outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setApproverRejectModalOpen(false);
                      setApproverRejectReason('');
                    }}
                    disabled={approverProcessing}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: '#dc2626', borderColor: '#dc2626' }}
                    disabled={approverProcessing || !approverRejectReason.trim()}
                  >
                    {approverProcessing ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CHAT / ENQUIRY DRAWER */}
        {approverChatPr && (
          <ApprovalChatDrawer
            isOpen={approverChatDrawerOpen}
            onClose={() => {
              setApproverChatDrawerOpen(false);
              setApproverChatPr(null);
            }}
            entityType="PR"
            entityId={approverChatPr.id}
            entityCode={approverChatPr.prNumber}
            title={approverChatPr.title}
            costCentre={approverChatPr.costCentre?.code}
            category={(approverChatPr.categories || []).join(', ')}
            amount={approverSelectedPr?.totalEstimatedValue || approverChatPr.totalEstimatedValue}
            initialEnquiryMode={approverIsEnquiryMode}
            onMessageSent={loadDashboard}
          />
        )}
      </div>
    );
  }

  // ============================================================
  // 3. PROCUREMENT_USER VIEW (PR-FIRST REGISTER & EXPANDABLE RFQS)
  // ============================================================
  if (data.role === 'PROCUREMENT_USER') {
    const summary = data.summaryCards || {
      prsReceived: data.approvedPrsCount || 0,
      rfqsInProgress: data.activeRfqsCount || 0,
      negotiationsPending: data.negotiationsCount || 0,
      awardsPpoPending: data.awardsPendingCount || 0,
    };

    const demoPrRecord = {
      id: 'PR-DEMO-001',
      prId: 'PR-DEMO-001',
      prNumber: 'PR-DEMO-001',
      description: 'Civil Finishing & Interior Fitout Package (8 items)',
      boqCode: 'BOQ-KND-001',
      projectName: 'Kundanahalli Retail Project',
      projectCode: 'KND-RET-01',
      costCentre: 'CC45 - Civil & Interior Fitout',
      category: 'Civil & Interior',
      requestedValue: 1133150,
      prApprovalStatus: 'APPROVED',
      sourcingStage: 'Negotiation',
      currentStage: 'Negotiation',
      rfqCount: 1,
      canCreateRfq: false,
      hasRateCardMatch: true,
      isExample: true,
      lastUpdated: new Date().toISOString(),
      rfqs: [
        {
          id: 'RFQ-DEMO-001',
          rfqNumber: 'RFQ-DEMO-001',
          description: 'Civil Finishing & Interior Fitout Package (8 items)',
          packageName: 'Kundanahalli Retail Store — CC45 Fitout',
          status: 'NEGOTIATION',
          vendorInvitationProgress: '3 submitted / 3 invited',
          invitedCount: 3,
          quotesCount: 3,
          quotationStage: '3 Quotes Recorded',
          negotiationStage: 'Round 1 (Revised ₹8,50,000)',
          awardStatus: 'Pending Approval',
          ppoStatus: 'Ready for PPO',
          estimatedBenchmarkValue: 1133150,
          lastUpdated: new Date().toISOString(),
          openUrl: '/procurement/rfqs/RFQ-DEMO-001',
          isExample: true,
        },
      ],
    };

    const register: any[] = [demoPrRecord, ...(data.prRegister || data.consolidatedRegister || [])];
    const searchLower = (searchTerm || '').toLowerCase();

    // Filter logic supporting text search, stage select, and clickable card filter
    const filteredRegister = register.filter((item: any) => {
      // 1. Text search
      const matchesSearch =
        !searchTerm ||
        item.prNumber?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.projectName?.toLowerCase().includes(searchLower) ||
        item.costCentre?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower) ||
        item.rfqs?.some((r: any) =>
          r.rfqNumber?.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower)
        );

      // 2. Stage select filter
      const itemStage = item.sourcingStage || item.currentStage;
      const matchesStage = !selectedStage || itemStage === selectedStage;

      // 3. Clickable summary card filter
      let matchesCard = true;
      if (activeCardFilter === 'prs_received') {
        matchesCard =
          itemStage === 'Approved PR — Awaiting RFQ' ||
          itemStage === 'RFQ Preparation' ||
          !item.rfqs ||
          item.rfqs.length === 0;
      } else if (activeCardFilter === 'rfqs_in_progress') {
        matchesCard =
          itemStage === 'RFQ Issued / Awaiting Quotations' ||
          itemStage === 'Quotation Comparison' ||
          item.rfqs?.some((r: any) =>
            r.status === 'RELEASED' ||
            r.status === 'VENDOR_RESPONSE_OPEN' ||
            r.status === 'COMPARISON' ||
            r.status === 'RESPONSE_CLOSED'
          );
      } else if (activeCardFilter === 'negotiations_pending') {
        matchesCard =
          itemStage === 'Negotiation' ||
          item.rfqs?.some((r: any) =>
            r.status === 'NEGOTIATION' ||
            (r.negotiationStage && r.negotiationStage !== '—')
          );
      } else if (activeCardFilter === 'awards_ppo_pending') {
        matchesCard =
          itemStage === 'Award Pending Approval' ||
          itemStage === 'Award Approved' ||
          itemStage === 'PPO Created' ||
          item.rfqs?.some((r: any) =>
            (r.awardStatus && r.awardStatus !== 'Not Prepared') ||
            (r.ppoStatus && r.ppoStatus !== '—')
          );
      }

      return matchesSearch && matchesStage && matchesCard;
    });

    const stagesList = [
      'Approved PR — Awaiting RFQ',
      'RFQ Preparation',
      'RFQ Issued / Awaiting Quotations',
      'Quotation Comparison',
      'Negotiation',
      'Award Pending Approval',
      'Award Approved',
      'PPO Created',
    ];

    const toggleExpand = (prId: string) => {
      setExpandedPrs((prev) => ({
        ...prev,
        [prId]: !prev[prId],
      }));
    };

    const toggleExpandAll = () => {
      const allExpanded = filteredRegister.every((pr) => expandedPrs[pr.id]);
      const next: Record<string, boolean> = {};
      filteredRegister.forEach((pr) => {
        next[pr.id] = !allExpanded;
      });
      setExpandedPrs(next);
    };

    const getStageBadgeClass = (stage: string) => {
      switch (stage) {
        case 'Approved PR — Awaiting RFQ':
          return 'badge-info';
        case 'RFQ Preparation':
          return 'badge-draft';
        case 'RFQ Issued / Awaiting Quotations':
        case 'RFQ Issued':
          return 'badge-submitted';
        case 'Awaiting Quotations':
        case 'Quotation Comparison':
          return 'badge-submitted';
        case 'Negotiation':
          return 'badge-review';
        case 'Award Pending Approval':
          return 'badge-review';
        case 'Award Approved':
          return 'badge-approved';
        case 'PPO Created':
          return 'badge-approved';
        case 'Closed / Cancelled':
          return 'badge-rejected';
        default:
          return 'badge-draft';
      }
    };

    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">Procurement Workspace</div>
            <div className="page-subtitle">PR-First Register: Traceable RFQ sourcing, negotiation, awarding & PPO execution</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>Role: PROCUREMENT_USER</span>
            <Link
              href="/procurement/rfqs/RFQ-DEMO-001"
              className="btn btn-sm btn-secondary"
              style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#16a34a', color: '#166534', background: '#f0fdf4' }}
            >
              <Sparkles size={14} color="#16a34a" /> View Workflow Example
            </Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary btn-sm">+ Create RFQ</Link>
          </div>
        </div>

        {/* Interactive Example Mode Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: '14px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16a34a',
                flexShrink: 0,
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13, color: '#166534' }}>
                  Interactive Procurement Workflow Demonstration
                </strong>
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '1px 6px' }}>
                  SAMPLE DATA
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                Experience end-to-end sourcing in the actual application: <strong>Kundanahalli Retail Project (CC45)</strong>.
                Explore PR-inherited scope (8 items), 3 qualified vendors, quotation comparison, negotiation rounds, award sanction, and PPO creation.
              </div>
            </div>
          </div>

          <Link
            href="/procurement/rfqs/RFQ-DEMO-001"
            className="btn btn-sm btn-primary"
            style={{
              fontWeight: 700,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              backgroundColor: '#16a34a',
              borderColor: '#15803d',
            }}
          >
            <Sparkles size={14} /> View Workflow Example →
          </Link>
        </div>

        {/* 1. Four Compact, Live Clickable Summary Cards */}
        <div className="kpi-grid mb-6">
          {/* Card 1: PRs Received */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'prs_received' ? null : 'prs_received')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #059669',
              backgroundColor: activeCardFilter === 'prs_received' ? '#f0fdf4' : undefined,
              boxShadow: activeCardFilter === 'prs_received' ? '0 0 0 2px #059669' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter PRs awaiting sourcing"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">PRs Received</div>
              {activeCardFilter === 'prs_received' && (
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 6px' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#059669' }}>{summary.prsReceived ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Approved PRs awaiting sourcing</div>
          </div>

          {/* Card 2: RFQs in Progress */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'rfqs_in_progress' ? null : 'rfqs_in_progress')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #2563eb',
              backgroundColor: activeCardFilter === 'rfqs_in_progress' ? '#eff6ff' : undefined,
              boxShadow: activeCardFilter === 'rfqs_in_progress' ? '0 0 0 2px #2563eb' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter RFQs in progress"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">RFQs in Progress</div>
              {activeCardFilter === 'rfqs_in_progress' && (
                <span className="badge badge-info" style={{ fontSize: 10, padding: '2px 6px' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#2563eb' }}>{summary.rfqsInProgress ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Active sourcing & quote collection</div>
          </div>

          {/* Card 3: Negotiations Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'negotiations_pending' ? null : 'negotiations_pending')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #d97706',
              backgroundColor: activeCardFilter === 'negotiations_pending' ? '#fffbeb' : undefined,
              boxShadow: activeCardFilter === 'negotiations_pending' ? '0 0 0 2px #d97706' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter negotiations pending"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">Negotiations Pending</div>
              {activeCardFilter === 'negotiations_pending' && (
                <span className="badge badge-review" style={{ fontSize: 10, padding: '2px 6px' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#d97706' }}>{summary.negotiationsPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Active rounds & commercial reviews</div>
          </div>

          {/* Card 4: Awards / PPO Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'awards_ppo_pending' ? null : 'awards_ppo_pending')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #7c3aed',
              backgroundColor: activeCardFilter === 'awards_ppo_pending' ? '#f5f3ff' : undefined,
              boxShadow: activeCardFilter === 'awards_ppo_pending' ? '0 0 0 2px #7c3aed' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter awards and PPOs pending"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">Awards / PPO Pending</div>
              {activeCardFilter === 'awards_ppo_pending' && (
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 6px', background: '#f3e8ff', color: '#7c3aed' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#7c3aed' }}>{summary.awardsPpoPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Award approval & order issuance</div>
          </div>
        </div>

        {/* 2. PR-First Register with Expandable Associated RFQs */}
        <div className="card mb-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} /> PR Register
              </span>
              <button
                type="button"
                onClick={toggleExpandAll}
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, color: '#2563eb' }}
              >
                {filteredRegister.every((pr) => expandedPrs[pr.id]) ? 'Collapse All RFQs' : 'Expand All RFQs'}
              </button>
            </div>

            {/* Register Filters & Search */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search PR #, RFQ #, description, cost centre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input input-sm"
                style={{ width: 270, fontSize: 12 }}
              />

              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="input input-sm"
                style={{ width: 210, fontSize: 12 }}
              >
                <option value="">All Stages ({register.length})</option>
                {stagesList.map((st) => {
                  const cnt = register.filter((r) => (r.sourcingStage || r.currentStage) === st).length;
                  return (
                    <option key={st} value={st}>
                      {st} ({cnt})
                    </option>
                  );
                })}
              </select>

              {(searchTerm || selectedStage || activeCardFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedStage('');
                    setActiveCardFilter(null);
                  }}
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, color: '#dc2626' }}
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>

          {/* Active Card Filter Banner */}
          {activeCardFilter && (
            <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Filtered by:{' '}
                <strong style={{ color: '#0f172a' }}>
                  {activeCardFilter === 'prs_received' && 'PRs Received (Awaiting RFQ)'}
                  {activeCardFilter === 'rfqs_in_progress' && 'RFQs in Progress'}
                  {activeCardFilter === 'negotiations_pending' && 'Negotiations Pending'}
                  {activeCardFilter === 'awards_ppo_pending' && 'Awards / PPO Pending'}
                </strong>{' '}
                — Showing {filteredRegister.length} PRs
              </span>
              <button
                type="button"
                onClick={() => setActiveCardFilter(null)}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                Reset Filter ✕
              </button>
            </div>
          )}

          {filteredRegister.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FileText size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">No matching PR records found</div>
              <div className="empty-desc">
                {searchTerm || selectedStage || activeCardFilter
                  ? 'Try clearing the search or category filters.'
                  : 'Approved Purchase Requests available to Procurement will appear here.'}
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>PR Number</th>
                    <th>PR / BOQ Description</th>
                    <th>Cost Centre</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Requested Value</th>
                    <th>PR Status</th>
                    <th>Sourcing Stage</th>
                    <th style={{ textAlign: 'center' }}>Linked RFQs</th>
                    <th>Last Updated</th>
                    <th className="col-actions" style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegister.map((item: any) => {
                    const isExpanded = !!expandedPrs[item.id];
                    const rfqCount = item.rfqs?.length || 0;
                    const stage = item.sourcingStage || item.currentStage;
                    const isAwaitingRfq = stage === 'Approved PR — Awaiting RFQ' || rfqCount === 0;

                    return (
                      <Fragment key={item.id}>
                        {/* Top-Level PR Row */}
                        <tr
                          style={{
                            backgroundColor: isExpanded ? '#f8fafc' : undefined,
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {/* Expand Toggle Chevron */}
                          <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(item.id)}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 4px', color: '#64748b' }}
                              aria-label={isExpanded ? 'Collapse RFQs' : 'Expand RFQs'}
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>

                          {/* PR Number */}
                          <td className="font-mono font-bold text-primary">
                            <span
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => toggleExpand(item.id)}
                              title="Click to toggle associated RFQs"
                            >
                              {item.prNumber}
                            </span>
                            {item.isExample && (
                              <span
                                className="badge"
                                style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  padding: '1px 5px',
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  fontWeight: 700,
                                }}
                              >
                                EXAMPLE
                              </span>
                            )}
                          </td>

                          {/* PR / BOQ Description */}
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.description}</div>
                            <div className="text-muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                              <span>Project: {item.projectName}</span>
                              <span>•</span>
                              <span>BOQ: {item.boqCode}</span>
                            </div>
                          </td>

                          {/* Cost Centre */}
                          <td>
                            <span style={{ fontSize: 12 }}>{item.costCentre}</span>
                          </td>

                          {/* Category */}
                          <td>
                            <span className="badge badge-info" style={{ fontSize: 11 }}>
                              {item.category}
                            </span>
                          </td>

                          {/* Requested Value */}
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            ₹ {(item.requestedValue || 0).toLocaleString('en-IN')}
                          </td>

                          {/* PR Approval Status */}
                          <td>
                            <StatusBadge status={item.prApprovalStatus || 'APPROVED'} />
                          </td>

                          {/* Sourcing Stage */}
                          <td>
                            <span className={`badge ${getStageBadgeClass(stage)}`}>
                              {stage}
                            </span>
                          </td>

                          {/* Linked RFQ Count */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              className={`badge ${rfqCount > 0 ? 'badge-info' : 'badge-draft'}`}
                              style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
                              title="Click to view associated RFQ packages"
                            >
                              {rfqCount} {rfqCount === 1 ? 'RFQ' : 'RFQs'}
                            </button>
                          </td>

                          {/* Last Updated */}
                          <td className="text-muted" style={{ fontSize: 12 }}>
                            {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : '—'}
                          </td>

                          {/* Action */}
                          <td className="col-actions" style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {isAwaitingRfq && (
                                <Link
                                  href={`/procurement/rfqs/new?prId=${item.id}`}
                                  className="btn btn-sm btn-primary"
                                  style={{ fontWeight: 700, padding: '4px 10px', fontSize: 11 }}
                                >
                                  + Create RFQ
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.id)}
                                className="btn btn-sm btn-ghost"
                                style={{ fontSize: 11, padding: '4px 8px' }}
                              >
                                {isExpanded ? 'Hide RFQs' : 'View RFQs'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Nested Associated RFQs Row (Expanded) */}
                        {isExpanded && (
                          <tr key={`${item.id}-nested`} style={{ background: '#f8fafc' }}>
                            <td colSpan={11} style={{ padding: '0 0 16px 40px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                              <div
                                style={{
                                  background: '#ffffff',
                                  borderRadius: 8,
                                  border: '1px solid #cbd5e1',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                  padding: '16px 20px',
                                  marginTop: 4,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Layers size={16} color="#2563eb" />
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                                      Associated RFQs for {item.prNumber}
                                    </span>
                                    <span className="badge badge-info" style={{ fontSize: 11 }}>
                                      {rfqCount} Package{rfqCount === 1 ? '' : 's'} Linked
                                    </span>
                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                                      Linked BOQ: <strong style={{ color: '#334155' }}>{item.boqCode}</strong>
                                    </span>
                                  </div>
                                  <Link
                                    href={`/procurement/rfqs/new?prId=${item.id}`}
                                    className="btn btn-sm btn-primary"
                                    style={{ fontSize: 11, padding: '4px 10px', fontWeight: 600 }}
                                  >
                                    <Plus size={12} style={{ marginRight: 4 }} /> Create RFQ
                                  </Link>
                                </div>

                                {rfqCount === 0 ? (
                                  <div
                                    style={{
                                      background: '#f8fafc',
                                      border: '1px dashed #cbd5e1',
                                      borderRadius: 6,
                                      padding: '20px',
                                      textAlign: 'center',
                                    }}
                                  >
                                    <p style={{ margin: 0, fontSize: 13, color: '#475569', fontWeight: 600 }}>
                                      No RFQ packages created for this Purchase Request yet.
                                    </p>
                                    <p style={{ margin: '4px 0 12px', fontSize: 12, color: '#64748b' }}>
                                      Approved PR line items are ready for vendor invitations and sourcing package initiation.
                                    </p>
                                    <Link
                                      href={`/procurement/rfqs/new?prId=${item.id}`}
                                      className="btn btn-sm btn-primary"
                                      style={{ fontWeight: 700, fontSize: 12 }}
                                    >
                                      + Create RFQ for {item.prNumber}
                                    </Link>
                                  </div>
                                ) : (
                                  <div className="table-wrapper" style={{ borderRadius: 6, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <table className="data-table" style={{ fontSize: 12, margin: 0 }}>
                                      <thead>
                                        <tr style={{ background: '#f1f5f9' }}>
                                          <th>RFQ Number</th>
                                          <th>RFQ Description / Scope</th>
                                          <th>Vendor Invitation / Progress</th>
                                          <th>Quotation Stage</th>
                                          <th>Negotiation Stage</th>
                                          <th>Award Status</th>
                                          <th>PPO Status</th>
                                          <th>Last Updated</th>
                                          <th style={{ textAlign: 'right' }}>Open RFQ Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.rfqs.map((rfq: any) => (
                                          <tr key={rfq.id}>
                                            {/* RFQ Number */}
                                            <td className="font-mono" style={{ fontWeight: 700 }}>
                                              <Link
                                                href={`/procurement/rfqs/${rfq.id}`}
                                                style={{ color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                              >
                                                {rfq.rfqNumber}
                                              </Link>
                                            </td>

                                            {/* RFQ Description or Scope */}
                                            <td>
                                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{rfq.description}</div>
                                              {rfq.packageName && rfq.packageName !== rfq.description && (
                                                <div style={{ fontSize: 11, color: '#64748b' }}>{rfq.packageName}</div>
                                              )}
                                            </td>

                                            {/* Vendor Invitation / Response Progress */}
                                            <td>
                                              <span className="badge badge-info" style={{ fontSize: 11 }}>
                                                {rfq.vendorInvitationProgress}
                                              </span>
                                            </td>

                                            {/* Quotation Stage */}
                                            <td>
                                              <span style={{ fontWeight: 500 }}>{rfq.quotationStage}</span>
                                            </td>

                                            {/* Negotiation Stage */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.negotiationStage !== '—' ? 'badge-review' : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.negotiationStage}
                                              </span>
                                            </td>

                                            {/* Award Status */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.awardStatus === 'Approved'
                                                    ? 'badge-approved'
                                                    : rfq.awardStatus === 'Pending Approval'
                                                    ? 'badge-review'
                                                    : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.awardStatus}
                                              </span>
                                            </td>

                                            {/* PPO Status */}
                                            <td>
                                              {rfq.ppoStatus !== '—' ? (
                                                <span className="badge badge-approved" style={{ fontSize: 10 }}>
                                                  {rfq.ppoStatus}
                                                </span>
                                              ) : (
                                                <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                                              )}
                                            </td>

                                            {/* Last Updated */}
                                            <td className="text-muted" style={{ fontSize: 11 }}>
                                              {rfq.lastUpdated ? new Date(rfq.lastUpdated).toLocaleDateString() : '—'}
                                            </td>

                                            {/* Open RFQ Action */}
                                            <td style={{ textAlign: 'right' }}>
                                              <Link
                                                href={`/procurement/rfqs/${rfq.id}`}
                                                className="btn btn-sm btn-secondary"
                                                style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                              >
                                                Open RFQ <ArrowRight size={12} />
                                              </Link>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Showing {filteredRegister.length} of {register.length} PR records (with linked RFQ packages)</span>
            <span style={{ fontSize: 11 }}>Tenant Isolation: {data.tenant?.name || 'Active Tenant'}</span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 4. FINANCE_USER VIEW
  // ============================================================
  if (data.role === 'FINANCE_USER') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">Finance & Capex Control Workspace</div>
            <div className="page-subtitle">Budget Monitoring, Cost Centre Audit & BOQ Financial Baseline</div>
          </div>
          <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>Role: FINANCE_USER</span>
        </div>

        <div className="alert alert-info mb-6" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Briefcase size={22} style={{ color: '#2563eb', flexShrink: 0 }} />
          <div>
            <strong>Financial Audit View (Read-Only):</strong> Tracking approved budgets and cost center assignments.
            <div style={{ fontSize: 12, marginTop: 4, color: '#64748b' }}>
              * Benchmark engine, line pricing comparison, and ERP cost ledger synchronization are scheduled for Phase 2.
            </div>
          </div>
        </div>

        <div className="kpi-grid mb-6">
          <div className="kpi-card" style={{ borderLeft: '3px solid #2563eb' }}>
            <div className="kpi-label">Total Allocated Capex Budget</div>
            <div className="kpi-value" style={{ color: '#2563eb' }}>
              ₹ {(data.totalBudget ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Active Capex Projects</div>
            <div className="kpi-value">{data.totalProjects ?? 0}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
            <div className="kpi-label">BOQ Approved Projects</div>
            <div className="kpi-value" style={{ color: '#059669' }}>{data.approvedProjects ?? 0}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Briefcase size={18} /> Project Financial & Cost Centre Master
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project Code</th>
                  <th>Project Name</th>
                  <th>Cost Centre</th>
                  <th>Budget</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.projects?.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-mono font-bold">{p.projectCode}</td>
                    <td>{p.name}</td>
                    <td><span className="badge badge-draft font-mono">{p.costCentre || '—'}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.budget ? `₹ ${p.budget.toLocaleString()}` : '—'}</td>
                    <td>{p.currency || 'INR'}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-muted">{p.projectOwner || '—'}</td>
                    <td>
                      <Link href={`/projects/${p.id}`} className="btn btn-sm btn-ghost">View Details →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 5. CATEGORY_MANAGER VIEW (BOQ-CENTRED CENTRAL SOURCING GATEWAY)
  // ============================================================
  if (data.role === 'CATEGORY_MANAGER') {
    const summary = data.summaryCards || {
      approvedBoqs: data.approvedBoqsCount || 0,
      prsReceived: data.approvedBoqsCount || 0,
      rfqsInProgress: data.activeRfqsCount || 0,
      negotiationsPending: data.negotiationsCount || 0,
      awardsPpoPending: data.awardsPendingCount || 0,
    };

    const demoPrRecord = {
      id: 'PR-DEMO-001',
      prId: 'PR-DEMO-001',
      boqId: 'BOQ-KND-001',
      boqCode: 'BOQ-KND-001',
      prNumber: 'PR-DEMO-001',
      title: 'Civil Finishing & Interior Fitout Package (8 items)',
      description: 'Civil Finishing & Interior Fitout Package (8 items)',
      projectName: 'Kundanahalli Retail Project',
      projectCode: 'KND-RET-01',
      costCentre: 'CC45 - Civil & Interior Fitout',
      costCentreCode: 'CC45',
      category: 'Civil & Interior',
      benchmarkValue: 1133150,
      requestedValue: 1133150,
      approvedRevision: 'R1 (APPROVED)',
      revisionCode: 'R1',
      sourcingStage: 'Negotiation',
      currentStage: 'Negotiation',
      overallStage: 'Negotiation',
      rfqCount: 1,
      canCreateRfq: false,
      hasRateCardMatch: true,
      isExample: true,
      lastUpdated: new Date().toISOString(),
      rfqs: [
        {
          id: 'RFQ-DEMO-001',
          rfqNumber: 'RFQ-DEMO-001',
          title: 'Civil Finishing & Interior Fitout Package (8 items)',
          description: 'Civil Finishing & Interior Fitout Package (8 items)',
          packageName: 'Kundanahalli Retail Store — CC45 Fitout',
          status: 'NEGOTIATION',
          stage: 'Negotiation',
          vendorInvitationProgress: '3 submitted / 3 invited',
          invitedCount: 3,
          quotesCount: 3,
          quoteStatus: '3 Quotes Recorded',
          comparisonStatus: 'L1: Acme Infra Solutions (₹8,80,000)',
          quotationStage: '3 Quotes Recorded',
          negotiationRound: 'Round 1 (Revised ₹8,50,000)',
          negotiationStage: 'Round 1 (Revised ₹8,50,000)',
          pendingAction: 'Commercial Negotiation Active',
          nextResponsibleParty: 'BUYER',
          awardStatus: 'Pending Approval',
          ppoStatus: 'Ready for PPO',
          orderStatus: 'PENDING_AWARD',
          estimatedBenchmarkValue: 1133150,
          lastUpdated: new Date().toISOString(),
          openUrl: '/procurement/rfqs/RFQ-DEMO-001',
          negotiationUrl: '/procurement/rfqs/RFQ-DEMO-001?tab=negotiation',
          awardingUrl: '/procurement/rfqs/RFQ-DEMO-001?tab=awarding',
          ppoUrl: '/procurement/rfqs/RFQ-DEMO-001?tab=awarding',
          isExample: true,
        },
      ],
    };

    const register: any[] = [demoPrRecord, ...(data.boqRegister || data.prRegister || data.consolidatedRegister || [])];
    const searchLower = (searchTerm || '').toLowerCase();

    // Filter logic supporting text search, stage select, and clickable card filter
    const filteredRegister = register.filter((item: any) => {
      // 1. Text search
      const matchesSearch =
        !searchTerm ||
        item.boqCode?.toLowerCase().includes(searchLower) ||
        item.prNumber?.toLowerCase().includes(searchLower) ||
        item.title?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.projectName?.toLowerCase().includes(searchLower) ||
        item.costCentre?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower) ||
        item.rfqs?.some((r: any) =>
          r.rfqNumber?.toLowerCase().includes(searchLower) ||
          r.title?.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower)
        );

      // 2. Stage select filter
      const itemStage = item.sourcingStage || item.currentStage || item.overallStage;
      const matchesStage = !selectedStage || itemStage === selectedStage;

      // 3. Clickable summary card filter
      let matchesCard = true;
      if (activeCardFilter === 'prs_received') {
        matchesCard =
          itemStage === 'Approved BOQ — Awaiting RFQ' ||
          itemStage === 'Approved PR — Awaiting RFQ' ||
          itemStage === 'RFQ Preparation' ||
          !item.rfqs ||
          item.rfqs.length === 0;
      } else if (activeCardFilter === 'rfqs_in_progress') {
        matchesCard =
          itemStage === 'RFQ Issued / Awaiting Quotations' ||
          itemStage === 'Quotation Comparison' ||
          item.rfqs?.some((r: any) =>
            r.status === 'RELEASED' ||
            r.status === 'VENDOR_RESPONSE_OPEN' ||
            r.status === 'COMPARISON' ||
            r.status === 'RESPONSE_CLOSED'
          );
      } else if (activeCardFilter === 'negotiations_pending') {
        matchesCard =
          itemStage === 'Negotiation' ||
          itemStage === 'Rates Locked' ||
          item.rfqs?.some((r: any) =>
            r.status === 'NEGOTIATION' ||
            r.status === 'FINAL_RATE_LOCKED' ||
            (r.negotiationStage && r.negotiationStage !== '—')
          );
      } else if (activeCardFilter === 'awards_ppo_pending') {
        matchesCard =
          itemStage === 'Award Pending Approval' ||
          itemStage === 'Award Approved' ||
          itemStage === 'PPO Created' ||
          item.rfqs?.some((r: any) =>
            (r.awardStatus && r.awardStatus !== 'Not Prepared') ||
            (r.ppoStatus && r.ppoStatus !== '—')
          );
      }

      return matchesSearch && matchesStage && matchesCard;
    });

    const stagesList = [
      'Approved BOQ — Awaiting RFQ',
      'RFQ Preparation',
      'RFQ Issued / Awaiting Quotations',
      'Quotation Comparison',
      'Negotiation',
      'Rates Locked',
      'Award Pending Approval',
      'Award Approved',
      'PPO Created',
    ];

    const toggleExpand = (boqId: string) => {
      setExpandedPrs((prev) => ({
        ...prev,
        [boqId]: !prev[boqId],
      }));
    };

    const toggleExpandAll = () => {
      const allExpanded = filteredRegister.every((b) => expandedPrs[b.id]);
      const next: Record<string, boolean> = {};
      filteredRegister.forEach((b) => {
        next[b.id] = !allExpanded;
      });
      setExpandedPrs(next);
    };

    const getStageBadgeClass = (stage: string) => {
      switch (stage) {
        case 'Approved BOQ — Awaiting RFQ':
        case 'Approved PR — Awaiting RFQ':
          return 'badge-info';
        case 'RFQ Preparation':
          return 'badge-draft';
        case 'RFQ Issued / Awaiting Quotations':
        case 'RFQ Issued':
        case 'Awaiting Quotations':
          return 'badge-submitted';
        case 'Quotation Comparison':
          return 'badge-submitted';
        case 'Negotiation':
        case 'Rates Locked':
          return 'badge-review';
        case 'Award Pending Approval':
          return 'badge-review';
        case 'Award Approved':
        case 'PPO Created':
          return 'badge-approved';
        case 'Closed / Cancelled':
          return 'badge-rejected';
        default:
          return 'badge-draft';
      }
    };

    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">Category Manager Sourcing Gateway</div>
            <div className="page-subtitle">Central Gateway: Approved BOQs, Multi-Package RFQs, Quotation Comparison, Negotiation Hub, Awarding & PPO Lifecycle</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>Role: CATEGORY_MANAGER</span>
            <Link
              href="/procurement/rfqs/RFQ-DEMO-001?demo=true"
              className="btn btn-sm btn-secondary"
              style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#16a34a', color: '#166534', background: '#f0fdf4' }}
            >
              <Sparkles size={14} color="#16a34a" /> View Interactive Demo
            </Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary btn-sm">+ Create New RFQ</Link>
          </div>
        </div>

        {/* Interactive Demonstration Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: '14px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16a34a',
                flexShrink: 0,
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13, color: '#166534' }}>
                  Central Sourcing Gateway — BOQ Commercial Lifecycle
                </strong>
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '1px 6px' }}>
                  SINGLE SOURCING ENTRY POINT
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                Click or expand any Approved BOQ below to inspect its complete sourcing lifecycle: linked RFQs, invited vendors, quote comparison matrix, full-window Negotiation Hub, award sanctions, and PPO issuance.
              </div>
            </div>
          </div>

          <Link
            href="/procurement/rfqs/RFQ-DEMO-001?demo=true"
            className="btn btn-sm btn-primary"
            style={{
              fontWeight: 700,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              backgroundColor: '#16a34a',
              borderColor: '#15803d',
            }}
          >
            <Sparkles size={14} /> View Workflow Example →
          </Link>
        </div>

        {/* 1. Four Compact, Live Clickable Summary Cards */}
        <div className="kpi-grid mb-6">
          {/* Card 1: Approved BOQs */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'prs_received' ? null : 'prs_received')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #059669',
              backgroundColor: activeCardFilter === 'prs_received' ? '#f0fdf4' : undefined,
              boxShadow: activeCardFilter === 'prs_received' ? '0 0 0 2px #059669' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter Approved BOQs awaiting sourcing"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">Approved BOQs</div>
              {activeCardFilter === 'prs_received' && (
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 6px' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#059669' }}>{summary.approvedBoqs ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {summary.prsReceived !== undefined
                ? `${summary.prsReceived} awaiting RFQ of ${summary.approvedBoqs ?? 0} total`
                : 'Commercial baselines in sourcing queue'}
            </div>
          </div>

          {/* Card 2: RFQs in Progress */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'rfqs_in_progress' ? null : 'rfqs_in_progress')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #2563eb',
              backgroundColor: activeCardFilter === 'rfqs_in_progress' ? '#eff6ff' : undefined,
              boxShadow: activeCardFilter === 'rfqs_in_progress' ? '0 0 0 2px #2563eb' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter RFQs in progress"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">Active RFQs</div>
              {activeCardFilter === 'rfqs_in_progress' && (
                <span className="badge badge-info" style={{ fontSize: 10, padding: '2px 6px' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#2563eb' }}>{summary.rfqsInProgress ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Active bidding & quote comparison</div>
          </div>

          {/* Card 3: Negotiations Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'negotiations_pending' ? null : 'negotiations_pending')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #d97706',
              backgroundColor: activeCardFilter === 'negotiations_pending' ? '#fffbeb' : undefined,
              boxShadow: activeCardFilter === 'negotiations_pending' ? '0 0 0 2px #d97706' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter negotiations pending"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">In Negotiation</div>
              {activeCardFilter === 'negotiations_pending' && (
                <span className="badge badge-review" style={{ fontSize: 10, padding: '2px 6px' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#d97706' }}>{summary.negotiationsPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Active counteroffer rounds & rate locking</div>
          </div>

          {/* Card 4: Awards / PPO Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'awards_ppo_pending' ? null : 'awards_ppo_pending')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #7c3aed',
              backgroundColor: activeCardFilter === 'awards_ppo_pending' ? '#f5f3ff' : undefined,
              boxShadow: activeCardFilter === 'awards_ppo_pending' ? '0 0 0 2px #7c3aed' : undefined,
              transition: 'all 0.15s ease',
            }}
            title="Click to filter awards and PPOs pending"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">Awards & PPOs</div>
              {activeCardFilter === 'awards_ppo_pending' && (
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 6px', background: '#f3e8ff', color: '#7c3aed' }}>Filtered</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#7c3aed' }}>{summary.awardsPpoPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Award sanction & order issuance</div>
          </div>
        </div>

        {/* 2. BOQ-Centred Sourcing Register with Expandable Associated RFQs */}
        <div className="card mb-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ClipboardCheck size={18} color="#059669" /> Approved BOQ Sourcing Register
              </span>
              <button
                type="button"
                onClick={toggleExpandAll}
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, color: '#2563eb' }}
              >
                {filteredRegister.every((b) => expandedPrs[b.id]) ? 'Collapse All BOQs' : 'Expand All BOQs'}
              </button>
            </div>

            {/* Register Filters & Search */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search BOQ code, RFQ #, package, project, cost centre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input input-sm"
                style={{ width: 290, fontSize: 12 }}
              />

              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="input input-sm"
                style={{ width: 220, fontSize: 12 }}
              >
                <option value="">All Stages ({register.length})</option>
                {stagesList.map((st) => {
                  const cnt = register.filter((r) => (r.sourcingStage || r.currentStage || r.overallStage) === st).length;
                  return (
                    <option key={st} value={st}>
                      {st} ({cnt})
                    </option>
                  );
                })}
              </select>

              {(searchTerm || selectedStage || activeCardFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedStage('');
                    setActiveCardFilter(null);
                  }}
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, color: '#dc2626' }}
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>

          {/* Active Card Filter Banner */}
          {activeCardFilter && (
            <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Filtered by:{' '}
                <strong style={{ color: '#0f172a' }}>
                  {activeCardFilter === 'prs_received' && 'Approved BOQs (Awaiting Sourcing)'}
                  {activeCardFilter === 'rfqs_in_progress' && 'RFQs in Progress (Quotes & Comparison)'}
                  {activeCardFilter === 'negotiations_pending' && 'Negotiations Pending'}
                  {activeCardFilter === 'awards_ppo_pending' && 'Awards & PPOs Pending'}
                </strong>{' '}
                — Showing {filteredRegister.length} BOQs
              </span>
              <button
                type="button"
                onClick={() => setActiveCardFilter(null)}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                Reset Filter ✕
              </button>
            </div>
          )}

          {filteredRegister.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FileText size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">No matching BOQ commercial baselines found</div>
              <div className="empty-desc">
                {searchTerm || selectedStage || activeCardFilter
                  ? 'Try clearing the search or stage filters.'
                  : 'Approved BOQs will automatically appear here once released by the Project Approver.'}
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>BOQ Code</th>
                    <th>BOQ Scope Description</th>
                    <th>Project</th>
                    <th>Cost Centre</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Benchmark Value</th>
                    <th>Approved Rev</th>
                    <th>Sourcing Stage</th>
                    <th style={{ textAlign: 'center' }}>Linked RFQs</th>
                    <th className="col-actions" style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegister.map((item: any) => {
                    const isExpanded = !!expandedPrs[item.id];
                    const rfqCount = item.rfqs?.length || 0;
                    const stage = item.sourcingStage || item.currentStage || item.overallStage;
                    const isAwaitingRfq = stage === 'Approved BOQ — Awaiting RFQ' || stage === 'Approved PR — Awaiting RFQ' || rfqCount === 0;

                    return (
                      <Fragment key={item.id}>
                        {/* Top-Level BOQ Row */}
                        <tr
                          style={{
                            backgroundColor: isExpanded ? '#f8fafc' : undefined,
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {/* Expand Toggle Chevron */}
                          <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(item.id)}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 4px', color: '#64748b' }}
                              aria-label={isExpanded ? 'Collapse RFQs' : 'Expand RFQs'}
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>

                          {/* BOQ Code */}
                          <td className="font-mono font-bold text-primary">
                            <span
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => toggleExpand(item.id)}
                              title="Click to toggle associated RFQ sourcing packages"
                            >
                              {item.boqCode || item.prNumber}
                            </span>
                            {item.isExample && (
                              <span
                                className="badge"
                                style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  padding: '1px 5px',
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  fontWeight: 700,
                                }}
                              >
                                SAMPLE
                              </span>
                            )}
                          </td>

                          {/* BOQ / Scope Description */}
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.title || item.description}</div>
                            <div className="text-muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                              <span>Rev: {item.approvedRevision || item.revisionCode || 'R0'}</span>
                              <span>•</span>
                              <span>Lines: {item.totalLines || 8} items</span>
                            </div>
                          </td>

                          {/* Project */}
                          <td>
                            <div style={{ fontWeight: 500 }}>{item.projectName}</div>
                            {item.projectCode && <div className="text-muted font-mono" style={{ fontSize: 11 }}>{item.projectCode}</div>}
                          </td>

                          {/* Cost Centre */}
                          <td>
                            <span style={{ fontSize: 12 }}>{item.costCentre}</span>
                          </td>

                          {/* Category */}
                          <td>
                            <span className="badge badge-info" style={{ fontSize: 11 }}>
                              {item.category}
                            </span>
                          </td>

                          {/* Benchmark Value */}
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            ₹ {(item.benchmarkValue || item.requestedValue || 0).toLocaleString('en-IN')}
                          </td>

                          {/* Approved Revision */}
                          <td>
                            <span className="badge badge-approved font-mono" style={{ fontSize: 11, fontWeight: 700 }}>
                              {item.approvedRevision || item.revisionCode || 'APPROVED'}
                            </span>
                          </td>

                          {/* Sourcing Stage */}
                          <td>
                            <span className={`badge ${getStageBadgeClass(stage)}`}>
                              {stage}
                            </span>
                          </td>

                          {/* Linked RFQs Count */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              className={`badge ${rfqCount > 0 ? 'badge-info' : 'badge-draft'}`}
                              style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
                              title="Click to view associated RFQ packages"
                            >
                              {rfqCount} {rfqCount === 1 ? 'RFQ' : 'RFQs'}
                            </button>
                          </td>

                          {/* Action */}
                          <td className="col-actions" style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {isAwaitingRfq && (
                                <Link
                                  href={item.createRfqUrl || `/procurement/rfqs/new?revisionId=${item.id}&projectId=${item.projectId}`}
                                  className="btn btn-sm btn-primary"
                                  style={{ fontWeight: 700, padding: '4px 10px', fontSize: 11 }}
                                >
                                  + Create RFQ
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.id)}
                                className="btn btn-sm btn-ghost"
                                style={{ fontSize: 11, padding: '4px 8px' }}
                              >
                                {isExpanded ? 'Hide RFQs' : 'View RFQs'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Nested Associated RFQs Sourcing Lifecycle Row (Expanded) */}
                        {isExpanded && (
                          <tr key={`${item.id}-nested`} style={{ background: '#f8fafc' }}>
                            <td colSpan={11} style={{ padding: '0 0 16px 40px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                              <div
                                style={{
                                  background: '#ffffff',
                                  borderRadius: 8,
                                  border: '1px solid #cbd5e1',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                  padding: '16px 20px',
                                  marginTop: 4,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Layers size={16} color="#2563eb" />
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                                      Associated Sourcing Packages for {item.boqCode || item.prNumber}
                                    </span>
                                    <span className="badge badge-info" style={{ fontSize: 11 }}>
                                      {rfqCount} Package{rfqCount === 1 ? '' : 's'} Linked
                                    </span>
                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                                      Project: <strong style={{ color: '#334155' }}>{item.projectName}</strong>
                                    </span>
                                  </div>
                                  <Link
                                    href={item.createRfqUrl || `/procurement/rfqs/new?revisionId=${item.id}&projectId=${item.projectId}`}
                                    className="btn btn-sm btn-primary"
                                    style={{ fontSize: 11, padding: '4px 10px', fontWeight: 600 }}
                                  >
                                    <Plus size={12} style={{ marginRight: 4 }} /> Create RFQ Package
                                  </Link>
                                </div>

                                {rfqCount === 0 ? (
                                  <div
                                    style={{
                                      background: '#f8fafc',
                                      border: '1px dashed #cbd5e1',
                                      borderRadius: 6,
                                      padding: '20px',
                                      textAlign: 'center',
                                    }}
                                  >
                                    <p style={{ margin: 0, fontSize: 13, color: '#475569', fontWeight: 600 }}>
                                      No RFQ packages created for this commercial baseline yet.
                                    </p>
                                    <p style={{ margin: '4px 0 12px', fontSize: 12, color: '#64748b' }}>
                                      Approved BOQ line items and benchmark rates are locked and ready for packaging and vendor quotation dispatch.
                                    </p>
                                    <Link
                                      href={item.createRfqUrl || `/procurement/rfqs/new?revisionId=${item.id}&projectId=${item.projectId}`}
                                      className="btn btn-sm btn-primary"
                                      style={{ fontWeight: 700, fontSize: 12 }}
                                    >
                                      + Create First RFQ Package
                                    </Link>
                                  </div>
                                ) : (
                                  <div className="table-wrapper" style={{ borderRadius: 6, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <table className="data-table" style={{ fontSize: 12, margin: 0 }}>
                                      <thead>
                                        <tr style={{ background: '#f1f5f9' }}>
                                          <th>RFQ Number</th>
                                          <th>RFQ Description / Package</th>
                                          <th>Invited Vendors & Bids</th>
                                          <th>Quotation Comparison</th>
                                          <th>Negotiation Stage</th>
                                          <th>Pending Action & Turn</th>
                                          <th>Award Status</th>
                                          <th>PPO Status</th>
                                          <th style={{ textAlign: 'right' }}>Sourcing Lifecycle Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.rfqs.map((rfq: any) => (
                                          <tr key={rfq.id}>
                                            {/* RFQ Number */}
                                            <td className="font-mono" style={{ fontWeight: 700 }}>
                                              <Link
                                                href={rfq.openUrl || `/procurement/rfqs/${rfq.id}`}
                                                style={{ color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                title="Open full commercial workspace"
                                              >
                                                {rfq.rfqNumber}
                                              </Link>
                                            </td>

                                            {/* RFQ Description or Scope */}
                                            <td>
                                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{rfq.description || rfq.title}</div>
                                              {rfq.packageName && rfq.packageName !== (rfq.description || rfq.title) && (
                                                <div style={{ fontSize: 11, color: '#64748b' }}>{rfq.packageName}</div>
                                              )}
                                            </td>

                                            {/* Vendor Invitation / Response Progress */}
                                            <td>
                                              <span className="badge badge-info" style={{ fontSize: 11 }}>
                                                {rfq.vendorInvitationProgress}
                                              </span>
                                            </td>

                                            {/* Quotation Comparison Status */}
                                            <td>
                                              <div style={{ fontWeight: 500 }}>{rfq.comparisonStatus || rfq.quotationStage || '—'}</div>
                                            </td>

                                            {/* Negotiation Stage */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.negotiationStage && rfq.negotiationStage !== '—' ? 'badge-review' : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.negotiationStage || rfq.negotiationRound || '—'}
                                              </span>
                                            </td>

                                            {/* Pending Action & Turn */}
                                            <td>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <span style={{ fontSize: 11, fontWeight: 500, color: '#0f172a' }}>
                                                  {rfq.pendingAction || 'Awaiting Action'}
                                                </span>
                                                {rfq.nextResponsibleParty && (
                                                  <div>
                                                    <span
                                                      className="badge"
                                                      style={{
                                                        fontSize: 9,
                                                        padding: '1px 4px',
                                                        fontWeight: 700,
                                                        background: rfq.nextResponsibleParty === 'BUYER' ? '#eff6ff' : (rfq.nextResponsibleParty === 'VENDOR' ? '#fef3c7' : '#f1f5f9'),
                                                        color: rfq.nextResponsibleParty === 'BUYER' ? '#1d4ed8' : (rfq.nextResponsibleParty === 'VENDOR' ? '#92400e' : '#475569'),
                                                      }}
                                                    >
                                                      TURN: {rfq.nextResponsibleParty}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </td>

                                            {/* Award Status */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.awardStatus === 'Approved' || rfq.awardStatus === 'Awarded'
                                                    ? 'badge-approved'
                                                    : rfq.awardStatus === 'Pending Approval' || rfq.awardStatus === 'Award Recommended'
                                                    ? 'badge-review'
                                                    : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.awardStatus}
                                              </span>
                                              {rfq.recommendedVendor && (
                                                <div style={{ fontSize: 10, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                                                  {rfq.recommendedVendor}
                                                </div>
                                              )}
                                            </td>

                                            {/* PPO Status */}
                                            <td>
                                              {rfq.ppoStatus && rfq.ppoStatus !== '—' ? (
                                                <span className="badge badge-approved" style={{ fontSize: 10 }}>
                                                  {rfq.ppoStatus}
                                                </span>
                                              ) : (
                                                <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                                              )}
                                            </td>

                                            {/* Lifecycle Direct Action Buttons */}
                                            <td style={{ textAlign: 'right' }}>
                                              <div style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                <Link
                                                  href={rfq.openUrl || `/procurement/rfqs/${rfq.id}`}
                                                  className="btn btn-sm btn-secondary"
                                                  style={{ fontSize: 10, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                  title="Open Quotation Comparison Matrix"
                                                >
                                                  Open RFQ <ArrowRight size={10} />
                                                </Link>
                                                <Link
                                                  href={rfq.negotiationUrl || `/procurement/rfqs/${rfq.id}?tab=negotiation`}
                                                  className="btn btn-sm btn-outline"
                                                  style={{ fontSize: 10, padding: '3px 8px', color: '#b45309', borderColor: '#fde68a', background: '#fffbeb' }}
                                                  title="Open Negotiation Workspace"
                                                >
                                                  Negotiate
                                                </Link>
                                                <Link
                                                  href={rfq.awardingUrl || `/procurement/rfqs/${rfq.id}?tab=awarding`}
                                                  className="btn btn-sm btn-outline"
                                                  style={{ fontSize: 10, padding: '3px 8px', color: '#6b21a8', borderColor: '#e9d5ff', background: '#faf5ff' }}
                                                  title="Open Awarding & PPO Workspace"
                                                >
                                                  Award / PPO
                                                </Link>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 3. Collapsible Category Masters & Specification Quality Health Panel */}
        <div className="card mb-6">
          <div
            className="card-header"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setShowCategoryGovernance(!showCategoryGovernance)}
          >
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Folder size={18} color="#2563eb" /> Category Masters & Specification Quality Health
              <span className="badge badge-draft" style={{ fontSize: 11, marginLeft: 8 }}>
                {data.categoryCount ?? 0} Taxonomy Trees • {data.revisionsWithExceptions?.length ?? 0} Exceptions
              </span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 11, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {showCategoryGovernance ? 'Hide Category Controls ▲' : 'Show Category Controls ▼'}
            </button>
          </div>

          {showCategoryGovernance && (
            <div className="card-body" style={{ borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
              {/* Category taxonomy cards */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 13, color: '#1e293b' }}>Active Taxonomy Trees & Categories</strong>
                  <Link href="/masters/categories" className="btn btn-sm btn-secondary">Manage Category Masters →</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {data.categories?.map((cat: any) => (
                    <div key={cat.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#ffffff' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Folder size={14} color="#3b82f6" /> {cat.name}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {cat.children?.map((sub: any) => (
                          <span key={sub.id} className="badge badge-draft" style={{ fontSize: 10 }}>{sub.name}</span>
                        ))}
                        {!cat.children?.length && <span className="text-muted" style={{ fontSize: 11 }}>No subcategories</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality exceptions */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 13, color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={15} color="#d97706" /> BOQs Requiring Category Specification Quality Attention
                  </strong>
                </div>
                {!data.revisionsWithExceptions?.length ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: 6, fontSize: 12 }}>
                    ✓ All BOQ revisions meet category taxonomy and UOM standards. No validation exceptions found.
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>BOQ Code</th>
                          <th>Revision</th>
                          <th>Errors</th>
                          <th>Warnings</th>
                          <th>Quality Score</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.revisionsWithExceptions?.map((r: any) => (
                          <tr key={r.id}>
                            <td>{r.boq?.project?.name}</td>
                            <td className="font-mono">{r.boq?.boqCode}</td>
                            <td><span className="badge badge-submitted">{r.revisionCode}</span></td>
                            <td><span className="badge badge-error">{r.errorLines} Errors</span></td>
                            <td><span className="badge badge-warning">{r.warningLines} Warnings</span></td>
                            <td><strong>{r.qualityScore ?? '—'}%</strong></td>
                            <td>
                              <Link href={`/boq/${r.id}`} className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}>Inspect Workspace →</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // 6. CLIENT_ADMIN VIEW
  // ============================================================
  if (data.role === 'CLIENT_ADMIN') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">Client Administration Dashboard</div>
            <div className="page-subtitle">Tenant Governance: {data.tenant?.name || 'Organization'}</div>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/users" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Users size={16} /> Manage Users
            </Link>
            <Link href="/projects/new" className="btn btn-primary">+ New Project</Link>
          </div>
        </div>

        <div className="kpi-grid mb-6">
          <div className="kpi-card"><div className="kpi-label">Total Projects</div><div className="kpi-value">{data.totalProjects ?? 0}</div></div>
          <div className="kpi-card"><div className="kpi-label">Active Projects</div><div className="kpi-value">{data.activeProjects ?? 0}</div></div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
            <div className="kpi-label">Pending Approval</div>
            <div className="kpi-value" style={{ color: '#d97706' }}>{data.pendingApprovals ?? 0}</div>
          </div>
          <div className="kpi-card"><div className="kpi-label">Total Users</div><div className="kpi-value">{data.totalUsers ?? 0}</div></div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} /> Recent Tenant Audit Activity
            </span>
            <Link href="/audit" className="btn btn-sm btn-secondary">View Full Audit Log</Link>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Action</th><th>Entity</th><th>User</th><th>Time</th></tr></thead>
              <tbody>
                {data.recentActivity?.map((log: any) => (
                  <tr key={log.id}>
                    <td><span className="badge badge-info">{log.action}</span></td>
                    <td>{log.entityType}: <span className="text-muted">{log.description?.slice(0, 60)}</span></td>
                    <td>{log.user?.name || log.user?.email || '—'}</td>
                    <td className="text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 7. VIEWER VIEW
  // ============================================================
  if (data.role === 'VIEWER') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">Project & BOQ Viewer (Read-Only)</div>
            <div className="page-subtitle">Auditor & Stakeholder Observation View</div>
          </div>
          <span className="badge badge-draft" style={{ fontSize: 13, padding: '6px 12px' }}>Role: VIEWER (Read-Only)</span>
        </div>

        <div className="alert alert-info mb-6" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Lock size={20} style={{ color: '#475569', flexShrink: 0 }} />
          <div>
            <strong>Restricted Access Mode:</strong> Your account has read-only observation permissions. Creating projects, editing lines, uploading BOQs, and approvals are disabled.
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Permitted Projects ({data.totalProjects ?? 0})</span></div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Sector</th>
                  <th>Status</th>
                  <th>Latest BOQ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.projects?.map((p: any) => {
                  const latestRev = p.boqs?.[0]?.revisions?.[0];
                  return (
                    <tr key={p.id}>
                      <td className="font-mono font-bold">{p.projectCode}</td>
                      <td>{p.name}</td>
                      <td><span className="badge badge-info">{p.sector}</span></td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>{latestRev ? `${latestRev.revisionCode} (${latestRev.totalLines} lines)` : 'No BOQ'}</td>
                      <td>
                        <Link href={`/projects/${p.id}`} className="btn btn-sm btn-secondary">View Project →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 8. PROJECT_USER VIEW (Default Procurement Transaction Dashboard)
  // ============================================================
  return (
    <div className="page-content">
      <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
        <div>
          <div className="page-title">Procurement Transaction Dashboard</div>
          <div className="page-subtitle">Live BOQ Transaction Ledger, Approval Queue & Budget Baseline</div>
        </div>
        <Link href="/boq/studio" className="btn btn-primary">+ Create BOQ</Link>
      </div>

      {/* Role-based Pending Actions Alert (if any require attention) */}
      {data.pendingActions && data.pendingActions.length > 0 && (
        <div
          className="mb-6"
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '14px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={18} color="#d97706" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
              Pending Actions Requiring Your Attention ({data.pendingActions.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.pendingActions.slice(0, 3).map((act: any) => (
              <div
                key={act.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #fef3c7',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="font-mono font-bold" style={{ color: '#1e40af' }}>{act.boqCode}</span>
                  <span style={{ color: '#334155', fontWeight: 600 }}>{act.title}</span>
                  <StatusBadge status={act.status} />
                  <span style={{ color: '#64748b' }}>— {act.actionText}</span>
                </div>
                <Link href={act.link} className="btn btn-sm btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }}>
                  Action Now →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 Summary Cards */}
      <div
        className="kpi-grid mb-6"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Total BOQs Raised */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #2563eb' }}>
          <div className="kpi-label">Total BOQs Raised</div>
          <div className="kpi-value" style={{ color: '#2563eb' }}>
            {data.totalBoqsRaised ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            All BOQs in repository
          </div>
        </div>

        {/* Card 2: BOQs Pending Approval */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
          <div className="kpi-label">BOQs Pending Approval</div>
          <div className="kpi-value" style={{ color: '#d97706' }}>
            {data.boqsPendingApproval ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Submitted & in review
          </div>
        </div>

        {/* Card 3: Approved BOQs */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
          <div className="kpi-label">Approved BOQs</div>
          <div className="kpi-value" style={{ color: '#059669' }}>
            {data.approvedBoqs ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Ready for PR / budget
          </div>
        </div>

        {/* Card 4: BOQs Requiring Action */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #dc2626' }}>
          <div className="kpi-label">BOQs Requiring Action</div>
          <div className="kpi-value" style={{ color: '#dc2626' }}>
            {data.boqsRequiringAction ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Draft & rejected BOQs
          </div>
        </div>

        {/* Card 5: Total Proposed Budget */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #6366f1' }}>
          <div className="kpi-label">Total Proposed Budget</div>
          <div className="kpi-value" style={{ color: '#6366f1', fontSize: 20 }}>
            ₹ {(data.totalProposedBudget ?? 0).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Total proposed value
          </div>
        </div>

        {/* Card 6: Total Approved Budget */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
          <div className="kpi-label">Total Approved Budget</div>
          <div className="kpi-value" style={{ color: '#059669', fontSize: 20 }}>
            ₹ {(data.totalApprovedBudget ?? 0).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Baselined approved Capex
          </div>
        </div>
      </div>

      {/* Recent BOQs Table (Max 5 records) */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} /> Recent BOQs
          </span>
          <Link href="/boq/studio" className="btn btn-sm btn-secondary">
            Open BOQ Studio →
          </Link>
        </div>

        {!data.recentBoqs || data.recentBoqs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText size={36} color="#94a3b8" strokeWidth={1.5} />
            </div>
            <div className="empty-title">No BOQs recorded yet</div>
            <div className="empty-desc">Create or upload a BOQ to start tracking procurement transactions.</div>
            <Link href="/boq/studio" className="btn btn-primary" style={{ marginTop: 16 }}>
              + Create BOQ
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>BOQ Number</th>
                  <th>BOQ Description</th>
                  <th style={{ width: 180 }}>Cost Centre</th>
                  <th style={{ width: 150 }}>Estimated Value</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 130 }}>Last Updated</th>
                  <th className="col-actions" style={{ width: 100, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBoqs.slice(0, 5).map((b: any) => (
                  <tr key={b.id}>
                    <td className="font-mono font-bold">
                      <Link href={`/boq/studio?boqId=${b.id}`} style={{ color: '#2563eb' }}>
                        {b.boqNumber}
                      </Link>
                    </td>
                    <td>
                      <div
                        style={{
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: b.boqDescription && b.boqDescription !== '—' ? '#0f172a' : '#94a3b8',
                        }}
                        title={b.boqDescription !== '—' ? b.boqDescription : undefined}
                      >
                        {b.boqDescription || '—'}
                      </div>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontSize: 12, color: '#475569' }}>
                        {b.costCentre || '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                      ₹ {(b.estimatedValue || 0).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {b.lastUpdated ? new Date(b.lastUpdated).toLocaleDateString() : '—'}
                    </td>
                    <td className="col-actions" style={{ textAlign: 'right' }}>
                      <Link
                        href={`/boq/studio?boqId=${b.id}`}
                        className="btn btn-sm btn-primary"
                        style={{ padding: '4px 12px', fontSize: 11 }}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
