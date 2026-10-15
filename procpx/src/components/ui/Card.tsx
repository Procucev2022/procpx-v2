'use client';
// components/ui/Card.tsx - Standardized Enterprise Card
interface CardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

export default function Card({
  children,
  title,
  subtitle,
  badge,
  action,
  className = '',
  style,
  noPadding = false,
}: CardProps) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || action || badge) && (
        <div className="card-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {typeof title === 'string' ? <h3 className="card-title">{title}</h3> : title}
              {badge}
            </div>
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {action && <div className="card-actions">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'card-body'}>{children}</div>
    </div>
  );
}
