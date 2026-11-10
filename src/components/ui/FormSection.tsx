'use client';
// src/components/ui/FormSection.tsx
// Standardized Enterprise Reusable Form Section Container (1px neutral border, 16-20px padding, subtle header)
import type { FormSectionProps } from "@app-types/components/ui/FormSection.types";
export type { FormSectionProps };


export default function FormSection({
  sectionNumber,
  title,
  subtitle,
  headerAction,
  children,
  className = '',
}: FormSectionProps) {
  return (
    <div
      className={`border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden mb-6 ${className}`}
    >
      {/* Restrained Section Header with subtle background & divider */}
      <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {sectionNumber !== undefined && (
              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                {sectionNumber}
              </span>
            )}
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 pl-0 sm:pl-7">
              {subtitle}
            </p>
          )}
        </div>

        {headerAction && (
          <div className="shrink-0">
            {headerAction}
          </div>
        )}
      </div>

      {/* Form Section Body (16-20px internal padding) */}
      <div className="p-5 md:p-6 space-y-4 md:space-y-5">
        {children}
      </div>
    </div>
  );
}
