'use client';
// src/components/rate-cards/HomeWorkspace.tsx
// Home Workspace: Master Rate Cards Register with Standardized Enterprise Hierarchy, Tabs, and Table
import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Eye, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import LongTextCell from '@/components/ui/LongTextCell';
import type { RateCardRow, HomeWorkspaceProps } from "@app-types/components/rate-cards/HomeWorkspace.types";
export type { RateCardRow };


export default function HomeWorkspace({
  cards,
  activeSummaryTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  vendorFilter,
  onVendorFilterChange,
  statusFilter,
  onStatusFilterChange,
  onClearFilters,
  onInitiateClick,
  onNegotiateClick,
  onBuyerAcceptClick,
  onDetailsClick,
}: HomeWorkspaceProps) {
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  // Counts for summary tabs
  const finalisedCount = useMemo(() => cards.filter((c) => c.status === 'Active').length, [cards]);
  const inProgressCount = useMemo(() => cards.filter((c) => c.status !== 'Active').length, [cards]);

  // Unique categories and vendors for filter dropdowns
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set);
  }, [cards]);

  const availableVendors = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.vendor) set.add(c.vendor);
    });
    return Array.from(set);
  }, [cards]);

  // Apply filters
  const filteredCards = useMemo(() => {
    let list = cards;

    // 1. Tab filter
    if (activeSummaryTab === 'in_progress') {
      list = list.filter((c) => c.status !== 'Active');
    } else {
      list = list.filter((c) => c.status === 'Active');
    }

    // 2. Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.rateCardId.toLowerCase().includes(q) ||
          c.vendor.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.scope.toLowerCase().includes(q)
      );
    }

    // 3. Category filter
    if (categoryFilter !== 'ALL') {
      list = list.filter((c) => c.category === categoryFilter);
    }

    // 4. Vendor filter
    if (vendorFilter !== 'ALL') {
      list = list.filter((c) => c.vendor === vendorFilter);
    }

    // 5. Status filter
    if (statusFilter !== 'ALL') {
      list = list.filter((c) => c.status === statusFilter);
    }

    return list;
  }, [cards, activeSummaryTab, searchTerm, categoryFilter, vendorFilter, statusFilter]);

  // Pagination calculations
  const totalRecords = filteredCards.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  // Reset to page 1 if current page becomes invalid
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Filter change handlers that reset pagination to page 1
  const handleTabClick = (tab: 'finalised' | 'in_progress') => {
    setCurrentPage(1);
    onTabChange(tab);
  };

  const handleSearch = (val: string) => {
    setCurrentPage(1);
    onSearchChange(val);
  };

  const handleCategory = (val: string) => {
    setCurrentPage(1);
    onCategoryFilterChange(val);
  };

  const handleVendor = (val: string) => {
    setCurrentPage(1);
    onVendorFilterChange(val);
  };

  const handleStatus = (val: string) => {
    setCurrentPage(1);
    onStatusFilterChange(val);
  };

  const handleClear = () => {
    setCurrentPage(1);
    onClearFilters();
  };

  // Sliced records for display
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const pagedRecords = useMemo(() => {
    return filteredCards.slice(startIndex, endIndex);
  }, [filteredCards, startIndex, endIndex]);

  return (
    <div className="w-full space-y-6">
      {/* ── STANDARDIZED PAGE HEADER ───────────────────────────────────── */}
      <PageHeader
        title="Rate Card Management - Home"
        subtitle="Centrally manage category-level vendor rate cards, standard BOQ items, multi-round commercial negotiations, and governance approvals."
        stepNumber={1}
        actions={
          <button
            type="button"
            onClick={onInitiateClick}
            className="pro-btn pro-btn-primary"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Initiate Rate Card</span>
          </button>
        }
      />

      {/* ── MAIN WORKSPACE CARD ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-300 rounded-lg shadow-xs overflow-hidden">
        {/* Standardized Primary Tabs Bar (46px high) */}
        <div className="flex items-center gap-2 px-6 border-b border-slate-200 bg-[#fafcff]">
          <button
            type="button"
            onClick={() => handleTabClick('finalised')}
            className={`pro-tab ${activeSummaryTab === 'finalised' ? 'pro-tab-active' : ''}`}
          >
            <CheckCircle2
              size={16}
              className={activeSummaryTab === 'finalised' ? 'text-[#0f52ba]' : 'text-slate-400'}
            />
            <span>Finalised Summary</span>
            <span
              className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeSummaryTab === 'finalised'
                  ? 'bg-blue-100 text-[#0f52ba]'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {finalisedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick('in_progress')}
            className={`pro-tab ${activeSummaryTab === 'in_progress' ? 'pro-tab-active' : ''}`}
          >
            <Clock
              size={16}
              className={activeSummaryTab === 'in_progress' ? 'text-[#0f52ba]' : 'text-slate-400'}
            />
            <span>Rate Cards in Progress</span>
            <span
              className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeSummaryTab === 'in_progress'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {inProgressCount}
            </span>
          </button>
        </div>

        {/* Standardized Filter Toolbar (42px control height) */}
        <div className="p-4 md:p-5 bg-white border-b border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Search */}
            <div className="md:col-span-5 relative">
              <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by Rate Card ID, Title, Vendor or Category..."
                className="pro-input pl-10"
              />
            </div>

            {/* Category Filter */}
            <div className="md:col-span-2">
              <select
                value={categoryFilter}
                onChange={(e) => handleCategory(e.target.value)}
                className="pro-select"
              >
                <option value="ALL">All Categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendor Filter */}
            <div className="md:col-span-2">
              <select
                value={vendorFilter}
                onChange={(e) => handleVendor(e.target.value)}
                className="pro-select"
              >
                <option value="ALL">All Vendors</option>
                {availableVendors.map((vnd) => (
                  <option key={vnd} value={vnd}>
                    {vnd}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="md:col-span-2">
              <select
                value={statusFilter}
                onChange={(e) => handleStatus(e.target.value)}
                className="pro-select"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="In Progress">In Progress</option>
              </select>
            </div>

            {/* Clear Button */}
            <div className="md:col-span-1">
              <button
                type="button"
                onClick={handleClear}
                className="pro-btn pro-btn-secondary w-full"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* ── ENTERPRISE FULL-WIDTH GRID TABLE WITH EXPLICIT COLUMN SPECIFICATIONS ── */}
        <div className="overflow-x-auto w-full border border-slate-300 rounded-lg shadow-2xs bg-white">
          {activeSummaryTab === 'finalised' ? (
            /* ── A. Register: Finalised Summary Table (Target: 1445px) ── */
            <table className="w-full text-left border-collapse table-fixed enterprise-table" style={{ minWidth: '1445px' }}>
              <colgroup>
                <col style={{ width: '55px' }} />
                <col style={{ width: '185px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '145px' }} />
                <col style={{ width: '230px' }} />
                <col style={{ width: '65px' }} />
                <col style={{ width: '105px' }} />
                <col style={{ width: '105px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '155px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-700 border-b border-slate-300 font-bold text-xs uppercase tracking-wider">
                  <th className="py-3 px-2 text-center border-r border-slate-200" style={{ width: '55px' }}>S.No.</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '185px' }}>Rate Card ID</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '180px' }}>Vendor</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '145px' }}>Category</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '230px' }}>Scope / Description</th>
                  <th className="py-3 px-2 text-center border-r border-slate-200" style={{ width: '65px' }}>Items</th>
                  <th className="py-3 px-2.5 border-r border-slate-200" style={{ width: '105px' }}>Valid From</th>
                  <th className="py-3 px-2.5 border-r border-slate-200" style={{ width: '105px' }}>Valid Until</th>
                  <th className="py-3 px-2.5 border-r border-slate-200" style={{ width: '100px' }}>Status</th>
                  <th className="py-3 px-3 border-r border-slate-200 leading-tight" style={{ width: '155px' }}>Next Responsible Party</th>
                  <th className="py-3 px-3 text-right" style={{ width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pagedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-500 text-sm">
                      No finalised rate cards found matching the criteria.
                    </td>
                  </tr>
                ) : (
                  pagedRecords.map((row, idx) => {
                    const rowNumber = startIndex + idx + 1;
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-blue-50/30 transition-colors group even:bg-slate-50/30"
                      >
                        <td className="py-2.5 px-2 text-center text-slate-500 font-medium text-xs border-r border-slate-200" style={{ width: '55px' }}>
                          {rowNumber}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 border-r border-slate-200 overflow-hidden" style={{ width: '185px' }}>
                          <button
                            type="button"
                            onClick={() => onDetailsClick(row.rateCardId)}
                            className="text-[#0f52ba] hover:underline font-mono text-sm truncate block max-w-full text-left"
                            title={row.rateCardId}
                          >
                            {row.rateCardId}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-medium border-r border-slate-200 overflow-hidden" style={{ width: '180px' }}>
                          <LongTextCell
                            text={row.vendor}
                            title={`Vendor Details — ${row.vendor}`}
                            subtitle={row.vendorCode ? `Vendor Code: ${row.vendorCode}` : undefined}
                            maxWidth="100%"
                            showIcon={false}
                          />
                          {row.vendorCode && (
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{row.vendorCode}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 text-sm border-r border-slate-200 overflow-hidden" style={{ width: '145px' }}>
                          <span className="truncate block" title={row.category}>{row.category}</span>
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 overflow-hidden" style={{ width: '230px' }}>
                          <LongTextCell
                            text={row.scope}
                            title={`Scope / Description — ${row.rateCardId}`}
                            subtitle={`${row.vendor} | ${row.category}`}
                            maxWidth="100%"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-slate-800 border-r border-slate-200" style={{ width: '65px' }}>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                            {row.items}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-700 whitespace-nowrap text-xs font-mono border-r border-slate-200" style={{ width: '105px' }}>
                          {row.validFrom}
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-700 whitespace-nowrap text-xs font-mono border-r border-slate-200" style={{ width: '105px' }}>
                          {row.validUntil}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap border-r border-slate-200" style={{ width: '100px' }}>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-200" style={{ width: '155px' }}>
                          <span className="inline-flex items-center gap-1.5 text-slate-700 text-xs font-medium truncate block max-w-full">
                            {row.nextResponsible || 'Active Contract'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ width: '120px' }}>
                          <button
                            type="button"
                            onClick={() => onDetailsClick(row.rateCardId)}
                            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                          >
                            <Eye size={14} />
                            <span>View Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* ── B. Register: Rate Cards in Progress Table (Target: 1445px) ── */
            <table className="w-full text-left border-collapse table-fixed enterprise-table" style={{ minWidth: '1445px' }}>
              <colgroup>
                <col style={{ width: '55px' }} />
                <col style={{ width: '175px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '135px' }} />
                <col style={{ width: '210px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '125px' }} />
                <col style={{ width: '145px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '155px' }} />
                <col style={{ width: '110px' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-700 border-b border-slate-300 font-bold text-xs uppercase tracking-wider">
                  <th className="py-3 px-2 text-center border-r border-slate-200" style={{ width: '55px' }}>S.No.</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '175px' }}>Rate Card ID</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '170px' }}>Vendor</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '135px' }}>Category</th>
                  <th className="py-3 px-3 border-r border-slate-200" style={{ width: '210px' }}>Scope / Description</th>
                  <th className="py-3 px-3 border-r border-slate-200 leading-tight" style={{ width: '150px' }}>Current Stage</th>
                  <th className="py-3 px-2.5 text-right border-r border-slate-200 leading-tight" style={{ width: '125px' }}>Latest Buyer Offer</th>
                  <th className="py-3 px-2.5 text-right border-r border-slate-200 leading-tight" style={{ width: '145px' }}>Latest Submitted Vendor Quote</th>
                  <th className="py-3 px-2.5 border-r border-slate-200 leading-tight" style={{ width: '120px' }}>Last Updated</th>
                  <th className="py-3 px-3 border-r border-slate-200 leading-tight" style={{ width: '155px' }}>Next Responsible Party</th>
                  <th className="py-3 px-3 text-right" style={{ width: '110px' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pagedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-500 text-sm">
                      No rate cards in progress found matching the criteria.
                    </td>
                  </tr>
                ) : (
                  pagedRecords.map((row, idx) => {
                    const rowNumber = startIndex + idx + 1;
                    const stageLabel = row.currentStage || row.detailedStatus || row.status;

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-blue-50/30 transition-colors group even:bg-slate-50/30"
                      >
                        <td className="py-2.5 px-2 text-center text-slate-500 font-medium text-xs border-r border-slate-200" style={{ width: '55px' }}>
                          {rowNumber}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 border-r border-slate-200 overflow-hidden" style={{ width: '175px' }}>
                          <button
                            type="button"
                            onClick={() => onNegotiateClick(row.rateCardId)}
                            className="text-[#0f52ba] hover:underline font-mono text-sm truncate block max-w-full text-left"
                            title={row.rateCardId}
                          >
                            {row.rateCardId}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-medium border-r border-slate-200 overflow-hidden" style={{ width: '170px' }}>
                          <LongTextCell
                            text={row.vendor}
                            title={`Vendor Details — ${row.vendor}`}
                            subtitle={row.vendorCode ? `Vendor Code: ${row.vendorCode}` : undefined}
                            maxWidth="100%"
                            showIcon={false}
                          />
                          {row.vendorCode && (
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{row.vendorCode}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 text-sm border-r border-slate-200 overflow-hidden" style={{ width: '135px' }}>
                          <span className="truncate block" title={row.category}>{row.category}</span>
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 overflow-hidden" style={{ width: '210px' }}>
                          <LongTextCell
                            text={row.scope}
                            title={`Scope / Description — ${row.rateCardId}`}
                            subtitle={`${row.vendor} | ${row.category}`}
                            maxWidth="100%"
                          />
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-200" style={{ width: '150px' }}>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-xs bg-amber-50 text-amber-800 border border-amber-200 truncate max-w-full">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            <span className="truncate">{stageLabel}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900 text-xs border-r border-slate-200 whitespace-nowrap" style={{ width: '125px' }}>
                          {row.latestBuyerOffer || '₹ 4,83,000'}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-amber-800 text-xs border-r border-slate-200 whitespace-nowrap" style={{ width: '145px' }}>
                          {row.latestSubmittedVendorQuote || row.latestVendorQuote || '₹ 5,08,000'}
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-600 font-mono text-xs whitespace-nowrap border-r border-slate-200" style={{ width: '120px' }}>
                          {row.lastUpdated || row.validFrom}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-200" style={{ width: '155px' }}>
                          <span className="inline-flex items-center gap-1.5 text-slate-700 text-xs font-medium truncate block max-w-full">
                            {row.nextResponsible || 'Category Manager'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ width: '110px' }}>
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => onNegotiateClick(row.rateCardId)}
                              className="px-2.5 py-1.5 text-xs font-semibold bg-[#0f52ba] hover:bg-blue-800 text-white rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Open Negotiation Workspace"
                            >
                              <span>Negotiate</span>
                              <ArrowRight size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── PAGINATION FOOTER ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 border-t border-slate-200 bg-[#fbfcfd] text-xs text-slate-600">
          <div>
            {totalRecords === 0 ? (
              <span>Showing 0 records</span>
            ) : (
              <span>
                Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to{' '}
                <span className="font-bold text-slate-800">{endIndex}</span> of{' '}
                <span className="font-bold text-slate-800">{totalRecords}</span> records
              </span>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5" role="navigation" aria-label="Pagination">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Previous Page"
              >
                &lt;
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                const isSelected = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`px-3 py-1.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#0f52ba] text-white shadow-2xs'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Next Page"
              >
                &gt;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
