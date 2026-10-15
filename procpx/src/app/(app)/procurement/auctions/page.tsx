'use client';
// app/(app)/procurement/auctions/page.tsx
// Reverse E-Auctions and Sealed Bids Hub
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gavel } from 'lucide-react';

export default function AuctionsHubPage() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuctions();
  }, []);

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/auctions');
      const data = await res.json();
      if (data.auctions) setAuctions(data.auctions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content">
      <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
        <div>
          <div className="page-title">Reverse E-Auctions & Sealed Bids</div>
          <div className="page-subtitle">
            Dynamic Competitive Bidding, Minimum Decrements, Real-Time Leaderboards & Sealed Bid Protocols
          </div>
        </div>
        <Link href="/procurement/rfqs" className="btn btn-secondary btn-sm">
          Active RFQs
        </Link>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Auction Events ({auctions.length})</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading auctions...
          </div>
        ) : auctions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Gavel size={36} strokeWidth={1.5} color="#94a3b8" />
            </div>
            <div className="empty-title">No Auctions Scheduled</div>
            <div className="empty-desc">Create a Reverse Auction or Sealed Bid from any active RFQ workspace.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Auction Number</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>RFQ</th>
                  <th>Ceiling Price</th>
                  <th>Min Decrement</th>
                  <th>Current Lowest Bid</th>
                  <th>Total Bids</th>
                  <th>Status</th>
                  <th className="col-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {auctions.map((auc) => (
                  <tr key={auc.id}>
                    <td className="font-mono font-bold text-primary">{auc.auctionNumber}</td>
                    <td>{auc.title}</td>
                    <td><span className="badge badge-info">{auc.auctionType}</span></td>
                    <td>
                      <Link href={`/procurement/rfqs/${auc.rfqId}`} className="font-mono text-muted">
                        {auc.rfq?.rfqNumber}
                      </Link>
                    </td>
                    <td>₹ {auc.startingPrice?.toLocaleString()}</td>
                    <td>₹ {auc.minDecrement?.toLocaleString()}</td>
                    <td style={{ fontWeight: 700, color: '#059669' }}>
                      ₹ {auc.currentLowestBid?.toLocaleString()}
                    </td>
                    <td><strong>{auc.bids?.length || 0} bids</strong></td>
                    <td><span className="badge badge-approved">{auc.status}</span></td>
                    <td className="col-actions">
                      <Link
                        href={`/procurement/rfqs/${auc.rfqId}?tab=auctions`}
                        className="btn btn-sm btn-primary"
                      >
                        Auction Room →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
