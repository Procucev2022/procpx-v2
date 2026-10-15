'use client';
// src/app/(app)/procurement/vendors/[id]/page.tsx
// Corporate Vendor Profile — Enterprise Procucev Design System
// Overview | Evaluation (6 Rubrics) | PPO Performance | Documents & Audit
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import VendorSourcingDashboard from '@/components/VendorSourcingDashboard';
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
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface VendorData {
  id: string;
  code: string;
  name: string;
  vendorType: 'CLIENT_VENDOR' | 'PROCUCEV_VENDOR';
  onboardingStatus: string;
  qualificationStatus: string;
  qualificationScore: number | null;
  qualificationDecision: string | null;
  performanceScore: number | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  categories: string | null;
  operatingLocation: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  legalStructure: string | null;
  gstin: string | null;
  pan: string | null;
  website: string | null;
  address: string | null;
  experienceYears: number | null;
  turnoverCrores: number | null;
  capabilities: string | null;
  serviceCoverage: string | null;
  clientReferences: string | null;
  certifications: string | null;
  documents: string | null;
  status: string;
  createdAt: string;
  evaluations: any[];
  ppoRatings: any[];
  ppos: any[];
}

interface PerformanceSummary {
  ppoRatingsCount: number;
  averagePpoRating: number | null;
  avgQuality: number | null;
  avgDelivery: number | null;
  avgCommercial: number | null;
  avgResponsiveness: number | null;
  avgDocumentation: number | null;
  mostRecentRating: any | null;
}

