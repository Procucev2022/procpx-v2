import { I18N_CONFIG, UI_STRING_PLACEHOLDER_PATTERN } from '@/lib/i18n.constants';
import type { UiStringValues } from '@app-types/lib/i18n.types';

export function interpolateUiString(template: string, values: UiStringValues = {}): string {
  return template.replace(UI_STRING_PLACEHOLDER_PATTERN, (placeholder, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return placeholder;
    return String(values[key]);
  });
}

export function uiStringPattern(template: string, flags = '', exact = false): RegExp {
  const pattern = template.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\\\{[A-Za-z][A-Za-z0-9_]*\\\}\\\}/g, '.*?');
  return new RegExp(exact ? `^${pattern}$` : pattern, flags);
}

export function getDefaultLocale(): typeof I18N_CONFIG.defaultLocale {
  return I18N_CONFIG.defaultLocale;
}
