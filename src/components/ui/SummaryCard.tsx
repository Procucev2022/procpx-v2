'use client';
// src/components/ui/SummaryCard.tsx
// Standardized Enterprise Reusable Summary Card & Grid Component
// Compact 100-120px height, grouped label-amount-description layout, restrained accents
import type { SummaryCardProps, SummaryCardGridProps } from "@app-types/components/ui/SummaryCard.types";
export type { SummaryCardProps, SummaryCardGridProps };


export function SummaryCard({
  label,
  value,
  secondary,
  icon,
  badge,
  accent = 'default',
  className = '',
  description,
}: SummaryCardProps) {
  const accentClasses = {
    default: 'border-slate-200 bg-white hover:border-slate-300',
    neutral: 'border-slate-200 bg-slate-50/50 hover:border-slate-300',
    blue: 'border-blue-200 bg-blue-50/30 hover:border-blue-300',
    emerald: 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300',
    amber: 'border-amber-200 bg-amber-50/30 hover:border-amber-300',
    rose: 'border-rose-200 bg-rose-50/30 hover:border-rose-300',
    purple: 'border-indigo-200 bg-indigo-50/30 hover:border-indigo-300',
    indigo: 'border-indigo-200 bg-indigo-50/30 hover:border-indigo-300',
    slate: 'border-slate-300 bg-slate-50/60 hover:border-slate-400',
  }[accent] || 'border-slate-200 bg-white hover:border-slate-300';

  const kpiBorderColors: Record<string, string> = {
    default: '#2563eb',
    blue: '#2563eb',
    amber: '#d97706',
    emerald: '#059669',
    rose: '#dc2626',
    purple: '#4f46e5',
    indigo: '#4f46e5',
    neutral: '#64748b',
    slate: '#64748b',
  };
  const borderColor = kpiBorderColors[accent] || '#2563eb';

  const supportingText = secondary || description;

  return (
    <div
      className={`summary-card kpi-card border rounded-xl shadow-xs transition-all flex flex-col justify-start h-full ${accentClasses} ${className}`}
      style={{
        padding: '16px 20px',
        minHeight: '104px',
        borderLeft: `3px solid ${borderColor}`,
        background: '#ffffff',
      }}
    >
      {/* 1. Label and optional icon/badge at the top */}
      <div className="flex items-center justify-between gap-2">
        <span className="kpi-label text-[12px] md:text-[13px] font-medium text-slate-500 leading-snug break-words mb-0">
          {label}
        </span>
        {(badge || icon) && (
          <div className="flex items-center gap-1.5 shrink-0">
            {badge}
            {icon && <span className="text-slate-400">{icon}</span>}
          </div>
        )}
      </div>

      {/* 2. Amount immediately below the label with accent color */}
      <div
        className="kpi-value text-xl md:text-[24px] font-bold tracking-tight leading-tight mt-1.5 break-words"
        style={{ color: borderColor }}
      >
        {value}
      </div>

      {/* 3. Supporting description directly below the amount */}
      {supportingText && (
        <div className="text-[11px] md:text-[12px] font-medium text-slate-500 leading-normal mt-1 break-words">
          {supportingText}
        </div>
      )}
    </div>
  );
}

export function SummaryCardGrid({
  children,
  columns = 4,
  className = '',
}: SummaryCardGridProps) {
  const colClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
    6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6',
  }[columns];

  return (
    <div className={`grid ${colClass} items-stretch gap-3.5 mb-6 ${className}`}>
      {children}
    </div>
  );
}

export default SummaryCard;
