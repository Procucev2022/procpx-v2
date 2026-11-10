'use client';
// app/(app)/dashboard/page.tsx - Role-aware dashboard
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import {
  Building2,
  ShieldCheck,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  FileText,
  Scale,
  Award,
  Briefcase,
  Folder,
  AlertTriangle,
  Users,
  Lock,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowRight,
  Eye,
  MessageSquare,
  HelpCircle,
  RotateCcw,
  XCircle,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import ApprovalChatDrawer from '@/components/ApprovalChatDrawer';
import { useToast } from '@/components/ui/Toast';
import PrDetailModal from '@/components/PrDetailModal';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { DashboardRegisterRfqLinkItem } from "@app-types/app/(app)/dashboard/page.types";


function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    DRAFT: 'badge-draft',
    SUBMITTED: 'badge-submitted',
    APPROVED: 'badge-approved',
    REJECTED: 'badge-rejected',
    UNDER_REVIEW: 'badge-review',
    BOQ_REVIEW: 'badge-review',
    BOQ_PREPARATION: 'badge-submitted',
    BOQ_APPROVED: 'badge-approved',
    CANCELLED: 'badge-draft',
  };
  return <span className={`badge ${cls[status] || 'badge-draft'}`}>{status?.replace(/_/g, ' ')}</span>;
}

function getRegisterRfqHref(item: DashboardRegisterRfqLinkItem) {
  if (typeof item.createRfqUrl === 'string' && item.createRfqUrl) return item.createRfqUrl;
  const params = new URLSearchParams();
  const revisionId = item.boqRevisionId || item.revisionId || item.id;
  const projectId = item.projectId || item.project?.id;
  if (revisionId) params.set('revisionId', revisionId);
  if (projectId) params.set('projectId', projectId);
  return `/procurement/rfqs/new${params.size ? `?${params.toString()}` : ''}`;
}

