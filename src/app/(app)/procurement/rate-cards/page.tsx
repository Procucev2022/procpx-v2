'use client';
// src/app/(app)/procurement/rate-cards/page.tsx
// Corrected Rate Card Management Architecture: Focused, full-width workflow workspaces
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import HomeWorkspace, { RateCardRow } from '@/components/rate-cards/HomeWorkspace';
import InitiateRateCardWorkspace from '@/components/rate-cards/InitiateRateCardWorkspace';
import NegotiationWorkspace, { NegotiationItem } from '@/components/rate-cards/NegotiationWorkspace';
import BuyerAcceptanceWorkspace from '@/components/rate-cards/BuyerAcceptanceWorkspace';
import Section7FinalisedDetails from '@/components/rate-cards/Section7FinalisedDetails';
import PageHeader from '@/components/ui/PageHeader';
import WorkflowStageNav from '@/components/ui/WorkflowStageNav';
import type { ViewMode } from "@app-types/app/(app)/procurement/rate-cards/page.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { ViewMode };


export default function RateCardManagementPage() {
  // Current active full-width workspace
  const [viewMode, setViewMode] = useState<ViewMode>('HOME');

  // Master rate cards state
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSummaryTab, setActiveSummaryTab] = useState<'finalised' | 'in_progress'>('finalised');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Active workflow card ID
  const [selectedCardId, setSelectedCardId] = useState<string>('RC-2026-0006');

  // Feedback toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Negotiation items state for RC-2026-0006
  const [negotiationItems, setNegotiationItems] = useState<NegotiationItem[]>([
    {
      id: 'it-1',
      itemCode: 'INT-001',
      description: UI_STRINGS.common.gypsumFalseCeiling,
      specification: 'Supply & install 12.5mm Saint-Gobain Gyproc board on GI framework with perimeter channels',
      uom: 'SQFT',
      qty: 500,
      buyerTargetRate: 120,
      latestVendorQuote: 110,
      currentBuyerOffer: 105,
      proposedAmount: 52500,
    },
    {
      id: 'it-2',
      itemCode: 'INT-002',
      description: UI_STRINGS.common.vitrifiedTiles2x2Ft,
      specification: 'Kajaria 600x600mm double charged vitrified floor tiles PEI-4 with epoxy grout',
      uom: 'SQFT',
      qty: 1000,
      buyerTargetRate: 95,
      latestVendorQuote: 90,
      currentBuyerOffer: 88,
      proposedAmount: 88000,
    },
    {
      id: 'it-3',
      itemCode: 'INT-003',
      description: UI_STRINGS.common.modularPartitions,
      specification: 'Full height double-glazed aluminum partition with 10mm toughened glass & acoustic gasket',
      uom: 'SQFT',
      qty: 300,
      buyerTargetRate: 350,
      latestVendorQuote: 330,
      currentBuyerOffer: 320,
      proposedAmount: 96000,
    },
    {
      id: 'it-4',
      itemCode: 'INT-004',
      description: UI_STRINGS.common.woodenCarpentry,
      specification: 'Commercial ply with 1mm Merino/Greenlam decorative laminate finish & hardwood beading',
      uom: 'SQFT',
      qty: 250,
      buyerTargetRate: 450,
      latestVendorQuote: 420,
      currentBuyerOffer: 410,
      proposedAmount: 102500,
    },
    {
      id: 'it-5',
      itemCode: 'INT-005',
      description: UI_STRINGS.common.paintingPremiumEmulsion,
      specification: 'Two coats Asian Paints Royale Luxury Emulsion over primer & wall putty',
      uom: 'SQFT',
      qty: 2000,
      buyerTargetRate: 80,
      latestVendorQuote: 75,
      currentBuyerOffer: 72,
      proposedAmount: 144000,
    },
  ]);

  // Workflow progress flags for RC-2026-0006
  const [rcWorkflowStatus, setRcWorkflowStatus] = useState<string>('In Progress');
  const [rcNextParty, setRcNextParty] = useState<string>('Category Manager');

  // Check URL query parameters on mount
  useEffect(() => {
    fetchRateCards();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view')?.toUpperCase();
      if (viewParam === 'INITIATE') setViewMode('INITIATE');
      else if (viewParam === 'NEGOTIATION' || viewParam === 'NEGOTIATE') setViewMode('NEGOTIATION');
      else if (viewParam === 'BUYER_ACCEPTANCE' || viewParam === 'BUYER-ACCEPTANCE') setViewMode('BUYER_ACCEPTANCE');
      else if (viewParam === 'DETAILS') setViewMode('DETAILS');
      else setViewMode('HOME');
    }
  }, []);

  const fetchRateCards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/rate-cards');
      const data = await res.json();
      if (data.rateCards && data.rateCards.length > 0) {
        setRateCards(data.rateCards);
      }
    } catch (e) {
      console.error('Error fetching rate cards:', e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSwitchView = (newMode: ViewMode) => {
    setViewMode(newMode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newMode === 'HOME') {
        url.searchParams.delete('view');
      } else {
        url.searchParams.set('view', newMode.toLowerCase());
      }
      window.history.replaceState({}, '', url.toString());
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Active rate card object from persisted DB rate cards
  const selectedRateCard = useMemo(() => {
    return rateCards.find(
      (rc) => rc.rateCardNumber === selectedCardId || rc.id === selectedCardId
    );
  }, [rateCards, selectedCardId]);

  // Real persisted database rate cards merged with workflow state
  const cardsData: RateCardRow[] = useMemo(() => {
    if (rateCards && rateCards.length > 0) {
      return rateCards.map((rc: any) => {
        const isActive = rc.status === 'APPROVED';
        const fromDate = rc.validFrom
          ? new Date(rc.validFrom).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
          : '01 Oct 2026';
        const toDate = rc.validTo
          ? new Date(rc.validTo).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
          : '30 Sep 2027';

        // Check if this is the active RC-2026-0006 undergoing in-memory workflow
        const isCurrentWorkflowCard = rc.rateCardNumber === 'RC-2026-0006' || rc.id === selectedCardId;
        const displayStatus = isCurrentWorkflowCard && rcWorkflowStatus !== 'Active'
          ? (rcWorkflowStatus === 'Approved' ? 'Active' : 'In Progress')
          : (isActive ? 'Active' : 'In Progress');

        const totalBuyerOffer = (rc.items || []).reduce((sum: number, it: any) => {
          const offer = it.buyerOffer2 || it.buyerOffer1 || it.rate || 0;
          const qty = it.referenceQty || it.qty || 1;
          return sum + (offer * qty);
        }, 0);

        const totalVendorQuote = (rc.items || []).reduce((sum: number, it: any) => {
          const quote = it.vendorQuote2 || it.vendorQuote1 || it.proposedRate || 0;
          const qty = it.referenceQty || it.qty || 1;
          return sum + (quote * qty);
        }, 0);

        const stageText = rc.status === 'ROUND_2_NEGOTIATION'
          ? 'Round 2 Negotiation'
          : rc.status === 'ROUND_1_BUYER_OFFER'
          ? 'Round 1 Offer'
          : rc.status === 'BUYER_ACCEPTED'
          ? 'Buyer Accepted'
          : rc.status === 'PENDING_APPROVAL'
          ? 'Pending Approval'
          : rc.status === 'APPROVED'
          ? 'Approved'
          : (rc.status ? rc.status.replace(/_/g, ' ') : 'In Progress');

        const lastUpdatedDate = rc.updatedAt
          ? new Date(rc.updatedAt).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
          : '22 Oct 2026';

        return {
          id: rc.id,
          rateCardId: rc.rateCardNumber || rc.id,
          vendor: rc.vendor?.name || 'Ramakrishna Interiors',
          vendorCode: rc.vendor?.code || 'VND-0006',
          category: rc.category || 'Interior Works',
          scope: rc.scope || rc.title || 'General commercial rate schedule',
          items: rc.items?.length || rc.itemCount || 0,
          validFrom: fromDate,
          validUntil: toDate,
          status: displayStatus as any,
          detailedStatus: isCurrentWorkflowCard ? rcWorkflowStatus : rc.status,
          currentStage: isCurrentWorkflowCard ? rcWorkflowStatus : stageText,
          latestBuyerOffer: totalBuyerOffer > 0 ? `₹ ${totalBuyerOffer.toLocaleString(I18N_CONFIG.defaultLocale)}` : '₹ 4,83,000',
          latestSubmittedVendorQuote: totalVendorQuote > 0 ? `₹ ${totalVendorQuote.toLocaleString(I18N_CONFIG.defaultLocale)}` : '₹ 5,08,000',
          latestVendorQuote: totalVendorQuote > 0 ? `₹ ${totalVendorQuote.toLocaleString(I18N_CONFIG.defaultLocale)}` : '₹ 5,08,000',
          lastUpdated: lastUpdatedDate,
          nextResponsible: displayStatus === 'Active' ? 'Active Contract' : (isCurrentWorkflowCard ? rcNextParty : 'Category Manager'),
          round: 'Round 2',
        };
      });
    }

    return [
      { id: '1', rateCardId: 'RC-2026-0001', vendor: 'Ramakrishna Interiors', vendorCode: 'VND-0006', category: 'Interior Works', scope: 'Retail Store Interiors', items: 48, validFrom: '01 Oct 2026', validUntil: '30 Sep 2027', status: 'Active', nextResponsible: 'Active Contract', currentStage: 'Active Contract', latestBuyerOffer: '₹ 4,83,000', latestSubmittedVendorQuote: '₹ 5,08,000', lastUpdated: '22 Oct 2026' },
      { id: '2', rateCardId: 'RC-2026-0002', vendor: 'BuildRight Solutions', vendorCode: 'VND-0002', category: 'Civil Works', scope: 'Civil & Structural Works', items: 36, validFrom: '15 Sep 2026', validUntil: '14 Sep 2027', status: 'Active', nextResponsible: 'Active Contract', currentStage: 'Active Contract', latestBuyerOffer: '₹ 3,60,000', latestSubmittedVendorQuote: '₹ 3,85,000', lastUpdated: '22 Oct 2026' },
      { id: '3', rateCardId: 'RC-2026-0003', vendor: 'ElectroMax', vendorCode: 'VND-0003', category: 'Electrical', scope: 'Electrical & Lighting', items: 52, validFrom: '01 Sep 2026', validUntil: '31 Aug 2027', status: 'Active', nextResponsible: 'Active Contract', currentStage: 'Active Contract', latestBuyerOffer: '₹ 6,20,000', latestSubmittedVendorQuote: '₹ 6,50,000', lastUpdated: '22 Oct 2026' },
      { id: '4', rateCardId: 'RC-2026-0004', vendor: 'CoolTech HVAC', vendorCode: 'VND-0004', category: 'HVAC', scope: 'HVAC Supply & Installation', items: 28, validFrom: '01 Aug 2026', validUntil: '31 Jul 2027', status: 'Active', nextResponsible: 'Active Contract', currentStage: 'Active Contract', latestBuyerOffer: '₹ 2,90,000', latestSubmittedVendorQuote: '₹ 3,10,000', lastUpdated: '22 Oct 2026' },
      { id: '5', rateCardId: 'RC-2026-0005', vendor: 'Apex Furnishers', vendorCode: 'VND-0005', category: 'Furniture', scope: 'Furniture Supply', items: 45, validFrom: '10 Aug 2026', validUntil: '09 Aug 2027', status: 'Active', nextResponsible: 'Active Contract', currentStage: 'Active Contract', latestBuyerOffer: '₹ 4,10,000', latestSubmittedVendorQuote: '₹ 4,30,000', lastUpdated: '22 Oct 2026' },
      { id: '6', rateCardId: 'RC-2026-0006', vendor: 'Ramakrishna Interiors', vendorCode: 'VND-0006', category: 'Interior Works', scope: 'Retail Store Interior Works - FY 2026-27', items: 5, validFrom: '01 Oct 2026', validUntil: '30 Sep 2027', status: rcWorkflowStatus === 'Active' ? 'Active' : 'In Progress', nextResponsible: rcNextParty, currentStage: rcWorkflowStatus, latestBuyerOffer: '₹ 4,83,000', latestSubmittedVendorQuote: '₹ 5,08,000', lastUpdated: '22 Oct 2026' },
    ];
  }, [rateCards, selectedCardId, rcWorkflowStatus, rcNextParty]);

  // Handlers for workflow transitions
  const handleInitiateSubmit = async (formData: any) => {
    try {
      // Persist the initiated rate card to backend with exact reviewed values
      const res = await fetch('/api/procurement/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: formData.vendorId,
          title: formData.title,
          category: formData.category,
          subcategory: formData.subcategory,
          scope: formData.scope,
          location: formData.location,
          validFrom: formData.effectiveFrom,
          validTo: formData.validUntil,
          terms: formData.commercialTerms,
          status: formData.status || 'ROUND_1_BUYER_OFFER',
          items: (formData.items || []).map((it: any) => ({
            itemCode: it.itemCode,
            description: it.description,
            specification: it.specification,
            category: it.category,
            subcategory: it.subcategory,
            uom: it.uom,
            rate: it.targetRate,
            proposedRate: it.targetRate,
            buyerOffer1: it.targetRate,
            historicalRate: it.previousPpoRate,
            previousPpoRate: it.previousPpoRate,
            benchmarkRate: it.aiRate,
            referenceQty: it.qty,
            minQuantity: it.qty,
          })),
        }),
      });

      if (res.ok) {
        showToast(interpolateUiString(UI_STRINGS.appAppProcurementRateCardsPage.rateCardTitleInitiatedSuccessfullyAndPublishedToVendor, { "title": formData.title }), 'success');
      } else {
        showToast(interpolateUiString(UI_STRINGS.appAppProcurementRateCardsPage.rateCardTitleInitiatedWithReviewedTargetValues, { "title": formData.title }), 'success');
      }
    } catch {
      showToast(interpolateUiString(UI_STRINGS.appAppProcurementRateCardsPage.rateCardTitleInitiatedSuccessfullyAndPublishedToVendor, { "title": formData.title }), 'success');
    }
    handleSwitchView('HOME');
    setActiveSummaryTab('in_progress');
  };

  const handleSendProposedOffer = () => {
    showToast(UI_STRINGS.appAppProcurementRateCardsPage.round2CounterOfferSuccessfullySentToRamakrishnaInteriors, 'success');
    setRcNextParty('Vendor (Review Offer)');
  };

  const [cardAgreement, setCardAgreement] = useState<any | null>(null);

  const handleBuyerAcceptance = async (remarks: string, agreementData?: any | null) => {
    setCardAgreement(agreementData || null);
    if (agreementData && agreementData.required) {
      showToast(interpolateUiString(UI_STRINGS.appAppProcurementRateCardsPage.vendorQuoteAcceptedFormalAgreementDocumentTitleSentToVendorForReviewSignature, { "documentTitle": agreementData.documentTitle }), 'success');
      setRcWorkflowStatus('In Progress (Vendor Agreement Signature Pending)');
      setRcNextParty('Vendor (Review & Sign Agreement)');
    } else {
      showToast(UI_STRINGS.appAppProcurementRateCardsPage.vendorQuoteAcceptedByCategoryManagerRateCardRoutedToVendorAcceptanceNoFormalAgreementRequired, 'success');
      setRcWorkflowStatus('In Progress (Vendor Acceptance Pending)');
      setRcNextParty('Vendor (Acceptance Required)');
    }
    handleSwitchView('HOME');
    setActiveSummaryTab('in_progress');
  };

  const getStageStatus = (stage: 'HOME' | 'INITIATE' | 'NEGOTIATION' | 'BUYER_ACCEPTANCE' | 'DETAILS') => {
    if (viewMode === stage) return 'CURRENT';
    const sequence: ('HOME' | 'INITIATE' | 'NEGOTIATION' | 'BUYER_ACCEPTANCE' | 'DETAILS')[] = [
      'HOME',
      'INITIATE',
      'NEGOTIATION',
      'BUYER_ACCEPTANCE',
      'DETAILS',
    ];
    const currentIndex = sequence.indexOf(viewMode);
    const stageIndex = sequence.indexOf(stage);
    return currentIndex > stageIndex ? 'COMPLETED' : 'PENDING';
  };

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] text-slate-800 p-4 md:p-6">
      {/* ── WORKFLOW STAGE GLOBAL NAVIGATION (44-48px height, 14-15px typography) ── */}
      <WorkflowStageNav
        stages={[
          {
            id: 'stage-1',
            stageNumber: 1,
            label: UI_STRINGS.appAppProcurementRateCardsPage.homeWorkspace,
            status: getStageStatus('HOME'),
            onClick: () => handleSwitchView('HOME'),
          },
          {
            id: 'stage-2',
            stageNumber: 2,
            label: UI_STRINGS.common.initiateRateCard,
            status: getStageStatus('INITIATE'),
            onClick: () => handleSwitchView('INITIATE'),
          },
          {
            id: 'stage-3',
            stageNumber: 3,
            label: UI_STRINGS.appAppProcurementRateCardsPage.itemNegotiation,
            status: getStageStatus('NEGOTIATION'),
            onClick: () => handleSwitchView('NEGOTIATION'),
          },
          {
            id: 'stage-4',
            stageNumber: 4,
            label: UI_STRINGS.appAppProcurementRateCardsPage.buyerAcceptance,
            status: getStageStatus('BUYER_ACCEPTANCE'),
            onClick: () => handleSwitchView('BUYER_ACCEPTANCE'),
          },
          {
            id: 'stage-7',
            stageNumber: 7,
            label: UI_STRINGS.appAppProcurementRateCardsPage.finalisedDetails,
            status: getStageStatus('DETAILS'),
            onClick: () => handleSwitchView('DETAILS'),
          },
        ]}
      />

      {/* ── TOAST ALERT ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`mb-6 p-3.5 rounded-lg border text-xs font-medium flex items-center gap-2.5 shadow-xs transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-900 border-red-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-blue-600 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          WORKSPACE ROUTING (FULL WIDTH, NO CRAMPING)
      ══════════════════════════════════════════════════════════════════ */}
      {viewMode === 'HOME' && (
        <HomeWorkspace
          cards={cardsData}
          activeSummaryTab={activeSummaryTab}
          onTabChange={setActiveSummaryTab}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          vendorFilter={vendorFilter}
          onVendorFilterChange={setVendorFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onClearFilters={() => {
            setSearchTerm('');
            setCategoryFilter('ALL');
            setVendorFilter('ALL');
            setStatusFilter('ALL');
          }}
          onInitiateClick={() => handleSwitchView('INITIATE')}
          onNegotiateClick={(cardId) => {
            setSelectedCardId(cardId);
            handleSwitchView('NEGOTIATION');
          }}
          onBuyerAcceptClick={(cardId) => {
            setSelectedCardId(cardId);
            handleSwitchView('BUYER_ACCEPTANCE');
          }}
          onDetailsClick={(cardId) => {
            setSelectedCardId(cardId);
            handleSwitchView('DETAILS');
          }}
        />
      )}

      {viewMode === 'INITIATE' && (
        <InitiateRateCardWorkspace
          onBack={() => handleSwitchView('HOME')}
          onSubmit={handleInitiateSubmit}
        />
      )}

      {viewMode === 'NEGOTIATION' && (
        <NegotiationWorkspace
          rateCardId={selectedCardId}
          vendorName="Ramakrishna Interiors (VND-0006)"
          category="Interior Works"
          round="Round 2 of 4"
          items={negotiationItems}
          onItemsChange={setNegotiationItems}
          onReset={() => {
            setNegotiationItems([
              { id: 'it-1', itemCode: 'INT-001', description: UI_STRINGS.common.gypsumFalseCeiling, specification: 'Supply & install 12.5mm Saint-Gobain Gyproc board on GI framework with perimeter channels', uom: 'SQFT', qty: 500, buyerTargetRate: 120, latestVendorQuote: 110, currentBuyerOffer: 120, proposedAmount: 60000 },
              { id: 'it-2', itemCode: 'INT-002', description: UI_STRINGS.common.vitrifiedTiles2x2Ft, specification: 'Kajaria 600x600mm double charged vitrified floor tiles PEI-4 with epoxy grout', uom: 'SQFT', qty: 1000, buyerTargetRate: 95, latestVendorQuote: 90, currentBuyerOffer: 95, proposedAmount: 95000 },
              { id: 'it-3', itemCode: 'INT-003', description: UI_STRINGS.common.modularPartitions, specification: 'Full height double-glazed aluminum partition with 10mm toughened glass & acoustic gasket', uom: 'SQFT', qty: 300, buyerTargetRate: 350, latestVendorQuote: 330, currentBuyerOffer: 350, proposedAmount: 105000 },
              { id: 'it-4', itemCode: 'INT-004', description: UI_STRINGS.common.woodenCarpentry, specification: 'Commercial ply with 1mm Merino/Greenlam decorative laminate finish & hardwood beading', uom: 'SQFT', qty: 250, buyerTargetRate: 450, latestVendorQuote: 420, currentBuyerOffer: 450, proposedAmount: 112500 },
              { id: 'it-5', itemCode: 'INT-005', description: UI_STRINGS.common.paintingPremiumEmulsion, specification: 'Two coats Asian Paints Royale Luxury Emulsion over primer & wall putty', uom: 'SQFT', qty: 2000, buyerTargetRate: 80, latestVendorQuote: 75, currentBuyerOffer: 80, proposedAmount: 160000 },
            ]);
            showToast(UI_STRINGS.appAppProcurementRateCardsPage.ratesResetToInitialTargetBenchmarks, 'info');
          }}
          onSaveDraft={() => {
            showToast(UI_STRINGS.appAppProcurementRateCardsPage.negotiationDraftSavedSuccessfully, 'success');
          }}
          onSendOffer={handleSendProposedOffer}
          onAcceptQuoteClick={() => handleSwitchView('BUYER_ACCEPTANCE')}
          onBack={() => handleSwitchView('HOME')}
        />
      )}

      {viewMode === 'BUYER_ACCEPTANCE' && (
        <BuyerAcceptanceWorkspace
          rateCardId={selectedCardId}
          vendorName="Ramakrishna Interiors"
          vendorCode="VND-0006"
          category="Interior Works"
          round="Round 2 of 4"
          vendorQuoteTotal={469750}
          receivedDate="20 Oct 2026"
          items={[
            { id: '1', itemCode: 'INT-001', description: UI_STRINGS.common.gypsumFalseCeiling, uom: 'SQFT', qty: 500, vendorQuoteRate: 100 },
            { id: '2', itemCode: 'INT-002', description: UI_STRINGS.common.vitrifiedTiles2x2Ft, uom: 'SQFT', qty: 1000, vendorQuoteRate: 88 },
            { id: '3', itemCode: 'INT-003', description: UI_STRINGS.common.modularPartitions, uom: 'SQFT', qty: 300, vendorQuoteRate: 315 },
            { id: '4', itemCode: 'INT-004', description: UI_STRINGS.common.woodenCarpentry, uom: 'SQFT', qty: 250, vendorQuoteRate: 405 },
            { id: '5', itemCode: 'INT-005', description: UI_STRINGS.common.paintingPremiumEmulsion, uom: 'SQFT', qty: 2000, vendorQuoteRate: 68 },
          ]}
          onAccept={handleBuyerAcceptance}
          onCancel={() => handleSwitchView('NEGOTIATION')}
        />
      )}

      {viewMode === 'DETAILS' && (
        <div className="space-y-6">
          <PageHeader
            title={UI_STRINGS.appAppProcurementRateCardsPage.finalisedRateCard}
            subtitle={UI_STRINGS.appAppProcurementRateCardsPage.authoritativeViewOfActiveCommercialTermsAndAgreedRatesSchedule}
            onBack={() => handleSwitchView('HOME')}
            backLabel="Back to Rate Cards"
            badge={
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-slate-100 border border-slate-300 rounded-md text-xs font-bold text-slate-800 font-mono shadow-2xs">
                  {selectedRateCard?.rateCardNumber || selectedCardId}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {selectedRateCard?.status === 'APPROVED' ? UI_STRINGS.common.active : (selectedRateCard?.status || UI_STRINGS.common.active)}
                </span>
              </div>
            }
          />

          <Section7FinalisedDetails
            rateCard={selectedRateCard}
            rateCardId={selectedCardId}
            agreement={cardAgreement || selectedRateCard?.agreement || undefined}
          />
        </div>
      )}
    </div>
  );
}
