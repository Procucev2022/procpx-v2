'use client';
// src/app/(app)/budget/transactions/page.tsx - Budget Transactions Audit Ledger & BOQ Traceability
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  History,
  Building2,
  RefreshCw,
  Search,
  RotateCcw,
  CheckCircle2,
  Clock,
  Landmark,
  Scale,
  X,
  AlertCircle,
  FileSpreadsheet,
  Filter,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';

function BudgetTransactionsContent() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [costCentres, setCostCentres] = useState<any[]>([]);

  // Filter States
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedCostCentreId, setSelectedCostCentreId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Reversal Modal
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [targetTx, setTargetTx] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const pData = await res.json();
        const list = pData.data || pData || [];
        setProjects(list);

        const paramProj = searchParams?.get('projectId');
        if (paramProj && list.some((p: any) => p.id === paramProj)) {
          setSelectedProjectId(paramProj);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const url = selectedProjectId ? `/api/budgets?projectId=${selectedProjectId}` : '/api/budgets';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setTransactions(json.transactions || []);
        setCostCentres(json.costCentres || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTx || !reversalReason.trim()) return;
    setReversing(true);
    setReversalError('');
    try {
      const res = await fetch('/api/budgets/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: targetTx.id,
          reversalReason: reversalReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Reversal failed');
      }
      setReverseModalOpen(false);
      setReversalReason('');
      setTargetTx(null);
      setStatusMessage(`Transaction ${targetTx.transactionCode} reversed successfully!`);
      loadTransactions();
    } catch (err: any) {
      setReversalError(err.message);
    } finally {
      setReversing(false);
    }
  };

  // Available categories in data
  const availableCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean)));

  // Filter transactions
  const filtered = transactions.filter(tx => {
    // Cost Centre filter
    if (selectedCostCentreId && tx.costCentreId !== selectedCostCentreId) {
      return false;
    }
    // Category filter
    if (selectedCategory && tx.category !== selectedCategory) {
      return false;
    }
    // Transaction type filter
    if (selectedType) {
      const isRev = tx.isReversal;
      if (selectedType === 'REVERSAL' && !isRev) return false;
      if (selectedType === 'ALLOCATION' && isRev) return false;
    }
    // Status filter
    if (selectedStatus) {
      if (selectedStatus === 'UNDER_APPROVAL') {
        if (tx.status !== 'UNDER_APPROVAL' && tx.status !== 'PENDING_PROJECT_APPROVAL') return false;
      } else if (selectedStatus === 'PENDING_FINANCE_APPROVAL') {
        if (tx.status !== 'PENDING_FINANCE_APPROVAL' && tx.status !== 'PROJECT_APPROVED') return false;
      } else if (tx.status !== selectedStatus) {
        return false;
      }
    }
    // Search
    if (search.trim()) {
      const term = search.toLowerCase();
      const codeMatch = (tx.transactionCode || '').toLowerCase().includes(term);
      const boqMatch = (tx.boqNumber || '').toLowerCase().includes(term);
      const descMatch = (tx.description || '').toLowerCase().includes(term);
      const refMatch = (tx.reference || '').toLowerCase().includes(term);
      const catMatch = (tx.category || '').toLowerCase().includes(term);
      const ccMatch = (tx.costCentreName || '').toLowerCase().includes(term);
      if (!codeMatch && !boqMatch && !descMatch && !refMatch && !catMatch && !ccMatch) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <PageHeader
        title="Budget Transaction Ledger"
        subtitle="Comprehensive immutable audit trail of commercial BOQ allocations, category contributions, and financial reversals"
        breadcrumbs={[
          { label: 'Budget', href: '/budget' },
          { label: 'Ledger' },
        ]}
        actions={
          <div className="flex gap-2 items-center">
            <Link href="/budget" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Landmark size={14} />
              Project Budget
            </Link>
            <Link href="/budget/vs-actual" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Scale size={14} />
              Budget vs Actual
            </Link>
          </div>
        }
      />

      {statusMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar (Part E.1) */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', flex: 1 }}>
            {/* Project Filter */}
            <select
              className="select-field"
              value={selectedProjectId}
              onChange={e => {
                setSelectedProjectId(e.target.value);
                setSelectedCostCentreId('');
              }}
              style={{ minWidth: 200, height: 36, fontSize: 13 }}
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.projectCode} — {p.name}
                </option>
              ))}
            </select>

            {/* Cost Centre Filter */}
            <select
              className="select-field"
              value={selectedCostCentreId}
              onChange={e => setSelectedCostCentreId(e.target.value)}
              style={{ minWidth: 180, height: 36, fontSize: 13 }}
            >
              <option value="">All Cost Centres</option>
              {costCentres.map(cc => (
                <option key={cc.id} value={cc.id}>
                  {cc.code} — {cc.name}
                </option>
              ))}
            </select>

            {/* Category Filter */}
            <select
              className="select-field"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ minWidth: 160, height: 36, fontSize: 13 }}
            >
              <option value="">All Categories</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Transaction Type Filter */}
            <select
              className="select-field"
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              style={{ minWidth: 140, height: 36, fontSize: 13 }}
            >
              <option value="">All Types</option>
              <option value="ALLOCATION">Allocation</option>
              <option value="REVERSAL">Reversal</option>
            </select>

            {/* Status Filter */}
            <select
              className="select-field"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              style={{ minWidth: 160, height: 36, fontSize: 13 }}
            >
              <option value="">All Statuses</option>
              <option value="UNDER_APPROVAL">Under Project Approval</option>
              <option value="PENDING_FINANCE_APPROVAL">Under Finance Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="REVERSED">Reversed</option>
            </select>

            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 240, flex: 1 }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
              <input
                type="text"
                placeholder="Search Tx ID, BOQ Number, description..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field"
                style={{ paddingLeft: 30, height: 36, width: '100%', fontSize: 12 }}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={loadTransactions}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: 12 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Transactions Table (Part E - Columns Preserved) */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Audit Ledger ({filtered.length} Records)
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <RefreshCw size={16} className="animate-spin" /> Loading ledger transactions...
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <History size={36} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
            <div style={{ fontWeight: 600, color: '#334155', fontSize: 14 }}>No Transactions Found</div>
            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
              Add a BOQ to budget to create transaction lineage entries.
            </p>
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table enterprise-table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', height: 42, borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>Transaction ID</th>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>Project</th>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>Cost Centre</th>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>BOQ / Source Ref</th>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>Description</th>
                  <th style={{ padding: '0 10px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '0 10px', fontWeight: 600, textAlign: 'center' }}>Type</th>
                  <th style={{ padding: '0 10px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0 10px', fontWeight: 600 }}>Created By</th>
                  <th style={{ padding: '0 10px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9', height: 46, background: tx.isReversal ? '#fef2f2' : 'transparent' }}>
                    <td style={{ padding: '0 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {tx.budgetDate ? new Date(tx.budgetDate).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '0 10px', fontWeight: 700, color: tx.isReversal ? '#dc2626' : '#1e40af', whiteSpace: 'nowrap' }}>
                      {tx.transactionCode}
                    </td>
                    <td style={{ padding: '0 10px', color: '#0f172a', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {tx.projectName || '—'}
                    </td>
                    <td style={{ padding: '0 10px', color: '#334155', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: '#1e40af' }}>{tx.costCentreCode}</span> &bull; {tx.costCentreName}
                    </td>
                    <td style={{ padding: '0 10px', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {tx.category}
                    </td>
                    {/* BOQ Traceability (Part E.2) */}
                    <td style={{ padding: '0 10px', whiteSpace: 'nowrap' }}>
                      {tx.boqNumber && tx.boqNumber !== '—' ? (
                        <div style={{ fontSize: 11 }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{tx.boqNumber}</span>
                          <span style={{ color: '#64748b', marginLeft: 4 }}>({tx.boqRevision || 'R0'})</span>
                          {tx.boqLineReference && tx.boqLineReference !== '—' && (
                            <div style={{ color: '#64748b', fontSize: 10 }}>{tx.boqLineReference}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0 10px', color: '#475569', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.description}>
                      {tx.description || tx.reference || '—'}
                    </td>
                    <td style={{ padding: '0 10px', textAlign: 'right', fontWeight: 700, color: tx.amount < 0 ? '#dc2626' : '#047857', whiteSpace: 'nowrap' }}>
                      {tx.amount < 0 ? `- ₹ ${Math.abs(tx.amount).toLocaleString('en-IN')}` : `₹ ${tx.amount.toLocaleString('en-IN')}`}
                    </td>
                    <td style={{ padding: '0 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: tx.isReversal ? '#fee2e2' : '#f0fdf4',
                          color: tx.isReversal ? '#dc2626' : '#166534',
                        }}
                      >
                        {tx.isReversal ? 'REVERSAL' : 'ALLOCATION'}
                      </span>
                    </td>
                    <td style={{ padding: '0 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                                               background: tx.isReversal
                            ? '#fef2f2'
                            : tx.status === 'APPROVED'
                            ? '#ecfdf5'
                            : tx.status === 'PENDING_FINANCE_APPROVAL' || tx.status === 'UNDER_FINANCE_APPROVAL'
                            ? '#eff6ff'
                            : tx.status === 'REJECTED'
                            ? '#fef2f2'
                            : '#fffbeb',
                          color: tx.isReversal
                            ? '#dc2626'
                            : tx.status === 'APPROVED'
                            ? '#047857'
                            : tx.status === 'PENDING_FINANCE_APPROVAL' || tx.status === 'UNDER_FINANCE_APPROVAL'
                            ? '#1d4ed8'
                            : tx.status === 'REJECTED'
                            ? '#b91c1c'
                            : '#b45309',
                          border: `1px solid ${
                            tx.isReversal
                              ? '#fecaca'
                              : tx.status === 'APPROVED'
                              ? '#a7f3d0'
                              : tx.status === 'PENDING_FINANCE_APPROVAL' || tx.status === 'UNDER_FINANCE_APPROVAL'
                              ? '#bfdbfe'
                              : tx.status === 'REJECTED'
                              ? '#fecaca'
                              : '#fde68a'
                          }`,
                        }}
                      >
                        {tx.isReversal
                          ? 'REVERSED'
                          : tx.status === 'UNDER_APPROVAL' || tx.status === 'PENDING_PROJECT_APPROVAL'
                          ? 'Under Project Approval'
                          : tx.status === 'PENDING_FINANCE_APPROVAL' || tx.status === 'UNDER_FINANCE_APPROVAL'
                          ? 'Under Finance Approval'
                          : tx.status === 'APPROVED'
                          ? 'Approved'
                          : tx.status === 'REJECTED'
                          ? 'Rejected'
                          : tx.status}
                      </span>
                    </td>
                    <td style={{ padding: '0 10px', color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        {tx.submitterName || tx.createdByName || (tx.createdBy ? tx.createdBy.slice(0, 10) : 'System')}
                      </div>
                      {tx.status === 'APPROVED' && tx.approverName && (
                        <div style={{ fontSize: 10, color: '#047857' }}>
                          ✓ Approver: {tx.approverName} {tx.approvedAt ? `(${new Date(tx.approvedAt).toLocaleDateString()})` : ''}
                        </div>
                      )}
                      {tx.status === 'REJECTED' && (
                        <div style={{ fontSize: 10, color: '#b91c1c' }} title={tx.rejectionReason || ''}>
                          ✕ Rejected {tx.rejectionReason ? `: ${tx.rejectionReason.slice(0, 20)}...` : ''}
                        </div>
                      )}
                      {(tx.status === 'UNDER_APPROVAL' || tx.status === 'PENDING_PROJECT_APPROVAL') && (
                        <div style={{ fontSize: 10, color: '#b45309' }}>
                          ⏳ Awaiting Project Approver
                        </div>
                      )}
                      {(tx.status === 'PENDING_FINANCE_APPROVAL' || tx.status === 'UNDER_FINANCE_APPROVAL') && (
                        <div style={{ fontSize: 10, color: '#1d4ed8' }}>
                          ⏳ Awaiting Finance Approver
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!tx.isReversal && tx.status === 'APPROVED' && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ height: 26, padding: '0 8px', fontSize: 11, color: '#b91c1c' }}
                          onClick={() => {
                            setTargetTx(tx);
                            setReverseModalOpen(true);
                          }}
                        >
                          <RotateCcw size={11} /> Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* REVERSAL MODAL */}
      {reverseModalOpen && targetTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 480, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <RotateCcw size={18} color="#dc2626" />
                Reverse Budget Transaction
              </h3>
              <button
                type="button"
                onClick={() => setReverseModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {reversalError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
                {reversalError}
              </div>
            )}

            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
              <div><strong>Code:</strong> {targetTx.transactionCode}</div>
              <div><strong>Cost Centre:</strong> {targetTx.costCentreCode} — {targetTx.costCentreName}</div>
              <div><strong>Category:</strong> {targetTx.category}</div>
              <div><strong>Amount:</strong> ₹ {targetTx.amount?.toLocaleString('en-IN')}</div>
            </div>

            <form onSubmit={handleReverse}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Reversal Reason (Mandatory for audit trail)
                </label>
                <textarea
                  required
                  value={reversalReason}
                  onChange={e => setReversalReason(e.target.value)}
                  placeholder="e.g., BOQ revision scope correction, de-scoped item..."
                  className="input-field"
                  style={{ width: '100%', height: 80, fontSize: 13, padding: 8 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReverseModalOpen(false)}
                  disabled={reversing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#dc2626', borderColor: '#dc2626' }}
                  disabled={reversing || !reversalReason.trim()}
                >
                  {reversing ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BudgetTransactionsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>Loading Ledger...</div>}>
      <BudgetTransactionsContent />
    </Suspense>
  );
}
