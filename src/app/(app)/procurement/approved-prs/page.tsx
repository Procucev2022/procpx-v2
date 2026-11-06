'use client';
// src/app/(app)/procurement/approved-prs/page.tsx
// Procurement User: Approved PR Queue -> Sourcing & RFQ Creation

import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import PrDetailModal from '@/components/PrDetailModal';
import {
  FileCheck,
  Search,
  IndianRupee,
  CheckCircle2,
  RefreshCw,
  ShoppingBag,
  Eye,
} from 'lucide-react';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { ApprovedPrSummary } from '@app-types/app/api/procurement/approved-prs.types';


export default function ApprovedPrsPage() {
  const [prs, setPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPr, setSelectedPr] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalEstimatedValue, setTotalEstimatedValue] = useState(0);
  const [sourcingActiveCount, setSourcingActiveCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestVersionRef = useRef(0);

  const fetchPrs = async (options: { page?: number; append?: boolean; search?: string } = {}) => {
    const requestedPage = options.page || 1;
    const append = Boolean(options.append);
    const requestVersion = append ? null : ++requestVersionRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const query = new URLSearchParams({ search: options.search ?? search, page: String(requestedPage), pageSize: '50' });
      const res = await fetch(`/api/procurement/approved-prs?${query.toString()}`);
      if (requestVersion !== null && requestVersion !== requestVersionRef.current) return;
      const data = await res.json();
      const list: ApprovedPrSummary[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setPrs((current) => append ? [...current, ...list] : list);
      setTotal(Number.isFinite(data?.total) ? data.total : list.length);
      setTotalEstimatedValue(Number.isFinite(data?.totalEstimatedValue)
        ? data.totalEstimatedValue
        : list.reduce((sum, pr) => sum + (pr.totalEstimatedValue || 0), 0));
      setSourcingActiveCount(Number.isFinite(data?.sourcingActiveCount)
        ? data.sourcingActiveCount
        : list.filter((pr) => (pr.rfqCount || 0) > 0).length);
      setPage(requestedPage);
      setHasMore(Boolean(data?.hasMore));
    } catch (err) {
      if (requestVersion !== null && requestVersion !== requestVersionRef.current) return;
      console.error('Failed to load approved PRs', err);
    } finally {
      if (append) setLoadingMore(false);
      else if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrs();
  }, [search]);

  const totalValue = totalEstimatedValue;
  const readyToSourceCount = Math.max(0, total - sourcingActiveCount);

  return (
    <div className="space-y-6">
      <PageHeader
        title={UI_STRINGS.appAppProcurementApprovedPrsPage.approvedProcurementRequests}
        subtitle={UI_STRINGS.appAppProcurementApprovedPrsPage.sanctionedPRsReleasedByProjectApproverReadyForMarketSourcingAndRFQCreation}
        breadcrumbs={[
          { label: UI_STRINGS.common.procurement, href: '/procurement/approved-prs' },
          { label: UI_STRINGS.appAppProcurementApprovedPrsPage.approvedPRs },
        ]}
        actions={
          <button
            onClick={() => void fetchPrs()}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{UI_STRINGS.common.refresh2}</button>
        }
      />

      {/* KPI Cards */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label={UI_STRINGS.appAppProcurementApprovedPrsPage.totalApprovedPRs}
          value={total}
          secondary={UI_STRINGS.common.releasedToProcurement}
          icon={<FileCheck size={16} />}
          accent="default"
        />
        <SummaryCard
          label={UI_STRINGS.appAppProcurementApprovedPrsPage.totalSanctionedValue}
          value={`₹${(totalValue / 100000).toFixed(2)}L`}
          secondary={UI_STRINGS.appAppProcurementApprovedPrsPage.baselineEstimatedBudget}
          icon={<IndianRupee size={16} />}
          accent="emerald"
        />
        <SummaryCard
          label={UI_STRINGS.appAppProcurementApprovedPrsPage.readyForSourcing}
          value={readyToSourceCount}
          secondary={UI_STRINGS.appAppProcurementApprovedPrsPage.rFQNotYetInitiated}
          icon={<ShoppingBag size={16} />}
          accent="amber"
        />
        <SummaryCard
          label={UI_STRINGS.appAppProcurementApprovedPrsPage.inActiveSourcing}
          value={sourcingActiveCount}
          secondary={UI_STRINGS.appAppProcurementApprovedPrsPage.linkedToRFQPackages}
          icon={<CheckCircle2 size={16} />}
          accent="blue"
        />
      </SummaryCardGrid>

      {/* Main Table Card */}
      <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={UI_STRINGS.appAppProcurementApprovedPrsPage.searchByPRProjectCostCentre}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white shadow-sm"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">{UI_STRINGS.common.showing}{prs.length}{UI_STRINGS.appAppProcurementApprovedPrsPage.releasedProcurementPackages}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4" style={{ width: 140 }}>{UI_STRINGS.common.pRNumber}</th>
                <th className="py-3 px-4">{UI_STRINGS.common.packageDescription}</th>
                <th className="py-3 px-4 text-center" style={{ width: 85 }}>{UI_STRINGS.common.items4}</th>
                <th className="py-3 px-4" style={{ width: 95 }}>{UI_STRINGS.common.costCentre2}</th>
                <th className="py-3 px-4 text-right" style={{ width: 130 }}>{UI_STRINGS.common.pRAmount}</th>
                <th className="py-3 px-4" style={{ width: 110 }}>{UI_STRINGS.common.approvalStatus}</th>
                <th className="py-3 px-4" style={{ width: 140 }}>{UI_STRINGS.common.procurementStage}</th>
                <th className="py-3 px-4 text-center" style={{ width: 90 }}>{UI_STRINGS.common.rFQCount}</th>
                <th className="py-3 px-4 text-right" style={{ width: 115 }}>{UI_STRINGS.common.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <FileCheck size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-medium">{UI_STRINGS.appAppProcurementApprovedPrsPage.noApprovedProcurementRequestsFound}</p>
                    <p className="text-[11px] mt-0.5">{UI_STRINGS.appAppProcurementApprovedPrsPage.pRsApprovedByProjectApproverWillAppearHereAutomaticallyForSourcing}</p>
                  </td>
                </tr>
              ) : (
                prs.map((pr) => {
                  const rfqCount = pr.rfqCount ?? pr.rfqs?.length ?? 0;
                  const hasRfq = rfqCount > 0;
                  const itemCount = pr.lineCount ?? pr.lines?.length ?? 0;
                  const costCentreCode = pr.costCentre?.code || '—';

                  return (
                    <tr key={pr.id} className="hover:bg-slate-50/75 transition-colors">
                      {/* 1. PR Number */}
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => {
                            setSelectedPr(pr);
                            setShowDetailModal(true);
                          }}
                          title={UI_STRINGS.common.clickToViewDetails}
                        >
                          {pr.prNumber}
                        </span>
                      </td>

                      {/* 2. Short Package/PR Description */}
                      <td className="py-3 px-4" style={{ maxWidth: 260 }}>
                        <div
                          className="font-semibold text-slate-900 truncate"
                          title={interpolateUiString(UI_STRINGS.common.value1, { "value1": pr.title || UI_STRINGS.appAppProcurementApprovedPrsPage.procurementPackage })}
                        >
                          {pr.title || UI_STRINGS.appAppProcurementApprovedPrsPage.procurementPackage}
                        </div>
                      </td>

                      {/* 3. Item Count */}
                      <td className="py-3 px-4 text-center">
                        <span className="text-slate-600 font-medium text-xs">
                          {itemCount} {itemCount === 1 ? UI_STRINGS.common.item : UI_STRINGS.common.items5}
                        </span>
                      </td>

                      {/* 4. Cost Centre Code */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {costCentreCode}
                        </span>
                      </td>

                      {/* 5. PR Amount */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-bold text-slate-900">{UI_STRINGS.common.copy1g8b5tg}{(pr.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                        </div>
                      </td>

                      {/* 6. PR Approval Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={pr.status} />
                      </td>

                      {/* 7. Current Procurement Stage */}
                      <td className="py-3 px-4">
                        <span className={`badge ${hasRfq ? 'badge-info' : 'badge-draft'}`} style={{ fontSize: 11 }}>
                          {hasRfq ? UI_STRINGS.appAppProcurementApprovedPrsPage.inSourcing : UI_STRINGS.appAppProcurementApprovedPrsPage.readyForSourcing}
                        </span>
                      </td>

                      {/* 8. RFQ Count */}
                      <td className="py-3 px-4 text-center">
                        <span className={`badge ${hasRfq ? 'badge-info' : 'badge-draft'}`}>
                          {rfqCount} {rfqCount === 1 ? UI_STRINGS.common.rFQ : UI_STRINGS.common.rFQs}
                        </span>
                      </td>

                      {/* 9. One View Details Action */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPr(pr);
                            setShowDetailModal(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-sm inline-flex items-center gap-1.5"
                        >
                          <Eye size={12} />
                          <span>{UI_STRINGS.common.viewDetails}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {hasMore && !loading && (
        <div className="flex justify-center">
          <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => fetchPrs({ page: page + 1, append: true, search })}>
            {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
          </button>
        </div>
      )}

      {/* Standardised Reusable PR Detail Modal */}
      {showDetailModal && selectedPr && (
        <PrDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPr(null);
          }}
          pr={selectedPr}
          userRole="PROCUREMENT_USER"
        />
      )}
    </div>
  );
}
