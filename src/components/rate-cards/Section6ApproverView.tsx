'use client';
// src/components/rate-cards/Section6ApproverView.tsx
// Section 6: Rate Card Internal Approvals (Project Approver Level 1 -> Finance Approver Level 2)
import React, { useState } from 'react';
import {
  Check,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import AgreementPreviewModal from './AgreementPreviewModal';
import type { Section6Props } from "@app-types/components/rate-cards/Section6ApproverView.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function Section6ApproverView({
  role = 'PROJECT_APPROVER',
  rateCardId = 'RC-2026-0006',
  vendorName = 'Ramakrishna Interiors',
  vendorCode = 'VND-0006',
  category = 'Interior Works',
  vendorAcceptanceDate = '24 Oct 2026',
  projectApproved: initialProjectApproved = false,
  financeApproved: initialFinanceApproved = false,
  agreement = {
    required: true,
    type: 'TEMPLATE',
    documentTitle: 'Master Rate Agreement — Interior Works — Ramakrishna Interiors',
    documentNumber: 'MRA-RC-2026-0006-REV1',
    fileName: 'Master_Rate_Agreement_Interior_Works.pdf',
    fileSize: '320 KB',
    version: 1,
    signatureRequired: true,
    status: 'SIGNED',
    signature: {
      signedBy: 'K. Ramakrishna',
      designation: 'Managing Partner / Authorized Representative',
      signedAt: '24 Oct 2026, 12:00 IST',
      signatureType: 'DIGITAL_VERIFIED',
      signatureEvidenceId: 'DSC-2026-VND-0006-8848',
      verified: true,
    },
  },
  items = [
    { id: '1', itemCode: 'INT-001', description: UI_STRINGS.common.gypsumFalseCeiling, uom: 'SQFT', qty: 500, agreedRate: 100 },
    { id: '2', itemCode: 'INT-002', description: UI_STRINGS.common.vitrifiedTiles2x2Ft, uom: 'SQFT', qty: 1000, agreedRate: 88 },
    { id: '3', itemCode: 'INT-003', description: UI_STRINGS.common.modularPartitions, uom: 'SQFT', qty: 300, agreedRate: 315 },
    { id: '4', itemCode: 'INT-004', description: UI_STRINGS.common.woodenCarpentry, uom: 'SQFT', qty: 250, agreedRate: 405 },
    { id: '5', itemCode: 'INT-005', description: UI_STRINGS.common.paintingPremiumEmulsion, uom: 'SQFT', qty: 2000, agreedRate: 68 },
  ],
  onApproveProject,
  onApproveFinance,
  onReject,
}: Section6Props) {
  const isFinanceUser = role === 'FINANCE_APPROVER';
  const [comments, setComments] = useState('');
  const [projectApproved, setProjectApproved] = useState(initialProjectApproved || isFinanceUser);
  const [financeApproved, setFinanceApproved] = useState(initialFinanceApproved);
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  React.useEffect(() => {
    if (initialProjectApproved || isFinanceUser) {
      setProjectApproved(true);
    }
  }, [initialProjectApproved, isFinanceUser]);

  const hasAgreement = agreement && agreement.type !== 'NONE';
  const isSigned = !!agreement?.signature?.verified;
  const signatureRequired = hasAgreement && !!agreement?.signatureRequired;
  const signatureMissing = signatureRequired && !isSigned;

  const handleApprove = () => {
    if (!projectApproved) {
      setProjectApproved(true);
      if (onApproveProject) onApproveProject(comments);
    } else if (!financeApproved) {
      setFinanceApproved(true);
      if (onApproveFinance) onApproveFinance(comments);
    }
  };

  const handleReject = () => {
    if (onReject) onReject(comments);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 flex flex-col justify-between space-y-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 pb-4">
          <span className="w-8 h-8 rounded-full bg-[#0f52ba] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">{UI_STRINGS.componentsRateCardsSection6ApproverView.copye5x215}</span>
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                {isFinanceUser || projectApproved
                  ? UI_STRINGS.componentsRateCardsSection6ApproverView.rateCardApprovalLevel2FinanceApproverView
                  : UI_STRINGS.componentsRateCardsSection6ApproverView.rateCardApprovalLevel1ProjectApproverView}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {isFinanceUser || projectApproved
                  ? UI_STRINGS.componentsRateCardsSection6ApproverView.reviewLevel1ProjectSignOffAndCompleteFinalFinanceApprovalToActivateThisRateCard
                  : UI_STRINGS.componentsRateCardsSection6ApproverView.reviewTheVendorAcceptedRateCardAndProvideLevel1ProjectApprovalToRouteToFinance}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold self-start sm:self-center ${
                projectApproved && financeApproved
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : projectApproved
                  ? 'bg-blue-50 text-[#0f52ba] border border-blue-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {projectApproved && financeApproved
                ? UI_STRINGS.componentsRateCardsSection6ApproverView.fullyActivated
                : projectApproved
                ? UI_STRINGS.componentsRateCardsSection6ApproverView.level2FinancePending
                : UI_STRINGS.componentsRateCardsSection6ApproverView.level1ProjectPending}
            </span>
          </div>
        </div>

        {/* Metadata Banner */}
        <div className="bg-[#f8fafc] border border-slate-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.common.rateCardID}</span>
            <span className="font-bold text-slate-900 text-base">{rateCardId}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.common.vendorPartner}</span>
            <span className="font-semibold text-slate-800">{vendorName}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.common.category2}</span>
            <span className="text-slate-800 font-semibold">{category}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.componentsRateCardsSection6ApproverView.vendorAcceptance}</span>
            <span className="font-semibold text-emerald-700">{vendorAcceptanceDate}</span>
          </div>
        </div>

        {/* ── AGREEMENT DOCUMENT & SIGNATURE AUDIT STATUS ─────────────────── */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#0f52ba]" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{UI_STRINGS.componentsRateCardsSection6ApproverView.formalAgreementLegalVerificationStatus}</span>
            </div>
            {hasAgreement && (
              <button
                type="button"
                onClick={() => setShowAgreementModal(true)}
                className="h-8 px-3 bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors shadow-2xs self-start"
              >
                <Eye size={13} />
                <span>{UI_STRINGS.common.viewExecutedAgreement}</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-bold text-slate-900 text-sm">
                {hasAgreement ? agreement?.documentTitle : UI_STRINGS.componentsRateCardsSection6ApproverView.directRateCardSchedule}
              </div>
              <div className="text-slate-500 mt-0.5">
                {hasAgreement
                  ? interpolateUiString(UI_STRINGS.componentsRateCardsSection6ApproverView.documentValue1RevisionV10, { "value1": agreement?.documentNumber || `MRA-${rateCardId}` })
                  : UI_STRINGS.componentsRateCardsSection6ApproverView.standardScheduleOfRatesNoFormalBilateralAgreementDocumentRequired}
              </div>
            </div>

            <div>
              {hasAgreement ? (
                isSigned ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold">
                    <ShieldCheck size={14} className="text-emerald-600" />
                    <span>{UI_STRINGS.componentsRateCardsSection6ApproverView.digitallySignedBy}{agreement?.signature?.signedBy}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span>{UI_STRINGS.componentsRateCardsSection6ApproverView.agreementUnsignedSignatureEvidenceRequired}</span>
                  </div>
                )
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full font-semibold">
                  <CheckCircle2 size={14} className="text-slate-500" />
                  <span>{UI_STRINGS.componentsRateCardsSection6ApproverView.noFormalAgreementRequired}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Approval Checklist card (Canonical Business Sequence) */}
        <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-2xs space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{UI_STRINGS.componentsRateCardsSection6ApproverView.mandatoryBusinessSequenceProgress}</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Step 1: Buyer Accepted */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/40 border border-emerald-200">
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <Check size={14} strokeWidth={3} />
              </span>
              <div>
                <div className="font-bold text-xs text-slate-900">{UI_STRINGS.componentsRateCardsSection6ApproverView.copy1u5kpg2}</div>
                <div className="text-[11px] text-slate-600 font-medium mt-0.5">{UI_STRINGS.common.copyy2zker}</div>
                <div className="text-[11px] text-slate-500">{UI_STRINGS.common.categoryManager}</div>
              </div>
            </div>

            {/* Step 2: Vendor Accepted */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/40 border border-emerald-200">
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <Check size={14} strokeWidth={3} />
              </span>
              <div>
                <div className="font-bold text-xs text-slate-900">{UI_STRINGS.componentsRateCardsSection6ApproverView.copyhm65za}</div>
                <div className="text-[11px] text-slate-600 font-medium mt-0.5">{vendorAcceptanceDate}</div>
                <div className="text-[11px] text-slate-500">
                  {isSigned ? UI_STRINGS.componentsRateCardsSection6ApproverView.signedExecuted : hasAgreement ? UI_STRINGS.common.termsAccepted : UI_STRINGS.componentsRateCardsSection6ApproverView.directScheduleAccepted}
                </div>
              </div>
            </div>

            {/* Step 3: Project Approver (Level 1) */}
            <div
              className={`flex items-start gap-2.5 p-3 rounded-lg border ${
                projectApproved
                  ? 'bg-emerald-50/40 border-emerald-200'
                  : 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-300'
              }`}
            >
              {projectApproved ? (
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Check size={14} strokeWidth={3} />
                </span>
              ) : (
                <span className="w-6 h-6 rounded-full border-2 border-[#0f52ba] flex items-center justify-center shrink-0 mt-0.5 bg-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0f52ba]" />
                </span>
              )}
              <div>
                <div className="font-bold text-xs text-slate-900">{UI_STRINGS.componentsRateCardsSection6ApproverView.copy7r7c04}</div>
                <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                  {projectApproved ? UI_STRINGS.componentsRateCardsSection6ApproverView.copy13x6jck : UI_STRINGS.componentsRateCardsSection6ApproverView.actionRequired}
                </div>
                <div className="text-[11px] text-slate-500">
                  {projectApproved ? UI_STRINGS.componentsRateCardsSection6ApproverView.approvedByProjectApprover : UI_STRINGS.componentsRateCardsSection6ApproverView.pendingValidation}
                </div>
              </div>
            </div>

            {/* Step 4: Finance Approver (Level 2) */}
            <div
              className={`flex items-start gap-2.5 p-3 rounded-lg border ${
                financeApproved
                  ? 'bg-emerald-50/40 border-emerald-200'
                  : projectApproved
                  ? 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {financeApproved ? (
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Check size={14} strokeWidth={3} />
                </span>
              ) : projectApproved ? (
                <span className="w-6 h-6 rounded-full border-2 border-[#0f52ba] flex items-center justify-center shrink-0 mt-0.5 bg-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0f52ba]" />
                </span>
              ) : (
                <span className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center shrink-0 mt-0.5 bg-white text-slate-400 text-xs font-bold">{UI_STRINGS.common.copydlxun7}</span>
              )}
              <div>
                <div className="font-bold text-xs text-slate-900">{UI_STRINGS.componentsRateCardsSection6ApproverView.copy1szi8ph}</div>
                <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                  {financeApproved ? UI_STRINGS.componentsRateCardsSection6ApproverView.copy13x6jck : projectApproved ? UI_STRINGS.componentsRateCardsSection6ApproverView.actionRequired : UI_STRINGS.componentsRateCardsSection6ApproverView.awaitingLevel1}
                </div>
                <div className="text-[11px] text-slate-500">
                  {financeApproved ? UI_STRINGS.common.activeRateCard : UI_STRINGS.componentsRateCardsSection6ApproverView.finalActivationSignOff}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Policy Signature Notice if applicable */}
        {signatureMissing && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>{UI_STRINGS.componentsRateCardsSection6ApproverView.compliancePolicyNotice}</strong>{UI_STRINGS.componentsRateCardsSection6ApproverView.thisRateCardHasAnAttachedFormalAgreementThatRequiresAuthorizedSignatureEvidenceTheRateCardCannotBeTreatedAsFullyActiveWithoutValidSignatureEvidence}</div>
          </div>
        )}

        {/* Comments */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-700">{UI_STRINGS.componentsRateCardsSection6ApproverView.approvalRemarks}<span className="text-slate-400 font-normal">{UI_STRINGS.common.optional}</span>
          </label>
          <input
            type="text"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={UI_STRINGS.componentsRateCardsSection6ApproverView.addFormalGovernanceCommentsBeforeSigningOff}
            className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f52ba] text-slate-800 shadow-2xs"
          />
        </div>
      </div>

      {/* Actions (Standard 40-44px buttons) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={handleReject}
          className="h-11 px-5 border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 font-semibold text-sm transition-colors shadow-2xs"
        >{UI_STRINGS.componentsRateCardsSection6ApproverView.rejectReturnForCorrection}</button>

        <button
          type="button"
          onClick={handleApprove}
          className="h-11 px-6 bg-[#0f52ba] hover:bg-blue-800 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-2"
        >
          {isFinanceUser || projectApproved ? (
            <>
              <Check size={16} strokeWidth={2.5} />
              <span>{UI_STRINGS.componentsRateCardsSection6ApproverView.approveActivateRateCardLevel2Finance}</span>
            </>
          ) : (
            <>
              <Check size={16} strokeWidth={2.5} />
              <span>{UI_STRINGS.componentsRateCardsSection6ApproverView.approveRouteToFinanceLevel1Project}</span>
            </>
          )}
        </button>
      </div>

      {/* Agreement Preview Modal */}
      <AgreementPreviewModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        rateCardId={rateCardId}
        vendorName={vendorName}
        vendorCode={vendorCode}
        category={category}
        items={items}
        agreement={agreement}
      />
    </div>
  );
}
