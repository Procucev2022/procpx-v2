/* Shared declarations for components/ui/PageHeader.tsx. */

import type React from "react";

import type { BreadcrumbItem } from "@/components/ui/Breadcrumbs";

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
