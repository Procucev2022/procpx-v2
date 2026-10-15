'use client';
// src/app/(app)/approvals/boq-pr/page.tsx - PR Approvals Workspace for Project Approver
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  X,
  Eye,
  MessageSquare,
  HelpCircle,
  Send,
  Loader2,
  CheckSquare,
  RotateCcw,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';

export default function BoqPrApprovalPage() {
  const toast = useToast();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPr, setSelectedPr] = useState<any | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Chat / Enquiry Drawer state
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatPr, setChatPr] = useState<any | null>(null);
  const [isEnquiryMode, setIsEnquiryMode] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/approvals?type=PR');
      if (res.ok) {
        const data = await res.json();
        setQueue(data.prQueue || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (prId: string) => {
    setProcessing(true);
    setActionError('');
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
      toast.success('BOQ approved successfully.', selectedPr?.prNumber || prId, 'Released to Category Manager');
      setStatusMessage('BOQ approved successfully.');
      setReviewModalOpen(false);
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRevert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPr || !revertReason.trim()) return;
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch(`/api/pr/${selectedPr.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revertReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Revert failed');
      }
      setRevertModalOpen(false);
      setRevertReason('');
      setSelectedPr(null);
      setStatusMessage('✓ BOQ successfully returned to Project User for correction.');
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPr || !rejectReason.trim()) return;
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch(`/api/pr/${selectedPr.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Rejection failed');
      }
      setRejectModalOpen(false);
      setRejectReason('');
      setSelectedPr(null);
      setStatusMessage('BOQ rejected and returned to requester with feedback remarks.');
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const openEnquiry = (pr: any) => {
    setChatPr(pr);
    setIsEnquiryMode(true);
    setChatDrawerOpen(true);
  };

  const openChat = (pr: any) => {
    setChatPr(pr);
    setIsEnquiryMode(false);
    setChatDrawerOpen(true);
  };

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e40af' }}>
              <CheckSquare size={20} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              BOQ Approvals
            </h1>
            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
              Project Approver Profile
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Commercial BOQs awaiting Project Approver decision. Independent of budget approval workflow.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/approvals/budget" className="btn btn-secondary">
            Switch to Budget Approvals
          </Link>
        </div>
      </div>

      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>✕</button>
        </div>
      )}

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>✕</button>
        </div>
      )}

      {/* BOQ Table */}
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
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Requester</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>BOQ Date</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  Loading BOQ approvals queue...
                </td>
              </tr>
            ) : queue.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  No BOQs awaiting Project Approver decision.
                </td>
              </tr>
            ) : (
              queue.map(pr => (
                <tr key={pr.id} style={{ borderBottom: '1px solid #f1f5f9', height: 56 }}>
                  <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                    <div>{pr.prNumber}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{pr.boq?.boqCode || ''}</div>
                  </td>
                  <td style={{ padding: '0 16px', fontWeight: 600, color: '#0f172a' }}>
                    <div>{pr.title}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{pr.totalLines || 0} line items</div>
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
                  <td style={{ padding: '0 16px', color: '#334155' }}>
                    <div style={{ fontWeight: 600 }}>{pr.requesterName || pr.requestedBy}</div>
                    {pr.requesterEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{pr.requesterEmail}</div>}
                  </td>
                  <td style={{ padding: '0 16px', color: '#64748b', fontSize: 12 }}>
                    {new Date(pr.requestedDate || pr.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td style={{ padding: '0 16px' }}>
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
                  <td style={{ padding: '0 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        title="Review complete BOQ details and line items"
                        onClick={() => {
                          setSelectedPr(pr);
                          setReviewModalOpen(true);
                        }}
                      >
                        <Eye size={12} /> Review BOQ
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                        title="Send query or clarification to submitter"
                        onClick={() => openEnquiry(pr)}
                      >
                        <HelpCircle size={12} /> Message
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
                        title="Open communication and chat history"
                        onClick={() => openChat(pr)}
                      >
                        <MessageSquare size={12} /> Chat
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                        title="Revert BOQ to Project User for correction"
                        onClick={() => {
                          setSelectedPr(pr);
                          setRevertModalOpen(true);
                        }}
                        disabled={processing}
                      >
                        <RotateCcw size={12} /> Revert
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ height: 28, padding: '0 10px', fontSize: 11, background: '#047857', borderColor: '#047857' }}
                        onClick={() => handleApprove(pr.id)}
                        disabled={processing}
                        title="Approve BOQ and release to Category Manager"
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                        onClick={() => {
                          setSelectedPr(pr);
                          setRejectModalOpen(true);
                        }}
                        disabled={processing}
                        title="Reject BOQ with mandatory reason"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* REVIEW PR MODAL */}
      {reviewModalOpen && selectedPr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 780, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  BOQ Details: {selectedPr.prNumber}
                </h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedPr.title} • Cost Centre: {selectedPr.costCentre?.code} ({selectedPr.costCentre?.name})
                </div>
              </div>
              <button type="button" onClick={() => setReviewModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            {/* PR Metadata Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Source BOQ</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{selectedPr.boq?.boqCode} ({selectedPr.boqRevision?.revisionCode || 'R0'})</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Requester</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{selectedPr.requesterName || selectedPr.requestedBy}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Total Line Items</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{selectedPr.lines?.length || 0} Lines</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Requested Value</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>₹ {(selectedPr.totalEstimatedValue || 0).toLocaleString('en-IN')}</div>
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
                  {(selectedPr.lines || []).map((line: any, idx: number) => (
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
                    setReviewModalOpen(false);
                    openEnquiry(selectedPr);
                  }}
                >
                  <HelpCircle size={13} /> Ask Clarification
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setReviewModalOpen(false);
                    openChat(selectedPr);
                  }}
                >
                  <MessageSquare size={13} /> Chat with Requester
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReviewModalOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                  onClick={() => {
                    setReviewModalOpen(false);
                    setRevertModalOpen(true);
                  }}
                  disabled={processing}
                >
                  <RotateCcw size={14} /> Revert for Correction
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                  onClick={() => {
                    setReviewModalOpen(false);
                    setRejectModalOpen(true);
                  }}
                  disabled={processing}
                >
                  <XCircle size={14} /> Reject BOQ
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#047857', borderColor: '#047857' }}
                  onClick={() => handleApprove(selectedPr.id)}
                  disabled={processing}
                >
                  <CheckCircle2 size={14} /> Approve & Release to Procurement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVERT MODAL */}
      {revertModalOpen && selectedPr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#b45309' }}>
              <RotateCcw size={20} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Revert BOQ for Correction
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>
              Specify the correction instructions for <strong>{selectedPr.prNumber}</strong> ({selectedPr.title}). The BOQ will be returned to the submitting Project User with these feedback remarks.
            </p>

            <form onSubmit={handleRevert}>
              <textarea
                value={revertReason}
                onChange={e => setRevertReason(e.target.value)}
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
                    setRevertModalOpen(false);
                    setRevertReason('');
                  }}
                  disabled={processing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#b45309', borderColor: '#b45309' }}
                  disabled={processing || !revertReason.trim()}
                >
                  {processing ? 'Reverting...' : 'Confirm Revert for Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && selectedPr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>
              Reject Purchase Request
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>
              Please state the specific reason for rejecting <strong>{selectedPr.prNumber}</strong>. The request will be returned to the requester with these feedback remarks.
            </p>

            <form onSubmit={handleReject}>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
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
                    setRejectModalOpen(false);
                    setRejectReason('');
                  }}
                  disabled={processing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#dc2626', borderColor: '#dc2626' }}
                  disabled={processing || !rejectReason.trim()}
                >
                  {processing ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHAT / ENQUIRY DRAWER */}
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
          initialEnquiryMode={isEnquiryMode}
          onMessageSent={loadQueue}
        />
      )}
    </div>
  );
}
