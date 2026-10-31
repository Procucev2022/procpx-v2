'use client';
// src/components/PrDetailModal.tsx
// Standardised, reusable PR Detail Modal for Dashboard, Approved PRs, and PR Register
import { I18N_CONFIG } from '@/lib/i18n.constants';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import SpecificationCell from '@/components/ui/SpecificationCell';
import {
  Building2,
  Layers,
  FileSpreadsheet,
  IndianRupee,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  Tag,
  ListChecks,
  User,
  ShieldCheck,
  Package,
} from 'lucide-react';
import type { PrDetailModalProps } from "@app-types/components/PrDetailModal.types";
export type { PrDetailModalProps };
import { DEMO_LINES } from "./PrDetailModal.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function PrDetailModal({
  isOpen,
  onClose,
  pr,
  userRole = 'PROCUREMENT_USER',
  onCreateRfq,
}: PrDetailModalProps) {
  const [detailedPr, setDetailedPr] = useState<any | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    if (!isOpen || !pr) {
      setDetailedPr(null);
      return;
    }

    // Check if demo record
    if (pr.isExample || pr.id === 'PR-DEMO-001' || pr.prNumber === 'PR-DEMO-001') {
      setDetailedPr({
        ...pr,
        lines: DEMO_LINES,
      });
      return;
    }

    // Check if lines are already provided with full specifications
    if (pr.lines && pr.lines.length > 0 && pr.lines[0].specification && pr.lines[0].itemCode) {
      setDetailedPr(pr);
      return;
    }

    // Fetch authoritative lines from API
    const prId = pr.id || pr.prId;
    if (prId && !String(prId).startsWith('demo') && !String(prId).startsWith('PR-DEMO')) {
      setLoadingLines(true);
      fetch(`/api/pr/${prId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.data) {
            setDetailedPr({
              ...pr,
              ...json.data,
              lines: (json.data.lines || []).map((l: any, idx: number) => ({
                id: l.id,
                lineNumber: l.lineNumber || String(idx + 1),
                itemCode: l.itemCode || l.boqLine?.itemCode || `ITM-${idx + 1}`,
                itemDescription: l.itemDescription || l.boqLine?.standardDescription || l.boqLine?.originalDescription || 'Line Item',
                specification: l.specification || l.boqLine?.specification || l.itemDescription,
                category: l.category || pr.category || 'General',
                quantity: l.quantity,
                uom: l.uom || l.boqLine?.uom?.code || l.boqLine?.uomRaw || 'NOS',
                estimatedRate: l.estimatedRate || l.boqLine?.aiUnitCost || 0,
                estimatedValue: l.estimatedValue || l.boqLine?.aiTotalCost || 0,
              })),
            });
          } else {
            setDetailedPr(pr);
          }
        })
        .catch(() => setDetailedPr(pr))
        .finally(() => setLoadingLines(false));
    } else {
      setDetailedPr(pr);
    }
  }, [isOpen, pr]);

  if (!isOpen || !pr) return null;

  const currentPr = detailedPr || pr;
  const lines = currentPr.lines || [];
  const rfqs = currentPr.rfqs || [];
  const prAmount = currentPr.requestedValue || currentPr.totalEstimatedValue || currentPr.estimatedValue || 0;
  const stage = currentPr.sourcingStage || currentPr.currentStage || currentPr.overallStage || 'Approved PR — Awaiting RFQ';
  const isAwaitingRfq = stage === 'Approved PR — Awaiting RFQ' || rfqs.length === 0;
  const projectName = currentPr.projectName || currentPr.project?.name || 'Project';
  const projectCode = currentPr.projectCode || currentPr.project?.projectCode || '';
  const boqCode = currentPr.boqCode || currentPr.boq?.boqCode || '—';
  const boqRev = currentPr.approvedRevision || currentPr.boqRevision?.revisionCode || 'R0';
  const costCentreText = currentPr.costCentre ? (typeof currentPr.costCentre === 'object' ? `${currentPr.costCentre.code} - ${currentPr.costCentre.name}` : currentPr.costCentre) : 'General';
  const categoryText = currentPr.category || (currentPr.categories ? currentPr.categories.join(', ') : 'Civil & Interior');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={interpolateUiString(UI_STRINGS.componentsPrDetailModal.procurementRequestDetailsValue1, { "value1": currentPr.prNumber || currentPr.boqCode })}
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
            <p className="font-mono font-bold text-base text-emerald-700 mt-0.5">{UI_STRINGS.common.copy1g8b5tg}{prAmount.toLocaleString(I18N_CONFIG.defaultLocale)}
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
                {currentPr.description || currentPr.title || UI_STRINGS.componentsPrDetailModal.procurementCommercialPackage}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={currentPr.prApprovalStatus || currentPr.status || 'APPROVED'} />
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#0f52ba] border border-blue-200">
                {stage}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-600 pt-1 text-[11px] border-t border-slate-100">
            <span className="flex items-center gap-1.5">
              <ListChecks size={13} className="text-slate-400" />
              <strong>{lines.length || currentPr.itemCount || currentPr.totalLines || 8}</strong>{UI_STRINGS.componentsPrDetailModal.lineItemsBaselined}</span>
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" />{UI_STRINGS.componentsPrDetailModal.targetDate}<strong>{currentPr.requiredDate ? new Date(currentPr.requiredDate).toLocaleDateString(I18N_CONFIG.defaultLocale) : UI_STRINGS.componentsPrDetailModal.immediateRequirement}</strong>
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
              <span>{UI_STRINGS.componentsPrDetailModal.controlledLineItems}{lines.length}{UI_STRINGS.common.items2}</span>
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
                    const lineAmount = (line.quantity || 0) * (line.estimatedRate || 0);
                    return (
                      <tr key={line.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-medium border-r border-slate-100">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                          {line.itemCode || interpolateUiString(UI_STRINGS.componentsPrDetailModal.iTMValue1, { "value1": idx + 1 })}
                        </td>
                        <td className="py-2 px-3.5 font-medium text-slate-900 border-r border-slate-100">
                          <div>{line.itemDescription}</div>
                          {line.category && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                              {line.category}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3.5 border-r border-slate-100">
                          <SpecificationCell
                            specification={line.specification || line.itemDescription}
                            lineNumber={idx + 1}
                            itemDescription={line.itemDescription}
                            lineId={line.id || `line-${idx}`}
                            maxWidth={190}
                          />
                        </td>
                        <td className="py-2 px-2.5 text-center text-slate-700 border-r border-slate-100">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-[11px]">
                            {line.uom}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 border-r border-slate-100">
                          {line.quantity?.toLocaleString(I18N_CONFIG.defaultLocale) ?? UI_STRINGS.common.copy4s9bsz}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 border-r border-slate-100">{UI_STRINGS.common.copy1g8b5tg}{(line.estimatedRate || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                        </td>
                        <td className="py-2 px-3.5 text-right font-mono font-bold text-slate-900">{UI_STRINGS.common.copy1g8b5tg}{(line.estimatedValue || lineAmount || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                    <td colSpan={7} className="py-2.5 px-3.5 text-right uppercase tracking-wider text-[11px] text-slate-600 border-r border-slate-200">{UI_STRINGS.componentsPrDetailModal.totalSanctionedPackageAmount}</td>
                    <td className="py-2.5 px-3.5 text-right text-emerald-700 font-mono font-bold">{UI_STRINGS.common.copy1g8b5tg}{prAmount.toLocaleString(I18N_CONFIG.defaultLocale)}
                    </td>
                  </tr>
                </tfoot>
              </table>
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
                      {rfq.description || rfq.packageName}
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

            {isAwaitingRfq && (
              <Link
                href={currentPr.createRfqUrl || `/procurement/rfqs/new?${currentPr.boqRevisionId ? `revisionId=${currentPr.boqRevisionId}&` : ''}prId=${currentPr.id || currentPr.prId}`}
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
