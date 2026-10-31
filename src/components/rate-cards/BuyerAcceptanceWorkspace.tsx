'use client';
// src/components/rate-cards/BuyerAcceptanceWorkspace.tsx
// Standardized Category Manager action workspace for accepting vendor quotes with optional agreement preparation
import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  FileText,
  Calendar,
  Building2,
  FileCheck,
  Upload,
  Eye,
  ShieldCheck,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import LongTextCell from '@/components/ui/LongTextCell';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import AgreementPreviewModal, { AgreementDocumentData } from './AgreementPreviewModal';
import type { BuyerAcceptanceItem, AgreementPreparationMode, BuyerAcceptanceWorkspaceProps } from "@app-types/components/rate-cards/BuyerAcceptanceWorkspace.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { BuyerAcceptanceItem, AgreementPreparationMode };


export default function BuyerAcceptanceWorkspace({
  rateCardId = 'RC-2026-0006',
  vendorName = 'Ramakrishna Interiors',
  vendorCode = 'VND-0006',
  category = 'Interior Works',
  round = 'Round 2 of 4',
  vendorQuoteTotal = 469750,
  receivedDate = '20 Oct 2026',
  items = [
    {
      id: '1',
      itemCode: 'INT-001',
      description: UI_STRINGS.common.gypsumFalseCeiling,
      specification: 'Saint-Gobain Gypboard 12.5mm with ultra acoustics perimeter GI framework',
      uom: 'SQFT',
      qty: 500,
      vendorQuoteRate: 100,
    },
    {
      id: '2',
      itemCode: 'INT-002',
      description: UI_STRINGS.common.vitrifiedTiles2x2Ft,
      specification: '600x600 mm vitrified floor tile, commercial-grade double charged, anti-skid',
      uom: 'SQFT',
      qty: 1000,
      vendorQuoteRate: 88,
    },
    {
      id: '3',
      itemCode: 'INT-003',
      description: UI_STRINGS.common.modularPartitions,
      specification: 'Supply & installation of gypsum partition wall with acoustic insulation, 12.5mm MR board on 75mm GI studs',
      uom: 'SQFT',
      qty: 300,
      vendorQuoteRate: 315,
    },
    {
      id: '4',
      itemCode: 'INT-004',
      description: UI_STRINGS.common.woodenCarpentry,
      specification: 'Custom commercial veneer finished plywood storage credenza & paneling',
      uom: 'SQFT',
      qty: 250,
      vendorQuoteRate: 405,
    },
    {
      id: '5',
      itemCode: 'INT-005',
      description: UI_STRINGS.common.paintingPremiumEmulsion,
      specification: 'Two coats premium low-VOC acrylic emulsion over 1 coat primer & putty',
      uom: 'SQFT',
      qty: 2000,
      vendorQuoteRate: 68,
    },
  ],
  onAccept,
  onCancel,
}: BuyerAcceptanceWorkspaceProps) {
  const [remarks, setRemarks] = useState('');
  const [confirmed, setConfirmed] = useState(true);

  // Optional Agreement Preparation State
  const [agreementMode, setAgreementMode] = useState<AgreementPreparationMode>('NONE');
  const [agreementTitle, setAgreementTitle] = useState(`Master Rate Agreement — ${category} — ${vendorName}`);
  const [selectedTemplate, setSelectedTemplate] = useState('STANDARD_CAPEX_MRA_V1');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string } | null>(null);
  const [signatureRequired, setSignatureRequired] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const calculatedTotal = items.reduce((acc, it) => acc + (it.qty * it.vendorQuoteRate), 0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      });
    }
  };

  const handleAttachMockSample = () => {
    setUploadedFile({
      name: `MRA_${category.replace(/\s+/g, '_')}_${vendorName.replace(/\s+/g, '_')}_FY26-27.pdf`,
      size: '2.1 MB',
    });
  };

  const currentAgreementPreviewData: AgreementDocumentData | null = agreementMode === 'NONE' ? null : {
    required: true,
    type: agreementMode,
    templateId: agreementMode === 'TEMPLATE' ? selectedTemplate : undefined,
    documentTitle: agreementTitle,
    documentNumber: `MRA-${rateCardId}-REV1`,
    fileName: agreementMode === 'UPLOAD' ? (uploadedFile?.name || 'Uploaded_Rate_Agreement.pdf') : `${agreementTitle.replace(/[\s—]/g, '_')}.pdf`,
    fileSize: agreementMode === 'UPLOAD' ? (uploadedFile?.size || '2.1 MB') : '320 KB',
    version: 1,
    generatedAt: agreementMode === 'TEMPLATE' ? new Date().toISOString() : undefined,
    uploadedAt: agreementMode === 'UPLOAD' ? new Date().toISOString() : undefined,
    signatureRequired,
    status: 'SENT_TO_VENDOR',
    signature: null, // Explicitly unsigned upon initiation
  };

  const handleConfirmAcceptance = () => {
    onAccept(remarks, currentAgreementPreviewData);
  };

  return (
    <div className="w-full space-y-6">
      {/* ── BREADCRUMB & HEADER ────────────────────────────────────────── */}
      <PageHeader
        title={UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.buyerAcceptanceCategoryManager}
        subtitle={UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.reviewFinalVendorRatesOptionallyPrepareAFormalRateCardAgreementAndRouteToVendorAcceptance}
        onBack={onCancel}
        backLabel="Back to Negotiation"
        stepNumber={4}
      />

      {/* ── SUMMARY METRICS & VENDOR QUOTE VALUE ────────────────────────── */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label={UI_STRINGS.common.rateCardReference}
          value={rateCardId}
          secondary={category}
        />
        <SummaryCard
          label={UI_STRINGS.common.vendorPartner}
          value={vendorName}
          secondary={interpolateUiString(UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.codeVendorCode, { "vendorCode": vendorCode })}
        />
        <SummaryCard
          label={UI_STRINGS.common.negotiationStage}
          value={round}
          secondary={UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.commercialRatesFinalized}
          accent="blue"
        />
        <SummaryCard
          label={UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.finalAgreedValuation}
          value={`₹ ${calculatedTotal.toLocaleString()}`}
          secondary={interpolateUiString(UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.receivedOnReceivedDate, { "receivedDate": receivedDate })}
          accent="emerald"
        />
      </SummaryCardGrid>

      {/* ── MAIN WORKSPACE CONTAINER ───────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.contractRateBreakdown}</h3>
            <p className="text-xs text-slate-500">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.verifyLineItemsAndQuantitiesBeforeFreezingRatesForVendorRouting}</p>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.agreedValuation}{calculatedTotal.toLocaleString()}
          </span>
        </div>

        {/* Breakdown Table */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table
            className="enterprise-table w-full text-left border-collapse table-fixed text-sm"
            style={{ minWidth: '1160px' }}
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
              <col style={{ width: '130px' }} />
            </colgroup>
            <thead>
              <tr className="bg-[#f8fafc] text-slate-700 border-b border-slate-200 font-bold text-xs uppercase tracking-wider">
                <th style={{ width: '55px' }} className="py-3.5 px-3 text-center border-r border-slate-200">{UI_STRINGS.common.sNo2}</th>
                <th style={{ width: '110px' }} className="py-3.5 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemCode}</th>
                <th style={{ width: '195px' }} className="py-3.5 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemDescription}</th>
                <th style={{ width: '215px' }} className="py-3.5 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.bOQDescription}</th>
                <th style={{ width: '75px' }} className="py-3.5 px-3 text-center border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.uOM}</th>
                <th style={{ width: '90px' }} className="py-3.5 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.quantity}</th>
                <th style={{ width: '145px' }} className="py-3.5 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.finalVendorRate}</th>
                <th style={{ width: '145px' }} className="py-3.5 px-3.5 text-right border-r border-slate-200 font-bold whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.lineAmount}</th>
                <th style={{ width: '130px' }} className="py-3.5 px-3 text-center whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.acceptanceStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {items.map((it, idx) => (
                <tr key={it.id} className="hover:bg-slate-50/70 transition-colors">
                  <td style={{ width: '55px' }} className="py-3 px-3 text-center text-slate-400 font-medium border-r border-slate-100">
                    {idx + 1}
                  </td>
                  <td style={{ width: '110px' }} className="py-3 px-3.5 font-bold font-mono text-slate-800 border-r border-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">
                    {it.itemCode}
                  </td>
                  <td style={{ width: '195px' }} className="py-3 px-3.5 border-r border-slate-100 overflow-hidden">
                    <LongTextCell
                      text={it.description}
                      title={interpolateUiString(UI_STRINGS.common.itemItemCodeDescription, { "itemCode": it.itemCode })}
                      subtitle={UI_STRINGS.common.coreItemMasterDescription}
                      maxWidth="100%"
                    />
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
                  <td style={{ width: '75px' }} className="py-3 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold text-xs">
                      {it.uom}
                    </span>
                  </td>
                  <td style={{ width: '90px' }} className="py-3 px-3.5 text-right text-slate-700 font-semibold border-r border-slate-100 whitespace-nowrap font-mono">
                    {it.qty.toLocaleString()}
                  </td>
                  <td style={{ width: '145px' }} className="py-3 px-3.5 text-right font-semibold text-slate-800 border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{it.vendorQuoteRate.toLocaleString()}
                  </td>
                  <td style={{ width: '145px' }} className="py-3 px-3.5 text-right font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{(it.qty * it.vendorQuoteRate).toLocaleString()}
                  </td>
                  <td style={{ width: '130px' }} className="py-3 px-3 text-center whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Check size={12} className="text-emerald-600" />
                      <span>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.agreed}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-sm text-slate-900">
                <td colSpan={6} className="py-3.5 px-3.5 text-right uppercase tracking-wider text-xs text-slate-600 border-r border-slate-200">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.totalFinalValuation}</td>
                <td style={{ width: '145px' }} className="py-3.5 px-3.5 text-right text-slate-500 text-xs border-r border-slate-200">{UI_STRINGS.common.agreedSum}</td>
                <td style={{ width: '145px' }} className="py-3.5 px-3.5 text-right text-slate-900 font-extrabold text-base border-r border-slate-200 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{calculatedTotal.toLocaleString()}
                </td>
                <td style={{ width: '130px' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            OPTIONAL AGREEMENT PREPARATION STEP (REQUIREMENT 2)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="border border-slate-200 rounded-xl bg-slate-50/60 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-[#0f52ba]" />
                <h4 className="text-sm font-bold text-slate-900">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.rateCardAgreementPreparation}<span className="text-slate-400 font-normal">{UI_STRINGS.common.optional}</span>
                </h4>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.chooseWhetherAFormalBilateralLegalAgreementIsRequiredByBusinessPolicyForThisRateCard}</p>
            </div>
            {agreementMode !== 'NONE' && (
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="h-9 px-3.5 bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs self-start"
              >
                <Eye size={14} />
                <span>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.previewAgreementDocument}</span>
              </button>
            )}
          </div>

          {/* 3 Preparation Mode Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Option 1: No Agreement Required */}
            <label
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                agreementMode === 'NONE'
                  ? 'border-[#0f52ba] bg-blue-50/50 shadow-2xs ring-1 ring-[#0f52ba]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.noFormalAgreement}</span>
                  <input
                    type="radio"
                    name="agreement-mode"
                    checked={agreementMode === 'NONE'}
                    onChange={() => setAgreementMode('NONE')}
                    className="w-4 h-4 text-[#0f52ba] focus:ring-[#0f52ba]"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.proceedDirectlyToVendorAcceptanceWithoutGeneratingOrAttachingALegalAgreementDocument}</p>
              </div>
              <div className="pt-3 mt-2 border-t border-slate-100 text-[11px] font-semibold text-slate-500">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.standardDirectSchedule}</div>
            </label>

            {/* Option 2: Generate from Supported Template */}
            <label
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                agreementMode === 'TEMPLATE'
                  ? 'border-[#0f52ba] bg-blue-50/50 shadow-2xs ring-1 ring-[#0f52ba]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.generateFromTemplate}</span>
                  <input
                    type="radio"
                    name="agreement-mode"
                    checked={agreementMode === 'TEMPLATE'}
                    onChange={() => {
                      setAgreementMode('TEMPLATE');
                      setSignatureRequired(true);
                    }}
                    className="w-4 h-4 text-[#0f52ba] focus:ring-[#0f52ba]"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.generateBilateralMasterRateAgreementFromCorporateTemplateIncludingPreambleScopeAndRates}</p>
              </div>
              <div className="pt-3 mt-2 border-t border-slate-100 text-[11px] font-semibold text-[#0f52ba]">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.templateProCPXCapexMRAV24}</div>
            </label>

            {/* Option 3: Upload Existing Agreement Document */}
            <label
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                agreementMode === 'UPLOAD'
                  ? 'border-[#0f52ba] bg-blue-50/50 shadow-2xs ring-1 ring-[#0f52ba]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.uploadAgreementDoc}</span>
                  <input
                    type="radio"
                    name="agreement-mode"
                    checked={agreementMode === 'UPLOAD'}
                    onChange={() => {
                      setAgreementMode('UPLOAD');
                      setSignatureRequired(true);
                    }}
                    className="w-4 h-4 text-[#0f52ba] focus:ring-[#0f52ba]"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.attachAnExistingNegotiatedAndApprovedFormalAgreementDocumentPDFDOCXToThisRateCard}</p>
              </div>
              <div className="pt-3 mt-2 border-t border-slate-100 text-[11px] font-semibold text-emerald-700">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.supportsPDFDOCXUpTo25MB}</div>
            </label>
          </div>

          {/* Configuration for Option 2: Template */}
          {agreementMode === 'TEMPLATE' && (
            <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3 animate-in fade-in-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.agreementDocumentTitle}</label>
                  <input
                    type="text"
                    value={agreementTitle}
                    onChange={(e) => setAgreementTitle(e.target.value)}
                    className="w-full h-9 px-3 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0f52ba] text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.corporateTemplateStandard}</label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full h-9 px-3 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0f52ba] text-slate-800 bg-white"
                  >
                    <option value="STANDARD_CAPEX_MRA_V1">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.standardMasterCapexRateAgreementV24}</option>
                    <option value="ANNUAL_STORE_FITOUT_V2">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.annualStoreFitoutInteriorFrameworkV18}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signatureRequired}
                    onChange={(e) => setSignatureRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#0f52ba] focus:ring-[#0f52ba]"
                  />
                  <span>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.requireAuthorizedVendorDigitalSignatureBeforeActivation}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(true)}
                  className="text-xs text-[#0f52ba] font-bold hover:underline flex items-center gap-1"
                >
                  <Eye size={13} />
                  <span>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.reviewTemplatePreview}</span>
                </button>
              </div>
            </div>
          )}

          {/* Configuration for Option 3: Upload */}
          {agreementMode === 'UPLOAD' && (
            <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3 animate-in fade-in-50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0f52ba] flex items-center justify-center shrink-0">
                    <Upload size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      {uploadedFile ? uploadedFile.name : UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.noFileSelectedYet}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {uploadedFile ? interpolateUiString(UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.fileSizeSize, { "size": uploadedFile.size }) : UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.attachBilateralContractDocumentInPDFOrDOCXFormat}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="h-9 px-3.5 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shadow-2xs">
                    <Upload size={13} />
                    <span>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.chooseFile}</span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {!uploadedFile && (
                    <button
                      type="button"
                      onClick={handleAttachMockSample}
                      className="h-9 px-3 bg-blue-50 border border-blue-200 text-[#0f52ba] rounded-md text-xs font-semibold hover:bg-blue-100 transition-colors"
                    >{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.attachSamplePDF}</button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signatureRequired}
                    onChange={(e) => setSignatureRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#0f52ba] focus:ring-[#0f52ba]"
                  />
                  <span>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.requireAuthorizedVendorDigitalSignatureBeforeActivation}</span>
                </label>
                {uploadedFile && (
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="text-xs text-[#0f52ba] font-bold hover:underline flex items-center gap-1"
                  >
                    <Eye size={13} />
                    <span>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.previewDocumentMetadata}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Remarks Input */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-700">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.buyerAcceptanceRemarks}<span className="text-slate-400 font-normal">{UI_STRINGS.common.optional}</span>
          </label>
          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.addRemarksBeforeAcceptingThisQuoteEGCommercialRatesValidatedAgainstRegionalCapexBenchmarkBaseline}
            className="w-full py-2.5 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f52ba] text-slate-800 placeholder-slate-400 transition-all shadow-2xs"
          />
        </div>

        {/* Governance Confirmation Checkbox */}
        <div className="flex items-start gap-3 p-4 bg-blue-50/50 border border-blue-200 rounded-lg text-sm text-slate-800">
          <input
            type="checkbox"
            id="buyer-confirm"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#0f52ba] focus:ring-[#0f52ba] cursor-pointer"
          />
          <label htmlFor="buyer-confirm" className="cursor-pointer select-none leading-relaxed">{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.iConfirmAs}<strong>{UI_STRINGS.common.categoryManager}</strong>{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.thatIHaveVettedTheseRatesAgainstCorporateCapexBenchmarks}{agreementMode !== 'NONE'
              ? UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.acceptingThisQuoteWillAttachThePreparedAgreementAndRouteItToTheVendorForReviewFormalAcceptanceAndDigitalSignature
              : UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.acceptingThisQuoteWillFreezeTheseRatesAndRouteTheContractScheduleDirectlyToTheVendorForFormalAcceptance}
          </label>
        </div>

        {/* Actions (Standard 40-44px buttons) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 px-5 border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold transition-colors shadow-2xs"
          >{UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.cancelReturnToNegotiation}</button>

          <button
            type="button"
            disabled={!confirmed}
            onClick={handleConfirmAcceptance}
            className="h-11 px-6 bg-[#0f52ba] hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          >
            <Check size={16} strokeWidth={2.5} />
            <span>
              {agreementMode === 'NONE'
                ? UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.acceptQuoteRouteToVendorAcceptanceNoAgreement
                : agreementMode === 'TEMPLATE'
                ? UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.acceptQuoteSendGeneratedAgreementToVendor
                : UI_STRINGS.componentsRateCardsBuyerAcceptanceWorkspace.acceptQuoteSendUploadedAgreementToVendor}
            </span>
          </button>
        </div>
      </div>

      {/* Agreement Preview Modal */}
      <AgreementPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        rateCardId={rateCardId}
        vendorName={vendorName}
        vendorCode={vendorCode}
        category={category}
        items={items.map((it) => ({
          ...it,
          agreedRate: it.vendorQuoteRate,
        }))}
        agreement={currentAgreementPreviewData}
      />
    </div>
  );
}
