/* Shared declarations for components/ui/Card.tsx. */

// components/ui/Card.tsx - Standardized Enterprise Card
export interface CardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}