export default function VendorProfilePage() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vendorId = params.id as string;
  const initialTab = searchParams.get('tab') || 'overview';

  const [activeTab, setActiveTab] = useState<'overview' | 'evaluation' | 'performance' | 'documents' | 'sourcing-dashboard'>(
    initialTab as any
  );
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
    comments: '',
    supportingEvidence: '',
  });
  const [submittingPpoRating, setSubmittingPpoRating] = useState(false);
  const [ppoRatingFeedback, setPpoRatingFeedback] = useState<string | null>(null);

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
        throw new Error(data.error || 'Failed to load vendor profile');
      }
      const v = data.vendor || data.data?.vendor;
      setVendor(v);
      setPerformanceSummary(data.performanceSummary || data.data?.performanceSummary || null);
      setEligiblePpos(data.eligiblePposToRate || data.data?.eligiblePposToRate || []);
      setAuditLogs(data.auditLogs || data.data?.auditLogs || []);

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
        throw new Error(data.error || 'AI Evaluation failed');
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
        throw new Error(data.error || 'Failed to submit evaluation');
      }
      toast.success('Vendor details submitted successfully.', vendor?.code, selectedQualificationStatus);
      setEvaluationFeedback('Vendor details submitted successfully.');
      await fetchVendorProfile();
    } catch (err: any) {
      setEvaluationFeedback(`Error: ${err.message}`);
    } finally {
      setSubmittingEvaluation(false);
    }
  }

  async function handleSubmitPpoRating(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPpoId) {
      setPpoRatingFeedback('Please select a completed PPO to evaluate.');
      return;
    }
    try {
      setSubmittingPpoRating(true);
      setPpoRatingFeedback(null);
      const res = await fetch(`/api/procurement/vendors/${vendorId}/ppo-ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ppoId: selectedPpoId,
          ...ppoRatingForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit PPO rating');
      }
      setShowRateModal(false);
      setPpoRatingFeedback(null);
      await fetchVendorProfile();
      setActiveTab('performance');
    } catch (err: any) {
      setPpoRatingFeedback(`Error: ${err.message}`);
    } finally {
      setSubmittingPpoRating(false);
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
        throw new Error(data.error || 'Failed to save changes');
      }
      toast.success('Vendor details submitted successfully.', vendor?.code);
      setShowEditModal(false);
      await fetchVendorProfile();
    } catch (err: any) {
      alert(`Error updating profile: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
        <RefreshCw className="w-8 h-8 text-blue-700 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading vendor profile...</p>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="w-full">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-xl mx-auto">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <h2 className="text-base font-semibold text-red-900">Unable to load vendor profile</h2>
          <p className="text-sm text-red-700 mt-1">{error || 'Vendor record not found or access denied.'}</p>
          <Link
            href="/procurement/vendors"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Vendor Directory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6">
      {/* ── 1. VENDOR PROFILE HEADER ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        {/* Row 1: Breadcrumb and Vendor Code on the first row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <Link
              href="/procurement/vendors"
              className="hover:text-blue-700 flex items-center gap-1 font-medium text-slate-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Vendor Management
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-800">{vendor.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vendor Code:</span>
            <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-semibold border border-slate-200">
              {vendor.code}
            </span>
          </div>
        </div>

        {/* Row 2: Vendor Name Heading, Badges, and Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              {vendor.name}
            </h1>

            {/* Separate, properly spaced badges */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Vendor Type Badge */}
              {vendor.vendorType === 'CLIENT_VENDOR' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  Client Vendor
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  Procucev Vendor
                </span>
              )}

              {/* Onboarding Status Badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                vendor.onboardingStatus === 'ONBOARDED'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                <Clock className="w-3.5 h-3.5" />
                {vendor.onboardingStatus === 'ONBOARDED' ? 'Profile Complete' : 'Profile Incomplete / Draft'}
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
              onClick={() => setShowEditModal(true)}
              className="btn btn-secondary text-xs"
            >
              <Edit3 className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
              Edit Profile
            </button>
            <button
              onClick={handleRunAiEvaluation}
              disabled={aiEvaluating}
              className="btn btn-primary text-xs"
            >
              {aiEvaluating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ marginRight: 6 }} />
                  Analyzing Evidence...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
                  Run AI Evaluation
                </>
              )}
            </button>
          </div>
        </div>

        {/* Row 3: Category, Contact Person, and Email in a neatly aligned secondary row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Category:</span>
            <span className="font-semibold text-slate-800">{vendor.categories || 'General Procurement'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Contact Person:</span>
            <span className="font-medium text-slate-800">{vendor.contactPerson || 'Not Assigned'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Email:</span>
            <span className="font-medium text-slate-800">{vendor.email || 'Not Provided'}</span>
          </div>
          {vendor.phone && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Phone:</span>
              <span className="text-slate-800">{vendor.phone}</span>
            </div>
          )}
          {vendor.operatingLocation && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Location:</span>
              <span className="text-slate-800">{vendor.operatingLocation}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. THREE EQUAL-WIDTH KPI CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
        {/* KPI 1: Vendor Qualification Score */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Vendor Qualification Score
            </span>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
                {vendor.qualificationScore !== null ? `${vendor.qualificationScore}%` : 'Not Evaluated'}
              </span>
              {vendor.qualificationScore !== null && (
                <span className="text-xs text-slate-500 font-medium">/ 100</span>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-3 text-xs">
            <span className="text-slate-500">Qualification State:</span>
            {vendor.qualificationScore !== null ? (
              <span className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                vendor.qualificationScore >= 80 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                vendor.qualificationScore >= 65 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {vendor.qualificationScore >= 80 ? 'Recommended (80–100)' :
                 vendor.qualificationScore >= 65 ? 'Conditional (65–79)' : 'Review Required (<65)'}
              </span>
            ) : (
              <span className="text-slate-400 font-medium italic">Pending Evaluation</span>
            )}
          </div>
        </div>

        {/* KPI 2: PPO Performance */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              PPO Performance
            </span>
            <div className="flex items-baseline gap-2 pt-1">
              {performanceSummary?.averagePpoRating !== null ? (
                <>
                  <span className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
                    {performanceSummary?.averagePpoRating}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">/ 5.0</span>
                  <div className="flex items-center text-amber-500 ml-1">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  </div>
                </>
              ) : (
                <span className="text-2xl font-bold text-slate-400 font-mono">
                  Not Evaluated
                </span>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-3 text-xs">
            <span className="text-slate-500">Rated Completed Orders:</span>
            <span className="font-semibold text-slate-800">
              {performanceSummary?.ppoRatingsCount
                ? `${performanceSummary.ppoRatingsCount} Completed Order${performanceSummary.ppoRatingsCount > 1 ? 's' : ''}`
                : '0 Completed Orders'}
            </span>
          </div>
        </div>

        {/* KPI 3: Evaluation Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Evaluation Status
            </span>
            <div className="flex items-center gap-2 pt-1.5">
              <span className={`text-base font-bold ${
                vendor.qualificationStatus === 'QUALIFIED' ? 'text-emerald-700' :
                vendor.qualificationStatus === 'CONDITIONALLY_QUALIFIED' ? 'text-amber-700' :
                vendor.qualificationStatus === 'NOT_QUALIFIED' ? 'text-rose-700' :
                'text-slate-700'
              }`}>
                {vendor.qualificationStatus.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-3 text-xs">
            <span className="text-slate-500">Requirements:</span>
            <span className="text-slate-700 font-medium truncate max-w-[180px]">
              {vendor.gstin && vendor.pan
                ? 'Statutory IDs Verified'
                : 'Statutory or Financials Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. STANDARD ENTERPRISE HORIZONTAL TAB BAR ── */}
      <div className="tabs">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
        >
          <Building2 className="w-4 h-4" />
          Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('evaluation')}
          className={`tab-btn ${activeTab === 'evaluation' ? 'active' : ''}`}
        >
          <Sparkles className="w-4 h-4" />
          Evaluation (6 Rubrics & AI)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('performance')}
          className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
        >
          <Star className="w-4 h-4" />
          PPO Performance
          <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {performanceSummary?.ppoRatingsCount || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
        >
          <FileText className="w-4 h-4" />
          Documents & Audit
          <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {auditLogs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sourcing-dashboard')}
          className={`tab-btn ${activeTab === 'sourcing-dashboard' ? 'active' : ''}`}
        >
          <Layers className="w-4 h-4" />
          Sourcing & Orders (Preview)
        </button>
      </div>

      {/* ── 4. TAB PANELS ── */}

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* Panel 1 — Legal Identity */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Legal Identity</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Vendor Legal Name</span>
                <span className="font-semibold text-slate-900 mt-1 block text-sm">{vendor.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Vendor Code</span>
                <span className="font-mono font-semibold text-slate-800 mt-1 block text-sm">{vendor.code}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Vendor Classification</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.vendorType === 'CLIENT_VENDOR' ? 'Client Vendor' : 'Procucev Vendor'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Legal Structure</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.legalStructure || 'Not Provided'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Onboarding Status</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.onboardingStatus === 'ONBOARDED' ? 'Profile Complete' : 'Profile Incomplete / Draft'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Qualification Status</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.qualificationStatus.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Panel 2 — Contact Information */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserCheck className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Contact Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Contact Person</span>
                <span className="font-semibold text-slate-900 mt-1 block text-sm">
                  {vendor.contactPerson || 'Not Provided'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Email</span>
                <span className="font-semibold text-slate-900 mt-1 block truncate">
                  {vendor.email || 'Not Provided'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Phone</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.phone || 'Not Provided'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Operating Location</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.operatingLocation || 'Not Provided'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Business Address</span>
                <p className="text-slate-800 font-medium mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {vendor.address || 'Not Provided'}
                </p>
              </div>
            </div>
          </div>

          {/* Panel 3 — Business Profile */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Business Profile</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Primary Category</span>
                <span className="font-semibold text-slate-900 mt-1 block text-sm">
                  {vendor.categories || 'Not Specified'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Service Coverage</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.serviceCoverage || 'Not Specified'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Years in Operation</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.experienceYears ? `${vendor.experienceYears} Years` : 'Not Specified'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Annual Turnover</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.turnoverCrores ? `₹ ${vendor.turnoverCrores} Crores` : 'Not Specified'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Capabilities</span>
                <p className="text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 mt-1 leading-relaxed">
                  {vendor.capabilities || 'No declared capabilities on file.'}
                </p>
              </div>
            </div>
          </div>

          {/* Panel 4 — Compliance & References */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Compliance & References</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">GSTIN</span>
                {vendor.gstin ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-mono font-semibold text-slate-900">{vendor.gstin}</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      Validated
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400 italic mt-1 block">Not Provided</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">PAN</span>
                {vendor.pan ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-mono font-semibold text-slate-900">{vendor.pan}</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      Validated
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400 italic mt-1 block">Not Provided</span>
                )}
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Registration and Certification Status</span>
                <span className="font-semibold text-slate-800 mt-1 block">
                  {vendor.certifications || 'None Reported'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">Previous Clients</span>
                <p className="text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 mt-1 leading-relaxed">
                  {vendor.clientReferences ? vendor.clientReferences.split('\n')[0] : 'None Reported'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block font-medium uppercase tracking-wider text-[11px]">References</span>
                <p className="text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 mt-1 leading-relaxed">
                  {vendor.clientReferences || 'No customer references declared on file.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: EVALUATION (AI RUBRIC SCORECARD & HUMAN APPROVAL) ── */}
      {activeTab === 'evaluation' && (
        <div className="space-y-6">
          {/* Rules Banner */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-700" />
                <h3 className="text-sm font-bold text-blue-950">Standard 6-Rubric Vendor Evaluation Framework</h3>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                Weights: Business Profile (15%), Financial Strength (20%), Previous Clients (20%), References (15%), Technical Capability (20%), Compliance & Risk (10%). AI extracts facts from evidence; Category Manager retains final human approval.
              </p>
            </div>
            <button
              onClick={handleRunAiEvaluation}
              disabled={aiEvaluating}
              className="btn btn-primary text-xs shrink-0"
            >
              {aiEvaluating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ marginRight: 6 }} />
                  Analyzing Profile...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
                  Run AI-Assisted Evaluation
                </>
              )}
            </button>
          </div>

          {evaluationFeedback && (
            <div className={`p-3.5 rounded-lg text-xs font-semibold border ${
              evaluationFeedback.startsWith('Error')
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {evaluationFeedback}
            </div>
          )}

          {/* AI Evidence Analysis Findings (if generated) */}
          {aiResult && (
            <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold">AI Evidence Extraction & Analysis Summary</span>
                </div>
                <span className="text-xs font-mono text-slate-300">
                  Recommendation: {aiResult.qualificationOutcome} | Score: {aiResult.overallWeightedScore}%
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{aiResult.executiveSummary}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified Strengths
                  </span>
                  <ul className="space-y-1 text-slate-300 list-disc list-inside">
                    {aiResult.strengths?.map((s: string, idx: number) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Verification Gaps
                  </span>
                  <ul className="space-y-1 text-slate-300 list-disc list-inside">
                    {(aiResult.verificationGaps || aiResult.missingEvidenceGaps)?.map((g: string, idx: number) => (
                      <li key={idx}>{g}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                  <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Critical Risks
                  </span>
                  <ul className="space-y-1 text-slate-300 list-disc list-inside">
                    {((aiResult.criticalRiskFlags || aiResult.riskFactors)?.length > 0) ? (
                      (aiResult.criticalRiskFlags || aiResult.riskFactors).map((r: string, idx: number) => (
                        <li key={idx}>{r}</li>
                      ))
                    ) : (
                      <li>No critical statutory risk flags detected.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 6-Rubrics Structured Scorecard Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Evaluation Criteria Scorecard</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calibrate score (0–100) for each category based on available documentation.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 font-medium">Weighted Score:</span>
                <span className="text-lg font-bold text-slate-900 ml-2 font-mono">{calculatedOverallScore}%</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {/* 1. Business Profile and Experience */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">1. Business Profile and Experience</span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Weight: 15%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Years of operation, legal incorporation, geographic coverage, and operational infrastructure.
                  </p>
                  {(aiResult?.criteria?.businessProfile || aiResult?.rubricScores?.businessProfile) && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <strong>AI Evidence:</strong> {aiResult.criteria?.businessProfile?.rationale || aiResult.criteria?.businessProfile?.evidenceFound?.join(', ') || aiResult.rubricScores?.businessProfile?.evidenceCitation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <label className="text-[11px] text-slate-400 block font-medium">Score (0–100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rubricScores.businessProfile}
                      onChange={(e) => setRubricScores({ ...rubricScores, businessProfile: Number(e.target.value) })}
                      className="w-20 px-2 py-1 text-sm font-semibold text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                  </div>
                  <div className="text-right w-16">
                    <span className="text-[11px] text-slate-400 block font-medium">Contribution</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {(rubricScores.businessProfile * 0.15).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Financial Strength */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">2. Financial Strength</span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Weight: 20%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Annual turnover, solvency indicators, liquidity, audited balance sheet stability.
                  </p>
                  {(aiResult?.criteria?.financialStrength || aiResult?.rubricScores?.financialStrength) && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <strong>AI Evidence:</strong> {aiResult.criteria?.financialStrength?.rationale || aiResult.criteria?.financialStrength?.evidenceFound?.join(', ') || aiResult.rubricScores?.financialStrength?.evidenceCitation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <label className="text-[11px] text-slate-400 block font-medium">Score (0–100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rubricScores.financialStrength}
                      onChange={(e) => setRubricScores({ ...rubricScores, financialStrength: Number(e.target.value) })}
                      className="w-20 px-2 py-1 text-sm font-semibold text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                  </div>
                  <div className="text-right w-16">
                    <span className="text-[11px] text-slate-400 block font-medium">Contribution</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {(rubricScores.financialStrength * 0.20).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Previous Clients and Project Experience */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">3. Previous Clients and Project Experience</span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Weight: 20%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Customer track record, order values, completion history, similar scope execution.
                  </p>
                  {(aiResult?.criteria?.previousClients || aiResult?.rubricScores?.previousClients) && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <strong>AI Evidence:</strong> {aiResult.criteria?.previousClients?.rationale || aiResult.criteria?.previousClients?.evidenceFound?.join(', ') || aiResult.rubricScores?.previousClients?.evidenceCitation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <label className="text-[11px] text-slate-400 block font-medium">Score (0–100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rubricScores.previousClients}
                      onChange={(e) => setRubricScores({ ...rubricScores, previousClients: Number(e.target.value) })}
                      className="w-20 px-2 py-1 text-sm font-semibold text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                  </div>
                  <div className="text-right w-16">
                    <span className="text-[11px] text-slate-400 block font-medium">Contribution</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {(rubricScores.previousClients * 0.20).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. References and Verifiable Track Record */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">4. References and Verifiable Track Record</span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Weight: 15%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Direct reference verification, client contacts, feedback reliability, performance certificates.
                  </p>
                  {(aiResult?.criteria?.references || aiResult?.rubricScores?.references) && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <strong>AI Evidence:</strong> {aiResult.criteria?.references?.rationale || aiResult.criteria?.references?.evidenceFound?.join(', ') || aiResult.rubricScores?.references?.evidenceCitation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <label className="text-[11px] text-slate-400 block font-medium">Score (0–100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rubricScores.references}
                      onChange={(e) => setRubricScores({ ...rubricScores, references: Number(e.target.value) })}
                      className="w-20 px-2 py-1 text-sm font-semibold text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                  </div>
                  <div className="text-right w-16">
                    <span className="text-[11px] text-slate-400 block font-medium">Contribution</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {(rubricScores.references * 0.15).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Technical / Category Capability */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">5. Technical / Category Capability</span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Weight: 20%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Category expertise, machinery/facilities, workforce capability, quality standards (ISO).
                  </p>
                  {(aiResult?.criteria?.technicalCapability || aiResult?.rubricScores?.technicalCapability) && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <strong>AI Evidence:</strong> {aiResult.criteria?.technicalCapability?.rationale || aiResult.criteria?.technicalCapability?.evidenceFound?.join(', ') || aiResult.rubricScores?.technicalCapability?.evidenceCitation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <label className="text-[11px] text-slate-400 block font-medium">Score (0–100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rubricScores.technicalCapability}
                      onChange={(e) => setRubricScores({ ...rubricScores, technicalCapability: Number(e.target.value) })}
                      className="w-20 px-2 py-1 text-sm font-semibold text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                  </div>
                  <div className="text-right w-16">
                    <span className="text-[11px] text-slate-400 block font-medium">Contribution</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {(rubricScores.technicalCapability * 0.20).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 6. Compliance and Risk */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">6. Compliance and Risk</span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Weight: 10%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Statutory tax filing, litigation check, sanctions, regulatory licences, document authenticity.
                  </p>
                  {(aiResult?.criteria?.complianceRisk || aiResult?.rubricScores?.complianceRisk) && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <strong>AI Evidence:</strong> {aiResult.criteria?.complianceRisk?.rationale || aiResult.criteria?.complianceRisk?.evidenceFound?.join(', ') || aiResult.rubricScores?.complianceRisk?.evidenceCitation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <label className="text-[11px] text-slate-400 block font-medium">Score (0–100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={rubricScores.complianceRisk}
                      onChange={(e) => setRubricScores({ ...rubricScores, complianceRisk: Number(e.target.value) })}
                      className="w-20 px-2 py-1 text-sm font-semibold text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                  </div>
                  <div className="text-right w-16">
                    <span className="text-[11px] text-slate-400 block font-medium">Contribution</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {(rubricScores.complianceRisk * 0.10).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Category Manager Final Qualification Decision Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Category Manager Qualification Decision & Governance
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  The LLM never makes the final qualification decision. Authorised review is required.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  80–100 Recommended
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  65–79 Conditional
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-rose-50 text-rose-800 border border-rose-200">
                  &lt;65 Not Recommended
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Formal Qualification Status *
                  </label>
                  <select
                    value={selectedQualificationStatus}
                    onChange={(e) => setSelectedQualificationStatus(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-blue-600 font-semibold"
                  >
                    <option value="QUALIFIED">QUALIFIED — Approved for RFQ & PPO awards</option>
                    <option value="CONDITIONALLY_QUALIFIED">CONDITIONALLY_QUALIFIED — Additional reviews or safeguards required</option>
                    <option value="NOT_QUALIFIED">NOT_QUALIFIED — Disqualified / Ineligible</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Evaluation Outcome Classification
                  </label>
                  <select
                    value={selectedQualificationOutcome}
                    onChange={(e) => setSelectedQualificationOutcome(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-blue-600 font-semibold"
                  >
                    <option value="RECOMMENDED">RECOMMENDED</option>
                    <option value="CONDITIONAL">CONDITIONAL</option>
                    <option value="NOT_RECOMMENDED">NOT_RECOMMENDED</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Evaluation Remarks & Audit Notes
                  </label>
                  <textarea
                    rows={3}
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    placeholder="Enter formal justification, verification notes, or conditional stipulations..."
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-blue-600"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={handleSubmitQualification}
                    disabled={submittingEvaluation}
                    className="btn btn-primary text-xs"
                  >
                    {submittingEvaluation ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ marginRight: 6 }} />
                        Recording Decision...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
                        Commit Qualification Decision ({calculatedOverallScore}%)
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
        <div className="space-y-6">
          {/* Separation Callout */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong>Order Execution Rating:</strong> PPO Performance ratings evaluate actual project deliveries across 5 criteria (Quality 30%, Delivery 25%, Commercial 20%, Responsiveness 15%, Documentation 10% on a 1–5 scale). It is maintained independently from the initial vendor qualification score.
            </div>
          </div>

          {/* Aggregated Performance Metrics Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Aggregated Performance Scorecard</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synthesized across {performanceSummary?.ppoRatingsCount || 0} completed procurement orders.
                </p>
              </div>

              {eligiblePpos.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedPpoId(eligiblePpos[0]?.id || '');
                    setShowRateModal(true);
                  }}
                  className="btn btn-primary text-xs shrink-0"
                >
                  <Star className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
                  Rate Completed Order ({eligiblePpos.length} Available)
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Overall Rating</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-extrabold text-slate-900 font-mono">
                    {performanceSummary?.averagePpoRating !== null ? performanceSummary?.averagePpoRating : '—'}
                  </span>
                  <span className="text-xs text-slate-400">/ 5.0</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">Weighted Summary</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Quality (30%)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-bold text-slate-900 font-mono">
                    {performanceSummary?.avgQuality !== null ? performanceSummary?.avgQuality : '—'}
                  </span>
                  <span className="text-xs text-slate-400">/ 5</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">Material & specs</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Delivery (25%)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-bold text-slate-900 font-mono">
                    {performanceSummary?.avgDelivery !== null ? performanceSummary?.avgDelivery : '—'}
                  </span>
                  <span className="text-xs text-slate-400">/ 5</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">Schedule milestone</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Commercial (20%)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-bold text-slate-900 font-mono">
                    {performanceSummary?.avgCommercial !== null ? performanceSummary?.avgCommercial : '—'}
                  </span>
                  <span className="text-xs text-slate-400">/ 5</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">Billing & contracts</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Resp. (15%)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-bold text-slate-900 font-mono">
                    {performanceSummary?.avgResponsiveness !== null ? performanceSummary?.avgResponsiveness : '—'}
                  </span>
                  <span className="text-xs text-slate-400">/ 5</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">Communication speed</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Docs (10%)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-bold text-slate-900 font-mono">
                    {performanceSummary?.avgDocumentation !== null ? performanceSummary?.avgDocumentation : '—'}
                  </span>
                  <span className="text-xs text-slate-400">/ 5</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">Handovers & closure</span>
              </div>
            </div>
          </div>

          {/* Historical PPO Ratings Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Individual Order Rating History ({vendor.ppoRatings?.length || 0})
              </h3>
            </div>

            {vendor.ppoRatings && vendor.ppoRatings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">PPO Number</th>
                      <th className="py-3 px-4">Project / Cost Centre</th>
                      <th className="py-3 px-4 text-center">Quality (30%)</th>
                      <th className="py-3 px-4 text-center">Delivery (25%)</th>
                      <th className="py-3 px-4 text-center">Commercial (20%)</th>
                      <th className="py-3 px-4 text-center">Resp. (15%)</th>
                      <th className="py-3 px-4 text-center">Docs (10%)</th>
                      <th className="py-3 px-4 text-center font-bold">Overall Rating</th>
                      <th className="py-3 px-4">Evaluated Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendor.ppoRatings.map((rating: any) => (
                      <tr key={rating.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-slate-900 block">{rating.ppo?.ppoNumber}</span>
                          <span className="text-[11px] text-slate-500 truncate max-w-[200px] block">{rating.ppo?.title}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="font-semibold text-slate-800 block">{rating.ppo?.project?.name || 'General Project'}</span>
                          <span className="text-[11px] text-slate-400">{rating.ppo?.costCentre?.name || 'Cost Centre'}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">{rating.qualityScore} / 5</td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">{rating.deliveryScore} / 5</td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">{rating.commercialComplianceScore} / 5</td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">{rating.responsivenessScore} / 5</td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">{rating.documentationClosureScore} / 5</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded font-mono font-bold text-xs bg-amber-50 text-amber-900 border border-amber-200">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            {rating.overallScore} / 5.0
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(rating.ratedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center space-y-2">
                <Star className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No PPO Performance Ratings Recorded</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {eligiblePpos.length > 0
                    ? `${eligiblePpos.length} completed purchase order(s) are eligible for performance review. Click 'Rate Completed Order' above.`
                    : 'Ratings are recorded after an issued purchase order (PPO) reaches completion.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: DOCUMENTS & AUDIT TRAIL ── */}
      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Supporting Documents Checklist */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileCheck2 className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Statutory Documents & Certifications</h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${vendor.gstin ? 'text-emerald-600' : 'text-slate-300'}`} />
                  <div>
                    <span className="font-semibold text-slate-900 block">GST Registration Certificate</span>
                    <span className="text-[11px] text-slate-400 font-mono">{vendor.gstin || 'Not Provided'}</span>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${vendor.gstin ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {vendor.gstin ? 'Verified' : 'Pending'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${vendor.pan ? 'text-emerald-600' : 'text-slate-300'}`} />
                  <div>
                    <span className="font-semibold text-slate-900 block">PAN Card Copy</span>
                    <span className="text-[11px] text-slate-400 font-mono">{vendor.pan || 'Not Provided'}</span>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${vendor.pan ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {vendor.pan ? 'Verified' : 'Pending'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${vendor.experienceYears ? 'text-emerald-600' : 'text-slate-300'}`} />
                  <div>
                    <span className="font-semibold text-slate-900 block">Company Profile & Facilities Scope</span>
                    <span className="text-[11px] text-slate-400">{vendor.experienceYears ? `${vendor.experienceYears} Years Vintage` : 'Not Submitted'}</span>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${vendor.experienceYears ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {vendor.experienceYears ? 'Provided' : 'Optional'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${vendor.turnoverCrores ? 'text-emerald-600' : 'text-slate-300'}`} />
                  <div>
                    <span className="font-semibold text-slate-900 block">Audited Financial Statements (CA Certified)</span>
                    <span className="text-[11px] text-slate-400">{vendor.turnoverCrores ? `₹ ${vendor.turnoverCrores} Cr Turnover` : 'Not Uploaded'}</span>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${vendor.turnoverCrores ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {vendor.turnoverCrores ? 'Provided' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Chronological Audit Logs */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Clock className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Governance & Audit History ({auditLogs.length})</h3>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {auditLogs.length > 0 ? (
                auditLogs.map((log: any) => (
                  <div key={log.id} className="text-xs p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-snug">{log.description}</p>
                    {log.user && (
                      <span className="text-[10px] text-slate-400 block pt-0.5">
                        Actor: {log.user.name} ({log.user.role})
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 italic p-6 text-center">No audit trail records found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RATE COMPLETED PPO ── */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Evaluate Completed Purchase Order Performance
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  5-criteria order execution evaluation on 1–5 scale.
                </p>
              </div>
              <button
                onClick={() => setShowRateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPpoRating} className="p-5 space-y-4">
              {ppoRatingFeedback && (
                <div className="p-2.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                  {ppoRatingFeedback}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Select Completed PPO *
                </label>
                <select
                  value={selectedPpoId}
                  onChange={(e) => setSelectedPpoId(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-blue-600 font-semibold"
                  required
                >
                  <option value="">-- Choose PPO to Evaluate --</option>
                  {eligiblePpos.map((ppo: any) => (
                    <option key={ppo.id} value={ppo.id}>
                      {ppo.ppoNumber} — {ppo.title} (Value: ₹{ppo.totalValue?.toLocaleString() || 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* 5 Rating Criteria */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Quality of Goods / Work (30%)</span>
                    <span className="text-[11px] text-slate-500 block">Compliance with BOQ specs, test certificates, defects</span>
                  </div>
                  <select
                    value={ppoRatingForm.qualityScore}
                    onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, qualityScore: Number(e.target.value) })}
                    className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded"
                  >
                    {[5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>{s} / 5</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Delivery / Timeliness (25%)</span>
                    <span className="text-[11px] text-slate-500 block">Adherence to PPO delivery dates, liquidated damage delays</span>
                  </div>
                  <select
                    value={ppoRatingForm.deliveryScore}
                    onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, deliveryScore: Number(e.target.value) })}
                    className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded"
                  >
                    {[5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>{s} / 5</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Commercial Compliance (20%)</span>
                    <span className="text-[11px] text-slate-500 block">Invoice accuracy, tax invoice validity, no spurious variations</span>
                  </div>
                  <select
                    value={ppoRatingForm.commercialComplianceScore}
                    onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, commercialComplianceScore: Number(e.target.value) })}
                    className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded"
                  >
                    {[5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>{s} / 5</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Responsiveness & Coordination (15%)</span>
                    <span className="text-[11px] text-slate-500 block">Site coordination, communication turnaround, escalation handling</span>
                  </div>
                  <select
                    value={ppoRatingForm.responsivenessScore}
                    onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, responsivenessScore: Number(e.target.value) })}
                    className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded"
                  >
                    {[5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>{s} / 5</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Documentation & Closure (10%)</span>
                    <span className="text-[11px] text-slate-500 block">Warranty handovers, manuals, E-way bills, final signoff</span>
                  </div>
                  <select
                    value={ppoRatingForm.documentationClosureScore}
                    onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, documentationClosureScore: Number(e.target.value) })}
                    className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded"
                  >
                    {[5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>{s} / 5</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Evaluator Comments & Observations
                </label>
                <textarea
                  rows={2}
                  value={ppoRatingForm.comments}
                  onChange={(e) => setPpoRatingForm({ ...ppoRatingForm, comments: e.target.value })}
                  placeholder="e.g. Delivered on schedule with zero damage, prompt test certificates."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPpoRating}
                  className="btn btn-primary text-xs"
                >
                  {submittingPpoRating ? 'Recording...' : 'Submit PPO Rating'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT VENDOR PROFILE ── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit Vendor Profile</h3>
                <p className="text-xs text-slate-500 mt-0.5">Update business profile and statutory details.</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Vendor Legal Name *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={editForm.contactPerson}
                    onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Operating Location</label>
                  <input
                    type="text"
                    value={editForm.operatingLocation}
                    onChange={(e) => setEditForm({ ...editForm, operatingLocation: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Categories Handled</label>
                  <input
                    type="text"
                    value={editForm.categories}
                    onChange={(e) => setEditForm({ ...editForm, categories: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={editForm.gstin}
                    onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })}
                    className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 uppercase font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">PAN</label>
                  <input
                    type="text"
                    value={editForm.pan}
                    onChange={(e) => setEditForm({ ...editForm, pan: e.target.value.toUpperCase() })}
                    className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 uppercase font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Years in Operation</label>
                  <input
                    type="number"
                    value={editForm.experienceYears}
                    onChange={(e) => setEditForm({ ...editForm, experienceYears: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Turnover (₹ Crores)</label>
                  <input
                    type="number"
                    value={editForm.turnoverCrores}
                    onChange={(e) => setEditForm({ ...editForm, turnoverCrores: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Business Address</label>
                <textarea
                  rows={2}
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn btn-primary text-xs"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