export default function DashboardPage() {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [activeCardFilter, setActiveCardFilter] = useState<string | null>(null);
  const [expandedPrs, setExpandedPrs] = useState<Record<string, boolean>>({});
  const [showCategoryGovernance, setShowCategoryGovernance] = useState(false);
  const [loadingMoreTenants, setLoadingMoreTenants] = useState(false);

  // PROJECT_APPROVER actions state
  const [approverSelectedPr, setApproverSelectedPr] = useState<any | null>(null);
  const [approverReviewModalOpen, setApproverReviewModalOpen] = useState(false);
  const [approverRevertModalOpen, setApproverRevertModalOpen] = useState(false);
  const [approverRevertReason, setApproverRevertReason] = useState('');
  const [approverRejectModalOpen, setApproverRejectModalOpen] = useState(false);
  const [approverRejectReason, setApproverRejectReason] = useState('');
  const [approverProcessing, setApproverProcessing] = useState(false);
  const [approverLinesLoading, setApproverLinesLoading] = useState(false);
  const [approverStatusMessage, setApproverStatusMessage] = useState('');
  const [approverActionError, setApproverActionError] = useState('');
  const [approverChatDrawerOpen, setApproverChatDrawerOpen] = useState(false);
  const [approverChatPr, setApproverChatPr] = useState<any | null>(null);
  const [approverIsEnquiryMode, setApproverIsEnquiryMode] = useState(false);

  const loadMoreApproverLines = async () => {
    const pr = approverSelectedPr;
    const cursor = pr?.linePagination?.nextCursor;
    if (!pr?.id || !cursor || approverLinesLoading) return;

    setApproverLinesLoading(true);
    try {
      const response = await fetch(`/api/pr/${encodeURIComponent(pr.id)}/lines?cursor=${encodeURIComponent(cursor)}`);
      const result = await response.json();
      if (!response.ok) {
        toast.error({
          title: UI_STRINGS.common.error,
          message: result.error || UI_STRINGS.common.userMessages.failedToFetchProcurementRequests,
        });
        return;
      }

      setApproverSelectedPr((current: unknown) => {
        if (!current || typeof current !== 'object' || !('id' in current)) return current;
        const selected = current as { id?: unknown; lines?: unknown[]; [key: string]: unknown };
        if (selected.id !== pr.id) return current;
        return {
          ...selected,
          lines: [...(selected.lines || []), ...(Array.isArray(result.lines) ? result.lines : [])],
          linePagination: result.linePagination,
        };
      });
    } catch {
      toast.error({
        title: UI_STRINGS.common.error,
        message: UI_STRINGS.common.userMessages.failedToFetchProcurementRequests,
      });
    } finally {
      setApproverLinesLoading(false);
    }
  };

  // Standardised PR Details Modal state
  const [selectedPrForDetails, setSelectedPrForDetails] = useState<any | null>(null);
  const [prDetailsModalOpen, setPrDetailsModalOpen] = useState(false);

  const handleOpenPrDetails = (pr: any) => {
    setSelectedPrForDetails(pr);
    setPrDetailsModalOpen(true);
  };

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const d = await res.json();
        if (d.role === 'VENDOR') {
          window.location.href = '/vendor-portal/dashboard';
          return;
        }
        setData(d);
        if ((d.role === 'PROCUREMENT_USER' || d.role === 'CATEGORY_MANAGER') && (d.boqRegister || d.prRegister)) {
          const list = d.boqRegister || d.prRegister;
          const initialExpanded: Record<string, boolean> = {};
          list.forEach((item: any) => {
            if (item.rfqs && item.rfqs.length > 0) {
              initialExpanded[item.id] = true;
            }
          });
          setExpandedPrs(initialExpanded);
        }
      } else if (res.status === 403) {
        const sRes = await fetch('/api/auth/session').catch(() => null);
        const sData = await sRes?.json().catch(() => null);
        if (sData?.user?.role === 'VENDOR') {
          window.location.href = '/vendor-portal/dashboard';
          return;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreTenants = async () => {
    const nextPage = Number(data.tenantListPage) + 1;
    setLoadingMoreTenants(true);
    try {
      const res = await fetch(`/api/dashboard?page=${nextPage}&pageSize=${data.tenantListPageSize}`);
      const nextData = await res.json();
      if (!res.ok || !Array.isArray(nextData.tenantList)) {
        throw new Error(UI_STRINGS.common.userMessages.failedToFetchDashboardData);
      }
      setData({
        ...data,
        ...nextData,
        tenantList: [...data.tenantList, ...nextData.tenantList],
      });
    } catch {
      toast.error({ title: UI_STRINGS.common.error, message: UI_STRINGS.common.userMessages.failedToFetchDashboardData });
    } finally {
      setLoadingMoreTenants(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleApproverApprove = async (prId: string) => {
    setApproverProcessing(true);
    setApproverActionError('');
    try {
      const res = await fetch(`/api/pr/${prId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: 'Technical requirement and quantity verified.' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.approvalFailed }));
      }
      toast.success(UI_STRINGS.common.bOQApprovedSuccessfully, approverSelectedPr?.prNumber || prId, UI_STRINGS.common.userMessages.releasedToCategoryManager);
      setApproverStatusMessage(UI_STRINGS.common.bOQApprovedSuccessfully);
      setApproverReviewModalOpen(false);
      loadDashboard();
    } catch (err: any) {
      setApproverActionError(err.message);
    } finally {
      setApproverProcessing(false);
    }
  };

  const handleApproverRevert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approverSelectedPr || !approverRevertReason.trim()) return;
    setApproverProcessing(true);
    setApproverActionError('');
    try {
      const res = await fetch(`/api/pr/${approverSelectedPr.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: approverRevertReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.revertFailed }));
      }
      setApproverRevertModalOpen(false);
      setApproverRevertReason('');
      setApproverSelectedPr(null);
      setApproverStatusMessage(UI_STRINGS.common.bOQSuccessfullyReturnedToProjectUserForCorrection);
      loadDashboard();
    } catch (err: any) {
      setApproverActionError(err.message);
    } finally {
      setApproverProcessing(false);
    }
  };

  const handleApproverReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approverSelectedPr || !approverRejectReason.trim()) return;
    setApproverProcessing(true);
    setApproverActionError('');
    try {
      const res = await fetch(`/api/pr/${approverSelectedPr.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: approverRejectReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.rejectionFailed }));
      }
      setApproverRejectModalOpen(false);
      setApproverRejectReason('');
      setApproverSelectedPr(null);
      setApproverStatusMessage(UI_STRINGS.common.bOQRejectedAndReturnedToRequesterWithFeedbackRemarks);
      loadDashboard();
    } catch (err: any) {
      setApproverActionError(err.message);
    } finally {
      setApproverProcessing(false);
    }
  };

  const openApproverEnquiry = (pr: any) => {
    setApproverChatPr(pr);
    setApproverIsEnquiryMode(true);
    setApproverChatDrawerOpen(true);
  };

  const openApproverChat = (pr: any) => {
    setApproverChatPr(pr);
    setApproverIsEnquiryMode(false);
    setApproverChatDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="page-content">
        <div className="loading-overlay"><div className="spinner" />{UI_STRINGS.appAppDashboardPage.loadingRoleDashboard}</div>
      </div>
    );
  }
  if (!data) return null;

  // ============================================================
  // 1. SUPER_ADMIN VIEW
  // ============================================================
  if (data.role === 'SUPER_ADMIN') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">{UI_STRINGS.appAppDashboardPage.superAdminPlatformOverview}</div>
            <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.crossTenantInfrastructurePlatformSecurity}</div>
          </div>
          <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>{UI_STRINGS.appAppDashboardPage.roleSUPERADMIN}</span>
        </div>

        <div className="kpi-grid mb-6">
          <div className="kpi-card" style={{ borderLeft: '3px solid #6366f1' }}>
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.activeTenants}</div>
            <div className="kpi-value" style={{ color: '#6366f1' }}>{data.tenants ?? 0}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.platformProjects}</div>
            <div className="kpi-value">{data.projects ?? 0}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.totalUsers}</div>
            <div className="kpi-value">{data.users ?? 0}</div>
          </div>
        </div>

        {/* Tenant Breakdown */}
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} />{UI_STRINGS.appAppDashboardPage.enterpriseTenantIsolationMatrix}</span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_STRINGS.appAppDashboardPage.tenantName}</th>
                  <th>{UI_STRINGS.appAppDashboardPage.tenantSlug}</th>
                  <th>{UI_STRINGS.common.status}</th>
                  <th>{UI_STRINGS.common.projects}</th>
                  <th>{UI_STRINGS.common.users}</th>
                  <th>{UI_STRINGS.appAppDashboardPage.isolationBoundary}</th>
                </tr>
              </thead>
              <tbody>
                {data.tenantList?.map((t: any) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="font-mono text-muted">{t.slug}</td>
                    <td><span className="badge badge-approved">{t.status}</span></td>
                    <td style={{ fontWeight: 600 }}>{t.projectCount}</td>
                    <td>{t.userCount}</td>
                    <td><span className="badge badge-info">{UI_STRINGS.appAppDashboardPage.d1ReferentialIntegrity}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data.tenantListPage || 1) < (data.tenantListTotalPages || 1) && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={loadMoreTenants} disabled={loadingMoreTenants}>
                {loadingMoreTenants ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
              </button>
            </div>
          )}
        </div>

        {/* Platform Audit Logs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} />{UI_STRINGS.appAppDashboardPage.globalAuditActivity}</span>
            <Link href="/audit" className="btn btn-sm btn-secondary">{UI_STRINGS.appAppDashboardPage.fullAuditTrail}</Link>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_STRINGS.appAppDashboardPage.tenant}</th>
                  <th>{UI_STRINGS.common.action}</th>
                  <th>{UI_STRINGS.common.entity}</th>
                  <th>{UI_STRINGS.common.user}</th>
                  <th>{UI_STRINGS.common.time}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLogs?.map((log: any) => (
                  <tr key={log.id}>
                    <td><span className="badge badge-draft">{log.tenant?.name || UI_STRINGS.common.system}</span></td>
                    <td><span className="badge badge-info">{log.action}</span></td>
                    <td>{log.entityType}{UI_STRINGS.common.copy13emybb}<span className="text-muted">{log.description?.slice(0, 50)}</span></td>
                    <td>{log.user?.name || log.user?.email || UI_STRINGS.common.system}</td>
                    <td className="text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 2. PROJECT_APPROVER VIEW
  // ============================================================
  if (data.role === 'PROJECT_APPROVER') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">{UI_STRINGS.appAppDashboardPage.approvalDashboard}</div>
            <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.capexBOQApprovalQueueComplianceChecks}</div>
          </div>
          <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>{UI_STRINGS.appAppDashboardPage.rolePROJECTAPPROVER}</span>
        </div>

        {approverStatusMessage && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} />
              <span>{approverStatusMessage}</span>
            </div>
            <button type="button" onClick={() => setApproverStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>{UI_STRINGS.common.copy4i33ao}</button>
          </div>
        )}

        {approverActionError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} />
              <span>{approverActionError}</span>
            </div>
            <button type="button" onClick={() => setApproverActionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>{UI_STRINGS.common.copy4i33ao}</button>
          </div>
        )}

        <div className="kpi-grid mb-6">
          <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.bOQsAwaitingApproval}</div>
            <div className="kpi-value" style={{ color: '#d97706' }}>{data.pending ?? 0}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
            <div className="kpi-label">{UI_STRINGS.common.approvedBOQs}</div>
            <div className="kpi-value" style={{ color: '#059669' }}>{data.recentApproved ?? 0}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #dc2626' }}>
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.rejectedReturnedBOQs}</div>
            <div className="kpi-value" style={{ color: '#dc2626' }}>{data.recentRejected ?? 0}</div>
          </div>
        </div>

        <div className="card mb-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ClipboardCheck size={18} />{UI_STRINGS.appAppDashboardPage.bOQsAwaitingApprovalQueue}</span>
            <Link href="/approvals/boq-pr" className="btn btn-sm btn-secondary">{UI_STRINGS.appAppDashboardPage.viewAllInBOQApprovals}</Link>
          </div>
          {!data.pendingPrs?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <CheckCircle2 size={36} color="#059669" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppDashboardPage.approvalQueueIsClear}</div>
              <div className="empty-desc">{UI_STRINGS.appAppDashboardPage.noBOQSubmissionsPendingYourApprovalRightNow}</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{UI_STRINGS.common.bOQCodeID}</th>
                    <th>{UI_STRINGS.appAppDashboardPage.bOQNameLines}</th>
                    <th>{UI_STRINGS.common.project}</th>
                    <th>{UI_STRINGS.common.costCentre2}</th>
                    <th>{UI_STRINGS.common.category2}</th>
                    <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.amount}</th>
                    <th>{UI_STRINGS.common.requester}</th>
                    <th>{UI_STRINGS.common.bOQDate}</th>
                    <th>{UI_STRINGS.common.status}</th>
                    <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingPrs?.map((pr: any) => (
                    <tr key={pr.id}>
                      <td style={{ fontWeight: 700, color: '#1e40af' }}>
                        <div>{pr.prNumber}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{pr.boq?.boqCode || ''}</div>
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        <div>{pr.title}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{pr.lineCount ?? pr.totalLines ?? pr.lines?.length ?? 0}{UI_STRINGS.common.lineItems}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{pr.project?.name || UI_STRINGS.common.copy4s9bsz}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{pr.project?.projectCode}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{pr.costCentre?.code}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{pr.costCentre?.name}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155', fontWeight: 500 }}>
                          {(pr.categories || []).join(', ') || UI_STRINGS.common.standard}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{(pr.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{pr.requesterName || pr.requestedBy}</div>
                        {pr.requesterEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{pr.requesterEmail}</div>}
                      </td>
                      <td className="text-muted" style={{ fontSize: 12 }}>
                        {new Date(pr.requestedDate || pr.createdAt).toLocaleDateString(I18N_CONFIG.defaultLocale)}
                      </td>
                      <td>
                        <span className="badge badge-warning" style={{ fontSize: 11, padding: '3px 8px' }}>{UI_STRINGS.common.underReview}</span>
                        {pr.hasEnquiry && (
                          <div style={{ marginTop: 2 }}>
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>{UI_STRINGS.common.clarificationPending}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                            title={UI_STRINGS.common.reviewCompleteBOQDetailsAndLineItems}
                            onClick={() => {
                              setApproverSelectedPr(pr);
                              setApproverReviewModalOpen(true);
                            }}
                          >
                            <Eye size={12} />{UI_STRINGS.common.reviewBOQ}</button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                            title={UI_STRINGS.common.sendQueryOrClarificationToSubmitter}
                            onClick={() => openApproverEnquiry(pr)}
                          >
                            <HelpCircle size={12} />{UI_STRINGS.common.message}</button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
                            title={UI_STRINGS.common.openCommunicationAndChatHistory}
                            onClick={() => openApproverChat(pr)}
                          >
                            <MessageSquare size={12} />{UI_STRINGS.common.chat}</button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                            title={UI_STRINGS.common.revertBOQToProjectUserForCorrection}
                            onClick={() => {
                              setApproverSelectedPr(pr);
                              setApproverRevertModalOpen(true);
                            }}
                            disabled={approverProcessing}
                          >
                            <RotateCcw size={12} />{UI_STRINGS.common.revert}</button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ height: 28, padding: '0 10px', fontSize: 11, background: '#047857', borderColor: '#047857' }}
                            onClick={() => handleApproverApprove(pr.id)}
                            disabled={approverProcessing}
                            title={UI_STRINGS.common.approveBOQAndReleaseToCategoryManager}
                          >
                            <CheckCircle2 size={12} />{UI_STRINGS.common.approve}</button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                            onClick={() => {
                              setApproverSelectedPr(pr);
                              setApproverRejectModalOpen(true);
                            }}
                            disabled={approverProcessing}
                            title={UI_STRINGS.common.rejectBOQWithMandatoryReason}
                          >
                            <XCircle size={12} />{UI_STRINGS.common.reject}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recently Actioned Revisions / BOQs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} />{UI_STRINGS.appAppDashboardPage.recentlyActionedBOQs}</span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_STRINGS.appAppDashboardPage.bOQPRNumber}</th>
                  <th>{UI_STRINGS.common.project}</th>
                  <th>{UI_STRINGS.common.costCentre2}</th>
                  <th>{UI_STRINGS.common.status}</th>
                  <th>{UI_STRINGS.appAppDashboardPage.actionDate}</th>
                </tr>
              </thead>
              <tbody>
                {[...(data.recentlyApprovedList || []), ...(data.recentlyRejectedList || [])].map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{r.prNumber || r.boq?.boqCode}</td>
                    <td>{r.project?.name}</td>
                    <td>{r.costCentre?.code}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-muted">{new Date(r.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* REVIEW PR MODAL */}
        {approverReviewModalOpen && approverSelectedPr && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 780, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.common.bOQDetails}{approverSelectedPr.prNumber}
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {approverSelectedPr.title}{UI_STRINGS.common.costCentre}{approverSelectedPr.costCentre?.code}{UI_STRINGS.common.copy1b3t0c5}{approverSelectedPr.costCentre?.name}{UI_STRINGS.common.copyc7zu6c}</div>
                </div>
                <button type="button" onClick={() => setApproverReviewModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                  <X size={18} />
                </button>
              </div>

              {/* PR Metadata Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.sourceBOQ}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{approverSelectedPr.boq?.boqCode}{UI_STRINGS.common.copy1b3t0c5}{approverSelectedPr.boqRevision?.revisionCode || UI_STRINGS.common.r0}{UI_STRINGS.common.copyc7zu6c}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.requester}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{approverSelectedPr.requesterName || approverSelectedPr.requestedBy}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.totalLineItems}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{approverSelectedPr.lineCount ?? approverSelectedPr.totalLines ?? approverSelectedPr.lines?.length ?? 0}{UI_STRINGS.common.lines}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.requestedValue}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copytfdhmk}{(approverSelectedPr.totalEstimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}</div>
                </div>
              </div>

              {/* Line items table */}
              <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 16 }}>
                <table className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr style={{ height: 36, borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0 10px', width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                      <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.itemDescription}</th>
                      <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.bOQDescription}</th>
                      <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.category2}</th>
                      <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                      <th style={{ padding: '0 10px' }}>{UI_STRINGS.common.uOM}</th>
                      <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.rate}</th>
                      <th style={{ padding: '0 10px', textAlign: 'right' }}>{UI_STRINGS.common.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(approverSelectedPr.lines || []).map((line: any, idx: number) => (
                      <tr key={line.id || idx} style={{ borderBottom: '1px solid #f1f5f9', height: 40 }}>
                        <td style={{ padding: '0 10px', color: '#64748b' }}>{line.lineNumber || idx + 1}</td>
                        <td style={{ padding: '0 10px', fontWeight: 600, color: '#0f172a' }}>{line.itemDescription}</td>
                        <td style={{ padding: '0 10px', color: '#64748b', maxWidth: 220 }}>
                          <BoqDescriptionCell
                            text={line.specification || line.boqLine?.specification}
                            itemDescription={line.itemDescription}
                            lineNumber={line.lineNumber || idx + 1}
                            maxWidth={210}
                            clampLines={2}
                          />
                        </td>
                        <td style={{ padding: '0 10px', color: '#475569' }}>{line.category}</td>
                        <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 600 }}>{line.quantity}</td>
                        <td style={{ padding: '0 10px', color: '#64748b' }}>{line.uom}</td>
                        <td style={{ padding: '0 10px', textAlign: 'right' }}>{(line.estimatedRate || 0).toLocaleString(I18N_CONFIG.defaultLocale)}</td>
                        <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{UI_STRINGS.common.copy1g8b5tg}{(line.estimatedValue || (line.quantity * (line.estimatedRate || 0))).toLocaleString(I18N_CONFIG.defaultLocale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {approverSelectedPr.linePagination?.hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={loadMoreApproverLines}
                    disabled={approverLinesLoading}
                  >{UI_STRINGS.common.loadMore}</button>
                </div>
              )}

              {/* Modal actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ color: '#d97706', borderColor: '#fde68a', background: '#fffbeb' }}
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      openApproverEnquiry(approverSelectedPr);
                    }}
                  >
                    <HelpCircle size={13} />{UI_STRINGS.common.askClarification}</button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      openApproverChat(approverSelectedPr);
                    }}
                  >
                    <MessageSquare size={13} />{UI_STRINGS.common.chatWithRequester}</button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setApproverReviewModalOpen(false)}
                  >{UI_STRINGS.common.close}</button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: '#b45309', borderColor: '#fed7aa', background: '#fff7ed' }}
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      setApproverRevertModalOpen(true);
                    }}
                    disabled={approverProcessing}
                  >
                    <RotateCcw size={14} />{UI_STRINGS.common.revertForCorrection}</button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                    onClick={() => {
                      setApproverReviewModalOpen(false);
                      setApproverRejectModalOpen(true);
                    }}
                    disabled={approverProcessing}
                  >
                    <XCircle size={14} />{UI_STRINGS.common.rejectBOQ}</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ background: '#047857', borderColor: '#047857' }}
                    onClick={() => handleApproverApprove(approverSelectedPr.id)}
                    disabled={approverProcessing}
                  >
                    <CheckCircle2 size={14} />{UI_STRINGS.common.approveReleaseToProcurement}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REVERT MODAL */}
        {approverRevertModalOpen && approverSelectedPr && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#b45309' }}>
                <RotateCcw size={20} />
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.common.revertBOQForCorrection}</h3>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>{UI_STRINGS.common.specifyTheCorrectionInstructionsFor}<strong>{approverSelectedPr.prNumber}</strong>{UI_STRINGS.common.copy1b3t0c5}{approverSelectedPr.title}{UI_STRINGS.common.theBOQWillBeReturnedToTheSubmittingProjectUserWithTheseFeedbackRemarks}</p>

              <form onSubmit={handleApproverRevert}>
                <textarea
                  value={approverRevertReason}
                  onChange={e => setApproverRevertReason(e.target.value)}
                  placeholder={UI_STRINGS.common.specificReasonsAndCorrectionInstructionsForProjectUserMandatory}
                  rows={4}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    marginBottom: 16,
                    outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setApproverRevertModalOpen(false);
                      setApproverRevertReason('');
                    }}
                    disabled={approverProcessing}
                  >{UI_STRINGS.common.cancel}</button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: '#b45309', borderColor: '#b45309' }}
                    disabled={approverProcessing || !approverRevertReason.trim()}
                  >
                    {approverProcessing ? UI_STRINGS.common.reverting : UI_STRINGS.common.confirmRevertForCorrection}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* REJECT MODAL */}
        {approverRejectModalOpen && approverSelectedPr && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, maxWidth: '90vw', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>{UI_STRINGS.common.rejectPurchaseRequest}</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>{UI_STRINGS.common.pleaseStateTheSpecificReasonForRejecting}<strong>{approverSelectedPr.prNumber}</strong>{UI_STRINGS.common.theRequestWillBeReturnedToTheRequesterWithTheseFeedbackRemarks}</p>

              <form onSubmit={handleApproverReject}>
                <textarea
                  value={approverRejectReason}
                  onChange={e => setApproverRejectReason(e.target.value)}
                  placeholder={UI_STRINGS.common.reasonForRejectionMandatory}
                  rows={4}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    marginBottom: 16,
                    outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setApproverRejectModalOpen(false);
                      setApproverRejectReason('');
                    }}
                    disabled={approverProcessing}
                  >{UI_STRINGS.common.cancel}</button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: '#dc2626', borderColor: '#dc2626' }}
                    disabled={approverProcessing || !approverRejectReason.trim()}
                  >
                    {approverProcessing ? UI_STRINGS.common.rejecting : UI_STRINGS.common.confirmRejection}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CHAT / ENQUIRY DRAWER */}
        {approverChatPr && (
          <ApprovalChatDrawer
            isOpen={approverChatDrawerOpen}
            onClose={() => {
              setApproverChatDrawerOpen(false);
              setApproverChatPr(null);
            }}
            entityType="PR"
            entityId={approverChatPr.id}
            entityCode={approverChatPr.prNumber}
            title={approverChatPr.title}
            costCentre={approverChatPr.costCentre?.code}
            category={(approverChatPr.categories || []).join(', ')}
            amount={approverSelectedPr?.totalEstimatedValue || approverChatPr.totalEstimatedValue}
            initialEnquiryMode={approverIsEnquiryMode}
            onMessageSent={loadDashboard}
          />
        )}
      </div>
    );
  }

  // ============================================================
  // 3. PROCUREMENT_USER VIEW (BOQ-FIRST REGISTER & EXPANDABLE RFQS)
  // ============================================================
  if (data.role === 'PROCUREMENT_USER') {
    const summary = data.summaryCards || {
      boqsReceived: data.approvedPrsCount || 0,
      prsReceived: data.approvedPrsCount || 0,
      rfqsInProgress: data.activeRfqsCount || 0,
      negotiationsPending: data.negotiationsCount || 0,
      awardsPpoPending: data.awardsPendingCount || 0,
    };

    // Use only authoritative eligible approved BOQs (no hardcoded demo PR record)
    const register: any[] = data.boqRegister || data.prRegister || data.consolidatedRegister || [];
    const searchLower = (searchTerm || '').toLowerCase();

    // Filter logic supporting text search, stage select, and clickable card filter
    const filteredRegister = register.filter((item: any) => {
      // 1. Text search
      const matchesSearch =
        !searchTerm ||
        item.boqCode?.toLowerCase().includes(searchLower) ||
        item.prNumber?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.projectName?.toLowerCase().includes(searchLower) ||
        item.costCentre?.toLowerCase().includes(searchLower) ||
        item.costCentreCode?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower) ||
        item.rfqs?.some((r: any) =>
          r.rfqNumber?.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower)
        );

      // 2. Stage select filter
      const itemStage = item.sourcingStage || item.currentStage;
      const matchesStage = !selectedStage || itemStage === selectedStage;

      // 3. Clickable summary card filter
      let matchesCard = true;
      if (activeCardFilter === 'boqs_received' || activeCardFilter === 'prs_received') {
        matchesCard =
          itemStage === 'Awaiting RFQ' ||
          !item.rfqs ||
          item.rfqs.length === 0;
      } else if (activeCardFilter === 'rfqs_in_progress') {
        matchesCard =
          itemStage === 'RFQ Issued' ||
          itemStage === 'Quotations' ||
          item.rfqs?.some((r: any) =>
            r.status === 'RELEASED' ||
            r.status === 'VENDOR_RESPONSE_OPEN' ||
            r.status === 'COMPARISON' ||
            r.status === 'RESPONSE_CLOSED'
          );
      } else if (activeCardFilter === 'negotiations_pending') {
        matchesCard =
          itemStage === 'Negotiation' ||
          item.rfqs?.some((r: any) =>
            r.status === 'NEGOTIATION' ||
            (r.negotiationStage && r.negotiationStage !== '—')
          );
      } else if (activeCardFilter === 'awards_ppo_pending') {
        matchesCard =
          itemStage === 'Award' ||
          itemStage === 'PPO' ||
          item.rfqs?.some((r: any) =>
            (r.awardStatus && r.awardStatus !== 'Not Prepared' && r.awardStatus !== 'Draft') ||
            (r.ppoStatus && r.ppoStatus !== '—')
          );
      }

      return matchesSearch && matchesStage && matchesCard;
    });

    const stagesList = [
      'Awaiting RFQ',
      'RFQ Issued',
      'Quotations',
      'Negotiation',
      'Award',
      'PPO',
    ];

    const toggleExpand = (boqId: string) => {
      setExpandedPrs((prev) => ({
        ...prev,
        [boqId]: !prev[boqId],
      }));
    };

    const toggleExpandAll = () => {
      const allExpanded = filteredRegister.every((boq) => expandedPrs[boq.id]);
      const next: Record<string, boolean> = {};
      filteredRegister.forEach((boq) => {
        next[boq.id] = !allExpanded;
      });
      setExpandedPrs(next);
    };

    const getStageBadgeClass = (stage: string) => {
      switch (stage) {
        case 'Awaiting RFQ':
          return 'badge-info';
        case 'RFQ Issued':
          return 'badge-submitted';
        case 'Quotations':
          return 'badge-submitted';
        case 'Negotiation':
          return 'badge-review';
        case 'Award':
          return 'badge-approved';
        case 'PPO':
          return 'badge-approved';
        case 'Closed / Cancelled':
          return 'badge-rejected';
        default:
          return 'badge-draft';
      }
    };

    const formatBoqDate = (dVal: any) => {
      if (!dVal) return '—';
      try {
        const d = new Date(dVal);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(I18N_CONFIG.defaultLocale, { day: '2-digit', month: 'short', year: 'numeric' });
      } catch {
        return '—';
      }
    };

    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">{UI_STRINGS.appAppDashboardPage.procurementWorkspace}</div>
            <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.bOQSourcingQuotationComparisonNegotiationAndAwards}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link
              href="/procurement/rfqs/RFQ-DEMO-001?demo=true"
              className="btn btn-sm btn-secondary"
              style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#16a34a', color: '#166534', background: '#f0fdf4' }}
            >
              <Sparkles size={14} color="#16a34a" />{UI_STRINGS.appAppDashboardPage.viewWorkflowExample}</Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary btn-sm">{UI_STRINGS.appAppDashboardPage.createRFQ2}</Link>
          </div>
        </div>

        {/* 1. Four Compact, Live Clickable Summary Cards */}
        <div className="kpi-grid mb-6">
          {/* Card 1: BOQs Received */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'boqs_received' ? null : 'boqs_received')}
            style={{
              cursor: 'pointer',
              background: '#ffffff',
              backgroundColor: '#ffffff',
              border: '1px solid #2563eb',
              borderLeft: '4px solid #2563eb',
              borderRadius: 8,
              padding: '18px 20px',
              boxShadow: activeCardFilter === 'boqs_received' ? '0 0 0 2px #2563eb' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterBOQsAwaitingSourcing}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={16} color="#2563eb" />
                <div className="kpi-label" style={{ margin: 0 }}>{UI_STRINGS.appAppDashboardPage.bOQsReceived}</div>
              </div>
              {activeCardFilter === 'boqs_received' && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#ffffff', color: '#2563eb', border: '1px solid #2563eb', fontWeight: 600 }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#2563eb', marginTop: 6 }}>{summary.boqsReceived ?? summary.prsReceived ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.approvedBOQsAwaitingSourcing2}</div>
          </div>

          {/* Card 2: RFQs in Progress */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'rfqs_in_progress' ? null : 'rfqs_in_progress')}
            style={{
              cursor: 'pointer',
              background: '#ffffff',
              backgroundColor: '#ffffff',
              border: '1px solid #0d9488',
              borderLeft: '4px solid #0d9488',
              borderRadius: 8,
              padding: '18px 20px',
              boxShadow: activeCardFilter === 'rfqs_in_progress' ? '0 0 0 2px #0d9488' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterRFQsInProgress}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={16} color="#0d9488" />
                <div className="kpi-label" style={{ margin: 0 }}>{UI_STRINGS.appAppDashboardPage.rFQsInProgress}</div>
              </div>
              {activeCardFilter === 'rfqs_in_progress' && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#ffffff', color: '#0d9488', border: '1px solid #0d9488', fontWeight: 600 }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#0d9488', marginTop: 6 }}>{summary.rfqsInProgress ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.activeSourcingQuoteCollection}</div>
          </div>

          {/* Card 3: Negotiations Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'negotiations_pending' ? null : 'negotiations_pending')}
            style={{
              cursor: 'pointer',
              background: '#ffffff',
              backgroundColor: '#ffffff',
              border: '1px solid #d97706',
              borderLeft: '4px solid #d97706',
              borderRadius: 8,
              padding: '18px 20px',
              boxShadow: activeCardFilter === 'negotiations_pending' ? '0 0 0 2px #d97706' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterNegotiationsPending}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Scale size={16} color="#d97706" />
                <div className="kpi-label" style={{ margin: 0 }}>{UI_STRINGS.common.negotiationsPending}</div>
              </div>
              {activeCardFilter === 'negotiations_pending' && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#ffffff', color: '#d97706', border: '1px solid #d97706', fontWeight: 600 }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#d97706', marginTop: 6 }}>{summary.negotiationsPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.activeRoundsCommercialReviews}</div>
          </div>

          {/* Card 4: Awards / PPO Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'awards_ppo_pending' ? null : 'awards_ppo_pending')}
            style={{
              cursor: 'pointer',
              background: '#ffffff',
              backgroundColor: '#ffffff',
              border: '1px solid #123B7A',
              borderLeft: '4px solid #123B7A',
              borderRadius: 8,
              padding: '18px 20px',
              boxShadow: activeCardFilter === 'awards_ppo_pending' ? '0 0 0 2px #123B7A' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterAwardsAndPPOsPending}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Award size={16} color="#123B7A" />
                <div className="kpi-label" style={{ margin: 0 }}>{UI_STRINGS.appAppDashboardPage.awardsPPOPending}</div>
              </div>
              {activeCardFilter === 'awards_ppo_pending' && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#ffffff', color: '#123B7A', border: '1px solid #123B7A', fontWeight: 600 }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#123B7A', marginTop: 6 }}>{summary.awardsPpoPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.awardApprovalOrderIssuance}</div>
          </div>
        </div>

        {/* 2. BOQ Register with Expandable Associated RFQs */}
        <div className="card mb-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} />{UI_STRINGS.appAppDashboardPage.bOQRegister}</span>
              <button
                type="button"
                onClick={toggleExpandAll}
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, color: '#2563eb' }}
              >
                {filteredRegister.length > 0 && filteredRegister.every((b) => expandedPrs[b.id]) ? UI_STRINGS.appAppDashboardPage.collapseAllRFQs : UI_STRINGS.appAppDashboardPage.expandAllRFQs}
              </button>
            </div>

            {/* Register Filters & Search */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder={UI_STRINGS.appAppDashboardPage.searchBOQBOQDescriptionCostCentreRFQ}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input input-sm"
                style={{ width: 280, fontSize: 12 }}
              />

              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="input input-sm"
                style={{ width: 190, fontSize: 12 }}
              >
                <option value="">{UI_STRINGS.appAppDashboardPage.allStages}{register.length}{UI_STRINGS.common.copyc7zu6c}</option>
                {stagesList.map((st) => {
                  const cnt = register.filter((r) => (r.sourcingStage || r.currentStage) === st).length;
                  return (
                    <option key={st} value={st}>
                      {st}{UI_STRINGS.common.copy1b3t0c5}{cnt}{UI_STRINGS.common.copyc7zu6c}</option>
                  );
                })}
              </select>

              {(searchTerm || selectedStage || activeCardFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedStage('');
                    setActiveCardFilter(null);
                  }}
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, color: '#dc2626' }}
                >{UI_STRINGS.appAppDashboardPage.clearAllFilters}</button>
              )}
            </div>
          </div>

          {/* Active Card Filter Banner */}
          {activeCardFilter && (
            <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{UI_STRINGS.appAppDashboardPage.filteredBy}{' '}
                <strong style={{ color: '#0f172a' }}>
                  {(activeCardFilter === 'boqs_received' || activeCardFilter === 'prs_received') && UI_STRINGS.appAppDashboardPage.bOQsReceivedAwaitingRFQ}
                  {activeCardFilter === 'rfqs_in_progress' && UI_STRINGS.appAppDashboardPage.rFQsInProgress}
                  {activeCardFilter === 'negotiations_pending' && UI_STRINGS.common.negotiationsPending}
                  {activeCardFilter === 'awards_ppo_pending' && UI_STRINGS.appAppDashboardPage.awardsPPOPending}
                </strong>{' '}{UI_STRINGS.appAppDashboardPage.showing2}{filteredRegister.length}{UI_STRINGS.appAppDashboardPage.bOQs}</span>
              <button
                type="button"
                onClick={() => setActiveCardFilter(null)}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >{UI_STRINGS.appAppDashboardPage.resetFilter}</button>
            </div>
          )}

          {data.registerHasMore && (
            <div className="alert alert-info" style={{ margin: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{interpolateUiString(UI_STRINGS.appAppDashboardPage.dashboardRegisterPreviewNotice, { limit: data.registerPreviewLimit })}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <Link className="btn btn-sm btn-secondary" href="/procurement/approved-boqs">{UI_STRINGS.common.approvedBOQs}</Link>
                <Link className="btn btn-sm btn-secondary" href="/procurement/approved-prs">{UI_STRINGS.appAppProcurementApprovedPrsPage.approvedPRs}</Link>
              </span>
            </div>
          )}

          {filteredRegister.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FileText size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppDashboardPage.noMatchingBOQRecordsFound}</div>
              <div className="empty-desc">
                {searchTerm || selectedStage || activeCardFilter
                  ? UI_STRINGS.appAppDashboardPage.tryClearingTheSearchOrStageFilters
                  : UI_STRINGS.appAppDashboardPage.eligibleApprovedBOQsAvailableToProcurementWillAppearHere}
              </div>
            </div>
          ) : (
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 1250, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 310 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 135 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 125 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.common.date}</th>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.common.bOQNumber}</th>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.appAppDashboardPage.bOQPackageDescription}</th>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.common.items4}</th>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.common.costCentre2}</th>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.appAppDashboardPage.bOQAmount}</th>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.common.procurementStage}</th>
                    <th style={{ textAlign: 'center' }}>{UI_STRINGS.common.rFQCount}</th>
                    <th className="col-actions" style={{ textAlign: 'center' }}>{UI_STRINGS.common.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegister.map((item: any) => {
                    const isExpanded = !!expandedPrs[item.id];
                    const rfqCount = item.rfqs?.length || 0;
                    const stage = item.sourcingStage || item.currentStage || 'Awaiting RFQ';
                    const itemCount = item.itemCount ?? item.totalLines ?? item.lines?.length ?? 0;
                    const costCentreCode = item.costCentreCode || (item.costCentre ? item.costCentre.split(' - ')[0] : '—');
                    const boqDisplayCode = item.boqCode || item.boqNumber || item.code || '—';
                    const dateFormatted = formatBoqDate(item.date || item.createdAt || item.updatedAt);
                    const registerAmount = item.requestedValue ?? item.benchmarkTotal;
                    const amountFormatted = registerAmount === null || registerAmount === undefined
                      ? UI_STRINGS.common.notAvailable
                      : Number(registerAmount).toLocaleString(I18N_CONFIG.defaultLocale);

                    return (
                      <Fragment key={item.id}>
                        {/* Top-Level BOQ Summary Row */}
                        <tr
                          style={{
                            backgroundColor: isExpanded ? '#f8fafc' : undefined,
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {/* 1. Date */}
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12, color: '#64748b' }}>
                            {dateFormatted}
                          </td>

                          {/* 2. BOQ Number */}
                          <td className="font-mono font-bold text-primary" style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {rfqCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(item.id)}
                                  className="btn btn-ghost btn-xs"
                                  style={{ padding: 2, color: '#64748b' }}
                                  title={isExpanded ? UI_STRINGS.appAppDashboardPage.collapseNestedRFQs : UI_STRINGS.appAppDashboardPage.expandNestedRFQs}
                                  aria-label={isExpanded ? UI_STRINGS.appAppDashboardPage.collapseRFQs : UI_STRINGS.appAppDashboardPage.expandRFQs}
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              ) : (
                                <span style={{ width: 18 }} />
                              )}
                              <span style={{ color: '#1d4ed8' }}>
                                {boqDisplayCode}
                              </span>
                            </div>
                          </td>

                          {/* 3. BOQ / Package Description */}
                          <td style={{ maxWidth: 310 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={item.description}
                            >
                              {item.description}
                            </div>
                            {item.projectName && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: '#64748b',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={item.projectName}
                              >
                                {item.projectName}
                              </div>
                            )}
                          </td>

                          {/* 4. Items */}
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span className="text-muted" style={{ fontSize: 12, fontWeight: 500 }}>
                              {itemCount} {itemCount === 1 ? UI_STRINGS.common.item : UI_STRINGS.common.items5}
                            </span>
                          </td>

                          {/* 5. Cost Centre */}
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span
                              className="font-mono"
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#334155',
                                background: '#f1f5f9',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              {costCentreCode}
                            </span>
                          </td>

                          {/* 6. BOQ Amount */}
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            <span className="font-mono">
                              {registerAmount === null || registerAmount === undefined
                                ? amountFormatted
                                : <>{UI_STRINGS.common.copytfdhmk}{amountFormatted}</>}
                            </span>
                          </td>

                          {/* 7. Procurement Stage */}
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span className={`badge ${getStageBadgeClass(stage)}`} style={{ fontSize: 11 }}>
                              {stage}
                            </span>
                          </td>

                          {/* 8. RFQ Count */}
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {rfqCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.id)}
                                className="badge badge-info"
                                style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
                                title={UI_STRINGS.appAppDashboardPage.clickToToggleAssociatedRFQPackages}
                              >
                                {rfqCount} {rfqCount === 1 ? UI_STRINGS.common.rFQ : UI_STRINGS.common.rFQs}
                              </button>
                            ) : (
                              <span className="badge badge-draft" style={{ fontSize: 11 }}>{UI_STRINGS.appAppDashboardPage.copy1fhxk1l}</span>
                            )}
                          </td>

                          {/* 9. Action */}
                          <td className="col-actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {rfqCount === 0 ? (
                              <Link
                                href={`/procurement/rfqs/new?boqId=${item.boqId || item.id}&boqRevisionId=${item.boqRevisionId || item.id}`}
                                className="btn btn-xs btn-primary"
                                style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                title={UI_STRINGS.appAppDashboardPage.raiseRFQForThisApprovedBOQ}
                              >
                                <Plus size={12} />{UI_STRINGS.appAppDashboardPage.raiseRFQ}</Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.id)}
                                className="btn btn-xs btn-secondary"
                                style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                title={isExpanded ? UI_STRINGS.appAppDashboardPage.hideLinkedRFQs : UI_STRINGS.appAppDashboardPage.viewLinkedRFQs}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown size={12} />{UI_STRINGS.appAppDashboardPage.hideRFQs}</>
                                ) : (
                                  <>
                                    <ChevronRight size={12} />{UI_STRINGS.appAppDashboardPage.viewRFQs}</>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Nested Associated RFQs Row (Expanded) */}
                        {isExpanded && (
                          <tr key={`${item.id}-nested`} style={{ background: '#f8fafc' }}>
                            <td colSpan={9} style={{ padding: '0 0 16px 40px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                              <div
                                style={{
                                  background: '#ffffff',
                                  borderRadius: 8,
                                  border: '1px solid #cbd5e1',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                  padding: '16px 20px',
                                  marginTop: 4,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Layers size={16} color="#2563eb" />
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{UI_STRINGS.appAppDashboardPage.associatedRFQsFor}{boqDisplayCode}
                                    </span>
                                    <span className="badge badge-info" style={{ fontSize: 11 }}>
                                      {rfqCount}{UI_STRINGS.appAppDashboardPage.package}{rfqCount === 1 ? '' : UI_STRINGS.common.s}{UI_STRINGS.appAppDashboardPage.linked}</span>
                                  </div>
                                  <Link
                                    href={`/procurement/rfqs/new?boqId=${item.boqId || item.id}&boqRevisionId=${item.boqRevisionId || item.id}`}
                                    className="btn btn-sm btn-primary"
                                    style={{ fontSize: 11, padding: '4px 10px', fontWeight: 600 }}
                                  >
                                    <Plus size={12} style={{ marginRight: 4 }} />{UI_STRINGS.appAppDashboardPage.createRFQ}</Link>
                                </div>

                                {rfqCount === 0 ? (
                                  <div
                                    style={{
                                      background: '#f8fafc',
                                      border: '1px dashed #cbd5e1',
                                      borderRadius: 6,
                                      padding: '20px',
                                      textAlign: 'center',
                                    }}
                                  >
                                    <p style={{ margin: 0, fontSize: 13, color: '#475569', fontWeight: 600 }}>{UI_STRINGS.appAppDashboardPage.noRFQPackagesCreatedForThisBOQYet}</p>
                                    <p style={{ margin: '4px 0 12px', fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppDashboardPage.approvedBOQLineItemsAreReadyForVendorInvitationsAndSourcingPackageInitiation}</p>
                                    <Link
                                      href={`/procurement/rfqs/new?boqId=${item.boqId || item.id}&boqRevisionId=${item.boqRevisionId || item.id}`}
                                      className="btn btn-sm btn-primary"
                                      style={{ fontWeight: 700, fontSize: 12 }}
                                    >{UI_STRINGS.appAppDashboardPage.createRFQFor}{boqDisplayCode}
                                    </Link>
                                  </div>
                                ) : (
                                  <div className="table-wrapper" style={{ borderRadius: 6, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <table className="data-table" style={{ fontSize: 12, margin: 0 }}>
                                      <thead>
                                        <tr style={{ background: '#f1f5f9' }}>
                                          <th>{UI_STRINGS.common.rFQNumber}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.rFQDescriptionScope}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.vendorInvitationProgress}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.quotationStage}</th>
                                          <th>{UI_STRINGS.common.negotiationStage}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.awardStatus}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.pPOStatus}</th>
                                          <th>{UI_STRINGS.common.lastUpdated}</th>
                                          <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppDashboardPage.openRFQAction}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.rfqs.map((rfq: any) => (
                                          <tr key={rfq.id}>
                                            {/* RFQ Number */}
                                            <td className="font-mono" style={{ fontWeight: 700 }}>
                                              <Link
                                                href={`/procurement/rfqs/${rfq.id}`}
                                                style={{ color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                              >
                                                {rfq.rfqNumber}
                                              </Link>
                                            </td>

                                            {/* RFQ Description or Scope */}
                                            <td>
                                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{rfq.description}</div>
                                              {rfq.packageName && rfq.packageName !== rfq.description && (
                                                <div style={{ fontSize: 11, color: '#64748b' }}>{rfq.packageName}</div>
                                              )}
                                            </td>

                                            {/* Vendor Invitation / Response Progress */}
                                            <td>
                                              <span className="badge badge-info" style={{ fontSize: 11 }}>
                                                {rfq.vendorInvitationProgress}
                                              </span>
                                            </td>

                                            {/* Quotation Stage */}
                                            <td>
                                              <span style={{ fontWeight: 500 }}>{rfq.quotationStage}</span>
                                            </td>

                                            {/* Negotiation Stage */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.negotiationStage !== '—' ? 'badge-review' : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.negotiationStage}
                                              </span>
                                            </td>

                                            {/* Award Status */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.awardStatus === 'Approved'
                                                    ? 'badge-approved'
                                                    : rfq.awardStatus === 'Pending Approval'
                                                    ? 'badge-review'
                                                    : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.awardStatus}
                                              </span>
                                            </td>

                                            {/* PPO Status */}
                                            <td>
                                              {rfq.ppoStatus !== '—' ? (
                                                <span className="badge badge-approved" style={{ fontSize: 10 }}>
                                                  {rfq.ppoStatus}
                                                </span>
                                              ) : (
                                                <span className="text-muted" style={{ fontSize: 11 }}>{UI_STRINGS.common.copy4s9bsz}</span>
                                              )}
                                            </td>

                                            {/* Last Updated */}
                                            <td className="text-muted" style={{ fontSize: 11 }}>
                                              {rfq.lastUpdated ? new Date(rfq.lastUpdated).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}
                                            </td>

                                            {/* Open RFQ Action */}
                                            <td style={{ textAlign: 'right' }}>
                                              <Link
                                                href={`/procurement/rfqs/${rfq.id}`}
                                                className="btn btn-sm btn-secondary"
                                                style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                              >{UI_STRINGS.appAppDashboardPage.openRFQ}<ArrowRight size={12} />
                                              </Link>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{UI_STRINGS.appAppDashboardPage.showing}{filteredRegister.length}{UI_STRINGS.common.of}{register.length}{UI_STRINGS.appAppDashboardPage.eligibleBOQRecords}</span>
            <span style={{ fontSize: 11 }}>{UI_STRINGS.appAppDashboardPage.tenantIsolation}{data.tenant?.name || UI_STRINGS.appAppDashboardPage.activeTenant}</span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 4. FINANCE_USER VIEW
  // ============================================================
  if (data.role === 'FINANCE_USER') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">{UI_STRINGS.appAppDashboardPage.financeCapexControlWorkspace}</div>
            <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.budgetMonitoringCostCentreAuditBOQFinancialBaseline}</div>
          </div>
          <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>{UI_STRINGS.appAppDashboardPage.roleFINANCEUSER}</span>
        </div>

        <div className="alert alert-info mb-6" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Briefcase size={22} style={{ color: '#2563eb', flexShrink: 0 }} />
          <div>
            <strong>{UI_STRINGS.appAppDashboardPage.financialAuditViewReadOnly}</strong>{UI_STRINGS.appAppDashboardPage.trackingApprovedBudgetsAndCostCenterAssignments}<div style={{ fontSize: 12, marginTop: 4, color: '#64748b' }}>{UI_STRINGS.appAppDashboardPage.benchmarkEngineLinePricingComparisonAndERPCostLedgerSynchronizationAreScheduledForPhase2}</div>
          </div>
        </div>

        <div className="kpi-grid mb-6">
          <div className="kpi-card" style={{ borderLeft: '3px solid #2563eb' }}>
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.totalAllocatedCapexBudget}</div>
            <div className="kpi-value" style={{ color: '#2563eb' }}>{UI_STRINGS.common.copy1g8b5tg}{(data.totalBudget ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.activeCapexProjects}</div>
            <div className="kpi-value">{data.totalProjects ?? 0}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
            <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.bOQApprovedProjects}</div>
            <div className="kpi-value" style={{ color: '#059669' }}>{data.approvedProjects ?? 0}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Briefcase size={18} />{UI_STRINGS.appAppDashboardPage.projectFinancialCostCentreMaster}</span>
            <Link href="/projects" className="btn btn-sm btn-secondary">{UI_STRINGS.common.allProjects}</Link>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_STRINGS.common.projectCode}</th>
                  <th>{UI_STRINGS.common.projectName}</th>
                  <th>{UI_STRINGS.common.costCentre2}</th>
                  <th>{UI_STRINGS.common.budget}</th>
                  <th>{UI_STRINGS.common.currency}</th>
                  <th>{UI_STRINGS.common.status}</th>
                  <th>{UI_STRINGS.appAppDashboardPage.owner}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.projects?.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-mono font-bold">{p.projectCode}</td>
                    <td>{p.name}</td>
                    <td><span className="badge badge-draft font-mono">{p.costCentre || UI_STRINGS.common.copy4s9bsz}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.budget ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": p.budget.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}</td>
                    <td>{p.currency || UI_STRINGS.common.iNR}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-muted">{p.projectOwner || UI_STRINGS.common.copy4s9bsz}</td>
                    <td>
                      <Link href={`/projects/${p.id}`} className="btn btn-sm btn-ghost">{UI_STRINGS.appAppDashboardPage.viewDetails2}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 5. CATEGORY_MANAGER VIEW (BOQ-CENTRED CENTRAL SOURCING GATEWAY)
  // ============================================================
  if (data.role === 'CATEGORY_MANAGER') {
    const summary = data.summaryCards || {
      approvedBoqs: data.approvedBoqsCount || 0,
      prsReceived: data.approvedBoqsCount || 0,
      rfqsInProgress: data.activeRfqsCount || 0,
      negotiationsPending: data.negotiationsCount || 0,
      awardsPpoPending: data.awardsPendingCount || 0,
    };

    const register: any[] = data.boqRegister || data.prRegister || data.consolidatedRegister || [];
    const searchLower = (searchTerm || '').toLowerCase();

    // Filter logic supporting text search, stage select, and clickable card filter
    const filteredRegister = register.filter((item: any) => {
      // 1. Text search
      const matchesSearch =
        !searchTerm ||
        item.boqCode?.toLowerCase().includes(searchLower) ||
        item.prNumber?.toLowerCase().includes(searchLower) ||
        item.title?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.projectName?.toLowerCase().includes(searchLower) ||
        item.costCentre?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower) ||
        item.rfqs?.some((r: any) =>
          r.rfqNumber?.toLowerCase().includes(searchLower) ||
          r.title?.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower)
        );

      // 2. Stage select filter
      const itemStage = item.sourcingStage || item.currentStage || item.overallStage;
      const matchesStage = !selectedStage || itemStage === selectedStage;

      // 3. Clickable summary card filter
      let matchesCard = true;
      if (activeCardFilter === 'prs_received') {
        matchesCard =
          itemStage === 'Approved BOQ — Awaiting RFQ' ||
          itemStage === 'Approved PR — Awaiting RFQ' ||
          itemStage === 'RFQ Preparation' ||
          !item.rfqs ||
          item.rfqs.length === 0;
      } else if (activeCardFilter === 'rfqs_in_progress') {
        matchesCard =
          itemStage === 'RFQ Issued / Awaiting Quotations' ||
          itemStage === 'Quotation Comparison' ||
          item.rfqs?.some((r: any) =>
            r.status === 'RELEASED' ||
            r.status === 'VENDOR_RESPONSE_OPEN' ||
            r.status === 'COMPARISON' ||
            r.status === 'RESPONSE_CLOSED'
          );
      } else if (activeCardFilter === 'negotiations_pending') {
        matchesCard =
          itemStage === 'Negotiation' ||
          itemStage === 'Rates Locked' ||
          item.rfqs?.some((r: any) =>
            r.status === 'NEGOTIATION' ||
            r.status === 'FINAL_RATE_LOCKED' ||
            (r.negotiationStage && r.negotiationStage !== '—')
          );
      } else if (activeCardFilter === 'awards_ppo_pending') {
        matchesCard =
          itemStage === 'Award Pending Approval' ||
          itemStage === 'Award Approved' ||
          itemStage === 'PPO Created' ||
          item.rfqs?.some((r: any) =>
            (r.awardStatus && r.awardStatus !== 'Not Prepared') ||
            (r.ppoStatus && r.ppoStatus !== '—')
          );
      }

      return matchesSearch && matchesStage && matchesCard;
    });

    const stagesList = [
      'Approved BOQ — Awaiting RFQ',
      'RFQ Preparation',
      'RFQ Issued / Awaiting Quotations',
      'Quotation Comparison',
      'Negotiation',
      'Rates Locked',
      'Award Pending Approval',
      'Award Approved',
      'PPO Created',
    ];

    const toggleExpand = (boqId: string) => {
      setExpandedPrs((prev) => ({
        ...prev,
        [boqId]: !prev[boqId],
      }));
    };

    const toggleExpandAll = () => {
      const allExpanded = filteredRegister.every((b) => expandedPrs[b.id]);
      const next: Record<string, boolean> = {};
      filteredRegister.forEach((b) => {
        next[b.id] = !allExpanded;
      });
      setExpandedPrs(next);
    };

    const getStageBadgeClass = (stage: string) => {
      switch (stage) {
        case 'Approved BOQ — Awaiting RFQ':
        case 'Approved PR — Awaiting RFQ':
          return 'badge-info';
        case 'RFQ Preparation':
          return 'badge-draft';
        case 'RFQ Issued / Awaiting Quotations':
        case 'RFQ Issued':
        case 'Awaiting Quotations':
          return 'badge-submitted';
        case 'Quotation Comparison':
          return 'badge-submitted';
        case 'Negotiation':
        case 'Rates Locked':
          return 'badge-review';
        case 'Award Pending Approval':
          return 'badge-review';
        case 'Award Approved':
        case 'PPO Created':
          return 'badge-approved';
        case 'Closed / Cancelled':
          return 'badge-rejected';
        default:
          return 'badge-draft';
      }
    };

    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">{UI_STRINGS.appAppDashboardPage.categoryManagerSourcingGateway}</div>
            <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.centralGatewayApprovedBOQsMultiPackageRFQsQuotationComparisonNegotiationHubAwardingPPOLifecycle}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 12px' }}>{UI_STRINGS.appAppDashboardPage.roleCATEGORYMANAGER}</span>
            <Link
              href="/procurement/rfqs/RFQ-DEMO-001?demo=true"
              className="btn btn-sm btn-secondary"
              style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#16a34a', color: '#166534', background: '#f0fdf4' }}
            >
              <Sparkles size={14} color="#16a34a" />{UI_STRINGS.appAppDashboardPage.viewInteractiveDemo}</Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary btn-sm">{UI_STRINGS.appAppDashboardPage.createNewRFQ}</Link>
          </div>
        </div>

        {/* Interactive Demonstration Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: '14px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16a34a',
                flexShrink: 0,
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13, color: '#166534' }}>{UI_STRINGS.appAppDashboardPage.centralSourcingGatewayBOQCommercialLifecycle}</strong>
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '1px 6px' }}>{UI_STRINGS.appAppDashboardPage.sINGLESOURCINGENTRYPOINT}</span>
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>{UI_STRINGS.appAppDashboardPage.clickOrExpandAnyApprovedBOQBelowToInspectItsCompleteSourcingLifecycleLinkedRFQsInvitedVendorsQuoteComparisonMatrixFullWindowNegotiationHubAwardSanctionsAndPPOIssuance}</div>
            </div>
          </div>

          <Link
            href="/procurement/rfqs/RFQ-DEMO-001?demo=true"
            className="btn btn-sm btn-primary"
            style={{
              fontWeight: 700,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              backgroundColor: '#16a34a',
              borderColor: '#15803d',
            }}
          >
            <Sparkles size={14} />{UI_STRINGS.appAppDashboardPage.viewWorkflowExample2}</Link>
        </div>

        {/* 1. Four Compact, Live Clickable Summary Cards */}
        <div className="kpi-grid mb-6">
          {/* Card 1: Approved BOQs */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'prs_received' ? null : 'prs_received')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #059669',
              backgroundColor: activeCardFilter === 'prs_received' ? '#f0fdf4' : undefined,
              boxShadow: activeCardFilter === 'prs_received' ? '0 0 0 2px #059669' : undefined,
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterApprovedBOQsAwaitingSourcing}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">{UI_STRINGS.common.approvedBOQs}</div>
              {activeCardFilter === 'prs_received' && (
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 6px' }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#059669' }}>{summary.approvedBoqs ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {summary.prsReceived !== undefined
                ? interpolateUiString(UI_STRINGS.appAppDashboardPage.prsReceivedAwaitingRFQOfValue2Total, { "prsReceived": summary.prsReceived, "value2": summary.approvedBoqs ?? 0 })
                : UI_STRINGS.appAppDashboardPage.commercialBaselinesInSourcingQueue}
            </div>
          </div>

          {/* Card 2: RFQs in Progress */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'rfqs_in_progress' ? null : 'rfqs_in_progress')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #2563eb',
              backgroundColor: activeCardFilter === 'rfqs_in_progress' ? '#eff6ff' : undefined,
              boxShadow: activeCardFilter === 'rfqs_in_progress' ? '0 0 0 2px #2563eb' : undefined,
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterRFQsInProgress}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">{UI_STRINGS.common.activeRFQs}</div>
              {activeCardFilter === 'rfqs_in_progress' && (
                <span className="badge badge-info" style={{ fontSize: 10, padding: '2px 6px' }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#2563eb' }}>{summary.rfqsInProgress ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.activeBiddingQuoteComparison}</div>
          </div>

          {/* Card 3: Negotiations Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'negotiations_pending' ? null : 'negotiations_pending')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #d97706',
              backgroundColor: activeCardFilter === 'negotiations_pending' ? '#fffbeb' : undefined,
              boxShadow: activeCardFilter === 'negotiations_pending' ? '0 0 0 2px #d97706' : undefined,
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterNegotiationsPending}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">{UI_STRINGS.common.inNegotiation}</div>
              {activeCardFilter === 'negotiations_pending' && (
                <span className="badge badge-review" style={{ fontSize: 10, padding: '2px 6px' }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#d97706' }}>{summary.negotiationsPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.activeCounterofferRoundsRateLocking}</div>
          </div>

          {/* Card 4: Awards / PPO Pending */}
          <div
            className="kpi-card"
            onClick={() => setActiveCardFilter(activeCardFilter === 'awards_ppo_pending' ? null : 'awards_ppo_pending')}
            style={{
              cursor: 'pointer',
              borderLeft: '4px solid #7c3aed',
              backgroundColor: activeCardFilter === 'awards_ppo_pending' ? '#f5f3ff' : undefined,
              boxShadow: activeCardFilter === 'awards_ppo_pending' ? '0 0 0 2px #7c3aed' : undefined,
              transition: 'all 0.15s ease',
            }}
            title={UI_STRINGS.appAppDashboardPage.clickToFilterAwardsAndPPOsPending}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="kpi-label">{UI_STRINGS.common.awardsPPOs}</div>
              {activeCardFilter === 'awards_ppo_pending' && (
                <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 6px', background: '#f3e8ff', color: '#7c3aed' }}>{UI_STRINGS.appAppDashboardPage.filtered}</span>
              )}
            </div>
            <div className="kpi-value" style={{ color: '#7c3aed' }}>{summary.awardsPpoPending ?? 0}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.awardSanctionOrderIssuance}</div>
          </div>
        </div>

        {/* 2. BOQ-Centred Sourcing Register with Expandable Associated RFQs */}
        <div className="card mb-6">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ClipboardCheck size={18} color="#059669" />{UI_STRINGS.appAppDashboardPage.approvedBOQSourcingRegister}</span>
              <button
                type="button"
                onClick={toggleExpandAll}
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, color: '#2563eb' }}
              >
                {filteredRegister.every((b) => expandedPrs[b.id]) ? UI_STRINGS.appAppDashboardPage.collapseAllBOQs : UI_STRINGS.appAppDashboardPage.expandAllBOQs}
              </button>
            </div>

            {/* Register Filters & Search */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder={UI_STRINGS.appAppDashboardPage.searchBOQCodeRFQPackageProjectCostCentre}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input input-sm"
                style={{ width: 290, fontSize: 12 }}
              />

              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="input input-sm"
                style={{ width: 220, fontSize: 12 }}
              >
                <option value="">{UI_STRINGS.appAppDashboardPage.allStages}{register.length}{UI_STRINGS.common.copyc7zu6c}</option>
                {stagesList.map((st) => {
                  const cnt = register.filter((r) => (r.sourcingStage || r.currentStage || r.overallStage) === st).length;
                  return (
                    <option key={st} value={st}>
                      {st}{UI_STRINGS.common.copy1b3t0c5}{cnt}{UI_STRINGS.common.copyc7zu6c}</option>
                  );
                })}
              </select>

              {(searchTerm || selectedStage || activeCardFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedStage('');
                    setActiveCardFilter(null);
                  }}
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, color: '#dc2626' }}
                >{UI_STRINGS.appAppDashboardPage.clearAllFilters}</button>
              )}
            </div>
          </div>

          {/* Active Card Filter Banner */}
          {activeCardFilter && (
            <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{UI_STRINGS.appAppDashboardPage.filteredBy}{' '}
                <strong style={{ color: '#0f172a' }}>
                  {activeCardFilter === 'prs_received' && UI_STRINGS.appAppDashboardPage.approvedBOQsAwaitingSourcing}
                  {activeCardFilter === 'rfqs_in_progress' && UI_STRINGS.appAppDashboardPage.rFQsInProgressQuotesComparison}
                  {activeCardFilter === 'negotiations_pending' && UI_STRINGS.common.negotiationsPending}
                  {activeCardFilter === 'awards_ppo_pending' && UI_STRINGS.appAppDashboardPage.awardsPPOsPending}
                </strong>{' '}{UI_STRINGS.appAppDashboardPage.showing2}{filteredRegister.length}{UI_STRINGS.appAppDashboardPage.bOQs}</span>
              <button
                type="button"
                onClick={() => setActiveCardFilter(null)}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >{UI_STRINGS.appAppDashboardPage.resetFilter}</button>
            </div>
          )}

          {data.registerHasMore && (
            <div className="alert alert-info" style={{ margin: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{interpolateUiString(UI_STRINGS.appAppDashboardPage.dashboardRegisterPreviewNotice, { limit: data.registerPreviewLimit })}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <Link className="btn btn-sm btn-secondary" href="/procurement/approved-boqs">{UI_STRINGS.common.approvedBOQs}</Link>
                <Link className="btn btn-sm btn-secondary" href="/procurement/approved-prs">{UI_STRINGS.appAppProcurementApprovedPrsPage.approvedPRs}</Link>
              </span>
            </div>
          )}

          {filteredRegister.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FileText size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppDashboardPage.noMatchingBOQCommercialBaselinesFound}</div>
              <div className="empty-desc">
                {searchTerm || selectedStage || activeCardFilter
                  ? UI_STRINGS.appAppDashboardPage.tryClearingTheSearchOrStageFilters
                  : UI_STRINGS.appAppDashboardPage.approvedBOQsWillAutomaticallyAppearHereOnceReleasedByTheProjectApprover}
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>{UI_STRINGS.common.pRNumber}</th>
                    <th>{UI_STRINGS.common.packageDescription}</th>
                    <th style={{ width: 85, textAlign: 'center' }}>{UI_STRINGS.common.items4}</th>
                    <th style={{ width: 95 }}>{UI_STRINGS.common.costCentre2}</th>
                    <th style={{ width: 130, textAlign: 'right' }}>{UI_STRINGS.common.pRAmount}</th>
                    <th style={{ width: 110 }}>{UI_STRINGS.common.approvalStatus}</th>
                    <th style={{ width: 140 }}>{UI_STRINGS.common.procurementStage}</th>
                    <th style={{ width: 90, textAlign: 'center' }}>{UI_STRINGS.common.rFQCount}</th>
                    <th className="col-actions" style={{ width: 115, textAlign: 'right' }}>{UI_STRINGS.common.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegister.map((item: any) => {
                    const isExpanded = !!expandedPrs[item.id];
                    const rfqCount = item.rfqs?.length || 0;
                    const stage = item.sourcingStage || item.currentStage || item.overallStage || UI_STRINGS.common.notAvailable;
                    const itemCount = item.itemCount ?? item.totalLines ?? item.lines?.length ?? 0;
                    const costCentreCode = item.costCentreCode || (item.costCentre ? item.costCentre.split(' - ')[0] : UI_STRINGS.common.notAvailable);
                    const registerAmount = item.benchmarkValue ?? item.requestedValue;

                    return (
                      <Fragment key={item.id}>
                        {/* Top-Level Summary Row */}
                        <tr
                          style={{
                            backgroundColor: isExpanded ? '#f8fafc' : undefined,
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {/* 1. PR / BOQ Number */}
                          <td className="font-mono font-bold text-primary">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {rfqCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(item.id)}
                                  className="btn btn-ghost btn-xs"
                                  style={{ padding: 2, color: '#64748b' }}
                                  title={isExpanded ? UI_STRINGS.appAppDashboardPage.collapseNestedRFQs : UI_STRINGS.appAppDashboardPage.expandNestedRFQs}
                                  aria-label={isExpanded ? UI_STRINGS.appAppDashboardPage.collapseRFQs : UI_STRINGS.appAppDashboardPage.expandRFQs}
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              )}
                              <span>{item.prNumber || item.boqCode || UI_STRINGS.common.notAvailable}</span>
                            </div>
                          </td>

                          {/* 2. Short Package/PR Description */}
                          <td style={{ maxWidth: 260 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={interpolateUiString(UI_STRINGS.common.value1, { "value1": item.title || item.description || UI_STRINGS.common.notAvailable })}
                            >
                              {item.title || item.description || UI_STRINGS.common.notAvailable}
                            </div>
                          </td>

                          {/* 3. Item Count */}
                          <td style={{ textAlign: 'center' }}>
                            <span className="text-muted" style={{ fontSize: 12, fontWeight: 500 }}>
                              {itemCount} {itemCount === 1 ? UI_STRINGS.common.item : UI_STRINGS.common.items5}
                            </span>
                          </td>

                          {/* 4. Cost Centre Code */}
                          <td>
                            <span
                              className="font-mono"
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#334155',
                                background: '#f1f5f9',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              {costCentreCode}
                            </span>
                          </td>

                          {/* 5. PR Amount */}
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                            {registerAmount === null || registerAmount === undefined
                              ? UI_STRINGS.common.notAvailable
                              : <>{UI_STRINGS.common.copy1g8b5tg}{Number(registerAmount).toLocaleString(I18N_CONFIG.defaultLocale)}</>}
                          </td>

                          {/* 6. Approval Status */}
                          <td>
                            <StatusBadge status={item.prApprovalStatus || UI_STRINGS.common.notAvailable} />
                          </td>

                          {/* 7. Procurement Stage */}
                          <td>
                            <span className={`badge ${getStageBadgeClass(stage)}`} style={{ fontSize: 11 }}>
                              {stage}
                            </span>
                          </td>

                          {/* 8. RFQ Count */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              className={`badge ${rfqCount > 0 ? 'badge-info' : 'badge-draft'}`}
                              style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
                              title={UI_STRINGS.appAppDashboardPage.clickToToggleAssociatedRFQPackages}
                            >
                              {rfqCount} {rfqCount === 1 ? UI_STRINGS.common.rFQ : UI_STRINGS.common.rFQs}
                            </button>
                          </td>

                          {/* 9. One View Details Action */}
                          <td className="col-actions" style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenPrDetails(item)}
                              className="btn btn-sm btn-secondary"
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Eye size={12} />{UI_STRINGS.appAppDashboardPage.viewDetails}</button>
                          </td>
                        </tr>

                        {/* Nested Associated RFQs Sourcing Lifecycle Row (Expanded) */}
                        {isExpanded && (
                          <tr key={`${item.id}-nested`} style={{ background: '#f8fafc' }}>
                            <td colSpan={9} style={{ padding: '0 0 16px 40px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                              <div
                                style={{
                                  background: '#ffffff',
                                  borderRadius: 8,
                                  border: '1px solid #cbd5e1',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                  padding: '16px 20px',
                                  marginTop: 4,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Layers size={16} color="#2563eb" />
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{UI_STRINGS.appAppDashboardPage.associatedSourcingPackagesFor}{item.boqCode || item.prNumber}
                                    </span>
                                    <span className="badge badge-info" style={{ fontSize: 11 }}>
                                      {rfqCount}{UI_STRINGS.appAppDashboardPage.package}{rfqCount === 1 ? '' : UI_STRINGS.common.s}{UI_STRINGS.appAppDashboardPage.linked}</span>
                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{UI_STRINGS.common.project2}<strong style={{ color: '#334155' }}>{item.projectName}</strong>
                                    </span>
                                  </div>
                                  <Link
                                    href={getRegisterRfqHref(item)}
                                    className="btn btn-sm btn-primary"
                                    style={{ fontSize: 11, padding: '4px 10px', fontWeight: 600 }}
                                  >
                                    <Plus size={12} style={{ marginRight: 4 }} />{UI_STRINGS.appAppDashboardPage.createRFQPackage}</Link>
                                </div>

                                {rfqCount === 0 ? (
                                  <div
                                    style={{
                                      background: '#f8fafc',
                                      border: '1px dashed #cbd5e1',
                                      borderRadius: 6,
                                      padding: '20px',
                                      textAlign: 'center',
                                    }}
                                  >
                                    <p style={{ margin: 0, fontSize: 13, color: '#475569', fontWeight: 600 }}>{UI_STRINGS.appAppDashboardPage.noRFQPackagesCreatedForThisCommercialBaselineYet}</p>
                                    <p style={{ margin: '4px 0 12px', fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppDashboardPage.approvedBOQLineItemsAndBenchmarkRatesAreLockedAndReadyForPackagingAndVendorQuotationDispatch}</p>
                                    <Link
                                      href={getRegisterRfqHref(item)}
                                      className="btn btn-sm btn-primary"
                                      style={{ fontWeight: 700, fontSize: 12 }}
                                    >{UI_STRINGS.appAppDashboardPage.createFirstRFQPackage}</Link>
                                  </div>
                                ) : (
                                  <div className="table-wrapper" style={{ borderRadius: 6, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <table className="data-table" style={{ fontSize: 12, margin: 0 }}>
                                      <thead>
                                        <tr style={{ background: '#f1f5f9' }}>
                                          <th>{UI_STRINGS.common.rFQNumber}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.rFQDescriptionPackage}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.invitedVendorsBids}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.quotationComparison}</th>
                                          <th>{UI_STRINGS.common.negotiationStage}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.pendingActionTurn}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.awardStatus}</th>
                                          <th>{UI_STRINGS.appAppDashboardPage.pPOStatus}</th>
                                          <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppDashboardPage.sourcingLifecycleActions}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.rfqs.map((rfq: any) => (
                                          <tr key={rfq.id}>
                                            {/* RFQ Number */}
                                            <td className="font-mono" style={{ fontWeight: 700 }}>
                                              <Link
                                                href={rfq.openUrl || `/procurement/rfqs/${rfq.id}`}
                                                style={{ color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                title={UI_STRINGS.appAppDashboardPage.openFullCommercialWorkspace}
                                              >
                                                {rfq.rfqNumber}
                                              </Link>
                                            </td>

                                            {/* RFQ Description or Scope */}
                                            <td>
                                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{rfq.description || rfq.title}</div>
                                              {rfq.packageName && rfq.packageName !== (rfq.description || rfq.title) && (
                                                <div style={{ fontSize: 11, color: '#64748b' }}>{rfq.packageName}</div>
                                              )}
                                            </td>

                                            {/* Vendor Invitation / Response Progress */}
                                            <td>
                                              <span className="badge badge-info" style={{ fontSize: 11 }}>
                                                {rfq.vendorInvitationProgress}
                                              </span>
                                            </td>

                                            {/* Quotation Comparison Status */}
                                            <td>
                                              <div style={{ fontWeight: 500 }}>{rfq.comparisonStatus || rfq.quotationStage || UI_STRINGS.common.copy4s9bsz}</div>
                                            </td>

                                            {/* Negotiation Stage */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.negotiationStage && rfq.negotiationStage !== '—' ? 'badge-review' : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.negotiationStage || rfq.negotiationRound || UI_STRINGS.common.copy4s9bsz}
                                              </span>
                                            </td>

                                            {/* Pending Action & Turn */}
                                            <td>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <span style={{ fontSize: 11, fontWeight: 500, color: '#0f172a' }}>
                                                  {rfq.pendingAction || UI_STRINGS.appAppDashboardPage.awaitingAction}
                                                </span>
                                                {rfq.nextResponsibleParty && (
                                                  <div>
                                                    <span
                                                      className="badge"
                                                      style={{
                                                        fontSize: 9,
                                                        padding: '1px 4px',
                                                        fontWeight: 700,
                                                        background: rfq.nextResponsibleParty === 'BUYER' ? '#eff6ff' : (rfq.nextResponsibleParty === 'VENDOR' ? '#fef3c7' : '#f1f5f9'),
                                                        color: rfq.nextResponsibleParty === 'BUYER' ? '#1d4ed8' : (rfq.nextResponsibleParty === 'VENDOR' ? '#92400e' : '#475569'),
                                                      }}
                                                    >{UI_STRINGS.appAppDashboardPage.tURN}{rfq.nextResponsibleParty}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </td>

                                            {/* Award Status */}
                                            <td>
                                              <span
                                                className={`badge ${
                                                  rfq.awardStatus === 'Approved' || rfq.awardStatus === 'Awarded'
                                                    ? 'badge-approved'
                                                    : rfq.awardStatus === 'Pending Approval' || rfq.awardStatus === 'Award Recommended'
                                                    ? 'badge-review'
                                                    : 'badge-draft'
                                                }`}
                                                style={{ fontSize: 10 }}
                                              >
                                                {rfq.awardStatus}
                                              </span>
                                              {rfq.recommendedVendor && (
                                                <div style={{ fontSize: 10, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                                                  {rfq.recommendedVendor}
                                                </div>
                                              )}
                                            </td>

                                            {/* PPO Status */}
                                            <td>
                                              {rfq.ppoStatus && rfq.ppoStatus !== '—' ? (
                                                <span className="badge badge-approved" style={{ fontSize: 10 }}>
                                                  {rfq.ppoStatus}
                                                </span>
                                              ) : (
                                                <span className="text-muted" style={{ fontSize: 11 }}>{UI_STRINGS.common.copy4s9bsz}</span>
                                              )}
                                            </td>

                                            {/* Lifecycle Direct Action Buttons */}
                                            <td style={{ textAlign: 'right' }}>
                                              <div style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                <Link
                                                  href={rfq.openUrl || `/procurement/rfqs/${rfq.id}`}
                                                  className="btn btn-sm btn-secondary"
                                                  style={{ fontSize: 10, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                  title={UI_STRINGS.appAppDashboardPage.openQuotationComparisonMatrix}
                                                >{UI_STRINGS.appAppDashboardPage.openRFQ}<ArrowRight size={10} />
                                                </Link>
                                                <Link
                                                  href={rfq.negotiationUrl || `/procurement/rfqs/${rfq.id}?tab=negotiation`}
                                                  className="btn btn-sm btn-outline"
                                                  style={{ fontSize: 10, padding: '3px 8px', color: '#b45309', borderColor: '#fde68a', background: '#fffbeb' }}
                                                  title={UI_STRINGS.common.openNegotiationWorkspace}
                                                >{UI_STRINGS.common.negotiate}</Link>
                                                <Link
                                                  href={rfq.awardingUrl || `/procurement/rfqs/${rfq.id}?tab=awarding`}
                                                  className="btn btn-sm btn-outline"
                                                  style={{ fontSize: 10, padding: '3px 8px', color: '#6b21a8', borderColor: '#e9d5ff', background: '#faf5ff' }}
                                                  title={UI_STRINGS.appAppDashboardPage.openAwardingPPOWorkspace}
                                                >{UI_STRINGS.appAppDashboardPage.awardPPO}</Link>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 3. Collapsible Category Masters & Specification Quality Health Panel */}
        <div className="card mb-6">
          <div
            className="card-header"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setShowCategoryGovernance(!showCategoryGovernance)}
          >
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Folder size={18} color="#2563eb" />{UI_STRINGS.appAppDashboardPage.categoryMastersSpecificationQualityHealth}<span className="badge badge-draft" style={{ fontSize: 11, marginLeft: 8 }}>
                {data.categoryCount ?? 0}{UI_STRINGS.appAppDashboardPage.taxonomyTrees}{data.exceptionTotalCount ?? data.revisionsWithExceptions?.length ?? 0}{UI_STRINGS.appAppDashboardPage.exceptions}</span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 11, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {showCategoryGovernance ? UI_STRINGS.appAppDashboardPage.hideCategoryControls : UI_STRINGS.appAppDashboardPage.showCategoryControls}
            </button>
          </div>

          {showCategoryGovernance && (
            <div className="card-body" style={{ borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
              {data.taxonomyHasMore && (
                <div className="alert alert-info" style={{ marginBottom: 12 }}>
                  {UI_STRINGS.appAppDashboardPage.categoryTaxonomyPreviewNotice}
                </div>
              )}
              {/* Category taxonomy cards */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 13, color: '#1e293b' }}>{UI_STRINGS.appAppDashboardPage.activeTaxonomyTreesCategories}</strong>
                  <Link href="/masters/categories" className="btn btn-sm btn-secondary">{UI_STRINGS.appAppDashboardPage.manageCategoryMasters}</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {data.categories?.map((cat: any) => (
                    <div key={cat.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#ffffff' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Folder size={14} color="#3b82f6" /> {cat.name}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {cat.children?.map((sub: any) => (
                          <span key={sub.id} className="badge badge-draft" style={{ fontSize: 10 }}>{sub.name}</span>
                        ))}
                        {!cat.children?.length && <span className="text-muted" style={{ fontSize: 11 }}>{UI_STRINGS.common.noSubcategories}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality exceptions */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 13, color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={15} color="#d97706" />{UI_STRINGS.appAppDashboardPage.bOQsRequiringCategorySpecificationQualityAttention}</strong>
                </div>
                {!data.revisionsWithExceptions?.length ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: 6, fontSize: 12 }}>{UI_STRINGS.appAppDashboardPage.allBOQRevisionsMeetCategoryTaxonomyAndUOMStandardsNoValidationExceptionsFound}</div>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>{UI_STRINGS.common.project}</th>
                          <th>{UI_STRINGS.appAppDashboardPage.bOQCode}</th>
                          <th>{UI_STRINGS.common.revision}</th>
                          <th>{UI_STRINGS.common.errors}</th>
                          <th>{UI_STRINGS.common.warnings}</th>
                          <th>{UI_STRINGS.common.qualityScore}</th>
                          <th>{UI_STRINGS.common.action}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.revisionsWithExceptions?.map((r: any) => (
                          <tr key={r.id}>
                            <td>{r.boq?.project?.name}</td>
                            <td className="font-mono">{r.boq?.boqCode}</td>
                            <td><span className="badge badge-submitted">{r.revisionCode}</span></td>
                            <td><span className="badge badge-error">{r.errorLines}{UI_STRINGS.appAppDashboardPage.errors}</span></td>
                            <td><span className="badge badge-warning">{r.warningLines}{UI_STRINGS.appAppDashboardPage.warnings}</span></td>
                            <td><strong>{r.qualityScore ?? UI_STRINGS.common.copy4s9bsz}{UI_STRINGS.common.copy8w4luo}</strong></td>
                            <td>
                              <Link href={`/boq/${r.id}`} className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}>{UI_STRINGS.appAppDashboardPage.inspectWorkspace}</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Standardised PR Details Modal */}
        {prDetailsModalOpen && selectedPrForDetails && (
          <PrDetailModal
            isOpen={prDetailsModalOpen}
            onClose={() => {
              setPrDetailsModalOpen(false);
              setSelectedPrForDetails(null);
            }}
            pr={selectedPrForDetails}
            userRole={data.role}
          />
        )}
      </div>
    );
  }

  // ============================================================
  // 6. CLIENT_ADMIN VIEW
  // ============================================================
  if (data.role === 'CLIENT_ADMIN') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">{UI_STRINGS.appAppDashboardPage.clientAdministrationDashboard}</div>
            <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.tenantGovernance}{data.tenant?.name || UI_STRINGS.appAppDashboardPage.organization}</div>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/users" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Users size={16} />{UI_STRINGS.appAppDashboardPage.manageUsers}</Link>
            <Link href="/projects/new" className="btn btn-primary">{UI_STRINGS.appAppDashboardPage.newProject}</Link>
          </div>
        </div>

        <div className="kpi-grid mb-6">
          <div className="kpi-card"><div className="kpi-label">{UI_STRINGS.appAppDashboardPage.totalProjects}</div><div className="kpi-value">{data.totalProjects ?? 0}</div></div>
          <div className="kpi-card"><div className="kpi-label">{UI_STRINGS.appAppDashboardPage.activeProjects}</div><div className="kpi-value">{data.activeProjects ?? 0}</div></div>
          <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
            <div className="kpi-label">{UI_STRINGS.common.pendingApproval}</div>
            <div className="kpi-value" style={{ color: '#d97706' }}>{data.pendingApprovals ?? 0}</div>
          </div>
          <div className="kpi-card"><div className="kpi-label">{UI_STRINGS.appAppDashboardPage.totalUsers}</div><div className="kpi-value">{data.totalUsers ?? 0}</div></div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} />{UI_STRINGS.appAppDashboardPage.recentTenantAuditActivity}</span>
            <Link href="/audit" className="btn btn-sm btn-secondary">{UI_STRINGS.appAppDashboardPage.viewFullAuditLog}</Link>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>{UI_STRINGS.common.action}</th><th>{UI_STRINGS.common.entity}</th><th>{UI_STRINGS.common.user}</th><th>{UI_STRINGS.common.time}</th></tr></thead>
              <tbody>
                {data.recentActivity?.map((log: any) => (
                  <tr key={log.id}>
                    <td><span className="badge badge-info">{log.action}</span></td>
                    <td>{log.entityType}{UI_STRINGS.common.copy13emybb}<span className="text-muted">{log.description?.slice(0, 60)}</span></td>
                    <td>{log.user?.name || log.user?.email || UI_STRINGS.common.copy4s9bsz}</td>
                    <td className="text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 7. VIEWER VIEW
  // ============================================================
  if (data.role === 'VIEWER') {
    return (
      <div className="page-content">
        <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
          <div>
            <div className="page-title">{UI_STRINGS.appAppDashboardPage.projectBOQViewerReadOnly}</div>
            <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.auditorStakeholderObservationView}</div>
          </div>
          <span className="badge badge-draft" style={{ fontSize: 13, padding: '6px 12px' }}>{UI_STRINGS.appAppDashboardPage.roleVIEWERReadOnly}</span>
        </div>

        <div className="alert alert-info mb-6" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Lock size={20} style={{ color: '#475569', flexShrink: 0 }} />
          <div>
            <strong>{UI_STRINGS.appAppDashboardPage.restrictedAccessMode}</strong>{UI_STRINGS.appAppDashboardPage.yourAccountHasReadOnlyObservationPermissionsCreatingProjectsEditingLinesUploadingBOQsAndApprovalsAreDisabled}</div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">{UI_STRINGS.appAppDashboardPage.permittedProjects}{data.totalProjects ?? 0}{UI_STRINGS.common.copyc7zu6c}</span></div>
          {data.projectsHasMore && (
            <div className="alert alert-info" role="status">
              {interpolateUiString(UI_STRINGS.appAppDashboardPage.dashboardViewerProjectPreviewNotice, { "limit": data.projectPreviewLimit ?? 50 })}{' '}
              <Link href="/projects">{UI_STRINGS.common.allProjects}</Link>
            </div>
          )}
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_STRINGS.common.code}</th>
                  <th>{UI_STRINGS.common.name}</th>
                  <th>{UI_STRINGS.common.sector}</th>
                  <th>{UI_STRINGS.common.status}</th>
                  <th>{UI_STRINGS.appAppDashboardPage.latestBOQ}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.projects?.map((p: any) => {
                  const latestRev = p.boqs?.[0]?.revisions?.[0];
                  return (
                    <tr key={p.id}>
                      <td className="font-mono font-bold">{p.projectCode}</td>
                      <td>{p.name}</td>
                      <td><span className="badge badge-info">{p.sector}</span></td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>{latestRev ? interpolateUiString(UI_STRINGS.appAppDashboardPage.revisionCodeTotalLinesLines, { "revisionCode": latestRev.revisionCode, "totalLines": latestRev.totalLines }) : UI_STRINGS.appAppDashboardPage.noBOQ}</td>
                      <td>
                        <Link href={`/projects/${p.id}`} className="btn btn-sm btn-secondary">{UI_STRINGS.appAppDashboardPage.viewProject}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 8. PROJECT_USER VIEW (Default Procurement Transaction Dashboard)
  // ============================================================
  return (
    <div className="page-content">
      <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
        <div>
          <div className="page-title">{UI_STRINGS.appAppDashboardPage.procurementTransactionDashboard}</div>
          <div className="page-subtitle">{UI_STRINGS.appAppDashboardPage.liveBOQTransactionLedgerApprovalQueueBudgetBaseline}</div>
        </div>
        <Link href="/boq/studio" className="btn btn-primary">{UI_STRINGS.appAppDashboardPage.createBOQ}</Link>
      </div>

      {/* Role-based Pending Actions Alert (if any require attention) */}
      {data.pendingActions && data.pendingActions.length > 0 && (
        <div
          className="mb-6"
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '14px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={18} color="#d97706" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>{UI_STRINGS.appAppDashboardPage.pendingActionsRequiringYourAttention}{data.pendingActions.length}{UI_STRINGS.common.copyc7zu6c}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.pendingActions.slice(0, 3).map((act: any) => (
              <div
                key={act.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #fef3c7',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="font-mono font-bold" style={{ color: '#1e40af' }}>{act.boqCode}</span>
                  <span style={{ color: '#334155', fontWeight: 600 }}>{act.title}</span>
                  <StatusBadge status={act.status} />
                  <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppDashboardPage.copyk7zqc9}{act.actionText}</span>
                </div>
                <Link href={act.link} className="btn btn-sm btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }}>{UI_STRINGS.appAppDashboardPage.actionNow}</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 Summary Cards */}
      <div
        className="kpi-grid mb-6"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Total BOQs Raised */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #2563eb' }}>
          <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.totalBOQsRaised}</div>
          <div className="kpi-value" style={{ color: '#2563eb' }}>
            {data.totalBoqsRaised ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.allBOQsInRepository}</div>
        </div>

        {/* Card 2: BOQs Pending Approval */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
          <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.bOQsPendingApproval}</div>
          <div className="kpi-value" style={{ color: '#d97706' }}>
            {data.boqsPendingApproval ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.submittedInReview}</div>
        </div>

        {/* Card 3: Approved BOQs */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
          <div className="kpi-label">{UI_STRINGS.common.approvedBOQs}</div>
          <div className="kpi-value" style={{ color: '#059669' }}>
            {data.approvedBoqs ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.readyForPRBudget}</div>
        </div>

        {/* Card 4: BOQs Requiring Action */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #dc2626' }}>
          <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.bOQsRequiringAction}</div>
          <div className="kpi-value" style={{ color: '#dc2626' }}>
            {data.boqsRequiringAction ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.draftRejectedBOQs}</div>
        </div>

        {/* Card 5: Total Proposed Budget */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #6366f1' }}>
          <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.totalProposedBudget}</div>
          <div className="kpi-value" style={{ color: '#6366f1', fontSize: 20 }}>{UI_STRINGS.common.copy1g8b5tg}{(data.totalProposedBudget ?? 0).toLocaleString(I18N_CONFIG.defaultLocale)}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.totalProposedValue}</div>
        </div>

        {/* Card 6: Total Approved Budget */}
        <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
          <div className="kpi-label">{UI_STRINGS.appAppDashboardPage.totalApprovedBudget}</div>
          <div className="kpi-value" style={{ color: '#059669', fontSize: 20 }}>{UI_STRINGS.common.copy1g8b5tg}{(data.totalApprovedBudget ?? 0).toLocaleString(I18N_CONFIG.defaultLocale)}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppDashboardPage.baselinedApprovedCapex}</div>
        </div>
      </div>

      {/* Recent BOQs Table (Max 5 records) */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} />{UI_STRINGS.appAppDashboardPage.recentBOQs}</span>
          <Link href="/boq/studio" className="btn btn-sm btn-secondary">{UI_STRINGS.appAppDashboardPage.openBOQStudio}</Link>
        </div>

        {!data.recentBoqs || data.recentBoqs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText size={36} color="#94a3b8" strokeWidth={1.5} />
            </div>
            <div className="empty-title">{UI_STRINGS.appAppDashboardPage.noBOQsRecordedYet}</div>
            <div className="empty-desc">{UI_STRINGS.appAppDashboardPage.createOrUploadABOQToStartTrackingProcurementTransactions}</div>
            <Link href="/boq/studio" className="btn btn-primary" style={{ marginTop: 16 }}>{UI_STRINGS.appAppDashboardPage.createBOQ}</Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>{UI_STRINGS.common.bOQNumber}</th>
                  <th>{UI_STRINGS.common.bOQDescription}</th>
                  <th style={{ width: 180 }}>{UI_STRINGS.common.costCentre2}</th>
                  <th style={{ width: 150 }}>{UI_STRINGS.appAppDashboardPage.estimatedValue}</th>
                  <th style={{ width: 120 }}>{UI_STRINGS.common.status}</th>
                  <th style={{ width: 130 }}>{UI_STRINGS.common.lastUpdated}</th>
                  <th className="col-actions" style={{ width: 100, textAlign: 'right' }}>{UI_STRINGS.common.action}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBoqs.slice(0, 5).map((b: any) => (
                  <tr key={b.id}>
                    <td className="font-mono font-bold">
                      <Link href={`/boq/studio?boqId=${b.id}`} style={{ color: '#2563eb' }}>
                        {b.boqNumber}
                      </Link>
                    </td>
                    <td>
                      <div
                        style={{
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: b.boqDescription && b.boqDescription !== '—' ? '#0f172a' : '#94a3b8',
                        }}
                        title={b.boqDescription !== '—' ? b.boqDescription : undefined}
                      >
                        {b.boqDescription || UI_STRINGS.common.copy4s9bsz}
                      </div>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontSize: 12, color: '#475569' }}>
                        {b.costCentre || UI_STRINGS.common.copy4s9bsz}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.common.copy1g8b5tg}{(b.estimatedValue || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {b.lastUpdated ? new Date(b.lastUpdated).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}
                    </td>
                    <td className="col-actions" style={{ textAlign: 'right' }}>
                      <Link
                        href={`/boq/studio?boqId=${b.id}`}
                        className="btn btn-sm btn-primary"
                        style={{ padding: '4px 12px', fontSize: 11 }}
                      >{UI_STRINGS.common.open}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
