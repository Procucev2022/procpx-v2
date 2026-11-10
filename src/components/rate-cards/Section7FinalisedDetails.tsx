'use client';
// src/components/rate-cards/Section7FinalisedDetails.tsx
// Standardized Enterprise Finalised Rate Card Details View
// Provides read-only view of persisted commercial terms, agreed rates, negotiation history & sign-off timeline
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useMemo } from 'react';
import {
  Download,
  FileText,
  CheckCircle2,
  History,
  ShieldCheck,
  Clock,
  User,
  Check,
} from 'lucide-react';
import LongTextCell from '@/components/ui/LongTextCell';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import * as XLSX from 'xlsx';
import AgreementPreviewModal, { AgreementDocumentData } from './AgreementPreviewModal';
import type { FinalisedRateItem, Section7Props } from "@app-types/components/rate-cards/Section7FinalisedDetails.types";
export type { FinalisedRateItem };
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { reportHandledClientFailure } from '@/lib/observability/client-reporter';



export default function Section7FinalisedDetails({
  rateCard,
  rateCardId: propRateCardId,
  vendorName: propVendorName,
  vendorCode: propVendorCode,
  category: propCategory,
  subcategory: propSubcategory,
  title: propTitle,
  scope: propScope,
  validity: propValidity,
  location: propLocation,
  terms: propTerms,
  status: propStatus,
  createdBy: propCreatedBy,
  createdOn: propCreatedOn,
  items: propItems,
  agreement: propAgreement,
}: Section7Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'rates' | 'history' | 'signoff'>('info');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  // Parse notes JSON if present on persisted rate card
  const parsedNotes = useMemo(() => {
    if (!rateCard?.notes) return null;
    try {
      return JSON.parse(rateCard.notes);
    } catch (error: unknown) {
      reportHandledClientFailure(error, {
        operation: 'parse_finalised_rate_card_notes',
        route: '/procurement/rate-cards/:id',
        recordId: rateCard?.id,
        field: 'notes',
        fallback: 'omit_optional_note_metadata',
      });
      return null;
    }
  }, [rateCard]);

  // Derive authoritative fields from persisted rateCard or props
  const rateCardId = rateCard?.rateCardNumber || propRateCardId || UI_STRINGS.common.notAvailable;
  const vendorName = rateCard?.vendor?.name || propVendorName || UI_STRINGS.common.notAvailable;
  const vendorCode = rateCard?.vendor?.code || propVendorCode || UI_STRINGS.common.notAvailable;
  const category = rateCard?.category || propCategory || UI_STRINGS.common.notAvailable;
  const subcategory = rateCard?.subcategory || propSubcategory || UI_STRINGS.common.notAvailable;
  const title = rateCard?.title || propTitle || UI_STRINGS.componentsRateCardsSection7FinalisedDetails.defaultRateCardTitle;
  const scope = rateCard?.scope || propScope || UI_STRINGS.common.notAvailable;
  const location = rateCard?.location || propLocation || UI_STRINGS.common.notAvailable;
  const terms = rateCard?.terms || propTerms || UI_STRINGS.common.notAvailable;
  const status = rateCard?.status === 'APPROVED' ? UI_STRINGS.common.active : (rateCard?.status || propStatus || UI_STRINGS.common.notAvailable);
  const createdBy = rateCard?.submittedBy || propCreatedBy || UI_STRINGS.common.notAvailable;
  const createdOn = rateCard?.createdAt
    ? new Date(rateCard.createdAt).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
    : (propCreatedOn || UI_STRINGS.common.notAvailable);

  const validity = useMemo(() => {
    if (rateCard?.validFrom && rateCard?.validTo) {
      const from = new Date(rateCard.validFrom).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' });
      const to = new Date(rateCard.validTo).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' });
      return `${from} to ${to}`;
    }
    return propValidity || UI_STRINGS.common.notAvailable;
  }, [rateCard, propValidity]);

  // Use only persisted item rows or explicit caller-provided items.
  const items: FinalisedRateItem[] = useMemo(() => {
    if (rateCard?.items && Array.isArray(rateCard.items)) {
      return rateCard.items.map((it: any) => {
        let meta: any = {};
        if (it.comparisonRef) {
          try {
            meta = JSON.parse(it.comparisonRef);
          } catch (error: unknown) {
            reportHandledClientFailure(error, {
              operation: 'parse_finalised_rate_card_comparison_metadata',
              route: '/procurement/rate-cards/:id',
              recordId: rateCard?.id,
              itemId: it.id,
              field: 'comparisonRef',
              fallback: 'use_persisted_rate_item_values',
            });
          }
        }
        return {
          id: it.id,
          itemCode: it.itemCode,
          category: it.category || category,
          subcategory: it.subcategory || UI_STRINGS.common.notAvailable,
          description: it.description,
          specification: it.specification || it.description || UI_STRINGS.common.notAvailable,
          uom: it.uom || UI_STRINGS.common.notAvailable,
          qty: it.referenceQty || meta.referenceQty || it.minQuantity || 0,
          buyerTargetRate: it.buyerOffer1 ?? meta.buyerOffer1 ?? it.benchmarkRate ?? it.historicalRate ?? it.rate,
          round1VendorQuote: it.vendorQuote1 ?? meta.vendorQuote1 ?? it.proposedRate ?? it.rate,
          round2BuyerOffer: it.buyerOffer2 ?? meta.buyerOffer2 ?? it.rate,
          round2VendorQuote: it.vendorQuote2 ?? meta.vendorQuote2 ?? it.rate,
          agreedRate: it.finalAgreedRate ?? meta.finalAgreedRate ?? it.rate,
        };
      });
    }
    return propItems || [];
  }, [rateCard, propItems, category]);

  // Authoritative agreement metadata
  const agreement: AgreementDocumentData | null = useMemo(() => {
    if (propAgreement) return propAgreement;
    if (rateCard?.agreement) return rateCard.agreement;
    if (parsedNotes?.agreement) return parsedNotes.agreement;

    return null;
  }, [propAgreement, rateCard, parsedNotes]);

  // Total valuations
  const totalAgreedValuation = items.reduce((acc, it) => acc + it.qty * it.agreedRate, 0);
  const totalTargetValuation = items.reduce((acc, it) => acc + it.qty * it.buyerTargetRate, 0);
  const totalSavings = totalTargetValuation - totalAgreedValuation;
  const signoffMilestones = useMemo(() => {
    const events = [
      {
        title: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.initiatedPublished,
        value: rateCard?.createdAt || parsedNotes?.round1?.buyerOffer1Date,
        actor: rateCard?.submittedBy || parsedNotes?.round1?.buyerOffer1Actor,
        remarks: rateCard?.title,
      },
      {
        title: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.buyerFormalAcceptance,
        value: parsedNotes?.buyerAccepted?.timestamp,
        actor: parsedNotes?.buyerAccepted?.actor,
        remarks: parsedNotes?.buyerAccepted?.remarks,
        evidence: parsedNotes?.buyerAccepted,
      },
      {
        title: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.vendorFormalAcceptanceSignature,
        value: parsedNotes?.vendorAccepted?.timestamp || agreement?.signature?.signedAt,
        actor: parsedNotes?.vendorAccepted?.actor || agreement?.signature?.signedBy,
        remarks: parsedNotes?.vendorAccepted?.remarks,
        evidence: parsedNotes?.vendorAccepted || agreement?.signature?.verified,
      },
      {
        title: UI_STRINGS.common.level1ProjectApproverReview,
        value: rateCard?.projectApprovedAt || parsedNotes?.projectApproved?.timestamp,
        actor: rateCard?.projectApprovedBy || parsedNotes?.projectApproved?.actor,
        remarks: parsedNotes?.projectApproved?.remarks,
        evidence: rateCard?.projectApprovedAt || parsedNotes?.projectApproved,
      },
      {
        title: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.level2FinanceApproverReviewActivation,
        value: rateCard?.financeApprovedAt || parsedNotes?.financeApproved?.timestamp,
        actor: rateCard?.financeApprovedBy || parsedNotes?.financeApproved?.actor,
        remarks: parsedNotes?.financeApproved?.remarks,
        evidence: rateCard?.financeApprovedAt || parsedNotes?.financeApproved,
      },
    ].filter((event) => Boolean(event.value || event.evidence));
    return events.map((event, index) => ({
      ...event,
      step: index + 1,
      date: event.value
        ? new Date(event.value).toLocaleString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : UI_STRINGS.common.notAvailable,
      actor: event.actor || UI_STRINGS.common.notAvailable,
      notes: event.remarks || UI_STRINGS.common.notAvailable,
      status: UI_STRINGS.common.completed,
    }));
  }, [rateCard, parsedNotes, agreement]);

  // Handle Download Excel Rate Card
  const handleDownload = () => {
    try {
      const dataToExport = items.map((it, idx) => ({
        'S.No.': idx + 1,
        'Item Code': it.itemCode,
        'Item Description': it.description,
        'BOQ Description': it.specification,
        'UOM': it.uom,
        'Quantity': it.qty,
        'Category': it.category,
        'Sub-category': it.subcategory,
        'Agreed Unit Rate (₹)': it.agreedRate,
        'Agreed Amount (₹)': it.qty * it.agreedRate,
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      ws['!cols'] = [
        { wch: 8 },
        { wch: 14 },
        { wch: 20 },
        { wch: 22 },
        { wch: 30 },
        { wch: 45 },
        { wch: 10 },
        { wch: 12 },
        { wch: 20 },
        { wch: 22 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Agreed_Rates');

      const metaSheet = XLSX.utils.json_to_sheet([
        { Property: 'Rate Card ID', Value: rateCardId },
        { Property: 'Rate Card Title', Value: title },
        { Property: 'Vendor Name', Value: `${vendorName} (${vendorCode})` },
        { Property: 'Category', Value: `${category} > ${subcategory}` },
        { Property: 'Applicable Locations', Value: location },
        { Property: 'Validity Period', Value: validity },
        { Property: 'Scope of Work', Value: scope },
        { Property: 'Commercial Terms', Value: terms },
        { Property: 'Contract Status', Value: status },
        { Property: 'Total Agreed Valuation (₹)', Value: totalAgreedValuation },
      ]);
      XLSX.utils.book_append_sheet(wb, metaSheet, 'Contract_Info');

      const filename = `proCPX_Finalised_Rate_Card_${rateCardId}.xlsx`;
      XLSX.writeFile(wb, filename);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (error: unknown) {
      reportHandledClientFailure(error, {
        operation: 'export_finalised_rate_card_workbook',
        route: '/procurement/rate-cards/:id',
        recordId: rateCard?.id,
        fallback: 'open_print_view',
      });
      window.print();
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* ── DEDICATED TABS & ACTIONS TOOLBAR ──────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        {/* Navigation Tabs (44-48px height, 14-15px labels, clear active styling) */}
        <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100/90 border border-slate-200 rounded-xl overflow-x-auto">
          {[
            { id: 'info', label: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.rateCardInfo, icon: <FileText size={16} /> },
            { id: 'rates', label: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.agreedRates, count: items.length, icon: <CheckCircle2 size={16} /> },
            { id: 'history', label: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.negotiationHistory, icon: <History size={16} /> },
            { id: 'signoff', label: UI_STRINGS.componentsRateCardsSection7FinalisedDetails.signOffTimeline, icon: <ShieldCheck size={16} /> },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`h-11 px-5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-[#0f52ba] shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                      isActive
                        ? 'bg-blue-50 text-[#0f52ba] border border-blue-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Actions Toolbar */}
        <div className="flex items-center gap-3">
          {agreement && agreement.type !== 'NONE' && (
            <button
              type="button"
              onClick={() => setShowAgreementModal(true)}
              className="h-11 px-4 bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-2xs shrink-0 cursor-pointer"
            >
              <FileText size={16} />
              <span>{UI_STRINGS.common.viewExecutedAgreement}</span>
            </button>
          )}

          {downloadSuccess && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5 animate-in fade-in">
              <Check size={14} />{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.downloadedExcel}</span>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="pro-btn pro-btn-secondary h-11 px-5 text-sm font-semibold flex items-center gap-2 shadow-2xs cursor-pointer shrink-0"
          >
            <Download size={16} className="text-slate-600" />
            <span>{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.downloadRateCard}</span>
          </button>
        </div>
      </div>

      {/* ── SECTION 1: RATE CARD INFO ────────────────────────── */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          {/* 1. RATE CARD OVERVIEW */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60">
              <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.copy1fc1rd5}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.contractingVendorCommercialCategoryClassificationValidityWindowAndCreationAudit}</p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                {/* 1. Contracting Vendor */}
                <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{UI_STRINGS.common.contractingVendor}</span>
                  <div>
                    <span className="font-bold text-slate-900 block text-base">{vendorName}</span>
                    <span className="text-xs font-medium text-slate-500 font-mono mt-1 block">{UI_STRINGS.common.vendorCode2}{vendorCode}
                    </span>
                  </div>
                </div>

                {/* 2. Commercial Category and Sub-category */}
                <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.commercialCategorySubCategory}</span>
                  <div>
                    <span className="font-bold text-slate-900 block text-base">{category}</span>
                    <span className="text-xs font-medium text-slate-600 mt-1 block">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.subCategory}<span className="font-semibold text-slate-800">{subcategory}</span>
                    </span>
                  </div>
                </div>

                {/* 3. Rate Card Title and ID */}
                <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.rateCardTitleReferenceID}</span>
                  <div>
                    <span className="font-bold text-slate-900 block text-base leading-snug">{title}</span>
                    <span className="text-xs font-medium text-slate-500 font-mono mt-1 block">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.rateCardID}{rateCardId}
                    </span>
                  </div>
                </div>

                {/* 4. Applicable Locations */}
                <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{UI_STRINGS.common.applicableLocations}</span>
                  <div>
                    <span className="font-bold text-slate-900 block text-base">{location}</span>
                    <span className="text-xs font-medium text-slate-500 mt-1 block">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.applicableAcrossDesignatedCorporateAndRegionalProjectSites}</span>
                  </div>
                </div>

                {/* 5. Contract Validity and Status */}
                <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.contractValidityStatus}</span>
                  <div>
                    <span className="font-bold text-slate-900 block text-base">{validity}</span>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.status}{status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. Created By and Created Date */}
                <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.createdByCreatedDate}</span>
                  <div>
                    <span className="font-bold text-slate-900 block text-base">{createdBy}</span>
                    <span className="text-xs font-medium text-slate-500 mt-1 block">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.creationDate}{createdOn}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. SCOPE OF WORK ──────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60">
              <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.copyue062n}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.contractualDeliverablesWorkBoundariesAndOperationalServiceObligations}</p>
            </div>
            <div className="p-6">
              <div className="p-4 md:p-5 rounded-lg bg-slate-50/70 border border-slate-200 text-sm text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                {scope}
              </div>
            </div>
          </div>

          {/* ── 3. COMMERCIAL TERMS & CONDITIONS ──────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60">
              <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.copy83fqgv}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.governingCommercialRulesPaymentTermsTaxCovenantsAndOperationalConditions}</p>
            </div>
            <div className="p-6">
              <div className="p-4 md:p-5 rounded-lg bg-slate-50/70 border border-slate-200 text-sm text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                {terms}
              </div>
            </div>
          </div>

          {/* ── 4. FORMAL AGREEMENT & SIGNATURE ────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.copy1krgzq2}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.bilateralContractualInstrumentExecutionVerificationAndPersistedDocumentDetails}</p>
              </div>
              {agreement && agreement.type !== 'NONE' && (
                <button
                  type="button"
                  onClick={() => setShowAgreementModal(true)}
                  className="px-4 py-2 bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
                >
                  <FileText size={16} />
                  <span>{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.previewViewExecutedAgreement}</span>
                </button>
              )}
            </div>

            <div className="p-6">
              {agreement && agreement.type !== 'NONE' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  {/* Agreement Title */}
                  <div className="p-3.5 bg-slate-50/70 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold uppercase text-slate-500 block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.agreementTitle}</span>
                    <strong className="text-slate-900 text-sm block leading-snug">
                      {agreement.documentTitle}
                    </strong>
                  </div>

                  {/* Reference & Version */}
                  <div className="p-3.5 bg-slate-50/70 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold uppercase text-slate-500 block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.referenceVersion}</span>
                    <span className="text-slate-900 text-sm font-bold font-mono block">
                      {agreement.documentNumber || interpolateUiString(UI_STRINGS.common.mRARateCardId, { "rateCardId": rateCardId })}
                    </span>
                    <span className="text-slate-500 text-xs mt-1 block">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.revisionV}{agreement.version || 1}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.copy114sfyr}</span>
                  </div>

                  {/* Execution Method & Filename */}
                  <div className="p-3.5 bg-slate-50/70 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold uppercase text-slate-500 block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.executionMethodFilename}</span>
                    <strong className="text-slate-900 text-sm block">
                      {agreement.type === 'UPLOAD'
                        ? UI_STRINGS.componentsRateCardsSection7FinalisedDetails.uploadedBilateralContract
                        : UI_STRINGS.componentsRateCardsSection7FinalisedDetails.generatedCapexMasterAgreement}
                    </strong>
                    <span className="text-slate-500 text-xs font-mono mt-1 block truncate" title={agreement.fileName}>
                      {agreement.fileName} {agreement.fileSize ? interpolateUiString(UI_STRINGS.componentsRateCardsSection7FinalisedDetails.fileSize, { "fileSize": agreement.fileSize }) : ''}
                    </span>
                  </div>

                  {/* Actual Signature Status */}
                  <div className="p-3.5 bg-slate-50/70 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold uppercase text-slate-500 block mb-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.signatureStatus}</span>
                    {agreement.signature?.verified ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <ShieldCheck size={14} className="text-emerald-600" />{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.digitallySignedVerified}</span>
                        <div className="mt-1.5 text-xs text-slate-700 font-medium">
                          {agreement.signature.signedBy}
                        </div>
                        {agreement.signature.designation && (
                          <div className="text-[11px] text-slate-500">
                            {agreement.signature.designation}
                          </div>
                        )}
                        {agreement.signature.signedAt && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {agreement.signature.signedAt}
                          </div>
                        )}
                        {agreement.signature.signatureEvidenceId && (
                          <div className="text-[10px] text-slate-400 font-mono mt-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.evidence}{agreement.signature.signatureEvidenceId}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock size={14} className="text-amber-600" />{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.pendingSignature}</span>
                        <p className="text-xs text-slate-500 mt-1">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.awaitingAuthorizedVendorRepresentativeSignature}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50/70 rounded-lg border border-slate-200 text-sm text-slate-600 flex items-center gap-2.5">
                  <CheckCircle2 size={18} className="text-slate-400 shrink-0" />
                  <span>{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.directScheduleOfRatesNoSeparateBilateralFormalAgreementDocumentWasRequiredForThisCommercialCategoryLineItemsGovernDirectly}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 2: AGREED RATES ──────────────────────────── */}
      {activeTab === 'rates' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.finalAgreedRatesSchedule}</h3>
              <p className="text-xs text-slate-500">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.authorizedContractualLineItemRatesLockedAndActiveForPPOIssuance}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-[#0f52ba] border border-blue-200">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.valuation}{totalAgreedValuation.toLocaleString(I18N_CONFIG.defaultLocale)}
              </span>
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg overflow-x-auto shadow-2xs bg-white w-full">
            <table
              className="w-full text-left border-collapse table-fixed text-[13px]"
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
                <tr className="bg-slate-50 text-slate-700 font-bold text-[13px] uppercase tracking-wider">
                  <th style={{ width: '55px' }} className="py-3 px-3 text-center border-b border-slate-300 border-r border-slate-200">{UI_STRINGS.common.sNo2}</th>
                  <th style={{ width: '110px' }} className="py-3 px-3.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemCode}</th>
                  <th style={{ width: '195px' }} className="py-3 px-3.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemDescription}</th>
                  <th style={{ width: '215px' }} className="py-3 px-3.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.bOQDescription}</th>
                  <th style={{ width: '75px' }} className="py-3 px-2 text-center border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.uOM}</th>
                  <th style={{ width: '90px' }} className="py-3 px-3 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.quantity}</th>
                  <th style={{ width: '145px' }} className="py-3 px-3.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.agreedRate}</th>
                  <th style={{ width: '145px' }} className="py-3 px-3.5 text-right border-b border-slate-300 font-bold text-[#0f52ba] whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.agreedAmount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {items.map((it, idx) => {
                  const lineTotal = it.qty * it.agreedRate;
                  return (
                    <tr
                      key={it.id || idx}
                      className="hover:bg-blue-50/25 transition-colors border-b border-slate-200 even:bg-slate-50/30"
                    >
                      <td style={{ width: '55px' }} className="py-3 px-3 text-center text-slate-400 font-medium border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td style={{ width: '110px' }} className="py-3 px-3.5 font-mono text-xs font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis">
                        {it.itemCode}
                      </td>
                      <td style={{ width: '195px' }} className="py-3 px-3.5 border-r border-slate-200 overflow-hidden">
                        <LongTextCell
                          text={it.description}
                          title={interpolateUiString(UI_STRINGS.common.itemDescriptionItemCode, { "itemCode": it.itemCode })}
                          subtitle={interpolateUiString(UI_STRINGS.componentsRateCardsSection7FinalisedDetails.lineValue1Category, { "value1": idx + 1, "category": it.category })}
                          maxWidth="100%"
                        />
                        <div className="mt-1 flex items-center gap-1 overflow-hidden">
                          <span
                            className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-full block"
                            title={interpolateUiString(UI_STRINGS.common.categorySubcategory, { "category": it.category, "subcategory": it.subcategory })}
                          >
                            {it.category}{UI_STRINGS.common.gt}{it.subcategory}
                          </span>
                        </div>
                      </td>
                      <td style={{ width: '215px' }} className="py-2 px-3 border-r border-slate-200">
                        <BoqDescriptionCell
                          text={it.specification}
                          itemCode={it.itemCode}
                          itemDescription={it.description}
                          maxWidth="100%"
                          clampLines={2}
                        />
                      </td>
                      <td style={{ width: '75px' }} className="py-3 px-2 text-center text-slate-700 font-medium border-r border-slate-200 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-xs">
                          {it.uom}
                        </span>
                      </td>
                      <td style={{ width: '90px' }} className="py-3 px-3 text-right font-medium text-slate-900 border-r border-slate-200 font-mono whitespace-nowrap">
                        {it.qty.toLocaleString(I18N_CONFIG.defaultLocale)}
                      </td>
                      <td style={{ width: '145px' }} className="py-3 px-3.5 text-right font-bold text-slate-900 border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{it.agreedRate.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ width: '145px' }} className="py-3 px-3.5 text-right font-extrabold text-[#0f52ba] font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{lineTotal.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-[13px] text-slate-900">
                  <td
                    colSpan={6}
                    className="py-3.5 px-4 text-right uppercase tracking-wider text-xs font-bold text-slate-700 border-r border-slate-200"
                  >{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.totalAgreedContractValuation}</td>
                  <td style={{ width: '145px' }} className="py-3.5 px-3.5 text-right text-xs text-slate-500 border-r border-slate-200">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.activeBenchmark}</td>
                  <td style={{ width: '145px' }} className="py-3.5 px-3.5 text-right text-[#0f52ba] font-extrabold text-base font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{totalAgreedValuation.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION 3: NEGOTIATION HISTORY ───────────────────── */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-5 md:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.common.multiRoundCommercialNegotiationAuditTrail}</h3>
              <p className="text-xs text-slate-500">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.itemLevelPriceMovementsAcrossNamedNegotiationRoundsLeadingToAgreedConvergence}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.baseline}{totalTargetValuation.toLocaleString(I18N_CONFIG.defaultLocale)}
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">{UI_STRINGS.common.savings}{totalSavings.toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.common.copy1b3t0c5}{totalTargetValuation > 0 ? ((totalSavings / totalTargetValuation) * 100).toFixed(1) : 0}{UI_STRINGS.common.copy1y4e1t7}</span>
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg overflow-x-auto shadow-2xs bg-white w-full">
            <table
              className="w-full text-left border-collapse table-fixed text-[13px]"
              style={{ minWidth: '1400px' }}
            >
              <colgroup>
                <col style={{ width: '55px' }} />
                <col style={{ width: '105px' }} />
                <col style={{ width: '190px' }} />
                <col style={{ width: '210px' }} />
                <col style={{ width: '75px' }} />
                <col style={{ width: '85px' }} />
                <col style={{ width: '135px' }} />
                <col style={{ width: '135px' }} />
                <col style={{ width: '135px' }} />
                <col style={{ width: '135px' }} />
                <col style={{ width: '140px' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold text-[13px] uppercase tracking-wider">
                  <th style={{ width: '55px' }} className="py-3 px-3 text-center border-b border-slate-300 border-r border-slate-200">{UI_STRINGS.common.sNo2}</th>
                  <th style={{ width: '105px' }} className="py-3 px-3.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemCode}</th>
                  <th style={{ width: '190px' }} className="py-3 px-3.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemDescription}</th>
                  <th style={{ width: '210px' }} className="py-3 px-3.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.bOQDescription}</th>
                  <th style={{ width: '75px' }} className="py-3 px-2 text-center border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.uOM}</th>
                  <th style={{ width: '85px' }} className="py-3 px-3 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.qty}</th>
                  <th style={{ width: '135px' }} className="py-3 px-3.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.round1BuyerTarget}</th>
                  <th style={{ width: '135px' }} className="py-3 px-3.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.round1VendorQuote}</th>
                  <th style={{ width: '135px' }} className="py-3 px-3.5 text-right border-b border-slate-300 border-r border-slate-200 font-bold text-[#0f52ba] whitespace-normal break-words leading-tight">{UI_STRINGS.common.round2BuyerOffer}</th>
                  <th style={{ width: '135px' }} className="py-3 px-3.5 text-right border-b border-slate-300 border-r border-slate-200 font-bold text-amber-700 whitespace-normal break-words leading-tight">{UI_STRINGS.common.round2VendorQuote}</th>
                  <th style={{ width: '140px' }} className="py-3 px-3.5 text-right border-b border-slate-300 font-extrabold text-emerald-700 bg-emerald-50/30 whitespace-normal break-words leading-tight">{UI_STRINGS.common.finalAgreedRate}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {items.map((it, idx) => (
                  <tr
                    key={it.id}
                    className="hover:bg-slate-50/80 transition-colors border-b border-slate-200 even:bg-slate-50/30"
                  >
                    <td style={{ width: '55px' }} className="py-3 px-3 text-center text-slate-400 font-medium border-r border-slate-200">
                      {idx + 1}
                    </td>
                    <td style={{ width: '105px' }} className="py-3 px-3.5 font-mono text-xs font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis">
                      {it.itemCode}
                    </td>
                    <td style={{ width: '190px' }} className="py-3 px-3.5 border-r border-slate-200 overflow-hidden">
                      <LongTextCell
                        text={it.description}
                        title={interpolateUiString(UI_STRINGS.common.itemItemCodeDescription, { "itemCode": it.itemCode })}
                        subtitle={UI_STRINGS.common.coreItemMasterDescription}
                        maxWidth="100%"
                      />
                    </td>
                    <td style={{ width: '210px' }} className="py-2 px-3 border-r border-slate-200">
                      <BoqDescriptionCell
                        text={it.specification}
                        itemCode={it.itemCode}
                        itemDescription={it.description}
                        maxWidth="100%"
                        clampLines={2}
                      />
                    </td>
                    <td style={{ width: '75px' }} className="py-3 px-2 text-center text-slate-700 font-medium border-r border-slate-200 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-xs">
                        {it.uom}
                      </span>
                    </td>
                    <td style={{ width: '85px' }} className="py-3 px-3 text-right text-xs text-slate-600 border-r border-slate-200 font-mono whitespace-nowrap">
                      {it.qty}
                    </td>
                    <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-slate-600 border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{it.buyerTargetRate.toLocaleString(I18N_CONFIG.defaultLocale)}
                    </td>
                    <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-slate-600 border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{it.round1VendorQuote.toLocaleString(I18N_CONFIG.defaultLocale)}
                    </td>
                    <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-[#0f52ba] font-bold border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{(it.round2BuyerOffer ?? it.agreedRate).toLocaleString(I18N_CONFIG.defaultLocale)}
                    </td>
                    <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-amber-700 font-bold border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{(it.round2VendorQuote ?? it.round1VendorQuote).toLocaleString(I18N_CONFIG.defaultLocale)}
                    </td>
                    <td style={{ width: '140px' }} className="py-3 px-3.5 text-right text-emerald-700 font-extrabold bg-emerald-50/20 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{it.agreedRate.toLocaleString(I18N_CONFIG.defaultLocale)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-[13px] text-slate-900">
                  <td
                    colSpan={6}
                    className="py-3 px-3.5 text-right uppercase tracking-wider text-xs font-bold text-slate-700 border-r border-slate-200"
                  >{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.valuationTotals}</td>
                  <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-slate-600 border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{totalTargetValuation.toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-slate-600 border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{items.reduce((acc, it) => acc + it.qty * it.round1VendorQuote, 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-[#0f52ba] font-bold border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{items.reduce((acc, it) => acc + it.qty * (it.round2BuyerOffer ?? it.agreedRate), 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-amber-700 font-bold border-r border-slate-200 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{items.reduce((acc, it) => acc + it.qty * (it.round2VendorQuote ?? it.round1VendorQuote), 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                  <td style={{ width: '140px' }} className="py-3 px-3.5 text-right text-emerald-700 font-extrabold bg-emerald-50/20 font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{totalAgreedValuation.toLocaleString(I18N_CONFIG.defaultLocale)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs md:text-sm text-slate-700 space-y-2">
            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <History size={16} className="text-[#0f52ba]" />
              <span>{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.persistedCommercialNegotiationAuditTrail}</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              {parsedNotes?.round1?.buyerOffer1Date || parsedNotes?.round1?.buyerOffer1Actor ? <li>
                <strong>
                  {parsedNotes.round1.buyerOffer1Date
                    ? new Date(parsedNotes.round1.buyerOffer1Date).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
                    : UI_STRINGS.common.notAvailable}</strong>{' '}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.rateCardInitiatedBy}{parsedNotes.round1.buyerOffer1Actor || UI_STRINGS.common.notAvailable}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.withTargetRatesTotaling}{totalTargetValuation.toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.common.copyby08hd}</li> : null}
              {parsedNotes?.round1?.vendorQuote1Date || parsedNotes?.round1?.vendorQuote1Actor ? <li>
                <strong>
                  {parsedNotes.round1.vendorQuote1Date
                    ? new Date(parsedNotes.round1.vendorQuote1Date).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
                    : UI_STRINGS.common.notAvailable}</strong>{' '}{UI_STRINGS.common.vendor}{parsedNotes.round1.vendorQuote1Actor || vendorName}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.submittedRound1Quote}</li> : null}
              {parsedNotes?.round2?.buyerOffer2Date || parsedNotes?.round2?.buyerOffer2Actor ? <li>
                <strong>
                  {parsedNotes.round2.buyerOffer2Date
                    ? new Date(parsedNotes.round2.buyerOffer2Date).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
                    : UI_STRINGS.common.notAvailable}</strong>{' '}
                {parsedNotes.round2.buyerOffer2Actor || UI_STRINGS.common.notAvailable}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.submittedCounterOffer2WithTargetBenchmarkingTotaling}{totalAgreedValuation.toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.common.copyby08hd}</li> : null}
              {parsedNotes?.round2?.vendorQuote2Date || parsedNotes?.round2?.vendorQuote2Actor ? <li>
                <strong>
                  {parsedNotes.round2.vendorQuote2Date
                    ? new Date(parsedNotes.round2.vendorQuote2Date).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
                    : UI_STRINGS.common.notAvailable}</strong>{' '}{UI_STRINGS.common.vendor}{parsedNotes.round2.vendorQuote2Actor || vendorName}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.submittedRevisedRound2QuoteWithAgreedConvergence}{parsedNotes.round2.vendorQuote2Remarks || UI_STRINGS.common.notAvailable}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.copyie9i6}</li> : null}
              {parsedNotes?.buyerAccepted ? <li>
                <strong>
                  {parsedNotes.buyerAccepted.timestamp
                    ? new Date(parsedNotes.buyerAccepted.timestamp).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
                    : UI_STRINGS.common.notAvailable}</strong>{' '}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.buyerFormallyAcceptedFinalCommercialQuotation}{parsedNotes.buyerAccepted.remarks || UI_STRINGS.common.notAvailable}{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.copyie9i6}</li> : null}
              {!parsedNotes?.round1?.buyerOffer1Date && !parsedNotes?.round1?.buyerOffer1Actor
                && !parsedNotes?.round1?.vendorQuote1Date && !parsedNotes?.round1?.vendorQuote1Actor
                && !parsedNotes?.round2?.buyerOffer2Date && !parsedNotes?.round2?.buyerOffer2Actor
                && !parsedNotes?.round2?.vendorQuote2Date && !parsedNotes?.round2?.vendorQuote2Actor
                && !parsedNotes?.buyerAccepted
                ? <li>{UI_STRINGS.common.notAvailable}</li> : null}
            </ul>
          </div>
        </div>
      )}

      {/* ── SECTION 4: SIGN-OFF TIMELINE ─────────────────────── */}
      {activeTab === 'signoff' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-5 md:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.governanceSignOffTimelineApprovalsChain}</h3>
              <p className="text-xs text-slate-500">{UI_STRINGS.componentsRateCardsSection7FinalisedDetails.sequentialEnterpriseGovernanceSignOffsAndActivationMilestones}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>{status === 'Active' && signoffMilestones.length === 5 ? UI_STRINGS.componentsRateCardsSection7FinalisedDetails.allMilestonesCompleted : UI_STRINGS.common.inProgress}</span>
            </span>
          </div>

          <div className="space-y-4">
            {signoffMilestones.length === 0 && <p className="text-sm text-slate-500">{UI_STRINGS.common.notAvailable}</p>}
            {signoffMilestones.map((milestone) => {
              const isDone = milestone.status === UI_STRINGS.common.completed;
              return (
                <div
                  key={milestone.step}
                  className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-start justify-between gap-4 transition-all hover:border-slate-300"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs mt-0.5 ${
                        isDone ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {isDone ? <Check size={16} strokeWidth={2.5} /> : milestone.step}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900">{milestone.title}</h4>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                            isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {milestone.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium">{milestone.title}</p>
                      <p className="text-xs text-slate-500 max-w-2xl">{milestone.notes}</p>
                    </div>
                  </div>

                  <div className="md:text-right shrink-0 space-y-1 pl-11 md:pl-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
                    <div className="text-xs font-bold text-slate-800 flex items-center md:justify-end gap-1.5">
                      <User size={13} className="text-slate-400" />
                      <span>{milestone.actor}</span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center md:justify-end gap-1.5 font-mono">
                      <Clock size={13} className="text-slate-400" />
                      <span>{milestone.date}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agreement Preview Modal */}
      <AgreementPreviewModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        rateCardId={rateCardId}
        vendorName={vendorName}
        vendorCode={vendorCode}
        category={category}
        validity={validity}
        items={items.map((it) => ({
          ...it,
          rate: it.agreedRate,
        }))}
        agreement={agreement}
      />
    </div>
  );
}
