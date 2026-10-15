'use client';
// src/app/(app)/pr/page.tsx - Procurement Requests (My PRs) Workspace
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Send,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Layers,
  Building2,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';

export default function MyPrsPage() {
  const toast = useToast();
  const [prs, setPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatPr, setChatPr] = useState<any | null>(null);

  useEffect(() => {
    loadPrs();
  }, [statusFilter]);

  const loadPrs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pr${statusFilter ? `?status=${statusFilter}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setPrs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (prId: string) => {
    try {
      const res = await fetch(`/api/pr/${prId}/submit`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit BOQ');
      }
      toast.success('BOQ submitted successfully.', prId, 'Awaiting Project Approver');
      setStatusMessage('BOQ submitted successfully.');
      loadPrs();
    } catch (err: any) {
      toast.error(err.message || 'Error submitting BOQ');
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const filtered = prs.filter(pr => {
    if (search) {
      const q = search.toLowerCase();
      return (
        pr.prNumber.toLowerCase().includes(q) ||
        pr.title.toLowerCase().includes(q) ||
        (pr.project?.name && pr.project.name.toLowerCase().includes(q)) ||
        (pr.costCentre?.name && pr.costCentre.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PR_RELEASED_TO_PROCUREMENT':
        return { label: 'Released to Sourcing', bg: '#ecfdf5', color: '#047857', icon: CheckCircle2 };
      case 'PR_APPROVED':
        return { label: 'Project Approved', bg: '#ecfdf5', color: '#047857', icon: CheckCircle2 };
      case 'PR_PENDING_PROJECT_APPROVAL':
        return { label: 'Pending Approval', bg: '#fffbeb', color: '#b45309', icon: Clock };
      case 'PR_RETURNED_FOR_CORRECTION':
        return { label: 'Returned for Correction', bg: '#fff7ed', color: '#b45309', icon: RotateCcw };
      case 'PR_REJECTED':
        return { label: 'Rejected', bg: '#fef2f2', color: '#b91c1c', icon: AlertTriangle };
      default:
        return { label: 'Draft', bg: '#f1f5f9', color: '#475569', icon: Clock };
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e40af' }}>
              <FileSpreadsheet size={20} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              My BOQs
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Commercial BOQs created by Project Users, submitted for Project Approver validation and released to Category Manager.
          </p>
        </div>

        <Link href="/boq/studio" className="btn btn-primary" style={{ gap: 8 }}>
          <Plus size={16} /> BOQ Creation
        </Link>
      </div>

      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search BOQ Number, description, project or cost centre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 38, height: 40, width: '100%' }}
          />
        </div>

        <select
          className="select-field"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ height: 40, minWidth: 220 }}
        >
          <option value="">All Statuses</option>
          <option value="PR_DRAFT">Draft</option>
          <option value="PR_PENDING_PROJECT_APPROVAL">Pending Approval</option>
          <option value="PR_RETURNED_FOR_CORRECTION">Returned for Correction</option>
          <option value="PR_APPROVED">Project Approved</option>
          <option value="PR_RELEASED_TO_PROCUREMENT">Released to Procurement</option>
          <option value="PR_REJECTED">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>BOQ Code / ID</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>BOQ Name / Description</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Project</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Cost Centre</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Category</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>BOQ Date</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  Loading BOQs...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  No BOQs found.
                </td>
              </tr>
            ) : (
              filtered.map(pr => {
                const badge = getStatusBadge(pr.status);
                const BadgeIcon = badge.icon;
                const boqDate = pr.requestedDate || pr.createdAt;
                return (
                  <tr key={pr.id} style={{ borderBottom: '1px solid #f1f5f9', height: 52 }}>
                    <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                      <div>{pr.prNumber}</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{pr.boq?.boqCode || ''}</div>
                    </td>
                    <td style={{ padding: '0 16px', fontWeight: 600, color: '#0f172a' }}>
                      <div>{pr.title}</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                        {pr.totalLines || 0} Line item(s)
                      </div>
                    </td>
                    <td style={{ padding: '0 16px', color: '#334155' }}>
                      <div style={{ fontWeight: 500 }}>{pr.project?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{pr.project?.projectCode}</div>
                    </td>
                    <td style={{ padding: '0 16px', color: '#0f172a' }}>
                      <div style={{ fontWeight: 600 }}>{pr.costCentre?.code}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{pr.costCentre?.name}</div>
                    </td>
                    <td style={{ padding: '0 16px' }}>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155', fontWeight: 500 }}>
                        {(pr.categories || []).join(', ') || 'Standard'}
                      </span>
                    </td>
                    <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                      ₹ {(pr.totalEstimatedValue || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '0 16px', color: '#475569', fontSize: 12 }}>
                      {boqDate ? new Date(boqDate).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '0 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: badge.bg,
                          color: badge.color,
                        }}
                      >
                        <BadgeIcon size={12} /> {badge.label}
                      </span>
                      {pr.rejectionReason && (pr.status === 'PR_RETURNED_FOR_CORRECTION' || pr.status === 'PR_REJECTED') && (
                        <div style={{ marginTop: 4, fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 6px', maxWidth: 220 }}>
                          <strong>Approver Note:</strong> {pr.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {(pr.status === 'PR_DRAFT' || pr.status === 'PR_RETURNED_FOR_CORRECTION') && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ height: 28, padding: '0 10px', fontSize: 11 }}
                            onClick={() => handleSubmit(pr.id)}
                            title={pr.status === 'PR_RETURNED_FOR_CORRECTION' ? 'Resubmit corrected BOQ for approval' : 'Submit BOQ for Project Approver review'}
                          >
                            <Send size={12} /> {pr.status === 'PR_RETURNED_FOR_CORRECTION' ? 'Resubmit BOQ' : 'Submit BOQ'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
                          onClick={() => {
                            setChatPr(pr);
                            setChatDrawerOpen(true);
                          }}
                          title="Open messages and communication history with approver"
                        >
                          <MessageSquare size={12} /> Chat
                        </button>
                        <Link
                          href={`/boq/studio?boqId=${pr.boqId}&projectId=${pr.projectId}&costCentreId=${pr.costCentreId}`}
                          className="btn btn-secondary btn-sm"
                          style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        >
                          <FileSpreadsheet size={12} /> BOQ Studio
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CHAT / COMMUNICATION DRAWER */}
      {chatPr && (
        <ApprovalChatDrawer
          isOpen={chatDrawerOpen}
          onClose={() => {
            setChatDrawerOpen(false);
            setChatPr(null);
          }}
          entityType="PR"
          entityId={chatPr.id}
          entityCode={chatPr.prNumber}
          title={chatPr.title}
          costCentre={chatPr.costCentre?.code}
          category={(chatPr.categories || []).join(', ')}
          amount={chatPr.totalEstimatedValue}
          initialEnquiryMode={false}
          onMessageSent={loadPrs}
        />
      )}
    </div>
  );
}
