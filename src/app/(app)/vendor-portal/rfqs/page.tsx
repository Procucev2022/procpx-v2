'use client';
// src/app/(app)/vendor-portal/rfqs/page.tsx
// proCPX — Vendor Portal: My RFQs & Bids Register with Dedicated Negotiation Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useCallback, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  ArrowRight,
  Sparkles,
  Building2,
  Calendar,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  TrendingDown,
} from 'lucide-react';
import RfqChatDrawer from '@/components/RfqChatDrawer';
import VendorNegotiationWorkspace from '@/components/VendorNegotiationWorkspace';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { VENDOR_RFQ_PAGE_SIZE } from './page.constants';
import type { VendorPortalRfqSummary } from '@app-types/app/api/vendor-portal-rfqs.types';


export default function VendorRfqsPage() {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const sessionVendorId = sessionUser?.vendorId;
  const sessionVendorName = sessionUser?.name || undefined;

  const [rfqs, setRfqs] = useState<any[]>([]);
  const [totalRfqs, setTotalRfqs] = useState(0);
  const [nextRfqCursor, setNextRfqCursor] = useState<string | null>(null);
  const [hasMoreRfqs, setHasMoreRfqs] = useState(false);
  const [loadingMoreRfqs, setLoadingMoreRfqs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'NEGOTIATION' | 'AWARDED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Table horizontal scrolling container ref
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Dedicated Full-Window Negotiation Workspace state
  const [negotiatingRfq, setNegotiatingRfq] = useState<any | null>(null);

  // Chat Drawer state
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatRfq, setChatRfq] = useState<any | null>(null);

  const loadRfqs = useCallback(async (append = false) => {
    if (append) setLoadingMoreRfqs(true);
    else setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ pageSize: String(VENDOR_RFQ_PAGE_SIZE) });
      if (append && nextRfqCursor) query.set('cursor', nextRfqCursor);
      if (!append && typeof window !== 'undefined') {
        const negotiate = new URLSearchParams(window.location.search).get('negotiate');
        if (negotiate) query.set('search', negotiate);
      }
      const res = await fetch(`/api/vendor-portal/rfqs?${query.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToLoadRfqs }));
      }
      const data = await res.json();
      const list = (data.rfqs || []) as VendorPortalRfqSummary[];
      setRfqs((current) => append
        ? [...current, ...list.filter((item) => !current.some((loaded) => loaded.id === item.id))]
        : list);
      setTotalRfqs(Number(data.total) || list.length);
      setNextRfqCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setHasMoreRfqs(Boolean(data.hasMore));

      // Check if URL has ?negotiate=<rfqNumber or id> to auto-open workspace
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const negParam = params.get('negotiate');
        if (negParam) {
          const match = list.find(
            (r) => r.id === negParam || r.rfqNumber?.toLowerCase() === negParam.toLowerCase()
          );
          if (match && !append) {
            setNegotiatingRfq(match);
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMoreRfqs(false);
    }
  }, [nextRfqCursor]);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        if (data?.user) setSessionUser(data.user);
      })
      .catch(() => {});
    void loadRfqs();
  }, [loadRfqs]);

  // Format date helper: deterministic and clean
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

  // Scroll helpers
  const handleScrollLeft = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  // Mouse wheel handler to support Shift + Wheel and horizontal movement smoothly
  const handleTableWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && e.deltaY !== 0) {
      if (tableContainerRef.current) {
        tableContainerRef.current.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }
  };

  // Filtered RFQs based on search and tab
  const filteredRfqs = rfqs.filter((r) => {
    const matchesSearch =
      r.rfqNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.clientTenant?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    const hasQuote = r.quotes && r.quotes.length > 0;
    const hasPpo = r.ppos && r.ppos.length > 0;
    const isNegotiating = r.negotiations && r.negotiations.length > 0;

    if (activeTab === 'PENDING') return !hasQuote;
    if (activeTab === 'NEGOTIATION') return isNegotiating && !hasPpo;
    if (activeTab === 'AWARDED') return hasPpo;
    return true;
  });

  // ── DEDICATED FULL-WINDOW NEGOTIATION WORKSPACE ──────────────────────
  if (negotiatingRfq) {
    const effectiveVendorId =
      sessionVendorId ||
      negotiatingRfq.invitedVendors?.[0]?.vendorId ||
      negotiatingRfq.quotes?.[0]?.vendorId;

    return (
      <VendorNegotiationWorkspace
        mode="RFQ"
        data={negotiatingRfq}
        vendorId={effectiveVendorId}
        vendorName={sessionVendorName}
        onBack={() => {
          setNegotiatingRfq(null);
          loadRfqs();
        }}
        onSuccess={() => {
          loadRfqs();
        }}
      />
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* -- HEADER -- */}
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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{UI_STRINGS.appAppVendorPortalRfqsPage.myRFQsBidsRegister}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{UI_STRINGS.appAppVendorPortalRfqsPage.manageCommercialBidsTechnicalClarificationsAndNegotiationRoundsForInvitedPackages}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => loadRfqs()}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>{UI_STRINGS.common.refresh2}</span>
          </button>
        </div>
      </div>

      {/* -- FILTER, SEARCH & HORIZONTAL SCROLL CONTROLS -- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['ALL', 'PENDING', 'NEGOTIATION', 'AWARDED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 13, padding: '6px 14px' }}
            >
              {tab === 'ALL' && interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsPage.allInvitedLength, { "length": totalRfqs })}
              {tab === 'PENDING' && UI_STRINGS.common.pendingQuote}
              {tab === 'NEGOTIATION' && UI_STRINGS.common.inNegotiation}
              {tab === 'AWARDED' && UI_STRINGS.appAppVendorPortalRfqsPage.pPOAwarded}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Search Bar */}
          <div style={{ position: 'relative', width: 260 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={UI_STRINGS.appAppVendorPortalRfqsPage.searchRFQClientProject}
              className="form-control"
              style={{ paddingLeft: 34, fontSize: 13 }}
            />
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          </div>

          {/* Table Horizontal Scroll Navigation Aid */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: '#f8fafc',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              padding: '2px 4px',
            }}
            title={UI_STRINGS.appAppVendorPortalRfqsPage.horizontalScrollHelperForDesktop}
          >
            <button
              type="button"
              onClick={handleScrollLeft}
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: 11, border: 'none', background: 'transparent' }}
              title={UI_STRINGS.appAppVendorPortalRfqsPage.scrollTableLeft}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{UI_STRINGS.appAppVendorPortalRfqsPage.scroll}</span>
            <button
              type="button"
              onClick={handleScrollRight}
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: 11, border: 'none', background: 'transparent' }}
              title={UI_STRINGS.appAppVendorPortalRfqsPage.scrollTableRightToActions}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* -- ERROR ALERT -- */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 16, borderRadius: 6, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* -- TABLE OR EMPTY STATE -- */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>{UI_STRINGS.appAppVendorPortalRfqsPage.loadingInvitedRFQs}</div>
        </div>
      ) : filteredRfqs.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileText size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>{UI_STRINGS.common.noRFQsFound}</h3>
          <p style={{ fontSize: 13, margin: 0 }}>
            {searchTerm ? UI_STRINGS.appAppVendorPortalRfqsPage.noRFQsMatchYourSearchFilter : UI_STRINGS.appAppVendorPortalRfqsPage.youHaveNotBeenInvitedToAnyRFQsAtThisTime}
          </p>
        </div>
      ) : (
        <div
          ref={tableContainerRef}
          onWheel={handleTableWheel}
          className="table-responsive"
          style={{
            background: '#ffffff',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 24,
          }}
        >
          <table
            className="table enterprise-table"
            style={{
              margin: 0,
              minWidth: 1480,
              width: '100%',
              tableLayout: 'fixed',
            }}
          >
            <thead>
              <tr>
                {/* 1. RFQ Received Date */}
                <th style={{ width: 135 }}>{UI_STRINGS.common.rFQReceivedDate}</th>

                {/* 2. RFQ Reference */}
                <th style={{ width: 155 }}>{UI_STRINGS.common.rFQReference}</th>

                {/* 3. Project / Package */}
                <th style={{ width: 180 }}>{UI_STRINGS.common.projectPackage}</th>

                {/* 4. Buyer / Client */}
                <th style={{ width: 145 }}>{UI_STRINGS.common.buyerClient}</th>

                {/* 5. Submission Deadline */}
                <th style={{ width: 135 }}>{UI_STRINGS.common.submissionDeadline}</th>

                {/* 6. Commercial Summary */}
                <th style={{ width: 150, textAlign: 'right' }}>{UI_STRINGS.common.commercialSummary}</th>

                {/* 7. Quote Status */}
                <th style={{ width: 120, textAlign: 'center' }}>{UI_STRINGS.common.quoteStatus}</th>

                {/* 8. Buyer Decision Status */}
                <th style={{ width: 175, textAlign: 'center' }}>{UI_STRINGS.common.buyerDecisionStatus}</th>

                {/* 9. Last Activity */}
                <th style={{ width: 135 }}>{UI_STRINGS.common.lastActivity}</th>

                {/* 10. Next Action / Responsible Party */}
                <th style={{ width: 170 }}>{UI_STRINGS.common.nextActionParty}</th>

                {/* 11. Available Actions */}
                <th style={{ width: 200, textAlign: 'right' }}>{UI_STRINGS.common.availableActions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRfqs.map((rfq) => {
                const latestQuote = rfq.latestQuote || rfq.quotes?.[0];
                const isNegActive = Boolean(rfq.latestRound || (rfq.negotiations && rfq.negotiations.some((n: any) => n.rounds && n.rounds.length > 0)));

                // Badges for Quote Status
                let quoteBadgeClass = 'badge badge-draft';
                if (rfq.quoteStatus === 'SUBMITTED') quoteBadgeClass = 'badge badge-submitted';
                else if (rfq.quoteStatus === 'APPROVED' || rfq.quoteStatus === 'ACCEPTED') quoteBadgeClass = 'badge badge-approved';
                else if (rfq.quoteStatus === 'REJECTED') quoteBadgeClass = 'badge badge-rejected';

                // Badges for Buyer Decision Status
                let decisionBadgeClass = 'badge badge-draft';
                if (rfq.buyerDecisionStatus?.includes('Order Execution') || rfq.buyerDecisionStatus?.includes('PPO Accepted')) {
                  decisionBadgeClass = 'badge badge-approved';
                } else if (rfq.buyerDecisionStatus?.includes('PPO Awaited') || rfq.buyerDecisionStatus?.includes('Accepted by Buyer')) {
                  decisionBadgeClass = 'badge badge-approved';
                } else if (rfq.buyerDecisionStatus?.includes('Final Offer') || rfq.buyerDecisionStatus?.includes('Pending Acceptance')) {
                  decisionBadgeClass = 'badge badge-submitted';
                } else if (rfq.buyerDecisionStatus?.includes('Counter-Offer') || rfq.buyerDecisionStatus?.includes('Counteroffer')) {
                  decisionBadgeClass = 'badge badge-submitted';
                } else if (rfq.buyerDecisionStatus?.includes('In Negotiation')) {
                  decisionBadgeClass = 'badge badge-info';
                } else if (rfq.buyerDecisionStatus?.includes('Closed') || rfq.buyerDecisionStatus?.includes('Not Accepted')) {
                  decisionBadgeClass = 'badge badge-rejected';
                }

                // Check overdue deadline
                const isOverdue = rfq.submissionDeadline && new Date(rfq.submissionDeadline).getTime() < Date.now();

                return (
                  <tr key={rfq.id}>
                    {/* 1. RFQ Received Date */}
                    <td>
                      <div
                        className="cell-compact-text"
                        style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}
                        title={rfq.rfqReceivedDate ? new Date(rfq.rfqReceivedDate).toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.persistedReceivedDate}
                      >
                        <Calendar size={12} className="inline mr-1 text-slate-400" />
                        <span>{formatDate(rfq.rfqReceivedDate, true)}</span>
                      </div>
                    </td>

                    {/* 2. RFQ Reference */}
                    <td>
                      <Link
                        href={`/vendor-portal/rfqs/${rfq.id}`}
                        className="cell-compact-text font-mono font-bold text-primary hover:underline"
                        style={{ fontSize: 13 }}
                        title={rfq.rfqNumber}
                      >
                        {rfq.rfqNumber}
                      </Link>
                      <div
                        className="cell-compact-text text-muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                        title={rfq.title}
                      >
                        {rfq.title}
                      </div>
                    </td>

                    {/* 3. Project / Package */}
                    <td>
                      <div
                        className="cell-compact-text"
                        style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}
                        title={interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.projectPackage || rfq.project?.name || UI_STRINGS.common.generalProject })}
                      >
                        {rfq.project?.name || UI_STRINGS.common.generalProject}
                      </div>
                      <div
                        className="cell-compact-text text-muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                        title={interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.packageName || rfq.project?.projectCode || UI_STRINGS.common.mainPackage })}
                      >
                        {rfq.packageName || rfq.project?.projectCode || UI_STRINGS.common.mainPackage}
                      </div>
                    </td>

                    {/* 4. Buyer / Client */}
                    <td>
                      <div
                        className="cell-compact-text"
                        style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}
                        title={interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.clientTenant || rfq.tenant?.name || UI_STRINGS.common.enterpriseClient })}
                      >
                        <Building2 size={12} className="inline mr-1 text-slate-400" />
                        <span>{rfq.clientTenant || rfq.tenant?.name || UI_STRINGS.common.enterpriseClient}</span>
                      </div>
                    </td>

                    {/* 5. Submission Deadline */}
                    <td>
                      <div
                        className="cell-compact-text"
                        style={{ fontSize: 12, fontWeight: 500, color: isOverdue ? '#b91c1c' : '#334155' }}
                        title={rfq.submissionDeadline ? new Date(rfq.submissionDeadline).toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.appAppVendorPortalRfqsPage.noDeadlineSpecified}
                      >
                        <Clock size={12} className={`inline mr-1 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`} />
                        <span>{formatDate(rfq.submissionDeadline, false)}</span>
                      </div>
                    </td>

                    {/* 6. Commercial Summary */}
                    <td style={{ textAlign: 'right' }}>
                      {latestQuote ? (
                        <div>
                          <div
                            className="cell-compact-text font-mono font-bold"
                            style={{ color: '#166534', fontSize: 13, textAlign: 'right' }}
                            title={interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsPage.toLocaleStringQuoteVQuoteVersion, { "toLocaleString": Number(latestQuote.totalQuoteAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale), "quoteVersion": latestQuote.quoteVersion })}
                          >{UI_STRINGS.common.copy1g8b5tg}{Number(latestQuote.totalQuoteAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 })}
                          </div>
                          <div
                            className="cell-compact-text text-muted"
                            style={{ fontSize: 10, textAlign: 'right' }}
                            title={interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsPage.versionQuoteVersionSubmittedValue2, { "quoteVersion": latestQuote.quoteVersion, "value2": formatDate(latestQuote.submittedAt) })}
                          >{UI_STRINGS.common.v}{latestQuote.quoteVersion}{UI_STRINGS.common.copyko5tj9}{rfq.lineCount ?? rfq.lines?.length ?? 0}{UI_STRINGS.common.lines2}</div>
                          {rfq.latestRound?.counterOfferAmount && (!rfq.latestRound?.revisedQuoteAmount || rfq.latestRound?.nextResponsibleParty === 'VENDOR') && (
                            <div style={{ marginTop: 3 }}>
                              <span
                                className="badge font-mono"
                                style={{
                                  fontSize: 10,
                                  background: '#eff6ff',
                                  color: '#1e40af',
                                  border: '1px solid #bfdbfe',
                                  padding: '2px 5px',
                                  display: 'inline-block',
                                }}
                                title={interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsPage.buyerCounterofferOfToLocaleStringRoundRoundNumber, { "toLocaleString": Number(rfq.latestRound.counterOfferAmount).toLocaleString(I18N_CONFIG.defaultLocale), "roundNumber": rfq.latestRound.roundNumber })}
                              >{UI_STRINGS.appAppVendorPortalRfqsPage.buyerOffer}{Number(rfq.latestRound.counterOfferAmount).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 0 })}{UI_STRINGS.appAppVendorPortalRfqsPage.r}{rfq.latestRound.roundNumber}{UI_STRINGS.common.copyc7zu6c}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="badge badge-warning" style={{ fontSize: 11 }}>{UI_STRINGS.common.awaitingQuote}</span>
                      )}
                    </td>

                    {/* 7. Quote Status */}
                    <td style={{ textAlign: 'center' }}>
                      <span className={quoteBadgeClass} style={{ fontSize: 11 }}>
                        {rfq.quoteStatus || (latestQuote ? UI_STRINGS.common.sUBMITTED : UI_STRINGS.common.pENDING)}
                      </span>
                    </td>

                    {/* 8. Buyer Decision Status */}
                    <td style={{ textAlign: 'center' }}>
                      <div
                        className="cell-compact-text"
                        style={{ textAlign: 'center' }}
                        title={interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.buyerDecisionStatus || UI_STRINGS.appAppVendorPortalRfqsPage.underEvaluation })}
                      >
                        <span className={decisionBadgeClass} style={{ fontSize: 11 }}>
                          {rfq.buyerDecisionStatus || UI_STRINGS.appAppVendorPortalRfqsPage.underEvaluation}
                        </span>
                      </div>
                    </td>

                    {/* 9. Last Activity */}
                    <td>
                      <div
                        className="cell-compact-text text-slate-700"
                        style={{ fontSize: 12 }}
                        title={rfq.lastActivityDate ? new Date(rfq.lastActivityDate).toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.appAppVendorPortalRfqsPage.persistedLastActivity}
                      >
                        {formatDate(rfq.lastActivityDate, true)}
                      </div>
                    </td>

                    {/* 10. Next Action / Responsible Party */}
                    <td>
                      <div>
                        <span
                          className={`badge ${
                            rfq.nextResponsibleParty === 'VENDOR'
                              ? 'badge-submitted'
                              : rfq.nextResponsibleParty === 'BUYER'
                              ? 'badge-info'
                              : 'badge-draft'
                          }`}
                          style={{ fontSize: 10, padding: '2px 6px' }}
                        >
                          {rfq.nextResponsibleParty || UI_STRINGS.common.vENDOR}
                        </span>
                        <div
                          className="cell-compact-text text-slate-600"
                          style={{ fontSize: 11, marginTop: 3 }}
                          title={interpolateUiString(UI_STRINGS.common.value1, { "value1": rfq.nextAction || UI_STRINGS.appAppVendorPortalRfqsPage.submitQuoteBeforeDeadline })}
                        >
                          {rfq.nextAction || UI_STRINGS.appAppVendorPortalRfqsPage.submitQuoteBeforeDeadline}
                        </div>
                      </div>
                    </td>

                    {/* 11. Available Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {/* Clarification Chat */}
                        <button
                          type="button"
                          onClick={() => {
                            setChatRfq(rfq);
                            setChatDrawerOpen(true);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', fontSize: 12 }}
                          title={UI_STRINGS.appAppVendorPortalRfqsPage.technicalCommercialClarificationChat}
                        >
                          <MessageSquare size={13} />
                        </button>

                        {/* Open Dedicated Full-Window Negotiation Workspace */}
                        {isNegActive && (
                          <button
                            type="button"
                            onClick={() => setNegotiatingRfq(rfq)}
                            className="btn btn-primary"
                            style={{
                              padding: '5px 10px',
                              fontSize: 12,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              whiteSpace: 'nowrap',
                              background: '#0284c7',
                              borderColor: '#0284c7',
                            }}
                            title={UI_STRINGS.common.openCommercialNegotiationWorkspace}
                          >
                            <TrendingDown size={13} />
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{UI_STRINGS.common.negotiate}</span>
                          </button>
                        )}

                        {/* View RFQ / Submit Quote */}
                        <Link
                          href={`/vendor-portal/rfqs/${rfq.id}`}
                          className="btn btn-secondary"
                          style={{
                            padding: '5px 10px',
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span>{latestQuote ? UI_STRINGS.common.review : UI_STRINGS.common.submit}</span>
                          <ArrowRight size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMoreRfqs && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '18px 0' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {interpolateUiString(UI_STRINGS.appAppVendorPortalRfqsPage.showingRfqsOfTotal, { shown: rfqs.length, total: totalRfqs })}
          </span>
          <button
            type="button"
            disabled={loadingMoreRfqs}
            onClick={() => loadRfqs(true)}
            className="btn btn-secondary"
          >
            {loadingMoreRfqs ? UI_STRINGS.common.loading : UI_STRINGS.appAppVendorPortalRfqsPage.loadMoreRfqs}
          </button>
        </div>
      )}

      {/* -- CLARIFICATION CHAT DRAWER -- */}
      {chatDrawerOpen && chatRfq && (
        <RfqChatDrawer
          rfqId={chatRfq.id}
          rfqNumber={chatRfq.rfqNumber}
          isOpen={chatDrawerOpen}
          onClose={() => {
            setChatDrawerOpen(false);
            setChatRfq(null);
          }}
          isVendorUser={true}
        />
      )}
    </div>
  );
}
