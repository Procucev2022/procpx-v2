'use client';
// app/(app)/procurement/negotiations/page.tsx
// Negotiations Hub
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Handshake } from 'lucide-react';

export default function NegotiationsHubPage() {
  const [negotiations, setNegotiations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNegotiations();
  }, []);

  const fetchNegotiations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/negotiations');
      const data = await res.json();
      if (data.negotiations) setNegotiations(data.negotiations);
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
          <div className="page-title">Commercial Negotiations Hub</div>
          <div className="page-subtitle">
            Counter-offers, Negotiation Rounds, Target Prices & Savings Realisation
          </div>
        </div>
        <Link href="/procurement/rfqs" className="btn btn-secondary btn-sm">
          Active RFQs
        </Link>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Ongoing & Concluded Negotiations ({negotiations.length})</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading negotiations...
          </div>
        ) : negotiations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Handshake size={36} strokeWidth={1.5} color="#94a3b8" />
            </div>
            <div className="empty-title">No Negotiations Active</div>
            <div className="empty-desc">Initiate a negotiation round inside an RFQ after reviewing quote comparisons.</div>
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table enterprise-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>RFQ Number</th>
                  <th>Project</th>
                  <th style={{ width: 120 }}>Current Round</th>
                  <th style={{ width: 120 }}>Rounds Logged</th>
                  <th style={{ width: 160, textAlign: 'right' }}>Best Commercial Value</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Status</th>
                  <th style={{ width: 120 }}>Last Updated</th>
                  <th className="col-actions" style={{ width: 120, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {negotiations.map((neg) => (
                  <tr key={neg.id}>
                    <td>
                      <Link
                        href={`/procurement/rfqs/${neg.rfqId}?tab=negotiation`}
                        className="font-mono font-bold text-primary"
                      >
                        {neg.rfq?.rfqNumber}
                      </Link>
                    </td>
                    <td>{neg.rfq?.project?.name}</td>
                    <td><span className="badge badge-submitted font-mono">Round {neg.currentRound}</span></td>
                    <td><strong>{neg.rounds?.length || 0} rounds</strong></td>
                    <td style={{ fontWeight: 700, color: '#059669', textAlign: 'right' }}>
                      ₹ {neg.bestQuoteAmount?.toLocaleString() || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}><span className="badge badge-approved">{neg.status}</span></td>
                    <td className="text-muted">{new Date(neg.updatedAt).toLocaleDateString()}</td>
                    <td className="col-actions">
                      <Link
                        href={`/procurement/rfqs/${neg.rfqId}?tab=negotiation`}
                        className="btn btn-sm btn-primary"
                      >
                        Negotiate →
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
