'use client';
// components/admin/RoleLimitsModal.tsx - Super Admin editor for one company's per-role user limits.
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import RoleLimitFields from '@/components/admin/RoleLimitFields';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type { RoleLimitUsage } from '@app-types/lib/business-directory.types';
import type {
  RoleLimitFormValues,
  RoleLimitResponse,
  RoleLimitsModalProps,
} from '@app-types/components/admin/role-limits.types';

const STRINGS = UI_STRINGS.appAppAdminUsersPage;

const toFormValues = (roles: RoleLimitUsage[]): RoleLimitFormValues =>
  Object.fromEntries(roles.map((entry) => [entry.role, entry.maxUsers === null ? '' : String(entry.maxUsers)]));

export default function RoleLimitsModal({ business, onClose, onSaved }: RoleLimitsModalProps) {
  const [usage, setUsage] = useState<RoleLimitUsage[] | null>(null);
  const [values, setValues] = useState<RoleLimitFormValues>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/businesses/${encodeURIComponent(business.id)}/role-limits`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: RoleLimitResponse) => {
        if (cancelled) return;
        setUsage(data.roles);
        setValues(toFormValues(data.roles));
      })
      .catch(() => { if (!cancelled) setError(STRINGS.couldNotLoadRoleLimits); });
    return () => { cancelled = true; };
  }, [business.id]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/businesses/${encodeURIComponent(business.id)}/role-limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits: values }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || STRINGS.requestFailed);
        return;
      }
      onSaved(data);
    } catch {
      setError(STRINGS.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="role-limits-title">
        <div className="modal-header">
          <span className="modal-title" id="role-limits-title">
            {interpolateUiString(STRINGS.roleLimitsForCompany, { company: business.name })}
          </span>
          <button type="button" className="btn btn-ghost btn-icon" aria-label={UI_STRINGS.common.close} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={save}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-error mb-4" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}
            {usage ? (
              <RoleLimitFields
                values={values}
                usage={usage}
                onChange={(role, value) => setValues((current) => ({ ...current, [role]: value }))}
              />
            ) : (
              !error && <div className="loading-overlay"><div className="spinner" />{STRINGS.loadingRoleLimits}</div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{UI_STRINGS.common.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !usage}>{STRINGS.saveRoleLimits}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
