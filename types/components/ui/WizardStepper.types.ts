/* Shared declarations for components/ui/WizardStepper.tsx. */

export interface WizardStep {
  stepNumber: number;
  label: string;
  subtitle?: string;
}

export interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (stepNumber: number) => void;
  className?: string;
}
