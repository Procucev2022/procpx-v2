'use client';
// src/app/vendor-pipeline/page.tsx
// Pixel-perfect replica of the Vendor Sourcing & Order Fulfillment Pipeline Dashboard

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Layers,
  Clock,
  AlertTriangle,
  FileText,
  MessageSquare,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  Search,
  Bell,
  HelpCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Gavel,
  FileCheck,
  CreditCard,
  X,
  FilterX,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type {
  VendorPipelineFilterId,
  VendorPipelineStatCard,
  SidebarMenuItem,
} from '@app-types/app/vendor-pipeline/page.types';
import {
  VENDOR_PIPELINE_STAT_CARDS,
  VENDOR_PIPELINE_RFQ_ROWS,
  SIDEBAR_MENU_ITEMS,
  DEMO_TENANT_NAME,
  DEMO_DEV_VENDOR,
  DEMO_VENDOR_ROLE,
} from './page.constants';

export default function VendorPipelineDashboardPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<VendorPipelineFilterId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Filter and search logic
  const filteredRows = useMemo(() => {
    let rows = VENDOR_PIPELINE_RFQ_ROWS;

    if (activeFilter) {
      rows = rows.filter((r) => r.categories.includes(activeFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.reference.toLowerCase().includes(q) ||
          r.rfqSubject.toLowerCase().includes(q) ||
          r.project.toLowerCase().includes(q) ||
          r.package.toLowerCase().includes(q) ||
          r.buyer.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [activeFilter, searchQuery]);

  const handleCardClick = (cardId: VendorPipelineFilterId) => {
    if (activeFilter === cardId) {
      setActiveFilter(null);
    } else {
      setActiveFilter(cardId);
    }
  };

  const handleClearFilter = () => {
    setActiveFilter(null);
    setSearchQuery('');
  };

  const renderCardIcon = (iconName: VendorPipelineStatCard['icon']) => {
    switch (iconName) {
      case 'clock':
        return <Clock className="w-3.5 h-3.5" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'file':
        return <FileText className="w-3.5 h-3.5" />;
      case 'message':
        return <MessageSquare className="w-3.5 h-3.5" />;
      case 'sparkles':
        return <Sparkles className="w-3.5 h-3.5" />;
      case 'alertCircle':
        return <AlertCircle className="w-3.5 h-3.5" />;
      case 'checkCircle':
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      default:
        return <Clock className="w-3.5 h-3.5" />;
    }
  };

  const renderSidebarIcon = (iconName: SidebarMenuItem['icon']) => {
    switch (iconName) {
      case 'dashboard':
        return <LayoutDashboard size={18} strokeWidth={2} />;
      case 'profile':
        return <Building2 size={18} strokeWidth={2} />;
      case 'rfqs':
        return <FileText size={18} strokeWidth={2} />;
      case 'quotations':
        return <Gavel size={18} strokeWidth={2} />;
      case 'orders':
        return <FileCheck size={18} strokeWidth={2} />;
      case 'cards':
        return <CreditCard size={18} strokeWidth={2} />;
      default:
        return <LayoutDashboard size={18} strokeWidth={2} />;
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] font-sans overflow-hidden">
      {/* ── LEFT DARK NAVY SIDEBAR (width 260px, #0F1B33) ────────── */}
      <aside
        style={{ backgroundColor: '#0F1B33' }}
        className={`flex flex-col flex-shrink-0 text-slate-300 transition-all duration-200 z-30 select-none ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {/* Brand Top Header */}
        <div className="h-[60px] flex items-center px-5 border-b border-slate-800/80">
          <Link href="/vendor-pipeline" className="flex items-center gap-2.5 text-decoration-none">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-extrabold text-base shadow-md shadow-blue-500/20">
              {UI_STRINGS.appVendorPipelinePage.brandP}
            </div>
            {!collapsed && (
              <span className="text-xl font-extrabold tracking-tight text-white flex items-center">
                {UI_STRINGS.appVendorPipelinePage.brandPro}
                <span className="text-blue-400">
                  {UI_STRINGS.appVendorPipelinePage.brandCucev}
                </span>
              </span>
            )}
          </Link>
        </div>

        {/* Section Label */}
        <div className="px-5 pt-5 pb-2">
          {!collapsed ? (
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              {UI_STRINGS.appVendorPipelinePage.portalSection}
            </span>
          ) : (
            <div className="w-4 h-0.5 bg-slate-700 mx-auto my-1" />
          )}
        </div>

        {/* Menu Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {SIDEBAR_MENU_ITEMS.map((item) => {
            const isActive = item.active;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className={isActive ? 'text-white' : 'text-slate-400'}>
                  {renderSidebarIcon(item.icon)}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Sidebar Footer Toggle */}
        <div className="p-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[13px] text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors ${
              collapsed ? 'justify-center px-0' : ''
            }`}
            aria-label={collapsed ? UI_STRINGS.appVendorPipelinePage.expandSidebar : UI_STRINGS.appVendorPipelinePage.collapseSidebar}
          >
            {collapsed ? (
              <ChevronRight size={18} strokeWidth={2} />
            ) : (
              <>
                <ChevronLeft size={18} strokeWidth={2} />
                <span>{UI_STRINGS.appVendorPipelinePage.collapseSidebar}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── RIGHT MAIN VIEWPORT ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-[60px] bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 z-20">
          {/* Search Bar */}
          <div className="relative w-full max-w-[440px]">
            <Search
              size={15}
              className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
                searchFocused ? 'text-blue-600' : 'text-slate-400'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={UI_STRINGS.appVendorPipelinePage.searchPlaceholder}
              className={`w-full h-9 pl-9 pr-14 text-[13px] bg-slate-50 border rounded-lg transition-all outline-none ${
                searchFocused
                  ? 'bg-white border-blue-600 ring-2 ring-blue-100 text-slate-900'
                  : 'border-slate-200 text-slate-800 hover:border-slate-300'
              }`}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                aria-label={UI_STRINGS.appVendorPipelinePage.clearFilter}
              >
                <X size={14} />
              </button>
            ) : (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-slate-200/80 text-slate-500 rounded border border-slate-300/60 pointer-events-none">
                {UI_STRINGS.appVendorPipelinePage.searchShortcutKey}
              </span>
            )}
          </div>

          {/* Right Header Badges & User Profile */}
          <div className="flex items-center gap-3">
            {/* Center Pill: Procucev Retail Demo */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs">
              <Building2 size={13} className="text-slate-500" />
              <span>{DEMO_TENANT_NAME}</span>
            </div>

            {/* Notification Bell with 9+ badge */}
            <button
              type="button"
              className="relative w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
              aria-label={UI_STRINGS.appVendorPipelinePage.notificationsLabel}
            >
              <Bell size={16} strokeWidth={1.8} />
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full ring-2 ring-white">
                {UI_STRINGS.appVendorPipelinePage.badgeNinePlus}
              </span>
            </button>

            {/* Help Icon */}
            <button
              type="button"
              className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500 transition-colors"
              aria-label={UI_STRINGS.appVendorPipelinePage.helpLabel}
            >
              <HelpCircle size={16} strokeWidth={1.8} />
            </button>

            {/* Profile Pill: DV Dev Vendor (Apex) - VENDOR */}
            <div className="flex items-center gap-2.5 pl-2 py-1 pr-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer transition-colors">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {UI_STRINGS.appVendorPipelinePage.avatarDv}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {DEMO_DEV_VENDOR}
                </span>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 leading-tight mt-0.5">
                  {DEMO_VENDOR_ROLE}
                </span>
              </div>
              <ChevronDown size={14} className="text-slate-400 ml-1" />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto bg-[#F8FAFC]">
          <div className="max-w-[1600px] mx-auto space-y-6">
            {/* ── TITLE SECTION ───────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 shadow-2xs">
                  <Layers size={18} strokeWidth={2.2} />
                </div>
                <h1 className="text-[19px] font-bold text-slate-900 tracking-tight">
                  {UI_STRINGS.appVendorPipelinePage.vendorSourcingOrderFulfillmentPipeline}
                </h1>
              </div>
              <p className="text-[11px] font-medium text-slate-400">
                {UI_STRINGS.appVendorPipelinePage.persistedCountsDerivedDirectlyFromProductionDatabaseRecords}
              </p>
            </div>

            {/* ── TOP 8 STAT CARDS (2 rows x 4 columns) ─────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {VENDOR_PIPELINE_STAT_CARDS.map((card) => {
                const isSelected = activeFilter === card.id;

                // Color mappings based on card colorScheme
                let labelColor = 'text-slate-500';
                let numberColor = 'text-slate-900';
                let subtitleColor = 'text-slate-500';
                let iconColor = 'text-slate-400';
                let cardBg = 'bg-white';
                let cardBorder = 'border-slate-200';

                if (card.colorScheme === 'amber') {
                  labelColor = 'text-amber-800';
                  numberColor = 'text-amber-900';
                  subtitleColor = 'text-amber-700';
                  iconColor = 'text-amber-600';
                  if (card.highlightBorder) {
                    cardBg = 'bg-amber-50/20';
                    cardBorder = 'border-amber-300';
                  }
                } else if (card.colorScheme === 'blue') {
                  labelColor = card.id === 'PPOS_AWAITING_ACCEPTANCE' ? 'text-blue-800' : 'text-slate-500';
                  numberColor = 'text-blue-600';
                  subtitleColor = card.id === 'PPOS_AWAITING_ACCEPTANCE' ? 'text-blue-700' : 'text-slate-500';
                  iconColor = card.id === 'PPOS_AWAITING_ACCEPTANCE' ? 'text-blue-600' : 'text-blue-500';
                } else if (card.colorScheme === 'indigo') {
                  labelColor = 'text-indigo-800';
                  numberColor = 'text-indigo-900';
                  subtitleColor = 'text-indigo-700';
                  iconColor = 'text-indigo-600';
                } else if (card.colorScheme === 'purple') {
                  labelColor = 'text-purple-800';
                  numberColor = 'text-purple-900';
                  subtitleColor = 'text-purple-700';
                  iconColor = 'text-purple-600';
                } else if (card.colorScheme === 'emerald') {
                  labelColor = 'text-emerald-800';
                  numberColor = 'text-emerald-700';
                  subtitleColor = 'text-emerald-700';
                  iconColor = 'text-emerald-600';
                }

                // If currently selected, apply prominent active border
                if (isSelected) {
                  cardBorder = 'border-blue-600 ring-2 ring-blue-500/20 shadow-md';
                }

                return (
                  <div
                    key={card.id}
                    onClick={() => handleCardClick(card.id)}
                    className={`${cardBg} ${cardBorder} border rounded-[12px] p-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer select-none flex flex-col justify-between`}
                  >
                    <div>
                      <div className={`text-[11px] font-bold uppercase tracking-wider ${labelColor}`}>
                        {card.label}
                      </div>
                      <div className={`text-[28px] font-bold font-mono mt-1 ${numberColor} leading-none`}>
                        {card.count}
                      </div>
                    </div>
                    <div className={`text-[12px] font-medium mt-3 flex items-center gap-1.5 ${subtitleColor}`}>
                      <span className={iconColor}>{renderCardIcon(card.icon)}</span>
                      <span className="truncate">{card.subtitle}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── MAIN TABLE CARD ─────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-[12px] shadow-xs overflow-hidden">
              {/* Header Bar */}
              <div className="p-4 px-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-slate-900 leading-tight">
                    {UI_STRINGS.appVendorPipelinePage.rfqRegisterNegotiationStatus}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {UI_STRINGS.appVendorPipelinePage.invitedSourcingEventsWithPersistedDatesBuyerDecisionsResponsiblePartyAndActionTriggers}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                  {activeFilter && (
                    <button
                      type="button"
                      onClick={handleClearFilter}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md hover:bg-blue-100 transition-colors"
                    >
                      <FilterX size={12} />
                      <span>{UI_STRINGS.appVendorPipelinePage.clearFilter}</span>
                    </button>
                  )}
                  <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-md">
                    {interpolateUiString(UI_STRINGS.appVendorPipelinePage.invitedRFQsBadge, {
                      count: filteredRows.length,
                    })}
                  </span>
                </div>
              </div>

              {/* Table Container with Horizontal Scroll */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
                  {/* Sticky Header Grey #F1F5F9 */}
                  <thead>
                    <tr className="bg-[#F1F5F9] text-slate-600 border-b border-slate-200 uppercase tracking-wider text-[11px] font-bold">
                      <th className="py-3 px-4 w-[160px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colRfqReceivedDate}
                      </th>
                      <th className="py-3 px-4 w-[210px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colRfqReference}
                      </th>
                      <th className="py-3 px-4 w-[220px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colProjectPackage}
                      </th>
                      <th className="py-3 px-4 w-[170px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colBuyerClient}
                      </th>
                      <th className="py-3 px-4 w-[150px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colSubmissionDeadline}
                      </th>
                      <th className="py-3 px-4 w-[180px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colCommercialSummary}
                      </th>
                      <th className="py-3 px-4 w-[170px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colQuoteStatus}
                      </th>
                      <th className="py-3 px-4 w-[170px] whitespace-nowrap">
                        {UI_STRINGS.appVendorPipelinePage.colResponsibleParty}
                      </th>
                      <th className="py-3 px-4 w-[130px] whitespace-nowrap text-right">
                        {UI_STRINGS.appVendorPipelinePage.colAction}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <FilterX size={32} className="text-slate-300 stroke-[1.5]" />
                            <span className="text-sm font-semibold text-slate-700">
                              {UI_STRINGS.appVendorPipelinePage.noRFQsFoundForThisFilter}
                            </span>
                            <span className="text-xs text-slate-400 max-w-sm">
                              {UI_STRINGS.appVendorPipelinePage.trySelectingAnotherCard}
                            </span>
                            <button
                              type="button"
                              onClick={handleClearFilter}
                              className="mt-2 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              {UI_STRINGS.appVendorPipelinePage.clearFilter}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => (
                        <tr key={row.id} className="hover:bg-[#F8FAFC] transition-colors">
                          {/* Column 1: RFQ Received Date */}
                          <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap font-medium">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={13} className="text-slate-400 flex-shrink-0" />
                              <span>{row.receivedDate}</span>
                            </div>
                          </td>

                          {/* Column 2: RFQ Reference */}
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-blue-700 hover:text-blue-800 cursor-pointer">
                              {row.reference}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[190px] mt-0.5" title={row.rfqSubject}>
                              {row.rfqSubject}
                            </div>
                          </td>

                          {/* Column 3: Project / Package */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={row.project}>
                              {row.project}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {row.package}
                            </div>
                          </td>

                          {/* Column 4: Buyer / Client */}
                          <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-medium">
                              <Building2 size={13} className="text-slate-400 flex-shrink-0" />
                              <span className="truncate max-w-[140px]">{row.buyer}</span>
                            </div>
                          </td>

                          {/* Column 5: Submission Deadline */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div
                              className={`flex items-center gap-1.5 font-semibold ${
                                row.isDeadlineRed ? 'text-[#DC2626]' : 'text-slate-700'
                              }`}
                            >
                              <Clock
                                size={13}
                                className={row.isDeadlineRed ? 'text-[#DC2626]' : 'text-slate-400'}
                              />
                              <span>{row.deadline}</span>
                            </div>
                          </td>

                          {/* Column 6: Commercial Summary */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.commercialSummaryType === 'PENDING_QUOTE' ? (
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#92400E] border border-amber-200/80">
                                {row.commercialSummaryText || UI_STRINGS.appVendorPipelinePage.pendingQuote}
                              </span>
                            ) : row.commercialSummaryType === 'COUNTER_OFFER' ? (
                              <div>
                                <div className="font-bold text-slate-900 text-xs">
                                  {row.commercialAmount}
                                </div>
                                <div className="text-[11px] font-medium text-indigo-700 mt-0.5">
                                  {row.counterAmount}
                                </div>
                              </div>
                            ) : (
                              <div className="font-bold text-slate-900 text-xs">
                                {row.commercialAmount}
                              </div>
                            )}
                          </td>

                          {/* Column 7: Quote Status */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.quoteStatusType === 'PENDING_SUBMISSION' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                {row.quoteStatus}
                              </span>
                            ) : row.quoteStatusType === 'AWAITING_REVISED_QUOTE' ? (
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#92400E] border border-amber-200/80">
                                {row.quoteStatus}
                              </span>
                            ) : row.quoteStatusType === 'ORDER_ACTIVE' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {row.quoteStatus}
                              </span>
                            ) : row.quoteStatusType === 'PPO_AWAITING' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                {row.quoteStatus}
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {row.quoteStatus}
                              </span>
                            )}
                          </td>

                          {/* Column 8: Responsible Party */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.responsibleParty.includes('Vendor Action') ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {row.responsibleParty}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs font-medium">
                                {row.responsibleParty}
                              </span>
                            )}
                          </td>

                          {/* Column 9: Action */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {row.action === 'Submit Quote' ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
                              >
                                <span>{row.action}</span>
                                <ArrowRight size={12} />
                              </button>
                            ) : row.action === 'Review Counter' ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
                              >
                                <span>{row.action}</span>
                                <ArrowRight size={12} />
                              </button>
                            ) : row.action === 'Accept PPO' ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                              >
                                <span>{row.action}</span>
                                <ArrowRight size={12} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                              >
                                <span>{row.action}</span>
                                <ExternalLink size={12} className="text-slate-400" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
