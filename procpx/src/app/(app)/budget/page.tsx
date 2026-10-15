'use client';
// src/app/(app)/budget/page.tsx - Enterprise Project Budget Workspace
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Landmark,
  Scale,
  History,
  Building2,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

function ProjectBudgetContent() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedCostCentreId, setSelectedCostCentreId] = useState<string>('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
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

  const loadBudgetData = async (projId: string) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/budgets?projectId=${projId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);

        // Resolve cost centre selection
        const ccs = json.costCentres || [];
        const paramCc = searchParams?.get('costCentreId');

        if (paramCc && ccs.some((c: any) => c.id === paramCc)) {
          setSelectedCostCentreId(paramCc);
        } else if (ccs.length > 0) {
          // If current selected CC belongs to this project, keep it, otherwise pick first
          setSelectedCostCentreId(prev => (ccs.some((c: any) => c.id === prev) ? prev : ccs[0].id));
        } else {
          setSelectedCostCentreId('');
        }
      } else {
        setErrorMessage('Failed to load project budget data.');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Error loading budget data.');
    } finally {
      setLoading(false);
    }
  };

  // Change project handler
  const handleProjectChange = (newProjId: string) => {
    setSelectedProjectId(newProjId);
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
  const balancePerSqFt = ccArea > 0 ? Math.round((ccBalance / ccArea) * 100) / 100 : null;

  // Category rows
  const categories: any[] = selectedCC?.categories || [];

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
        throw new Error(err.error || 'Approval failed');
      }
      toast.success('Budget approved successfully.', currentProject?.name, 'Approved');
      setStatusMessage('Budget approved successfully.');
      loadBudgetData(selectedProjectId);
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
        throw new Error(err.error || 'Rejection failed');
      }
      setRejectModalOpen(false);
      setSelectedRejectContrib(null);
      setRejectReason('');
      setStatusMessage('Budget contribution rejected with audit notes.');
      loadBudgetData(selectedProjectId);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setApproving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return `₹ ${Math.round(val || 0).toLocaleString('en-IN')}`;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e40af' }}>
              <Landmark size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                PROJECT BUDGET
              </h1>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Integrated enterprise budget control, cost centre allocation, ₹/Sqft metrics, and downstream procurement governance.
              </p>
            </div>
          </div>
        </div>

        {/* Global Selectors & Fast Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Project Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Project
            </label>
            <select
              className="select-field"
              value={selectedProjectId}
              onChange={e => handleProjectChange(e.target.value)}
              style={{ height: 38, minWidth: 220, fontSize: 13, fontWeight: 600, color: '#0f172a' }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.projectCode} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cost Centre Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Cost Centre
            </label>
            <select
              className="select-field"
              value={selectedCostCentreId}
              onChange={e => handleCostCentreChange(e.target.value)}
              disabled={costCentres.length === 0}
              style={{ height: 38, minWidth: 240, fontSize: 13, fontWeight: 600, color: '#0f172a' }}
            >
              {costCentres.length === 0 ? (
                <option value="">No Cost Centres</option>
              ) : (
                costCentres.map(cc => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Action Links */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 58 }}>
            <button
              type="button"
              onClick={() => loadBudgetData(selectedProjectId)}
              className="btn btn-outline"
              style={{ height: 38, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              title="Refresh Budget"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/budget/transactions"
              className="btn btn-outline"
              style={{ height: 38, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}
            >
              <History size={14} />
              Ledger
            </Link>
            <Link
              href="/budget/vs-actual"
              className="btn btn-outline"
              style={{ height: 38, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}
            >
              <Scale size={14} />
              Budget vs Actual
            </Link>
          </div>
        </div>
      </div>

      {/* Status / Alerts */}
      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
            ✕
          </button>
        </div>
      )}

      {/* 2. PROJECT BUDGET SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Card A: Cost Centre Meta & Budget Status */}
        <div className="card" style={{ padding: '18px 20px', background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                PROJECT & COST CENTRE
              </div>
              {(() => {
                const style = getStatusBadgeStyle(ccStatus);
                return (
                  <span
                    style={{
                      background: style.bg,
                      color: style.color,
                      border: `1px solid ${style.border}`,
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}
                  >
                    {formatStatusText(ccStatus)}
                  </span>
                );
              })()}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
              {selectedCC?.name || 'No Cost Centre Selected'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              Code: <span style={{ fontWeight: 600, color: '#1e40af' }}>{selectedCC?.code || '—'}</span> &bull; Project: <span style={{ fontWeight: 600, color: '#334155' }}>{currentProject?.name}</span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Configured Area:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: ccArea > 0 ? '#0f172a' : '#94a3b8' }}>
              {ccArea > 0 ? `${ccArea.toLocaleString('en-IN')} Sqft` : 'Area not specified'}
            </span>
          </div>
        </div>

        {/* Card B: Total & Approved Budget */}
        <div className="card" style={{ padding: '18px 20px', background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            TOTAL BUDGET ALLOCATION
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
            {formatCurrency(ccTotalBudget)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            <div>
              <span style={{ color: '#64748b' }}>Approved: </span>
              <span style={{ fontWeight: 700, color: '#047857' }}>{formatCurrency(ccApprovedBudget)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Pending: </span>
              <span style={{ fontWeight: 700, color: '#d97706' }}>{formatCurrency(ccPendingBudget)}</span>
            </div>
          </div>
        </div>

        {/* Card C: Actual & Balance */}
        <div className="card" style={{ padding: '18px 20px', background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            ACTUAL SPEND & BALANCE
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: ccActual > 0 ? '#0f172a' : '#64748b', marginBottom: 4 }}>
            {formatCurrency(ccActual)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            <div>
              <span style={{ color: '#64748b' }}>Available Balance: </span>
              <span style={{ fontWeight: 700, color: '#1e40af' }}>{formatCurrency(ccBalance)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Utilised: </span>
              <span style={{ fontWeight: 700, color: '#334155' }}>
                {ccTotalBudget > 0 ? `${((ccActual / ccTotalBudget) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* Card D: ₹ / Sqft Cost Metrics (Part C.4) */}
        <div className="card" style={{ padding: '18px 20px', background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            COST PER SQFT
          </div>
          {ccArea > 0 ? (
            <>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1e40af', marginBottom: 4 }}>
                ₹ {budgetPerSqFt?.toLocaleString('en-IN')} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/ Sqft</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Actual: </span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {actualPerSqFt !== null ? `₹ ${actualPerSqFt.toLocaleString('en-IN')}` : '₹ 0'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Balance: </span>
                  <span style={{ fontWeight: 700, color: '#047857' }}>
                    {balancePerSqFt !== null ? `₹ ${balancePerSqFt.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 13, color: '#d97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} /> Area not available
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                ₹/Sqft cannot be calculated. Cost Centre area is required for sqft metrics.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Approver / Governance Queue Banner (if pending) */}
      {pendingContributions.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '14px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={18} color="#b45309" />
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                  {pendingContributions.length} Budget Contribution{pendingContributions.length > 1 ? 's' : ''} Under Approval for {selectedCC?.name}
                </span>
                <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                  Originated from commercial BOQ allocation. Requires Project Approver review and sign-off.
                </div>
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
                        <Check size={14} /> Approve Budget (₹ {contrib.totalEstimatedValue ? contrib.totalEstimatedValue.toLocaleString('en-IN') : '0'})
                      </button>
                      <button
                        type="button"
                        disabled={approving}
                        onClick={() => handleOpenRejectModal(contrib)}
                        className="btn btn-outline btn-sm"
                        style={{ height: 32, fontSize: 12, padding: '0 10px', color: '#b91c1c' }}
                      >
                        <X size={14} /> Reject
                      </button>
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
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              CATEGORY-WISE BUDGET
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>
              Calculated from commercial BOQ allocations and verified cost transactions for {selectedCC?.code || 'this Cost Centre'}.
            </p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            {categories.length} Commercial Categories
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', height: 42 }}>
                <th style={{ padding: '0 16px', fontWeight: 700 }}>Category</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>Approved Budget</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>Pending Approval</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>₹ / Sqft</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>Actual</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'right' }}>Balance</th>
                <th style={{ padding: '0 16px', fontWeight: 700, textAlign: 'center' }}>Approval Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <RefreshCw size={16} className="animate-spin" />
                      Loading category budget metrics...
                    </div>
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                    <FileSpreadsheet size={36} color="#cbd5e1" style={{ margin: '0 auto 10px auto' }} />
                    <div style={{ fontWeight: 600, color: '#334155', fontSize: 14 }}>No Category Budget Allocated</div>
                    <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 16px 0' }}>
                      Add a completed BOQ with AI Cost to allocate commercial budget to {selectedCC?.name || 'this Cost Centre'}.
                    </p>
                    <Link
                      href={`/boq/studio?projectId=${selectedProjectId}&costCentreId=${selectedCostCentreId}`}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: 12, padding: '0 14px' }}
                    >
                      <Sparkles size={14} /> Open BOQ Studio
                    </Link>
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
                        {cat.pendingBudget > 0 ? formatCurrency(cat.pendingBudget) : '—'}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>
                        {cat.ratePerSqFt !== null ? `₹ ${cat.ratePerSqFt.toLocaleString('en-IN')}` : (ccArea > 0 ? '₹ 0' : '—')}
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
      </div>

      {/* REJECT MODAL */}
      {rejectModalOpen && selectedRejectContrib && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px 0', color: '#b91c1c' }}>
              Reject Budget Contribution
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              Mandatory Project Approver requirement: Please provide the reason for rejecting this budget contribution.
            </p>

            <form onSubmit={handleConfirmReject}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Mandatory Rejection Reason *
                </label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder="Specify reason for budget rejection..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setRejectModalOpen(false)} disabled={approving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-outline" style={{ background: '#b91c1c', color: '#ffffff', borderColor: '#b91c1c' }} disabled={approving || !rejectReason.trim()}>
                  {approving ? 'Rejecting...' : 'Confirm Rejection'}
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
            <span>Switch Cost Centre in this Project:</span>
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
                {cc.code} — {cc.name}
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
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>Loading Project Budget...</div>}>
      <ProjectBudgetContent />
    </Suspense>
  );
}
