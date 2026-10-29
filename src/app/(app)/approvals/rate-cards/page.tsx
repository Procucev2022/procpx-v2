'use client';
// src/app/(app)/approvals/rate-cards/page.tsx
// Two-Level Rate Card Approval Queue (Level 1: Project Approver -> Level 2: Finance Approver)
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Building2,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Check,
  Send,
  Eye,
  Layers,
  Scale,
  Sparkles,
  History,
  ShieldCheck,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import Section6ApproverView from '@/components/rate-cards/Section6ApproverView';
import Section7FinalisedDetails from '@/components/rate-cards/Section7FinalisedDetails';

export default function RateCardApprovalsPage() {
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQueueTab, setActiveQueueTab] = useState<'ALL_PENDING' | 'LEVEL_1' | 'LEVEL_2' | 'CONCLUDED'>('ALL_PENDING');

  // Review Modal state
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Return & Reject modals
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Message / Clarification
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Feedback alerts
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [userRole, setUserRole] = useState<'PROJECT_APPROVER' | 'FINANCE_APPROVER'>('PROJECT_APPROVER');

  useEffect(() => {
    fetchRateCards();
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        const role = res?.user?.role || res?.data?.user?.role;
        if (role && (role.toUpperCase().includes('FINANCE') || role === 'FINANCE_HEAD' || role === 'FINANCE_USER')) {
          setUserRole('FINANCE_APPROVER');
        }
      })
      .catch(() => {});
  }, []);

  const fetchRateCards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/rate-cards');
      const data = await res.json();
      if (data.rateCards) {
        setRateCards(data.rateCards);
      }
    } catch (err) {
      console.error('Error fetching rate cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReview = (rc: any) => {
    setSelectedCard(rc);
    setShowReviewModal(true);
    setActionReason('');
    setMessageText('');
  };

  const handleApprove = async () => {
    if (!selectedCard) return;
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: actionReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve Rate Card');

      setMsg({ text: data.message || 'Rate Card approved successfully!', type: 'success' });
      setShowReviewModal(false);
      fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReturnForCorrection = async () => {
    if (!selectedCard) return;
    if (!actionReason.trim()) {
      setMsg({ text: 'Remarks / Reason for return is mandatory', type: 'error' });
      return;
    }
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to return Rate Card');

      setMsg({ text: data.message || 'Rate Card returned for correction with remarks recorded.', type: 'success' });
      setShowReturnModal(false);
      setShowReviewModal(false);
      fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCard) return;
    if (!actionReason.trim()) {
      setMsg({ text: 'Rejection reason / remarks is mandatory', type: 'error' });
      return;
    }
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject Rate Card');

      setMsg({ text: data.message || 'Rate Card rejected with reason recorded.', type: 'success' });
      setShowRejectModal(false);
      setShowReviewModal(false);
      fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedCard || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedCard.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');

      // Update local card approvals
      const updatedApprovals = [data.approvalEntry, ...(selectedCard.approvals || [])];
      setSelectedCard({ ...selectedCard, approvals: updatedApprovals });
      setMessageText('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Filter queue items
  const filteredQueue = rateCards.filter((rc) => {
    if (activeQueueTab === 'ALL_PENDING') {
      return rc.status === 'PENDING_PROJECT_APPROVAL' || rc.status === 'PENDING_FINANCE_APPROVAL';
    }
    if (activeQueueTab === 'LEVEL_1') {
      return rc.status === 'PENDING_PROJECT_APPROVAL';
    }
    if (activeQueueTab === 'LEVEL_2') {
      return rc.status === 'PENDING_FINANCE_APPROVAL';
    }
    if (activeQueueTab === 'CONCLUDED') {
      return rc.status === 'APPROVED' || rc.status === 'RETURNED_FOR_CORRECTION' || rc.status === 'REJECTED';
    }
    return true;
  });

  const level1Count = rateCards.filter((rc) => rc.status === 'PENDING_PROJECT_APPROVAL').length;
  const level2Count = rateCards.filter((rc) => rc.status === 'PENDING_FINANCE_APPROVAL').length;
  const totalPending = level1Count + level2Count;

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      <PageHeader
        title="Rate Card Approvals Queue"
        subtitle="Mandatory Two-Level Governance: Level 1 (Project Approver) → Level 2 (Finance Approver) → Active Rate Card"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Approvals', href: '/approvals' },
          { label: 'Rate Cards' },
        ]}
        badge={
          <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={13} /> {totalPending} Pending Approval
          </span>
        }
        actions={
          <Link href="/procurement/rate-cards" className="btn btn-secondary btn-sm">
            ← Rate Card Register
          </Link>
        }
      />

      {msg && (
        <div
          className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}
          style={{
            padding: '12px 16px',
            borderRadius: 6,
            background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${msg.type === 'success' ? '#86efac' : '#fca5a5'}`,
            marginBottom: 20,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Stepper info banner */}
      <div
        className="card mb-4"
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          padding: '14px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                background: '#2563eb',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              1
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a' }}>
                Level 1: Project Approver Review
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Validates item descriptions, standard BOQ taxonomy, operational scope, and unit rates
              </div>
            </div>
          </div>

          <div style={{ fontSize: 18, color: '#94a3b8' }}>→</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                background: '#7c3aed',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              2
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>
                Level 2: Finance Approver Review
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Verifies commercial terms, payment milestones, volume discounts, and market parity
              </div>
            </div>
          </div>

          <div style={{ fontSize: 18, color: '#94a3b8' }}>→</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                background: '#10b981',
                color: '#ffffff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>
                Active Rate Card
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Active in RFQ comparison & eligible for direct rate-card PPOs
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── APPROVED SECTION 6: RATE CARD APPROVAL (PROJECT & FINANCE APPROVER VIEW) ── */}
      <div style={{ marginBottom: 24 }}>
        <Section6ApproverView
          role={userRole}
          rateCardId="RC-2026-0006"
          vendorName="Ramakrishna Interiors"
          category="Interior Works"
          vendorAcceptanceDate="24 Oct 2026"
          projectApproved={userRole === 'FINANCE_APPROVER'}
          onApproveProject={(comments) => {
            setMsg({ text: 'Level 1 Project Approval completed! Routed to Level 2 Finance Approver.', type: 'success' });
          }}
          onApproveFinance={(comments) => {
            setMsg({ text: 'Level 2 Finance Approval completed! Rate Card RC-2026-0006 is now Active.', type: 'success' });
          }}
          onReject={(comments) => {
            setMsg({ text: 'Rate Card rejected with remarks.', type: 'error' });
          }}
        />
      </div>

      {/* ── APPROVED SECTION 7: FINALISED RATE CARD DETAILS (READ ONLY) ── */}
      <div style={{ marginBottom: 24 }}>
        <Section7FinalisedDetails
          rateCardId="RC-2026-0006"
          vendorName="Ramakrishna Interiors"
          category="Interior Works"
        />
      </div>

      {/* Tabs */}
      <Card noPadding>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
          {[
            { key: 'ALL_PENDING', label: `All Pending (${totalPending})` },
            { key: 'LEVEL_1', label: `Level 1: Project Approver Queue (${level1Count})` },
            { key: 'LEVEL_2', label: `Level 2: Finance Approver Queue (${level2Count})` },
            { key: 'CONCLUDED', label: 'History & Concluded' },
          ].map((tab: any) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveQueueTab(tab.key)}
              className={`btn btn-sm ${activeQueueTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Requests Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            className="table enterprise-table"
            style={{ width: '100%', minWidth: 1070, fontSize: 12, tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: 175 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 75 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: 175, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Rate Card Ref</th>
                <th style={{ width: 180, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Vendor</th>
                <th style={{ width: 200, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Category / Scope</th>
                <th style={{ width: 75, textAlign: 'right', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Items</th>
                <th style={{ width: 160, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Submitted By / Date</th>
                <th style={{ width: 160, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Approval Stage</th>
                <th style={{ width: 120, textAlign: 'center', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    Loading Approvals Queue...
                  </td>
                </tr>
              ) : filteredQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    No Rate Cards currently awaiting approval in this queue.
                  </td>
                </tr>
              ) : (
                filteredQueue.map((rc) => (
                  <tr key={rc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ width: 175, overflow: 'hidden' }}>
                      <div className="font-mono font-bold text-primary" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.rateCardNumber}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        Version {rc.version || 'v1.0'}
                      </div>
                    </td>

                    <td style={{ width: 180, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.vendor?.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        {rc.vendor?.code} • {rc.vendor?.complianceStatus}
                      </div>
                    </td>

                    <td style={{ width: 200, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.category}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.scope || 'Supply & Install'} • {rc.location || 'All India'}
                      </div>
                    </td>

                    <td style={{ width: 75, textAlign: 'right', fontWeight: 600 }}>
                      {rc.items?.length || 0}
                    </td>

                    <td style={{ width: 160, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rc.submittedBy || 'Category Manager'}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        {rc.submittedAt ? new Date(rc.submittedAt).toLocaleString() : new Date(rc.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    <td style={{ width: 160 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <StatusBadge status={rc.status} />
                        {rc.status === 'PENDING_PROJECT_APPROVAL' && (
                          <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>
                            Awaiting Level 1 Review
                          </span>
                        )}
                        {rc.status === 'PENDING_FINANCE_APPROVAL' && (
                          <span style={{ fontSize: 10, color: '#6d28d9', fontWeight: 600 }}>
                            Project Approved → Awaiting Finance
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ width: 120, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenReview(rc)}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: 11, height: 32, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Eye size={13} />
                        <span>Review</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ============================================================ */}
      {/* COMPLETE APPROVAL REVIEW MODAL (Requirement 7)               */}
      {/* ============================================================ */}
      {showReviewModal && selectedCard && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div
            className="modal-content"
            style={{
              background: '#ffffff',
              borderRadius: 8,
              width: '100%',
              maxWidth: 1100,
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="font-mono font-bold text-primary" style={{ fontSize: 16 }}>
                    {selectedCard.rateCardNumber}
                  </span>
                  <span className="badge badge-info">{selectedCard.version || 'v1.0'}</span>
                  <StatusBadge status={selectedCard.status} />
                  {selectedCard.status === 'PENDING_PROJECT_APPROVAL' && (
                    <span className="badge badge-submitted">Level 1 (Project Approver Queue)</span>
                  )}
                  {selectedCard.status === 'PENDING_FINANCE_APPROVAL' && (
                    <span className="badge badge-approved" style={{ background: '#ede9fe', color: '#5b21b6' }}>
                      Level 2 (Finance Approver Queue)
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 0', color: '#0f172a' }}>
                  {selectedCard.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Submission & Approver Receipt Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, background: '#f1f5f9', padding: 14, borderRadius: 6, fontSize: 12 }}>
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Vendor Details</span>
                  <div style={{ fontWeight: 700 }}>{selectedCard.vendor?.name}</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    Code: {selectedCard.vendor?.code} | {selectedCard.vendor?.complianceStatus}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Submission Info</span>
                  <div style={{ fontWeight: 600 }}>{selectedCard.submittedBy || 'Category Manager'}</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    Submitted: {selectedCard.submittedAt ? new Date(selectedCard.submittedAt).toLocaleString() : '—'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Scope & Validity</span>
                  <div style={{ fontWeight: 600 }}>{selectedCard.category} ({selectedCard.scope})</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    Valid: {new Date(selectedCard.validFrom).toLocaleDateString()} — {new Date(selectedCard.validTo).toLocaleDateString()}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Project Approval</span>
                  <div style={{ fontWeight: 600 }}>
                    {selectedCard.projectApprovedBy ? `✓ ${selectedCard.projectApprovedBy}` : 'Pending L1 Sign-off'}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    {selectedCard.projectApprovedAt ? new Date(selectedCard.projectApprovedAt).toLocaleDateString() : 'Awaiting'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Formal Agreement Status</span>
                  {selectedCard.agreement && selectedCard.agreement.type !== 'NONE' ? (
                    <div>
                      <div style={{ fontWeight: 600, color: selectedCard.agreement.signature?.verified ? '#047857' : '#b45309' }}>
                        {selectedCard.agreement.signature?.verified
                          ? `✓ Signed by ${selectedCard.agreement.signature.signedBy}`
                          : '⚠️ Awaiting Mandatory Signature'}
                      </div>
                      <div style={{ fontSize: 11, color: '#475569' }}>
                        {selectedCard.agreement.documentTitle || 'Master Rate Agreement'}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 600, color: '#475569' }}>Direct Schedule</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>No formal agreement required</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Complete Item-wise Comparison Table (Requirement 7) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Scale size={15} color="#2563eb" /> Item-wise Commercial Comparison Matrix ({selectedCard.items?.length || 0} Items)
                  </h4>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Rates benchmarked against Standard BOQ Library and Historical Procurement Records
                  </span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                  <table
                    className="table enterprise-table"
                    style={{ width: '100%', minWidth: 965, fontSize: 11, tableLayout: 'fixed' }}
                  >
                    <colgroup>
                      <col style={{ width: 50 }} />
                      <col style={{ width: 220 }} />
                      <col style={{ width: 65 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 125 }} />
                      <col style={{ width: 125 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 160 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ width: 50 }}>S.No.</th>
                        <th style={{ width: 220, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Item Description</th>
                        <th style={{ width: 65, textAlign: 'center' }}>UOM</th>
                        <th style={{ width: 120, textAlign: 'right', background: '#ecfdf5', color: '#166534', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                          Proposed Rate (₹)
                        </th>
                        <th style={{ width: 125, textAlign: 'right', background: '#eff6ff', color: '#1e40af', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                          Benchmark Rate (₹)
                        </th>
                        <th style={{ width: 125, textAlign: 'right', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Historical PPO Rate</th>
                        <th style={{ width: 100, textAlign: 'right' }}>Variance</th>
                        <th style={{ width: 160, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Comparison Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCard.items?.map((it: any, i: number) => {
                        const diff = it.benchmarkRate ? it.benchmarkRate - it.rate : 0;
                        const diffPercent = it.benchmarkRate ? Math.round((diff / it.benchmarkRate) * 100) : 0;

                        return (
                          <tr key={it.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ width: 50 }} className="text-muted">{i + 1}</td>
                            <td style={{ width: 220, overflow: 'hidden' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.description}</div>
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {it.specification || 'Standard specification compliant'}
                              </div>
                            </td>
                            <td style={{ width: 65, textAlign: 'center' }}><span className="badge badge-draft">{it.uom}</span></td>
                            <td style={{ width: 120, textAlign: 'right', background: '#ecfdf5', fontWeight: 700, color: '#047857', whiteSpace: 'nowrap' }}>
                              ₹ {it.rate?.toLocaleString()}
                            </td>
                            <td style={{ width: 125, textAlign: 'right', background: '#eff6ff', fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>
                              {it.benchmarkRate ? `₹ ${it.benchmarkRate?.toLocaleString()}` : '—'}
                            </td>
                            <td style={{ width: 125, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {it.historicalRate ? `₹ ${it.historicalRate?.toLocaleString()}` : '—'}
                            </td>
                            <td style={{ width: 100, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {it.benchmarkRate ? (
                                <span className={`badge ${diff >= 0 ? 'badge-approved' : 'badge-rejected'}`} style={{ fontSize: 10 }}>
                                  {diff >= 0 ? `▲ ${diffPercent}%` : `▼ ${Math.abs(diffPercent)}%`}
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td style={{ width: 160, fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {it.comparisonRef || 'Category Manager baseline validation'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Commercial Terms & Justification */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    Commercial Terms & Validity
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    {selectedCard.terms || 'Standard 30 days payment terms from invoice certification.'}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    Supporting Justification
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    {selectedCard.justification || 'Rates negotiated based on volume commitment and category historical benchmarks.'}
                  </div>
                </div>
              </div>

              {/* Conversation & Clarification Thread */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 14, background: '#ffffff' }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={14} color="#2563eb" /> Conversation & Clarification Thread
                </h4>

                {/* Message input */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="Ask clarification or enter enquiry remarks..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="input input-sm"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    className="btn btn-secondary btn-sm"
                    disabled={sendingMessage || !messageText.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Send size={12} /> Post Message
                  </button>
                </div>

                {/* Messages / Approvals History */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {!selectedCard.approvals?.length ? (
                    <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                      No messages or previous decisions recorded yet.
                    </div>
                  ) : (
                    selectedCard.approvals.map((app: any) => (
                      <div
                        key={app.id}
                        style={{
                          background: app.action === 'CLARIFICATION_MESSAGE' ? '#eff6ff' : '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 4,
                          padding: '6px 10px',
                          fontSize: 11,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{app.approverName}</span>
                          <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 9 }}>{app.action}</span>
                          <div style={{ color: '#334155', marginTop: 2 }}>{app.remarks}</div>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>
                          {new Date(app.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Requires remarks if returning for correction or rejecting
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowReturnModal(true)}
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#b45309', borderColor: '#fde68a', background: '#fef3c7' }}
                  disabled={processing}
                >
                  <RotateCcw size={13} style={{ marginRight: 4 }} /> Return for Correction
                </button>

                <button
                  type="button"
                  onClick={() => setShowRejectModal(true)}
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#b91c1c', borderColor: '#fca5a5', background: '#fee2e2' }}
                  disabled={processing}
                >
                  <XCircle size={13} style={{ marginRight: 4 }} /> Reject Rate Card
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#16a34a', borderColor: '#15803d', fontWeight: 600 }}
                  disabled={processing}
                >
                  <CheckCircle2 size={13} style={{ marginRight: 4 }} />
                  {selectedCard.status === 'PENDING_PROJECT_APPROVAL'
                    ? 'Approve Level 1 (Forward to Finance)'
                    : 'Approve Level 2 (Activate Rate Card)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return for Correction Modal */}
      {showReturnModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
          <div className="modal-content" style={{ background: '#ffffff', borderRadius: 8, width: 480, padding: 20 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#92400e' }}>
              Return Rate Card for Correction
            </h4>
            <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 12px' }}>
              Specify the required modifications or clarifications. The Category Manager will be notified to revise and resubmit.
            </p>
            <textarea
              rows={4}
              placeholder="Mandatory remarks for correction..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="input input-sm"
              style={{ width: '100%', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="btn btn-secondary btn-sm"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReturnForCorrection}
                className="btn btn-primary btn-sm"
                style={{ background: '#d97706', borderColor: '#b45309' }}
                disabled={processing || !actionReason.trim()}
              >
                Confirm Return for Correction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
          <div className="modal-content" style={{ background: '#ffffff', borderRadius: 8, width: 480, padding: 20 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#b91c1c' }}>
              Reject Rate Card
            </h4>
            <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 12px' }}>
              Enter the mandatory rejection reason. This decision will be logged permanently in the audit history.
            </p>
            <textarea
              rows={4}
              placeholder="Mandatory rejection reason..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="input input-sm"
              style={{ width: '100%', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="btn btn-secondary btn-sm"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="btn btn-primary btn-sm"
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                disabled={processing || !actionReason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
