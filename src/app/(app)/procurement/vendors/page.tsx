'use client';
// src/app/(app)/procurement/vendors/page.tsx
// Corporate Vendor Management Module (Category Manager Workspace)
// Features: Immediate Vendor Onboarding (2-Step), Directory, and Filtered Evaluation Hub with Explicit Vendor Selection Dropdown
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Building2,
  Building,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileText,
  ShieldCheck,
  Star,
  ExternalLink,
  Users,
  Globe,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Info,
  TrendingUp,
  Award,
  RefreshCw,
  HelpCircle,
  Check,
  RotateCcw,
  X,
  ChevronRight,
  ChevronDown,
  Loader2,
  MapPin,
  Briefcase,
  Layers,
  FileCheck2,
  CheckSquare,
  Square,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { useToast } from '@/components/ui/Toast';

export default function VendorManagementPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'directory' | 'onboarding' | 'evaluation'>('directory');

  // Directory Tab Filters
  const [vendorGroup, setVendorGroup] = useState<'ALL' | 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR'>('ALL');
  const [qualificationFilter, setQualificationFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  // Evaluation Hub Filters
  // 1. Classification Tabs (All Vendors, Client Vendors, Procucev Network Vendors)
  const [evalVendorType, setEvalVendorType] = useState<'ALL' | 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR'>('ALL');
  const [evalCategory, setEvalCategory] = useState<string>('ALL');
  const [evalRegion, setEvalRegion] = useState<string>('ALL');
  const [evalQualificationStatus, setEvalQualificationStatus] = useState<string>('ALL');
  const [evalSearch, setEvalSearch] = useState<string>('');

  // Applied Evaluation Filters
  const [appliedEvalFilters, setAppliedEvalFilters] = useState({
    category: 'ALL',
    region: 'ALL',
    qualificationStatus: 'ALL',
    search: '',
  });

  const [vendors, setVendors] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({
    total: 0,
    clientVendorsCount: 0,
    procucevVendorsCount: 0,
    qualifiedCount: 0,
    pendingReviewCount: 0,
    notEvaluatedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  // Explicit Vendor Selection Dropdown State
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [vendorDropdownSearch, setVendorDropdownSearch] = useState('');
  const vendorDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        vendorDropdownRef.current &&
        !vendorDropdownRef.current.contains(event.target as Node)
      ) {
        setIsVendorDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selection & Bulk Evaluation State
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkEvaluating, setBulkEvaluating] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<
    Record<
      string,
      {
        status: 'pending' | 'running' | 'success' | 'failed';
        score?: number;
        outcome?: string;
        message?: string;
      }
    >
  >({});

  // Immediate Onboarding Form State
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
  const [savedVendorId, setSavedVendorId] = useState<string | null>(null);
  const [submittingOnboard, setSubmittingOnboard] = useState(false);
  const [onboardSuccessMsg, setOnboardSuccessMsg] = useState<string>('');
  const [onboardErrorMsg, setOnboardErrorMsg] = useState<string>('');
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});

  const [newVendor, setNewVendor] = useState({
    name: '',
    vendorType: 'CLIENT_VENDOR' as 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR',
    contactPerson: '',
    email: '',
    phone: '',
    phoneCountryCode: '+91',
    alternatePhone: '',
    altPhoneCountryCode: '+91',
    category: 'Civil & Interior',
    operatingLocation: '',
    city: '',
    state: '',
    legalStructure: 'PRIVATE_LIMITED',
    gstin: '',
    pan: '',
    website: '',
    address: '',
    experienceYears: 5,
    turnoverCrores: '',
    capabilities: '',
    serviceCoverage: 'Pan-India',
    clientReferences: '',
    certifications: '',
    remarks: '',
  });

  useEffect(() => {
    fetchVendors();
  }, [vendorGroup, qualificationFilter, categoryFilter, search]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (vendorGroup !== 'ALL') params.set('vendorType', vendorGroup);
      if (qualificationFilter !== 'ALL') params.set('qualificationStatus', qualificationFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/procurement/vendors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVendors(data.vendors || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (err) {
      console.error('Failed to load vendors', err);
    } finally {
      setLoading(false);
    }
  };

  // Derive unique categories and operating regions for the filter dropdowns
  const availableCategories = useMemo(() => {
    const defaultList = [
      'Civil & Interior',
      'Civil & Structural',
      'Civil Works',
      'Electrical',
      'Electrical & Automation',
      'Electrical, HVAC & Plumbing',
      'HVAC',
      'HVAC & MEP',
      'Plumbing & Sanitary',
      'Retail Fixtures & Joinery',
      'Structural Steel, Prefab',
      'General Contracting',
      'Hospitality Supplies',
    ];
    const fromData = vendors.flatMap((v) => {
      if (Array.isArray(v.categories)) return v.categories;
      if (typeof v.categories === 'string') return [v.categories];
      return [];
    });
    return Array.from(new Set([...defaultList, ...fromData])).sort();
  }, [vendors]);

  const availableRegions = useMemo(() => {
    const defaultRegions = ['Bangalore', 'Hyderabad', 'Mumbai', 'Pan-India', 'Delhi NCR', 'Chennai', 'Pune'];
    const fromData = vendors
      .map((v) => v.city || v.operatingLocation)
      .filter(Boolean)
      .flatMap((loc: string) => loc.split('&').map((s) => s.trim()));
    return Array.from(new Set([...defaultRegions, ...fromData])).filter(Boolean).sort();
  }, [vendors]);

  // Filtered vendors for the Evaluation Hub (respects active classification tabs + applied filters)
  const evaluationVendors = useMemo(() => {
    return vendors.filter((v) => {
      // 1. Classification filter (tabs: All Vendors, Client Vendors, Procucev Network Vendors)
      if (evalVendorType === 'CLIENT_VENDOR') {
        if (v.vendorType === 'PROCUCEV_VENDOR') return false;
      } else if (evalVendorType === 'PROCUCEV_VENDOR') {
        if (v.vendorType !== 'PROCUCEV_VENDOR') return false;
      }

      // 2. Category filter
      if (appliedEvalFilters.category !== 'ALL') {
        const raw = typeof v.categories === 'string' ? v.categories : JSON.stringify(v.categories || '');
        if (!raw.toLowerCase().includes(appliedEvalFilters.category.toLowerCase())) {
          return false;
        }
      }

      // 3. Region / Location filter
      if (appliedEvalFilters.region !== 'ALL') {
        const loc = `${v.operatingLocation || ''} ${v.city || ''} ${v.state || ''}`.toLowerCase();
        if (!loc.includes(appliedEvalFilters.region.toLowerCase())) {
          return false;
        }
      }

      // 4. Qualification / Evaluation Status filter
      if (appliedEvalFilters.qualificationStatus !== 'ALL') {
        if (appliedEvalFilters.qualificationStatus === 'NOT_EVALUATED') {
          if (v.qualificationStatus && v.qualificationStatus !== 'NOT_EVALUATED') return false;
        } else {
          if (v.qualificationStatus !== appliedEvalFilters.qualificationStatus) return false;
        }
      }

      // 5. Search filter (by code, name, gstin, city)
      if (appliedEvalFilters.search.trim()) {
        const q = appliedEvalFilters.search.trim().toLowerCase();
        const codeMatch = v.code?.toLowerCase().includes(q);
        const nameMatch = v.name?.toLowerCase().includes(q);
        const gstinMatch = v.gstin?.toLowerCase().includes(q);
        const cityMatch = v.city?.toLowerCase().includes(q) || v.operatingLocation?.toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !gstinMatch && !cityMatch) {
          return false;
        }
      }

      return true;
    });
  }, [vendors, appliedEvalFilters, evalVendorType]);

  // Handle Classification Tab Change in Evaluation Hub
  const handleClassificationChange = (type: 'ALL' | 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR') => {
    setEvalVendorType(type);
    // Prune selections: keep only selected vendors that belong to the new classification
    // (Prevents silent evaluations of hidden vendors)
    setSelectedVendorIds((prev) =>
      prev.filter((id) => {
        const v = vendors.find((item) => item.id === id);
        if (!v) return false;
        if (type === 'CLIENT_VENDOR') return v.vendorType !== 'PROCUCEV_VENDOR';
        if (type === 'PROCUCEV_VENDOR') return v.vendorType === 'PROCUCEV_VENDOR';
        return true;
      })
    );
  };

  // Apply Evaluation Filters
  const handleApplyEvalFilters = () => {
    setAppliedEvalFilters({
      category: evalCategory,
      region: evalRegion,
      qualificationStatus: evalQualificationStatus,
      search: evalSearch,
    });

    // Prune selections so only vendors matching the newly applied filters remain selected
    const newFiltered = vendors.filter((v) => {
      if (evalVendorType === 'CLIENT_VENDOR' && v.vendorType === 'PROCUCEV_VENDOR') return false;
      if (evalVendorType === 'PROCUCEV_VENDOR' && v.vendorType !== 'PROCUCEV_VENDOR') return false;
      if (evalCategory !== 'ALL') {
        const raw = typeof v.categories === 'string' ? v.categories : JSON.stringify(v.categories || '');
        if (!raw.toLowerCase().includes(evalCategory.toLowerCase())) return false;
      }
      if (evalRegion !== 'ALL') {
        const loc = `${v.operatingLocation || ''} ${v.city || ''} ${v.state || ''}`.toLowerCase();
        if (!loc.includes(evalRegion.toLowerCase())) return false;
      }
      if (evalQualificationStatus !== 'ALL') {
        if (evalQualificationStatus === 'NOT_EVALUATED') {
          if (v.qualificationStatus && v.qualificationStatus !== 'NOT_EVALUATED') return false;
        } else {
          if (v.qualificationStatus !== evalQualificationStatus) return false;
        }
      }
      if (evalSearch.trim()) {
        const q = evalSearch.trim().toLowerCase();
        const codeMatch = v.code?.toLowerCase().includes(q);
        const nameMatch = v.name?.toLowerCase().includes(q);
        const gstinMatch = v.gstin?.toLowerCase().includes(q);
        const cityMatch = v.city?.toLowerCase().includes(q) || v.operatingLocation?.toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !gstinMatch && !cityMatch) return false;
      }
      return true;
    });

    const validIds = new Set(newFiltered.map((v) => v.id));
    setSelectedVendorIds((prev) => prev.filter((id) => validIds.has(id)));
  };

  // Clear Evaluation Filters
  const handleClearEvalFilters = () => {
    setEvalCategory('ALL');
    setEvalRegion('ALL');
    setEvalQualificationStatus('ALL');
    setEvalSearch('');
    setAppliedEvalFilters({
      category: 'ALL',
      region: 'ALL',
      qualificationStatus: 'ALL',
      search: '',
    });
    setSelectedVendorIds([]);
  };

  // Vendors displayed inside the "Select Vendors for Evaluation" dropdown
  const dropdownVendors = useMemo(() => {
    if (!vendorDropdownSearch.trim()) return evaluationVendors;
    const q = vendorDropdownSearch.trim().toLowerCase();
    return evaluationVendors.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.code?.toLowerCase().includes(q) ||
        v.city?.toLowerCase().includes(q) ||
        v.operatingLocation?.toLowerCase().includes(q)
    );
  }, [evaluationVendors, vendorDropdownSearch]);

  // Concise label for the vendor-selection dropdown trigger button
  const dropdownTriggerLabel = useMemo(() => {
    if (selectedVendorIds.length === 0) {
      return `Select Vendors for Evaluation (${evaluationVendors.length} available)...`;
    }
    if (selectedVendorIds.length === 1) {
      const v = vendors.find((item) => item.id === selectedVendorIds[0]);
      return v ? `${v.name} (${v.code})` : '1 vendor selected';
    }
    return `${selectedVendorIds.length} vendors selected for evaluation`;
  }, [selectedVendorIds, vendors, evaluationVendors]);

  // Selection Checkbox Handlers
  const handleToggleSelectVendor = (id: string) => {
    setSelectedVendorIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = evaluationVendors.map((v) => v.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedVendorIds.includes(id));
    if (allSelected) {
      setSelectedVendorIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedVendorIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const isAllVisibleSelected =
    evaluationVendors.length > 0 && evaluationVendors.every((v) => selectedVendorIds.includes(v.id));

  // Validate Step 1 before continuing to Step 2
  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!newVendor.name.trim()) {
      errors.name = 'Vendor Legal / Business Name is required.';
    }
    if (!newVendor.contactPerson.trim()) {
      errors.contactPerson = 'Primary Contact Person is required.';
    }
    if (!newVendor.email.trim() && !newVendor.phone.trim()) {
      errors.emailOrPhone = 'At least one contact method (Email or Mobile) is required.';
    }
    if (!newVendor.category.trim()) {
      errors.category = 'Primary Category Domain is required.';
    }
    if (!newVendor.operatingLocation.trim() && !newVendor.city.trim()) {
      errors.operatingLocation = 'Operating Location (City / Region) is required.';
    }

    setStep1Errors(errors);
    if (Object.keys(errors).length > 0) {
      setOnboardErrorMsg('Please fill in all mandatory fields marked with an asterisk (*).');
      return false;
    }
    setOnboardErrorMsg('');
    return true;
  };

  // Validate Step 2 before completing registration
  const validateStep2 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!newVendor.legalStructure) {
      errors.legalStructure = 'Legal Structure is required.';
    }
    if (!newVendor.address.trim()) {
      errors.address = 'Registered Business Address is required.';
    }
    if (!newVendor.capabilities.trim()) {
      errors.capabilities = 'Product / Scope Capabilities is required.';
    }

    setStep2Errors(errors);
    if (Object.keys(errors).length > 0) {
      setOnboardErrorMsg('Please fill in all mandatory fields marked with an asterisk (*).');
      return false;
    }
    setOnboardErrorMsg('');
    return true;
  };

  // Immediate Onboarding Submission (Draft or Final)
  const handleImmediateOnboarding = async (isDraft: boolean) => {
    setOnboardErrorMsg('');
    setOnboardSuccessMsg('');

    if (!isDraft) {
      if (!validateStep1()) {
        setOnboardingStep(1);
        return;
      }
      if (!validateStep2()) {
        setOnboardingStep(2);
        return;
      }
    }

    if (isDraft && !newVendor.name.trim()) {
      setOnboardErrorMsg('Vendor Legal / Business Name is required even for draft saving.');
      setStep1Errors({ name: 'Vendor Legal / Business Name is required.' });
      return;
    }

    setSubmittingOnboard(true);
    try {
      const formattedPhone = newVendor.phone.trim()
        ? (newVendor.phone.startsWith('+') ? newVendor.phone.trim() : `${newVendor.phoneCountryCode} ${newVendor.phone.trim()}`)
        : null;

      const res = await fetch('/api/procurement/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newVendor,
          phone: formattedPhone,
          id: savedVendorId || undefined,
          isDraft,
          turnoverCrores: newVendor.turnoverCrores ? parseFloat(newVendor.turnoverCrores) : null,
          experienceYears: newVendor.experienceYears ? parseInt(String(newVendor.experienceYears), 10) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to onboard vendor');
      }

      setSavedVendorId(data.vendor.id);
      fetchVendors();

      if (isDraft) {
        toast.success('Vendor profile saved as draft.', data.vendor.code, 'Draft');
        setOnboardSuccessMsg(`Draft saved successfully for ${data.vendor.name} (${data.vendor.code}).`);
      } else {
        toast.success('Vendor onboarding completed successfully.', data.vendor.code, 'Onboarded');
        setOnboardSuccessMsg(`Vendor ${data.vendor.name} (${data.vendor.code}) has been registered and onboarded.`);

        setSavedVendorId(null);
        setNewVendor({
          name: '',
          vendorType: 'CLIENT_VENDOR',
          contactPerson: '',
          email: '',
          phone: '',
          phoneCountryCode: '+91',
          alternatePhone: '',
          altPhoneCountryCode: '+91',
          category: 'Civil & Interior',
          operatingLocation: '',
          city: '',
          state: '',
          legalStructure: 'PRIVATE_LIMITED',
          gstin: '',
          pan: '',
          website: '',
          address: '',
          experienceYears: 5,
          turnoverCrores: '',
          capabilities: '',
          serviceCoverage: 'Pan-India',
          clientReferences: '',
          certifications: '',
          remarks: '',
        });
        setStep1Errors({});
        setStep2Errors({});
        setOnboardingStep(1);

        setTimeout(() => {
          setActiveTab('directory');
        }, 1800);
      }
    } catch (err: any) {
      setOnboardErrorMsg(err.message || 'Error onboarding vendor');
    } finally {
      setSubmittingOnboard(false);
    }
  };

  // Bulk Evaluation Execution Workflow
  const handleStartBulkEvaluation = async () => {
    setBulkEvaluating(true);
    setBulkDone(false);

    const initialProgress: typeof bulkProgress = {};
    selectedVendorIds.forEach((id) => {
      initialProgress[id] = { status: 'pending', message: 'Queued for evaluation...' };
    });
    setBulkProgress(initialProgress);

    for (const id of selectedVendorIds) {
      setBulkProgress((prev) => ({
        ...prev,
        [id]: { status: 'running', message: 'Analyzing profile & evidence against 6 rubrics...' },
      }));

      try {
        const res = await fetch(`/api/procurement/vendors/${id}/evaluate-ai`, {
          method: 'POST',
        });
        const data = await res.json();

        if (res.ok && data.report) {
          setBulkProgress((prev) => ({
            ...prev,
            [id]: {
              status: 'success',
              score: data.report.overallWeightedScore,
              outcome: data.report.qualificationOutcome,
              message: `Score: ${data.report.overallWeightedScore}% (${data.report.qualificationOutcome})`,
            },
          }));
        } else {
          setBulkProgress((prev) => ({
            ...prev,
            [id]: {
              status: 'failed',
              message: data.error || 'Evaluation failed to complete.',
            },
          }));
        }
      } catch (err: any) {
        setBulkProgress((prev) => ({
          ...prev,
          [id]: {
            status: 'failed',
            message: err.message || 'Network error during evaluation.',
          },
        }));
      }
    }

    setBulkEvaluating(false);
    setBulkDone(true);
    fetchVendors();
  };

  const handleCloseBulkModal = () => {
    setBulkModalOpen(false);
    if (bulkDone) {
      setSelectedVendorIds([]);
      setBulkDone(false);
      setBulkProgress({});
    }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 60 }}>
      {/* Top Header, KPI Stats Strip & Main Module Tabs (shown when viewing Directory or Evaluation) */}
      {activeTab !== 'onboarding' && (
        <>
          <PageHeader
            breadcrumbs={[
              { label: 'Procurement', href: '/procurement/rfqs' },
              { label: 'Vendor Management' },
            ]}
            title="Vendor Management"
            description="Enterprise vendor governance, client vs network partner directory, evidence-based AI evaluation rubric, and PPO performance tracking."
            actions={
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setActiveTab('onboarding');
                    setOnboardingStep(1);
                    setOnboardSuccessMsg('');
                    setOnboardErrorMsg('');
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                >
                  <Plus size={16} /> Add Vendor
                </button>
              </div>
            }
          />

          {/* KPI Stats Strip */}
          <div className="mb-6">
            <SummaryCardGrid columns={5}>
              <SummaryCard
                label="Total Registered"
                value={counts.total}
                secondary="Across all categories"
                icon={<Building2 size={16} />}
                accent="default"
              />
              <SummaryCard
                label="Client Vendors"
                value={counts.clientVendorsCount}
                secondary="Client-nominated & private"
                icon={<Users size={16} />}
                accent="blue"
              />
              <SummaryCard
                label="Procucev Network"
                value={counts.procucevVendorsCount}
                secondary="Pre-vetted network partners"
                icon={<Globe size={16} />}
                accent="emerald"
              />
              <SummaryCard
                label="Fully Qualified"
                value={counts.qualifiedCount}
                secondary="Passed evaluation"
                icon={<ShieldCheck size={16} />}
                accent="emerald"
              />
              <SummaryCard
                label="Pending Review"
                value={counts.pendingReviewCount + counts.notEvaluatedCount}
                secondary={`${counts.pendingReviewCount} in review · ${counts.notEvaluatedCount} not evaluated`}
                icon={<Clock size={16} />}
                accent="amber"
              />
            </SummaryCardGrid>
          </div>

          {/* Main Module Tabs (Directory | Onboarding | Evaluation) */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20, gap: 8 }}>
            <button
              type="button"
              onClick={() => setActiveTab('directory')}
              style={{
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                color: activeTab === 'directory' ? '#2563eb' : '#64748b',
                borderBottom: activeTab === 'directory' ? '2px solid #2563eb' : '2px solid transparent',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Building2 size={15} /> Vendor Directory
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('onboarding');
                setOnboardingStep(1);
                setOnboardSuccessMsg('');
                setOnboardErrorMsg('');
              }}
              style={{
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                color: (activeTab as string) === 'onboarding' ? '#2563eb' : '#64748b',
                borderBottom: (activeTab as string) === 'onboarding' ? '2px solid #2563eb' : '2px solid transparent',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={15} /> Immediate Onboarding
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('evaluation')}
              style={{
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                color: activeTab === 'evaluation' ? '#2563eb' : '#64748b',
                borderBottom: activeTab === 'evaluation' ? '2px solid #2563eb' : '2px solid transparent',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Sparkles size={15} color="#6366f1" /> Evaluation Hub & Selection
            </button>
          </div>
        </>
      )}

      {/* =========================================================================
          TAB 1: VENDOR DIRECTORY
      ========================================================================= */}
      {activeTab === 'directory' && (
        <div>
          {/* Sub-group Pill Selector & Filter Controls */}
          <div
            className="card"
            style={{
              padding: '12px 16px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {/* Vendor Group Switcher */}
            <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 6 }}>
              <button
                type="button"
                onClick={() => setVendorGroup('ALL')}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: vendorGroup === 'ALL' ? '#ffffff' : 'transparent',
                  color: vendorGroup === 'ALL' ? '#0f172a' : '#64748b',
                  boxShadow: vendorGroup === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                All Vendors ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setVendorGroup('CLIENT_VENDOR')}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: vendorGroup === 'CLIENT_VENDOR' ? '#ffffff' : 'transparent',
                  color: vendorGroup === 'CLIENT_VENDOR' ? '#1e40af' : '#64748b',
                  boxShadow: vendorGroup === 'CLIENT_VENDOR' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Client Vendors ({counts.clientVendorsCount})
              </button>
              <button
                type="button"
                onClick={() => setVendorGroup('PROCUCEV_VENDOR')}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: vendorGroup === 'PROCUCEV_VENDOR' ? '#ffffff' : 'transparent',
                  color: vendorGroup === 'PROCUCEV_VENDOR' ? '#047857' : '#64748b',
                  boxShadow: vendorGroup === 'PROCUCEV_VENDOR' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Procucev Network Vendors ({counts.procucevVendorsCount})
              </button>
            </div>

            {/* Filter Controls */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  color="#94a3b8"
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  placeholder="Search name, code, city, GSTIN..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field"
                  style={{ height: 32, fontSize: 12, width: 230, paddingLeft: 30 }}
                />
              </div>

              <select
                value={qualificationFilter}
                onChange={(e) => setQualificationFilter(e.target.value)}
                className="input-field"
                style={{ height: 32, fontSize: 12, padding: '0 8px' }}
              >
                <option value="ALL">All Qualification States</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="CONDITIONALLY_QUALIFIED">Conditionally Qualified</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="NOT_EVALUATED">Not Evaluated</option>
                <option value="NOT_QUALIFIED">Not Qualified</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input-field"
                style={{ height: 32, fontSize: 12, padding: '0 8px' }}
              >
                <option value="ALL">All Categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Vendors Directory Table */}
          <div
            className="card"
            style={{
              padding: 0,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', height: 40, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0 12px', width: 95 }}>Vendor Code</th>
                    <th style={{ padding: '0 12px', minWidth: 200 }}>Vendor Name</th>
                    <th style={{ padding: '0 10px', width: 140 }}>Vendor Group</th>
                    <th style={{ padding: '0 10px', minWidth: 150 }}>Primary Category</th>
                    <th style={{ padding: '0 10px', width: 130 }}>Location</th>
                    <th style={{ padding: '0 10px', width: 140, textAlign: 'center' }}>Qualification</th>
                    <th style={{ padding: '0 10px', width: 120, textAlign: 'center' }}>PPO Rating</th>
                    <th style={{ padding: '0 12px', width: 90, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                        Loading vendors...
                      </td>
                    </tr>
                  ) : vendors.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                        <Building2 size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>No Vendors Found</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {search
                            ? 'Try adjusting your search query or filters.'
                            : 'Click "Add Vendor" above to onboard your first vendor.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    vendors.map((v) => (
                      <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td
                          style={{
                            padding: '10px 12px',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            color: '#1e40af',
                          }}
                        >
                          {v.code}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Link
                            href={`/procurement/vendors/${v.id}`}
                            style={{ fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}
                          >
                            {v.name}
                          </Link>
                          {v.contactPerson && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              Contact: {v.contactPerson} {v.phone ? `(${v.phone})` : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              background: v.vendorType === 'CLIENT_VENDOR' ? '#eff6ff' : '#ecfdf5',
                              color: v.vendorType === 'CLIENT_VENDOR' ? '#1e40af' : '#047857',
                              border:
                                v.vendorType === 'CLIENT_VENDOR'
                                  ? '1px solid #bfdbfe'
                                  : '1px solid #a7f3d0',
                            }}
                          >
                            {v.vendorType === 'CLIENT_VENDOR' ? 'Client Vendor' : 'Procucev Network'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', color: '#334155', fontWeight: 600 }}>
                          {Array.isArray(v.categories)
                            ? v.categories.join(', ')
                            : v.categories || 'General Contracting'}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#64748b' }}>
                          {v.operatingLocation || v.city || 'India'}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          {v.qualificationStatus === 'QUALIFIED' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#ecfdf5',
                                color: '#047857',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              <CheckCircle2 size={12} /> Qualified{' '}
                              {v.qualificationScore ? `(${v.qualificationScore}%)` : ''}
                            </span>
                          ) : v.qualificationStatus === 'CONDITIONALLY_QUALIFIED' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#fffbeb',
                                color: '#b45309',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              <AlertTriangle size={12} /> Conditional{' '}
                              {v.qualificationScore ? `(${v.qualificationScore}%)` : ''}
                            </span>
                          ) : v.qualificationStatus === 'PENDING_REVIEW' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#eff6ff',
                                color: '#1e40af',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              <Clock size={12} /> Review Pending
                            </span>
                          ) : v.qualificationStatus === 'NOT_QUALIFIED' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#fef2f2',
                                color: '#dc2626',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              <XCircle size={12} /> Not Qualified
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#64748b',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              Not Evaluated
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          {v.averagePpoRating ? (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontWeight: 700,
                                color: '#0f172a',
                              }}
                            >
                              <Star size={13} fill="#f59e0b" color="#f59e0b" />
                              <span>{v.averagePpoRating.toFixed(1)}</span>
                              <span style={{ fontSize: 10, color: '#64748b' }}>
                                ({v.ppoRatingsCount} PPO{v.ppoRatingsCount > 1 ? 's' : ''})
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <Link
                            href={`/procurement/vendors/${v.id}`}
                            className="btn btn-outline"
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            Open <ArrowRight size={11} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: IMMEDIATE VENDOR ONBOARDING (MATCHING 2-STEP REFERENCE UI)
      ========================================================================= */}
      {activeTab === 'onboarding' && (
        <div style={{ maxWidth: 940, margin: '0 auto', padding: '10px 0 40px 0' }}>
          {/* Header Bar: Back Link on left + 2-Step Horizontal Stepper on right */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('directory')}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <ArrowLeft size={15} /> Back to Vendor Management
            </button>

            {/* Stepper matching reference UI */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                onClick={() => setOnboardingStep(1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: onboardingStep === 1 ? '#2563eb' : '#dbeafe',
                    color: onboardingStep === 1 ? '#ffffff' : '#2563eb',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {onboardingStep === 1 ? '1' : <Check size={12} strokeWidth={3} />}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: onboardingStep === 1 ? 700 : 600,
                    color: onboardingStep === 1 ? '#2563eb' : '#334155',
                  }}
                >
                  Basic Information
                </span>
              </div>

              <div style={{ width: 32, height: 1.5, background: '#cbd5e1' }} />

              <div
                onClick={() => {
                  if (validateStep1()) setOnboardingStep(2);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: onboardingStep === 2 ? '#2563eb' : '#f1f5f9',
                    color: onboardingStep === 2 ? '#ffffff' : '#64748b',
                    border: onboardingStep === 2 ? 'none' : '1px solid #cbd5e1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  2
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: onboardingStep === 2 ? 700 : 500,
                    color: onboardingStep === 2 ? '#2563eb' : '#64748b',
                  }}
                >
                  Business Profile
                </span>
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.2px' }}>
            Immediate Vendor Onboarding
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            Register a supplier record into the governance directory. Step 1 collects core operational contacts; Step 2 captures business, tax compliance and capabilities.
          </p>

          {/* White Main Form Card */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 10,
              padding: '26px 30px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}
          >
            {/* Feedback Notifications */}
            {onboardSuccessMsg && (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#047857',
                  padding: '12px 16px',
                  borderRadius: 6,
                  marginBottom: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle2 size={16} />
                {onboardSuccessMsg}
              </div>
            )}

            {onboardErrorMsg && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  padding: '12px 16px',
                  borderRadius: 6,
                  marginBottom: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangle size={16} />
                {onboardErrorMsg}
              </div>
            )}

            {/* =========================================================================
                STEP 1: BASIC VENDOR & CONTACT INFORMATION
            ========================================================================= */}
            {onboardingStep === 1 && (
              <div>
                {/* Step 1 Banner Box */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    marginBottom: 24,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Building2 size={18} color="#2563eb" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                      Step 1: Basic Vendor & Contact Information
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Enter the key vendor details and primary contact information. Fields marked with <span style={{ color: '#dc2626' }}>*</span> are mandatory.
                    </div>
                  </div>
                </div>

                {/* Step 1 Form Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '18px 24px',
                    marginBottom: 20,
                  }}
                >
                  {/* Row 1, Col 1: Vendor Legal / Business Name */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Vendor Legal / Business Name <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      id="vendor-legal-name"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Apex Infrastructure & Contracting Pvt Ltd"
                      value={newVendor.name}
                      onChange={(e) => {
                        setNewVendor({ ...newVendor, name: e.target.value });
                        if (step1Errors.name) setStep1Errors({ ...step1Errors, name: '' });
                      }}
                      style={{
                        width: '100%',
                        height: 40,
                        fontSize: 13,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    {step1Errors.name && (
                      <span style={{ fontSize: 11, color: '#dc2626', marginTop: 4, display: 'block' }}>
                        {step1Errors.name}
                      </span>
                    )}
                  </div>

                  {/* Row 1, Col 2: Vendor Classification Type */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Vendor Classification Type <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      id="vendor-classification-type"
                      className="form-control"
                      value={newVendor.vendorType}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, vendorType: e.target.value as any })
                      }
                      style={{
                        width: '100%',
                        height: 40,
                        fontSize: 13,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="CLIENT_VENDOR">Client Vendor (Nominated exclusively for this client)</option>
                      <option value="PROCUCEV_VENDOR">Procucev Network Vendor</option>
                    </select>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      Select whether this vendor is a client-nominated vendor or from Procucev network.
                    </div>
                  </div>

                  {/* Row 2, Col 1: Primary Contact Person */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Primary Contact Person <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      id="vendor-contact-person"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Rajesh Sharma"
                      value={newVendor.contactPerson}
                      onChange={(e) => {
                        setNewVendor({ ...newVendor, contactPerson: e.target.value });
                        if (step1Errors.contactPerson) setStep1Errors({ ...step1Errors, contactPerson: '' });
                      }}
                      style={{
                        width: '100%',
                        height: 40,
                        fontSize: 13,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    {step1Errors.contactPerson && (
                      <span style={{ fontSize: 11, color: '#dc2626', marginTop: 4, display: 'block' }}>
                        {step1Errors.contactPerson}
                      </span>
                    )}
                  </div>

                  {/* Row 2, Col 2: Contact Email */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Contact Email <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      id="vendor-email"
                      type="email"
                      className="form-control"
                      placeholder="e.g. sales@apexinfra.com"
                      value={newVendor.email}
                      onChange={(e) => {
                        setNewVendor({ ...newVendor, email: e.target.value });
                        if (step1Errors.emailOrPhone) setStep1Errors({ ...step1Errors, emailOrPhone: '' });
                      }}
                      style={{
                        width: '100%',
                        height: 40,
                        fontSize: 13,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Row 3, Col 1: Mobile / Phone Number */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Mobile / Phone Number <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div
                      className="form-control-phone"
                      style={{
                        display: 'flex',
                        width: '100%',
                        height: 40,
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <select
                        id="vendor-phone-cc"
                        value={newVendor.phoneCountryCode}
                        onChange={(e) => setNewVendor({ ...newVendor, phoneCountryCode: e.target.value })}
                        style={{
                          width: 72,
                          height: '100%',
                          border: 'none',
                          borderRight: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          padding: '0 8px',
                          fontSize: 13,
                          color: '#334155',
                          fontWeight: 600,
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="+91">+91</option>
                        <option value="+1">+1</option>
                        <option value="+44">+44</option>
                        <option value="+971">+971</option>
                        <option value="+65">+65</option>
                      </select>
                      <input
                        id="vendor-phone"
                        type="tel"
                        placeholder="e.g. 98765 43210"
                        value={newVendor.phone}
                        onChange={(e) => {
                          setNewVendor({ ...newVendor, phone: e.target.value });
                          if (step1Errors.emailOrPhone) setStep1Errors({ ...step1Errors, emailOrPhone: '' });
                        }}
                        style={{
                          flex: 1,
                          height: '100%',
                          border: 'none',
                          padding: '0 12px',
                          fontSize: 13,
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    {step1Errors.emailOrPhone && (
                      <span style={{ fontSize: 11, color: '#dc2626', marginTop: 4, display: 'block' }}>
                        {step1Errors.emailOrPhone}
                      </span>
                    )}
                  </div>

                  {/* Row 3, Col 2: Alternate Contact Number */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Alternate Contact Number
                    </label>
                    <div
                      className="form-control-phone"
                      style={{
                        display: 'flex',
                        width: '100%',
                        height: 40,
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <select
                        id="vendor-alt-phone-cc"
                        value={newVendor.altPhoneCountryCode}
                        onChange={(e) => setNewVendor({ ...newVendor, altPhoneCountryCode: e.target.value })}
                        style={{
                          width: 72,
                          height: '100%',
                          border: 'none',
                          borderRight: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          padding: '0 8px',
                          fontSize: 13,
                          color: '#334155',
                          fontWeight: 600,
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="+91">+91</option>
                        <option value="+1">+1</option>
                        <option value="+44">+44</option>
                        <option value="+971">+971</option>
                        <option value="+65">+65</option>
                      </select>
                      <input
                        id="vendor-alt-phone"
                        type="tel"
                        placeholder="e.g. 98765 43210"
                        value={newVendor.alternatePhone}
                        onChange={(e) => setNewVendor({ ...newVendor, alternatePhone: e.target.value })}
                        style={{
                          flex: 1,
                          height: '100%',
                          border: 'none',
                          padding: '0 12px',
                          fontSize: 13,
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Row 4, Col 1: Primary Category Domain */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Primary Category Domain <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      id="vendor-category-domain"
                      className="form-control"
                      value={newVendor.category}
                      onChange={(e) => setNewVendor({ ...newVendor, category: e.target.value })}
                      style={{
                        width: '100%',
                        height: 40,
                        fontSize: 13,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="Civil & Interior">Civil & Interior</option>
                      <option value="Civil & Structural">Civil & Structural</option>
                      <option value="Electrical & Automation">Electrical & Automation</option>
                      <option value="HVAC & Ventilation">HVAC & Ventilation</option>
                      <option value="Plumbing & Sanitary">Plumbing & Sanitary</option>
                      <option value="Retail Fixtures & Joinery">Retail Fixtures & Joinery</option>
                      <option value="Structural Steel, Prefab">Structural Steel, Prefab</option>
                      <option value="General Contracting">General Contracting</option>
                      <option value="Hospitality Supplies">Hospitality Supplies</option>
                    </select>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      Select the primary category for this vendor.
                    </div>
                  </div>

                  {/* Row 4, Col 2: Operating Location */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Operating Location (City / Region) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      id="vendor-operating-location"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Hyderabad, Telangana"
                      value={newVendor.operatingLocation}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewVendor({
                          ...newVendor,
                          operatingLocation: val,
                          city: val.split(',')[0].trim(),
                        });
                        if (step1Errors.operatingLocation)
                          setStep1Errors({ ...step1Errors, operatingLocation: '' });
                      }}
                      style={{
                        width: '100%',
                        height: 40,
                        fontSize: 13,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      Select the main city or region where the vendor operates.
                    </div>
                    {step1Errors.operatingLocation && (
                      <span style={{ fontSize: 11, color: '#dc2626', marginTop: 4, display: 'block' }}>
                        {step1Errors.operatingLocation}
                      </span>
                    )}
                  </div>
                </div>

                {/* Important Information Panel */}
                <div
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 8,
                    padding: '16px 20px',
                    marginTop: 24,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e40af', fontSize: 13, fontWeight: 700 }}>
                    <Info size={16} color="#2563eb" />
                    <span>Important Information</span>
                  </div>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                    <li>Please ensure the vendor name and contact details are accurate.</li>
                    <li>You can save a draft and continue later.</li>
                    <li>After completing Step 1, you will be able to provide business, statutory and capability details in Step 2.</li>
                  </ul>
                </div>

                {/* Step 1 Actions Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    paddingTop: 20,
                    marginTop: 24,
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <button
                      type="button"
                      onClick={() => handleImmediateOnboarding(true)}
                      disabled={submittingOnboard}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '9px 18px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <FileText size={15} color="#475569" /> Save as Draft<span style={{ display: 'none' }}> Profile</span>
                    </button>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      Draft will be saved automatically.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (validateStep1()) {
                        setOnboardingStep(2);
                      }
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#2563eb',
                      border: '1px solid #1d4ed8',
                      borderRadius: 6,
                      padding: '10px 22px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#ffffff',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                    }}
                  >
                    Continue to Step 2 (Business Profile) <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* =========================================================================
                STEP 2: BUSINESS PROFILE & STATUTORY DETAILS
            ========================================================================= */}
            {onboardingStep === 2 && (
              <div>
                {/* Step 2 Banner Box */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    marginBottom: 24,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Building size={18} color="#059669" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                      Step 2: Business Profile & Statutory Details
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Provide business information, statutory details and capability profile.
                    </div>
                  </div>
                </div>

                {/* Section A: Statutory & Legal Information */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>
                    A. Statutory & Legal Information
                  </div>

                  {/* Row 1: Legal Structure, GSTIN, PAN */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Legal Structure <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <select
                        id="vendor-legal-structure"
                        className="form-control"
                        value={newVendor.legalStructure}
                        onChange={(e) => {
                          setNewVendor({ ...newVendor, legalStructure: e.target.value });
                          if (step2Errors.legalStructure) setStep2Errors({ ...step2Errors, legalStructure: '' });
                        }}
                        style={{
                          width: '100%',
                          height: 40,
                          fontSize: 13,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="PRIVATE_LIMITED">Private Limited (Pvt Ltd)</option>
                        <option value="PUBLIC_LIMITED">Public Limited (Ltd)</option>
                        <option value="PARTNERSHIP">Partnership Firm</option>
                        <option value="SOLE_PROPRIETORSHIP">Proprietorship</option>
                        <option value="LLP">LLP (Limited Liability Partnership)</option>
                        <option value="JOINT_VENTURE">Joint Venture</option>
                      </select>
                      {step2Errors.legalStructure && (
                        <span style={{ fontSize: 11, color: '#dc2626', marginTop: 4, display: 'block' }}>
                          {step2Errors.legalStructure}
                        </span>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        GSTIN (15 Digits)
                      </label>
                      <input
                        id="vendor-gstin"
                        type="text"
                        className="form-control"
                        placeholder="e.g. 36AABCA1234F1Z5"
                        maxLength={15}
                        value={newVendor.gstin}
                        onChange={(e) => setNewVendor({ ...newVendor, gstin: e.target.value.toUpperCase() })}
                        style={{
                          width: '100%',
                          height: 40,
                          fontSize: 13,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          fontFamily: 'monospace',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        PAN (10 Digits)
                      </label>
                      <input
                        id="vendor-pan"
                        type="text"
                        className="form-control"
                        placeholder="e.g. AABCA1234F"
                        maxLength={10}
                        value={newVendor.pan}
                        onChange={(e) => setNewVendor({ ...newVendor, pan: e.target.value.toUpperCase() })}
                        style={{
                          width: '100%',
                          height: 40,
                          fontSize: 13,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          fontFamily: 'monospace',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Row 2: Company Website, Years in Business, Annual Turnover */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Company Website
                      </label>
                      <input
                        id="vendor-website"
                        type="url"
                        className="form-control"
                        placeholder="https://company.com"
                        value={newVendor.website}
                        onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                        style={{
                          width: '100%',
                          height: 40,
                          fontSize: 13,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Years in Business
                      </label>
                      <input
                        id="vendor-experience-years"
                        type="number"
                        className="form-control"
                        min={0}
                        placeholder="e.g. 5"
                        value={newVendor.experienceYears !== undefined && newVendor.experienceYears !== null ? newVendor.experienceYears : ''}
                        onChange={(e) => setNewVendor({ ...newVendor, experienceYears: parseInt(e.target.value) || 0 })}
                        style={{
                          width: '100%',
                          height: 40,
                          fontSize: 13,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Annual Turnover (₹ Crores)
                      </label>
                      <input
                        id="vendor-turnover"
                        type="number"
                        className="form-control"
                        step="0.1"
                        placeholder="e.g. 25.5"
                        value={newVendor.turnoverCrores}
                        onChange={(e) => setNewVendor({ ...newVendor, turnoverCrores: e.target.value })}
                        style={{
                          width: '100%',
                          height: 40,
                          fontSize: 13,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Row 3: Registered Business Address (Full width) */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Registered Business Address <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea
                      id="vendor-address"
                      rows={3}
                      maxLength={500}
                      className="form-control"
                      placeholder="Complete registered office address with PIN code"
                      value={newVendor.address}
                      onChange={(e) => {
                        setNewVendor({ ...newVendor, address: e.target.value });
                        if (step2Errors.address) setStep2Errors({ ...step2Errors, address: '' });
                      }}
                      style={{
                        width: '100%',
                        fontSize: 13,
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        lineHeight: 1.5,
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      {step2Errors.address ? (
                        <span style={{ fontSize: 11, color: '#dc2626' }}>{step2Errors.address}</span>
                      ) : <span />}
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{newVendor.address.length} / 500</span>
                    </div>
                  </div>
                </div>

                {/* Section B: Business Capabilities */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>
                    B. Business Capabilities
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Product / Scope Capabilities <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <textarea
                        id="vendor-capabilities"
                        rows={3}
                        maxLength={500}
                        className="form-control"
                        placeholder="e.g. Civil works, Interior fit-outs, MEP, Furniture, etc."
                        value={newVendor.capabilities}
                        onChange={(e) => {
                          setNewVendor({ ...newVendor, capabilities: e.target.value });
                          if (step2Errors.capabilities) setStep2Errors({ ...step2Errors, capabilities: '' });
                        }}
                        style={{
                          width: '100%',
                          fontSize: 13,
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          lineHeight: 1.5,
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        {step2Errors.capabilities ? (
                          <span style={{ fontSize: 11, color: '#dc2626' }}>{step2Errors.capabilities}</span>
                        ) : <span />}
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{newVendor.capabilities.length} / 500</span>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Key Client References & Previous Projects
                      </label>
                      <textarea
                        id="vendor-references"
                        rows={3}
                        maxLength={500}
                        className="form-control"
                        placeholder="e.g. Tata, Reliance, D-Mart and project values"
                        value={newVendor.clientReferences}
                        onChange={(e) => setNewVendor({ ...newVendor, clientReferences: e.target.value })}
                        style={{
                          width: '100%',
                          fontSize: 13,
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          lineHeight: 1.5,
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ textAlign: 'right', marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{newVendor.clientReferences.length} / 500</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section C: Additional Information (Optional) */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>
                    C. Additional Information (Optional)
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Certifications (e.g. ISO, MSME, etc.)
                      </label>
                      <textarea
                        id="vendor-certifications"
                        rows={2}
                        className="form-control"
                        placeholder="e.g. ISO 9001, MSME, etc."
                        value={newVendor.certifications}
                        onChange={(e) => setNewVendor({ ...newVendor, certifications: e.target.value })}
                        style={{
                          width: '100%',
                          fontSize: 13,
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          lineHeight: 1.5,
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Remarks
                      </label>
                      <textarea
                        id="vendor-remarks"
                        rows={2}
                        maxLength={300}
                        className="form-control"
                        placeholder="Any additional information about this vendor"
                        value={newVendor.remarks}
                        onChange={(e) => setNewVendor({ ...newVendor, remarks: e.target.value })}
                        style={{
                          width: '100%',
                          fontSize: 13,
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          lineHeight: 1.5,
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ textAlign: 'right', marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{(newVendor.remarks || '').length} / 300</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2 Actions Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 20,
                    marginTop: 24,
                    borderTop: '1px solid #e2e8f0',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(1)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '9px 18px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#334155',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <ArrowLeft size={15} color="#475569" /> Back to Step 1
                  </button>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleImmediateOnboarding(true)}
                      disabled={submittingOnboard}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '9px 18px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <FileText size={15} color="#475569" /> Save as Draft<span style={{ display: 'none' }}> Profile</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleImmediateOnboarding(false)}
                      disabled={submittingOnboard}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#2563eb',
                        border: '1px solid #1d4ed8',
                        borderRadius: 6,
                        padding: '10px 22px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                      }}
                    >
                      {submittingOnboard ? (
                        <>
                          <Loader2 size={15} className="animate-spin" /> Registering...
                        </>
                      ) : (
                        'Complete Onboarding & Register'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: EVALUATION HUB & EXPLICIT VENDOR SELECTION (PART B)
      ========================================================================= */}
      {activeTab === 'evaluation' && (
        <div>
          {/* Rubric Weights Overview Card */}
          <div
            className="card"
            style={{
              padding: '16px 20px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="#6366f1" />
                  Structured Vendor Evaluation Rubric
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  Evidence-based multi-criteria framework. AI evaluates recorded profile and compliance evidence; Category Managers hold definitive qualification decision authority.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6, fontSize: 11, color: '#475569' }}>
                <span
                  style={{
                    padding: '3px 8px',
                    background: '#ecfdf5',
                    color: '#047857',
                    borderRadius: 4,
                    fontWeight: 700,
                    border: '1px solid #a7f3d0',
                  }}
                >
                  80–100%: Recommended
                </span>
                <span
                  style={{
                    padding: '3px 8px',
                    background: '#fffbeb',
                    color: '#b45309',
                    borderRadius: 4,
                    fontWeight: 700,
                    border: '1px solid #fde68a',
                  }}
                >
                  65–79%: Conditional
                </span>
                <span
                  style={{
                    padding: '3px 8px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    borderRadius: 4,
                    fontWeight: 700,
                    border: '1px solid #fecaca',
                  }}
                >
                  &lt;65%: Not Recommended
                </span>
              </div>
            </div>

            {/* Rubric Weights Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10,
                marginTop: 14,
              }}
            >
              {[
                { name: 'Business Profile', weight: '15%' },
                { name: 'Financial Strength', weight: '20%' },
                { name: 'Previous Clients', weight: '20%' },
                { name: 'References', weight: '15%' },
                { name: 'Technical Capability', weight: '20%' },
                { name: 'Compliance & Risk', weight: '10%' },
              ].map((c) => (
                <div
                  key={c.name}
                  style={{
                    background: '#f8fafc',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{c.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af', marginTop: 2 }}>
                    {c.weight}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* EVALUATION CONTROLS & EXPLICIT VENDOR SELECTION PANEL */}
          <div
            className="card"
            style={{
              padding: '16px 20px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              marginBottom: 16,
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
            }}
          >
            {/* Row 1: Classification Tabs (All Vendors | Client Vendors | Procucev Network Vendors) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 14,
                paddingBottom: 12,
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              {/* Classification Tabs */}
              <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 6 }}>
                <button
                  type="button"
                  onClick={() => handleClassificationChange('ALL')}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: evalVendorType === 'ALL' ? '#ffffff' : 'transparent',
                    color: evalVendorType === 'ALL' ? '#0f172a' : '#64748b',
                    boxShadow: evalVendorType === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  All Vendors ({counts.total})
                </button>
                <button
                  type="button"
                  onClick={() => handleClassificationChange('CLIENT_VENDOR')}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: evalVendorType === 'CLIENT_VENDOR' ? '#ffffff' : 'transparent',
                    color: evalVendorType === 'CLIENT_VENDOR' ? '#1e40af' : '#64748b',
                    boxShadow: evalVendorType === 'CLIENT_VENDOR' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  Client Vendors ({counts.clientVendorsCount})
                </button>
                <button
                  type="button"
                  onClick={() => handleClassificationChange('PROCUCEV_VENDOR')}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: evalVendorType === 'PROCUCEV_VENDOR' ? '#ffffff' : 'transparent',
                    color: evalVendorType === 'PROCUCEV_VENDOR' ? '#047857' : '#64748b',
                    boxShadow: evalVendorType === 'PROCUCEV_VENDOR' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  Procucev Network Vendors ({counts.procucevVendorsCount})
                </button>
              </div>

              {/* Status Counter & Filter Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 12,
                    background: '#eff6ff',
                    color: '#1e40af',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  Showing {evaluationVendors.length} of {vendors.length} vendors
                </span>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleClearEvalFilters}
                  style={{
                    fontSize: 12,
                    padding: '5px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RotateCcw size={12} /> Clear Filters
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleApplyEvalFilters}
                  style={{
                    fontSize: 12,
                    padding: '5px 14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 700,
                  }}
                >
                  <Filter size={12} /> Apply Filters
                </button>
              </div>
            </div>

            {/* Row 2: Secondary Filter Controls (Category, Region, Qualification, Search) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              {/* Category Domain */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Category Domain
                </label>
                <select
                  value={evalCategory}
                  onChange={(e) => setEvalCategory(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: 36, fontSize: 12, padding: '0 8px' }}
                >
                  <option value="ALL">All Categories</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Region / Location */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Region / Operating Location
                </label>
                <select
                  value={evalRegion}
                  onChange={(e) => setEvalRegion(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: 36, fontSize: 12, padding: '0 8px' }}
                >
                  <option value="ALL">All Regions / Locations</option>
                  {availableRegions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Qualification Status */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Qualification Status
                </label>
                <select
                  value={evalQualificationStatus}
                  onChange={(e) => setEvalQualificationStatus(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: 36, fontSize: 12, padding: '0 8px' }}
                >
                  <option value="ALL">All Qualification States</option>
                  <option value="NOT_EVALUATED">Not Evaluated</option>
                  <option value="PENDING_REVIEW">Pending Review</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="CONDITIONALLY_QUALIFIED">Conditionally Qualified</option>
                  <option value="NOT_QUALIFIED">Not Qualified</option>
                </select>
              </div>

              {/* Search Code / Name */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Search by Vendor Code or Name
                </label>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder="e.g. VND-0001, Apex..."
                    value={evalSearch}
                    onChange={(e) => setEvalSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyEvalFilters();
                    }}
                    className="input-field"
                    style={{ width: '100%', height: 36, fontSize: 12, paddingLeft: 30 }}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: EXPLICIT VENDOR SELECTION DROPDOWN & EVALUATION ACTION */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                alignItems: 'flex-end',
                paddingTop: 14,
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                margin: '0 -20px -16px -20px',
                padding: '14px 20px',
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 8,
              }}
            >
              {/* Explicit Multi-Select Dropdown Container */}
              <div
                style={{ flex: '1 1 380px', position: 'relative' }}
                ref={vendorDropdownRef}
              >
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  <Users size={14} color="#1e40af" />
                  <span>Select Vendors for Evaluation</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>
                    ({evaluationVendors.length} in filtered set)
                  </span>
                </label>

                {/* Dropdown Button Trigger */}
                <button
                  type="button"
                  id="select-vendors-dropdown-trigger"
                  onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                  style={{
                    width: '100%',
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    background: '#ffffff',
                    border: isVendorDropdownOpen ? '1px solid #1e40af' : '1px solid #cbd5e1',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: isVendorDropdownOpen ? '0 0 0 2px rgba(30,64,175,0.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedVendorIds.length > 0 && (
                      <span
                        style={{
                          background: '#1e40af',
                          color: '#ffffff',
                          borderRadius: 12,
                          padding: '1px 8px',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {selectedVendorIds.length}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: selectedVendorIds.length > 0 ? 700 : 500,
                        color: selectedVendorIds.length > 0 ? '#0f172a' : '#64748b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {dropdownTriggerLabel}
                    </span>
                  </div>
                  <ChevronDown
                    size={15}
                    color="#64748b"
                    style={{
                      transform: isVendorDropdownOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s',
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  />
                </button>

                {/* Dropdown Menu Panel */}
                {isVendorDropdownOpen && (
                  <div
                    id="select-vendors-dropdown-menu"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      width: '100%',
                      minWidth: 400,
                      maxWidth: 520,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
                      zIndex: 200,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Dropdown Search & Quick Actions Bar */}
                    <div
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid #e2e8f0',
                        background: '#f8fafc',
                      }}
                    >
                      <div style={{ position: 'relative', marginBottom: 8 }}>
                        <Search
                          size={13}
                          color="#94a3b8"
                          style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}
                        />
                        <input
                          type="text"
                          placeholder="Search vendors in this list by code or name..."
                          value={vendorDropdownSearch}
                          onChange={(e) => setVendorDropdownSearch(e.target.value)}
                          className="input-field"
                          style={{
                            width: '100%',
                            height: 32,
                            fontSize: 12,
                            paddingLeft: 26,
                            background: '#ffffff',
                          }}
                        />
                      </div>

                      {/* Select All / Clear Selection Controls inside dropdown */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 11,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const ids = dropdownVendors.map((v) => v.id);
                              setSelectedVendorIds((prev) => Array.from(new Set([...prev, ...ids])));
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#1e40af',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            Select All ({dropdownVendors.length})
                          </button>
                          <span style={{ color: '#cbd5e1' }}>|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedVendorIds([])}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#64748b',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            Clear Selection
                          </button>
                        </div>

                        <span style={{ color: '#0f172a', fontWeight: 700 }}>
                          {selectedVendorIds.length} selected
                        </span>
                      </div>
                    </div>

                    {/* Scrollable Vendor List */}
                    <div
                      style={{
                        maxHeight: 280,
                        overflowY: 'auto',
                      }}
                    >
                      {dropdownVendors.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                          No vendors match "{vendorDropdownSearch}"
                        </div>
                      ) : (
                        dropdownVendors.map((v) => {
                          const isSelected = selectedVendorIds.includes(v.id);
                          return (
                            <div
                              key={v.id}
                              onClick={() => handleToggleSelectVendor(v.id)}
                              style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                cursor: 'pointer',
                                background: isSelected ? '#eff6ff' : '#ffffff',
                                transition: 'background 0.1s ease',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // handled by parent onClick
                                style={{ cursor: 'pointer', width: 14, height: 14, flexShrink: 0 }}
                              />

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      fontFamily: 'monospace',
                                      fontWeight: 800,
                                      fontSize: 11,
                                      color: '#1e40af',
                                    }}
                                  >
                                    {v.code}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      fontSize: 12,
                                      color: '#0f172a',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {v.name}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                  {Array.isArray(v.categories) ? v.categories.join(', ') : v.categories || 'General Contracting'}{' '}
                                  · {v.city || v.operatingLocation || 'India'}
                                </div>
                              </div>

                              {/* Qualification Pill */}
                              <div style={{ flexShrink: 0 }}>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 3,
                                    background:
                                      v.qualificationStatus === 'QUALIFIED'
                                        ? '#ecfdf5'
                                        : v.qualificationStatus === 'PENDING_REVIEW'
                                        ? '#eff6ff'
                                        : '#f1f5f9',
                                    color:
                                      v.qualificationStatus === 'QUALIFIED'
                                        ? '#047857'
                                        : v.qualificationStatus === 'PENDING_REVIEW'
                                        ? '#1e40af'
                                        : '#64748b',
                                  }}
                                >
                                  {v.qualificationStatus ? v.qualificationStatus.replace(/_/g, ' ') : 'NOT EVALUATED'}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Dropdown Footer */}
                    <div
                      style={{
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 11,
                        color: '#64748b',
                      }}
                    >
                      <span>Selection updates table automatically</span>
                      <button
                        type="button"
                        onClick={() => setIsVendorDropdownOpen(false)}
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: '4px 12px', fontWeight: 700 }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Evaluation Action Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id="evaluate-selected-vendors-btn"
                  className="btn btn-primary"
                  disabled={selectedVendorIds.length === 0}
                  onClick={() => setBulkModalOpen(true)}
                  style={{
                    height: 38,
                    padding: '0 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: selectedVendorIds.length === 0 ? 0.6 : 1,
                    cursor: selectedVendorIds.length === 0 ? 'not-allowed' : 'pointer',
                    background: selectedVendorIds.length > 0 ? '#1e40af' : '#94a3b8',
                  }}
                >
                  <Sparkles size={15} />
                  Evaluate Selected Vendors {selectedVendorIds.length > 0 ? `(${selectedVendorIds.length})` : ''}
                </button>

                {selectedVendorIds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setSelectedVendorIds([])}
                    style={{ height: 38, fontSize: 12, padding: '0 12px' }}
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {/* Selection Scope Helper Note */}
              <div style={{ width: '100%', fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Selection applies to the active filtered set ({evaluationVendors.length} vendors). Selecting vendors via dropdown or row checkboxes prepares them for automated rubric evaluation.
              </div>
            </div>
          </div>

          {/* EVALUATION PIPELINE & REVIEW QUEUE TABLE */}
          <div
            className="card"
            style={{
              padding: 0,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {/* Table Header Action Strip */}
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid #cbd5e1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                  Evaluation Pipeline & Review Queue
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: '#e2e8f0',
                    color: '#334155',
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {evaluationVendors.length}
                </span>
              </div>

              {/* Table Action Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {selectedVendorIds.length > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#1e40af',
                      background: '#eff6ff',
                      padding: '4px 10px',
                      borderRadius: 14,
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    {selectedVendorIds.length} vendor{selectedVendorIds.length > 1 ? 's' : ''} selected
                  </span>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={selectedVendorIds.length === 0}
                  onClick={() => setBulkModalOpen(true)}
                  style={{
                    fontSize: 12,
                    padding: '6px 14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 700,
                    opacity: selectedVendorIds.length === 0 ? 0.6 : 1,
                    cursor: selectedVendorIds.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Sparkles size={14} />
                  Evaluate Selected Vendors ({selectedVendorIds.length})
                </button>
              </div>
            </div>

            {/* Enterprise Grid Table with Clear Internal Gridlines */}
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table
                className="table enterprise-table"
                style={{
                  width: '100%',
                  fontSize: 12,
                  borderCollapse: 'collapse',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: '#f1f5f9',
                      height: 38,
                      borderBottom: '1px solid #cbd5e1',
                      textAlign: 'left',
                    }}
                  >
                    {/* 1. Selection Checkbox */}
                    <th
                      style={{
                        padding: '0 8px',
                        width: 40,
                        textAlign: 'center',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        onChange={handleSelectAllVisible}
                        style={{ cursor: 'pointer', width: 14, height: 14 }}
                        title="Select all visible vendors"
                      />
                    </th>

                    {/* 2. Vendor Code */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 95,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Vendor Code
                    </th>

                    {/* 3. Vendor Name */}
                    <th
                      style={{
                        padding: '0 12px',
                        minWidth: 190,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Vendor Name
                    </th>

                    {/* 4. Category */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 140,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Category
                    </th>

                    {/* 5. Region / Location */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 130,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Region / Location
                    </th>

                    {/* 6. Classification */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 125,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Classification
                    </th>

                    {/* 7. Onboarding Status */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 130,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Onboarding Status
                    </th>

                    {/* 8. Qualification Status */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 145,
                        textAlign: 'center',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Qualification Status
                    </th>

                    {/* 9. Score */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 85,
                        textAlign: 'center',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Score
                    </th>

                    {/* 10. Action */}
                    <th
                      style={{
                        padding: '0 12px',
                        width: 100,
                        textAlign: 'center',
                      }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                        Loading vendors...
                      </td>
                    </tr>
                  ) : evaluationVendors.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        style={{
                          padding: 48,
                          textAlign: 'center',
                          color: '#64748b',
                          background: '#ffffff',
                        }}
                      >
                        <Search size={32} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
                          No Vendors Match Filter Criteria
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          Adjust your filter selections above or click "Clear Filters" to restore all vendors.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    evaluationVendors.map((v) => {
                      const isSelected = selectedVendorIds.includes(v.id);
                      return (
                        <tr
                          key={v.id}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            background: isSelected ? '#f8fafc' : '#ffffff',
                            transition: 'background 0.1s ease',
                          }}
                        >
                          {/* 1. Selection Checkbox */}
                          <td
                            style={{
                              padding: '8px 8px',
                              textAlign: 'center',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectVendor(v.id)}
                              style={{ cursor: 'pointer', width: 14, height: 14 }}
                            />
                          </td>

                          {/* 2. Vendor Code */}
                          <td
                            style={{
                              padding: '8px 10px',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: '#1e40af',
                              borderRight: '1px solid #e2e8f0',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {v.code}
                          </td>

                          {/* 3. Vendor Name */}
                          <td
                            style={{
                              padding: '8px 12px',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            <Link
                              href={`/procurement/vendors/${v.id}`}
                              style={{
                                fontWeight: 700,
                                color: '#0f172a',
                                textDecoration: 'none',
                                display: 'block',
                              }}
                            >
                              {v.name}
                            </Link>
                            {v.contactPerson && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {v.contactPerson} {v.phone ? `· ${v.phone}` : ''}
                              </div>
                            )}
                          </td>

                          {/* 4. Category */}
                          <td
                            style={{
                              padding: '8px 10px',
                              color: '#334155',
                              fontWeight: 600,
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            {Array.isArray(v.categories)
                              ? v.categories.join(', ')
                              : v.categories || 'General Contracting'}
                          </td>

                          {/* 5. Region / Location */}
                          <td
                            style={{
                              padding: '8px 10px',
                              color: '#64748b',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            {v.operatingLocation || v.city || 'India'}
                          </td>

                          {/* 6. Classification */}
                          <td
                            style={{
                              padding: '8px 10px',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 3,
                                background: v.vendorType === 'CLIENT_VENDOR' ? '#eff6ff' : '#ecfdf5',
                                color: v.vendorType === 'CLIENT_VENDOR' ? '#1e40af' : '#047857',
                                border:
                                  v.vendorType === 'CLIENT_VENDOR'
                                    ? '1px solid #bfdbfe'
                                    : '1px solid #a7f3d0',
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {v.vendorType === 'CLIENT_VENDOR' ? 'Client Vendor' : 'Procucev Network'}
                            </span>
                          </td>

                          {/* 7. Onboarding Status */}
                          <td
                            style={{
                              padding: '8px 10px',
                              color: '#64748b',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            {v.onboardingStatus === 'ONBOARDED' ? (
                              <span style={{ color: '#047857', fontWeight: 600, fontSize: 11 }}>
                                ✓ Profile Complete
                              </span>
                            ) : v.onboardingStatus === 'PROFILE_INCOMPLETE' ? (
                              <span style={{ color: '#b45309', fontWeight: 600, fontSize: 11 }}>
                                ⚠ Incomplete Profile
                              </span>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: 11 }}>Draft</span>
                            )}
                          </td>

                          {/* 8. Qualification Status */}
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'center',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                background:
                                  v.qualificationStatus === 'QUALIFIED'
                                    ? '#ecfdf5'
                                    : v.qualificationStatus === 'CONDITIONALLY_QUALIFIED'
                                    ? '#fffbeb'
                                    : v.qualificationStatus === 'PENDING_REVIEW'
                                    ? '#eff6ff'
                                    : '#f1f5f9',
                                color:
                                  v.qualificationStatus === 'QUALIFIED'
                                    ? '#047857'
                                    : v.qualificationStatus === 'CONDITIONALLY_QUALIFIED'
                                    ? '#b45309'
                                    : v.qualificationStatus === 'PENDING_REVIEW'
                                    ? '#1e40af'
                                    : '#64748b',
                                border:
                                  v.qualificationStatus === 'QUALIFIED'
                                    ? '1px solid #a7f3d0'
                                    : v.qualificationStatus === 'CONDITIONALLY_QUALIFIED'
                                    ? '1px solid #fde68a'
                                    : v.qualificationStatus === 'PENDING_REVIEW'
                                    ? '1px solid #bfdbfe'
                                    : '1px solid #e2e8f0',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {v.qualificationStatus
                                ? v.qualificationStatus.replace(/_/g, ' ')
                                : 'NOT EVALUATED'}
                            </span>
                          </td>

                          {/* 9. Score */}
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'center',
                              fontWeight: 800,
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            {v.qualificationScore !== null && v.qualificationScore !== undefined ? (
                              <span
                                style={{
                                  color:
                                    v.qualificationScore >= 80
                                      ? '#047857'
                                      : v.qualificationScore >= 65
                                      ? '#b45309'
                                      : '#dc2626',
                                }}
                              >
                                {v.qualificationScore}%
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>

                          {/* 10. Action */}
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <Link
                              href={`/procurement/vendors/${v.id}?tab=evaluation`}
                              className="btn btn-outline"
                              style={{
                                fontSize: 11,
                                padding: '4px 8px',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              Evaluate <ArrowRight size={11} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          BULK EVALUATION CONFIRMATION & LIVE PROGRESS MODAL
      ========================================================================= */}
      {bulkModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              width: '100%',
              maxWidth: 680,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#1e40af" />
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {bulkDone
                    ? 'Bulk Evaluation Completed'
                    : bulkEvaluating
                    ? 'Evaluating Selected Vendors...'
                    : 'Confirm Bulk AI Vendor Evaluation'}
                </h3>
              </div>
              {!bulkEvaluating && (
                <button
                  type="button"
                  onClick={handleCloseBulkModal}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {/* State 1: Confirmation before execution */}
              {!bulkEvaluating && !bulkDone && (
                <div>
                  <p style={{ fontSize: 13, color: '#334155', marginTop: 0, marginBottom: 14 }}>
                    You have selected <strong>{selectedVendorIds.length} vendor(s)</strong> for structured AI evaluation.
                    The engine will analyze each profile against the 6 weighted rubric dimensions: Business Profile (15%), Financial Strength (20%), Previous Clients (20%), References (15%), Technical Capability (20%), and Compliance & Risk (10%).
                  </p>

                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      overflow: 'hidden',
                      marginBottom: 16,
                      maxHeight: 240,
                      overflowY: 'auto',
                    }}
                  >
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: '8px 10px', textAlign: 'left', width: 90 }}>Code</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Vendor Name</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', width: 120 }}>Group</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', width: 140 }}>Current Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVendorIds.map((id) => {
                          const v = vendors.find((item) => item.id === id);
                          if (!v) return null;
                          return (
                            <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>
                                {v.code}
                              </td>
                              <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f172a' }}>
                                {v.name}
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569' }}>
                                {v.vendorType === 'CLIENT_VENDOR' ? 'Client Vendor' : 'Procucev Network'}
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 11, color: '#64748b' }}>
                                {v.qualificationStatus ? v.qualificationStatus.replace(/_/g, ' ') : 'NOT EVALUATED'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      padding: '10px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#1e40af',
                    }}
                  >
                    <strong>Note:</strong> Evaluation creates formal pending records with recommended scores and status set to <code>PENDING_REVIEW</code>. Category Managers retain final review and qualification approval authority.
                  </div>
                </div>
              )}

              {/* State 2: Live Progress & Completed Results */}
              {(bulkEvaluating || bulkDone) && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                      <span>
                        {bulkDone ? 'All Evaluations Completed' : 'Processing Evaluations...'}
                      </span>
                      <span>
                        {Object.values(bulkProgress).filter((p) => p.status === 'success' || p.status === 'failed').length} / {selectedVendorIds.length} Done
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          background: bulkDone ? '#059669' : '#1e40af',
                          width: `${(Object.values(bulkProgress).filter((p) => p.status === 'success' || p.status === 'failed').length / selectedVendorIds.length) * 100}%`,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Per-Vendor Live Status List */}
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      overflow: 'hidden',
                      maxHeight: 280,
                      overflowY: 'auto',
                    }}
                  >
                    {selectedVendorIds.map((id) => {
                      const v = vendors.find((item) => item.id === id);
                      const prog = bulkProgress[id] || { status: 'pending', message: 'Queued' };
                      if (!v) return null;

                      return (
                        <div
                          key={v.id}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 12,
                            background: prog.status === 'running' ? '#f0f9ff' : '#ffffff',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#1e40af', marginRight: 8 }}>
                              {v.code}
                            </span>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{v.name}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {prog.status === 'pending' && (
                              <span style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={12} /> Queued
                              </span>
                            )}
                            {prog.status === 'running' && (
                              <span style={{ color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                <Loader2 size={12} className="animate-spin" /> Evaluating...
                              </span>
                            )}
                            {prog.status === 'success' && (
                              <span style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                                <CheckCircle2 size={13} /> {prog.message}
                              </span>
                            )}
                            {prog.status === 'failed' && (
                              <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                <XCircle size={13} /> {prog.message}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                background: '#f8fafc',
              }}
            >
              {!bulkEvaluating && !bulkDone && (
                <>
                  <button type="button" className="btn btn-outline" onClick={handleCloseBulkModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleStartBulkEvaluation}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    <Sparkles size={14} /> Start Evaluation ({selectedVendorIds.length})
                  </button>
                </>
              )}

              {bulkEvaluating && (
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={14} className="animate-spin" />
                  Processing evaluations, please wait...
                </div>
              )}

              {bulkDone && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCloseBulkModal}
                  style={{ fontWeight: 700 }}
                >
                  Done & View Results
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
