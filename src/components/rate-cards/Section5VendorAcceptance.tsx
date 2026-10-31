'use client';
// src/components/rate-cards/Section5VendorAcceptance.tsx
// Section 5: Vendor Acceptance (Vendor Portal View) — Preserving canonical sequence with optional agreement & signature verification
import React, { useState } from 'react';
import {
  FileText,
  Eye,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Building2,
  UserCheck,
  Calendar,
  Lock,
} from 'lucide-react';
import LongTextCell from '@/components/ui/LongTextCell';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import AgreementPreviewModal, { AgreementDocumentData } from './AgreementPreviewModal';
import type { VendorAcceptanceItem, Section5Props } from "@app-types/components/rate-cards/Section5VendorAcceptance.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function Section5VendorAcceptance({
  rateCardId = 'RC-2026-0006',
  category = 'Interior Works',
  validity = '01 Oct 2026 - 30 Sep 2027',
  buyerAcceptanceDate = '22 Oct 2026',
  vendorName = 'Ramakrishna Interiors',
  vendorCode = 'VND-0006',
  items = [
    { id: '1', itemCode: 'INT-001', description: UI_STRINGS.common.gypsumFalseCeiling, specification: 'Supply & install 12.5mm Saint-Gobain Gyproc board on GI framework', uom: 'SQFT', qty: 500, agreedRate: 100 },
    { id: '2', itemCode: 'INT-002', description: UI_STRINGS.common.vitrifiedTiles2x2Ft, specification: 'Kajaria 600x600mm double charged vitrified floor tiles with epoxy grout', uom: 'SQFT', qty: 1000, agreedRate: 88 },
    { id: '3', itemCode: 'INT-003', description: UI_STRINGS.common.modularPartitions, specification: 'Full height double-glazed aluminum partition with 10mm toughened glass', uom: 'SQFT', qty: 300, agreedRate: 315 },
    { id: '4', itemCode: 'INT-004', description: UI_STRINGS.common.woodenCarpentry, specification: 'Commercial ply with 1mm Merino/Greenlam decorative laminate finish', uom: 'SQFT', qty: 250, agreedRate: 405 },
    { id: '5', itemCode: 'INT-005', description: UI_STRINGS.common.paintingPremiumEmulsion, specification: 'Two coats Asian Paints Royale Luxury Emulsion over primer & wall putty', uom: 'SQFT', qty: 2000, agreedRate: 68 },
  ],
  agreement = {
    required: true,
    type: 'TEMPLATE',
    templateId: 'STANDARD_CAPEX_MRA_V1',
    documentTitle: 'Master Rate Agreement — Interior Works — Ramakrishna Interiors',
    documentNumber: 'MRA-RC-2026-0006-REV1',
    fileName: 'Master_Rate_Agreement_Interior_Works.pdf',
    fileSize: '320 KB',
    version: 1,
    signatureRequired: true,
    status: 'SENT_TO_VENDOR',
    signature: null,
  },
  onAccept,
  onReject,
}: Section5Props) {
  const [remarks, setRemarks] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  // Vendor Signature State
  const hasAgreement = agreement && agreement.type !== 'NONE';
  const requiresSignature = hasAgreement && !!agreement.signatureRequired;

  const [signatoryName, setSignatoryName] = useState('K. Ramakrishna');
  const [signatoryDesignation, setSignatoryDesignation] = useState('Managing Partner / Authorized Representative');
  const [authorizedConsent, setAuthorizedConsent] = useState(true);
  const [includeSignature, setIncludeSignature] = useState(requiresSignature);

  const total = items.reduce((acc, it) => acc + it.qty * it.agreedRate, 0);

  const handleAccept = () => {
    setAccepted(true);
    let signaturePayload = null;

    // Distinguish acceptance from a verified signature
    if (requiresSignature && includeSignature && authorizedConsent && signatoryName.trim()) {
      signaturePayload = {
        signedBy: signatoryName.trim(),
        designation: signatoryDesignation.trim(),
        signatureEvidenceId: `DSC-2026-${vendorCode}-${Math.floor(1000 + Math.random() * 9000)}`,
        signatureType: 'DIGITAL_VERIFIED' as const,
        signedAt: new Date().toISOString(),
        verified: true,
      };
    }

    if (onAccept) {
      onAccept(remarks, signaturePayload);
    }
  };

  const handleReject = () => {
    if (onReject) onReject(remarks);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 flex flex-col justify-between space-y-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 pb-4">
          <span className="w-8 h-8 rounded-full bg-[#0f52ba] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">{UI_STRINGS.common.copydby8y8}</span>
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.vendorAcceptanceVendorPortalView}</h2>
              <p className="text-sm text-slate-500 mt-1">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.reviewTheBuyerAcceptedRatesAndFormaliseYourAcceptance}{hasAgreement ? UI_STRINGS.componentsRateCardsSection5VendorAcceptance.andExecuteTheAttachedRateCardAgreement : ''}{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.toRouteToLevel1ProjectApprover}</p>
            </div>
            <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold self-start sm:self-center">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.vendorActionPending}</span>
          </div>
        </div>

        {/* Metadata Banner */}
        <div className="bg-[#f8fafc] border border-slate-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.common.rateCardID}</span>
            <span className="font-bold text-slate-900 text-base">{rateCardId}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.common.category2}</span>
            <span className="text-slate-800 font-semibold">{category}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.common.contractValidity}</span>
            <span className="font-semibold text-slate-800">{validity}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-bold uppercase">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.buyerAcceptanceDate}</span>
            <span className="font-semibold text-blue-700">{buyerAcceptanceDate}</span>
          </div>
        </div>

        {/* ── ATTACHED FORMAL AGREEMENT BLOCK (IF APPLICABLE) ────────────── */}
        {hasAgreement && (
          <div className="border border-blue-200 rounded-xl bg-blue-50/40 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-blue-100 text-[#0f52ba] flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      {agreement.documentTitle || UI_STRINGS.componentsRateCardsSection5VendorAcceptance.masterRateCardAgreement}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white text-slate-700 border border-slate-200">
                      {agreement.documentNumber || interpolateUiString(UI_STRINGS.common.mRARateCardId, { "rateCardId": rateCardId })}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.format}{agreement.type === 'UPLOAD' ? UI_STRINGS.componentsRateCardsSection5VendorAcceptance.uploadedBilateralDocument : UI_STRINGS.componentsRateCardsSection5VendorAcceptance.generatedCapexMasterTemplate}{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.linkedToRevisionV10}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAgreementModal(true)}
                className="h-9 px-4 bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs self-start sm:self-center"
              >
                <Eye size={14} />
                <span>{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.reviewAgreementDocument}</span>
              </button>
            </div>

            {/* Signature Requirement & Input Block */}
            {requiresSignature && (
              <div className="mt-3 p-4 bg-white border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <ShieldCheck size={16} className="text-[#0f52ba]" />
                    <span>{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.authorizedVendorDigitalSignatureExecution}</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.mandatoryForActivation}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{UI_STRINGS.common.authorizedSignatoryName}</label>
                    <input
                      type="text"
                      value={signatoryName}
                      onChange={(e) => setSignatoryName(e.target.value)}
                      placeholder={UI_STRINGS.componentsRateCardsSection5VendorAcceptance.fullNameOfAuthorizedRepresentative}
                      className="w-full h-9 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0f52ba] text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.designationRole}</label>
                    <input
                      type="text"
                      value={signatoryDesignation}
                      onChange={(e) => setSignatoryDesignation(e.target.value)}
                      placeholder={UI_STRINGS.componentsRateCardsSection5VendorAcceptance.managingPartnerDirectorOrPowerOfAttorney}
                      className="w-full h-9 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0f52ba] text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-1 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    id="consent-check"
                    checked={authorizedConsent}
                    onChange={(e) => setAuthorizedConsent(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#0f52ba] focus:ring-[#0f52ba]"
                  />
                  <label htmlFor="consent-check" className="cursor-pointer leading-relaxed">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.iConfirmThatIAmAuthorizedToBind}<strong>{vendorName}</strong>{UI_STRINGS.common.copy1b3t0c5}{vendorCode}{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.toAllCommercialTermsRatesAndConditionsContainedInThisAgreement}</label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table of Agreed Rates */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table
            className="enterprise-table w-full text-left border-collapse table-fixed text-sm"
            style={{ minWidth: '1030px' }}
          >
            <colgroup>
              <col style={{ width: '55px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '195px' }} />
              <col style={{ width: '215px' }} />
              <col style={{ width: '75px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '145px' }} />
              <col style={{ width: '145px' }} />
            </colgroup>
            <thead>
              <tr className="bg-[#f8fafc] text-slate-700 border-b border-slate-200 font-bold text-xs uppercase tracking-wider">
                <th style={{ width: '55px' }} className="py-3 px-3 text-center border-r border-slate-200">{UI_STRINGS.common.sNo2}</th>
                <th style={{ width: '110px' }} className="py-3 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemCode}</th>
                <th style={{ width: '195px' }} className="py-3 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemDescription}</th>
                <th style={{ width: '215px' }} className="py-3 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.bOQDescription}</th>
                <th style={{ width: '75px' }} className="py-3 px-2.5 text-center border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.uOM}</th>
                <th style={{ width: '90px' }} className="py-3 px-3 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.quantity}</th>
                <th style={{ width: '145px' }} className="py-3 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.agreedRate}</th>
                <th style={{ width: '145px' }} className="py-3 px-3.5 text-right whitespace-normal break-words leading-tight">{UI_STRINGS.common.total}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {items.map((it, idx) => {
                const lineAmt = it.qty * it.agreedRate;
                return (
                  <tr key={it.id || idx} className="hover:bg-slate-50/70 transition-colors">
                    <td style={{ width: '55px' }} className="py-2.5 px-3 text-center text-slate-400 font-medium border-r border-slate-100">
                      {idx + 1}
                    </td>
                    <td style={{ width: '110px' }} className="py-2.5 px-3.5 font-mono text-xs font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">
                      {it.itemCode}
                    </td>
                    <td style={{ width: '195px' }} className="py-2.5 px-3.5 border-r border-slate-100 overflow-hidden">
                      <LongTextCell text={it.description} title={interpolateUiString(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.itemItemCodeItemDescription, { "itemCode": it.itemCode })} subtitle={UI_STRINGS.componentsRateCardsSection5VendorAcceptance.coreMasterDescription} maxWidth="100%" />
                    </td>
                    <td style={{ width: '215px' }} className="py-2 px-3 border-r border-slate-100">
                      <BoqDescriptionCell
                        text={it.specification || it.description}
                        itemCode={it.itemCode}
                        itemDescription={it.description}
                        maxWidth="100%"
                        clampLines={2}
                      />
                    </td>
                    <td style={{ width: '75px' }} className="py-2.5 px-2.5 text-center border-r border-slate-100 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-xs">
                        {it.uom}
                      </span>
                    </td>
                    <td style={{ width: '90px' }} className="py-2.5 px-3 text-right text-slate-700 font-semibold border-r border-slate-100 font-mono whitespace-nowrap">
                      {it.qty.toLocaleString()}
                    </td>
                    <td style={{ width: '145px' }} className="py-2.5 px-3.5 text-right font-bold text-slate-800 border-r border-slate-100 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{it.agreedRate.toLocaleString()}
                    </td>
                    <td style={{ width: '145px' }} className="py-2.5 px-3.5 text-right font-bold text-slate-900 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{lineAmt.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-sm">
                <td colSpan={6} className="py-3 px-3.5 text-slate-800 text-right uppercase tracking-wider text-xs border-r border-slate-200">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.totalContractValuation}</td>
                <td style={{ width: '145px' }} className="py-3 px-3.5 text-right text-slate-500 text-xs border-r border-slate-200">{UI_STRINGS.common.agreedSum}</td>
                <td style={{ width: '145px' }} className="py-3 px-3.5 text-right text-[#0f52ba] font-extrabold text-base font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{total.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Vendor Remarks */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-700">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.vendorRemarks}<span className="text-slate-400 font-normal">{UI_STRINGS.common.optional}</span>
          </label>
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={UI_STRINGS.componentsRateCardsSection5VendorAcceptance.addAnyFormalRemarksAcknowledgmentsOrExceptionsHere}
            className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f52ba] text-slate-800 shadow-2xs"
          />
        </div>
      </div>

      {/* Actions (Standard 40-44px buttons) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-200">
        <div className="text-xs text-slate-500 font-medium">{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.sequentialRoutingVendorAcceptanceMovesRequestDirectlyTo}<strong>{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.level1ProjectApprover}</strong>{UI_STRINGS.common.copyby08hd}</div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReject}
            className="h-11 px-5 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg font-semibold text-sm transition-colors shadow-2xs"
          >{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.rejectWithComments}</button>
          <button
            type="button"
            onClick={handleAccept}
            className={`h-11 px-6 rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-2 ${
              accepted
                ? 'bg-emerald-600 text-white cursor-default'
                : 'bg-[#0f52ba] hover:bg-blue-800 text-white'
            }`}
          >
            {accepted ? (
              <>
                <CheckCircle2 size={16} />
                <span>{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.rateCardAcceptedRoutedToProjectApprover}</span>
              </>
            ) : requiresSignature && authorizedConsent && signatoryName.trim() ? (
              <>
                <ShieldCheck size={16} />
                <span>{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptTermsDigitallySignAgreement}</span>
              </>
            ) : (
              <span>{UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptRateCardSchedule}</span>
            )}
          </button>
        </div>
      </div>

      {/* Agreement Preview Modal */}
      <AgreementPreviewModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        rateCardId={rateCardId}
        vendorName={vendorName}
        vendorCode={vendorCode}
        category={category}
        validity={validity}
        items={items}
        agreement={agreement}
      />
    </div>
  );
}
