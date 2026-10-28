'use client';
// app/(app)/vendor-portal/auctions/page.tsx
// Vendor Portal: Invited Auctions, Live Bidding, and Results Register
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Gavel,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  Search,
  Lock,
  Building2,
  FileText,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

export default function VendorAuctionsPage() {
  const toast = useToast();
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'INVITATIONS' | 'UPCOMING' | 'LIVE' | 'MY_BIDS' | 'COMPLETED'>('LIVE');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchVendorAuctions();
  }, []);

  const fetchVendorAuctions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/auctions');
      const data = await res.json();
      if (data.auctions) {
        setAuctions(data.auctions);
      }
    } catch (err: any) {
      toast.error({ title: 'Error', message: 'Failed to load invited auctions' });
    } finally {
      setLoading(false);
    }
  };

  const filteredAuctions = auctions.filter((auc) => {
    if (activeTab === 'LIVE' && auc.status !== 'LIVE' && auc.status !== 'EXTENDED') return false;
    if (activeTab === 'UPCOMING' && auc.status !== 'SCHEDULED') return false;
    if (activeTab === 'COMPLETED' && auc.status !== 'CLOSED' && auc.status !== 'COMPLETED') return false;
    if (activeTab === 'MY_BIDS' && (auc.bids?.length || 0) === 0) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        auc.auctionNumber?.toLowerCase().includes(q) ||
        auc.title?.toLowerCase().includes(q) ||
        auc.rfqNumber?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const liveCount = auctions.filter((a) => a.status === 'LIVE' || a.status === 'EXTENDED').length;
  const upcomingCount = auctions.filter((a) => a.status === 'SCHEDULED').length;
  const completedCount = auctions.filter((a) => a.status === 'CLOSED' || a.status === 'COMPLETED').length;

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
        hour12: true,
      }) + ' IST';
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Vendor Auctions & Bidding Portal"
        subtitle="View invited auction packages, review commercial terms, participate in live reverse / forward / sealed bidding"
        breadcrumbs={[
          { label: 'Vendor Portal', href: '/vendor-portal/dashboard' },
          { label: 'Auctions' },
        ]}
        actions={
          <button
            type="button"
            onClick={fetchVendorAuctions}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh Telemetry
          </button>
        }
      />

      {/* Tabs */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 16px' }}>
          {[
            { id: 'LIVE', label: 'Live Bidding Room', count: liveCount, pulse: liveCount > 0 },
            { id: 'UPCOMING', label: 'Upcoming Scheduled', count: upcomingCount },
            { id: 'MY_BIDS', label: 'My Placed Bids' },
            { id: 'COMPLETED', label: 'Completed & Results', count: completedCount },
            { id: 'INVITATIONS', label: 'All Invitations', count: auctions.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 18px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#0284c7' : '#64748b',
                borderBottom: activeTab === tab.id ? '2px solid #0284c7' : '2px solid transparent',
                background: 'transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {tab.pulse && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#22c55e',
                    display: 'inline-block',
                    boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.4)',
                  }}
                />
              )}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 10,
                    background: activeTab === tab.id ? '#e0f2fe' : '#f1f5f9',
                    color: activeTab === tab.id ? '#0369a1' : '#64748b',
                    fontWeight: 600,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 12 }}>
          <div style={{ position: 'relative', width: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by Auction #, Title, RFQ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: 32, fontSize: 13, height: 36 }}
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading invited auctions...
          </div>
        ) : filteredAuctions.length === 0 ? (
          <div style={{ padding: 48 }}>
            <EmptyState
              icon={<Gavel size={36} color="#94a3b8" />}
              title="No Auctions in this Tab"
              description="You will see invited auctions here when procurement teams schedule bidding events."
            />
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ width: 140, padding: '10px 14px', textAlign: 'left' }}>Auction ID</th>
                  <th style={{ minWidth: 200, padding: '10px 14px', textAlign: 'left' }}>Event Title</th>
                  <th style={{ width: 130, padding: '10px 14px', textAlign: 'left' }}>Linked RFQ</th>
                  <th style={{ width: 130, padding: '10px 14px', textAlign: 'left' }}>Auction Type</th>
                  <th style={{ width: 130, padding: '10px 14px', textAlign: 'left' }}>Category</th>
                  <th style={{ width: 170, padding: '10px 14px', textAlign: 'left' }}>Scheduled Start (IST)</th>
                  <th style={{ width: 170, padding: '10px 14px', textAlign: 'left' }}>Scheduled End (IST)</th>
                  <th style={{ width: 120, padding: '10px 14px', textAlign: 'center' }}>Status</th>
                  <th style={{ width: 140, padding: '10px 14px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuctions.map((auc) => {
                  const isLive = auc.status === 'LIVE' || auc.status === 'EXTENDED';
                  return (
                    <tr
                      key={auc.id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: isLive ? '#f0fdf4' : '#ffffff',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#0284c7' }}>
                        {auc.auctionNumber}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{auc.title}</div>
                        {auc.currentLowestBid && (
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                            Current Leading: {auc.currency} {Number(auc.currentLowestBid).toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                        {auc.rfqNumber}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge badge-info" style={{ fontSize: 11 }}>
                          {auc.auctionType === 'REVERSE_AUCTION' ? 'Reverse' : auc.auctionType === 'FORWARD_AUCTION' ? 'Forward' : 'Sealed Bid'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12 }}>
                        {auc.auctionCategory === 'ITEM_WISE' ? 'Item Wise' : 'RFQ Total Wise'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#334155' }}>
                        {formatIST(auc.startTime)}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#334155' }}>
                        {formatIST(auc.scheduledEndTime || auc.endTime)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <StatusBadge status={auc.status} />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <Link
                          href={`/vendor-portal/auctions/${auc.id}`}
                          className={`btn btn-sm ${isLive ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontWeight: 600,
                          }}
                        >
                          {isLive ? 'Enter Bidding Room →' : 'View Details'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
