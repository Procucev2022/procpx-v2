'use client';
// app/(app)/procurement/auctions/[id]/page.tsx
// Professional B2B Live Auction Room: Real-time countdown, rolling extensions, bid stream, and buyer controls
import { useEffect, useState, use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Gavel,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Pause,
  Play,
  Plus,
  Shield,
  Award,
  Users,
  FileText,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Lock,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';

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
  const [serverTime, setServerTime] = useState<Date>(new Date());
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(0);
  const [isObserver, setIsObserver] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Assisted bidding (for buyer placing bid on behalf of vendor)
  const [showAssistedBidModal, setShowAssistedBidModal] = useState(false);
  const [selectedBidVendorId, setSelectedBidVendorId] = useState('');
  const [assistedBidAmount, setAssistedBidAmount] = useState<number | ''>('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // Active view tab in auction room
  const [roomTab, setRoomTab] = useState<'LEADERBOARD' | 'ITEMS' | 'VENDORS' | 'TERMS'>('LEADERBOARD');

  useEffect(() => {
    fetchAuction();
  }, [id]);

  // Periodic polling according to configured refresh interval
  useEffect(() => {
    const intervalSecs = auction?.refreshIntervalSeconds || 10;
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

  const fetchAuction = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/procurement/auctions/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load auction');
      if (data.auction) {
        setAuction(data.auction);
        setIsObserver(data.isObserver || false);
      }
      if (data.serverTime) {
        setServerTime(new Date(data.serverTime));
      }
    } catch (err: any) {
      if (!silent) toast.error({ title: 'Error', message: err.message });
    } finally {
      if (!silent) setLoading(false);
    }
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
      if (!res.ok) throw new Error(data.error || 'Action failed');
      toast.success({ title: 'Success', message: data.message });
      fetchAuction();
    } catch (err: any) {
      toast.error({ title: 'Control Action Failed', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Assisted bid submission
  const handleAssistedBid = async () => {
    if (!selectedBidVendorId || !assistedBidAmount) {
      toast.error({ title: 'Validation', message: 'Please select a vendor and enter a valid bid amount.' });
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
      if (!res.ok) throw new Error(data.error || 'Bid rejected');

      toast.success({
        title: data.extended ? 'Bid Accepted & Rolling Extended!' : 'Bid Accepted',
        message: data.message,
      });

      setShowAssistedBidModal(false);
      setAssistedBidAmount('');
      fetchAuction();
    } catch (err: any) {
      toast.error({ title: 'Bid Rejected', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const formatIST = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
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

  if (loading) {
    return (
      <div className="container" style={{ padding: '80px 32px', textAlign: 'center', color: '#64748b' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        Synchronising live auction telemetry and server clock...
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="container" style={{ padding: 40, textAlign: 'center' }}>
        <h3>Auction not found</h3>
        <Link href="/procurement/auctions" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
          Return to Auctions Workspace
        </Link>
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
            <strong>Observer Access (Project User)</strong>: You are viewing this auction in read-only observer mode.
            Bidding, vendor invitations, and buyer controls are disabled.
          </div>
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
          <span style={{ background: '#0284c7', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
            NOTICE
          </span>
          <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {auction.scrollingText}
          </div>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title={auction.title}
        subtitle={`${auction.auctionNumber} • ${auction.auctionType} (${auction.auctionCategory === 'ITEM_WISE' ? 'Item Wise' : 'RFQ Total Wise'})`}
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'Auctions', href: '/procurement/auctions' },
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
              <RefreshCw size={12} className={actionLoading ? 'animate-spin' : ''} /> Refresh Telemetry
            </button>
            <Link href="/procurement/auctions" className="btn btn-secondary btn-sm">
              <ArrowLeft size={13} /> Exit Room
            </Link>
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
              {auction.status} {auction.extensionCount > 0 ? `(EXTENDED ${auction.extensionCount}X)` : ''}
            </span>
          </div>

          <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'monospace', color: timeRemainingSeconds < 300 && isLive ? '#fca5a5' : '#ffffff' }}>
            {isClosed ? 'CONCLUDED' : formatCountdown(timeRemainingSeconds)}
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Scheduled End: <strong>{formatIST(auction.scheduledEndTime || auction.endTime)}</strong>
          </div>
        </div>

        {/* Current Leading Price */}
        <div style={{ borderLeft: '1px solid #334155', borderRight: '1px solid #334155', padding: '0 24px' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>
            {isSealed
              ? 'SEALED BID PROTOCOL'
              : auction.auctionType === 'REVERSE_AUCTION'
              ? 'CURRENT LOWEST BID (L1)'
              : 'CURRENT HIGHEST BID'}
          </div>

          {isSealed ? (
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#c084fc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={20} /> Encrypted & Confidential
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Bids will be automatically unsealed and evaluated upon conclusion.
              </div>
            </div>
          ) : auction.currentLeadingBid ? (
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#34d399', fontFamily: 'monospace' }}>
                {auction.currency} {Number(auction.currentLeadingBid).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Starting Reference: {auction.currency} {Number(auction.startingPrice || 0).toLocaleString('en-IN')} | Min Delta: {auction.currency} {Number(auction.minDecrement || 0).toLocaleString('en-IN')}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#cbd5e1' }}>
                Starting at {auction.currency} {Number(auction.startingPrice || 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Awaiting opening qualified bid from invited vendors.
              </div>
            </div>
          )}
        </div>

        {/* Sourcing Package Links */}
        <div style={{ fontSize: 12 }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>Linked RFQ:</span>{' '}
            <Link href={`/procurement/rfqs/${auction.rfq.id}`} style={{ color: '#38bdf8', fontWeight: 700 }}>
              {auction.rfq.rfqNumber}
            </Link>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>PR Number:</span>{' '}
            <strong style={{ color: '#f1f5f9' }}>{auction.rfq.prNumber || '—'}</strong>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>BOQ / Package:</span>{' '}
            <span style={{ color: '#cbd5e1' }}>{auction.rfq.boqNumber || auction.rfq.packageName || '—'}</span>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>Invited Vendors:</span>{' '}
            <strong style={{ color: '#f1f5f9' }}>{auction.vendors.length} participants</strong>
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
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>BUYER LIVE CONTROLS:</span>
            {isLive && (
              <>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleBuyerAction('PAUSE')}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <Pause size={13} /> Pause Bidding
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleBuyerAction('EXTEND', { extensionMinutes: 3 })}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <Plus size={13} /> +3m Rolling Extension
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleBuyerAction('EXTEND', { extensionMinutes: 5 })}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <Plus size={13} /> +5m Rolling Extension
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    if (confirm('Are you sure you want to conclude this auction immediately? Bidding will close.')) {
                      handleBuyerAction('CONCLUDE');
                    }
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#ef4444', fontSize: 12 }}
                >
                  Conclude Auction
                </button>
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
                <Play size={13} /> Resume Bidding
              </button>
            )}

            {isClosed && auction.currentLeadingBid && (
              <button
                type="button"
                onClick={() => {
                  toast.success({
                    title: 'Award Initiated',
                    message: `Leading bid of ${auction.currency} ${Number(auction.currentLeadingBid).toLocaleString('en-IN')} ready for Award Recommendation.`,
                  });
                  router.push(`/procurement/rfqs/${auction.rfq.id}`);
                }}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <Award size={14} /> Generate Award Recommendation
              </button>
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
              <Gavel size={13} /> Log Assisted Vendor Bid
            </button>
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
              { id: 'LEADERBOARD', label: `Live Bid Stream (${auction.bids.length})` },
              { id: 'ITEMS', label: `Auction Scope Items (${auction.items.length})` },
              { id: 'TERMS', label: 'Documents & Terms' },
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
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>Sealed Bid Protocol Active</h4>
                  <p style={{ margin: 0, fontSize: 13, maxWidth: 480, marginInline: 'auto' }}>
                    {auction.bids.length} sealed bid(s) received. In accordance with mandatory procurement governance,
                    individual participant identities and submitted prices will remain strictly confidential until the auction concludes.
                  </p>
                </div>
              ) : auction.bids.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                  <Clock size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>No Bids Placed Yet</h4>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Invited participants have access to the live auction room. Submitted decrements will appear in real time.
                  </p>
                </div>
              ) : (
                <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ width: 60, padding: '10px 14px', textAlign: 'center' }}>Rank</th>
                        <th style={{ width: 80, padding: '10px 14px', textAlign: 'center' }}>Bid #</th>
                        <th style={{ minWidth: 180, padding: '10px 14px', textAlign: 'left' }}>Participant Vendor</th>
                        {auction.auctionCategory === 'ITEM_WISE' && (
                          <th style={{ width: 140, padding: '10px 14px', textAlign: 'left' }}>Item Code</th>
                        )}
                        <th style={{ width: 160, padding: '10px 14px', textAlign: 'right' }}>Bid Amount ({auction.currency})</th>
                        <th style={{ width: 180, padding: '10px 14px', textAlign: 'right' }}>Timestamp (IST)</th>
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
                                <span className="badge badge-success" style={{ fontSize: 11 }}>
                                  ★ L1
                                </span>
                              ) : (
                                <span style={{ color: '#64748b' }}>L{idx + 1}</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>
                              #{bid.bidNumber}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                              {bid.vendorName}
                            </td>
                            {auction.auctionCategory === 'ITEM_WISE' && (
                              <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#0284c7' }}>
                                {bid.itemCode || '—'}
                              </td>
                            )}
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: isWinner ? '#059669' : '#0f172a' }}>
                              {bid.bidAmount ? `${auction.currency} ${Number(bid.bidAmount).toLocaleString('en-IN')}` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>
                              {formatIST(bid.timestamp)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                      <th style={{ width: 50, padding: '10px 12px' }}>S.No</th>
                      <th style={{ width: 110, padding: '10px 12px' }}>Item Code</th>
                      <th style={{ minWidth: 200, padding: '10px 12px' }}>Description</th>
                      <th style={{ width: 80, padding: '10px 12px' }}>UOM</th>
                      <th style={{ width: 90, padding: '10px 12px', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: 140, padding: '10px 12px', textAlign: 'right' }}>Start Price</th>
                      <th style={{ width: 150, padding: '10px 12px', textAlign: 'right' }}>Leading Bid</th>
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
                          {item.startPrice ? `${auction.currency} ${Number(item.startPrice).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                          {item.currentLowestBid ? `${auction.currency} ${Number(item.currentLowestBid).toLocaleString('en-IN')}` : '—'}
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
              <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                Auction Terms & Conditions
              </h4>
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

              <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                Attached Sourcing Documents
              </h4>
              {auction.documents?.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>No external attachments uploaded.</div>
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
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{doc.name || `Document_${i + 1}`}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{doc.size || 'Attachment'}</span>
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
              <Users size={15} color="#0284c7" /> Invited Participants ({auction.vendors.length})
            </h4>
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
                      {hasAcceptedTerms ? 'TERMS ACCEPTED' : 'TERMS PENDING'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#64748b' }}>
                    <span>Bids Placed: <strong>{v.bidCount}</strong></span>
                    {v.bestRank && (
                      <span style={{ color: v.bestRank === 1 ? '#059669' : '#0284c7', fontWeight: 700 }}>
                        Best: L{v.bestRank}
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
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Log Assisted Vendor Bid
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              Record a verified phone/telephonic or written bid from an invited vendor into the live auction stream.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                  Select Participating Vendor *
                </label>
                <select
                  value={selectedBidVendorId}
                  onChange={(e) => setSelectedBidVendorId(e.target.value)}
                  className="form-control"
                  style={{ height: 38, fontSize: 13 }}
                >
                  <option value="">-- Choose Vendor --</option>
                  {auction.vendors.map((v: any) => (
                    <option key={v.vendorId} value={v.vendorId}>
                      {v.name} ({v.code})
                    </option>
                  ))}
                </select>
              </div>

              {auction.auctionCategory === 'ITEM_WISE' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                    Select Auction Item *
                  </label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    className="form-control"
                    style={{ height: 38, fontSize: 13 }}
                  >
                    <option value="">-- Choose Item --</option>
                    {auction.items.map((it: any) => (
                      <option key={it.id} value={it.id}>
                        {it.itemCode} — {it.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                  Bid Amount ({auction.currency}) *
                </label>
                <input
                  type="number"
                  value={assistedBidAmount}
                  onChange={(e) => setAssistedBidAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 1450000"
                  className="form-control"
                  style={{ height: 38, fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {auction.auctionType === 'REVERSE_AUCTION'
                    ? `Must be lower than current leading bid by at least ${auction.currency} ${Number(auction.minDecrement).toLocaleString('en-IN')}`
                    : 'Enter valid competitive bid'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowAssistedBidModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleAssistedBid}
                className="btn btn-primary btn-sm"
              >
                {actionLoading ? 'Validating...' : 'Submit Validated Bid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
