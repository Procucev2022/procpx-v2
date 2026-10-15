'use client';
// src/app/(app)/procurement/rate-cards/page.tsx
// Category-wise Standard BOQ Rate Card Management & Multi-Round Negotiation Workspace
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Tag,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileText,
  Building2,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Scale,
  Calendar,
  Send,
  Eye,
  Edit,
  History,
  Check,
  RotateCcw,
  BookOpen,
  ShieldCheck,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  Lock,
  Unlock,
  AlertCircle,
  Info,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';

export default function RateCardManagementPage() {
  // ── 4 Top-Level Workflow Tabs ──────────────────────────────
  // 1. Rate Card Summary — Blue
  // 2. Rate Card Initiating — Teal
  // 3. Rate Card Negotiation — Purple
  // 4. Rate Card Sign Off — Orange
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<'summary' | 'initiating' | 'negotiation' | 'signoff'>('summary');

  // Master and List State
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Selected Rate Cards for Negotiation & Sign Off
  const [selectedNegotiationCardId, setSelectedNegotiationCardId] = useState<string>('');
  const [selectedSignOffCardId, setSelectedSignOffCardId] = useState<string>('');
  const [selectedDetailCard, setSelectedDetailCard] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Line item detail drawer state
  const [selectedItemDetail, setSelectedItemDetail] = useState<any | null>(null);

  // Alerts
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Tab 2: Initiating Form State ───────────────────────────
  const [initiatingForm, setInitiatingForm] = useState<any>({
    vendorId: '',
    title: '',
    category: '',
    subcategory: '',
    scope: 'Supply & Installation',
    location: 'All India',
    version: 'v1.0',
    validFrom: new Date().toISOString().split('T')[0],
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    terms: 'Standard 30 days credit terms. Delivery within 14 days of PPO issuance. Warranty: 12 months from handover.',
    notes: '',
    justification: '',
    items: [],
  });
  const [initiatingSubmitting, setInitiatingSubmitting] = useState(false);

  // Benchmark workspace data for Initiating Tab
  const [initWorkspaceData, setInitWorkspaceData] = useState<any | null>(null);
  const [loadingInitBenchmarks, setLoadingInitBenchmarks] = useState(false);

  // ── Tab 3: Negotiation State ───────────────────────────────
  const [buyerOffer2Inputs, setBuyerOffer2Inputs] = useState<Record<string, number>>({});
  const [buyerOffer2Remarks, setBuyerOffer2Remarks] = useState('');
  const [submittingOffer2, setSubmittingOffer2] = useState(false);

  // Final Vendor Offer Acceptance Modal State
  const [showAcceptFinalOfferModal, setShowAcceptFinalOfferModal] = useState(false);
  const [acceptingFinalOffer, setAcceptingFinalOffer] = useState(false);
  const [acceptanceRemarks, setAcceptanceRemarks] = useState('');

  // ── Tab 4: Sign Off State ──────────────────────────────────
  const [signOffProcessing, setSignOffProcessing] = useState(false);
  const [signOffRemarks, setSignOffRemarks] = useState('');

  // ── Initial Load ───────────────────────────────────────────
  useEffect(() => {
    fetchRateCards();
    fetchVendors();
    fetchCategories();
  }, []);

  const fetchRateCards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/rate-cards');
      const data = await res.json();
      if (data.rateCards) {
        setRateCards(data.rateCards);
        // Default selection for negotiation & signoff if not set
        if (data.rateCards.length > 0) {
          const inNeg = data.rateCards.find(
            (r: any) =>
              r.status.includes('ROUND') ||
              r.status === 'NEGOTIATION' ||
              r.status === 'SENT_TO_VENDOR' ||
              r.status === 'FINAL_VENDOR_OFFER_ACCEPTED'
          );
          if (inNeg && !selectedNegotiationCardId) {
            setSelectedNegotiationCardId(inNeg.id);
          } else if (!selectedNegotiationCardId) {
            setSelectedNegotiationCardId(data.rateCards[0].id);
          }

          const inSignOff = data.rateCards.find(
            (r: any) =>
              r.status === 'FINAL_VENDOR_OFFER_ACCEPTED' ||
              r.status === 'CATEGORY_MANAGER_ACCEPTED' ||
              r.status === 'VENDOR_ACCEPTED' ||
              r.status === 'PENDING_PROJECT_APPROVAL' ||
              r.status === 'PENDING_FINANCE_APPROVAL'
          );
          if (inSignOff && !selectedSignOffCardId) {
            setSelectedSignOffCardId(inSignOff.id);
          } else if (!selectedSignOffCardId) {
            setSelectedSignOffCardId(data.rateCards[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching rate cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/procurement/vendors');
      const data = await res.json();
      if (data.vendors) setVendors(data.vendors);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.categories) setCategories(data.categories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // ── Load Benchmarks for Initiating Tab ─────────────────────
  const loadInitiatingBenchmarks = async (vendorId: string, category: string) => {
    if (!vendorId) return;
    setLoadingInitBenchmarks(true);
    try {
      let url = `/api/procurement/rate-cards/compare-workspace?vendorId=${vendorId}`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      const res = await fetch(url);
      const data = await res.json();
      setInitWorkspaceData(data);

      // Pre-populate category BOQ table from benchmarks if currently empty
      if (initiatingForm.items.length === 0 && data.benchmarkRates?.length > 0) {
        const initialItems = data.benchmarkRates.slice(0, 4).map((bm: any, idx: number) => {
          // Find matching historical PPO rate if available
          const matchingPpo = data.historicalPpoRates?.find(
            (p: any) => p.description?.toLowerCase() === bm.description?.toLowerCase()
          );
          const ppoRate = matchingPpo ? matchingPpo.rate : null;
          const bmRate = bm.benchmarkRate || 100;
          const initialBuyerOffer = Math.round(bmRate * 0.95); // 5% target discount

          return {
            standardBoqItemId: bm.standardBoqItemId,
            itemCode: bm.itemCode,
            description: bm.description,
            specification: bm.specification,
            category: bm.category || category,
            subcategory: bm.subcategory || '',
            uom: bm.uom || 'Nos',
            referenceQty: 100, // reference quantity
            benchmarkRate: bmRate,
            historicalRate: ppoRate || Math.round(bmRate * 1.05),
            previousPpoRate: ppoRate,
            buyerOffer1: initialBuyerOffer, // Initial Buyer RC Offer (editable)
            rate: initialBuyerOffer,
            remarks: 'Standard category scope benchmark target',
          };
        });
        setInitiatingForm((prev: any) => ({ ...prev, items: initialItems }));
      }
    } catch (err) {
      console.error('Error loading initiating benchmarks:', err);
    } finally {
      setLoadingInitBenchmarks(false);
    }
  };

  const handleInitVendorChange = (vendorId: string) => {
    const v = vendors.find((x) => x.id === vendorId);
    let cat = initiatingForm.category;
    if (!cat && v?.categories) {
      try {
        const parsed = JSON.parse(v.categories);
        if (Array.isArray(parsed) && parsed.length > 0) cat = parsed[0];
      } catch {
        cat = v.categories;
      }
    }
    setInitiatingForm((prev: any) => ({
      ...prev,
      vendorId,
      category: cat || prev.category,
      title: `${v?.name || 'Vendor'} Master Rate Card - ${cat || 'General'}`,
    }));
    loadInitiatingBenchmarks(vendorId, cat || initiatingForm.category);
  };

  const handleInitCategoryChange = (category: string) => {
    const v = vendors.find((x) => x.id === initiatingForm.vendorId);
    setInitiatingForm((prev: any) => ({
      ...prev,
      category,
      title: `${v?.name || 'Vendor'} Master Rate Card - ${category}`,
    }));
    if (initiatingForm.vendorId) {
      loadInitiatingBenchmarks(initiatingForm.vendorId, category);
    }
  };

  const handleUpdateInitItem = (idx: number, field: string, value: any) => {
    const updated = [...initiatingForm.items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'buyerOffer1') {
      updated[idx].rate = Number(value);
    }
    setInitiatingForm((prev: any) => ({ ...prev, items: updated }));
  };

  const handleAddInitCustomItem = () => {
    const newItem = {
      standardBoqItemId: null,
      itemCode: `ITEM-${String(initiatingForm.items.length + 1).padStart(3, '0')}`,
      description: 'Custom Category BOQ Item',
      specification: 'Industrial standard specification',
      category: initiatingForm.category || 'General',
      subcategory: initiatingForm.subcategory || '',
      uom: 'Nos',
      referenceQty: 50,
      benchmarkRate: 250,
      historicalRate: 260,
      previousPpoRate: 255,
      buyerOffer1: 240,
      rate: 240,
      remarks: 'Initial buyer target proposal',
    };
    setInitiatingForm((prev: any) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const handleRemoveInitItem = (idx: number) => {
    setInitiatingForm((prev: any) => ({
      ...prev,
      items: prev.items.filter((_: any, i: number) => i !== idx),
    }));
  };

  // Submit Handler for Initiating Tab
  const handleInitiatingSubmit = async (targetStatus: 'DRAFT' | 'ROUND_1_BUYER_OFFER') => {
    if (!initiatingForm.vendorId || !initiatingForm.category || !initiatingForm.title) {
      setMsg({ text: 'Please select a Target Vendor, Category, and provide a Title.', type: 'error' });
      return;
    }
    if (initiatingForm.items.length === 0) {
      setMsg({ text: 'Please add at least one Category BOQ line item to the rate card.', type: 'error' });
      return;
    }

    // Validate that all line items have an Initial Buyer RC Offer > 0
    const invalidItems = initiatingForm.items.filter((it: any) => !it.buyerOffer1 || Number(it.buyerOffer1) <= 0);
    if (invalidItems.length > 0) {
      setMsg({ text: 'Initial Buyer RC Offer must be greater than zero for all line items.', type: 'error' });
      return;
    }

    setInitiatingSubmitting(true);
    setMsg(null);
    try {
      const payload = {
        ...initiatingForm,
        status: targetStatus,
      };

      const res = await fetch('/api/procurement/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save Rate Card');

      const createdCard = data.rateCard;
      setMsg({
        text: targetStatus === 'ROUND_1_BUYER_OFFER'
          ? `Rate Card ${createdCard.rateCardNumber} sent to vendor! Buyer RC Offer-1 recorded.`
          : `Rate Card ${createdCard.rateCardNumber} saved as Draft.`,
        type: 'success',
      });

      await fetchRateCards();

      // If sent to vendor, transition automatically into Rate Card Negotiation tab with this card selected!
      if (targetStatus === 'ROUND_1_BUYER_OFFER') {
        setSelectedNegotiationCardId(createdCard.id);
        setActiveWorkflowTab('negotiation');
      }
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setInitiatingSubmitting(false);
    }
  };

  // ── Selected Rate Card for Negotiation ─────────────────────
  const activeNegotiationCard = useMemo(() => {
    return rateCards.find((rc) => rc.id === selectedNegotiationCardId) || null;
  }, [rateCards, selectedNegotiationCardId]);

  // Sync initial Buyer Offer-2 inputs when active negotiation card changes
  useEffect(() => {
    if (activeNegotiationCard?.items) {
      const initial: Record<string, number> = {};
      activeNegotiationCard.items.forEach((it: any) => {
        if (it.buyerOffer2 !== null && it.buyerOffer2 !== undefined) {
          initial[it.id] = Number(it.buyerOffer2);
        } else if (it.vendorQuote1 !== null && it.vendorQuote1 !== undefined) {
          // Default Buyer RC Offer-2 to 3% below vendor quote 1 or midway
          initial[it.id] = Math.round((Number(it.buyerOffer1 || it.rate) + Number(it.vendorQuote1)) / 2);
        } else {
          initial[it.id] = Number(it.buyerOffer1 || it.rate || 0);
        }
      });
      setBuyerOffer2Inputs(initial);
    }
  }, [activeNegotiationCard]);

  // Submit Buyer RC Offer-2 Handler
  const handleSubmitBuyerOffer2 = async () => {
    if (!activeNegotiationCard) return;

    // Validate inputs
    const invalidItems = activeNegotiationCard.items.filter((it: any) => {
      const r = buyerOffer2Inputs[it.id];
      return r === undefined || isNaN(r) || r <= 0;
    });

    if (invalidItems.length > 0) {
      setMsg({ text: 'Please enter a valid Buyer RC Offer-2 rate greater than zero for all line items.', type: 'error' });
      return;
    }

    setSubmittingOffer2(true);
    setMsg(null);
    try {
      const itemsPayload = activeNegotiationCard.items.map((it: any) => ({
        id: it.id,
        buyerOffer2: buyerOffer2Inputs[it.id],
      }));

      const res = await fetch(`/api/procurement/rate-cards/${activeNegotiationCard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SUBMIT_BUYER_OFFER_2',
          items: itemsPayload,
          remarks: buyerOffer2Remarks,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit Buyer RC Offer-2');

      setMsg({
        text: `Buyer RC Offer-2 successfully submitted for Rate Card ${activeNegotiationCard.rateCardNumber}! Vendor notified.`,
        type: 'success',
      });
      await fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setSubmittingOffer2(false);
    }
  };

  // Accept Final Vendor Offer Handler
  const handleConfirmAcceptFinalOffer = async () => {
    if (!activeNegotiationCard) return;

    setAcceptingFinalOffer(true);
    setMsg(null);
    try {
      const currentRound = activeNegotiationCard.status === 'ROUND_2_VENDOR_QUOTE' ? 2 : 1;
      const totalAgreedValue = activeNegotiationCard.items.reduce((acc: number, it: any) => {
        const agreedRate = it.vendorQuote2 ?? it.vendorQuote1 ?? it.proposedRate ?? it.rate;
        const qty = it.referenceQty || it.minQuantity || 1;
        return acc + (Number(agreedRate) * Number(qty));
      }, 0);

      const res = await fetch(`/api/procurement/rate-cards/${activeNegotiationCard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ACCEPT_FINAL_VENDOR_OFFER',
          roundNumber: currentRound,
          totalAgreedValue,
          remarks: acceptanceRemarks,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept final vendor offer');

      setMsg({
        text: `Final Vendor Offer accepted! Status changed to 'Final Vendor Offer Accepted — Category Manager Acceptance Pending'.`,
        type: 'success',
      });
      setShowAcceptFinalOfferModal(false);
      await fetchRateCards();

      // Also set this card for Sign Off tab
      setSelectedSignOffCardId(activeNegotiationCard.id);
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setAcceptingFinalOffer(false);
    }
  };

  // ── Selected Rate Card for Sign Off ────────────────────────
  const activeSignOffCard = useMemo(() => {
    return rateCards.find((rc) => rc.id === selectedSignOffCardId) || null;
  }, [rateCards, selectedSignOffCardId]);

  // Category Manager Acceptance Handler
  const handleCategoryManagerAccept = async () => {
    if (!activeSignOffCard) return;
    setSignOffProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${activeSignOffCard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CATEGORY_MANAGER_ACCEPT',
          remarks: signOffRemarks || 'Commercial snapshot confirmed and accepted by Category Manager',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to perform Category Manager Acceptance');

      setMsg({
        text: `Rate Card ${activeSignOffCard.rateCardNumber} accepted by Category Manager! Vendor Acceptance is now pending.`,
        type: 'success',
      });
      await fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setSignOffProcessing(false);
    }
  };

  // Category Manager Final Sign Off Handler
  const handleCategoryManagerSignOff = async () => {
    if (!activeSignOffCard) return;
    setSignOffProcessing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/procurement/rate-cards/${activeSignOffCard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CATEGORY_MANAGER_SIGNOFF',
          remarks: signOffRemarks || 'Category Manager Final Sign Off complete. Forwarded for Project Approver review.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sign off Rate Card');

      setMsg({
        text: `Rate Card ${activeSignOffCard.rateCardNumber} signed off! Routed to Project Approver approval queue (Level 1).`,
        type: 'success',
      });
      await fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setSignOffProcessing(false);
    }
  };

  // Direct Level 1 & Level 2 Approval Handler (for convenience and end-to-end testing)
  const handleApprovalQueueAction = async (actionType: 'APPROVE' | 'REVERT') => {
    if (!activeSignOffCard) return;
    setSignOffProcessing(true);
    setMsg(null);
    try {
      const endpoint = actionType === 'APPROVE'
        ? `/api/procurement/rate-cards/${activeSignOffCard.id}/approve`
        : `/api/procurement/rate-cards/${activeSignOffCard.id}/revert`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remarks: signOffRemarks || 'Approved in Enterprise Workflow',
          reason: signOffRemarks || 'Returned for correction',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process approval');

      setMsg({ text: data.message || 'Workflow stage completed successfully!', type: 'success' });
      await fetchRateCards();
    } catch (err: any) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setSignOffProcessing(false);
    }
  };

  // ── KPI Counts for Register ────────────────────────────────
  const totalCount = rateCards.length;
  const approvedCount = rateCards.filter((rc) => rc.status === 'APPROVED').length;
  const inNegotiationCount = rateCards.filter((rc) =>
    rc.status.includes('ROUND') || rc.status === 'NEGOTIATION' || rc.status === 'SENT_TO_VENDOR'
  ).length;
  const inSignOffCount = rateCards.filter((rc) =>
    rc.status === 'FINAL_VENDOR_OFFER_ACCEPTED' ||
    rc.status === 'CATEGORY_MANAGER_ACCEPTED' ||
    rc.status === 'VENDOR_ACCEPTED' ||
    rc.status === 'PENDING_PROJECT_APPROVAL' ||
    rc.status === 'PENDING_FINANCE_APPROVAL'
  ).length;

  const filteredCards = rateCards.filter((rc) => {
    const matchesSearch =
      rc.rateCardNumber.toLowerCase().includes(search.toLowerCase()) ||
      rc.title.toLowerCase().includes(search.toLowerCase()) ||
      rc.vendor?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (rc.category && rc.category.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || rc.status === statusFilter;
    const matchesCat = categoryFilter === 'ALL' || rc.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCat;
  });

  return (
    <div className="page-container" style={{ padding: '24px 32px', minHeight: '100vh', background: '#f8fafc' }}>
      {/* ── TOP HEADER ────────────────────────────────────────── */}
      <PageHeader
        title="Rate Card Management"
        subtitle="Category-wise Standard BOQ Rate Cards, Multi-Round Negotiation & Enterprise Approval Governance"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Procurement', href: '/procurement' },
          { label: 'Rate Cards' },
        ]}
        badge={
          <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Tag size={13} /> {rateCards.length} Managed Cards
          </span>
        }
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link
              href="/approvals/rate-cards"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Clock size={14} /> Approvals Queue
            </Link>
            <button
              type="button"
              onClick={() => {
                setActiveWorkflowTab('initiating');
                setInitiatingForm({
                  vendorId: '',
                  title: '',
                  category: '',
                  subcategory: '',
                  scope: 'Supply & Installation',
                  location: 'All India',
                  version: 'v1.0',
                  validFrom: new Date().toISOString().split('T')[0],
                  validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  terms: 'Standard 30 days credit terms. Delivery within 14 days of PPO issuance. Warranty: 12 months from handover.',
                  notes: '',
                  justification: '',
                  items: [],
                });
                setInitWorkspaceData(null);
              }}
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Initiate New Rate Card
            </button>
          </div>
        }
      />

      {/* ── ALERTS ────────────────────────────────────────────── */}
      {msg && (
        <div
          className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}
          style={{
            padding: '12px 16px',
            borderRadius: 6,
            background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${msg.type === 'success' ? '#86efac' : '#fca5a5'}`,
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{msg.text}</span>
          <button
            type="button"
            onClick={() => setMsg(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 4 ENTERPRISE WORKFLOW TABS STRIP ──────────────────── */}
      {/* 1. Rate Card Summary — Blue */}
      {/* 2. Rate Card Initiating — Teal */}
      {/* 3. Rate Card Negotiation — Purple */}
      {/* 4. Rate Card Sign Off — Orange */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {/* Tab 1: Rate Card Summary — Blue */}
        <button
          id="tab-btn-summary"
          type="button"
          onClick={() => setActiveWorkflowTab('summary')}
          style={{
            background: activeWorkflowTab === 'summary' ? '#eff6ff' : '#ffffff',
            border: activeWorkflowTab === 'summary' ? '2px solid #2563eb' : '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '14px 18px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeWorkflowTab === 'summary' ? '0 4px 6px -1px rgba(37, 99, 235, 0.15)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Stage 1
            </span>
            <span
              className="badge"
              style={{
                background: activeWorkflowTab === 'summary' ? '#2563eb' : '#e2e8f0',
                color: activeWorkflowTab === 'summary' ? '#ffffff' : '#475569',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 10,
              }}
            >
              {totalCount} Cards
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a8a', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={17} color="#2563eb" /> Rate Card Summary
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            Active catalog, repository & filter register
          </div>
        </button>

        {/* Tab 2: Rate Card Initiating — Teal */}
        <button
          id="tab-btn-initiating"
          type="button"
          onClick={() => setActiveWorkflowTab('initiating')}
          style={{
            background: activeWorkflowTab === 'initiating' ? '#f0fdfa' : '#ffffff',
            border: activeWorkflowTab === 'initiating' ? '2px solid #0d9488' : '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '14px 18px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeWorkflowTab === 'initiating' ? '0 4px 6px -1px rgba(13, 148, 136, 0.15)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Stage 2
            </span>
            <span
              className="badge"
              style={{
                background: activeWorkflowTab === 'initiating' ? '#0d9488' : '#e2e8f0',
                color: activeWorkflowTab === 'initiating' ? '#ffffff' : '#475569',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 10,
              }}
            >
              Initiation
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#115e59', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={17} color="#0d9488" /> Rate Card Initiating
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            Category BOQ & Initial Buyer RC Offer
          </div>
        </button>

        {/* Tab 3: Rate Card Negotiation — Purple */}
        <button
          id="tab-btn-negotiation"
          type="button"
          onClick={() => setActiveWorkflowTab('negotiation')}
          style={{
            background: activeWorkflowTab === 'negotiation' ? '#faf5ff' : '#ffffff',
            border: activeWorkflowTab === 'negotiation' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '14px 18px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeWorkflowTab === 'negotiation' ? '0 4px 6px -1px rgba(124, 58, 237, 0.15)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Stage 3
            </span>
            <span
              className="badge"
              style={{
                background: activeWorkflowTab === 'negotiation' ? '#7c3aed' : '#e2e8f0',
                color: activeWorkflowTab === 'negotiation' ? '#ffffff' : '#475569',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 10,
              }}
            >
              {inNegotiationCount} Active
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#581c87', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Scale size={17} color="#7c3aed" /> Rate Card Negotiation
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            Named Rounds 1 & 2 & Final Offer Acceptance
          </div>
        </button>

        {/* Tab 4: Rate Card Sign Off — Orange */}
        <button
          id="tab-btn-signoff"
          type="button"
          onClick={() => setActiveWorkflowTab('signoff')}
          style={{
            background: activeWorkflowTab === 'signoff' ? '#fff7ed' : '#ffffff',
            border: activeWorkflowTab === 'signoff' ? '2px solid #ea580c' : '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '14px 18px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeWorkflowTab === 'signoff' ? '0 4px 6px -1px rgba(234, 88, 12, 0.15)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Stage 4
            </span>
            <span
              className="badge"
              style={{
                background: activeWorkflowTab === 'signoff' ? '#ea580c' : '#e2e8f0',
                color: activeWorkflowTab === 'signoff' ? '#ffffff' : '#475569',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 10,
              }}
            >
              {inSignOffCount} Pending
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#7c2d12', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={17} color="#ea580c" /> Rate Card Sign Off
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            CM Acceptance → Vendor Accept → Approvals
          </div>
        </button>
      </div>

      {/* ============================================================ */}
      {/* ── WORKFLOW TAB 1: RATE CARD SUMMARY (BLUE) ──────────────── */}
      {/* ============================================================ */}
      {activeWorkflowTab === 'summary' && (
        <div>
          {/* KPI Cards Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div className="kpi-card" style={{ borderLeft: '4px solid #3b82f6', background: '#ffffff', padding: '16px 20px', borderRadius: 8 }}>
              <div className="kpi-label" style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Total Rate Cards</div>
              <div className="kpi-value" style={{ fontSize: 24, fontWeight: 800, color: '#1e3a8a', marginTop: 4 }}>{totalCount}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>All managed categories</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #10b981', background: '#ffffff', padding: '16px 20px', borderRadius: 8 }}>
              <div className="kpi-label" style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Active & Contracted</div>
              <div className="kpi-value" style={{ fontSize: 24, fontWeight: 800, color: '#047857', marginTop: 4 }}>{approvedCount}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Eligible for Direct PPO issuance</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #8b5cf6', background: '#ffffff', padding: '16px 20px', borderRadius: 8 }}>
              <div className="kpi-label" style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>In Active Negotiation</div>
              <div className="kpi-value" style={{ fontSize: 24, fontWeight: 800, color: '#6d28d9', marginTop: 4 }}>{inNegotiationCount}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Round 1 & 2 offer exchanges</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #ea580c', background: '#ffffff', padding: '16px 20px', borderRadius: 8 }}>
              <div className="kpi-label" style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>In Sign-Off & Approvals</div>
              <div className="kpi-value" style={{ fontSize: 24, fontWeight: 800, color: '#c2410c', marginTop: 4 }}>{inSignOffCount}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>CM Accept / Vendor Accept / L1 / L2</div>
            </div>
          </div>

          {/* Filter Bar & Register */}
          <Card noPadding>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ position: 'relative', width: 320 }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search by ID, Vendor, Title, Scope..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input input-sm"
                    style={{ paddingLeft: 34, width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Category:</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="input input-sm"
                    style={{ width: 180 }}
                  >
                    <option value="ALL">All Categories</option>
                    {Array.from(new Set(rateCards.map((rc) => rc.category).filter(Boolean))).map((cat: string) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Filters */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
                {[
                  { key: 'ALL', label: 'All Statuses' },
                  { key: 'ROUND_1_BUYER_OFFER', label: 'Buyer RC Offer-1' },
                  { key: 'ROUND_1_VENDOR_QUOTE', label: 'Vendor RC Quote-1' },
                  { key: 'ROUND_2_BUYER_OFFER', label: 'Buyer RC Offer-2' },
                  { key: 'ROUND_2_VENDOR_QUOTE', label: 'Vendor RC Quote-2' },
                  { key: 'FINAL_VENDOR_OFFER_ACCEPTED', label: 'Final Offer Accepted' },
                  { key: 'APPROVED', label: 'Active / Approved' },
                  { key: 'DRAFT', label: 'Draft' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`btn btn-sm ${statusFilter === tab.key ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="table enterprise-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ width: 130 }}>Rate Card ID</th>
                    <th style={{ minWidth: 160 }}>Vendor</th>
                    <th style={{ minWidth: 140 }}>Category / Scope</th>
                    <th style={{ width: 70 }}>Version</th>
                    <th style={{ width: 140 }}>Effective Period</th>
                    <th style={{ width: 80, textAlign: 'right' }}>Items</th>
                    <th style={{ width: 220 }}>Negotiation & Workflow Status</th>
                    <th style={{ width: 180, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                        Loading Rate Cards...
                      </td>
                    </tr>
                  ) : filteredCards.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                        No Rate Cards found matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredCards.map((rc) => (
                      <tr key={rc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td>
                          <div className="font-mono font-bold text-primary">{rc.rateCardNumber}</div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            {new Date(rc.createdAt).toLocaleDateString()}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{rc.vendor?.name}</div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>{rc.vendor?.code}</div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>{rc.category}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{rc.scope || 'Supply & Installation'}</div>
                        </td>

                        <td>
                          <span className="badge badge-info" style={{ fontSize: 11, fontWeight: 600 }}>
                            {rc.version || 'v1.0'}
                          </span>
                        </td>

                        <td>
                          <div style={{ fontSize: 11 }}>
                            {new Date(rc.validFrom).toLocaleDateString()} — {new Date(rc.validTo).toLocaleDateString()}
                          </div>
                          {rc.isValid ? (
                            <span className="badge badge-approved" style={{ fontSize: 9 }}>Active Now</span>
                          ) : null}
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {rc.items?.length || 0}
                        </td>

                        <td>
                          <StatusBadge status={rc.status} />
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedNegotiationCardId(rc.id);
                                setActiveWorkflowTab('negotiation');
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, padding: '3px 8px', color: '#7c3aed', borderColor: '#ddd6fe' }}
                              title="Open in Negotiation Workspace"
                            >
                              <Scale size={12} style={{ marginRight: 3 }} /> Negotiate
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSignOffCardId(rc.id);
                                setActiveWorkflowTab('signoff');
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, padding: '3px 8px', color: '#ea580c', borderColor: '#fed7aa' }}
                              title="Open in Sign-Off Workflow"
                            >
                              <ShieldCheck size={12} style={{ marginRight: 3 }} /> Sign Off
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* ── WORKFLOW TAB 2: RATE CARD INITIATING (TEAL) ───────────── */}
      {/* ============================================================ */}
      {activeWorkflowTab === 'initiating' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Card */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f766e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} /> Rate Card Initiating — Category BOQ Baseline
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  Define one vendor and one category, establish baseline BOQ items, configure Initial Buyer RC Offers, and review commercial terms before sending to vendor.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => handleInitiatingSubmit('DRAFT')}
                  disabled={initiatingSubmitting}
                  className="btn btn-secondary btn-sm"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleInitiatingSubmit('ROUND_1_BUYER_OFFER')}
                  disabled={initiatingSubmitting}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#0d9488', borderColor: '#0d9488', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={14} /> Send Rate Card to Vendor
                </button>
              </div>
            </div>

            {/* Scope and Meta Form */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 18, paddingTop: 18, borderTop: '1px solid #f1f5f9' }}>
              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Target Vendor *</label>
                <select
                  value={initiatingForm.vendorId}
                  onChange={(e) => handleInitVendorChange(e.target.value)}
                  className="input input-sm"
                  style={{ width: '100%' }}
                >
                  <option value="">-- Select Empanelled Vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Category *</label>
                <select
                  value={initiatingForm.category}
                  onChange={(e) => handleInitCategoryChange(e.target.value)}
                  className="input input-sm"
                  style={{ width: '100%' }}
                >
                  <option value="">-- Select Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  {!categories.some((c) => c.name === 'Civil & Interior') && (
                    <option value="Civil & Interior">Civil & Interior</option>
                  )}
                  {!categories.some((c) => c.name === 'Electrical') && (
                    <option value="Electrical">Electrical</option>
                  )}
                  {!categories.some((c) => c.name === 'HVAC') && (
                    <option value="HVAC">HVAC</option>
                  )}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Rate Card Title *</label>
                <input
                  type="text"
                  value={initiatingForm.title}
                  onChange={(e) => setInitiatingForm({ ...initiatingForm, title: e.target.value })}
                  className="input input-sm"
                  style={{ width: '100%' }}
                  placeholder="e.g. Vendor Master Rate Card - Category"
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Operating Scope & Location</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={initiatingForm.scope}
                    onChange={(e) => setInitiatingForm({ ...initiatingForm, scope: e.target.value })}
                    className="input input-sm"
                    style={{ width: '60%' }}
                    placeholder="Scope"
                  />
                  <input
                    type="text"
                    value={initiatingForm.location}
                    onChange={(e) => setInitiatingForm({ ...initiatingForm, location: e.target.value })}
                    className="input input-sm"
                    style={{ width: '40%' }}
                    placeholder="Location"
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Contract Validity Period</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="date"
                    value={initiatingForm.validFrom}
                    onChange={(e) => setInitiatingForm({ ...initiatingForm, validFrom: e.target.value })}
                    className="input input-sm"
                    style={{ width: '50%' }}
                  />
                  <input
                    type="date"
                    value={initiatingForm.validTo}
                    onChange={(e) => setInitiatingForm({ ...initiatingForm, validTo: e.target.value })}
                    className="input input-sm"
                    style={{ width: '50%' }}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Rate Card Version</label>
                <input
                  type="text"
                  value={initiatingForm.version}
                  onChange={(e) => setInitiatingForm({ ...initiatingForm, version: e.target.value })}
                  className="input input-sm"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </Card>

          {/* Category BOQ Table (Section 2 Requirements) */}
          <Card noPadding>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Category BOQ Table ({initiatingForm.items.length} Lines)
                </h4>
                <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
                  Includes AI Benchmark, Historical Rate, Previous PPO Rate, and editable Initial Buyer RC Offer.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleAddInitCustomItem}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11 }}
                >
                  <Plus size={13} style={{ marginRight: 4 }} /> Add BOQ Item
                </button>
              </div>
            </div>

            {loadingInitBenchmarks && (
              <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                Loading AI benchmarks & historical PPO rates for category...
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ width: 40 }}>#</th>
                    <th style={{ width: 110 }}>Item Code / Ref</th>
                    <th style={{ minWidth: 200 }}>Item Description & Specification</th>
                    <th style={{ width: 60 }}>UOM</th>
                    <th style={{ width: 80, textAlign: 'right' }}>Ref Qty</th>
                    <th style={{ width: 100, textAlign: 'right' }}>AI Benchmark Rate</th>
                    <th style={{ width: 100, textAlign: 'right' }}>Historical Rate</th>
                    <th style={{ width: 110, textAlign: 'right' }}>Previous PPO Rate</th>
                    <th style={{ width: 120, textAlign: 'right', background: '#f0fdfa', borderLeft: '2px solid #0d9488' }}>
                      Initial Buyer RC Offer (₹) *
                    </th>
                    <th style={{ width: 110, textAlign: 'right' }}>Est. Line Value</th>
                    <th style={{ width: 90, textAlign: 'right' }}>Variance</th>
                    <th style={{ minWidth: 140 }}>Remarks</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {initiatingForm.items.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                        No BOQ items added yet. Please select a Target Vendor and Category above to auto-populate from benchmarks or click &apos;Add BOQ Item&apos;.
                      </td>
                    </tr>
                  ) : (
                    initiatingForm.items.map((it: any, idx: number) => {
                      const initialOffer = Number(it.buyerOffer1 || 0);
                      const refQty = Number(it.referenceQty || 1);
                      const lineValue = initialOffer * refQty;
                      const bmRate = Number(it.benchmarkRate || 0);
                      const variance = bmRate > 0 ? Math.round(((initialOffer - bmRate) / bmRate) * 100) : 0;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td className="text-muted">{idx + 1}</td>
                          <td>
                            <input
                              type="text"
                              value={it.itemCode || ''}
                              onChange={(e) => handleUpdateInitItem(idx, 'itemCode', e.target.value)}
                              className="input input-sm font-mono"
                              style={{ width: '100%', fontSize: 10 }}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={it.description}
                              onChange={(e) => handleUpdateInitItem(idx, 'description', e.target.value)}
                              className="input input-sm"
                              style={{ width: '100%', fontWeight: 600, marginBottom: 3 }}
                            />
                            <input
                              type="text"
                              placeholder="Technical specification"
                              value={it.specification || ''}
                              onChange={(e) => handleUpdateInitItem(idx, 'specification', e.target.value)}
                              className="input input-sm text-muted"
                              style={{ width: '100%', fontSize: 10 }}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={it.uom}
                              onChange={(e) => handleUpdateInitItem(idx, 'uom', e.target.value)}
                              className="input input-sm"
                              style={{ width: 55, textAlign: 'center' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              value={it.referenceQty}
                              onChange={(e) => handleUpdateInitItem(idx, 'referenceQty', Number(e.target.value))}
                              className="input input-sm"
                              style={{ width: 70, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>
                            {it.benchmarkRate ? `₹ ${Number(it.benchmarkRate).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: '#475569' }}>
                            {it.historicalRate ? `₹ ${Number(it.historicalRate).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: '#6b21a8', fontWeight: 500 }}>
                            {it.previousPpoRate ? `₹ ${Number(it.previousPpoRate).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', background: '#f0fdfa', borderLeft: '2px solid #0d9488' }}>
                            <input
                              type="number"
                              value={it.buyerOffer1}
                              onChange={(e) => handleUpdateInitItem(idx, 'buyerOffer1', Number(e.target.value))}
                              className="input input-sm"
                              style={{ width: 95, textAlign: 'right', fontWeight: 700, color: '#0f766e', borderColor: '#0d9488' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                            ₹ {lineValue.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {bmRate > 0 ? (
                              <span
                                className="badge"
                                style={{
                                  fontSize: 10,
                                  background: variance <= 0 ? '#dcfce7' : '#fee2e2',
                                  color: variance <= 0 ? '#166534' : '#991b1b',
                                }}
                              >
                                {variance <= 0 ? `▼ ${Math.abs(variance)}%` : `▲ ${variance}%`}
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={it.remarks || ''}
                              onChange={(e) => handleUpdateInitItem(idx, 'remarks', e.target.value)}
                              placeholder="Buyer remarks"
                              className="input input-sm"
                              style={{ width: '100%', fontSize: 10 }}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveInitItem(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                              title="Remove item"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Terms and Conditions Section */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                Applicable Commercial Terms and Service Conditions (Displayed to Vendor)
              </label>
              <textarea
                rows={3}
                value={initiatingForm.terms}
                onChange={(e) => setInitiatingForm({ ...initiatingForm, terms: e.target.value })}
                className="input input-sm"
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* ── WORKFLOW TAB 3: RATE CARD NEGOTIATION (PURPLE) ────────── */}
      {/* ============================================================ */}
      {activeWorkflowTab === 'negotiation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Rate Card Selector */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#581c87' }}>Select Rate Card to Negotiate:</span>
                <select
                  id="select-negotiation-card"
                  value={selectedNegotiationCardId}
                  onChange={(e) => setSelectedNegotiationCardId(e.target.value)}
                  className="input input-sm"
                  style={{ minWidth: 320, fontWeight: 600 }}
                >
                  {rateCards.map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {rc.rateCardNumber} — {rc.vendor?.name} ({rc.category}) [{rc.status}]
                    </option>
                  ))}
                </select>
              </div>

              {activeNegotiationCard && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusBadge status={activeNegotiationCard.status} />
                  <span className="badge badge-info">{activeNegotiationCard.version || 'v1.0'}</span>
                </div>
              )}
            </div>

            {activeNegotiationCard && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9', background: '#faf5ff', padding: 12, borderRadius: 6 }}>
                <div>
                  <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Vendor</span>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{activeNegotiationCard.vendor?.name}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{activeNegotiationCard.vendor?.code}</div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Category & Scope</span>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{activeNegotiationCard.category}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{activeNegotiationCard.scope || 'General'} | {activeNegotiationCard.location}</div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Validity</span>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>
                    {new Date(activeNegotiationCard.validFrom).toLocaleDateString()} — {new Date(activeNegotiationCard.validTo).toLocaleDateString()}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Priced Lines</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
                    {activeNegotiationCard.items?.length || 0} Items
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Chronological Stages Bar (Exact Named Rounds - Section 3 Requirements) */}
          {activeNegotiationCard && (
            <Card noPadding>
              <div style={{ padding: '12px 20px', background: '#581c87', color: '#ffffff', borderTopLeftRadius: 8, borderTopRightRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                  EXACT NEGOTIATION ROUND STRUCTURE & TIMELINE
                </span>
                <span style={{ fontSize: 11, opacity: 0.9 }}>
                  Named Rounds: Buyer RC Offer-1 → Vendor RC Quote-1 → Buyer RC Offer-2 → Vendor RC Quote-2 → Final Agreed Rate
                </span>
              </div>

              {/* Named Round Stage Indicators */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  borderBottom: '1px solid #e2e8f0',
                  background: '#faf5ff',
                }}
              >
                {[
                  { id: 'round1_buyer', label: '1. Buyer RC Offer-1', desc: 'Initial submitted rate' },
                  { id: 'round1_vendor', label: '2. Vendor RC Quote-1', desc: 'Vendor initial quote' },
                  { id: 'round2_buyer', label: '3. Buyer RC Offer-2', desc: 'Buyer counteroffer' },
                  { id: 'round2_vendor', label: '4. Vendor RC Quote-2', desc: 'Vendor revised quote' },
                  { id: 'final_agreed', label: '5. Final Agreed Rate', desc: 'Frozen commercial terms' },
                  { id: 'status', label: '6. Negotiation Status', desc: 'Workflow progression' },
                  { id: 'action', label: '7. Action', desc: 'Commercial decision' },
                ].map((col, idx) => (
                  <div
                    key={col.id}
                    style={{
                      padding: '12px 10px',
                      borderRight: idx < 6 ? '1px solid #e9d5ff' : 'none',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#581c87' }}>{col.label}</div>
                    <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 2 }}>{col.desc}</div>
                  </div>
                ))}
              </div>

              {/* Action Ribbon: Submit Buyer RC Offer-2 & Accept Final Vendor Offer */}
              <div
                style={{
                  padding: '14px 20px',
                  background: '#fdf4ff',
                  borderBottom: '1px solid #f5d0fe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Info size={16} color="#9333ea" />
                  <span style={{ fontSize: 12, color: '#581c87' }}>
                    {activeNegotiationCard.status === 'ROUND_1_BUYER_OFFER' && (
                      <strong>Round 1 Active: Buyer RC Offer-1 submitted. Waiting for Vendor RC Quote-1 response in Vendor Portal.</strong>
                    )}
                    {activeNegotiationCard.status === 'ROUND_1_VENDOR_QUOTE' && (
                      <strong>Vendor RC Quote-1 received! You can now edit Buyer RC Offer-2 in the table below or accept the vendor offer.</strong>
                    )}
                    {activeNegotiationCard.status === 'ROUND_2_BUYER_OFFER' && (
                      <strong>Round 2 Active: Buyer RC Offer-2 submitted. Waiting for Vendor RC Quote-2 response in Vendor Portal.</strong>
                    )}
                    {activeNegotiationCard.status === 'ROUND_2_VENDOR_QUOTE' && (
                      <strong>Vendor RC Quote-2 received! You can now accept the final vendor offer or initiate further negotiation.</strong>
                    )}
                    {activeNegotiationCard.status === 'FINAL_VENDOR_OFFER_ACCEPTED' && (
                      <strong>Final Vendor Offer accepted! Commercial snapshot is frozen. Category Manager Acceptance is pending in Sign Off Tab.</strong>
                    )}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  {/* Round 2 Submit Action */}
                  {(activeNegotiationCard.status === 'ROUND_1_VENDOR_QUOTE' || activeNegotiationCard.status === 'ROUND_2_BUYER_OFFER') && (
                    <button
                      type="button"
                      onClick={handleSubmitBuyerOffer2}
                      disabled={submittingOffer2 || activeNegotiationCard.status === 'ROUND_2_BUYER_OFFER'}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#7c3aed', borderColor: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Send size={13} /> {activeNegotiationCard.status === 'ROUND_2_BUYER_OFFER' ? 'Buyer RC Offer-2 Submitted' : 'Submit Buyer RC Offer-2'}
                    </button>
                  )}

                  {/* Accept Final Vendor Offer Action (Section 3 Requirement) */}
                  <button
                    id="btn-accept-final-vendor-offer"
                    type="button"
                    onClick={() => {
                      setAcceptanceRemarks('');
                      setShowAcceptFinalOfferModal(true);
                    }}
                    disabled={
                      activeNegotiationCard.status !== 'ROUND_1_VENDOR_QUOTE' &&
                      activeNegotiationCard.status !== 'ROUND_2_VENDOR_QUOTE'
                    }
                    className="btn btn-success btn-sm"
                    style={{
                      background: '#16a34a',
                      borderColor: '#16a34a',
                      color: '#ffffff',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCheck size={14} /> Accept Final Vendor Offer
                  </button>
                </div>
              </div>

              {/* Exact 15-Column Line-Item Negotiation Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="table enterprise-table" style={{ width: '100%', fontSize: 11, minWidth: 1400 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ width: 40 }}>S.No.</th>
                      <th style={{ minWidth: 200 }}>Item Description / Specification</th>
                      <th style={{ width: 60 }}>UOM</th>
                      <th style={{ width: 60, textAlign: 'right' }}>Quantity</th>
                      <th style={{ width: 90, textAlign: 'right' }}>AI Benchmark Rate</th>
                      <th style={{ width: 90, textAlign: 'right' }}>Historical Rate</th>
                      <th style={{ width: 90, textAlign: 'right' }}>Previous PPO Rate</th>

                      {/* Named Negotiation Round Columns */}
                      <th style={{ width: 110, textAlign: 'right', background: '#eff6ff', color: '#1e40af' }}>
                        Buyer RC Offer-1
                      </th>
                      <th style={{ width: 110, textAlign: 'right', background: '#f5f3ff', color: '#6d28d9' }}>
                        Vendor RC Quote-1
                      </th>
                      <th style={{ width: 120, textAlign: 'right', background: '#eff6ff', color: '#1e40af' }}>
                        Buyer RC Offer-2
                      </th>
                      <th style={{ width: 110, textAlign: 'right', background: '#f5f3ff', color: '#6d28d9' }}>
                        Vendor RC Quote-2
                      </th>
                      <th style={{ width: 110, textAlign: 'right', background: '#f0fdf4', color: '#166534', fontWeight: 800 }}>
                        Final Agreed Rate
                      </th>
                      <th style={{ width: 80, textAlign: 'right' }}>Variance</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                      <th style={{ width: 70, textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!activeNegotiationCard.items?.length ? (
                      <tr>
                        <td colSpan={15} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                          No line items found on this Rate Card.
                        </td>
                      </tr>
                    ) : (
                      activeNegotiationCard.items.map((it: any, idx: number) => {
                        const canEditOffer2 =
                          activeNegotiationCard.status === 'ROUND_1_VENDOR_QUOTE' ||
                          (activeNegotiationCard.status === 'ROUND_2_BUYER_OFFER' && false); // locked once submitted

                        const offer1 = it.buyerOffer1 ?? it.rate;
                        const quote1 = it.vendorQuote1 ?? it.proposedRate;
                        const offer2 = it.buyerOffer2;
                        const quote2 = it.vendorQuote2;
                        const finalRate = it.finalAgreedRate;

                        const bm = Number(it.benchmarkRate || 0);
                        const compRate = finalRate || quote2 || offer2 || quote1 || offer1;
                        const variance = bm > 0 && compRate ? Math.round(((compRate - bm) / bm) * 100) : 0;

                        return (
                          <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td className="text-muted">{idx + 1}</td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{it.description}</div>
                              <div style={{ fontSize: 10, color: '#64748b' }}>{it.specification || it.itemCode || '—'}</div>
                            </td>
                            <td><span className="badge badge-draft">{it.uom}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{it.referenceQty || it.minQuantity || 1}</td>
                            <td style={{ textAlign: 'right', color: '#1e40af', fontWeight: 600 }}>
                              {it.benchmarkRate ? `₹ ${Number(it.benchmarkRate).toLocaleString()}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: '#475569' }}>
                              {it.historicalRate ? `₹ ${Number(it.historicalRate).toLocaleString()}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: '#6b21a8' }}>
                              {it.previousPpoRate ? `₹ ${Number(it.previousPpoRate).toLocaleString()}` : '—'}
                            </td>

                            {/* 1. Buyer RC Offer-1 */}
                            <td style={{ textAlign: 'right', background: '#eff6ff', fontWeight: 700, color: '#1e40af' }}>
                              {offer1 !== null && offer1 !== undefined ? `₹ ${Number(offer1).toLocaleString()}` : '—'}
                            </td>

                            {/* 2. Vendor RC Quote-1 */}
                            <td style={{ textAlign: 'right', background: '#f5f3ff', fontWeight: 700, color: '#6d28d9' }}>
                              {quote1 !== null && quote1 !== undefined ? `₹ ${Number(quote1).toLocaleString()}` : (
                                <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Pending</span>
                              )}
                            </td>

                            {/* 3. Buyer RC Offer-2 (Editable during Round 2) */}
                            <td style={{ textAlign: 'right', background: '#eff6ff' }}>
                              {canEditOffer2 ? (
                                <input
                                  type="number"
                                  value={buyerOffer2Inputs[it.id] ?? ''}
                                  onChange={(e) =>
                                    setBuyerOffer2Inputs({
                                      ...buyerOffer2Inputs,
                                      [it.id]: Number(e.target.value),
                                    })
                                  }
                                  className="input input-sm"
                                  style={{
                                    width: 90,
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: '#1e40af',
                                    borderColor: '#93c5fd',
                                  }}
                                  placeholder="Offer-2"
                                />
                              ) : offer2 !== null && offer2 !== undefined ? (
                                <span style={{ fontWeight: 700, color: '#1e40af' }}>₹ {Number(offer2).toLocaleString()}</span>
                              ) : (
                                <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                              )}
                            </td>

                            {/* 4. Vendor RC Quote-2 */}
                            <td style={{ textAlign: 'right', background: '#f5f3ff', fontWeight: 700, color: '#6d28d9' }}>
                              {quote2 !== null && quote2 !== undefined ? `₹ ${Number(quote2).toLocaleString()}` : (
                                <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                              )}
                            </td>

                            {/* 5. Final Agreed Rate */}
                            <td style={{ textAlign: 'right', background: '#f0fdf4', fontWeight: 800, color: '#166534', fontSize: 12 }}>
                              {finalRate !== null && finalRate !== undefined ? (
                                `₹ ${Number(finalRate).toLocaleString()}`
                              ) : (
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>Pending Accept</span>
                              )}
                            </td>

                            {/* Variance */}
                            <td style={{ textAlign: 'right' }}>
                              {bm > 0 ? (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: 9,
                                    background: variance <= 0 ? '#dcfce7' : '#fee2e2',
                                    color: variance <= 0 ? '#166534' : '#991b1b',
                                  }}
                                >
                                  {variance <= 0 ? `▼ ${Math.abs(variance)}%` : `▲ ${variance}%`}
                                </span>
                              ) : '—'}
                            </td>

                            {/* Status */}
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className="badge"
                                style={{
                                  fontSize: 9,
                                  background: finalRate ? '#dcfce7' : quote2 ? '#ede9fe' : quote1 ? '#fef3c7' : '#e2e8f0',
                                  color: finalRate ? '#166534' : quote2 ? '#5b21b6' : quote1 ? '#92400e' : '#475569',
                                }}
                              >
                                {finalRate ? 'Agreed' : quote2 ? 'Quote-2 Recvd' : quote1 ? 'Quote-1 Recvd' : 'Offer-1 Sent'}
                              </span>
                            </td>

                            {/* Action */}
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedItemDetail(it)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: 10, padding: '2px 6px' }}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* CONFIRMATION MODAL FOR ACCEPT FINAL VENDOR OFFER (Section 3) */}
          {showAcceptFinalOfferModal && activeNegotiationCard && (
            <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
              <div
                className="modal-content"
                style={{
                  background: '#ffffff',
                  borderRadius: 8,
                  width: '100%',
                  maxWidth: 900,
                  maxHeight: '92vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                }}
              >
                {/* Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4' }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCheck size={18} /> Confirm Acceptance of Final Vendor Offer
                    </h3>
                    <p style={{ fontSize: 12, color: '#475569', margin: '3px 0 0' }}>
                      Freezes negotiated commercial rates and advances rate card to Category Manager Acceptance Pending.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAcceptFinalOfferModal(false)}
                    style={{ background: 'none', border: 'none', fontSize: 20, color: '#64748b', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Summary Strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, background: '#f8fafc', padding: 14, borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Rate Card No.</div>
                      <div className="font-mono font-bold text-primary">{activeNegotiationCard.rateCardNumber}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Vendor</div>
                      <div style={{ fontWeight: 700 }}>{activeNegotiationCard.vendor?.name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Accepted Round</div>
                      <div style={{ fontWeight: 700, color: '#7c3aed' }}>
                        {activeNegotiationCard.status === 'ROUND_2_VENDOR_QUOTE' ? 'Round 2 (Vendor RC Quote-2)' : 'Round 1 (Vendor RC Quote-1)'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Value</div>
                      <div style={{ fontWeight: 800, color: '#166534', fontSize: 14 }}>
                        ₹ {activeNegotiationCard.items?.reduce((acc: number, it: any) => {
                          const r = it.vendorQuote2 ?? it.vendorQuote1 ?? it.proposedRate ?? it.rate;
                          const q = it.referenceQty || it.minQuantity || 1;
                          return acc + (Number(r) * Number(q));
                        }, 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table in Modal */}
                  <div>
                    <h5 style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                      Line Items & Final Vendor Rates to be Accepted:
                    </h5>
                    <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                      <table className="table" style={{ width: '100%', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9' }}>
                            <th>Item Description</th>
                            <th>UOM</th>
                            <th style={{ textAlign: 'right' }}>AI Benchmark</th>
                            <th style={{ textAlign: 'right' }}>Historical / PPO</th>
                            <th style={{ textAlign: 'right', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                              Final Vendor Rate (₹)
                            </th>
                            <th style={{ textAlign: 'right' }}>Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeNegotiationCard.items?.map((it: any, i: number) => {
                            const finalVendorRate = it.vendorQuote2 ?? it.vendorQuote1 ?? it.proposedRate ?? it.rate;
                            const bm = Number(it.benchmarkRate || 0);
                            const variance = bm > 0 ? Math.round(((finalVendorRate - bm) / bm) * 100) : 0;

                            return (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ fontWeight: 600 }}>{it.description}</td>
                                <td>{it.uom}</td>
                                <td style={{ textAlign: 'right', color: '#1e40af' }}>
                                  {it.benchmarkRate ? `₹ ${Number(it.benchmarkRate).toLocaleString()}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', color: '#64748b' }}>
                                  {it.previousPpoRate ? `₹ ${Number(it.previousPpoRate).toLocaleString()}` : (it.historicalRate ? `₹ ${Number(it.historicalRate).toLocaleString()}` : '—')}
                                </td>
                                <td style={{ textAlign: 'right', background: '#dcfce7', fontWeight: 800, color: '#166534' }}>
                                  ₹ {Number(finalVendorRate).toLocaleString()}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {bm > 0 ? (
                                    <span className={`badge ${variance <= 0 ? 'badge-approved' : 'badge-rejected'}`} style={{ fontSize: 9 }}>
                                      {variance <= 0 ? `▼ ${Math.abs(variance)}%` : `▲ ${variance}%`}
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Terms & Conditions preview */}
                  <div>
                    <h5 style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                      Applicable Terms & Conditions
                    </h5>
                    <p style={{ fontSize: 11, color: '#475569', background: '#f8fafc', padding: 10, borderRadius: 4, margin: 0 }}>
                      {activeNegotiationCard.terms || 'Standard payment terms apply.'}
                    </p>
                  </div>

                  {/* Acceptance Remarks */}
                  <div>
                    <label className="form-label" style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                      Acceptance Remarks / Commercial Justification (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Best price achieved post Round 2 negotiation, savings confirmed vs benchmark"
                      value={acceptanceRemarks}
                      onChange={(e) => setAcceptanceRemarks(e.target.value)}
                      className="input input-sm"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc' }}>
                  <button
                    type="button"
                    onClick={() => setShowAcceptFinalOfferModal(false)}
                    className="btn btn-secondary btn-sm"
                    disabled={acceptingFinalOffer}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAcceptFinalOffer}
                    disabled={acceptingFinalOffer}
                    className="btn btn-success btn-sm"
                    style={{ background: '#16a34a', borderColor: '#16a34a', color: '#ffffff', fontWeight: 700 }}
                  >
                    {acceptingFinalOffer ? 'Confirming...' : 'Confirm & Accept Final Vendor Offer'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* ── WORKFLOW TAB 4: RATE CARD SIGN OFF (ORANGE) ───────────── */}
      {/* ============================================================ */}
      {activeWorkflowTab === 'signoff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card Selector */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7c2d12' }}>Select Rate Card for Sign Off:</span>
                <select
                  id="select-signoff-card"
                  value={selectedSignOffCardId}
                  onChange={(e) => setSelectedSignOffCardId(e.target.value)}
                  className="input input-sm"
                  style={{ minWidth: 320, fontWeight: 600 }}
                >
                  {rateCards.map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {rc.rateCardNumber} — {rc.vendor?.name} [{rc.status}]
                    </option>
                  ))}
                </select>
              </div>

              {activeSignOffCard && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusBadge status={activeSignOffCard.status} />
                  <span className="badge badge-info">{activeSignOffCard.version || 'v1.0'}</span>
                </div>
              )}
            </div>

            {/* Sequence Tracker (Section 5) */}
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>
                End-to-End Governance Lifecycle Sequence:
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  overflowX: 'auto',
                  paddingBottom: 8,
                  fontSize: 11,
                }}
              >
                {[
                  { label: 'Initiation', done: true },
                  { label: 'Buyer Offer-1', done: true },
                  { label: 'Vendor Quote-1', done: true },
                  { label: 'Buyer Offer-2', done: true },
                  { label: 'Vendor Quote-2', done: true },
                  {
                    label: 'Accept Final Offer',
                    done: activeSignOffCard?.status !== 'ROUND_1_BUYER_OFFER' && activeSignOffCard?.status !== 'ROUND_2_BUYER_OFFER' && activeSignOffCard?.status !== 'DRAFT',
                  },
                  {
                    label: 'CM Acceptance',
                    done: activeSignOffCard?.status === 'CATEGORY_MANAGER_ACCEPTED' || activeSignOffCard?.status === 'VENDOR_ACCEPTED' || activeSignOffCard?.status?.includes('APPROVAL') || activeSignOffCard?.status === 'APPROVED',
                  },
                  {
                    label: 'Vendor Acceptance',
                    done: activeSignOffCard?.status === 'VENDOR_ACCEPTED' || activeSignOffCard?.status?.includes('APPROVAL') || activeSignOffCard?.status === 'APPROVED',
                  },
                  {
                    label: 'CM Sign Off',
                    done: activeSignOffCard?.status?.includes('APPROVAL') || activeSignOffCard?.status === 'APPROVED',
                  },
                  {
                    label: 'Project Approver (L1)',
                    done: activeSignOffCard?.status === 'PENDING_FINANCE_APPROVAL' || activeSignOffCard?.status === 'APPROVED',
                  },
                  {
                    label: 'Finance Head (L2)',
                    done: activeSignOffCard?.status === 'APPROVED',
                  },
                  {
                    label: 'Active Rate Card',
                    done: activeSignOffCard?.status === 'APPROVED',
                  },
                ].map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                        fontSize: 10,
                        background: step.done ? '#dcfce7' : '#f1f5f9',
                        color: step.done ? '#166534' : '#64748b',
                        border: step.done ? '1px solid #86efac' : '1px solid #e2e8f0',
                      }}
                    >
                      {step.done ? '✓ ' : ''}{step.label}
                    </span>
                    {idx < 11 && <span style={{ color: '#cbd5e1' }}>→</span>}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Action Stages */}
          {activeSignOffCard && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Current Sign Off Workflow Stage:
                </h4>
              </div>

              {/* Stage 1: Category Manager Acceptance */}
              {activeSignOffCard.status === 'FINAL_VENDOR_OFFER_ACCEPTED' && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={16} /> Category Manager Acceptance Pending
                      </h4>
                      <p style={{ fontSize: 12, color: '#78350f', margin: '4px 0 0' }}>
                        The final vendor offer has been accepted by the buyer. As the Category Manager, please review the final agreed rates and accept the negotiated rate card before passing it to the vendor for formal agreement.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCategoryManagerAccept}
                      disabled={signOffProcessing}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#d97706', borderColor: '#d97706' }}
                    >
                      {signOffProcessing ? 'Processing...' : 'Accept Rate Card as Category Manager'}
                    </button>
                  </div>
                </div>
              )}

              {/* Stage 2: Vendor Acceptance */}
              {activeSignOffCard.status === 'CATEGORY_MANAGER_ACCEPTED' && (
                <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f766e', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={16} /> Vendor Acceptance Pending
                      </h4>
                      <p style={{ fontSize: 12, color: '#134e4a', margin: '4px 0 0' }}>
                        Category Manager has accepted the negotiated rate card. The vendor ({activeSignOffCard.vendor?.name}) must now formally accept the contract terms in the Vendor Portal.
                      </p>
                    </div>

                    <span className="badge badge-info" style={{ fontSize: 11, padding: '6px 12px' }}>
                      Waiting for Vendor Response
                    </span>
                  </div>
                </div>
              )}

              {/* Stage 3: Category Manager Sign Off */}
              {activeSignOffCard.status === 'VENDOR_ACCEPTED' && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#c2410c', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={16} /> Category Manager Final Sign Off Required
                      </h4>
                      <p style={{ fontSize: 12, color: '#7c2d12', margin: '4px 0 0' }}>
                        Vendor has accepted the agreement and terms. Click below to sign off as Category Manager and route the Rate Card to Project Approver approval queue (Level 1).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCategoryManagerSignOff}
                      disabled={signOffProcessing}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#ea580c', borderColor: '#ea580c' }}
                    >
                      {signOffProcessing ? 'Processing...' : 'Category Manager Sign Off'}
                    </button>
                  </div>
                </div>
              )}

              {/* Stage 4: Project Approver Approval (Level 1) */}
              {activeSignOffCard.status === 'PENDING_PROJECT_APPROVAL' && (
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={16} /> Level 1 Project Approver Queue
                      </h4>
                      <p style={{ fontSize: 12, color: '#475569', margin: '4px 0 0' }}>
                        Rate Card is pending review by Project Approver. Once approved, it will advance to Finance Head (Level 2).
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleApprovalQueueAction('APPROVE')}
                        disabled={signOffProcessing}
                        className="btn btn-success btn-sm"
                        style={{ background: '#16a34a', borderColor: '#16a34a', color: '#ffffff' }}
                      >
                        Approve Level 1 (Project Approver)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprovalQueueAction('REVERT')}
                        disabled={signOffProcessing}
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      >
                        Return for Correction
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stage 5: Finance Head Approval (Level 2) */}
              {activeSignOffCard.status === 'PENDING_FINANCE_APPROVAL' && (
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={16} /> Level 2 Finance Head Approval Queue
                      </h4>
                      <p style={{ fontSize: 12, color: '#475569', margin: '4px 0 0' }}>
                        Level 1 Project Approval completed. Final commercial approval from Finance Head is required to activate the Rate Card.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleApprovalQueueAction('APPROVE')}
                        disabled={signOffProcessing}
                        className="btn btn-success btn-sm"
                        style={{ background: '#16a34a', borderColor: '#16a34a', color: '#ffffff' }}
                      >
                        Approve Level 2 (Finance Head)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprovalQueueAction('REVERT')}
                        disabled={signOffProcessing}
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      >
                        Return for Correction
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stage 6: Active / Approved */}
              {activeSignOffCard.status === 'APPROVED' && (
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle2 size={24} color="#166534" />
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: '#166534' }}>
                        Rate Card Active & Fully Contracted
                      </h4>
                      <p style={{ fontSize: 12, color: '#14532d', margin: '3px 0 0' }}>
                        All approvals, validations, and agreements completed. Rates are active for RFQ benchmarking and direct PPO execution.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Final Agreed Items Table */}
              <div style={{ marginTop: 20 }}>
                <h5 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                  Final Agreed Rates Schedule ({activeSignOffCard.items?.length || 0} items)
                </h5>
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                  <table className="table" style={{ width: '100%', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ width: 40 }}>#</th>
                        <th>Item Description</th>
                        <th>Specification</th>
                        <th>UOM</th>
                        <th style={{ textAlign: 'right' }}>Agreed Contract Rate (₹)</th>
                        <th style={{ textAlign: 'right' }}>Benchmark Rate</th>
                        <th style={{ textAlign: 'right' }}>Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSignOffCard.items?.map((it: any, i: number) => {
                        const agreedRate = it.finalAgreedRate ?? it.rate;
                        const bm = Number(it.benchmarkRate || 0);
                        const variance = bm > 0 ? Math.round(((agreedRate - bm) / bm) * 100) : 0;

                        return (
                          <tr key={it.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td className="text-muted">{i + 1}</td>
                            <td style={{ fontWeight: 600 }}>{it.description}</td>
                            <td style={{ color: '#64748b' }}>{it.specification || '—'}</td>
                            <td><span className="badge badge-draft">{it.uom}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#047857', fontSize: 12 }}>
                              ₹ {Number(agreedRate).toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'right', color: '#1e40af' }}>
                              {it.benchmarkRate ? `₹ ${Number(it.benchmarkRate).toLocaleString()}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {bm > 0 ? (
                                <span className={`badge ${variance <= 0 ? 'badge-approved' : 'badge-rejected'}`} style={{ fontSize: 9 }}>
                                  {variance <= 0 ? `▼ ${Math.abs(variance)}%` : `▲ ${variance}%`}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── LINE ITEM DETAIL DRAWER / MODAL ───────────────────── */}
      {selectedItemDetail && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }}>
          <div
            className="modal-content"
            style={{
              background: '#ffffff',
              borderRadius: 8,
              width: '100%',
              maxWidth: 600,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Line Item Detail — {selectedItemDetail.itemCode || 'BOQ Line'}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedItemDetail(null)}
                style={{ background: 'none', border: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Description</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{selectedItemDetail.description}</div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Technical Specification</div>
                <div style={{ fontSize: 12, color: '#334155', background: '#f8fafc', padding: 10, borderRadius: 4 }}>
                  {selectedItemDetail.specification || 'Standard procurement grade specification'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, background: '#f1f5f9', padding: 12, borderRadius: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>UOM</div>
                  <div style={{ fontWeight: 700 }}>{selectedItemDetail.uom}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>AI Benchmark</div>
                  <div style={{ fontWeight: 700, color: '#1e40af' }}>
                    {selectedItemDetail.benchmarkRate ? `₹ ${selectedItemDetail.benchmarkRate}` : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Previous PPO Rate</div>
                  <div style={{ fontWeight: 700, color: '#6b21a8' }}>
                    {selectedItemDetail.previousPpoRate ? `₹ ${selectedItemDetail.previousPpoRate}` : '—'}
                  </div>
                </div>
              </div>

              {/* Negotiation Progression History */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#581c87', marginBottom: 6 }}>
                  Chronological Round Rates:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#eff6ff', borderRadius: 4 }}>
                    <span style={{ fontWeight: 600, color: '#1e40af' }}>Buyer RC Offer-1:</span>
                    <span style={{ fontWeight: 700 }}>₹ {selectedItemDetail.buyerOffer1 ?? selectedItemDetail.rate}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f5f3ff', borderRadius: 4 }}>
                    <span style={{ fontWeight: 600, color: '#6d28d9' }}>Vendor RC Quote-1:</span>
                    <span style={{ fontWeight: 700 }}>
                      {selectedItemDetail.vendorQuote1 ? `₹ ${selectedItemDetail.vendorQuote1}` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#eff6ff', borderRadius: 4 }}>
                    <span style={{ fontWeight: 600, color: '#1e40af' }}>Buyer RC Offer-2:</span>
                    <span style={{ fontWeight: 700 }}>
                      {selectedItemDetail.buyerOffer2 ? `₹ ${selectedItemDetail.buyerOffer2}` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f5f3ff', borderRadius: 4 }}>
                    <span style={{ fontWeight: 600, color: '#6d28d9' }}>Vendor RC Quote-2:</span>
                    <span style={{ fontWeight: 700 }}>
                      {selectedItemDetail.vendorQuote2 ? `₹ ${selectedItemDetail.vendorQuote2}` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f0fdf4', borderRadius: 4 }}>
                    <span style={{ fontWeight: 700, color: '#166534' }}>Final Agreed Rate:</span>
                    <span style={{ fontWeight: 800, color: '#166534' }}>
                      {selectedItemDetail.finalAgreedRate ? `₹ ${selectedItemDetail.finalAgreedRate}` : 'Pending Accept'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setSelectedItemDetail(null)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
