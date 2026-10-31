'use client';
// src/components/rate-cards/NegotiationWorkspace.tsx
// Standardized full-width item-level negotiation workspace with enterprise design standards
import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, Save, Send, CheckCircle2, History, Layers, Check } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import LongTextCell from '@/components/ui/LongTextCell';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import type { NegotiationItem, NegotiationWorkspaceProps } from "@app-types/components/rate-cards/NegotiationWorkspace.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { NegotiationItem };


export default function NegotiationWorkspace({
  rateCardId = 'RC-2026-0006',
  vendorName = 'Ramakrishna Interiors (VND-0006)',
  category = 'Interior Works',
  round = 'Round 2 of 4',
  items,
  onItemsChange,
  onReset,
  onSaveDraft,
  onSendOffer,
  onAcceptQuoteClick,
  onBack,
}: NegotiationWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'offers' | 'history'>('offers');

  // Calculate live totals
  const targetTotal = items.reduce((acc, it) => acc + (it.qty * it.buyerTargetRate), 0);
  const vendorQuoteTotal = items.reduce((acc, it) => acc + (it.qty * it.latestVendorQuote), 0);
  const currentBuyerOfferTotal = items.reduce((acc, it) => acc + (it.qty * it.currentBuyerOffer), 0);
  const savingsVsTarget = targetTotal - currentBuyerOfferTotal;
  const savingsVsQuote = vendorQuoteTotal - currentBuyerOfferTotal;

  const handleRateChange = (id: string, newRate: number) => {
    const updated = items.map((it) => {
      if (it.id === id) {
        return {
          ...it,
          currentBuyerOffer: newRate,
          proposedAmount: it.qty * newRate,
        };
      }
      return it;
    });
    onItemsChange(updated);
  };

  return (
    <div className="w-full space-y-6">
      {/* ── BREADCRUMB & HEADER ────────────────────────────────────────── */}
      <PageHeader
        title={UI_STRINGS.componentsRateCardsNegotiationWorkspace.rateCardNegotiationItemLevel}
        subtitle={UI_STRINGS.componentsRateCardsNegotiationWorkspace.conductLineItemCommercialNegotiationsReviewVendorQuotesAcrossNamedRoundsAndSubmitCounterOffers}
        onBack={onBack}
        backLabel="Back to Rate Cards"
        stepNumber={3}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-bold text-slate-800">
              {rateCardId}
            </span>
            <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-xs font-semibold text-[#0f52ba]">
              {round}
            </span>
            <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />{UI_STRINGS.componentsRateCardsNegotiationWorkspace.awaitingVendorQuote}</span>
          </div>
        }
      />

      {/* ── METADATA & METRICS SUMMARY CARDS ───────────────────────────── */}
      <SummaryCardGrid columns={4}>
        <SummaryCard
          label={UI_STRINGS.componentsRateCardsNegotiationWorkspace.buyerTargetTotal}
          value={`₹ ${targetTotal.toLocaleString()}`}
          secondary={UI_STRINGS.componentsRateCardsNegotiationWorkspace.benchmarkBaseline}
          accent="neutral"
        />
        <SummaryCard
          label={UI_STRINGS.componentsRateCardsNegotiationWorkspace.latestVendorQuoteTotal}
          value={`₹ ${vendorQuoteTotal.toLocaleString()}`}
          secondary={UI_STRINGS.componentsRateCardsNegotiationWorkspace.round2SubmittedQuotes}
          accent="amber"
        />
        <SummaryCard
          label={UI_STRINGS.componentsRateCardsNegotiationWorkspace.currentBuyerOfferTotal}
          value={`₹ ${currentBuyerOfferTotal.toLocaleString()}`}
          secondary={UI_STRINGS.componentsRateCardsNegotiationWorkspace.proposedContractValue}
          accent="blue"
        />
        <SummaryCard
          label={UI_STRINGS.componentsRateCardsNegotiationWorkspace.negotiatedVariance}
          value={savingsVsQuote >= 0 ? `- ₹ ${savingsVsQuote.toLocaleString()}` : `+ ₹ ${Math.abs(savingsVsQuote).toLocaleString()}`}
          secondary={
            <span className={savingsVsTarget >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
              {targetTotal > 0 ? ((savingsVsTarget / targetTotal) * 100).toFixed(1) : 0}{UI_STRINGS.componentsRateCardsNegotiationWorkspace.vsTarget}</span>
          }
          accent={savingsVsQuote >= 0 ? 'emerald' : 'rose'}
        />
      </SummaryCardGrid>

      {/* ── WORKSPACE TABS & TABLE CARD ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Tabs Bar (Standard 46px height with clear typography) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 border-b border-slate-200 bg-[#fafcff] gap-2">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('offers')}
              className={`h-[46px] text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'offers'
                  ? 'border-[#0f52ba] text-[#0f52ba]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers size={16} />
              <span>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.itemLevelOffersCalculations}</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-[#0f52ba] font-bold">
                {items.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`h-[46px] text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-[#0f52ba] text-[#0f52ba]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <History size={16} />
              <span>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.negotiationHistoryRoundAudit}</span>
            </button>
          </div>

          <div className="text-xs md:text-sm text-slate-500 font-medium py-2 sm:py-0">{UI_STRINGS.common.vendor2}<span className="font-bold text-slate-800">{vendorName}</span>{UI_STRINGS.common.category}<span className="font-semibold text-slate-800">{category}</span>
          </div>
        </div>

        {/* ── TAB 1: ITEM LEVEL OFFERS ─────────────────────────────────── */}
        {activeTab === 'offers' && (
          <div>
            <div className="overflow-x-auto">
              <table
                className="enterprise-table w-full text-left border-collapse table-fixed text-sm"
                style={{ minWidth: '1330px' }}
              >
                <colgroup>
                  <col style={{ width: '55px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '195px' }} />
                  <col style={{ width: '215px' }} />
                  <col style={{ width: '75px' }} />
                  <col style={{ width: '85px' }} />
                  <col style={{ width: '135px' }} />
                  <col style={{ width: '145px' }} />
                  <col style={{ width: '165px' }} />
                  <col style={{ width: '150px' }} />
                </colgroup>
                <thead>
                  <tr className="bg-[#f8fafc] text-slate-700 border-b border-slate-200 font-bold text-xs tracking-wider uppercase">
                    <th style={{ width: '55px' }} className="py-3.5 px-3 text-center border-r border-slate-200">{UI_STRINGS.common.sNo2}</th>
                    <th style={{ width: '110px' }} className="py-3.5 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemCode}</th>
                    <th style={{ width: '195px' }} className="py-3.5 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ width: '215px' }} className="py-3.5 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.bOQDescription}</th>
                    <th style={{ width: '75px' }} className="py-3.5 px-3 text-center border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.uOM}</th>
                    <th style={{ width: '85px' }} className="py-3.5 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.qty}</th>
                    <th style={{ width: '135px' }} className="py-3.5 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.buyerTargetRate}</th>
                    <th style={{ width: '145px' }} className="py-3.5 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.latestVendorQuote}</th>
                    <th style={{ width: '165px' }} className="py-3.5 px-3.5 text-right bg-blue-50/40 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.currentBuyerOffer}</th>
                    <th style={{ width: '150px' }} className="py-3.5 px-3.5 text-right font-bold whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.proposedAmount}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {items.map((row, idx) => {
                    const rowProposedAmt = row.qty * row.currentBuyerOffer;
                    const boqDesc = row.specification || row.description;
                    return (
                      <tr key={row.id} className="hover:bg-blue-50/20 transition-colors">
                        <td style={{ width: '55px' }} className="py-3 px-3 text-center text-slate-400 font-medium border-r border-slate-100">
                          {idx + 1}
                        </td>
                        <td style={{ width: '110px' }} className="py-3 px-3.5 font-bold font-mono text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis border-r border-slate-100">
                          {row.itemCode}
                        </td>
                        <td style={{ width: '195px' }} className="py-3 px-3.5 border-r border-slate-100 overflow-hidden">
                          <LongTextCell
                            text={row.description}
                            title={interpolateUiString(UI_STRINGS.common.itemItemCodeDescription, { "itemCode": row.itemCode })}
                            subtitle={UI_STRINGS.common.coreItemMasterDescription}
                            maxWidth="100%"
                          />
                        </td>
                        <td style={{ width: '215px' }} className="py-2 px-3 border-r border-slate-100">
                          <BoqDescriptionCell
                            text={boqDesc}
                            itemCode={row.itemCode}
                            itemDescription={row.description}
                            maxWidth="100%"
                            clampLines={2}
                          />
                        </td>
                        <td style={{ width: '75px' }} className="py-3 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold text-xs">
                            {row.uom}
                          </span>
                        </td>
                        <td style={{ width: '85px' }} className="py-3 px-3.5 text-right text-slate-700 font-semibold border-r border-slate-100 whitespace-nowrap font-mono">
                          {row.qty.toLocaleString()}
                        </td>
                        <td style={{ width: '135px' }} className="py-3 px-3.5 text-right text-slate-700 font-medium border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{row.buyerTargetRate.toLocaleString()}
                        </td>
                        <td style={{ width: '145px' }} className="py-3 px-3.5 text-right font-bold text-amber-700 border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{row.latestVendorQuote.toLocaleString()}
                        </td>
                        <td style={{ width: '165px' }} className="py-2.5 px-3.5 text-right bg-blue-50/30 border-r border-slate-100">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-slate-400 font-semibold text-xs">{UI_STRINGS.common.copy1g8b5tg}</span>
                            <input
                              type="number"
                              value={row.currentBuyerOffer}
                              onChange={(e) => handleRateChange(row.id, Number(e.target.value))}
                              className="w-24 h-9 py-1 px-2 text-right font-bold text-sm text-[#0f52ba] border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0f52ba] bg-white transition-all shadow-2xs"
                            />
                          </div>
                        </td>
                        <td style={{ width: '150px' }} className="py-3 px-3.5 text-right font-bold text-slate-900 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{rowProposedAmt.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-sm text-slate-900">
                    <td colSpan={6} className="py-3.5 px-3.5 text-right font-bold uppercase tracking-wider text-xs text-slate-600 border-r border-slate-200">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.totalCommercialValuation}</td>
                    <td style={{ width: '135px' }} className="py-3.5 px-3.5 text-right text-slate-700 border-r border-slate-200 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{targetTotal.toLocaleString()}
                    </td>
                    <td style={{ width: '145px' }} className="py-3.5 px-3.5 text-right text-amber-700 border-r border-slate-200 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{vendorQuoteTotal.toLocaleString()}
                    </td>
                    <td style={{ width: '165px' }} className="py-3.5 px-3.5 text-right text-[#0f52ba] bg-blue-50/60 border-r border-slate-200 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{currentBuyerOfferTotal.toLocaleString()}
                    </td>
                    <td style={{ width: '150px' }} className="py-3.5 px-3.5 text-right text-slate-900 font-extrabold text-base whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{currentBuyerOfferTotal.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── ACTION FOOTER ────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-slate-200 bg-[#fbfcfd]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onReset}
                  className="h-10 px-4 border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <RotateCcw size={14} />
                  <span>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.resetToTarget}</span>
                </button>
                <button
                  type="button"
                  onClick={onSaveDraft}
                  className="h-10 px-4 border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Save size={14} />
                  <span>{UI_STRINGS.common.saveDraft}</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onSendOffer}
                  className="h-11 px-6 bg-[#0f52ba] hover:bg-blue-800 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                >
                  <Send size={15} />
                  <span>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.sendProposedOfferToVendor}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: NEGOTIATION HISTORY ──────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-2">{UI_STRINGS.common.multiRoundCommercialNegotiationAuditTrail}</h3>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table
                className="enterprise-table w-full text-left border-collapse table-fixed text-sm"
                style={{ minWidth: '1005px' }}
              >
                <colgroup>
                  <col style={{ width: '280px' }} />
                  <col style={{ width: '145px' }} />
                  <col style={{ width: '145px' }} />
                  <col style={{ width: '145px' }} />
                  <col style={{ width: '145px' }} />
                  <col style={{ width: '145px' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold text-xs uppercase tracking-wider">
                    <th style={{ width: '280px' }} className="py-3 px-3.5 border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.itemCodeDescription}</th>
                    <th style={{ width: '145px' }} className="py-3 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.round1BuyerOffer}</th>
                    <th style={{ width: '145px' }} className="py-3 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.round1VendorQuote}</th>
                    <th style={{ width: '145px' }} className="py-3 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.round2BuyerOffer}</th>
                    <th style={{ width: '145px' }} className="py-3 px-3.5 text-right border-r border-slate-200 whitespace-normal break-words leading-tight">{UI_STRINGS.common.round2VendorQuote}</th>
                    <th style={{ width: '145px' }} className="py-3 px-3.5 text-right whitespace-normal break-words leading-tight">{UI_STRINGS.common.finalAgreedRate}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                      <td style={{ width: '280px' }} className="py-3 px-3.5 font-medium border-r border-slate-100 overflow-hidden">
                        <span className="font-bold text-slate-900 mr-2">{it.itemCode}</span>
                        <span className="text-slate-700">{it.description}</span>
                      </td>
                      <td style={{ width: '145px' }} className="py-3 px-3.5 text-right text-slate-600 border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{it.buyerTargetRate.toLocaleString()}
                      </td>
                      <td style={{ width: '145px' }} className="py-3 px-3.5 text-right text-slate-600 border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{(it.latestVendorQuote + 5).toLocaleString()}
                      </td>
                      <td style={{ width: '145px' }} className="py-3 px-3.5 text-right text-[#0f52ba] font-bold border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{it.currentBuyerOffer.toLocaleString()}
                      </td>
                      <td style={{ width: '145px' }} className="py-3 px-3.5 text-right text-amber-700 font-bold border-r border-slate-100 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{it.latestVendorQuote.toLocaleString()}
                      </td>
                      <td style={{ width: '145px' }} className="py-3 px-3.5 text-right text-emerald-700 font-extrabold whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{it.currentBuyerOffer.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs md:text-sm text-slate-600 space-y-2">
              <div className="font-bold text-slate-800 text-sm">{UI_STRINGS.componentsRateCardsNegotiationWorkspace.governanceHistorySummary}</div>
              <div>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copyle24wv}<strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copyh3wfg6}</strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.rateCardInitiatedByCategoryManagerWithTargetRates}</div>
              <div>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copyle24wv}<strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copy18x5ggx}</strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.vendorSubmittedRound1QuoteTotal515000}</div>
              <div>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copyle24wv}<strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copy1e5bvni}</strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.categoryManagerSubmittedCounterOffer2Total483000}</div>
              <div>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copyle24wv}<strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.copyi1na0t}</strong>{UI_STRINGS.componentsRateCardsNegotiationWorkspace.vendorSubmittedRevisedRound2QuoteTotal499000FinalAgreedItemsMatch483000}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
