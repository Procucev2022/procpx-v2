'use client';
// app/(app)/vendor-portal/auctions/[id]/page.tsx
// Vendor Live Auction Room: Terms Acceptance, Synchronized Countdown, Decrement Bidding & Confidentiality
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/api-utils.constants';
import { useEffect, useState, use, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Gavel,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Lock,
  Shield,
  RefreshCw,
  Check,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { mergeAuctionBidPages } from '@/lib/auction-bids';
import type { AuctionBidCursor, AuctionBidHistoryState, AuctionDetailSnapshot } from '@app-types/api/auction-detail.types';


import { AUCTION_DETAIL_DEFAULT_REFRESH_SECONDS } from '@/lib/auction-polling.constants';
export default function VendorAuctionBiddingRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();

  const [auction, setAuction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [vendorParticipation, setVendorParticipation] = useState<any>(null);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(0);
  const [bidHistory, setBidHistory] = useState<AuctionBidHistoryState>({
    auctionId: null,
    initialized: false,
    hasMore: false,
    cursor: null,
  });
  const [loadingOlderBids, setLoadingOlderBids] = useState(false);
  const requestGeneration = useRef(0);
  const latestRefreshSequence = useRef(0);

  // Terms Acceptance Modal
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptingTerms, setAcceptingTerms] = useState(false);

  // Bidding state
  const [bidAmount, setBidAmount] = useState<number | ''>('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [submittingBid, setSubmittingBid] = useState(false);

  // Sealed Bid Confirmation Modal
  const [showSealedConfirm, setShowSealedConfirm] = useState(false);

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

  // Local countdown tick (synced with server end time)
  useEffect(() => {
    if (!auction?.endTime) return;
    const target = new Date(auction.scheduledEndTime || auction.endTime).getTime();

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setTimeRemainingSeconds(diff);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [auction?.endTime, auction?.scheduledEndTime]);

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
        if (!cursor) setVendorParticipation(data.currentVendorParticipation);

        // Check if terms are accepted
        if (data.currentVendorParticipation && !data.currentVendorParticipation.termsAcceptedAt) {
          setShowTermsModal(true);
        }
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

  const handleAcceptTerms = async () => {
    setAcceptingTerms(true);
    try {
      const res = await fetch(`/api/procurement/auctions/${id}/terms-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToAcceptTerms }));
      toast.success({ title: UI_STRINGS.common.termsAccepted, message: data.message });
      setShowTermsModal(false);
      fetchAuction();
    } catch (err: any) {
      toast.error({ title: UI_STRINGS.common.error, message: err.message });
    } finally {
      setAcceptingTerms(false);
    }
  };

  // Calculate next allowed maximum bid (Reverse Auction)
  const nextAllowedBid = useMemo(() => {
    if (!auction) return null;
    const current = auction.currentLowestBid ? Number(auction.currentLowestBid) : Number(auction.startingPrice || 0);
    if (!current) return null;

    if (auction.auctionType === 'REVERSE_AUCTION') {
      const minDec = auction.hasMinBidReduction ? Number(auction.minDecrement || 0) : 1;
      return current - minDec;
    } else if (auction.auctionType === 'FORWARD_AUCTION') {
      const minInc = auction.hasMinBidReduction ? Number(auction.minDecrement || 0) : 1;
      return current + minInc;
    }
    return null;
  }, [auction]);

  const handlePlaceBid = async () => {
    if (!bidAmount) {
      toast.error({ title: UI_STRINGS.common.validation, message: UI_STRINGS.appAppVendorPortalAuctionsIdPage.pleaseEnterAValidBidAmount });
      return;
    }

    if (auction.auctionType === 'SEALED_BID' && !showSealedConfirm) {
      setShowSealedConfirm(true);
      return;
    }

    setSubmittingBid(true);
    try {
      const res = await fetch(`/api/procurement/auctions/${id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidAmount: Number(bidAmount),
          auctionItemId: selectedItemId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.bidSubmissionRejected }));

      toast.success({
        title: data.extended ? UI_STRINGS.common.userMessages.bidPlacedExtensionTriggered : UI_STRINGS.common.userMessages.bidAccepted,
        message: data.message,
      });

      setShowSealedConfirm(false);
      setBidAmount('');
      fetchAuction();
    } catch (err: any) {
      toast.error({ title: UI_STRINGS.common.bidRejected, message: err.message });
    } finally {
      setSubmittingBid(false);
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

  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds <= 0) return '00:00:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (loading || Boolean(auction && auction.id !== id)) {
    return (
      <div className="container" style={{ padding: '80px 32px', textAlign: 'center', color: '#64748b' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />{UI_STRINGS.appAppVendorPortalAuctionsIdPage.synchronisingWithAuctionServer}</div>
    );
  }

  if (!auction) {
    return (
      <div className="container" style={{ padding: 40, textAlign: 'center' }}>
        <h3>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.auctionNotAccessible}</h3>
        <Link href="/vendor-portal/auctions" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.returnToMyAuctions}</Link>
      </div>
    );
  }

  const isLive = auction.status === 'LIVE' || auction.status === 'EXTENDED';
  const isClosed = auction.status === 'CLOSED' || auction.status === 'COMPLETED';
  const isPaused = auction.status === 'PAUSED';
  const isSealed = auction.auctionType === 'SEALED_BID';
  const hasPlacedSealedBid = isSealed && (vendorParticipation?.bidCount || 0) > 0;

  return (
    <div className="container" style={{ padding: '20px 32px', maxWidth: 1400, margin: '0 auto' }}>
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
          }}
        >
          <span style={{ background: '#0284c7', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{UI_STRINGS.common.nOTICE}</span>
          <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {auction.scrollingText}
          </div>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title={auction.title}
        subtitle={interpolateUiString(UI_STRINGS.common.auctionNumberAuctionTypeValue3, { "auctionNumber": auction.auctionNumber, "auctionType": auction.auctionType, "value3": auction.auctionCategory === 'ITEM_WISE' ? 'Item Wise' : 'RFQ Total Wise' })}
        breadcrumbs={[
          { label: UI_STRINGS.common.vendorPortal, href: '/vendor-portal/dashboard' },
          { label: UI_STRINGS.common.auctions, href: '/vendor-portal/auctions' },
          { label: auction.auctionNumber },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => fetchAuction()}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} />{UI_STRINGS.common.refreshTelemetry}</button>
            <Link href="/vendor-portal/auctions" className="btn btn-secondary btn-sm">
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
        }}
      >
        {/* Countdown */}
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

          <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'monospace', color: timeRemainingSeconds < 300 && isLive ? '#fca5a5' : '#ffffff' }}>
            {isClosed ? UI_STRINGS.common.cONCLUDED : formatCountdown(timeRemainingSeconds)}
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.common.scheduledEnd}<strong>{formatIST(auction.scheduledEndTime || auction.endTime)}</strong>
          </div>
        </div>

        {/* Current Leading Bid */}
        <div style={{ borderLeft: '1px solid #334155', borderRight: '1px solid #334155', padding: '0 24px' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>
            {isSealed ? UI_STRINGS.appAppVendorPortalAuctionsIdPage.sEALEDBIDSTATUS : UI_STRINGS.appAppVendorPortalAuctionsIdPage.cURRENTLEADINGPRICE}
          </div>

          {isSealed ? (
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#c084fc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={18} />{UI_STRINGS.appAppVendorPortalAuctionsIdPage.confidentialSealedBid}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.competitorBidsAndPricesAreStrictlyConfidential}</div>
            </div>
          ) : auction.currentLeadingBid ? (
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#34d399', fontFamily: 'monospace' }}>
                {auction.currency} {Number(auction.currentLeadingBid).toLocaleString(I18N_CONFIG.defaultLocale)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.minRequiredDecrement}{auction.currency} {Number(auction.minDecrement || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#cbd5e1' }}>{UI_STRINGS.common.startingAt}{auction.currency} {Number(auction.startingPrice || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.openingBidMustNotExceedCeilingPrice}</div>
            </div>
          )}
        </div>

        {/* My Performance */}
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.mYBIDSTATUS}</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.bidsSubmitted}<strong>{vendorParticipation?.bidCount || 0}</strong>
            {auction.hasBidLimit && (
              <span style={{ color: '#94a3b8' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.max}{auction.maxBidsPerParticipant}</span>
            )}
          </div>
          {vendorParticipation?.lastBidAmount && (
            <div style={{ fontSize: 13, color: '#38bdf8' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.myLastBid}<strong>{auction.currency} {Number(vendorParticipation.lastBidAmount).toLocaleString(I18N_CONFIG.defaultLocale)}</strong>
            </div>
          )}
          {vendorParticipation?.bestRank && (
            <div style={{ fontSize: 13, color: vendorParticipation.bestRank === 1 ? '#34d399' : '#fbbf24', fontWeight: 700, marginTop: 4 }}>{interpolateUiString(UI_STRINGS.appAppVendorPortalAuctionsIdPage.currentRankL, { bestRank: vendorParticipation.bestRank })}
            </div>
          )}
        </div>
      </div>

      {/* TWO-COLUMN LAYOUT: LEFT BIDDING CONSOLE & RIGHT BID HISTORY */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
        {/* BIDDING CONSOLE CARD */}
        <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gavel size={18} color="#0284c7" />{UI_STRINGS.appAppVendorPortalAuctionsIdPage.placeYourBid}</h3>

          {!isLive ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
              <Clock size={36} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{interpolateUiString(UI_STRINGS.appAppVendorPortalAuctionsIdPage.biddingIsCurrently, { status: auction.status })}
              </div>
              <p style={{ fontSize: 12, marginTop: 4 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.bidsCanOnlyBeSubmittedWhenTheAuctionStatusIsLIVEOrEXTENDED}</p>
            </div>
          ) : hasPlacedSealedBid ? (
            <div style={{ padding: 32, textAlign: 'center', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.sealedBidSubmittedSecured}</div>
              <p style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.yourSingleConfidentialSealedBidOf}{' '}
                <strong>{auction.currency} {Number(vendorParticipation.lastBidAmount).toLocaleString(I18N_CONFIG.defaultLocale)}</strong>{' '}{UI_STRINGS.appAppVendorPortalAuctionsIdPage.hasBeenRecordedSealedBidsCannotBeAlteredOrReSubmitted}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* If Item Wise, select item */}
              {auction.auctionCategory === 'ITEM_WISE' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.selectAuctionScopeItem}</label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    className="form-control"
                    style={{ height: 38, fontSize: 13 }}
                  >
                    <option value="">{UI_STRINGS.appAppVendorPortalAuctionsIdPage.chooseItemLine}</option>
                    {auction.items.map((it: any) => (
                      <option key={it.id} value={it.id}>
                        {it.itemCode}{UI_STRINGS.common.copyq9aflv}{it.description}{UI_STRINGS.appAppVendorPortalAuctionsIdPage.qty}{it.quantity} {it.uom}{UI_STRINGS.common.copyc7zu6c}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Next Allowed Bid Info */}
              {nextAllowedBid && !isSealed && (
                <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 6, border: '1px solid #bae6fd', fontSize: 12, color: '#0369a1' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.nextQualifyingBidMustBe}{' '}
                  <strong>{auction.auctionType === 'REVERSE_AUCTION' ? UI_STRINGS.appAppVendorPortalAuctionsIdPage.lessThanOrEqualTo : UI_STRINGS.appAppVendorPortalAuctionsIdPage.greaterThanOrEqualTo}{' '}
                  {auction.currency} {nextAllowedBid.toLocaleString(I18N_CONFIG.defaultLocale)}</strong>
                </div>
              )}

              {/* Quick Decrement Chips (Reverse Auction) */}
              {nextAllowedBid && auction.auctionType === 'REVERSE_AUCTION' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.quickDecrementPresets}</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: UI_STRINGS.appAppVendorPortalAuctionsIdPage.copyx1gihq, delta: 5000 },
                      { label: UI_STRINGS.appAppVendorPortalAuctionsIdPage.copy1r929v2, delta: 10000 },
                      { label: UI_STRINGS.appAppVendorPortalAuctionsIdPage.copy1mn456m, delta: 25000 },
                      { label: UI_STRINGS.appAppVendorPortalAuctionsIdPage.copyyd4izu, delta: 50000 },
                    ].map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const base = auction.currentLowestBid ? Number(auction.currentLowestBid) : Number(auction.startingPrice || 0);
                          if (base > chip.delta) {
                            setBidAmount(base - chip.delta);
                          }
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 11, padding: '4px 10px' }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bid Input Field */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.enterBidAmount}{auction.currency}{UI_STRINGS.common.copyxw2xde}</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value ? Number(e.target.value) : '')}
                    placeholder={UI_STRINGS.appAppVendorPortalAuctionsIdPage.enterAmount}
                    className="form-control"
                    style={{ height: 42, fontSize: 16, fontWeight: 700, flex: 1 }}
                  />
                  <button
                    type="button"
                    disabled={submittingBid}
                    onClick={handlePlaceBid}
                    className="btn btn-primary"
                    style={{ height: 42, padding: '0 24px', fontWeight: 700, fontSize: 14 }}
                  >
                    {submittingBid ? UI_STRINGS.common.validating : isSealed ? UI_STRINGS.appAppVendorPortalAuctionsIdPage.lockSealedBid : UI_STRINGS.appAppVendorPortalAuctionsIdPage.submitBid}
                  </button>
                </div>
              </div>

              {isSealed && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#7c3aed' }}>
                  <Lock size={14} />
                  <span>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.importantSealedBidAllowsStrictly1SubmissionPerVendorCannotBeRevised}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MY SUBMITTED BIDS CARD */}
        <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 20 }}>
          <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.myBidSubmissionHistory}{auction.bids.length}{UI_STRINGS.common.copyc7zu6c}</h4>

          {auction.bids.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.youHaveNotSubmittedAnyBidsYet}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {auction.bids.map((b: any, idx: number) => (
                <div
                  key={b.id}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: idx === 0 ? '#f0fdf4' : '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                      {auction.currency} {Number(b.bidAmount).toLocaleString(I18N_CONFIG.defaultLocale)}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.common.bid}{b.bidNumber}{UI_STRINGS.common.copyko5tj9}{formatIST(b.timestamp)}
                    </div>
                  </div>
                  {b.rank && (
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background: b.rank === 1 ? '#dcfce7' : '#e0f2fe',
                        color: b.rank === 1 ? '#15803d' : '#0369a1',
                      }}
                    >{UI_STRINGS.common.rank}{b.rank}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {bidHistory.hasMore && bidHistory.cursor && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleLoadOlderBids} disabled={loadingOlderBids}>
                {loadingOlderBids ? UI_STRINGS.appAppVendorPortalAuctionsIdPage.loadingOlderBids : UI_STRINGS.appAppVendorPortalAuctionsIdPage.loadOlderBids}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MANDATORY TERMS & CONDITIONS ACCEPTANCE MODAL */}
      {showTermsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 620,
              padding: 28,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Shield size={24} color="#0284c7" />
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.auctionTermsConditionsAcknowledgement}</h3>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.inAccordanceWithProCPXEnterpriseProcurementPolicyParticipatingVendorsMustReviewAndExplicitlyAcceptTheGoverningRulesOfThisBiddingEventBeforePlacingBids}</p>

            <div
              style={{
                background: '#f8fafc',
                padding: 16,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                maxHeight: 220,
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                marginBottom: 20,
                color: '#334155',
              }}
            >
              {auction.termsAndConditions}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => router.push('/vendor-portal/auctions')}
                className="btn btn-secondary btn-sm"
              >{UI_STRINGS.appAppVendorPortalAuctionsIdPage.declineExit}</button>
              <button
                type="button"
                disabled={acceptingTerms}
                onClick={handleAcceptTerms}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Check size={14} /> {acceptingTerms ? UI_STRINGS.appAppVendorPortalAuctionsIdPage.recording : UI_STRINGS.appAppVendorPortalAuctionsIdPage.iAcceptTheTermsConditions}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM SEALED BID MODAL */}
      {showSealedConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 480,
              padding: 24,
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.confirmFinalSealedBid}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.youAreAboutToSubmitYourSingleConfidentialSealedBidOf}{' '}
              <strong style={{ color: '#0f172a' }}>{auction.currency} {Number(bidAmount).toLocaleString(I18N_CONFIG.defaultLocale)}</strong>{UI_STRINGS.appAppVendorPortalAuctionsIdPage.onceSubmittedItIsIrrevocableAndCannotBeRevised}</p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowSealedConfirm(false)}
                className="btn btn-secondary btn-sm"
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                disabled={submittingBid}
                onClick={handlePlaceBid}
                className="btn btn-primary btn-sm"
              >
                {submittingBid ? UI_STRINGS.appAppVendorPortalAuctionsIdPage.securing : UI_STRINGS.appAppVendorPortalAuctionsIdPage.yesSubmitSealedBid}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
