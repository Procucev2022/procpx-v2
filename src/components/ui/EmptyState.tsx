'use client';
// components/ui/EmptyState.tsx - Enterprise Empty State Component with Lucide Icons
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import type { EmptyStateProps } from "@app-types/components/ui/EmptyState.types";


export default function EmptyState({
  icon,
  title,
  description,
  actionText,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon || <Inbox size={36} strokeWidth={1.5} color="#94a3b8" />}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {actionText && (actionHref || onAction) && (
        <div style={{ marginTop: 20 }}>
          {actionHref ? (
            <Link href={actionHref} className="btn btn-primary">
              {actionText}
            </Link>
          ) : (
            <button type="button" onClick={onAction} className="btn btn-primary">
              {actionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
