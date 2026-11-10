'use client';
// src/app/(app)/procurement/rfqs/new/page.tsx
// Exact Approved Five-Step Enterprise RFQ Creation Workflow
import { useEffect, useState, useMemo, useRef } from 'react';
import type { ApprovedBoqDetail, ApprovedBoqListResponse, ApprovedBoqSummary } from '@app-types/app/api/procurement/approved-boqs.types';
import type { RfqBaseline } from '@app-types/app/(app)/procurement/rfqs/new-page.types';
import { BOQ_LINE_DETAIL_PAGE_SIZE } from '@/lib/boq-line-pagination.constants';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Stepper, { StepItem } from '@/components/ui/Stepper';
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
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Star,
  Search,
  Check,
  X,
  ShieldCheck,
  Lock,
  Plus,
} from 'lucide-react';
import SpecificationCell from '@/components/ui/SpecificationCell';
import { useToast } from '@/components/ui/Toast';
import { STEP_THEMES } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { reportClientEvent, reportHandledClientFailure } from '@/lib/observability/client-reporter';
import { CLIENT_VENDOR_CATEGORIES_SHAPE_INVALID_EVENT } from '@/lib/observability/client-reporter.constants';



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
  const [selectedBoq, setSelectedBoq] = useState<RfqBaseline | null>(null);
  const [selectedBoqLoading, setSelectedBoqLoading] = useState(false);
  const selectedBoqRequestVersionRef = useRef(0);
  const [approvedBoqPage, setApprovedBoqPage] = useState(1);
  const [hasMoreApprovedBoqs, setHasMoreApprovedBoqs] = useState(false);
  const [loadingMoreApprovedBoqs, setLoadingMoreApprovedBoqs] = useState(false);
  const [loadingMoreBoqLines, setLoadingMoreBoqLines] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [rateCards, setRateCards] = useState<any[]>([]);

  // Sourced PR & Duplicate Detection State
  const [sourcePr, setSourcePr] = useState<any>(null);
  const [existingActiveRfq, setExistingActiveRfq] = useState<any>(null);

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
      title: UI_STRINGS.common.projectBOQ,
      description: UI_STRINGS.common.baselineVerification,
      primaryColor: STEP_THEMES[1].primary,
      lightBg: STEP_THEMES[1].lightBg,
      accentBorder: STEP_THEMES[1].accentBorder,
    },
    {
      number: 2,
      icon: <Package size={16} strokeWidth={2} />,
      title: UI_STRINGS.common.scopePackage,
      description: UI_STRINGS.common.packageLines,
      primaryColor: STEP_THEMES[2].primary,
      lightBg: STEP_THEMES[2].lightBg,
      accentBorder: STEP_THEMES[2].accentBorder,
    },
    {
      number: 3,
      icon: <Scale size={16} strokeWidth={2} />,
      title: UI_STRINGS.common.commercialTechnical,
      description: UI_STRINGS.common.conditionsSpecs,
      primaryColor: STEP_THEMES[3].primary,
      lightBg: STEP_THEMES[3].lightBg,
      accentBorder: STEP_THEMES[3].accentBorder,
    },
    {
      number: 4,
      icon: <Building2 size={16} strokeWidth={2} />,
      title: UI_STRINGS.common.vendorSelection,
      description: UI_STRINGS.common.inviteSuppliers,
      primaryColor: STEP_THEMES[4].primary,
      lightBg: STEP_THEMES[4].lightBg,
      accentBorder: STEP_THEMES[4].accentBorder,
    },
    {
      number: 5,
      icon: <Send size={16} strokeWidth={2} />,
      title: UI_STRINGS.common.reviewRelease,
      description: UI_STRINGS.common.validateLaunch,
      primaryColor: STEP_THEMES[5].primary,
      lightBg: STEP_THEMES[5].lightBg,
      accentBorder: STEP_THEMES[5].accentBorder,
    },
  ];

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchApprovedBoqDetails = async (boq: ApprovedBoqSummary): Promise<ApprovedBoqDetail> => {
    if (Array.isArray(boq.lines)) return boq as ApprovedBoqDetail;
    const query = new URLSearchParams({
      revisionId: boq.id,
      pageSize: '1',
      linePageSize: String(BOQ_LINE_DETAIL_PAGE_SIZE),
    });
    const res = await fetch(`/api/procurement/approved-boqs?${query.toString()}`);
    if (!res.ok) throw new Error(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
    const data = await res.json() as ApprovedBoqListResponse;
    const detailedBoq = data.approvedBoqs?.find((item) => item.id === boq.id);
    if (!detailedBoq || !Array.isArray(detailedBoq.lines)) {
      throw new Error(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
    }
    return detailedBoq as ApprovedBoqDetail;
  };

  const fetchInitialData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const fetchPromises: Promise<any>[] = [
        fetch(initialRevisionId
          ? `/api/procurement/approved-boqs?revisionId=${encodeURIComponent(initialRevisionId)}`
          : '/api/procurement/approved-boqs'),
        fetch('/api/procurement/vendors'),
        fetch('/api/procurement/rate-cards'),
      ];

      if (initialPrId) {
        fetchPromises.push(fetch(`/api/pr/${initialPrId}`));
        fetchPromises.push(fetch('/api/procurement/approved-prs'));
      }

      const results = await Promise.all(fetchPromises);
      const boqsData = await results[0].json();
      const vendorsData = await results[1].json();
      const rateCardsData = results[2]?.ok ? await results[2].json() : { rateCards: [] };

      let foundPr: any = null;

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

      }

      if (rateCardsData?.rateCards) {
        setRateCards(rateCardsData.rateCards);
      }

      // Check if creating directly from an Approved PR
      if (initialPrId) {
        if (!foundPr) {
          setErrorMsg(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.unableToLoadProcurementRequestPrIdNotFoundOrAccessRestricted, { prId: initialPrId }));
          setLoading(false);
          return;
        }

        if (!foundPr.lines || foundPr.lines.length === 0) {
          setErrorMsg(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.approvedPrPrNumberHasNoApprovedLineItemsAvailableForSourcing, { prNumber: foundPr.prNumber }));
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
          boqId: foundPr.boq?.id || foundPr.boqId || '',
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
          estimatedBenchmarkValue: totalBenchmark,
          totalBenchmarkAmount: totalBenchmark,
          rfqCount: foundPr.rfqs?.length || 0,
          categories: Array.from(new Set<string>(foundPr.lines.map((l: any) => l.category || 'General'))).map((cat) => ({
            category: cat,
            ...(() => {
              const categoryLines = foundPr.lines.filter((l: any) => (l.category || 'General') === cat);
              const categoryValue = categoryLines.reduce((acc: number, l: any) => acc + (l.estimatedValue || ((l.quantity || 0) * (l.estimatedRate || 0))), 0);
              return {
                lineCount: categoryLines.length,
                totalQty: categoryLines.reduce((acc: number, l: any) => acc + (l.quantity || 0), 0),
                estimatedValue: categoryValue,
                benchmarkSubtotal: categoryValue,
              };
            })(),
          })),
          lines: foundPr.lines.map((l: any, idx: number) => ({
            id: l.id,
            prLineId: l.id,
            boqLineId: l.boqLineId || l.id,
            lineNumber: l.lineNumber || String(idx + 1),
            description: l.itemDescription,
            specification: l.specification || 'Standard specification',
            category: l.category || 'General',
            uom: l.uom || 'NOS',
            quantity: l.quantity,
            benchmarkRate: l.estimatedRate || 0,
            benchmarkAmount: l.estimatedValue || l.quantity * (l.estimatedRate || 0),
          })),
        };

        setSelectedBoq(prBoq);
        setSelectedLineIds(prBoq.lines.map((l: any) => l.id));
        setRfqDetails((prev) => ({
          ...prev,
          title: interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.rFQForValue1PrNumber, { "value1": foundPr.title || foundPr.project?.name, "prNumber": foundPr.prNumber }),
          packageName: `${foundPr.lines[0]?.category || 'General'} Package`,
        }));
      } else if (boqsData.approvedBoqs && boqsData.approvedBoqs.length > 0) {
        setApprovedBoqs(boqsData.approvedBoqs);
        setApprovedBoqPage(boqsData.page || 1);
        setHasMoreApprovedBoqs(Boolean(boqsData.hasMore));
        const match = initialRevisionId
          ? boqsData.approvedBoqs.find((b: any) => b.id === initialRevisionId)
          : boqsData.approvedBoqs[0];

        const activeBoqSummary: ApprovedBoqSummary = match || boqsData.approvedBoqs[0];
        setSelectedBoqLoading(true);
        let activeBoq: any;
        try {
          activeBoq = await fetchApprovedBoqDetails(activeBoqSummary);
        } catch (error) {
          reportHandledClientFailure(error, {
            event: 'procurement.approved_boq_detail_load_failed', operation: 'load_initial_detail_lines',
            route: '/procurement/rfqs/new', revisionId: activeBoqSummary.id,
          });
          setErrorMsg(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
          return;
        } finally {
          setSelectedBoqLoading(false);
        }
        setSelectedBoq(activeBoq);
        setSelectedLineIds(activeBoq.lines.map((l: any) => l.id));
        setRfqDetails((prev) => ({
          ...prev,
          title: interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.rFQForProjectNameValue2Package, { "projectName": activeBoq.projectName, "value2": activeBoq.categories[0]?.category || 'Works' }),
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

  const handleSelectBoq = async (boq: ApprovedBoqSummary) => {
    const requestVersion = ++selectedBoqRequestVersionRef.current;
    setSelectedBoq({ ...boq, lines: [] });
    setSelectedLineIds([]);
    setSelectedBoqLoading(true);
    setRfqDetails((prev) => ({
      ...prev,
      title: interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.rFQForProjectNameValue2Package, { "projectName": boq.projectName, "value2": boq.categories[0]?.category || 'Works' }),
      packageName: `${boq.categories[0]?.category || 'Works'} Package`,
    }));
    try {
      const detailedBoq = await fetchApprovedBoqDetails(boq);
      if (requestVersion !== selectedBoqRequestVersionRef.current) return;
      setSelectedBoq(detailedBoq);
      setSelectedLineIds(detailedBoq.lines.map((line) => line.id));
    } catch (error) {
      if (requestVersion === selectedBoqRequestVersionRef.current) {
        reportHandledClientFailure(error, {
          event: 'procurement.approved_boq_selection_detail_load_failed', operation: 'load_selected_revision_details',
          route: '/procurement/rfqs/new', revisionId: boq.id,
        });
        setErrorMsg(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
      }
    } finally {
      if (requestVersion === selectedBoqRequestVersionRef.current) setSelectedBoqLoading(false);
    }
  };

  const loadMoreApprovedBoqs = async () => {
    if (loadingMoreApprovedBoqs || !hasMoreApprovedBoqs) return;
    setLoadingMoreApprovedBoqs(true);
    try {
      const nextPage = approvedBoqPage + 1;
      const res = await fetch(`/api/procurement/approved-boqs?page=${nextPage}&pageSize=50`);
      if (!res.ok) throw new Error(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
      const data = await res.json();
      setApprovedBoqs((current) => [...current, ...(data.approvedBoqs || [])]);
      setApprovedBoqPage(data.page || nextPage);
      setHasMoreApprovedBoqs(Boolean(data.hasMore));
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
    } finally {
      setLoadingMoreApprovedBoqs(false);
    }
  };

  const loadMoreApprovedBoqLines = async () => {
    if (loadingMoreBoqLines || !selectedBoq?.linePagination?.hasMore || !selectedBoq.linePagination.nextCursor) return;
    const revisionId = selectedBoq.id;
    const requestVersion = selectedBoqRequestVersionRef.current;
    const shouldSelectAdditionalLines = selectedBoq.lines.every((line) => selectedLineIds.includes(line.id));
    const query = new URLSearchParams({
      revisionId,
      pageSize: '1',
      linePageSize: String(BOQ_LINE_DETAIL_PAGE_SIZE),
      lineCursor: selectedBoq.linePagination.nextCursor,
    });
    setLoadingMoreBoqLines(true);
    try {
      const res = await fetch(`/api/procurement/approved-boqs?${query.toString()}`);
      if (!res.ok) throw new Error(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
      const data = await res.json() as ApprovedBoqListResponse;
      const nextPage = data.approvedBoqs?.find((item) => item.id === revisionId);
      const nextLines = nextPage?.lines;
      const nextPagination = nextPage?.linePagination;
      if (!nextPage || !Array.isArray(nextLines) || !nextPagination) {
        throw new Error(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
      }
      if (requestVersion !== selectedBoqRequestVersionRef.current) return;
      setSelectedBoq((current) => {
        if (current?.id !== revisionId || !current.linePagination) return current;
        return {
          ...current,
          lines: [...current.lines, ...nextLines],
          linePagination: {
            total: nextPagination.total ?? current.linePagination.total ?? current.totalLines,
            pageSize: nextPagination.pageSize,
            hasMore: nextPagination.hasMore,
            nextCursor: nextPagination.nextCursor,
          },
        };
      });
      if (shouldSelectAdditionalLines) {
        setSelectedLineIds((current) => Array.from(new Set([...current, ...nextLines.map((line) => line.id)])));
      }
    } catch (error) {
      if (requestVersion === selectedBoqRequestVersionRef.current) {
        reportHandledClientFailure(error, {
          event: 'procurement.approved_boq_detail_page_failed', operation: 'load_detail_lines',
          route: '/procurement/rfqs/new', revisionId,
        });
        setErrorMsg(UI_STRINGS.common.userMessages.failedToFetchApprovedBoqs);
      }
    } finally {
      if (requestVersion === selectedBoqRequestVersionRef.current) setLoadingMoreBoqLines(false);
    }
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

  const scopedLineCount = useMemo(() => {
    if (!selectedBoq) return 0;
    if (scopeType === 'ENTIRE_BOQ') return selectedBoq.totalLines ?? selectedBoq.lines.length;
    if (scopeType === 'CATEGORY') {
      return selectedBoq.categories.find((category) => category.category === selectedCategory)?.lineCount || 0;
    }
    return selectedLineIds.length;
  }, [selectedBoq, scopeType, selectedCategory, selectedLineIds]);

  const scopedBenchmarkValue = useMemo(() => {
    if (selectedBoq && scopeType === 'ENTIRE_BOQ') {
      return selectedBoq.estimatedBenchmarkValue ?? selectedBoq.totalBenchmarkAmount ?? 0;
    }
    if (selectedBoq && scopeType === 'CATEGORY') {
      const category = selectedBoq.categories.find((item) => item.category === selectedCategory);
      if (category) return category.estimatedValue ?? category.benchmarkSubtotal ?? 0;
    }
    return scopedLines.reduce((acc: number, l: any) => acc + (l.benchmarkAmount || 0), 0);
  }, [selectedBoq, scopeType, selectedCategory, scopedLines]);

  const totalQuantitySum = useMemo(() => {
    if (selectedBoq && scopeType === 'ENTIRE_BOQ' && selectedBoq.categories.some((item) => item.totalQty !== undefined)) {
      return selectedBoq.categories.reduce((total: number, item) => total + (item.totalQty || 0), 0);
    }
    if (selectedBoq && scopeType === 'CATEGORY') {
      const category = selectedBoq.categories.find((item) => item.category === selectedCategory);
      if (category?.totalQty !== undefined) return category.totalQty;
    }
    return scopedLines.reduce((acc: number, l: any) => acc + (l.quantity || 0), 0);
  }, [selectedBoq, scopeType, selectedCategory, scopedLines]);

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
      setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.step1SelectAndVerifyApprovedCommercialBaseline);
      return;
    }

    if (targetStep >= 3) {
      if (scopedLineCount === 0) {
        setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.step2AtLeastOneBoqLineItemMustBeIncludedInRfqScope);
        return;
      }
      if (!rfqDetails.title.trim()) {
        setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.step2RfqTitleIsRequired);
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
        setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.step4InviteAtLeastOneQualifiedVendorBeforeFinalReview);
        return;
      }
    }

    setErrorMsg('');
    setStep(targetStep);
  };

  const handleCreateRfq = async (action: 'SAVE_DRAFT' | 'RELEASE_RFQ') => {
    setErrorMsg('');
    if (existingActiveRfq) {
      setErrorMsg(interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.activeRfqRfqNumberAlreadyExistsForPrDuplicateSourcingPrevented, { rfqNumber: existingActiveRfq.rfqNumber }));
      return;
    }
    if (!selectedBoq) {
      setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.selectApprovedBoqBaselineInStep1);
      return;
    }
    if (scopedLineCount === 0) {
      setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.atLeastOneBoqLineMustBeIncludedInRfqScopeInStep2);
      return;
    }
    if (!rfqDetails.title.trim()) {
      setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.rfqTitleIsRequired);
      return;
    }
    if (timelineError) {
      setErrorMsg(timelineError);
      return;
    }
    if (action === 'RELEASE_RFQ' && selectedVendorIds.length === 0) {
      setErrorMsg(UI_STRINGS.appAppProcurementRfqsNewPage.inviteAtLeastOneVendorBeforeReleasingRfq);
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
        selectedLineIds: scopeType === 'SELECTED_LINES' ? selectedLineIds : [],
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
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToCreateRfq }));
      }

      toast.success(
        action === 'RELEASE_RFQ' ? UI_STRINGS.appAppProcurementRfqsIdPage.rFQIssuedSuccessfully : UI_STRINGS.common.userMessages.rfqDraftSavedSuccessfully,
        data.rfq.rfqNumber,
        action === 'RELEASE_RFQ' ? UI_STRINGS.common.userMessages.awaitingQuotations : UI_STRINGS.common.draft
      );

      router.push(`/procurement/rfqs/${data.rfq.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred);
      setShowConfirmRelease(false);
      toast.error({
        title: UI_STRINGS.appAppProcurementRfqsNewPage.rFQCreationFailed,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anUnexpectedErrorOccurredWhileSavingTheRfq }),
        recordNumber: sourcePr?.prNumber,
      });
    } finally {
      setSaving(false);
    }
  };

  const getVendorCategories = (categories: any): string[] => {
    if (Array.isArray(categories)) return categories;
    if (typeof categories === 'string' && categories.trim()) {
      const trimmedCategories = categories.trim();
      if (/^[\[{\"]/.test(trimmedCategories)) {
        try {
          const parsed = JSON.parse(trimmedCategories);
          if (Array.isArray(parsed)) return parsed;
          reportClientEvent('warn', CLIENT_VENDOR_CATEGORIES_SHAPE_INVALID_EVENT, {
            operation: 'parse_vendor_categories',
            route: '/procurement/rfqs/new',
            field: 'categories',
            fallback: 'comma_delimited_categories',
          });
        } catch (error: unknown) {
          reportHandledClientFailure(error, {
            operation: 'parse_vendor_categories',
            route: '/procurement/rfqs/new',
            field: 'categories',
            fallback: 'comma_delimited_categories',
          });
        }
      }
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
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#334155' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.initializingRFQControlWizard}</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.loadingApprovedCommercialBaselinesAndVendorRecords}</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* 1. Common Enterprise Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
          { label: UI_STRINGS.common.rFQs, href: '/procurement/rfqs' },
          { label: UI_STRINGS.appAppProcurementRfqsNewPage.createRFQ },
        ]}
        title={UI_STRINGS.appAppProcurementRfqsNewPage.createRequestForQuotation}
        description={UI_STRINGS.appAppProcurementRfqsNewPage.createAStructuredRFQFromAnApprovedBOQBaselineAndInviteEligibleVendorsForCompetitiveBidding}
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
              <Save size={14} />{UI_STRINGS.appAppProcurementRfqsNewPage.saveDraft}</button>
            <Link href="/procurement/rfqs" className="btn btn-secondary">{UI_STRINGS.common.cancel}</Link>
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
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.activeSourcingEventAlreadyExistsForThisPR}{existingActiveRfq.rfqNumber}{UI_STRINGS.common.copyc7zu6c}</div>
              <div style={{ fontSize: 13, color: '#b45309', marginTop: 3 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.procurementBusinessGovernanceProhibitsDuplicateActiveRFQsForTheSameApprovedPRTheExistingRFQIsCurrentlyIn}<strong>{existingActiveRfq.status}</strong>{UI_STRINGS.appAppProcurementRfqsNewPage.stage}</div>
            </div>
          </div>
          <Link
            href={`/procurement/rfqs/${existingActiveRfq.id}`}
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}
          >{UI_STRINGS.appAppProcurementRfqsNewPage.openActiveRFQ}{existingActiveRfq.rfqNumber}{UI_STRINGS.common.copydv17a2}</Link>
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
              >{UI_STRINGS.common.copyefwnq4}</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[1].textDark, margin: 0 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.pROJECTBOQBASELINEVERIFICATION}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#475569', margin: '6px 0 0 34px' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.selectAndVerifyTheImmutableClientApprovedCommercialBaselineToEstablishPackageBoundaries}</p>
          </div>

          <Card
            title={sourcePr ? interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.approvedPRBaselinePrNumber, { "prNumber": sourcePr.prNumber }) : UI_STRINGS.appAppProcurementRfqsNewPage.approvedCommercialBaselineSelection}
            subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.commercialBaselineParametersAreLockedToTheApprovedGovernanceRevision}
          >
            {!sourcePr && (
              <div style={{ marginBottom: 24 }}>
                <label className="form-label" htmlFor="boq-select">{UI_STRINGS.appAppProcurementRfqsNewPage.selectApprovedCommercialBaseline}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
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
                      {b.projectName}{UI_STRINGS.common.copy1b3t0c5}{b.projectCode}{UI_STRINGS.appAppProcurementRfqsNewPage.revision}{b.approvedRevisionCode}{UI_STRINGS.common.copy1b3t0c5}{b.totalLines}{UI_STRINGS.appAppProcurementRfqsNewPage.lines}</option>
                  ))}
                </select>
                {hasMoreApprovedBoqs && (
                  <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} disabled={loadingMoreApprovedBoqs} onClick={() => void loadMoreApprovedBoqs()}>
                    {loadingMoreApprovedBoqs ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
                  </button>
                )}
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.onlyClientApprovedGovernanceLockedBOQRevisionsCanBeSourcedByProcurement}</div>
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
                {selectedBoqLoading && <div role="status" style={{ marginBottom: 12, color: '#64748b' }}>{UI_STRINGS.common.loading}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h4 style={{ fontSize: 12, color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerificationSummary}</h4>
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
                  >{UI_STRINGS.appAppProcurementRfqsNewPage.baselineVerified}</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 20,
                  }}
                >
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.projectName}</div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4, color: '#0f172a' }}>
                      {selectedBoq.projectName}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.projectCode}</div>
                    <div className="font-mono" style={{ fontWeight: 600, fontSize: 14, marginTop: 4, color: '#1e40af' }}>
                      {selectedBoq.projectCode}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.location}</div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.location || UI_STRINGS.common.bengaluru}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.costCentre2}</div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.costCentre || UI_STRINGS.appAppProcurementRfqsNewPage.generalWorks}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.approvedRevision}</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="badge badge-approved" style={{ fontSize: 11, fontWeight: 700 }}>
                        {selectedBoq.approvedRevisionCode}{UI_STRINGS.appAppProcurementRfqsNewPage.iMMUTABLE}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.approvedDate}</div>
                    <div style={{ fontSize: 13, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.approvedAt ? new Date(selectedBoq.approvedAt).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.approvedBy}</div>
                    <div style={{ fontSize: 13, marginTop: 4, color: '#334155' }}>
                      {selectedBoq.approvedBy}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.baselineItemsValue}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: '#1e40af' }}>
                      {selectedBoq.totalLines}{UI_STRINGS.appAppProcurementRfqsNewPage.items}{selectedBoq.totalBenchmarkAmount?.toLocaleString()}
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
                <strong>{UI_STRINGS.appAppProcurementRfqsNewPage.immutableBaselineGovernance}</strong>{UI_STRINGS.appAppProcurementRfqsNewPage.inAccordanceWithEnterpriseProcurementPolicyAllItemDescriptionsApprovedQuantitiesUOMsAndBaselineRatesAreStrictlyImmutableProcurementRFQsPackageTheseLineItemsForCompetitiveMarketBiddingWithoutModifyingBaselineRecords}</div>
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
              >{UI_STRINGS.common.copyf9vgt1}</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[2].textDark, margin: 0 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.sCOPEPACKAGEDEFINITION}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#0f766e', margin: '6px 0 0 34px' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.defineRFQPackageTitleTargetTradeCompletionTimelineAndLineItemInclusionsFromTheApprovedBOQ}</p>
          </div>

          {/* Package Details Form */}
          <Card title={UI_STRINGS.appAppProcurementRfqsNewPage.packageMetadata} subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.officialBrandingAndCompletionTimelineForParticipatingVendors}>
            <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div>
                <label className="form-label" htmlFor="rfq-title">{UI_STRINGS.appAppProcurementRfqsNewPage.rFQTitle}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="rfq-title"
                  type="text"
                  className="input"
                  value={rfqDetails.title}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, title: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eGRFQForCivilFinishingInteriorFitoutPackage}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.officialTitleVisibleToParticipatingVendors}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="package-name">{UI_STRINGS.appAppProcurementRfqsNewPage.packageTrade}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="package-name"
                  type="text"
                  className="input"
                  value={rfqDetails.packageName}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, packageName: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eGInteriorFinishingJoinery}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.targetTradeCategoryForProcurementCategorization}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="expected-completion">{UI_STRINGS.appAppProcurementRfqsNewPage.expectedCompletionDate}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="expected-completion"
                  type="date"
                  className="input"
                  value={rfqDetails.expectedCompletionDate}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, expectedCompletionDate: e.target.value })}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.targetProjectMilestoneCompletionDate}</div>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.sourcingScopeMode}</div>
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
                >{UI_STRINGS.appAppProcurementRfqsNewPage.entireApprovedBOQ}{selectedBoq?.totalLines ?? selectedBoq?.lines.length}{UI_STRINGS.appAppProcurementRfqsNewPage.lines}</button>
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
                    if (selectedBoq && selectedBoq.categories.length > 0 && !selectedCategory) {
                      setSelectedCategory(selectedBoq.categories[0].category);
                    }
                  }}
                >{UI_STRINGS.appAppProcurementRfqsNewPage.byCategoryPackage}</button>
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
                >{UI_STRINGS.appAppProcurementRfqsNewPage.selectIndividualLines}{selectedLineIds.length}{UI_STRINGS.appAppProcurementRfqsNewPage.selected}</button>
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
                <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 600, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.scopedItems}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginLeft: 6 }}>
                  {scopedLineCount}{UI_STRINGS.common.copy3ml01c}{selectedBoq?.totalLines ?? selectedBoq?.lines.length}
                </span>
              </div>
              <div style={{ width: 1, height: 16, backgroundColor: '#99f6e4' }} />
              <div>
                <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 600, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.benchmarkBudget}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginLeft: 6 }}>{UI_STRINGS.common.copy1g8b5tg}{scopedBenchmarkValue.toLocaleString()}
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
              >{UI_STRINGS.common.selectAll}{selectedBoq?.lines.length}{UI_STRINGS.common.copyc7zu6c}</button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedLineIds([])}
              >{UI_STRINGS.appAppProcurementRfqsNewPage.deselectAll}</button>
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
                      {c.category}{UI_STRINGS.common.copy1b3t0c5}{c.lineCount}{UI_STRINGS.appAppProcurementRfqsNewPage.lines}</option>
                  ))}
                </select>
              )}
              <div style={{ position: 'relative', width: 260 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: 30, height: 34, fontSize: 12 }}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.filterItemsByDescription}
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* BOQ Line-Item Selection Table (Primary Dominant Component) */}
          <Card title={UI_STRINGS.appAppProcurementRfqsNewPage.approvedBOQLineItems} subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.quantitiesSpecificationsAndBaselineRatesAreImmutable} noPadding>
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%', minWidth: 1080 }}>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedBoq && selectedBoq.lines.length > 0 && selectedBoq.lines.every((line) => selectedLineIds.includes(line.id)))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLineIds((current) => Array.from(new Set([
                              ...current,
                              ...(selectedBoq?.lines.map((line) => line.id) || []),
                            ])));
                          } else {
                            const loadedLineIds = new Set(selectedBoq?.lines.map((line) => line.id) || []);
                            setSelectedLineIds((current) => current.filter((lineId) => !loadedLineIds.has(lineId)));
                          }
                        }}
                      />
                    </th>
                    <th style={{ width: 60 }}>{UI_STRINGS.common.sNo2}</th>
                    <th style={{ minWidth: 260 }}>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ minWidth: 160 }}>{UI_STRINGS.common.specification}</th>
                    <th style={{ width: 120 }}>{UI_STRINGS.common.category2}</th>
                    <th style={{ width: 70 }}>{UI_STRINGS.common.uOM}</th>
                    <th style={{ width: 110, textAlign: 'right' }}>{UI_STRINGS.common.quantityLocked}</th>
                    <th style={{ width: 120, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.baselineRate}</th>
                    <th style={{ width: 130, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.baselineAmount}</th>
                    <th style={{ width: 130, textAlign: 'center' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.includeInRFQ}</th>
                    <th style={{ minWidth: 160 }}>{UI_STRINGS.common.remarks}</th>
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
                          <td style={{ textAlign: 'right', fontSize: 13, color: '#334155' }}>{UI_STRINGS.common.copy1g8b5tg}{l.benchmarkRate?.toLocaleString()}
                          </td>
                          <td style={{ fontWeight: 700, textAlign: 'right', color: '#0f766e', fontSize: 13 }}>{UI_STRINGS.common.copy1g8b5tg}{l.benchmarkAmount?.toLocaleString()}
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
                              {isIncluded ? UI_STRINGS.appAppProcurementRfqsNewPage.included : UI_STRINGS.appAppProcurementRfqsNewPage.excluded}
                            </button>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="input"
                              style={{ height: 28, fontSize: 11, padding: '2px 8px' }}
                              placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.optionalLineNote}
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
            {selectedBoq?.linePagination?.hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={loadMoreApprovedBoqLines}
                  disabled={loadingMoreBoqLines}
                >
                  {loadingMoreBoqLines ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
                </button>
              </div>
            )}
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
              >{UI_STRINGS.common.copyezvv42}</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[3].textDark, margin: 0 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.cOMMERCIALTECHNICALCONDITIONS}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#7e22ce', margin: '6px 0 0 34px' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.establishBindingContractualConditionsCommercialMilestoneDeadlinesWarrantiesAndTechnicalComplianceCriteria}</p>
          </div>

          {/* Section 1: Commercial Terms & Milestones */}
          <Card title={UI_STRINGS.appAppProcurementRfqsNewPage.commercialTermsMilestones} subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.standardizedContractualConditionsForVendorQuoteSubmissions}>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label className="form-label" htmlFor="sub-deadline">{UI_STRINGS.common.submissionDeadline}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
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
                  <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.finalTimestampForQuoteReceiptSealedBiddingApplies}</div>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="clar-deadline">{UI_STRINGS.appAppProcurementRfqsNewPage.clarificationDeadline}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="clar-deadline"
                  type="date"
                  className="input"
                  value={rfqDetails.clarificationDeadline}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, clarificationDeadline: e.target.value })}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.cutOffDateForVendorTechnicalPreBidQueries}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="validity-days">{UI_STRINGS.appAppProcurementRfqsNewPage.commercialValidityDays}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
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
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.numberOfCalendarDaysQuotationsMustRemainBinding}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="payment-terms">{UI_STRINGS.common.paymentTerms}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="payment-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.paymentTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, paymentTerms: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eG30DaysNetFromCertifiedProgressiveInvoice}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.invoiceCertificationAndPaymentDisbursementCycle}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="delivery-requirement">{UI_STRINGS.appAppProcurementRfqsNewPage.deliveryScheduleRequirement}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="delivery-requirement"
                  type="text"
                  className="input"
                  value={rfqDetails.deliveryRequirement}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, deliveryRequirement: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eGSiteDeliveryWithin45DaysFromWorkOrder}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.mandatoryProjectMilestoneDeliveryTimeline}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="tax-terms">{UI_STRINGS.appAppProcurementRfqsNewPage.taxesAndGST}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="tax-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.taxTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, taxTerms: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eGGST18ExtraAsApplicable}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.statutoryDutiesGSTAndCessTreatment}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="delivery-terms">{UI_STRINGS.appAppProcurementRfqsNewPage.freightInsuranceIncoterms}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="delivery-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.deliveryTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, deliveryTerms: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eGFORDestinationFreightTransitInsuranceIncluded}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.logisticsFreightResponsibilityAndTransitInsurance}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="warranty-terms">{UI_STRINGS.appAppProcurementRfqsNewPage.warrantyDefectLiability}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  id="warranty-terms"
                  type="text"
                  className="input"
                  value={rfqDetails.warrantyTerms}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, warrantyTerms: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eG12MonthsDLPFromSiteHandover}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.postHandoverDefectLiabilityOrManufacturerWarranty}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="performance-security">{UI_STRINGS.appAppProcurementRfqsNewPage.performanceSecurity}</label>
                <input
                  id="performance-security"
                  type="text"
                  className="input"
                  value={rfqDetails.performanceSecurity}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, performanceSecurity: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eG5PBGUponAward}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.securityDepositOrPerformanceBankGuaranteeClause}</div>
              </div>

              <div>
                <label className="form-label" htmlFor="liquidated-damages">{UI_STRINGS.appAppProcurementRfqsNewPage.liquidatedDamages}</label>
                <input
                  id="liquidated-damages"
                  type="text"
                  className="input"
                  value={rfqDetails.liquidatedDamages}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, liquidatedDamages: e.target.value })}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.eG05PerWeekOfDelayUpToMax5}
                />
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.contractualDelayPenaltySchedule}</div>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label" htmlFor="price-basis">{UI_STRINGS.appAppProcurementRfqsNewPage.priceBasis}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <select
                  id="price-basis"
                  className="select"
                  value={rfqDetails.priceBasis}
                  onChange={(e) => setRfqDetails({ ...rfqDetails, priceBasis: e.target.value })}
                >
                  <option value="Firm & Fixed — No escalation allowed">{UI_STRINGS.appAppProcurementRfqsNewPage.firmFixedNoEscalationAllowed}</option>
                  <option value="Variable with Material Index escalation">{UI_STRINGS.appAppProcurementRfqsNewPage.variableWithMaterialIndexEscalation}</option>
                  <option value="Unit Rate Re-measureable based on actual site install">{UI_STRINGS.appAppProcurementRfqsNewPage.unitRateReMeasureableBasedOnActualSiteInstall}</option>
                </select>
                <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.contractPriceAdjustmentPolicy}</div>
              </div>
            </div>
          </Card>

          {/* Section 2: Technical Specifications & Compliance */}
          <Card title={UI_STRINGS.appAppProcurementRfqsNewPage.technicalSpecificationsStandards} subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.mandatoryEngineeringParametersAndTechnicalComplianceCriteria}>
            <div>
              <label className="form-label" htmlFor="tech-req">{UI_STRINGS.appAppProcurementRfqsNewPage.technicalSpecificationsComplianceCriteria}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
              </label>
              <textarea
                id="tech-req"
                className="textarea"
                rows={4}
                value={rfqDetails.technicalRequirements}
                onChange={(e) => setRfqDetails({ ...rfqDetails, technicalRequirements: e.target.value })}
              />
              <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.specifyEngineeringStandardsApprovedBrandsTolerancesTestingCertificatesAndComplianceStatements}</div>
            </div>
          </Card>

          {/* Section 3: Mandatory Compliance Documents */}
          <Card title={UI_STRINGS.appAppProcurementRfqsNewPage.mandatoryComplianceDocumentsAttachments} subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.documentsRequiredFromVendorsDuringQuotationSubmission}>
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
                placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.addDocumentRequirementEGISOCertificate}
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
                <Plus size={14} style={{ marginRight: 4 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.add}</button>
            </div>
          </Card>

          {/* Section 4: Commercial Inclusions & Exclusions */}
          <Card title={UI_STRINGS.appAppProcurementRfqsNewPage.commercialConditionsInclusionsExclusions} subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.commercialScheduleTaxBreakdownAndGeneralContractualTerms}>
            <div>
              <label className="form-label" htmlFor="comm-req">{UI_STRINGS.appAppProcurementRfqsNewPage.commercialRequirementsGeneralTerms}<span className="required">{UI_STRINGS.common.copyd1yn99}</span>
              </label>
              <textarea
                id="comm-req"
                className="textarea"
                rows={4}
                value={rfqDetails.commercialRequirements}
                onChange={(e) => setRfqDetails({ ...rfqDetails, commercialRequirements: e.target.value })}
              />
              <div className="form-helper">{UI_STRINGS.appAppProcurementRfqsNewPage.specifyInclusionsExclusionsTaxesFreightUnloadingSiteStorageAndGeneralContractualObligations}</div>
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
              >{UI_STRINGS.common.copydlxun7}</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[4].textDark, margin: 0 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.vENDORSELECTIONINVITATION}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#b45309', margin: '6px 0 0 34px' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.filterAndInviteQualifiedEmpanelledSuppliersAndEligibleRateCardVendorsForCompetitiveTenderParticipation}</p>
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
                >{UI_STRINGS.appAppProcurementRfqsNewPage.allEligibleVendors}{vendors.length}{UI_STRINGS.common.copyc7zu6c}</button>
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
                >{UI_STRINGS.appAppProcurementRfqsNewPage.rateCardVendors}{applicableRateCards.length}{UI_STRINGS.common.copyc7zu6c}</button>
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
                >{UI_STRINGS.appAppProcurementRfqsNewPage.previouslyWorkedWith}</button>
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
                <span>{UI_STRINGS.appAppProcurementRfqsNewPage.copy2bnsw}</span> {selectedVendorIds.length}{UI_STRINGS.appAppProcurementRfqsNewPage.vendorsInvited}</div>
            </div>

            {/* Filter Dropdowns Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: 30, height: 34, fontSize: 12 }}
                  placeholder={UI_STRINGS.appAppProcurementRfqsNewPage.searchNameCodeContact}
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
                <option value="">{UI_STRINGS.appAppProcurementRfqsNewPage.allRegionsStates}</option>
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
                <option value="">{UI_STRINGS.appAppProcurementRfqsNewPage.allCities}</option>
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
                <option value="">{UI_STRINGS.common.allCategories}</option>
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
                <option value="ALL">{UI_STRINGS.appAppProcurementRfqsNewPage.allVendorTypes}</option>
                <option value="CLIENT_VENDOR">{UI_STRINGS.appAppProcurementRfqsNewPage.clientEmpanelled}</option>
                <option value="PROCUCEV_VENDOR">{UI_STRINGS.appAppProcurementRfqsNewPage.proCPXNetwork}</option>
              </select>
            </div>

            {/* Action Bar & Quick Selection */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rateCardOnly}
                  onChange={(e) => setRateCardOnly(e.target.checked)}
                />{UI_STRINGS.appAppProcurementRfqsNewPage.showOnlyRateCardVendors}</label>

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
                >{UI_STRINGS.appAppProcurementRfqsNewPage.selectAllCompliant}{filteredVendors.filter((v: any) => v.complianceStatus === 'COMPLIANT').length}{UI_STRINGS.common.copyc7zu6c}</button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedVendorIds([])}
                >{UI_STRINGS.common.clearSelection}</button>
              </div>
            </div>
          </div>

          {/* Main Eligible Vendors Table */}
          <Card title={UI_STRINGS.appAppProcurementRfqsNewPage.eligibleSuppliers} subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.suppliersQualifiedUnderCategoryRegionalAndComplianceGovernance} noPadding>
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%', minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.invite}</th>
                    <th style={{ width: 50 }}>{UI_STRINGS.common.copyak280i}</th>
                    <th style={{ minWidth: 200 }}>{UI_STRINGS.common.vendorName}</th>
                    <th style={{ width: 130 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.regionCity}</th>
                    <th style={{ minWidth: 160 }}>{UI_STRINGS.common.categories}</th>
                    <th style={{ width: 120 }}>{UI_STRINGS.common.qualification}</th>
                    <th style={{ width: 130 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.rateCardStatus}</th>
                    <th style={{ width: 90, textAlign: 'center' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.rating2}</th>
                    <th style={{ width: 140 }}>{UI_STRINGS.common.contactPerson}</th>
                    <th style={{ width: 120, textAlign: 'center' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.invitationStatus}</th>
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
                            {v.vendorCode || v.code}{UI_STRINGS.common.copyko5tj9}{v.email || UI_STRINGS.appAppProcurementRfqsNewPage.portalVendorCom}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#334155' }}>
                          {v.city ? interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.cityValue2, { "city": v.city, "value2": v.state || 'IN' }) : v.state || UI_STRINGS.common.india}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {cats.slice(0, 2).map((c: string) => (
                              <span key={c} className="badge badge-draft" style={{ fontSize: 10 }}>
                                {c}
                              </span>
                            ))}
                            {cats.length > 2 && (
                              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.copycrz1ka}{cats.length - 2}
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
                            {v.qualificationStatus || v.complianceStatus || UI_STRINGS.common.qUALIFIED}
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
                            >{UI_STRINGS.appAppProcurementRfqsNewPage.active1}</span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.common.none}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#d97706', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Star size={12} fill="#d97706" color="#d97706" />
                            {v.performanceScore || v.rating || UI_STRINGS.appAppProcurementRfqsNewPage.copy1cbbq8t}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#475569' }}>
                          <div>{v.contactPerson || UI_STRINGS.appAppProcurementRfqsNewPage.commercialHead}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{v.phone || UI_STRINGS.appAppProcurementRfqsNewPage.copy196hfsz}</div>
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
                            {isSelected ? UI_STRINGS.appAppProcurementRfqsNewPage.iNVITED : UI_STRINGS.appAppProcurementRfqsNewPage.nOTINVITED}
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
            title={UI_STRINGS.appAppProcurementRfqsNewPage.eligibleRateCardVendors}
            subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.vendorsHoldingApprovedActiveMasterRateAgreementsApplicableToThisScope}
            noPadding
          >
            {applicableRateCards.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.noActiveRateCardsAreCurrentlyRegisteredForThisPackageCategory}</div>
            ) : (
              <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                <table className="table enterprise-table" style={{ width: '100%', minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th>{UI_STRINGS.common.vendorName}</th>
                      <th>{UI_STRINGS.common.rateCardReference}</th>
                      <th>{UI_STRINGS.common.category2}</th>
                      <th>{UI_STRINGS.common.validFrom}</th>
                      <th>{UI_STRINGS.common.validTo}</th>
                      <th>{UI_STRINGS.common.status}</th>
                      <th style={{ textAlign: 'center' }}>{UI_STRINGS.common.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicableRateCards.map((rc: any) => {
                      const isInvited = selectedVendorIds.includes(rc.vendorId);

                      return (
                        <tr key={rc.id}>
                          <td style={{ fontWeight: 600, color: '#0f172a' }}>
                            {rc.vendor?.name || UI_STRINGS.appAppProcurementRfqsNewPage.approvedSupplier}
                          </td>
                          <td className="font-mono text-muted">{rc.rateCardNumber || UI_STRINGS.appAppProcurementRfqsNewPage.vRC2026000001}</td>
                          <td>
                            <span className="badge badge-draft">{rc.category}</span>
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {rc.validFrom ? new Date(rc.validFrom).toLocaleDateString() : UI_STRINGS.appAppProcurementRfqsNewPage.copy1tgk5l3}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {rc.validTo ? new Date(rc.validTo).toLocaleDateString() : UI_STRINGS.appAppProcurementRfqsNewPage.copyoxltlk}
                          </td>
                          <td>
                            <span className="badge badge-approved">{UI_STRINGS.common.aPPROVED}</span>
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
                              {isInvited ? UI_STRINGS.common.invited : UI_STRINGS.appAppProcurementRfqsNewPage.inviteVendor}
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
              <span>{UI_STRINGS.appAppProcurementRfqsNewPage.pleaseInviteAtLeast1QualifiedSupplierAMinimumOf3VendorsIsRecommendedToGuaranteeCompetitivePriceDiscovery}</span>
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
              >{UI_STRINGS.common.copydby8y8}</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: STEP_THEMES[5].textDark, margin: 0 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.fINALREVIEWRELEASETOMARKET}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#047857', margin: '6px 0 0 34px' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.performPreReleaseValidationAndPublishTheCompetitiveRFQPackageToInvitedVendors}</p>
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
              <div className="kpi-label">{UI_STRINGS.appAppProcurementRfqsNewPage.scopedBOQLines}</div>
              <div className="kpi-value">{scopedLineCount}{UI_STRINGS.common.items}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">{UI_STRINGS.appAppProcurementRfqsNewPage.totalQuantity}</div>
              <div className="kpi-value">{totalQuantitySum.toLocaleString()}{UI_STRINGS.appAppProcurementRfqsNewPage.units}</div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `4px solid ${STEP_THEMES[5].primary}` }}>
              <div className="kpi-label">{UI_STRINGS.appAppProcurementRfqsNewPage.benchmarkBudgetLocked}</div>
              <div className="kpi-value" style={{ color: STEP_THEMES[5].primary }}>{UI_STRINGS.common.copy1g8b5tg}{scopedBenchmarkValue.toLocaleString()}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">{UI_STRINGS.appAppProcurementRfqsNewPage.invitedVendors}</div>
              <div className="kpi-value">{selectedVendorIds.length}{UI_STRINGS.appAppProcurementRfqsNewPage.suppliers}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">{UI_STRINGS.common.submissionDeadline}</div>
              <div className="kpi-value font-mono" style={{ fontSize: 15 }}>
                {rfqDetails.submissionDeadline}
              </div>
            </div>
          </div>

          {/* Review Panel 1: Project & BOQ Baseline */}
          <Card
            title={UI_STRINGS.appAppProcurementRfqsNewPage.projectCommercialBaseline}
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>
                <Pencil size={12} style={{ marginRight: 4 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.editStep1}</button>
            }
          >
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.project}</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                  {selectedBoq?.projectName}{UI_STRINGS.common.copy1b3t0c5}{selectedBoq?.projectCode}{UI_STRINGS.common.copyc7zu6c}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.locationCostCentre}</div>
                <div style={{ fontWeight: 500, fontSize: 14, marginTop: 2 }}>
                  {selectedBoq?.location || UI_STRINGS.common.bengaluru}{UI_STRINGS.common.copyko5tj9}{selectedBoq?.costCentre || UI_STRINGS.appAppProcurementRfqsNewPage.generalWorks}
                </div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.approvedRevision}</div>
                <div style={{ marginTop: 2 }}>
                  <span className="badge badge-approved">{selectedBoq?.approvedRevisionCode}{UI_STRINGS.appAppProcurementRfqsNewPage.iMMUTABLE}</span>
                </div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.approvedDateApprover}</div>
                <div style={{ fontSize: 13, marginTop: 2, color: '#334155' }}>
                  {selectedBoq?.approvedAt ? new Date(selectedBoq.approvedAt).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}{UI_STRINGS.common.by}{selectedBoq?.approvedBy}
                </div>
              </div>
            </div>
          </Card>

          {/* Review Panel 2: Scope & Package Overview */}
          <Card
            title={UI_STRINGS.appAppProcurementRfqsNewPage.packageScopeLineItems}
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>
                <Pencil size={12} style={{ marginRight: 4 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.editStep2}</button>
            }
          >
            <div style={{ marginBottom: 16 }}>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.rFQTitle}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginTop: 2 }}>{rfqDetails.title}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.packageTrade}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', marginTop: 2 }}>{rfqDetails.packageName}</div>
                </div>
              </div>
            </div>

            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="table enterprise-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                    <th>{UI_STRINGS.common.itemDescription}</th>
                    <th>{UI_STRINGS.common.category2}</th>
                    <th>{UI_STRINGS.common.uOM}</th>
                    <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                    <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.baselineRate}</th>
                    <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.baselineAmount}</th>
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
                      <td style={{ textAlign: 'right' }}>{UI_STRINGS.common.copytfdhmk}{l.benchmarkRate?.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>{UI_STRINGS.common.copy1g8b5tg}{l.benchmarkAmount?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {scopedLineCount > Math.min(scopedLines.length, 5) && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: '8px 0' }}>{UI_STRINGS.common.copycrz1ka}{scopedLineCount - Math.min(scopedLines.length, 5)}{UI_STRINGS.appAppProcurementRfqsNewPage.moreItemsIncludedInPackage}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Review Panel 3: Commercial Terms & Milestones */}
          <Card
            title={UI_STRINGS.appAppProcurementRfqsNewPage.commercialTechnicalTerms}
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(3)}>
                <Pencil size={12} style={{ marginRight: 4 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.editStep3}</button>
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
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.submissionDeadline}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{rfqDetails.submissionDeadline}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.clarificationDeadline}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{rfqDetails.clarificationDeadline}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.commercialValidity}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{rfqDetails.commercialValidityDays}{UI_STRINGS.common.days}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.common.paymentTerms}</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{rfqDetails.paymentTerms}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.taxTerms}</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{rfqDetails.taxTerms}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{UI_STRINGS.appAppProcurementRfqsNewPage.deliveryIncoterms}</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{rfqDetails.deliveryTerms}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
              <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.mandatoryVendorDocuments}</div>
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
            title={UI_STRINGS.appAppProcurementRfqsNewPage.invitedVendors}
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(4)}>
                <Pencil size={12} style={{ marginRight: 4 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.editStep4}</button>
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
                      {v?.vendorCode || v?.code}{UI_STRINGS.appAppProcurementRfqsNewPage.rating}{v?.performanceScore || UI_STRINGS.appAppProcurementRfqsNewPage.copy1cbbq8t}
                      {hasRc && <span style={{ marginLeft: 6, color: '#059669', fontWeight: 700 }}>{UI_STRINGS.appAppProcurementRfqsNewPage.rateCard}</span>}
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
              <ShieldCheck size={18} color="#166534" />{UI_STRINGS.appAppProcurementRfqsNewPage.preReleaseGovernanceComplianceVerification}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, fontSize: 13, color: '#14532d' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" />{UI_STRINGS.appAppProcurementRfqsNewPage.baselineBOQVerifiedImmutable}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" />{UI_STRINGS.appAppProcurementRfqsNewPage.sourcingScopeDefined}{scopedLineCount}{UI_STRINGS.appAppProcurementRfqsNewPage.lineItems}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" />{UI_STRINGS.appAppProcurementRfqsNewPage.commercialTermsTimelinesValidated}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#16a34a" />{UI_STRINGS.appAppProcurementRfqsNewPage.qualifiedSuppliersInvited}{selectedVendorIds.length}{UI_STRINGS.appAppProcurementRfqsNewPage.vendors}</div>
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
              <ArrowLeft size={14} style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.backToStep}{step - 1}
            </button>
          ) : (
            <Link href="/procurement/rfqs" className="btn btn-secondary">{UI_STRINGS.appAppProcurementRfqsNewPage.cancelRFQ}</Link>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleCreateRfq('SAVE_DRAFT')}
            disabled={saving || Boolean(existingActiveRfq)}
            title={existingActiveRfq ? UI_STRINGS.appAppProcurementRfqsNewPage.duplicateRFQCreationIsBlockedAnActiveRFQAlreadyExistsForThisPR : undefined}
          >
            <Save size={14} style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.saveDraft}</button>

          {step < 5 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleStepNavigation(step + 1)}
              disabled={step === 2 && scopedLineCount === 0}
              style={{
                backgroundColor: activeTheme.primary,
                borderColor: activeTheme.primary,
              }}
            >{interpolateUiString(UI_STRINGS.appAppProcurementRfqsNewPage.continueToStep, { step: step + 1 })} <ArrowRight size={14} style={{ marginLeft: 6 }} />
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
              title={existingActiveRfq ? UI_STRINGS.appAppProcurementRfqsNewPage.duplicateRFQCreationIsBlockedAnActiveRFQAlreadyExistsForThisPR : undefined}
            >
              <Send size={14} style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementRfqsNewPage.releaseRFQToVendors}{selectedVendorIds.length}{UI_STRINGS.common.copyc7zu6c}</button>
          )}
        </div>
      </div>

      {/* 5. Confirmation Release Modal */}
      <Modal
        isOpen={showConfirmRelease}
        onClose={() => setShowConfirmRelease(false)}
        title={UI_STRINGS.appAppProcurementRfqsNewPage.confirmRFQReleaseToMarket}
        subtitle={UI_STRINGS.appAppProcurementRfqsNewPage.finalVerificationBeforePublishingCompetitiveBiddingPackage}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowConfirmRelease(false)}
              disabled={saving}
            >{UI_STRINGS.common.backToReview}</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleCreateRfq('RELEASE_RFQ')}
              disabled={saving}
              style={{ background: STEP_THEMES[5].primary, borderColor: STEP_THEMES[5].primary }}
            >
              {saving ? UI_STRINGS.appAppProcurementRfqsNewPage.releasingRFQ : UI_STRINGS.appAppProcurementRfqsNewPage.confirmReleaseRFQ}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
          <p>{UI_STRINGS.appAppProcurementRfqsNewPage.youAreAboutToPublishAndRelease}<strong>{rfqDetails.title}</strong>{UI_STRINGS.common.to}{' '}
            <strong>{selectedVendorIds.length}{UI_STRINGS.appAppProcurementRfqsNewPage.invitedVendorS}</strong>{UI_STRINGS.common.copyby08hd}</p>
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
            <span>{UI_STRINGS.appAppProcurementRfqsNewPage.participatingVendorsWillReceiveSecurePortalLinksToViewLockedBaselineSpecificationsAndSubmitCompetitiveItemRateQuotations}</span>
          </div>
          <ul style={{ paddingLeft: 20, margin: 0, fontSize: 13, color: '#64748b' }}>
            <li>{UI_STRINGS.appAppProcurementRfqsNewPage.baselineBenchmarkBudget}{scopedBenchmarkValue.toLocaleString()}</li>
            <li>{UI_STRINGS.appAppProcurementRfqsNewPage.packageLineItems}{scopedLineCount}{UI_STRINGS.common.items}</li>
            <li>{UI_STRINGS.appAppProcurementRfqsNewPage.submissionDeadline}{rfqDetails.submissionDeadline}</li>
            <li>{UI_STRINGS.appAppProcurementRfqsNewPage.commercialValidity}{rfqDetails.commercialValidityDays}{UI_STRINGS.common.days}</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
