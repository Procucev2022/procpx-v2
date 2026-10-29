'use client';
// app/(app)/procurement/negotiations/page.tsx
// Negotiations Hub
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Handshake, Clock, CheckCircle2, TrendingDown } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

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

  const activeCount = negotiations.filter(n => n.status !== 'CONCLUDED' && n.status !== 'FINAL_RATE_LOCKED').length;
  const lockedCount = negotiations.filter(n => n.status === 'CONCLUDED' || n.status === 'FINAL_RATE_LOCKED').length;

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      <PageHeader
        title="Commercial Negotiations Hub"
        subtitle="Counter-offers, negotiation rounds, target prices, and commercial savings realisation"
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'Negotiations' },
        ]}
        actions={
          <Link href="/procurement/rfqs" className="btn btn-secondary btn-sm">
            Active RFQs Register
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="mb-6">
        <SummaryCardGrid columns={3}>
          <SummaryCard
            label="Total Negotiations"
            value={negotiations.length}
            secondary="All initiated negotiation tracks"
            icon={<Handshake size={16} />}
            accent="default"
          />
          <SummaryCard
            label="In Active Rounds"
            value={activeCount}
            secondary="Counter-offers open with vendors"
            icon={<Clock size={16} />}
            accent="amber"
          />
          <SummaryCard
            label="Rates Concluded / Locked"
            value={lockedCount}
            secondary="Ready for award recommendation"
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
        </SummaryCardGrid>
      </div>

      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            Ongoing & Concluded Negotiations ({negotiations.length})
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading negotiations...
          </div>
        ) : negotiations.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Handshake size={36} strokeWidth={1.5} color="#94a3b8" />}
              title="No Negotiations Active"
              description="Initiate a negotiation round inside an RFQ after reviewing quote comparisons."
              actionText="View Active RFQs"
              actionHref="/procurement/rfqs"
            />
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>RFQ Number</th>
                  <th>Project</th>
                  <th style={{ width: 130, textAlign: 'center' }}>Current Round</th>
                  <th style={{ width: 130, textAlign: 'center' }}>Rounds Logged</th>
                  <th style={{ width: 180, textAlign: 'right' }}>Best Commercial Value</th>
                  <th style={{ width: 150, textAlign: 'center' }}>Status</th>
                  <th style={{ width: 130 }}>Last Updated</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
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
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-info font-mono">Round {neg.currentRound}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <strong>{neg.rounds?.length || 0} rounds</strong>
                    </td>
                    <td style={{ fontWeight: 700, color: '#059669', textAlign: 'right' }}>
                      ₹ {neg.bestQuoteAmount?.toLocaleString('en-IN') || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge status={neg.status} />
                    </td>
                    <td className="text-muted text-xs">{new Date(neg.updatedAt).toLocaleDateString('en-IN')}</td>
                    <td style={{ textAlign: 'right' }}>
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
