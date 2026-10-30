'use client';
// src/app/(app)/procurement/rfqs/new/page.tsx
// Exact Approved Five-Step Enterprise RFQ Creation Workflow
import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Stepper, { StepItem } from '@/components/ui/Stepper';
import ContextBanner from '@/components/ui/ContextBanner';
import StatusBadge from '@/components/ui/StatusBadge';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import {
  ClipboardList,
  Package,
  Scale,
  Building2,
  Send,
  Save,
  Pencil,
  Paperclip,
  Building,
  MapPin,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Star,
  Search,
  Check,
  X,
  ShieldCheck,
  FileText,
  Calendar,
  Lock,
  Clock,
  Plus,
  Info,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import SpecificationCell from '@/components/ui/SpecificationCell';
import { useToast } from '@/components/ui/Toast';
import { STEP_THEMES } from "./page.constants";


export default function NewRfqPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const initialRevisionId = searchParams.get('revisionId');
  const initialPrId = searchParams.get('prId');

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvedBoqs, setApprovedBoqs] = useState<any[]>([]);
  const [selectedBoq, setSelectedBoq] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [rateCards, setRateCards] = useState<any[]>([]);

  // Sourced PR & Duplicate Detection State
  const [sourcePr, setSourcePr] = useState<any>(null);
  const [existingActiveRfq, setExistingActiveRfq] = useState<any>(null);
  const [rateCardMatch, setRateCardMatch] = useState<any>(null);

  // Wizard Scope State (Step 2)
  const [scopeType, setScopeType] = useState<'ENTIRE_BOQ' | 'CATEGORY' | 'SELECTED_LINES'>('ENTIRE_BOQ');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [lineRemarks, setLineRemarks] = useState<{ [id: string]: string }>({});

  // RFQ Commercial & Technical Form State (Step 3)
  const [rfqDetails, setRfqDetails] = useState({
    title: '',
    packageName: '',
    scopeOfWork: '',
    expectedCompletionDate: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
    submissionDeadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    clarificationDeadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    deliveryRequirement: 'Site delivery & completion within 45 days from work order issuance',
    commercialValidityDays: 60,
    paymentTerms: '30 days net from certified progressive invoice',
    taxTerms: 'GST 18% extra as applicable',
    deliveryTerms: 'FOR Project Site / Free Delivery & Unloading at Site',
    warrantyTerms: '12 Months Defect Liability Period from handover',
    priceBasis: 'Firm & Fixed — No escalation allowed',
    performanceSecurity: '5% Performance Bank Guarantee upon contract award',
    liquidatedDamages: '0.5% per week of delay subject to a maximum of 5% of contract value',
    technicalRequirements:
      'Strict adherence to architectural specifications, IS/ISO certified materials, approved brand catalogue compliance, and standard 12-month performance warranty.',
    commercialRequirements:
      'All-inclusive unit pricing, free freight and unloading at project site, insurance covered up to installation, tax breakdown as per GST norms.',
    requiredDocuments: ['PAN Card', 'GST Registration', 'Compliance Declaration', 'Detailed Price Schedule', 'Safety & Quality Plan'],
  });

  const [newDocInput, setNewDocInput] = useState('');

  // Vendor Selection State (Step 4)
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [vendorTab, setVendorTab] = useState<'ALL' | 'RATE_CARD' | 'PREVIOUS'>('ALL');
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedVendorCategory, setSelectedVendorCategory] = useState('');
  const [selectedVendorType, setSelectedVendorType] = useState('ALL');
  const [rateCardOnly, setRateCardOnly] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [showConfirmRelease, setShowConfirmRelease] = useState(false);

  // Stepper definition with Exact Approved 5-Step Colours
  const wizardSteps: StepItem[] = [
    {
      number: 1,
      icon: <ClipboardList size={16} strokeWidth={2} />,
      title: 'Project & BOQ',
      description: 'Baseline Verification',
      primaryColor: STEP_THEMES[1].primary,
      lightBg: STEP_THEMES[1].lightBg,
      accentBorder: STEP_THEMES[1].accentBorder,
    },
    {
      number: 2,
      icon: <Package size={16} strokeWidth={2} />,
      title: 'Scope & Package',
      description: 'Package Lines',
      primaryColor: STEP_THEMES[2].primary,
      lightBg: STEP_THEMES[2].lightBg,
      accentBorder: STEP_THEMES[2].accentBorder,
    },
    {
      number: 3,
      icon: <Scale size={16} strokeWidth={2} />,
      title: 'Commercial & Technical',
      description: 'Conditions & Specs',
      primaryColor: STEP_THEMES[3].primary,
      lightBg: STEP_THEMES[3].lightBg,
      accentBorder: STEP_THEMES[3].accentBorder,
    },
    {
      number: 4,
      icon: <Building2 size={16} strokeWidth={2} />,
      title: 'Vendor Selection',
      description: 'Invite Suppliers',
      primaryColor: STEP_THEMES[4].primary,
      lightBg: STEP_THEMES[4].lightBg,
      accentBorder: STEP_THEMES[4].accentBorder,
    },
    {
      number: 5,
      icon: <Send size={16} strokeWidth={2} />,
      title: 'Review & Release',
      description: 'Validate & Launch',
      primaryColor: STEP_THEMES[5].primary,
      lightBg: STEP_THEMES[5].lightBg,
      accentBorder: STEP_THEMES[5].accentBorder,
    },
  ];

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const fetchPromises: Promise<any>[] = [
        fetch('/api/procurement/approved-boqs'),
        fetch('/api/procurement/vendors'),
        fetch('/api/procurement/rate-cards'),
      ];

      if (initialPrId) {
        fetchPromises.push(fetch(`/api/pr/${initialPrId}`));
        fetchPromises.push(fetch('/api/procurement/approved-prs'));
        fetchPromises.push(fetch(`/api/procurement/rate-cards/match?prId=${initialPrId}`));
      }

      const results = await Promise.all(fetchPromises);
      const boqsData = await results[0].json();
      const vendorsData = await results[1].json();
      const rateCardsData = results[2]?.ok ? await results[2].json() : { rateCards: [] };

      let foundPr: any = null;
      let rateCardMatchData: any = null;

      if (initialPrId) {
        // 1. Try direct PR fetch first
        if (results[3]?.ok) {
          const directPrJson = await results[3].json();
          foundPr = directPrJson?.id ? directPrJson : directPrJson?.data;
        }

        // 2. Fallback to approved-prs list if direct fetch returned nothing
        if (!foundPr && results[4]?.ok) {
          const prsData = await results[4].json();
          const prList = Array.isArray(prsData) ? prsData : (prsData?.data || []);
          foundPr = prList.find((p: any) => p.id === initialPrId);
        }

        if (results[5]?.ok) {
          rateCardMatchData = await results[5].json();
        }
      }

      if (rateCardsData?.rateCards) {
        setRateCards(rateCardsData.rateCards);
      }

      if (rateCardMatchData?.matches && rateCardMatchData.matches.length > 0) {
        setRateCardMatch(rateCardMatchData.matches[0]);
      }

      // Check if creating directly from an Approved PR
      if (initialPrId) {
        if (!foundPr) {
          setErrorMsg(`Unable to load Procurement Request (${initialPrId}). The PR was not found or access is restricted.`);
          setLoading(false);
          return;
        }

        if (!foundPr.lines || foundPr.lines.length === 0) {
          setErrorMsg(`Approved PR (${foundPr.prNumber}) has no approved line items available for sourcing.`);
          setLoading(false);
          return;
        }

        setSourcePr(foundPr);

        // Check if an active RFQ already exists for this PR
        const activeRfq = foundPr.rfqs?.find((r: any) => r.status !== 'CANCELLED');
        if (activeRfq) {
          setExistingActiveRfq(activeRfq);
        }

        const totalBenchmark = foundPr.totalEstimatedValue || foundPr.lines.reduce(
          (acc: number, l: any) => acc + (l.estimatedValue || ((l.quantity || 0) * (l.estimatedRate || 0))),
          0
        );

        // Build synthetic BOQ structure inherited strictly from Approved PR
        const prBoq = {
          id: foundPr.boqRevision?.id || foundPr.boqRevisionId || 'pr-rev',
          prId: foundPr.id,
          prNumber: foundPr.prNumber,
          boqCode: foundPr.boq?.boqCode || foundPr.boqCode || (foundPr.project?.projectCode ? `BOQ-${foundPr.project.projectCode}` : 'BOQ-R1'),
          projectId: foundPr.projectId || foundPr.project?.id,
          projectName: foundPr.project?.name || 'Project',
          projectCode: foundPr.project?.projectCode || 'CPX-P',
          location: foundPr.project?.city || 'Bengaluru',
          costCentre: foundPr.costCentre ? `${foundPr.costCentre.code} - ${foundPr.costCentre.name}` : undefined,
          costCentreId: foundPr.costCentreId,
          approvedRevisionCode: foundPr.boqRevision?.revisionCode || 'R1 (APPROVED)',
          approvedAt: foundPr.releasedAt || foundPr.projectApprovedAt,
          approvedBy: foundPr.releasedBy || foundPr.projectApprovedBy || 'Project Approver',
          totalLines: foundPr.lines.length,
          totalBenchmarkAmount: totalBenchmark,
          categories: Array.from(new Set(foundPr.lines.map((l: any) => l.category || 'General'))).map((cat) => ({
            category: cat,
            lineCount: foundPr.lines.filter((l: any) => (l.category || 'General') === cat).length,
            benchmarkSubtotal: foundPr.lines
              .filter((l: any) => (l.category || 'General') === cat)
              .reduce((acc: number, l: any) => acc + (l.estimatedValue || ((l.quantity || 0) * (l.estimatedRate || 0))), 0),
          })),
          lines: foundPr.lines.map((l: any, idx: number) => ({
            id: l.id,
            prLineId: l.id,
            boqLineId: l.boqLineId || l.id,
            lineNumber: l.lineNumber || String(idx + 1),
            description: l.itemDescription,
            specification: l.specification || 'Standard specification',
            category: l.category || 'General',
            uom: l.uom,
            quantity: l.quantity,
            benchmarkRate: l.estimatedRate || 0,
            benchmarkAmount: l.estimatedValue || l.quantity * (l.estimatedRate || 0),
          })),
        };

        setSelectedBoq(prBoq);
        setSelectedLineIds(prBoq.lines.map((l: any) => l.id));
        setRfqDetails((prev) => ({
          ...prev,
          title: `RFQ for ${foundPr.title || foundPr.project?.name} (${foundPr.prNumber})`,
          packageName: `${foundPr.lines[0]?.category || 'General'} Package`,
        }));
      } else if (boqsData.approvedBoqs && boqsData.approvedBoqs.length > 0) {
        setApprovedBoqs(boqsData.approvedBoqs);
        const match = initialRevisionId
          ? boqsData.approvedBoqs.find((b: any) => b.id === initialRevisionId)
          : boqsData.approvedBoqs[0];

        const activeBoq = match || boqsData.approvedBoqs[0];
        setSelectedBoq(activeBoq);
        setSelectedLineIds(activeBoq.lines.map((l: any) => l.id));
        setRfqDetails((prev) => ({
          ...prev,
          title: `RFQ for ${activeBoq.projectName} — ${activeBoq.categories[0]?.category || 'Works'} Package`,
          packageName: `${activeBoq.categories[0]?.category || 'Works'} Package`,
        }));
      }

      if (vendorsData.vendors) {
        setVendors(vendorsData.vendors);
        const compliantIds = vendorsData.vendors
          .filter((v: any) => !v.isBlacklisted && v.complianceStatus === 'COMPLIANT')
          .slice(0, 3)
          .map((v: any) => v.id);
        setSelectedVendorIds(compliantIds);
      }
    } catch (err) {
      console.error('Error initializing RFQ wizard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBoq = (boq: any) => {
    setSelectedBoq(boq);
    setSelectedLineIds(boq.lines.map((l: any) => l.id));
    setRfqDetails((prev) => ({
      ...prev,
      title: `RFQ for ${boq.projectName} — ${boq.categories[0]?.category || 'Works'} Package`,
      packageName: `${boq.categories[0]?.category || 'Works'} Package`,
    }));
  };

  // Filter scoped lines based on scope mode & line selection
  const scopedLines = useMemo(() => {
    if (!selectedBoq) return [];
    return selectedBoq.lines.filter((l: any) => {
      if (scopeType === 'ENTIRE_BOQ') return true;
      if (scopeType === 'CATEGORY') return l.category === selectedCategory;
      if (scopeType === 'SELECTED_LINES') return selectedLineIds.includes(l.id);
      return true;
    });
  }, [selectedBoq, scopeType, selectedCategory, selectedLineIds]);

  const scopedBenchmarkValue = useMemo(() => {
    return scopedLines.reduce((acc: number, l: any) => acc + (l.benchmarkAmount || 0), 0);
  }, [scopedLines]);

  const totalQuantitySum = useMemo(() => {
    return scopedLines.reduce((acc: number, l: any) => acc + (l.quantity || 0), 0);
  }, [scopedLines]);

  const toggleLineSelect = (lineId: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId]
    );
  };

  const toggleVendorSelect = (vendorId: string) => {
    setSelectedVendorIds((prev) =>
      prev.includes(vendorId) ? prev.filter((id) => id !== vendorId) : [...prev, vendorId]
    );
  };

  // Timeline validation: submission deadline must be later than clarification deadline
  const timelineError = useMemo(() => {
    if (!rfqDetails.submissionDeadline || !rfqDetails.clarificationDeadline) return '';
    const sub = new Date(rfqDetails.submissionDeadline).getTime();
    const clar = new Date(rfqDetails.clarificationDeadline).getTime();
    if (sub <= clar) {
      return 'Submission deadline must be later than the clarification deadline.';
    }
    return '';
  }, [rfqDetails.submissionDeadline, rfqDetails.clarificationDeadline]);

  // Mandatory Navigation Validation Check
  const handleStepNavigation = (targetStep: number) => {
    if (targetStep === step) return;

    // Moving backward is always permitted
    if (targetStep < step) {
      setErrorMsg('');
      setStep(targetStep);
      return;
    }

    // Moving forward enforces mandatory validation
    if (!selectedBoq) {
      setErrorMsg('Step 1: Please select and verify an Approved Commercial Baseline.');
      return;
    }

    if (targetStep >= 3) {
      if (scopedLines.length === 0) {
        setErrorMsg('Step 2: At least one BOQ line item must be included in the RFQ scope.');
        return;
      }
      if (!rfqDetails.title.trim()) {
        setErrorMsg('Step 2: RFQ Title is required.');
        return;
      }
    }

    if (targetStep >= 4) {
      if (timelineError) {
        setErrorMsg(timelineError);
        return;
      }
    }

    if (targetStep >= 5) {
      if (selectedVendorIds.length === 0) {
        setErrorMsg('Step 4: Please invite at least 1 qualified vendor before proceeding to final review.');
        return;
      }
    }

    setErrorMsg('');
    setStep(targetStep);
  };

  const handleCreateRfq = async (action: 'SAVE_DRAFT' | 'RELEASE_RFQ') => {
    setErrorMsg('');
    if (existingActiveRfq) {
      setErrorMsg(`An active RFQ (${existingActiveRfq.rfqNumber}) already exists for this PR. Duplicate sourcing is prevented.`);
      return;
    }
    if (!selectedBoq) {
      setErrorMsg('Please select an Approved BOQ Baseline in Step 1.');
      return;
    }
    if (scopedLines.length === 0) {
      setErrorMsg('At least one BOQ line must be included in the RFQ scope in Step 2.');
      return;
    }
    if (!rfqDetails.title.trim()) {
      setErrorMsg('RFQ Title is required.');
      return;
    }
    if (timelineError) {
      setErrorMsg(timelineError);
      return;
    }
    if (action === 'RELEASE_RFQ' && selectedVendorIds.length === 0) {
      setErrorMsg('Please invite at least one vendor before releasing the RFQ.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        projectId: selectedBoq.projectId,
        boqRevisionId: selectedBoq.id,
        prId: initialPrId || undefined,
        title: rfqDetails.title,
        packageName: rfqDetails.packageName || 'Commercial Package',
        scopeOfWork: rfqDetails.scopeOfWork,
        packageType: scopeType,
        selectedLineIds: scopedLines.map((l: any) => l.id),
        categoryName: scopeType === 'CATEGORY' ? selectedCategory : undefined,
        submissionDeadline: rfqDetails.submissionDeadline,
        clarificationDeadline: rfqDetails.clarificationDeadline,
        commercialValidityDays: rfqDetails.commercialValidityDays,
        deliveryRequirement: rfqDetails.deliveryRequirement,
        paymentTerms: rfqDetails.paymentTerms,
        taxTerms: rfqDetails.taxTerms,
        deliveryTerms: rfqDetails.deliveryTerms,
        warrantyTerms: rfqDetails.warrantyTerms,
        priceBasis: rfqDetails.priceBasis,
        requiredDocuments: rfqDetails.requiredDocuments,
        technicalRequirements: rfqDetails.technicalRequirements,
        commercialRequirements: rfqDetails.commercialRequirements,
        vendorIds: selectedVendorIds,
        action,
      };

      const res = await fetch('/api/procurement/rfqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create RFQ');
      }

      toast.success(
        action === 'RELEASE_RFQ' ? 'RFQ issued successfully.' : 'RFQ draft saved successfully.',
        data.rfq.rfqNumber,
        action === 'RELEASE_RFQ' ? 'Awaiting Quotations' : 'Draft'
      );

      router.push(`/procurement/rfqs/${data.rfq.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred');
      setShowConfirmRelease(false);
      toast.error({
        title: 'RFQ Creation Failed',
        message: err.message || 'An unexpected error occurred while saving the RFQ.',
        recordNumber: sourcePr?.prNumber,
      });
    } finally {
      setSaving(false);
    }
  };

  const getVendorCategories = (categories: any): string[] => {
    if (Array.isArray(categories)) return categories;
    if (typeof categories === 'string' && categories.trim()) {
      try {
        const parsed = JSON.parse(categories);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return categories.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  };

  // Vendor Filtering Logic (Step 4)
  const filteredVendors = useMemo(() => {
    return vendors.filter((v: any) => {
      // Tab filter
      if (vendorTab === 'RATE_CARD' && !rateCards.some((rc) => rc.vendorId === v.id && rc.status === 'APPROVED')) {
        return false;
      }
      if (vendorTab === 'PREVIOUS' && (v.pposCount || 0) === 0 && (v._count?.ppos || 0) === 0) {
        return false;
      }

      // Checkbox filter for Rate Card only
      if (rateCardOnly && !rateCards.some((rc) => rc.vendorId === v.id && rc.status === 'APPROVED')) {
        return false;
      }

      // Search term
      if (vendorSearch.trim()) {
        const term = vendorSearch.toLowerCase();
        const cats = getVendorCategories(v.categories);
        const matchesName = v.name && v.name.toLowerCase().includes(term);
        const matchesCode = (v.vendorCode && v.vendorCode.toLowerCase().includes(term)) || (v.code && v.code.toLowerCase().includes(term));
        const matchesContact = v.contactPerson && v.contactPerson.toLowerCase().includes(term);
        const matchesEmail = v.email && v.email.toLowerCase().includes(term);
        const matchesCat = cats.some((c: string) => c.toLowerCase().includes(term));
        if (!matchesName && !matchesCode && !matchesContact && !matchesEmail && !matchesCat) {
          return false;
        }
      }

      // Dropdown filters
      if (selectedRegion && (v.state || '').toLowerCase() !== selectedRegion.toLowerCase()) {
        return false;
      }
      if (selectedCity && (v.city || '').toLowerCase() !== selectedCity.toLowerCase()) {
        return false;
      }
      if (selectedVendorCategory) {
        const cats = getVendorCategories(v.categories);
        if (!cats.some((c) => c.toLowerCase() === selectedVendorCategory.toLowerCase())) {
          return false;
        }
      }
      if (selectedVendorType !== 'ALL' && v.vendorType !== selectedVendorType) {
        return false;
      }

      return true;
    });
  }, [vendors, vendorTab, rateCardOnly, vendorSearch, selectedRegion, selectedCity, selectedVendorCategory, selectedVendorType, rateCards]);

  // Unique filter lists
  const availableRegions = useMemo(() => Array.from(new Set(vendors.map((v) => v.state).filter(Boolean))), [vendors]);
  const availableCities = useMemo(() => Array.from(new Set(vendors.map((v) => v.city).filter(Boolean))), [vendors]);
  const availableVendorCategories = useMemo(() => {
    const set = new Set<string>();
    vendors.forEach((v) => getVendorCategories(v.categories).forEach((c) => set.add(c)));
    return Array.from(set);
  }, [vendors]);

  // Applicable Rate Cards for Step 4
  const applicableRateCards = useMemo(() => {
    return rateCards.filter((rc) => {
      const isApproved = rc.status === 'APPROVED';
      const notExpired = !rc.validTo || new Date(rc.validTo) >= new Date();
      return isApproved && notExpired;
    });
  }, [rateCards]);

  const activeTheme = STEP_THEMES[step as keyof typeof STEP_THEMES] || STEP_THEMES[1];

  if (loading) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#334155' }}>Initializing RFQ Control Wizard</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Loading approved commercial baselines and vendor records...</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* 1. Common Enterprise Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'RFQs', href: '/procurement/rfqs' },
          { label: 'Create RFQ' },
        ]}
        title="Create Request for Quotation"
        description="Create a structured RFQ from an approved BOQ baseline and invite eligible vendors for competitive bidding."
        badge={<StatusBadge status="DRAFT" size="md" />}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleCreateRfq('SAVE_DRAFT')}
              disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={14} /> Save Draft
            </button>
            <Link href="/procurement/rfqs" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        }
      />


      {/* 3. Exact Five-Step Horizontal Stepper */}
      <Stepper
        steps={wizardSteps}
        currentStep={step}
        onStepClick={handleStepNavigation}
      />

      {/* Duplicate Active RFQ Alert Banner */}
      {existingActiveRfq && (
        <div
          style={{
            margin: '0 0 20px',
            padding: '16px 20px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <AlertTriangle size={24} color="#d97706" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>
                Active Sourcing Event Already Exists for this PR ({existingActiveRfq.rfqNumber})
              </div>
              <div style={{ fontSize: 13, color: '#b45309', marginTop: 3 }}>
                Procurement business governance prohibits duplicate active RFQs for the same approved PR. The existing RFQ is currently in <strong>{existingActiveRfq.status}</strong> stage.
              </div>
            </div>
          </div>
          <Link
            href={`/procurement/rfqs/${existingActiveRfq.id}`}
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}
          >
            Open Active RFQ ({existingActiveRfq.rfqNumber}) →
          </Link>
        </div>
      )}

      {/* Inline Form Error Alert */}
      {errorMsg && (
        <div
          className="alert alert-error"
          style={{
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: 6,
          }}
        >
          <AlertTriangle size={18} />
          <div style={{ fontSize: 13, fontWeight: 500 }}>{errorMsg}</div>
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 1: PROJECT & BOQ BASELINE VERIFICATION (Blue #2563EB)   */}
      {/* ============================================================ */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section Heading with Blue #2563EB Accent */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: STEP_THEMES[1].lightBg,
              border: `1px solid ${STEP_THEMES[1].accentBorder}`,
              borderRadius: 8,
              borderLeft: `5px solid ${STEP_THEMES[1].primary}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: STEP_THEMES[1].primary,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                1
              </span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[1].textDark, margin: 0 }}>
                PROJECT & BOQ BASELINE VERIFICATION
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#475569', margin: '6px 0 0 34px' }}>
              Select and verify the immutable, client-approved commercial baseline to establish package boundaries.
            </p>
          </div>

          <Card
            title={sourcePr ? `Approved PR Baseline: ${sourcePr.prNumber}` : "Approved Commercial Baseline Selection"}
            subtitle="Commercial baseline parameters are locked to the approved governance revision"
          >
            {!sourcePr && (
              <div style={{ marginBottom: 24 }}>
                <label className="form-label" htmlFor="boq-select">
                  Select Approved Commercial Baseline <span className="required">*</span>
                </label>
                <select
                  id="boq-select"
                  className="select"
                  style={{ maxWidth: 640 }}
                  value={selectedBoq?.id || ''}
                  onChange={(e) => {
                    const b = approvedBoqs.find((item) => item.id === e.target.value);
                    if (b) handleSelectBoq(b);
                  }}
                >
                  {approvedBoqs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.projectName} ({b.projectCode}) — Revision {b.approvedRevisionCode} ({b.totalLines} lines)
                    </option>
                  ))}
                </select>
                <div className="form-helper">
                  Only client-approved, governance-locked BOQ revisions can be sourced by procurement.
                </div>
              </div>
            )}

            {selectedBoq && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '20px 24px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h4 style={{ fontSize: 12, color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Baseline Verification Summary
                  </h4>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 12,
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    ✓ Baseline Verified
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 20,
                  }}
                >
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Project Name</div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4, color: '#0f172a' }}>
                      {selectedBoq.projectName}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Project Code</div>
                    <div className="font-mono" style={{ fontWeight: 600, fontSize: 14, marginTop: 4, color: '#1e40af' }}>
                      {selectedBoq.projectCode}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Location</div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.location || 'Bengaluru'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Cost Centre</div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.costCentre || 'General Works'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Approved Revision</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="badge badge-approved" style={{ fontSize: 11, fontWeight: 700 }}>
                        {selectedBoq.approvedRevisionCode} (IMMUTABLE)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Approved Date</div>
                    <div style={{ fontSize: 13, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.approvedAt ? new Date(selectedBoq.approvedAt).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Approved By</div>
                    <div style={{ fontSize: 13, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.approvedBy}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Baseline Items & Value</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: '#1e40af' }}>
                      {selectedBoq.totalLines} Items • ₹ {selectedBoq.totalBenchmarkAmount?.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clear Immutable Policy Notice */}
            <div
              style={{
                marginTop: 20,
                padding: '14px 18px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <Lock size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
                <strong>Immutable Baseline Governance:</strong> In accordance with enterprise procurement policy, all item descriptions, approved quantities, UOMs, and baseline rates are strictly immutable. Procurement RFQs package these line items for competitive market bidding without modifying baseline records.
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 2: SCOPE & PACKAGE DEFINITION (Teal #0D9488)            */}
      {/* ============================================================ */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section Heading with Teal #0D9488 Accent */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: STEP_THEMES[2].lightBg,
              border: `1px solid ${STEP_THEMES[2].accentBorder}`,
              borderRadius: 8,
              borderLeft: `5px solid ${STEP_THEMES[2].primary}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: STEP_THEMES[2].primary,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                2
              </span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[2].textDark, margin: 0 }}>
                SCOPE & PACKAGE DEFINITION
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#0f766e', margin: '6px 0 0 34px' }}>
              Define RFQ package title, target trade, completion timeline, and line-item inclusions from the approved BOQ.
            </p>
          </div>

          {/* Package Details Form */}
          <Card title="Package Metadata" subtitle="Official branding and completion timeline for participating vendors">
            <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div>
                <label className="form-label" htmlFor="rfq-title">
                  RFQ Title <span className="required">*</span>
                </label>
                <input
                  id="rfq-title"
                  type="text"
                  className="input"
                  value={rfqDetails.title}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, title: e.target.value })}
                  placeholder="e.g. RFQ for Civil Finishing & Interior Fitout Package"
                />
                <div className="form-helper">Official title visible to participating vendors.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="package-name">
                  Package / Trade <span className="required">*</span>
                </label>
                <input
                  id="package-name"
                  type="text"
                  className="input"
                  value={rfqDetails.packageName}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, packageName: e.target.value })}
                  placeholder="e.g. Interior Finishing & Joinery"
                />
                <div className="form-helper">Target trade category for procurement categorization.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="expected-completion">
                  Expected Completion Date <span className="required">*</span>
                </label>
                <input
                  id="expected-completion"
                  type="date"
                  className="input"
                  value={rfqDetails.expectedCompletionDate}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, expectedCompletionDate: e.target.value })}
                />
                <div className="form-helper">Target project milestone completion date.</div>
              </div>
            </div>
          </Card>

          {/* Sourcing Scope Mode & Controls Toolbar */}
          <div
            style={{
              padding: '16px 20px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>
                Sourcing Scope Mode:
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    backgroundColor: scopeType === 'ENTIRE_BOQ' ? STEP_THEMES[2].primary : '#ffffff',
                    color: scopeType === 'ENTIRE_BOQ' ? '#ffffff' : '#334155',
                    borderColor: scopeType === 'ENTIRE_BOQ' ? STEP_THEMES[2].primary : '#cbd5e1',
                    fontWeight: 600,
                  }}
                  onClick={() => setScopeType('ENTIRE_BOQ')}
                >
                  Entire Approved BOQ ({selectedBoq?.lines.length} lines)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    backgroundColor: scopeType === 'CATEGORY' ? STEP_THEMES[2].primary : '#ffffff',
                    color: scopeType === 'CATEGORY' ? '#ffffff' : '#334155',
                    borderColor: scopeType === 'CATEGORY' ? STEP_THEMES[2].primary : '#cbd5e1',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setScopeType('CATEGORY');
                    if (selectedBoq?.categories?.length > 0 && !selectedCategory) {
                      setSelectedCategory(selectedBoq.categories[0].category);
                    }
                  }}
                >
                  By Category / Package
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    backgroundColor: scopeType === 'SELECTED_LINES' ? STEP_THEMES[2].primary : '#ffffff',
                    color: scopeType === 'SELECTED_LINES' ? '#ffffff' : '#334155',
                    borderColor: scopeType === 'SELECTED_LINES' ? STEP_THEMES[2].primary : '#cbd5e1',
                    fontWeight: 600,
                  }}
                  onClick={() => setScopeType('SELECTED_LINES')}
                >
                  Select Individual Lines ({selectedLineIds.length} selected)
                </button>
              </div>
            </div>

            {/* Scope Summary Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '8px 16px',
                backgroundColor: STEP_THEMES[2].lightBg,
                borderRadius: 6,
                border: `1px solid ${STEP_THEMES[2].accentBorder}`,
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 600, textTransform: 'uppercase' }}>Scoped Items:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginLeft: 6 }}>
                  {scopedLines.length} / {selectedBoq?.lines.length}
                </span>
              </div>
              <div style={{ width: 1, height: 16, backgroundColor: '#99f6e4' }} />
              <div>
                <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 600, textTransform: 'uppercase' }}>Benchmark Budget:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginLeft: 6 }}>
                  ₹ {scopedBenchmarkValue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Scope Table Filter Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedLineIds(selectedBoq?.lines.map((l: any) => l.id) || [])}
              >
                Select All ({selectedBoq?.lines.length})
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedLineIds([])}
              >
                Deselect All
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {scopeType === 'CATEGORY' && (
                <select
                  className="select"
                  style={{ width: 220, height: 34, fontSize: 12 }}
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {selectedBoq?.categories.map((c: any) => (
                    <option key={c.category} value={c.category}>
                      {c.category} ({c.lineCount} lines)
                    </option>
                  ))}
                </select>
              )}
              <div style={{ position: 'relative', width: 260 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: 30, height: 34, fontSize: 12 }}
                  placeholder="Filter items by description..."
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* BOQ Line-Item Selection Table (Primary Dominant Component) */}
          <Card title="Approved BOQ Line Items" subtitle="Quantities, specifications, and baseline rates are immutable" noPadding>
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%', minWidth: 1080 }}>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedBoq?.lines.length > 0 && selectedLineIds.length === selectedBoq?.lines.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLineIds(selectedBoq?.lines.map((l: any) => l.id) || []);
                          } else {
                            setSelectedLineIds([]);
                          }
                        }}
                      />
                    </th>
                    <th style={{ width: 60 }}>S.No.</th>
                    <th style={{ minWidth: 260 }}>Item Description</th>
                    <th style={{ minWidth: 160 }}>Specification</th>
                    <th style={{ width: 120 }}>Category</th>
                    <th style={{ width: 70 }}>UOM</th>
                    <th style={{ width: 110, textAlign: 'right' }}>Quantity (Locked)</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Baseline Rate</th>
                    <th style={{ width: 130, textAlign: 'right' }}>Baseline Amount</th>
                    <th style={{ width: 130, textAlign: 'center' }}>Include in RFQ</th>
                    <th style={{ minWidth: 160 }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBoq?.lines
                    .filter((l: any) => {
                      if (!lineSearch.trim()) return true;
                      const term = lineSearch.toLowerCase();
                      return (
                        (l.description && l.description.toLowerCase().includes(term)) ||
                        (l.specification && l.specification.toLowerCase().includes(term)) ||
                        (l.category && l.category.toLowerCase().includes(term))
                      );
                    })
                    .map((l: any) => {
                      const isIncluded =
                        scopeType === 'ENTIRE_BOQ'
                          ? true
                          : scopeType === 'CATEGORY'
                          ? l.category === selectedCategory
                          : selectedLineIds.includes(l.id);

                      return (
                        <tr
                          key={l.id}
                          style={{
                            backgroundColor: isIncluded ? 'rgba(13, 148, 136, 0.02)' : '#ffffff',
                            opacity: isIncluded ? 1 : 0.45,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedLineIds.includes(l.id)}
                              onChange={() => toggleLineSelect(l.id)}
                            />
                          </td>
                          <td className="font-mono text-muted" style={{ fontSize: 12 }}>
                            {l.lineNumber}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{l.description}</div>
                          </td>
                          <td>
                            <SpecificationCell
                              specification={l.specification}
                              lineNumber={l.lineNumber}
                              itemDescription={l.description}
                              lineId={l.boqLineId || l.id}
                              maxWidth={180}
                            />
                          </td>
                          <td>
                            <span className="badge badge-draft" style={{ fontSize: 11 }}>
                              {l.category}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: '#475569' }}>{l.uom}</td>
                          <td style={{ fontWeight: 700, textAlign: 'right', color: '#0f172a', fontSize: 13 }}>
                            {l.quantity.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13, color: '#334155' }}>
                            ₹ {l.benchmarkRate?.toLocaleString()}
                          </td>
                          <td style={{ fontWeight: 700, textAlign: 'right', color: '#0f766e', fontSize: 13 }}>
                            ₹ {l.benchmarkAmount?.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => toggleLineSelect(l.id)}
                              style={{
                                border: 'none',
                                background: isIncluded ? '#ccfbf1' : '#f1f5f9',
                                color: isIncluded ? '#0f766e' : '#64748b',
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              {isIncluded ? <Check size={12} strokeWidth={2.5} /> : <X size={12} />}
                              {isIncluded ? 'Included' : 'Excluded'}
                            </button>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="input"
                              style={{ height: 28, fontSize: 11, padding: '2px 8px' }}
                              placeholder="Optional line note..."
                              value={lineRemarks[l.id] || ''}
                              onChange={(e) =>
                                setLineRemarks({ ...lineRemarks, [l.id]: e.target.value })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 3: COMMERCIAL & TECHNICAL (Purple #9333EA)               */}
      {/* ============================================================ */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section Heading with Purple #9333EA Accent */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: STEP_THEMES[3].lightBg,
              border: `1px solid ${STEP_THEMES[3].accentBorder}`,
              borderRadius: 8,
              borderLeft: `5px solid ${STEP_THEMES[3].primary}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: STEP_THEMES[3].primary,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                3
              </span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[3].textDark, margin: 0 }}>
                COMMERCIAL & TECHNICAL CONDITIONS
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#7e22ce', margin: '6px 0 0 34px' }}>
              Establish binding contractual conditions, commercial milestone deadlines, warranties, and technical compliance criteria.
            </p>
          </div>

          {/* Section 1: Commercial Terms & Milestones */}
          <Card title="Commercial Terms & Milestones" subtitle="Standardized contractual conditions for vendor quote submissions">
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label className="form-label" htmlFor="sub-deadline">
                  Submission Deadline <span className="required">*</span>
                </label>
                <input
                  id="sub-deadline"
                  type="date"
                  className={`input ${timelineError ? 'border-red-500' : ''}`}
                  value={rfqDetails.submissionDeadline}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, submissionDeadline: e.target.value })}
                  style={{ borderColor: timelineError ? '#ef4444' : undefined }}
                />
                {timelineError ? (
                  <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{timelineError}</div>
                ) : (
                  <div className="form-helper">Final timestamp for quote receipt. Sealed bidding applies.</div>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="clar-deadline">
                  Clarification Deadline <span className="required">*</span>
                </label>
                <input
                  id="clar-deadline"
                  type="date"
                  className="input"
                  value={rfqDetails.clarificationDeadline}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, clarificationDeadline: e.target.value })}
                />
                <div className="form-helper">Cut-off date for vendor technical pre-bid queries.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="validity-days">
                  Commercial Validity (Days) <span className="required">*</span>
                </label>
                <input
                  id="validity-days"
                  type="number"
                  min="15"
                  max="180"
                  className="input"
                  value={rfqDetails.commercialValidityDays}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, commercialValidityDays: Number(e.target.value) })}
                />
                <div className="form-helper">Number of calendar days quotations must remain binding.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="payment-terms">
                  Payment Terms <span className="required">*</span>
                </label>
                <input
                  id="payment-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.paymentTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, paymentTerms: e.target.value })}
                  placeholder="e.g. 30 days net from certified progressive invoice"
                />
                <div className="form-helper">Invoice certification and payment disbursement cycle.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="delivery-requirement">
                  Delivery Schedule / Requirement <span className="required">*</span>
                </label>
                <input
                  id="delivery-requirement"
                  type="text"
                  className="input"
                  value={rfqDetails.deliveryRequirement}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, deliveryRequirement: e.target.value })}
                  placeholder="e.g. Site delivery within 45 days from work order"
                />
                <div className="form-helper">Mandatory project milestone delivery timeline.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="tax-terms">
                  Taxes and GST <span className="required">*</span>
                </label>
                <input
                  id="tax-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.taxTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, taxTerms: e.target.value })}
                  placeholder="e.g. GST 18% extra as applicable"
                />
                <div className="form-helper">Statutory duties, GST, and cess treatment.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="delivery-terms">
                  Freight & Insurance (Incoterms) <span className="required">*</span>
                </label>
                <input
                  id="delivery-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.deliveryTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, deliveryTerms: e.target.value })}
                  placeholder="e.g. FOR Destination / Freight & Transit Insurance included"
                />
                <div className="form-helper">Logistics, freight responsibility, and transit insurance.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="warranty-terms">
                  Warranty / Defect Liability <span className="required">*</span>
                </label>
                <input
                  id="warranty-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.warrantyTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, warrantyTerms: e.target.value })}
                  placeholder="e.g. 12 Months DLP from site handover"
                />
                <div className="form-helper">Post-handover defect liability or manufacturer warranty.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="performance-security">
                  Performance Security
                </label>
                <input
                  id="performance-security"
                  type="text"
                  className="input"
                  value={rfqDetails.performanceSecurity}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, performanceSecurity: e.target.value })}
                  placeholder="e.g. 5% PBG upon award"
                />
                <div className="form-helper">Security deposit or performance bank guarantee clause.</div>
              </div>

              <div>
                <label className="form-label" htmlFor="liquidated-damages">
                  Liquidated Damages
                </label>
                <input
                  id="liquidated-damages"
                  type="text"
                  className="input"
                  value={rfqDetails.liquidatedDamages}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, liquidatedDamages: e.target.value })}
                  placeholder="e.g. 0.5% per week of delay up to max 5%"
                />
                <div className="form-helper">Contractual delay penalty schedule.</div>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label" htmlFor="price-basis">
                  Price Basis <span className="required">*</span>
                </label>
                <select
                  id="price-basis"
                  className="select"
                  value={rfqDetails.priceBasis}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, priceBasis: e.target.value })}
                >
                  <option value="Firm & Fixed — No escalation allowed">Firm & Fixed — No escalation allowed</option>
                  <option value="Variable with Material Index escalation">Variable with Material Index escalation</option>
                  <option value="Unit Rate Re-measureable based on actual site install">Unit Rate Re-measureable based on actual site install</option>
                </select>
                <div className="form-helper">Contract price adjustment policy.</div>
              </div>
            </div>
          </Card>

          {/* Section 2: Technical Specifications & Compliance */}
          <Card title="Technical Specifications & Standards" subtitle="Mandatory engineering parameters and technical compliance criteria">
            <div>
              <label className="form-label" htmlFor="tech-req">
                Technical Specifications & Compliance Criteria <span className="required">*</span>
              </label>
              <textarea
                id="tech-req"
                className="textarea"
                rows={4}
                value={rfqDetails.technicalRequirements}
                onChange={(e) => setRfqDetails({ ...rfqDetails, technicalRequirements: e.target.value })}
              />
              <div className="form-helper">
                Specify engineering standards, approved brands, tolerances, testing certificates, and compliance statements.
              </div>
            </div>
          </Card>

          {/* Section 3: Mandatory Compliance Documents */}
          <Card title="Mandatory Compliance Documents & Attachments" subtitle="Documents required from vendors during quotation submission">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {rfqDetails.requiredDocuments.map((doc, idx) => (
                <span
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    background: '#f3e8ff',
                    color: '#6b21a8',
                    border: '1px solid #d8b4fe',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Paperclip size={12} />
                  {doc}
                  <button
                    type="button"
                    onClick={() =>
                      setRfqDetails({
                        ...rfqDetails,
                        requiredDocuments: rfqDetails.requiredDocuments.filter((_, i) => i !== idx),
                      })
                    }
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#6b21a8', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, maxWidth: 420 }}>
              <input
                type="text"
                className="input"
                placeholder="Add document requirement (e.g. ISO Certificate)..."
                value={newDocInput}
                onChange={(e) => setNewDocInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDocInput.trim()) {
                    e.preventDefault();
                    setRfqDetails({
                      ...rfqDetails,
                      requiredDocuments: [...rfqDetails.requiredDocuments, newDocInput.trim()],
                    });
                    setNewDocInput('');
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (newDocInput.trim()) {
                    setRfqDetails({
                      ...rfqDetails,
                      requiredDocuments: [...rfqDetails.requiredDocuments, newDocInput.trim()],
                    });
                    setNewDocInput('');
                  }
                }}
              >
                <Plus size={14} style={{ marginRight: 4 }} /> Add
              </button>
            </div>
          </Card>

          {/* Section 4: Commercial Inclusions & Exclusions */}
          <Card title="Commercial Conditions & Inclusions/Exclusions" subtitle="Commercial schedule, tax breakdown, and general contractual terms">
            <div>
              <label className="form-label" htmlFor="comm-req">
                Commercial Requirements & General Terms <span className="required">*</span>
              </label>
              <textarea
                id="comm-req"
                className="textarea"
                rows={4}
                value={rfqDetails.commercialRequirements}
                onChange={(e) => setRfqDetails({ ...rfqDetails, commercialRequirements: e.target.value })}
              />
              <div className="form-helper">
                Specify inclusions, exclusions, taxes, freight, unloading, site storage, and general contractual obligations.
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 4: VENDOR SELECTION (Amber #D97706)                     */}
      {/* ============================================================ */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section Heading with Amber #D97706 Accent */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: STEP_THEMES[4].lightBg,
              border: `1px solid ${STEP_THEMES[4].accentBorder}`,
              borderRadius: 8,
              borderLeft: `5px solid ${STEP_THEMES[4].primary}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: STEP_THEMES[4].primary,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                4
              </span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[4].textDark, margin: 0 }}>
                VENDOR SELECTION & INVITATION
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#b45309', margin: '6px 0 0 34px' }}>
              Filter and invite qualified, empanelled suppliers and eligible Rate Card vendors for competitive tender participation.
            </p>
          </div>

          {/* Filter & Search Toolbar */}
          <div
            style={{
              padding: '16px 20px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* View Selection Tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    backgroundColor: vendorTab === 'ALL' ? STEP_THEMES[4].primary : '#ffffff',
                    color: vendorTab === 'ALL' ? '#ffffff' : '#334155',
                    borderColor: vendorTab === 'ALL' ? STEP_THEMES[4].primary : '#cbd5e1',
                    fontWeight: 600,
                  }}
                  onClick={() => setVendorTab('ALL')}
                >
                  All Eligible Vendors ({vendors.length})
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    backgroundColor: vendorTab === 'RATE_CARD' ? STEP_THEMES[4].primary : '#ffffff',
                    color: vendorTab === 'RATE_CARD' ? '#ffffff' : '#334155',
                    borderColor: vendorTab === 'RATE_CARD' ? STEP_THEMES[4].primary : '#cbd5e1',
                    fontWeight: 600,
                  }}
                  onClick={() => setVendorTab('RATE_CARD')}
                >
                  Rate Card Vendors ({applicableRateCards.length})
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    backgroundColor: vendorTab === 'PREVIOUS' ? STEP_THEMES[4].primary : '#ffffff',
                    color: vendorTab === 'PREVIOUS' ? '#ffffff' : '#334155',
                    borderColor: vendorTab === 'PREVIOUS' ? STEP_THEMES[4].primary : '#cbd5e1',
                    fontWeight: 600,
                  }}
                  onClick={() => setVendorTab('PREVIOUS')}
                >
                  Previously Worked With
                </button>
              </div>

              {/* Invited Count Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  backgroundColor: STEP_THEMES[4].lightBg,
                  border: `1px solid ${STEP_THEMES[4].accentBorder}`,
                  borderRadius: 20,
                  color: STEP_THEMES[4].textDark,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <span>★</span> {selectedVendorIds.length} Vendors Invited
              </div>
            </div>

            {/* Filter Dropdowns Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: 30, height: 34, fontSize: 12 }}
                  placeholder="Search name, code, contact..."
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                />
              </div>

              <select
                className="select"
                style={{ height: 34, fontSize: 12 }}
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
              >
                <option value="">All Regions / States</option>
                {availableRegions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                className="select"
                style={{ height: 34, fontSize: 12 }}
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <option value="">All Cities</option>
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                className="select"
                style={{ height: 34, fontSize: 12 }}
                value={selectedVendorCategory}
                onChange={(e) => setSelectedVendorCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {availableVendorCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                className="select"
                style={{ height: 34, fontSize: 12 }}
                value={selectedVendorType}
                onChange={(e) => setSelectedVendorType(e.target.value)}
              >
                <option value="ALL">All Vendor Types</option>
                <option value="CLIENT_VENDOR">Client Empanelled</option>
                <option value="PROCUCEV_VENDOR">proCPX Network</option>
              </select>
            </div>

            {/* Action Bar & Quick Selection */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rateCardOnly}
                  onChange={(e) => setRateCardOnly(e.target.checked)}
                />
                Show Only Rate Card Vendors
              </label>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const compliant = filteredVendors
                      .filter((v: any) => !v.isBlacklisted && v.complianceStatus === 'COMPLIANT')
                      .map((v: any) => v.id);
                    setSelectedVendorIds(Array.from(new Set([...selectedVendorIds, ...compliant])));
                  }}
                >
                  Select All Compliant ({filteredVendors.filter((v: any) => v.complianceStatus === 'COMPLIANT').length})
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedVendorIds([])}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>

          {/* Main Eligible Vendors Table */}
          <Card title="Eligible Suppliers" subtitle="Suppliers qualified under category, regional, and compliance governance" noPadding>
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%', minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>Invite</th>
                    <th style={{ width: 50 }}>#</th>
                    <th style={{ minWidth: 200 }}>Vendor Name</th>
                    <th style={{ width: 130 }}>Region / City</th>
                    <th style={{ minWidth: 160 }}>Categories</th>
                    <th style={{ width: 120 }}>Qualification</th>
                    <th style={{ width: 130 }}>Rate Card Status</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Rating</th>
                    <th style={{ width: 140 }}>Contact Person</th>
                    <th style={{ width: 120, textAlign: 'center' }}>Invitation Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((v: any, idx: number) => {
                    const isSelected = selectedVendorIds.includes(v.id);
                    const matchingRateCard = applicableRateCards.find((rc) => rc.vendorId === v.id);
                    const cats = getVendorCategories(v.categories);

                    return (
                      <tr
                        key={v.id}
                        style={{
                          backgroundColor: isSelected ? 'rgba(217, 119, 6, 0.03)' : '#ffffff',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={v.isBlacklisted}
                            onChange={() => toggleVendorSelect(v.id)}
                          />
                        </td>
                        <td className="font-mono text-muted" style={{ fontSize: 12 }}>
                          {idx + 1}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{v.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {v.vendorCode || v.code} • {v.email || 'portal@vendor.com'}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#334155' }}>
                          {v.city ? `${v.city}, ${v.state || 'IN'}` : v.state || 'India'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {cats.slice(0, 2).map((c: string) => (
                              <span key={c} className="badge badge-draft" style={{ fontSize: 10 }}>
                                {c}
                              </span>
                            ))}
                            {cats.length > 2 && (
                              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                                +{cats.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              v.complianceStatus === 'COMPLIANT' ? 'badge-approved' : 'badge-draft'
                            }`}
                            style={{ fontSize: 11 }}
                          >
                            {v.qualificationStatus || v.complianceStatus || 'QUALIFIED'}
                          </span>
                        </td>
                        <td>
                          {matchingRateCard ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 4,
                                backgroundColor: '#ecfdf5',
                                color: '#065f46',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              ✓ Active (1)
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>None</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#d97706', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Star size={12} fill="#d97706" color="#d97706" />
                            {v.performanceScore || v.rating || '4.8'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#475569' }}>
                          <div>{v.contactPerson || 'Commercial Head'}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{v.phone || '+91 98000 00000'}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              backgroundColor: isSelected ? '#fef3c7' : '#f1f5f9',
                              color: isSelected ? '#92400e' : '#64748b',
                            }}
                          >
                            {isSelected ? 'INVITED' : 'NOT INVITED'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Compact Eligible Rate Card Vendors Table (Separate Section Below Main Table) */}
          <Card
            title="Eligible Rate Card Vendors"
            subtitle="Vendors holding approved, active master rate agreements applicable to this scope"
            noPadding
          >
            {applicableRateCards.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No active rate cards are currently registered for this package category.
              </div>
            ) : (
              <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                <table className="table enterprise-table" style={{ width: '100%', minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th>Vendor Name</th>
                      <th>Rate Card Reference</th>
                      <th>Category</th>
                      <th>Valid From</th>
                      <th>Valid To</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicableRateCards.map((rc: any) => {
                      const isInvited = selectedVendorIds.includes(rc.vendorId);

                      return (
                        <tr key={rc.id}>
                          <td style={{ fontWeight: 600, color: '#0f172a' }}>
                            {rc.vendor?.name || 'Approved Supplier'}
                          </td>
                          <td className="font-mono text-muted">{rc.rateCardNumber || 'VRC-2026-000001'}</td>
                          <td>
                            <span className="badge badge-draft">{rc.category}</span>
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {rc.validFrom ? new Date(rc.validFrom).toLocaleDateString() : '01/01/2026'}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {rc.validTo ? new Date(rc.validTo).toLocaleDateString() : '31/12/2026'}
                          </td>
                          <td>
                            <span className="badge badge-approved">APPROVED</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={`btn btn-xs ${isInvited ? 'btn-secondary' : 'btn-primary'}`}
                              onClick={() => toggleVendorSelect(rc.vendorId)}
                              style={{
                                backgroundColor: isInvited ? undefined : STEP_THEMES[4].primary,
                                borderColor: isInvited ? undefined : STEP_THEMES[4].primary,
                              }}
                            >
                              {isInvited ? '✓ Invited' : 'Invite Vendor'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Validation Notice if 0 Vendors Selected */}
          {selectedVendorIds.length === 0 && (
            <div
              style={{
                padding: '12px 16px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 6,
                color: '#92400e',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={16} color="#d97706" />
              <span>
                Please invite at least 1 qualified supplier. A minimum of 3 vendors is recommended to guarantee competitive price discovery.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 5: REVIEW & RELEASE (Green #059669)                     */}
      {/* ============================================================ */}
      {step === 5 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section Heading with Green #059669 Accent */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: STEP_THEMES[5].lightBg,
              border: `1px solid ${STEP_THEMES[5].accentBorder}`,
              borderRadius: 8,
              borderLeft: `5px solid ${STEP_THEMES[5].primary}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: STEP_THEMES[5].primary,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                5
              </span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[5].textDark, margin: 0 }}>
                FINAL REVIEW & RELEASE TO MARKET
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#047857', margin: '6px 0 0 34px' }}>
              Perform pre-release validation and publish the competitive RFQ package to invited vendors.
            </p>
          </div>

          {/* Executive Summary KPI Cards (Green Accents) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            <div className="kpi-card" style={{ borderLeft: `4px solid ${STEP_THEMES[5].primary}` }}>
              <div className="kpi-label">Scoped BOQ Lines</div>
              <div className="kpi-value">{scopedLines.length} Items</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total Quantity</div>
              <div className="kpi-value">{totalQuantitySum.toLocaleString()} Units</div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `4px solid ${STEP_THEMES[5].primary}` }}>
              <div className="kpi-label">Benchmark Budget (Locked)</div>
              <div className="kpi-value" style={{ color: STEP_THEMES[5].primary }}>
                ₹ {scopedBenchmarkValue.toLocaleString()}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Invited Vendors</div>
              <div className="kpi-value">{selectedVendorIds.length} Suppliers</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Submission Deadline</div>
              <div className="kpi-value font-mono" style={{ fontSize: 15 }}>
                {rfqDetails.submissionDeadline}
              </div>
            </div>
          </div>

          {/* Review Panel 1: Project & BOQ Baseline */}
          <Card
            title="Project & Commercial Baseline"
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>
                <Pencil size={12} style={{ marginRight: 4 }} /> Edit Step 1
              </button>
            }
          >
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Project</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                  {selectedBoq?.projectName} ({selectedBoq?.projectCode})
                </div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Location & Cost Centre</div>
                <div style={{ fontWeight: 500, fontSize: 14, marginTop: 2 }}>
                  {selectedBoq?.location || 'Bengaluru'} • {selectedBoq?.costCentre || 'General Works'}
                </div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Approved Revision</div>
                <div style={{ marginTop: 2 }}>
                  <span className="badge badge-approved">{selectedBoq?.approvedRevisionCode} (IMMUTABLE)</span>
                </div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Approved Date & Approver</div>
                <div style={{ fontSize: 13, marginTop: 2, color: '#334155' }}>
                  {selectedBoq?.approvedAt ? new Date(selectedBoq.approvedAt).toLocaleDateString() : '—'} by {selectedBoq?.approvedBy}
                </div>
              </div>
            </div>
          </Card>

          {/* Review Panel 2: Scope & Package Overview */}
          <Card
            title="Package Scope & Line Items"
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>
                <Pencil size={12} style={{ marginRight: 4 }} /> Edit Step 2
              </button>
            }
          >
            <div style={{ marginBottom: 16 }}>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>RFQ Title</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginTop: 2 }}>{rfqDetails.title}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Package / Trade</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', marginTop: 2 }}>{rfqDetails.packageName}</div>
                </div>
              </div>
            </div>

            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>S.No.</th>
                    <th>Item Description</th>
                    <th>Category</th>
                    <th>UOM</th>
                    <th style={{ textAlign: 'right' }}>Quantity</th>
                    <th style={{ textAlign: 'right' }}>Baseline Rate</th>
                    <th style={{ textAlign: 'right' }}>Baseline Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedLines.slice(0, 5).map((l: any) => (
                    <tr key={l.id}>
                      <td className="font-mono text-muted">{l.lineNumber}</td>
                      <td style={{ fontWeight: 600 }}>{l.description}</td>
                      <td><span className="badge badge-draft">{l.category}</span></td>
                      <td>{l.uom}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.quantity.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>₹ {l.benchmarkRate?.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                        ₹ {l.benchmarkAmount?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {scopedLines.length > 5 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: '8px 0' }}>
                        + {scopedLines.length - 5} more items included in package
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Review Panel 3: Commercial Terms & Milestones */}
          <Card
            title="Commercial & Technical Terms"
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(3)}>
                <Pencil size={12} style={{ marginRight: 4 }} /> Edit Step 3
              </button>
            }
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Submission Deadline</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{rfqDetails.submissionDeadline}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Clarification Deadline</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{rfqDetails.clarificationDeadline}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Commercial Validity</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{rfqDetails.commercialValidityDays} Days</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Payment Terms</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{rfqDetails.paymentTerms}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Tax Terms</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{rfqDetails.taxTerms}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Delivery / Incoterms</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{rfqDetails.deliveryTerms}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
              <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>
                Mandatory Vendor Documents
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {rfqDetails.requiredDocuments.map((doc, i) => (
                  <span key={i} className="badge badge-draft" style={{ fontSize: 11 }}>
                    <Paperclip size={10} style={{ marginRight: 4 }} /> {doc}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {/* Review Panel 4: Invited Vendors */}
          <Card
            title="Invited Vendors"
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(4)}>
                <Pencil size={12} style={{ marginRight: 4 }} /> Edit Step 4
              </button>
            }
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {selectedVendorIds.map((vId) => {
                const v = vendors.find((item: any) => item.id === vId);
                const hasRc = applicableRateCards.some((rc) => rc.vendorId === vId);
                return (
                  <div
                    key={vId}
                    style={{
                      padding: '10px 14px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{v?.name || vId}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {v?.vendorCode || v?.code} • Rating: ★ {v?.performanceScore || '4.8'}
                      {hasRc && <span style={{ marginLeft: 6, color: '#059669', fontWeight: 700 }}>• Rate Card</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Review Panel 5: Pre-Release Governance & Compliance Checklist */}
          <div
            style={{
              padding: '18px 22px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
            }}
          >
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#166534', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color="#166534" /> Pre-Release Governance & Compliance Verification
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, fontSize: 13, color: '#14532d' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" /> Baseline BOQ verified & immutable
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" /> Sourcing scope defined ({scopedLines.length} line items)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" /> Commercial terms & timelines validated
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" /> Qualified suppliers invited ({selectedVendorIds.length} vendors)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. PERSISTENT BOTTOM ACTION BAR                              */}
      {/* ============================================================ */}
      <div className="bottom-bar" id="rfq-bottom-nav-bar" style={{ zIndex: 100 }}>
        <div>
          {step > 1 ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleStepNavigation(step - 1)}
            >
              <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back to Step {step - 1}
            </button>
          ) : (
            <Link href="/procurement/rfqs" className="btn btn-secondary">
              Cancel RFQ
            </Link>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleCreateRfq('SAVE_DRAFT')}
            disabled={saving || Boolean(existingActiveRfq)}
            title={existingActiveRfq ? 'Duplicate RFQ creation is blocked: an active RFQ already exists for this PR' : undefined}
          >
            <Save size={14} style={{ marginRight: 6 }} /> Save Draft
          </button>

          {step < 5 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleStepNavigation(step + 1)}
              disabled={step === 2 && scopedLines.length === 0}
              style={{
                backgroundColor: activeTheme.primary,
                borderColor: activeTheme.primary,
              }}
            >
              Continue to Step {step + 1} <ArrowRight size={14} style={{ marginLeft: 6 }} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowConfirmRelease(true)}
              disabled={saving || Boolean(existingActiveRfq) || selectedVendorIds.length === 0}
              style={{
                background: STEP_THEMES[5].primary,
                borderColor: STEP_THEMES[5].primary,
              }}
              title={existingActiveRfq ? 'Duplicate RFQ creation is blocked: an active RFQ already exists for this PR' : undefined}
            >
              <Send size={14} style={{ marginRight: 6 }} /> Release RFQ to Vendors ({selectedVendorIds.length})
            </button>
          )}
        </div>
      </div>

      {/* 5. Confirmation Release Modal */}
      <Modal
        isOpen={showConfirmRelease}
        onClose={() => setShowConfirmRelease(false)}
        title="Confirm RFQ Release to Market"
        subtitle="Final verification before publishing competitive bidding package"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowConfirmRelease(false)}
              disabled={saving}
            >
              Back to Review
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleCreateRfq('RELEASE_RFQ')}
              disabled={saving}
              style={{ background: STEP_THEMES[5].primary, borderColor: STEP_THEMES[5].primary }}
            >
              {saving ? 'Releasing RFQ...' : 'Confirm & Release RFQ'}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
          <p>
            You are about to publish and release <strong>{rfqDetails.title}</strong> to{' '}
            <strong>{selectedVendorIds.length} invited vendor(s)</strong>.
          </p>
          <div
            style={{
              margin: '16px 0',
              padding: '12px 16px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 6,
              fontSize: 13,
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} color="#166534" />
            <span>
              Participating vendors will receive secure portal links to view locked baseline specifications and submit competitive item-rate quotations.
            </span>
          </div>
          <ul style={{ paddingLeft: 20, margin: 0, fontSize: 13, color: '#64748b' }}>
            <li>Baseline benchmark budget: ₹ {scopedBenchmarkValue.toLocaleString()}</li>
            <li>Package line items: {scopedLines.length} Items</li>
            <li>Submission deadline: {rfqDetails.submissionDeadline}</li>
            <li>Commercial validity: {rfqDetails.commercialValidityDays} Days</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
