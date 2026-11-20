'use client';
// components/admin/RoleLimitFields.tsx - per-role "maximum active users" inputs (blank = no limit).
import { ROLE_LIMIT_MAX } from '@/lib/business-directory.constants';
import { ASSIGNABLE_USER_ROLES } from '@/app/api/admin/users/route.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type { RoleLimitFieldsProps } from '@app-types/components/admin/role-limits.types';

const STRINGS = UI_STRINGS.appAppAdminUsersPage;

export default function RoleLimitFields({ values, usage, onChange }: RoleLimitFieldsProps) {
  return (
    <fieldset className="form-group" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="form-label">{STRINGS.roleLimits}</legend>
      <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>{STRINGS.roleLimitsHelp}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {ASSIGNABLE_USER_ROLES.map((role) => {
          const used = usage?.find((entry) => entry.role === role);
          return (
            <label key={role} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{role.replace(/_/g, ' ')}</span>
              <input
                type="number"
                min={0}
                max={ROLE_LIMIT_MAX}
                step={1}
                className="form-control"
                data-testid={`role-limit-${role}`}
                placeholder={STRINGS.noLimit}
                value={values[role] ?? ''}
                onChange={(event) => onChange(role, event.target.value)}
              />
              {used && (
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {used.maxUsers === null
                    ? interpolateUiString(STRINGS.roleLimitUsageUnlimited, { active: used.activeUsers })
                    : interpolateUiString(STRINGS.roleLimitUsage, { active: used.activeUsers, max: used.maxUsers })}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
