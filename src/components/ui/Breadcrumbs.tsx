'use client';
// components/ui/Breadcrumbs.tsx
import Link from 'next/link';
import type { BreadcrumbItem } from "@app-types/components/ui/Breadcrumbs.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";

export type { BreadcrumbItem };


export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label={UI_STRINGS.componentsUiBreadcrumbs.breadcrumb} className="breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {index > 0 && <span className="separator">{UI_STRINGS.common.copybo0mse}</span>}
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
