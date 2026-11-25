/* Shared declarations for components/ui/SummaryCard.tsx. */

import type React from "react";

export interface SummaryCardProps {
  /** Label / Metric Title (styled at ~12-13px semibold) */
  label: string;
  /** Primary metric value or amount (styled at ~20-24px bold) */
  value: React.ReactNode;
  /** Supporting description or secondary information, directly below amount (~12-13px) */
  secondary?: React.ReactNode;
  /** Optional icon displayed next to label */
  icon?: React.ReactNode;
  /** Optional badge or trend indicator */
  badge?: React.ReactNode;
  /** Restrained accent style */
  accent?: 'default' | 'neutral' | 'blue' | 'emerald' | 'amber' | 'rose' | 'slate' | 'purple' | 'indigo';
  /** Extra CSS classes */
  className?: string;
  /** Optional subtitle or description (alias for secondary) */
  description?: string;
  /** Card visual variant: standard KPI metric card with colored left border (default) or legacy boxed card */
  variant?: 'default' | 'kpi' | 'legacy';
}

export interface SummaryCardGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}
