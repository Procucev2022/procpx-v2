'use client';
// components/ui/PageHeader.tsx - Standardized Enterprise Page Header
import Breadcrumbs, { BreadcrumbItem } from './Breadcrumbs';

interface PageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  description?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageHeader({
  breadcrumbs,
  title,
  description,
  subtitle,
  badge,
  actions,
}: PageHeaderProps) {
  const desc = description || subtitle;
  return (
    <div className="enterprise-header">
      <Breadcrumbs items={breadcrumbs} />
      <div className="header-row">
        <div className="header-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1>{title}</h1>
            {badge}
          </div>
          {desc && <p className="header-description">{desc}</p>}
        </div>
        {actions && <div className="header-actions">{actions}</div>}
      </div>
    </div>
  );
}
