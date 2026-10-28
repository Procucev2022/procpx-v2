'use client';
// src/components/ui/PageHeader.tsx
// Standardized Enterprise Page Header with Prominent Typography & Context-Aware Back Navigation
import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Breadcrumbs, { BreadcrumbItem } from './Breadcrumbs';

export interface PageHeaderProps {
  /** Page title (rendered at 28-32px standard) */
  title: string;
  /** Optional concise subtitle/description */
  subtitle?: string;
  /** Alias for subtitle for backward compatibility */
  description?: string;
  /** Optional breadcrumbs path */
  breadcrumbs?: BreadcrumbItem[];
  /** Optional back navigation action: function or URL string */
  onBack?: () => void;
  backHref?: string;
  /** Meaningful back label, e.g. "Back to Rate Cards" */
  backLabel?: string;
  /** Optional status badge or metadata element */
  badge?: React.ReactNode;
  /** Optional action toolbar (buttons ~40-44px high) */
  actions?: React.ReactNode;
  /** Optional workflow step indicator (e.g. 1, 2, 3) */
  stepNumber?: number | string;
  /** Custom wrapper class */
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  description,
  breadcrumbs,
  onBack,
  backHref,
  backLabel = 'Back',
  badge,
  actions,
  stepNumber,
  className = '',
}: PageHeaderProps) {
  const desc = subtitle || description;
  const hasBack = Boolean(onBack || backHref);

  return (
    <div className={`enterprise-header pb-5 mb-6 border-b border-slate-200 ${className}`}>
      {/* Breadcrumbs or Back navigation bar with clear separation */}
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="mb-2">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      ) : hasBack ? (
        <div className="mb-2.5">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0f52ba] transition-colors py-1 group cursor-pointer"
            >
              <ArrowLeft size={16} className="text-slate-400 group-hover:text-[#0f52ba] transition-transform group-hover:-translate-x-0.5" />
              <span>{backLabel}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0f52ba] transition-colors py-1 group cursor-pointer"
            >
              <ArrowLeft size={16} className="text-slate-400 group-hover:text-[#0f52ba] transition-transform group-hover:-translate-x-0.5" />
              <span>{backLabel}</span>
            </button>
          )}
        </div>
      ) : null}

      {/* Main Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            {stepNumber !== undefined && (
              <span className="w-8 h-8 rounded-full bg-[#0f52ba] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                {stepNumber}
              </span>
            )}
            <h1 className="text-2xl md:text-[28px] lg:text-[30px] font-bold text-slate-900 tracking-tight leading-tight">
              {title}
            </h1>
            {badge && <div className="inline-flex items-center ml-1">{badge}</div>}
          </div>
          {desc && (
            <p className="text-sm text-slate-500 max-w-3xl leading-relaxed">
              {desc}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export { PageHeader };
