'use client';
// src/app/(app)/vendor-portal/rfqs/[id]/page.tsx
// Dedicated Vendor RFQ Workspace: Itemized Quotation Submission & Clarifications
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Save,
  Send,
  RefreshCw,
  Sparkles,
  Layers,
  History,
  Building2,
  Info,
} from 'lucide-react';
import RfqChatDrawer from '@/components/RfqChatDrawer';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { reportHandledClientFailure } from '@/lib/observability/client-reporter';


export default function VendorRfqWorkspacePage() {
  const toast = useToast();
  const params = useParams();
  const rfqId = params.id as string;

  const [rfq, setRfq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Quote input form state per line
  const [lineQuotes, setLineQuotes] = useState<Record<string, {
    unitRate: string;
    gstPercent: string;
    leadTimeDays: string;
    technicalCompliance: string;
    remarks: string;
  }>>({});

  const [validUntil, setValidUntil] = useState('');
  const [commercialNotes, setCommercialNotes] = useState('');
  const [isEditingRevision, setIsEditingRevision] = useState(false);

  // Local draft state
  const draftStorageKey = `procpx_quote_draft_${rfqId}`;
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Chat Drawer state
  const [chatOpen, setChatOpen] = useState(false);

  const loadRfqDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor-portal/rfqs/${rfqId}`);
      if (!res.ok) {
        const err = await res.json().catch((error: unknown) => {
          reportHandledClientFailure(error, {
            operation: 'parse_vendor_rfq_load_error_response',
            route: '/api/vendor-portal/rfqs/:id',
            recordId: rfqId,
            fallback: 'show_generic_load_error',
          });
          return {};
        });
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToLoadRfqWorkspace }));
      }
      const data = await res.json();
      const r = data.rfq;
      setRfq(r);

      // Pre-fill line quotes from the latest submitted quote if available
      const latestQuote = r.quotes?.[0];
      const initialLines: Record<string, any> = {};

      r.lines?.forEach((line: any) => {
        const existingLine = latestQuote?.lines?.find((ql: any) => ql.rfqLineId === line.id);
        initialLines[line.id] = {
          unitRate: existingLine ? String(existingLine.unitRate) : '',
          gstPercent: existingLine ? String(existingLine.gstPercent ?? 18) : '18',
          leadTimeDays: existingLine ? String(existingLine.leadTimeDays || '') : '14',
          technicalCompliance: existingLine ? existingLine.technicalCompliance : 'COMPLIANT',
          remarks: existingLine ? (existingLine.remarks || '') : '',
        };
      });

      setLineQuotes(initialLines);

      if (latestQuote) {
        setCommercialNotes(latestQuote.commercialNotes || '');
        if (latestQuote.validUntil) {
          setValidUntil(new Date(latestQuote.validUntil).toISOString().split('T')[0]);
        }
      }

      // Check if a saved local draft exists and restore it
      try {
        const saved = localStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.lineQuotes && Object.keys(parsed.lineQuotes).length > 0) {
            const restoredLines = { ...initialLines };
            Object.entries(parsed.lineQuotes).forEach(([lineId, draftLine]: [string, any]) => {
              restoredLines[lineId] = { ...initialLines[lineId], ...draftLine };
            });
            setLineQuotes(restoredLines);
            if (parsed.commercialNotes !== undefined) setCommercialNotes(parsed.commercialNotes);
            if (parsed.validUntil !== undefined) setValidUntil(parsed.validUntil);
            if (parsed.savedAt) setDraftSavedAt(parsed.savedAt);
          }
        }
      } catch (error: unknown) {
        reportHandledClientFailure(error, {
          operation: 'restore_vendor_quote_draft',
          route: '/vendor-portal/rfqs/:id',
          recordId: rfqId,
          fallback: 'use_quote_values_from_rfq',
        });
      }
    } catch (e: any) {
      reportHandledClientFailure(e, {
        operation: 'load_vendor_rfq_detail',
        route: '/api/vendor-portal/rfqs/:id',
        recordId: rfqId,
        fallback: 'show_load_error',
      });
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRfqDetail();
  }, [rfqId]);

  const handleLineChange = (lineId: string, field: string, val: string) => {
    setLineQuotes((prev) => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        [field]: val,
      },
    }));
  };

  // Calculations
  const calculateTotals = () => {
    if (!rfq?.lines) return { subtotal: 0, taxTotal: 0, grandTotal: 0 };
    let subtotal = 0;
    let taxTotal = 0;

    rfq.lines.forEach((line: any) => {
      const q = lineQuotes[line.id];
      if (q && q.unitRate) {
        const rate = parseFloat(q.unitRate) || 0;
        const gst = parseFloat(q.gstPercent) || 0;
        const lineSub = (line.quantity || 1) * rate;
        const lineTax = lineSub * (gst / 100);
        subtotal += lineSub;
        taxTotal += lineTax;
      }
    });

    return {
      subtotal,
      taxTotal,
      grandTotal: subtotal + taxTotal,
    };
  };

  const totals = calculateTotals();

  const handleSaveDraft = () => {
    try {
      const now = new Date().toLocaleTimeString(I18N_CONFIG.defaultLocale, { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          lineQuotes,
          validUntil,
          commercialNotes,
          savedAt: now,
        })
      );
      setDraftSavedAt(now);
      setSuccessMessage(interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.draftSavedLocallyAtNowYouCanSafelyRefreshOrReturnAnytime, { "now": now }));
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (error: unknown) {
      reportHandledClientFailure(error, {
        operation: 'persist_vendor_quote_draft',
        route: '/vendor-portal/rfqs/:id',
        recordId: rfqId,
        fallback: 'show_draft_save_error',
      });
      setError(UI_STRINGS.common.failedToSaveDraftLocallyInBrowserStorage);
    }
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payloadLines = rfq.lines.map((line: any) => {
        const q = lineQuotes[line.id] || {};
        return {
          rfqLineId: line.id,
          unitRate: parseFloat(q.unitRate) || 0,
          gstPercent: parseFloat(q.gstPercent) || 0,
          leadTimeDays: q.leadTimeDays ? parseInt(q.leadTimeDays, 10) : null,
          technicalCompliance: q.technicalCompliance || 'COMPLIANT',
          remarks: q.remarks || null,
        };
      });

      const res = await fetch(`/api/vendor-portal/rfqs/${rfqId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: payloadLines,
          validUntil: validUntil || null,
          commercialNotes: commercialNotes || null,
          technicalCompliance: 'COMPLIANT',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch((error: unknown) => {
          reportHandledClientFailure(error, {
            operation: 'parse_vendor_quote_submit_error_response',
            route: '/api/vendor-portal/rfqs/:id',
            recordId: rfqId,
            fallback: 'show_generic_submission_error',
          });
          return {};
        });
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSubmitQuotation }));
      }

      const resData = await res.json();
      try {
        localStorage.removeItem(draftStorageKey);
        setDraftSavedAt(null);
      } catch (error: unknown) {
        reportHandledClientFailure(error, {
          operation: 'clear_submitted_quote_draft',
          route: '/api/vendor-portal/rfqs/:id/quotes',
          recordId: rfqId,
          fallback: 'quotation_succeeded_but_local_draft_remains',
        });
      }
      toast.success(UI_STRINGS.appAppVendorPortalRfqsIdPage.quoteSubmittedSuccessfully, rfq?.rfqNumber, UI_STRINGS.common.userMessages.awaitingBuyerEvaluation);
      setSuccessMessage(UI_STRINGS.appAppVendorPortalRfqsIdPage.quoteSubmittedSuccessfully);
      loadRfqDetail();
    } catch (e: any) {
      reportHandledClientFailure(e, {
        operation: 'submit_vendor_quote',
        route: '/api/vendor-portal/rfqs/:id',
        recordId: rfqId,
        fallback: 'show_submission_error',
      });
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const allVendorRounds = useMemo(() => {
    return (rfq?.negotiations || [])
      .flatMap((n: any) => n.rounds || [])
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rfq?.negotiations]);

  const chronologicalBuyerOffers = useMemo(() => {
    return (rfq?.negotiations || [])
      .flatMap((n: any) => n.rounds || [])
      .filter((r: any) => r.counterOfferAmount !== null || (!r.revisedQuoteAmount && r.nextResponsibleParty === 'VENDOR'))
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [rfq?.negotiations]);

  const getBuyerOfferVersion = (roundId: string) => {
    const idx = chronologicalBuyerOffers.findIndex((r: any) => r.id === roundId);
    return idx >= 0 ? idx + 1 : 1;
  };

  const activeBuyerRound = useMemo(() => {
    return (
      allVendorRounds.find(
        (r: any) =>
          r.status !== 'SUPERSEDED' &&
          r.counterOfferAmount &&
          (!r.revisedQuoteAmount || r.nextResponsibleParty === 'VENDOR')
      ) || null
    );
  }, [allVendorRounds]);

  const hasActiveBuyerCounter = Boolean(activeBuyerRound);
  const latestRound = activeBuyerRound || allVendorRounds[0] || null;

  const isVendorRevisionSubmitted = Boolean(
    latestRound &&
    latestRound.revisedQuoteAmount !== null &&
    latestRound.revisedQuoteAmount > 0 &&
    (latestRound.status === 'REVISED_SUBMITTED' || latestRound.status === 'FINAL_OFFER_SUBMITTED') &&
    (latestRound.nextResponsibleParty === 'BUYER' || latestRound.buyerDecision !== null)
  );

  const buyerRateMap: Record<string, { rate: number; lineTotal?: number }> = {};
  if (latestRound?.lineItemsJson) {
    try {
      const parsed = typeof latestRound.lineItemsJson === 'string' ? JSON.parse(latestRound.lineItemsJson) : latestRound.lineItemsJson;
      if (Array.isArray(parsed)) {
        parsed.forEach((it: any) => {
          const k = it.rfqLineId || it.id || it.lineId;
          if (k && it.counterRate !== undefined) {
            buyerRateMap[k] = { rate: Number(it.counterRate), lineTotal: Number(it.lineTotal) };
          }
        });
      }
    } catch (error: unknown) {
      reportHandledClientFailure(error, {
        operation: 'parse_vendor_buyer_counter_offer_lines',
        route: '/api/vendor-portal/rfqs/:id',
        recordId: rfqId,
        roundId: latestRound.id,
        field: 'lineItemsJson',
        fallback: 'omit_counter_offer_line_rates',
      });
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
        <div>{UI_STRINGS.appAppVendorPortalRfqsIdPage.loadingRFQWorkspace}</div>
      </div>
    );
  }

  if (error && !rfq) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 20, borderRadius: 6 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!rfq) return null;

  const latestQuote = rfq?.quotes?.[0];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300, margin: '0 auto' }}>
      {/* ── BREADCRUMB & HEADER ─────────────────────────────────────────── */}
      <PageHeader
        title={interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.rfqNumberTitle, { "rfqNumber": rfq.rfqNumber, "title": rfq.title })}
        subtitle={interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.projectValue1ProjectCodeClientValue3, { "value1": rfq.project?.name || 'Enterprise Project', "projectCode": rfq.project?.projectCode, "value3": rfq.tenant?.name || UI_STRINGS.common.enterpriseClient })}
        backHref="/vendor-portal/rfqs"
        backLabel="Back to My RFQs"
        badge={<StatusBadge status={rfq.status} />}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40 }}
            >
              <MessageSquare size={15} />
              <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.clarificationChat}</span>
            </button>
            <button
              type="button"
              onClick={loadRfqDetail}
              className="btn btn-secondary"
              style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              title={UI_STRINGS.common.refresh2}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      {/* ── ALERTS ──────────────────────────────────────────────────────── */}
      {successMessage && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            padding: '12px 16px',
            borderRadius: 6,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: 6,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ── PACKAGE SUMMARY CARD ────────────────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{UI_STRINGS.common.submissionDeadline}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} color="#f59e0b" />
              <span>{rfq.submissionDeadline ? new Date(rfq.submissionDeadline).toLocaleDateString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.open}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.packageLineItems}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{rfq.lines?.length || 0}{UI_STRINGS.common.items}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.myCurrentOffer}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: hasActiveBuyerCounter && !isVendorRevisionSubmitted ? '#b45309' : latestQuote ? '#166534' : '#f59e0b' }}>
              {hasActiveBuyerCounter && !isVendorRevisionSubmitted
                ? UI_STRINGS.appAppVendorPortalRfqsIdPage.awaitingYourResponse
                : latestQuote
                ? interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.toLocaleStringVQuoteVersion, { "toLocaleString": Number(latestQuote.totalQuoteAmount || latestQuote.totalAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 }), "quoteVersion": latestQuote.quoteVersion })
                : UI_STRINGS.common.awaitingQuote}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{UI_STRINGS.common.negotiationStatus}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
              {rfq.negotiations && rfq.negotiations.length > 0 ? (
                <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={11} />
                  <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.negotiationActive}</span>
                </span>
              ) : (
                UI_STRINGS.appAppVendorPortalRfqsIdPage.standardStage
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BUYER COUNTEROFFER RECEIVED BANNER & RESPONSE ACTIONS ──────────── */}
      {(() => {
        if (!activeBuyerRound) return null;
        const latestRound = activeBuyerRound;

        return (
          <div
            className="card"
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              padding: 24,
              marginBottom: 24,
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                  <Sparkles size={18} color="#d97706" />
                  <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.buyerCounterofferReceivedBuyerOffer}{getBuyerOfferVersion(latestRound.id)}</span>
                  <span className="badge badge-submitted" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.responseRequired}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.categoryManagerSubmittedCounterofferOf}{' '}
                  <strong style={{ fontSize: 15, color: '#b45309' }}>{UI_STRINGS.common.copy1g8b5tg}{Number(latestRound.counterOfferAmount).toLocaleString(I18N_CONFIG.defaultLocale)}
                  </strong>
                  {latestRound.previousQuoteAmount ? interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.targetingToLocaleStringSavingsOnYourPreviousQuoteOfToLocaleString2, { "toLocaleString": (latestRound.previousQuoteAmount - latestRound.counterOfferAmount).toLocaleString(I18N_CONFIG.defaultLocale), "toLocaleString2": latestRound.previousQuoteAmount.toLocaleString(I18N_CONFIG.defaultLocale) }) : ''}
                  {' '}{UI_STRINGS.appAppVendorPortalRfqsIdPage.on}{new Date(latestRound.createdAt).toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.common.copyby08hd}</div>
                {latestRound.notes && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef3c7', borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: '#78350f' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.ldquo}{latestRound.notes}{UI_STRINGS.common.rdquo}</div>
                )}
                {latestRound.deadline && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} />
                    <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.responseRequestedBy}<strong>{new Date(latestRound.deadline).toLocaleDateString(I18N_CONFIG.defaultLocale)}</strong></span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {latestQuote && latestQuote.quoteVersion >= 5 ? (
                  <span className="badge badge-rejected" style={{ padding: '6px 12px' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.max5QuoteVersionsReached}</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        // Accept buyer counteroffer by pre-filling rates with buyer counter rates
                        const updated: Record<string, any> = {};
                        rfq.lines?.forEach((line: any) => {
                          const buyerRate = buyerRateMap[line.id]?.rate || Math.round((latestRound.counterOfferAmount / (latestRound.previousQuoteAmount || 1)) * (parseFloat(lineQuotes[line.id]?.unitRate) || line.benchmarkRate || 100));
                          updated[line.id] = {
                            ...lineQuotes[line.id],
                            unitRate: String(buyerRate),
                          };
                        });
                        setLineQuotes(updated);
                        setIsEditingRevision(true);
                      }}
                      className="btn btn-secondary"
                      style={{ fontSize: 13, background: '#ffffff', borderColor: '#f59e0b', color: '#b45309', fontWeight: 600 }}
                    >{UI_STRINGS.appAppVendorPortalRfqsIdPage.acceptCounterofferRates}</button>
                    {!isEditingRevision && (
                      <button
                        type="button"
                        onClick={() => setIsEditingRevision(true)}
                        className="btn btn-primary"
                        style={{ fontSize: 13, fontWeight: 600, background: '#d97706', borderColor: '#d97706' }}
                      >{UI_STRINGS.appAppVendorPortalRfqsIdPage.enterRevisedQuoteV}{(latestQuote?.quoteVersion || 0) + 1}{UI_STRINGS.common.copydv17a2}</button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Line-item breakdown of buyer offer */}
            <div style={{ marginTop: 16, background: '#ffffff', borderRadius: 6, border: '1px solid #fde68a', overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#fef3c7', color: '#92400e' }}>
                    <th style={{ width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                    <th>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ width: 80, textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                    <th style={{ width: 60 }}>{UI_STRINGS.common.uOM}</th>
                    <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.yourPreviousRate}</th>
                    <th style={{ width: 160, textAlign: 'right', fontWeight: 700 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.buyerCounterRate}</th>
                    <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.buyerLineTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.lines?.map((line: any, idx: number) => {
                    const prevQl = latestQuote?.lines?.find((l: any) => l.rfqLineId === line.id);
                    const prevRate = prevQl ? prevQl.unitRate : 0;
                    const bRate = buyerRateMap[line.id]?.rate || (latestRound?.counterOfferAmount && latestRound?.previousQuoteAmount ? Math.round((latestRound.counterOfferAmount / latestRound.previousQuoteAmount) * (prevRate || line.benchmarkRate || 100)) : null);
                    const bTotal = bRate ? bRate * (line.quantity || 1) : 0;

                    return (
                      <tr key={line.id}>
                        <td style={{ color: '#94a3b8' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{line.description}</td>
                        <td style={{ textAlign: 'right' }}>{line.quantity}</td>
                        <td style={{ color: '#64748b' }}>{line.uom}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{UI_STRINGS.common.copy1g8b5tg}{prevRate.toLocaleString(I18N_CONFIG.defaultLocale)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#b45309' }}>
                          {bRate ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": bRate.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#b45309' }}>
                          {bTotal > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": bTotal.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── READ-ONLY SUBMITTED QUOTATION SUMMARY (Shown after submission) ── */}
      {latestQuote && !isEditingRevision && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.submittedQuotationSummary}{latestQuote.quoteNumber}{UI_STRINGS.appAppVendorPortalRfqsIdPage.version}{latestQuote.quoteVersion}{UI_STRINGS.common.copyc7zu6c}</h2>
                {hasActiveBuyerCounter && !isVendorRevisionSubmitted ? (
                  <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                    <Clock size={12} />
                    <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.awaitingYourResponse}</span>
                  </span>
                ) : (
                  <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} />
                    <span>{latestQuote.quoteVersion === 1 ? UI_STRINGS.appAppVendorPortalRfqsIdPage.copy7oito6 : interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.quoteVQuoteVersionSubmitted, { "quoteVersion": latestQuote.quoteVersion })}</span>
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.persistedSubmissionTimestamp}<strong>{new Date(latestQuote.submittedAt || latestQuote.createdAt).toLocaleString(I18N_CONFIG.defaultLocale)}</strong>{UI_STRINGS.appAppVendorPortalRfqsIdPage.submittedBy}{latestQuote.submittedBy || UI_STRINGS.common.vendor}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-info" style={{ fontSize: 11, padding: '4px 8px' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.immutableRecordReadOnly}</span>
              {hasActiveBuyerCounter && (
                <button
                  type="button"
                  onClick={() => setIsEditingRevision(true)}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={13} />
                  <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.submitRevisedQuoteV}{latestQuote.quoteVersion + 1}{UI_STRINGS.common.copyc7zu6c}</span>
                </button>
              )}
            </div>
          </div>

          <div className="table-responsive">
            <table className="table enterprise-table" style={{ margin: 0, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                  <th>{UI_STRINGS.common.itemDescription}</th>
                  <th style={{ width: 80, textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                  <th style={{ width: 60 }}>{UI_STRINGS.common.uOM}</th>
                  <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.common.quotedUnitRate}</th>
                  <th style={{ width: 80, textAlign: 'right' }}>{UI_STRINGS.common.gST}</th>
                  <th style={{ width: 120 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.compliance}</th>
                  <th style={{ width: 150, textAlign: 'right' }}>{UI_STRINGS.common.lineTotal}</th>
                </tr>
              </thead>
              <tbody>
                {rfq.lines?.map((line: any, idx: number) => {
                  const ql = latestQuote.lines?.find((l: any) => l.rfqLineId === line.id);
                  const rate = ql ? ql.unitRate : 0;
                  const gst = ql ? (ql.taxPercent ?? 18) : 18;
                  const lineTotal = ql ? ql.lineTotal : (rate * (line.quantity || 1) * (1 + gst / 100));

                  return (
                    <tr key={line.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{line.description}</div>
                        {line.specification && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {line.specification}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{line.quantity}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{line.uom}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{UI_STRINGS.common.copy1g8b5tg}{rate.toLocaleString(I18N_CONFIG.defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{gst}{UI_STRINGS.common.copy8w4luo}</td>
                      <td>
                        <span className="badge badge-approved" style={{ fontSize: 10 }}>{UI_STRINGS.common.cOMPLIANT}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>{UI_STRINGS.common.copy1g8b5tg}{lineTotal.toLocaleString(I18N_CONFIG.defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 340 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.baseSubtotal}</span>
                <span style={{ fontWeight: 600 }}>{UI_STRINGS.common.copytfdhmk}{Number(latestQuote.totalBaseAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.taxGST}</span>
                <span style={{ fontWeight: 600 }}>{UI_STRINGS.common.copytfdhmk}{Number(latestQuote.taxAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid var(--border-color)', fontSize: 16, fontWeight: 700 }}>
                <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.totalPersistedOffer}</span>
                <span style={{ color: '#166534' }}>{UI_STRINGS.common.copytfdhmk}{Number(latestQuote.totalQuoteAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Commercial conditions read-only */}
          {(latestQuote.commercialTerms || latestQuote.validUntil) && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#475569', display: 'flex', gap: 24 }}>
              {latestQuote.validUntil && (
                <div>
                  <strong>{UI_STRINGS.appAppVendorPortalRfqsIdPage.commercialValidity}</strong> {new Date(latestQuote.validUntil).toLocaleDateString(I18N_CONFIG.defaultLocale)}
                </div>
              )}
              {latestQuote.commercialTerms && (
                <div>
                  <strong>{UI_STRINGS.appAppVendorPortalRfqsIdPage.paymentCommercialTerms}</strong> {latestQuote.commercialTerms}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.iThisSubmittedQuotationIsAnImmutableHistoricalRecordCategoryManagersAreEvaluatingYourOfferIfACounterofferIsDispatchedYouWillReceiveANotificationAndTheOptionToSubmitARevisedQuotationRound2}</div>
        </div>
      )}

      {/* ── QUOTE SUBMISSION / REVISION FORM (Shown when entering Quote 1 or Revision) ── */}
      {(!latestQuote || isEditingRevision || (hasActiveBuyerCounter && !isVendorRevisionSubmitted)) && (
        <form onSubmit={handleSubmitQuote}>
          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {!latestQuote ? UI_STRINGS.appAppVendorPortalRfqsIdPage.enterInitialCommercialQuotationQuoteV1 : interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.submitRevisedQuotationQuoteVValue1, { "value1": (latestQuote?.quoteVersion || 1) + 1 })}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.ratesInIndianRupeesINRAllLineItemsMustHavePositiveUnitRates}</span>
              </div>

              {isEditingRevision && (
                <button
                  type="button"
                  onClick={() => setIsEditingRevision(false)}
                  className="btn btn-secondary btn-sm"
                >{UI_STRINGS.appAppVendorPortalRfqsIdPage.cancelRevisionReturnToSummary}</button>
              )}
            </div>

            <div className="table-responsive">
              <table className="table enterprise-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                    <th>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ width: 80, textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                    <th style={{ width: 60 }}>{UI_STRINGS.common.uOM}</th>
                    {latestQuote && <th style={{ width: 130, textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.previousQuote}</th>}
                    {hasActiveBuyerCounter && (
                      <th
                        style={{
                          width: 160,
                          textAlign: 'right',
                          background: '#e0f2fe',
                          color: '#0369a1',
                          borderLeft: '2px solid #0284c7',
                          borderRight: '1px solid #0284c7',
                          fontWeight: 700,
                        }}
                      >{UI_STRINGS.appAppVendorPortalRfqsIdPage.buyerCounterRate}</th>
                    )}
                    <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.proposedUnitRate}</th>
                    <th style={{ width: 85 }}>{UI_STRINGS.common.gST}</th>
                    <th style={{ width: 120 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.compliance}</th>
                    <th style={{ width: 95 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.leadTime}</th>
                    <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.common.lineTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.lines?.map((line: any, idx: number) => {
                    const q = lineQuotes[line.id] || {
                      unitRate: '',
                      gstPercent: '18',
                      leadTimeDays: '14',
                      technicalCompliance: 'COMPLIANT',
                      remarks: '',
                    };
                    const rate = parseFloat(q.unitRate) || 0;
                    const gst = parseFloat(q.gstPercent) || 0;
                    const lineTotal = (line.quantity || 1) * rate * (1 + gst / 100);

                    return (
                      <tr key={line.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{line.description || line.itemDescription}</div>
                          {line.specification && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{line.specification}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{line.quantity}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{line.uom}</td>

                        {/* Previous Quote Rate */}
                        {latestQuote && (
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#475569', background: '#f8fafc' }}>
                            {(() => {
                              const ql = latestQuote.lines?.find((l: any) => l.rfqLineId === line.id);
                              return ql ? `₹${Number(ql.unitRate).toLocaleString(I18N_CONFIG.defaultLocale)}` : '—';
                            })()}
                          </td>
                        )}

                        {/* Buyer Counteroffer Rate */}
                        {hasActiveBuyerCounter && (
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
                            {(() => {
                              const buyerRate = buyerRateMap[line.id]?.rate || null;
                              if (!buyerRate) return <span className="text-muted">{UI_STRINGS.common.copy4s9bsz}</span>;
                              return (
                                <div>
                                  <div style={{ fontSize: 13, color: '#0369a1' }}>{UI_STRINGS.common.copy1g8b5tg}{buyerRate.toLocaleString(I18N_CONFIG.defaultLocale)}</div>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={q.unitRate}
                            onChange={(e) => handleLineChange(line.id, 'unitRate', e.target.value)}
                            placeholder={UI_STRINGS.common.copywwhtor}
                            className="form-control"
                            style={{ textAlign: 'right', fontSize: 13, padding: '4px 8px', fontWeight: 600 }}
                          />
                        </td>
                        <td>
                          <select
                            value={q.gstPercent}
                            onChange={(e) => handleLineChange(line.id, 'gstPercent', e.target.value)}
                            className="form-control"
                            style={{ fontSize: 12, padding: '4px 6px' }}
                          >
                            <option value="0">{UI_STRINGS.appAppVendorPortalRfqsIdPage.copy3l4h8e}</option>
                            <option value="5">{UI_STRINGS.appAppVendorPortalRfqsIdPage.copy16f2v8v}</option>
                            <option value="12">{UI_STRINGS.appAppVendorPortalRfqsIdPage.copysx0w2l}</option>
                            <option value="18">{UI_STRINGS.appAppVendorPortalRfqsIdPage.copy1rannvv}</option>
                            <option value="28">{UI_STRINGS.appAppVendorPortalRfqsIdPage.copyhh4a0m}</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={q.technicalCompliance}
                            onChange={(e) => handleLineChange(line.id, 'technicalCompliance', e.target.value)}
                            className="form-control"
                            style={{ fontSize: 12, padding: '4px 6px' }}
                          >
                            <option value="COMPLIANT">{UI_STRINGS.common.compliant}</option>
                            <option value="PARTIAL_COMPLIANCE">{UI_STRINGS.appAppVendorPortalRfqsIdPage.partial}</option>
                            <option value="EXCEPTION">{UI_STRINGS.appAppVendorPortalRfqsIdPage.exception}</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={q.leadTimeDays}
                            onChange={(e) => handleLineChange(line.id, 'leadTimeDays', e.target.value)}
                            placeholder={UI_STRINGS.appAppVendorPortalRfqsIdPage.days}
                            className="form-control"
                            style={{ fontSize: 12, padding: '4px 6px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {lineTotal > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleString2, { "toLocaleString": lineTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) }) : UI_STRINGS.common.copy4s9bsz}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Commercial Totals */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 340 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.netSubtotal}</span>
                  <span style={{ fontWeight: 600 }}>{UI_STRINGS.common.copy1g8b5tg}{totals.subtotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.estimatedGST}</span>
                  <span style={{ fontWeight: 600 }}>{UI_STRINGS.common.copy1g8b5tg}{totals.taxTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid var(--border-color)', fontSize: 16, fontWeight: 700 }}>
                  <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.totalOfferAmount}</span>
                  <span style={{ color: '#2563eb' }}>{UI_STRINGS.common.copy1g8b5tg}{totals.grandTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Conditions & Notes */}
          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.commercialConditionsValidity}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div>
                <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.quotationValidityDate}</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="form-control"
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.paymentTermsCommercialNotes}</label>
                <textarea
                  rows={2}
                  value={commercialNotes}
                  onChange={(e) => setCommercialNotes(e.target.value)}
                  placeholder={UI_STRINGS.appAppVendorPortalRfqsIdPage.eG30DaysCreditFromInvoiceSubmission}
                  className="form-control"
                />
              </div>
            </div>
          </div>

          {/* Submit Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {draftSavedAt && (
                <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>{interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.draftSavedLocallyAtNow, { now: draftSavedAt })}
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveDraft}
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <Save size={14} />
                <span>{UI_STRINGS.common.saveDraft}</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting || totals.grandTotal <= 0}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14 }}
            >
              {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              <span>{!latestQuote ? UI_STRINGS.appAppVendorPortalRfqsIdPage.submit1stQuote : interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsIdPage.submitQuoteVersionValue1, { "value1": (latestQuote?.quoteVersion || 0) + 1 })}</span>
            </button>
          </div>
        </form>
      )}

      {/* ── QUOTE HISTORY (Vendor's Own History Only) ─────────────────── */}
      {rfq.quotes && rfq.quotes.length > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} style={{ color: '#2563eb' }} />
            <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.mySubmissionAuditHistoryQuotes15}</span>
          </h2>
          <div className="table-responsive">
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>{UI_STRINGS.common.quoteNumber}</th>
                  <th>{UI_STRINGS.common.version}</th>
                  <th>{UI_STRINGS.common.submittedAt}</th>
                  <th>{UI_STRINGS.common.status}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.totalAmount}</th>
                </tr>
              </thead>
              <tbody>
                {rfq.quotes.map((q: any) => (
                  <tr key={q.id}>
                    <td style={{ fontWeight: 600 }}>{q.quoteNumber}</td>
                    <td>{UI_STRINGS.common.v}{q.quoteVersion}</td>
                    <td>{new Date(q.submittedAt).toLocaleString(I18N_CONFIG.defaultLocale)}</td>
                    <td><span className="badge badge-submitted">{q.status}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }}>{UI_STRINGS.common.copy1g8b5tg}{Number(q.totalQuoteAmount || q.totalAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BUYER COUNTEROFFER HISTORY (Buyer Offers 1–4) ───────────── */}
      {allVendorRounds && allVendorRounds.length > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: '#d97706' }} />
            <span>{UI_STRINGS.appAppVendorPortalRfqsIdPage.categoryManagerCounterofferHistoryBuyerOffers14}</span>
          </h2>
          <div className="table-responsive">
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>{UI_STRINGS.appAppVendorPortalRfqsIdPage.offerVersion}</th>
                  <th>{UI_STRINGS.appAppVendorPortalRfqsIdPage.dispatchedAt}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.targetCounteroffer}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.vendorResponse}</th>
                  <th>{UI_STRINGS.common.status}</th>
                  <th>{UI_STRINGS.appAppVendorPortalRfqsIdPage.commercialNotes}</th>
                </tr>
              </thead>
              <tbody>
                {allVendorRounds.map((r: any) => {
                  const isPending = !r.revisedQuoteAmount && r.nextResponsibleParty === 'VENDOR';
                  return (
                    <tr key={r.id || r.roundNumber}>
                      <td style={{ fontWeight: 700, color: '#b45309' }}>{UI_STRINGS.appAppVendorPortalRfqsIdPage.buyerOffer}{getBuyerOfferVersion(r.id)}</td>
                      <td>{new Date(r.createdAt).toLocaleString(I18N_CONFIG.defaultLocale)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#b45309', fontFamily: 'monospace' }}>{UI_STRINGS.common.copy1g8b5tg}{Number(r.counterOfferAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: r.revisedQuoteAmount ? '#166534' : '#64748b' }}>
                        {r.revisedQuoteAmount ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": Number(r.revisedQuoteAmount).toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                      </td>
                      <td>
                        <span className={`badge ${isPending ? 'badge-review' : 'badge-approved'}`}>
                          {isPending ? UI_STRINGS.appAppVendorPortalRfqsIdPage.responseRequired : r.status ? r.status.replace(/_/g, ' ') : UI_STRINGS.appAppVendorPortalRfqsIdPage.addressed}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', maxWidth: 280 }}>
                        {r.notes || UI_STRINGS.common.copy4s9bsz}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CLARIFICATION CHAT DRAWER ─────────────────────────────────── */}
      {chatOpen && (
        <RfqChatDrawer
          rfqId={rfq.id}
          rfqNumber={rfq.rfqNumber}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          isVendorUser={true}
        />
      )}
    </div>
  );
}
