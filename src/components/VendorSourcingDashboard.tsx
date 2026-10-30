'use client';
// src/components/VendorSourcingDashboard.tsx
// Comprehensive Vendor Sourcing Dashboard, RFQ Register, Negotiation & PPO Acceptance Workspace
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Layers,
  Building2,
  Calendar,
  Send,
  RotateCcw,
  Receipt,
  XCircle,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  PackageCheck,
  FileCheck2,
  HelpCircle,
  Eye,
} from 'lucide-react';
import RfqChatDrawer from '@/components/RfqChatDrawer';
import VendorNegotiationWorkspace from '@/components/VendorNegotiationWorkspace';

interface VendorSourcingDashboardProps {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  isBuyer?: boolean;
}

export default function VendorSourcingDashboard({
  vendorId,
  vendorName,
  vendorCode,
  isBuyer,
}: VendorSourcingDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  // Full-window dedicated negotiation workspace state
  const [activeNegotiatingRfq, setActiveNegotiatingRfq] = useState<any | null>(null);

  // Modals & Drawers state
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatRfq, setChatRfq] = useState<any | null>(null);

  // PPO Acceptance Modal
  const [showAcceptPpoModal, setShowAcceptPpoModal] = useState(false);
  const [selectedPpo, setSelectedPpo] = useState<any | null>(null);
  const [signatoryName, setSignatoryName] = useState(vendorName + ' Authorized Signatory');
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [acceptRemarks, setAcceptRemarks] = useState('');
  const [submittingAcceptPpo, setSubmittingAcceptPpo] = useState(false);
  const [ppoSuccessMsg, setPpoSuccessMsg] = useState('');

  // PPO Raise Issue Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueRemarks, setIssueRemarks] = useState('');
  const [submittingIssue, setSubmittingIssue] = useState(false);

  // View Decision Modal
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionRfq, setDecisionRfq] = useState<any | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, [vendorId]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/procurement/vendors/${vendorId}/dashboard`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch vendor dashboard data');
      }
      setDashboardData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper to open Accept PPO modal
  const openAcceptPpoModal = (ppo: any) => {
    setSelectedPpo(ppo);
    setConfirmAccept(false);
    setAcceptRemarks('');
    setPpoSuccessMsg('');
    setShowAcceptPpoModal(true);
  };

  const handleAcceptPpo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPpo || !confirmAccept) return;
    setSubmittingAcceptPpo(true);

    try {
      const res = await fetch(`/api/procurement/ppos/${selectedPpo.id}/vendor-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedBy: signatoryName,
          vendorComments: acceptRemarks,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept PPO');

      setPpoSuccessMsg(`Purchase Order ${selectedPpo.ppoNumber} formally accepted! Status updated to PPO Accepted — Order Execution.`);
      await fetchDashboard();
      setTimeout(() => {
        setShowAcceptPpoModal(false);
      }, 1500);
    } catch (err: any) {
      alert(`Error accepting PPO: ${err.message}`);
    } finally {
      setSubmittingAcceptPpo(false);
    }
  };

  // Helper to open Raise Issue modal
  const openIssueModal = (ppo: any) => {
    setSelectedPpo(ppo);
    setIssueRemarks('');
    setShowIssueModal(true);
  };

  const handleRaiseIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPpo || !issueRemarks.trim()) return;
    setSubmittingIssue(true);

    try {
      const res = await fetch(`/api/procurement/ppos/${selectedPpo.id}/vendor-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueRemarks: issueRemarks.trim(),
          raisedBy: signatoryName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit clarification');

      alert(`Issue recorded and routed to buyer without accepting PPO.`);
      setShowIssueModal(false);
      await fetchDashboard();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmittingIssue(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <Clock className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
        <p className="text-sm">Loading persistent Vendor Dashboard & Sourcing records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8, color: '#991b1b' }}>
        <AlertTriangle className="w-5 h-5 mb-1 text-red-600" />
        <div className="font-semibold text-sm">Failed to load Vendor Dashboard</div>
        <div className="text-xs mt-1">{error}</div>
      </div>
    );
  }

  const counts = dashboardData?.counts || {};
  const rfqRegister = dashboardData?.rfqRegister || [];
  const ppos = dashboardData?.ppos || [];
  const rateCards = dashboardData?.rateCards || [];

  // ── DEDICATED FULL-WINDOW NEGOTIATION WORKSPACE ──
  if (activeNegotiatingRfq) {
    return (
      <VendorNegotiationWorkspace
        mode="RFQ"
        data={activeNegotiatingRfq}
        vendorId={vendorId}
        vendorName={vendorName}
        isBuyer={isBuyer}
        onBack={() => {
          setActiveNegotiatingRfq(null);
          fetchDashboard();
        }}
        onSuccess={() => {
          fetchDashboard();
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── 1. EIGHT ACTIONABLE SUMMARY KPI CARDS (Requirement E) ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers className="w-5 h-5 text-blue-600" />
            Vendor Sourcing & Order Fulfillment Pipeline
          </h2>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
            Persisted counts derived directly from production database records
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {/* 1. New RFQs */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">New RFQs</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">{counts.newRfqs || 0}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-500" /> Awaiting initial quotation
            </div>
          </div>

          {/* 2. Quotations Due Soon */}
          <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs bg-amber-50/30">
            <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Quotations Due Soon</div>
            <div className="text-2xl font-extrabold text-amber-900 mt-1 font-mono">{counts.quotesDueSoon || 0}</div>
            <div className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-600" /> Deadline within 72 hours
            </div>
          </div>

          {/* 3. Quotes Submitted */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quotes Submitted</div>
            <div className="text-2xl font-extrabold text-blue-600 mt-1 font-mono">{counts.quotesSubmitted || 0}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <FileCheck2 className="w-3 h-3 text-blue-500" /> Under technical evaluation
            </div>
          </div>

          {/* 4. Negotiations Awaiting Vendor */}
          <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-xs bg-indigo-50/30">
            <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">Negotiations Pending</div>
            <div className="text-2xl font-extrabold text-indigo-900 mt-1 font-mono">{counts.negotiationsAwaitingVendor || 0}</div>
            <div className="text-[11px] text-indigo-700 mt-1 flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-indigo-600" /> Counteroffer response required
            </div>
          </div>

          {/* 5. Final Offers Awaiting Buyer */}
          <div className="bg-white border border-purple-200 rounded-xl p-4 shadow-xs bg-purple-50/30">
            <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Final Offers Submitted</div>
            <div className="text-2xl font-extrabold text-purple-900 mt-1 font-mono">{counts.finalOffersAwaitingBuyer || 0}</div>
            <div className="text-[11px] text-purple-700 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-purple-600" /> Pending Buyer Decision
            </div>
          </div>

          {/* 6. Quotes Accepted — PPO Awaited */}
          <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-xs bg-emerald-50/30">
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Accepted — PPO Awaited</div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">{counts.quotesAcceptedPpoAwaited || 0}</div>
            <div className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600" /> Buyer accepted commercial offer
            </div>
          </div>

          {/* 7. PPOs Awaiting Vendor Acceptance */}
          <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-xs bg-blue-50/40">
            <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">PPOs Awaiting Acceptance</div>
            <div className="text-2xl font-extrabold text-blue-700 mt-1 font-mono">{counts.pposAwaitingAcceptance || 0}</div>
            <div className="text-[11px] text-blue-700 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-blue-600" /> Action required: Formal vendor sign-off
            </div>
          </div>

          {/* 8. Accepted PPOs */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Accepted PPOs (Active)</div>
            <div className="text-2xl font-extrabold text-emerald-800 mt-1 font-mono">{counts.acceptedPpos || 0}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Order execution & fulfillment
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. RFQ REGISTER WITH DATES, STATUSES & ACTIONS (Requirement A) ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              RFQ Register & Negotiation Status
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
              Invited sourcing events with persisted dates, buyer decisions, responsible party, and action triggers
            </p>
          </div>
          <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-semibold border border-slate-200">
            {rfqRegister.length} Invited RFQs
          </span>
        </div>

        <div
          className="table-responsive"
          style={{ width: '100%', overflowX: 'auto', border: 'none', borderRadius: 0 }}
          onWheel={(e) => {
            if (e.shiftKey && e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1480, width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {/* 1. RFQ Received Date */}
                <th style={{ width: 135 }}>RFQ Received Date</th>

                {/* 2. RFQ Reference */}
                <th style={{ width: 155 }}>RFQ Reference</th>

                {/* 3. Project / Package */}
                <th style={{ width: 180 }}>Project / Package</th>

                {/* 4. Buyer / Client */}
                <th style={{ width: 145 }}>Buyer / Client</th>

                {/* 5. Submission Deadline */}
                <th style={{ width: 135 }}>Submission Deadline</th>

                {/* 6. Commercial Summary */}
                <th style={{ width: 150, textAlign: 'right' }}>Commercial Summary</th>

                {/* 7. Quote Status */}
                <th style={{ width: 120, textAlign: 'center' }}>Quote Status</th>

                {/* 8. Buyer Decision Status */}
                <th style={{ width: 175, textAlign: 'center' }}>Buyer Decision Status</th>

                {/* 9. Last Activity */}
                <th style={{ width: 135 }}>Last Activity</th>

                {/* 10. Next Action / Responsible Party */}
                <th style={{ width: 170 }}>Next Action / Party</th>

                {/* 11. Available Actions */}
                <th style={{ width: 220, textAlign: 'right' }}>Available Actions</th>
              </tr>
            </thead>
            <tbody>
              {rfqRegister.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                    No RFQs found for this vendor.
                  </td>
                </tr>
              ) : (
                rfqRegister.map((r: any) => {
                  // Badge style for Buyer Decision Status
                  let decisionBadgeClass = 'badge badge-draft';
                  if (r.buyerDecisionStatus.includes('Order Execution')) decisionBadgeClass = 'badge badge-approved';
                  else if (r.buyerDecisionStatus.includes('PPO Awaited')) decisionBadgeClass = 'badge badge-approved';
                  else if (r.buyerDecisionStatus.includes('Final Offer Submitted')) decisionBadgeClass = 'badge badge-submitted';
                  else if (r.buyerDecisionStatus.includes('Final Acceptance Pending')) decisionBadgeClass = 'badge badge-info';
                  else if (r.buyerDecisionStatus.includes('Pending Vendor Acceptance')) decisionBadgeClass = 'badge badge-submitted';
                  else if (r.buyerDecisionStatus.includes('Closed') || r.buyerDecisionStatus.includes('Not Accepted')) decisionBadgeClass = 'badge badge-rejected';

                  const isOverdue = r.submissionDeadline && new Date(r.submissionDeadline) < new Date();

                  return (
                    <tr key={r.id}>
                      {/* 1. RFQ Received Date (Persisted) */}
                      <td className="text-slate-700">
                        <div
                          className="cell-compact-text font-medium"
                          style={{ fontSize: 12 }}
                          title={r.rfqReceivedDate ? new Date(r.rfqReceivedDate).toLocaleString() : 'Persisted Received Date'}
                        >
                          <Calendar size={12} className="inline mr-1 text-slate-400" />
                          <span>
                            {r.rfqReceivedDate
                              ? new Date(r.rfqReceivedDate).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })
                              : '—'}
                          </span>
                        </div>
                      </td>

                      {/* 2. RFQ Reference */}
                      <td>
                        <Link
                          href={`/vendor-portal/rfqs/${r.id}`}
                          className="cell-compact-text font-mono font-bold text-primary hover:underline"
                          style={{ fontSize: 13 }}
                          title={r.rfqNumber}
                        >
                          {r.rfqNumber}
                        </Link>
                        <div
                          className="cell-compact-text text-muted"
                          style={{ fontSize: 11, marginTop: 2 }}
                          title={r.title}
                        >
                          {r.title}
                        </div>
                      </td>

                      {/* 3. Project / Package */}
                      <td>
                        <div
                          className="cell-compact-text"
                          style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}
                          title={r.projectPackage}
                        >
                          {r.projectPackage}
                        </div>
                        <div
                          className="cell-compact-text text-muted"
                          style={{ fontSize: 11, marginTop: 2 }}
                          title={`${r.category} (${r.itemCount} BOQ lines)`}
                        >
                          {r.category} • {r.itemCount} lines
                        </div>
                      </td>

                      {/* 4. Buyer / Client */}
                      <td>
                        <div
                          className="cell-compact-text"
                          style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}
                          title={r.clientTenant}
                        >
                          <Building2 size={12} className="inline mr-1 text-slate-400" />
                          <span>{r.clientTenant}</span>
                        </div>
                      </td>

                      {/* 5. Submission Deadline (Persisted) */}
                      <td>
                        <div
                          className="cell-compact-text font-medium"
                          style={{ fontSize: 12, color: isOverdue ? '#b91c1c' : '#334155' }}
                          title={r.submissionDeadline ? new Date(r.submissionDeadline).toLocaleString() : 'No deadline'}
                        >
                          <Clock size={12} className={`inline mr-1 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`} />
                          <span>
                            {r.submissionDeadline
                              ? new Date(r.submissionDeadline).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </span>
                        </div>
                      </td>

                      {/* 6. Commercial Summary */}
                      <td style={{ textAlign: 'right' }}>
                        {r.permittedCommercial.latestQuoteTotal ? (
                          <div>
                            <div
                              className="cell-compact-text font-mono font-bold"
                              style={{ color: '#059669', fontSize: 13, textAlign: 'right' }}
                              title={`₹${r.permittedCommercial.latestQuoteTotal.toLocaleString('en-IN')}`}
                            >
                              ₹{r.permittedCommercial.latestQuoteTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </div>
                            {r.permittedCommercial.counterOfferAmount && (
                              <div
                                className="cell-compact-text"
                                style={{ fontSize: 10, color: '#2563eb', textAlign: 'right' }}
                                title={`Counter-offer: ₹${r.permittedCommercial.counterOfferAmount.toLocaleString('en-IN')}`}
                              >
                                Counter: ₹{r.permittedCommercial.counterOfferAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-warning" style={{ fontSize: 11 }}>Pending Quote</span>
                        )}
                      </td>

                      {/* 7. Quote Status */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`badge ${
                            r.quotationStatus === 'SUBMITTED'
                              ? 'badge-approved'
                              : r.quotationStatus === 'AWAITING_REVISED_QUOTE'
                              ? 'badge-warning'
                              : 'badge-draft'
                          }`}
                          style={{
                            fontSize: 11,
                            ...(r.quotationStatus === 'AWAITING_REVISED_QUOTE'
                              ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
                              : {}),
                          }}
                        >
                          {r.quotationStatus === 'AWAITING_REVISED_QUOTE' ? 'Awaiting Revised Quote' : r.quotationStatus}
                        </span>
                      </td>

                      {/* 8. Buyer Decision Status */}
                      <td style={{ textAlign: 'center' }}>
                        <div className="cell-compact-text" title={r.buyerDecisionStatus} style={{ textAlign: 'center' }}>
                          <span className={decisionBadgeClass} style={{ fontSize: 11 }}>
                            {r.buyerDecisionStatus}
                          </span>
                        </div>
                      </td>

                      {/* 9. Last Activity (Persisted Date) */}
                      <td className="text-slate-600">
                        <div
                          className="cell-compact-text"
                          style={{ fontSize: 12 }}
                          title={r.lastActivityDate ? new Date(r.lastActivityDate).toLocaleString() : ''}
                        >
                          {new Date(r.lastActivityDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </div>
                      </td>

                      {/* 10. Next Action & Responsible Party */}
                      <td>
                        <span
                          className={`badge ${
                            r.nextResponsibleParty === 'VENDOR'
                              ? 'badge-submitted'
                              : r.nextResponsibleParty === 'BUYER'
                              ? 'badge-info'
                              : 'badge-draft'
                          }`}
                          style={{ fontSize: 10, padding: '2px 6px' }}
                        >
                          {r.nextResponsibleParty}
                        </span>
                        <div
                          className="cell-compact-text text-slate-600"
                          style={{ fontSize: 11, marginTop: 3 }}
                          title={r.nextAction}
                        >
                          {r.nextAction}
                        </div>
                      </td>

                      {/* 11. Available Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          {/* View RFQ */}
                          <Link
                            href={`/vendor-portal/rfqs/${r.id}`}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
                            title="View Full RFQ Workspace"
                          >
                            <Eye size={12} style={{ marginRight: 3 }} /> View
                          </Link>

                          {/* Open Negotiation */}
                          <button
                            type="button"
                            onClick={() => setActiveNegotiatingRfq(r)}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
                            title="Open Commercial Negotiation Workspace"
                          >
                            <TrendingDown size={12} style={{ marginRight: 3 }} /> Negotiate
                          </button>

                          {/* Chat / Clarify */}
                          <button
                            type="button"
                            onClick={() => {
                              setChatRfq(r);
                              setChatDrawerOpen(true);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11, padding: '4px 8px', position: 'relative', whiteSpace: 'nowrap' }}
                            title="Open RFQ Clarification Queries"
                          >
                            <MessageSquare size={12} style={{ marginRight: 3 }} /> Clarify
                            {r.unreadMessagesCount > 0 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: -4,
                                  right: -4,
                                  background: '#2563eb',
                                  color: '#fff',
                                  borderRadius: 8,
                                  padding: '1px 4px',
                                  fontSize: 9,
                                  fontWeight: 700,
                                }}
                              >
                                {r.unreadMessagesCount}
                              </span>
                            )}
                          </button>

                          {/* View Decision */}
                          {r.latestRound?.buyerDecision && (
                            <button
                              type="button"
                              onClick={() => {
                                setDecisionRfq(r);
                                setShowDecisionModal(true);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, padding: '4px 8px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', whiteSpace: 'nowrap' }}
                              title="View Buyer Decision Details"
                            >
                              <FileCheck2 size={12} style={{ marginRight: 3 }} /> Decision
                            </button>
                          )}

                          {/* Accept PPO */}
                          {r.latestPpo && r.latestPpo.vendorStatus !== 'ACCEPTED_BY_VENDOR' && (
                            <button
                              type="button"
                              onClick={() => openAcceptPpoModal(r.latestPpo)}
                              className="btn btn-sm"
                              style={{ fontSize: 11, padding: '4px 8px', background: '#059669', color: '#ffffff', fontWeight: 600, whiteSpace: 'nowrap' }}
                              title="Review and Accept Purchase Order"
                            >
                              <CheckCircle2 size={12} style={{ marginRight: 3 }} /> Accept PPO
                            </button>
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
      </div>

      {/* ── 3. PPOS / ORDERS AWAITING ACCEPTANCE AREA (Requirement D) ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PackageCheck className="w-5 h-5 text-emerald-600" />
              PPOs & Purchase Orders Awaiting Acceptance
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
              Formal commercial purchase orders issued by buyer. Acceptance requires authorized vendor confirmation.
            </p>
          </div>
          <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded font-semibold border border-emerald-200">
            {ppos.length} Issued Orders
          </span>
        </div>

        <div style={{ padding: 20 }}>
          {ppos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 20px', color: '#94a3b8' }}>
              <PackageCheck className="w-12 h-12 mx-auto mb-2 opacity-40 text-slate-400" />
              <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No Purchase Orders Issued Yet</div>
              <p style={{ fontSize: 12, maxWidth: 440, margin: '4px auto 0' }}>
                Once the buyer finalizes commercial awards and issues a formal PPO contract, it will appear here for vendor acceptance.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {ppos.map((ppo: any) => {
                const isAccepted = ppo.vendorStatus === 'ACCEPTED_BY_VENDOR' || ppo.status === 'CONFIRMED';
                const isIssueRaised = ppo.vendorStatus === 'ISSUE_RAISED';

                return (
                  <div
                    key={ppo.id}
                    style={{
                      border: isAccepted ? '1px solid #bbf7d0' : isIssueRaised ? '1px solid #fecaca' : '2px solid #3b82f6',
                      borderRadius: 10,
                      background: isAccepted ? '#f0fdf4' : isIssueRaised ? '#fff1f2' : '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      padding: 18,
                    }}
                  >
                    {/* Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 14 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="font-mono text-base font-extrabold text-slate-900">{ppo.ppoNumber}</span>
                          <span
                            className={`badge ${
                              isAccepted ? 'badge-approved' : isIssueRaised ? 'badge-rejected' : 'badge-submitted'
                            }`}
                          >
                            {isAccepted
                              ? 'PPO Accepted — Order Execution'
                              : isIssueRaised
                              ? 'Issue Raised — Held for Buyer Resolution'
                              : 'PPO Pending Vendor Acceptance'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                          Project: <strong>{ppo.project?.name || 'Project'}</strong> | RFQ Link:{' '}
                          <span className="font-mono text-blue-600">{ppo.rfq?.rfqNumber || 'Direct Order'}</span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Total Order Value:</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                          ₹ {ppo.totalValue?.toLocaleString()} ({ppo.currency || 'INR'})
                        </div>
                      </div>
                    </div>

                    {/* Metadata columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, margin: '14px 0', fontSize: 12 }}>
                      <div>
                        <span style={{ color: '#64748b', fontSize: 11 }}>PPO Issue Date:</span>
                        <div style={{ fontWeight: 600 }}>
                          {ppo.issuedAt ? new Date(ppo.issuedAt).toLocaleDateString() : new Date(ppo.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: 11 }}>Delivery Schedule:</span>
                        <div style={{ fontWeight: 600 }}>{ppo.deliveryTerms || 'Within 30 calendar days'}</div>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: 11 }}>Delivery Location:</span>
                        <div style={{ fontWeight: 600 }}>{ppo.project?.location || 'Designated project site'}</div>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: 11 }}>Payment & Tax Terms:</span>
                        <div style={{ fontWeight: 600 }}>{ppo.paymentTerms || 'Net 30 days'} ({ppo.taxDetails || 'GST 18%'})</div>
                      </div>
                    </div>

                    {/* Acceptance / Issue Audit Box */}
                    {isAccepted && (
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#065f46', fontWeight: 700 }}>
                          <CheckCircle2 size={16} /> Accepted by Vendor Signatory: {ppo.vendorAcceptedBy} (v{ppo.vendorAcceptedVersion || 1})
                        </div>
                        <div style={{ color: '#047857', fontSize: 11, marginTop: 2 }}>
                          Timestamp: {ppo.vendorAcceptedAt ? new Date(ppo.vendorAcceptedAt).toLocaleString() : 'Recorded'}
                        </div>
                      </div>
                    )}

                    {isIssueRaised && (
                      <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9f1239', fontWeight: 700 }}>
                          <AlertTriangle size={16} /> Vendor Clarification / Issue Reported:
                        </div>
                        <div style={{ color: '#be123c', fontSize: 12, marginTop: 2 }}>
                          "{ppo.vendorIssueRemarks}"
                        </div>
                        <div style={{ color: '#9f1239', fontSize: 10, marginTop: 2 }}>
                          Logged at: {ppo.vendorIssueRaisedAt ? new Date(ppo.vendorIssueRaisedAt).toLocaleString() : 'Recorded'} — PPO acceptance held.
                        </div>
                      </div>
                    )}

                    {/* Order Lines preview */}
                    {ppo.lines && ppo.lines.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>
                          Contracted Scope & Agreed Rates ({ppo.lines.length} Line Items)
                        </div>
                        <div className="table-wrapper" style={{ maxHeight: 180, overflowY: 'auto' }}>
                          <table className="table enterprise-table" style={{ fontSize: 11 }}>
                            <thead>
                              <tr>
                                <th>S.No.</th>
                                <th>Item Description</th>
                                <th>UOM</th>
                                <th style={{ textAlign: 'right' }}>Quantity</th>
                                <th style={{ textAlign: 'right' }}>Agreed Unit Rate</th>
                                <th style={{ textAlign: 'right' }}>Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ppo.lines.map((pl: any, idx: number) => (
                                <tr key={pl.id || idx}>
                                  <td className="font-mono text-muted">{pl.lineNumber || idx + 1}</td>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{pl.itemDescription}</div>
                                    {pl.specification && (
                                      <div style={{ fontSize: 10, color: '#64748b' }}>{pl.specification}</div>
                                    )}
                                  </td>
                                  <td>{pl.uom}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{pl.orderedQuantity}</td>
                                  <td style={{ textAlign: 'right' }}>₹ {pl.orderedUnitRate?.toLocaleString()}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                    ₹ {pl.totalOrderValue?.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Action Controls for Vendor */}
                    {!isAccepted && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                        <button
                          type="button"
                          onClick={() => openIssueModal(ppo)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 12, color: '#b91c1c' }}
                        >
                          <HelpCircle size={14} style={{ marginRight: 4 }} /> Request Clarification / Raise Issue
                        </button>
                        <button
                          type="button"
                          onClick={() => openAcceptPpoModal(ppo)}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 12, background: '#059669', borderColor: '#059669' }}
                        >
                          <CheckCircle2 size={14} style={{ marginRight: 4 }} /> Accept PPO & Confirm Order
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. APPROVED RATE CARDS REGISTER ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Vendor Rate Card Register
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
              Master pricing agreements with pre-negotiated ceiling rates and validity schedules
            </p>
          </div>
          <Link
            href="/vendor-portal/rate-cards"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11 }}
          >
            View Master Register <ExternalLink size={12} style={{ marginLeft: 4 }} />
          </Link>
        </div>

        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className="table enterprise-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Rate Card Ref</th>
                <th>Title & Scope</th>
                <th>Category</th>
                <th>Valid From</th>
                <th>Valid To</th>
                <th>Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rateCards.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                    No Rate Cards registered for this vendor.
                  </td>
                </tr>
              ) : (
                rateCards.map((rc: any) => (
                  <tr key={rc.id}>
                    <td className="font-mono font-bold text-primary">
                      {rc.rateCardNumber} (v{rc.version})
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{rc.title}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{rc.scope || 'Standard Scope'}</div>
                    </td>
                    <td><span className="badge badge-draft">{rc.category}</span></td>
                    <td>{new Date(rc.validFrom).toLocaleDateString()}</td>
                    <td>{new Date(rc.validTo).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 600 }}>{rc.items?.length || 0} items</td>
                    <td><span className="badge badge-approved">{rc.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL 2: ACCEPT PPO CONFIRMATION MODAL (Requirement D) ── */}
      {showAcceptPpoModal && selectedPpo && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 620, width: '90%' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Accept Purchase Order (PPO)</h3>
                <p className="modal-subtitle">
                  Order Ref: {selectedPpo.ppoNumber} | Value: ₹ {selectedPpo.totalValue?.toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={() => setShowAcceptPpoModal(false)} className="modal-close">
                ×
              </button>
            </div>

            <form onSubmit={handleAcceptPpo}>
              <div className="modal-body">
                {ppoSuccessMsg && (
                  <div style={{ padding: '10px 14px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 12, marginBottom: 14 }}>
                    <CheckCircle2 size={16} className="inline mr-1" /> {ppoSuccessMsg}
                  </div>
                )}

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Order Acceptance Details:</div>
                  <div>Buyer / Client: <strong>{selectedPpo.project?.name || 'Client Project'}</strong></div>
                  <div>Delivery Terms: <strong>{selectedPpo.deliveryTerms || 'Site delivery'}</strong></div>
                  <div>Payment Terms: <strong>{selectedPpo.paymentTerms || '30 days net'}</strong></div>
                  <div>Agreed Total: <strong className="text-emerald-700 font-mono">₹ {selectedPpo.totalValue?.toLocaleString()}</strong></div>
                </div>

                <div className="form-group mb-3">
                  <label className="form-label" style={{ fontSize: 12 }}>Authorized Signatory Name:</label>
                  <input
                    type="text"
                    required
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    className="form-control"
                    style={{ fontSize: 12 }}
                  />
                </div>

                <div className="form-group mb-4">
                  <label className="form-label" style={{ fontSize: 12 }}>Acceptance Comments / Acknowledgement (Optional):</label>
                  <textarea
                    rows={2}
                    value={acceptRemarks}
                    onChange={(e) => setAcceptRemarks(e.target.value)}
                    placeholder="e.g. Order acknowledged; production scheduled as per timeline."
                    className="form-control"
                    style={{ fontSize: 12 }}
                  />
                </div>

                {/* Mandatory Checkbox */}
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      required
                      checked={confirmAccept}
                      onChange={(e) => setConfirmAccept(e.target.checked)}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>
                      I formally confirm acceptance of this Purchase Order and agree to execute works as per contracted rates & terms.
                    </span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAcceptPpoModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAcceptPpo || !confirmAccept}
                  className="btn btn-primary"
                  style={{ background: '#059669', borderColor: '#059669' }}
                >
                  {submittingAcceptPpo ? 'Confirming Acceptance...' : 'Formally Accept PPO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: RAISE ISSUE ON PPO MODAL (Requirement D) ── */}
      {showIssueModal && selectedPpo && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 560, width: '90%' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Report Clarification / Issue on PPO</h3>
                <p className="modal-subtitle">
                  Order Ref: {selectedPpo.ppoNumber} | Value: ₹ {selectedPpo.totalValue?.toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={() => setShowIssueModal(false)} className="modal-close">
                ×
              </button>
            </div>

            <form onSubmit={handleRaiseIssue}>
              <div className="modal-body">
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12, color: '#9f1239' }}>
                  Raising an issue holds acceptance without accepting the order. The procurement team will be notified to review and rectify commercial terms.
                </div>

                <div className="form-group mb-3">
                  <label className="form-label" style={{ fontSize: 12 }}>
                    Reason for Issue / Clarification Required <span className="text-red-500">*</span>:
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={issueRemarks}
                    onChange={(e) => setIssueRemarks(e.target.value)}
                    placeholder="Specify the discrepancy (e.g. Rate variance vs agreed final round, delivery date infeasibility, scope discrepancy)..."
                    className="form-control"
                    style={{ fontSize: 12 }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowIssueModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingIssue || !issueRemarks.trim()}
                  className="btn btn-danger"
                >
                  {submittingIssue ? 'Submitting Issue...' : 'Submit Issue to Buyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 4: VIEW DECISION DETAILS (Requirement C) ── */}
      {showDecisionModal && decisionRfq && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 520, width: '90%' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Buyer Decision Record</h3>
                <p className="modal-subtitle">RFQ: {decisionRfq.rfqNumber}</p>
              </div>
              <button type="button" onClick={() => setShowDecisionModal(false)} className="modal-close">
                ×
              </button>
            </div>

            <div className="modal-body" style={{ fontSize: 13 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Formal Decision:</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {decisionRfq.buyerDecisionStatus}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Decision Date:</span>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>
                    {decisionRfq.latestRound?.buyerDecisionDate
                      ? new Date(decisionRfq.latestRound.buyerDecisionDate).toLocaleString()
                      : 'Recorded'}
                  </div>
                </div>

                {decisionRfq.latestRound?.buyerDecisionRemarks && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Buyer Remarks:</span>
                    <div style={{ fontStyle: 'italic', marginTop: 2, color: '#334155' }}>
                      "{decisionRfq.latestRound.buyerDecisionRemarks}"
                    </div>
                  </div>
                )}

                <div>
                  <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Next Responsible Party:</span>
                  <div style={{ fontWeight: 600, color: '#2563eb', marginTop: 2 }}>
                    {decisionRfq.nextResponsibleParty} — {decisionRfq.nextAction}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowDecisionModal(false)} className="btn btn-primary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHAT / CLARIFICATION DRAWER (Persistent) ── */}
      {chatDrawerOpen && chatRfq && (
        <RfqChatDrawer
          isOpen={chatDrawerOpen}
          onClose={() => {
            setChatDrawerOpen(false);
            setChatRfq(null);
          }}
          rfqId={chatRfq.id}
          rfqNumber={chatRfq.rfqNumber}
          title={chatRfq.title}
          vendorId={vendorId}
          vendorName={vendorName}
          isVendorUser={true}
        />
      )}
    </div>
  );
}
