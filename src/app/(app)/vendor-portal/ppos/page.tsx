'use client';
// src/app/(app)/vendor-portal/ppos/page.tsx
// Dedicated Vendor Orders & PPO Acceptance Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { Fragment, useCallback, useState, useEffect, useRef } from 'react';
import {
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Check,
  FileText,
  ChevronDown,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCardGrid, SummaryCard } from '@/components/ui/SummaryCard';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { VendorPpoLineView } from '@app-types/app/api/vendor-portal-ppos.types';


export default function VendorPposPage() {
  const [ppos, setPpos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hasMorePpos, setHasMorePpos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedPage, setLoadedPage] = useState(1);
  const [registerSummary, setRegisterSummary] = useState<{ total: number; totalValue: number; pendingCount: number } | null>(null);
  const [lineDetails, setLineDetails] = useState<Record<string, VendorPpoLineView[]>>({});
  const [loadingLineDetails, setLoadingLineDetails] = useState<Record<string, boolean>>({});
  const hasLoadedPposRef = useRef(false);
  const listRequestVersionRef = useRef(0);

  // Expandable Lines state
  const [expandedPpos, setExpandedPpos] = useState<Record<string, boolean>>({});

  // Accept Modal
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [selectedPpo, setSelectedPpo] = useState<any | null>(null);
  const [acceptedBy, setAcceptedBy] = useState('');
  const [acceptRemarks, setAcceptRemarks] = useState('');
  const [accepting, setAccepting] = useState(false);

  // Raise Issue Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueRemarks, setIssueRemarks] = useState('');
  const [raisingIssue, setRaisingIssue] = useState(false);

  const loadPpos = useCallback(async (options: { page?: number; append?: boolean; search?: string } = {}) => {
    const page = options.page || 1;
    const append = Boolean(options.append);
    const requestVersion = append ? null : ++listRequestVersionRef.current;
    if (append) setLoadingMore(true);
    else if (!hasLoadedPposRef.current) setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '50', search: options.search ?? searchTerm });
      const res = await fetch(`/api/vendor-portal/ppos?${query.toString()}`);
      if (requestVersion !== null && requestVersion !== listRequestVersionRef.current) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders }));
      }
      const data = await res.json();
      const pagePpos = data.ppos || [];
      setPpos((current) => append ? [...current, ...pagePpos] : pagePpos);
      setLoadedPage(page);
      setHasMorePpos(Boolean(data.hasMore));
      setRegisterSummary(data.summary || null);
      hasLoadedPposRef.current = true;
    } catch (e: unknown) {
      if (requestVersion !== null && requestVersion !== listRequestVersionRef.current) return;
      setError(e instanceof Error ? e.message : UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders);
    } finally {
      if (append) setLoadingMore(false);
      else if (requestVersion === listRequestVersionRef.current) setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    void loadPpos({ page: 1, search: searchTerm });
  }, [loadPpos, searchTerm]);

  const toggleExpand = async (ppo: any) => {
    const isExpanded = Boolean(expandedPpos[ppo.id]);
    setExpandedPpos((prev) => ({ ...prev, [ppo.id]: !prev[ppo.id] }));
    if (isExpanded || lineDetails[ppo.id] || (ppo.lines && ppo.lines.length > 0) || ppo.lineCount === 0) return;
    setLoadingLineDetails((prev) => ({ ...prev, [ppo.id]: true }));
    try {
      const res = await fetch(`/api/vendor-portal/ppos?ppoId=${encodeURIComponent(ppo.id)}`);
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders);
      }
      const result = await res.json();
      setLineDetails((prev) => ({ ...prev, [ppo.id]: result.lines || [] }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : UI_STRINGS.common.userMessages.failedToLoadPurchaseOrders);
    } finally {
      setLoadingLineDetails((prev) => ({ ...prev, [ppo.id]: false }));
    }
  };

  const handleAcceptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPpo) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/procurement/ppos/${selectedPpo.id}/vendor-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptedBy,
          vendorComments: acceptRemarks,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToAcceptPurchaseOrder }));
      }
      setShowAcceptModal(false);
      setSelectedPpo(null);
      loadPpos();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : UI_STRINGS.common.userMessages.failedToAcceptPurchaseOrder);
    } finally {
      setAccepting(false);
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPpo || !issueRemarks.trim()) return;
    setRaisingIssue(true);
    try {
      const res = await fetch(`/api/procurement/ppos/${selectedPpo.id}/vendor-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueRemarks,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToReportFulfillmentIssue }));
      }
      setShowIssueModal(false);
      setSelectedPpo(null);
      loadPpos();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : UI_STRINGS.common.userMessages.failedToReportFulfillmentIssue);
    } finally {
      setRaisingIssue(false);
    }
  };

  const filteredPpos = ppos.filter((p) => {
    return (
      p.ppoNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.rfq?.rfqNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalAmount = registerSummary?.totalValue ?? ppos.reduce((sum, p) => sum + (p.grossTotal || p.totalAmount || 0), 0);
  const pendingCount = registerSummary?.pendingCount ?? ppos.filter(p => !p.vendorAcceptedAt && p.vendorStatus !== 'ACCEPTED').length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300, margin: '0 auto' }}>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={UI_STRINGS.appAppVendorPortalPposPage.purchaseOrdersPPOsAwards}
        subtitle={UI_STRINGS.appAppVendorPortalPposPage.reviewOfficialPurchaseOrdersIssuedByClientsAcceptCommercialTermsOrRaiseFulfillmentQueries}
        badge={<span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{UI_STRINGS.common.vendorPortal}</span>}
        actions={
          <button
            type="button"
            onClick={() => void loadPpos()}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>{UI_STRINGS.common.refresh2}</span>
          </button>
        }
      />

      {/* ── KPI METRICS ──────────────────────────────────────────────────── */}
      <SummaryCardGrid columns={3} className="mb-6">
        <SummaryCard
          label={UI_STRINGS.appAppVendorPortalPposPage.totalPurchaseOrders}
          value={loading ? '—' : `${registerSummary?.total ?? ppos.length} Orders`}
          secondary={UI_STRINGS.appAppVendorPortalPposPage.commercialCommitmentsIssued}
          icon={<Receipt size={16} />}
          accent="blue"
        />
        <SummaryCard
          label={UI_STRINGS.appAppVendorPortalPposPage.cumulativeOrderValue}
          value={loading ? '—' : `₹ ${totalAmount.toLocaleString(I18N_CONFIG.defaultLocale)}`}
          secondary={UI_STRINGS.appAppVendorPortalPposPage.grossExecutedOrderValue}
          icon={<FileText size={16} />}
          accent="emerald"
        />
        <SummaryCard
          label={UI_STRINGS.appAppVendorPortalPposPage.actionPending}
          value={loading ? '—' : `${pendingCount} PPOs`}
          secondary={UI_STRINGS.appAppVendorPortalPposPage.awaitingVendorAcknowledgement}
          icon={<Clock size={16} />}
          accent={pendingCount > 0 ? 'amber' : 'slate'}
        />
      </SummaryCardGrid>

      {/* ── SEARCH BAR ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <div style={{ position: 'relative', width: 280 }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={UI_STRINGS.appAppVendorPortalPposPage.searchPPOProject}
            className="form-control"
            style={{ paddingLeft: 34, fontSize: 13 }}
          />
          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* ── ERROR ALERT ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 16, borderRadius: 6, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── ORDERS REGISTER ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>{UI_STRINGS.appAppVendorPortalPposPage.loadingPurchaseOrders}</div>
        </div>
      ) : filteredPpos.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileCheck size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>{UI_STRINGS.appAppVendorPortalPposPage.noPurchaseOrdersFound}</h3>
          <p style={{ fontSize: 13, margin: 0 }}>
            {searchTerm ? UI_STRINGS.appAppVendorPortalPposPage.noOrdersMatchYourSearchQuery : UI_STRINGS.appAppVendorPortalPposPage.noPurchaseOrdersHaveBeenIssuedToYourCompanyYet}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            className="table-responsive"
            onWheel={(e) => {
              if (e.shiftKey && e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
                e.preventDefault();
              }
            }}
          >
            <table className="table enterprise-table" style={{ margin: 0, minWidth: 1050 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>{UI_STRINGS.common.pPOReference}</th>
                  <th>{UI_STRINGS.appAppVendorPortalPposPage.projectRFQ}</th>
                  <th>{UI_STRINGS.appAppVendorPortalPposPage.pODate}</th>
                  <th>{UI_STRINGS.appAppVendorPortalPposPage.targetDelivery}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppVendorPortalPposPage.grossTotal}</th>
                  <th>{UI_STRINGS.appAppVendorPortalPposPage.vendorStatus}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredPpos.map((ppo) => {
                  const isExpanded = !!expandedPpos[ppo.id];
                  const isAccepted = ppo.vendorStatus === 'ACCEPTED_BY_VENDOR';
                  const isIssue = ppo.vendorStatus === 'ISSUE_RAISED';
                  const lines = lineDetails[ppo.id] ?? ppo.lines ?? [];
                  const lineCount = ppo.lineCount ?? ppo.lines?.length ?? 0;

                  return (
                    <Fragment key={ppo.id}>
                      <tr style={{ background: isExpanded ? 'var(--bg-subtle, #f8fafc)' : undefined }}>
                        <td>
                          <button
                            type="button"
                            onClick={() => void toggleExpand(ppo)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
                            title={UI_STRINGS.appAppVendorPortalPposPage.toggleLineItems}
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ppo.ppoNumber}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {lineCount}{UI_STRINGS.common.lineItems}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{ppo.project?.name || UI_STRINGS.common.project}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {ppo.rfq?.rfqNumber ? interpolateUiString(UI_STRINGS.appAppVendorPortalPposPage.rFQRfqNumber, { "rfqNumber": ppo.rfq.rfqNumber }) : UI_STRINGS.appAppVendorPortalPposPage.directContract}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12 }}>
                            {ppo.poDate ? new Date(ppo.poDate).toLocaleDateString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.copy4s9bsz}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} color="#f59e0b" />
                            <span>{ppo.deliveryDate ? new Date(ppo.deliveryDate).toLocaleDateString(I18N_CONFIG.defaultLocale) : UI_STRINGS.appAppVendorPortalPposPage.asAgreed}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: 14 }}>{UI_STRINGS.common.copy1g8b5tg}{Number(ppo.totalValue || ppo.grossTotal || 0).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                        </td>
                        <td>
                          {isAccepted ? (
                            <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={11} />
                              <span>{interpolateUiString(UI_STRINGS.appAppVendorPortalPposPage.accepted, { date: new Date(ppo.vendorAcceptedAt).toLocaleDateString(I18N_CONFIG.defaultLocale) })}</span>
                            </span>
                          ) : isIssue ? (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={11} />
                              <span>{UI_STRINGS.appAppVendorPortalPposPage.queryRaised}</span>
                            </span>
                          ) : (
                            <span className="badge badge-submitted">{UI_STRINGS.appAppVendorPortalPposPage.awaitingAcceptance}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {!isAccepted && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPpo(ppo);
                                    setAcceptedBy('');
                                    setAcceptRemarks('');
                                    setShowAcceptModal(true);
                                  }}
                                  className="btn btn-primary"
                                  style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  <Check size={12} />
                                  <span>{UI_STRINGS.appAppVendorPortalPposPage.acceptPPO}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPpo(ppo);
                                    setIssueRemarks(ppo.vendorIssueRemarks || '');
                                    setShowIssueModal(true);
                                  }}
                                  className="btn btn-secondary"
                                  style={{ padding: '4px 10px', fontSize: 12, color: '#b45309' }}
                                >{UI_STRINGS.appAppVendorPortalPposPage.raiseIssue}</button>
                              </>
                            )}
                            {isAccepted && (
                              <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>{UI_STRINGS.appAppVendorPortalPposPage.bindingOrderConfirmed}</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Line items expansion */}
                      {isExpanded && (
                        <tr style={{ background: '#f8fafc' }}>
                          <td colSpan={8} style={{ padding: '12px 24px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#334155' }}>{UI_STRINGS.appAppVendorPortalPposPage.orderLineItemsDetail}</div>
                            <table className="table" style={{ margin: 0, background: '#ffffff', borderRadius: 4 }}>
                              <thead>
                                <tr>
                                  <th>{UI_STRINGS.common.itemDescription}</th>
                                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                                  <th>{UI_STRINGS.common.uOM}</th>
                                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.unitRate}</th>
                                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.gST}</th>
                                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.lineTotal}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {loadingLineDetails[ppo.id] ? (
                                  <tr><td colSpan={6} style={{ textAlign: 'center' }}>{UI_STRINGS.common.loading}</td></tr>
                                ) : lines.map((line: any) => (
                                  <tr key={line.id}>
                                    <td style={{ fontSize: 12, fontWeight: 500 }}>{line.itemDescription}</td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{line.quantity}</td>
                                    <td style={{ fontSize: 12 }}>{line.uom}</td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{UI_STRINGS.common.copy1g8b5tg}{Number(line.unitRate).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ textAlign: 'right', fontSize: 12 }}>{line.gstPercent || 18}{UI_STRINGS.common.copy8w4luo}</td>
                                    <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{UI_STRINGS.common.copy1g8b5tg}{Number(line.totalAmount).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {ppo.vendorIssueRemarks && (
                              <div style={{ marginTop: 8, padding: 8, background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 4, fontSize: 12, color: '#92400e' }}>
                                <strong>{UI_STRINGS.appAppVendorPortalPposPage.reportedIssue}</strong> {ppo.vendorIssueRemarks}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasMorePpos && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" disabled={loadingMore} onClick={() => loadPpos({ page: loadedPage + 1, append: true, search: searchTerm })}>
            {loadingMore ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
          </button>
        </div>
      )}

      {/* ── ACCEPT PPO MODAL ────────────────────────────────────────────── */}
      {showAcceptModal && selectedPpo && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{UI_STRINGS.appAppVendorPortalPposPage.formalAcceptanceOfPPO}{selectedPpo.ppoNumber}
              </h3>
            </div>
            <form onSubmit={handleAcceptSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{UI_STRINGS.appAppVendorPortalPposPage.byAcceptingThisPurchaseOrderYouConfirmAcceptanceOfTheAgreedScopeQuantitiesRatesAndDeliveryTimelineForATotalValueOf}{' '}
                  <strong>{UI_STRINGS.common.copy1g8b5tg}{Number(selectedPpo.grossTotal).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}</strong>{UI_STRINGS.common.copyby08hd}</p>
                <div>
                  <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>{UI_STRINGS.common.authorizedSignatoryName}</label>
                  <input
                    type="text"
                    required
                    value={acceptedBy}
                    onChange={(e) => setAcceptedBy(e.target.value)}
                    placeholder={UI_STRINGS.appAppVendorPortalPposPage.fullNameOfSigningRepresentative}
                    className="form-control"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>{UI_STRINGS.appAppVendorPortalPposPage.acceptanceRemarksNotesOptional}</label>
                  <textarea
                    rows={2}
                    value={acceptRemarks}
                    onChange={(e) => setAcceptRemarks(e.target.value)}
                    placeholder={UI_STRINGS.appAppVendorPortalPposPage.productionKickoffDateAcknowledgementNote}
                    className="form-control"
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAcceptModal(false)}
                  className="btn btn-secondary"
                  disabled={accepting}
                >{UI_STRINGS.common.cancel}</button>
                <button
                  type="submit"
                  disabled={accepting || !acceptedBy.trim()}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {accepting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{UI_STRINGS.appAppVendorPortalPposPage.confirmOrderAcceptance}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RAISE ISSUE MODAL ───────────────────────────────────────────── */}
      {showIssueModal && selectedPpo && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#b45309' }}>{UI_STRINGS.appAppVendorPortalPposPage.raiseFulfillmentQueryOn}{selectedPpo.ppoNumber}
              </h3>
            </div>
            <form onSubmit={handleIssueSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{UI_STRINGS.appAppVendorPortalPposPage.reportAnyCommercialDiscrepancyDeliveryScheduleConflictOrSpecificationMismatchToTheProcurementTeamBeforeAccepting}</p>
                <div>
                  <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>{UI_STRINGS.appAppVendorPortalPposPage.issueQueryDescription}</label>
                  <textarea
                    rows={4}
                    required
                    value={issueRemarks}
                    onChange={(e) => setIssueRemarks(e.target.value)}
                    placeholder={UI_STRINGS.appAppVendorPortalPposPage.specifyTheIssueEGLeadTimeRequires3WeeksInsteadOf10DaysDrawingDiscrepancyInLine2}
                    className="form-control"
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="btn btn-secondary"
                  disabled={raisingIssue}
                >{UI_STRINGS.common.cancel}</button>
                <button
                  type="submit"
                  disabled={raisingIssue || !issueRemarks.trim()}
                  className="btn btn-primary"
                  style={{ background: '#b45309', borderColor: '#b45309' }}
                >
                  {raisingIssue ? UI_STRINGS.common.submitting : UI_STRINGS.common.submitIssueToBuyer}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
