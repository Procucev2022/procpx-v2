'use client';
// app/(app)/procurement/auctions/[id]/page.tsx
// Professional B2B Live Auction Room: Real-time countdown, rolling extensions, bid stream, and buyer controls
import { I18N_CONFIG } from '@/lib/i18n.constants';
import AuctionCountdown from '@/components/AuctionCountdown';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/api-utils.constants';
import { useEffect, useState, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Gavel,
  Clock,
  ArrowLeft,
  Pause,
  Play,
  Plus,
  Shield,
  Award,
  Users,
  RefreshCw,
  Lock,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { mergeAuctionBidPages } from '@/lib/auction-bids';
import type { AuctionBidCursor, AuctionBidHistoryState, AuctionDetailSnapshot } from '@app-types/api/auction-detail.types';


import { AUCTION_DETAIL_DEFAULT_REFRESH_SECONDS } from '@/lib/auction-polling.constants';
export default function LiveAuctionRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();

  const [auction, setAuction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isObserver, setIsObserver] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [bidHistory, setBidHistory] = useState<AuctionBidHistoryState>({
    auctionId: null,
    initialized: false,
    hasMore: false,
    cursor: null,
  });
  const [loadingOlderBids, setLoadingOlderBids] = useState(false);
  const requestGeneration = useRef(0);
  const latestRefreshSequence = useRef(0);

  // Assisted bidding (for buyer placing bid on behalf of vendor)
  const [showAssistedBidModal, setShowAssistedBidModal] = useState(false);
  const [selectedBidVendorId, setSelectedBidVendorId] = useState('');
  const [assistedBidAmount, setAssistedBidAmount] = useState<number | ''>('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // Active view tab in auction room
  const [roomTab, setRoomTab] = useState<'LEADERBOARD' | 'ITEMS' | 'VENDORS' | 'TERMS'>('LEADERBOARD');

  useEffect(() => {
    const generation = ++requestGeneration.current;
    latestRefreshSequence.current += 1;
    void fetchAuction(false, undefined, generation, id);
    return () => {
      if (requestGeneration.current === generation) requestGeneration.current += 1;
    };
  }, [id]);

  // Periodic polling according to configured refresh interval
  useEffect(() => {
    const intervalSecs = auction?.refreshIntervalSeconds || AUCTION_DETAIL_DEFAULT_REFRESH_SECONDS;
    const timer = setInterval(() => {
      fetchAuction(true);
    }, intervalSecs * 1000);
    return () => clearInterval(timer);
  }, [id, auction?.refreshIntervalSeconds]);

  const fetchAuction = async (
    silent = false,
    cursor?: AuctionBidCursor,
    generation = requestGeneration.current,
    requestedId = id,
  ) => {
    const refreshSequence = cursor ? null : ++latestRefreshSequence.current;
    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams({ pageSize: String(DEFAULT_LIST_PAGE_SIZE) });
      if (cursor) {
        query.set('beforeId', cursor.beforeId);
        query.set('beforeTimestamp', cursor.beforeTimestamp);
      }
      const res = await fetch(`/api/procurement/auctions/${requestedId}?${query.toString()}`);
      const data = await res.json();
      if (generation !== requestGeneration.current || requestedId !== id
        || (refreshSequence !== null && refreshSequence !== latestRefreshSequence.current)) return;
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToLoadAuction }));
      if (data.auction) {
        setAuction((current: AuctionDetailSnapshot | null) => {
          const sameAuction = current?.id === data.auction.id;
          const baseAuction = cursor && sameAuction ? current : data.auction;
          return {
          ...baseAuction,
          bids: mergeAuctionBidPages(data.auction.bids || [], current?.id === data.auction.id ? current?.bids || [] : []),
          };
        });
        if (!cursor) setIsObserver(data.isObserver || false);
      }
      if (data.bidHistory) {
        setBidHistory((current) => {
          if (cursor && current.auctionId === id) {
            return { auctionId: id, initialized: true, hasMore: Boolean(data.bidHistory.hasMore), cursor: data.bidHistory.nextCursor || null };
          }
          if (current.auctionId !== id || !current.initialized) {
            return { auctionId: id, initialized: true, hasMore: Boolean(data.bidHistory.hasMore), cursor: data.bidHistory.nextCursor || null };
          }
          return current;
        });
      }
    } catch (err: any) {
      if (generation === requestGeneration.current && requestedId === id
        && (refreshSequence === null || refreshSequence === latestRefreshSequence.current)
        && (!silent || cursor)) toast.error({ title: UI_STRINGS.common.error, message: err.message });
    } finally {
      if (generation === requestGeneration.current && requestedId === id) {
        if (refreshSequence === null || refreshSequence === latestRefreshSequence.current) setLoading(false);
        if (cursor) setLoadingOlderBids(false);
      }
    }
  };

  const handleLoadOlderBids = () => {
    if (!bidHistory.cursor || loadingOlderBids) return;
    setLoadingOlderBids(true);
    void fetchAuction(true, bidHistory.cursor, requestGeneration.current, id);
  };

  // Buyer live controls
  const handleBuyerAction = async (action: string, payload: any = {}) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/procurement/auctions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.actionFailed }));
      toast.success({ title: UI_STRINGS.appAppProcurementAuctionsIdPage.success, message: data.message });
      fetchAuction();
    } catch (err: any) {
      toast.error({ title: UI_STRINGS.appAppProcurementAuctionsIdPage.controlActionFailed, message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Assisted bid submission
  const handleAssistedBid = async () => {
    if (!selectedBidVendorId || !assistedBidAmount) {
      toast.error({ title: UI_STRINGS.common.validation, message: UI_STRINGS.appAppProcurementAuctionsIdPage.pleaseSelectAVendorAndEnterAValidBidAmount });
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/procurement/auctions/${id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: selectedBidVendorId,
          bidAmount: Number(assistedBidAmount),
          auctionItemId: selectedItemId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.bidRejected }));

      toast.success({
        title: data.extended ? UI_STRINGS.common.userMessages.bidAcceptedRollingExtended : UI_STRINGS.common.userMessages.bidAccepted,
        message: data.message,
      });

      setShowAssistedBidModal(false);
      setAssistedBidAmount('');
      fetchAuction();
    } catch (err: any) {
      toast.error({ title: UI_STRINGS.common.bidRejected, message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const formatIST = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString(I18N_CONFIG.defaultLocale, {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }) + ' IST';
    } catch {
      return dateStr;
    }
  };

  if (loading || Boolean(auction && auction.id !== id)) {
    return (
      <div className="container" style={{ padding: '80px 32px', textAlign: 'center', color: '#64748b' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />{UI_STRINGS.appAppProcurementAuctionsIdPage.synchronisingLiveAuctionTelemetryAndServerClock}</div>
    );
  }

  if (!auction) {
    return (
      <div className="container" style={{ padding: 40, textAlign: 'center' }}>
        <h3>{UI_STRINGS.common.auctionNotFound}</h3>
        <Link href="/procurement/auctions" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.returnToAuctionsWorkspace}</Link>
      </div>
    );
  }

  const isLive = auction.status === 'LIVE' || auction.status === 'EXTENDED';
  const isClosed = auction.status === 'CLOSED' || auction.status === 'COMPLETED';
  const isPaused = auction.status === 'PAUSED';
  const isSealed = auction.auctionType === 'SEALED_BID';

  return (
    <div className="container" style={{ padding: '20px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Observer Banner */}
      {isObserver && (
        <div
          style={{
            padding: '12px 18px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#92400e',
            fontSize: 13,
          }}
        >
          <Shield size={18} color="#d97706" />
          <div>
            <strong>{UI_STRINGS.appAppProcurementAuctionsIdPage.observerAccessProjectUser}</strong>{UI_STRINGS.appAppProcurementAuctionsIdPage.youAreViewingThisAuctionInReadOnlyObserverModeBiddingVendorInvitationsAndBuyerControlsAreDisabled}</div>
        </div>
      )}

      {/* Scrolling Text Announcement Banner */}
      {auction.scrollingText && (
        <div
          style={{
            background: '#0f172a',
            color: '#f8fafc',
            padding: '8px 16px',
            borderRadius: 6,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
            overflow: 'hidden',
          }}
        >
          <span style={{ background: '#0284c7', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{UI_STRINGS.common.nOTICE}</span>
          <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {auction.scrollingText}
          </div>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title={auction.title}
        subtitle={interpolateUiString(UI_STRINGS.common.auctionNumberAuctionTypeValue3, { "auctionNumber": auction.auctionNumber, "auctionType": auction.auctionType, "value3": auction.auctionCategory === 'ITEM_WISE' ? 'Item Wise' : 'RFQ Total Wise' })}
        breadcrumbs={[
          { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
          { label: UI_STRINGS.common.auctions, href: '/procurement/auctions' },
          { label: auction.auctionNumber },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => fetchAuction()}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} className={actionLoading ? 'animate-spin' : ''} />{UI_STRINGS.common.refreshTelemetry}</button>
            <Link href="/procurement/auctions" className="btn btn-secondary btn-sm">
              <ArrowLeft size={13} />{UI_STRINGS.common.exitRoom}</Link>
          </div>
        }
      />

      {/* LIVE TELEMETRY HERO BANNER */}
      <div
        style={{
          background: isLive ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : '#1e293b',
          borderRadius: 10,
          color: '#ffffff',
          padding: '20px 28px',
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: '1.2fr 1.5fr 1.3fr',
          gap: 24,
          alignItems: 'center',
          border: isLive ? '1px solid #38bdf8' : '1px solid #334155',
          boxShadow: isLive ? '0 10px 25px -5px rgba(2, 132, 199, 0.25)' : 'none',
        }}
      >
        {/* Countdown & Status */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isLive ? '#22c55e' : isPaused ? '#f59e0b' : '#94a3b8',
                display: 'inline-block',
                boxShadow: isLive ? '0 0 10px #22c55e' : 'none',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', color: '#93c5fd' }}>
              {auction.status} {auction.extensionCount > 0 ? interpolateUiString(UI_STRINGS.common.eXTENDEDExtensionCountX, { "extensionCount": auction.extensionCount }) : ''}
            </span>
          </div>

          <AuctionCountdown
            targetTime={auction?.endTime ? new Date(auction.scheduledEndTime || auction.endTime).getTime() : null}
            isLive={isLive}
            isClosed={isClosed}
            closedLabel={UI_STRINGS.common.cONCLUDED}
          />

          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.common.scheduledEnd}<strong>{formatIST(auction.scheduledEndTime || auction.endTime)}</strong>
          </div>
        </div>

        {/* Current Leading Price */}
        <div style={{ borderLeft: '1px solid #334155', borderRight: '1px solid #334155', padding: '0 24px' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>
            {isSealed
              ? UI_STRINGS.appAppProcurementAuctionsIdPage.sEALEDBIDPROTOCOL
              : auction.auctionType === 'REVERSE_AUCTION'
              ? UI_STRINGS.appAppProcurementAuctionsIdPage.cURRENTLOWESTBIDL1
              : UI_STRINGS.appAppProcurementAuctionsIdPage.cURRENTHIGHESTBID}
          </div>

          {isSealed ? (
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#c084fc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={20} />{UI_STRINGS.appAppProcurementAuctionsIdPage.encryptedConfidential}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.bidsWillBeAutomaticallyUnsealedAndEvaluatedUponConclusion}</div>
            </div>
          ) : auction.currentLeadingBid ? (
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#34d399', fontFamily: 'monospace' }}>
                {auction.currency} {Number(auction.currentLeadingBid).toLocaleString(I18N_CONFIG.defaultLocale)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.startingReference}{auction.currency} {Number(auction.startingPrice || 0).toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.appAppProcurementAuctionsIdPage.minDelta}{auction.currency} {Number(auction.minDecrement || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#cbd5e1' }}>{UI_STRINGS.common.startingAt}{auction.currency} {Number(auction.startingPrice || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.awaitingOpeningQualifiedBidFromInvitedVendors}</div>
            </div>
          )}
        </div>

        {/* Sourcing Package Links */}
        <div style={{ fontSize: 12 }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.linkedRFQ}</span>{' '}
            <Link href={`/procurement/rfqs/${auction.rfq.id}`} style={{ color: '#38bdf8', fontWeight: 700 }}>
              {auction.rfq.rfqNumber}
            </Link>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.pRNumber}</span>{' '}
            <strong style={{ color: '#f1f5f9' }}>{auction.rfq.prNumber || UI_STRINGS.common.copy4s9bsz}</strong>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.bOQPackage}</span>{' '}
            <span style={{ color: '#cbd5e1' }}>{auction.rfq.boqNumber || auction.rfq.packageName || UI_STRINGS.common.copy4s9bsz}</span>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>{UI_STRINGS.common.invitedVendors}</span>{' '}
            <strong style={{ color: '#f1f5f9' }}>{auction.vendors.length}{UI_STRINGS.appAppProcurementAuctionsIdPage.participants}</strong>
          </div>
        </div>
      </div>

      {/* BUYER LIVE CONTROL TOOLBAR */}
      {!isObserver && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '12px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.bUYERLIVECONTROLS}</span>
            {isLive && (
              <>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleBuyerAction('PAUSE')}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <Pause size={13} />{UI_STRINGS.appAppProcurementAuctionsIdPage.pauseBidding}</button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleBuyerAction('EXTEND', { extensionMinutes: 3 })}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <Plus size={13} />{UI_STRINGS.appAppProcurementAuctionsIdPage.copyc3xaw0}</button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleBuyerAction('EXTEND', { extensionMinutes: 5 })}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <Plus size={13} />{UI_STRINGS.appAppProcurementAuctionsIdPage.copybnkcqi}</button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    if (confirm(UI_STRINGS.appAppProcurementAuctionsIdPage.areYouSureYouWantToConcludeThisAuctionImmediatelyBiddingWillClose)) {
                      handleBuyerAction('CONCLUDE');
                    }
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#ef4444', fontSize: 12 }}
                >{UI_STRINGS.appAppProcurementAuctionsIdPage.concludeAuction}</button>
              </>
            )}

            {isPaused && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleBuyerAction('RESUME')}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <Play size={13} />{UI_STRINGS.appAppProcurementAuctionsIdPage.resumeBidding}</button>
            )}

            {isClosed && auction.currentLeadingBid && (
              <button
                type="button"
                onClick={() => {
                  toast.success({
                    title: UI_STRINGS.appAppProcurementAuctionsIdPage.awardInitiated,
                    message: interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.leadingBidOfCurrencyToLocaleStringReadyForAwardRecommendation, { "currency": auction.currency, "toLocaleString": Number(auction.currentLeadingBid).toLocaleString(I18N_CONFIG.defaultLocale) }),
                  });
                  router.push(`/procurement/rfqs/${auction.rfq.id}`);
                }}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <Award size={14} />{UI_STRINGS.appAppProcurementAuctionsIdPage.generateAwardRecommendation}</button>
            )}
          </div>

          {/* Assisted Bid Trigger */}
          {isLive && (
            <button
              type="button"
              onClick={() => setShowAssistedBidModal(true)}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            >
              <Gavel size={13} />{UI_STRINGS.appAppProcurementAuctionsIdPage.logAssistedVendorBid}</button>
          )}
        </div>
      )}

      {/* TWO-COLUMN WORKSPACE: LEFT MAIN TABS & RIGHT VENDORS PARTICIPATION */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* LEFT COLUMN: TABS & TABLES */}
        <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Room Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 16px' }}>
            {[
              { id: 'LEADERBOARD', label: interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.liveBidStreamLength, { "length": auction.bids.length }) },
              { id: 'ITEMS', label: interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.auctionScopeItemsLength, { "length": auction.items.length }) },
              { id: 'TERMS', label: UI_STRINGS.appAppProcurementAuctionsIdPage.documentsTerms },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoomTab(tab.id as any)}
                style={{
                  padding: '12px 18px',
                  fontSize: 13,
                  fontWeight: roomTab === tab.id ? 700 : 500,
                  color: roomTab === tab.id ? '#0284c7' : '#64748b',
                  borderBottom: roomTab === tab.id ? '2px solid #0284c7' : '2px solid transparent',
                  background: 'transparent',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: LIVE LEADERBOARD / STREAM */}
          {roomTab === 'LEADERBOARD' && (
            <div style={{ padding: 0 }}>
              {isSealed && !isClosed ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                  <Lock size={44} color="#a855f7" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.sealedBidProtocolActive}</h4>
                  <p style={{ margin: 0, fontSize: 13, maxWidth: 480, marginInline: 'auto' }}>
                    {auction.bids.length}{UI_STRINGS.appAppProcurementAuctionsIdPage.sealedBidSReceivedInAccordanceWithMandatoryProcurementGovernanceIndividualParticipantIdentitiesAndSubmittedPricesWillRemainStrictlyConfidentialUntilTheAuctionConcludes}</p>
                </div>
              ) : auction.bids.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                  <Clock size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.noBidsPlacedYet}</h4>
                  <p style={{ margin: 0, fontSize: 13 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.invitedParticipantsHaveAccessToTheLiveAuctionRoomSubmittedDecrementsWillAppearInRealTime}</p>
                </div>
              ) : (
                <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ width: 60, padding: '10px 14px', textAlign: 'center' }}>{UI_STRINGS.common.rank}</th>
                        <th style={{ width: 80, padding: '10px 14px', textAlign: 'center' }}>{UI_STRINGS.common.bid}</th>
                        <th style={{ minWidth: 180, padding: '10px 14px', textAlign: 'left' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.participantVendor}</th>
                        {auction.auctionCategory === 'ITEM_WISE' && (
                          <th style={{ width: 140, padding: '10px 14px', textAlign: 'left' }}>{UI_STRINGS.common.itemCode}</th>
                        )}
                        <th style={{ width: 160, padding: '10px 14px', textAlign: 'right' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.bidAmount}{auction.currency}{UI_STRINGS.common.copyc7zu6c}</th>
                        <th style={{ width: 180, padding: '10px 14px', textAlign: 'right' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.timestampIST}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auction.bids.map((bid: any, idx: number) => {
                        const isWinner = idx === 0;
                        return (
                          <tr
                            key={bid.id}
                            style={{
                              borderBottom: '1px solid #e2e8f0',
                              background: isWinner ? '#f0fdf4' : '#ffffff',
                            }}
                          >
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>
                              {idx === 0 ? (
                                <span className="badge badge-success" style={{ fontSize: 11 }}>{UI_STRINGS.common.l1}</span>
                              ) : (
                                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.l}{idx + 1}</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>{UI_STRINGS.common.copyak280i}{bid.bidNumber}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                              {bid.vendorName}
                            </td>
                            {auction.auctionCategory === 'ITEM_WISE' && (
                              <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#0284c7' }}>
                                {bid.itemCode || UI_STRINGS.common.copy4s9bsz}
                              </td>
                            )}
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: isWinner ? '#059669' : '#0f172a' }}>
                              {bid.bidAmount ? interpolateUiString(UI_STRINGS.common.currencyToLocaleString, { "currency": auction.currency, "toLocaleString": Number(bid.bidAmount).toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>
                              {formatIST(bid.timestamp)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {bidHistory.hasMore && bidHistory.cursor && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleLoadOlderBids} disabled={loadingOlderBids}>
                        {loadingOlderBids ? UI_STRINGS.appAppProcurementAuctionsIdPage.loadingOlderBids : UI_STRINGS.appAppProcurementAuctionsIdPage.loadOlderBids}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AUCTION SCOPE ITEMS */}
          {roomTab === 'ITEMS' && (
            <div style={{ padding: 0 }}>
              <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ width: 50, padding: '10px 12px' }}>{UI_STRINGS.common.sNo}</th>
                      <th style={{ width: 110, padding: '10px 12px' }}>{UI_STRINGS.common.itemCode}</th>
                      <th style={{ minWidth: 200, padding: '10px 12px' }}>{UI_STRINGS.common.description}</th>
                      <th style={{ width: 80, padding: '10px 12px' }}>{UI_STRINGS.common.uOM}</th>
                      <th style={{ width: 90, padding: '10px 12px', textAlign: 'right' }}>{UI_STRINGS.common.qty}</th>
                      <th style={{ width: 140, padding: '10px 12px', textAlign: 'right' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.startPrice}</th>
                      <th style={{ width: 150, padding: '10px 12px', textAlign: 'right' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.leadingBid}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auction.items.map((item: any, idx: number) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#0284c7' }}>
                          {item.itemCode}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600 }}>{item.description}</div>
                          {item.boqDescription && (
                            <div style={{ fontSize: 11, color: '#64748b' }}>{item.boqDescription}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{item.uom}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>
                          {item.startPrice ? interpolateUiString(UI_STRINGS.common.currencyToLocaleString, { "currency": auction.currency, "toLocaleString": Number(item.startPrice).toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                          {item.currentLowestBid ? interpolateUiString(UI_STRINGS.common.currencyToLocaleString, { "currency": auction.currency, "toLocaleString": Number(item.currentLowestBid).toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: DOCUMENTS & TERMS */}
          {roomTab === 'TERMS' && (
            <div style={{ padding: 24 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.auctionTermsConditions}</h4>
              <div
                style={{
                  background: '#f8fafc',
                  padding: 16,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  marginBottom: 20,
                }}
              >
                {auction.termsAndConditions}
              </div>

              <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.attachedSourcingDocuments}</h4>
              {auction.documents?.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.noExternalAttachmentsUploaded}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {auction.documents.map((doc: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{doc.name || interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.documentValue1, { "value1": i + 1 })}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{doc.size || UI_STRINGS.appAppProcurementAuctionsIdPage.attachment}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: PARTICIPANTS VENDOR ROSTER */}
        <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} color="#0284c7" />{UI_STRINGS.appAppProcurementAuctionsIdPage.invitedParticipants}{auction.vendors.length}{UI_STRINGS.common.copyc7zu6c}</h4>
          </div>

          <div style={{ padding: 12, maxHeight: 520, overflowY: 'auto' }}>
            {auction.vendors.map((v: any) => {
              const hasAcceptedTerms = !!v.termsAcceptedAt;
              return (
                <div
                  key={v.id}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{v.name}</div>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: hasAcceptedTerms ? '#dcfce7' : '#fee2e2',
                        color: hasAcceptedTerms ? '#15803d' : '#b91c1c',
                        fontWeight: 700,
                      }}
                    >
                      {hasAcceptedTerms ? UI_STRINGS.appAppProcurementAuctionsIdPage.tERMSACCEPTED : UI_STRINGS.appAppProcurementAuctionsIdPage.tERMSPENDING}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#64748b' }}>
                    <span>{UI_STRINGS.appAppProcurementAuctionsIdPage.bidsPlaced}<strong>{v.bidCount}</strong></span>
                    {v.bestRank && (
                      <span style={{ color: v.bestRank === 1 ? '#059669' : '#0284c7', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.bestL}{v.bestRank}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ASSISTED BID MODAL */}
      {showAssistedBidModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 10,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.logAssistedVendorBid2}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.recordAVerifiedPhoneTelephonicOrWrittenBidFromAnInvitedVendorIntoTheLiveAuctionStream}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.selectParticipatingVendor}</label>
                <select
                  value={selectedBidVendorId}
                  onChange={(e) => setSelectedBidVendorId(e.target.value)}
                  className="form-control"
                  style={{ height: 38, fontSize: 13 }}
                >
                  <option value="">{UI_STRINGS.appAppProcurementAuctionsIdPage.chooseVendor}</option>
                  {auction.vendors.map((v: any) => (
                    <option key={v.vendorId} value={v.vendorId}>
                      {v.name}{UI_STRINGS.common.copy1b3t0c5}{v.code}{UI_STRINGS.common.copyc7zu6c}</option>
                  ))}
                </select>
              </div>

              {auction.auctionCategory === 'ITEM_WISE' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.selectAuctionItem}</label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    className="form-control"
                    style={{ height: 38, fontSize: 13 }}
                  >
                    <option value="">{UI_STRINGS.appAppProcurementAuctionsIdPage.chooseItem}</option>
                    {auction.items.map((it: any) => (
                      <option key={it.id} value={it.id}>
                        {it.itemCode}{UI_STRINGS.common.copyq9aflv}{it.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementAuctionsIdPage.bidAmount}{auction.currency}{UI_STRINGS.common.copyxw2xde}</label>
                <input
                  type="number"
                  value={assistedBidAmount}
                  onChange={(e) => setAssistedBidAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder={UI_STRINGS.appAppProcurementAuctionsIdPage.eG1450000}
                  className="form-control"
                  style={{ height: 38, fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {auction.auctionType === 'REVERSE_AUCTION'
                    ? interpolateUiString(UI_STRINGS.appAppProcurementAuctionsIdPage.mustBeLowerThanCurrentLeadingBidByAtLeastCurrencyToLocaleString, { "currency": auction.currency, "toLocaleString": Number(auction.minDecrement).toLocaleString(I18N_CONFIG.defaultLocale) })
                    : UI_STRINGS.appAppProcurementAuctionsIdPage.enterValidCompetitiveBid}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowAssistedBidModal(false)}
                className="btn btn-secondary btn-sm"
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleAssistedBid}
                className="btn btn-primary btn-sm"
              >
                {actionLoading ? UI_STRINGS.common.validating : UI_STRINGS.appAppProcurementAuctionsIdPage.submitValidatedBid}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
