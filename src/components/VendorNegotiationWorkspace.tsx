'use client';
// src/components/VendorNegotiationWorkspace.tsx
// proCPX — Dedicated Full-Window Commercial Negotiation Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { reportHandledClientFailure } from '@/lib/observability/client-reporter';
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
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { VendorNegotiationWorkspaceProps } from "@app-types/components/VendorNegotiationWorkspace.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

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
      .catch((error: unknown) => reportHandledClientFailure(error, {
        operation: 'load_negotiation_user_role', route: '/api/auth/session',
      }));
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
      const query = new URLSearchParams({ includeNegotiationHistory: 'true' });
      if (vendorId) query.set('vendorId', vendorId);
      const detailUrl = isBuyerRole
        ? `/api/procurement/rfqs/${data.id}?${query.toString()}`
        : `/api/vendor-portal/rfqs/${data.id}`;
      const res = await fetch(detailUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.rfq) {
          setCurrentRfqData(json.rfq);
        }
      }
    } catch (error: unknown) {
      reportHandledClientFailure(error, {
        operation: 'refresh_negotiation_rfq',
        route: isBuyerRole ? '/api/procurement/rfqs/:id' : '/api/vendor-portal/rfqs/:id',
        recordId: data.id,
        fallback: 'continue_with_initial_rfq_data',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshRfqData();
  }, [data?.id, isBuyerRole]);

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
    // Keep the history order stable when multiple vendors have the same round number.
    return [...rounds].sort((a, b) =>
      ((a.roundNumber || 1) - (b.roundNumber || 1))
      || (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      || String(a.id || '').localeCompare(String(b.id || '')),
    );
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
        } catch (error: unknown) {
          reportHandledClientFailure(error, {
            operation: 'parse_negotiation_round_line_items',
            route: isBuyerRole ? '/api/procurement/rfqs/:id' : '/api/vendor-portal/rfqs/:id',
            recordId: data.id,
            roundId: rnd.id,
            field: 'lineItemsJson',
            fallback: 'show_round_without_line_rate_metadata',
          });
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
  }, [isRfq, historicalRounds, isBuyerRole, data.id]);

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
      } catch (error: unknown) {
        reportHandledClientFailure(error, {
          operation: 'restore_negotiation_draft',
          route: isBuyerRole ? '/procurement/rfqs/:id' : '/vendor-portal/rfqs/:id',
          recordId: data.id,
          fallback: 'use_initial_rate_and_note_values',
        });
      }
    }

    // Default: empty rates so inputs are not pre-treated as submitted revised quote!
    setRates({});
  }, [lines, isRfq, isVendorRevisionSubmitted, latestRound, isBuyerRole, storageKey, data.id]);

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
      const now = new Date().toLocaleTimeString(I18N_CONFIG.defaultLocale, { hour: '2-digit', minute: '2-digit' });
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
      setServerSuccess(interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.draftSavedLocallyAtNowYouCanSafelyReturnToTheRegisterAnytime, { "now": now }));
      setTimeout(() => setServerSuccess(null), 4000);
    } catch (error: unknown) {
      reportHandledClientFailure(error, {
        operation: 'persist_negotiation_draft',
        route: isBuyerRole ? '/procurement/rfqs/:id' : '/vendor-portal/rfqs/:id',
        recordId: data.id,
        fallback: 'show_draft_save_error',
      });
      setServerError(UI_STRINGS.common.failedToSaveDraftLocallyInBrowserStorage);
    }
  };

  // Reset Draft
  const handleResetDraft = () => {
    if (!confirm(UI_STRINGS.componentsVendorNegotiationWorkspace.areYouSureYouWantToClearYourEnteredDraftRates)) return;
    try {
      localStorage.removeItem(storageKey);
      setDraftSavedAt(null);
      setRates({});
      setNotes('');
      setIsFinalOffer(false);
      setServerSuccess(UI_STRINGS.componentsVendorNegotiationWorkspace.enteredRatesCleared);
      setTimeout(() => setServerSuccess(null), 3000);
    } catch (error: unknown) {
      reportHandledClientFailure(error, {
        operation: 'reset_negotiation_draft',
        route: isBuyerRole ? '/procurement/rfqs/:id' : '/vendor-portal/rfqs/:id',
        recordId: data.id,
        fallback: 'preserve_current_rates_and_notes',
      });
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
        interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.pleaseEnterAValidProposedRateGreaterThanZeroForAllLengthLineItems, { "length": lines.length })
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
          throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": resData.error || UI_STRINGS.common.userMessages.failedToSubmitNegotiationOffer }));
        }

        try {
          localStorage.removeItem(storageKey);
        } catch (error: unknown) {
          reportHandledClientFailure(error, {
            operation: 'clear_submitted_negotiation_draft',
            route: '/api/procurement/negotiations/submit-offer',
            recordId: data.id,
            fallback: 'submission_succeeded_but_local_draft_remains',
          });
        }

        toast.success(UI_STRINGS.componentsVendorNegotiationWorkspace.offerSubmittedSuccessfully, data?.rfqNumber, UI_STRINGS.common.userMessages.awaitingBuyerEvaluation);
        setServerSuccess(UI_STRINGS.componentsVendorNegotiationWorkspace.offerSubmittedSuccessfully);

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
          throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": resData.error || UI_STRINGS.common.userMessages.failedToSubmitRateCardProposals }));
        }

        try {
          localStorage.removeItem(storageKey);
        } catch (error: unknown) {
          reportHandledClientFailure(error, {
            operation: 'clear_submitted_rate_card_draft',
            route: '/api/vendor-portal/rate-cards',
            recordId: data.id,
            fallback: 'submission_succeeded_but_local_draft_remains',
          });
        }

        toast.success(UI_STRINGS.componentsVendorNegotiationWorkspace.offerSubmittedSuccessfully, data?.rateCardNumber, UI_STRINGS.common.userMessages.awaitingBuyerEvaluation);
        setServerSuccess(UI_STRINGS.componentsVendorNegotiationWorkspace.offerSubmittedSuccessfully);

        if (onSuccess) onSuccess();

        setTimeout(() => {
          onBack();
        }, 1800);
      }
    } catch (err: any) {
      reportHandledClientFailure(err, {
        operation: isRfq ? 'submit_negotiation_offer' : 'submit_rate_card_proposal',
        route: isRfq ? '/api/procurement/negotiations/submit-offer' : '/api/vendor-portal/rate-cards',
        recordId: data.id,
        fallback: 'show_submission_error',
      });
      setServerError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anErrorOccurredDuringSubmissionPleaseTryAgain }));
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
            <span>{isRfq ? UI_STRINGS.componentsVendorNegotiationWorkspace.backToMyRFQsBids : UI_STRINGS.componentsVendorNegotiationWorkspace.backToMyRateCards}</span>
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                {isRfq ? UI_STRINGS.componentsVendorNegotiationWorkspace.commercialNegotiationWorkspace : UI_STRINGS.componentsVendorNegotiationWorkspace.masterRateCardNegotiation}
              </h1>
              <span className="badge badge-info" style={{ fontSize: 11, fontWeight: 700 }}>
                {isRfq ? data.rfqNumber : data.rateCardNumber}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {isRfq
                ? interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.titleValue2, { "title": data.title, "value2": data.project?.name || UI_STRINGS.common.generalProject })
                : interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.categoryContractedScopeRates, { "category": data.category })}
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
              title={UI_STRINGS.componentsVendorNegotiationWorkspace.refreshLatestNegotiationRoundsAndCounteroffersFromServer}
            >
              <RotateCcw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? UI_STRINGS.componentsVendorNegotiationWorkspace.refreshing : UI_STRINGS.common.refresh2}</span>
            </button>
          )}
          {draftSavedAt && (
            <span style={{ fontSize: 12, color: '#166534', fontWeight: 500 }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.draftSavedAt}{draftSavedAt}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveDraft}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            title={UI_STRINGS.componentsVendorNegotiationWorkspace.saveYourProposedRatesInThisBrowserToResumeLater}
          >
            <Save size={13} />
            <span>{UI_STRINGS.common.saveDraft}</span>
          </button>
          <button
            type="button"
            onClick={handleResetDraft}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            title={UI_STRINGS.componentsVendorNegotiationWorkspace.resetProposedRatesToBaseline}
          >
            <RotateCcw size={13} />
            <span>{UI_STRINGS.common.reset}</span>
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
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.projectPackage}</div>
                <div
                  className="cell-compact-text"
                  style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 2 }}
                  title={interpolateUiString(UI_STRINGS.common.value1, { "value1": data.projectPackage || data.project?.name })}
                >
                  {data.projectPackage || data.project?.name || UI_STRINGS.common.generalProject}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {data.packageName || data.project?.projectCode || UI_STRINGS.common.mainPackage}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.common.buyerClient}</div>
                <div
                  className="cell-compact-text"
                  style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}
                  title={interpolateUiString(UI_STRINGS.common.value1, { "value1": data.clientTenant || data.tenant?.name })}
                >
                  <Building2 size={12} className="inline mr-1 text-slate-400" />
                  {data.clientTenant || data.tenant?.name || UI_STRINGS.common.enterpriseClient}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.receivedDate}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>
                  <Calendar size={12} className="inline mr-1 text-slate-400" />
                  {formatDate(data.rfqReceivedDate, true)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.common.submissionDeadline}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#d97706', marginTop: 2 }}>
                  <Clock size={12} className="inline mr-1 text-amber-500" />
                  {formatDate(data.submissionDeadline)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.common.negotiationStatus}</div>
                <div style={{ marginTop: 2 }}>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>
                    {data.buyerDecisionStatus || data.negotiationStatus || UI_STRINGS.common.inNegotiation}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.responsibleParty}</div>
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
                  >{interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.actionDueForParty, { party: data.nextResponsibleParty || UI_STRINGS.common.vENDOR })}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.categoryScope}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                  {data.category} {data.subcategory ? interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.subcategory, { "subcategory": data.subcategory }) : ''}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{data.scope || UI_STRINGS.common.standardScope}</div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.common.contractValidity}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 2 }}>
                  {formatDate(data.validFrom)}{UI_STRINGS.componentsVendorNegotiationWorkspace.copy1ik91v0}{formatDate(data.validTo)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.locationTerritory}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                  {data.location || UI_STRINGS.common.panIndia}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.common.currentStatus}</div>
                <div style={{ marginTop: 2 }}>
                  <span className="badge badge-approved" style={{ fontSize: 11 }}>
                    {data.status || UI_STRINGS.common.aPPROVED}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.approvalLevel}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 2 }}>
                  {data.approvalLevel || UI_STRINGS.componentsVendorNegotiationWorkspace.lEVEL1PROJECT}
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
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.vendorInitialQuoteBaseline}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#475569' }}>
              {previousTotal > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": previousTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 }) }) : UI_STRINGS.common.copy4s9bsz}
            </div>
          </div>

          <div style={{ color: '#cbd5e1', fontSize: 20 }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.copy14alm6b}</div>

          <div>
            <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>
              {isVendorRevisionSubmitted
                ? UI_STRINGS.componentsVendorNegotiationWorkspace.vendorSubmittedRevisedValue
                : isBuyerRole
                ? UI_STRINGS.componentsVendorNegotiationWorkspace.vendorRevisedValue
                : UI_STRINGS.componentsVendorNegotiationWorkspace.proposedCommercialValueThisRevision}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: (isVendorRevisionSubmitted || proposedTotal > 0) ? '#166534' : '#64748b' }}>
              {isVendorRevisionSubmitted ? (
                interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": latestRound?.revisedQuoteAmount?.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 }) })
              ) : isBuyerRole ? (
                <span className="text-amber-800 text-sm font-semibold">{UI_STRINGS.componentsVendorNegotiationWorkspace.awaitingVendorResponse}</span>
              ) : hasAllEnteredRates && proposedTotal > 0 ? (
                interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": proposedTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 }) })
              ) : (
                <span className="text-slate-400 text-sm font-medium">{UI_STRINGS.componentsVendorNegotiationWorkspace.pendingRateEntry}</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.commercialVariance}</div>
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
                  <span>{variancePercent > 0 ? interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.variancePercent, { "variancePercent": variancePercent }) : interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.variancePercent2, { "variancePercent": variancePercent })}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.copy16gs63u}{Math.abs(proposedTotal - previousTotal).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 })}{' '}
                    {proposedTotal <= previousTotal ? UI_STRINGS.componentsVendorNegotiationWorkspace.reduction : UI_STRINGS.componentsVendorNegotiationWorkspace.increase}{UI_STRINGS.common.copyc7zu6c}</span>
                </>
              ) : (
                <span className="text-slate-400 text-xs">{UI_STRINGS.common.copy4s9bsz}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span className={`badge ${isVendorRevisionSubmitted ? 'badge-approved' : 'badge-draft'}`} style={{ fontSize: 11 }}>
            {isVendorRevisionSubmitted
              ? interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.roundValue1RevisionSubmitted, { "value1": latestRound?.roundNumber || 1 })
              : isBuyerRole
              ? UI_STRINGS.componentsVendorNegotiationWorkspace.awaitingVendorRevision
              : interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.lengthLineItemsUnderNegotiation, { "length": lines.length })}
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
                    ? interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.buyerCounterofferDispatchedRoundRoundNumber, { "roundNumber": latestRound.roundNumber })
                    : interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.buyerCounterofferReceivedRoundRoundNumber, { "roundNumber": latestRound.roundNumber })}
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
                    ? UI_STRINGS.componentsVendorNegotiationWorkspace.vendorRevisionSubmitted
                    : isBuyerRole
                    ? UI_STRINGS.componentsVendorNegotiationWorkspace.awaitingVendorResponse
                    : UI_STRINGS.componentsVendorNegotiationWorkspace.actionRequiredSubmitRevisedOffer}
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1e3a8a' }}>
                {isBuyerRole ? UI_STRINGS.componentsVendorNegotiationWorkspace.procurementTeamDispatchedACommercialCounterofferOf : UI_STRINGS.componentsVendorNegotiationWorkspace.theCategoryManagerHasSubmittedACommercialCounterofferOf}
                <strong style={{ color: '#1e40af', fontSize: 15 }}>{UI_STRINGS.common.copy1g8b5tg}{Number(latestRound.counterOfferAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                </strong>
                {latestRound.previousQuoteAmount ? (
                  <>
                    {' '}{UI_STRINGS.componentsVendorNegotiationWorkspace.targeting}{(latestRound.previousQuoteAmount - (latestRound.counterOfferAmount || 0)).toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.componentsVendorNegotiationWorkspace.savingsOnPreviousQuoteOf}{latestRound.previousQuoteAmount.toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.common.copyc7zu6c}</>
                ) : null}{UI_STRINGS.common.copyby08hd}</p>
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
                  <strong>{UI_STRINGS.common.buyerRemarks}</strong>{UI_STRINGS.componentsVendorNegotiationWorkspace.ldquo}{latestRound.notes}{UI_STRINGS.common.rdquo}</div>
              )}
            </div>

            <div style={{ textAlign: 'right', minWidth: 180 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.dispatchedOn}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                {formatDate(latestRound.createdAt, true)}
              </div>
              {latestRound.deadline && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#b45309' }}>
                  <Clock size={11} className="inline mr-1" />{UI_STRINGS.componentsVendorNegotiationWorkspace.responseDeadline}<strong>{formatDate(latestRound.deadline)}</strong>
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
                <th style={{ width: 45, textAlign: 'center' }}>{UI_STRINGS.common.sNo2}</th>

                {/* 2. Item Description */}
                <th style={{ minWidth: 220 }}>{UI_STRINGS.common.itemDescription}</th>

                {/* 3. Specification / Scope */}
                <th style={{ minWidth: 170 }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.specificationScope}</th>

                {/* 4. UOM */}
                <th style={{ width: 70, textAlign: 'center' }}>{UI_STRINGS.common.uOM}</th>

                {isRfq && (
                  /* 5. Quantity */
                  <th style={{ width: 90, textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                )}

                {isRfq ? (
                  <>
                    {/* 6. Vendor Quote 1 */}
                    <th style={{ width: 140, textAlign: 'right', background: '#f1f5f9' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.vendorInitialQuote}</th>

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
                    >{UI_STRINGS.componentsVendorNegotiationWorkspace.buyerCounterofferRate}{latestRound ? interpolateUiString(UI_STRINGS.componentsVendorNegotiationWorkspace.rRoundNumber, { "roundNumber": latestRound.roundNumber }) : ''}{UI_STRINGS.componentsVendorNegotiationWorkspace.copy1ysfv93}</th>

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
                    >{UI_STRINGS.componentsVendorNegotiationWorkspace.vendorSRevisedQuote}</th>

                    {/* 9. Proposed Line Total */}
                    <th style={{ minWidth: 150, textAlign: 'right', background: '#f8fafc' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.proposedLineTotal}</th>

                    {/* 10. Variance vs Buyer Offer */}
                    <th style={{ minWidth: 130, textAlign: 'center', background: '#f8fafc' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.varianceVsBuyerOffer}</th>
                  </>
                ) : (
                  <>
                    {/* Rate Card Columns */}
                    <th style={{ width: 140, textAlign: 'right', background: '#f1f5f9' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.contractedRate}</th>
                    <th style={{ width: 140, textAlign: 'right', background: '#f8fafc' }}>{UI_STRINGS.common.benchmarkRate}</th>
                    <th style={{ minWidth: 160 }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.scopeLocation}</th>
                    <th
                      style={{
                        minWidth: 180,
                        textAlign: 'right',
                        background: '#ecfdf5',
                        color: '#065f46',
                        borderLeft: '2px solid #10b981',
                      }}
                    >{UI_STRINGS.componentsVendorNegotiationWorkspace.vendorSProposedNextRate}</th>
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
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.line}{line.lineNumber || idx + 1}{UI_STRINGS.common.copyko5tj9}{line.category || UI_STRINGS.common.general}
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
                        title={interpolateUiString(UI_STRINGS.common.value1, { "value1": line.specification || 'Standard specifications as per BOQ' })}
                      >
                        {line.specification || UI_STRINGS.componentsVendorNegotiationWorkspace.standardSpecification}
                      </div>
                    </td>

                    {/* UOM */}
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                      {line.uom}
                    </td>

                    {isRfq && (
                      /* Quantity */
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                        {qty.toLocaleString(I18N_CONFIG.defaultLocale)}
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
                              <div>{UI_STRINGS.common.copy1g8b5tg}{q1Rate.toLocaleString(I18N_CONFIG.defaultLocale)}</div>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.total}{(q1Rate * qty).toLocaleString(I18N_CONFIG.defaultLocale)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">{UI_STRINGS.common.awaitingQuote}</span>
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
                              <div style={{ fontSize: 13, color: '#0369a1' }}>{UI_STRINGS.common.copy1g8b5tg}{buyerRate.toLocaleString(I18N_CONFIG.defaultLocale)}
                              </div>
                              <div style={{ fontSize: 10, color: '#0284c7' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.total}{(buyerRate * qty).toLocaleString(I18N_CONFIG.defaultLocale)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted text-xs">{UI_STRINGS.common.copy4s9bsz}</span>
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
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{submittedRevisedRate.toLocaleString(I18N_CONFIG.defaultLocale)}
                                </div>
                                <div style={{ fontSize: 10, color: '#059669' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.total}{(submittedRevisedRate * qty).toLocaleString(I18N_CONFIG.defaultLocale)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-xs font-semibold border border-amber-200">{UI_STRINGS.componentsVendorNegotiationWorkspace.awaitingVendorResponse}</span>
                            )
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                              <span style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>{UI_STRINGS.common.copy1g8b5tg}</span>
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
                                placeholder={UI_STRINGS.common.copywwhtor}
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
                            interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": activeLineTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 }) })
                          ) : (
                            <span className="text-slate-400">{UI_STRINGS.common.copy4s9bsz}</span>
                          )}
                        </td>

                        {/* Variance vs Buyer Offer */}
                        <td style={{ textAlign: 'center', background: '#f8fafc' }}>
                          {(() => {
                            if (activeRevisedRate === null || buyerRate === null) return <span className="text-muted text-xs">{UI_STRINGS.common.copy4s9bsz}</span>;
                            const diff = activeRevisedRate - buyerRate;
                            if (diff === 0) {
                              return (
                                <span className="badge badge-approved text-xs" style={{ padding: '2px 6px' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.matched}</span>
                              );
                            }
                            if (diff < 0) {
                              return (
                                <span className="badge badge-approved text-xs" style={{ padding: '2px 6px' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.copy134eyoj}{Math.abs(diff).toLocaleString(I18N_CONFIG.defaultLocale)}
                                </span>
                              );
                            }
                            return (
                              <span className="badge badge-submitted text-xs" style={{ padding: '2px 6px' }}>{UI_STRINGS.common.copy148wag9}{diff.toLocaleString(I18N_CONFIG.defaultLocale)}
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
                        >{UI_STRINGS.common.copy1g8b5tg}{Number(line.rate || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                        </td>

                        {/* Benchmark Rate */}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{UI_STRINGS.common.copy1g8b5tg}{Number(line.benchmarkRate || line.historicalRate || line.rate || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                        </td>

                        {/* Scope / Location */}
                        <td style={{ fontSize: 11, color: '#64748b' }}>
                          {line.location || data.location || UI_STRINGS.componentsVendorNegotiationWorkspace.allLocations}
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
                            <span style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>{UI_STRINGS.common.copy1g8b5tg}</span>
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
                  <span>{UI_STRINGS.componentsVendorNegotiationWorkspace.totalScope}{lines.length}{UI_STRINGS.componentsVendorNegotiationWorkspace.lineItems}</span>
                </td>

                {isRfq && (
                  <>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#475569' }}>{UI_STRINGS.common.copy1g8b5tg}{previousTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ textAlign: 'right', color: '#64748b' }}>{UI_STRINGS.common.copy4s9bsz}</td>
                    {parsedRoundRates.length >= 2 && (
                      <>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>{UI_STRINGS.common.copy4s9bsz}</td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>{UI_STRINGS.common.copy4s9bsz}</td>
                      </>
                    )}
                    {parsedRoundRates.length >= 3 &&
                      parsedRoundRates.slice(2).map((_, i) => (
                        <td key={i} style={{ textAlign: 'right', color: '#64748b' }}>{UI_STRINGS.common.copy4s9bsz}</td>
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
                    >{UI_STRINGS.componentsVendorNegotiationWorkspace.proposedRFQTotal}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: 16,
                        fontWeight: 800,
                        color: '#166534',
                      }}
                    >{UI_STRINGS.common.copy1g8b5tg}{proposedTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 })}
                    </td>
                  </>
                )}

                {!isRfq && (
                  <>
                    <td colSpan={2} style={{ textAlign: 'right', fontSize: 12, color: '#065f46' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.proposedAverage}</td>
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
                    >{UI_STRINGS.common.copy1g8b5tg}{Math.round(proposedTotal / (lines.length || 1)).toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.componentsVendorNegotiationWorkspace.unit}</td>
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
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.commercialJustificationTechnicalRemarks}</label>
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
                {notes || latestRound?.notes || (isBuyerRole ? UI_STRINGS.componentsVendorNegotiationWorkspace.noRemarksProvidedByVendorForThisRound : UI_STRINGS.componentsVendorNegotiationWorkspace.noRemarksSubmitted)}
              </div>
            ) : (
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={UI_STRINGS.componentsVendorNegotiationWorkspace.stateAnyPaymentMilestoneAssumptionsLeadTimesOrCommercialJustificationForYourProposedRates}
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
                <span style={{ fontWeight: 700, color: '#1e40af' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.declareAsBindingBestFinalOfferBAFO}</span>
                <span style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 2 }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.locksTheseCommercialRatesForFinalBuyerProcurementCommitteeEvaluationAndPPOAwardDecision}</span>
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
              <span>{UI_STRINGS.componentsVendorNegotiationWorkspace.thisRoundWasDeclaredAsABindingBestFinalOfferBAFO}</span>
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
            {isBuyerRole ? UI_STRINGS.componentsVendorNegotiationWorkspace.backToRFQ : UI_STRINGS.componentsVendorNegotiationWorkspace.cancelReturn}
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
              <span>{UI_STRINGS.common.saveDraft}</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isBuyerRole ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isVendorRevisionSubmitted ? (
                <span className="badge badge-approved" style={{ fontSize: 12, padding: '6px 12px' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.vendorRevisionSubmittedRound}{latestRound?.roundNumber || 1}{UI_STRINGS.common.copyc7zu6c}</span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: 12, padding: '6px 12px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>{UI_STRINGS.componentsVendorNegotiationWorkspace.awaitingVendorResponseRound}{latestRound?.roundNumber || 1}{UI_STRINGS.common.copyc7zu6c}</span>
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
              <span>{UI_STRINGS.componentsVendorNegotiationWorkspace.revisionSubmittedForRound}{latestRound?.roundNumber || 1}{UI_STRINGS.componentsVendorNegotiationWorkspace.readOnly}</span>
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
                      <span>{UI_STRINGS.componentsVendorNegotiationWorkspace.submittingFinal}</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      <span>{UI_STRINGS.componentsVendorNegotiationWorkspace.submitBindingFinalOffer}</span>
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
                    <span>{UI_STRINGS.componentsVendorNegotiationWorkspace.submittingOffer}</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>
                      {isRfq
                        ? isFinalOffer
                          ? UI_STRINGS.componentsVendorNegotiationWorkspace.submitBindingFinalOffer
                          : UI_STRINGS.componentsVendorNegotiationWorkspace.submitRevisedNegotiationOffer
                        : UI_STRINGS.componentsVendorNegotiationWorkspace.submitProposedRateCardRevisions}
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
