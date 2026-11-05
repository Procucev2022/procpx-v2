'use client';
// app/(app)/procurement/approved-boqs/page.tsx
// Sourcing Queue: Approved Commercial Baselines ready for RFQ Packaging
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, ShieldCheck, ClipboardCheck } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { ApprovedBoqListResponse, ApprovedBoqSummary } from '@app-types/app/api/procurement/approved-boqs.types';


export default function ApprovedBoqsPage() {
  const [loading, setLoading] = useState(true);
  const [approvedBoqs, setApprovedBoqs] = useState<ApprovedBoqSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBoq, setSelectedBoq] = useState<ApprovedBoqSummary | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeLoadFailed, setScopeLoadFailed] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestVersionRef = useRef(0);
  const scopeRequestVersionRef = useRef(0);

  useEffect(() => {
    fetchApprovedBoqs();
  }, [search]);

  const fetchApprovedBoqs = async (options: { page?: number; append?: boolean; search?: string } = {}) => {
    const requestedPage = options.page || 1;
    const append = Boolean(options.append);
    const requestVersion = append ? null : ++requestVersionRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const query = new URLSearchParams({ search: options.search ?? search, page: String(requestedPage), pageSize: '25' });
      const res = await fetch(`/api/procurement/approved-boqs?${query.toString()}`);
      if (requestVersion !== null && requestVersion !== requestVersionRef.current) return;
      const data = await res.json() as ApprovedBoqListResponse;
      const pageBoqs = data.approvedBoqs || [];
      setApprovedBoqs((current) => append ? [...current, ...pageBoqs] : pageBoqs);
      setTotal(typeof data.total === 'number' && Number.isFinite(data.total) ? data.total : pageBoqs.length);
      setPage(requestedPage);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (requestVersion !== null && requestVersion !== requestVersionRef.current) return;
      console.error(err);
    } finally {
      if (append) setLoadingMore(false);
      else if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  };

  const inspectScope = async (boq: ApprovedBoqSummary) => {
    if (selectedBoq?.id === boq.id) {
      scopeRequestVersionRef.current += 1;
      setSelectedBoq(null);
      setScopeLoading(false);
      setScopeLoadFailed(false);
      return;
    }

    const requestVersion = ++scopeRequestVersionRef.current;
    setSelectedBoq(boq);
    setScopeLoading(true);
    setScopeLoadFailed(false);
    try {
      const query = new URLSearchParams({ revisionId: boq.id, pageSize: '1' });
      const res = await fetch(`/api/procurement/approved-boqs?${query.toString()}`);
      if (!res.ok) throw new Error(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
      const data = await res.json() as ApprovedBoqListResponse;
      const detailedBoq = data.approvedBoqs?.find((item) => item.id === boq.id);
      if (!detailedBoq || !Array.isArray(detailedBoq.lines)) throw new Error(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
      if (requestVersion === scopeRequestVersionRef.current) setSelectedBoq(detailedBoq);
    } catch {
      if (requestVersion === scopeRequestVersionRef.current) setScopeLoadFailed(true);
    } finally {
      if (requestVersion === scopeRequestVersionRef.current) setScopeLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
          { label: UI_STRINGS.common.approvedBOQs },
        ]}
        title={UI_STRINGS.appAppProcurementApprovedBoqsPage.approvedCommercialBaselinesSourcingQueue}
        description={UI_STRINGS.appAppProcurementApprovedBoqsPage.controlledClientApprovedBOQRevisionsReadyForRFQPackagingSupplierBiddingAndRateDiscovery}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/procurement/rfqs" className="btn btn-secondary">
              <FileText size={16} />{UI_STRINGS.appAppProcurementApprovedBoqsPage.viewAllRFQs}</Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary">
              <Plus size={16} />{UI_STRINGS.common.createNewRFQ}</Link>
          </div>
        }
      />

      {/* Governance Banner */}
      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          padding: '14px 20px',
          borderRadius: 8,
          marginBottom: 20,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          color: '#166534',
        }}
      >
        <ShieldCheck size={24} style={{ color: '#166534', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.governanceLockedCommercialBaselines}</strong>
          <div style={{ fontSize: 13, marginTop: 2, color: '#15803d' }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.allQuantitiesDescriptionsAndBenchmarkBudgetsInApprovedRevisionsAreStrictlyImmutableProcurementTeamsCanPackageLinesIntoCompetitiveRFQsWithoutManualReKeyingOrDiscrepancies}</div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          className="input"
          style={{ maxWidth: 440 }}
          placeholder={UI_STRINGS.appAppProcurementApprovedBoqsPage.searchProjectNameProjectCodeOrRevision}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table Card */}
      <Card
        title={interpolateUiString(UI_STRINGS.appAppProcurementApprovedBoqsPage.commercialBaselinesAvailableLength, { "length": total })}
        subtitle={UI_STRINGS.appAppProcurementApprovedBoqsPage.approvedByProjectApproverAndReleasedToProcurement}
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.loadingApprovedCommercialBaselines}</div>
          </div>
        ) : approvedBoqs.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<ClipboardCheck size={36} strokeWidth={1.5} color="#94a3b8" />}
              title={UI_STRINGS.appAppProcurementApprovedBoqsPage.noApprovedBOQsFound}
              description={UI_STRINGS.appAppProcurementApprovedBoqsPage.bOQsMustBeApprovedByTheProjectApproverToEnterTheProcurementSourcingQueue}
              actionText={UI_STRINGS.appAppProcurementApprovedBoqsPage.viewProjects}
              actionHref="/projects"
            />
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{UI_STRINGS.common.projectName}</th>
                  <th style={{ width: 110 }}>{UI_STRINGS.common.projectCode}</th>
                  <th style={{ width: 120 }}>{UI_STRINGS.common.location}</th>
                  <th style={{ width: 150 }}>{UI_STRINGS.common.approvedRevision}</th>
                  <th style={{ width: 160 }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.approvalDateBy}</th>
                  <th>{UI_STRINGS.common.categories}</th>
                  <th style={{ width: 90 }}>{UI_STRINGS.common.lines3}</th>
                  <th style={{ width: 150, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.benchmarkValue}</th>
                  <th style={{ width: 110 }}>{UI_STRINGS.common.activeRFQs}</th>
                  <th style={{ width: 220, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.sourcingAction}</th>
                </tr>
              </thead>
              <tbody>
                {approvedBoqs.map((boq) => (
                  <tr key={boq.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{boq.projectName}</div>
                    </td>
                    <td className="font-mono text-muted">{boq.projectCode}</td>
                    <td style={{ color: '#334155' }}>{boq.location || UI_STRINGS.common.copy4s9bsz}</td>
                    <td>
                      <span className="badge badge-approved font-mono" style={{ fontWeight: 700 }}>
                        {boq.approvedRevisionCode}{UI_STRINGS.appAppProcurementApprovedBoqsPage.lOCKED}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>
                        {boq.approvedAt ? new Date(boq.approvedAt).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}
                      </div>
                      <div className="text-muted" style={{ fontSize: 11 }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.by}{boq.approvedBy}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {boq.categories.map((c, idx) => (
                          <span key={idx} className="badge badge-draft" style={{ fontSize: 11 }}>
                            {c.category}{UI_STRINGS.common.copy1b3t0c5}{c.lineCount}{UI_STRINGS.common.copyc7zu6c}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong>{boq.totalLines}{UI_STRINGS.common.lines2}</strong>
                    </td>
                    <td style={{ fontWeight: 700, textAlign: 'right', color: '#1e40af' }}>{UI_STRINGS.common.copy1g8b5tg}{boq.estimatedBenchmarkValue?.toLocaleString()}
                    </td>
                    <td>
                      {boq.rfqCount > 0 ? (
                        <span className="badge badge-info">{boq.rfqCount}{UI_STRINGS.appAppProcurementApprovedBoqsPage.rFQs}</span>
                      ) : (
                        <span className="badge badge-draft">{UI_STRINGS.common.none}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => void inspectScope(boq)}
                          className="btn btn-secondary btn-sm"
                        >
                          {selectedBoq?.id === boq.id ? UI_STRINGS.appAppProcurementApprovedBoqsPage.hideScope : UI_STRINGS.appAppProcurementApprovedBoqsPage.inspectScope}
                        </button>
                        <Link
                          href={`/procurement/rfqs/new?revisionId=${boq.id}&projectId=${boq.projectId}`}
                          className="btn btn-primary btn-sm"
                        >{UI_STRINGS.appAppProcurementApprovedBoqsPage.createRFQ}</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {hasMore && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => fetchApprovedBoqs({ page: page + 1, append: true, search })}>
            {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
          </button>
        </div>
      )}

      {/* Scope Inspection Drawer/Panel */}
      {selectedBoq && (
        <div style={{ marginTop: 24 }}>
          <Card
            title={interpolateUiString(UI_STRINGS.appAppProcurementApprovedBoqsPage.baselineScopeInspectionProjectNameApprovedRevisionCode, { "projectName": selectedBoq.projectName, "approvedRevisionCode": selectedBoq.approvedRevisionCode })}
            subtitle={UI_STRINGS.appAppProcurementApprovedBoqsPage.quantitiesDescriptionsAndBenchmarkRatesAreLockedAndInheritedIntoYourRFQ}
            action={
              <Link
                href={`/procurement/rfqs/new?revisionId=${selectedBoq.id}&projectId=${selectedBoq.projectId}`}
                className="btn btn-primary btn-sm"
              >{UI_STRINGS.appAppProcurementApprovedBoqsPage.packageIntoRFQ}</Link>
            }
            noPadding
          >
            {scopeLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.common.loading}</div>
            ) : scopeLoadFailed ? (
              <div role="alert" style={{ padding: 24, color: '#b91c1c' }}>{UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs}</div>
            ) : (
            <div className="table-wrapper" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>{UI_STRINGS.common.sNo2}</th>
                    <th>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ width: 140 }}>{UI_STRINGS.common.category2}</th>
                    <th style={{ width: 80 }}>{UI_STRINGS.common.uOM}</th>
                    <th style={{ width: 120, textAlign: 'right' }}>{UI_STRINGS.common.quantityLocked}</th>
                    <th style={{ width: 130, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.benchmarkRate}</th>
                    <th style={{ width: 140, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementApprovedBoqsPage.benchmarkAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBoq.lines?.map((l) => (
                    <tr key={l.id}>
                      <td className="font-mono text-muted">{l.lineNumber}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{l.description}</td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: 11 }}>
                          {l.category}
                        </span>
                      </td>
                      <td>{l.uom}</td>
                      <td style={{ fontWeight: 700, textAlign: 'right' }}>{l.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{UI_STRINGS.common.copytfdhmk}{l.benchmarkRate?.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, textAlign: 'right', color: '#1e40af' }}>{UI_STRINGS.common.copy1g8b5tg}{l.benchmarkAmount?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
