'use client';
// components/ui/ContextBanner.tsx - Compact Sourcing Context Bar with Lucide Icons
interface ContextItem {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  badge?: boolean;
}

interface ContextBannerProps {
  items: ContextItem[];
}

export default function ContextBanner({ items }: ContextBannerProps) {
  return (
    <div className="context-bar">
      {items.map((item, index) => (
        <div key={index} className="context-item">
          <span className="context-label">
            {item.icon && <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 5 }}>{item.icon}</span>}
            {item.label}
          </span>
          <span className="context-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
