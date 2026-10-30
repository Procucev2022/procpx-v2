/* Shared declarations for components/ui/ContextBanner.tsx. */

// components/ui/ContextBanner.tsx - Compact Sourcing Context Bar with Lucide Icons
export interface ContextItem {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  badge?: boolean;
}

export interface ContextBannerProps {
  items: ContextItem[];
}
