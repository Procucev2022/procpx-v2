'use client';
// src/app/(app)/vendor-portal/ppos/page.tsx
// Dedicated Vendor Orders & PPO Acceptance Workspace
import { useState, useEffect } from 'react';
import {
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Check,
  XCircle,
  Building2,
  FileText,
  Calendar,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export default function VendorPposPage() {
  const [ppos, setPpos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Expandable Lines state
  const [expandedPpos, setExpandedPpos] = useState<Record<string, boolean>>({});

  // Accept Modal
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [selectedPpo, setSelectedPpo] = useState<any | null>(null);
  const [acceptedBy, setAcceptedBy] = useState('');
  const [acceptRemarks, setAcceptRemarks] = useState('');
  const [accepting, setAccepting] = useState(false);

  // Raise Issue Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueRemarks, setIssueRemarks] = useState('');
  const [raisingIssue, setRaisingIssue] = useState(false);

  const loadPpos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor-portal/ppos');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load purchase orders');
      }
      const data = await res.json();
      setPpos(data.ppos || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPpos();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedPpos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAcceptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPpo) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/procurement/ppos/${selectedPpo.id}/vendor-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedBy,
          vendorComments: acceptRemarks,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to accept purchase order');
      }
      setShowAcceptModal(false);
      setSelectedPpo(null);
      loadPpos();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPpo || !issueRemarks.trim()) return;
    setRaisingIssue(true);
    try {
      const res = await fetch(`/api/procurement/ppos/${selectedPpo.id}/vendor-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueRemarks,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to report fulfillment issue');
      }
      setShowIssueModal(false);
      setSelectedPpo(null);
      loadPpos();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setRaisingIssue(false);
    }
  };

  const filteredPpos = ppos.filter((p) => {
    return (
      p.ppoNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.rfq?.rfqNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300, margin: '0 auto' }}>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Purchase Orders (PPOs) & Awards
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Review official purchase orders issued by clients, accept commercial terms, or raise fulfillment queries
          </p>
        </div>
        <button
          type="button"
          onClick={loadPpos}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── SEARCH BAR ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <div style={{ position: 'relative', width: 280 }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search PPO #, Project..."
            className="form-control"
            style={{ paddingLeft: 34, fontSize: 13 }}
          />
          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* ── ERROR ALERT ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 16, borderRadius: 6, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── ORDERS REGISTER ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>Loading purchase orders...</div>
        </div>
      ) : filteredPpos.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileCheck size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>No Purchase Orders Found</h3>
          <p style={{ fontSize: 13, margin: 0 }}>
            {searchTerm ? 'No orders match your search query.' : 'No purchase orders have been issued to your company yet.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            className="table-responsive"
            onWheel={(e) => {
              if (e.shiftKey && e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
                e.preventDefault();
              }
            }}
          >
            <table className="table enterprise-table" style={{ margin: 0, minWidth: 1050 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>PPO Reference</th>
                  <th>Project & RFQ</th>
                  <th>PO Date</th>
                  <th>Target Delivery</th>
                  <th style={{ textAlign: 'right' }}>Gross Total (₹)</th>
                  <th>Vendor Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPpos.map((ppo) => {
                  const isExpanded = !!expandedPpos[ppo.id];
                  const isAccepted = ppo.vendorStatus === 'ACCEPTED_BY_VENDOR';
                  const isIssue = ppo.vendorStatus === 'ISSUE_RAISED';

                  return (
                    <>
                      <tr key={ppo.id} style={{ background: isExpanded ? 'var(--bg-subtle, #f8fafc)' : undefined }}>
                        <td>
                          <button
                            type="button"
                            onClick={() => toggleExpand(ppo.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
                            title="Toggle Line Items"
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ppo.ppoNumber}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {ppo.lines?.length || 0} line items
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{ppo.project?.name || 'Project'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {ppo.rfq?.rfqNumber ? `RFQ: ${ppo.rfq.rfqNumber}` : 'Direct Contract'}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12 }}>
                            {ppo.poDate ? new Date(ppo.poDate).toLocaleDateString('en-IN') : '—'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} color="#f59e0b" />
                            <span>{ppo.deliveryDate ? new Date(ppo.deliveryDate).toLocaleDateString('en-IN') : 'As agreed'}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: 14 }}>
                          ₹{Number(ppo.totalValue || ppo.grossTotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td>
                          {isAccepted ? (
                            <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={11} />
                              <span>Accepted ({new Date(ppo.vendorAcceptedAt).toLocaleDateString('en-IN')})</span>
                            </span>
                          ) : isIssue ? (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={11} />
                              <span>Query Raised</span>
                            </span>
                          ) : (
                            <span className="badge badge-submitted">Awaiting Acceptance</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {!isAccepted && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPpo(ppo);
                                    setAcceptedBy('');
                                    setAcceptRemarks('');
                                    setShowAcceptModal(true);
                                  }}
                                  className="btn btn-primary"
                                  style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  <Check size={12} />
                                  <span>Accept PPO</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPpo(ppo);
                                    setIssueRemarks(ppo.vendorIssueRemarks || '');
                                    setShowIssueModal(true);
                                  }}
                                  className="btn btn-secondary"
                                  style={{ padding: '4px 10px', fontSize: 12, color: '#b45309' }}
                                >
                                  Raise Issue
                                </button>
                              </>
                            )}
                            {isAccepted && (
                              <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
                                ✓ Binding Order Confirmed
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Line items expansion */}
                      {isExpanded && (
                        <tr key={`${ppo.id}-lines`} style={{ background: '#f8fafc' }}>
                          <td colSpan={8} style={{ padding: '12px 24px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#334155' }}>
                              Order Line Items Detail:
                            </div>
                            <table className="table" style={{ margin: 0, background: '#ffffff', borderRadius: 4 }}>
                              <thead>
                                <tr>
                                  <th>Item Description</th>
                                  <th style={{ textAlign: 'right' }}>Quantity</th>
                                  <th>UOM</th>
                                  <th style={{ textAlign: 'right' }}>Unit Rate (₹)</th>
                                  <th style={{ textAlign: 'right' }}>GST %</th>
                                  <th style={{ textAlign: 'right' }}>Line Total (₹)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ppo.lines?.map((line: any) => (
                                  <tr key={line.id}>
                                    <td style={{ fontSize: 12, fontWeight: 500 }}>{line.itemDescription}</td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{line.quantity}</td>
                                    <td style={{ fontSize: 12 }}>{line.uom}</td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>
                                      ₹{Number(line.unitRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{line.gstPercent || 18}%</td>
                                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                                      ₹{Number(line.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {ppo.vendorIssueRemarks && (
                              <div style={{ marginTop: 8, padding: 8, background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 4, fontSize: 12, color: '#92400e' }}>
                                <strong>Reported Issue:</strong> {ppo.vendorIssueRemarks}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ACCEPT PPO MODAL ────────────────────────────────────────────── */}
      {showAcceptModal && selectedPpo && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Formal Acceptance of PPO {selectedPpo.ppoNumber}
              </h3>
            </div>
            <form onSubmit={handleAcceptSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  By accepting this Purchase Order, you confirm acceptance of the agreed scope, quantities, rates, and delivery timeline for a total value of{' '}
                  <strong>₹{Number(selectedPpo.grossTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>.
                </p>
                <div>
                  <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Authorized Signatory Name</label>
                  <input
                    type="text"
                    required
                    value={acceptedBy}
                    onChange={(e) => setAcceptedBy(e.target.value)}
                    placeholder="Full name of signing representative"
                    className="form-control"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Acceptance Remarks / Notes (Optional)</label>
                  <textarea
                    rows={2}
                    value={acceptRemarks}
                    onChange={(e) => setAcceptRemarks(e.target.value)}
                    placeholder="Production kickoff date, acknowledgement note..."
                    className="form-control"
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAcceptModal(false)}
                  className="btn btn-secondary"
                  disabled={accepting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={accepting || !acceptedBy.trim()}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {accepting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Confirm Order Acceptance</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RAISE ISSUE MODAL ───────────────────────────────────────────── */}
      {showIssueModal && selectedPpo && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#b45309' }}>
                Raise Fulfillment Query on {selectedPpo.ppoNumber}
              </h3>
            </div>
            <form onSubmit={handleIssueSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Report any commercial discrepancy, delivery schedule conflict, or specification mismatch to the procurement team before accepting.
                </p>
                <div>
                  <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Issue / Query Description</label>
                  <textarea
                    rows={4}
                    required
                    value={issueRemarks}
                    onChange={(e) => setIssueRemarks(e.target.value)}
                    placeholder="Specify the issue (e.g. Lead time requires 3 weeks instead of 10 days, drawing discrepancy in line 2...)"
                    className="form-control"
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="btn btn-secondary"
                  disabled={raisingIssue}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={raisingIssue || !issueRemarks.trim()}
                  className="btn btn-primary"
                  style={{ background: '#b45309', borderColor: '#b45309' }}
                >
                  {raisingIssue ? 'Submitting...' : 'Submit Issue to Buyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
