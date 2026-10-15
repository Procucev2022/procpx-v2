'use client';
// src/components/ProcurementCommercialWorkspace.tsx
// proCPX Consolidated Enterprise Commercial Workspace for Category Managers & Procurement Users
// Unifies Line-Item Quote Comparison, AI Costing, Line-by-Line Negotiation & Commercial Terms

import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale,
  Sparkles,
  TrendingDown,
  Info,
  ChevronDown,
  ChevronRight,
  Send,
  Save,
  RotateCcw,
  CheckCircle2,
  Clock,
  Shield,
  Building2,
  FileText,
  Tag,
  AlertTriangle,
  Receipt,
  Layers,
  Calendar,
  MessageSquare,
  ExternalLink,
  Percent,
  Check,
  X,
  Users,
  History,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

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
  // Target vendor for commercial counteroffer (defaults to L1 vendor or vendor with submitted quote)
  const defaultTargetVendorId = useMemo(() => {
    if (comparison?.vendors?.length > 0) {
      return comparison.vendors[0].vendorId;
    }
    const vendorWithQuote = rfq.quotes?.[0]?.vendorId;
    if (vendorWithQuote) return vendorWithQuote;
    return rfq.invitedVendors?.[0]?.vendorId || '';
  }, [comparison, rfq]);

  const [selectedTargetVendorId, setSelectedTargetVendorId] = useState<string>(defaultTargetVendorId);

  // Sync default target vendor when comparison loads or when current vendor has no quote
  useEffect(() => {
    if (defaultTargetVendorId) {
      const currentVendorHasQuotes = rfq.quotes?.some((q: any) => q.vendorId === selectedTargetVendorId);
      if (!selectedTargetVendorId || !currentVendorHasQuotes) {
        setSelectedTargetVendorId(defaultTargetVendorId);
      }
    }
  }, [defaultTargetVendorId, selectedTargetVendorId, rfq.quotes]);

  // Line-by-line counteroffer unit rates: { [rfqLineId]: unitRate }
  const [lineCounterRates, setLineCounterRates] = useState<Record<string, number>>({});
  const [negDeadline, setNegDeadline] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
  );
  const [negNotes, setNegNotes] = useState('');
  const [draftSavedTimestamp, setDraftSavedTimestamp] = useState<string | null>(null);

  // Multi-line selection checkboxes
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const allLines = rfq.lines || [];
  const allSelected = allLines.length > 0 && selectedLineIds.length === allLines.length;

  const toggleSelectAll = () => {
    if (allSelected) {
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

  // Collapsible panels
  const [showCommercialTerms, setShowCommercialTerms] = useState(false);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  // Item Details Slide-Over Drawer
  const [selectedLineForDetail, setSelectedLineForDetail] = useState<any | null>(null);
  const [drawerRateInput, setDrawerRateInput] = useState<number | string>('');

  useEffect(() => {
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
  }, [selectedLineForDetail, lineCounterRates, selectedTargetVendorId, rfq.quotes]);

  const handleApplyDrawerRate = () => {
    if (!selectedLineForDetail || drawerRateInput === '' || Number(drawerRateInput) <= 0) return;
    const num = Number(drawerRateInput);
    setLineCounterRates((prev) => ({
      ...prev,
      [selectedLineForDetail.id]: num,
    }));
    setSelectedLineForDetail(null);
  };

  // Reset confirmation modal
  const [showResetModal, setShowResetModal] = useState<boolean>(false);

  // Counteroffer Submission Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirmSingleSupersede, setConfirmSingleSupersede] = useState<boolean>(true);

  // Bulk Counteroffer Modal & State
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState<boolean>(false);
  const [selectedBulkVendorIds, setSelectedBulkVendorIds] = useState<string[]>([]);
  const [confirmBulkSupersede, setConfirmBulkSupersede] = useState<boolean>(true);
  const [bulkDispatchResults, setBulkDispatchResults] = useState<any | null>(null);

  // Dedicated Vendor History Modal
  const [historyModalVendor, setHistoryModalVendor] = useState<any | null>(null);

  // Dedicated single-line negotiation modal
  const [activeLineModal, setActiveLineModal] = useState<any | null>(null);
  const [singleLineRateInput, setSingleLineRateInput] = useState<number>(0);
  const [singleLineNotes, setSingleLineNotes] = useState<string>('');

  // Local storage draft key
  const draftStorageKey = `procpx_cm_counteroffer_draft_${rfq.id}_${selectedTargetVendorId}`;

  // Load draft from localStorage when target vendor changes
  useEffect(() => {
    if (!selectedTargetVendorId) return;
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
      } else {
        // Initialize from existing counteroffer if present
        initializeFromExistingCounteroffers(selectedTargetVendorId);
      }
    } catch {
      // ignore
    }
  }, [selectedTargetVendorId, rfq.id, draftStorageKey]);

  // Helper to initialize counter rates from active negotiation rounds
  const initializeFromExistingCounteroffers = (vendorId: string) => {
    const neg = rfq.negotiations?.find((n: any) => n.vendorId === vendorId);
    const activeRound = neg?.rounds?.[neg.rounds.length - 1];
    if (activeRound?.lineItemsJson) {
      try {
        const parsed = JSON.parse(activeRound.lineItemsJson);
        const map: Record<string, number> = {};
        parsed.forEach((item: any) => {
          if (item.rfqLineId && item.counterRate) {
            map[item.rfqLineId] = item.counterRate;
          }
        });
        setLineCounterRates(map);
      } catch {
        // fallback
      }
    }
  };

  // Save Draft to localStorage
  const handleSaveDraft = () => {
    try {
      const payload = {
        rates: lineCounterRates,
        notes: negNotes,
        deadline: negDeadline,
        timestamp: new Date().toLocaleTimeString(),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      setDraftSavedTimestamp(payload.timestamp);
    } catch (e) {
      console.error('Failed to save draft:', e);
    }
  };

  // Reset / Clear counter rates
  const handleResetRates = () => {
    setLineCounterRates({});
    setSelectedLineIds([]);
    localStorage.removeItem(draftStorageKey);
    setDraftSavedTimestamp(null);
  };

  const handleRequestReset = () => {
    if (modifiedLinesCount > 0) {
      setShowResetModal(true);
    } else {
      handleResetRates();
    }
  };

  // Calculate Counteroffer Totals
  const selectedVendor = useMemo(() => {
    return (
      comparison?.vendors?.find((v: any) => v.vendorId === selectedTargetVendorId) ||
      rfq.invitedVendors?.find((iv: any) => iv.vendorId === selectedTargetVendorId)?.vendor
    );
  }, [comparison, rfq, selectedTargetVendorId]);

  const targetVendorOriginalTotal = useMemo(() => {
    const q = rfq.quotes?.find((quote: any) => quote.vendorId === selectedTargetVendorId);
    return q?.totalQuoteAmount || selectedVendor?.totalQuoteAmount || 0;
  }, [rfq.quotes, selectedTargetVendorId, selectedVendor]);

  const proposedCounterTotal = useMemo(() => {
    let sum = 0;
    (rfq.lines || []).forEach((line: any) => {
      const customRate = lineCounterRates[line.id];
      if (customRate !== undefined && customRate > 0) {
        sum += customRate * line.quantity;
      } else {
        // Fallback to vendor's current quote for this line
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
  }, [rfq.lines, rfq.quotes, lineCounterRates, selectedTargetVendorId]);

  const counterSavings = targetVendorOriginalTotal - proposedCounterTotal;
  const counterSavingsPercent =
    targetVendorOriginalTotal > 0
      ? Math.round((counterSavings / targetVendorOriginalTotal) * 1000) / 10
      : 0;

  // Has modified rates count
  const modifiedLinesCount = useMemo(() => {
    return Object.values(lineCounterRates).filter((r) => r > 0).length;
  }, [lineCounterRates]);

  // Context for detail drawer
  const compLineForDetail = useMemo(() => {
    if (!selectedLineForDetail) return null;
    return comparison?.lines?.find(
      (cl: any) => cl.id === selectedLineForDetail.id || cl.lineNumber === selectedLineForDetail.lineNumber
    );
  }, [comparison, selectedLineForDetail]);

  const activeVendorQuoteForDetail = useMemo(() => {
    if (!selectedLineForDetail) return null;
    return rfq.quotes
      ?.find((q: any) => q.vendorId === selectedTargetVendorId)
      ?.lines?.find((l: any) => l.rfqLineId === selectedLineForDetail.id);
  }, [rfq.quotes, selectedTargetVendorId, selectedLineForDetail]);

  // Multi-Line Counteroffer Submission
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Vendor quotes and buyer offers for selected target vendor
  const selectedVendorQuotes = useMemo(() => {
    return (rfq.quotes || []).filter((q: any) => q.vendorId === selectedTargetVendorId);
  }, [rfq.quotes, selectedTargetVendorId]);

  const selectedVendorBuyerOffers = useMemo(() => {
    return (rfq.negotiations || [])
      .flatMap((n: any) => n.rounds || [])
      .filter((r: any) => r.vendorId === selectedTargetVendorId);
  }, [rfq.negotiations, selectedTargetVendorId]);

  const hasQuote1 = selectedVendorQuotes.some((q: any) => q.quoteVersion >= 1);
  const maxBuyerOffersReached = selectedVendorBuyerOffers.length >= 4;
  const isPendingVendorResponse =
    selectedVendorBuyerOffers.length > 0 &&
    Boolean(
      selectedVendorBuyerOffers.find(
        (r: any) =>
          r.status !== 'SUPERSEDED' &&
          r.counterOfferAmount &&
          (!r.revisedQuoteAmount || r.nextResponsibleParty === 'VENDOR')
      )
    );

  // Eligible invited vendors for bulk counteroffer dispatch
  const eligibleVendors = useMemo(() => {
    return (rfq.invitedVendors || []).filter((iv: any) => {
      const vQuotes = (rfq.quotes || []).filter((q: any) => q.vendorId === iv.vendorId);
      const hasQ1 = vQuotes.some((q: any) => q.quoteVersion >= 1);
      const vRounds = (rfq.negotiations || [])
        .flatMap((n: any) => n.rounds || [])
        .filter((r: any) => r.vendorId === iv.vendorId);
      const activeOffers = vRounds.filter(
        (r: any) =>
          r.status !== 'SUPERSEDED' &&
          (r.counterOfferAmount !== null || (!r.revisedQuoteAmount && r.nextResponsibleParty === 'VENDOR'))
      );
      return hasQ1 && activeOffers.length < 4;
    });
  }, [rfq.invitedVendors, rfq.quotes, rfq.negotiations]);

  // Validate and open single confirmation modal
  const handleInitiateSubmission = () => {
    if (!selectedTargetVendorId) {
      alert('Please select an eligible vendor to issue the counteroffer to.');
      return;
    }

    if (!hasQuote1) {
      alert('Cannot issue counteroffer: This vendor has not submitted Quote 1 yet.');
      return;
    }

    if (maxBuyerOffersReached) {
      alert('Round limit reached: Maximum 4 buyer counteroffers already issued for this vendor.');
      return;
    }

    // Validate that entered rates are positive valid numbers
    for (const [lineId, rate] of Object.entries(lineCounterRates)) {
      if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) {
        alert('Invalid counteroffer rate entered. Rates must be positive numbers.');
        return;
      }
    }

    setConfirmSingleSupersede(true);
    setShowConfirmModal(true);
  };

  // Open Bulk Counteroffer Modal
  const handleInitiateBulkSubmission = () => {
    if (eligibleVendors.length === 0) {
      alert(
        'No vendors are currently eligible to receive a counteroffer. Eligible vendors must have submitted Quote 1 and have fewer than 4 offers.'
      );
      return;
    }
    setSelectedBulkVendorIds(eligibleVendors.map((iv: any) => iv.vendorId));
    setConfirmBulkSupersede(true);
    setShowBulkConfirmModal(true);
  };

  // Formal Execution after User Confirmation (Single Vendor)
  const handleExecuteSubmission = async () => {
    if (!selectedTargetVendorId) return;

    setSubmittingOffer(true);
    setSubmissionFeedback(null);

    // Build line-level payload
    const lineItemsPayload = (rfq.lines || []).map((line: any) => {
      const counterRate =
        lineCounterRates[line.id] !== undefined && lineCounterRates[line.id] > 0
          ? lineCounterRates[line.id]
          : rfq.quotes
              ?.find((q: any) => q.vendorId === selectedTargetVendorId)
              ?.lines?.find((l: any) => l.rfqLineId === line.id)?.unitRate || line.benchmarkRate || 0;

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
        // Demo mode simulation
        setTimeout(() => {
          localStorage.removeItem(draftStorageKey);
          setShowConfirmModal(false);
          toast.success('Buyer offer submitted successfully.', rfq.rfqNumber, 'Awaiting Vendor Revised Offer');
          setSubmissionFeedback({
            type: 'success',
            text: isPendingVendorResponse
              ? 'Superseding buyer offer dispatched successfully.'
              : 'Buyer offer submitted successfully.',
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
          vendorId: selectedTargetVendorId,
          counterOfferAmount: proposedCounterTotal,
          deadline: negDeadline,
          notes: negNotes || (isPendingVendorResponse ? 'Superseding counteroffer replacing pending offer.' : `Commercial counteroffer across ${modifiedLinesCount} lines.`),
          lineItemsJson: JSON.stringify(lineItemsPayload),
          nextResponsibleParty: 'VENDOR',
          allowSupersede: Boolean(isPendingVendorResponse || confirmSingleSupersede),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit counteroffer');

      localStorage.removeItem(draftStorageKey);
      setShowConfirmModal(false);
      toast.success(
        isPendingVendorResponse ? 'Superseding buyer offer dispatched.' : 'Buyer offer submitted successfully.',
        rfq.rfqNumber,
        'Awaiting Vendor Revised Offer'
      );
      setSubmissionFeedback({
        type: 'success',
        text: data.message || 'Buyer offer submitted successfully.',
      });
      setLineCounterRates({});

      if (onNegotiationSubmitted) onNegotiationSubmitted();
    } catch (err: any) {
      // NOTE: Entered values preserved on error!
      setShowConfirmModal(false);
      setSubmissionFeedback({
        type: 'error',
        text: err.message || 'Counteroffer dispatch failed. Entered rates have been preserved.',
      });
    } finally {
      setSubmittingOffer(false);
    }
  };

  // Bulk Counteroffer Execution across selected vendors
  const handleExecuteBulkSubmission = async () => {
    if (selectedBulkVendorIds.length === 0) {
      alert('Please select at least one eligible vendor.');
      return;
    }

    setSubmittingOffer(true);
    setSubmissionFeedback(null);
    setBulkDispatchResults(null);

    // Build line-level payload using modified rates or benchmark rates
    const lineItemsPayload = (rfq.lines || []).map((line: any) => {
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
          setShowBulkConfirmModal(false);
          toast.success(
            `Buyer offer dispatched to ${selectedBulkVendorIds.length} eligible vendors.`,
            rfq.rfqNumber,
            'Awaiting Vendor Responses'
          );
          setSubmissionFeedback({
            type: 'success',
            text: `Buyer offer dispatched simultaneously to ${selectedBulkVendorIds.length} vendors.`,
          });
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
          vendorIds: selectedBulkVendorIds,
          counterOfferAmount: proposedCounterTotal,
          deadline: negDeadline,
          notes: negNotes || `Bulk commercial counteroffer dispatched to ${selectedBulkVendorIds.length} vendors.`,
          lineItemsJson: JSON.stringify(lineItemsPayload),
          nextResponsibleParty: 'VENDOR',
          allowSupersede: confirmBulkSupersede,
        }),
      });

      const data = await res.json();
      if (!res.ok && (!data.dispatched || data.dispatched.length === 0)) {
        throw new Error(data.error || 'Failed to dispatch bulk counteroffers');
      }

      setShowBulkConfirmModal(false);
      setBulkDispatchResults(data);

      const dispatchedCount = data.summary?.dispatchedCount || data.dispatched?.length || 0;
      const failedCount = data.summary?.failedCount || data.failed?.length || 0;

      if (dispatchedCount > 0) {
        toast.success(
          `Buyer offer dispatched to ${dispatchedCount} vendors.`,
          rfq.rfqNumber,
          failedCount > 0 ? `${failedCount} vendors failed` : 'Awaiting Vendor Responses'
        );
        setSubmissionFeedback({
          type: failedCount > 0 ? 'error' : 'success',
          text: `Bulk dispatch completed: ${dispatchedCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}.`,
        });
      } else {
        setSubmissionFeedback({
          type: 'error',
          text: `Bulk dispatch failed: ${data.failed?.[0]?.reason || data.error || 'Check vendor eligibility'}`,
        });
      }

      if (onNegotiationSubmitted) onNegotiationSubmitted();
    } catch (err: any) {
      setShowBulkConfirmModal(false);
      setSubmissionFeedback({
        type: 'error',
        text: err.message || 'Bulk counteroffer dispatch failed. Entered rates preserved.',
      });
    } finally {
      setSubmittingOffer(false);
    }
  };

  // Submit single line counteroffer from the line modal
  const handleApplySingleLineRate = () => {
    if (!activeLineModal || singleLineRateInput <= 0) return;
    setLineCounterRates((prev) => ({
      ...prev,
      [activeLineModal.id]: singleLineRateInput,
    }));
    setActiveLineModal(null);
  };

  // Get Latest Negotiation Status for Selected Vendor
  const allNegotiationRounds = useMemo(() => {
    return (rfq.negotiations || []).flatMap((n: any) => n.rounds || []);
  }, [rfq.negotiations]);

  const targetVendorRounds = useMemo(() => {
    return allNegotiationRounds
      .filter((r: any) => r.vendorId === selectedTargetVendorId)
      .sort((a: any, b: any) => a.roundNumber - b.roundNumber);
  }, [allNegotiationRounds, selectedTargetVendorId]);

  const latestRound = useMemo(() => {
    return targetVendorRounds[targetVendorRounds.length - 1];
  }, [targetVendorRounds]);

  // Compact Dynamic Vendor Negotiation Summary Rows
  const vendorNegotiationRows = useMemo(() => {
    const invited = rfq.invitedVendors || [];
    const quotes = rfq.quotes || [];

    const mapped = invited.map((iv: any) => {
      const vId = iv.vendorId;
      const vName = iv.vendor?.name || 'Vendor';
      const vCode = iv.vendor?.code || '';

      const vQuotes = quotes
        .filter((q: any) => q.vendorId === vId)
        .sort((a: any, b: any) => a.quoteVersion - b.quoteVersion);

      const vRounds = allNegotiationRounds
        .filter((r: any) => r.vendorId === vId)
        .sort((a: any, b: any) => (a.roundNumber || 0) - (b.roundNumber || 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const quote1 = vQuotes.find((q: any) => q.quoteVersion === 1) || (vQuotes.length >= 1 ? vQuotes[0] : null);

      // Check if a genuine vendor revision has been submitted
      const submittedRevisionRound = vRounds
        .filter((r: any) =>
          r.revisedQuoteAmount &&
          r.revisedQuoteAmount > 0 &&
          (r.status === 'REVISED_SUBMITTED' || r.status === 'FINAL_OFFER_SUBMITTED') &&
          (r.nextResponsibleParty === 'BUYER' || r.buyerDecision !== null)
        )
        .sort((a: any, b: any) => (b.roundNumber || 0) - (a.roundNumber || 0))[0];

      const hasGenuineRevision = Boolean(
        submittedRevisionRound ||
        (vQuotes.length > 1 && vQuotes[vQuotes.length - 1].quoteVersion > 1)
      );

      let latestSubmittedQuoteTotal: number | null = null;
      let quoteType: 'REVISED' | 'INITIAL' | 'NONE' = 'NONE';

      if (hasGenuineRevision) {
        latestSubmittedQuoteTotal = submittedRevisionRound?.revisedQuoteAmount || vQuotes[vQuotes.length - 1].totalQuoteAmount;
        quoteType = 'REVISED';
      } else if (quote1) {
        latestSubmittedQuoteTotal = quote1.totalQuoteAmount;
        quoteType = 'INITIAL';
      }

      // Check for pending buyer offer awaiting response
      const pendingBuyerOffer = vRounds.find(
        (r: any) =>
          r.status !== 'SUPERSEDED' &&
          r.counterOfferAmount &&
          (!r.revisedQuoteAmount || r.nextResponsibleParty === 'VENDOR')
      );

      // Negotiation Status text and tone
      let negStatus = 'Awaiting Quote';
      let statusTone: 'slate' | 'blue' | 'amber' | 'purple' | 'emerald' | 'rose' = 'slate';

      if (!quote1) {
        negStatus = 'Awaiting Quote 1';
        statusTone = 'slate';
      } else if (pendingBuyerOffer) {
        negStatus = `Buyer Offer ${pendingBuyerOffer.roundNumber} Awaiting Response`;
        statusTone = 'amber';
      } else if (submittedRevisionRound?.buyerDecision === 'ACCEPTED') {
        negStatus = 'Rate Agreed / Accepted (PPO Awaited)';
        statusTone = 'emerald';
      } else if (submittedRevisionRound?.buyerDecision === 'REJECTED') {
        negStatus = 'Negotiation Closed';
        statusTone = 'rose';
      } else if (hasGenuineRevision) {
        negStatus = `Revised Quote Received (Turn: Buyer)`;
        statusTone = 'purple';
      } else if (vRounds.length === 0) {
        negStatus = '1st Quote Received';
        statusTone = 'blue';
      } else {
        negStatus = 'In Negotiation';
        statusTone = 'blue';
      }

      return {
        vendorId: vId,
        vendorName: vName,
        vendorCode: vCode,
        rfqRef: rfq.rfqNumber || 'RFQ',
        quote1,
        initialQuoteTotal: quote1?.totalQuoteAmount || null,
        latestSubmittedQuoteTotal,
        quoteType,
        hasGenuineRevision,
        pendingBuyerOffer,
        negStatus,
        statusTone,
        rounds: vRounds,
      };
    });

    // Dynamic Ranking computation based on latestSubmittedQuoteTotal
    const rankable = mapped.filter((r: any) => r.latestSubmittedQuoteTotal !== null && r.latestSubmittedQuoteTotal > 0);
    rankable.sort((a: any, b: any) => (a.latestSubmittedQuoteTotal || 0) - (b.latestSubmittedQuoteTotal || 0));

    let currentRank = 1;
    const rankMap: Record<string, number> = {};
    rankable.forEach((r: any, idx: number) => {
      if (idx > 0 && (r.latestSubmittedQuoteTotal || 0) > (rankable[idx - 1].latestSubmittedQuoteTotal || 0)) {
        currentRank = idx + 1;
      }
      rankMap[r.vendorId] = currentRank;
    });

    return mapped.map((r: any) => ({
      ...r,
      rank: rankMap[r.vendorId] || null,
    }));
  }, [rfq, comparison, allNegotiationRounds]);

  // Derived KPI figures
  const aiBenchmarkTotal = rfq.estimatedBenchmarkValue || comparison?.summary?.totalBenchmark || 0;
  const lowestQuotedTotal = comparison?.summary?.lowestQuote || 0;
  const currentNegTotal = latestRound?.revisedQuoteAmount || proposedCounterTotal || 0;

  const l1Vendor = useMemo(() => comparison?.vendors?.find((v: any) => v.rank === 1), [comparison]);
  const l2Vendor = useMemo(() => comparison?.vendors?.find((v: any) => v.rank === 2), [comparison]);
  const l3Vendor = useMemo(() => comparison?.vendors?.find((v: any) => v.rank === 3), [comparison]);

  const comparisonSavings = useMemo(() => {
    if (aiBenchmarkTotal > 0 && l1Vendor?.totalQuoteAmount > 0) {
      return aiBenchmarkTotal - l1Vendor.totalQuoteAmount;
    }
    return 0;
  }, [aiBenchmarkTotal, l1Vendor]);

  const comparisonSavingsPercent = useMemo(() => {
    if (aiBenchmarkTotal > 0 && comparisonSavings !== 0) {
      return Number(((comparisonSavings / aiBenchmarkTotal) * 100).toFixed(2));
    }
    return 0;
  }, [aiBenchmarkTotal, comparisonSavings]);

  // Compute calculated minimum width of the table for 14 columns
  const tableMinWidth = useMemo(() => {
    const vendorCount = comparison?.vendors?.length || 1;
    // 40 (cb) + 44 (#) + 240 (desc) + 60 (uom) + 76 (qty) + 105 (ai rate) + 160 (buyer rate) + 76 (actions) = 801px
    // Vendor columns: 225px per vendor (Rate 105px + Amount 120px)
    return Math.max(1200, 800 + vendorCount * 225);
  }, [comparison]);

  return (
    <div className="w-full flex flex-col gap-3 text-slate-800">
      {/* Inline Feedback Banner */}
      {submissionFeedback && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center justify-between ${
            submissionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {submissionFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{submissionFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmissionFeedback(null)}
            className="text-xs underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bulk Dispatch Feedback Banner */}
      {bulkDispatchResults && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 m-0">
              <Users size={15} className="text-indigo-600" />
              Bulk Counteroffer Dispatch Results
            </h4>
            <button
              type="button"
              onClick={() => setBulkDispatchResults(null)}
              className="text-xs text-slate-400 hover:text-slate-700 underline font-medium"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {bulkDispatchResults.results?.map((res: any, idx: number) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border flex flex-col justify-between ${
                  res.status === 'DISPATCHED'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>{res.vendorName}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] ${
                      res.status === 'DISPATCHED'
                        ? 'bg-emerald-200 text-emerald-900'
                        : 'bg-rose-200 text-rose-900'
                    }`}
                  >
                    {res.status}
                  </span>
                </div>
                <div className="text-[11px] mt-1 text-slate-600">
                  {res.status === 'DISPATCHED' ? (
                    <span>
                      Round {res.roundNumber} dispatched • ₹ {res.counterOfferAmount?.toLocaleString('en-IN')}
                      {res.isSuperseding && ' (Superseding Offer)'}
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

      {/* ============================================================ */}
      {/* 1. COMPACT VENDOR NEGOTIATION SUMMARY                        */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare size={16} className="text-blue-600" />
              Vendor Negotiation Summary
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Consolidated commercial positions, latest submitted quotes, and dynamic L1/L2 ranking across all invited vendors.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInitiateBulkSubmission}
              disabled={submittingOffer || actionLoading || eligibleVendors.length === 0}
              className="btn btn-sm text-xs font-bold inline-flex items-center gap-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs"
              title="Dispatch the same buyer offer to all eligible invited vendors at once"
            >
              <Users size={13} />
              <span>Send Offer to All Eligible Vendors ({eligibleVendors.length})</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Vendor</th>
                <th className="py-2.5 px-2">RFQ Ref</th>
                <th className="py-2.5 px-3 text-right">Initial Quote</th>
                <th className="py-2.5 px-3 text-right">Latest Submitted Quote</th>
                <th className="py-2.5 px-2 text-center">Negotiation Status</th>
                <th className="py-2.5 px-2 text-center">Ranking</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {vendorNegotiationRows.map((row: any) => {
                const isSelected = selectedTargetVendorId === row.vendorId;

                return (
                  <tr
                    key={row.vendorId}
                    className={`hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-blue-50/40 font-medium' : ''
                    }`}
                  >
                    {/* 1. Vendor Name */}
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{row.vendorName}</span>
                        {row.vendorCode && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({row.vendorCode})
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <span className="text-[10px] text-blue-600 font-semibold block">
                          ● Selected Target
                        </span>
                      )}
                    </td>

                    {/* 2. RFQ Ref */}
                    <td className="py-2.5 px-2 font-mono text-slate-600 text-[11px]">{row.rfqRef}</td>

                    {/* 3. Initial Quote */}
                    <td className="py-2.5 px-3 text-right">
                      {row.initialQuoteTotal !== null ? (
                        <div>
                          <div className="font-mono font-bold text-slate-800">
                            ₹ {row.initialQuoteTotal.toLocaleString('en-IN')}
                          </div>
                          <span className="text-[10px] text-slate-500">Quote 1</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Awaiting Quote</span>
                      )}
                    </td>

                    {/* 4. Latest Submitted Quote (Final Quote) */}
                    <td className="py-2.5 px-3 text-right">
                      {row.latestSubmittedQuoteTotal !== null ? (
                        <div>
                          <div className="font-mono font-bold text-slate-900">
                            ₹ {row.latestSubmittedQuoteTotal.toLocaleString('en-IN')}
                          </div>
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              row.quoteType === 'REVISED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {row.quoteType === 'REVISED' ? 'Revised Quote' : 'Initial Quote'}
                          </span>
                          {row.pendingBuyerOffer && (
                            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                              Awaiting Vendor Response
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Awaiting Quote</span>
                      )}
                    </td>

                    {/* 5. Current Negotiation Status */}
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          row.statusTone === 'emerald'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : row.statusTone === 'amber'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : row.statusTone === 'purple'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : row.statusTone === 'rose'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : row.statusTone === 'blue'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {row.negStatus}
                      </span>
                    </td>

                    {/* 6. Dynamic Rank */}
                    <td className="py-2.5 px-2 text-center">
                      {row.rank === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ★ L1
                        </span>
                      ) : row.rank ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          L{row.rank}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* 7. Action */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedTargetVendorId(row.vendorId)}
                          className={`btn btn-xs ${
                            isSelected
                              ? 'bg-blue-600 text-white font-bold'
                              : 'btn-secondary text-slate-700'
                          }`}
                        >
                          {isSelected ? 'Active Target' : 'Select Vendor'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryModalVendor(row)}
                          className="btn btn-secondary btn-xs text-slate-600 inline-flex items-center gap-1"
                          title="View complete chronological negotiation history for this vendor"
                        >
                          <History size={11} />
                          <span>View History</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. COMPACT HORIZONTAL SUMMARY STRIP                          */}
      {/* ============================================================ */}
      <div
        id="rfq-negotiation-summary-strip"
        className="flex items-center justify-between gap-4 flex-wrap p-2.5 px-4 bg-slate-50 border border-slate-200 rounded-lg text-xs shadow-2xs"
      >
        {/* AI Benchmark */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-semibold">AI Benchmark:</span>
          {aiBenchmarkTotal > 0 ? (
            <span className="font-mono font-bold text-blue-900">
              ₹ {aiBenchmarkTotal.toLocaleString('en-IN')}
            </span>
          ) : (
            <span className="text-slate-400 italic">Benchmark Unavailable</span>
          )}
        </div>

        {/* L1 Vendor */}
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">
            L1
          </span>
          {l1Vendor ? (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-800">{l1Vendor.vendorName}:</span>
              <span className="font-mono font-bold text-emerald-800">
                ₹ {l1Vendor.totalQuoteAmount?.toLocaleString('en-IN')}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">No quotations</span>
          )}
        </div>

        {/* L2 Vendor */}
        {l2Vendor && (
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white">
              L2
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-800">{l2Vendor.vendorName}:</span>
              <span className="font-mono font-bold text-slate-700">
                ₹ {l2Vendor.totalQuoteAmount?.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

        {/* L3 Vendor */}
        {l3Vendor && (
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-600 text-white">
              L3
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-800">{l3Vendor.vendorName}:</span>
              <span className="font-mono font-bold text-slate-700">
                ₹ {l3Vendor.totalQuoteAmount?.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

        {/* Potential Savings */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-semibold">Potential Savings:</span>
          {aiBenchmarkTotal > 0 && l1Vendor ? (
            <span
              className={`font-mono font-bold ${
                comparisonSavings >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              ₹ {comparisonSavings.toLocaleString('en-IN')} ({comparisonSavingsPercent >= 0 ? `▲ ${comparisonSavingsPercent}%` : `▼ ${comparisonSavingsPercent}%`})
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. REFINED ENTERPRISE LINE-ITEM COMMERCIAL TABLE             */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Validation Notice Bar for Selected Vendor */}
        {!hasQuote1 && (
          <div className="p-3 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle size={15} />
            <span>
              <strong>Quote 1 Required:</strong> {selectedVendor?.vendorName || selectedVendor?.name || 'Selected vendor'} has not submitted an initial quote yet. Buyer counteroffers can only be issued after Quote 1 is received.
            </span>
          </div>
        )}
        {hasQuote1 && maxBuyerOffersReached && (
          <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle size={15} />
            <span>
              <strong>Round Limit Reached:</strong> Maximum 4 buyer counteroffers have already been issued for {selectedVendor?.vendorName || selectedVendor?.name || 'this vendor'}. Further counteroffers are blocked.
            </span>
          </div>
        )}
        {hasQuote1 && !maxBuyerOffersReached && isPendingVendorResponse && (
          <div className="p-2.5 bg-blue-50 border-b border-blue-200 text-blue-800 text-xs flex items-center gap-2 font-medium">
            <Info size={14} />
            <span>
              <strong>Vendor Turn:</strong> Buyer Offer {selectedVendorBuyerOffers.length} has been dispatched. Vendor response is currently awaited.
            </span>
          </div>
        )}

        {/* Table Controls & Batch Negotiation Bar */}
        <div className="p-3.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Negotiation Target:
            </span>
            <select
              value={selectedTargetVendorId}
              onChange={(e) => setSelectedTargetVendorId(e.target.value)}
              className="text-xs font-semibold py-1.5 px-3 rounded border border-slate-300 bg-white shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              {comparison?.vendors?.map((v: any) => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.rank === 1 ? '★ [L1] ' : `[L${v.rank}] `}
                  {v.vendorName} (Quote: ₹ {v.totalQuoteAmount?.toLocaleString()})
                </option>
              ))}
              {(!comparison?.vendors || comparison.vendors.length === 0) &&
                rfq.invitedVendors?.map((iv: any) => (
                  <option key={iv.vendorId} value={iv.vendorId}>
                    {iv.vendor?.name} ({iv.vendor?.code})
                  </option>
                ))}
            </select>

            <span className="text-xs text-slate-500 font-medium">
              {modifiedLinesCount > 0 ? (
                <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded">
                  {modifiedLinesCount} lines with proposed counteroffers
                </span>
              ) : (
                <span>Enter proposed rates in Buyer Target Rate column</span>
              )}
            </span>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {draftSavedTimestamp && (
              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 flex items-center gap-1 font-medium">
                <Check size={12} /> Draft saved at {draftSavedTimestamp}
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveDraft}
              className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1.5"
              title="Save current counteroffer rates to browser cache"
            >
              <Save size={13} /> Save Draft
            </button>

            <button
              type="button"
              onClick={handleRequestReset}
              className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1.5 text-slate-600"
              title="Reset all modified line counter rates"
            >
              <RotateCcw size={13} /> Reset
            </button>

            <button
              type="button"
              onClick={handleInitiateBulkSubmission}
              disabled={submittingOffer || actionLoading || eligibleVendors.length === 0}
              className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1.5 font-bold px-3 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"
              title="Send the same buyer offer to all eligible invited vendors at once"
            >
              <Users size={13} />
              <span>Bulk Dispatch ({eligibleVendors.length} Eligible)</span>
            </button>

            <button
              type="button"
              onClick={handleInitiateSubmission}
              disabled={submittingOffer || actionLoading || !hasQuote1 || maxBuyerOffersReached}
              className={`btn btn-primary btn-sm text-xs inline-flex items-center gap-1.5 font-bold px-4 ${
                !hasQuote1 || maxBuyerOffersReached
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed hover:bg-slate-300'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={
                !hasQuote1
                  ? 'Vendor must submit Quote 1 before counteroffers can be issued'
                  : maxBuyerOffersReached
                  ? 'Maximum 4 buyer counteroffers already reached for this vendor'
                  : isPendingVendorResponse
                  ? 'Issue superseding counteroffer for this vendor'
                  : 'Submit line counteroffer to vendor'
              }
            >
              <Send size={13} />
              <span>
                {submittingOffer
                  ? 'Dispatching...'
                  : !hasQuote1
                  ? 'Quote 1 Awaited'
                  : maxBuyerOffersReached
                  ? 'Round Limit Reached (Max 4)'
                  : isPendingVendorResponse
                  ? `Issue Superseding Offer (₹ ${proposedCounterTotal.toLocaleString()})`
                  : modifiedLinesCount > 1
                  ? `Submit Counteroffers (${modifiedLinesCount} lines)`
                  : modifiedLinesCount === 1
                  ? 'Submit Offer (1 line)'
                  : `Submit Counteroffer (₹ ${proposedCounterTotal.toLocaleString()})`}
              </span>
            </button>
          </div>
        </div>

        {/* Batch Selection Action Bar (when rows are checked) */}
        {selectedLineIds.length > 0 && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-blue-900">
                {selectedLineIds.length} of {allLines.length} lines selected
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-700 font-medium">Apply quick discount to selected lines:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleApplyBatchDiscount(3)}
                  className="px-2 py-0.5 rounded bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 font-semibold"
                >
                  -3%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyBatchDiscount(5)}
                  className="px-2 py-0.5 rounded bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 font-semibold"
                >
                  -5%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyBatchDiscount(8)}
                  className="px-2 py-0.5 rounded bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 font-semibold"
                >
                  -8%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyBatchDiscount(10)}
                  className="px-2 py-0.5 rounded bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 font-semibold"
                >
                  -10%
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedLineIds([])}
              className="text-xs text-blue-700 hover:text-blue-900 font-medium underline"
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* The Scrollable Commercial Table Container with High-Visibility Horizontal Scrollbar */}
        <div
          id="rfq-commercial-table-container"
          className="table-responsive w-full"
          style={{
            maxHeight: '70vh',
            overflowX: 'auto',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#94a3b8 #f1f5f9',
          }}
        >
          <table
            className="enterprise-table text-xs w-full border-collapse"
            style={{
              minWidth: `${tableMinWidth}px`,
              tableLayout: 'auto',
            }}
          >
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-2xs">
              {/* Row 1: High-Level Grouped Hierarchy Headers */}
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                <th
                  colSpan={5}
                  className="bg-slate-100 text-slate-700 py-2.5 px-3 border-r border-slate-200 text-left whitespace-nowrap"
                >
                  1. Scope & Baseline
                </th>
                <th
                  colSpan={1}
                  className="bg-blue-50/80 text-blue-900 py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap"
                >
                  2. AI Benchmark
                </th>
                {/* Dynamic Vendor Column Groups */}
                {comparison?.vendors?.map((v: any, vIdx: number) => (
                  <th
                    key={v.vendorId}
                    colSpan={2}
                    className={`py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap ${
                      v.vendorId === selectedTargetVendorId
                        ? 'bg-amber-50 text-amber-900 border-amber-300 font-bold'
                        : v.rank === 1
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'bg-slate-50 text-slate-800'
                    }`}
                    title={`Supplier ${vIdx + 1}: ${v.vendorName} (Quote Version: ${v.quoteVersion})`}
                  >
                    <div className="flex items-center justify-center gap-1.5 truncate max-w-[210px] mx-auto">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        v.rank === 1 ? 'bg-emerald-600 text-white' : v.rank === 2 ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'
                      }`}>
                        L{v.rank}
                      </span>
                      <span className="truncate">{v.vendorName}</span>
                      {v.quoteVersion ? <span className="text-[10px] opacity-75">(v{v.quoteVersion})</span> : null}
                    </div>
                  </th>
                ))}
                {(!comparison?.vendors || comparison.vendors.length === 0) && (
                  <th
                    colSpan={2}
                    className="bg-slate-50 text-slate-500 py-2.5 px-3 text-center border-r border-slate-200 whitespace-nowrap"
                  >
                    Vendor Quotations
                  </th>
                )}
                <th
                  colSpan={1}
                  className="bg-amber-100/70 text-amber-950 py-2.5 px-3 border-r border-slate-300 text-center whitespace-nowrap"
                >
                  3. Buyer Target / Counteroffer
                </th>
                <th
                  colSpan={1}
                  className="bg-slate-100 text-slate-700 py-2.5 px-2 text-center whitespace-nowrap"
                >
                  Actions
                </th>
              </tr>

              {/* Row 2: 14 Exact Column Labels */}
              <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-700 text-xs font-bold">
                {/* 1. Selection Checkbox */}
                <th
                  className="w-10 min-w-[40px] max-w-[40px] text-center py-2 px-2 border-r border-slate-200 whitespace-nowrap"
                  title="Select All Lines"
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>

                {/* 2. S. No. */}
                <th
                  className="w-12 min-w-[44px] max-w-[44px] text-center py-2 px-2 border-r border-slate-200 whitespace-nowrap"
                  title="Line Item Serial Number"
                >
                  #
                </th>

                {/* 3. Item Description / Specification */}
                <th
                  className="w-64 min-w-[240px] py-2 px-3 text-left border-r border-slate-200 whitespace-nowrap"
                  title="Item Scope Description & Specification"
                >
                  Item Description / Specification
                </th>

                {/* 4. UOM */}
                <th
                  className="w-16 min-w-[60px] text-center py-2 px-2 border-r border-slate-200 whitespace-nowrap"
                  title="Unit of Measurement"
                >
                  UOM
                </th>

                {/* 5. Quantity */}
                <th
                  className="w-20 min-w-[76px] text-right py-2 px-2.5 border-r border-slate-200 whitespace-nowrap"
                  title="Approved Baseline Quantity"
                >
                  Qty
                </th>

                {/* 6. AI Rate */}
                <th
                  className="w-28 min-w-[105px] text-right py-2 px-2.5 bg-blue-50/60 text-blue-900 border-r border-slate-200 whitespace-nowrap"
                  title="AI Estimated Unit Rate (₹)"
                >
                  AI Rate
                </th>

                {/* Dynamic Vendor Subcolumns: Rate and Amount */}
                {comparison?.vendors?.map((v: any) => (
                  <React.Fragment key={v.vendorId}>
                    <th
                      className="w-28 min-w-[105px] text-right py-2 px-2.5 whitespace-nowrap"
                      title={`${v.vendorName}: Quoted Unit Rate (₹)`}
                    >
                      Rate
                    </th>
                    <th
                      className="w-32 min-w-[115px] text-right py-2 px-2.5 border-r border-slate-200 whitespace-nowrap"
                      title={`${v.vendorName}: Quoted Line Total Amount (₹)`}
                    >
                      Amount
                    </th>
                  </React.Fragment>
                ))}
                {(!comparison?.vendors || comparison.vendors.length === 0) && (
                  <>
                    <th className="w-28 min-w-[105px] text-right py-2 px-2.5 text-slate-400 whitespace-nowrap">
                      Rate
                    </th>
                    <th className="w-32 min-w-[115px] text-right py-2 px-2.5 text-slate-400 border-r border-slate-200 whitespace-nowrap">
                      Amount
                    </th>
                  </>
                )}

                {/* 13. Buyer Target / Counteroffer Rate */}
                <th
                  className="w-40 min-w-[160px] text-right py-2 px-2.5 bg-amber-50/70 text-amber-950 border-r border-slate-300 whitespace-nowrap"
                  title="Buyer Proposed Counteroffer Unit Rate (₹)"
                >
                  Buyer Target / Counter Rate
                </th>

                {/* 14. Actions */}
                <th
                  className="w-20 min-w-[76px] text-center py-2 px-2 whitespace-nowrap"
                  title="Line-Item Technical Specifications and Benchmarks"
                >
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rfq.lines?.map((line: any, idx: number) => {
                const compLine = comparison?.lines?.find(
                  (cl: any) => cl.id === line.id || cl.lineNumber === line.lineNumber
                );
                const isExpanded = expandedLineId === line.id;

                // Proposed counteroffer values
                const userCounterRate = lineCounterRates[line.id];
                const activeVendorQuote = rfq.quotes
                  ?.find((q: any) => q.vendorId === selectedTargetVendorId)
                  ?.lines?.find((l: any) => l.rfqLineId === line.id);

                const currentBaseRate = activeVendorQuote?.unitRate || line.benchmarkRate || 0;
                const effectiveCounterRate = userCounterRate !== undefined ? userCounterRate : currentBaseRate;

                return (
                  <React.Fragment key={line.id}>
                    <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                      {/* 1. Selection Checkbox */}
                      <td className="text-center py-2.5 px-2 align-middle border-r border-slate-200">
                        <input
                          type="checkbox"
                          checked={selectedLineIds.includes(line.id)}
                          onChange={() => toggleSelectLine(line.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* 2. S. No. */}
                      <td className="text-center font-mono font-medium text-slate-500 py-2.5 px-2 align-middle border-r border-slate-200">
                        {line.lineNumber || idx + 1}
                      </td>

                      {/* 3. Item Description / Specification (Click opens full detail drawer) */}
                      <td className="py-2.5 px-3 align-middle border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => setSelectedLineForDetail(line)}
                          className="text-left group flex flex-col focus:outline-none w-full"
                          title="Click to view complete technical specification, scope, location, and AI cost breakdown"
                        >
                          <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors inline-flex items-center gap-1.5 leading-tight">
                            <span className="truncate max-w-[210px]">{line.description}</span>
                            <Info size={13} className="text-blue-500 opacity-60 group-hover:opacity-100 shrink-0" />
                          </span>
                          <span className="text-[11px] text-slate-500 truncate max-w-[210px] mt-0.5" title={line.specification}>
                            {line.specification || line.itemCode || `LINE-${line.lineNumber}`}
                          </span>
                        </button>
                      </td>

                      {/* 4. UOM */}
                      <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap border-r border-slate-200">
                        <span className="badge badge-draft text-[11px]">{line.uom}</span>
                      </td>

                      {/* 5. Quantity */}
                      <td className="py-2.5 px-2.5 text-right font-bold text-slate-800 border-r border-slate-200 tabular-nums font-mono align-middle whitespace-nowrap">
                        {line.quantity?.toLocaleString()}
                      </td>

                      {/* 6. AI Rate */}
                      <td className="py-2.5 px-2.5 text-right bg-blue-50/30 border-r border-slate-200 tabular-nums font-mono align-middle whitespace-nowrap">
                        <span className="font-bold text-blue-900">
                          ₹ {(line.benchmarkRate || compLine?.aiUnitCost || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Dynamic Vendor Quoted Rates & Line Amounts */}
                      {comparison?.vendors?.map((v: any) => {
                        const vQuote = compLine?.vendorQuotes?.[v.vendorId];
                        const isL1ForLine = compLine?.lowestCompliantVendorId === v.vendorId;

                        return (
                          <React.Fragment key={v.vendorId}>
                            <td
                              className={`py-2.5 px-2.5 text-right font-semibold tabular-nums font-mono align-middle whitespace-nowrap ${
                                isL1ForLine ? 'bg-emerald-50/50 text-emerald-800' : 'text-slate-800'
                              }`}
                            >
                              {vQuote?.quoted ? (
                                <div>
                                  <span>₹ {vQuote.rate.toLocaleString()}</span>
                                  {isL1ForLine && (
                                    <span className="block text-[9px] font-bold text-emerald-700 tracking-wider">
                                      ★ L1
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td
                              className={`py-2.5 px-2.5 text-right border-r border-slate-200 tabular-nums font-mono align-middle whitespace-nowrap ${
                                isL1ForLine ? 'bg-emerald-50/50 text-emerald-900 font-bold' : 'text-slate-600'
                              }`}
                            >
                              {vQuote?.quoted ? (
                                <span>₹ {(vQuote.amount || vQuote.rate * line.quantity).toLocaleString()}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {(!comparison?.vendors || comparison.vendors.length === 0) && (
                        <>
                          <td className="py-2.5 px-2.5 text-right text-slate-400 align-middle whitespace-nowrap">—</td>
                          <td className="py-2.5 px-2.5 text-right text-slate-400 border-r border-slate-200 align-middle whitespace-nowrap">—</td>
                        </>
                      )}

                      {/* 13. Buyer Target / Counteroffer Rate */}
                      <td className="py-2 px-2.5 bg-amber-50/40 border-r border-slate-300 align-middle whitespace-nowrap">
                        <div className="relative inline-flex items-center w-full">
                          <span className="absolute left-2.5 text-slate-400 text-xs select-none pointer-events-none">
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
                            className={`w-full pl-6 pr-2 py-1 text-right font-mono font-bold text-xs rounded border transition-all ${
                              userCounterRate !== undefined
                                ? 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-400'
                                : 'border-slate-300 bg-white text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-500'
                            }`}
                          />
                        </div>
                      </td>

                      {/* 14. Actions */}
                      <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLineForDetail(line)}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                          title="Open detailed technical specification, AI cost breakdown, and counteroffer drawer"
                        >
                          Details
                        </button>
                      </td>
                    </tr>

                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
              <tr className="text-xs">
                <td colSpan={5} className="py-3 px-3 text-right uppercase tracking-wider text-slate-700 whitespace-nowrap border-r border-slate-200">
                  Total Package Commercial Value:
                </td>
                <td className="py-3 px-2.5 text-right text-blue-900 border-r border-slate-200 tabular-nums font-mono whitespace-nowrap">
                  ₹ {aiBenchmarkTotal.toLocaleString('en-IN')}
                </td>

                {/* Vendor Totals */}
                {comparison?.vendors?.map((v: any) => (
                  <React.Fragment key={v.vendorId}>
                    <td className="py-3 px-2.5 text-right text-slate-500 whitespace-nowrap">—</td>
                    <td
                      className={`py-3 px-2.5 text-right border-r border-slate-200 tabular-nums font-mono whitespace-nowrap ${
                        v.rank === 1 ? 'text-emerald-800' : 'text-slate-800'
                      }`}
                    >
                      ₹ {v.totalQuoteAmount?.toLocaleString('en-IN')}
                    </td>
                  </React.Fragment>
                ))}
                {(!comparison?.vendors || comparison.vendors.length === 0) && (
                  <>
                    <td className="py-3 px-2.5 text-right text-slate-400 whitespace-nowrap">—</td>
                    <td className="py-3 px-2.5 text-right text-slate-400 border-r border-slate-200 whitespace-nowrap">—</td>
                  </>
                )}

                {/* Counteroffer Totals */}
                <td className="py-3 px-2.5 text-right bg-amber-50/60 border-r border-slate-300 tabular-nums font-mono text-amber-950 font-black whitespace-nowrap">
                  ₹ {proposedCounterTotal.toLocaleString('en-IN')}
                </td>

                <td className="py-3 px-2 text-center text-slate-400 whitespace-nowrap">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. CONSOLIDATED COMMERCIAL TERMS SECTION (BELOW TABLE)       */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div
          onClick={() => setShowCommercialTerms(!showCommercialTerms)}
          className="flex items-center justify-between p-4 bg-slate-50/80 hover:bg-slate-100 cursor-pointer select-none transition-colors border-b border-slate-200"
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 m-0">
              Consolidated Commercial Terms & Vendor Specific Conditions
            </h3>
            <span className="badge badge-info text-xs ml-2">
              {comparison?.vendors?.length || 0} Quoting Suppliers Compared
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm text-xs font-semibold text-blue-700"
            onClick={(e) => {
              e.stopPropagation();
              setShowCommercialTerms(!showCommercialTerms);
            }}
          >
            {showCommercialTerms ? 'Collapse Terms ▲' : 'Expand Terms & Deviations ▼'}
          </button>
        </div>

        {showCommercialTerms && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-slate-500 m-0">
              Side-by-side verification of payment terms, GST treatments, warranties, delivery lead times and deviations.
            </p>

        {/* Commercial Terms Matrix Grid */}
        <div className="table-responsive w-full" style={{ overflowX: 'auto' }}>
          <table className="enterprise-table text-xs w-full min-w-[950px] border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="w-56 min-w-[200px] py-2.5 px-3 whitespace-nowrap">Commercial Condition</th>
                <th className="w-64 min-w-[230px] py-2.5 px-3 bg-blue-50/70 text-blue-900 font-bold whitespace-nowrap">
                  RFQ Published Baseline
                </th>
                {comparison?.vendors?.map((v: any) => (
                  <th
                    key={v.vendorId}
                    className={`py-2.5 px-3 font-bold whitespace-nowrap min-w-[220px] ${
                      v.vendorId === selectedTargetVendorId
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : 'bg-slate-50 text-slate-800'
                    }`}
                  >
                    {v.vendorName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Payment Terms */}
              <tr>
                <td className="font-semibold text-slate-700 py-2.5 px-3 whitespace-nowrap">
                  Payment Terms & Credit Period
                </td>
                <td className="py-2.5 px-3 bg-blue-50/20 text-slate-800">
                  {rfq.paymentTerms || '30 days net from certified invoice'}
                </td>
                {comparison?.vendors?.map((v: any) => (
                  <td key={v.vendorId} className="py-2.5 px-3 font-medium text-slate-800">
                    {v.paymentTermsOffered || v.paymentTerms || 'Net 30 days from RA bill'}
                  </td>
                ))}
              </tr>

              {/* Taxes & GST */}
              <tr>
                <td className="font-semibold text-slate-700 py-2.5 px-3 whitespace-nowrap">
                  Taxes & GST Treatment
                </td>
                <td className="py-2.5 px-3 bg-blue-50/20 text-slate-800">
                  18% GST Applicable (Vendor must provide GST Tax Invoice)
                </td>
                {comparison?.vendors?.map((v: any) => (
                  <td key={v.vendorId} className="py-2.5 px-3 text-slate-800">
                    18% GST extra; ITC eligible
                  </td>
                ))}
              </tr>

              {/* Delivery Lead Time */}
              <tr>
                <td className="font-semibold text-slate-700 py-2.5 px-3 whitespace-nowrap">
                  Delivery Schedule & Lead Time
                </td>
                <td className="py-2.5 px-3 bg-blue-50/20 text-slate-800">
                  {rfq.deliveryRequirement || 'Site delivery within 30 days of PPO'}
                </td>
                {comparison?.vendors?.map((v: any) => (
                  <td key={v.vendorId} className="py-2.5 px-3 text-slate-800">
                    <span className="font-bold text-slate-900">
                      {v.deliveryLeadTimeDays || v.deliveryDays || 30} calendar days
                    </span>
                  </td>
                ))}
              </tr>

              {/* Freight & Installation */}
              <tr>
                <td className="font-semibold text-slate-700 py-2.5 px-3 whitespace-nowrap">
                  Freight & Unloading Terms
                </td>
                <td className="py-2.5 px-3 bg-blue-50/20 text-slate-800">
                  FOB Job Site (Kundanahalli, Bengaluru); inclusive in quote
                </td>
                {comparison?.vendors?.map((v: any) => (
                  <td key={v.vendorId} className="py-2.5 px-3 text-slate-800">
                    Door delivery included up to site unloading
                  </td>
                ))}
              </tr>

              {/* Warranty & Defect Liability */}
              <tr>
                <td className="font-semibold text-slate-700 py-2.5 px-3 whitespace-nowrap">
                  Warranty & Defects Liability
                </td>
                <td className="py-2.5 px-3 bg-blue-50/20 text-slate-800">
                  12 Months defect liability period from handover
                </td>
                {comparison?.vendors?.map((v: any) => (
                  <td key={v.vendorId} className="py-2.5 px-3 text-slate-800">
                    {v.warranty || '12 Months comprehensive warranty'}
                  </td>
                ))}
              </tr>

              {/* Quote Validity */}
              <tr>
                <td className="font-semibold text-slate-700 py-2.5 px-3 whitespace-nowrap">
                  Commercial Offer Validity
                </td>
                <td className="py-2.5 px-3 bg-blue-50/20 text-slate-800">
                  {rfq.commercialValidityDays || 60} Days from submission deadline
                </td>
                {comparison?.vendors?.map((v: any) => (
                  <td key={v.vendorId} className="py-2.5 px-3 text-slate-800">
                    60 Days from bid date
                  </td>
                ))}
              </tr>

              {/* Vendor Remarks & Deviations */}
              <tr>
                <td className="font-semibold text-slate-700 py-2.5 px-3 whitespace-nowrap">
                  Vendor Deviations & Remarks
                </td>
                <td className="py-2.5 px-3 bg-blue-50/20 text-slate-500 italic">
                  Standard enterprise tender conditions apply
                </td>
                {comparison?.vendors?.map((v: any) => (
                  <td key={v.vendorId} className="py-2.5 px-3 text-slate-700">
                    {v.commercialTerms || 'No technical or commercial deviations noted.'}
                  </td>
                ))}
              </tr>
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. MANDATORY STICKY BOTTOM ACTION BAR                        */}
      {/* ============================================================ */}
      <div
        id="rfq-bottom-action-bar"
        className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t-2 border-slate-300 shadow-2xl p-3 px-4 flex flex-wrap items-center justify-between gap-4 -mx-1 rounded-b-xl"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Negotiation Target:
            </span>
            <select
              value={selectedTargetVendorId}
              onChange={(e) => setSelectedTargetVendorId(e.target.value)}
              className="text-xs font-bold py-1.5 px-3 rounded border border-slate-300 bg-white shadow-2xs focus:border-blue-600 focus:outline-none"
            >
              {comparison?.vendors?.map((v: any) => (
                <option key={v.vendorId} value={v.vendorId}>
                  [L{v.rank}] {v.vendorName} (Quote: ₹ {v.totalQuoteAmount?.toLocaleString()})
                </option>
              ))}
              {(!comparison?.vendors || comparison.vendors.length === 0) &&
                rfq.invitedVendors?.map((iv: any) => (
                  <option key={iv.vendorId} value={iv.vendorId}>
                    {iv.vendor?.name} ({iv.vendor?.code})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold ${
                modifiedLinesCount > 0
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {modifiedLinesCount === 1
                ? '1 line modified'
                : modifiedLinesCount > 1
                ? `${modifiedLinesCount} lines modified`
                : 'No lines modified'}
            </span>

            <span className="text-xs text-slate-700">
              Counteroffer Total:{' '}
              <strong className="font-mono text-sm text-slate-900 font-black">
                ₹ {proposedCounterTotal.toLocaleString()}
              </strong>
            </span>

            {counterSavings > 0 && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Potential Savings: ₹ {counterSavings.toLocaleString()} ({counterSavingsPercent}%)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {draftSavedTimestamp && (
            <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 flex items-center gap-1 font-medium">
              <Check size={12} /> Draft saved at {draftSavedTimestamp}
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveDraft}
            className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1.5"
            title="Save draft counteroffer rates to browser cache"
          >
            <Save size={13} /> Save Draft
          </button>

          <button
            type="button"
            onClick={handleRequestReset}
            className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1.5 text-slate-600"
            title="Reset all modified line counter rates"
          >
            <RotateCcw size={13} /> Reset
          </button>

          {eligibleVendors.length > 1 && (
            <button
              type="button"
              onClick={handleInitiateBulkSubmission}
              disabled={submittingOffer || actionLoading}
              className="btn btn-sm text-xs inline-flex items-center gap-1.5 font-bold px-3.5 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
              title="Dispatch this buyer counteroffer to all eligible invited vendors at once"
            >
              <Users size={13} />
              <span>Bulk Dispatch ({eligibleVendors.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleInitiateSubmission}
            disabled={submittingOffer || actionLoading || maxBuyerOffersReached || !hasQuote1}
            className={`btn btn-sm text-xs inline-flex items-center gap-2 font-bold px-4 shadow-sm ${
              maxBuyerOffersReached || !hasQuote1
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                : isPendingVendorResponse
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'btn-primary bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            title={
              !hasQuote1
                ? 'Awaiting Vendor Quote 1 before counteroffers can be made'
                : maxBuyerOffersReached
                ? 'Maximum 4 buyer offers already issued for this vendor'
                : isPendingVendorResponse
                ? 'Issue an auditable superseding counteroffer while preserving the pending offer in history'
                : 'Dispatch buyer counteroffer'
            }
          >
            <Send size={13} />
            <span>
              {submittingOffer
                ? 'Dispatching...'
                : isPendingVendorResponse
                ? modifiedLinesCount > 1
                  ? `Issue Superseding Offers (${modifiedLinesCount} lines)`
                  : 'Issue Superseding Offer'
                : maxBuyerOffersReached
                ? 'Max Offers Reached (4/4)'
                : !hasQuote1
                ? 'Awaiting Quote 1'
                : modifiedLinesCount > 1
                ? `Submit Counteroffers (${modifiedLinesCount} lines)`
                : modifiedLinesCount === 1
                ? 'Submit Offer (1 line)'
                : 'Submit Offer'}
            </span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. ITEM DETAILS & AI COST BREAKDOWN SLIDE-OVER DRAWER        */}
      {/* ============================================================ */}
      {selectedLineForDetail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
            onClick={() => setSelectedLineForDetail(null)}
          />

          {/* Drawer Body */}
          <div
            id="item-details-drawer"
            className="relative z-50 w-full sm:w-[540px] md:w-[600px] bg-white h-full shadow-2xl flex flex-col border-l border-slate-200"
          >
            {/* Drawer Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    Line {selectedLineForDetail.lineNumber}
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    {selectedLineForDetail.itemCode || `CV-LINE-${selectedLineForDetail.lineNumber}`}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1 m-0">
                  {selectedLineForDetail.description}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLineForDetail(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                title="Close Item Details Panel"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-700">
              {/* Scope Baseline Info */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 m-0">
                  <FileText size={14} className="text-blue-600" /> Technical Scope & Specification
                </h4>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed text-slate-800">
                  {selectedLineForDetail.specification || 'Commercial grade standard material & workmanship as per BOQ.'}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Quantity & UOM</span>
                    <strong className="text-slate-900 font-mono text-sm">
                      {selectedLineForDetail.quantity?.toLocaleString()} {selectedLineForDetail.uom}
                    </strong>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Category / Package</span>
                    <strong className="text-slate-900 text-sm">
                      {selectedLineForDetail.category || 'Interior Fitouts'}
                    </strong>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Delivery Location</span>
                    <strong className="text-slate-900 text-sm">
                      {rfq.deliveryRequirement || 'Site delivery — Kundanahalli, Bengaluru'}
                    </strong>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Cost Centre</span>
                    <strong className="text-slate-900 text-sm">
                      {rfq.pr?.costCentre?.code || rfq.costCentre || 'CC45'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* AI Cost Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 m-0">
                  <Sparkles size={14} className="text-blue-600" /> AI Benchmark Cost Breakdown
                </h4>
                <div className="bg-blue-50/60 p-3.5 rounded-lg border border-blue-200 space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-blue-200/80">
                    <span className="font-semibold text-blue-950">AI Total Benchmark Rate:</span>
                    <span className="font-mono font-bold text-sm text-blue-900">
                      ₹ {(selectedLineForDetail.benchmarkRate || 0).toLocaleString()} / {selectedLineForDetail.uom}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span>Material Cost (~60%):</span>
                    <strong className="font-mono text-slate-900">
                      ₹ {Math.round((selectedLineForDetail.benchmarkRate || 100) * 0.6).toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span>Direct Labour (~22%):</span>
                    <strong className="font-mono text-slate-900">
                      ₹ {Math.round((selectedLineForDetail.benchmarkRate || 100) * 0.22).toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span>Freight, Tools & Other (~10%):</span>
                    <strong className="font-mono text-slate-900">
                      ₹ {Math.round((selectedLineForDetail.benchmarkRate || 100) * 0.10).toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center border-t border-blue-200 pt-1.5 text-blue-950 font-semibold">
                    <span>Contractor Margin (~8%):</span>
                    <strong className="font-mono text-blue-900">
                      ₹ {Math.round((selectedLineForDetail.benchmarkRate || 100) * 0.08).toLocaleString()}
                    </strong>
                  </div>
                  <div className="pt-1 text-[11px] text-blue-700/80 flex items-center gap-1">
                    <Info size={12} /> Sourced from AI Cost Engine & Historical Award Rates
                  </div>
                </div>
              </div>

              {/* Historical PO & Rate Card Cross-References */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 m-0">
                  <Tag size={14} className="text-emerald-600" /> Historical Cost & Rate Card Benchmarks
                </h4>
                <div className="bg-emerald-50/50 p-3.5 rounded-lg border border-emerald-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700">Historical PPO Rate:</span>
                    <strong className="font-mono text-slate-900">
                      {compLineForDetail?.historicalPpoRate
                        ? `₹ ${compLineForDetail.historicalPpoRate.toLocaleString()} (${compLineForDetail.historicalPpoNumber || 'PO Ref'})`
                        : '—'}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700">Approved Rate Card:</span>
                    <strong className="font-mono text-emerald-900">
                      {compLineForDetail?.rateCardRate
                        ? `₹ ${compLineForDetail.rateCardRate.toLocaleString()} (${compLineForDetail.rateCardNumber || 'VRC Ref'})`
                        : 'None Approved'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Vendor Quotes Comparison for This Line */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 m-0">
                  <Scale size={14} className="text-indigo-600" /> Vendor Quoted Rates for This Item
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Vendor</th>
                        <th className="py-2 px-3 text-right">Quoted Rate</th>
                        <th className="py-2 px-3 text-right">Line Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparison?.vendors?.map((v: any) => {
                        const vQuote = compLineForDetail?.vendorQuotes?.[v.vendorId];
                        const isL1 = compLineForDetail?.lowestCompliantVendorId === v.vendorId;
                        return (
                          <tr key={v.vendorId} className={isL1 ? 'bg-emerald-50/40' : ''}>
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              {v.vendorName}
                              {isL1 && <span className="ml-1.5 text-[10px] text-emerald-700 font-bold">★ L1</span>}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold">
                              {vQuote?.quoted ? `₹ ${vQuote.rate.toLocaleString()}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {vQuote?.quoted
                                ? `₹ ${(vQuote.amount || vQuote.rate * selectedLineForDetail.quantity).toLocaleString()}`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Amber: Quick Counteroffer */}
              <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5 m-0">
                    <Send size={13} className="text-amber-700" /> Quick Counteroffer
                  </h4>
                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded">
                    Target: {selectedVendor?.vendorName || selectedVendor?.name || 'Selected Vendor'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Buyer Counteroffer Unit Rate (₹ / {selectedLineForDetail.uom})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={drawerRateInput}
                      onChange={(e) => setDrawerRateInput(e.target.value)}
                      placeholder={String(activeVendorQuoteForDetail?.unitRate || selectedLineForDetail.benchmarkRate || '')}
                      className="w-full pl-7 pr-3 py-1.5 border border-slate-300 rounded font-mono font-bold text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-amber-100/60 rounded border border-amber-200 text-xs">
                  <span className="font-semibold text-amber-950">Calculated Proposed Line Amount:</span>
                  <span className="font-mono font-bold text-sm text-amber-950">
                    ₹{' '}
                    {drawerRateInput !== '' && Number(drawerRateInput) > 0
                      ? (Number(drawerRateInput) * selectedLineForDetail.quantity).toLocaleString()
                      : (
                          (activeVendorQuoteForDetail?.unitRate || selectedLineForDetail.benchmarkRate || 0) *
                          selectedLineForDetail.quantity
                        ).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedLineForDetail(null)}
                    className="btn btn-secondary btn-sm text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDrawerRate}
                    disabled={drawerRateInput === '' || Number(drawerRateInput) <= 0}
                    className="btn btn-primary btn-sm text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold"
                  >
                    Apply to Commercial Table
                  </button>
                </div>
                <p className="text-[11px] text-amber-800/90 m-0">
                  * “Apply to Commercial Table” updates the unsent offer in the table. Explicit submission via the bottom bar is required to dispatch to the vendor.
                </p>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-[11px] text-slate-500">
                Line {selectedLineForDetail.lineNumber} of {rfq.lines?.length || 0}
              </span>
              <button
                type="button"
                onClick={() => setSelectedLineForDetail(null)}
                className="btn btn-secondary btn-sm text-xs font-semibold px-4"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* RESET CONFIRMATION MODAL                                     */}
      {/* ============================================================ */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs"
            onClick={() => setShowResetModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Reset Counteroffer Rates?</h3>
                <p className="text-xs text-slate-600 mt-1">
                  You have unsaved counteroffers entered across <strong>{modifiedLinesCount} lines</strong> with a proposed total of <strong>₹ {proposedCounterTotal.toLocaleString()}</strong>.
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Are you sure you want to discard these entered rates? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
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
                className="btn btn-primary btn-sm text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. COUNTEROFFER SUBMISSION CONFIRMATION MODAL                */}
      {/* ============================================================ */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Confirmation Required
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1 m-0">
                  Submit Buyer Counteroffer to {selectedVendor?.vendorName || selectedVendor?.name || 'Vendor'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  RFQ: <span className="font-mono font-semibold">{rfq.rfqNumber}</span> • {rfq.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {/* Commercial Summary Cards */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Original Quoted Total</span>
                <strong className="text-slate-900 font-mono text-sm">
                  ₹ {targetVendorOriginalTotal.toLocaleString()}
                </strong>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-amber-800 block font-semibold">Counteroffer Total</span>
                <strong className="text-amber-950 font-mono text-sm font-black">
                  ₹ {proposedCounterTotal.toLocaleString()}
                </strong>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-emerald-800 block font-semibold">Potential Savings</span>
                <strong className="text-emerald-900 font-mono text-sm font-black">
                  ₹ {counterSavings.toLocaleString()} ({counterSavingsPercent}%)
                </strong>
              </div>
            </div>

            {/* Affected Lines Table */}
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-700 flex justify-between">
                <span>
                  Lines with Counteroffers ({modifiedLinesCount || rfq.lines?.length || 0} of {rfq.lines?.length || 0})
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2.5">#</th>
                      <th className="py-1.5 px-2.5">Item</th>
                      <th className="py-1.5 px-2.5 text-right">Qty</th>
                      <th className="py-1.5 px-2.5 text-right">Quoted Rate</th>
                      <th className="py-1.5 px-2.5 text-right bg-amber-50 text-amber-950">Counter Rate</th>
                      <th className="py-1.5 px-2.5 text-right">New Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rfq.lines?.map((l: any) => {
                      const counterRate = lineCounterRates[l.id];
                      const qLine = rfq.quotes
                        ?.find((q: any) => q.vendorId === selectedTargetVendorId)
                        ?.lines?.find((lineItem: any) => lineItem.rfqLineId === l.id);
                      const quotedRate = qLine?.unitRate || l.benchmarkRate || 0;
                      const effectiveRate = counterRate !== undefined ? counterRate : quotedRate;
                      const isModified = counterRate !== undefined;

                      return (
                        <tr key={l.id} className={isModified ? 'bg-amber-50/40' : ''}>
                          <td className="py-1.5 px-2.5 font-mono text-slate-500">{l.lineNumber}</td>
                          <td className="py-1.5 px-2.5 font-medium text-slate-800 truncate max-w-[180px]" title={l.description}>
                            {l.description}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono">{l.quantity}</td>
                          <td className="py-1.5 px-2.5 text-right font-mono text-slate-600">₹ {quotedRate.toLocaleString()}</td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-amber-950 bg-amber-50/60">
                            ₹ {effectiveRate.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900">
                            ₹ {(effectiveRate * l.quantity).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes and Deadline */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Vendor Response Deadline
                </label>
                <input
                  type="date"
                  value={negDeadline}
                  onChange={(e) => setNegDeadline(e.target.value)}
                  className="input input-sm w-full font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Negotiation Remarks / Commercial Note
                </label>
                <input
                  type="text"
                  value={negNotes}
                  onChange={(e) => setNegNotes(e.target.value)}
                  placeholder="e.g. Target rate revision requested."
                  className="input input-sm w-full font-medium"
                />
              </div>
            </div>

            {isPendingVendorResponse ? (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle size={15} />
                  <span>Pending Counteroffer Notice</span>
                </div>
                <p className="m-0 leading-relaxed text-amber-900">
                  A previous counteroffer is currently awaiting a response from this vendor.
                  To protect data integrity, the previous offer will <strong>not</strong> be overwritten.
                  Instead, it will be marked as <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">SUPERSEDED</code> in the audit trail and preserved in the complete negotiation history.
                </p>
                <label className="flex items-center gap-2 pt-1 font-semibold text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmSingleSupersede}
                    onChange={(e) => setConfirmSingleSupersede(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Confirm issuing this superseding counteroffer</span>
                </label>
              </div>
            ) : (
              <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded text-[11px] text-blue-900 leading-relaxed">
                <strong>Formal Negotiation Notice:</strong> Confirming this action will record a new Negotiation Round and dispatch this counteroffer to the vendor portal. Earlier quotations remain intact in audit history.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={submittingOffer}
                className="btn btn-secondary btn-sm text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSubmission}
                disabled={submittingOffer || (isPendingVendorResponse && !confirmSingleSupersede)}
                className={`btn btn-sm text-xs font-bold px-4 inline-flex items-center gap-1.5 ${
                  isPendingVendorResponse && !confirmSingleSupersede
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                    : isPendingVendorResponse
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'btn-primary bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {submittingOffer ? (
                  <>
                    <Clock size={13} className="animate-spin" /> Dispatching...
                  </>
                ) : isPendingVendorResponse ? (
                  <>
                    <Send size={13} /> Confirm & Dispatch Superseding Offer
                  </>
                ) : (
                  <>
                    <Send size={13} /> Confirm & Dispatch Offer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* BULK COUNTEROFFER DISPATCH CONFIRMATION MODAL               */}
      {/* ============================================================ */}
      {showBulkConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                  Bulk Negotiation Dispatch
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1 m-0">
                  Send Counteroffer to All Eligible Vendors
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  RFQ: <span className="font-mono font-semibold">{rfq.rfqNumber}</span> • {selectedBulkVendorIds.length} of {eligibleVendors.length} Eligible Vendors Selected
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkConfirmModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target Commercial Rate Card */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <span className="text-indigo-800 block font-semibold">Bulk Counteroffer Total</span>
                <strong className="text-indigo-950 font-mono text-base font-black">
                  ₹ {proposedCounterTotal.toLocaleString()}
                </strong>
                <span className="text-[11px] text-indigo-700 block mt-0.5">
                  Applied across {modifiedLinesCount || rfq.lines?.length || 0} line item counter rates
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Dispatch Scope</span>
                <strong className="text-slate-900 text-sm font-bold block mt-0.5">
                  {selectedBulkVendorIds.length} Recipient Vendors
                </strong>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Each vendor receives an independent negotiation round
                </span>
              </div>
            </div>

            {/* Recipient Vendor Selection Table */}
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-700 flex justify-between items-center">
                <span>Eligible Vendor Recipients</span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedBulkVendorIds.length === eligibleVendors.length) {
                      setSelectedBulkVendorIds([]);
                    } else {
                      setSelectedBulkVendorIds(eligibleVendors.map((iv: any) => iv.vendorId));
                    }
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px]"
                >
                  {selectedBulkVendorIds.length === eligibleVendors.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedBulkVendorIds.length === eligibleVendors.length && eligibleVendors.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBulkVendorIds(eligibleVendors.map((iv: any) => iv.vendorId));
                            } else {
                              setSelectedBulkVendorIds([]);
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="py-1.5 px-2.5">Vendor Name</th>
                      <th className="py-1.5 px-2.5 text-right">Latest Quote</th>
                      <th className="py-1.5 px-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {eligibleVendors.map((iv: any) => {
                      const vId = iv.vendorId;
                      const isSelected = selectedBulkVendorIds.includes(vId);
                      const row = vendorNegotiationRows.find((r: any) => r.vendorId === vId);
                      const hasPending = Boolean(row?.pendingBuyerOffer);

                      return (
                        <tr key={vId} className={isSelected ? 'bg-indigo-50/30' : ''}>
                          <td className="py-1.5 px-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBulkVendorIds((prev) => [...prev, vId]);
                                } else {
                                  setSelectedBulkVendorIds((prev) => prev.filter((id) => id !== vId));
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 font-medium text-slate-800">
                            <div>{iv.vendor?.name || 'Vendor'}</div>
                            <div className="font-mono text-[10px] text-slate-400">{iv.vendor?.vendorCode || vId}</div>
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-slate-900">
                            ₹ {(row?.latestSubmittedQuoteTotal || 0).toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            {hasPending ? (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Has Pending Offer
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
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

            {/* Check if any selected vendor has pending offer */}
            {selectedBulkVendorIds.some((vId) => {
              const row = vendorNegotiationRows.find((r: any) => r.vendorId === vId);
              return Boolean(row?.pendingBuyerOffer);
            }) && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle size={15} />
                  <span>Pending Counteroffers Detected in Selection</span>
                </div>
                <p className="m-0 leading-relaxed text-amber-900">
                  One or more selected vendors currently have an active counteroffer awaiting response.
                  Issuing this bulk offer will mark those pending offers as <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">SUPERSEDED</code> and preserve them in the audit trail.
                </p>
                <label className="flex items-center gap-2 pt-1 font-semibold text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmBulkSupersede}
                    onChange={(e) => setConfirmBulkSupersede(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Confirm superseding pending counteroffers for selected vendors</span>
                </label>
              </div>
            )}

            {/* Deadline and Notes */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Vendor Response Deadline
                </label>
                <input
                  type="date"
                  value={negDeadline}
                  onChange={(e) => setNegDeadline(e.target.value)}
                  className="input input-sm w-full font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Commercial Remarks / Note
                </label>
                <input
                  type="text"
                  value={negNotes}
                  onChange={(e) => setNegNotes(e.target.value)}
                  placeholder="e.g. Bulk counteroffer issued to all participating vendors."
                  className="input input-sm w-full font-medium"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBulkConfirmModal(false)}
                disabled={submittingOffer}
                className="btn btn-secondary btn-sm text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkSubmission}
                disabled={
                  submittingOffer ||
                  selectedBulkVendorIds.length === 0 ||
                  (selectedBulkVendorIds.some((vId) => {
                    const row = vendorNegotiationRows.find((r: any) => r.vendorId === vId);
                    return Boolean(row?.pendingBuyerOffer);
                  }) && !confirmBulkSupersede)
                }
                className={`btn btn-sm text-xs font-bold px-4 inline-flex items-center gap-1.5 ${
                  selectedBulkVendorIds.length === 0 ||
                  (selectedBulkVendorIds.some((vId) => {
                    const row = vendorNegotiationRows.find((r: any) => r.vendorId === vId);
                    return Boolean(row?.pendingBuyerOffer);
                  }) && !confirmBulkSupersede)
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {submittingOffer ? (
                  <>
                    <Clock size={13} className="animate-spin" /> Dispatching...
                  </>
                ) : (
                  <>
                    <Send size={13} /> Confirm & Dispatch to {selectedBulkVendorIds.length} Vendors
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DEDICATED VENDOR NEGOTIATION HISTORY MODAL                   */}
      {/* ============================================================ */}
      {historyModalVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  Audit & Negotiation History
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1 m-0">
                  {historyModalVendor.vendorName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  RFQ: <span className="font-mono font-semibold">{rfq.rfqNumber}</span> • Vendor Code: <span className="font-mono">{historyModalVendor.vendorCode}</span>
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

            {/* Scrollable Rounds Timeline / Table */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {/* Initial Quote Record */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Initial Quote (Round 0)
                  </span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    ₹ {historyModalVendor.initialQuoteTotal.toLocaleString()}
                  </span>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Initial Submission
                </span>
              </div>

              {/* Rounds */}
              {(() => {
                const neg = rfq.negotiations?.find((n: any) => n.vendorId === historyModalVendor.vendorId);
                const rounds = neg?.rounds || [];

                if (rounds.length === 0) {
                  return (
                    <div className="p-6 text-center text-slate-500 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                      No negotiation counteroffers have been issued yet for this vendor.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0">
                      Negotiation Rounds ({rounds.length})
                    </h4>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                          <tr>
                            <th className="py-2 px-3">Round</th>
                            <th className="py-2 px-3 text-right">Buyer Offer</th>
                            <th className="py-2 px-3 text-right">Vendor Response</th>
                            <th className="py-2 px-3 text-right">Savings vs Quote</th>
                            <th className="py-2 px-3 text-center">Status</th>
                            <th className="py-2 px-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rounds.map((r: any) => {
                            const isSuperseded = r.status === 'SUPERSEDED';
                            const isRevised = r.status === 'REVISED_SUBMITTED' || (r.revisedQuoteAmount && r.revisedQuoteAmount > 0);
                            const isPending = !isSuperseded && !isRevised;

                            return (
                              <tr key={r.id} className={isSuperseded ? 'bg-slate-50/60 opacity-75' : isPending ? 'bg-amber-50/40' : ''}>
                                <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                  Round {r.roundNumber}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-amber-950">
                                  ₹ {r.counterOfferAmount ? r.counterOfferAmount.toLocaleString() : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-900">
                                  {r.revisedQuoteAmount && r.revisedQuoteAmount > 0
                                    ? `₹ ${r.revisedQuoteAmount.toLocaleString()}`
                                    : isSuperseded
                                    ? <span className="text-slate-400 font-normal italic">Superseded</span>
                                    : <span className="text-amber-700 font-normal italic">Awaiting Response</span>}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-slate-600">
                                  {r.savingsAmount ? `₹ ${r.savingsAmount.toLocaleString()} (${r.savingsPercent || 0}%)` : '—'}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {isSuperseded ? (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      SUPERSEDED
                                    </span>
                                  ) : isRevised ? (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      REVISED QUOTE
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                      AWAITING RESPONSE
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-600 max-w-[200px] truncate" title={r.notes || ''}>
                                  {r.notes || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100">
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

      {/* ============================================================ */}
      {/* 7. DEDICATED SINGLE-LINE ITEM NEGOTIATION MODAL             */}
      {/* ============================================================ */}
      {activeLineModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Line {activeLineModal.lineNumber}: {activeLineModal.itemCode || 'CV-ITEM'}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {activeLineModal.description}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveLineModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scope Spec */}
            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 space-y-1">
              <strong className="text-slate-900">Technical Scope:</strong>
              <p className="m-0 leading-relaxed">{activeLineModal.specification}</p>
              <div className="flex gap-4 pt-1 text-slate-500">
                <span>UOM: <strong>{activeLineModal.uom}</strong></span>
                <span>Quantity: <strong>{activeLineModal.quantity?.toLocaleString()}</strong></span>
                <span>AI Benchmark: <strong>₹ {(activeLineModal.benchmarkRate || 0).toLocaleString()}</strong></span>
              </div>
            </div>

            {/* Counteroffer Rate Input */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Buyer Proposed Counter Unit Rate (₹)
                </label>
                <div className="relative inline-flex items-center w-full">
                  <span className="absolute left-3 text-slate-400 text-sm select-none pointer-events-none">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={singleLineRateInput || ''}
                    onChange={(e) => setSingleLineRateInput(Number(e.target.value))}
                    className="input input-sm w-full pl-7 pr-2 font-mono font-bold text-sm"
                    placeholder="Enter counter unit rate"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Proposed Line Amount (₹)
                </label>
                <div className="p-2 bg-amber-50 border border-amber-200 rounded font-mono font-bold text-sm text-amber-950">
                  ₹ {((singleLineRateInput || 0) * activeLineModal.quantity).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveLineModal(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplySingleLineRate}
                className="btn btn-primary btn-sm bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                Apply to Commercial Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
