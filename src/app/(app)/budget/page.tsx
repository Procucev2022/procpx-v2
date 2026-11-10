'use client';
// src/app/(app)/budget/page.tsx - Enterprise Project Budget Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Landmark,
  Scale,
  History,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  TrendingDown,
  RefreshCw,
  Sparkles,
  Check,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { BudgetCategoriesResponse, BudgetCategory, BudgetCategoryWorkspaceState } from '@app-types/app/api/budgets/categories.types';


function ProjectBudgetContent() {
  const toast = useToast();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedCostCentreId, setSelectedCostCentreId] = useState<string>('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [categoryResult, setCategoryResult] = useState<BudgetCategoryWorkspaceState | null>(null);
  const [categoryReloadToken, setCategoryReloadToken] = useState(0);
  const categoryRequestId = useRef(0);
  const selectedCategoryKey = selectedProjectId && selectedCostCentreId
    ? `${selectedProjectId}::${selectedCostCentreId}::${categoryReloadToken}`
    : '';
  const currentCategoryResult = categoryResult?.key === selectedCategoryKey ? categoryResult : null;
  const categories = currentCategoryResult?.categories || [];
  const categoryPagination = currentCategoryResult?.categoryPagination || null;
  const categoryLoading = Boolean(selectedCategoryKey && (!currentCategoryResult || currentCategoryResult.loading));
  const categoryError = currentCategoryResult?.error || false;
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Approval action states
  const [approving, setApproving] = useState<boolean>(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [selectedRejectContrib, setSelectedRejectContrib] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Initial load: fetch projects and current user
  useEffect(() => {
    loadProjects();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const u = await res.json();
        setCurrentUserRole(u.user?.role || '');
      }
    } catch {
      // ignore
    }
  };

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const pData = await res.json();
        const list = pData.data || pData || [];
        setProjects(list);

        const paramProj = searchParams?.get('projectId');
        const initialProjId = (paramProj && list.find((p: any) => p.id === paramProj))
          ? paramProj
          : (list.length > 0 ? list[0].id : '');

        setSelectedProjectId(initialProjId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // When project changes, fetch budget data
  useEffect(() => {
    if (selectedProjectId) {
      loadBudgetData(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    const projectId = selectedProjectId;
    const costCentreId = selectedCostCentreId;
    const key = selectedCategoryKey;
    const requestId = ++categoryRequestId.current;
    let active = true;

    if (!projectId || !costCentreId || !key) {
      return () => { active = false; };
    }

    const params = new URLSearchParams({ projectId, costCentreId, page: '1', pageSize: '50' });
    fetch(`/api/budgets/categories?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData);
        return res.json();
      })
      .then((json) => {
        if (!active || requestId !== categoryRequestId.current) return;
        const result = json as BudgetCategoriesResponse;
        setCategoryResult({ ...result, key, loading: false, error: false });
      })
      .catch(() => {
        if (!active || requestId !== categoryRequestId.current) return;
        setCategoryResult({ key, categories: [], categoryPagination: { page: 1, pageSize: 50, total: 0, hasMore: false }, loading: false, error: true });
      });

    return () => { active = false; };
  }, [selectedProjectId, selectedCostCentreId, categoryReloadToken, selectedCategoryKey]);

  const loadBudgetData = async (projId: string, page = 1, append = false) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams({
        projectId: projId,
        page: String(page),
        pageSize: String(data?.costCentrePagination?.pageSize || 50),
      });
      const res = await fetch(`/api/budgets?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const currentCostCentres = append ? (data?.costCentres || []) : [];
        const mergedCostCentres = append
          ? Array.from(new Map([...currentCostCentres, ...(json.costCentres || [])].map(costCentre => [costCentre.id, costCentre])).values())
          : (json.costCentres || []);
        const currentPage = data?.costCentrePagination?.page || 0;
        const pagination = json.costCentrePagination || { page, pageSize: 50, total: mergedCostCentres.length, hasMore: false };
        setData({
          ...json,
          costCentres: mergedCostCentres,
          costCentrePagination: { ...pagination, page: append ? Math.max(currentPage, pagination.page) : pagination.page },
        });

        // Resolve cost centre selection
        const ccs = mergedCostCentres;
        const paramCc = searchParams?.get('costCentreId');

        if (paramCc && ccs.some((c: any) => c.id === paramCc)) {
          setSelectedCostCentreId(paramCc);
        } else if (selectedCostCentreId && ccs.some((c: any) => c.id === selectedCostCentreId)) {
          // Keep the selected centre while appending another page.
        } else if (ccs.length > 0) {
          setSelectedCostCentreId(ccs[0].id);
        } else {
          setSelectedCostCentreId('');
        }
      } else {
        setErrorMessage(UI_STRINGS.appAppBudgetPage.failedToLoadProjectBudgetData);
      }
    } catch (e: any) {
      setErrorMessage(interpolateUiString(UI_STRINGS.common.value1, { "value1": e.message || UI_STRINGS.common.userMessages.errorLoadingBudgetData }));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMoreCostCentres = () => {
    const pagination = data?.costCentrePagination;
    if (!pagination?.hasMore || loading) return;
    void loadBudgetData(selectedProjectId, pagination.page + 1, true);
  };

  const handleLoadMoreCategories = async () => {
    if (!categoryPagination?.hasMore || categoryLoading || !selectedProjectId || !selectedCostCentreId) return;
    const requestId = ++categoryRequestId.current;
    const params = new URLSearchParams({
      projectId: selectedProjectId,
      costCentreId: selectedCostCentreId,
      page: String(categoryPagination.page + 1),
      pageSize: String(categoryPagination.pageSize || 50),
    });
    setCategoryResult((current) => current?.key === selectedCategoryKey
      ? { ...current, loading: true, error: false }
      : { key: selectedCategoryKey, categories: [], categoryPagination: categoryPagination!, loading: true, error: false });
    try {
      const res = await fetch(`/api/budgets/categories?${params.toString()}`);
      if (!res.ok) throw new Error(UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData);
      const json = await res.json() as BudgetCategoriesResponse;
      if (requestId !== categoryRequestId.current) return;
      setCategoryResult((current) => {
        if (current?.key !== selectedCategoryKey) return current;
        const categoriesByName = new Map<string, BudgetCategory>();
        [...current.categories, ...json.categories].forEach((category) => categoriesByName.set(category.category, category));
        return { ...current, categories: Array.from(categoriesByName.values()), categoryPagination: json.categoryPagination, loading: false, error: false };
      });
    } catch {
      if (requestId === categoryRequestId.current) {
        setCategoryResult((current) => current?.key === selectedCategoryKey ? { ...current, loading: false, error: true } : current);
      }
    } finally {
      if (requestId === categoryRequestId.current) {
        setCategoryResult((current) => current?.key === selectedCategoryKey ? { ...current, loading: false } : current);
      }
    }
  };

  const refreshBudgetData = () => {
    void loadBudgetData(selectedProjectId, 1, true);
    setCategoryReloadToken((current) => current + 1);
  };

  // Change project handler
  const handleProjectChange = (newProjId: string) => {
    setSelectedProjectId(newProjId);
    setSelectedCostCentreId('');
    // update URL query without navigation reload
    const url = new URL(window.location.href);
    url.searchParams.set('projectId', newProjId);
    url.searchParams.delete('costCentreId');
    window.history.replaceState({}, '', url.toString());
  };

  // Change cost centre handler (in-place)
  const handleCostCentreChange = (newCcId: string) => {
    setSelectedCostCentreId(newCcId);
    const url = new URL(window.location.href);
    url.searchParams.set('costCentreId', newCcId);
    window.history.replaceState({}, '', url.toString());
  };

  // Find active records
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const costCentres: any[] = data?.costCentres || [];
  const selectedCC = costCentres.find(c => c.id === selectedCostCentreId) || costCentres[0] || null;

  // Cost Per Sqft Metrics
  const ccArea = selectedCC?.areaSqFt || 0;
  const ccTotalBudget = selectedCC?.totalBudget || 0;
  const ccApprovedBudget = selectedCC?.approvedBudget || 0;
  const ccPendingBudget = selectedCC?.pendingBudget || 0;
  const ccActual = selectedCC?.actual || 0;
  const ccBalance = selectedCC?.balance ?? Math.max(0, (ccApprovedBudget > 0 ? ccApprovedBudget : ccTotalBudget) - ccActual);
  const ccStatus = selectedCC?.budgetStatus || 'DRAFT';

  const budgetPerSqFt = ccArea > 0 ? Math.round(((ccApprovedBudget > 0 ? ccApprovedBudget : ccTotalBudget) / ccArea) * 100) / 100 : null;
  const actualPerSqFt = ccArea > 0 ? Math.round((ccActual / ccArea) * 100) / 100 : null;

  // Approval Actions
  const handleApproveContribution = async (contribId: string) => {
    setApproving(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await fetch('/api/budgets/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributionId: contribId, remarks: 'Approved by Project Approver from Project Budget' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.approvalFailed }));
      }
      toast.success(UI_STRINGS.common.budgetApprovedSuccessfully, currentProject?.name, UI_STRINGS.common.approved);
      setStatusMessage(UI_STRINGS.common.budgetApprovedSuccessfully);
      refreshBudgetData();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleOpenRejectModal = (contrib: any) => {
    setSelectedRejectContrib(contrib);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRejectContrib || !rejectReason.trim()) return;
    setApproving(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await fetch('/api/budgets/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributionId: selectedRejectContrib.id, reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.rejectionFailed }));
      }
      setRejectModalOpen(false);
      setSelectedRejectContrib(null);
      setRejectReason('');
      setStatusMessage(UI_STRINGS.common.budgetContributionRejectedWithAuditNotes);
      refreshBudgetData();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setApproving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return `₹ ${Math.round(val || 0).toLocaleString(I18N_CONFIG.defaultLocale)}`;
  };

  const formatStatusText = (status: string) => {
    if (!status) return '—';
    const s = status.toUpperCase();
    if (s === 'UNDER_PROJECT_APPROVAL' || s === 'PENDING_PROJECT_APPROVAL' || s === 'UNDER_APPROVAL' || s === 'UNDER APPROVAL' || s === 'PENDING APPROVAL') return 'Under Project Approval';
    if (s === 'PENDING_FINANCE_APPROVAL' || s === 'PENDING FINANCE APPROVAL' || s === 'UNDER_FINANCE_APPROVAL' || s === 'UNDER FINANCE APPROVAL') return 'Under Finance Approval';
    if (s === 'APPROVED') return 'Approved';
    if (s === 'REJECTED') return 'Rejected';
    if (s === 'PARTIALLY APPROVED') return 'Partially Approved';
    return status.replace(/_/g, ' ');
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
      case 'FINANCE APPROVED':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'UNDER_APPROVAL':
      case 'UNDER APPROVAL':
      case 'UNDER_PROJECT_APPROVAL':
      case 'PENDING PROJECT APPROVAL':
      case 'PENDING_PROJECT_APPROVAL':
      case 'PENDING APPROVAL':
        return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
      case 'PENDING_FINANCE_APPROVAL':
      case 'PENDING FINANCE APPROVAL':
      case 'UNDER_FINANCE_APPROVAL':
      case 'UNDER FINANCE APPROVAL':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
      case 'PARTIALLY APPROVED':
        return { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' };
      case 'REJECTED':
        return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
      default:
        return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
    }
  };

  // Find pending contributions for approver banner
  const pendingContributions = selectedCC?.contributions?.filter(
    (c: any) => c.status === 'UNDER_APPROVAL' || c.status === 'PENDING_PROJECT_APPROVAL' || c.status === 'PENDING_FINANCE_APPROVAL'
  ) || [];

  return (
    <div className="page-container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* 1. PROJECT BUDGET HEADER */}
      <PageHeader
        title={UI_STRINGS.appAppBudgetPage.projectBudgetWorkspace}
        subtitle={UI_STRINGS.appAppBudgetPage.integratedEnterpriseBudgetControlCostCentreAllocationSqftMetricsAndDownstreamProcurementGovernance}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshBudgetData}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={UI_STRINGS.appAppBudgetPage.refreshBudget}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{UI_STRINGS.common.refresh2}</button>
            <Link
              href="/budget/transactions"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <History size={14} />{UI_STRINGS.common.ledger}</Link>
            <Link
              href="/budget/vs-actual"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Scale size={14} />{UI_STRINGS.common.budgetVsActual}</Link>
          </div>
        }
      />

      {/* Global Selectors */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex gap-4 items-center flex-wrap">
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>{UI_STRINGS.common.project}</label>
          <select
            className="form-control"
            value={selectedProjectId}
            onChange={e => handleProjectChange(e.target.value)}
            style={{ height: 40, width: '100%', fontSize: 13, fontWeight: 600 }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.projectCode}{UI_STRINGS.common.copyq9aflv}{p.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>{UI_STRINGS.common.costCentre2}</label>
          <select
            className="form-control"
            value={selectedCostCentreId}
            onChange={e => handleCostCentreChange(e.target.value)}
            disabled={costCentres.length === 0}
            style={{ height: 40, width: '100%', fontSize: 13, fontWeight: 600 }}
          >
            {costCentres.length === 0 ? (
              <option value="">{UI_STRINGS.appAppBudgetPage.noCostCentres}</option>
            ) : (
              costCentres.map(cc => (
                <option key={cc.id} value={cc.id}>
                  {cc.code}{UI_STRINGS.common.copyq9aflv}{cc.name}
                </option>
              ))
            )}
          </select>
          {data?.costCentrePagination && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {interpolateUiString(UI_STRINGS.appAppCostCentresPage.showingCostCentreCountOfTotal, {
                  loaded: costCentres.length,
                  total: data.costCentrePagination.total,
                })}
              </span>
              {data.costCentrePagination.hasMore && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleLoadMoreCostCentres}
                  disabled={loading}
                >
                  {loading ? UI_STRINGS.appAppCostCentresPage.loadingMoreCostCentres : UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres}
                </button>
              )}
            </div>
          )}
        </div>

        {selectedCC && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', paddingTop: 18 }}>
            <span className="text-xs text-slate-500 font-medium">{UI_STRINGS.appAppBudgetPage.area}<strong className="text-slate-900">{ccArea > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleStringSqft, { "toLocaleString": ccArea.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.notSpecified}</strong>
            </span>
            <StatusBadge status={ccStatus} />
          </div>
        )}
      </div>

      {/* Status / Alerts */}
      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>{UI_STRINGS.common.copy4i33ao}</button>
        </div>
      )}

      {errorMessage && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>{UI_STRINGS.common.copy4i33ao}</button>
        </div>
      )}

      {/* 2. PROJECT BUDGET SUMMARY CARDS */}
      <div className="mb-6">
        <SummaryCardGrid columns={4}>
          <SummaryCard
            label={UI_STRINGS.appAppBudgetPage.totalBudgetAllocation}
            value={formatCurrency(ccTotalBudget)}
            secondary={interpolateUiString(UI_STRINGS.appAppBudgetPage.approvedValue1PendingValue2, { "value1": formatCurrency(ccApprovedBudget), "value2": formatCurrency(ccPendingBudget) })}
            icon={<Landmark size={16} />}
            accent="default"
          />
          <SummaryCard
            label={UI_STRINGS.appAppBudgetPage.actualSpend}
            value={formatCurrency(ccActual)}
            secondary={interpolateUiString(UI_STRINGS.appAppBudgetPage.utilisationValue1, { "value1": ccTotalBudget > 0 ? ((ccActual / ccTotalBudget) * 100).toFixed(1) : 0 })}
            icon={<TrendingDown size={16} />}
            accent="neutral"
          />
          <SummaryCard
            label={UI_STRINGS.appAppBudgetPage.availableBalance}
            value={formatCurrency(ccBalance)}
            secondary={UI_STRINGS.appAppBudgetPage.uncommittedAllocation}
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
          <SummaryCard
            label={UI_STRINGS.appAppBudgetPage.costPerSqft}
            value={ccArea > 0 ? `₹ ${budgetPerSqFt?.toLocaleString(I18N_CONFIG.defaultLocale)}` : '—'}
            secondary={ccArea > 0 ? interpolateUiString(UI_STRINGS.appAppBudgetPage.actualValue1Sqft, { "value1": actualPerSqFt || 0 }) : UI_STRINGS.appAppBudgetPage.areaNotConfigured}
            icon={<Scale size={16} />}
            accent="blue"
          />
        </SummaryCardGrid>
      </div>

      {/* Approver / Governance Queue Banner (if pending) */}
      {pendingContributions.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '14px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={18} color="#b45309" />
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                  {pendingContributions.length}{UI_STRINGS.appAppBudgetPage.budgetContribution}{pendingContributions.length > 1 ? UI_STRINGS.common.s : ''}{UI_STRINGS.appAppBudgetPage.underApprovalFor}{selectedCC?.name}
                </span>
                <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>{UI_STRINGS.appAppBudgetPage.originatedFromCommercialBOQAllocationRequiresProjectApproverReviewAndSignOff}</div>
              </div>
            </div>

            {/* If user is Project Approver or Admin, provide approval actions */}
            {(currentUserRole === 'PROJECT_APPROVER' || currentUserRole === 'CLIENT_ADMIN' || currentUserRole === 'SUPER_ADMIN') && (
              <div style={{ display: 'flex', gap: 8 }}>
                {pendingContributions.map((contrib: any) => {
                  return (
                    <div key={contrib.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        disabled={approving}
                        onClick={() => handleApproveContribution(contrib.id)}
                        className="btn btn-primary btn-sm"
                        style={{ height: 32, fontSize: 12, padding: '0 12px', background: '#047857', borderColor: '#047857' }}
                      >
                        <Check size={14} />{UI_STRINGS.appAppBudgetPage.approveBudget}{contrib.totalEstimatedValue ? contrib.totalEstimatedValue.toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.appAppBudgetPage.copyepw9f3}{UI_STRINGS.common.copyc7zu6c}</button>
                      <button
                        type="button"
                        disabled={approving}
                        onClick={() => handleOpenRejectModal(contrib)}
                        className="btn btn-outline btn-sm"
                        style={{ height: 32, fontSize: 12, padding: '0 10px', color: '#b91c1c' }}
                      >
                        <X size={14} />{UI_STRINGS.common.reject}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. CATEGORY-WISE BUDGET TABLE */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{UI_STRINGS.appAppBudgetPage.cATEGORYWISEBUDGET}</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>{UI_STRINGS.appAppBudgetPage.calculatedFromCommercialBOQAllocationsAndVerifiedCostTransactionsFor}{selectedCC?.code || UI_STRINGS.appAppBudgetPage.thisCostCentre}{UI_STRINGS.common.copyby08hd}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            {categoryPagination?.total ?? categories.length}{UI_STRINGS.appAppBudgetPage.commercialCategories}</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
                <th style={{ padding: '0 16px', fontWeight: 700 }}>{UI_STRINGS.common.category2}</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>{UI_STRINGS.common.approvedBudget}</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>{UI_STRINGS.common.pendingApproval}</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>{UI_STRINGS.common.sqft}</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>{UI_STRINGS.common.actual}</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>{UI_STRINGS.appAppBudgetPage.balance}</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'center' }}>{UI_STRINGS.common.approvalStatus}</th>
              </tr>
            </thead>
            <tbody>
              {categoryLoading && categories.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <RefreshCw size={16} className="animate-spin" />{UI_STRINGS.appAppBudgetPage.loadingCategoryBudgetMetrics}</div>
                  </td>
                </tr>
              ) : categoryError && categories.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#b91c1c' }}>
                    {UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData}
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                    <FileSpreadsheet size={36} color="#cbd5e1" style={{ margin: '0 auto 10px auto' }} />
                    <div style={{ fontWeight: 600, color: '#334155', fontSize: 14 }}>{UI_STRINGS.appAppBudgetPage.noCategoryBudgetAllocated}</div>
                    <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 16px 0' }}>{UI_STRINGS.appAppBudgetPage.addACompletedBOQWithAICostToAllocateCommercialBudgetTo}{selectedCC?.name || UI_STRINGS.appAppBudgetPage.thisCostCentre}{UI_STRINGS.common.copyby08hd}</p>
                    <Link
                      href={`/boq/studio?projectId=${selectedProjectId}&costCentreId=${selectedCostCentreId}`}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: 12, padding: '0 14px' }}
                    >
                      <Sparkles size={14} />{UI_STRINGS.common.openBOQStudio}</Link>
                  </td>
                </tr>
              ) : (
                categories.map(cat => {
                  const statusStyle = getStatusBadgeStyle(cat.status);
                  return (
                    <tr key={cat.category} style={{ borderBottom: '1px solid #f1f5f9', height: 48 }}>
                      <td style={{ padding: '0 16px', fontWeight: 600, color: '#0f172a' }}>
                        {cat.category}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: cat.approvedBudget > 0 ? '#047857' : '#64748b' }}>
                        {formatCurrency(cat.approvedBudget)}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 600, color: cat.pendingBudget > 0 ? '#b45309' : '#94a3b8' }}>
                        {cat.pendingBudget > 0 ? formatCurrency(cat.pendingBudget) : UI_STRINGS.common.copy4s9bsz}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>
                        {cat.ratePerSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": cat.ratePerSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : (ccArea > 0 ? UI_STRINGS.common.copyi1bvs4 : UI_STRINGS.common.copy4s9bsz)}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 600, color: cat.actual > 0 ? '#0f172a' : '#94a3b8' }}>
                        {formatCurrency(cat.actual)}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                        {formatCurrency(cat.balance)}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            border: `1px solid ${statusStyle.border}`,
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                            display: 'inline-block',
                          }}
                        >
                          {formatStatusText(cat.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {categoryPagination && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {interpolateUiString(UI_STRINGS.appAppBudgetPage.showingCategoriesOfTotal, {
                shown: categories.length,
                total: categoryPagination.total,
              })}
            </span>
            {categoryPagination.hasMore && (
              <button type="button" className="btn btn-outline btn-sm" onClick={handleLoadMoreCategories} disabled={categoryLoading}>
                {categoryLoading ? UI_STRINGS.appAppBudgetPage.loadingCategoryBudgetMetrics : UI_STRINGS.appAppBudgetPage.loadMoreCategories}
              </button>
            )}
          </div>
        )}
        {categoryError && categories.length > 0 && (
          <div role="alert" style={{ padding: '8px 16px', color: '#b91c1c', fontSize: 12 }}>
            {UI_STRINGS.appAppBudgetPage.failedToLoadCategoryBudgetData}
          </div>
        )}
      </div>

      {/* REJECT MODAL */}
      {rejectModalOpen && selectedRejectContrib && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px 0', color: '#b91c1c' }}>{UI_STRINGS.common.rejectBudgetContribution}</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>{UI_STRINGS.appAppBudgetPage.mandatoryProjectApproverRequirementPleaseProvideTheReasonForRejectingThisBudgetContribution}</p>

            <form onSubmit={handleConfirmReject}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppBudgetPage.mandatoryRejectionReason}</label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder={UI_STRINGS.appAppBudgetPage.specifyReasonForBudgetRejection}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setRejectModalOpen(false)} disabled={approving}>{UI_STRINGS.common.cancel}</button>
                <button type="submit" className="btn btn-outline" style={{ background: '#b91c1c', color: '#ffffff', borderColor: '#b91c1c' }} disabled={approving || !rejectReason.trim()}>
                  {approving ? UI_STRINGS.common.rejecting : UI_STRINGS.common.confirmRejection}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cost Centre Quick Switcher Footer if multiple cost centres exist */}
      {costCentres.length > 1 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
            <Layers size={16} color="#64748b" />
            <span>{UI_STRINGS.appAppBudgetPage.switchCostCentreInThisProject}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {costCentres.map(cc => (
              <button
                key={cc.id}
                type="button"
                onClick={() => handleCostCentreChange(cc.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: cc.id === selectedCostCentreId ? '1px solid #1e40af' : '1px solid #cbd5e1',
                  background: cc.id === selectedCostCentreId ? '#eff6ff' : '#ffffff',
                  color: cc.id === selectedCostCentreId ? '#1e40af' : '#475569',
                }}
              >
                {cc.code}{UI_STRINGS.common.copyq9aflv}{cc.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectBudgetPage() {
  return (
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.common.loadingProjectBudget}</div>}>
      <ProjectBudgetContent />
    </Suspense>
  );
}
