'use client';
// src/app/(app)/procurement/vendors/[id]/page.tsx
// Corporate Vendor Profile — Enterprise Procucev Design System
// Overview | Evaluation (6 Rubrics) | PPO Performance | Documents & Audit
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import VendorSourcingDashboard from '@/components/VendorSourcingDashboard';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import {
  ArrowLeft,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileText,
  Star,
  Sparkles,
  ExternalLink,
  Edit3,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Globe,
  Award,
  Layers,
  UserCheck,
  Check,
  AlertCircle,
  Info,
  FileCheck2,
  Save,
  X,
  RotateCcw,
  Eye,
  Send,
  CheckSquare,
  MessageSquare,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { VendorData, PerformanceSummary } from "@app-types/app/(app)/procurement/vendors/[id]/page.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



function VendorProfileContent() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vendorId = params.id as string;
  const tabParam = searchParams.get('tab');
  const resolveTab = (param: string | null): 'overview' | 'evaluation' | 'performance' | 'documents' | 'sourcing-dashboard' => {
    if (!param) return 'overview';
    if (param === 'ppo-performance' || param === 'performance') return 'performance';
    if (param === 'sourcing' || param === 'sourcing-orders' || param === 'sourcing-dashboard') return 'sourcing-dashboard';
    if (param === 'evaluation' || param === 'evaluation-ai') return 'evaluation';
    if (param === 'documents' || param === 'audit') return 'documents';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'evaluation' | 'performance' | 'documents' | 'sourcing-dashboard'>(
    resolveTab(tabParam)
  );

  useEffect(() => {
    const currentParam = searchParams.get('tab');
    if (currentParam) {
      setActiveTab(resolveTab(currentParam));
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'overview' | 'evaluation' | 'performance' | 'documents' | 'sourcing-dashboard') => {
    setActiveTab(tab);
    router.replace(`/procurement/vendors/${vendorId}?tab=${tab}`, { scroll: false });
  };
  const [vendor, setVendor] = useState<VendorData | null>(null);
  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummary | null>(null);
  const [eligiblePpos, setEligiblePpos] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Evaluation State
  const [aiEvaluating, setAiEvaluating] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);

  // Category Manager Qualification Decision Form State
  const [rubricScores, setRubricScores] = useState({
    businessProfile: 70,
    financialStrength: 65,
    previousClients: 70,
    references: 65,
    technicalCapability: 75,
    complianceRisk: 70,
  });
  const [selectedQualificationStatus, setSelectedQualificationStatus] = useState<string>('QUALIFIED');
  const [selectedQualificationOutcome, setSelectedQualificationOutcome] = useState<string>('RECOMMENDED');
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [submittingEvaluation, setSubmittingEvaluation] = useState(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState<string | null>(null);

  // Rate PPO Form State
  const [showRateModal, setShowRateModal] = useState(false);
  const [selectedPpoId, setSelectedPpoId] = useState<string>('');
  const [ppoRatingForm, setPpoRatingForm] = useState({
    qualityScore: 4,
    deliveryScore: 4,
    commercialComplianceScore: 4,
    responsivenessScore: 4,
    documentationClosureScore: 4,
    qualityComments: '',
    deliveryComments: '',
    commercialComments: '',
    documentationComments: '',
    responsivenessComments: '',
    overallImprovement: '',
    comments: '',
    supportingEvidence: '',
  });
  const [editingRating, setEditingRating] = useState<any>(null);
  const [submittingPpoRating, setSubmittingPpoRating] = useState(false);
  const [ppoRatingFeedback, setPpoRatingFeedback] = useState<string | null>(null);

  // Assessment Detail & Approver Review Modal State
  const [viewRatingModal, setViewRatingModal] = useState<any>(null);
  const [approverComments, setApproverComments] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  // Edit basic modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchVendorProfile();
  }, [vendorId]);

  async function fetchVendorProfile() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/procurement/vendors/${vendorId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToLoadVendorProfile }));
      }
      const v = data.vendor || data.data?.vendor;
      setVendor(v);
      setPerformanceSummary(data.performanceSummary || data.data?.performanceSummary || null);
      setEligiblePpos(data.eligiblePposToRate || data.data?.eligiblePposToRate || []);
      setAuditLogs(data.auditLogs || data.data?.auditLogs || []);

      try {
        const authRes = await fetch('/api/auth/me');
        if (authRes.ok) {
          const authData = await authRes.json();
          const role = authData.user?.role || authData.data?.user?.role || '';
          setCurrentUserRole(role);
        }
      } catch (e) {
        console.error('Failed to get auth role', e);
      }

      if (v) {
        setEditForm({
          name: v.name || '',
          contactPerson: v.contactPerson || '',
          email: v.email || '',
          phone: v.phone || '',
          categories: v.categories || '',
          operatingLocation: v.operatingLocation || '',
          legalStructure: v.legalStructure || 'Private Limited',
          gstin: v.gstin || '',
          pan: v.pan || '',
          website: v.website || '',
          address: v.address || '',
          experienceYears: v.experienceYears || '',
          turnoverCrores: v.turnoverCrores || '',
          capabilities: v.capabilities || '',
          serviceCoverage: v.serviceCoverage || '',
          clientReferences: v.clientReferences || '',
          certifications: v.certifications || '',
        });

        if (v.evaluations && v.evaluations.length > 0) {
          const latest = v.evaluations[0];
          setRubricScores({
            businessProfile: latest.businessProfileScore ?? 70,
            financialStrength: latest.financialStrengthScore ?? 65,
            previousClients: latest.previousClientsScore ?? 70,
            references: latest.referencesScore ?? 65,
            technicalCapability: latest.technicalCapabilityScore ?? 75,
            complianceRisk: latest.complianceRiskScore ?? 70,
          });
          if (latest.status) setSelectedQualificationStatus(latest.status);
          if (latest.qualificationOutcome) setSelectedQualificationOutcome(latest.qualificationOutcome);
          if (latest.decisionRemarks) setDecisionRemarks(latest.decisionRemarks);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Calculate live weighted score from rubric scores
  const calculatedOverallScore = Math.round(
    (rubricScores.businessProfile * 0.15) +
    (rubricScores.financialStrength * 0.20) +
    (rubricScores.previousClients * 0.20) +
    (rubricScores.references * 0.15) +
    (rubricScores.technicalCapability * 0.20) +
    (rubricScores.complianceRisk * 0.10)
  );

  async function handleRunAiEvaluation() {
    try {
      setAiEvaluating(true);
      setEvaluationFeedback(null);
      const res = await fetch(`/api/procurement/vendors/${vendorId}/evaluate-ai`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.aiEvaluationFailed }));
      }

      const evalReport = data.report || data.aiEvaluation || data.data?.aiEvaluation;
      setAiResult(evalReport);

      const aiScores = evalReport?.criteria || evalReport?.rubricScores;
      if (aiScores) {
        setRubricScores({
          businessProfile: aiScores.businessProfile?.suggestedScore ?? aiScores.businessProfile?.score ?? 60,
          financialStrength: aiScores.financialStrength?.suggestedScore ?? aiScores.financialStrength?.score ?? 60,
          previousClients: aiScores.previousClients?.suggestedScore ?? aiScores.previousClients?.score ?? 60,
          references: aiScores.references?.suggestedScore ?? aiScores.references?.score ?? 60,
          technicalCapability: aiScores.technicalCapability?.suggestedScore ?? aiScores.technicalCapability?.score ?? 60,
          complianceRisk: aiScores.complianceRisk?.suggestedScore ?? aiScores.complianceRisk?.score ?? 60,
        });
      }
      if (evalReport?.qualificationOutcome) {
        setSelectedQualificationStatus(
          evalReport.qualificationOutcome === 'RECOMMENDED' ? 'QUALIFIED' :
          evalReport.qualificationOutcome === 'CONDITIONAL' ? 'CONDITIONALLY_QUALIFIED' : 'NOT_QUALIFIED'
        );
        setSelectedQualificationOutcome(evalReport.qualificationOutcome);
      }
      setEvaluationFeedback(`AI evaluation completed. Suggested Score: ${evalReport?.overallWeightedScore || 0}% (${evalReport?.qualificationOutcome || 'REVIEW'}). Calibrate scores below.`);
      setActiveTab('evaluation');
    } catch (err: any) {
      setEvaluationFeedback(`Error: ${err.message}`);
    } finally {
      setAiEvaluating(false);
    }
  }

  async function handleSubmitQualification() {
    try {
      setSubmittingEvaluation(true);
      setEvaluationFeedback(null);
      const res = await fetch(`/api/procurement/vendors/${vendorId}/evaluation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qualificationStatus: selectedQualificationStatus,
          qualificationDecision: selectedQualificationOutcome,
          scores: rubricScores,
          overallWeightedScore: calculatedOverallScore,
          decisionRemarks: decisionRemarks || `Reviewed and recorded by Category Manager (${calculatedOverallScore}%)`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToSubmitEvaluation }));
      }
      toast.success(UI_STRINGS.appAppVendorPortalProfilePage.vendorDetailsSubmittedSuccessfully, vendor?.code, selectedQualificationStatus);
      setEvaluationFeedback('Vendor details submitted successfully.');
      await fetchVendorProfile();
    } catch (err: any) {
      setEvaluationFeedback(`Error: ${err.message}`);
    } finally {
      setSubmittingEvaluation(false);
    }
  }

  function openNewRatingModal() {
    setEditingRating(null);
    setSelectedPpoId(eligiblePpos[0]?.id || '');
    setPpoRatingForm({
      qualityScore: 4,
      deliveryScore: 4,
      commercialComplianceScore: 4,
      responsivenessScore: 4,
      documentationClosureScore: 4,
      qualityComments: '',
      deliveryComments: '',
      commercialComments: '',
      documentationComments: '',
      responsivenessComments: '',
      overallImprovement: '',
      comments: '',
      supportingEvidence: '',
    });
    setPpoRatingFeedback(null);
    setShowRateModal(true);
  }

  function openEditRatingModal(rating: any) {
    setEditingRating(rating);
    setSelectedPpoId(rating.ppoId || rating.ppo?.id || '');
    const details = rating.criteriaDetails && typeof rating.criteriaDetails === 'object'
      ? rating.criteriaDetails
      : (typeof rating.criteriaDetails === 'string'
        ? (() => { try { return JSON.parse(rating.criteriaDetails); } catch { return {}; } })()
        : (rating.criteriaDetailsParsed || {}));
    setPpoRatingForm({
      qualityScore: rating.qualityScore || 4,
      deliveryScore: rating.deliveryScore || 4,
      commercialComplianceScore: rating.commercialComplianceScore || 4,
      responsivenessScore: rating.responsivenessScore || 4,
      documentationClosureScore: rating.documentationClosureScore || 4,
      qualityComments: details.qualityComments || rating.qualityComments || '',
      deliveryComments: details.deliveryComments || rating.deliveryComments || '',
      commercialComments: details.commercialComments || rating.commercialComments || '',
      documentationComments: details.documentationComments || rating.documentationComments || '',
      responsivenessComments: details.responsivenessComments || rating.responsivenessComments || '',
      overallImprovement: details.overallImprovement || rating.overallImprovement || '',
      comments: rating.comments || '',
      supportingEvidence: details.supportingEvidence || '',
    });
    setPpoRatingFeedback(null);
    setShowRateModal(true);
  }

  function openViewRatingModal(rating: any) {
    setViewRatingModal(rating);
    setApproverComments('');
    setDecisionError(null);
    setConfirmAcceptOpen(false);
  }

  async function handleSavePpoRating(action: 'SAVE_DRAFT' | 'SUBMIT') {
    if (!selectedPpoId) {
      setPpoRatingFeedback('Please select a completed PPO to evaluate.');
      return;
    }

    if (action === 'SUBMIT') {
      if (
        !ppoRatingForm.qualityComments?.trim() ||
        !ppoRatingForm.deliveryComments?.trim() ||
        !ppoRatingForm.commercialComments?.trim() ||
        !ppoRatingForm.documentationComments?.trim() ||
        !ppoRatingForm.responsivenessComments?.trim() ||
        !ppoRatingForm.overallImprovement?.trim()
      ) {
        setPpoRatingFeedback('Please provide specific comments for each of the 5 assessment areas and the overall areas for improvement before submitting for approval.');
        return;
      }
    }

    try {
      setSubmittingPpoRating(true);
      setPpoRatingFeedback(null);
      const res = await fetch(`/api/procurement/vendors/${vendorId}/ppo-ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ppoId: selectedPpoId,
          ratingId: editingRating?.id,
          action,
          qualityScore: Number(ppoRatingForm.qualityScore),
          deliveryScore: Number(ppoRatingForm.deliveryScore),
          commercialComplianceScore: Number(ppoRatingForm.commercialComplianceScore),
          responsivenessScore: Number(ppoRatingForm.responsivenessScore),
          documentationClosureScore: Number(ppoRatingForm.documentationClosureScore),
          qualityComments: ppoRatingForm.qualityComments,
          deliveryComments: ppoRatingForm.deliveryComments,
          commercialComments: ppoRatingForm.commercialComments,
          documentationComments: ppoRatingForm.documentationComments,
          responsivenessComments: ppoRatingForm.responsivenessComments,
          overallImprovement: ppoRatingForm.overallImprovement,
          comments: ppoRatingForm.comments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToRecordPpoRating }));
      }
      setShowRateModal(false);
      setEditingRating(null);
      setPpoRatingFeedback(null);
      toast.success(
        action === 'SUBMIT'
          ? UI_STRINGS.common.userMessages.performanceAssessmentSubmittedForProjectApproval
          : UI_STRINGS.common.userMessages.performanceAssessmentDraftSavedSuccessfully,
        vendor?.code
      );
      await fetchVendorProfile();
      setActiveTab('performance');
    } catch (err: any) {
      setPpoRatingFeedback(`Error: ${err.message}`);
    } finally {
      setSubmittingPpoRating(false);
    }
  }

  async function handleApproverDecision(action: 'ACCEPT' | 'RETURN' | 'REJECT') {
    if (!viewRatingModal?.id) return;
    if ((action === 'RETURN' || action === 'REJECT') && !approverComments.trim()) {
      setDecisionError(UI_STRINGS.appAppProcurementVendorsIdPage.pleaseProvideReviewCommentsExplainingTheReasonForReturnRejection);
      return;
    }
    try {
      setSubmittingDecision(true);
      setDecisionError(null);
      const res = await fetch('/api/approvals/vendor-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratingId: viewRatingModal.id,
          action,
          approverComments: approverComments.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToProcessApproverDecision }));
      }
      toast.success(
        action === 'ACCEPT'
          ? UI_STRINGS.common.userMessages.performanceAssessmentAcceptedAndPublishedSuccessfully
          : action === 'RETURN'
          ? UI_STRINGS.common.userMessages.performanceAssessmentReturnedForCorrection
          : UI_STRINGS.common.userMessages.performanceAssessmentRejected,
        viewRatingModal?.ppo?.ppoNumber
      );
      setConfirmAcceptOpen(false);
      setViewRatingModal(null);
      setApproverComments('');
      await fetchVendorProfile();
    } catch (err: any) {
      setDecisionError(err.message);
    } finally {
      setSubmittingDecision(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingEdit(true);
      const res = await fetch(`/api/procurement/vendors/${vendorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToSaveChanges }));
      }
      toast.success(UI_STRINGS.appAppVendorPortalProfilePage.vendorDetailsSubmittedSuccessfully, vendor?.code);
      setShowEditModal(false);
      await fetchVendorProfile();
    } catch (err: any) {
      alert(interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.errorUpdatingProfileMessage, { "message": err.message }));
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
        <RefreshCw className="w-8 h-8 text-blue-700 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">{UI_STRINGS.appAppProcurementVendorsIdPage.loadingVendorProfile2}</p>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="w-full">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-xl mx-auto">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <h2 className="text-base font-semibold text-red-900">{UI_STRINGS.appAppProcurementVendorsIdPage.unableToLoadVendorProfile}</h2>
          <p className="text-sm text-red-700 mt-1">{error || UI_STRINGS.appAppProcurementVendorsIdPage.vendorRecordNotFoundOrAccessDenied}</p>
          <Link
            href="/procurement/vendors"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />{UI_STRINGS.appAppProcurementVendorsIdPage.returnToVendorDirectory}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      {/* ── 1. VENDOR PROFILE HEADER ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        {/* Row 1: Breadcrumb + Vendor Code */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <Link
              href="/procurement/vendors"
              className="hover:text-blue-700 flex items-center gap-1 font-semibold text-slate-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />{UI_STRINGS.common.vendorDirectory}</Link>
            <span className="text-slate-300">{UI_STRINGS.common.copybo0mse}</span>
            <span className="font-semibold text-slate-800">{vendor.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{UI_STRINGS.common.vendorCode2}</span>
            <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded font-semibold border border-slate-200">
              {vendor.code}
            </span>
          </div>
        </div>

        {/* Row 2: Vendor Name Heading, Badges, and Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-0.5">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              {vendor.name}
            </h1>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Vendor Type Badge */}
              {vendor.vendorType === 'CLIENT_VENDOR' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />{UI_STRINGS.common.clientVendor}</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.procucevVendor}</span>
              )}

              {/* Onboarding Status Badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                vendor.onboardingStatus === 'ONBOARDED'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                <Clock className="w-3.5 h-3.5" />
                {vendor.onboardingStatus === 'ONBOARDED' ? UI_STRINGS.appAppProcurementVendorsIdPage.profileComplete : UI_STRINGS.appAppProcurementVendorsIdPage.profileIncompleteDraft}
              </span>

              {/* Qualification Status Badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                vendor.qualificationStatus === 'QUALIFIED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : vendor.qualificationStatus === 'CONDITIONALLY_QUALIFIED'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : vendor.qualificationStatus === 'NOT_QUALIFIED'
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}>
                <Award className="w-3.5 h-3.5" />
                {vendor.qualificationStatus.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Action buttons aligned to right on desktop */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (vendor) {
                  setEditForm({
                    name: vendor.name || '',
                    vendorType: vendor.vendorType || 'CLIENT_VENDOR',
                    contactPerson: vendor.contactPerson || '',
                    email: vendor.email || '',
                    phone: vendor.phone || '',
                    operatingLocation: vendor.operatingLocation || '',
                    categories: vendor.categories || '',
                    legalStructure: vendor.legalStructure || 'PRIVATE_LIMITED',
                    gstin: vendor.gstin || '',
                    pan: vendor.pan || '',
                    website: vendor.website || '',
                    address: vendor.address || '',
                    experienceYears: vendor.experienceYears ?? '',
                    turnoverCrores: vendor.turnoverCrores ?? '',
                    capabilities: vendor.capabilities || '',
                    serviceCoverage: vendor.serviceCoverage || 'Pan-India',
                    clientReferences: vendor.clientReferences || '',
                    certifications: vendor.certifications || '',
                  });
                }
                setShowEditModal(true);
              }}
              className="btn btn-secondary text-xs"
            >
              <Edit3 className="w-3.5 h-3.5" style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementVendorsIdPage.editProfile}</button>
            <button
              type="button"
              onClick={handleRunAiEvaluation}
              disabled={aiEvaluating}
              className="btn btn-primary text-xs"
            >
              {aiEvaluating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementVendorsIdPage.analyzingEvidence}</>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" style={{ marginRight: 6 }} />{UI_STRINGS.appAppProcurementVendorsIdPage.runAIEvaluation}</>
              )}
            </button>
          </div>
        </div>

        {/* Row 3: Category, Contact Person, and Email in a neatly aligned secondary row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">{UI_STRINGS.common.category3}</span>
            <span className="font-semibold text-slate-800">{vendor.categories || UI_STRINGS.appAppProcurementVendorsIdPage.generalProcurement}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">{UI_STRINGS.appAppProcurementVendorsIdPage.contactPerson}</span>
            <span className="font-medium text-slate-800">{vendor.contactPerson || UI_STRINGS.appAppProcurementVendorsIdPage.notAssigned}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">{UI_STRINGS.appAppProcurementVendorsIdPage.email}</span>
            <span className="font-medium text-slate-800">{vendor.email || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided}</span>
          </div>
          {vendor.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">{UI_STRINGS.appAppProcurementVendorsIdPage.phone2}</span>
              <span className="text-slate-800">{vendor.phone}</span>
            </div>
          )}
          {vendor.operatingLocation && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">{UI_STRINGS.appAppProcurementVendorsIdPage.location}</span>
              <span className="text-slate-800">{vendor.operatingLocation}</span>
            </div>
          )}
        </div>

        {/* Row 4: 4 Compact Enterprise Summary Cards matching RFQ Management standard */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid #f1f5f9',
          }}
        >
          {/* Card 1: Vendor Qualification Score */}
          <div
            style={{
              background: '#ffffff',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #2563eb',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 56,
            }}
          >
            <Award size={18} color="#2563eb" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.vendorQualificationScore}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                  {vendor.qualificationScore !== null && vendor.qualificationScore !== undefined ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.qualificationScore, { "qualificationScore": vendor.qualificationScore }) : UI_STRINGS.common.notEvaluated}
                </span>
                {vendor.qualificationScore !== null && vendor.qualificationScore !== undefined && (
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copytl3a3d}</span>
                )}
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                  {vendor.qualificationScore !== null && vendor.qualificationScore !== undefined
                    ? vendor.qualificationScore >= 80 ? UI_STRINGS.appAppProcurementVendorsIdPage.recommended : vendor.qualificationScore >= 65 ? UI_STRINGS.appAppProcurementVendorsIdPage.conditional : UI_STRINGS.appAppProcurementVendorsIdPage.reviewRequired
                    : UI_STRINGS.common.pending}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: PPO Performance */}
          <div
            style={{
              background: '#ffffff',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #ea580c',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 56,
            }}
          >
            <Star size={18} color="#ea580c" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.common.pPOPerformance}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                  {performanceSummary?.averagePpoRating !== null && performanceSummary?.averagePpoRating !== undefined ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.averagePpoRating, { "averagePpoRating": performanceSummary.averagePpoRating }) : UI_STRINGS.common.notEvaluated}
                </span>
                {performanceSummary?.averagePpoRating !== null && performanceSummary?.averagePpoRating !== undefined && (
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{UI_STRINGS.common.copybqfq57}</span>
                )}
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                  {performanceSummary?.ppoRatingsCount
                    ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.ppoRatingsCountRatedOrderValue2, { "ppoRatingsCount": performanceSummary.ppoRatingsCount, "value2": performanceSummary.ppoRatingsCount > 1 ? 's' : '' })
                    : UI_STRINGS.appAppProcurementVendorsIdPage.noOrdersRated}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Completed PPOs / Orders */}
          <div
            style={{
              background: '#ffffff',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #0d9488',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 56,
            }}
          >
            <CheckCircle2 size={18} color="#0d9488" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.completedPPOsOrders}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0d9488', fontFamily: 'monospace' }}>
                  {performanceSummary?.ppoRatingsCount || vendor.ppos?.filter((p: any) => p.status === 'COMPLETED' || p.status === 'ACCEPTED').length || eligiblePpos.length || 0}
                </span>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{UI_STRINGS.common.copybo0mse}{vendor.ppos?.length || (performanceSummary?.ppoRatingsCount ? performanceSummary.ppoRatingsCount : 0)}{UI_STRINGS.appAppProcurementVendorsIdPage.orders}</span>
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                  {eligiblePpos.length > 0 ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.lengthEligible, { "length": eligiblePpos.length }) : UI_STRINGS.common.completed}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Evaluation Status */}
          <div
            style={{
              background: '#ffffff',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #123B7A',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 56,
            }}
          >
            <ShieldCheck size={18} color="#123B7A" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.evaluationStatus}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {vendor.qualificationStatus ? vendor.qualificationStatus.replace(/_/g, ' ') : UI_STRINGS.common.nOTEVALUATED}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. STANDARD ENTERPRISE HORIZONTAL TAB BAR ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          id="tab-overview"
          onClick={() => handleTabChange('overview')}
          style={{
            fontSize: 13,
            fontWeight: activeTab === 'overview' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'overview' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
            background: '#ffffff',
            color: activeTab === 'overview' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'overview' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <Building2 size={15} color={activeTab === 'overview' ? '#2563eb' : '#64748b'} />
          <span>{UI_STRINGS.appAppProcurementVendorsIdPage.overview}</span>
        </button>

        <button
          type="button"
          id="tab-evaluation"
          onClick={() => handleTabChange('evaluation')}
          style={{
            fontSize: 13,
            fontWeight: activeTab === 'evaluation' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'evaluation' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
            background: '#ffffff',
            color: activeTab === 'evaluation' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'evaluation' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <Sparkles size={15} color={activeTab === 'evaluation' ? '#2563eb' : '#64748b'} />
          <span>{UI_STRINGS.appAppProcurementVendorsIdPage.evaluationAI}</span>
        </button>

        <button
          type="button"
          id="tab-performance"
          onClick={() => handleTabChange('performance')}
          style={{
            fontSize: 13,
            fontWeight: activeTab === 'performance' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'performance' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
            background: '#ffffff',
            color: activeTab === 'performance' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'performance' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <Star size={15} color={activeTab === 'performance' ? '#2563eb' : '#64748b'} />
          <span>{UI_STRINGS.common.pPOPerformance}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 12,
              background: activeTab === 'performance' ? '#dbeafe' : '#f1f5f9',
              color: activeTab === 'performance' ? '#1e40af' : '#475569',
            }}
          >
            {performanceSummary?.ppoRatingsCount || 0}
          </span>
        </button>

        <button
          type="button"
          id="tab-documents"
          onClick={() => handleTabChange('documents')}
          style={{
            fontSize: 13,
            fontWeight: activeTab === 'documents' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'documents' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
            background: '#ffffff',
            color: activeTab === 'documents' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'documents' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <FileText size={15} color={activeTab === 'documents' ? '#2563eb' : '#64748b'} />
          <span>{UI_STRINGS.appAppProcurementVendorsIdPage.documentsAudit}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 12,
              background: activeTab === 'documents' ? '#dbeafe' : '#f1f5f9',
              color: activeTab === 'documents' ? '#1e40af' : '#475569',
            }}
          >
            {auditLogs.length}
          </span>
        </button>

        <button
          type="button"
          id="tab-sourcing-dashboard"
          onClick={() => handleTabChange('sourcing-dashboard')}
          style={{
            fontSize: 13,
            fontWeight: activeTab === 'sourcing-dashboard' ? 700 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 6,
            border: activeTab === 'sourcing-dashboard' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
            background: '#ffffff',
            color: activeTab === 'sourcing-dashboard' ? '#0f172a' : '#475569',
            boxShadow: activeTab === 'sourcing-dashboard' ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
            cursor: 'pointer',
          }}
        >
          <Layers size={15} color={activeTab === 'sourcing-dashboard' ? '#2563eb' : '#64748b'} />
          <span>{UI_STRINGS.appAppProcurementVendorsIdPage.sourcingOrdersPreview}</span>
        </button>
      </div>

      {/* ── 3. TAB PANELS ── */}

      {/* ── TAB 0: SOURCING & ORDERS DASHBOARD (RFQ REGISTER, NEGOTIATION & PPOS) ── */}
      {activeTab === 'sourcing-dashboard' && vendor && (
        <VendorSourcingDashboard
          vendorId={vendor.id}
          vendorName={vendor.name}
          vendorCode={vendor.code}
          isBuyer={true}
        />
      )}

      {/* ── TAB 1: OVERVIEW (STRUCTURED TWO-COLUMN INFORMATION PANELS) ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
          {/* Panel 1 — Legal Identity */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <Building2 size={16} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.legalIdentity}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.vendorLegalName}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{vendor.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.vendorCode}</span>
                <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>{vendor.code}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.vendorClassification}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {vendor.vendorType === 'CLIENT_VENDOR' ? UI_STRINGS.common.clientVendor : UI_STRINGS.appAppProcurementVendorsIdPage.procucevVendor}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.legalStructure}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {vendor.legalStructure || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.onboardingStatus}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {vendor.onboardingStatus === 'ONBOARDED' ? UI_STRINGS.appAppProcurementVendorsIdPage.profileComplete : UI_STRINGS.appAppProcurementVendorsIdPage.profileIncompleteDraft}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.qualificationStatus}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {vendor.qualificationStatus ? vendor.qualificationStatus.replace(/_/g, ' ') : UI_STRINGS.common.notEvaluated}
                </span>
              </div>
            </div>
          </div>

          {/* Panel 2 — Contact Information */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <UserCheck size={16} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.contactInformation}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.contactPerson}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{vendor.contactPerson || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.email}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{vendor.email || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.phone}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{vendor.phone || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.operatingLocation}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{vendor.operatingLocation || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}</span>
              </div>
              <div className="sm:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.businessAddress}</span>
                <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>
                  {vendor.address || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}
                </div>
              </div>
            </div>
          </div>

          {/* Panel 3 — Business Profile */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <Layers size={16} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.common.businessProfile}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.primaryCategory}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{vendor.categories || UI_STRINGS.common.notSpecified}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.serviceCoverage}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{vendor.serviceCoverage || UI_STRINGS.common.notSpecified}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.yearsInOperation}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {vendor.experienceYears ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.experienceYearsYears, { "experienceYears": vendor.experienceYears }) : UI_STRINGS.common.notSpecified}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.annualTurnover}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {vendor.turnoverCrores ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.turnoverCroresCrores, { "turnoverCrores": vendor.turnoverCrores }) : UI_STRINGS.common.notSpecified}
                </span>
              </div>
              <div className="sm:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.capabilities}</span>
                <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>
                  {vendor.capabilities || UI_STRINGS.appAppProcurementVendorsIdPage.noDeclaredCapabilitiesOnFile}
                </div>
              </div>
            </div>
          </div>

          {/* Panel 4 — Compliance & References */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <ShieldCheck size={16} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.complianceReferences}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.gSTIN}</span>
                {vendor.gstin ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{vendor.gstin}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, border: '1px solid #bbf7d0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.validated}</span>
                  </div>
                ) : (
                  <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.pAN}</span>
                {vendor.pan ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{vendor.pan}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, border: '1px solid #bbf7d0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.validated}</span>
                  </div>
                ) : (
                  <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.notProvided2}</span>
                )}
              </div>
              <div className="sm:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.registrationAndCertificationStatus}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {vendor.certifications || UI_STRINGS.appAppProcurementVendorsIdPage.noneReported}
                </span>
              </div>
              <div className="sm:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.previousClients}</span>
                <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>
                  {vendor.clientReferences ? vendor.clientReferences.split('\n')[0] : UI_STRINGS.appAppProcurementVendorsIdPage.noneReported}
                </div>
              </div>
              <div className="sm:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.references}</span>
                <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>
                  {vendor.clientReferences || UI_STRINGS.appAppProcurementVendorsIdPage.noCustomerReferencesDeclaredOnFile}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: EVALUATION (AI RUBRIC SCORECARD & HUMAN APPROVAL) ── */}
      {activeTab === 'evaluation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Rules Banner */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 840 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="#2563eb" />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.standard6RubricVendorEvaluationFramework}</h3>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.weightsBusinessProfile15FinancialStrength20PreviousClients20References15TechnicalCapability20ComplianceRisk10AIExtractsFactsFromEvidenceCategoryManagerRetainsFinalHumanApproval}</p>
            </div>
            <button
              onClick={handleRunAiEvaluation}
              disabled={aiEvaluating}
              className="btn btn-primary text-xs shrink-0"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {aiEvaluating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>{UI_STRINGS.appAppProcurementVendorsIdPage.analyzingProfile}</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>{UI_STRINGS.appAppProcurementVendorsIdPage.runAIAssistedEvaluation}</span>
                </>
              )}
            </button>
          </div>

          {evaluationFeedback && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid',
                background: evaluationFeedback.startsWith('Error') ? '#fef2f2' : '#f0fdf4',
                borderColor: evaluationFeedback.startsWith('Error') ? '#fecaca' : '#bbf7d0',
                color: evaluationFeedback.startsWith('Error') ? '#991b1b' : '#166534',
              }}
            >
              {evaluationFeedback}
            </div>
          )}

          {/* AI Evidence Analysis Findings (if generated) */}
          {aiResult && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #f1f5f9',
                  paddingBottom: 10,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="#d97706" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.aIEvidenceExtractionAnalysisSummary}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.recommendation}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: '#eff6ff',
                      color: '#1e40af',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    {aiResult.qualificationOutcome}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.score}{aiResult.overallWeightedScore}{UI_STRINGS.common.copy8w4luo}</span>
                </div>
              </div>

              {aiResult.executiveSummary && (
                <p style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, margin: 0 }}>
                  {aiResult.executiveSummary}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 14px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <CheckCircle2 size={14} color="#16a34a" />{UI_STRINGS.appAppProcurementVendorsIdPage.verifiedStrengths}</span>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#334155', lineHeight: 1.5, listStyleType: 'disc' }}>
                    {aiResult.strengths?.map((s: string, idx: number) => (
                      <li key={idx} style={{ marginBottom: 4 }}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 14px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertTriangle size={14} color="#d97706" />{UI_STRINGS.appAppProcurementVendorsIdPage.verificationGaps}</span>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#334155', lineHeight: 1.5, listStyleType: 'disc' }}>
                    {(aiResult.verificationGaps || aiResult.missingEvidenceGaps)?.map((g: string, idx: number) => (
                      <li key={idx} style={{ marginBottom: 4 }}>{g}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 14px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertCircle size={14} color="#dc2626" />{UI_STRINGS.appAppProcurementVendorsIdPage.criticalRisks}</span>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#334155', lineHeight: 1.5, listStyleType: 'disc' }}>
                    {((aiResult.criticalRiskFlags || aiResult.riskFactors)?.length > 0) ? (
                      (aiResult.criticalRiskFlags || aiResult.riskFactors).map((r: string, idx: number) => (
                        <li key={idx} style={{ marginBottom: 4 }}>{r}</li>
                      ))
                    ) : (
                      <li>{UI_STRINGS.appAppProcurementVendorsIdPage.noCriticalStatutoryRiskFlagsDetected}</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 6-Rubrics Structured Scorecard Table */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #cbd5e1',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.evaluationCriteriaScorecard}</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.calibrateScore0100ForEachStandardRubricScoreContributesProportionallyToOverallQualification}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.weightedScore}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#1e40af', fontFamily: 'monospace' }}>
                  {calculatedOverallScore}{UI_STRINGS.common.copy8w4luo}</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #B8C9DC', background: '#ffffff' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', width: '28%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.evaluationCriterion}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', width: '36%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.assessmentEvidence}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', width: '12%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.score0100}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', width: '12%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.contribution}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', width: '12%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.evaluationStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      key: 'businessProfile' as const,
                      num: 1,
                      title: UI_STRINGS.appAppProcurementVendorsIdPage.businessProfileExperience,
                      weight: 0.15,
                      description: UI_STRINGS.appAppProcurementVendorsIdPage.yearsOfOperationLegalIncorporationGeographicCoverageAndOperationalInfrastructure,
                      evidence: aiResult?.criteria?.businessProfile?.rationale || aiResult?.criteria?.businessProfile?.evidenceFound?.join(', ') || aiResult?.rubricScores?.businessProfile?.evidenceCitation || null,
                    },
                    {
                      key: 'financialStrength' as const,
                      num: 2,
                      title: UI_STRINGS.appAppProcurementVendorsIdPage.financialStrength,
                      weight: 0.20,
                      description: UI_STRINGS.appAppProcurementVendorsIdPage.annualTurnoverSolvencyIndicatorsLiquidityAuditedBalanceSheetStability,
                      evidence: aiResult?.criteria?.financialStrength?.rationale || aiResult?.criteria?.financialStrength?.evidenceFound?.join(', ') || aiResult?.rubricScores?.financialStrength?.evidenceCitation || null,
                    },
                    {
                      key: 'previousClients' as const,
                      num: 3,
                      title: UI_STRINGS.appAppProcurementVendorsIdPage.previousClientsProjectExperience,
                      weight: 0.20,
                      description: UI_STRINGS.appAppProcurementVendorsIdPage.customerTrackRecordOrderValuesCompletionHistorySimilarScopeExecution,
                      evidence: aiResult?.criteria?.previousClients?.rationale || aiResult?.criteria?.previousClients?.evidenceFound?.join(', ') || aiResult?.rubricScores?.previousClients?.evidenceCitation || null,
                    },
                    {
                      key: 'references' as const,
                      num: 4,
                      title: UI_STRINGS.appAppProcurementVendorsIdPage.referencesVerifiableTrackRecord,
                      weight: 0.15,
                      description: UI_STRINGS.appAppProcurementVendorsIdPage.directReferenceVerificationClientContactsFeedbackReliabilityPerformanceCertificates,
                      evidence: aiResult?.criteria?.references?.rationale || aiResult?.criteria?.references?.evidenceFound?.join(', ') || aiResult?.rubricScores?.references?.evidenceCitation || null,
                    },
                    {
                      key: 'technicalCapability' as const,
                      num: 5,
                      title: UI_STRINGS.appAppProcurementVendorsIdPage.technicalCategoryCapability,
                      weight: 0.20,
                      description: UI_STRINGS.appAppProcurementVendorsIdPage.categoryExpertiseMachineryFacilitiesWorkforceCapabilityQualityStandardsISO,
                      evidence: aiResult?.criteria?.technicalCapability?.rationale || aiResult?.criteria?.technicalCapability?.evidenceFound?.join(', ') || aiResult?.rubricScores?.technicalCapability?.evidenceCitation || null,
                    },
                    {
                      key: 'complianceRisk' as const,
                      num: 6,
                      title: UI_STRINGS.appAppProcurementVendorsIdPage.complianceRisk,
                      weight: 0.10,
                      description: UI_STRINGS.appAppProcurementVendorsIdPage.statutoryTaxFilingLitigationCheckSanctionsRegulatoryLicencesDocumentAuthenticity,
                      evidence: aiResult?.criteria?.complianceRisk?.rationale || aiResult?.criteria?.complianceRisk?.evidenceFound?.join(', ') || aiResult?.rubricScores?.complianceRisk?.evidenceCitation || null,
                    },
                  ].map((rubric) => {
                    const score = rubricScores[rubric.key];
                    const contribution = (score * rubric.weight).toFixed(1);
                    const statusLabel = score >= 70
                      ? UI_STRINGS.appAppProcurementVendorsIdPage.satisfactory
                      : score >= 50
                      ? UI_STRINGS.appAppProcurementVendorsIdPage.conditional
                      : score > 0
                      ? UI_STRINGS.appAppProcurementVendorsIdPage.reviewRequired
                      : UI_STRINGS.common.pending;
                    const statusBg = score >= 70 ? '#f0fdf4' : score >= 50 ? '#fffbeb' : score > 0 ? '#fef2f2' : '#f8fafc';
                    const statusBorder = score >= 70 ? '#bbf7d0' : score >= 50 ? '#fde68a' : score > 0 ? '#fecaca' : '#e2e8f0';
                    const statusColor = score >= 70 ? '#166534' : score >= 50 ? '#92400e' : score > 0 ? '#991b1b' : '#64748b';

                    return (
                      <tr key={rubric.key} style={{ background: '#ffffff' }}>
                        <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                              {rubric.num}{UI_STRINGS.appAppProcurementVendorsIdPage.copy15km32b}{rubric.title}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#1d4ed8',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                padding: '1px 6px',
                                borderRadius: 4,
                              }}
                            >
                              {(rubric.weight * 100).toFixed(0)}{UI_STRINGS.appAppProcurementVendorsIdPage.weight}</span>
                          </div>
                          <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                            {rubric.description}
                          </p>
                        </td>

                        <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', verticalAlign: 'top' }}>
                          {rubric.evidence ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <BoqDescriptionCell
                                text={rubric.evidence}
                                title={interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.titleEvidence, { "title": rubric.title })}
                                maxWidth={300}
                                clampLines={2}
                              />
                              <span style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.sourceAIVerificationEvidence}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.pendingAIEvaluationOrDocumentReview}</span>
                          )}
                        </td>

                        <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={score}
                            onChange={(e) => setRubricScores({ ...rubricScores, [rubric.key]: Number(e.target.value) })}
                            style={{
                              width: 64,
                              padding: '5px 6px',
                              fontSize: 13,
                              fontWeight: 700,
                              textAlign: 'center',
                              border: '1px solid #cbd5e1',
                              borderRadius: 4,
                              background: '#ffffff',
                              color: '#0f172a',
                              fontFamily: 'monospace',
                            }}
                          />
                        </td>

                        <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                            {contribution}{UI_STRINGS.common.copy8w4luo}</span>
                          <span style={{ display: 'block', fontSize: 10, color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.of}{(rubric.weight * 100).toFixed(0)}{UI_STRINGS.appAppProcurementVendorsIdPage.max}</span>
                        </td>

                        <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 4,
                              border: `1px solid ${statusBorder}`,
                              background: statusBg,
                              color: statusColor,
                              display: 'inline-block',
                            }}
                          >
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td colSpan={2} style={{ border: '1px solid #B8C9DC', padding: '12px 14px', textAlign: 'right', fontSize: 12, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.overallWeightedScoreSumOfContributions}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', textAlign: 'center', fontFamily: 'monospace', fontSize: 15, color: '#1e40af', fontWeight: 700 }}>
                      {calculatedOverallScore}{UI_STRINGS.common.copy8w4luo}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', textAlign: 'center', fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.max1000}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: '1px solid',
                          background: calculatedOverallScore >= 80 ? '#f0fdf4' : calculatedOverallScore >= 65 ? '#fffbeb' : '#fef2f2',
                          borderColor: calculatedOverallScore >= 80 ? '#bbf7d0' : calculatedOverallScore >= 65 ? '#fde68a' : '#fecaca',
                          color: calculatedOverallScore >= 80 ? '#166534' : calculatedOverallScore >= 65 ? '#92400e' : '#991b1b',
                        }}
                      >
                        {calculatedOverallScore >= 80 ? UI_STRINGS.appAppProcurementVendorsIdPage.recommended : calculatedOverallScore >= 65 ? UI_STRINGS.appAppProcurementVendorsIdPage.conditional : UI_STRINGS.appAppProcurementVendorsIdPage.reviewRequired}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Category Manager Final Qualification Decision Box */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: 10,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.categoryManagerQualificationDecisionGovernance}</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.theLLMNeverMakesTheFinalQualificationDecisionAuthorisedReviewIsRequired}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copy1ex52lq}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copy123finh}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.lt65NotRecommended}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.formalQualificationStatus}</label>
                  <select
                    value={selectedQualificationStatus}
                    onChange={(e) => setSelectedQualificationStatus(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: 12,
                      fontWeight: 600,
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '8px 10px',
                      background: '#ffffff',
                      color: '#0f172a',
                    }}
                  >
                    <option value="QUALIFIED">{UI_STRINGS.appAppProcurementVendorsIdPage.qUALIFIEDApprovedForRFQPPOAwards}</option>
                    <option value="CONDITIONALLY_QUALIFIED">{UI_STRINGS.appAppProcurementVendorsIdPage.cONDITIONALLYQUALIFIEDAdditionalReviewsOrSafeguardsRequired}</option>
                    <option value="NOT_QUALIFIED">{UI_STRINGS.appAppProcurementVendorsIdPage.nOTQUALIFIEDDisqualifiedIneligible}</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.evaluationOutcomeClassification}</label>
                  <select
                    value={selectedQualificationOutcome}
                    onChange={(e) => setSelectedQualificationOutcome(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: 12,
                      fontWeight: 600,
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '8px 10px',
                      background: '#ffffff',
                      color: '#0f172a',
                    }}
                  >
                    <option value="RECOMMENDED">{UI_STRINGS.appAppProcurementVendorsIdPage.rECOMMENDED}</option>
                    <option value="CONDITIONAL">{UI_STRINGS.appAppProcurementVendorsIdPage.cONDITIONAL}</option>
                    <option value="NOT_RECOMMENDED">{UI_STRINGS.appAppProcurementVendorsIdPage.nOTRECOMMENDED}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.evaluationRemarksAuditNotes}</label>
                  <textarea
                    rows={3}
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.enterFormalJustificationVerificationNotesOrConditionalStipulations}
                    style={{
                      width: '100%',
                      fontSize: 12,
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '8px 10px',
                      background: '#ffffff',
                      color: '#0f172a',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleSubmitQualification}
                    disabled={submittingEvaluation}
                    className="btn btn-primary text-xs"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 18px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {submittingEvaluation ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>{UI_STRINGS.appAppProcurementVendorsIdPage.recordingDecision}</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>{UI_STRINGS.appAppProcurementVendorsIdPage.commitQualificationDecision}{calculatedOverallScore}{UI_STRINGS.common.copy1y4e1t7}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: PPO PERFORMANCE (ORDER-LEVEL INDEPENDENT RATINGS) ── */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Separation Callout */}
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 8,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <Info size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
              <strong>{UI_STRINGS.appAppProcurementVendorsIdPage.orderExecutionRating}</strong>{UI_STRINGS.appAppProcurementVendorsIdPage.pPOPerformanceRatingsEvaluateActualProjectDeliveriesAcross5CriteriaQuality30Delivery25Commercial20Responsiveness15Documentation10OnA15ScaleItIsMaintainedIndependentlyFromTheInitialVendorQualificationScore}</div>
          </div>

          {/* Aggregated Performance Metrics Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: 10,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.aggregatedPerformanceScorecard}</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.synthesizedAcross}{performanceSummary?.ppoRatingsCount || 0}{UI_STRINGS.appAppProcurementVendorsIdPage.completedProcurementOrders}</p>
              </div>

              {eligiblePpos.length > 0 && currentUserRole !== 'PROCUREMENT_USER' && (
                <button
                  onClick={openNewRatingModal}
                  className="btn btn-primary text-xs shrink-0"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Star size={14} />
                  <span>{UI_STRINGS.appAppProcurementVendorsIdPage.rateCompletedOrder}{eligiblePpos.length}{UI_STRINGS.appAppProcurementVendorsIdPage.available}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.overallRating}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {performanceSummary?.averagePpoRating !== null ? performanceSummary?.averagePpoRating : UI_STRINGS.common.copy4s9bsz}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.common.copybqfq57}</span>
                </div>
                <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.weightedSummary}</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.quality30}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {performanceSummary?.avgQuality !== null ? performanceSummary?.avgQuality : UI_STRINGS.common.copy4s9bsz}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copyfctprx}</span>
                </div>
                <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.materialSpecs}</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.delivery25}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {performanceSummary?.avgDelivery !== null ? performanceSummary?.avgDelivery : UI_STRINGS.common.copy4s9bsz}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copyfctprx}</span>
                </div>
                <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.scheduleMilestone}</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.commercial20}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {performanceSummary?.avgCommercial !== null ? performanceSummary?.avgCommercial : UI_STRINGS.common.copy4s9bsz}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copyfctprx}</span>
                </div>
                <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.billingContracts}</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.resp15}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {performanceSummary?.avgResponsiveness !== null ? performanceSummary?.avgResponsiveness : UI_STRINGS.common.copy4s9bsz}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copyfctprx}</span>
                </div>
                <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.responseSpeed}</span>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.docs10}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                    {performanceSummary?.avgDocumentation !== null ? performanceSummary?.avgDocumentation : UI_STRINGS.common.copy4s9bsz}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.copyfctprx}</span>
                </div>
                <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginTop: 2 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.handoversClosure}</span>
              </div>
            </div>
          </div>

          {/* Historical PPO Ratings Table */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #cbd5e1',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.individualOrderRatingHistory}{vendor.ppoRatings?.length || 0}{UI_STRINGS.common.copyc7zu6c}</h3>
                <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0 0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.pPOSpecificPerformanceEvaluationsAndApproverDecisions}</p>
              </div>
            </div>

            {vendor.ppoRatings && vendor.ppoRatings.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #B8C9DC', background: '#ffffff', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.pPOReference}</th>
                      <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.projectCostCentre2}</th>
                      <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.orderValue}</th>
                      <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.overallScore}</th>
                      <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.workflowStatus}</th>
                      <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.submitterDate}</th>
                      <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendor.ppoRatings.map((rating: any) => {
                      const isDraft = rating.status === 'DRAFT';
                      const isSubmitted = rating.status === 'SUBMITTED';
                      const isReturned = rating.status === 'RETURNED_FOR_CORRECTION';
                      const isApproved = rating.status === 'APPROVED';
                      const isRejected = rating.status === 'REJECTED';
                      const canApproverReview = isSubmitted && (currentUserRole === 'PROJECT_APPROVER' || currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'CLIENT_ADMIN');
                      const canUserEdit = (isDraft || isReturned) && currentUserRole !== 'PROCUREMENT_USER';

                      return (
                        <tr key={rating.id} style={{ background: '#ffffff' }} className="hover:bg-slate-50/70 transition-colors">
                          <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px' }}>
                            <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', display: 'block' }}>
                              {rating.ppo?.ppoNumber}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b', display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rating.ppo?.title}
                            </span>
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', display: 'block' }}>
                              {rating.ppo?.project?.name || UI_STRINGS.common.generalProject}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              {rating.ppo?.costCentre?.name || rating.ppo?.costCentre?.code || UI_STRINGS.common.costCentre2}
                            </span>
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                            {rating.ppo?.totalValue ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": rating.ppo.totalValue.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: 12,
                                background: isApproved ? '#ecfdf5' : '#fffbeb',
                                color: isApproved ? '#065f46' : '#92400e',
                                border: isApproved ? '1px solid #a7f3d0' : '1px solid #fde68a',
                              }}
                            >
                              <Star size={12} className={isApproved ? 'fill-emerald-600 text-emerald-600' : 'fill-amber-500 text-amber-500'} />
                              {rating.overallScore}{UI_STRINGS.common.copy6hoc4p}</span>
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'center' }}>
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.approved}</span>
                            )}
                            {isSubmitted && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.submittedForApproval}</span>
                            )}
                            {isReturned && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <RotateCcw className="w-3 h-3 text-rose-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.returnedForCorrection}</span>
                            )}
                            {isDraft && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                <FileText className="w-3 h-3 text-slate-500" />{UI_STRINGS.appAppProcurementVendorsIdPage.draft}</span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                                <XCircle className="w-3 h-3 text-red-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.rejected}</span>
                            )}
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#64748b', fontSize: 11 }}>
                            <span className="font-medium text-slate-800 block">{rating.ratedByName || UI_STRINGS.common.projectUser}</span>
                            <span className="text-slate-400 text-[10px]">{new Date(rating.ratedAt).toLocaleDateString()}</span>
                          </td>
                          <td style={{ border: '1px solid #B8C9DC', padding: '8px 12px', textAlign: 'center' }}>
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => openViewRatingModal(rating)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                                title={UI_STRINGS.appAppProcurementVendorsIdPage.viewCompleteSubmittedAssessmentAndApproverFeedback}
                              >
                                <Eye className="w-3 h-3" />{UI_STRINGS.appAppProcurementVendorsIdPage.viewAssessment}</button>
                              {canUserEdit && (
                                <button
                                  onClick={() => openEditRatingModal(rating)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
                                  title={UI_STRINGS.appAppProcurementVendorsIdPage.editAssessmentAndResubmit}
                                >
                                  <Edit3 className="w-3 h-3 text-slate-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.editResubmit}</button>
                              )}
                              {canApproverReview && (
                                <button
                                  onClick={() => openViewRatingModal(rating)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100 transition-colors"
                                  title={UI_STRINGS.appAppProcurementVendorsIdPage.reviewSubmittedAssessmentAndRecordDecision}
                                >
                                  <CheckSquare className="w-3 h-3 text-amber-700" />{UI_STRINGS.appAppProcurementVendorsIdPage.reviewDecide}</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <Star size={32} color="#cbd5e1" style={{ margin: '0 auto 10px auto' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.noPPOPerformanceRatingsRecorded}</h4>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                  {eligiblePpos.length > 0 && currentUserRole !== 'PROCUREMENT_USER'
                    ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.lengthCompletedPurchaseOrderSAreEligibleForPerformanceReviewClickRateCompletedOrderAbove, { "length": eligiblePpos.length })
                    : UI_STRINGS.appAppProcurementVendorsIdPage.ratingsAreRecordedAfterAnIssuedPurchaseOrderPPOReachesCompletionAndAreApprovedByTheProjectApprover}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: DOCUMENTS & AUDIT TRAIL ── */}
      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* Table 1: Statutory Documents & Certifications */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #cbd5e1',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FileCheck2 size={16} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.statutoryDocumentsCertifications}</h3>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #B8C9DC', background: '#ffffff', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.documentRequirement}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.referenceEvidence}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.verificationStatus}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.sourceNotes}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#ffffff' }}>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.gSTRegistrationCertificate}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>
                      {vendor.gstin || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided}
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid',
                          background: vendor.gstin ? '#f0fdf4' : '#f8fafc',
                          borderColor: vendor.gstin ? '#bbf7d0' : '#e2e8f0',
                          color: vendor.gstin ? '#166534' : '#64748b',
                        }}
                      >
                        {vendor.gstin ? UI_STRINGS.common.verified : UI_STRINGS.common.pending}
                      </span>
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.portalValidation}</td>
                  </tr>

                  <tr style={{ background: '#ffffff' }}>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.pANCardCopy}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>
                      {vendor.pan || UI_STRINGS.appAppProcurementVendorsIdPage.notProvided}
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid',
                          background: vendor.pan ? '#f0fdf4' : '#f8fafc',
                          borderColor: vendor.pan ? '#bbf7d0' : '#e2e8f0',
                          color: vendor.pan ? '#166534' : '#64748b',
                        }}
                      >
                        {vendor.pan ? UI_STRINGS.common.verified : UI_STRINGS.common.pending}
                      </span>
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.incomeTaxVerification}</td>
                  </tr>

                  <tr style={{ background: '#ffffff' }}>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.companyProfileVintage}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#0f172a' }}>
                      {vendor.experienceYears ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.experienceYearsYearsVintage, { "experienceYears": vendor.experienceYears }) : UI_STRINGS.appAppProcurementVendorsIdPage.notSubmitted}
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid',
                          background: vendor.experienceYears ? '#f0fdf4' : '#f8fafc',
                          borderColor: vendor.experienceYears ? '#bbf7d0' : '#e2e8f0',
                          color: vendor.experienceYears ? '#166534' : '#64748b',
                        }}
                      >
                        {vendor.experienceYears ? UI_STRINGS.appAppProcurementVendorsIdPage.provided : UI_STRINGS.appAppProcurementVendorsIdPage.optional}
                      </span>
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.corporateProfile}</td>
                  </tr>

                  <tr style={{ background: '#ffffff' }}>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.auditedFinancialStatements}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#0f172a' }}>
                      {vendor.turnoverCrores ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.turnoverCroresCroresTurnover, { "turnoverCrores": vendor.turnoverCrores }) : UI_STRINGS.appAppProcurementVendorsIdPage.notUploaded}
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid',
                          background: vendor.turnoverCrores ? '#f0fdf4' : '#f8fafc',
                          borderColor: vendor.turnoverCrores ? '#bbf7d0' : '#e2e8f0',
                          color: vendor.turnoverCrores ? '#166534' : '#64748b',
                        }}
                      >
                        {vendor.turnoverCrores ? UI_STRINGS.appAppProcurementVendorsIdPage.provided : UI_STRINGS.common.pending}
                      </span>
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.cAAttestedBalanceSheet}</td>
                  </tr>

                  <tr style={{ background: '#ffffff' }}>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.statutoryCertifications}</td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#0f172a' }}>
                      {vendor.certifications || UI_STRINGS.appAppProcurementVendorsIdPage.noneReported}
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid',
                          background: vendor.certifications ? '#f0fdf4' : '#f8fafc',
                          borderColor: vendor.certifications ? '#bbf7d0' : '#e2e8f0',
                          color: vendor.certifications ? '#166534' : '#64748b',
                        }}
                      >
                        {vendor.certifications ? UI_STRINGS.common.recorded : UI_STRINGS.common.none}
                      </span>
                    </td>
                    <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#64748b' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.iSOIndustryCredentials}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Governance & Audit History */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #cbd5e1',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Clock size={16} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.governanceAuditHistory}{auditLogs.length}{UI_STRINGS.common.copyc7zu6c}</h3>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 380 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #B8C9DC', background: '#ffffff', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', width: '22%' }}>{UI_STRINGS.common.timestamp}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', width: '22%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.actionEvent}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', width: '38%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.descriptionOutcome}</th>
                    <th style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', width: '18%' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.actorUser}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length > 0 ? (
                    auditLogs.map((log: any) => (
                      <tr key={log.id} style={{ background: '#ffffff' }}>
                        <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                          {log.action.replace(/_/g, ' ')}
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', color: '#334155' }}>
                          <BoqDescriptionCell
                            text={log.description}
                            title={UI_STRINGS.appAppProcurementVendorsIdPage.auditEventDetail}
                            maxWidth={220}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ border: '1px solid #B8C9DC', padding: '10px 14px', fontSize: 11, color: '#64748b' }}>
                          {log.user ? interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.nameRole, { "name": log.user.name, "role": log.user.role }) : UI_STRINGS.common.system}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ border: '1px solid #B8C9DC', padding: '24px 14px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>{UI_STRINGS.appAppProcurementVendorsIdPage.noAuditTrailRecordsFound}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 1: RATE / EDIT COMPLETED PPO ── */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 my-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  {editingRating ? UI_STRINGS.appAppProcurementVendorsIdPage.editResubmitPerformanceAssessment : UI_STRINGS.appAppProcurementVendorsIdPage.rateCompletedPurchaseOrderPerformance}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{UI_STRINGS.common.copyjcbnww}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRateModal(false);
                  setEditingRating(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg font-bold leading-none"
              >{UI_STRINGS.common.copy4i33ao}</button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Return for Correction Banner if editing returned assessment */}
              {editingRating?.status === 'RETURNED_FOR_CORRECTION' && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-800 mb-1">
                    <RotateCcw className="w-4 h-4 text-rose-600" />
                    <span>{UI_STRINGS.appAppProcurementVendorsIdPage.returnedForCorrectionByProjectApprover}</span>
                  </div>
                  <p className="text-rose-700 leading-relaxed">
                    <strong>{UI_STRINGS.appAppProcurementVendorsIdPage.approverComments}</strong> {editingRating.approverComments || editingRating.returnReason || UI_STRINGS.appAppProcurementVendorsIdPage.pleaseReviewAndAdjustCriteriaRatingsOrProvideMoreDetailInTheAreasForImprovement}
                  </p>
                </div>
              )}

              {ppoRatingFeedback && (
                <div className="p-3 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{ppoRatingFeedback}</span>
                </div>
              )}

              {/* PPO Selection / Information */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.selectCompletedPurchaseOrderPPO}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                {editingRating ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800">
                    <span className="font-mono text-blue-700 font-bold">{editingRating.ppo?.ppoNumber}</span>{UI_STRINGS.common.copyq9aflv}{editingRating.ppo?.title}{UI_STRINGS.appAppProcurementVendorsIdPage.value}{editingRating.ppo?.totalValue?.toLocaleString() || 0}{UI_STRINGS.common.copyc7zu6c}</div>
                ) : (
                  <select
                    value={selectedPpoId}
                    onChange={(e) => setSelectedPpoId(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2.5 bg-white text-slate-800 font-semibold focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    required
                  >
                    <option value="">{UI_STRINGS.appAppProcurementVendorsIdPage.chooseCompletedPPOToEvaluate}</option>
                    {eligiblePpos.map((ppo: any) => (
                      <option key={ppo.id} value={ppo.id}>
                        {ppo.ppoNumber}{UI_STRINGS.common.copyq9aflv}{ppo.title}{UI_STRINGS.appAppProcurementVendorsIdPage.value}{ppo.totalValue?.toLocaleString() || 0}{UI_STRINGS.common.copyc7zu6c}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Section 1: 5 Weighted Rating Criteria */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{UI_STRINGS.appAppProcurementVendorsIdPage.copy5wnvrv}</h4>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>{UI_STRINGS.appAppProcurementVendorsIdPage.liveWeightedScore}{(
                        (ppoRatingForm.qualityScore * 0.30) +
                        (ppoRatingForm.deliveryScore * 0.25) +
                        (ppoRatingForm.commercialComplianceScore * 0.20) +
                        (ppoRatingForm.responsivenessScore * 0.15) +
                        (ppoRatingForm.documentationClosureScore * 0.10)
                      ).toFixed(2)}{UI_STRINGS.common.copy6hoc4p}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Quality */}
                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.qualityOfGoodsWork30}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span></span>
                      <select
                        value={ppoRatingForm.qualityScore}
                        onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, qualityScore: Number(e.target.value) })}
                        className="text-xs font-bold border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        {[5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>{s}{UI_STRINGS.common.copy1oc1xgf}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppProcurementVendorsIdPage.workmanshipMaterialQualitySpecsDefects}</span>
                  </div>

                  {/* Delivery */}
                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.deliveryTime25}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span></span>
                      <select
                        value={ppoRatingForm.deliveryScore}
                        onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, deliveryScore: Number(e.target.value) })}
                        className="text-xs font-bold border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        {[5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>{s}{UI_STRINGS.common.copy1oc1xgf}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppProcurementVendorsIdPage.deliveryTimelinesMilestoneDelaysScheduleAdherence}</span>
                  </div>

                  {/* Commercial */}
                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.costCommercial20}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span></span>
                      <select
                        value={ppoRatingForm.commercialComplianceScore}
                        onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, commercialComplianceScore: Number(e.target.value) })}
                        className="text-xs font-bold border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        {[5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>{s}{UI_STRINGS.common.copy1oc1xgf}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppProcurementVendorsIdPage.agreedRatesCostControlBillingCommercialCompliance}</span>
                  </div>

                  {/* Responsiveness */}
                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.responsivenessCoordination15}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span></span>
                      <select
                        value={ppoRatingForm.responsivenessScore}
                        onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, responsivenessScore: Number(e.target.value) })}
                        className="text-xs font-bold border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        {[5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>{s}{UI_STRINGS.common.copy1oc1xgf}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppProcurementVendorsIdPage.communicationIssueResolutionSiteCoordination}</span>
                  </div>

                  {/* Documentation */}
                  <div className="p-3 rounded-lg border border-slate-200 bg-white md:col-span-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.documentationClosure10}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span></span>
                      <select
                        value={ppoRatingForm.documentationClosureScore}
                        onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, documentationClosureScore: Number(e.target.value) })}
                        className="text-xs font-bold border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        {[5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>{s}{UI_STRINGS.common.copy1oc1xgf}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-[11px] text-slate-500 block">{UI_STRINGS.appAppProcurementVendorsIdPage.invoicesStatutoryDocumentsTestCertificatesHandoverRecords}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Performance Feedback & Areas for Improvement */}
              <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/60 space-y-4">
                <div className="border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.performanceFeedbackAreasForImprovement}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{UI_STRINGS.appAppProcurementVendorsIdPage.provideSpecificQualitativeObservationsForEachAssessmentAreaAndActionableImprovementRecommendations}</p>
                </div>

                {/* Individual Category Comment Boxes */}
                <div className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.qualityFeedbackObservations}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <textarea
                      rows={2}
                      value={ppoRatingForm.qualityComments}
                      onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, qualityComments: e.target.value })}
                      placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.commentsOnWorkmanshipMaterialQualitySpecificationsComplianceAndDefectsObserved}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.deliveryTimeAdherenceFeedback}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <textarea
                      rows={2}
                      value={ppoRatingForm.deliveryComments}
                      onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, deliveryComments: e.target.value })}
                      placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.commentsOnDeliveryTimelinesScheduleAdherenceMilestoneTrackingAndDelays}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.costCommercialComplianceFeedback}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <textarea
                      rows={2}
                      value={ppoRatingForm.commercialComments}
                      onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, commercialComments: e.target.value })}
                      placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.commentsOnAgreedRatesAdherenceCostControlBillingAccuracyAndCommercialCompliance}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.documentationHandoverFeedback}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <textarea
                      rows={2}
                      value={ppoRatingForm.documentationComments}
                      onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, documentationComments: e.target.value })}
                      placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.commentsOnTaxInvoicesStatutoryDocumentsTestCertificatesWarrantyCertificatesAndHandoverRecords}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.responsivenessCoordinationFeedback}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <textarea
                      rows={2}
                      value={ppoRatingForm.responsivenessComments}
                      onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, responsivenessComments: e.target.value })}
                      placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.commentsOnCommunicationTurnaroundIssueResolutionEscalationHandlingAndSiteCoordination}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Larger Box: Overall Areas for Improvement */}
                  <div className="pt-2 border-t border-slate-200">
                    <label className="text-xs font-bold text-slate-900 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.overallAreasForImprovementCorrectiveActionsFutureRecommendations}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>
                    </label>
                    <textarea
                      rows={3}
                      value={ppoRatingForm.overallImprovement}
                      onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, overallImprovement: e.target.value })}
                      placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.describeKeyImprovementAreasExpectedCorrectiveActionsFromVendorAndRecommendationsForFutureCapexProjects}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with Actions */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowRateModal(false);
                  setEditingRating(null);
                }}
                className="btn btn-secondary text-xs"
              >{UI_STRINGS.common.cancel}</button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submittingPpoRating}
                  onClick={() => handleSavePpoRating('SAVE_DRAFT')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <Save className="w-3.5 h-3.5 text-slate-600" />
                  <span>{UI_STRINGS.common.saveDraft}</span>
                </button>
                <button
                  type="button"
                  disabled={submittingPpoRating}
                  onClick={() => handleSavePpoRating('SUBMIT')}
                  className="btn btn-primary text-xs inline-flex items-center gap-1.5"
                >
                  {submittingPpoRating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{UI_STRINGS.common.submitting}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{UI_STRINGS.common.submitForProjectApproval}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: ASSESSMENT DETAIL & APPROVER REVIEW ── */}
      {viewRatingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 my-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900">{UI_STRINGS.common.pPOPerformanceAssessmentDetail}</h3>
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                    {viewRatingModal.ppo?.ppoNumber}
                  </span>
                  {viewRatingModal.status === 'APPROVED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.approved}</span>
                  )}
                  {viewRatingModal.status === 'SUBMITTED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.submittedForApproval}</span>
                  )}
                  {viewRatingModal.status === 'RETURNED_FOR_CORRECTION' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      <RotateCcw className="w-3.5 h-3.5 text-rose-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.returnedForCorrection}</span>
                  )}
                  {viewRatingModal.status === 'DRAFT' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />{UI_STRINGS.appAppProcurementVendorsIdPage.draft}</span>
                  )}
                  {viewRatingModal.status === 'REJECTED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                      <XCircle className="w-3.5 h-3.5 text-red-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.rejected}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">{UI_STRINGS.appAppProcurementVendorsIdPage.comprehensivePerformanceAuditScoringWeightsEvaluatorFeedbackAndApprovalRecords}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewRatingModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg font-bold leading-none"
              >{UI_STRINGS.common.copy4i33ao}</button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {decisionError && (
                <div className="p-3 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{decisionError}</span>
                </div>
              )}

              {/* Section A: Submitted Performance Assessment */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-blue-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.aSubmittedPerformanceAssessment}</h4>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.common.pPONumber}</span>
                    <span className="font-mono font-bold text-blue-700">{viewRatingModal.ppo?.ppoNumber}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.common.vendor}</span>
                    <span className="font-semibold text-slate-800">{vendor.name}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.common.project}</span>
                    <span className="font-semibold text-slate-800">{viewRatingModal.ppo?.project?.name || UI_STRINGS.common.generalProject}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.common.costCentre2}</span>
                    <span className="font-semibold text-slate-800">{viewRatingModal.ppo?.costCentre?.name || viewRatingModal.ppo?.costCentre?.code || UI_STRINGS.common.copy4s9bsz}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.common.pPOValue}</span>
                    <span className="font-mono font-bold text-slate-800">
                      {viewRatingModal.ppo?.totalValue ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": viewRatingModal.ppo.totalValue.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.appAppProcurementVendorsIdPage.evaluatedBy}</span>
                    <span className="font-semibold text-slate-800">{viewRatingModal.ratedByName || UI_STRINGS.common.projectUser}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.common.submissionDate}</span>
                    <span className="font-semibold text-slate-800">{new Date(viewRatingModal.ratedAt).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{UI_STRINGS.appAppProcurementVendorsIdPage.weightedOverallScore}</span>
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      {viewRatingModal.overallScore}{UI_STRINGS.common.copy6hoc4p}</span>
                  </div>
                </div>

                {/* 5 Assessment Areas with Individual Comments */}
                <div className="space-y-3">
                  <h5 className="text-xs font-bold text-slate-800">{UI_STRINGS.appAppProcurementVendorsIdPage.criteriaRatingsEvaluatorFeedback}</h5>
                  
                  {/* Quality */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.qualityOfGoodsWork30Weight}</span>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {viewRatingModal.qualityScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                    </div>
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
                      {viewRatingModal.qualityComments || viewRatingModal.criteriaDetailsParsed?.qualityComments || UI_STRINGS.appAppProcurementVendorsIdPage.noSpecificQualityFeedbackRecorded}
                    </p>
                  </div>

                  {/* Delivery */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.deliveryTimeAdherence25Weight}</span>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {viewRatingModal.deliveryScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                    </div>
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
                      {viewRatingModal.deliveryComments || viewRatingModal.criteriaDetailsParsed?.deliveryComments || UI_STRINGS.appAppProcurementVendorsIdPage.noSpecificDeliveryFeedbackRecorded}
                    </p>
                  </div>

                  {/* Commercial */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.costCommercialCompliance20Weight}</span>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {viewRatingModal.commercialComplianceScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                    </div>
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
                      {viewRatingModal.commercialComments || viewRatingModal.criteriaDetailsParsed?.commercialComments || UI_STRINGS.appAppProcurementVendorsIdPage.noSpecificCommercialComplianceFeedbackRecorded}
                    </p>
                  </div>

                  {/* Documentation */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.documentationClosure10Weight}</span>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {viewRatingModal.documentationClosureScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                    </div>
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
                      {viewRatingModal.documentationComments || viewRatingModal.criteriaDetailsParsed?.documentationComments || UI_STRINGS.appAppProcurementVendorsIdPage.noSpecificDocumentationFeedbackRecorded}
                    </p>
                  </div>

                  {/* Responsiveness */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.responsivenessCoordination15Weight}</span>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {viewRatingModal.responsivenessScore}{UI_STRINGS.common.copy1oc1xgf}</span>
                    </div>
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
                      {viewRatingModal.responsivenessComments || viewRatingModal.criteriaDetailsParsed?.responsivenessComments || UI_STRINGS.appAppProcurementVendorsIdPage.noSpecificResponsivenessFeedbackRecorded}
                    </p>
                  </div>

                  {/* Overall Areas for Improvement */}
                  <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-blue-700" />
                      <span className="text-xs font-bold text-blue-900">{UI_STRINGS.appAppProcurementVendorsIdPage.overallAreasForImprovementCorrectiveActionsFutureRecommendations}</span>
                    </div>
                    <p className="text-xs text-slate-800 bg-white p-3 rounded border border-blue-200 leading-relaxed whitespace-pre-wrap">
                      {viewRatingModal.overallImprovement || viewRatingModal.criteriaDetailsParsed?.overallImprovement || viewRatingModal.comments || UI_STRINGS.appAppProcurementVendorsIdPage.noOverallImprovementRemarksProvided}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section B: Approver Review Comments & Audit */}
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-purple-600" />{UI_STRINGS.appAppProcurementVendorsIdPage.bProjectApproverCommentsDecision}</h4>

                {/* If already decided */}
                {(viewRatingModal.status === 'APPROVED' || viewRatingModal.status === 'RETURNED_FOR_CORRECTION' || viewRatingModal.status === 'REJECTED') && (
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.recordedApproverRemarks}</span>
                      {viewRatingModal.approvedAt && (
                        <span className="text-slate-400 text-[11px]">{interpolateUiString(UI_STRINGS.appAppProcurementVendorsIdPage.approvedOnDateByName, {
                          date: new Date(viewRatingModal.approvedAt).toLocaleString(),
                          name: viewRatingModal.approvedByName || UI_STRINGS.common.approver,
                        })}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 bg-white p-3 rounded border border-slate-200 leading-relaxed">
                      {viewRatingModal.approverComments || viewRatingModal.criteriaDetailsParsed?.approverComments || viewRatingModal.returnReason || UI_STRINGS.appAppProcurementVendorsIdPage.noApproverCommentsRecorded}
                    </p>
                  </div>
                )}

                {/* If currently SUBMITTED and user is Project Approver or Admin */}
                {viewRatingModal.status === 'SUBMITTED' && (currentUserRole === 'PROJECT_APPROVER' || currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'CLIENT_ADMIN') && (
                  <div className="p-4 rounded-lg border border-purple-200 bg-purple-50/40 space-y-2">
                    <label className="text-xs font-bold text-slate-900 block">{UI_STRINGS.appAppProcurementVendorsIdPage.projectApproverComments}<span className="text-red-600">{UI_STRINGS.common.copyd1yn99}</span>{UI_STRINGS.appAppProcurementVendorsIdPage.mandatoryForReturnReject}</label>
                    <textarea
                      rows={3}
                      value={approverComments}
                      onChange={(e) => setApproverComments(e.target.value)}
                      placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.recordReasonForAcceptingTheAssessmentOrSpecificCorrectionsFurtherEvidenceRequiredForReturnRejection}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                    <p className="text-[11px] text-slate-500">{UI_STRINGS.appAppProcurementVendorsIdPage.whenAcceptingTheseRemarksArePublishedToTheAuditTrailWhenReturningTheseCommentsGuideTheProjectUserSCorrections}</p>
                  </div>
                )}

                {/* Decision History Audit Log if available */}
                {(viewRatingModal.decisionHistory?.length > 0 || viewRatingModal.criteriaDetailsParsed?.history?.length > 0) && (
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-bold text-slate-700 block">{UI_STRINGS.appAppProcurementVendorsIdPage.lifecycleAuditHistory}</span>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                          <tr>
                            <th className="p-2.5">{UI_STRINGS.common.action}</th>
                            <th className="p-2.5">{UI_STRINGS.common.user}</th>
                            <th className="p-2.5">{UI_STRINGS.common.timestamp}</th>
                            <th className="p-2.5">{UI_STRINGS.appAppProcurementVendorsIdPage.notesComments}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {(viewRatingModal.decisionHistory || viewRatingModal.criteriaDetailsParsed?.history || []).map((h: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-bold text-slate-800">{h.action}</td>
                              <td className="p-2.5 text-slate-600">{h.performedByName || h.performedByRole || UI_STRINGS.common.user}</td>
                              <td className="p-2.5 text-slate-500 font-mono text-[11px]">{new Date(h.timestamp).toLocaleString()}</td>
                              <td className="p-2.5 text-slate-700">{h.comments || h.notes || UI_STRINGS.common.copy4s9bsz}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer / Section C: Decision Buttons */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setViewRatingModal(null)}
                className="btn btn-secondary text-xs"
              >{UI_STRINGS.common.close}</button>

              <div className="flex items-center gap-2">
                {/* If status is SUBMITTED and user has approver rights */}
                {viewRatingModal.status === 'SUBMITTED' && (currentUserRole === 'PROJECT_APPROVER' || currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'CLIENT_ADMIN') && (
                  <>
                    <button
                      type="button"
                      disabled={submittingDecision}
                      onClick={() => handleApproverDecision('RETURN')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-300 rounded-lg hover:bg-rose-100 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                      <span>{UI_STRINGS.appAppProcurementVendorsIdPage.rejectReturnForCorrection}</span>
                    </button>
                    <button
                      type="button"
                      disabled={submittingDecision}
                      onClick={() => setConfirmAcceptOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{UI_STRINGS.common.acceptRating}</span>
                    </button>
                  </>
                )}

                {/* If user can edit (Draft or Returned) and is Project User */}
                {(viewRatingModal.status === 'DRAFT' || viewRatingModal.status === 'RETURNED_FOR_CORRECTION') && currentUserRole !== 'PROCUREMENT_USER' && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = viewRatingModal;
                      setViewRatingModal(null);
                      openEditRatingModal(r);
                    }}
                    className="btn btn-primary text-xs inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{UI_STRINGS.appAppProcurementVendorsIdPage.editAssessment}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM ACCEPT MODAL ── */}
      {confirmAcceptOpen && viewRatingModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-6 space-y-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.confirmVendorRatingAcceptance}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">{UI_STRINGS.appAppProcurementVendorsIdPage.areYouSureYouWantToApproveThisPerformanceAssessmentForPPO}<strong className="font-mono text-blue-700">{viewRatingModal.ppo?.ppoNumber}</strong>{UI_STRINGS.common.copyg3u9vy}</p>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <p className="font-bold">{UI_STRINGS.appAppProcurementVendorsIdPage.workflowActionsOnAcceptance}</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                <li>{UI_STRINGS.appAppProcurementVendorsIdPage.locksTheAssessmentAgainstOrdinaryEditing}</li>
                <li>{UI_STRINGS.appAppProcurementVendorsIdPage.publishesWeightedScore}{viewRatingModal.overallScore}{UI_STRINGS.appAppProcurementVendorsIdPage.copy1yzf9h9}</li>
                <li>{UI_STRINGS.appAppProcurementVendorsIdPage.makesApprovedRatingAvailableToProcurementUsersInReadOnlyMode}</li>
              </ul>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={submittingDecision}
                onClick={() => setConfirmAcceptOpen(false)}
                className="btn btn-secondary text-xs"
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                disabled={submittingDecision}
                onClick={() => handleApproverDecision('ACCEPT')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs"
              >
                {submittingDecision ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{UI_STRINGS.appAppProcurementVendorsIdPage.accepting}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{UI_STRINGS.appAppProcurementVendorsIdPage.confirmAcceptance}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT VENDOR PROFILE (COMPACT & VIEWPORT-CONSTRAINED) ── */}
      {showEditModal && (
        <div
          className="app-content-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditModal(false);
            }
          }}
        >
          <div
            className="bg-white rounded-[16px] shadow-2xl w-[84%] max-w-[1150px] max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
            style={{
              border: '6px solid #123B7A',
              boxShadow: '0 20px 45px -10px rgba(18, 59, 122, 0.35), 0 0 0 1px rgba(18, 59, 122, 0.1)',
            }}
          >
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4 text-[#123B7A]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{UI_STRINGS.appAppProcurementVendorsIdPage.editVendorProfile}</h3>
                    {vendor?.code && (
                      <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {vendor.code}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5">{UI_STRINGS.appAppProcurementVendorsIdPage.updateCoreContactDetailsOperationalCategoriesAndStatutoryComplianceRecords}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                aria-label={UI_STRINGS.appAppProcurementVendorsIdPage.closeModal}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body (Scrolls internally without scrolling application) */}
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
                {/* SECTION 1: VENDOR & CONTACT INFORMATION */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                  <div className="bg-blue-50/80 border-b border-blue-100 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-blue-700" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{UI_STRINGS.appAppProcurementVendorsIdPage.section1VendorContactInformation}</h4>
                    </div>
                    <span className="text-[11px] text-blue-600 font-medium">{UI_STRINGS.appAppProcurementVendorsIdPage.coreIdentityOperations}</span>
                  </div>

                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Row 1: Legal Name (spans 2 cols) */}
                    <div className="md:col-span-2">
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.vendorLegalBusinessName}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.common.eGApexInfrastructureContractingPvtLtd}
                        required
                      />
                    </div>

                    {/* Row 1: Classification */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.vendorClassification}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <select
                        value={editForm.vendorType || 'CLIENT_VENDOR'}
                        onChange={(e) => setEditForm({ ...editForm, vendorType: e.target.value })}
                        className="form-control"
                      >
                        <option value="CLIENT_VENDOR">{UI_STRINGS.appAppProcurementVendorsIdPage.clientVendorNominated}</option>
                        <option value="PROCUCEV_VENDOR">{UI_STRINGS.common.procucevNetworkVendor}</option>
                      </select>
                    </div>

                    {/* Row 2: Contact Person */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.primaryContactPerson}</label>
                      <input
                        type="text"
                        value={editForm.contactPerson || ''}
                        onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.common.eGRajeshSharma}
                      />
                    </div>

                    {/* Row 2: Email */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.contactEmail}</label>
                      <input
                        type="email"
                        value={editForm.email || ''}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.eGContactApexinfraCom}
                      />
                    </div>

                    {/* Row 2: Phone */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.mobilePhoneNumber}</label>
                      <input
                        type="text"
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.eG919876543210}
                      />
                    </div>

                    {/* Row 3: Categories Handled */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.primaryCategoriesTrade}</label>
                      <input
                        type="text"
                        value={editForm.categories || ''}
                        onChange={(e) => setEditForm({ ...editForm, categories: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.eGCivilInteriorStructuralSteel}
                      />
                    </div>

                    {/* Row 3: Operating Location */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.operatingLocationCityRegion}</label>
                      <input
                        type="text"
                        value={editForm.operatingLocation || ''}
                        onChange={(e) => setEditForm({ ...editForm, operatingLocation: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.common.eGHyderabadTelangana}
                      />
                    </div>

                    {/* Row 3: Service Coverage */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.serviceCoverage}</label>
                      <select
                        value={editForm.serviceCoverage || 'Pan-India'}
                        onChange={(e) => setEditForm({ ...editForm, serviceCoverage: e.target.value })}
                        className="form-control"
                      >
                        <option value="Pan-India">{UI_STRINGS.common.panIndia}</option>
                        <option value="Regional (South)">{UI_STRINGS.appAppProcurementVendorsIdPage.regionalSouth}</option>
                        <option value="Regional (North)">{UI_STRINGS.appAppProcurementVendorsIdPage.regionalNorth}</option>
                        <option value="Regional (West)">{UI_STRINGS.appAppProcurementVendorsIdPage.regionalWest}</option>
                        <option value="Regional (East)">{UI_STRINGS.appAppProcurementVendorsIdPage.regionalEast}</option>
                        <option value="State-Only">{UI_STRINGS.appAppProcurementVendorsIdPage.stateOnly}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: BUSINESS & STATUTORY DETAILS */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                  <div className="bg-emerald-50/80 border-b border-emerald-100 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{UI_STRINGS.appAppProcurementVendorsIdPage.section2BusinessStatutoryDetails}</h4>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-medium">{UI_STRINGS.appAppProcurementVendorsIdPage.complianceCommercialStanding}</span>
                  </div>

                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Row 1: Legal Structure */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.legalStructure}</label>
                      <select
                        value={editForm.legalStructure || 'PRIVATE_LIMITED'}
                        onChange={(e) => setEditForm({ ...editForm, legalStructure: e.target.value })}
                        className="form-control"
                      >
                        <option value="PRIVATE_LIMITED">{UI_STRINGS.common.privateLimitedPvtLtd}</option>
                        <option value="PUBLIC_LIMITED">{UI_STRINGS.common.publicLimitedLtd}</option>
                        <option value="PARTNERSHIP">{UI_STRINGS.common.partnershipFirm}</option>
                        <option value="SOLE_PROPRIETORSHIP">{UI_STRINGS.common.proprietorship}</option>
                        <option value="LLP">{UI_STRINGS.common.lLPLimitedLiabilityPartnership}</option>
                        <option value="JOINT_VENTURE">{UI_STRINGS.common.jointVenture}</option>
                      </select>
                    </div>

                    {/* Row 1: GSTIN */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.gSTIN15Digits}</label>
                      <input
                        type="text"
                        maxLength={15}
                        value={editForm.gstin || ''}
                        onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })}
                        className="form-control font-mono uppercase font-semibold"
                        placeholder={UI_STRINGS.common.eG36AABCA1234F1Z5}
                      />
                    </div>

                    {/* Row 1: PAN */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.pAN10Digits}</label>
                      <input
                        type="text"
                        maxLength={10}
                        value={editForm.pan || ''}
                        onChange={(e) => setEditForm({ ...editForm, pan: e.target.value.toUpperCase() })}
                        className="form-control font-mono uppercase font-semibold"
                        placeholder={UI_STRINGS.common.eGAABCA1234F}
                      />
                    </div>

                    {/* Row 2: Website */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.companyWebsite}</label>
                      <input
                        type="url"
                        value={editForm.website || ''}
                        onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.common.httpsCompanyCom}
                      />
                    </div>

                    {/* Row 2: Years in Operation */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.appAppProcurementVendorsIdPage.yearsInOperation}</label>
                      <input
                        type="number"
                        min={0}
                        value={editForm.experienceYears ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, experienceYears: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.eG10}
                      />
                    </div>

                    {/* Row 2: Annual Turnover */}
                    <div>
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.annualTurnoverCrores}</label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={editForm.turnoverCrores ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, turnoverCrores: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.common.eG255}
                      />
                    </div>

                    {/* Row 3: Registered Business Address (Full Width) */}
                    <div className="col-span-full">
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.registeredBusinessAddress}</label>
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={editForm.address || ''}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.completeRegisteredCorporateOfficeAddressWithPINCode}
                        style={{ height: 'auto', minHeight: 48 }}
                      />
                    </div>

                    {/* Row 4: Product / Scope Capabilities (Full Width) */}
                    <div className="col-span-full">
                      <label className="text-[13px] font-semibold text-slate-700 block mb-1">{UI_STRINGS.common.productScopeCapabilities}</label>
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={editForm.capabilities || ''}
                        onChange={(e) => setEditForm({ ...editForm, capabilities: e.target.value })}
                        className="form-control"
                        placeholder={UI_STRINGS.appAppProcurementVendorsIdPage.eGGeneralCivilContractingInteriorFitoutsMEPEngineeringTurnkeyProjectExecution}
                        style={{ height: 'auto', minHeight: 48 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Compact Modal Footer */}
              <div className="px-5 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  <span>{UI_STRINGS.appAppProcurementVendorsIdPage.updatingDirectoryRecordFor}<strong className="text-slate-800">{vendor?.name}</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs cursor-pointer"
                  >{UI_STRINGS.common.cancel}</button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4.5 py-1.5 text-xs font-semibold rounded-lg bg-[#2563eb] hover:bg-blue-700 text-white transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {savingEdit ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />{UI_STRINGS.appAppProcurementVendorsIdPage.savingChanges}</>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />{UI_STRINGS.common.saveChanges}</>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VendorProfilePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>{UI_STRINGS.appAppProcurementVendorsIdPage.loadingVendorProfile}</div>
        </div>
      }
    >
      <VendorProfileContent />
    </Suspense>
  );
}
