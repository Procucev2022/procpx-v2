'use client';
// src/app/(app)/procurement/rate-cards/page.tsx
// Corrected Rate Card Management Architecture: Focused, full-width workflow workspaces
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import HomeWorkspace, { RateCardRow } from '@/components/rate-cards/HomeWorkspace';
import InitiateRateCardWorkspace from '@/components/rate-cards/InitiateRateCardWorkspace';
import NegotiationWorkspace, { NegotiationItem } from '@/components/rate-cards/NegotiationWorkspace';
import BuyerAcceptanceWorkspace from '@/components/rate-cards/BuyerAcceptanceWorkspace';
import Section7FinalisedDetails from '@/components/rate-cards/Section7FinalisedDetails';
import PageHeader from '@/components/ui/PageHeader';
import WorkflowStageNav from '@/components/ui/WorkflowStageNav';
import type { RateCardPageItem, RateCardPageRecord, ViewMode } from "@app-types/app/(app)/procurement/rate-cards/page.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { DEFAULT_RATE_CARD_LIST_PAGE_SIZE } from '@/app/api/procurement/rate-cards/route.constants';

export type { ViewMode };

function rateCardItemMeta(item: RateCardPageItem): Record<string, unknown> {
  if (!item?.comparisonRef) return {};
  try {
    const parsed: unknown = typeof item.comparisonRef === 'string' ? JSON.parse(item.comparisonRef) : item.comparisonRef;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toNegotiationItems(rateCard: RateCardPageRecord | null | undefined): NegotiationItem[] {
  return (rateCard?.items || []).map((item) => {
    const meta = rateCardItemMeta(item);
    const quantity = Number(item.referenceQty ?? item.minQuantity ?? 1);
    const buyerTargetRate = Number(item.buyerOffer1 ?? meta.buyerOffer1 ?? item.benchmarkRate ?? item.rate ?? 0);
    const latestVendorQuote = Number(item.vendorQuote2 ?? meta.vendorQuote2 ?? item.vendorQuote1 ?? meta.vendorQuote1 ?? item.proposedRate ?? item.rate ?? 0);
    const currentBuyerOffer = Number(item.buyerOffer2 ?? meta.buyerOffer2 ?? item.buyerOffer1 ?? meta.buyerOffer1 ?? item.rate ?? 0);
    return {
      id: item.id,
      itemCode: item.itemCode || '',
      description: item.description || '',
      specification: item.specification || '',
      uom: item.uom || '',
      qty: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      buyerTargetRate: Number.isFinite(buyerTargetRate) ? buyerTargetRate : 0,
      latestVendorQuote: Number.isFinite(latestVendorQuote) ? latestVendorQuote : 0,
      currentBuyerOffer: Number.isFinite(currentBuyerOffer) ? currentBuyerOffer : 0,
      proposedAmount: quantity * currentBuyerOffer,
    };
  });
}


export default function RateCardManagementPage() {
  // Current active full-width workspace
  const [viewMode, setViewMode] = useState<ViewMode>('HOME');

  // Master rate cards state
  const [rateCards, setRateCards] = useState<RateCardPageRecord[]>([]);
  const [loadingMoreRateCards, setLoadingMoreRateCards] = useState(false);
  const rateCardPageRef = useRef(1);
  const [hasMoreRateCards, setHasMoreRateCards] = useState(false);
  const [rateCardSummary, setRateCardSummary] = useState({ finalised: 0, inProgress: 0 });
  const [selectedRateCardDetails, setSelectedRateCardDetails] = useState<RateCardPageRecord | null>(null);
  const [activeSummaryTab, setActiveSummaryTab] = useState<'finalised' | 'in_progress'>('finalised');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Active workflow card ID
  const [selectedCardId, setSelectedCardId] = useState<string>('');

  // Feedback toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Negotiation items state for RC-2026-0006
  const [negotiationItems, setNegotiationItems] = useState<NegotiationItem[]>([]);
  const rateCardsRef = useRef(rateCards);
  const selectedRateCardDetailsRef = useRef(selectedRateCardDetails);
  const loadingRateCardDetailsRef = useRef(false);

  useEffect(() => {
    rateCardsRef.current = rateCards;
    selectedRateCardDetailsRef.current = selectedRateCardDetails;
  }, [rateCards, selectedRateCardDetails]);

  const fetchRateCards = useCallback(async (append = false) => {
    const page = append ? rateCardPageRef.current + 1 : 1;
    if (append) setLoadingMoreRateCards(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(DEFAULT_RATE_CARD_LIST_PAGE_SIZE) });
      const res = await fetch(`/api/procurement/rate-cards?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToFetchRateCards);
      const incoming: RateCardPageRecord[] = Array.isArray(data.rateCards) ? data.rateCards : [];
      setRateCards((current) => {
        if (!append) return incoming;
        const byId = new Map(current.map((rateCard) => [rateCard.id, rateCard]));
        incoming.forEach((rateCard: RateCardPageRecord) => byId.set(rateCard.id, rateCard));
        return Array.from(byId.values());
      });
      rateCardPageRef.current = page;
      setHasMoreRateCards(Boolean(data.hasMore));
      if (data.summary) setRateCardSummary(data.summary);
      return true;
    } catch (e) {
      console.error('Error fetching rate cards:', e);
      return false;
    } finally {
      if (append) setLoadingMoreRateCards(false);
    }
  }, []);

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const handleSwitchView = useCallback((newMode: ViewMode, databaseId?: string) => {
    setViewMode(newMode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newMode === 'HOME') {
        url.searchParams.delete('view');
        url.searchParams.delete('id');
      } else {
        url.searchParams.set('view', newMode.toLowerCase());
        if (databaseId) url.searchParams.set('id', databaseId);
      }
      window.history.replaceState({}, '', url.toString());
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openCardWorkspace = useCallback(async (cardIdentifier: string, target: Exclude<ViewMode, 'HOME' | 'INITIATE'>) => {
    if (!cardIdentifier || loadingRateCardDetailsRef.current) return;
    const listCard = rateCardsRef.current.find((card) => card.id === cardIdentifier || card.rateCardNumber === cardIdentifier);
    const selectedDetail = selectedRateCardDetailsRef.current;
    const databaseId = listCard?.id || (selectedDetail?.id === cardIdentifier ? selectedDetail.id : cardIdentifier);
    loadingRateCardDetailsRef.current = true;
    try {
      const res = await fetch(`/api/procurement/rate-cards/${databaseId}`);
      const data = await res.json();
      if (!res.ok || !data.rateCard) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToFetchRateCards);
      selectedRateCardDetailsRef.current = data.rateCard;
      setSelectedRateCardDetails(data.rateCard);
      setSelectedCardId(data.rateCard.rateCardNumber || data.rateCard.id);
      setNegotiationItems(toNegotiationItems(data.rateCard));
      handleSwitchView(target, data.rateCard.id);
    } catch (error) {
      console.error('Error fetching rate card detail:', error);
      showToast(error instanceof Error ? error.message : UI_STRINGS.common.userMessages.failedToFetchRateCards, 'error');
    } finally {
      loadingRateCardDetailsRef.current = false;
    }
  }, [handleSwitchView, showToast]);

  const openSelectedCardWorkspace = (target: Exclude<ViewMode, 'HOME' | 'INITIATE'>) => {
    if (!selectedCardId || !selectedRateCardDetails?.id) {
      showToast(UI_STRINGS.common.rateCardNotFound, 'info');
      return;
    }
    setNegotiationItems(toNegotiationItems(selectedRateCardDetails));
    handleSwitchView(target, selectedRateCardDetails.id);
  };

  useEffect(() => {
    void fetchRateCards();
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view')?.toUpperCase();
    const databaseId = params.get('id');
    if (viewParam === 'INITIATE') setViewMode('INITIATE');
    else if (databaseId && (viewParam === 'NEGOTIATION' || viewParam === 'NEGOTIATE')) void openCardWorkspace(databaseId, 'NEGOTIATION');
    else if (databaseId && (viewParam === 'BUYER_ACCEPTANCE' || viewParam === 'BUYER-ACCEPTANCE')) void openCardWorkspace(databaseId, 'BUYER_ACCEPTANCE');
    else if (databaseId && viewParam === 'DETAILS') void openCardWorkspace(databaseId, 'DETAILS');
    else setViewMode('HOME');
  }, [fetchRateCards, openCardWorkspace]);

  // Active rate card object from persisted DB rate cards
  const selectedRateCard = useMemo(() => {
    if (selectedRateCardDetails && (selectedRateCardDetails.rateCardNumber === selectedCardId || selectedRateCardDetails.id === selectedCardId)) {
      return selectedRateCardDetails;
    }
    return rateCards.find((rc) => rc.rateCardNumber === selectedCardId || rc.id === selectedCardId);
  }, [rateCards, selectedCardId, selectedRateCardDetails]);

  // Real persisted database rate cards merged with workflow state
  const cardsData: RateCardRow[] = useMemo(() => {
    return rateCards.map((rc) => {
        const status = typeof rc.status === 'string' ? rc.status : 'DRAFT';
        const isActive = status === 'APPROVED';
        const fromDate = rc.validFrom
          ? new Date(rc.validFrom).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';
        const toDate = rc.validTo
          ? new Date(rc.validTo).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';

        const displayStatus: RateCardRow['status'] = isActive ? 'Active' : 'In Progress';

        const buyerOfferFromItems = (rc.items || []).reduce((sum, it) => {
          const offer = Number(it.buyerOffer2 ?? it.buyerOffer1 ?? it.rate ?? 0);
          const qty = Number(it.referenceQty ?? it.qty ?? 1);
          return sum + (offer * qty);
        }, 0);

        const vendorQuoteFromItems = (rc.items || []).reduce((sum, it) => {
          const quote = Number(it.vendorQuote2 ?? it.vendorQuote1 ?? it.proposedRate ?? 0);
          const qty = Number(it.referenceQty ?? it.qty ?? 1);
          return sum + (quote * qty);
        }, 0);
        const totalBuyerOffer = Number(rc.totalBuyerOffer ?? buyerOfferFromItems);
        const totalVendorQuote = Number(rc.totalVendorQuote ?? vendorQuoteFromItems);

        const stageText = status === 'ROUND_2_NEGOTIATION'
          ? 'Round 2 Negotiation'
          : status === 'ROUND_1_BUYER_OFFER'
          ? 'Round 1 Offer'
          : status === 'BUYER_ACCEPTED'
          ? 'Buyer Accepted'
          : status === 'PENDING_APPROVAL'
          ? 'Pending Approval'
          : status === 'APPROVED'
          ? 'Approved'
          : status.replace(/_/g, ' ');

        const lastUpdatedDate = rc.updatedAt
          ? new Date(rc.updatedAt).toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';

        return {
          id: rc.id,
          rateCardId: rc.rateCardNumber || rc.id,
          vendor: rc.vendor?.name || '',
          vendorCode: rc.vendor?.code || '',
          category: rc.category || '',
          scope: rc.scope || rc.title || '',
          items: rc.items?.length || rc.itemCount || 0,
          validFrom: fromDate,
          validUntil: toDate,
          status: displayStatus,
          detailedStatus: status,
          currentStage: stageText,
          latestBuyerOffer: `₹ ${totalBuyerOffer.toLocaleString(I18N_CONFIG.defaultLocale)}`,
          latestSubmittedVendorQuote: `₹ ${totalVendorQuote.toLocaleString(I18N_CONFIG.defaultLocale)}`,
          latestVendorQuote: `₹ ${totalVendorQuote.toLocaleString(I18N_CONFIG.defaultLocale)}`,
          lastUpdated: lastUpdatedDate,
          nextResponsible: displayStatus === 'Active' ? 'Active Contract' : status.startsWith('ROUND_') ? 'Vendor / Buyer' : 'Category Manager',
          round: status.includes('ROUND_2') ? 'Round 2' : 'Round 1',
        };
      });
  }, [rateCards]);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToCreateRateCard);
      showToast(interpolateUiString(UI_STRINGS.appAppProcurementRateCardsPage.rateCardTitleInitiatedSuccessfullyAndPublishedToVendor, { title: formData.title }), 'success');
      await fetchRateCards();
      handleSwitchView('HOME');
      setActiveSummaryTab('in_progress');
    } catch (error) {
      console.error('Error creating rate card:', error);
      showToast(error instanceof Error ? error.message : UI_STRINGS.common.userMessages.failedToCreateRateCard, 'error');
    }
  };

  const handleSaveNegotiationDraft = async () => {
    if (!selectedRateCardDetails?.id || negotiationItems.length === 0) {
      showToast(UI_STRINGS.common.rateCardNotFound, 'error');
      return;
    }
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedRateCardDetails.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_BUYER_OFFER_2_DRAFT', remarks: '', items: negotiationItems.map((item) => ({ id: item.id, buyerOffer2: item.currentBuyerOffer })) }),
      });
      const data = await res.json();
      if (!res.ok || !data.rateCard) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToUpdateRateCard);
      setSelectedRateCardDetails(data.rateCard);
      setNegotiationItems(toNegotiationItems(data.rateCard));
      await fetchRateCards();
      showToast(UI_STRINGS.appAppProcurementRateCardsPage.negotiationDraftSavedSuccessfully, 'success');
    } catch (error) {
      console.error('Error saving rate-card negotiation draft:', error);
      showToast(error instanceof Error ? error.message : UI_STRINGS.common.userMessages.failedToUpdateRateCard, 'error');
    }
  };

  const handleSendProposedOffer = async () => {
    if (!selectedRateCardDetails?.id || negotiationItems.length === 0) {
      showToast(UI_STRINGS.common.rateCardNotFound, 'error');
      return;
    }
    try {
      const res = await fetch(`/api/procurement/rate-cards/${selectedRateCardDetails.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SUBMIT_BUYER_OFFER_2', remarks: '', items: negotiationItems.map((item) => ({ id: item.id, buyerOffer2: item.currentBuyerOffer })) }),
      });
      const data = await res.json();
      if (!res.ok || !data.rateCard) throw new Error(data.error || UI_STRINGS.common.userMessages.failedToUpdateRateCard);
      setSelectedRateCardDetails(data.rateCard);
      await fetchRateCards();
      showToast(data.message || UI_STRINGS.appAppProcurementRateCardsPage.round2CounterOfferSuccessfullySentToRamakrishnaInteriors, 'success');
      handleSwitchView('HOME');
      setActiveSummaryTab('in_progress');
    } catch (error) {
      console.error('Error submitting rate-card buyer offer:', error);
      showToast(error instanceof Error ? error.message : UI_STRINGS.common.userMessages.failedToUpdateRateCard, 'error');
    }
  };

  const handleBuyerAcceptance = async (remarks: string, agreementData?: any | null) => {
    if (!selectedRateCardDetails?.id) {
      showToast(UI_STRINGS.common.rateCardNotFound, 'error');
      return;
    }
    try {
      let card = selectedRateCardDetails;
      const cardStatus = card.status || '';
      if (['ROUND_1_VENDOR_QUOTE', 'ROUND_2_VENDOR_QUOTE'].includes(cardStatus)) {
        const totalAgreedValue = (card.items || []).reduce((total, item) => {
          const quantity = Number(item.referenceQty ?? item.minQuantity ?? 1);
          const rate = Number(item.vendorQuote2 ?? item.vendorQuote1 ?? item.proposedRate ?? item.rate ?? 0);
          return total + (Number.isFinite(quantity) ? quantity : 1) * (Number.isFinite(rate) ? rate : 0);
        }, 0);
        const finalOfferResponse = await fetch(`/api/procurement/rate-cards/${card.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ACCEPT_FINAL_VENDOR_OFFER', roundNumber: cardStatus === 'ROUND_2_VENDOR_QUOTE' ? 2 : 1, totalAgreedValue, remarks }),
        });
        const finalOfferData = await finalOfferResponse.json();
        if (!finalOfferResponse.ok || !finalOfferData.rateCard) throw new Error(finalOfferData.error || UI_STRINGS.common.userMessages.failedToUpdateRateCard);
        card = finalOfferData.rateCard;
      }

      const acceptanceResponse = await fetch(`/api/procurement/rate-cards/${card.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CATEGORY_MANAGER_ACCEPT', agreement: agreementData || null, remarks }),
      });
      const acceptanceData = await acceptanceResponse.json();
      if (!acceptanceResponse.ok || !acceptanceData.rateCard) throw new Error(acceptanceData.error || UI_STRINGS.common.userMessages.failedToUpdateRateCard);
      setSelectedRateCardDetails(acceptanceData.rateCard);
      await fetchRateCards();
      showToast(agreementData?.required
        ? interpolateUiString(UI_STRINGS.appAppProcurementRateCardsPage.vendorQuoteAcceptedFormalAgreementDocumentTitleSentToVendorForReviewSignature, { documentTitle: agreementData.documentTitle })
        : UI_STRINGS.appAppProcurementRateCardsPage.vendorQuoteAcceptedByCategoryManagerRateCardRoutedToVendorAcceptanceNoFormalAgreementRequired, 'success');
      handleSwitchView('HOME');
      setActiveSummaryTab('in_progress');
    } catch (error) {
      console.error('Error accepting rate-card offer:', error);
      showToast(error instanceof Error ? error.message : UI_STRINGS.common.userMessages.failedToUpdateRateCard, 'error');
    }
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
            onClick: () => openSelectedCardWorkspace('NEGOTIATION'),
          },
          {
            id: 'stage-4',
            stageNumber: 4,
            label: UI_STRINGS.appAppProcurementRateCardsPage.buyerAcceptance,
            status: getStageStatus('BUYER_ACCEPTANCE'),
            onClick: () => openSelectedCardWorkspace('BUYER_ACCEPTANCE'),
          },
          {
            id: 'stage-7',
            stageNumber: 7,
            label: UI_STRINGS.appAppProcurementRateCardsPage.finalisedDetails,
            status: getStageStatus('DETAILS'),
            onClick: () => openSelectedCardWorkspace('DETAILS'),
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
          onNegotiateClick={(cardId) => { void openCardWorkspace(cardId, 'NEGOTIATION'); }}
          onBuyerAcceptClick={(cardId) => { void openCardWorkspace(cardId, 'BUYER_ACCEPTANCE'); }}
          onDetailsClick={(cardId) => { void openCardWorkspace(cardId, 'DETAILS'); }}
          hasMoreData={hasMoreRateCards}
          loadingMoreData={loadingMoreRateCards}
          onLoadMore={() => { void fetchRateCards(true); }}
          serverSummary={rateCardSummary}
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
          vendorName={selectedRateCard?.vendor?.name || ''}
          category={selectedRateCard?.category || ''}
          round={selectedRateCard?.status?.includes('ROUND_2') ? 'Round 2' : 'Round 1'}
          items={negotiationItems}
          onItemsChange={setNegotiationItems}
          onReset={() => setNegotiationItems(toNegotiationItems(selectedRateCardDetails))}
          onSaveDraft={handleSaveNegotiationDraft}
          onSendOffer={handleSendProposedOffer}
          onAcceptQuoteClick={() => openSelectedCardWorkspace('BUYER_ACCEPTANCE')}
          onBack={() => handleSwitchView('HOME')}
        />
      )}

      {viewMode === 'BUYER_ACCEPTANCE' && (
        <BuyerAcceptanceWorkspace
          rateCardId={selectedCardId}
          vendorName={selectedRateCard?.vendor?.name || ''}
          vendorCode={selectedRateCard?.vendor?.code || ''}
          category={selectedRateCard?.category || ''}
          round={selectedRateCard?.status?.includes('ROUND_2') ? 'Round 2' : 'Round 1'}
          vendorQuoteTotal={negotiationItems.reduce((total, item) => total + item.qty * item.latestVendorQuote, 0)}
          receivedDate={selectedRateCard?.updatedAt ? new Date(selectedRateCard.updatedAt).toLocaleDateString(I18N_CONFIG.defaultLocale) : ''}
          items={negotiationItems.map((item) => ({
            id: item.id, itemCode: item.itemCode, description: item.description, specification: item.specification,
            uom: item.uom, qty: item.qty, vendorQuoteRate: item.latestVendorQuote,
          }))}
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
            agreement={selectedRateCard?.agreement || undefined}
          />
        </div>
      )}
    </div>
  );
}
