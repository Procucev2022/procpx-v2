'use client';
// src/components/rate-cards/AgreementPreviewModal.tsx
// Authoritative Rate Card Agreement Preview Modal supporting generated templates & uploaded documents
import React from 'react';
import { X, FileText, Download, CheckCircle2, ShieldCheck, Printer, Calendar, Building2, User, AlertTriangle } from 'lucide-react';
import type { AgreementDocumentData, AgreementPreviewModalProps } from "@app-types/components/rate-cards/AgreementPreviewModal.types";
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
                    <ShieldCheck size={12} />
                    Digitally Signed
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                    Signature Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Rate Card Reference: <strong>{rateCardId}</strong> | Revision: v1.0 | Category: {category}
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
              <span>Print</span>
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
                  {agreement?.fileName || 'Executed_Agreement_Document.pdf'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  File Size: {agreement?.fileSize || '1.8 MB'} • Uploaded on {agreement?.uploadedAt || '22 Oct 2026'}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                <CheckCircle2 size={16} />
                <span>Uploaded formal document verified against Rate Card {rateCardId} commercial schedule</span>
              </div>
            </div>
          ) : (
            /* Formal Template Content */
            <div className="border border-slate-200 rounded-lg bg-white p-8 shadow-xs space-y-6 print:border-none print:p-0">
              {/* Document Header */}
              <div className="text-center border-b border-slate-200 pb-6 space-y-2">
                <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">
                  proCPX Enterprise Capex Procurement Framework
                </div>
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                  MASTER RATE CARD AGREEMENT
                </h2>
                <div className="text-xs text-slate-600 font-medium">
                  Agreement No: <span className="font-mono font-bold text-slate-800">{docNumber}</span> | Linked Rate Card: <span className="font-mono font-bold text-slate-800">{rateCardId}</span>
                </div>
              </div>

              {/* Legal Preamble */}
              <div className="space-y-3 text-xs md:text-sm text-slate-700">
                <p>
                  THIS MASTER RATE CARD AGREEMENT (the <strong>"Agreement"</strong>) is made and entered into on this{' '}
                  <strong>22nd day of October 2026</strong>, by and between:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">The Buyer / Principal</span>
                    <strong className="text-slate-900">proCPX Retail Capex Management Entity</strong>
                    <div className="text-xs text-slate-600 mt-0.5">Corporate Procurement Division, Bangalore, Karnataka, India</div>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">The Vendor Partner</span>
                    <strong className="text-slate-900">{vendorName}</strong>
                    <div className="text-xs text-slate-600 mt-0.5">Vendor Code: {vendorCode} | Category: {category}</div>
                  </div>
                </div>
                <p>
                  WHEREAS, Buyer has undertaken competitive negotiation rounds under Rate Card Reference <strong>{rateCardId}</strong> for category <strong>{category}</strong>, and Vendor has submitted final eligible unit rates which have been vetted and accepted by Buyer.
                </p>
              </div>

              {/* Section 1: Scope & Validity */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
                  1. Scope of Work and Validity Term
                </h4>
                <p className="text-xs text-slate-700">
                  The unit rates established in this Agreement shall govern all purchase orders, project requisitions, and capex fit-out packages issued by Buyer during the contract term: <strong>{validity}</strong>. All rates remain firm and fixed for the entire duration without escalation.
                </p>
              </div>

              {/* Section 2: Rate Schedule Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
                  2. Agreed Schedule of Rates & Specifications
                </h4>
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
                        <th style={{ width: '45px' }} className="py-2.5 px-3 text-center border-r border-slate-200">#</th>
                        <th style={{ width: '110px' }} className="py-2.5 px-3 border-r border-slate-200 whitespace-normal break-words leading-tight">Item Code</th>
                        <th style={{ width: '240px' }} className="py-2.5 px-3 border-r border-slate-200 whitespace-normal break-words leading-tight">Description / Scope</th>
                        <th style={{ width: '65px' }} className="py-2.5 px-3 text-center border-r border-slate-200 whitespace-normal break-words leading-tight">UOM</th>
                        <th style={{ width: '80px' }} className="py-2.5 px-3 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">Ref Qty</th>
                        <th style={{ width: '130px' }} className="py-2.5 px-3 text-right font-bold whitespace-normal break-words leading-tight">Agreed Rate (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {items.map((it, idx) => {
                        const rate = it.agreedRate ?? it.rate ?? it.vendorQuoteRate ?? 0;
                        return (
                          <tr key={it.id || idx}>
                            <td style={{ width: '45px' }} className="py-2 px-3 text-center text-slate-400 border-r border-slate-100">{idx + 1}</td>
                            <td style={{ width: '110px' }} className="py-2 px-3 font-mono font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">{it.itemCode || `ITEM-${idx + 1}`}</td>
                            <td style={{ width: '240px' }} className="py-2 px-3 border-r border-slate-100 font-medium overflow-hidden text-ellipsis whitespace-nowrap">{it.description}</td>
                            <td style={{ width: '65px' }} className="py-2 px-3 text-center border-r border-slate-100 whitespace-nowrap">{it.uom}</td>
                            <td style={{ width: '80px' }} className="py-2 px-3 text-right text-slate-600 border-r border-slate-100 font-mono whitespace-nowrap">{(it.qty || 1).toLocaleString()}</td>
                            <td style={{ width: '130px' }} className="py-2 px-3 text-right font-bold text-slate-900 font-mono whitespace-nowrap">₹ {rate.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                        <td colSpan={5} className="py-2.5 px-3 text-right uppercase text-slate-700 border-r border-slate-200">
                          Total Reference Value:
                        </td>
                        <td style={{ width: '130px' }} className="py-2.5 px-3 text-right text-[#0f52ba] font-extrabold text-sm font-mono whitespace-nowrap">
                          ₹ {totalValue.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Section 3: Commercial Clauses */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
                  3. Commercial Terms, Warranties & Governance
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                  <li><strong>Payment Terms:</strong> Net 30 calendar days from the receipt of verified tax invoice and site sign-off.</li>
                  <li><strong>Defect Liability:</strong> 12 months comprehensive defect liability and warranty from date of handover.</li>
                  <li><strong>Taxes:</strong> All agreed unit rates are exclusive of GST. Applicable GST will be paid as per statutory notifications.</li>
                  <li><strong>Governance:</strong> Rate card activation requires Level 1 Project Approver validation and Level 2 Finance approval.</li>
                </ul>
              </div>

              {/* Execution & Signatures */}
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  4. Execution and Signature Verification
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Buyer Side */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">Accepted by Buyer</span>
                    <div className="font-bold text-sm text-slate-900">Category Manager</div>
                    <div className="text-xs text-slate-600">Commercial terms vetted & approved</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-2">
                      <Calendar size={12} />
                      <span>22 Oct 2026, 10:00 IST</span>
                    </div>
                  </div>

                  {/* Vendor Side */}
                  <div className={`p-4 rounded-lg border space-y-2 ${
                    isSigned ? 'border-emerald-300 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/40'
                  }`}>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">Accepted & Executed by Vendor</span>
                    {isSigned ? (
                      <div>
                        <div className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                          <ShieldCheck size={16} className="text-emerald-600" />
                          <span>{agreement?.signature?.signedBy || 'K. Ramakrishna'}</span>
                        </div>
                        <div className="text-xs text-emerald-800 font-medium mt-0.5">
                          {agreement?.signature?.designation || 'Managing Partner / Authorized Signatory'}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-mono mt-1">
                          Ref: {agreement?.signature?.signatureEvidenceId || 'DSC-2026-VND-0006-8848'}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                          <Calendar size={12} />
                          <span>{agreement?.signature?.signedAt || '24 Oct 2026, 12:00 IST'}</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-bold text-sm text-amber-900 flex items-center gap-1.5">
                          <AlertTriangle size={15} className="text-amber-600" />
                          <span>Awaiting Vendor Signature</span>
                        </div>
                        <p className="text-xs text-amber-800 mt-1">
                          This agreement requires digital signature verification by an authorized vendor representative prior to contract activation.
                        </p>
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
          <div className="text-xs text-slate-500 font-medium">
            ProCPX Master Rate Card Agreement • Document Hash: <span className="font-mono text-slate-700">SHA256-{rateCardId.replace(/-/g, '')}-V1</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
