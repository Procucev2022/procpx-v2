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
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { VendorPagePagination } from '@app-types/app/api/procurement/vendors.types';


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
  const [loadingMore, setLoadingMore] = useState(false);
  const [vendorPagination, setVendorPagination] = useState<VendorPagePagination>({
    page: 1,
    pageSize: 0,
    hasMore: false,
    total: 0,
  });
  const vendorFetchSequence = useRef(0);

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

  const fetchVendors = async (page = 1, append = false) => {
    const requestSequence = ++vendorFetchSequence.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setLoadingMore(false);
    }
    try {
      const params = new URLSearchParams();
      if (vendorGroup !== 'ALL') params.set('vendorType', vendorGroup);
      if (qualificationFilter !== 'ALL') params.set('qualificationStatus', qualificationFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());
      if (page > 1) params.set('page', String(page));

      const res = await fetch(`/api/procurement/vendors?${params.toString()}`);
      if (requestSequence !== vendorFetchSequence.current) return;
      if (res.ok) {
        const data = await res.json();
        const incomingVendors = data.vendors || [];
        setVendors((current) => {
          if (!append) return incomingVendors;
          const existingIds = new Set(current.map((vendor) => vendor.id));
          return [...current, ...incomingVendors.filter((vendor: { id: string }) => !existingIds.has(vendor.id))];
        });
        setVendorPagination(data.pagination || {
          page,
          pageSize: incomingVendors.length,
          hasMore: false,
          total: incomingVendors.length,
        });
        if (data.counts) setCounts(data.counts);
      } else if (!append) {
        setVendors([]);
        setVendorPagination({ page: 1, pageSize: 0, hasMore: false, total: 0 });
      }
    } catch (err) {
      if (requestSequence === vendorFetchSequence.current && err instanceof Error && err.name !== 'AbortError') {
        console.error('Failed to load vendors', err);
        if (!append) {
          setVendors([]);
          setVendorPagination({ page: 1, pageSize: 0, hasMore: false, total: 0 });
        }
      }
    } finally {
      if (requestSequence === vendorFetchSequence.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  };

  const loadMoreVendors = () => {
    if (!loading && !loadingMore && vendorPagination.hasMore) {
      void fetchVendors(vendorPagination.page + 1, true);
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
      errors.name = UI_STRINGS.appAppProcurementVendorsPage.vendorLegalBusinessNameIsRequired;
    }
    if (!newVendor.contactPerson.trim()) {
      errors.contactPerson = UI_STRINGS.appAppProcurementVendorsPage.primaryContactPersonIsRequired;
    }
    if (!newVendor.email.trim() && !newVendor.phone.trim()) {
      errors.emailOrPhone = UI_STRINGS.appAppProcurementVendorsPage.contactMethodEmailOrMobileIsRequired;
    }
    if (!newVendor.category.trim()) {
      errors.category = UI_STRINGS.appAppProcurementVendorsPage.primaryCategoryDomainIsRequired;
    }
    if (!newVendor.operatingLocation.trim() && !newVendor.city.trim()) {
      errors.operatingLocation = UI_STRINGS.appAppProcurementVendorsPage.operatingLocationCityRegionIsRequired;
    }

    setStep1Errors(errors);
    if (Object.keys(errors).length > 0) {
      setOnboardErrorMsg(UI_STRINGS.appAppProcurementVendorsPage.mandatoryFieldsMarkedWithAsteriskAreRequired);
      return false;
    }
    setOnboardErrorMsg('');
    return true;
  };

  // Validate Step 2 before completing registration
  const validateStep2 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!newVendor.legalStructure) {
      errors.legalStructure = UI_STRINGS.common.userMessages.legalStructureIsRequired;
    }
    if (!newVendor.address.trim()) {
      errors.address = UI_STRINGS.appAppProcurementVendorsPage.registeredBusinessAddressIsRequired;
    }
    if (!newVendor.capabilities.trim()) {
      errors.capabilities = UI_STRINGS.appAppProcurementVendorsPage.productScopeCapabilitiesIsRequired;
    }

    setStep2Errors(errors);
    if (Object.keys(errors).length > 0) {
      setOnboardErrorMsg(UI_STRINGS.appAppProcurementVendorsPage.mandatoryFieldsMarkedWithAsteriskAreRequired);
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
      setOnboardErrorMsg(UI_STRINGS.appAppProcurementVendorsPage.vendorLegalNameIsRequiredEvenForDraftSaving);
      setStep1Errors({ name: UI_STRINGS.appAppProcurementVendorsPage.vendorLegalBusinessNameIsRequired });
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
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToOnboardVendor }));
      }

      setSavedVendorId(data.vendor.id);
      fetchVendors();

      if (isDraft) {
        toast.success(UI_STRINGS.common.userMessages.vendorProfileSavedAsDraft, data.vendor.code, UI_STRINGS.common.draft);
        setOnboardSuccessMsg(interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.draftSavedSuccessfullyForNameCode, {
          name: data.vendor.name,
          code: data.vendor.code,
        }));
      } else {
        toast.success(UI_STRINGS.common.userMessages.vendorOnboardingCompletedSuccessfully, data.vendor.code, UI_STRINGS.common.userMessages.onboarded);
        setOnboardSuccessMsg(interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.vendorNameCodeRegisteredAndOnboarded, {
          name: data.vendor.name,
          code: data.vendor.code,
        }));

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
      setOnboardErrorMsg(err.message || UI_STRINGS.appAppProcurementVendorsPage.errorOnboardingVendor);
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
      initialProgress[id] = { status: 'pending', message: UI_STRINGS.appAppProcurementVendorsPage.queuedForEvaluation };
    });
    setBulkProgress(initialProgress);

    for (const id of selectedVendorIds) {
      setBulkProgress((prev) => ({
        ...prev,
        [id]: { status: 'running', message: UI_STRINGS.appAppProcurementVendorsPage.analyzingProfileEvidenceAgainst6Rubrics },
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
              message: interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.scoreOverallWeightedScoreQualificationOutcome, { "overallWeightedScore": data.report.overallWeightedScore, "qualificationOutcome": data.report.qualificationOutcome }),
            },
          }));
        } else {
          setBulkProgress((prev) => ({
            ...prev,
            [id]: {
              status: 'failed',
              message: interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || 'Evaluation failed to complete.' }),
            },
          }));
        }
      } catch (err: any) {
        setBulkProgress((prev) => ({
          ...prev,
          [id]: {
            status: 'failed',
            message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || 'Network error during evaluation.' }),
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
              { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
              { label: UI_STRINGS.appAppProcurementVendorsPage.vendorManagement },
            ]}
            title={UI_STRINGS.appAppProcurementVendorsPage.vendorManagement}
            description={UI_STRINGS.appAppProcurementVendorsPage.enterpriseVendorGovernanceClientVsNetworkPartnerDirectoryEvidenceBasedAIEvaluationRubricAndPPOPerformanceTracking}
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
                  <Plus size={16} />{UI_STRINGS.appAppProcurementVendorsPage.addVendor}</button>
              </div>
            }
          />

          {/* KPI Stats Strip */}
          <div className="mb-6">
            <SummaryCardGrid columns={5}>
              <SummaryCard
                label={UI_STRINGS.appAppProcurementVendorsPage.totalRegistered}
                value={counts.total}
                secondary={UI_STRINGS.appAppProcurementVendorsPage.acrossAllCategories}
                icon={<Building2 size={16} />}
                accent="default"
              />
              <SummaryCard
                label={UI_STRINGS.appAppProcurementVendorsPage.clientVendors}
                value={counts.clientVendorsCount}
                secondary={UI_STRINGS.appAppProcurementVendorsPage.clientNominatedPrivate}
                icon={<Users size={16} />}
                accent="blue"
              />
              <SummaryCard
                label={UI_STRINGS.appAppProcurementVendorsPage.procucevNetwork}
                value={counts.procucevVendorsCount}
                secondary={UI_STRINGS.appAppProcurementVendorsPage.preVettedNetworkPartners}
                icon={<Globe size={16} />}
                accent="emerald"
              />
              <SummaryCard
                label={UI_STRINGS.appAppProcurementVendorsPage.fullyQualified}
                value={counts.qualifiedCount}
                secondary={UI_STRINGS.appAppProcurementVendorsPage.passedEvaluation}
                icon={<ShieldCheck size={16} />}
                accent="emerald"
              />
              <SummaryCard
                label={UI_STRINGS.common.pendingReview}
                value={counts.pendingReviewCount + counts.notEvaluatedCount}
                secondary={interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.pendingReviewCountInReviewNotEvaluatedCountNotEvaluated, { "pendingReviewCount": counts.pendingReviewCount, "notEvaluatedCount": counts.notEvaluatedCount })}
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
              <Building2 size={15} />{UI_STRINGS.common.vendorDirectory}</button>

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
              <Plus size={15} />{UI_STRINGS.appAppProcurementVendorsPage.immediateOnboarding}</button>

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
              <Sparkles size={15} color="#6366f1" />{UI_STRINGS.appAppProcurementVendorsPage.evaluationHubSelection}</button>
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
              >{UI_STRINGS.appAppProcurementVendorsPage.allVendors}{counts.total}{UI_STRINGS.common.copyc7zu6c}</button>
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
              >{UI_STRINGS.appAppProcurementVendorsPage.clientVendors2}{counts.clientVendorsCount}{UI_STRINGS.common.copyc7zu6c}</button>
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
              >{UI_STRINGS.appAppProcurementVendorsPage.procucevNetworkVendors}{counts.procucevVendorsCount}{UI_STRINGS.common.copyc7zu6c}</button>
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
                  placeholder={UI_STRINGS.appAppProcurementVendorsPage.searchNameCodeCityGSTIN}
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
                <option value="ALL">{UI_STRINGS.appAppProcurementVendorsPage.allQualificationStates}</option>
                <option value="QUALIFIED">{UI_STRINGS.appAppProcurementVendorsPage.qualified2}</option>
                <option value="CONDITIONALLY_QUALIFIED">{UI_STRINGS.appAppProcurementVendorsPage.conditionallyQualified}</option>
                <option value="PENDING_REVIEW">{UI_STRINGS.common.pendingReview}</option>
                <option value="NOT_EVALUATED">{UI_STRINGS.common.notEvaluated}</option>
                <option value="NOT_QUALIFIED">{UI_STRINGS.appAppProcurementVendorsPage.notQualified2}</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input-field"
                style={{ height: 32, fontSize: 12, padding: '0 8px' }}
              >
                <option value="ALL">{UI_STRINGS.common.allCategories}</option>
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
                    <th style={{ padding: '0 12px', width: 95 }}>{UI_STRINGS.common.vendorCode}</th>
                    <th style={{ padding: '0 12px', minWidth: 200 }}>{UI_STRINGS.common.vendorName}</th>
                    <th style={{ padding: '0 10px', width: 140 }}>{UI_STRINGS.appAppProcurementVendorsPage.vendorGroup}</th>
                    <th style={{ padding: '0 10px', minWidth: 150 }}>{UI_STRINGS.common.primaryCategory}</th>
                    <th style={{ padding: '0 10px', width: 130 }}>{UI_STRINGS.common.location}</th>
                    <th style={{ padding: '0 10px', width: 140, textAlign: 'center' }}>{UI_STRINGS.common.qualification}</th>
                    <th style={{ padding: '0 10px', width: 120, textAlign: 'center' }}>{UI_STRINGS.appAppProcurementVendorsPage.pPORating}</th>
                    <th style={{ padding: '0 12px', width: 90, textAlign: 'center' }}>{UI_STRINGS.common.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsPage.loadingVendors}</td>
                    </tr>
                  ) : vendors.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                        <Building2 size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>{UI_STRINGS.appAppProcurementVendorsPage.noVendorsFound}</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {search
                            ? UI_STRINGS.appAppProcurementVendorsPage.tryAdjustingYourSearchQueryOrFilters
                            : UI_STRINGS.appAppProcurementVendorsPage.clickAddVendorAboveToOnboardYourFirstVendor}
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
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsPage.contact}{v.contactPerson} {v.phone ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.phone, { "phone": v.phone }) : ''}
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
                            {v.vendorType === 'CLIENT_VENDOR' ? UI_STRINGS.common.clientVendor : UI_STRINGS.appAppProcurementVendorsPage.procucevNetwork}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', color: '#334155', fontWeight: 600 }}>
                          {Array.isArray(v.categories)
                            ? v.categories.join(', ')
                            : v.categories || UI_STRINGS.appAppProcurementVendorsPage.generalContracting}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#64748b' }}>
                          {v.operatingLocation || v.city || UI_STRINGS.common.india}
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
                              <CheckCircle2 size={12} />{UI_STRINGS.appAppProcurementVendorsPage.qualified}{' '}
                              {v.qualificationScore ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.qualificationScore, { "qualificationScore": v.qualificationScore }) : ''}
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
                              <AlertTriangle size={12} />{UI_STRINGS.appAppProcurementVendorsPage.conditional}{' '}
                              {v.qualificationScore ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.qualificationScore, { "qualificationScore": v.qualificationScore }) : ''}
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
                              <Clock size={12} />{UI_STRINGS.appAppProcurementVendorsPage.reviewPending}</span>
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
                              <XCircle size={12} />{UI_STRINGS.appAppProcurementVendorsPage.notQualified}</span>
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
                            >{UI_STRINGS.common.notEvaluated}</span>
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
                              <span style={{ fontSize: 10, color: '#64748b' }}>{UI_STRINGS.common.copychzfvb}{v.ppoRatingsCount}{UI_STRINGS.appAppProcurementVendorsPage.pPO}{v.ppoRatingsCount > 1 ? UI_STRINGS.common.s : ''}{UI_STRINGS.common.copyc7zu6c}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>{UI_STRINGS.common.copy4s9bsz}</span>
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
                          >{UI_STRINGS.common.open}<ArrowRight size={11} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {vendorPagination.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 4px', color: '#64748b', fontSize: 12 }}>
              <span>{interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.loadedVendorCountOfTotal, {
                loaded: vendors.length,
                total: vendorPagination.total,
              })}</span>
              {vendorPagination.hasMore && (
                <button type="button" className="btn btn-outline" onClick={loadMoreVendors} disabled={loading || loadingMore}>
                  {loadingMore ? UI_STRINGS.appAppProcurementVendorsPage.loadingMoreVendors : UI_STRINGS.appAppProcurementVendorsPage.loadMoreVendors}
                </button>
              )}
            </div>
          )}
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
              <ArrowLeft size={15} />{UI_STRINGS.appAppProcurementVendorsPage.backToVendorManagement}</button>

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
                  {onboardingStep === 1 ? UI_STRINGS.common.copyefwnq4 : <Check size={12} strokeWidth={3} />}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: onboardingStep === 1 ? 700 : 600,
                    color: onboardingStep === 1 ? '#2563eb' : '#334155',
                  }}
                >{UI_STRINGS.common.basicInformation}</span>
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
                >{UI_STRINGS.common.copyf9vgt1}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: onboardingStep === 2 ? 700 : 500,
                    color: onboardingStep === 2 ? '#2563eb' : '#64748b',
                  }}
                >{UI_STRINGS.common.businessProfile}</span>
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.2px' }}>{UI_STRINGS.appAppProcurementVendorsPage.immediateVendorOnboarding}</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0', lineHeight: 1.5 }}>{UI_STRINGS.appAppProcurementVendorsPage.registerASupplierRecordIntoTheGovernanceDirectoryStep1CollectsCoreOperationalContactsStep2CapturesBusinessTaxComplianceAndCapabilities}</p>

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
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsPage.step1BasicVendorContactInformation}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsPage.enterTheKeyVendorDetailsAndPrimaryContactInformationFieldsMarkedWith}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>{UI_STRINGS.appAppProcurementVendorsPage.areMandatory}</div>
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
                    >{UI_STRINGS.common.vendorLegalBusinessName}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <input
                      id="vendor-legal-name"
                      type="text"
                      className="form-control"
                      placeholder={UI_STRINGS.common.eGApexInfrastructureContractingPvtLtd}
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
                    >{UI_STRINGS.appAppProcurementVendorsPage.vendorClassificationType}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
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
                      <option value="CLIENT_VENDOR">{UI_STRINGS.appAppProcurementVendorsPage.clientVendorNominatedExclusivelyForThisClient}</option>
                      <option value="PROCUCEV_VENDOR">{UI_STRINGS.common.procucevNetworkVendor}</option>
                    </select>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.selectWhetherThisVendorIsAClientNominatedVendorOrFromProcucevNetwork}</div>
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
                    >{UI_STRINGS.common.primaryContactPerson}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <input
                      id="vendor-contact-person"
                      type="text"
                      className="form-control"
                      placeholder={UI_STRINGS.common.eGRajeshSharma}
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
                    >{UI_STRINGS.common.contactEmail}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <input
                      id="vendor-email"
                      type="email"
                      className="form-control"
                      placeholder={UI_STRINGS.appAppProcurementVendorsPage.eGSalesApexinfraCom}
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
                    >{UI_STRINGS.common.mobilePhoneNumber}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
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
                        <option value="+91">{UI_STRINGS.appAppProcurementVendorsPage.copy1qtly14}</option>
                        <option value="+1">{UI_STRINGS.appAppProcurementVendorsPage.copy6wbfgh}</option>
                        <option value="+44">{UI_STRINGS.appAppProcurementVendorsPage.copyta14sq}</option>
                        <option value="+971">{UI_STRINGS.appAppProcurementVendorsPage.copy1beg4up}</option>
                        <option value="+65">{UI_STRINGS.appAppProcurementVendorsPage.copyo02dmb}</option>
                      </select>
                      <input
                        id="vendor-phone"
                        type="tel"
                        placeholder={UI_STRINGS.appAppProcurementVendorsPage.eG9876543210}
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
                    >{UI_STRINGS.appAppProcurementVendorsPage.alternateContactNumber}</label>
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
                        <option value="+91">{UI_STRINGS.appAppProcurementVendorsPage.copy1qtly14}</option>
                        <option value="+1">{UI_STRINGS.appAppProcurementVendorsPage.copy6wbfgh}</option>
                        <option value="+44">{UI_STRINGS.appAppProcurementVendorsPage.copyta14sq}</option>
                        <option value="+971">{UI_STRINGS.appAppProcurementVendorsPage.copy1beg4up}</option>
                        <option value="+65">{UI_STRINGS.appAppProcurementVendorsPage.copyo02dmb}</option>
                      </select>
                      <input
                        id="vendor-alt-phone"
                        type="tel"
                        placeholder={UI_STRINGS.appAppProcurementVendorsPage.eG9876543210}
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
                    >{UI_STRINGS.appAppProcurementVendorsPage.primaryCategoryDomain}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
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
                      <option value="Civil & Interior">{UI_STRINGS.common.civilInterior}</option>
                      <option value="Civil & Structural">{UI_STRINGS.appAppProcurementVendorsPage.civilStructural}</option>
                      <option value="Electrical & Automation">{UI_STRINGS.appAppProcurementVendorsPage.electricalAutomation}</option>
                      <option value="HVAC & Ventilation">{UI_STRINGS.appAppProcurementVendorsPage.hVACVentilation}</option>
                      <option value="Plumbing & Sanitary">{UI_STRINGS.appAppProcurementVendorsPage.plumbingSanitary}</option>
                      <option value="Retail Fixtures & Joinery">{UI_STRINGS.appAppProcurementVendorsPage.retailFixturesJoinery}</option>
                      <option value="Structural Steel, Prefab">{UI_STRINGS.appAppProcurementVendorsPage.structuralSteelPrefab}</option>
                      <option value="General Contracting">{UI_STRINGS.appAppProcurementVendorsPage.generalContracting}</option>
                      <option value="Hospitality Supplies">{UI_STRINGS.appAppProcurementVendorsPage.hospitalitySupplies}</option>
                    </select>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.selectThePrimaryCategoryForThisVendor}</div>
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
                    >{UI_STRINGS.common.operatingLocationCityRegion}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <input
                      id="vendor-operating-location"
                      type="text"
                      className="form-control"
                      placeholder={UI_STRINGS.common.eGHyderabadTelangana}
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
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.selectTheMainCityOrRegionWhereTheVendorOperates}</div>
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
                    <span>{UI_STRINGS.appAppProcurementVendorsPage.importantInformation}</span>
                  </div>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                    <li>{UI_STRINGS.appAppProcurementVendorsPage.pleaseEnsureTheVendorNameAndContactDetailsAreAccurate}</li>
                    <li>{UI_STRINGS.appAppProcurementVendorsPage.youCanSaveADraftAndContinueLater}</li>
                    <li>{UI_STRINGS.appAppProcurementVendorsPage.afterCompletingStep1YouWillBeAbleToProvideBusinessStatutoryAndCapabilityDetailsInStep2}</li>
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
                      <FileText size={15} color="#475569" />{UI_STRINGS.appAppProcurementVendorsPage.saveAsDraft}<span style={{ display: 'none' }}>{UI_STRINGS.common.profile}</span>
                    </button>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{UI_STRINGS.appAppProcurementVendorsPage.draftWillBeSavedAutomatically}</div>
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
                  >{UI_STRINGS.appAppProcurementVendorsPage.continueToStep2BusinessProfile}<ArrowRight size={15} />
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
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsPage.step2BusinessProfileStatutoryDetails}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsPage.provideBusinessInformationStatutoryDetailsAndCapabilityProfile}</div>
                  </div>
                </div>

                {/* Section A: Statutory & Legal Information */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>{UI_STRINGS.appAppProcurementVendorsPage.aStatutoryLegalInformation}</div>

                  {/* Row 1: Legal Structure, GSTIN, PAN */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.legalStructure}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
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
                        <option value="PRIVATE_LIMITED">{UI_STRINGS.common.privateLimitedPvtLtd}</option>
                        <option value="PUBLIC_LIMITED">{UI_STRINGS.common.publicLimitedLtd}</option>
                        <option value="PARTNERSHIP">{UI_STRINGS.common.partnershipFirm}</option>
                        <option value="SOLE_PROPRIETORSHIP">{UI_STRINGS.common.proprietorship}</option>
                        <option value="LLP">{UI_STRINGS.common.lLPLimitedLiabilityPartnership}</option>
                        <option value="JOINT_VENTURE">{UI_STRINGS.common.jointVenture}</option>
                      </select>
                      {step2Errors.legalStructure && (
                        <span style={{ fontSize: 11, color: '#dc2626', marginTop: 4, display: 'block' }}>
                          {step2Errors.legalStructure}
                        </span>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.gSTIN15Digits}</label>
                      <input
                        id="vendor-gstin"
                        type="text"
                        className="form-control"
                        placeholder={UI_STRINGS.common.eG36AABCA1234F1Z5}
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
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.pAN10Digits}</label>
                      <input
                        id="vendor-pan"
                        type="text"
                        className="form-control"
                        placeholder={UI_STRINGS.common.eGAABCA1234F}
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
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.companyWebsite}</label>
                      <input
                        id="vendor-website"
                        type="url"
                        className="form-control"
                        placeholder={UI_STRINGS.common.httpsCompanyCom}
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
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementVendorsPage.yearsInBusiness}</label>
                      <input
                        id="vendor-experience-years"
                        type="number"
                        className="form-control"
                        min={0}
                        placeholder={UI_STRINGS.appAppProcurementVendorsPage.eG5}
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
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.annualTurnoverCrores}</label>
                      <input
                        id="vendor-turnover"
                        type="number"
                        className="form-control"
                        step="0.1"
                        placeholder={UI_STRINGS.common.eG255}
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
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.registeredBusinessAddress}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <textarea
                      id="vendor-address"
                      rows={3}
                      maxLength={500}
                      className="form-control"
                      placeholder={UI_STRINGS.appAppProcurementVendorsPage.completeRegisteredOfficeAddressWithPINCode}
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
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{newVendor.address.length}{UI_STRINGS.appAppProcurementVendorsPage.copy1bjt06v}</span>
                    </div>
                  </div>
                </div>

                {/* Section B: Business Capabilities */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>{UI_STRINGS.appAppProcurementVendorsPage.bBusinessCapabilities}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.productScopeCapabilities}<span style={{ color: '#dc2626' }}>{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <textarea
                        id="vendor-capabilities"
                        rows={3}
                        maxLength={500}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsPage.eGCivilWorksInteriorFitOutsMEPFurnitureEtc}
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
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{newVendor.capabilities.length}{UI_STRINGS.appAppProcurementVendorsPage.copy1bjt06v}</span>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementVendorsPage.keyClientReferencesPreviousProjects}</label>
                      <textarea
                        id="vendor-references"
                        rows={3}
                        maxLength={500}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsPage.eGTataRelianceDMartAndProjectValues}
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
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{newVendor.clientReferences.length}{UI_STRINGS.appAppProcurementVendorsPage.copy1bjt06v}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section C: Additional Information (Optional) */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>{UI_STRINGS.appAppProcurementVendorsPage.cAdditionalInformationOptional}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementVendorsPage.certificationsEGISOMSMEEtc}</label>
                      <textarea
                        id="vendor-certifications"
                        rows={2}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsPage.eGISO9001MSMEEtc}
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
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>{UI_STRINGS.common.remarks}</label>
                      <textarea
                        id="vendor-remarks"
                        rows={2}
                        maxLength={300}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsPage.anyAdditionalInformationAboutThisVendor}
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
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{(newVendor.remarks || '').length}{UI_STRINGS.appAppProcurementVendorsPage.copy1kv7rnl}</span>
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
                    <ArrowLeft size={15} color="#475569" />{UI_STRINGS.appAppProcurementVendorsPage.backToStep1}</button>

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
                      <FileText size={15} color="#475569" />{UI_STRINGS.appAppProcurementVendorsPage.saveAsDraft}<span style={{ display: 'none' }}>{UI_STRINGS.common.profile}</span>
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
                          <Loader2 size={15} className="animate-spin" />{UI_STRINGS.appAppProcurementVendorsPage.registering}</>
                      ) : (
                        UI_STRINGS.appAppProcurementVendorsPage.completeOnboardingRegister
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
                  <Sparkles size={16} color="#6366f1" />{UI_STRINGS.appAppProcurementVendorsPage.structuredVendorEvaluationRubric}</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>{UI_STRINGS.appAppProcurementVendorsPage.evidenceBasedMultiCriteriaFrameworkAIEvaluatesRecordedProfileAndComplianceEvidenceCategoryManagersHoldDefinitiveQualificationDecisionAuthority}</p>
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
                >{UI_STRINGS.appAppProcurementVendorsPage.copymriest}</span>
                <span
                  style={{
                    padding: '3px 8px',
                    background: '#fffbeb',
                    color: '#b45309',
                    borderRadius: 4,
                    fontWeight: 700,
                    border: '1px solid #fde68a',
                  }}
                >{UI_STRINGS.appAppProcurementVendorsPage.copykdjcgq}</span>
                <span
                  style={{
                    padding: '3px 8px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    borderRadius: 4,
                    fontWeight: 700,
                    border: '1px solid #fecaca',
                  }}
                >{UI_STRINGS.appAppProcurementVendorsPage.lt65NotRecommended}</span>
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
                >{UI_STRINGS.appAppProcurementVendorsPage.allVendors}{counts.total}{UI_STRINGS.common.copyc7zu6c}</button>
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
                >{UI_STRINGS.appAppProcurementVendorsPage.clientVendors2}{counts.clientVendorsCount}{UI_STRINGS.common.copyc7zu6c}</button>
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
                >{UI_STRINGS.appAppProcurementVendorsPage.procucevNetworkVendors}{counts.procucevVendorsCount}{UI_STRINGS.common.copyc7zu6c}</button>
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
                >{UI_STRINGS.common.showing}{evaluationVendors.length}{UI_STRINGS.common.of}{vendors.length}{UI_STRINGS.common.vendors}</span>

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
                  <RotateCcw size={12} />{UI_STRINGS.appAppProcurementVendorsPage.clearFilters}</button>

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
                  <Filter size={12} />{UI_STRINGS.appAppProcurementVendorsPage.applyFilters}</button>
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
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.categoryDomain}</label>
                <select
                  value={evalCategory}
                  onChange={(e) => setEvalCategory(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: 36, fontSize: 12, padding: '0 8px' }}
                >
                  <option value="ALL">{UI_STRINGS.common.allCategories}</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Region / Location */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.regionOperatingLocation}</label>
                <select
                  value={evalRegion}
                  onChange={(e) => setEvalRegion(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: 36, fontSize: 12, padding: '0 8px' }}
                >
                  <option value="ALL">{UI_STRINGS.appAppProcurementVendorsPage.allRegionsLocations}</option>
                  {availableRegions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Qualification Status */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>{UI_STRINGS.common.qualificationStatus}</label>
                <select
                  value={evalQualificationStatus}
                  onChange={(e) => setEvalQualificationStatus(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', height: 36, fontSize: 12, padding: '0 8px' }}
                >
                  <option value="ALL">{UI_STRINGS.appAppProcurementVendorsPage.allQualificationStates}</option>
                  <option value="NOT_EVALUATED">{UI_STRINGS.common.notEvaluated}</option>
                  <option value="PENDING_REVIEW">{UI_STRINGS.common.pendingReview}</option>
                  <option value="QUALIFIED">{UI_STRINGS.appAppProcurementVendorsPage.qualified2}</option>
                  <option value="CONDITIONALLY_QUALIFIED">{UI_STRINGS.appAppProcurementVendorsPage.conditionallyQualified}</option>
                  <option value="NOT_QUALIFIED">{UI_STRINGS.appAppProcurementVendorsPage.notQualified2}</option>
                </select>
              </div>

              {/* Search Code / Name */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.searchByVendorCodeOrName}</label>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder={UI_STRINGS.appAppProcurementVendorsPage.eGVND0001Apex}
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
                  <span>{UI_STRINGS.appAppProcurementVendorsPage.selectVendorsForEvaluation}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>{UI_STRINGS.common.copychzfvb}{evaluationVendors.length}{UI_STRINGS.appAppProcurementVendorsPage.inFilteredSet}</span>
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
                          placeholder={UI_STRINGS.appAppProcurementVendorsPage.searchVendorsInThisListByCodeOrName}
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
                          >{UI_STRINGS.common.selectAll}{dropdownVendors.length}{UI_STRINGS.common.copyc7zu6c}</button>
                          <span style={{ color: '#cbd5e1' }}>{UI_STRINGS.common.copy1x3o5rv}</span>
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
                          >{UI_STRINGS.common.clearSelection}</button>
                        </div>

                        <span style={{ color: '#0f172a', fontWeight: 700 }}>
                          {selectedVendorIds.length}{UI_STRINGS.appAppProcurementVendorsPage.selected}</span>
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
                        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>{UI_STRINGS.appAppProcurementVendorsPage.noVendorsMatch}{vendorDropdownSearch}{UI_STRINGS.common.copyau1tph}</div>
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
                                  {Array.isArray(v.categories) ? v.categories.join(', ') : v.categories || UI_STRINGS.appAppProcurementVendorsPage.generalContracting}{' '}{UI_STRINGS.appAppProcurementVendorsPage.copy1degdiu}{v.city || v.operatingLocation || UI_STRINGS.common.india}
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
                                  {v.qualificationStatus ? v.qualificationStatus.replace(/_/g, ' ') : UI_STRINGS.common.nOTEVALUATED}
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
                      <span>{UI_STRINGS.appAppProcurementVendorsPage.selectionUpdatesTableAutomatically}</span>
                      <button
                        type="button"
                        onClick={() => setIsVendorDropdownOpen(false)}
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: '4px 12px', fontWeight: 700 }}
                      >{UI_STRINGS.appAppProcurementVendorsPage.done2}</button>
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
                  <Sparkles size={15} />{UI_STRINGS.appAppProcurementVendorsPage.evaluateSelectedVendors}{selectedVendorIds.length > 0 ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.length, { "length": selectedVendorIds.length }) : ''}
                </button>

                {selectedVendorIds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setSelectedVendorIds([])}
                    style={{ height: 38, fontSize: 12, padding: '0 12px' }}
                  >{UI_STRINGS.common.clearSelection}</button>
                )}
              </div>

              {/* Selection Scope Helper Note */}
              <div style={{ width: '100%', fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.selectionAppliesToTheActiveFilteredSet}{evaluationVendors.length}{UI_STRINGS.appAppProcurementVendorsPage.vendorsSelectingVendorsViaDropdownOrRowCheckboxesPreparesThemForAutomatedRubricEvaluation}</div>
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
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsPage.evaluationPipelineReviewQueue}</span>
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
                {vendorPagination.hasMore && (
                  <button type="button" className="btn btn-outline" onClick={loadMoreVendors} disabled={loading || loadingMore}>
                    {loadingMore ? UI_STRINGS.appAppProcurementVendorsPage.loadingMoreVendors : UI_STRINGS.appAppProcurementVendorsPage.loadMoreVendors}
                  </button>
                )}
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
                    {selectedVendorIds.length}{UI_STRINGS.appAppProcurementVendorsPage.vendor}{selectedVendorIds.length > 1 ? UI_STRINGS.common.s : ''}{UI_STRINGS.appAppProcurementVendorsPage.selected}</span>
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
                  <Sparkles size={14} />{UI_STRINGS.appAppProcurementVendorsPage.evaluateSelectedVendors2}{selectedVendorIds.length}{UI_STRINGS.common.copyc7zu6c}</button>
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
                        title={UI_STRINGS.appAppProcurementVendorsPage.selectAllVisibleVendors}
                      />
                    </th>

                    {/* 2. Vendor Code */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 95,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.common.vendorCode}</th>

                    {/* 3. Vendor Name */}
                    <th
                      style={{
                        padding: '0 12px',
                        minWidth: 190,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.common.vendorName}</th>

                    {/* 4. Category */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 140,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.common.category2}</th>

                    {/* 5. Region / Location */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 130,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.appAppProcurementVendorsPage.regionLocation}</th>

                    {/* 6. Classification */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 125,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.appAppProcurementVendorsPage.classification}</th>

                    {/* 7. Onboarding Status */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 130,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.common.onboardingStatus}</th>

                    {/* 8. Qualification Status */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 145,
                        textAlign: 'center',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.common.qualificationStatus}</th>

                    {/* 9. Score */}
                    <th
                      style={{
                        padding: '0 10px',
                        width: 85,
                        textAlign: 'center',
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >{UI_STRINGS.common.score}</th>

                    {/* 10. Action */}
                    <th
                      style={{
                        padding: '0 12px',
                        width: 100,
                        textAlign: 'center',
                      }}
                    >{UI_STRINGS.common.action}</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsPage.loadingVendors}</td>
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
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>{UI_STRINGS.appAppProcurementVendorsPage.noVendorsMatchFilterCriteria}</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>{UI_STRINGS.appAppProcurementVendorsPage.adjustYourFilterSelectionsAboveOrClickClearFiltersToRestoreAllVendors}</div>
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
                                {v.contactPerson} {v.phone ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsPage.phone2, { "phone": v.phone }) : ''}
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
                              : v.categories || UI_STRINGS.appAppProcurementVendorsPage.generalContracting}
                          </td>

                          {/* 5. Region / Location */}
                          <td
                            style={{
                              padding: '8px 10px',
                              color: '#64748b',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            {v.operatingLocation || v.city || UI_STRINGS.common.india}
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
                              {v.vendorType === 'CLIENT_VENDOR' ? UI_STRINGS.common.clientVendor : UI_STRINGS.appAppProcurementVendorsPage.procucevNetwork}
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
                              <span style={{ color: '#047857', fontWeight: 600, fontSize: 11 }}>{UI_STRINGS.appAppProcurementVendorsPage.profileComplete}</span>
                            ) : v.onboardingStatus === 'PROFILE_INCOMPLETE' ? (
                              <span style={{ color: '#b45309', fontWeight: 600, fontSize: 11 }}>{UI_STRINGS.appAppProcurementVendorsPage.incompleteProfile}</span>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: 11 }}>{UI_STRINGS.common.draft}</span>
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
                                : UI_STRINGS.common.nOTEVALUATED}
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
                                {v.qualificationScore}{UI_STRINGS.common.copy8w4luo}</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>{UI_STRINGS.common.copy4s9bsz}</span>
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
                            >{UI_STRINGS.appAppProcurementVendorsPage.evaluate}<ArrowRight size={11} />
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
                    ? UI_STRINGS.appAppProcurementVendorsPage.bulkEvaluationCompleted
                    : bulkEvaluating
                    ? UI_STRINGS.appAppProcurementVendorsPage.evaluatingSelectedVendors
                    : UI_STRINGS.appAppProcurementVendorsPage.confirmBulkAIVendorEvaluation}
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
                  <p style={{ fontSize: 13, color: '#334155', marginTop: 0, marginBottom: 14 }}>{UI_STRINGS.appAppProcurementVendorsPage.youHaveSelected}<strong>{selectedVendorIds.length}{UI_STRINGS.appAppProcurementVendorsPage.vendorS}</strong>{UI_STRINGS.appAppProcurementVendorsPage.forStructuredAIEvaluationTheEngineWillAnalyzeEachProfileAgainstThe6WeightedRubricDimensionsBusinessProfile15FinancialStrength20PreviousClients20References15TechnicalCapability20AndComplianceRisk10}</p>

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
                          <th style={{ padding: '8px 10px', textAlign: 'left', width: 90 }}>{UI_STRINGS.common.code}</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>{UI_STRINGS.common.vendorName}</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', width: 120 }}>{UI_STRINGS.appAppProcurementVendorsPage.group}</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', width: 140 }}>{UI_STRINGS.common.currentStatus}</th>
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
                                {v.vendorType === 'CLIENT_VENDOR' ? UI_STRINGS.common.clientVendor : UI_STRINGS.appAppProcurementVendorsPage.procucevNetwork}
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 11, color: '#64748b' }}>
                                {v.qualificationStatus ? v.qualificationStatus.replace(/_/g, ' ') : UI_STRINGS.common.nOTEVALUATED}
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
                    <strong>{UI_STRINGS.common.note}</strong>{UI_STRINGS.appAppProcurementVendorsPage.evaluationCreatesFormalPendingRecordsWithRecommendedScoresAndStatusSetTo}<code>{UI_STRINGS.appAppProcurementVendorsPage.pENDINGREVIEW}</code>{UI_STRINGS.appAppProcurementVendorsPage.categoryManagersRetainFinalReviewAndQualificationApprovalAuthority}</div>
                </div>
              )}

              {/* State 2: Live Progress & Completed Results */}
              {(bulkEvaluating || bulkDone) && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                      <span>
                        {bulkDone ? UI_STRINGS.appAppProcurementVendorsPage.allEvaluationsCompleted : UI_STRINGS.appAppProcurementVendorsPage.processingEvaluations}
                      </span>
                      <span>
                        {Object.values(bulkProgress).filter((p) => p.status === 'success' || p.status === 'failed').length}{UI_STRINGS.common.copy3ml01c}{selectedVendorIds.length}{UI_STRINGS.appAppProcurementVendorsPage.done}</span>
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
                      const prog = bulkProgress[id] || { status: 'pending', message: UI_STRINGS.appAppProcurementVendorsPage.queued2 };
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
                                <Clock size={12} />{UI_STRINGS.appAppProcurementVendorsPage.queued}</span>
                            )}
                            {prog.status === 'running' && (
                              <span style={{ color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                <Loader2 size={12} className="animate-spin" />{UI_STRINGS.appAppProcurementVendorsPage.evaluating}</span>
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
                  <button type="button" className="btn btn-outline" onClick={handleCloseBulkModal}>{UI_STRINGS.common.cancel}</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleStartBulkEvaluation}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    <Sparkles size={14} />{UI_STRINGS.appAppProcurementVendorsPage.startEvaluation}{selectedVendorIds.length}{UI_STRINGS.common.copyc7zu6c}</button>
                </>
              )}

              {bulkEvaluating && (
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={14} className="animate-spin" />{UI_STRINGS.appAppProcurementVendorsPage.processingEvaluationsPleaseWait}</div>
              )}

              {bulkDone && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCloseBulkModal}
                  style={{ fontWeight: 700 }}
                >{UI_STRINGS.appAppProcurementVendorsPage.doneViewResults}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
