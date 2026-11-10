'use client';
import type { ContextBannerProps } from "@app-types/components/ui/ContextBanner.types";


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
