'use client';
// src/app/(app)/budget/vs-actual/page.tsx
// Budget vs Actual Cost Analysis Engine & Line-Level Traceability

import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard } from '@/components/ui/SummaryCard';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  Layers,
  Building2,
  Search,
  RefreshCw,
  Scale,
  ListOrdered,
  Landmark,
  History,
} from 'lucide-react';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/api-utils.constants';


function BudgetVsActualContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCostCentre, setSelectedCostCentre] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMoreLines, setLoadingMoreLines] = useState(false);
  const [search, setSearch] = useState('');
  const reportRequestId = useRef(0);

  // Drilldown Modal

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

  const fetchReport = async (page = 1, append = false) => {
    const requestId = ++reportRequestId.current;
    if (append) setLoadingMoreLines(true);
    else {
      setLoading(true);
      setLoadingMoreLines(false);
    }
    try {
      let url = `/api/financial/budget-vs-actual?projectId=${selectedProjectId}`;
      if (selectedCostCentre) url += `&costCentreId=${selectedCostCentre}`;
      if (selectedCategory) url += `&category=${encodeURIComponent(selectedCategory)}`;
      if (page > 1) url += `&page=${page}&pageSize=${DEFAULT_LIST_PAGE_SIZE}`;
      const res = await fetch(url);
      const json = await res.json();
      const payload = json.data || json;
      if (payload && requestId === reportRequestId.current) {
        setReportData((prev: Record<string, unknown> | null) => (append
          ? { ...payload, lineReports: [...((Array.isArray(prev?.lineReports) ? prev.lineReports : [])), ...(payload.lineReports || [])] }
          : payload));
      }
    } catch (e) {
      if (requestId === reportRequestId.current) console.error(e);
    } finally {
      if (requestId === reportRequestId.current) {
        if (append) setLoadingMoreLines(false);
        else setLoading(false);
      }
    }
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (
      scrollHeight - scrollTop - clientHeight < 150 &&
      reportData?.lineReportsPagination?.hasMore &&
      !loadingMoreLines &&
      !loading
    ) {
      const nextPage = (reportData.lineReportsPagination.page || 1) + 1;
      fetchReport(nextPage, true);
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
          <div className="flex items-center gap-2">
            <Link
              href="/budget"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Landmark size={14} />{UI_STRINGS.common.projectBudget}
            </Link>
            <Link
              href="/budget/transactions"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <History size={14} />{UI_STRINGS.common.ledger}
            </Link>
            <button
              onClick={() => fetchReport()}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{UI_STRINGS.common.refresh2}
            </button>
          </div>
        }
      />

      {/* Filter Bar (Part F.1) */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 24, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', flex: 1 }}>
            {/* Project Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={16} className="text-slate-400" />
              <select
                className="select-field"
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setSelectedCostCentre('');
                }}
                style={{ minWidth: 260, height: 36, fontSize: 13 }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode}{UI_STRINGS.common.copy13emybb}{p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Cost Centre Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} className="text-slate-400" />
              <select
                className="select-field"
                value={selectedCostCentre}
                onChange={(e) => setSelectedCostCentre(e.target.value)}
                style={{ minWidth: 200, height: 36, fontSize: 13 }}
              >
                <option value="">{UI_STRINGS.common.allCostCentres}</option>
                {costCentresList.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code}{UI_STRINGS.common.copy13emybb}{cc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <select
              className="select-field"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ minWidth: 180, height: 36, fontSize: 13 }}
            >
              <option value="">{UI_STRINGS.common.allCategories}</option>
              {categoriesSummary.map((cat) => (
                <option key={cat.category} value={cat.category}>
                  {cat.category}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
              {UI_STRINGS.appAppBudgetVsActualPage.activeArea}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', background: '#f1f5f9', padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              {activeArea > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleStringSqft, { "toLocaleString": activeArea.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.notSpecified}
            </span>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS (Part F.3 - Exactly 6 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* 1. TOTAL BUDGET */}
        <SummaryCard
          label={UI_STRINGS.appAppBudgetVsActualPage.tOTALBUDGET}
          value={formatCurrency(kpis.totalBudget)}
          description={UI_STRINGS.appAppBudgetVsActualPage.sanctionedAllocation}
          accent="blue"
        />

        {/* 2. TOTAL ACTUAL */}
        <SummaryCard
          label={UI_STRINGS.appAppBudgetVsActualPage.tOTALACTUAL}
          value={formatCurrency(kpis.totalActual)}
          description={UI_STRINGS.appAppBudgetVsActualPage.downstreamInvoicedSpend}
          accent="amber"
        />

        {/* 3. BALANCE */}
        <SummaryCard
          label={UI_STRINGS.appAppBudgetVsActualPage.bALANCE}
          value={formatCurrency(kpis.totalRemaining)}
          description={UI_STRINGS.appAppBudgetVsActualPage.budgetActual}
          accent="emerald"
        />

        {/* 4. BUDGET UTILISATION */}
        <SummaryCard
          label={UI_STRINGS.appAppBudgetVsActualPage.bUDGETUTILISATION}
          value={`${budgetUtilisation}${UI_STRINGS.common.copy8w4luo}`}
          description={UI_STRINGS.appAppBudgetVsActualPage.actualBudget}
          accent="purple"
        />

        {/* 5. BUDGET / SQFT */}
        <SummaryCard
          label={UI_STRINGS.appAppBudgetVsActualPage.bUDGETSQFT}
          value={budgetPerSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": budgetPerSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
          description={activeArea > 0 ? interpolateUiString(UI_STRINGS.appAppBudgetVsActualPage.perToLocaleStringSqft, { "toLocaleString": activeArea.toLocaleString() }) : UI_STRINGS.appAppBudgetVsActualPage.areaMissing}
          accent="indigo"
        />

        {/* 6. ACTUAL / SQFT */}
        <SummaryCard
          label={UI_STRINGS.appAppBudgetVsActualPage.aCTUALSQFT}
          value={actualPerSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": actualPerSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
          description={activeArea > 0 ? UI_STRINGS.appAppBudgetVsActualPage.actualSpendSqft : UI_STRINGS.appAppBudgetVsActualPage.areaMissing}
          accent="slate"
        />
      </div>

      {/* BUDGET VS ACTUAL TABLE (Part F.2) */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Scale size={16} className="text-blue-600" />{UI_STRINGS.appAppBudgetVsActualPage.bUDGETVSACTUALANALYSIS}</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>{UI_STRINGS.appAppBudgetVsActualPage.comparisonOfApprovedCommercialBudgetAndVerifiedDownstreamProcurementActuals}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a8a', background: '#e0e7ff', padding: '4px 10px', borderRadius: 20 }}>
            {categoriesSummary.length} {UI_STRINGS.appAppBudgetVsActualPage.categories}</span>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'auto' }}>
          <table className="w-full text-left text-xs border-collapse">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', borderBottom: '2px solid #cbd5e1', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <tr>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{UI_STRINGS.common.category2}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.common.budget}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.common.actual}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.common.variance}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.appAppBudgetVsActualPage.variance}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.appAppBudgetVsActualPage.sqftBudget}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.appAppBudgetVsActualPage.sqftActual}</th>
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
                  const catBudgetSqFt = activeArea > 0 && b > 0 ? Math.round(b / activeArea) : null;
                  const catActualSqFt = activeArea > 0 && a > 0 ? Math.round(a / activeArea) : null;

                  return (
                    <tr key={cat.category} className="hover:bg-slate-50/75 transition-colors">
                      <td style={{ padding: '16px 20px', fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                        {cat.category}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                        {formatCurrency(b)}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b', fontSize: 13 }}>
                        {a > 0 ? formatCurrency(a) : UI_STRINGS.common.copyi1bvs4}
                      </td>
                      <td
                        style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}
                        className={variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                      >
                        {variance >= 0 ? UI_STRINGS.common.copycrz1ka : ''}{formatCurrency(variance)}
                      </td>
                      <td
                        style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}
                        className={variancePct >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                      >
                        {variancePct.toFixed(1)}{UI_STRINGS.common.copy8w4luo}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1d4ed8', fontSize: 13 }}>
                        {catBudgetSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": catBudgetSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : (activeArea > 0 ? UI_STRINGS.common.copyi1bvs4 : UI_STRINGS.common.copy4s9bsz)}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#334155', fontSize: 13 }}>
                        {catActualSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": catActualSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : (activeArea > 0 ? UI_STRINGS.common.copyi1bvs4 : UI_STRINGS.common.copy4s9bsz)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LINE-LEVEL AUDIT TRACEABILITY MATRIX (Part L) */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <ListOrdered size={16} className="text-slate-600" />{UI_STRINGS.appAppBudgetVsActualPage.iTEMLEVELTRACEABILITYDOWNSTREAMACTUALS}</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>{UI_STRINGS.appAppBudgetVsActualPage.traceableLinkageBOQLineRarrBudgetRarrPRRarrRFQRarrPPORarrActualSpend}</p>
          </div>

          <div style={{ position: 'relative', width: 280 }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
            <input
              type="text"
              placeholder={UI_STRINGS.appAppBudgetVsActualPage.searchDescriptionItemCode}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 30, height: 36, width: '100%', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6 }}
            />
          </div>
        </div>

        <div data-testid="line-items-scroll-container" onScroll={handleTableScroll} style={{ maxHeight: 540, overflowY: 'auto', overflowX: 'auto' }}>
          <table className="w-full text-left text-xs border-collapse">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', borderBottom: '2px solid #cbd5e1', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <tr>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{UI_STRINGS.appAppBudgetVsActualPage.itemDescription}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{UI_STRINGS.appAppBudgetVsActualPage.costCentreCategory}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.appAppBudgetVsActualPage.budgetQtyTimesRate}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.appAppBudgetVsActualPage.committedPO}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.appAppBudgetVsActualPage.actualCost}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{UI_STRINGS.common.variance}</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{UI_STRINGS.common.status}</th>
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
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.4 }}>{line.description}</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginTop: 5 }}>
                        {line.boqCode} {line.revisionCode}{UI_STRINGS.common.bull}{line.itemCode || line.lineNumber}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 11, background: '#f1f5f9', fontWeight: 600, color: '#334155' }}>
                        {line.category}
                      </span>
                      {line.costCentre && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 5, fontFamily: 'monospace' }}>
                          {line.costCentre.code}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {formatCurrency(line.budgetAmount)}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                        {line.budgetQuantity} {line.uom}{UI_STRINGS.appAppBudgetVsActualPage.copycus6yy}{line.budgetRate?.toFixed(0)}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#4338ca' }}>
                        {formatCurrency(line.committedAmount)}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                        {line.committedQuantity || 0} {line.uom}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {formatCurrency(line.actualAmount)}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                        {line.actualQuantity || 0} {line.uom}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <div
                        style={{ fontSize: 13, fontWeight: 700 }}
                        className={line.budgetVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                      >
                        {line.budgetVariance >= 0 ? UI_STRINGS.common.copycrz1ka : ''}{formatCurrency(line.budgetVariance)}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                        {line.budgetVariancePercent?.toFixed(1)}{UI_STRINGS.common.copy8w4luo}</div>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                      <StatusBadge status={line.status || 'DRAFT'} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {reportData?.lineReportsPagination && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-3.5 bg-slate-50/75">
            <span className="text-xs font-semibold text-slate-500">
              {interpolateUiString(UI_STRINGS.appAppBudgetVsActualPage.showingLineReportsOfTotal, {
                shown: String(reportData.lineReports?.length || 0),
                total: String(reportData.lineReportsPagination.total),
              })}
            </span>
            {loadingMoreLines && (
              <span className="flex items-center gap-2 text-xs font-semibold text-blue-600">
                <RefreshCw size={14} className="animate-spin" />
                {UI_STRINGS.appAppBudgetVsActualPage.loadingBudgetVsActual}
              </span>
            )}
          </div>
        )}
      </div>
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
