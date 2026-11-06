'use client';
// app/(app)/procurement/quotes/page.tsx
// Enterprise Quote Responses & Commercial Evaluations Hub
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, MessageSquare } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export default function QuotesHubPage() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async (cursor: string | null = null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const query = new URLSearchParams({ pagination: 'cursor', pageSize: '50' });
      if (cursor) query.set('cursor', cursor);
      const res = await fetch(`/api/procurement/quotes?${query.toString()}`);
      const data = await res.json();
      if (Array.isArray(data.quotes)) {
        setQuotes((current) => append ? [...current, ...data.quotes] : data.quotes);
        setTotal(Number(data.total ?? data.quotes.length));
        setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
          { label: UI_STRINGS.appAppProcurementQuotesPage.quotes },
        ]}
        title={UI_STRINGS.appAppProcurementQuotesPage.quoteResponsesCommercialEvaluations}
        description={UI_STRINGS.appAppProcurementQuotesPage.supplierItemRateBidsTaxStructuresRevisionsLedgerAndComparativeCommercialVariance}
        actions={
          <Link href="/procurement/rfqs" className="btn btn-secondary">
            <FileText size={16} />{UI_STRINGS.appAppProcurementQuotesPage.viewActiveRFQs}</Link>
        }
      />

      <Card
        title={interpolateUiString(UI_STRINGS.appAppProcurementQuotesPage.allSubmittedQuotationsLength, { "length": total })}
        subtitle={UI_STRINGS.appAppProcurementQuotesPage.versionControlledQuotesReceivedAgainstApprovedBOQBaselines}
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>{UI_STRINGS.appAppProcurementQuotesPage.loadingQuotes}</div>
          </div>
        ) : quotes.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<MessageSquare size={36} strokeWidth={1.5} color="#94a3b8" />}
              title={UI_STRINGS.appAppProcurementQuotesPage.noQuotesSubmittedYet}
              description={UI_STRINGS.appAppProcurementQuotesPage.onceInvitedVendorsSubmitCommercialRatesAgainstReleasedRFQsBidsAppearHere}
              actionText={UI_STRINGS.common.viewSourcingRFQs}
              actionHref="/procurement/rfqs"
            />
          </div>
        ) : (
          <>
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table enterprise-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>{UI_STRINGS.common.quoteNumber}</th>
                  <th>{UI_STRINGS.common.vendor}</th>
                  <th style={{ width: 140 }}>{UI_STRINGS.appAppProcurementQuotesPage.rFQPackage}</th>
                  <th style={{ width: 90 }}>{UI_STRINGS.common.version}</th>
                  <th style={{ width: 130, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementQuotesPage.baseAmount}</th>
                  <th style={{ width: 110, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementQuotesPage.tax}</th>
                  <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementQuotesPage.grandTotal}</th>
                  <th style={{ maxWidth: 200 }}>{UI_STRINGS.common.commercialTerms}</th>
                  <th style={{ width: 120 }}>{UI_STRINGS.appAppProcurementQuotesPage.submittedDate}</th>
                  <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
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
                      <span className="badge badge-info font-mono">{UI_STRINGS.common.v}{q.quoteVersion}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{UI_STRINGS.common.copytfdhmk}{q.totalBaseAmount?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{UI_STRINGS.common.copytfdhmk}{q.taxAmount?.toLocaleString()}</td>
                    <td style={{ fontWeight: 700, textAlign: 'right', color: '#059669' }}>{UI_STRINGS.common.copy1g8b5tg}{q.totalQuoteAmount?.toLocaleString()}
                    </td>
                    <td style={{ fontSize: 12, color: '#475569', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.commercialTerms}>
                      {q.commercialTerms || UI_STRINGS.appAppProcurementQuotesPage.standardCommercialTerms}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {new Date(q.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/procurement/rfqs/${q.rfqId}?tab=compare`}
                        className="btn btn-secondary btn-sm"
                      >{UI_STRINGS.appAppProcurementQuotesPage.compareInRFQ}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={() => fetchQuotes(nextCursor, true)} disabled={loadingMore}>
                {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
              </button>
            </div>
          )}
          </>
        )}
      </Card>
    </div>
  );
}
