'use client';
// components/ui/Stepper.tsx - Enterprise Horizontal Stepper with Exact Five-Step Colour Coding
import React from 'react';
import { Check } from 'lucide-react';
import type { StepItem, StepperProps } from "@app-types/components/ui/Stepper.types";
export type { StepItem };


export default function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <nav
      className="stepper-horizontal-container"
      role="navigation"
      aria-label="RFQ Creation Steps"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
        gap: 12,
        marginBottom: 24,
        width: '100%',
      }}
    >
      {steps.map((s) => {
        const isCompleted = s.number < currentStep;
        const isActive = s.number === currentStep;
        const isPending = s.number > currentStep;

        const primaryColor = s.primaryColor || '#2563EB';
        const lightBg = s.lightBg || '#EFF6FF';

        return (
          <button
            key={s.number}
            type="button"
            onClick={() => onStepClick && onStepClick(s.number)}
            className={`stepper-step-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isPending ? 'pending' : ''}`}
            aria-current={isActive ? 'step' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 8,
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderColor: isActive ? primaryColor : isCompleted ? '#CBD5E1' : '#E2E8F0',
              backgroundColor: isActive ? lightBg : '#FFFFFF',
              boxShadow: isActive ? `0 2px 8px -2px ${primaryColor}25` : '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
              cursor: onStepClick ? 'pointer' : 'default',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              textAlign: 'left',
              width: '100%',
              outline: 'none',
              position: 'relative',
            }}
          >
            {/* Step Circle with Exact Step Colour */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontWeight: 700,
                fontSize: 13,
                transition: 'all 0.2s ease',
                backgroundColor: isActive
                  ? primaryColor
                  : isCompleted
                  ? primaryColor
                  : '#F1F5F9',
                color: isActive || isCompleted ? '#FFFFFF' : '#64748B',
                boxShadow: isActive ? `0 0 0 3px ${lightBg}, 0 0 0 4.5px ${primaryColor}40` : undefined,
                border: isPending ? '1.5px solid #CBD5E1' : 'none',
              }}
            >
              {isCompleted ? (
                <Check size={16} strokeWidth={2.8} />
              ) : (
                s.number
              )}
            </div>

            {/* Step Label, Title & Subtitle */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: isActive ? primaryColor : isCompleted ? '#475569' : '#94A3B8',
                  }}
                >
                  Step {s.number}
                </span>

                {/* State Tag for Non-Colour Accessibility */}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    backgroundColor: isActive
                      ? `${primaryColor}18`
                      : isCompleted
                      ? '#DCFCE7'
                      : '#F1F5F9',
                    color: isActive
                      ? primaryColor
                      : isCompleted
                      ? '#15803D'
                      : '#64748B',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isActive ? 'Active' : isCompleted ? 'Completed' : 'Pending'}
                </span>
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? '#0F172A' : isCompleted ? '#1E293B' : '#64748B',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.25,
                }}
              >
                {s.title}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: isActive ? '#475569' : '#94A3B8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 2,
                }}
              >
                {s.description}
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
