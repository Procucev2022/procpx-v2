/* Shared declarations for components/ui/Stepper.tsx. */

import type React from "react";

export interface StepItem {
  number: number;
  icon?: React.ReactNode;
  title: string;
  description: string;
  primaryColor?: string;
  lightBg?: string;
  accentBorder?: string;
  isClickable?: boolean;
}

export interface StepperProps {
  steps: StepItem[];
  currentStep: number;
  onStepClick?: (stepNumber: number) => void;
}
