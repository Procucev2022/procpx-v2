'use client';
// app/(app)/procurement/quotes/page.tsx
// Enterprise Quote Responses & Commercial Evaluations Hub
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, MessageSquare } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

export default function QuotesHubPage() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/quotes');
      const data = await res.json();
      if (data.quotes) setQuotes(data.quotes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'Quotes' },
        ]}
        title="Quote Responses & Commercial Evaluations"
        description="Supplier item-rate bids, tax structures, revisions ledger, and comparative commercial variance."
        actions={
          <Link href="/procurement/rfqs" className="btn btn-secondary">
            <FileText size={16} /> View Active RFQs
          </Link>
        }
      />

      <Card
        title={`All Submitted Quotations (${quotes.length})`}
        subtitle="Version-controlled quotes received against approved BOQ baselines"
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>Loading quotes...</div>
          </div>
        ) : quotes.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<MessageSquare size={36} strokeWidth={1.5} color="#94a3b8" />}
              title="No Quotes Submitted Yet"
              description="Once invited vendors submit commercial rates against released RFQs, bids appear here."
              actionText="View Sourcing RFQs"
              actionHref="/procurement/rfqs"
            />
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table enterprise-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Quote Number</th>
                  <th>Vendor</th>
                  <th style={{ width: 140 }}>RFQ Package</th>
                  <th style={{ width: 90 }}>Version</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Base Amount</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Tax</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Grand Total</th>
                  <th style={{ maxWidth: 200 }}>Commercial Terms</th>
                  <th style={{ width: 120 }}>Submitted Date</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="font-mono font-bold text-primary">{q.quoteNumber}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{q.vendor?.name}</div>
                    </td>
                    <td>
                      <Link
                        href={`/procurement/rfqs/${q.rfqId}`}
                        className="font-mono text-muted"
                        style={{ textDecoration: 'none' }}
                      >
                        {q.rfq?.rfqNumber}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-info font-mono">v{q.quoteVersion}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>₹ {q.totalBaseAmount?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>₹ {q.taxAmount?.toLocaleString()}</td>
                    <td style={{ fontWeight: 700, textAlign: 'right', color: '#059669' }}>
                      ₹ {q.totalQuoteAmount?.toLocaleString()}
                    </td>
                    <td style={{ fontSize: 12, color: '#475569', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.commercialTerms}>
                      {q.commercialTerms || 'Standard commercial terms'}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {new Date(q.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/procurement/rfqs/${q.rfqId}?tab=compare`}
                        className="btn btn-secondary btn-sm"
                      >
                        Compare in RFQ →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
