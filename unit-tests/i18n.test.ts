import { I18N_CONFIG } from '@/lib/i18n.constants';
import { getDefaultLocale, interpolateUiString, uiStringPattern } from '@/lib/i18n';
import { UI_STRINGS } from '@/lib/ui-strings.constants';

describe('internationalized UI strings', () => {
  it('uses the configured default locale', () => {
    expect(getDefaultLocale()).toBe(I18N_CONFIG.defaultLocale);
    expect(I18N_CONFIG.supportedLocales).toContain(I18N_CONFIG.defaultLocale);
  });

  it('replaces named placeholders with runtime values', () => {
    const template = UI_STRINGS.appApiAdminUsersIdRoute.userEmailUpdatedRoleRoleStatusStatus;
    const values = { email: 'Ava, Inc. (Procurement)', role: 'Buyer / Approver', status: 'Active (North Zone)' };
    const expected = template
      .replace('{{email}}', values.email)
      .replace('{{role}}', values.role)
      .replace('{{status}}', values.status);

    expect(interpolateUiString(template, values)).toBe(expected);
  });

  it('preserves unresolved placeholders and stringifies nullish values', () => {
    const template = UI_STRINGS.appApiAdminUsersIdRoute.userEmailUpdatedRoleRoleStatusStatus;
    const nullishValues = { email: null, role: undefined, status: 'Active' };
    const expected = template
      .replace('{{email}}', 'null')
      .replace('{{role}}', 'undefined')
      .replace('{{status}}', nullishValues.status);

    expect(interpolateUiString(template, { ...nullishValues, missing: 'ignored' })).toBe(expected);
    expect(interpolateUiString(template)).toBe(template);
  });

  it('builds a safe matcher from localized templates', () => {
    const template = UI_STRINGS.appApiAdminUsersIdRoute.userEmailUpdatedRoleRoleStatusStatus;
    const rendered = interpolateUiString(template, { email: 'Ava', role: 'Buyer', status: 'Active' });

    expect(uiStringPattern(template).test(rendered)).toBe(true);
    expect(uiStringPattern(template).test(`${rendered} unexpected`)).toBe(true);
  });
});
