'use client';
// src/app/(app)/vendor-portal/rate-cards/page.tsx
// Dedicated Vendor Master Rate Cards Register with Multi-Round Negotiation & Final Acceptance
import { useState, useEffect } from 'react';
import {
  Tag,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Calendar,
  Layers,
  Building2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  TrendingDown,
  Send,
  Lock,
  Check,
  AlertCircle,
  FileText,
} from 'lucide-react';
import VendorNegotiationWorkspace from '@/components/VendorNegotiationWorkspace';
import StatusBadge from '@/components/ui/StatusBadge';
import Section5VendorAcceptance from '@/components/rate-cards/Section5VendorAcceptance';
import Section7FinalisedDetails from '@/components/rate-cards/Section7FinalisedDetails';

export default function VendorRateCardsPage() {
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Full-window Rate Card negotiation workspace state
  const [negotiatingRateCard, setNegotiatingRateCard] = useState<any | null>(null);

  // In-accordion quote entry state per card
  // cardId -> itemId -> rate
  const [quoteInputs, setQuoteInputs] = useState<Record<string, Record<string, number>>>({});
  const [quoteRemarks, setQuoteRemarks] = useState<Record<string, string>>({});
  const [submittingCardId, setSubmittingCardId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadRateCards = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor-portal/rate-cards');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load rate cards');
      }
      const data = await res.json();
      const list = data.rateCards || [];
      setRateCards(list);

      // Auto-expand first card if any
      if (list.length > 0) {
        setExpandedCards({ [list[0].id]: true });
      }

      // Initialize quote input state
      const initialInputs: Record<string, Record<string, number>> = {};
      list.forEach((rc: any) => {
        const itemMap: Record<string, number> = {};
        rc.items?.forEach((it: any) => {
          if (rc.status === 'ROUND_2_BUYER_OFFER') {
            itemMap[it.id] = it.vendorQuote2 ?? it.vendorQuote1 ?? it.proposedRate ?? it.rate;
          } else {
            itemMap[it.id] = it.vendorQuote1 ?? it.proposedRate ?? it.rate;
          }
        });
        initialInputs[rc.id] = itemMap;
      });
      setQuoteInputs(initialInputs);

      // Check URL query param ?negotiate=<rateCardId>
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const negParam = params.get('negotiate');
        if (negParam) {
          const match = list.find(
            (rc: any) => rc.id === negParam || rc.rateCardNumber?.toLowerCase() === negParam.toLowerCase()
          );
          if (match) {
            setNegotiatingRateCard(match);
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRateCards();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleQuoteRateChange = (cardId: string, itemId: string, value: number) => {
    setQuoteInputs((prev) => ({
      ...prev,
      [cardId]: {
        ...(prev[cardId] || {}),
        [itemId]: value,
      },
    }));
  };

  // Submit Quote 1 or Quote 2 Handler
  const handleSubmitVendorQuote = async (rc: any, roundNumber: 1 | 2) => {
    setSubmittingCardId(rc.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const cardInputs = quoteInputs[rc.id] || {};
      const itemsPayload = rc.items?.map((it: any) => ({
        id: it.id,
        proposedRate: cardInputs[it.id] ?? (it.proposedRate || it.rate),
      }));

      // Validate all lines > 0
      const invalid = itemsPayload.some((x: any) => isNaN(x.proposedRate) || Number(x.proposedRate) <= 0);
      if (invalid) {
        throw new Error(`Please enter a valid rate greater than zero for all ${itemsPayload.length} items.`);
      }

      const action = roundNumber === 1 ? 'SUBMIT_VENDOR_QUOTE_1' : 'SUBMIT_VENDOR_QUOTE_2';
      const res = await fetch('/api/vendor-portal/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateCardId: rc.id,
          action,
          items: itemsPayload,
          remarks: quoteRemarks[rc.id] || `Vendor submitted Vendor RC Quote-${roundNumber}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to submit Quote-${roundNumber}`);

      setSuccessMsg(`Vendor RC Quote-${roundNumber} submitted successfully! Buyer notified.`);
      await loadRateCards();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingCardId(null);
    }
  };

  // Vendor Final Acceptance Handler (Section 5)
  const handleVendorAcceptAgreement = async (rc: any) => {
    setSubmittingCardId(rc.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/vendor-portal/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateCardId: rc.id,
          action: 'VENDOR_ACCEPT',
          remarks: quoteRemarks[rc.id] || 'Vendor accepted final negotiated rate card agreement and terms',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept rate card');

      setSuccessMsg('Rate Card agreement and commercial terms formally accepted! Category Manager Sign Off is now pending.');
      await loadRateCards();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingCardId(null);
    }
  };

  const filteredRateCards = rateCards.filter((rc) => {
    return (
      rc.rateCardNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rc.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rc.scope?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // ── DEDICATED FULL-WINDOW RATE CARD NEGOTIATION WORKSPACE ───────────
  if (negotiatingRateCard) {
    return (
      <VendorNegotiationWorkspace
        mode="RATE_CARD"
        data={negotiatingRateCard}
        onBack={() => {
          setNegotiatingRateCard(null);
          loadRateCards();
        }}
        onSuccess={() => {
          loadRateCards();
        }}
      />
    );
  }

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
            Vendor Rate Cards & Commercial Negotiation
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Manage category-wise rate card quotes, respond to Buyer RC Offers across named rounds, and accept contracted master schedules
          </p>
        </div>
        <button
          type="button"
          onClick={loadRateCards}
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
            placeholder="Search Category, Rate Card No..."
            className="form-control"
            style={{ paddingLeft: 34, fontSize: 13 }}
          />
          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* ── ALERTS ──────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 14, borderRadius: 6, marginBottom: 20 }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: 14, borderRadius: 6, marginBottom: 20 }}>
          {successMsg}
        </div>
      )}

      {/* ── APPROVED SECTION 5: VENDOR ACCEPTANCE (VENDOR PORTAL VIEW) ── */}
      <div style={{ marginBottom: 24 }}>
        <Section5VendorAcceptance
          rateCardId="RC-2026-0006"
          category="Interior Works"
          validity="01 Oct 2026 - 30 Sep 2027"
          onAccept={(remarks, signature) => {
            if (signature) {
              setSuccessMsg(`Rate Card Agreement formally accepted & digitally signed by ${signature.signedBy} (${signature.signatureEvidenceId})! Routed directly to Level 1 Project Approver.`);
            } else {
              setSuccessMsg('Rate Card agreement accepted by Vendor! Routed directly to Level 1 Project Approver.');
            }
          }}
          onReject={(remarks) => {
            setError('Rate Card rejected with remarks: ' + remarks);
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

      {/* ── RATE CARDS ACCORDION ────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>Loading rate cards...</div>
        </div>
      ) : filteredRateCards.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Tag size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>No Rate Cards Established</h3>
          <p style={{ fontSize: 13, margin: 0 }}>
            {searchTerm ? 'No rate cards match your search.' : 'You do not have any rate cards established at this time.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredRateCards.map((rc) => {
            const isExpanded = !!expandedCards[rc.id];
            const isApproved = rc.status === 'APPROVED';

            // Check workflow states
            const isRound1Active = rc.status === 'ROUND_1_BUYER_OFFER' || rc.status === 'SENT_TO_VENDOR';
            const isRound1Locked = rc.status !== 'ROUND_1_BUYER_OFFER' && rc.status !== 'DRAFT';
            const isRound2Active = rc.status === 'ROUND_2_BUYER_OFFER';
            const isRound2Locked = rc.status === 'ROUND_2_VENDOR_QUOTE' || rc.status.includes('ACCEPTED') || rc.status === 'APPROVED';
            const isCmAccepted = rc.status === 'CATEGORY_MANAGER_ACCEPTED';

            return (
              <div key={rc.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                  onClick={() => toggleExpand(rc.id)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: 'var(--bg-card)',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                          {rc.rateCardNumber}
                        </span>
                        <StatusBadge status={rc.status} />
                        <span className="badge badge-info">{rc.version || 'v1.0'}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                        Category: <strong>{rc.category}</strong> • Scope: {rc.scope || 'Standard BOQ Scope'} • Location: {rc.location || 'All India'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, textAlign: 'right' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Contract Validity</div>
                      <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={13} color="var(--text-muted)" />
                        <span>
                          {new Date(rc.validFrom).toLocaleDateString('en-IN')} –{' '}
                          {new Date(rc.validTo).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Priced Items</div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: '#2563eb' }}>
                        {rc.items?.length || 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── EXPANDED VENDOR NEGOTIATION WORKSPACE & QUOTE ENTRY ── */}
                {isExpanded && (
                  <div style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '1px solid var(--border-color)' }}>
                    {/* Active Stage Banner */}
                    {isRound1Active && (
                      <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', padding: '12px 16px', borderRadius: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#0f766e', fontSize: 13 }}>Round 1 Response Required:</strong>
                          <div style={{ fontSize: 12, color: '#115e59', marginTop: 2 }}>
                            Buyer has submitted <strong>Buyer RC Offer-1</strong>. Please enter your <strong>Vendor RC Quote-1</strong> rates for all line items below and submit.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSubmitVendorQuote(rc, 1)}
                          disabled={submittingCardId === rc.id}
                          className="btn btn-primary btn-sm"
                          style={{ background: '#0d9488', borderColor: '#0d9488', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <Send size={13} /> Submit Vendor RC Quote-1
                        </button>
                      </div>
                    )}

                    {isRound2Active && (
                      <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '12px 16px', borderRadius: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#6d28d9', fontSize: 13 }}>Round 2 Response Required:</strong>
                          <div style={{ fontSize: 12, color: '#5b21b6', marginTop: 2 }}>
                            Buyer has submitted counteroffer <strong>Buyer RC Offer-2</strong>. Please enter your revised <strong>Vendor RC Quote-2</strong> rates and submit.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSubmitVendorQuote(rc, 2)}
                          disabled={submittingCardId === rc.id}
                          className="btn btn-primary btn-sm"
                          style={{ background: '#7c3aed', borderColor: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <Send size={13} /> Submit Vendor RC Quote-2
                        </button>
                      </div>
                    )}

                    {isCmAccepted && (
                      <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '14px 18px', borderRadius: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#92400e', fontSize: 13 }}>Final Rate Card Agreement Acceptance Required:</strong>
                          <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>
                            The Category Manager has accepted the negotiated commercial rates and terms. Please review and formally accept the final agreement.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleVendorAcceptAgreement(rc)}
                          disabled={submittingCardId === rc.id}
                          className="btn btn-success btn-sm"
                          style={{ background: '#16a34a', borderColor: '#16a34a', color: '#ffffff', fontWeight: 700 }}
                        >
                          Accept Final Rate Card Agreement
                        </button>
                      </div>
                    )}

                    {/* Named Rounds Line Items Table (Section 4 Requirements) */}
                    <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                      <table
                        className="table"
                        style={{ width: '100%', fontSize: 11, minWidth: 1075, margin: 0, tableLayout: 'fixed' }}
                      >
                        <colgroup>
                          <col style={{ width: 50 }} />
                          <col style={{ width: 210 }} />
                          <col style={{ width: 65 }} />
                          <col style={{ width: 75 }} />
                          <col style={{ width: 130 }} />
                          <col style={{ width: 140 }} />
                          <col style={{ width: 130 }} />
                          <col style={{ width: 140 }} />
                          <col style={{ width: 135 }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ width: 50 }}>S.No.</th>
                            <th style={{ width: 210, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>Item Description</th>
                            <th style={{ width: 65, textAlign: 'center' }}>UOM</th>
                            <th style={{ width: 75, textAlign: 'right' }}>Quantity</th>
                            <th style={{ width: 130, textAlign: 'right', background: '#eff6ff', color: '#1e40af', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                              Buyer RC Offer-1
                            </th>
                            <th style={{ width: 140, textAlign: 'right', background: '#f0fdf4', color: '#047857', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                              Vendor RC Quote-1
                            </th>
                            <th style={{ width: 130, textAlign: 'right', background: '#eff6ff', color: '#1e40af', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                              Buyer RC Offer-2
                            </th>
                            <th style={{ width: 140, textAlign: 'right', background: '#f0fdf4', color: '#047857', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                              Vendor RC Quote-2
                            </th>
                            <th style={{ width: 135, textAlign: 'right', background: '#f8fafc', fontWeight: 700, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                              Final Agreed Rate
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rc.items?.map((item: any, idx: number) => {
                            const cardInputs = quoteInputs[rc.id] || {};
                            const val1 = item.vendorQuote1 ?? item.proposedRate;
                            const val2 = item.vendorQuote2;

                            return (
                              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ width: 50, color: 'var(--text-muted)' }}>{idx + 1}</td>
                                <td style={{ width: 210, overflow: 'hidden' }}>
                                  <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.specification || item.itemCode || '—'}</div>
                                </td>
                                <td style={{ width: 65, textAlign: 'center' }}><span className="badge badge-draft">{item.uom}</span></td>
                                <td style={{ width: 75, textAlign: 'right', fontWeight: 600 }}>{item.referenceQty || item.minQuantity || 1}</td>

                                {/* Buyer RC Offer-1 (Read-Only) */}
                                <td style={{ width: 130, textAlign: 'right', background: '#eff6ff', fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap' }}>
                                  ₹ {Number(item.buyerOffer1 ?? item.rate).toLocaleString('en-IN')}
                                </td>

                                {/* Vendor RC Quote-1 (Editable during Round 1, locked once submitted) */}
                                <td style={{ width: 140, textAlign: 'right', background: '#f0fdf4' }}>
                                  {isRound1Active ? (
                                    <input
                                      type="number"
                                      value={cardInputs[item.id] ?? (val1 || '')}
                                      onChange={(e) => handleQuoteRateChange(rc.id, item.id, Number(e.target.value))}
                                      className="input input-sm"
                                      style={{ width: '100%', maxWidth: 100, textAlign: 'right', fontWeight: 700, color: '#047857', borderColor: '#86efac' }}
                                      placeholder="Quote-1"
                                    />
                                  ) : val1 !== null && val1 !== undefined ? (
                                    <span style={{ fontWeight: 700, color: '#047857', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                                      {isRound1Locked && <Lock size={10} color="#94a3b8" />}
                                      ₹ {Number(val1).toLocaleString('en-IN')}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                  )}
                                </td>

                                {/* Buyer RC Offer-2 (Read-Only, shown when submitted) */}
                                <td style={{ width: 130, textAlign: 'right', background: '#eff6ff', fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap' }}>
                                  {item.buyerOffer2 !== null && item.buyerOffer2 !== undefined ? (
                                    `₹ ${Number(item.buyerOffer2).toLocaleString('en-IN')}`
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                  )}
                                </td>

                                {/* Vendor RC Quote-2 (Editable during Round 2, locked once submitted) */}
                                <td style={{ width: 140, textAlign: 'right', background: '#f0fdf4' }}>
                                  {isRound2Active ? (
                                    <input
                                      type="number"
                                      value={cardInputs[item.id] ?? (val2 || '')}
                                      onChange={(e) => handleQuoteRateChange(rc.id, item.id, Number(e.target.value))}
                                      className="input input-sm"
                                      style={{ width: '100%', maxWidth: 100, textAlign: 'right', fontWeight: 700, color: '#047857', borderColor: '#86efac' }}
                                      placeholder="Quote-2"
                                    />
                                  ) : val2 !== null && val2 !== undefined ? (
                                    <span style={{ fontWeight: 700, color: '#047857', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                                      {isRound2Locked && <Lock size={10} color="#94a3b8" />}
                                      ₹ {Number(val2).toLocaleString('en-IN')}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                  )}
                                </td>

                                {/* Final Agreed Rate */}
                                <td style={{ width: 135, textAlign: 'right', fontWeight: 800, color: '#166534', background: '#f8fafc', whiteSpace: 'nowrap' }}>
                                  {item.finalAgreedRate !== null && item.finalAgreedRate !== undefined ? (
                                    `₹ ${Number(item.finalAgreedRate).toLocaleString('en-IN')}`
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Remarks input and terms */}
                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                          Vendor Remarks / Technical Clarifications
                        </label>
                        <input
                          type="text"
                          placeholder="Provide commercial or delivery remarks..."
                          value={quoteRemarks[rc.id] || ''}
                          onChange={(e) => setQuoteRemarks({ ...quoteRemarks, [rc.id]: e.target.value })}
                          className="input input-sm"
                          style={{ width: '100%' }}
                        />
                      </div>

                      {rc.terms && (
                        <div>
                          <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                            Contract Terms & Conditions
                          </label>
                          <div style={{ background: '#ffffff', padding: 8, borderRadius: 4, border: '1px solid var(--border-color)', fontSize: 11, color: '#334155' }}>
                            {rc.terms}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
