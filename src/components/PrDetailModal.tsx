'use client';
// src/components/PrDetailModal.tsx
// Standardised, reusable PR Detail Modal for Dashboard, Approved PRs, and PR Register
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import SpecificationCell from '@/components/ui/SpecificationCell';
import {
  FileSpreadsheet,
  Calendar,
  ArrowRight,
  ListChecks,
  User,
  ShieldCheck,
  Package,
} from 'lucide-react';
import type { PrDetailModalProps, PurchaseRequestRfqSummary } from "@app-types/components/PrDetailModal.types";
import { reportClientEvent } from '@/lib/observability/client-reporter';
export type { PrDetailModalProps };
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { normalizePrLineForDisplay } from '@/lib/pr-line-detail';
import type { PrLineDetailRecord, PrLinePaginationMetadata } from "@app-types/lib/pr-line-pagination.types";



export default function PrDetailModal({
  isOpen,
  onClose,
  pr,
}: PrDetailModalProps) {
  const [detailedPr, setDetailedPr] = useState<any | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);
  const [linePagination, setLinePagination] = useState<PrLinePaginationMetadata | null>(null);
  const [loadingMoreLines, setLoadingMoreLines] = useState(false);
  const [lineLoadError, setLineLoadError] = useState('');
  const linePageRequestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++linePageRequestSequence.current;
    if (!isOpen || !pr) {
      setDetailedPr(null);
      setLoadingLines(false);
      setLinePagination(null);
      setLoadingMoreLines(false);
      setLineLoadError('');
      return;
    }

    // Check if lines are already provided with full specifications
    if (pr.lines && pr.lines.length > 0 && pr.lines[0].specification && pr.lines[0].itemCode) {
      setDetailedPr(pr);
      setLoadingLines(false);
      setLinePagination(pr.linePagination || null);
      setLoadingMoreLines(false);
      setLineLoadError('');
      return;
    }

    // Fetch authoritative lines from API
    const prId = pr.id || pr.prId;
    if (prId) {
      let active = true;
      setDetailedPr(null);
      setLoadingLines(true);
      setLinePagination(null);
      setLoadingMoreLines(false);
      setLineLoadError('');
      fetch(`/api/pr/${prId}`)
        .then(async (res) => {
          if (!res.ok) {
            reportClientEvent('error', 'purchase_request.detail_fetch_failed', { prId, status: res.status });
            return null;
          }
          return res.json();
        })
        .then((json) => {
          if (!active || sequence !== linePageRequestSequence.current) return;
          const detail = json?.data ?? json;
          if (detail && typeof detail === 'object') {
            setLinePagination(detail.linePagination || null);
            const detailLines = (detail.lines || []) as PrLineDetailRecord[];
            setDetailedPr({
              ...pr,
              ...detail,
              lines: detailLines.map((line, index) => normalizePrLineForDisplay(line, index, pr.category)),
            });
          } else {
            setDetailedPr(pr);
            setLinePagination(null);
          }
        })
        .catch(() => {
          if (!active || sequence !== linePageRequestSequence.current) return;
          reportClientEvent('error', 'purchase_request.detail_fetch_failed', { prId, reason: 'network_error' });
          setDetailedPr(pr);
          setLinePagination(null);
        })
        .finally(() => {
          if (active && sequence === linePageRequestSequence.current) setLoadingLines(false);
        });
      return () => {
        active = false;
        if (sequence === linePageRequestSequence.current) linePageRequestSequence.current += 1;
      };
    } else {
      setDetailedPr(pr);
      setLoadingLines(false);
      setLinePagination(null);
      setLoadingMoreLines(false);
      setLineLoadError('');
    }
  }, [isOpen, pr]);

  if (!isOpen || !pr) return null;

  const currentPr = detailedPr || pr;
  const lines = currentPr.lines || [];
  const rfqs = currentPr.rfqs || [];
  const prAmount = currentPr.requestedValue || currentPr.totalEstimatedValue || currentPr.estimatedValue || null;
  const stage = currentPr.sourcingStage || currentPr.currentStage || currentPr.overallStage || UI_STRINGS.common.notAvailable;
  const prId = currentPr.id || currentPr.prId;
  const hasActiveRfq = rfqs.some((rfq: PurchaseRequestRfqSummary) => rfq.status !== 'CANCELLED');
  const canCreateRfq = Boolean(prId) && !hasActiveRfq && (
    currentPr.canCreateRfq === true || ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT'].includes(currentPr.status || currentPr.prApprovalStatus)
  );
  const formatCurrency = (value: unknown) => {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return UI_STRINGS.common.notAvailable;
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
      ? `${UI_STRINGS.common.copy1g8b5tg}${numericValue.toLocaleString(I18N_CONFIG.defaultLocale)}`
      : UI_STRINGS.common.notAvailable;
  };
  const projectName = currentPr.projectName || currentPr.project?.name || UI_STRINGS.common.notAvailable;
  const projectCode = currentPr.projectCode || currentPr.project?.projectCode || '';
  const boqCode = currentPr.boqCode || currentPr.boq?.boqCode || UI_STRINGS.common.notAvailable;
  const boqRev = currentPr.approvedRevision || currentPr.boqRevision?.revisionCode || UI_STRINGS.common.notAvailable;
  const costCentreText = currentPr.costCentre
    ? (typeof currentPr.costCentre === 'object'
      ? [currentPr.costCentre.code, currentPr.costCentre.name].filter(Boolean).join(' - ') || UI_STRINGS.common.notAvailable
      : currentPr.costCentre)
    : UI_STRINGS.common.notAvailable;
  const categoryText = currentPr.category || (currentPr.categories?.length ? currentPr.categories.join(', ') : UI_STRINGS.common.notAvailable);
  const knownItemCount = Number(currentPr.totalLines ?? currentPr.itemCount ?? lines.length);
  const itemCount = Number.isFinite(knownItemCount) ? Math.max(lines.length, knownItemCount) : lines.length;

  const loadMoreLines = async () => {
    const cursor = linePagination?.nextCursor;
    if (!prId || !cursor || loadingMoreLines) return;
    const sequence = ++linePageRequestSequence.current;
    setLoadingMoreLines(true);
    setLineLoadError('');
    try {
      const response = await fetch(`/api/pr/${prId}/lines?cursor=${encodeURIComponent(cursor)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(UI_STRINGS.common.userMessages.failedToFetchProcurementRequests);
      if (sequence !== linePageRequestSequence.current) return;
      const page = (json?.data ?? json) as { lines?: PrLineDetailRecord[]; linePagination?: PrLinePaginationMetadata | null };
      const nextLines = (page?.lines || []).map((line, index) => normalizePrLineForDisplay(line, lines.length + index, currentPr.category));
      setDetailedPr((current: typeof detailedPr) => current?.id === prId
        ? { ...current, lines: [...(current.lines || []), ...nextLines] }
        : current);
      setLinePagination(page?.linePagination || null);
    } catch {
      if (sequence !== linePageRequestSequence.current) return;
      setLineLoadError(UI_STRINGS.common.userMessages.failedToFetchProcurementRequests);
      reportClientEvent('error', 'purchase_request.lines_page_fetch_failed', { prId });
    } finally {
      if (sequence === linePageRequestSequence.current) setLoadingMoreLines(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={interpolateUiString(UI_STRINGS.componentsPrDetailModal.procurementRequestDetailsValue1, { "value1": currentPr.prNumber || currentPr.boqCode || prId || UI_STRINGS.common.notAvailable })}
      subtitle={UI_STRINGS.componentsPrDetailModal.sanctionedTechnicalRequirementsAndCommercialMetadataBaselinedForProcurementSourcing}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5 text-xs text-slate-700">
        {/* ── 1. Commercial Baseline KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{UI_STRINGS.common.project}</span>
            <p className="font-semibold text-slate-900 mt-1 truncate" title={projectName}>
              {projectName}
            </p>
            {projectCode && (
              <span className="font-mono text-[11px] text-slate-500 font-medium">
                {projectCode}
              </span>
            )}
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{UI_STRINGS.common.costCentre2}</span>
            <p className="font-semibold text-slate-900 mt-1 truncate" title={costCentreText}>
              {costCentreText}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">{UI_STRINGS.componentsPrDetailModal.taxonomy}{categoryText}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{UI_STRINGS.componentsPrDetailModal.originatingBOQ}</span>
            <p className="font-mono font-semibold text-slate-900 mt-1">
              {boqCode}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">{UI_STRINGS.componentsPrDetailModal.approvedRev}<strong className="text-blue-700">{boqRev}</strong>
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{UI_STRINGS.componentsPrDetailModal.sanctionedBaseline}</span>
            <p className="font-mono font-bold text-base text-emerald-700 mt-0.5">{formatCurrency(prAmount)}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">{UI_STRINGS.componentsPrDetailModal.totalBudgetSanctioned}</span>
          </div>
        </div>

        {/* ── 2. Scope & Status Context Banner ── */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.componentsPrDetailModal.packageScopeDescription}</span>
              <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                {currentPr.description || currentPr.title || UI_STRINGS.common.notAvailable}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={currentPr.prApprovalStatus || currentPr.status || UI_STRINGS.common.notAvailable} />
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#0f52ba] border border-blue-200">
                {stage}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-600 pt-1 text-[11px] border-t border-slate-100">
            <span className="flex items-center gap-1.5">
              <ListChecks size={13} className="text-slate-400" />
              <strong>{itemCount}</strong>{UI_STRINGS.componentsPrDetailModal.lineItemsBaselined}</span>
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" />{UI_STRINGS.componentsPrDetailModal.targetDate}<strong>{currentPr.requiredDate ? new Date(currentPr.requiredDate).toLocaleDateString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.notAvailable}</strong>
            </span>
            {currentPr.requesterName && (
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-slate-400" />{UI_STRINGS.componentsPrDetailModal.requestedBy}<strong>{currentPr.requesterName}</strong>
              </span>
            )}
          </div>
        </div>

        {/* ── 3. Controlled Technical Line Items Table (Canonical Columns) ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <span>{UI_STRINGS.componentsPrDetailModal.controlledLineItems}{itemCount}{UI_STRINGS.common.items2}</span>
              <span className="text-[10px] text-slate-500 font-normal lowercase">{UI_STRINGS.componentsPrDetailModal.descriptionsQuantitiesAndSpecificationsLockedFromApprovedBOQ}</span>
            </h4>
          </div>

          {loadingLines ? (
            <div className="p-8 text-center text-slate-500 border border-slate-200 rounded-lg">{UI_STRINGS.componentsPrDetailModal.loadingLineItemsFromApprovedBaseline}</div>
          ) : lines.length === 0 ? (
            <div className="p-6 text-center text-slate-400 border border-slate-200 rounded-lg bg-slate-50">{UI_STRINGS.componentsPrDetailModal.noIndividualLineRecordsMappedCommercialBaselineAmountAppliesToWholePackage}</div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-64 shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center border-r border-slate-200">{UI_STRINGS.common.sNo2}</th>
                    <th className="py-2.5 px-3 w-28 border-r border-slate-200">{UI_STRINGS.common.itemCode}</th>
                    <th className="py-2.5 px-3.5 min-w-[170px] border-r border-slate-200">{UI_STRINGS.common.itemDescription}</th>
                    <th className="py-2.5 px-3.5 min-w-[200px] border-r border-slate-200">{UI_STRINGS.common.bOQDescription}</th>
                    <th className="py-2.5 px-2.5 text-center w-16 border-r border-slate-200">{UI_STRINGS.common.uOM}</th>
                    <th className="py-2.5 px-3 text-right w-20 border-r border-slate-200">{UI_STRINGS.common.qty}</th>
                    <th className="py-2.5 px-3 text-right w-28 border-r border-slate-200">{UI_STRINGS.componentsPrDetailModal.estRate}</th>
                    <th className="py-2.5 px-3.5 text-right w-32 font-bold text-slate-900">{UI_STRINGS.componentsPrDetailModal.estAmount}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {lines.map((line: any, idx: number) => {
                    const quantity = line.quantity === null || line.quantity === undefined ? null : Number(line.quantity);
                    const rate = line.estimatedRate === null || line.estimatedRate === undefined ? null : Number(line.estimatedRate);
                    const lineAmount = quantity !== null && rate !== null && Number.isFinite(quantity) && Number.isFinite(rate) ? quantity * rate : null;
                    const estimatedAmount = line.estimatedValue ?? lineAmount;
                    return (
                      <tr key={line.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-medium border-r border-slate-100">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                          {line.itemCode || UI_STRINGS.common.notAvailable}
                        </td>
                        <td className="py-2 px-3.5 font-medium text-slate-900 border-r border-slate-100">
                          <div>{line.itemDescription || UI_STRINGS.common.notAvailable}</div>
                          {line.category && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                              {line.category}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3.5 border-r border-slate-100">
                          <SpecificationCell
                            specification={line.specification || line.itemDescription || UI_STRINGS.common.notAvailable}
                            lineNumber={idx + 1}
                            itemDescription={line.itemDescription}
                            lineId={line.id || `line-${idx}`}
                            maxWidth={190}
                          />
                        </td>
                        <td className="py-2 px-2.5 text-center text-slate-700 border-r border-slate-100">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-[11px]">
                            {line.uom || UI_STRINGS.common.notAvailable}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 border-r border-slate-100">
                          {quantity !== null && Number.isFinite(quantity) ? quantity.toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.notAvailable}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 border-r border-slate-100">{formatCurrency(line.estimatedRate)}
                        </td>
                        <td className="py-2 px-3.5 text-right font-mono font-bold text-slate-900">{formatCurrency(estimatedAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                    <td colSpan={7} className="py-2.5 px-3.5 text-right uppercase tracking-wider text-[11px] text-slate-600 border-r border-slate-200">{UI_STRINGS.componentsPrDetailModal.totalSanctionedPackageAmount}</td>
                    <td className="py-2.5 px-3.5 text-right text-emerald-700 font-mono font-bold">{formatCurrency(prAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {lineLoadError && <p role="alert" className="mt-2 text-xs text-red-700">{lineLoadError}</p>}
          {linePagination?.hasMore && (
            <div className="mt-2 flex justify-center">
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadMoreLines} disabled={loadingMoreLines}>
                {loadingMoreLines ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
              </button>
            </div>
          )}
        </div>

        {/* ── 4. Linked RFQs & Sourcing History (If present) ── */}
        {rfqs && rfqs.length > 0 && (
          <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Package size={14} className="text-[#0f52ba]" />{UI_STRINGS.componentsPrDetailModal.associatedRFQSourcingPackages}{rfqs.length}{UI_STRINGS.common.copyc7zu6c}</span>
              <span className="text-[11px] text-[#0f52ba] font-medium">{UI_STRINGS.componentsPrDetailModal.liveProcurementExecution}</span>
            </div>

            <div className="space-y-2">
              {rfqs.map((rfq: any) => (
                <div
                  key={rfq.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-primary text-xs">
                        {rfq.rfqNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {rfq.status}
                      </span>
                    </div>
                    <div className="text-slate-800 font-medium text-xs">
                      {rfq.description || rfq.packageName || rfq.title || UI_STRINGS.common.notAvailable}
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
                      <span>{UI_STRINGS.componentsPrDetailModal.vendors}<strong>{rfq.vendorInvitationProgress || interpolateUiString(UI_STRINGS.componentsPrDetailModal.value1Quotes, { "value1": rfq.quotesCount || 0 })}</strong></span>
                      {rfq.negotiationStage && rfq.negotiationStage !== '—' && (
                        <span>{UI_STRINGS.componentsPrDetailModal.negotiation}<strong className="text-indigo-700">{rfq.negotiationStage}</strong></span>
                      )}
                      {rfq.awardStatus && rfq.awardStatus !== 'Not Prepared' && (
                        <span>{UI_STRINGS.componentsPrDetailModal.award}<strong className="text-emerald-700">{rfq.awardStatus}</strong></span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={rfq.openUrl || `/procurement/rfqs/${rfq.id}`}
                    className="h-8 px-3 bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs self-start sm:self-center shrink-0"
                  >
                    <span>{UI_STRINGS.componentsPrDetailModal.openRFQWorkspace}</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. Governance Integrity Footer ── */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px] flex items-center gap-2">
          <ShieldCheck size={16} className="text-[#0f52ba] shrink-0" />
          <span>
            <strong>{UI_STRINGS.componentsPrDetailModal.proCPXCommercialGovernance}</strong>{UI_STRINGS.componentsPrDetailModal.pRScopeAndRatesInheritStrictlyFromTheApprovedBOQRevisionLineAlterationsRequireAFormalBOQRevisionBranch}</span>
        </div>

        {/* ── 6. Modal Actions ── */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 text-xs transition-colors"
          >{UI_STRINGS.common.close}</button>

          <div className="flex items-center gap-2">
            {(currentPr.boqRevisionId || currentPr.revisionId) && (
              <Link
                href={`/boq/${currentPr.boqRevisionId || currentPr.revisionId}`}
                className="h-9 px-3.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <FileSpreadsheet size={13} />
                <span>{UI_STRINGS.componentsPrDetailModal.viewBOQRevision}</span>
              </Link>
            )}

            {canCreateRfq && (
              <Link
                href={currentPr.createRfqUrl || `/procurement/rfqs/new?${currentPr.boqRevisionId ? `revisionId=${currentPr.boqRevisionId}&` : ''}prId=${prId}`}
                className="h-9 px-4 bg-[#0f52ba] hover:bg-blue-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>{UI_STRINGS.componentsPrDetailModal.createRFQForThisPR}</span>
                <ArrowRight size={13} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
