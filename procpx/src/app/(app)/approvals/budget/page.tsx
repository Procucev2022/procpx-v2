'use client';
// src/app/(app)/approvals/budget/page.tsx - Budget Approvals Workspace for Project Approver
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Landmark,
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
  PieChart,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';

export default function BudgetApprovalQueuePage() {
  const toast = useToast();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContrib, setSelectedContrib] = useState<any | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Chat / Enquiry Drawer state
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatContrib, setChatContrib] = useState<any | null>(null);
  const [isEnquiryMode, setIsEnquiryMode] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/approvals?type=BUDGET');
      if (res.ok) {
        const data = await res.json();
        setQueue(data.budgetQueue || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (contribId: string) => {
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch('/api/budgets/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributionId: contribId, remarks: 'Technical scope and estimates approved at Project stage.' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Approval failed');
      }
      toast.success('Budget approved successfully.', selectedContrib?.category?.name, 'Under Finance Approval');
      setStatusMessage('Budget approved successfully.');
      setReviewModalOpen(false);
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContrib || !rejectReason.trim()) return;
    setProcessing(true);
    setActionError('');
    try {
      const res = await fetch('/api/budgets/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributionId: selectedContrib.id, reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Rejection failed');
      }
      setRejectModalOpen(false);
      setRejectReason('');
      setSelectedContrib(null);
      setStatusMessage('Budget contribution rejected with audit notes.');
      loadQueue();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const openEnquiry = (item: any) => {
    setChatContrib(item);
    setIsEnquiryMode(true);
    setChatDrawerOpen(true);
  };

  const openChat = (item: any) => {
    setChatContrib(item);
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
              <Landmark size={20} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Budget Approvals
            </h1>
            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
              Project Approver Profile
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Review category-wise budget contributions awaiting Project Approver approval. Project approval advances contributions to Finance Approval.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/approvals/boq-pr" className="btn btn-secondary">
            Switch to PR Approvals
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

      {/* Queue Table */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>BOQ Number</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>BOQ Description</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Cost Centre</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Category</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>Proposed Amount</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Submitted By</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Submission Date</th>
              <th style={{ padding: '0 16px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  Loading budget approvals queue...
                </td>
              </tr>
            ) : queue.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  No budget contributions currently awaiting Project Approver approval.
                </td>
              </tr>
            ) : (
              queue.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', height: 56 }}>
                  <td style={{ padding: '0 16px', fontWeight: 700, color: '#1e40af' }}>
                    <div>{item.boq?.boqCode || '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{item.boqRevision?.revisionCode || 'R0'}</div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#0f172a', maxWidth: 200 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.boq?.title || 'BOQ Fitout Scope'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {item.project?.name}
                    </div>
                  </td>
                  <td style={{ padding: '0 16px', color: '#0f172a' }}>
                    <div style={{ fontWeight: 600 }}>{item.costCentre?.code}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{item.costCentre?.name}</div>
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155', fontWeight: 500 }}>
                      {(item.categories || []).join(', ') || 'General'}
                    </span>
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                    ₹ {(item.totalEstimatedValue || 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '0 16px', color: '#334155' }}>
                    <div style={{ fontWeight: 600 }}>{item.submitterName || 'Project User'}</div>
                    {item.submitterEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{item.submitterEmail}</div>}
                  </td>
                  <td style={{ padding: '0 16px', color: '#64748b' }}>
                    {new Date(item.submittedAt || item.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <span className="badge badge-warning" style={{ fontSize: 11, padding: '3px 8px' }}>
                      Under Project Approval
                    </span>
                    {item.hasEnquiry && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                          Clarification Pending
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        title="Review BOQ line items and Cost Centre budget impact"
                        onClick={() => {
                          setSelectedContrib(item);
                          setReviewModalOpen(true);
                        }}
                      >
                        <Eye size={12} /> Review
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                        title="Request clarification from submitter"
                        onClick={() => openEnquiry(item)}
                      >
                        <HelpCircle size={12} /> Enquire
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        title="Open communication history"
                        onClick={() => openChat(item)}
                      >
                        <MessageSquare size={12} /> Chat
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ height: 28, padding: '0 10px', fontSize: 11, background: '#047857', borderColor: '#047857' }}
                        onClick={() => handleApprove(item.id)}
                        disabled={processing}
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#dc2626' }}
                        onClick={() => {
                          setSelectedContrib(item);
                          setRejectModalOpen(true);
                        }}
                        disabled={processing}
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

      {/* REVIEW BUDGET CONTRIBUTION MODAL */}
      {reviewModalOpen && selectedContrib && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 800, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Budget Review: {selectedContrib.boq?.boqCode} ({selectedContrib.boqRevision?.revisionCode || 'R0'})
                </h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedContrib.project?.name} • Cost Centre: {selectedContrib.costCentre?.code} ({selectedContrib.costCentre?.name})
                </div>
              </div>
              <button type="button" onClick={() => setReviewModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            {/* Cost Centre Budget Financial Impact Box */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Current Approved Budget</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  ₹ {(selectedContrib.financialImpact?.currentApprovedAmount || 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Existing Sanction</div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
                <div style={{ fontSize: 11, color: '#d97706', marginBottom: 2 }}>Proposed Contribution</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#d97706' }}>
                  + ₹ {(selectedContrib.totalEstimatedValue || 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Awaiting Approvals</div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
                <div style={{ fontSize: 11, color: '#047857', marginBottom: 2 }}>Projected Approved Total</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>
                  ₹ {(selectedContrib.financialImpact?.projectedApprovedTotal || selectedContrib.totalEstimatedValue).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Post-Finance Sanction</div>
              </div>
            </div>

            {/* Category Contributions */}
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: '0 0 8px 0' }}>
                Category-wise Allocation Breakdown
              </h4>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(selectedContrib.transactions || []).map((tx: any) => (
                  <div key={tx.id} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{tx.category}: </span>
                    <span style={{ color: '#047857', fontWeight: 700 }}>₹ {(tx.amount || 0).toLocaleString('en-IN')}</span>
                    {tx.quantity && <span style={{ color: '#64748b' }}> ({tx.quantity} {tx.uom})</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Line items detail table */}
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 16 }}>
              <table className="table" style={{ width: '100%', fontSize: 12 }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr style={{ height: 36, borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0 10px', width: 40 }}>#</th>
                    <th style={{ padding: '0 10px' }}>Description</th>
                    <th style={{ padding: '0 10px' }}>Category</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '0 10px' }}>UOM</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>Rate (₹)</th>
                    <th style={{ padding: '0 10px', textAlign: 'right' }}>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedContrib.boqRevision?.lines || []).map((line: any, idx: number) => (
                    <tr key={line.id || idx} style={{ borderBottom: '1px solid #f1f5f9', height: 38 }}>
                      <td style={{ padding: '0 10px', color: '#64748b' }}>{line.lineNumber || idx + 1}</td>
                      <td style={{ padding: '0 10px', fontWeight: 600, color: '#0f172a' }}>
                        {line.standardDescription || line.originalDescription}
                      </td>
                      <td style={{ padding: '0 10px', color: '#475569' }}>{line.category?.name || 'General'}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 600 }}>{line.quantity}</td>
                      <td style={{ padding: '0 10px', color: '#64748b' }}>{line.uomRaw || 'NOS'}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right' }}>{(line.aiUnitCost || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                        ₹ {(line.aiTotalCost || (line.quantity * (line.aiUnitCost || 0))).toLocaleString('en-IN')}
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
                    openEnquiry(selectedContrib);
                  }}
                >
                  <HelpCircle size={13} /> Ask Clarification
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setReviewModalOpen(false);
                    openChat(selectedContrib);
                  }}
                >
                  <MessageSquare size={13} /> Chat with Submitter
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
                  style={{ color: '#dc2626' }}
                  onClick={() => {
                    setReviewModalOpen(false);
                    setRejectModalOpen(true);
                  }}
                >
                  <XCircle size={14} /> Reject Contribution
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#047857', borderColor: '#047857' }}
                  onClick={() => handleApprove(selectedContrib.id)}
                  disabled={processing}
                >
                  <CheckCircle2 size={14} /> Approve & Route to Finance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && selectedContrib && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>
              Reject Budget Contribution
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>
              Please state the specific reason for rejecting the budget contribution for <strong>{selectedContrib.boq?.boqCode}</strong> against Cost Centre <strong>{selectedContrib.costCentre?.code}</strong>.
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
      {chatContrib && (
        <ApprovalChatDrawer
          isOpen={chatDrawerOpen}
          onClose={() => {
            setChatDrawerOpen(false);
            setChatContrib(null);
          }}
          entityType="BUDGET"
          entityId={chatContrib.id}
          entityCode={chatContrib.boq?.boqCode}
          title={chatContrib.boq?.title}
          costCentre={chatContrib.costCentre?.code}
          category={(chatContrib.categories || []).join(', ')}
          amount={chatContrib.totalEstimatedValue}
          initialEnquiryMode={isEnquiryMode}
          onMessageSent={loadQueue}
        />
      )}
    </div>
  );
}
