'use client';
// app/(app)/procurement/negotiations/page.tsx
// Negotiations Hub
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Handshake, Clock, CheckCircle2, TrendingDown } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export default function NegotiationsHubPage() {
  const [negotiations, setNegotiations] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchNegotiations();
  }, []);

  const fetchNegotiations = async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/procurement/negotiations?page=${nextPage}&pageSize=50`);
      const data = await res.json();
      if (Array.isArray(data.negotiations)) {
        setNegotiations((current) => append ? [...current, ...data.negotiations] : data.negotiations);
        setTotal(Number(data.total ?? data.negotiations.length));
        setStatusCounts(data.statusCounts && typeof data.statusCounts === 'object' ? data.statusCounts : null);
        setPage(Number(data.page ?? nextPage));
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const lockedCount = statusCounts
    ? Number(statusCounts.CONCLUDED || 0) + Number(statusCounts.FINAL_RATE_LOCKED || 0)
    : negotiations.filter(n => n.status === 'CONCLUDED' || n.status === 'FINAL_RATE_LOCKED').length;
  const activeCount = statusCounts ? Math.max(total - lockedCount, 0) : negotiations.length - lockedCount;

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      <PageHeader
        title={UI_STRINGS.appAppProcurementNegotiationsPage.commercialNegotiationsHub}
        subtitle={UI_STRINGS.appAppProcurementNegotiationsPage.counterOffersNegotiationRoundsTargetPricesAndCommercialSavingsRealisation}
        breadcrumbs={[
          { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
          { label: UI_STRINGS.appAppProcurementNegotiationsPage.negotiations },
        ]}
        actions={
          <Link href="/procurement/rfqs" className="btn btn-secondary btn-sm">{UI_STRINGS.common.activeRFQsRegister}</Link>
        }
      />

      {/* KPI Cards */}
      <div className="mb-6">
        <SummaryCardGrid columns={3}>
          <SummaryCard
            label={UI_STRINGS.appAppProcurementNegotiationsPage.totalNegotiations}
            value={total}
            secondary={UI_STRINGS.appAppProcurementNegotiationsPage.allInitiatedNegotiationTracks}
            icon={<Handshake size={16} />}
            accent="default"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementNegotiationsPage.inActiveRounds}
            value={activeCount}
            secondary={UI_STRINGS.appAppProcurementNegotiationsPage.counterOffersOpenWithVendors}
            icon={<Clock size={16} />}
            accent="amber"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementNegotiationsPage.ratesConcludedLocked}
            value={lockedCount}
            secondary={UI_STRINGS.appAppProcurementNegotiationsPage.readyForAwardRecommendation}
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
        </SummaryCardGrid>
      </div>

      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementNegotiationsPage.ongoingConcludedNegotiations}{total}{UI_STRINGS.common.copyc7zu6c}</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />{UI_STRINGS.appAppProcurementNegotiationsPage.loadingNegotiations}</div>
        ) : negotiations.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Handshake size={36} strokeWidth={1.5} color="#94a3b8" />}
              title={UI_STRINGS.appAppProcurementNegotiationsPage.noNegotiationsActive}
              description={UI_STRINGS.appAppProcurementNegotiationsPage.initiateANegotiationRoundInsideAnRFQAfterReviewingQuoteComparisons}
              actionText={UI_STRINGS.common.viewActiveRFQs}
              actionHref="/procurement/rfqs"
            />
          </div>
        ) : (
          <>
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>{UI_STRINGS.common.rFQNumber}</th>
                  <th>{UI_STRINGS.common.project}</th>
                  <th style={{ width: 130, textAlign: 'center' }}>{UI_STRINGS.appAppProcurementNegotiationsPage.currentRound}</th>
                  <th style={{ width: 130, textAlign: 'center' }}>{UI_STRINGS.appAppProcurementNegotiationsPage.roundsLogged}</th>
                  <th style={{ width: 180, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementNegotiationsPage.bestCommercialValue}</th>
                  <th style={{ width: 150, textAlign: 'center' }}>{UI_STRINGS.common.status}</th>
                  <th style={{ width: 130 }}>{UI_STRINGS.common.lastUpdated}</th>
                  <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
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
                      <span className="badge badge-info font-mono">{UI_STRINGS.appAppProcurementNegotiationsPage.round}{neg.currentRound}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <strong>{neg._count?.rounds ?? neg.rounds?.length ?? 0}{UI_STRINGS.appAppProcurementNegotiationsPage.rounds}</strong>
                    </td>
                    <td style={{ fontWeight: 700, color: '#059669', textAlign: 'right' }}>{UI_STRINGS.common.copy1g8b5tg}{neg.bestQuoteAmount?.toLocaleString(I18N_CONFIG.defaultLocale) || UI_STRINGS.common.copy4s9bsz}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge status={neg.status} />
                    </td>
                    <td className="text-muted text-xs">{new Date(neg.updatedAt).toLocaleDateString(I18N_CONFIG.defaultLocale)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/procurement/rfqs/${neg.rfqId}?tab=negotiation`}
                        className="btn btn-sm btn-primary"
                      >{UI_STRINGS.appAppProcurementNegotiationsPage.negotiate}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {negotiations.length < total && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={() => fetchNegotiations(page + 1, true)} disabled={loadingMore}>
                {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
