'use client';
// src/components/ui/WorkflowStageNav.tsx
// Standardized Enterprise Reusable Workflow Stage Navigation Bar
// Prominent 44-48px clickable tabs with clear Procucev blue styling and discrete status indicators
import React from 'react';
import { Check } from 'lucide-react';
import type { WorkflowStageItem, WorkflowStageNavProps } from "@app-types/components/ui/WorkflowStageNav.types";
export type { WorkflowStageItem, WorkflowStageNavProps };


export default function WorkflowStageNav({
  stages,
  className = '',
}: WorkflowStageNavProps) {
  return (
    <nav
      aria-label="Workflow Navigation"
      className={`w-full bg-white border border-slate-200 rounded-xl p-2 md:p-2.5 shadow-2xs mb-6 flex items-center overflow-hidden ${className}`}
    >
      {/* Stages Stepper List - Full width layout, intentional horizontal scrolling for tabs alone */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-1 scrollbar-thin w-full">
        <div className="flex items-center gap-2 px-2 shrink-0 select-none">
          <span className="w-2 h-2 rounded-full bg-[#0f52ba]" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Workflow:
          </span>
        </div>

        {stages.map((stage) => {
          const isCurrent = stage.status === 'CURRENT';
          const isCompleted = stage.status === 'COMPLETED';
          const isDisabled = stage.status === 'DISABLED';

          return (
            <button
              key={stage.id}
              type="button"
              disabled={isDisabled}
              onClick={stage.onClick}
              aria-current={isCurrent ? 'step' : undefined}
              className={`h-[46px] min-h-[46px] px-4 py-2 rounded-lg flex items-center gap-2.5 text-[14px] md:text-[14.5px] transition-all shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0f52ba]/40 focus:ring-offset-1 select-none ${
                isCurrent
                  ? 'bg-blue-50/90 text-[#0f52ba] border-2 border-[#0f52ba] shadow-xs font-bold ring-2 ring-blue-500/10'
                  : isCompleted
                  ? 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs hover:border-slate-400 font-semibold'
                  : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 shadow-2xs hover:border-slate-300 font-medium'
              } ${isDisabled ? 'opacity-40 cursor-not-allowed hover:bg-white hover:border-slate-200' : ''}`}
            >
              {/* Step Number or Status Indicator */}
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                  isCurrent
                    ? 'bg-[#0f52ba] text-white shadow-2xs'
                    : isCompleted
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 border border-slate-200 text-slate-700'
                }`}
              >
                {isCompleted ? <Check size={13} strokeWidth={3} /> : stage.stageNumber}
              </span>

              <span className="whitespace-nowrap tracking-tight">{stage.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
