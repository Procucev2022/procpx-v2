'use client';
// src/components/ProcurementCommercialWorkspace.tsx
// proCPX Final Approved RFQ Negotiation & Commercial Workspace for Category Managers
// Features:
// 1. Vendor Comparison — Total Quote Amount (All Invited Vendors, dynamic L1/L2, savings footer)
// 2. Item-Level Quotation Comparison & Buyer Offer (Grouped vendor columns, line-item rates)
// 3. Bottom Dispatch Controls directly below Buyer Offer column (Save as Draft, Reset, Selected Vendors, All Eligible Vendors)
// 4. White/light-grey background, dark navy text, primary blue accent, green for savings/L1, muted amber for partial quotes

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Info,
  Send,
  Save,
  RotateCcw,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  MessageSquare,
  Check,
  X,
  Users,
  History,
  TrendingDown,
  Tag,
  ChevronDown,
  Scale,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';

export interface ProcurementCommercialWorkspaceProps {
  rfq: any;
  comparison: any;
  rateCardMatch: any;
  isDemoMode: boolean;
  onRecordQuote: () => void;
  onOpenRateCards: () => void;
  onReleaseRfq?: () => void;
  onNegotiationSubmitted?: () => void;
  actionLoading?: boolean;
}

export default function ProcurementCommercialWorkspace({
  rfq,
  comparison,
  rateCardMatch,
  isDemoMode,
  onRecordQuote,
  onOpenRateCards,
  onReleaseRfq,
  onNegotiationSubmitted,
  actionLoading = false,
}: ProcurementCommercialWorkspaceProps) {
  const toast = useToast();

  // All RFQ lines
  const allLines: any[] = useMemo(() => rfq.lines || [], [rfq.lines]);
  const totalRfqLines = allLines.length;

  // Selected vendor IDs for offer dispatch (from Table 1 checkboxes)
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);

  // Default target vendor ID for line-item placeholder/baseline reference
  const defaultTargetVendorId = useMemo(() => {
    if (comparison?.vendors?.length > 0) {
      return comparison.vendors[0].vendorId;
    }
    const vendorWithQuote = rfq.quotes?.[0]?.vendorId;
    if (vendorWithQuote) return vendorWithQuote;
    return rfq.invitedVendors?.[0]?.vendorId || '';
  }, [comparison, rfq]);

  const [selectedTargetVendorId, setSelectedTargetVendorId] = useState<string>(defaultTargetVendorId);

  useEffect(() => {
    if (defaultTargetVendorId && !selectedTargetVendorId) {
      setSelectedTargetVendorId(defaultTargetVendorId);
    }
  }, [defaultTargetVendorId, selectedTargetVendorId]);

  // Line-by-line counteroffer unit rates: { [rfqLineId]: unitRate }
  const [lineCounterRates, setLineCounterRates] = useState<Record<string, number>>({});
  const [negDeadline, setNegDeadline] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
  );
  const [negNotes, setNegNotes] = useState('');
  const [draftSavedTimestamp, setDraftSavedTimestamp] = useState<string | null>(null);

  // Multi-line selection checkboxes (for batch discounts)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const allLinesSelected = allLines.length > 0 && selectedLineIds.length === allLines.length;

  const toggleSelectAllLines = () => {
    if (allLinesSelected) {
      setSelectedLineIds([]);
    } else {
      setSelectedLineIds(allLines.map((l: any) => l.id));
    }
  };

  const toggleSelectLine = (id: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleApplyBatchDiscount = (discountPercent: number) => {
    if (selectedLineIds.length === 0) return;
    const factor = (100 - discountPercent) / 100;
    setLineCounterRates((prev) => {
      const next = { ...prev };
      selectedLineIds.forEach((lineId) => {
        const line = allLines.find((l: any) => l.id === lineId);
        const activeQuote = rfq.quotes
          ?.find((q: any) => q.vendorId === selectedTargetVendorId)
          ?.lines?.find((l: any) => l.rfqLineId === lineId);
        const baseRate = activeQuote?.unitRate || line?.benchmarkRate || 0;
        if (baseRate > 0) {
          next[lineId] = Math.round(baseRate * factor);
        }
      });
      return next;
    });
  };

  // Local storage draft key
  const draftStorageKey = `procpx_cm_counteroffer_draft_${rfq.id}`;

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rates && typeof parsed.rates === 'object') {
          setLineCounterRates(parsed.rates);
          if (parsed.notes) setNegNotes(parsed.notes);
          if (parsed.deadline) setNegDeadline(parsed.deadline);
          if (parsed.timestamp) setDraftSavedTimestamp(parsed.timestamp);
        }
      }
    } catch {
      // ignore
    }
  }, [draftStorageKey]);

  // Save Draft to localStorage
  const handleSaveDraft = () => {
    try {
      const payload = {
        rates: lineCounterRates,
        notes: negNotes,
        deadline: negDeadline,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      setDraftSavedTimestamp(payload.timestamp);
      toast.success('Draft counteroffer rates saved locally.');
    } catch (e) {
      console.error('Failed to save draft:', e);
      toast.error('Failed to save draft rates.');
    }
  };

  // Reset / Clear counter rates
  const handleResetRates = () => {
    setLineCounterRates({});
    setSelectedLineIds([]);
    localStorage.removeItem(draftStorageKey);
    setDraftSavedTimestamp(null);
  };

  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const modifiedLinesCount = useMemo(() => {
    return Object.values(lineCounterRates).filter((r) => r > 0).length;
  }, [lineCounterRates]);

  const handleRequestReset = () => {
    if (modifiedLinesCount > 0) {
      setShowResetModal(true);
    } else {
      handleResetRates();
    }
  };

  // AI Benchmark total
  const aiBenchmarkTotal = Number(rfq.estimatedBenchmarkValue || comparison?.summary?.totalBenchmark || 0);

  // All negotiation rounds
  const allNegotiationRounds = useMemo(() => {
    return (rfq.negotiations || []).flatMap((n: any) => n.rounds || []);
  }, [rfq.negotiations]);

  // =========================================================================
  // 1. VENDOR COMPARISON (TABLE 1) DATA MAPPING & DYNAMIC RANKING
  // =========================================================================
  const invitedVendorsComparison = useMemo(() => {
    const invited: any[] = rfq.invitedVendors || [];
    const quotes: any[] = rfq.quotes || [];

    const mapped = invited.map((iv: any) => {
      const vId = iv.vendorId;
      const vName = iv.vendor?.name || 'Vendor';
      const vCode = iv.vendor?.code || '';

      const vQuotes = quotes
        .filter((q: any) => q.vendorId === vId)
        .sort((a: any, b: any) => a.quoteVersion - b.quoteVersion);

      const quote1 = vQuotes.find((q: any) => q.quoteVersion === 1) || (vQuotes.length > 0 ? vQuotes[0] : null);
      const initialQuoteTotal = quote1?.totalQuoteAmount || null;

      const latestQuote = vQuotes.length > 0 ? vQuotes[vQuotes.length - 1] : null;

      const vRounds = allNegotiationRounds
        .filter((r: any) => r.vendorId === vId)
        .sort((a: any, b: any) => (b.roundNumber || 0) - (a.roundNumber || 0));

      const submittedRevisionRound = vRounds.find(
        (r: any) =>
          r.revisedQuoteAmount &&
          r.revisedQuoteAmount > 0 &&
          (r.status === 'REVISED_SUBMITTED' || r.status === 'FINAL_OFFER_SUBMITTED') &&
          (r.nextResponsibleParty === 'BUYER' || r.buyerDecision !== null)
      );

      let latestSubmittedQuoteTotal: number | null = null;
      let quoteType: 'REVISED' | 'INITIAL' | 'NONE' = 'NONE';

      if (submittedRevisionRound?.revisedQuoteAmount) {
        latestSubmittedQuoteTotal = submittedRevisionRound.revisedQuoteAmount;
        quoteType = 'REVISED';
      } else if (latestQuote?.totalQuoteAmount) {
        latestSubmittedQuoteTotal = latestQuote.totalQuoteAmount;
        quoteType = latestQuote.quoteVersion > 1 ? 'REVISED' : 'INITIAL';
      }

      // Quoted lines count
      let quotedCount = 0;
      if (latestQuote?.lines && latestQuote.lines.length > 0) {
        quotedCount = latestQuote.lines.filter((l: any) => l.unitRate > 0).length;
      } else {
        (comparison?.lines || []).forEach((cl: any) => {
          if (cl.vendorQuotes?.[vId]?.quoted) {
            quotedCount++;
          }
        });
      }

      // Quote status calculation
      let quoteStatus: 'COMPLETE' | 'PARTIAL' | 'NO_QUOTE' = 'NO_QUOTE';
      let quoteStatusLabel = 'No Quote';

      if (vQuotes.length === 0) {
        quoteStatus = 'NO_QUOTE';
        quoteStatusLabel = 'No Quote';
      } else if (totalRfqLines > 0 && quotedCount >= totalRfqLines) {
        quoteStatus = 'COMPLETE';
        quoteStatusLabel = 'Complete Quote';
      } else {
        quoteStatus = 'PARTIAL';
        quoteStatusLabel = `Partial Quote (${quotedCount}/${totalRfqLines} items)`;
      }

      // Variance vs AI Benchmark (only valid and comparable when quote is Complete)
      const isComparable = quoteStatus === 'COMPLETE' && latestSubmittedQuoteTotal !== null && latestSubmittedQuoteTotal > 0 && aiBenchmarkTotal > 0;
      let varianceAmount: number | null = null;
      let variancePercent: number | null = null;

      if (isComparable && latestSubmittedQuoteTotal !== null) {
        varianceAmount = latestSubmittedQuoteTotal - aiBenchmarkTotal;
        variancePercent = Math.round(((latestSubmittedQuoteTotal - aiBenchmarkTotal) / aiBenchmarkTotal) * 1000) / 10;
      }

      // Pending buyer offer
      const pendingBuyerOffer = vRounds.find(
        (r: any) =>
          r.status !== 'SUPERSEDED' &&
          r.counterOfferAmount &&
          (!r.revisedQuoteAmount || r.nextResponsibleParty === 'VENDOR')
      );

      // Eligibility: Quote 1 received and fewer than 4 offers
      const activeBuyerOffers = vRounds.filter(
        (r: any) =>
          r.status !== 'SUPERSEDED' &&
          (r.counterOfferAmount !== null || (!r.revisedQuoteAmount && r.nextResponsibleParty === 'VENDOR'))
      );
      const isEligible = vQuotes.length > 0 && activeBuyerOffers.length < 4;

      return {
        vendorId: vId,
        vendorName: vName,
        vendorCode: vCode,
        quoteStatus,
        quoteStatusLabel,
        quotedCount,
        totalRfqLines,
        initialQuoteTotal,
        latestSubmittedQuoteTotal,
        quoteType,
        isComparable,
        varianceAmount,
        variancePercent,
        isEligible,
        pendingBuyerOffer,
        rounds: vRounds,
      };
    });

    // Dynamic Ranking computation: Exclude incomplete and unsubmitted quotes from rankings
    const completeVendors = mapped.filter(
      (m) => m.quoteStatus === 'COMPLETE' && m.latestSubmittedQuoteTotal !== null && m.latestSubmittedQuoteTotal > 0
    );
    completeVendors.sort((a, b) => (a.latestSubmittedQuoteTotal || 0) - (b.latestSubmittedQuoteTotal || 0));

    let currentRank = 1;
    const rankMap: Record<string, number> = {};
    completeVendors.forEach((v, idx) => {
      if (idx > 0 && (v.latestSubmittedQuoteTotal || 0) > (completeVendors[idx - 1].latestSubmittedQuoteTotal || 0)) {
        currentRank = idx + 1;
      }
      rankMap[v.vendorId] = currentRank;
    });

    return mapped.map((m) => ({
      ...m,
      rank: rankMap[m.vendorId] || null,
    }));
  }, [rfq.invitedVendors, rfq.quotes, totalRfqLines, aiBenchmarkTotal, allNegotiationRounds, comparison?.lines]);

  // L1 vendor (Lowest complete quote)
  const l1Vendor = useMemo(() => {
    return invitedVendorsComparison.find((v) => v.rank === 1);
  }, [invitedVendorsComparison]);

  const lowestCompleteQuote = l1Vendor?.latestSubmittedQuoteTotal || 0;

  // Potential savings vs AI benchmark
  const potentialSavings = useMemo(() => {
    if (aiBenchmarkTotal > 0 && lowestCompleteQuote > 0) {
      return aiBenchmarkTotal - lowestCompleteQuote;
    }
    return 0;
  }, [aiBenchmarkTotal, lowestCompleteQuote]);

  const potentialSavingsPercent = useMemo(() => {
    if (aiBenchmarkTotal > 0 && potentialSavings !== 0) {
      return Number(((potentialSavings / aiBenchmarkTotal) * 100).toFixed(2));
    }
    return 0;
  }, [aiBenchmarkTotal, potentialSavings]);

  // Eligible vendors count for bulk dispatch
  const eligibleVendors = useMemo(() => {
    return invitedVendorsComparison.filter((v) => v.isEligible);
  }, [invitedVendorsComparison]);

  // Calculate Buyer Offer Package Total
  const proposedCounterTotal = useMemo(() => {
    let sum = 0;
    allLines.forEach((line: any) => {
      const customRate = lineCounterRates[line.id];
      if (customRate !== undefined && customRate > 0) {
        sum += customRate * line.quantity;
      } else {
        // Fallback to active target vendor quote rate or line benchmark rate
        const qLine = rfq.quotes
          ?.find((q: any) => q.vendorId === selectedTargetVendorId)
          ?.lines?.find((l: any) => l.rfqLineId === line.id);
        if (qLine && qLine.unitRate > 0) {
          sum += qLine.unitRate * line.quantity;
        } else {
          sum += (line.benchmarkRate || 0) * line.quantity;
        }
      }
    });
    return sum;
  }, [allLines, rfq.quotes, lineCounterRates, selectedTargetVendorId]);

  // Table 2 minimum width for horizontal scroll
  const tableMinWidth = useMemo(() => {
    const vendorCount = invitedVendorsComparison.length || 1;
    // 36 (cb) + 45 (s.no) + 100 (item code) + 220 (item desc) + 220 (boq desc) + 60 (uom) + 84 (qty) + 120 (ai benchmark) + 160 (buyer rate) = 1045px
    // Vendor grouped columns: 220px per vendor (Rate 100px + Amount 120px)
    return Math.max(1300, 1045 + vendorCount * 220);
  }, [invitedVendorsComparison]);

  // Selection toggle for Table 1 and Dropdown vendors
  const allVendorsSelected =
    invitedVendorsComparison.length > 0 &&
    selectedVendorIds.length === invitedVendorsComparison.length;

  const toggleSelectAllVendors = () => {
    if (allVendorsSelected) {
      setSelectedVendorIds([]);
    } else {
      setSelectedVendorIds(invitedVendorsComparison.map((v) => v.vendorId));
    }
  };

  const toggleSelectVendor = (vendorId: string) => {
    setSelectedVendorIds((prev) =>
      prev.includes(vendorId) ? prev.filter((id) => id !== vendorId) : [...prev, vendorId]
    );
  };

  // Eligible vendors selection
  const allEligibleSelected =
    eligibleVendors.length > 0 &&
    eligibleVendors.every((v) => selectedVendorIds.includes(v.vendorId));

  const toggleAllEligible = () => {
    if (allEligibleSelected) {
      setSelectedVendorIds([]);
    } else {
      setSelectedVendorIds(eligibleVendors.map((v) => v.vendorId));
    }
  };

  const hasInitializedSelection = React.useRef(false);
  useEffect(() => {
    if (!hasInitializedSelection.current && eligibleVendors.length > 0) {
      setSelectedVendorIds(eligibleVendors.map((v) => v.vendorId));
      hasInitializedSelection.current = true;
    }
  }, [eligibleVendors]);

  // Dropdown state and click outside handler
  const [showSendOfferDropdown, setShowSendOfferDropdown] = useState<boolean>(false);
  const sendOfferDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sendOfferDropdownRef.current &&
        !sendOfferDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSendOfferDropdown(false);
      }
    };
    if (showSendOfferDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSendOfferDropdown]);

  // Modals & Drawers
  const [selectedLineForDetail, setSelectedLineForDetail] = useState<any | null>(null);
  const [drawerRateInput, setDrawerRateInput] = useState<number | string>('');
  const [itemOfferFeedback, setItemOfferFeedback] = useState<string | null>(null);
  const [isApplyingOffer, setIsApplyingOffer] = useState<boolean>(false);
  const [historyModalVendor, setHistoryModalVendor] = useState<any | null>(null);
  const [showCommercialTerms, setShowCommercialTerms] = useState<boolean>(true);

  // Sync drawer rate input when detail line changes
  useEffect(() => {
    if (selectedLineForDetail) {
      setItemOfferFeedback(null);
      const existing = lineCounterRates[selectedLineForDetail.id];
      if (existing !== undefined) {
        setDrawerRateInput(existing);
      } else {
        const activeQuote = rfq.quotes
          ?.find((q: any) => q.vendorId === selectedTargetVendorId)
          ?.lines?.find((l: any) => l.rfqLineId === selectedLineForDetail.id);
        setDrawerRateInput(activeQuote?.unitRate || selectedLineForDetail.benchmarkRate || '');
      }
    }
  }, [selectedLineForDetail?.id, selectedTargetVendorId]);

  const calculatedDrawerLineAmount = useMemo(() => {
    if (!selectedLineForDetail) return 0;
    const rate =
      drawerRateInput !== '' && !isNaN(Number(drawerRateInput)) && Number(drawerRateInput) >= 0
        ? Number(drawerRateInput)
        : selectedLineForDetail.benchmarkRate || 0;
    return Math.round(rate * (selectedLineForDetail.quantity || 0));
  }, [selectedLineForDetail, drawerRateInput]);

  const handleApplyOfferToItem = () => {
    if (!selectedLineForDetail || isApplyingOffer) return;
    if (drawerRateInput === '' || isNaN(Number(drawerRateInput)) || Number(drawerRateInput) < 0) {
      toast.error('Please enter a valid non-negative buyer offer unit rate.');
      return;
    }
    setIsApplyingOffer(true);
    try {
      const num = Math.round(Number(drawerRateInput) * 100) / 100;
      const lineQty = selectedLineForDetail.quantity || 0;
      const lineAmount = Math.round(num * lineQty);

      setLineCounterRates((prev) => {
        const next = {
          ...prev,
          [selectedLineForDetail.id]: num,
        };
        const payload = {
          rates: next,
          notes: negNotes,
          deadline: negDeadline,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        setDraftSavedTimestamp(payload.timestamp);
        return next;
      });

      setItemOfferFeedback(
        `Buyer offer rate applied to this item: ₹${num.toLocaleString('en-IN')} / ${selectedLineForDetail.uom} (Line Total: ₹${lineAmount.toLocaleString('en-IN')}). Saved to draft.`
      );
      toast.success('Buyer offer rate applied to this item.');
    } catch (e) {
      console.error('Failed to update draft:', e);
      toast.error('Failed to save draft rate. Please retry.');
    } finally {
      setIsApplyingOffer(false);
    }
  };

  const handleSaveDrawerDraft = () => {
    if (!selectedLineForDetail || isApplyingOffer) return;
    if (drawerRateInput === '' || isNaN(Number(drawerRateInput)) || Number(drawerRateInput) < 0) {
      toast.error('Please enter a valid non-negative buyer offer unit rate.');
      return;
    }
    setIsApplyingOffer(true);
    try {
      const num = Math.round(Number(drawerRateInput) * 100) / 100;
      const lineQty = selectedLineForDetail.quantity || 0;
      const lineAmount = Math.round(num * lineQty);

      setLineCounterRates((prev) => {
        const next = {
          ...prev,
          [selectedLineForDetail.id]: num,
        };
        const payload = {
          rates: next,
          notes: negNotes,
          deadline: negDeadline,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        setDraftSavedTimestamp(payload.timestamp);
        return next;
      });

      setItemOfferFeedback(
        `Draft rate saved for this item: ₹${num.toLocaleString('en-IN')} / ${selectedLineForDetail.uom} (Line Total: ₹${lineAmount.toLocaleString('en-IN')}).`
      );
      toast.success('Offer rate saved to draft.');
    } catch (e) {
      console.error('Failed to update draft:', e);
      toast.error('Failed to save draft rate. Please retry.');
    } finally {
      setIsApplyingOffer(false);
    }
  };

  const handleCancelDrawerRate = () => {
    if (selectedLineForDetail) {
      const existing = lineCounterRates[selectedLineForDetail.id];
      if (existing !== undefined) {
        setDrawerRateInput(existing);
      } else {
        const activeQuote = rfq.quotes
          ?.find((q: any) => q.vendorId === selectedTargetVendorId)
          ?.lines?.find((l: any) => l.rfqLineId === selectedLineForDetail.id);
        setDrawerRateInput(activeQuote?.unitRate || selectedLineForDetail.benchmarkRate || '');
      }
    }
    setItemOfferFeedback(null);
    setSelectedLineForDetail(null);
  };

  const openLineDetailDrawer = (
    line: any,
    compLine: any,
    sourceBoq: any,
    itemCodeVal: string | null,
    itemDescVal: string,
    boqDescVal: string | null
  ) => {
    setItemOfferFeedback(null);
    setSelectedLineForDetail({
      id: line.id,
      lineNumber: line.lineNumber,
      itemCode: itemCodeVal,
      itemDescription: itemDescVal,
      boqDescription: boqDescVal,
      fullBoqDescription: sourceBoq?.originalDescription || compLine?.fullBoqDescription || (boqDescVal ? boqDescVal : null),
      specification: sourceBoq?.specification || line.specification || compLine?.specification || null,
      category: sourceBoq?.category?.name || compLine?.category || line.category || null,
      subcategory: sourceBoq?.subcategory?.name || compLine?.subcategory || line.subcategory || null,
      location: sourceBoq?.location || compLine?.location || null,
      brand: sourceBoq?.brand || compLine?.brand || null,
      model: sourceBoq?.model || compLine?.model || null,
      material: sourceBoq?.material || compLine?.material || null,
      grade: sourceBoq?.grade || compLine?.grade || null,
      standardReference: sourceBoq?.standard || sourceBoq?.standardReference || compLine?.standard || compLine?.standardReference || line.standard || line.standardReference || null,
      remarks: sourceBoq?.remarks || compLine?.remarks || null,
      drawingReference: sourceBoq?.drawingReference || compLine?.drawingReference || null,
      costSource: sourceBoq?.costSource || compLine?.aiCostSource || null,
      quantity: line.quantity,
      uom: line.uom,
      benchmarkRate: line.benchmarkRate || compLine?.aiUnitCost || 0,
      vendorQuotes: compLine?.vendorQuotes || {},
      compLine,
    });
  };

  // Offer Dispatch State & Confirmation Modals
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [dispatchTargetVendors, setDispatchTargetVendors] = useState<any[]>([]);
  const [dispatchScope, setDispatchScope] = useState<'SELECTED' | 'ALL_ELIGIBLE'>('SELECTED');
  const [confirmSupersede, setConfirmSupersede] = useState<boolean>(true);
  const [submittingOffer, setSubmittingOffer] = useState<boolean>(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [bulkDispatchResults, setBulkDispatchResults] = useState<any | null>(null);

  // Validate and initiate dispatch to Selected Vendors
  const handleInitiateSendToSelected = () => {
    if (selectedVendorIds.length === 0) {
      toast.warning('Please select at least one vendor from the Vendor Comparison table above.');
      return;
    }

    // Validate that entered rates are positive valid numbers
    for (const [lineId, rate] of Object.entries(lineCounterRates)) {
      if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) {
        toast.error('Invalid counteroffer rate entered. Rates must be positive numbers.');
        return;
      }
    }

    // Check if any selected vendor is ineligible
    const ineligibles = invitedVendorsComparison.filter(
      (v) => selectedVendorIds.includes(v.vendorId) && !v.isEligible
    );
    if (ineligibles.length > 0) {
      toast.error(
        `Cannot dispatch: ${ineligibles.map((v) => v.vendorName).join(', ')} has not submitted Quote 1 or has reached the 4-offer limit.`
      );
      return;
    }

    const targets = invitedVendorsComparison.filter((v) => selectedVendorIds.includes(v.vendorId));
    setDispatchTargetVendors(targets);
    setDispatchScope('SELECTED');
    setConfirmSupersede(true);
    setShowDispatchModal(true);
  };

  // Validate and initiate dispatch to All Eligible Vendors
  const handleInitiateSendToAllEligible = () => {
    if (eligibleVendors.length === 0) {
      toast.warning(
        'No vendors are currently eligible to receive a counteroffer. Eligible vendors must have submitted Quote 1 and have fewer than 4 offers.'
      );
      return;
    }

    for (const [lineId, rate] of Object.entries(lineCounterRates)) {
      if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) {
        toast.error('Invalid counteroffer rate entered. Rates must be positive numbers.');
        return;
      }
    }

    setDispatchTargetVendors(eligibleVendors);
    setDispatchScope('ALL_ELIGIBLE');
    setConfirmSupersede(true);
    setShowDispatchModal(true);
  };

  // Execute Dispatch after Confirmation
  const handleExecuteDispatch = async () => {
    if (dispatchTargetVendors.length === 0) return;

    setSubmittingOffer(true);
    setSubmissionFeedback(null);
    setBulkDispatchResults(null);

    const vendorIds = dispatchTargetVendors.map((v) => v.vendorId);

    // Build line-level payload
    const lineItemsPayload = allLines.map((line: any) => {
      const counterRate =
        lineCounterRates[line.id] !== undefined && lineCounterRates[line.id] > 0
          ? lineCounterRates[line.id]
          : line.benchmarkRate || 0;

      return {
        rfqLineId: line.id,
        lineNumber: line.lineNumber,
        description: line.description,
        counterRate,
        lineTotal: counterRate * line.quantity,
      };
    });

    try {
      if (isDemoMode) {
        setTimeout(() => {
          setShowDispatchModal(false);
          toast.success(
            `Buyer offer dispatched to ${vendorIds.length} vendor${vendorIds.length > 1 ? 's' : ''}.`,
            rfq.rfqNumber,
            'Awaiting Vendor Revised Offer'
          );
          setSubmissionFeedback({
            type: 'success',
            text: `Buyer offer dispatched successfully to ${vendorIds.length} vendor${vendorIds.length > 1 ? 's' : ''}.`,
          });
          setLineCounterRates({});
          setSelectedVendorIds([]);
          setSubmittingOffer(false);
          if (onNegotiationSubmitted) onNegotiationSubmitted();
        }, 600);
        return;
      }

      const res = await fetch('/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: rfq.id,
          vendorIds,
          counterOfferAmount: proposedCounterTotal,
          deadline: negDeadline,
          notes:
            negNotes ||
            `Commercial counteroffer dispatched to ${vendorIds.length} vendor${vendorIds.length > 1 ? 's' : ''}.`,
          lineItemsJson: JSON.stringify(lineItemsPayload),
          nextResponsibleParty: 'VENDOR',
          allowSupersede: confirmSupersede,
        }),
      });

      const data = await res.json();
      if (!res.ok && (!data.dispatched || data.dispatched.length === 0)) {
        throw new Error(data.error || 'Failed to dispatch buyer offer');
      }

      setShowDispatchModal(false);
      setBulkDispatchResults(data);

      const dispatchedCount = data.summary?.dispatchedCount || data.dispatched?.length || (data.round ? 1 : 0);
      const failedCount = data.summary?.failedCount || data.failed?.length || 0;

      if (dispatchedCount > 0) {
        localStorage.removeItem(draftStorageKey);
        setDraftSavedTimestamp(null);
        toast.success(
          `Buyer offer dispatched to ${dispatchedCount} vendor${dispatchedCount > 1 ? 's' : ''}.`,
          rfq.rfqNumber,
          failedCount > 0 ? `${failedCount} vendors failed` : 'Awaiting Vendor Revised Offer'
        );
        setSubmissionFeedback({
          type: failedCount > 0 ? 'error' : 'success',
          text: `Offer dispatch completed: ${dispatchedCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}.`,
        });
        setLineCounterRates({});
        setSelectedVendorIds([]);
      } else {
        setSubmissionFeedback({
          type: 'error',
          text: `Offer dispatch failed: ${data.failed?.[0]?.reason || data.error || 'Check vendor eligibility'}`,
        });
      }

      if (onNegotiationSubmitted) onNegotiationSubmitted();
    } catch (err: any) {
      setShowDispatchModal(false);
      setSubmissionFeedback({
        type: 'error',
        text: err.message || 'Counteroffer dispatch failed. Entered rates have been preserved.',
      });
      toast.error(err.message || 'Counteroffer dispatch failed.');
    } finally {
      setSubmittingOffer(false);
    }
  };

  // Dropdown direct send offer handler
  const handleDropdownSendOffer = async () => {
    if (selectedVendorIds.length === 0) {
      toast.warning('Please select at least one vendor.');
      return;
    }

    for (const [lineId, rate] of Object.entries(lineCounterRates)) {
      if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) {
        toast.error('Invalid counteroffer rate entered. Rates must be positive numbers.');
        return;
      }
    }

    const targets = eligibleVendors.filter((v) => selectedVendorIds.includes(v.vendorId));
    if (targets.length === 0) {
      toast.error('Selected vendors are not eligible to receive counteroffers.');
      return;
    }

    setDispatchTargetVendors(targets);
    setDispatchScope('SELECTED');
    setSubmittingOffer(true);
    setSubmissionFeedback(null);
    setBulkDispatchResults(null);

    const vendorIds = targets.map((v) => v.vendorId);
    const lineItemsPayload = allLines.map((line: any) => {
      const counterRate =
        lineCounterRates[line.id] !== undefined && lineCounterRates[line.id] > 0
          ? lineCounterRates[line.id]
          : line.benchmarkRate || 0;

      return {
        rfqLineId: line.id,
        lineNumber: line.lineNumber,
        description: line.description,
        counterRate,
        lineTotal: counterRate * line.quantity,
      };
    });

    try {
      if (isDemoMode) {
        setTimeout(() => {
          setShowSendOfferDropdown(false);
          toast.success(
            `Buyer offer dispatched to ${vendorIds.length} vendor${vendorIds.length > 1 ? 's' : ''}.`,
            rfq.rfqNumber,
            'Awaiting Vendor Revised Offer'
          );
          setSubmissionFeedback({
            type: 'success',
            text: `Buyer offer dispatched successfully to ${vendorIds.length} vendor${vendorIds.length > 1 ? 's' : ''}.`,
          });
          setLineCounterRates({});
          setSubmittingOffer(false);
          if (onNegotiationSubmitted) onNegotiationSubmitted();
        }, 600);
        return;
      }

      const res = await fetch('/api/procurement/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: rfq.id,
          vendorIds,
          counterOfferAmount: proposedCounterTotal,
          deadline: negDeadline,
          notes:
            negNotes ||
            `Commercial counteroffer dispatched to ${vendorIds.length} vendor${vendorIds.length > 1 ? 's' : ''}.`,
          lineItemsJson: JSON.stringify(lineItemsPayload),
          nextResponsibleParty: 'VENDOR',
          allowSupersede: true,
        }),
      });

      const data = await res.json();
      if (!res.ok && (!data.dispatched || data.dispatched.length === 0)) {
        throw new Error(data.error || 'Failed to dispatch buyer offer');
      }

      setShowSendOfferDropdown(false);
      setBulkDispatchResults(data);

      const dispatchedCount = data.summary?.dispatchedCount || data.dispatched?.length || (data.round ? 1 : 0);
      const failedCount = data.summary?.failedCount || data.failed?.length || 0;

      if (dispatchedCount > 0) {
        localStorage.removeItem(draftStorageKey);
        setDraftSavedTimestamp(null);
        toast.success(
          `Buyer offer dispatched to ${dispatchedCount} vendor${dispatchedCount > 1 ? 's' : ''}.`,
          rfq.rfqNumber,
          failedCount > 0 ? `${failedCount} vendors failed` : 'Awaiting Vendor Revised Offer'
        );
        setSubmissionFeedback({
          type: failedCount > 0 ? 'error' : 'success',
          text: `Offer dispatch completed: ${dispatchedCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}.`,
        });
        setLineCounterRates({});
      } else {
        setSubmissionFeedback({
          type: 'error',
          text: `Offer dispatch failed: ${data.failed?.[0]?.reason || data.error || 'Check vendor eligibility'}`,
        });
      }

      if (onNegotiationSubmitted) onNegotiationSubmitted();
    } catch (err: any) {
      setShowSendOfferDropdown(false);
      setSubmissionFeedback({
        type: 'error',
        text: err.message || 'Counteroffer dispatch failed. Entered rates have been preserved.',
      });
      toast.error(err.message || 'Counteroffer dispatch failed.');
    } finally {
      setSubmittingOffer(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 text-slate-900 bg-transparent">
      {/* Inline Feedback Banner */}
      {submissionFeedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            submissionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {submissionFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span className="font-medium">{submissionFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmissionFeedback(null)}
            className="text-xs underline font-semibold text-slate-700 hover:text-slate-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bulk Dispatch Feedback Details */}
      {bulkDispatchResults && (
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 m-0">
              <Users size={14} className="text-blue-600" />
              Dispatch Breakdown
            </h4>
            <button
              type="button"
              onClick={() => setBulkDispatchResults(null)}
              className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {bulkDispatchResults.results?.map((res: any, idx: number) => (
              <div
                key={idx}
                className={`p-2 rounded border flex flex-col justify-between ${
                  res.status === 'DISPATCHED'
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/60 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>{res.vendorName}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] ${
                      res.status === 'DISPATCHED'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold'
                        : 'bg-rose-100 text-rose-900 border border-rose-300 font-bold'
                    }`}
                  >
                    {res.status}
                  </span>
                </div>
                <div className="text-[11px] mt-1 text-slate-600">
                  {res.status === 'DISPATCHED' ? (
                    <span>
                      Round {res.roundNumber} • ₹ {res.counterOfferAmount?.toLocaleString('en-IN')}
                      {res.isSuperseding && ' (Superseded Pending Offer)'}
                    </span>
                  ) : (
                    <span className="text-rose-700">{res.reason}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: VENDOR COMPARISON — TOTAL QUOTE AMOUNT                         */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        {/* Table Title Bar */}
        <div className="p-3 bg-white border-b border-slate-200 flex items-center gap-2">
          <FileText size={18} className="text-blue-600 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 m-0">
              Vendor Comparison — Total Quote Amount
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 m-0">
              All invited suppliers, latest submitted package quotes, variance vs AI benchmark, and dynamic ranking.
            </p>
          </div>
        </div>

        {/* Concise Table of All Invited Vendors */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-xs text-left" style={{ borderCollapse: 'collapse', border: '1px solid #B8C9DC', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 45, textAlign: 'center', border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 10px', fontWeight: 700, color: '#1e293b' }}>
                  #
                </th>
                <th style={{ textAlign: 'left', border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                  VENDOR NAME & VENDOR CODE
                </th>
                <th style={{ textAlign: 'center', border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                  QUOTE STATUS
                </th>
                <th style={{ textAlign: 'right', border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                  INITIAL QUOTE (₹)
                </th>
                <th style={{ textAlign: 'right', border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                  LATEST SUBMITTED QUOTE (₹)
                </th>
                <th style={{ textAlign: 'right', border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                  VARIANCE vs AI BENCHMARK
                </th>
                <th style={{ textAlign: 'center', border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                  RANK
                </th>
              </tr>
            </thead>
            <tbody>
              {invitedVendorsComparison.map((vendor, idx) => (
                <tr key={vendor.vendorId} style={{ background: '#ffffff' }}>
                  {/* # Row Number */}
                  <td style={{ textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 10px', color: '#64748b', fontWeight: 500 }}>
                    {idx + 1}
                  </td>

                  {/* Vendor Name and Vendor Code */}
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px' }}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="font-semibold text-slate-900 hover:text-blue-600 cursor-pointer"
                        onClick={() => setSelectedTargetVendorId(vendor.vendorId)}
                        title="Click to set as reference target vendor"
                      >
                        {vendor.vendorName}
                      </span>
                      {vendor.vendorCode && (
                        <span className="text-[11px] font-mono text-slate-500">
                          ({vendor.vendorCode})
                        </span>
                      )}
                      {vendor.rounds?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setHistoryModalVendor(vendor)}
                          className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors rounded"
                          title="View sequential negotiation audit history for this supplier"
                        >
                          <History size={12} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Quote Status */}
                  <td style={{ textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b', fontSize: 12 }}>
                    {vendor.quoteStatus === 'COMPLETE' ? (
                      'Complete Quote'
                    ) : vendor.quoteStatus === 'PARTIAL' ? (
                      vendor.quoteStatusLabel
                    ) : (
                      'No Quote'
                    )}
                  </td>

                  {/* Initial Quote (₹) */}
                  <td style={{ textAlign: 'right', border: '1px solid #B8C9DC', padding: '8px 12px', fontFamily: 'monospace', color: '#1e293b' }}>
                    {vendor.initialQuoteTotal !== null ? (
                      `₹ ${vendor.initialQuoteTotal.toLocaleString('en-IN')}`
                    ) : (
                      '-'
                    )}
                  </td>

                  {/* Latest Submitted Quote (₹) */}
                  <td style={{ textAlign: 'right', border: '1px solid #B8C9DC', padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                    {vendor.latestSubmittedQuoteTotal !== null ? (
                      `₹ ${vendor.latestSubmittedQuoteTotal.toLocaleString('en-IN')}`
                    ) : (
                      '-'
                    )}
                  </td>

                  {/* Variance vs AI Benchmark */}
                  <td style={{ textAlign: 'right', border: '1px solid #B8C9DC', padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                    {vendor.isComparable && vendor.variancePercent !== null && vendor.varianceAmount !== null ? (
                      <span>
                        {vendor.varianceAmount < 0
                          ? `▼ ${Math.abs(vendor.variancePercent)}% ( - ₹ ${Math.abs(vendor.varianceAmount).toLocaleString('en-IN')})`
                          : `▲ ${vendor.variancePercent}% ( + ₹ ${vendor.varianceAmount.toLocaleString('en-IN')})`}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>

                  {/* Rank */}
                  <td style={{ textAlign: 'center', border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>
                    {vendor.rank ? `#${vendor.rank}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Footer */}
            <tfoot style={{ background: '#f8fafc', fontWeight: 600, fontSize: 12 }}>
              <tr>
                <td colSpan={3} style={{ border: '1px solid #B8C9DC', padding: '8px 12px' }}>
                  <span style={{ color: '#475569' }}>Benchmark Total: </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                    {aiBenchmarkTotal > 0 ? `₹ ${aiBenchmarkTotal.toLocaleString('en-IN')}` : '—'}
                  </span>
                </td>
                <td colSpan={2} style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                  <span style={{ color: '#475569' }}>Lowest Complete Quote: </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                    {lowestCompleteQuote > 0 ? (
                      <span>
                        ₹ {lowestCompleteQuote.toLocaleString('en-IN')}{' '}
                        {l1Vendor && <span style={{ color: '#64748b', fontWeight: 400 }}>({l1Vendor.vendorName})</span>}
                      </span>
                    ) : (
                      '—'
                    )}
                  </span>
                </td>
                <td colSpan={2} style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                  <span style={{ color: '#475569' }}>Potential Savings: </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                    {potentialSavings > 0
                      ? `₹ ${potentialSavings.toLocaleString('en-IN')} (${potentialSavingsPercent}%)`
                      : '—'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: ITEM-LEVEL QUOTATION COMPARISON & BUYER OFFER                  */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs">
        {/* Table Title Bar */}
        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 m-0">
                Item-Level Quotation Comparison & Buyer Offer
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 m-0">
                Line-by-line commercial rates across all invited vendors with editable Buyer Offer column.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedLineIds.length > 0 && (
              <span className="text-xs font-semibold text-blue-600">
                {selectedLineIds.length} of {allLines.length} lines selected
              </span>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleApplyBatchDiscount(3)}
                className="px-2 py-0.5 text-xs rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
              >
                -3%
              </button>
              <button
                type="button"
                onClick={() => handleApplyBatchDiscount(5)}
                className="px-2 py-0.5 text-xs rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
              >
                -5%
              </button>
              <button
                type="button"
                onClick={() => handleApplyBatchDiscount(10)}
                className="px-2 py-0.5 text-xs rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
              >
                -10%
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Consolidated Line-Item Table */}
        <div
          className="table-responsive w-full"
          style={{
            maxHeight: '65vh',
            overflowX: 'auto',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          <table
            className="text-xs w-full"
            style={{
              minWidth: `${tableMinWidth}px`,
              borderCollapse: 'collapse',
              border: '1px solid #B8C9DC',
            }}
          >
            <thead>
              {/* Row 1: Headers */}
              <tr>
                <th
                  rowSpan={2}
                  style={{
                    width: 36,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 6px',
                    textAlign: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allLinesSelected}
                    onChange={toggleSelectAllLines}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Select all lines"
                  />
                </th>
                <th
                  rowSpan={2}
                  style={{
                    width: 45,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 6px',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  S.No.
                </th>
                <th
                  rowSpan={2}
                  style={{
                    width: 100,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 10px',
                    textAlign: 'left',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  Item Code
                </th>
                <th
                  rowSpan={2}
                  style={{
                    width: 160,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  Item Description
                </th>
                <th
                  rowSpan={2}
                  style={{
                    width: 220,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  BOQ Description
                </th>
                <th
                  rowSpan={2}
                  style={{
                    width: 60,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 6px',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  UOM
                </th>
                <th
                  rowSpan={2}
                  style={{
                    width: 75,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 8px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  Quantity
                </th>
                <th
                  rowSpan={2}
                  style={{
                    width: 110,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 8px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  AI Benchmark Rate (₹)
                </th>

                {/* Grouped Vendor Columns */}
                {invitedVendorsComparison.map((vendor) => (
                  <th
                    key={vendor.vendorId}
                    colSpan={2}
                    style={{
                      border: '1px solid #B8C9DC',
                      background: '#f8fafc',
                      padding: '8px 10px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#1e293b',
                    }}
                  >
                    <span>{vendor.vendorName}</span>
                    {vendor.vendorCode && (
                      <span className="text-[11px] font-normal text-slate-500 ml-1">
                        ({vendor.vendorCode})
                      </span>
                    )}
                  </th>
                ))}

                {/* Buyer Offer Rate Group */}
                <th
                  rowSpan={2}
                  style={{
                    width: 130,
                    border: '1px solid #B8C9DC',
                    background: '#f8fafc',
                    padding: '8px 10px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: '#1e293b',
                  }}
                >
                  Buyer Offer Rate (₹)
                </th>
              </tr>

              {/* Row 2: Sub-columns for Vendors */}
              <tr>
                {invitedVendorsComparison.map((vendor) => (
                  <React.Fragment key={vendor.vendorId}>
                    <th
                      style={{
                        width: 80,
                        border: '1px solid #B8C9DC',
                        background: '#f8fafc',
                        padding: '6px 8px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#1e293b',
                      }}
                    >
                      Rate (₹)
                    </th>
                    <th
                      style={{
                        width: 95,
                        border: '1px solid #B8C9DC',
                        background: '#f8fafc',
                        padding: '6px 8px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#1e293b',
                      }}
                    >
                      Amount (₹)
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody>
              {allLines.map((line: any, idx: number) => {
                const compLine = comparison?.lines?.find(
                  (cl: any) => cl.id === line.id || cl.lineNumber === line.lineNumber
                );

                const sourceBoq =
                  line.boqLine ||
                  line.prLine?.boqLine ||
                  compLine?.boqLine ||
                  rfq.boqRevision?.lines?.find((b: any) =>
                    b.id === line.boqLineId ||
                    (b.itemCode && b.itemCode === line.itemCode) ||
                    b.lineNumber === line.lineNumber ||
                    b.lineNumber === String(line.lineNumber).replace(/^RFQ-L|^PR-L|^L-/, '') ||
                    (b.standardDescription && b.standardDescription.toLowerCase() === (line.description || '').toLowerCase()) ||
                    (b.originalDescription && b.originalDescription.toLowerCase() === (line.description || '').toLowerCase())
                  );

                const itemCodeVal = compLine?.itemCode || sourceBoq?.itemCode || line.itemCode || null;
                const itemDescVal = compLine?.itemDescription || line.description || sourceBoq?.standardDescription || sourceBoq?.originalDescription || 'Line item';

                const rawBoqDesc = compLine?.boqDescription !== undefined && compLine?.boqDescription !== null
                  ? compLine.boqDescription
                  : (line.specification || compLine?.specification || (sourceBoq?.originalDescription && sourceBoq.originalDescription.trim() !== itemDescVal.trim()
                      ? sourceBoq.originalDescription.trim()
                      : (sourceBoq?.specification || null)));
                const boqDescVal = (rawBoqDesc && String(rawBoqDesc).trim() !== '') ? String(rawBoqDesc).trim() : null;

                const userCounterRate = lineCounterRates[line.id];
                const activeVendorQuote = rfq.quotes
                  ?.find((q: any) => q.vendorId === selectedTargetVendorId)
                  ?.lines?.find((l: any) => l.rfqLineId === line.id);
                const currentBaseRate = activeVendorQuote?.unitRate || line.benchmarkRate || 0;
                const isLineSelected = selectedLineIds.includes(line.id);

                return (
                  <tr
                    key={line.id}
                    style={{ background: isLineSelected ? '#f8fafc' : '#ffffff' }}
                  >
                    {/* 1. Selection Checkbox */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 6px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isLineSelected}
                        onChange={() => toggleSelectLine(line.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* 2. S.No. */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 6px', textAlign: 'center', color: '#64748b', fontFamily: 'monospace' }}>
                      {line.lineNumber || idx + 1}
                    </td>

                    {/* 3. Item Code */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 10px', textAlign: 'left', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                      {itemCodeVal || '—'}
                    </td>

                    {/* 4. Item Description */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 12px', textAlign: 'left' }}>
                      <div
                        onClick={() => openLineDetailDrawer(line, compLine, sourceBoq, itemCodeVal, itemDescVal, boqDescVal)}
                        className="cursor-pointer group"
                        title="Click to view details"
                      >
                        <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {itemDescVal}
                        </span>
                      </div>
                    </td>

                    {/* 5. BOQ Description */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 8px', textAlign: 'left', maxWidth: 220, verticalAlign: 'middle' }}>
                      <BoqDescriptionCell
                        text={boqDescVal}
                        itemCode={itemCodeVal}
                        itemDescription={itemDescVal}
                        lineNumber={line.lineNumber || idx + 1}
                        maxWidth={210}
                        clampLines={2}
                      />
                    </td>

                    {/* 6. UOM */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 6px', textAlign: 'center', color: '#475569', fontSize: 12 }}>
                      {line.uom}
                    </td>

                    {/* 7. Quantity */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 500, color: '#0f172a' }}>
                      {line.quantity?.toLocaleString('en-IN')}
                    </td>

                    {/* 8. AI Benchmark Rate (₹) */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                      ₹ {(line.benchmarkRate || compLine?.aiUnitCost || 0).toLocaleString('en-IN')}
                    </td>

                    {/* Dynamic Vendor Rates & Line Amounts */}
                    {invitedVendorsComparison.map((vendor) => {
                      const vQuote = compLine?.vendorQuotes?.[vendor.vendorId];

                      return (
                        <React.Fragment key={vendor.vendorId}>
                          <td style={{ border: '1px solid #B8C9DC', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#0f172a' }}>
                            {vQuote?.quoted ? `₹ ${vQuote.rate.toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#0f172a' }}>
                            {vQuote?.quoted ? `₹ ${(vQuote.amount || vQuote.rate * line.quantity).toLocaleString('en-IN')}` : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}

                    {/* Buyer Offer Rate (Final Column) */}
                    <td style={{ border: '1px solid #B8C9DC', padding: '6px 8px', textAlign: 'right' }}>
                      <div className="relative inline-flex items-center w-full">
                        <span className="absolute left-2.5 text-slate-500 font-medium text-xs pointer-events-none">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={userCounterRate !== undefined ? userCounterRate : ''}
                          placeholder={String(currentBaseRate)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : Number(e.target.value);
                            setLineCounterRates((prev) => {
                              const next = { ...prev };
                              if (val === undefined) {
                                delete next[line.id];
                              } else {
                                next[line.id] = val;
                              }
                              return next;
                            });
                          }}
                          className="w-full pl-6 pr-2 py-1 text-right font-mono font-bold text-xs rounded border border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot style={{ background: '#f8fafc', fontWeight: 700, fontSize: 12 }}>
              <tr>
                <td colSpan={7} style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', textTransform: 'uppercase', color: '#0f172a' }}>
                  TOTAL PACKAGE COMMERCIAL VALUE:
                </td>
                <td style={{ border: '1px solid #B8C9DC', padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#0f172a' }}>
                  ₹ {aiBenchmarkTotal.toLocaleString('en-IN')}
                </td>
                {invitedVendorsComparison.map((vendor) => (
                  <React.Fragment key={vendor.vendorId}>
                    <td style={{ border: '1px solid #B8C9DC', padding: '8px 8px', textAlign: 'right', color: '#64748b' }}>—</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#0f172a' }}>
                      {vendor.latestSubmittedQuoteTotal !== null
                        ? `₹ ${vendor.latestSubmittedQuoteTotal.toLocaleString('en-IN')}`
                        : '—'}
                    </td>
                  </React.Fragment>
                ))}
                <td style={{ border: '1px solid #B8C9DC', padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#0f172a' }}>
                  ₹ {proposedCounterTotal.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* SECTION 5: Action Controls */}
        <div className="p-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-700">
              Total Proposed Offer:{' '}
              <strong className="font-mono text-sm text-slate-900 font-bold ml-1">
                ₹ {proposedCounterTotal.toLocaleString('en-IN')}
              </strong>
            </span>
            {modifiedLinesCount > 0 ? (
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {modifiedLinesCount} line{modifiedLinesCount > 1 ? 's' : ''} modified
              </span>
            ) : (
              <span className="text-xs text-slate-500 italic">
                (Baseline rates applied; enter target rates in Buyer Offer column)
              </span>
            )}
            {draftSavedTimestamp && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <Check size={12} /> Draft saved at {draftSavedTimestamp}
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5 rounded inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Save size={13} />
              <span>Save as Draft</span>
            </button>

            <button
              type="button"
              onClick={handleRequestReset}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5 rounded inline-flex items-center gap-1.5 shadow-2xs"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>

            {/* Dropdown-style Send Offer to Vendors */}
            <div className="relative inline-block z-30" ref={sendOfferDropdownRef}>
              <button
                type="button"
                id="send-offer-dropdown-btn"
                onClick={() => setShowSendOfferDropdown((prev) => !prev)}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span>Send Offer to Vendors</span>
                <ChevronDown size={14} className="text-slate-600" />
              </button>

              {showSendOfferDropdown && (
                <div
                  id="send-offer-dropdown-menu"
                  className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-slate-300 rounded shadow-xl p-2.5 w-60 flex flex-col gap-2"
                  style={{ minWidth: '220px' }}
                >
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      onChange={toggleAllEligible}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Select All Vendors ({eligibleVendors.length})</span>
                  </label>

                  <div className="flex flex-col gap-1.5 pl-1">
                    {eligibleVendors.map((vendor) => (
                      <label key={vendor.vendorId} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selectedVendorIds.includes(vendor.vendorId)}
                          onChange={() => toggleSelectVendor(vendor.vendorId)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="truncate">{vendor.vendorName}</span>
                      </label>
                    ))}
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      id="confirm-send-offer-btn"
                      onClick={handleDropdownSendOffer}
                      disabled={selectedVendorIds.length === 0 || submittingOffer}
                      className="w-full py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded text-center transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingOffer ? 'Sending...' : 'Send Offer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONSOLIDATED COMMERCIAL TERMS & CONDITIONS                                */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div
          onClick={() => setShowCommercialTerms(!showCommercialTerms)}
          className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 cursor-pointer select-none transition-colors border-b border-slate-200"
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 m-0">
              Commercial Terms & Vendor Conditions
            </h4>
            <span className="text-[11px] font-medium text-slate-500 ml-1">
              ({invitedVendorsComparison.length} Vendors)
            </span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            {showCommercialTerms ? 'Collapse Terms ▲' : 'Expand Terms ▼'}
          </button>
        </div>

        {showCommercialTerms && (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs text-left" style={{ borderCollapse: 'collapse', border: '1px solid #B8C9DC', minWidth: 750 }}>
              <thead>
                <tr>
                  <th style={{ width: 220, border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                    Commercial Parameter
                  </th>
                  <th style={{ width: 260, border: '1px solid #B8C9DC', background: '#f8fafc', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                    RFQ Published Baseline
                  </th>
                  {invitedVendorsComparison.map((v) => (
                    <th key={v.vendorId} style={{ minWidth: 180, border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                      {v.vendorName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#ffffff' }}>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Payment Terms</td>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                    {rfq.paymentTerms || '30 days net from certified progressive invoice'}
                  </td>
                  {invitedVendorsComparison.map((v) => (
                    <td key={v.vendorId} style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                      Net 30 days from invoice
                    </td>
                  ))}
                </tr>
                <tr style={{ background: '#ffffff' }}>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Delivery Schedule</td>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                    {rfq.deliveryRequirement || 'Site delivery & completion within 45 days from work order issuance'}
                  </td>
                  {invitedVendorsComparison.map((v) => (
                    <td key={v.vendorId} style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                      30 calendar days
                    </td>
                  ))}
                </tr>
                <tr style={{ background: '#ffffff' }}>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Warranty</td>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                    12 Months defect liability period
                  </td>
                  {invitedVendorsComparison.map((v) => (
                    <td key={v.vendorId} style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                      12 Months standard warranty
                    </td>
                  ))}
                </tr>
                <tr style={{ background: '#ffffff' }}>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Commercial Validity</td>
                  <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                    {rfq.commercialValidityDays || 60} Days
                  </td>
                  {invitedVendorsComparison.map((v) => (
                    <td key={v.vendorId} style={{ border: '1px solid #B8C9DC', padding: '8px 12px', color: '#1e293b' }}>
                      60 Days
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* RESET CONFIRMATION MODAL                                                  */}
      {/* ========================================================================= */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 text-amber-700 rounded-lg shrink-0">
                <RotateCcw size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 m-0">Reset Counteroffer Rates?</h3>
                <p className="text-xs text-slate-600 mt-1 m-0">
                  You have entered custom rates across <strong>{modifiedLinesCount} lines</strong> with a proposed total of <strong>₹ {proposedCounterTotal.toLocaleString('en-IN')}</strong>.
                </p>
                <p className="text-xs text-slate-500 mt-2 m-0">
                  Are you sure you want to discard these entered rates?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="btn btn-secondary btn-sm text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleResetRates();
                  setShowResetModal(false);
                }}
                className="btn btn-primary btn-sm text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DISPATCH CONFIRMATION MODAL (SELECTED OR ALL ELIGIBLE VENDORS)            */}
      {/* ========================================================================= */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2.5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {dispatchScope === 'ALL_ELIGIBLE' ? 'Bulk Negotiation Dispatch' : 'Negotiation Dispatch'}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1 m-0">
                  Confirm Buyer Offer Dispatch
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  RFQ: <span className="font-mono font-semibold">{rfq.rfqNumber}</span> • {dispatchTargetVendors.length} Recipient Vendor{dispatchTargetVendors.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {/* Offer Summary */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-blue-50/60 rounded border border-blue-200">
                <span className="text-blue-900 block font-semibold">Proposed Counteroffer Total</span>
                <strong className="text-blue-950 font-mono text-base font-black">
                  ₹ {proposedCounterTotal.toLocaleString('en-IN')}
                </strong>
                <span className="text-[11px] text-blue-700 block mt-0.5">
                  Applied across {modifiedLinesCount || allLines.length} line items
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-slate-500 block font-semibold">Recipient Scope</span>
                <strong className="text-slate-900 text-sm font-bold block mt-0.5">
                  {dispatchTargetVendors.length} Vendor{dispatchTargetVendors.length > 1 ? 's' : ''}
                </strong>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Independent round recorded for each vendor
                </span>
              </div>
            </div>

            {/* Recipient Vendors Table */}
            <div className="space-y-1 flex-1 overflow-hidden flex flex-col">
              <div className="text-xs font-bold text-slate-700">Recipient Vendors</div>
              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2.5">Vendor</th>
                      <th className="py-1.5 px-2.5 text-right">Latest Quote</th>
                      <th className="py-1.5 px-2.5 text-right">New Buyer Offer</th>
                      <th className="py-1.5 px-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatchTargetVendors.map((v) => {
                      const hasPending = Boolean(v.pendingBuyerOffer);

                      return (
                        <tr key={v.vendorId}>
                          <td className="py-1.5 px-2.5 font-medium text-slate-800">
                            <div>{v.vendorName}</div>
                            {v.vendorCode && (
                              <div className="font-mono text-[10px] text-slate-400">
                                {v.vendorCode}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-medium text-slate-800">
                            {v.latestSubmittedQuoteTotal !== null
                              ? `₹ ${v.latestSubmittedQuoteTotal.toLocaleString('en-IN')}`
                              : '—'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-blue-900">
                            ₹ {proposedCounterTotal.toLocaleString('en-IN')}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            {hasPending ? (
                              <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Has Pending Offer
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Supersede warning if any recipient vendor has a pending offer */}
            {dispatchTargetVendors.some((v) => Boolean(v.pendingBuyerOffer)) && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle size={14} />
                  <span>Pending Counteroffers Detected</span>
                </div>
                <p className="m-0 leading-relaxed text-amber-900 text-[11px]">
                  One or more selected vendors currently have an active offer awaiting response.
                  Issuing this new offer will mark pending offers as <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">SUPERSEDED</code> and preserve them in audit history.
                </p>
                <label className="flex items-center gap-2 pt-0.5 font-semibold text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmSupersede}
                    onChange={(e) => setConfirmSupersede(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Confirm superseding pending counteroffers</span>
                </label>
              </div>
            )}

            {/* Deadline and Notes */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Vendor Response Deadline
                </label>
                <input
                  type="date"
                  value={negDeadline}
                  onChange={(e) => setNegDeadline(e.target.value)}
                  className="w-full text-xs py-1.5 px-2 rounded border border-slate-300 font-medium"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Commercial Remarks / Note
                </label>
                <input
                  type="text"
                  value={negNotes}
                  onChange={(e) => setNegNotes(e.target.value)}
                  placeholder="e.g. Volume discount target requested."
                  className="w-full text-xs py-1.5 px-2 rounded border border-slate-300 font-medium"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                disabled={submittingOffer}
                className="btn btn-secondary btn-sm text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDispatch}
                disabled={
                  submittingOffer ||
                  dispatchTargetVendors.length === 0 ||
                  (dispatchTargetVendors.some((v) => Boolean(v.pendingBuyerOffer)) && !confirmSupersede)
                }
                className={`btn btn-primary btn-sm text-xs font-semibold px-4 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white ${
                  dispatchTargetVendors.some((v) => Boolean(v.pendingBuyerOffer)) && !confirmSupersede
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {submittingOffer ? (
                  <>
                    <Clock size={13} className="animate-spin" /> Dispatching...
                  </>
                ) : (
                  <>
                    <Send size={13} /> Confirm & Dispatch ({dispatchTargetVendors.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VENDOR NEGOTIATION AUDIT HISTORY MODAL                                    */}
      {/* ========================================================================= */}
      {historyModalVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 max-w-2xl w-full p-5 space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2.5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  Negotiation History & Audit Trail
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1 m-0">
                  {historyModalVendor.vendorName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  RFQ: <span className="font-mono font-semibold">{rfq.rfqNumber}</span>
                  {historyModalVendor.vendorCode && (
                    <span> • Code: {historyModalVendor.vendorCode}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalVendor(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Rounds Table */}
            <div className="flex-1 overflow-y-auto space-y-2 text-xs">
              {/* Initial Quote Record */}
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Initial Quote (Round 0)
                  </span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    {historyModalVendor.initialQuoteTotal !== null
                      ? `₹ ${historyModalVendor.initialQuoteTotal.toLocaleString('en-IN')}`
                      : '—'}
                  </span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Initial Submission
                </span>
              </div>

              {/* Rounds */}
              {historyModalVendor.rounds?.length === 0 ? (
                <div className="p-6 text-center text-slate-500 bg-slate-50/50 rounded border border-dashed border-slate-200">
                  No negotiation counteroffers logged yet for this vendor.
                </div>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Round</th>
                        <th className="py-2 px-3 text-right">Buyer Offer</th>
                        <th className="py-2 px-3 text-right">Vendor Response</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyModalVendor.rounds.map((r: any) => {
                        const isSuperseded = r.status === 'SUPERSEDED';
                        const isRevised = r.status === 'REVISED_SUBMITTED' || (r.revisedQuoteAmount && r.revisedQuoteAmount > 0);
                        const isPending = !isSuperseded && !isRevised;

                        return (
                          <tr
                            key={r.id}
                            className={
                              isSuperseded
                                ? 'bg-slate-50/60 opacity-70'
                                : isPending
                                ? 'bg-amber-50/30'
                                : ''
                            }
                          >
                            <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                              Round {r.roundNumber}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-blue-900">
                              ₹ {r.counterOfferAmount ? r.counterOfferAmount.toLocaleString('en-IN') : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              {r.revisedQuoteAmount && r.revisedQuoteAmount > 0 ? (
                                `₹ ${r.revisedQuoteAmount.toLocaleString('en-IN')}`
                              ) : isSuperseded ? (
                                <span className="text-slate-400 font-normal italic">Superseded</span>
                              ) : (
                                <span className="text-amber-700 font-normal italic">Awaiting Response</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {isSuperseded ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  SUPERSEDED
                                </span>
                              ) : isRevised ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  REVISED
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  PENDING
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600 max-w-[180px] truncate" title={r.notes || ''}>
                              {r.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHistoryModalVendor(null)}
                className="btn btn-secondary btn-sm text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* APPROVED SINGLE-VIEW LINE ITEM DETAILS DRAWER (SECTIONS 1 TO 4 CONTINUOUS)*/}
      {/* ========================================================================= */}
      {selectedLineForDetail && (() => {
        const qty = selectedLineForDetail.quantity || 0;
        const uom = selectedLineForDetail.uom || 'Unit';
        const aiBenchmarkRate = selectedLineForDetail.benchmarkRate || 0;
        const aiBenchmarkTotal = aiBenchmarkRate * qty;

        // Vendor quotes for this line
        const submittedVendorQuotes = invitedVendorsComparison.map((vendor) => {
          const vQuote =
            selectedLineForDetail.vendorQuotes?.[vendor.vendorId] ||
            selectedLineForDetail.compLine?.vendorQuotes?.[vendor.vendorId];
          const isL1 = selectedLineForDetail.compLine?.lowestCompliantVendorId === vendor.vendorId;
          const quotedRate = vQuote?.quoted && typeof vQuote.rate === 'number' ? vQuote.rate : null;
          const quotedAmount = quotedRate !== null ? (vQuote.amount || quotedRate * qty) : null;
          const varianceAmount = quotedRate !== null && aiBenchmarkRate > 0
            ? (aiBenchmarkRate - quotedRate) * qty
            : null;
          const variancePercent = varianceAmount !== null && aiBenchmarkTotal > 0
            ? ((varianceAmount / aiBenchmarkTotal) * 100)
            : null;

          return {
            vendorId: vendor.vendorId,
            vendorName: vendor.vendorName,
            vendorCode: vendor.vendorCode,
            quoted: !!vQuote?.quoted,
            rate: quotedRate,
            amount: quotedAmount,
            varianceAmount,
            variancePercent,
            isL1,
            remarks: vQuote?.remarks || (vQuote?.quoted ? 'Compliant quotation' : 'No quotation submitted'),
          };
        });

        // Lowest and next-best quotes
        const validQuotes = submittedVendorQuotes
          .filter((vq) => vq.quoted && vq.rate !== null && vq.rate > 0)
          .sort((a, b) => (a.rate as number) - (b.rate as number));

        const lowestQuote = validQuotes.length > 0 ? validQuotes[0] : null;
        const nextBestQuote = validQuotes.length > 1 ? validQuotes[1] : null;

        // Buyer Offer calculations
        const buyerOfferRateNum =
          drawerRateInput !== '' && !isNaN(Number(drawerRateInput)) && Number(drawerRateInput) >= 0
            ? Number(drawerRateInput)
            : (lineCounterRates[selectedLineForDetail.id] !== undefined ? lineCounterRates[selectedLineForDetail.id] : aiBenchmarkRate);
        const buyerOfferTotal = Math.round(buyerOfferRateNum * qty);

        // Savings vs AI Benchmark
        const savingsVsAiRate = aiBenchmarkRate - buyerOfferRateNum;
        const savingsVsAiTotal = savingsVsAiRate * qty;
        const savingsVsAiPercent = aiBenchmarkTotal > 0 ? (savingsVsAiTotal / aiBenchmarkTotal) * 100 : 0;

        // Savings vs Next Best Offer (only when supported by actual data: at least 2 quotes exist)
        const hasNextBestQuote = nextBestQuote !== null && nextBestQuote.rate !== null;
        const savingsVsNextBestRate = hasNextBestQuote ? (nextBestQuote.rate! - buyerOfferRateNum) : null;
        const savingsVsNextBestTotal = savingsVsNextBestRate !== null ? savingsVsNextBestRate * qty : null;
        const savingsVsNextBestPercent =
          hasNextBestQuote && nextBestQuote.amount && nextBestQuote.amount > 0
            ? (savingsVsNextBestTotal! / nextBestQuote.amount) * 100
            : null;

        const isLineModifiedInDraft = lineCounterRates[selectedLineForDetail.id] !== undefined;

        return (
          <div className="fixed inset-0 z-[100] flex justify-end" style={{ zIndex: 100 }}>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
              onClick={() => setSelectedLineForDetail(null)}
            />

            {/* Drawer Panel: Full width on mobile, expanded to 940px on desktop */}
            <div
              className="relative z-[101] w-full sm:w-[780px] md:w-[880px] lg:w-[940px] max-w-full bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 text-slate-800"
              style={{ zIndex: 101 }}
            >
              {/* Header */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between shrink-0">
                <div className="space-y-1.5 pr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded border border-blue-200">
                      Line {selectedLineForDetail.lineNumber}
                    </span>
                    {selectedLineForDetail.itemCode && (
                      <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-200 px-2.5 py-0.5 rounded border border-slate-300">
                        {selectedLineForDetail.itemCode}
                      </span>
                    )}
                    {selectedLineForDetail.category && (
                      <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                        {selectedLineForDetail.category}
                      </span>
                    )}
                    {isLineModifiedInDraft && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-300">
                        Draft Rate: ₹{lineCounterRates[selectedLineForDetail.id].toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 m-0 leading-snug">
                    {selectedLineForDetail.itemDescription || selectedLineForDetail.description}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLineForDetail(null)}
                  className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-200 transition-colors shrink-0"
                  title="Close drawer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Single Continuous Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-7 text-xs text-slate-700">
                
                {/* ------------------------------------------------------------- */}
                {/* SECTION 1: ITEM DETAILS                                       */}
                {/* ------------------------------------------------------------- */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-blue-700" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 m-0">
                        Section 1 — Item Details
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">Baseline Specification &amp; Technical Scope</span>
                  </div>

                  {/* Complete BOQ Description (Full text, natural wrapping) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Complete BOQ Description
                      </span>
                      {selectedLineForDetail.fullBoqDescription && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {selectedLineForDetail.fullBoqDescription.length} characters
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-50/80 p-3.5 rounded-lg border border-slate-200 text-slate-900 leading-relaxed text-xs sm:text-sm whitespace-pre-wrap font-sans">
                      {selectedLineForDetail.fullBoqDescription && selectedLineForDetail.fullBoqDescription.trim() !== '' ? (
                        selectedLineForDetail.fullBoqDescription
                      ) : (
                        <span className="text-slate-400 italic">Not provided in source BOQ</span>
                      )}
                    </div>
                  </div>

                  {/* Specification / Technical Scope */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Specification / Technical Scope
                    </span>
                    <div className="bg-slate-50/80 p-3.5 rounded-lg border border-slate-200 text-slate-800 leading-relaxed text-xs sm:text-sm whitespace-pre-wrap">
                      {selectedLineForDetail.specification && selectedLineForDetail.specification.trim() !== '' ? (
                        selectedLineForDetail.specification
                      ) : (
                        <span className="text-slate-400 italic">Not provided in technical specification</span>
                      )}
                    </div>
                  </div>

                  {/* Structured Responsive Grid of Existing Fields */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Item Code
                      </span>
                      <strong className="text-slate-900 font-mono text-xs block truncate" title={selectedLineForDetail.itemCode || '—'}>
                        {selectedLineForDetail.itemCode || '—'}
                      </strong>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Category &amp; Sub-Category
                      </span>
                      <strong className="text-slate-900 font-medium text-xs block truncate" title={[selectedLineForDetail.category, selectedLineForDetail.subcategory].filter(Boolean).join(' • ') || '—'}>
                        {[selectedLineForDetail.category, selectedLineForDetail.subcategory].filter(Boolean).join(' • ') || '—'}
                      </strong>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        UOM &amp; Estimated Quantity
                      </span>
                      <strong className="text-slate-900 font-mono text-xs block">
                        {qty.toLocaleString('en-IN')} <span className="font-sans font-normal text-slate-600">{uom}</span>
                      </strong>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Location / Area
                      </span>
                      <strong className="text-slate-900 font-medium text-xs block truncate" title={selectedLineForDetail.location || '—'}>
                        {selectedLineForDetail.location || '—'}
                      </strong>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Drawing Reference
                      </span>
                      <strong className="text-slate-900 font-mono text-xs block truncate" title={selectedLineForDetail.drawingReference || '—'}>
                        {selectedLineForDetail.drawingReference || '—'}
                      </strong>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Brand / Make
                      </span>
                      <strong className="text-slate-900 font-medium text-xs block truncate" title={selectedLineForDetail.brand || '—'}>
                        {selectedLineForDetail.brand || '—'}
                      </strong>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Material / Grade
                      </span>
                      <strong
                        className="text-slate-900 font-medium text-xs block truncate"
                        title={[selectedLineForDetail.model, selectedLineForDetail.material, selectedLineForDetail.grade].filter(Boolean).join(' • ') || '—'}
                      >
                        {[selectedLineForDetail.model, selectedLineForDetail.material, selectedLineForDetail.grade].filter(Boolean).join(' • ') || '—'}
                      </strong>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Standard / Reference
                      </span>
                      <strong className="text-slate-900 font-mono text-xs block truncate" title={selectedLineForDetail.standardReference || '—'}>
                        {selectedLineForDetail.standardReference || '—'}
                      </strong>
                    </div>
                  </div>

                  {/* Remarks */}
                  {selectedLineForDetail.remarks && (
                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Remarks
                      </span>
                      <p className="text-xs text-slate-800 m-0 leading-relaxed">
                        {selectedLineForDetail.remarks}
                      </p>
                    </div>
                  )}
                </div>

                {/* ------------------------------------------------------------- */}
                {/* SECTION 2: COMMERCIAL DETAILS & VENDOR COMPARISON             */}
                {/* ------------------------------------------------------------- */}
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <TrendingDown size={18} className="text-emerald-700" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 m-0">
                        Section 2 — Commercial Details &amp; Vendor Comparison
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">Pricing Baseline &amp; Submitted Quotations</span>
                  </div>

                  {/* Three Compact Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Quantity &amp; UOM
                      </span>
                      <strong className="text-slate-900 font-mono text-base block">
                        {qty.toLocaleString('en-IN')}{' '}
                        <span className="text-xs font-normal text-slate-600 font-sans">
                          {uom}
                        </span>
                      </strong>
                    </div>

                    <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block mb-1">
                        AI Benchmark Unit Rate
                      </span>
                      <strong className="text-blue-950 font-mono text-base block">
                        ₹ {aiBenchmarkRate.toLocaleString('en-IN')}{' '}
                        <span className="text-xs font-normal text-blue-700 font-sans">
                          / {uom}
                        </span>
                      </strong>
                    </div>

                    <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block mb-1">
                        AI Benchmark Total
                      </span>
                      <strong className="text-blue-950 font-mono text-base block">
                        ₹ {aiBenchmarkTotal.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>

                  {/* Vendor Comparison Table */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Submitted Vendor Quotes for this Line
                    </span>
                    <div className="border border-slate-300 rounded-lg overflow-x-auto shadow-2xs">
                      <table className="w-full text-xs text-left" style={{ borderCollapse: 'collapse' }}>
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                          <tr>
                            <th style={{ border: '1px solid #B8C9DC', padding: '8px 10px', textAlign: 'center', width: 48 }}>
                              S.No.
                            </th>
                            <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px' }}>
                              Vendor Name
                            </th>
                            <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                              Quoted Rate
                            </th>
                            <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                              Line Amount
                            </th>
                            <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                              Variance vs AI
                            </th>
                            <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px' }}>
                              Remarks
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {submittedVendorQuotes.map((vq, idx) => (
                            <tr
                              key={vq.vendorId}
                              style={{ background: vq.isL1 ? '#f0fdf4' : '#ffffff' }}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td style={{ border: '1px solid #B8C9DC', padding: '7px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>
                                {idx + 1}
                              </td>
                              <td style={{ border: '1px solid #B8C9DC', padding: '7px 12px' }}>
                                <div className="flex items-center gap-2">
                                  {vq.isL1 && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-600 text-white">
                                      L1
                                    </span>
                                  )}
                                  <span className="font-semibold text-slate-900">{vq.vendorName}</span>
                                  {vq.vendorCode && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      ({vq.vendorCode})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ border: '1px solid #B8C9DC', padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                                {vq.rate !== null ? `₹ ${vq.rate.toLocaleString('en-IN')}` : '—'}
                              </td>
                              <td style={{ border: '1px solid #B8C9DC', padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#334155' }}>
                                {vq.amount !== null ? `₹ ${vq.amount.toLocaleString('en-IN')}` : '—'}
                              </td>
                              <td style={{ border: '1px solid #B8C9DC', padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                                {vq.varianceAmount !== null ? (
                                  <span className={vq.varianceAmount >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                    {vq.varianceAmount >= 0
                                      ? `+₹ ${vq.varianceAmount.toLocaleString('en-IN')} (${vq.variancePercent?.toFixed(1)}%)`
                                      : `-₹ ${Math.abs(vq.varianceAmount).toLocaleString('en-IN')} (${Math.abs(Number(vq.variancePercent)).toFixed(1)}%)`}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td style={{ border: '1px solid #B8C9DC', padding: '7px 12px', color: '#475569' }}>
                                {vq.remarks}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* SECTION 3: BUYER OFFER FOR THIS ITEM                          */}
                {/* ------------------------------------------------------------- */}
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Tag size={18} className="text-blue-700" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 m-0">
                        Section 3 — Buyer Offer for This Item
                      </h4>
                    </div>
                    <span className="text-[11px] text-blue-700 font-semibold bg-blue-100/70 px-2.5 py-0.5 rounded border border-blue-200">
                      Editable Target Rate
                    </span>
                  </div>

                  <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4 space-y-3.5 shadow-2xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Editable Target Unit Rate */}
                      <div>
                        <label className="text-xs font-bold text-slate-800 block mb-1.5">
                          Target Unit Rate (₹ / {uom}) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm pointer-events-none select-none">
                            ₹
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={drawerRateInput}
                            onChange={(e) => {
                              setDrawerRateInput(e.target.value);
                              setItemOfferFeedback(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleApplyOfferToItem();
                              }
                            }}
                            placeholder={String(aiBenchmarkRate || '')}
                            className="w-full h-10 pl-8 pr-3 border border-slate-300 rounded font-mono font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 shadow-2xs"
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
                          <span>AI Baseline: <strong className="text-slate-700 font-mono">₹ {aiBenchmarkRate.toLocaleString('en-IN')} / {uom}</strong></span>
                        </div>
                      </div>

                      {/* Read-only Calculated Line Amount */}
                      <div>
                        <label className="text-xs font-bold text-slate-800 block mb-1.5">
                          Calculated Line Amount (₹)
                        </label>
                        <div className="h-10 bg-white border border-slate-300 rounded px-3.5 flex items-center justify-end font-mono font-bold text-sm text-blue-950 shadow-2xs">
                          ₹ {calculatedDrawerLineAmount.toLocaleString('en-IN')}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
                          <span>Quantity: <strong className="text-slate-700 font-mono">{qty.toLocaleString('en-IN')} {uom}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Status Feedback Message */}
                    {itemOfferFeedback && (
                      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>{itemOfferFeedback}</span>
                      </div>
                    )}

                    <div className="pt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Info size={13} className="text-slate-400 shrink-0" />
                      <span>
                        Applying an offer updates the draft rate and quotation comparison table only. Final counteroffers are dispatched explicitly.
                      </span>
                    </div>
                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* SECTION 4: COST ANALYSIS                                      */}
                {/* ------------------------------------------------------------- */}
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Scale size={18} className="text-indigo-700" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 m-0">
                        Section 4 — Cost Analysis
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">Comparative Savings &amp; Variance Analysis</span>
                  </div>

                  <div className="border border-slate-300 rounded-lg overflow-x-auto shadow-2xs">
                    <table className="w-full text-xs text-left" style={{ borderCollapse: 'collapse' }}>
                      <thead className="bg-slate-100 text-slate-700 font-bold">
                        <tr>
                          <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px' }}>
                            Cost Metric / Parameter
                          </th>
                          <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                            Unit Rate (₹ / {uom})
                          </th>
                          <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                            Total Line Amount (₹)
                          </th>
                          <th style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right' }}>
                            Variance / Savings Impact
                          </th>
                        </tr>
                      </thead>
                      <tbody style={{ background: '#ffffff' }}>
                        {/* 1. AI Benchmark Rate */}
                        <tr>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>
                            AI Benchmark Rate
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                            ₹ {aiBenchmarkRate.toLocaleString('en-IN')}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                            ₹ {aiBenchmarkTotal.toLocaleString('en-IN')}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>
                            Baseline Reference (0.0%)
                          </td>
                        </tr>

                        {/* 2. Lowest Quoted Rate */}
                        <tr>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>
                            Lowest Quoted Rate {lowestQuote ? `(${lowestQuote.vendorName})` : ''}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                            {lowestQuote?.rate !== null && lowestQuote ? `₹ ${lowestQuote.rate.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                            {lowestQuote?.amount !== null && lowestQuote ? `₹ ${lowestQuote.amount.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {lowestQuote && lowestQuote.varianceAmount !== null ? (
                              <span className={lowestQuote.varianceAmount >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                {lowestQuote.varianceAmount >= 0
                                  ? `+₹ ${lowestQuote.varianceAmount.toLocaleString('en-IN')} (${lowestQuote.variancePercent?.toFixed(1)}%)`
                                  : `-₹ ${Math.abs(lowestQuote.varianceAmount).toLocaleString('en-IN')} (${Math.abs(Number(lowestQuote.variancePercent)).toFixed(1)}%)`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>

                        {/* 3. Buyer Offer Rate */}
                        <tr style={{ background: '#f8fafc' }}>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 700, color: '#1d4ed8' }}>
                            Buyer Offer Rate (Proposed)
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>
                            ₹ {buyerOfferRateNum.toLocaleString('en-IN')}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>
                            ₹ {buyerOfferTotal.toLocaleString('en-IN')}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 600 }}>
                            Target Buyer Negotiation
                          </td>
                        </tr>

                        {/* 4. Savings vs AI Benchmark */}
                        <tr>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>
                            Savings vs AI Benchmark
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                            ₹ {savingsVsAiRate.toLocaleString('en-IN')}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            <span className={savingsVsAiTotal >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                              {savingsVsAiTotal >= 0 ? `+₹ ${savingsVsAiTotal.toLocaleString('en-IN')}` : `-₹ ${Math.abs(savingsVsAiTotal).toLocaleString('en-IN')}`}
                            </span>
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            <span className={savingsVsAiPercent >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                              {savingsVsAiPercent >= 0 ? `+${savingsVsAiPercent.toFixed(1)}%` : `${savingsVsAiPercent.toFixed(1)}%`}
                            </span>
                          </td>
                        </tr>

                        {/* 5. Savings vs Next Best Offer (only when supported by actual data) */}
                        <tr>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>
                            Savings vs Next Best Offer {nextBestQuote ? `(${nextBestQuote.vendorName})` : ''}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {savingsVsNextBestRate !== null ? `₹ ${savingsVsNextBestRate.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {savingsVsNextBestTotal !== null ? (
                              <span className={savingsVsNextBestTotal >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                {savingsVsNextBestTotal >= 0 ? `+₹ ${savingsVsNextBestTotal.toLocaleString('en-IN')}` : `-₹ ${Math.abs(savingsVsNextBestTotal).toLocaleString('en-IN')}`}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {savingsVsNextBestPercent !== null ? (
                              <span className={savingsVsNextBestPercent >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                {savingsVsNextBestPercent >= 0 ? `+${savingsVsNextBestPercent.toFixed(1)}%` : `${savingsVsNextBestPercent.toFixed(1)}%`}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Requires at least 2 vendor quotations</span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* ------------------------------------------------------------- */}
              {/* STICKY FOOTER ACTIONS (BOTTOM-RIGHT)                         */}
              {/* ------------------------------------------------------------- */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <span className="text-[11px] text-slate-500 max-w-sm sm:max-w-md">
                  Draft rates update the comparison table &amp; totals. Final offer dispatch is executed via the workspace controls.
                </span>
                <div className="flex items-center gap-2.5 shrink-0">
                  {/* 1. Cancel */}
                  <button
                    type="button"
                    onClick={handleCancelDrawerRate}
                    className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                  >
                    Cancel
                  </button>

                  {/* 2. Save to Draft */}
                  <button
                    type="button"
                    onClick={handleSaveDrawerDraft}
                    disabled={
                      isApplyingOffer ||
                      drawerRateInput === '' ||
                      isNaN(Number(drawerRateInput)) ||
                      Number(drawerRateInput) < 0
                    }
                    className="px-4 py-2 rounded-lg border border-blue-300 bg-blue-50/70 hover:bg-blue-100 active:bg-blue-200 text-xs font-bold text-blue-700 shadow-2xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Save size={14} />
                    <span>Save to Draft</span>
                  </button>

                  {/* 3. Apply Offer to Item */}
                  <button
                    type="button"
                    onClick={handleApplyOfferToItem}
                    disabled={
                      isApplyingOffer ||
                      drawerRateInput === '' ||
                      isNaN(Number(drawerRateInput)) ||
                      Number(drawerRateInput) < 0
                    }
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>{isApplyingOffer ? 'Applying...' : 'Apply Offer to Item'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
