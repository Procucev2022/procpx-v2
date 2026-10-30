'use client';
// src/components/VendorNegotiationWorkspace.tsx
// proCPX — Dedicated Full-Window Commercial Negotiation Workspace
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Save,
  RotateCcw,
  TrendingDown,
  Info,
  Layers,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { VendorNegotiationWorkspaceProps } from "@app-types/components/VendorNegotiationWorkspace.types";
export type { VendorNegotiationWorkspaceProps };


export default function VendorNegotiationWorkspace({
  mode,
  data,
  vendorId,
  vendorName,
  isBuyer,
  onBack,
  onSuccess,
}: VendorNegotiationWorkspaceProps) {
  const toast = useToast();
  const isRfq = mode === 'RFQ';

  // Current session user role detection
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (session?.user?.role) {
          setCurrentUserRole(session.user.role);
        }
      })
      .catch(() => {});
  }, []);

  const isBuyerRole = isBuyer !== undefined ? isBuyer : (currentUserRole !== '' && currentUserRole !== 'VENDOR');

  // Storage key for saving drafts locally
  const storageKey = isRfq
    ? `procpx_neg_draft_rfq_${data.id}`
    : `procpx_neg_draft_rc_${data.id}`;

  // Form states
  const [rates, setRates] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [isFinalOffer, setIsFinalOffer] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Status & submission states
  const [submitting, setSubmitting] = useState(false);
  const [submitType, setSubmitType] = useState<'STANDARD' | 'FINAL' | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = useState<string | null>(null);

  // Table horizontal scrolling ref
  const tableRef = useRef<HTMLDivElement>(null);

  // Real-time server RFQ data synchronization
  const [currentRfqData, setCurrentRfqData] = useState<any>(data);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshRfqData = async () => {
    if (!isRfq || !data?.id) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/vendor-portal/rfqs/${data.id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.rfq) {
          setCurrentRfqData(json.rfq);
        }
      }
    } catch {} finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshRfqData();
  }, [data?.id]);

  // Use fresh RFQ data if loaded, fallback to props
  const rfqSource = currentRfqData || data;

  // Parse lines
  const lines: any[] = useMemo(() => {
    if (isRfq) {
      return rfqSource.lines || [];
    }
    return data.items || [];
  }, [isRfq, rfqSource, data]);

  // Extract historical quotes & rounds for RFQ
  const historicalRounds = useMemo(() => {
    if (!isRfq) return [];

    const flatRounds = (rfqSource.negotiations || []).flatMap((n: any) => n.rounds || []);
    const rounds = flatRounds.length > 0 ? flatRounds : (rfqSource.rounds || []);
    // Sort rounds ascending by roundNumber
    return [...rounds].sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1));
  }, [isRfq, rfqSource]);

  // Extract Initial Quote (Quote 1) mapping per line
  const initialQuoteLineRates = useMemo(() => {
    if (!isRfq) return {};
    const map: Record<string, number> = {};
    const quotes = rfqSource.quotes || [];
    // Quote 1 is the initial quote (lowest version or first quote)
    const sortedQuotes = [...quotes].sort((a: any, b: any) => (a.quoteVersion || 1) - (b.quoteVersion || 1));
    const initialQuote = sortedQuotes[0];
    if (initialQuote?.lines) {
      initialQuote.lines.forEach((ql: any) => {
        const lineId = ql.rfqLineId || ql.lineId;
        if (lineId && ql.unitRate !== undefined && ql.unitRate !== null) {
          map[lineId] = Number(ql.unitRate) || 0;
        }
      });
    }
    return map;
  }, [isRfq, rfqSource]);

  // Parse round historical line rates
  const parsedRoundRates = useMemo(() => {
    if (!isRfq) return [];

    return historicalRounds.map((rnd: any) => {
      let lineMap: Record<string, number> = {};
      let buyerMap: Record<string, number> = {};
      if (rnd.lineItemsJson) {
        try {
          const parsed = typeof rnd.lineItemsJson === 'string' ? JSON.parse(rnd.lineItemsJson) : rnd.lineItemsJson;
          if (Array.isArray(parsed)) {
            parsed.forEach((it: any) => {
              const k = it.rfqLineId || it.id || it.lineId;
              if (k) {
                if (it.revisedRate !== undefined && it.revisedRate !== null) lineMap[k] = Number(it.revisedRate);
                if (it.counterRate !== undefined && it.counterRate !== null) buyerMap[k] = Number(it.counterRate);
              }
            });
          }
        } catch {
          // ignore parse error
        }
      }
      return {
        id: rnd.id,
        roundNumber: rnd.roundNumber,
        vendorRateMap: lineMap,
        buyerRateMap: buyerMap,
        previousQuoteAmount: rnd.previousQuoteAmount,
        targetPrice: rnd.targetPrice,
        revisedQuoteAmount: rnd.revisedQuoteAmount,
        counterOfferAmount: rnd.counterOfferAmount,
        status: rnd.status,
        notes: rnd.notes,
        deadline: rnd.deadline,
        createdAt: rnd.createdAt,
        nextResponsibleParty: rnd.nextResponsibleParty,
        buyerDecision: rnd.buyerDecision,
        isFinalOffer: rnd.isFinalOffer,
      };
    });
  }, [isRfq, historicalRounds]);

  const latestRound = parsedRoundRates[parsedRoundRates.length - 1] || null;

  // Authoritative submission rule:
  // A revised quote is considered submitted ONLY when a genuine vendor submission was persisted for this round.
  const isVendorRevisionSubmitted = Boolean(
    latestRound &&
    latestRound.revisedQuoteAmount !== null &&
    latestRound.revisedQuoteAmount > 0 &&
    (latestRound.status === 'REVISED_SUBMITTED' || latestRound.status === 'FINAL_OFFER_SUBMITTED') &&
    (latestRound.nextResponsibleParty === 'BUYER' || latestRound.buyerDecision !== null)
  );

  // Active buyer counteroffer awaiting vendor response
  const hasActiveBuyerCounter = Boolean(
    latestRound &&
    (latestRound.counterOfferAmount || Object.keys(latestRound.buyerRateMap || {}).length > 0) &&
    (!latestRound.revisedQuoteAmount || latestRound.status === 'ROUND_ACTIVE' || latestRound.nextResponsibleParty === 'VENDOR')
  );

  // Initialize editable rates
  useEffect(() => {
    if (!isRfq) {
      // Rate Card mode
      const initial: Record<string, number> = {};
      lines.forEach((l: any) => {
        initial[l.id] = Number(l.proposedRate || l.rate || 0);
      });
      setRates(initial);
      return;
    }

    // RFQ mode:
    // If vendor has already submitted a revision for this round, show the persisted submitted rates
    if (isVendorRevisionSubmitted && latestRound?.vendorRateMap) {
      const initial: Record<string, number> = {};
      lines.forEach((l: any) => {
        if (latestRound.vendorRateMap[l.id] !== undefined) {
          initial[l.id] = latestRound.vendorRateMap[l.id];
        }
      });
      setRates(initial);
      return;
    }

    // If vendor has NOT submitted a revision yet:
    // DO NOT copy initial quote or benchmark rates into revised rates!
    // Check if local draft was saved by the vendor in browser
    if (!isBuyerRole) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.rates && Object.keys(parsed.rates).length > 0) {
            setRates(parsed.rates);
            if (parsed.notes) setNotes(parsed.notes);
            if (parsed.isFinalOffer !== undefined) setIsFinalOffer(parsed.isFinalOffer);
            if (parsed.savedAt) setDraftSavedAt(parsed.savedAt);
            return;
          }
        }
      } catch {
        // ignore storage error
      }
    }

    // Default: empty rates so inputs are not pre-treated as submitted revised quote!
    setRates({});
  }, [lines, isRfq, isVendorRevisionSubmitted, latestRound, isBuyerRole, storageKey]);

  // Handle single rate change
  const handleRateChange = (lineId: string, val: number) => {
    setRates((prev) => ({
      ...prev,
      [lineId]: val,
    }));
  };

  // Save Draft to localStorage
  const handleSaveDraft = () => {
    try {
      const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          rates,
          notes,
          isFinalOffer,
          savedAt: now,
        })
      );
      setDraftSavedAt(now);
      setServerSuccess(`Draft saved locally at ${now}. You can safely return to the register anytime.`);
      setTimeout(() => setServerSuccess(null), 4000);
    } catch {
      setServerError('Failed to save draft locally in browser storage.');
    }
  };

  // Reset Draft
  const handleResetDraft = () => {
    if (!confirm('Are you sure you want to clear your entered draft rates?')) return;
    try {
      localStorage.removeItem(storageKey);
      setDraftSavedAt(null);
      setRates({});
      setNotes('');
      setIsFinalOffer(false);
      setServerSuccess('Entered rates cleared.');
      setTimeout(() => setServerSuccess(null), 3000);
    } catch {
      // ignore
    }
  };

  const hasAllEnteredRates = useMemo(() => {
    if (lines.length === 0) return false;
    return lines.every((l) => rates[l.id] !== undefined && !isNaN(rates[l.id]) && rates[l.id] > 0);
  }, [lines, rates]);

  // Calculate totals - only calculate revised totals if a revision is genuinely submitted or vendor entered all rates
  const proposedTotal = useMemo(() => {
    if (isVendorRevisionSubmitted) {
      return latestRound?.revisedQuoteAmount || 0;
    }
    if (isRfq) {
      if (!hasAllEnteredRates) return 0;
      return lines.reduce((acc, l) => acc + (rates[l.id] || 0) * (Number(l.quantity) || 1), 0);
    }
    return lines.reduce((acc, l) => acc + (rates[l.id] !== undefined ? rates[l.id] : Number(l.rate || 0)), 0);
  }, [isVendorRevisionSubmitted, latestRound, isRfq, hasAllEnteredRates, lines, rates]);

  const previousTotal = useMemo(() => {
    if (isRfq) {
      const quotes = rfqSource.quotes || [];
      const sortedQuotes = [...quotes].sort((a: any, b: any) => (a.quoteVersion || 1) - (b.quoteVersion || 1));
      const initialQuote = sortedQuotes[0];
      return initialQuote?.totalQuoteAmount || 0;
    }
    return lines.reduce((acc, l) => acc + Number(l.rate || 0), 0);
  }, [isRfq, rfqSource, lines]);

  const variancePercent = useMemo(() => {
    if (previousTotal === 0 || proposedTotal === 0) return 0;
    const diff = proposedTotal - previousTotal;
    return Math.round((diff / previousTotal) * 1000) / 10;
  }, [proposedTotal, previousTotal]);

  // Submit Handler
  const handleSubmit = async (isFinal: boolean) => {
    // Validation
    const invalidItems = lines.filter((l) => {
      const r = rates[l.id];
      return r === undefined || isNaN(r) || r <= 0;
    });

    if (invalidItems.length > 0) {
      setServerError(
        `Please enter a valid proposed rate greater than zero for all ${lines.length} line items.`
      );
      return;
    }

    setSubmitting(true);
    setSubmitType(isFinal ? 'FINAL' : 'STANDARD');
    setServerError(null);
    setServerSuccess(null);

    try {
      if (isRfq) {
        // Submit RFQ Negotiation Offer
        const effectiveVendorId = vendorId || data.invitedVendors?.[0]?.vendorId || data.quotes?.[0]?.vendorId;
        const linePayload = lines.map((l) => ({
          rfqLineId: l.id,
          description: l.description,
          uom: l.uom,
          quantity: l.quantity,
          revisedRate: rates[l.id],
        }));

        const res = await fetch('/api/procurement/negotiations/submit-offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rfqId: data.id,
            vendorId: effectiveVendorId,
            revisedQuoteAmount: proposedTotal,
            lineItems: linePayload,
            isFinalOffer: isFinal,
            notes,
            submittedByVendor: vendorName,
          }),
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'Failed to submit negotiation offer');
        }

        try {
          localStorage.removeItem(storageKey);
        } catch {}

        toast.success('Offer submitted successfully.', data?.rfqNumber, 'Awaiting Buyer Evaluation');
        setServerSuccess('Offer submitted successfully.');

        if (onSuccess) onSuccess();

        setTimeout(() => {
          onBack();
        }, 1800);
      } else {
        // Submit Rate Card Negotiation Proposal
        const itemsPayload = lines.map((l) => ({
          id: l.id,
          proposedRate: rates[l.id],
        }));

        const res = await fetch('/api/vendor-portal/rate-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rateCardId: data.id,
            items: itemsPayload,
            remarks: notes,
          }),
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'Failed to submit rate card proposals');
        }

        try {
          localStorage.removeItem(storageKey);
        } catch {}

        toast.success('Offer submitted successfully.', data?.rateCardNumber, 'Awaiting Buyer Evaluation');
        setServerSuccess('Offer submitted successfully.');

        if (onSuccess) onSuccess();

        setTimeout(() => {
          onBack();
        }, 1800);
      }
    } catch (err: any) {
      setServerError(err.message || 'An error occurred during submission. Please try again.');
    } finally {
      setSubmitting(false);
      setSubmitType(null);
    }
  };

  // Format date helper
  const formatDate = (dateVal: any, includeTime = false) => {
    if (!dateVal) return '—';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '—';
      const day = d.getDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      if (!includeTime) return `${day} ${month} ${year}`;
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${day} ${month} ${year}, ${hours}:${minutes}`;
    } catch {
      return '—';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(100vh - 80px)',
        background: '#f8fafc',
        padding: '20px 24px 60px',
      }}
    >
      {/* ── TOP NAVIGATION & WORKSPACE TITLE ────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={onBack}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              padding: '7px 14px',
            }}
          >
            <ArrowLeft size={16} />
            <span>{isRfq ? 'Back to My RFQs & Bids' : 'Back to My Rate Cards'}</span>
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                {isRfq ? 'Commercial Negotiation Workspace' : 'Master Rate Card Negotiation'}
              </h1>
              <span className="badge badge-info" style={{ fontSize: 11, fontWeight: 700 }}>
                {isRfq ? data.rfqNumber : data.rateCardNumber}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {isRfq
                ? `${data.title} • ${data.project?.name || 'General Project'}`
                : `${data.category} • Contracted Scope & Rates`}
            </p>
          </div>
        </div>

        {/* Quick Draft Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRfq && (
            <button
              type="button"
              onClick={refreshRfqData}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
              title="Refresh latest negotiation rounds and counteroffers from server"
            >
              <RotateCcw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}
          {draftSavedAt && (
            <span style={{ fontSize: 12, color: '#166534', fontWeight: 500 }}>
              Draft saved at {draftSavedAt}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveDraft}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            title="Save your proposed rates in this browser to resume later"
          >
            <Save size={13} />
            <span>Save Draft</span>
          </button>
          <button
            type="button"
            onClick={handleResetDraft}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            title="Reset proposed rates to baseline"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* ── COMPACT METADATA HEADER CARD ────────────────────────────────── */}
      <div
        className="card"
        style={{
          background: '#ffffff',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 16,
          boxShadow: 'var(--shadow-xs)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 16,
            alignItems: 'center',
          }}
        >
          {isRfq ? (
            <>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Project & Package
                </div>
                <div
                  className="cell-compact-text"
                  style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 2 }}
                  title={data.projectPackage || data.project?.name}
                >
                  {data.projectPackage || data.project?.name || 'General Project'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {data.packageName || data.project?.projectCode || 'Main Package'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Buyer / Client
                </div>
                <div
                  className="cell-compact-text"
                  style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}
                  title={data.clientTenant || data.tenant?.name}
                >
                  <Building2 size={12} className="inline mr-1 text-slate-400" />
                  {data.clientTenant || data.tenant?.name || 'Enterprise Client'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Received Date
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>
                  <Calendar size={12} className="inline mr-1 text-slate-400" />
                  {formatDate(data.rfqReceivedDate, true)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Submission Deadline
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#d97706', marginTop: 2 }}>
                  <Clock size={12} className="inline mr-1 text-amber-500" />
                  {formatDate(data.submissionDeadline)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Negotiation Status
                </div>
                <div style={{ marginTop: 2 }}>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>
                    {data.buyerDecisionStatus || data.negotiationStatus || 'In Negotiation'}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Responsible Party
                </div>
                <div style={{ marginTop: 2 }}>
                  <span
                    className={`badge ${
                      data.nextResponsibleParty === 'VENDOR'
                        ? 'badge-submitted'
                        : data.nextResponsibleParty === 'BUYER'
                        ? 'badge-info'
                        : 'badge-draft'
                    }`}
                    style={{ fontSize: 11, fontWeight: 700 }}
                  >
                    Action Due: {data.nextResponsibleParty || 'VENDOR'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Category & Scope
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                  {data.category} {data.subcategory ? `> ${data.subcategory}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{data.scope || 'Standard Scope'}</div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Contract Validity
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>
                  {formatDate(data.validFrom)} – {formatDate(data.validTo)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Location / Territory
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                  {data.location || 'Pan-India'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Current Status
                </div>
                <div style={{ marginTop: 2 }}>
                  <span className="badge badge-approved" style={{ fontSize: 11 }}>
                    {data.status || 'APPROVED'}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Approval Level
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 2 }}>
                  {data.approvalLevel || 'LEVEL_1_PROJECT'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── ALERTS (ERROR & SUCCESS) ─────────────────────────────────────── */}
      {serverSuccess && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            padding: '12px 16px',
            borderRadius: 6,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{serverSuccess}</span>
        </div>
      )}

      {serverError && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: 6,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}
        >
          <AlertTriangle size={18} />
          <span>{serverError}</span>
        </div>
      )}

      {/* ── COMMERCIAL COMPARISON BANNER ─────────────────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          padding: '14px 20px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
              Vendor Initial Quote Baseline
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#475569' }}>
              {previousTotal > 0 ? `₹ ${previousTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
            </div>
          </div>

          <div style={{ color: '#cbd5e1', fontSize: 20 }}>➔</div>

          <div>
            <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>
              {isVendorRevisionSubmitted
                ? 'Vendor Submitted Revised Value'
                : isBuyerRole
                ? 'Vendor Revised Value'
                : 'Proposed Commercial Value (This Revision)'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: (isVendorRevisionSubmitted || proposedTotal > 0) ? '#166534' : '#64748b' }}>
              {isVendorRevisionSubmitted ? (
                `₹ ${latestRound?.revisedQuoteAmount?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
              ) : isBuyerRole ? (
                <span className="text-amber-800 text-sm font-semibold">Awaiting Vendor Response</span>
              ) : hasAllEnteredRates && proposedTotal > 0 ? (
                `₹ ${proposedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
              ) : (
                <span className="text-slate-400 text-sm font-medium">Pending Rate Entry</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
              Commercial Variance
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: (isVendorRevisionSubmitted || (hasAllEnteredRates && proposedTotal > 0)) && variancePercent <= 0 ? '#166534' : '#b45309',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {isVendorRevisionSubmitted || (hasAllEnteredRates && proposedTotal > 0) ? (
                <>
                  <span>{variancePercent > 0 ? `+${variancePercent}%` : `${variancePercent}%`}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    (₹{Math.abs(proposedTotal - previousTotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}{' '}
                    {proposedTotal <= previousTotal ? 'reduction' : 'increase'})
                  </span>
                </>
              ) : (
                <span className="text-slate-400 text-xs">—</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span className={`badge ${isVendorRevisionSubmitted ? 'badge-approved' : 'badge-draft'}`} style={{ fontSize: 11 }}>
            {isVendorRevisionSubmitted
              ? `Round ${latestRound?.roundNumber || 1} Revision Submitted`
              : isBuyerRole
              ? 'Awaiting Vendor Revision'
              : `${lines.length} Line Items Under Negotiation`}
          </span>
        </div>
      </div>

      {/* ── BUYER COUNTEROFFER ALERT BANNER ──────────────────────────────── */}
      {latestRound && latestRound.counterOfferAmount && (
        <div
          style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: 8,
            padding: '16px 20px',
            marginBottom: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="#2563eb" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>
                  {isBuyerRole
                    ? `Buyer Counteroffer Dispatched — Round ${latestRound.roundNumber}`
                    : `Buyer Counteroffer Received — Round ${latestRound.roundNumber}`}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: isVendorRevisionSubmitted ? '#dcfce7' : '#fef3c7',
                    color: isVendorRevisionSubmitted ? '#166534' : '#92400e',
                    border: `1px solid ${isVendorRevisionSubmitted ? '#86efac' : '#fde68a'}`,
                  }}
                >
                  {isVendorRevisionSubmitted
                    ? 'Vendor Revision Submitted'
                    : isBuyerRole
                    ? 'Awaiting Vendor Response'
                    : 'Action Required: Submit Revised Offer'}
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1e3a8a' }}>
                {isBuyerRole ? 'Procurement team dispatched a commercial counteroffer of ' : 'The Category Manager has submitted a commercial counteroffer of '}
                <strong style={{ color: '#1e40af', fontSize: 15 }}>
                  ₹ {Number(latestRound.counterOfferAmount || 0).toLocaleString('en-IN')}
                </strong>
                {latestRound.previousQuoteAmount ? (
                  <>
                    {' '}(targeting ₹ {(latestRound.previousQuoteAmount - (latestRound.counterOfferAmount || 0)).toLocaleString('en-IN')} savings on previous quote of ₹ {latestRound.previousQuoteAmount.toLocaleString('en-IN')})
                  </>
                ) : null}.
              </p>
              {latestRound.notes && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: '#1e40af',
                    background: 'rgba(255,255,255,0.7)',
                    padding: '6px 12px',
                    borderRadius: 4,
                    borderLeft: '3px solid #3b82f6',
                  }}
                >
                  <strong>Buyer Remarks:</strong> &ldquo;{latestRound.notes}&rdquo;
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right', minWidth: 180 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Dispatched On</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                {formatDate(latestRound.createdAt, true)}
              </div>
              {latestRound.deadline && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#b45309' }}>
                  <Clock size={11} className="inline mr-1" />
                  Response Deadline: <strong>{formatDate(latestRound.deadline)}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FULL-WINDOW WIDE READABLE NEGOTIATION TABLE ─────────────────── */}
      <div
        className="card"
        style={{
          background: '#ffffff',
          borderRadius: 8,
          padding: 0,
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-subtle)',
          marginBottom: 20,
          flex: 1,
        }}
      >
        <div
          ref={tableRef}
          className="table-responsive"
          style={{
            width: '100%',
            overflowX: 'auto',
            border: 'none',
            borderRadius: 8,
          }}
          onWheel={(e) => {
            if (e.shiftKey && e.deltaY !== 0) {
              if (tableRef.current) {
                tableRef.current.scrollLeft += e.deltaY;
                e.preventDefault();
              }
            }
          }}
        >
          <table
            className="table enterprise-table"
            style={{
              margin: 0,
              minWidth: isRfq ? 1540 : 1200,
              width: '100%',
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                {/* 1. S. No. */}
                <th style={{ width: 45, textAlign: 'center' }}>S.No.</th>

                {/* 2. Item Description */}
                <th style={{ minWidth: 220 }}>Item Description</th>

                {/* 3. Specification / Scope */}
                <th style={{ minWidth: 170 }}>Specification / Scope</th>

                {/* 4. UOM */}
                <th style={{ width: 70, textAlign: 'center' }}>UOM</th>

                {isRfq && (
                  /* 5. Quantity */
                  <th style={{ width: 90, textAlign: 'right' }}>Quantity</th>
                )}

                {isRfq ? (
                  <>
                    {/* 6. Vendor Quote 1 */}
                    <th style={{ width: 140, textAlign: 'right', background: '#f1f5f9' }}>
                      Vendor Initial Quote (₹)
                    </th>

                    {/* 7. Buyer Counteroffer Rate (Highlighted) */}
                    <th
                      style={{
                        minWidth: 160,
                        textAlign: 'right',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        borderLeft: '2px solid #0284c7',
                        borderRight: '1px solid #0284c7',
                        fontWeight: 700,
                      }}
                    >
                      Buyer Counteroffer Rate {latestRound ? `(R${latestRound.roundNumber})` : ''} (₹)
                    </th>

                    {/* 8. Vendor Revised Rate (Editable) */}
                    <th
                      style={{
                        minWidth: 170,
                        textAlign: 'right',
                        background: '#ecfdf5',
                        color: '#065f46',
                        borderLeft: '2px solid #10b981',
                        borderRight: '1px solid #10b981',
                        fontWeight: 700,
                      }}
                    >
                      Vendor's Revised Quote (₹)
                    </th>

                    {/* 9. Proposed Line Total */}
                    <th style={{ minWidth: 150, textAlign: 'right', background: '#f8fafc' }}>
                      Proposed Line Total (₹)
                    </th>

                    {/* 10. Variance vs Buyer Offer */}
                    <th style={{ minWidth: 130, textAlign: 'center', background: '#f8fafc' }}>
                      Variance vs Buyer Offer
                    </th>
                  </>
                ) : (
                  <>
                    {/* Rate Card Columns */}
                    <th style={{ width: 140, textAlign: 'right', background: '#f1f5f9' }}>
                      Contracted Rate (₹)
                    </th>
                    <th style={{ width: 140, textAlign: 'right', background: '#f8fafc' }}>
                      Benchmark Rate (₹)
                    </th>
                    <th style={{ minWidth: 160 }}>Scope / Location</th>
                    <th
                      style={{
                        minWidth: 180,
                        textAlign: 'right',
                        background: '#ecfdf5',
                        color: '#065f46',
                        borderLeft: '2px solid #10b981',
                      }}
                    >
                      Vendor's Proposed Next Rate (₹)
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const enteredRate = rates[line.id];
                const qty = Number(line.quantity) || 1;

                // Initial Quote 1 rate - genuine initial vendor quote only (never benchmark or 100)
                const q1Rate = initialQuoteLineRates[line.id];

                // Buyer Offer rate for the active round
                const buyerRate =
                  latestRound?.buyerRateMap?.[line.id] ||
                  (latestRound?.counterOfferAmount && latestRound?.previousQuoteAmount && q1Rate
                    ? Math.round((latestRound.counterOfferAmount / latestRound.previousQuoteAmount) * q1Rate)
                    : latestRound?.targetPrice || null);

                // Submitted vendor revised rate for this line (if genuinely submitted)
                const submittedRevisedRate = isVendorRevisionSubmitted
                  ? (latestRound?.vendorRateMap?.[line.id] !== undefined
                    ? latestRound.vendorRateMap[line.id]
                    : (latestRound?.revisedQuoteAmount && latestRound?.previousQuoteAmount && q1Rate
                      ? Math.round((latestRound.revisedQuoteAmount / latestRound.previousQuoteAmount) * q1Rate)
                      : null))
                  : null;

                const activeRevisedRate = isVendorRevisionSubmitted ? submittedRevisedRate : (!isBuyerRole && enteredRate !== undefined ? enteredRate : null);
                const activeLineTotal = activeRevisedRate !== null && activeRevisedRate > 0 ? activeRevisedRate * qty : null;

                return (
                  <tr key={line.id} style={{ height: 48 }}>
                    {/* S. No. */}
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>

                    {/* Item Description */}
                    <td>
                      <div
                        style={{
                          fontWeight: 600,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 240,
                        }}
                        title={line.description}
                      >
                        {line.description}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        Line #{line.lineNumber || idx + 1} • {line.category || 'General'}
                      </div>
                    </td>

                    {/* Specification / Scope */}
                    <td>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#475569',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 200,
                        }}
                        title={line.specification || 'Standard specifications as per BOQ'}
                      >
                        {line.specification || 'Standard specification'}
                      </div>
                    </td>

                    {/* UOM */}
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                      {line.uom}
                    </td>

                    {isRfq && (
                      /* Quantity */
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                        {qty.toLocaleString('en-IN')}
                      </td>
                    )}

                    {isRfq ? (
                      <>
                        {/* Vendor Initial Quote (Read-only) */}
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            color: '#334155',
                            background: '#f8fafc',
                          }}
                        >
                          {q1Rate !== undefined && q1Rate > 0 ? (
                            <div>
                              <div>₹{q1Rate.toLocaleString('en-IN')}</div>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                                Total: ₹{(q1Rate * qty).toLocaleString('en-IN')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Awaiting Quote</span>
                          )}
                        </td>

                        {/* Buyer Counteroffer Rate (Read-only Highlighted) */}
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            color: '#0284c7',
                            background: '#f0f9ff',
                            borderLeft: '2px solid #0284c7',
                            borderRight: '1px solid #0284c7',
                            fontWeight: 700,
                          }}
                        >
                          {buyerRate !== null && buyerRate > 0 ? (
                            <div>
                              <div style={{ fontSize: 13, color: '#0369a1' }}>
                                ₹{buyerRate.toLocaleString('en-IN')}
                              </div>
                              <div style={{ fontSize: 10, color: '#0284c7' }}>
                                Total: ₹{(buyerRate * qty).toLocaleString('en-IN')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>

                        {/* Vendor's Revised Quote (Read-only for buyer / submitted, editable for vendor response) */}
                        <td
                          style={{
                            textAlign: 'right',
                            background: '#f0fdf4',
                            borderLeft: '2px solid #10b981',
                            borderRight: '1px solid #10b981',
                            padding: '6px 12px',
                          }}
                        >
                          {isBuyerRole || isVendorRevisionSubmitted ? (
                            isVendorRevisionSubmitted && submittedRevisedRate !== null ? (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>
                                  ₹{submittedRevisedRate.toLocaleString('en-IN')}
                                </div>
                                <div style={{ fontSize: 10, color: '#059669' }}>
                                  Total: ₹{(submittedRevisedRate * qty).toLocaleString('en-IN')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-xs font-semibold border border-amber-200">
                                Awaiting Vendor Response
                              </span>
                            )
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                              <span style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>₹</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={enteredRate !== undefined ? enteredRate : ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                  if (val === undefined || isNaN(val)) {
                                    setRates((prev) => {
                                      const copy = { ...prev };
                                      delete copy[line.id];
                                      return copy;
                                    });
                                  } else {
                                    handleRateChange(line.id, val);
                                  }
                                }}
                                className="form-control"
                                style={{
                                  width: 110,
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: '#0f172a',
                                  fontSize: 13,
                                  borderColor: '#86efac',
                                  background: '#ffffff',
                                }}
                                placeholder="0.00"
                              />
                            </div>
                          )}
                        </td>

                        {/* Proposed Line Total */}
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#166534',
                            background: '#f8fafc',
                            fontSize: 13,
                          }}
                        >
                          {activeLineTotal !== null ? (
                            `₹ ${activeLineTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Variance vs Buyer Offer */}
                        <td style={{ textAlign: 'center', background: '#f8fafc' }}>
                          {(() => {
                            if (activeRevisedRate === null || buyerRate === null) return <span className="text-muted text-xs">—</span>;
                            const diff = activeRevisedRate - buyerRate;
                            if (diff === 0) {
                              return (
                                <span className="badge badge-approved text-xs" style={{ padding: '2px 6px' }}>
                                  ✓ Matched
                                </span>
                              );
                            }
                            if (diff < 0) {
                              return (
                                <span className="badge badge-approved text-xs" style={{ padding: '2px 6px' }}>
                                  -₹{Math.abs(diff).toLocaleString('en-IN')}
                                </span>
                              );
                            }
                            return (
                              <span className="badge badge-submitted text-xs" style={{ padding: '2px 6px' }}>
                                +₹{diff.toLocaleString('en-IN')}
                              </span>
                            );
                          })()}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Rate Card Contracted Rate */}
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            color: '#334155',
                            fontWeight: 600,
                          }}
                        >
                          ₹{Number(line.rate || 0).toLocaleString('en-IN')}
                        </td>

                        {/* Benchmark Rate */}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>
                          ₹{Number(line.benchmarkRate || line.historicalRate || line.rate || 0).toLocaleString('en-IN')}
                        </td>

                        {/* Scope / Location */}
                        <td style={{ fontSize: 11, color: '#64748b' }}>
                          {line.location || data.location || 'All locations'}
                        </td>

                        {/* Editable Rate Card Next Proposed Rate */}
                        <td
                          style={{
                            textAlign: 'right',
                            background: '#f0fdf4',
                            borderLeft: '2px solid #10b981',
                            padding: '6px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>₹</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={enteredRate !== undefined ? enteredRate : (line.rate || 0)}
                              onChange={(e) => handleRateChange(line.id, parseFloat(e.target.value) || 0)}
                              className="form-control"
                              style={{
                                width: 110,
                                textAlign: 'right',
                                fontWeight: 700,
                                color: '#0f172a',
                                fontSize: 13,
                                borderColor: '#86efac',
                                background: '#ffffff',
                              }}
                            />
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {/* ── TABLE FOOTER (SUMMARY TOTALS) ─────────────────────────── */}
            <tfoot>
              <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                <td colSpan={isRfq ? 5 : 4} style={{ padding: '14px 16px', fontSize: 13 }}>
                  <span>Total Scope: {lines.length} Line Items</span>
                </td>

                {isRfq && (
                  <>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#475569' }}>
                      ₹{previousTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ textAlign: 'right', color: '#64748b' }}>—</td>
                    {parsedRoundRates.length >= 2 && (
                      <>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>—</td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>—</td>
                      </>
                    )}
                    {parsedRoundRates.length >= 3 &&
                      parsedRoundRates.slice(2).map((_, i) => (
                        <td key={i} style={{ textAlign: 'right', color: '#64748b' }}>
                          —
                        </td>
                      ))}
                    <td
                      style={{
                        textAlign: 'right',
                        fontSize: 12,
                        color: '#065f46',
                        borderLeft: '2px solid #10b981',
                        borderRight: '1px solid #10b981',
                        background: '#ecfdf5',
                      }}
                    >
                      Proposed RFQ Total:
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: 16,
                        fontWeight: 800,
                        color: '#166534',
                      }}
                    >
                      ₹{proposedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                  </>
                )}

                {!isRfq && (
                  <>
                    <td colSpan={2} style={{ textAlign: 'right', fontSize: 12, color: '#065f46' }}>
                      Proposed Average:
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#166534',
                        borderLeft: '2px solid #10b981',
                        background: '#ecfdf5',
                      }}
                    >
                      ₹{Math.round(proposedTotal / (lines.length || 1)).toLocaleString('en-IN')} / unit
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── COMMERCIAL JUSTIFICATION & FINAL BINDING OFFER CONTROLS ──────── */}
      <div
        className="card"
        style={{
          background: '#ffffff',
          borderRadius: 8,
          padding: '18px 22px',
          marginBottom: 20,
          boxShadow: 'var(--shadow-xs)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          {/* Notes / Justification Textarea or Read-Only display */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Commercial Justification & Technical Remarks:
            </label>
            {isBuyerRole || isVendorRevisionSubmitted ? (
              <div
                style={{
                  padding: '10px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 13,
                  color: notes || latestRound?.notes ? '#1e293b' : '#94a3b8',
                  minHeight: 60,
                }}
              >
                {notes || latestRound?.notes || (isBuyerRole ? 'No remarks provided by vendor for this round.' : 'No remarks submitted.')}
              </div>
            ) : (
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="State any payment milestone assumptions, lead times, or commercial justification for your proposed rates..."
                className="form-control"
                style={{ fontSize: 13, width: '100%', resize: 'vertical' }}
              />
            )}
          </div>

          {/* Binding Final Offer Option (For RFQ) */}
          {isRfq && !isBuyerRole && !isVendorRevisionSubmitted && (
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 6,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <input
                type="checkbox"
                id="finalOfferCheck"
                checked={isFinalOffer}
                onChange={(e) => setIsFinalOffer(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#1e40af', cursor: 'pointer' }}
              />
              <label htmlFor="finalOfferCheck" style={{ fontSize: 13, cursor: 'pointer', margin: 0 }}>
                <span style={{ fontWeight: 700, color: '#1e40af' }}>
                  Declare as Binding Best & Final Offer (BAFO)
                </span>
                <span style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 2 }}>
                  Locks these commercial rates for final buyer procurement committee evaluation and PPO award decision.
                </span>
              </label>
            </div>
          )}
          {isRfq && latestRound?.isFinalOffer && (isBuyerRole || isVendorRevisionSubmitted) && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 6,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: '#166534',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={18} />
              <span>This round was declared as a Binding Best & Final Offer (BAFO).</span>
            </div>
          )}
        </div>
      </div>

      {/* ── STICKY FOOTER ACTIONS BAR ───────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          bottom: 12,
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          padding: '14px 24px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            onClick={onBack}
            className="btn btn-secondary"
            style={{ fontSize: 13 }}
            disabled={submitting}
          >
            {isBuyerRole ? 'Back to RFQ' : 'Cancel & Return'}
          </button>
          {!isBuyerRole && !isVendorRevisionSubmitted && (
            <button
              type="button"
              onClick={handleSaveDraft}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              disabled={submitting}
            >
              <Save size={14} />
              <span>Save Draft</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isBuyerRole ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isVendorRevisionSubmitted ? (
                <span className="badge badge-approved" style={{ fontSize: 12, padding: '6px 12px' }}>
                  ✓ Vendor Revision Submitted (Round {latestRound?.roundNumber || 1})
                </span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: 12, padding: '6px 12px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                  ⏳ Awaiting Vendor Response (Round {latestRound?.roundNumber || 1})
                </span>
              )}
            </div>
          ) : isVendorRevisionSubmitted ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                background: '#dcfce7',
                border: '1px solid #86efac',
                borderRadius: 6,
                color: '#166534',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={16} />
              <span>Revision Submitted for Round {latestRound?.roundNumber || 1} — Read-Only</span>
            </div>
          ) : (
            <>
              {isRfq && (
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                  className="btn btn-secondary"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#1e40af',
                    borderColor: '#bfdbfe',
                    background: '#eff6ff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {submitting && submitType === 'FINAL' ? (
                    <>
                      <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid #1e40af', borderTopColor: 'transparent', borderRadius: '50%' }} />
                      <span>Submitting Final...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      <span>Submit Binding Final Offer</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSubmit(isFinalOffer)}
                disabled={submitting}
                className="btn btn-primary"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '8px 20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {submitting && submitType === 'STANDARD' ? (
                  <>
                    <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%' }} />
                    <span>Submitting Offer...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>
                      {isRfq
                        ? isFinalOffer
                          ? 'Submit Binding Final Offer'
                          : 'Submit Revised Negotiation Offer'
                        : 'Submit Proposed Rate Card Revisions'}
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
