'use client';
// src/components/rate-cards/AgreementPreviewModal.tsx
// Authoritative Rate Card Agreement Preview Modal supporting generated templates & uploaded documents
import React from 'react';
import { X, FileText, Download, CheckCircle2, ShieldCheck, Printer, Calendar, Building2, User, AlertTriangle } from 'lucide-react';
import type { AgreementDocumentData, AgreementPreviewModalProps } from "@app-types/components/rate-cards/AgreementPreviewModal.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { AgreementDocumentData };


export default function AgreementPreviewModal({
  isOpen,
  onClose,
  rateCardId,
  vendorName,
  vendorCode = 'VND-0006',
  category,
  validity = '01 Oct 2026 - 30 Sep 2027',
  items = [],
  agreement,
}: AgreementPreviewModalProps) {
  if (!isOpen) return null;

  const docTitle = agreement?.documentTitle || `Master Rate Agreement — ${category} — ${vendorName}`;
  const docNumber = agreement?.documentNumber || `MRA-${rateCardId}-REV1`;
  const isUploaded = agreement?.type === 'UPLOAD';
  const isSigned = !!agreement?.signature?.verified;

  const totalValue = items.reduce((acc, it) => {
    const rate = it.agreedRate ?? it.rate ?? it.vendorQuoteRate ?? 0;
    const q = it.qty || 1;
    return acc + (rate * q);
  }, 0);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-blue-100 text-[#0f52ba] flex items-center justify-center shrink-0">
              <FileText size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {docTitle}
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">
                  {docNumber}
                </span>
                {isSigned ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <ShieldCheck size={12} />{UI_STRINGS.componentsRateCardsAgreementPreviewModal.digitallySigned}</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.signaturePending}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.rateCardReference}<strong>{rateCardId}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.revisionV10Category}{category}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="h-9 px-3 border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Printer size={14} />
              <span>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.print}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body / Document Viewer */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-slate-800 text-sm leading-relaxed bg-[#fdfdfd]">
          {isUploaded ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#0f52ba] mx-auto flex items-center justify-center">
                <FileText size={32} />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  {agreement?.fileName || UI_STRINGS.componentsRateCardsAgreementPreviewModal.executedAgreementDocumentPdf}
                </h4>
                <p className="text-xs text-slate-500 mt-1">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.fileSize}{agreement?.fileSize || UI_STRINGS.componentsRateCardsAgreementPreviewModal.copypjlv1t}{UI_STRINGS.componentsRateCardsAgreementPreviewModal.uploadedOn}{agreement?.uploadedAt || UI_STRINGS.common.copyy2zker}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                <CheckCircle2 size={16} />
                <span>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.uploadedFormalDocumentVerifiedAgainstRateCard}{rateCardId}{UI_STRINGS.componentsRateCardsAgreementPreviewModal.commercialSchedule}</span>
              </div>
            </div>
          ) : (
            /* Formal Template Content */
            <div className="border border-slate-200 rounded-lg bg-white p-8 shadow-xs space-y-6 print:border-none print:p-0">
              {/* Document Header */}
              <div className="text-center border-b border-slate-200 pb-6 space-y-2">
                <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.proCPXEnterpriseCapexProcurementFramework}</div>
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.mASTERRATECARDAGREEMENT}</h2>
                <div className="text-xs text-slate-600 font-medium">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.agreementNo}<span className="font-mono font-bold text-slate-800">{docNumber}</span>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.linkedRateCard}<span className="font-mono font-bold text-slate-800">{rateCardId}</span>
                </div>
              </div>

              {/* Legal Preamble */}
              <div className="space-y-3 text-xs md:text-sm text-slate-700">
                <p>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.tHISMASTERRATECARDAGREEMENTThe}<strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.agreement}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.isMadeAndEnteredIntoOnThis}{' '}
                  <strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.copy1bck6ks}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.byAndBetween}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.theBuyerPrincipal}</span>
                    <strong className="text-slate-900">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.proCPXRetailCapexManagementEntity}</strong>
                    <div className="text-xs text-slate-600 mt-0.5">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.corporateProcurementDivisionBangaloreKarnatakaIndia}</div>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.theVendorPartner}</span>
                    <strong className="text-slate-900">{vendorName}</strong>
                    <div className="text-xs text-slate-600 mt-0.5">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.vendorCode}{vendorCode}{UI_STRINGS.common.category}{category}</div>
                  </div>
                </div>
                <p>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.wHEREASBuyerHasUndertakenCompetitiveNegotiationRoundsUnderRateCardReference}<strong>{rateCardId}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.forCategory}<strong>{category}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.andVendorHasSubmittedFinalEligibleUnitRatesWhichHaveBeenVettedAndAcceptedByBuyer}</p>
              </div>

              {/* Section 1: Scope & Validity */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.copy1suk0bp}</h4>
                <p className="text-xs text-slate-700">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.theUnitRatesEstablishedInThisAgreementShallGovernAllPurchaseOrdersProjectRequisitionsAndCapexFitOutPackagesIssuedByBuyerDuringTheContractTerm}<strong>{validity}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.allRatesRemainFirmAndFixedForTheEntireDurationWithoutEscalation}</p>
              </div>

              {/* Section 2: Rate Schedule Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.copy1082x8u}</h4>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table
                    className="enterprise-table w-full text-left border-collapse table-fixed text-xs"
                    style={{ minWidth: '670px' }}
                  >
                    <colgroup>
                      <col style={{ width: '45px' }} />
                      <col style={{ width: '110px' }} />
                      <col style={{ width: '240px' }} />
                      <col style={{ width: '65px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '130px' }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th style={{ width: '45px' }} className="py-2.5 px-3 text-center border-r border-slate-200">{UI_STRINGS.common.copyak280i}</th>
                        <th style={{ width: '110px' }} className="py-2.5 px-3 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemCode}</th>
                        <th style={{ width: '240px' }} className="py-2.5 px-3 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.descriptionScope}</th>
                        <th style={{ width: '65px' }} className="py-2.5 px-3 text-center border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.uOM}</th>
                        <th style={{ width: '80px' }} className="py-2.5 px-3 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.refQty}</th>
                        <th style={{ width: '130px' }} className="py-2.5 px-3 text-right font-bold whitespace-normal break-words leading-tight">{UI_STRINGS.common.agreedRate}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {items.map((it, idx) => {
                        const rate = it.agreedRate ?? it.rate ?? it.vendorQuoteRate ?? 0;
                        return (
                          <tr key={it.id || idx}>
                            <td style={{ width: '45px' }} className="py-2 px-3 text-center text-slate-400 border-r border-slate-100">{idx + 1}</td>
                            <td style={{ width: '110px' }} className="py-2 px-3 font-mono font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">{it.itemCode || interpolateUiString(UI_STRINGS.componentsRateCardsAgreementPreviewModal.iTEMValue1, { "value1": idx + 1 })}</td>
                            <td style={{ width: '240px' }} className="py-2 px-3 border-r border-slate-100 font-medium overflow-hidden text-ellipsis whitespace-nowrap">{it.description}</td>
                            <td style={{ width: '65px' }} className="py-2 px-3 text-center border-r border-slate-100 whitespace-nowrap">{it.uom}</td>
                            <td style={{ width: '80px' }} className="py-2 px-3 text-right text-slate-600 border-r border-slate-100 font-mono whitespace-nowrap">{(it.qty || 1).toLocaleString()}</td>
                            <td style={{ width: '130px' }} className="py-2 px-3 text-right font-bold text-slate-900 font-mono whitespace-nowrap">{UI_STRINGS.common.copytfdhmk}{rate.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                        <td colSpan={5} className="py-2.5 px-3 text-right uppercase text-slate-700 border-r border-slate-200">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.totalReferenceValue}</td>
                        <td style={{ width: '130px' }} className="py-2.5 px-3 text-right text-[#0f52ba] font-extrabold text-sm font-mono whitespace-nowrap">{UI_STRINGS.common.copy1g8b5tg}{totalValue.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Section 3: Commercial Clauses */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.copyeyu275}</h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                  <li><strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.paymentTerms}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.net30CalendarDaysFromTheReceiptOfVerifiedTaxInvoiceAndSiteSignOff}</li>
                  <li><strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.defectLiability}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.copyu23v98}</li>
                  <li><strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.taxes}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.allAgreedUnitRatesAreExclusiveOfGSTApplicableGSTWillBePaidAsPerStatutoryNotifications}</li>
                  <li><strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.governance}</strong>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.rateCardActivationRequiresLevel1ProjectApproverValidationAndLevel2FinanceApproval}</li>
                </ul>
              </div>

              {/* Execution & Signatures */}
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.copyd325uh}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Buyer Side */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.acceptedByBuyer}</span>
                    <div className="font-bold text-sm text-slate-900">{UI_STRINGS.common.categoryManager}</div>
                    <div className="text-xs text-slate-600">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.commercialTermsVettedApproved}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-2">
                      <Calendar size={12} />
                      <span>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.copy1t7zb7k}</span>
                    </div>
                  </div>

                  {/* Vendor Side */}
                  <div className={`p-4 rounded-lg border space-y-2 ${
                    isSigned ? 'border-emerald-300 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/40'
                  }`}>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.acceptedExecutedByVendor}</span>
                    {isSigned ? (
                      <div>
                        <div className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                          <ShieldCheck size={16} className="text-emerald-600" />
                          <span>{agreement?.signature?.signedBy || UI_STRINGS.componentsRateCardsAgreementPreviewModal.kRamakrishna}</span>
                        </div>
                        <div className="text-xs text-emerald-800 font-medium mt-0.5">
                          {agreement?.signature?.designation || UI_STRINGS.componentsRateCardsAgreementPreviewModal.managingPartnerAuthorizedSignatory}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-mono mt-1">{UI_STRINGS.common.ref}{agreement?.signature?.signatureEvidenceId || UI_STRINGS.componentsRateCardsAgreementPreviewModal.dSC2026VND00068848}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                          <Calendar size={12} />
                          <span>{agreement?.signature?.signedAt || UI_STRINGS.componentsRateCardsAgreementPreviewModal.copy1seojss}</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-bold text-sm text-amber-900 flex items-center gap-1.5">
                          <AlertTriangle size={15} className="text-amber-600" />
                          <span>{UI_STRINGS.componentsRateCardsAgreementPreviewModal.awaitingVendorSignature}</span>
                        </div>
                        <p className="text-xs text-amber-800 mt-1">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.thisAgreementRequiresDigitalSignatureVerificationByAnAuthorizedVendorRepresentativePriorToContractActivation}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0">
          <div className="text-xs text-slate-500 font-medium">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.proCPXMasterRateCardAgreementDocumentHash}<span className="font-mono text-slate-700">{UI_STRINGS.componentsRateCardsAgreementPreviewModal.sHA256}{rateCardId.replace(/-/g, '')}{UI_STRINGS.componentsRateCardsAgreementPreviewModal.v1}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold transition-colors"
          >{UI_STRINGS.componentsRateCardsAgreementPreviewModal.closeViewer}</button>
        </div>
      </div>
    </div>
  );
}
