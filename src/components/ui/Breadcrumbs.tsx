'use client';
// components/ui/Breadcrumbs.tsx
import Link from 'next/link';
import type { BreadcrumbItem } from "@app-types/components/ui/Breadcrumbs.types";
export type { BreadcrumbItem };


export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {index > 0 && <span className="separator">/</span>}
            {isLast || !item.href ? (
              <span className="current">{item.label}</span>
            ) : (
              <Link href={item.href}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
