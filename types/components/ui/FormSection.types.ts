/* Shared declarations for components/ui/FormSection.tsx. */

import type React from "react";

export interface FormSectionProps {
  /** Section number or identifier, e.g. "1" or "A" */
  sectionNumber?: number | string;
  /** Section title (16-18px semibold) */
  title: string;
  /** Optional concise subtitle / guidance */
  subtitle?: string;
  /** Optional action on the right side of header */
  headerAction?: React.ReactNode;
  /** Section fields / form content */
  children: React.ReactNode;
  /** Optional wrapper class */
  className?: string;
}
