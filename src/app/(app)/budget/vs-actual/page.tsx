'use client';
// src/app/(app)/budget/vs-actual/page.tsx
// Budget vs Actual Cost Analysis Engine & Line-Level Traceability

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Building2,
  Calendar,
  IndianRupee,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  GitCommit,
  ShoppingCart,
  FileCheck,
  Receipt,
  Scale,
  ListOrdered,
  Landmark,
  History,
} from 'lucide-react';

function BudgetVsActualContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCostCentre, setSelectedCostCentre] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Drilldown Modal
  const [selectedLine, setSelectedLine] = useState<any | null>(null);
  const [drilldownOpen, setDrilldownOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchReport();
    }
  }, [selectedProjectId, selectedCostCentre, selectedCategory]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      const list = data.data || data || [];
      setProjects(list);

      const paramProj = searchParams?.get('projectId');
      const paramCc = searchParams?.get('costCentreId');

      if (paramProj && list.some((p: any) => p.id === paramProj)) {
        setSelectedProjectId(paramProj);
      } else if (list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }

      if (paramCc) {
        setSelectedCostCentre(paramCc);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = `/api/financial/budget-vs-actual?projectId=${selectedProjectId}`;
      if (selectedCostCentre) url += `&costCentreId=${selectedCostCentre}`;
      if (selectedCategory) url += `&category=${encodeURIComponent(selectedCategory)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.data) {
        setReportData(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const kpis = reportData?.kpis || {
    totalBudget: 0,
    totalCommitted: 0,
    totalActual: 0,
    totalRemaining: 0,
    totalBudgetVariance: 0,
    totalVariancePercent: 0,
  };

  // Determine active area for sqft metrics (Part F.3)
  const costCentresList: any[] = reportData?.costCentresSummary || [];
  const activeCostCentre = costCentresList.find(c => c.id === selectedCostCentre);
  const activeArea = activeCostCentre
    ? (activeCostCentre.areaSqFt || 0)
    : costCentresList.reduce((sum, c) => sum + (c.areaSqFt || 0), 0);

  const budgetPerSqFt = activeArea > 0 ? Math.round(kpis.totalBudget / activeArea) : null;
  const actualPerSqFt = activeArea > 0 ? Math.round(kpis.totalActual / activeArea) : null;
  const budgetUtilisation = kpis.totalBudget > 0 ? Math.round(((kpis.totalActual / kpis.totalBudget) * 100) * 10) / 10 : 0;

  const categoriesSummary: any[] = reportData?.categoriesSummary || [];

  const lineReports = (reportData?.lineReports || []).filter((l: any) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (l.description || '').toLowerCase().includes(term) ||
      (l.lineNumber || '').toLowerCase().includes(term) ||
      (l.category || '').toLowerCase().includes(term) ||
      (l.itemCode || '').toLowerCase().includes(term)
    );
  });

  const formatCurrency = (val: number) => {
    return `₹ ${Math.round(val || 0).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader
        title="BUDGET VS ACTUAL"
        subtitle="Enterprise Capex control from baseline BOQ budget to downstream commitments and actual spend"
        breadcrumbs={[
          { label: 'Budget', href: '/budget' },
          { label: 'Budget vs Actual' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/budget"
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Landmark size={14} />
              Project Budget
            </Link>
            <Link
              href="/budget/transactions"
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
            >
              <History size={14} />
              Ledger
            </Link>
            <button
              onClick={fetchReport}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Filter Bar (Part F.1) */}
      <div className="card p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Project:</span>
            </div>
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSelectedCostCentre('');
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[200px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectCode}: {p.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 ml-2">
              <Layers size={16} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Cost Centre:</span>
            </div>
            <select
              value={selectedCostCentre}
              onChange={(e) => setSelectedCostCentre(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[180px]"
            >
              <option value="">All Cost Centres</option>
              {costCentresList.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code}: {cc.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs font-semibold text-slate-700">Category:</span>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[160px]"
            >
              <option value="">All Categories</option>
              {categoriesSummary.map((cat) => (
                <option key={cat.category} value={cat.category}>
                  {cat.category}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Active Area: <strong className="text-slate-800">{activeArea > 0 ? `${activeArea.toLocaleString('en-IN')} Sqft` : 'Not specified'}</strong>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS (Part F.3 - Exactly 6 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* 1. TOTAL BUDGET */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            TOTAL BUDGET
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {formatCurrency(kpis.totalBudget)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">Sanctioned allocation</div>
        </Card>

        {/* 2. TOTAL ACTUAL */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            TOTAL ACTUAL
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {formatCurrency(kpis.totalActual)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">Downstream invoiced spend</div>
        </Card>

        {/* 3. BALANCE */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            BALANCE
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700">
            {formatCurrency(kpis.totalRemaining)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">Budget - Actual</div>
        </Card>

        {/* 4. BUDGET UTILISATION */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            BUDGET UTILISATION
          </div>
          <div className="mt-2 text-2xl font-extrabold text-blue-700">
            {budgetUtilisation}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">Actual ÷ Budget</div>
        </Card>

        {/* 5. BUDGET / SQFT */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            BUDGET / SQFT
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {budgetPerSqFt !== null ? `₹ ${budgetPerSqFt.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            {activeArea > 0 ? `Per ${activeArea.toLocaleString()} sqft` : 'Area missing'}
          </div>
        </Card>

        {/* 6. ACTUAL / SQFT */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            ACTUAL / SQFT
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {actualPerSqFt !== null ? `₹ ${actualPerSqFt.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            {activeArea > 0 ? `Actual spend / sqft` : 'Area missing'}
          </div>
        </Card>
      </div>

      {/* BUDGET VS ACTUAL TABLE (Part F.2) */}
      <Card className="border border-slate-200 shadow-sm bg-white rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Scale size={15} className="text-blue-600" />
              BUDGET VS ACTUAL ANALYSIS
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Comparison of approved commercial budget and verified downstream procurement actuals.
            </p>
          </div>
          <span className="text-xs text-slate-600 font-semibold">
            {categoriesSummary.length} Categories
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Budget</th>
                <th className="py-3 px-4 text-right">Actual</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-4 text-right">Variance %</th>
                <th className="py-3 px-4 text-right">₹/Sqft Budget</th>
                <th className="py-3 px-4 text-right">₹/Sqft Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categoriesSummary.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Scale size={32} className="mx-auto text-slate-300 mb-2" />
                    No budget or actual spend records found for selected filter.
                  </td>
                </tr>
              ) : (
                categoriesSummary.map((cat: any) => {
                  const b = cat.budgetAmount || 0;
                  const a = cat.actualAmount || 0;
                  const variance = b - a;
                  const variancePct = b > 0 ? ((b - a) / b) * 100 : 0;
                  const catBudgetSqFt = activeArea > 0 ? Math.round(b / activeArea) : null;
                  const catActualSqFt = activeArea > 0 ? Math.round(a / activeArea) : null;

                  return (
                    <tr key={cat.category} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {cat.category}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(b)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                        {a > 0 ? formatCurrency(a) : '₹ 0'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          variance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          variancePct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {variancePct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-blue-700 font-semibold">
                        {catBudgetSqFt !== null ? `₹ ${catBudgetSqFt.toLocaleString('en-IN')}` : (activeArea > 0 ? '₹ 0' : '—')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 font-semibold">
                        {catActualSqFt !== null ? `₹ ${catActualSqFt.toLocaleString('en-IN')}` : (activeArea > 0 ? '₹ 0' : '—')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* LINE-LEVEL AUDIT TRACEABILITY MATRIX (Part L) */}
      <Card className="border border-slate-200 shadow-sm bg-white rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <ListOrdered size={15} className="text-slate-600" />
              ITEM-LEVEL TRACEABILITY & DOWNSTREAM ACTUALS
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Traceable linkage: BOQ Line &rarr; Budget &rarr; PR &rarr; RFQ &rarr; PPO &rarr; Actual spend
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search description, item code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white shadow-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Item / Description</th>
                <th className="py-3 px-4">Cost Centre & Category</th>
                <th className="py-3 px-4 text-right">Budget (Qty &times; Rate)</th>
                <th className="py-3 px-4 text-right">Committed (PO)</th>
                <th className="py-3 px-4 text-right">Actual Cost</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No traceable items found for this selection.
                  </td>
                </tr>
              ) : (
                lineReports.map((line: any) => (
                  <tr key={line.boqLineId} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{line.description}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {line.boqCode} {line.revisionCode} &bull; {line.itemCode || line.lineNumber}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 font-medium text-slate-700">
                        {line.category}
                      </span>
                      {line.costCentre && (
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          {line.costCentre.code}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <div className="font-bold text-slate-900">
                        {formatCurrency(line.budgetAmount)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {line.budgetQuantity} {line.uom} @ ₹{line.budgetRate?.toFixed(0)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <div className="font-bold text-indigo-700">
                        {formatCurrency(line.committedAmount)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {line.committedQuantity || 0} {line.uom}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <div className="font-bold text-slate-900">
                        {formatCurrency(line.actualAmount)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {line.actualQuantity || 0} {line.uom}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <div
                        className={`font-bold ${
                          line.budgetVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {line.budgetVariance >= 0 ? '+' : ''}{formatCurrency(line.budgetVariance)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {line.budgetVariancePercent?.toFixed(1)}%
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <StatusBadge status={line.status || 'DRAFT'} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function BudgetVsActualPage() {
  return (
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>Loading Budget vs Actual...</div>}>
      <BudgetVsActualContent />
    </Suspense>
  );
}
