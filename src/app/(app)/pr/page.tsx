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
  FileSpreadsheet,
  MessageSquare,
  RotateCcw,
  Layers,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

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
        throw new Error(err.error || 'Failed to submit PR');
      }
      toast.success('PR submitted successfully.', prId, 'Awaiting Project Approver');
      setStatusMessage('PR submitted successfully.');
      loadPrs();
    } catch (err: any) {
      toast.error(err.message || 'Error submitting PR');
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

  // Calculate stats
  const totalCount = prs.length;
  const releasedCount = prs.filter(p => p.status === 'PR_RELEASED_TO_PROCUREMENT').length;
  const pendingCount = prs.filter(p => p.status === 'PR_PENDING_PROJECT_APPROVAL').length;
  const draftOrReturnedCount = prs.filter(
    p => p.status === 'PR_DRAFT' || p.status === 'PR_RETURNED_FOR_CORRECTION'
  ).length;

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <PageHeader
        title="Procurement Requests"
        subtitle="Commercial PRs and project BOQs submitted for validation and released to sourcing"
        actions={
          <div className="flex gap-2">
            <Link href="/pr/new" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              + Create PR
            </Link>
            <Link href="/boq/studio" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> BOQ Studio
            </Link>
          </div>
        }
      />

      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>
            ✕
          </button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="mb-6">
        <SummaryCardGrid columns={4}>
          <SummaryCard
            label="Total PRs"
            value={totalCount}
            secondary="All procurement requests"
            icon={<FileSpreadsheet size={16} />}
            accent="default"
          />
          <SummaryCard
            label="Released to Sourcing"
            value={releasedCount}
            secondary="Available for RFQs"
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
          <SummaryCard
            label="Pending Approval"
            value={pendingCount}
            secondary="With Project Approver"
            icon={<Clock size={16} />}
            accent="amber"
          />
          <SummaryCard
            label="Draft / Corrections"
            value={draftOrReturnedCount}
            secondary="Requires action"
            icon={<RotateCcw size={16} />}
            accent="slate"
          />
        </SummaryCardGrid>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 flex gap-3 items-center flex-wrap">
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search PR Number, title, project or cost centre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 38, height: 40, width: '100%' }}
          />
        </div>

        <select
          className="form-control"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ height: 40, width: 220 }}
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

      {/* PR Register Table - adhering to Rule 9 */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, minWidth: 1000 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 140 }}>PR Number</th>
                <th style={{ padding: '0 16px', fontWeight: 600, minWidth: 220 }}>Package / Description</th>
                <th style={{ padding: '0 16px', fontWeight: 600, minWidth: 160 }}>Project & Cost Centre</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 90, textAlign: 'center' }}>Items</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 140, textAlign: 'right' }}>PR Amount</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 150, textAlign: 'center' }}>Approval Status</th>
                <th style={{ padding: '0 16px', fontWeight: 600, width: 180, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />
                    Loading Procurement Requests...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center' }}>
                    <EmptyState
                      icon={<FileSpreadsheet size={36} />}
                      title="No PRs found"
                      description={search || statusFilter ? 'Try clearing filters to find more records.' : 'Create a PR or derive one from a BOQ in BOQ Studio.'}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map(pr => {
                  return (
                    <tr key={pr.id} style={{ borderBottom: '1px solid #f1f5f9', height: 54 }}>
                      <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                        <div className="font-mono text-sm">{pr.prNumber}</div>
                        {pr.boq?.boqCode && (
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                            BOQ: {pr.boq.boqCode}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0 16px', fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pr.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                          {(pr.categories || []).join(', ') || 'General Capex'}
                        </div>
                      </td>
                      <td style={{ padding: '0 16px', color: '#334155' }}>
                        <div style={{ fontWeight: 500 }}>{pr.project?.name || '—'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {pr.costCentre?.code || pr.project?.projectCode || ''}
                        </div>
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'center' }}>
                        <span className="badge badge-info font-mono" style={{ fontSize: 12 }}>
                          {pr.totalLines || 0}
                        </span>
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#047857', fontSize: 13 }}>
                        ₹ {(pr.totalEstimatedValue || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'center' }}>
                        <StatusBadge status={pr.status} />
                        {pr.rejectionReason && (pr.status === 'PR_RETURNED_FOR_CORRECTION' || pr.status === 'PR_REJECTED') && (
                          <div style={{ marginTop: 4, fontSize: 10, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 4px' }}>
                            <strong>Note:</strong> {pr.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {(pr.status === 'PR_DRAFT' || pr.status === 'PR_RETURNED_FOR_CORRECTION') && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                              onClick={() => handleSubmit(pr.id)}
                              title={pr.status === 'PR_RETURNED_FOR_CORRECTION' ? 'Resubmit corrected PR for approval' : 'Submit PR for Project Approver review'}
                            >
                              <Send size={12} /> {pr.status === 'PR_RETURNED_FOR_CORRECTION' ? 'Resubmit' : 'Submit'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 32, padding: '0 8px', fontSize: 12, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
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
                            style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                          >
                            Details →
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
