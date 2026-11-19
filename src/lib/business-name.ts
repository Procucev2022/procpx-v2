// lib/business-name.ts - pure business-name helpers shared by the users API and the Users page.
import {
  BUSINESS_SLUG_FALLBACK,
  BUSINESS_SLUG_ID_SUFFIX_LENGTH,
  BUSINESS_SLUG_MAX_LENGTH,
  CROSS_BUSINESS_ADMIN_ROLE,
} from '@/lib/business-directory.constants';
import type { BusinessSummary } from '@app-types/app/api/admin/users/route.types';

/** Trims a company name and collapses internal whitespace; non-strings become ''. */
export function normalizeCompanyName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/** Case-insensitive comparison key matching the D1 `lower(trim(name))` duplicate rule. */
export function businessNameKey(name: string): string {
  return normalizeCompanyName(name).toLowerCase();
}

/** Builds a unique, URL-safe slug from the company name and the new business id. */
export function toBusinessSlug(name: string, id: string): string {
  const base = businessNameKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BUSINESS_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  const suffix = id.replace(/[^a-z0-9]/gi, '').slice(0, BUSINESS_SLUG_ID_SUFFIX_LENGTH).toLowerCase();
  return `${base || BUSINESS_SLUG_FALLBACK}-${suffix}`;
}

export function canChooseAnyBusiness(role: string): boolean {
  return role === CROSS_BUSINESS_ADMIN_ROLE;
}

/** Finds a business whose normalized name matches, among the businesses visible to the caller. */
export function findBusinessByName(businesses: BusinessSummary[], name: string): BusinessSummary | null {
  const key = businessNameKey(name);
  if (!key) return null;
  return businesses.find((business) => businessNameKey(business.name) === key) ?? null;
}
