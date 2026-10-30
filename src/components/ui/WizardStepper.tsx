'use client';
// src/components/ui/WizardStepper.tsx
// Standardized Enterprise Reusable Wizard Stepper (44-48px height, 14-15px typography, clear current/completed/pending states)
import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { WizardStep, WizardStepperProps } from "@app-types/components/ui/WizardStepper.types";
export type { WizardStep, WizardStepperProps };


export default function WizardStepper({
  steps,
  currentStep,
  onStepClick,
  className = '',
}: WizardStepperProps) {
  return (
    <div
      className={`w-full bg-white border border-slate-200 rounded-xl p-1.5 shadow-2xs mb-6 overflow-x-auto scrollbar-none ${className}`}
    >
      <div className="flex items-center min-w-max md:min-w-0 md:grid md:grid-cols-3 gap-2">
        {steps.map((st, idx) => {
          const isCurrent = st.stepNumber === currentStep;
          const isCompleted = st.stepNumber < currentStep;
          const isPending = st.stepNumber > currentStep;

          return (
            <button
              key={st.stepNumber}
              type="button"
              disabled={isPending}
              onClick={() => onStepClick && onStepClick(st.stepNumber)}
              className={`h-12 px-4 rounded-lg flex items-center justify-between gap-3 text-sm font-semibold transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-blue-50 text-[#0f52ba] border border-blue-200 shadow-2xs font-bold'
                  : isCompleted
                  ? 'bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50 border border-emerald-100 hover:border-emerald-200'
                  : 'text-slate-500 hover:text-slate-700 bg-transparent border border-transparent cursor-not-allowed opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                    isCurrent
                      ? 'bg-[#0f52ba] text-white shadow-2xs'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isCompleted ? <Check size={13} strokeWidth={3} /> : st.stepNumber}
                </span>

                <div className="text-left">
                  <div className="leading-tight">{st.label}</div>
                  {st.subtitle && (
                    <div className="text-[11px] font-normal text-slate-400">
                      {st.subtitle}
                    </div>
                  )}
                </div>
              </div>

              {idx < steps.length - 1 && (
                <ChevronRight
                  size={16}
                  className={`shrink-0 hidden md:block ${
                    isCompleted ? 'text-emerald-500' : 'text-slate-300'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
