'use client';
// src/app/(app)/budget/vs-actual/page.tsx
// Budget vs Actual Cost Analysis Engine & Line-Level Traceability

import { I18N_CONFIG } from '@/lib/i18n.constants';
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
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


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
    return `₹ ${Math.round(val || 0).toLocaleString(I18N_CONFIG.defaultLocale)}`;
  };

  return (
    <div className="space-y-6" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader
        title={UI_STRINGS.appAppBudgetVsActualPage.bUDGETVSACTUAL}
        subtitle={UI_STRINGS.appAppBudgetVsActualPage.enterpriseCapexControlFromBaselineBOQBudgetToDownstreamCommitmentsAndActualSpend}
        breadcrumbs={[
          { label: UI_STRINGS.common.budget, href: '/budget' },
          { label: UI_STRINGS.common.budgetVsActual },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/budget"
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Landmark size={14} />{UI_STRINGS.common.projectBudget}</Link>
            <Link
              href="/budget/transactions"
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
            >
              <History size={14} />{UI_STRINGS.common.ledger}</Link>
            <button
              onClick={fetchReport}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{UI_STRINGS.common.refresh2}</button>
          </div>
        }
      />

      {/* Filter Bar (Part F.1) */}
      <div className="card p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">{UI_STRINGS.common.project2}</span>
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
                  {p.projectCode}{UI_STRINGS.common.copy13emybb}{p.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 ml-2">
              <Layers size={16} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">{UI_STRINGS.common.costCentre3}</span>
            </div>
            <select
              value={selectedCostCentre}
              onChange={(e) => setSelectedCostCentre(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[180px]"
            >
              <option value="">{UI_STRINGS.common.allCostCentres}</option>
              {costCentresList.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code}{UI_STRINGS.common.copy13emybb}{cc.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs font-semibold text-slate-700">{UI_STRINGS.common.category3}</span>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[160px]"
            >
              <option value="">{UI_STRINGS.common.allCategories}</option>
              {categoriesSummary.map((cat) => (
                <option key={cat.category} value={cat.category}>
                  {cat.category}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-500 font-medium">{UI_STRINGS.appAppBudgetVsActualPage.activeArea}<strong className="text-slate-800">{activeArea > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleStringSqft, { "toLocaleString": activeArea.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.notSpecified}</strong>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS (Part F.3 - Exactly 6 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* 1. TOTAL BUDGET */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppBudgetVsActualPage.tOTALBUDGET}</div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {formatCurrency(kpis.totalBudget)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">{UI_STRINGS.appAppBudgetVsActualPage.sanctionedAllocation}</div>
        </Card>

        {/* 2. TOTAL ACTUAL */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppBudgetVsActualPage.tOTALACTUAL}</div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {formatCurrency(kpis.totalActual)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">{UI_STRINGS.appAppBudgetVsActualPage.downstreamInvoicedSpend}</div>
        </Card>

        {/* 3. BALANCE */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppBudgetVsActualPage.bALANCE}</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700">
            {formatCurrency(kpis.totalRemaining)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">{UI_STRINGS.appAppBudgetVsActualPage.budgetActual}</div>
        </Card>

        {/* 4. BUDGET UTILISATION */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppBudgetVsActualPage.bUDGETUTILISATION}</div>
          <div className="mt-2 text-2xl font-extrabold text-blue-700">
            {budgetUtilisation}{UI_STRINGS.common.copy8w4luo}</div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">{UI_STRINGS.appAppBudgetVsActualPage.actualBudget}</div>
        </Card>

        {/* 5. BUDGET / SQFT */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppBudgetVsActualPage.bUDGETSQFT}</div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {budgetPerSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": budgetPerSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            {activeArea > 0 ? interpolateUiString(UI_STRINGS.appAppBudgetVsActualPage.perToLocaleStringSqft, { "toLocaleString": activeArea.toLocaleString() }) : UI_STRINGS.appAppBudgetVsActualPage.areaMissing}
          </div>
        </Card>

        {/* 6. ACTUAL / SQFT */}
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{UI_STRINGS.appAppBudgetVsActualPage.aCTUALSQFT}</div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            {actualPerSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": actualPerSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            {activeArea > 0 ? UI_STRINGS.appAppBudgetVsActualPage.actualSpendSqft : UI_STRINGS.appAppBudgetVsActualPage.areaMissing}
          </div>
        </Card>
      </div>

      {/* BUDGET VS ACTUAL TABLE (Part F.2) */}
      <Card className="border border-slate-200 shadow-sm bg-white rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Scale size={15} className="text-blue-600" />{UI_STRINGS.appAppBudgetVsActualPage.bUDGETVSACTUALANALYSIS}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{UI_STRINGS.appAppBudgetVsActualPage.comparisonOfApprovedCommercialBudgetAndVerifiedDownstreamProcurementActuals}</p>
          </div>
          <span className="text-xs text-slate-600 font-semibold">
            {categoriesSummary.length}{UI_STRINGS.appAppBudgetVsActualPage.categories}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">{UI_STRINGS.common.category2}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.common.budget}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.common.actual}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.common.variance}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.appAppBudgetVsActualPage.variance}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.appAppBudgetVsActualPage.sqftBudget}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.appAppBudgetVsActualPage.sqftActual}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categoriesSummary.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Scale size={32} className="mx-auto text-slate-300 mb-2" />{UI_STRINGS.appAppBudgetVsActualPage.noBudgetOrActualSpendRecordsFoundForSelectedFilter}</td>
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
                        {a > 0 ? formatCurrency(a) : UI_STRINGS.common.copyi1bvs4}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          variance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {variance >= 0 ? UI_STRINGS.common.copycrz1ka : ''}{formatCurrency(variance)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          variancePct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {variancePct.toFixed(1)}{UI_STRINGS.common.copy8w4luo}</td>
                      <td className="py-3 px-4 text-right font-mono text-blue-700 font-semibold">
                        {catBudgetSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": catBudgetSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : (activeArea > 0 ? UI_STRINGS.common.copyi1bvs4 : UI_STRINGS.common.copy4s9bsz)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 font-semibold">
                        {catActualSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": catActualSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : (activeArea > 0 ? UI_STRINGS.common.copyi1bvs4 : UI_STRINGS.common.copy4s9bsz)}
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
              <ListOrdered size={15} className="text-slate-600" />{UI_STRINGS.appAppBudgetVsActualPage.iTEMLEVELTRACEABILITYDOWNSTREAMACTUALS}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{UI_STRINGS.appAppBudgetVsActualPage.traceableLinkageBOQLineRarrBudgetRarrPRRarrRFQRarrPPORarrActualSpend}</p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder={UI_STRINGS.appAppBudgetVsActualPage.searchDescriptionItemCode}
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
                <th className="py-3 px-4">{UI_STRINGS.appAppBudgetVsActualPage.itemDescription}</th>
                <th className="py-3 px-4">{UI_STRINGS.appAppBudgetVsActualPage.costCentreCategory}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.appAppBudgetVsActualPage.budgetQtyTimesRate}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.appAppBudgetVsActualPage.committedPO}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.appAppBudgetVsActualPage.actualCost}</th>
                <th className="py-3 px-4 text-right">{UI_STRINGS.common.variance}</th>
                <th className="py-3 px-4 text-center">{UI_STRINGS.common.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">{UI_STRINGS.appAppBudgetVsActualPage.noTraceableItemsFoundForThisSelection}</td>
                </tr>
              ) : (
                lineReports.map((line: any) => (
                  <tr key={line.boqLineId} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{line.description}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {line.boqCode} {line.revisionCode}{UI_STRINGS.common.bull}{line.itemCode || line.lineNumber}
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
                        {line.budgetQuantity} {line.uom}{UI_STRINGS.appAppBudgetVsActualPage.copycus6yy}{line.budgetRate?.toFixed(0)}
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
                        {line.budgetVariance >= 0 ? UI_STRINGS.common.copycrz1ka : ''}{formatCurrency(line.budgetVariance)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {line.budgetVariancePercent?.toFixed(1)}{UI_STRINGS.common.copy8w4luo}</div>
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
    <Suspense fallback={<div style={{ padding: '48px 32px', textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppBudgetVsActualPage.loadingBudgetVsActual}</div>}>
      <BudgetVsActualContent />
    </Suspense>
  );
}
