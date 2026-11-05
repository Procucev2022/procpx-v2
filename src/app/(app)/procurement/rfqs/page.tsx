'use client';
// app/(app)/procurement/rfqs/page.tsx
// Enterprise RFQs Register & Control Tower with Approved Blue Summary Bar
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, ClipboardCheck, FileText, ArrowRight, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import EmptyState from '@/components/ui/EmptyState';
import { ShoppingBag, TrendingUp, CheckCircle2, Lock } from 'lucide-react';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


// Helper to calculate actual workflow stage from persisted records
function getActualRfqWorkflowStage(rfq: any): { stage: string; bg: string; color: string; border: string } {
  // 1. Post-award / PPO stage
  if (rfq.ppos?.length > 0 || rfq.ppo || rfq.status === 'PPO_ISSUED' || rfq.status === 'PPO_IN_PROGRESS') {
    return { stage: 'PPO in Progress', bg: '#FFF7ED', color: '#C2410C', border: '#FFEDD5' };
  }
  // 2. Award stages
  if (rfq.status === 'AWARDED' || rfq.status === 'AWARD_APPROVED' || (rfq.awards?.[0]?.status === 'APPROVED')) {
    return { stage: 'Award Approved', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' };
  }
  if (rfq.status === 'AWARD_RECOMMENDED' || rfq.status === 'AWARD_PENDING' || (rfq.awards?.length > 0 && rfq.awards[0]?.status === 'PENDING_APPROVAL')) {
    return { stage: 'Award Pending Approval', bg: '#FDF4FF', color: '#A21CAF', border: '#F5D0FE' };
  }
  // 3. Negotiation stage
  if (rfq.status === 'NEGOTIATION' || rfq.status === 'FINAL_RATE_LOCKED' || rfq.negotiations?.length > 0) {
    return { stage: 'Negotiation in Progress', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
  }
  // 4. Comparison / Quotes Received stage
  if (rfq.status === 'COMPARISON' || rfq.status === 'RESPONSE_CLOSED' || (rfq.quotesCount && rfq.quotesCount > 0) || rfq.quotes?.length > 0) {
    return { stage: 'Quote Comparison', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
  }
  // 5. Released / Awaiting Quotations
  if (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN' || rfq.status === 'AWAITING_QUOTES') {
    return { stage: 'Awaiting Quotations', bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' };
  }
  // 6. Draft
  return { stage: 'Draft', bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' };
}

function RfqsListContent() {
  const searchParams = useSearchParams();
  const filterQuery = searchParams.get('filter') || 'all';

  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRfqs, setTotalRfqs] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState(filterQuery);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void fetchRfqs(1, false);
  }, [activeTab, search]);

  const fetchRfqs = async (requestedPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      let url = `/api/procurement/rfqs?search=${encodeURIComponent(search)}&page=${requestedPage}&pageSize=50`;
      if (activeTab === 'active') {
        url += '&status=active';
      } else if (activeTab !== 'all' && activeTab !== 'rerfq') {
        url += `&status=${activeTab.toUpperCase()}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.rfqs) {
        let filtered = data.rfqs;
        if (activeTab === 'rerfq') {
          filtered = filtered.filter((r: any) => r.isReRfq || r.title.includes('Re-RFQ'));
        }
        const allRows = append ? [...rfqs, ...filtered] : filtered;
        const fallbackStatusCounts = allRows.reduce((counts: Record<string, number>, rfq: { status?: string }) => {
          const rowStatus = rfq.status || 'UNKNOWN';
          counts[rowStatus] = (counts[rowStatus] || 0) + 1;
          return counts;
        }, {} as Record<string, number>);
        setRfqs((previous) => append ? [...previous, ...filtered] : filtered);
        setPage(data.page ?? requestedPage);
        setTotalPages(data.totalPages ?? 1);
        setTotalRfqs(data.total ?? allRows.length);
        setStatusCounts(data.statusCounts ?? fallbackStatusCounts);
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
          { label: UI_STRINGS.common.rFQs },
        ]}
        title={UI_STRINGS.appAppProcurementRfqsPage.requestForQuotationsRFQs}
        description={UI_STRINGS.appAppProcurementRfqsPage.activeSourcingPackagesCompetitiveQuoteEvaluationsRateLockingAndCommercialAwards}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/procurement/approved-boqs" className="btn btn-secondary">
              <ClipboardCheck size={16} />{UI_STRINGS.appAppProcurementRfqsPage.sourcingQueue}</Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary">
              <Plus size={16} />{UI_STRINGS.common.createNewRFQ}</Link>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="mb-6">
        <SummaryCardGrid columns={4}>
          <SummaryCard
            label={UI_STRINGS.appAppProcurementRfqsPage.totalRFQs}
            value={activeTab === 'rerfq' ? rfqs.length : totalRfqs}
            secondary={UI_STRINGS.appAppProcurementRfqsPage.allSourcingPackages}
            icon={<FileText size={16} />}
            accent="default"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementRfqsPage.inMarketResponse}
            value={(statusCounts.RELEASED || 0) + (statusCounts.VENDOR_RESPONSE_OPEN || 0) + (statusCounts.AWAITING_QUOTES || 0)}
            secondary={UI_STRINGS.appAppProcurementRfqsPage.openForVendorQuotes}
            icon={<ShoppingBag size={16} />}
            accent="blue"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementRfqsPage.comparisonNegotiation}
            value={(statusCounts.COMPARISON || 0) + (statusCounts.NEGOTIATION || 0)}
            secondary={UI_STRINGS.appAppProcurementRfqsPage.commercialEvaluations}
            icon={<TrendingUp size={16} />}
            accent="amber"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementRfqsPage.awardedPPO}
            value={(statusCounts.AWARDED || 0) + (statusCounts.AWARD_APPROVED || 0) + (statusCounts.PPO_ISSUED || 0) + (statusCounts.FINAL_RATE_LOCKED || 0)}
            secondary={UI_STRINGS.appAppProcurementRfqsPage.finalisedCommercialAwards}
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
        </SummaryCardGrid>
      </div>

      {/* Tabs Filter */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          { key: 'all', label: UI_STRINGS.appAppProcurementRfqsPage.allRFQs },
          { key: 'active', label: UI_STRINGS.appAppProcurementRfqsPage.activeSourcing },
          { key: 'draft', label: UI_STRINGS.common.drafts },
          { key: 'released', label: UI_STRINGS.appAppProcurementRfqsPage.released },
          { key: 'comparison', label: UI_STRINGS.appAppProcurementRfqsPage.underComparison },
          { key: 'negotiation', label: UI_STRINGS.appAppProcurementRfqsPage.underNegotiation },
          { key: 'final_rate_locked', label: UI_STRINGS.appAppProcurementRfqsPage.rateLocked },
          { key: 'awarded', label: UI_STRINGS.appAppProcurementRfqsPage.awardedPPO },
          { key: 'rerfq', label: UI_STRINGS.appAppProcurementRfqsPage.reRFQs },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 flex gap-3 items-center">
        <input
          type="text"
          className="form-control"
          style={{ maxWidth: 440, height: 40 }}
          placeholder={UI_STRINGS.appAppProcurementRfqsPage.searchByRFQNumberTitlePackageOrProject}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Enterprise Data Table: Exactly 14 Columns in Specified Order */}
      <Card
        title={interpolateUiString(UI_STRINGS.appAppProcurementRfqsPage.rFQSourcingRegisterLength, { "length": totalRfqs })}
        subtitle={UI_STRINGS.appAppProcurementRfqsPage.persistedSourcingPackagesCompetitiveQuoteEvaluationsRateLockingAndCommercialAwards}
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>{UI_STRINGS.appAppProcurementRfqsPage.loadingRFQs}</div>
          </div>
        ) : rfqs.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<FileText size={36} strokeWidth={1.5} color="#94a3b8" />}
              title={UI_STRINGS.common.noRFQsFound}
              description={UI_STRINGS.appAppProcurementRfqsPage.noRFQsMatchingThisFilterOrSearchQueryCreateYourFirstRFQFromAnApprovedBOQ}
              actionText={UI_STRINGS.appAppProcurementRfqsPage.createNewRFQ}
              actionHref="/procurement/rfqs/new"
            />
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1540 }}>
              <thead>
                <tr>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copykuf8hr}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copygix47d}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 170, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy4iwgzl}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 110, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copymxa7o6}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 160, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy7yw641}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy1lr3euh}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 100, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy9nrxd7}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy1sw0lj6}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 90, textAlign: 'center', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy1c57vvi}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 120, whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copybw2n7c}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 110, textAlign: 'center', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copyj1q8n}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'center', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy1ya8f1u}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 150, textAlign: 'center', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copynkk4lk}</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}>{UI_STRINGS.appAppProcurementRfqsPage.copy1r78230}</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((rfq) => {
                  const boqNo = rfq.boqCode || rfq.boqRevision?.boq?.boqCode || (rfq.project?.projectCode ? `BOQ-${rfq.project.projectCode}` : 'BOQ-R1');
                  const rfqNo = rfq.rfqNumber;
                  const projectName = rfq.project?.name || 'Project';
                  const location = rfq.location || rfq.project?.location || rfq.project?.city || 'India';
                  const packageTrade = rfq.packageName || rfq.title || 'Civil & Interior Package';
                  const costCentre = rfq.costCentre || 'CC45 - Fitout';
                  const boqRevision = rfq.boqRevision?.revisionCode || 'R0';
                  const totalBoqValue = rfq.totalBoqValue || rfq.estimatedBenchmarkValue || 0;
                  const rfqLinesCount = rfq.totalLines || 0;
                  const createdDate = rfq.releasedAt ? new Date(rfq.releasedAt).toLocaleDateString() : rfq.createdAt ? new Date(rfq.createdAt).toLocaleDateString() : '—';
                  const invitedCount = rfq.invitedVendorsCount || rfq.invitedVendors?.length || 0;
                  const quotesCount = rfq.quotesCount || 0;
                  const workflow = getActualRfqWorkflowStage(rfq);

                  return (
                    <tr key={rfq.id}>
                      {/* 1. BOQ No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1E40AF', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {boqNo}
                      </td>

                      {/* 2. RFQ No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#2563EB', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/procurement/rfqs/${rfq.id}`}
                          className="font-mono font-bold text-primary"
                          style={{ textDecoration: 'none' }}
                        >
                          {rfqNo}
                        </Link>
                        {rfq.isReRfq && (
                          <div style={{ marginTop: 2 }}>
                            <span className="badge badge-warning" style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>{UI_STRINGS.appAppProcurementRfqsPage.rERFQ}</span>
                          </div>
                        )}
                      </td>

                      {/* 3. Project */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        <div>{projectName}</div>
                        <div className="font-mono text-muted" style={{ fontSize: 11 }}>
                          {rfq.project?.projectCode}
                        </div>
                      </td>

                      {/* 4. Location */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {location}
                      </td>

                      {/* 5. Package / Trade */}
                      <td style={{ padding: '9px 12px', fontWeight: 500, color: '#1E293B', whiteSpace: 'nowrap' }}>
                        {packageTrade}
                      </td>

                      {/* 6. Cost Centre */}
                      <td style={{ padding: '9px 12px', color: '#334155', whiteSpace: 'nowrap' }}>
                        {costCentre}
                      </td>

                      {/* 7. BOQ Revision */}
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span className="badge badge-approved" style={{ fontSize: 10, fontWeight: 700 }}>
                          {boqRevision}
                        </span>
                      </td>

                      {/* 8. Total BOQ Value */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'right', color: '#1E40AF', whiteSpace: 'nowrap' }}>{UI_STRINGS.common.copy1g8b5tg}{totalBoqValue.toLocaleString()}
                      </td>

                      {/* 9. RFQ Lines */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {rfqLinesCount}{UI_STRINGS.common.lines}</td>

                      {/* 10. Created / Issued Date */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {createdDate}
                      </td>

                      {/* 11. Invited Vendors */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        {invitedCount}{UI_STRINGS.appAppProcurementRfqsPage.vendors}</td>

                      {/* 12. Quotations Received */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: quotesCount > 0 ? '#DCFCE7' : '#F1F5F9',
                            color: quotesCount > 0 ? '#15803D' : '#64748B',
                            border: `1px solid ${quotesCount > 0 ? '#BBF7D0' : '#CBD5E1'}`,
                          }}
                        >
                          {quotesCount}{UI_STRINGS.appAppProcurementRfqsPage.received}</span>
                      </td>

                      {/* 13. RFQ Status */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: workflow.bg,
                            color: workflow.color,
                            border: `1px solid ${workflow.border}`,
                          }}
                        >
                          {workflow.stage}
                        </span>
                      </td>

                      {/* 14. Action */}
                      <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/procurement/rfqs/${rfq.id}`}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >{UI_STRINGS.appAppProcurementRfqsPage.openWorkspace}<ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {page < totalPages && (
        <div className="flex justify-center py-4">
          <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => void fetchRfqs(page + 1, true)}>
            {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
          </button>
          <span className="sr-only">{interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: page, value2: totalPages })}</span>
        </div>
      )}
    </div>
  );
}

export default function RfqsListPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppProcurementRfqsPage.loadingRFQControlTower}</div>}>
      <RfqsListContent />
    </Suspense>
  );
}
